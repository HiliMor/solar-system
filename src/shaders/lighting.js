import {
	Fn, vec3, vec4, float, uniform, dot, normalize, saturate, clamp, max, min, abs,
	pow, exp, mix, smoothstep, length, sub, oneMinus, Loop, If
} from 'three/tsl';

/**
 * Shared lighting pieces for every solid body in the scene.
 *
 * Nothing here uses three.js lights. The Sun is 150 million km away and the
 * render scale is deliberately non-physical in compressed mode, so a PointLight
 * with inverse-square falloff would be wrong by orders of magnitude. Instead
 * each body carries uniforms describing its *true* illumination -- direction to
 * the Sun and irradiance relative to the solar constant at 1 AU -- computed in
 * float64 on the CPU from real distances. The shading is then correct whatever
 * the render scale is doing.
 */

export const MAX_OCCLUDERS = 4;

/**
 * Creates the uniform set a lit body needs.
 * All positions are in three.js world space (i.e. already relative to the
 * floating origin), so they stay small and float32-safe.
 */
export function createLightUniforms() {
	return {
		/** Unit vector from the body toward the Sun, world space. */
		sunDirection: uniform( vec3( 1, 0, 0 ) ),
		/** Sun position in world space, for specular and shadow geometry. */
		sunPosition: uniform( vec3( 0, 0, 0 ) ),
		/** Irradiance relative to 1361 W/m2. Mercury ~6.7, Neptune ~0.001. */
		irradiance: uniform( float( 1 ) ),
		/** Angular *radius* of the Sun as seen from this body, radians. */
		sunAngularRadius: uniform( float( 0.00465 ) ),
		/** Ambient floor: zodiacal light, starlight, reflected planetshine. */
		ambient: uniform( vec3( 0.0018, 0.0020, 0.0026 ) ),
		/** xyz = occluder centre (world), w = radius. w <= 0 disables the slot. */
		occluders: Array.from( { length: MAX_OCCLUDERS }, () => uniform( vec4( 0, 0, 0, 0 ) ) )
	};
}

/**
 * Fraction of the solar disc still visible from `position`, accounting for up
 * to MAX_OCCLUDERS spheres.
 *
 * Models both discs as circles on the sky and estimates their overlap, so the
 * result has a real penumbra rather than a hard edge -- which is what makes a
 * partial solar eclipse look like a partial solar eclipse, and gives Io a soft
 * shadow on Jupiter's cloud tops.
 */
export const solarVisibility = /*#__PURE__*/ Fn( ( [ position, sunDir, sunAngRadius, occluders ] ) => {

	const visible = float( 1 ).toVar();

	for ( let k = 0; k < MAX_OCCLUDERS; k ++ ) {

		const occ = occluders[ k ];
		const toOcc = occ.xyz.sub( position );
		const along = dot( toOcc, sunDir );

		// Only bodies between us and the Sun can block anything.
		const active = occ.w.greaterThan( 0 ).and( along.greaterThan( 0 ) );

		const perp = length( toOcc.sub( sunDir.mul( along ) ) );
		const distance = max( along, 1e-6 );

		const occAng = occ.w.div( distance );          // angular radius of the occluder
		const separation = perp.div( distance );       // angular separation of the two discs

		// Disc overlap: full when the separation is less than the difference of
		// the radii, zero once it exceeds their sum.
		const outer = occAng.add( sunAngRadius );
		const inner = abs( occAng.sub( sunAngRadius ) );
		// Written as 1 - smoothstep(inner, outer, ...) rather than the reversed
		// form: WGSL leaves smoothstep undefined when the first edge exceeds the
		// second, and Chrome returns 1 there, which silently puts every body in
		// permanent total eclipse.
		const overlap = oneMinus( smoothstep( inner, outer, separation ) );

		// An occluder smaller than the Sun can only ever take an annulus-sized
		// bite, capped by the ratio of the disc areas.
		const areaCap = min( float( 1 ), occAng.mul( occAng ).div( sunAngRadius.mul( sunAngRadius ) ) );

		const blocked = active.select( overlap.mul( areaCap ), float( 0 ) );

		visible.assign( visible.mul( oneMinus( blocked ) ) );

	}

	return visible;

} );

