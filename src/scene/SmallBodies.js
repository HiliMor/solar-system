import { Sprite, InstancedBufferAttribute, BufferGeometry, AdditiveBlending, Vector3 } from 'three';
import { SpriteNodeMaterial } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, instancedBufferAttribute, uv, color,
	sin, cos, sqrt, floor, mix, max, min, abs, pow, clamp, saturate, smoothstep,
	length, dot, Loop, oneMinus, exp, cameraPosition
} from 'three/tsl';

import { AU_TRUE, AU_DISPLAY, ORBIT_COMPRESSION, TAU, DEG } from '../data/constants.js';

/**
 * The belts: main belt, Jupiter Trojans, Kuiper belt.
 *
 * Tens of thousands of bodies, each on its own orbit, all of which have to be
 * integrated every frame. Doing that on the CPU would cost more than the rest
 * of the scene combined, so it happens in the vertex shader: every particle
 * carries its six orbital elements as instanced attributes and solves Kepler's
 * equation itself, four Newton iterations, in parallel.
 *
 * That means the belt is not a decorative texture. It is forty thousand real
 * orbits, obeying the same equation as the planets, and the Kirkwood gaps and
 * the Trojan clouds are there because the element distribution puts them there.
 */

const KEPLER_ITERATIONS = 4;

/**
 * Samples a value from a distribution with the given mean and spread, clamped
 * to a range. Uses a sum of uniforms, which is close enough to Gaussian for
 * this and much cheaper than a Box-Muller transform.
 */
function spread( random, mean, sigma, low, high ) {
	const g = ( random() + random() + random() + random() - 2 ) * 0.7071;
	return Math.min( high, Math.max( low, mean + g * sigma ) );
}

/** Deterministic PRNG, so the belt is identical on every load. */
function mulberry32( seed ) {
	return function () {
		seed |= 0; seed = seed + 0x6D2B79F5 | 0;
		let t = Math.imul( seed ^ seed >>> 15, 1 | seed );
		t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;
	};
}

/**
 * Semi-major axes for the main belt, carved by the Kirkwood gaps.
 *
 * The gaps at the 4:1, 3:1, 5:2, 7:3 and 2:1 mean-motion resonances with
 * Jupiter are real, cleared over billions of years, and they are the most
 * recognisable structure in the belt -- so they are cut out explicitly rather
 * than left to a smooth distribution.
 */
const KIRKWOOD_GAPS = [
	{ a: 2.065, width: 0.015, depth: 0.95 },   // 4:1
	{ a: 2.502, width: 0.022, depth: 0.97 },   // 3:1
	{ a: 2.825, width: 0.018, depth: 0.85 },   // 5:2
	{ a: 2.958, width: 0.014, depth: 0.80 },   // 7:3
	{ a: 3.279, width: 0.020, depth: 0.90 }    // 2:1
];

function gapSurvival( a ) {
	let keep = 1;
	for ( const gap of KIRKWOOD_GAPS ) {
		const d = ( a - gap.a ) / gap.width;
		keep *= 1 - gap.depth * Math.exp( - d * d );
	}
	return keep;
}

/**
 * Generates the element table for one belt.
 * @returns {{ elementsA: Float32Array, elementsB: Float32Array, look: Float32Array, count: number }}
 */
