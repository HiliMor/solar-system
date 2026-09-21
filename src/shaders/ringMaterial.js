import { MeshBasicNodeMaterial, DoubleSide, NormalBlending } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, texture, uv, positionLocal, positionWorld,
	normalWorld, cameraPosition, dot, normalize, saturate, mix, pow, max, min, abs,
	smoothstep, oneMinus, length, color, exp, mx_fractal_noise_float, clamp
} from 'three/tsl';

import { createLightUniforms, solarVisibility, miePhase } from './lighting.js';

/**
 * Planetary rings.
 *
 * Rings are not a painted disc. They are an optically thin swarm of ice
 * particles, and the two things that make them read correctly are:
 *
 *   the planet's shadow falling across them, with a real penumbra -- this is
 *     handled by the same occluder machinery the planets use, so the shadow
 *     sweeps round correctly through the seasons
 *
 *   forward scattering -- when the Sun is on the far side you are seeing light
 *     transmitted through the ring plane, so the thin gaps light up and the
 *     dense B ring goes dark. It inverts the whole brightness pattern, and it
 *     is why Cassini's backlit portraits look nothing like the view from Earth.
 */
export function createRingMaterial( ring, textures ) {

	const material = new MeshBasicNodeMaterial();
	material.side = DoubleSide;
	material.transparent = true;
	material.depthWrite = false;

	const L = createLightUniforms();

	const extras = {
		exposureBias: uniform( float( 1 ) ),
		/** Planet centre, world space. */
		centre: uniform( vec3( 0, 0, 0 ) ),
		opacity: uniform( float( ring.opacity ?? 1 ) )
	};

	const map = ring.texture ? textures.get( ring.texture ) : null;
	const tint = color( ring.color ?? 0xffffff );

	// Radial coordinate across the ring plane, 0 at the inner edge. The geometry
	// from makeRingGeometry() writes exactly that into uv.x, so no position maths
	// is needed here and the mesh can be transformed freely.
	const radial = uv().x;

	const shade = Fn( () => {

		const r = saturate( radial );

		// --- optical depth and colour -----------------------------------------
		let opticalDepth, albedo;

		if ( map ) {
			// The published Saturn strip stores colour in rgb and transmittance
			// in alpha, sampled along the radius.
			const sample = texture( map, vec2( r, 0.5 ) );
			albedo = sample.rgb;
			opticalDepth = sample.a;
		} else {
			// Narrow rings: a smooth profile with some fine structure.
			const profile = smoothstep( 0, 0.12, r ).mul( oneMinus( smoothstep( 0.88, 1, r ) ) );
			const structure = mx_fractal_noise_float( vec3( r.mul( 160 ), 0, 0 ), 3, 2.2, 0.55 ).mul( 0.5 ).add( 0.7 );
			albedo = tint;
			opticalDepth = profile.mul( structure );
		}

		// Fine-scale density waves and wakes, beyond what the map resolves.
		const wakes = mx_fractal_noise_float( vec3( r.mul( 900 ), 0, 0 ), 2, 2.0, 0.5 ).mul( 0.08 ).add( 1 );
		opticalDepth = saturate( opticalDepth.mul( wakes ) );

		// --- geometry ----------------------------------------------------------
		const V = normalize( cameraPosition.sub( positionWorld ) );
		const sunDir = L.sunDirection;

		// The ring plane normal, made to face the viewer: particles scatter the
		// same either way, so which face we are on must not change the result.
		const planeNormal = normalize( normalWorld );
		const facing = dot( planeNormal, V ).lessThan( 0 ).select( planeNormal.negate(), planeNormal );

		const muSun = abs( dot( planeNormal, sunDir ) ).add( 0.02 );
		const muView = abs( dot( facing, V ) ).add( 0.02 );

		// Are the Sun and the viewer on the same side of the ring plane?
		const sameSide = dot( planeNormal, sunDir ).mul( dot( planeNormal, V ) ).greaterThan( 0 );

		const shadow = solarVisibility( positionWorld, sunDir, L.sunAngularRadius, L.occluders );

		// --- reflected (front-lit) --------------------------------------------
		// Single scattering off a slab of optical depth tau.
		const tau = opticalDepth.mul( 2.4 );
		const reflected = oneMinus( exp( tau.mul( float( 1 ).div( muSun ).add( float( 1 ).div( muView ) ) ).negate() ) )
			.mul( muSun.div( muSun.add( muView ) ) );

		// Opposition surge: the shadow-hiding spike near zero phase angle that
		// makes the rings flare when the Sun is directly behind the observer.
		const phaseCos = dot( V, sunDir );
		const opposition = float( 1 ).add( smoothstep( 0.986, 1.0, phaseCos ).mul( 0.9 ) );

		// --- transmitted (back-lit) -------------------------------------------
		const transmitted = exp( tau.div( muSun ).negate() )
			.mul( miePhase( phaseCos.negate(), float( 0.6 ) ).mul( 9 ).add( 0.35 ) );

		const scatter = sameSide.select(
			reflected.mul( opposition ),
			reflected.mul( 0.25 ).add( transmitted.mul( 0.9 ) )
		);

		return albedo.mul( scatter ).mul( shadow ).mul( L.irradiance ).mul( extras.exposureBias ).mul( 4.2 );

	} );

	const alphaOf = Fn( () => {
		const r = saturate( radial );
		const inRange = r.greaterThan( 0.0005 ).and( r.lessThan( 0.9995 ) );
		const od = map ? texture( map, vec2( r, 0.5 ) ).a
			: smoothstep( 0, 0.12, r ).mul( oneMinus( smoothstep( 0.88, 1, r ) ) );

		// Grazing views look through more particles, so the rings go opaque as
		// the plane closes up -- and vanish exactly edge-on.
		const V = normalize( cameraPosition.sub( positionWorld ) );
		const muView = abs( dot( normalize( normalWorld ), V ) );
		const pathLength = float( 1 ).div( max( muView, 0.012 ) );
		const coverage = oneMinus( exp( od.mul( 2.2 ).mul( pathLength ).negate() ) );

		return inRange.select( coverage.mul( extras.opacity ), float( 0 ) );
	} );

	material.colorNode = vec4( shade(), 1 );
	material.opacityNode = alphaOf();

	return { material, uniforms: { ...L, ...extras } };

}
