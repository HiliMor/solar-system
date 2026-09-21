import { Sprite, InstancedBufferAttribute, AdditiveBlending, Vector3 } from 'three';
import { SpriteNodeMaterial } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, instancedBufferAttribute, uv, color,
	mix, max, min, clamp, saturate, smoothstep, length, pow, sqrt, oneMinus,
	cameraPosition, dot, normalize
} from 'three/tsl';

/**
 * Comet tails.
 *
 * A comet has two tails and they point in different directions, which is the
 * single most commonly mangled thing about comets:
 *
 *   the ion tail is swept straight back by the solar wind, so it points almost
 *     exactly anti-sunward regardless of which way the comet is travelling, and
 *     glows blue from CO+ fluorescence
 *
 *   the dust tail is made of grains released at the nucleus and then pushed out
 *     by radiation pressure while they keep the orbital velocity they were born
 *     with. They fall behind, so the tail curves, and it is broad and yellowish
 *     because it is just reflected sunlight
 *
 * Both are built here as one instanced sprite cloud whose particles are placed
 * along a syndyne-style curve in the vertex shader, so the tail reshapes itself
 * correctly as the comet swings through perihelion.
 */
export function createCometTail( def, particleCount = 11000 ) {

	const seedData = new Float32Array( particleCount * 4 );

	// Deterministic layout: t along the tail, lateral spread, which tail it
	// belongs to, and a size jitter.
	let seed = 1;
	const random = () => {
		seed = ( seed * 1103515245 + 12345 ) & 0x7fffffff;
		return seed / 0x7fffffff;
	};

	for ( let i = 0; i < particleCount; i ++ ) {
		const isIon = i % 5 < 2 ? 1 : 0;                // ion tail is the thinner, fainter population
		// Bias samples toward the head, where the tail is brightest and densest.
		const t = Math.pow( random(), isIon ? 1.15 : 1.45 );
		seedData[ i * 4 ] = t;
		seedData[ i * 4 + 1 ] = ( random() - 0.5 ) * 2;   // lateral
		seedData[ i * 4 + 2 ] = isIon;
		seedData[ i * 4 + 3 ] = random();                 // size / brightness jitter
	}

	const material = new SpriteNodeMaterial();
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;

	const uniforms = {
		/** Nucleus position, world space. */
		nucleus: uniform( vec3( 0, 0, 0 ) ),
		/** Unit vector from the nucleus toward the Sun, world space. */
		sunDirection: uniform( vec3( 1, 0, 0 ) ),
		/** Unit vector along the comet's motion, world space. */
		velocity: uniform( vec3( 0, 1, 0 ) ),
		/** Length of the dust and ion tails, in scene units. */
		dustLength: uniform( float( 1 ) ),
		ionLength: uniform( float( 1 ) ),
		/** 0 when dormant far from the Sun, 1 at peak outgassing. */
		activity: uniform( float( 0 ) ),
		pixelScale: uniform( float( 500 ) ),
		exposureBias: uniform( float( 1 ) ),
		widthScale: uniform( float( 1 ) )
	};

	const attr = instancedBufferAttribute( new InstancedBufferAttribute( seedData, 4 ) );

	const t = attr.x;
	const lateral = attr.y;
	const isIon = attr.z;
	const jitter = attr.w;

	const position = Fn( () => {

		const antiSun = uniforms.sunDirection.negate();

		// Radiation pressure accelerates grains away from the Sun, so their
		// displacement grows with the square of time since release.
		const dustOut = antiSun.mul( t.mul( t ).mul( uniforms.dustLength ) );
		// Meanwhile they keep the orbital velocity they were released with and
		// fall behind the nucleus, which is what bends the tail.
		const dustLag = uniforms.velocity.mul( t.mul( uniforms.dustLength ).mul( -0.42 ) );

		// The ion tail is dragged by the solar wind at hundreds of km/s, fast
		// enough that orbital motion barely deflects it.
		const ionOut = antiSun.mul( t.mul( uniforms.ionLength ) );

		const along = mix( dustOut.add( dustLag ), ionOut, isIon );

		// The dust tail fans out; the ion tail stays collimated.
		const width = mix(
			pow( t, 0.65 ).mul( uniforms.dustLength ).mul( 0.13 ),
			pow( t, 0.5 ).mul( uniforms.ionLength ).mul( 0.022 ),
			isIon
		).mul( uniforms.widthScale );

		// Spread perpendicular to the tail axis.
		const axis = normalize( along.add( antiSun.mul( 1e-4 ) ) );
		const side = normalize( axis.cross( uniforms.velocity ).add( vec3( 1e-5, 0, 0 ) ) );
		const up = axis.cross( side );

		const angle = jitter.mul( 6.2831853 );
		const offset = side.mul( angle.cos() ).add( up.mul( angle.sin() ) )
			.mul( width ).mul( lateral );

		return uniforms.nucleus.add( along ).add( offset );

	} );

	const worldPosition = position().toVar();
	material.positionNode = worldPosition;

	const distance = max( length( worldPosition.sub( cameraPosition ) ), float( 1e-4 ) );
	const pixels = clamp(
		mix( float( 9 ), float( 3.2 ), isIon ).mul( jitter.mul( 0.8 ).add( 0.5 ) ),
		float( 1.2 ), float( 26 )
	);
	material.scaleNode = vec2( pixels.mul( distance ).div( uniforms.pixelScale ) );

	// Colour: CO+ fluorescence in the ion tail, reflected sunlight in the dust.
	const ionColour = color( 0x5c9dff );
	const dustColour = color( 0xffe7bd );
	const tint = mix( dustColour, ionColour, isIon );

	// Both tails thin out along their length; the ion tail also breaks into
	// streamers, so its falloff is steeper and noisier.
	const fade = mix( oneMinus( t ).pow( 1.7 ), oneMinus( t ).pow( 2.6 ), isIon );

	const disc = oneMinus( smoothstep( 0.0, 0.5, length( uv().sub( 0.5 ) ) ) );

	material.colorNode = vec4( tint.mul( uniforms.exposureBias ), 1 );
	material.opacityNode = disc
		.mul( fade )
		.mul( uniforms.activity )
		.mul( mix( float( 0.045 ), float( 0.05 ), isIon ) );

	const sprite = new Sprite( material );
	sprite.count = particleCount;
	sprite.frustumCulled = false;
	sprite.renderOrder = 6;
	sprite.name = `${ def.id }-tail`;

	return { object: sprite, uniforms, material, count: particleCount };

}