function generateBelt( config ) {

	const random = mulberry32( config.seed );

	const a = [], e = [], inc = [], node = [], peri = [], M0 = [], size = [], tint = [];

	let attempts = 0;
	while ( a.length < config.count && attempts < config.count * 40 ) {

		attempts ++;

		let semiMajor;

		if ( config.kind === 'trojan' ) {
			// Tadpole clouds librating about Jupiter's L4 and L5.
			semiMajor = spread( random, config.a, 0.08, config.aMin, config.aMax );
		} else {
			semiMajor = config.aMin + random() * ( config.aMax - config.aMin );
			if ( config.kirkwood && random() > gapSurvival( semiMajor ) ) continue;
		}

		const eccentricity = Math.min( config.eMax, Math.abs( spread( random, config.eMean, config.eSigma, 0, config.eMax ) ) );
		const inclination = Math.abs( spread( random, config.iMean, config.iSigma, 0, config.iMax ) );

		let longitudeOfNode = random() * 360;
		let argumentOfPeriapsis = random() * 360;
		let meanAnomaly = random() * 360;

		if ( config.kind === 'trojan' ) {
			// Cluster the mean longitude 60 degrees ahead of or behind Jupiter.
			const camp = random() < 0.58 ? 60 : - 60;          // L4 is the more populous
			const libration = spread( random, 0, 14, - 38, 38 );
			const jupiterLongitude = config.leaderLongitude;
			const meanLongitude = jupiterLongitude + camp + libration;
			meanAnomaly = meanLongitude - longitudeOfNode - argumentOfPeriapsis;
		}

		a.push( semiMajor );
		e.push( eccentricity );
		inc.push( inclination * DEG );
		node.push( longitudeOfNode * DEG );
		peri.push( argumentOfPeriapsis * DEG );
		M0.push( ( ( meanAnomaly % 360 ) + 360 ) % 360 * DEG );

		// Absolute magnitude proxy: a steep power law, so most are faint specks
		// and a handful are bright.
		const brightness = Math.pow( random(), config.brightnessExponent ?? 3.2 );
		size.push( config.sizeMin + brightness * ( config.sizeMax - config.sizeMin ) );
		tint.push( random() );

	}

	const count = a.length;
	const elementsA = new Float32Array( count * 4 );
	const elementsB = new Float32Array( count * 4 );
	const look = new Float32Array( count * 2 );

	for ( let i = 0; i < count; i ++ ) {
		elementsA[ i * 4 ] = a[ i ];
		elementsA[ i * 4 + 1 ] = e[ i ];
		elementsA[ i * 4 + 2 ] = inc[ i ];
		elementsA[ i * 4 + 3 ] = node[ i ];

		elementsB[ i * 4 ] = peri[ i ];
		elementsB[ i * 4 + 1 ] = M0[ i ];
		// Mean motion in rad/day from Kepler's third law.
		elementsB[ i * 4 + 2 ] = TAU / ( Math.pow( a[ i ], 1.5 ) * 365.256898 );
		elementsB[ i * 4 + 3 ] = 0;

		look[ i * 2 ] = size[ i ];
		look[ i * 2 + 1 ] = tint[ i ];
	}

	return { elementsA, elementsB, look, count };

}

/**
 * Builds a belt as an instanced sprite cloud whose positions are computed
 * entirely on the GPU.
 */
export function createBelt( config ) {

	const data = generateBelt( config );

	const material = new SpriteNodeMaterial();
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;

	const uniforms = {
		days: uniform( float( 0 ) ),
		blend: uniform( float( 1 ) ),
		/** Floating-origin offset, in ecliptic scene units. */
		origin: uniform( vec3( 0, 0, 0 ) ),
		/** viewportHeight / (2 tan(fov/2)) -- world units to pixels at unit depth. */
		pixelScale: uniform( float( 500 ) ),
		opacity: uniform( float( config.opacity ?? 1 ) ),
		sizeScale: uniform( float( 1 ) ),
		exposureBias: uniform( float( 1 ) )
	};

	const A = instancedBufferAttribute( new InstancedBufferAttribute( data.elementsA, 4 ) );
	const B = instancedBufferAttribute( new InstancedBufferAttribute( data.elementsB, 4 ) );
	const look = instancedBufferAttribute( new InstancedBufferAttribute( data.look, 2 ) );

	/** Heliocentric ecliptic position, in AU, solved on the GPU. */
	const solve = Fn( () => {

		const semiMajor = A.x, ecc = A.y, inc = A.z, node = A.w;
		const peri = B.x, M0 = B.y, meanMotion = B.z;

		// Mean anomaly, wrapped into [-pi, pi) before iterating -- Newton needs a
		// bounded argument or it wanders at large day counts.
		const rawM = M0.add( meanMotion.mul( uniforms.days ) );
		const M = rawM.sub( floor( rawM.add( Math.PI ).div( TAU ) ).mul( TAU ) );

		const E = M.toVar();

		Loop( KEPLER_ITERATIONS, () => {
			const sinE = sin( E ), cosE = cos( E );
			E.assign( E.sub( E.sub( ecc.mul( sinE ) ).sub( M ).div( oneMinus( ecc.mul( cosE ) ) ) ) );
		} );

		const beta = sqrt( max( oneMinus( ecc.mul( ecc ) ), float( 1e-6 ) ) );
		const px = semiMajor.mul( cos( E ).sub( ecc ) );
		const py = semiMajor.mul( beta ).mul( sin( E ) );

		const cw = cos( peri ), sw = sin( peri );
		const co = cos( node ), so = sin( node );
		const ci = cos( inc ), si = sin( inc );

		return vec3(
			cw.mul( co ).sub( sw.mul( so ).mul( ci ) ).mul( px )
				.add( sw.negate().mul( co ).sub( cw.mul( so ).mul( ci ) ).mul( py ) ),
			cw.mul( so ).add( sw.mul( co ).mul( ci ) ).mul( px )
				.add( sw.negate().mul( so ).add( cw.mul( co ).mul( ci ) ).mul( py ) ),
			sw.mul( si ).mul( px ).add( cw.mul( si ).mul( py ) )
		);

	} );

	const worldPosition = Fn( () => {

		const ecliptic = solve();

		// Same per-orbit scale policy the planets use, evaluated in the shader.
		const compressed = float( AU_DISPLAY ).mul( pow( A.x, ORBIT_COMPRESSION - 1 ) );
		const unitsPerAU = mix( float( AU_TRUE ), compressed, uniforms.blend );

		const scaled = ecliptic.mul( unitsPerAU ).sub( uniforms.origin );

		// Ecliptic -> three.js axes.
		return vec3( scaled.x, scaled.z, scaled.y.negate() );

	} );

	const position = worldPosition().toVar();
	material.positionNode = position;

	// Sizing.
	//
	// The sprite quad is specified in world units and shrinks with distance, but
	// what actually matters is how many pixels each rock covers: below one, it
	// flickers into nothing, and the far half of the belt disappears. So the
	// desired pixel size is worked out first, clamped to a sane band, and then
	// converted back into the world size that produces it.
	const distance = max( length( position.sub( cameraPosition ) ), float( 1e-4 ) );
	const pixels = clamp(
		look.x.mul( uniforms.sizeScale ).mul( uniforms.pixelScale ).div( distance ),
		float( 0.9 ),
		float( 7 )
	);
	const worldSize = pixels.mul( distance ).div( uniforms.pixelScale );
	material.scaleNode = vec2( worldSize );

	// Colour: C-type carbonaceous (dark grey) through S-type silicate (reddish),
	// which is roughly the real compositional split across the belt.
	const carbonaceous = color( config.colorA ?? 0x6a6660 );
	const silicate = color( config.colorB ?? 0xb08c62 );
	const albedoTint = mix( carbonaceous, silicate, look.y );

	// Sunlight falls off with distance, so the Kuiper belt really is dimmer.
	const heliocentric = max( A.x, float( 0.2 ) );
	const illumination = float( 1 ).div( heliocentric.mul( heliocentric ) );

	// Round, soft sprite.
	const d = length( uv().sub( 0.5 ) );
	const disc = oneMinus( smoothstep( 0.12, 0.5, d ) );

	material.colorNode = vec4(
		albedoTint.mul( illumination ).mul( 3.2 ).mul( uniforms.exposureBias ),
		1
	);
	material.opacityNode = disc.mul( uniforms.opacity );

	const sprite = new Sprite( material );
	sprite.count = data.count;
	sprite.frustumCulled = false;
	sprite.renderOrder = 5;
	sprite.name = config.id;

	return {
		id: config.id,
		name: config.name,
		object: sprite,
		uniforms,
		count: data.count,
		setVisible( v ) { sprite.visible = v; },
		dispose() { material.dispose(); }
	};

}