/**
 * Lambert term with a terminator softened by the Sun's finite angular size.
 *
 * A point source gives a razor edge; the real terminator on Earth is about
 * 400 km wide because the Sun is half a degree across. Wrapping the cosine by
 * the solar angular radius reproduces that at essentially no cost.
 */
export const softLambert = /*#__PURE__*/ Fn( ( [ nDotL, sunAngRadius ] ) => {
	// Fraction of the solar disc above the local horizon, times the cosine.
	const s = max( sunAngRadius, 0.0008 );
	const visibleFraction = smoothstep( s.negate(), s, nDotL );
	return visibleFraction.mul( saturate( nDotL.add( s.mul( 0.5 ) ) ) );
} );

/** Trowbridge-Reitz (GGX) specular, Smith height-correlated visibility, Schlick Fresnel. */
export const specularGGX = /*#__PURE__*/ Fn( ( [ N, V, L, roughness, f0 ] ) => {

	const H = normalize( L.add( V ) );
	const nDotL = saturate( dot( N, L ) );
	const nDotV = saturate( dot( N, V ) ).add( 1e-5 );
	const nDotH = saturate( dot( N, H ) );
	const vDotH = saturate( dot( V, H ) );

	const a = max( roughness.mul( roughness ), 0.002 );
	const a2 = a.mul( a );

	const d = nDotH.mul( nDotH ).mul( a2.sub( 1 ) ).add( 1 );
	const D = a2.div( float( Math.PI ).mul( d ).mul( d ) );

	const gv = nDotL.mul( nDotV.mul( nDotV ).mul( oneMinus( a2 ) ).add( a2 ).sqrt() );
	const gl = nDotV.mul( nDotL.mul( nDotL ).mul( oneMinus( a2 ) ).add( a2 ).sqrt() );
	const Vis = float( 0.5 ).div( max( gv.add( gl ), 1e-5 ) );

	const F = f0.add( oneMinus( f0 ).mul( pow( oneMinus( vDotH ), 5 ) ) );

	return D.mul( Vis ).mul( F ).mul( nDotL );

} );

/** Rayleigh phase function. */
export const rayleighPhase = /*#__PURE__*/ Fn( ( [ cosTheta ] ) => {
	return float( 3 / ( 16 * Math.PI ) ).mul( cosTheta.mul( cosTheta ).add( 1 ) );
} );

/** Cornette-Shanks approximation to the Mie phase function. */
export const miePhase = /*#__PURE__*/ Fn( ( [ cosTheta, g ] ) => {
	const g2 = g.mul( g );
	const num = oneMinus( g2 ).mul( cosTheta.mul( cosTheta ).add( 1 ) );
	const den = g2.add( 1 ).sub( g.mul( 2 ).mul( cosTheta ) );
	return float( 3 / ( 8 * Math.PI ) ).mul( num ).div( g2.mul( 2 ).add( 2 ).mul( den.mul( den.sqrt() ) ) );
} );

/**
 * Lommel-Seeliger reflectance, blended with Lambert.
 *
 * Airless regolith does not scatter like a diffuse sheet: it back-scatters, so
 * a full Moon is more than twice as bright as two half Moons and the limb stays
 * bright instead of rolling off. This is the term that makes the Moon and
 * Mercury read as rock rather than as a shaded ball.
 */
export const regolith = /*#__PURE__*/ Fn( ( [ nDotL, nDotV, blendFactor ] ) => {
	const l = saturate( nDotL );
	const v = saturate( nDotV ).add( 1e-4 );
	const ls = l.mul( 2 ).div( l.add( v ) );          // Lommel-Seeliger, in [0, 2]
	return mix( l, l.mul( ls ).mul( 0.9 ), blendFactor );
} );
