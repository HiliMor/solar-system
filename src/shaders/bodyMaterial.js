import { MeshBasicNodeMaterial, DoubleSide, FrontSide, SRGBColorSpace, RepeatWrapping } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, texture, uv, normalMap, normalLocal,
	normalWorld, positionWorld, positionLocal, cameraPosition, cameraViewMatrix,
	normalView, dot, normalize, saturate, mix, pow, max, min, abs, smoothstep,
	oneMinus, length, color, clamp, sub, exp, select
} from 'three/tsl';

import {
	createLightUniforms, solarVisibility, softLambert, specularGGX, regolith, MAX_OCCLUDERS
} from './lighting.js';
import { proceduralSurface } from './procedural.js';

/**
 * The material every solid body wears.
 *
 * Deliberately not MeshStandardNodeMaterial: three's lights cannot express this
 * scene (see lighting.js), and several of the effects here -- eclipse penumbrae,
 * city lights on the night side, regolith back-scatter -- have no slot in the
 * standard model. So it is a basic material with the whole shading written out.
 *
 * @param {object} def       body definition
 * @param {object} textures  already-loaded texture map, keyed by filename
 * @returns {{ material: MeshBasicNodeMaterial, uniforms: object }}
 */
export function createBodyMaterial( def, textures ) {

	const material = new MeshBasicNodeMaterial();
	material.side = FrontSide;

	const L = createLightUniforms();

	// Extra dials the UI and the app loop drive.
	const extras = {
		nightLights: uniform( float( def.nightTexture ? 1 : 0 ) ),
		atmosphereTint: uniform( vec3( 0, 0, 0 ) ),
		exposureBias: uniform( float( 1 ) ),
		normalStrength: uniform( vec2( 1, 1 ) )
	};

	// Ring shadow support. Only the dominant ring system is used: for Saturn it
	// is the one that matters, and for Uranus and Neptune the narrow rings cast
	// nothing worth resolving.
	const shadowRing = def.rings?.find( ( r ) => r.detail ) || null;
	const shadowRingTexture = shadowRing?.texture ? textures.get( shadowRing.texture ) : null;

	if ( shadowRing ) {
		extras.ringNormal = uniform( vec3( 0, 1, 0 ) );
		extras.ringCentre = uniform( vec3( 0, 0, 0 ) );
		extras.ringInner = uniform( float( 1 ) );
		extras.ringOuter = uniform( float( 2 ) );
	}

	const map = def.texture ? textures.get( def.texture ) : null;
	const nightMap = def.nightTexture ? textures.get( def.nightTexture ) : null;
	const normalTex = def.normalTexture ? textures.get( def.normalTexture ) : null;
	const specTex = def.specularTexture ? textures.get( def.specularTexture ) : null;

	material.colorNode = Fn( () => {

		// --- surface properties ------------------------------------------------
		let albedo, roughness;

		if ( map ) {
			albedo = texture( map, uv() ).rgb;
			roughness = float( def.roughness ?? 0.88 );
		} else if ( def.surface ) {
			const s = proceduralSurface( def.surface, normalize( positionLocal ) );
			albedo = s.color;
			roughness = s.roughness;
		} else {
			albedo = color( def.color ?? 0x888888 );
			roughness = float( def.roughness ?? 0.9 );
		}

		// A published map already bakes in the body's albedo, so it is only
		// applied to the procedural and flat-colour paths.
		if ( ! map && def.albedo ) {
			albedo = albedo.mul( float( Math.min( 1.2, def.albedo * 1.25 ) ) );
		}

		// --- normal ------------------------------------------------------------
		// normalMap() returns a view-space normal; the shading below is all in
		// world space, so it gets pushed back out through the camera transform.
		const N = normalTex
			? normalize(
				normalMap( texture( normalTex, uv() ), extras.normalStrength )
					.transformNormalByInverseViewMatrix( cameraViewMatrix )
			)
			: normalize( normalWorld );

		const V = normalize( cameraPosition.sub( positionWorld ) );
		const Ldir = L.sunDirection;

		const nDotL = dot( N, Ldir );
		const nDotV = dot( N, V );

		// --- direct illumination ----------------------------------------------
		const visibility = solarVisibility( positionWorld, Ldir, L.sunAngularRadius, L.occluders );

		let lambert = softLambert( nDotL, L.sunAngularRadius );

		// --- ring shadow -------------------------------------------------------
		// Saturn's rings throw a hard-edged band across the planet that shifts
		// through the seasons and is one of the most recognisable things about
		// it. The ray from this point to the Sun is intersected with the ring
		// plane and, if it lands between the inner and outer edges, attenuated by
		// the optical depth stored in the ring map -- so the Cassini Division
		// shows up in the shadow as a bright stripe, exactly as it does in
		// spacecraft imagery.
		let ringTransmission = float( 1 );

		if ( shadowRing ) {

			const n = extras.ringNormal;
			const denom = dot( n, Ldir );
			const t = dot( n, extras.ringCentre.sub( positionWorld ) ).div(
				select( abs( denom ).lessThan( 1e-5 ), float( 1e-5 ), denom )
			);

			const hit = positionWorld.add( Ldir.mul( t ) );
			const radial = length( hit.sub( extras.ringCentre ) );
			const span = max( extras.ringOuter.sub( extras.ringInner ), float( 1e-5 ) );
			const coord = radial.sub( extras.ringInner ).div( span );

			const inside = t.greaterThan( 0 )
				.and( coord.greaterThan( 0 ) )
				.and( coord.lessThan( 1 ) );

			const opticalDepth = shadowRingTexture
				? texture( shadowRingTexture, vec2( coord, 0.5 ) ).a
				: float( 0.6 );

			// Slant path through the ring plane.
			const slant = opticalDepth.mul( 2.4 ).div( max( abs( denom ), float( 0.02 ) ) );
			ringTransmission = inside.select( exp( slant.negate() ), float( 1 ) );

		}

		// Airless bodies back-scatter; atmospheres and ices do not, so the
		// Lommel-Seeliger blend is keyed off whether the body has an atmosphere.
		const backscatter = def.atmosphere ? 0 : ( def.airless === false ? 0.15 : 0.55 );
		const terminator = smoothstep( L.sunAngularRadius.negate(), L.sunAngularRadius, nDotL );
		const shaped = backscatter > 0
			? regolith( nDotL, nDotV, float( backscatter ) ).mul( terminator )
			: lambert;

		const direct = shaped.mul( visibility ).mul( ringTransmission ).mul( L.irradiance );

		let lit = albedo.mul( direct );

		// --- specular ----------------------------------------------------------
		if ( specTex ) {
			// The Earth specular map is an ocean mask: water is smooth, land is not.
			const oceanMask = texture( specTex, uv() ).r;
			const waterRough = float( 0.08 ).add( oneMinus( oceanMask ).mul( 0.9 ) );
			const spec = specularGGX( N, V, Ldir, waterRough, float( 0.02 ) )
				.mul( oceanMask ).mul( visibility ).mul( ringTransmission ).mul( L.irradiance );
			lit = lit.add( vec3( spec ).mul( vec3( 1.0, 0.98, 0.92 ) ).mul( 2.2 ) );
		} else if ( def.specular ) {
			const spec = specularGGX( N, V, Ldir, float( def.specular.roughness ), float( def.specular.f0 ) )
				.mul( visibility ).mul( ringTransmission ).mul( L.irradiance ).mul( float( def.specular.intensity ?? 1 ) );
			lit = lit.add( vec3( spec ).mul( color( def.specular.color ?? 0xffffff ) ) );
		}

		// --- night side --------------------------------------------------------
		if ( nightMap ) {
			// Cities fade in through the dusk band rather than snapping on.
			const night = oneMinus( smoothstep( -0.10, 0.12, nDotL ) );
			const lights = texture( nightMap, uv() ).rgb;
			// Suppress the faint grey the map carries over unlit terrain.
			const gated = lights.mul( smoothstep( 0.06, 0.22, length( lights ) ) );
			lit = lit.add( gated.mul( night ).mul( extras.nightLights ).mul( 0.85 ) );
		}

		// --- ambient -----------------------------------------------------------
		// Starlight and zodiacal light, plus a scattering-limited floor for
		// bodies with an atmosphere so their night side is not pure black.
		const ambientFloor = def.atmosphere
			? L.ambient.add( extras.atmosphereTint.mul( 0.04 ).mul( L.irradiance ) )
			: L.ambient;

		lit = lit.add( albedo.mul( ambientFloor ) );

		// Nothing is added here to mark the focused body. A selection rim would
		// be a fixed radiance added on top of a scene whose exposure varies by a
		// factor of thirty between Mercury and Neptune, so it would be invisible
		// on one and a blinding halo on the other -- and it would misrepresent
		// what the body actually looks like. Focus is shown in the UI instead.
		return vec4( lit.mul( extras.exposureBias ), 1 );

	} )();

	return { material, uniforms: { ...L, ...extras } };

}