/**
 * Belt definitions, with element distributions taken from the real populations.
 */
export const BELT_CONFIGS = [
	{
		id: 'mainBelt', name: 'Main asteroid belt',
		count: 42000, seed: 20260921,
		aMin: 2.06, aMax: 3.38, kirkwood: true,
		eMean: 0.145, eSigma: 0.075, eMax: 0.42,
		iMean: 8.5, iSigma: 6.5, iMax: 33,
		sizeMin: 0.28, sizeMax: 2.4, brightnessExponent: 3.4,
		colorA: 0x5f5b55, colorB: 0xa8865e, opacity: 0.85
	},
	{
		id: 'hildas', name: 'Hilda group',
		count: 2200, seed: 771,
		aMin: 3.90, aMax: 4.02,
		eMean: 0.16, eSigma: 0.06, eMax: 0.31,
		iMean: 7.0, iSigma: 5.0, iMax: 22,
		sizeMin: 0.3, sizeMax: 2.0,
		colorA: 0x5a544c, colorB: 0x9a7a52, opacity: 0.8
	},
	{
		id: 'trojans', name: 'Jupiter Trojans',
		kind: 'trojan', count: 7000, seed: 4242,
		a: 5.203, aMin: 5.05, aMax: 5.36,
		eMean: 0.06, eSigma: 0.035, eMax: 0.18,
		iMean: 12.0, iSigma: 9.0, iMax: 42,
		sizeMin: 0.32, sizeMax: 2.2,
		leaderLongitude: 34.4,         // Jupiter's mean longitude at J2000
		colorA: 0x4e4941, colorB: 0x7d6046, opacity: 0.9
	},
	{
		id: 'kuiper', name: 'Kuiper belt',
		count: 26000, seed: 99001,
		aMin: 34.0, aMax: 52.0,
		eMean: 0.10, eSigma: 0.07, eMax: 0.35,
		iMean: 9.0, iSigma: 8.0, iMax: 36,
		sizeMin: 0.5, sizeMax: 4.5, brightnessExponent: 2.6,
		colorA: 0x4a4a58, colorB: 0x8f7a74, opacity: 1.0
	}
];
