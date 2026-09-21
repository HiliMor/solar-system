import { BufferGeometry, BufferAttribute, Mesh, Group, Vector3, DoubleSide, FrontSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, uv, positionLocal, positionWorld, normalWorld,
	cameraPosition, dot, normalize, saturate, mix, pow, max, min, abs, smoothstep,
	oneMinus, length, color, exp, mx_fractal_noise_float, mx_worley_noise_float
} from 'three/tsl';

import { createLightUniforms, solarVisibility, softLambert, regolith } from '../shaders/lighting.js';
import { KM_PER_UNIT } from '../data/constants.js';

/**
 * The ground under the observer's feet.
 *
 * Built as a spherical cap of the body rather than a flat disc, so the horizon
 * curves away at the correct distance and sits at the correct depression below
 * eye level -- 2.5 arcminutes from standing height on Earth, six degrees from
 * the summit of Olympus Mons. A flat plane would put the horizon at exactly eye
 * level from any height, which is the one thing a horizon never does.
 *
 * The cap is lit by the same machinery as every other surface, which is the
 * point: when the Moon's shadow arrives, the ground goes dark with it.
 */

/**
 * Spherical cap mesh, in a frame where +Y is up and the observer stands at the
 * origin. Rings are spaced quadratically so detail concentrates near the feet,
 * where it is actually visible.
 */
