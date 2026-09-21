import { TAU } from '../data/constants.js';

/** Wraps an angle in radians to [-pi, pi). */
export function wrapPi( x ) {
	let a = ( x + Math.PI ) % TAU;
	if ( a < 0 ) a += TAU;
	return a - Math.PI;
}

/** Wraps an angle in radians to [0, 2pi). */
export function wrapTau( x ) {
	const a = x % TAU;
	return a < 0 ? a + TAU : a;
}

/**
 * Solves Kepler's equation M = E - e sin E for the eccentric anomaly.
 *
 * Newton-Raphson from a starting guess that stays well-behaved for the near-
 * parabolic comets in this scene (Hale-Bopp is at e = 0.995). The guess is
 * Danby's; it converges in three or four iterations across the whole range.
 */
export function solveKepler( M, e, tolerance = 1e-12 ) {

	const m = wrapPi( M );

	let E = m + 0.85 * e * Math.sign( Math.sin( m ) || 1 );

	for ( let i = 0; i < 30; i ++ ) {

		const sinE = Math.sin( E );
		const cosE = Math.cos( E );
		const f = E - e * sinE - m;
		const fp = 1 - e * cosE;
		const fpp = e * sinE;

		// Halley's method: one extra derivative buys a lot at high eccentricity.
		const d = f / ( fp - 0.5 * f * fpp / fp );
		E -= d;

		if ( Math.abs( d ) < tolerance ) break;

	}

	return E;

}

/**
 * Orbital elements -> position and velocity in the reference plane of the
 * elements (x toward the reference direction, z toward the orbit-normal pole).
 *
 * @param {object} el  { a, e, i, om (longitude of ascending node), w (argument
 *                       of periapsis), M (mean anomaly) } -- a in whatever
 *                       length unit you want out, angles in radians.
 * @param {number} gmOverA3 sqrt(GM/a^3), i.e. mean motion, in 1/time. Pass 0 if
 *                       you do not need velocity.
 * @param {object} out  { position: {x,y,z}, velocity: {x,y,z}, trueAnomaly, r }
 */
export function elementsToState( el, meanMotion, out ) {

	const { a, e, i, om, w, M } = el;

	const E = solveKepler( M, e );
	const cosE = Math.cos( E );
	const sinE = Math.sin( E );
	const beta = Math.sqrt( Math.max( 1e-12, 1 - e * e ) );

	// Perifocal coordinates.
	const px = a * ( cosE - e );
	const py = a * beta * sinE;
	const r = a * ( 1 - e * cosE );

	// Perifocal velocity.
	const vFactor = meanMotion * a / ( 1 - e * cosE );
	const vx = - vFactor * sinE;
	const vy = vFactor * beta * cosE;

	const cw = Math.cos( w ), sw = Math.sin( w );
	const co = Math.cos( om ), so = Math.sin( om );
	const ci = Math.cos( i ), si = Math.sin( i );

	// Rotation R_z(om) R_x(i) R_z(w), written out.
	const m11 = cw * co - sw * so * ci;
	const m12 = - sw * co - cw * so * ci;
	const m21 = cw * so + sw * co * ci;
	const m22 = - sw * so + cw * co * ci;
	const m31 = sw * si;
	const m32 = cw * si;

	out.position.x = m11 * px + m12 * py;
	out.position.y = m21 * px + m22 * py;
	out.position.z = m31 * px + m32 * py;

	out.velocity.x = m11 * vx + m12 * vy;
	out.velocity.y = m21 * vx + m22 * vy;
	out.velocity.z = m31 * vx + m32 * vy;

	out.r = r;
	out.trueAnomaly = Math.atan2( beta * sinE, cosE - e );
	// Orbit paths are sampled uniformly in eccentric anomaly, so that is the
	// parameter the "where is the body along this path" marker needs.
	out.eccentricAnomaly = E;

	return out;

}

export function makeState() {
	return {
		position: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		r: 0, trueAnomaly: 0, eccentricAnomaly: 0
	};
}

/** Mean motion in rad/day from a period in days. */
export const meanMotionFromPeriod = ( periodDays ) => TAU / periodDays;