/**
 * Cloud shell: a second sphere just above the surface carrying the cloud map,
 * lit by the same sun but with no specular and a softer terminator (clouds are
 * optically thick and scatter forward).
 */
export function createCloudMaterial( def, textures ) {

	const material = new MeshBasicNodeMaterial();
	material.transparent = true;
	material.depthWrite = false;
	material.side = FrontSide;

	const L = createLightUniforms();
	const extras = { exposureBias: uniform( float( 1 ) ), opacity: uniform( float( def.cloudOpacity ?? 1 ) ) };

	const map = textures.get( def.cloudTexture );
	const tint = color( def.cloudTint ?? 0xffffff );

	const shade = Fn( () => {

		const N = normalize( normalWorld );
		const V = normalize( cameraPosition.sub( positionWorld ) );
		const nDotL = dot( N, L.sunDirection );

		const visibility = solarVisibility( positionWorld, L.sunDirection, L.sunAngularRadius, L.occluders );
		const lambert = softLambert( nDotL, L.sunAngularRadius );

		// Forward scattering: cloud tops glow where the Sun is behind them.
		const forward = pow( saturate( dot( V, L.sunDirection.negate() ) ), 6 ).mul( 0.35 );

		return lambert.add( forward ).mul( visibility ).mul( L.irradiance ).add( L.ambient.r.mul( 3 ) );

	} );

	const sample = texture( map, uv() );

	// Earth's cloud map is greyscale-on-black: luminance is the alpha.
	const density = def.cloudAlphaFromLuminance !== false
		? saturate( sample.r.mul( 0.5 ).add( sample.g.mul( 0.35 ) ).add( sample.b.mul( 0.15 ) ) )
		: sample.a;

	material.colorNode = vec4( tint.mul( shade() ).mul( extras.exposureBias ), 1 );
	material.opacityNode = density.mul( extras.opacity );

	return { material, uniforms: { ...L, ...extras } };

}