// The horizon is a hard line against the sky, so it shows every facet: at 160
// sectors each is more than two degrees wide and the edge visibly steps.
function makeCapGeometry( bodyRadiusKm, horizonKm, rings = 110, sectors = 320 ) {

	const R = bodyRadiusKm / KM_PER_UNIT;
	const maxAngle = Math.min( Math.asin( Math.min( horizonKm / bodyRadiusKm, 1 ) ) * 1.02, Math.PI * 0.49 );

	const count = ( rings + 1 ) * ( sectors + 1 );
	const positions = new Float32Array( count * 3 );
	const normals = new Float32Array( count * 3 );
	const uvs = new Float32Array( count * 2 );
	const indices = [];

	let v = 0;

	for ( let i = 0; i <= rings; i ++ ) {

		const t = i / rings;
		const angle = maxAngle * t * t;            // dense near the observer
		const sinA = Math.sin( angle ), cosA = Math.cos( angle );

		// Point on the sphere, expressed relative to the tangent point, so the
		// observer's feet are the origin and the surface falls away.
		const horizontal = R * sinA;
		const drop = R * ( 1 - cosA );

		for ( let j = 0; j <= sectors; j ++ ) {

			const phi = ( j / sectors ) * Math.PI * 2;

			positions[ v * 3 ] = horizontal * Math.cos( phi );
			positions[ v * 3 + 1 ] = - drop;
			positions[ v * 3 + 2 ] = horizontal * Math.sin( phi );

			// Normal of the sphere at this point, in the same frame.
			normals[ v * 3 ] = sinA * Math.cos( phi );
			normals[ v * 3 + 1 ] = cosA;
			normals[ v * 3 + 2 ] = sinA * Math.sin( phi );

			// uv.x is the *distance* to the horizon, not the ring index. Rings
			// are spaced quadratically, so using the index would make the haze
			// start a few metres from the observer's boots.
			uvs[ v * 2 ] = sinA / Math.max( Math.sin( maxAngle ), 1e-9 );
			uvs[ v * 2 + 1 ] = j / sectors;

			v ++;

		}

	}

	// Wound so the front faces point up. The obvious order winds them downward,
	// which leaves the cap backface-culled and the ground invisible.
	for ( let i = 0; i < rings; i ++ ) {
		for ( let j = 0; j < sectors; j ++ ) {
			const a = i * ( sectors + 1 ) + j;
			const b = a + sectors + 1;
			indices.push( a, a + 1, b, b, a + 1, b + 1 );
		}
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( normals, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( uvs, 2 ) );
	geometry.setIndex( indices );
	geometry.computeBoundingSphere();

	return geometry;

}

/** Terrain character per body, so the ground underfoot is not generic dirt. */
const TERRAIN = {
	earth: { near: 0xb9a888, far: 0x8f9b86, rough: 0.92, relief: 0.35, grain: 900 },
	moon: { near: 0x9a958d, far: 0x767169, rough: 0.96, relief: 0.55, grain: 1300, airless: true },
	mercury: { near: 0x8d857a, far: 0x6b645b, rough: 0.96, relief: 0.5, grain: 1200, airless: true },
	mars: { near: 0xa9613a, far: 0x8c5334, rough: 0.94, relief: 0.45, grain: 1100 },
	venus: { near: 0xa8874f, far: 0x8a6d3d, rough: 0.9, relief: 0.3, grain: 800 },
	io: { near: 0xd6c268, far: 0xa8763c, rough: 0.9, relief: 0.4, grain: 900, airless: true },
	europa: { near: 0xdcd6ca, far: 0xb3b0aa, rough: 0.6, relief: 0.25, grain: 1500, airless: true },
	ganymede: { near: 0x9b938a, far: 0x776f66, rough: 0.9, relief: 0.4, grain: 1100, airless: true },
	callisto: { near: 0x6f6459, far: 0x564d45, rough: 0.95, relief: 0.5, grain: 1200, airless: true },
	titan: { near: 0xa87a3e, far: 0x876238, rough: 0.8, relief: 0.3, grain: 700 },
	enceladus: { near: 0xf2f4f6, far: 0xd6dade, rough: 0.5, relief: 0.3, grain: 1600, airless: true },
	triton: { near: 0xd8d0c2, far: 0xb0a898, rough: 0.7, relief: 0.3, grain: 1400, airless: true },
	pluto: { near: 0xc4a68a, far: 0x9a7d66, rough: 0.9, relief: 0.35, grain: 1000 },
	ceres: { near: 0x8b857c, far: 0x6a655d, rough: 0.95, relief: 0.5, grain: 1200, airless: true },
	default: { near: 0x8a8378, far: 0x6b655c, rough: 0.94, relief: 0.45, grain: 1100, airless: true }
};

export function terrainFor( id ) {
	return TERRAIN[ id ] || TERRAIN.default;
}

/**
 * Creates the ground surface for an observer standing on `body`.
 */
export function createGround( body, horizonKm ) {

	const terrain = terrainFor( body.id );

	const group = new Group();
	group.name = 'ground';

	const geometry = makeCapGeometry( body.def.radius, horizonKm );

	const L = createLightUniforms();
	const extras = {
		exposureBias: uniform( float( 1 ) ),
		horizonFade: uniform( float( 1 ) ),
		skyTint: uniform( vec3( 0, 0, 0 ) ),
		horizonColor: uniform( vec3( 0, 0, 0 ) ),
		relief: uniform( float( terrain.relief ) ),
		/** See the note on scatteredFloor in shaders/atmosphere.js. */
		scatteredFloor: uniform( float( 0 ) )
	};

	const material = new MeshBasicNodeMaterial();
	material.side = FrontSide;

	const near = color( terrain.near );
	const far = color( terrain.far );

	material.colorNode = Fn( () => {

		const distance = uv().x;                       // 0 at the feet, 1 at the horizon

		// Regolith: dunes, then grain, then scattered rocks.
		//
		// A scene unit is a thousand kilometres, so noise taken straight from
		// positionLocal would have a wavelength wider than a continent. These
		// are converted to metres first and sized in metres, which is the only
		// scale that means anything underfoot.
		const metres = positionLocal.mul( 1e6 );
		const dunes = mx_fractal_noise_float( metres.mul( 1 / 240 ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
		const grain = mx_fractal_noise_float( metres.mul( 1 / 2.2 ), 3, 2.2, 0.5 ).mul( 0.5 ).add( 0.5 );
		const rocks = oneMinus( smoothstep( 0.0, 0.2,
			mx_worley_noise_float( metres.mul( 1 / ( 1200 / terrain.grain ) ), 1 ) ) );

		// Fine detail is dropped with distance rather than left to alias into
		// noise; anything past a few hundred metres is below a pixel anyway.
		const detailFade = oneMinus( smoothstep( 0.004, 0.06, distance ) );
		const shade = dunes.mul( 0.7 ).add( grain.mul( 0.3 ).mul( detailFade ) );

		let albedo = mix( far, near, saturate( shade ) );
		albedo = mix( albedo, albedo.mul( 0.55 ), rocks.mul( detailFade ).mul( extras.relief ) );

		// --- lighting, identical in kind to every other surface --------------
		const N = normalize( normalWorld );
		const V = normalize( cameraPosition.sub( positionWorld ) );
		const Ldir = L.sunDirection;
		const nDotL = dot( N, Ldir );

		const directVisibility = solarVisibility( positionWorld, Ldir, L.sunAngularRadius, L.occluders );
		const visibility = directVisibility.add(
			extras.scatteredFloor.mul( oneMinus( directVisibility ) )
		);
		const terminator = smoothstep( L.sunAngularRadius.negate(), L.sunAngularRadius, nDotL );
		const lambert = saturate( nDotL ).mul( terminator );

		// Lommel-Seeliger back-scatter is right for airless regolith seen from
		// space, but it is unbounded as the view angle goes grazing -- and a
		// ground plane is grazing almost everywhere. So it is capped, and used
		// only where there is no atmosphere to scatter light around anyway.
		const direct = ( terrain.airless
			? mix( lambert, min( regolith( nDotL, dot( N, V ), float( 0.5 ) ), float( 1.2 ) ).mul( terminator ), float( 0.7 ) )
			: lambert
		).mul( visibility ).mul( L.irradiance );

		let lit = albedo.mul( direct );

		// Skylight: on a body with an atmosphere the ground is also lit from
		// above by the sky itself, which is what fills in the shadows and keeps
		// the unlit side from going pure black.
		lit = lit.add( albedo.mul( extras.skyTint ).mul( saturate( nDotL.add( 0.4 ) ).mul( 0.6 ).add( 0.4 ) ) );
		lit = lit.add( albedo.mul( L.ambient ) );

		// Aerial perspective: the far ground fades into the sky colour.
		// Aerial perspective. Squared so the haze builds gradually across the
		// whole distance rather than snapping in near the horizon.
		const haze = smoothstep( 0.02, 1.0, distance );
		lit = mix( lit, extras.horizonColor, haze.mul( haze ).mul( extras.horizonFade ) );

		return vec4( lit.mul( extras.exposureBias ), 1 );

	} )();

	const mesh = new Mesh( geometry, material );
	mesh.frustumCulled = false;
	mesh.renderOrder = - 5;
	group.add( mesh );

	return {
		group,
		mesh,
		material,
		uniforms: { ...L, ...extras },
		terrain,
		dispose() { geometry.dispose(); material.dispose(); }
	};

}
