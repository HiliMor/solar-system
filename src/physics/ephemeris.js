import { DEG, TAU, AU_KM, DAYS_PER_CENTURY, GM_SUN, SECONDS_PER_DAY } from '../data/constants.js';
import { elementsToState, makeState, wrapPi, wrapTau } from './kepler.js';

const scratch = makeState();

/**
 * Evaluates the JPL secular element set for a major planet at time `T`
 * (Julian centuries past J2000) and returns heliocentric ecliptic coordinates.
 *
 * Follows Standish's published procedure, including the b/c/s/f correction to
 * the mean anomaly that the outer-planet element set carries.
 *
 * @param {object} el   element block from src/data/planets.js
 * @param {number} T    Julian centuries since J2000
 * @param {object} out  state object from makeState(); position in AU,
 *                      velocity in AU/day
 */
export function planetState( el, T, out = makeState() ) {

	const a = el.a + el.adot * T;
	const e = el.e + el.edot * T;
	const i = ( el.i + el.idot * T ) * DEG;
	const L = ( el.L + el.Ldot * T ) * DEG;
	const lp = ( el.lp + el.lpdot * T ) * DEG;
	const om = ( el.om + el.omdot * T ) * DEG;

	// Argument of perihelion.
	const w = lp - om;

	let M = L - lp;

	// Long-period corrections, present only on Jupiter through Pluto.
	if ( el.b !== undefined ) {
		const fT = ( el.f || 0 ) * T * DEG;
		M += ( el.b * T * T ) * DEG
			+ ( el.c || 0 ) * DEG * Math.cos( fT )
			+ ( el.s || 0 ) * DEG * Math.sin( fT );
	}

	M = wrapPi( M );

	// Mean motion in rad/day, from the third law rather than the L rate so that
	// the velocity stays consistent with the position at any epoch.
	const n = Math.sqrt( GM_SUN / Math.pow( a * AU_KM, 3 ) ) * SECONDS_PER_DAY;

	elementsToState( { a, e, i, om, w, M }, n, out );
	return out;

}

/**
 * Fixed-element propagation, for dwarf planets, comets and satellites: the
 * elements are held at their epoch values and only the mean anomaly advances.
 *
 * @param {object} el  { a, e, i (deg), node (deg), peri (deg), M0 (deg),
 *                       period (in `periodUnit`), epoch (days past J2000),
 *                       nodeDot / periDot (deg per day, optional) }
 * @param {number} days days since J2000
 * @param {number} periodDays orbital period expressed in days
 */
export function fixedElementState( el, days, periodDays, out = makeState() ) {

	const dt = days - ( el.epoch || 0 );
	const n = TAU / periodDays;

	const M = wrapPi( ( el.M0 || 0 ) * DEG + n * dt );
	const om = ( el.node + ( el.nodeDot || 0 ) * dt ) * DEG;
	const w = ( el.peri + ( el.periDot || 0 ) * dt ) * DEG;

	elementsToState( { a: el.a, e: el.e, i: el.i * DEG, om, w, M }, n, out );
	return out;

}

/**
 * Samples one full revolution of an orbit into a flat Float64Array of xyz
 * triples, for drawing the path. Sampling is uniform in *eccentric* anomaly,
 * which puts points where the curvature is -- a highly eccentric comet orbit
 * gets dense coverage at perihelion instead of a visible kink.
 */
export function sampleOrbit( { a, e, i, om, w }, segments = 512 ) {

	const out = new Float64Array( ( segments + 1 ) * 3 );
	const beta = Math.sqrt( Math.max( 1e-12, 1 - e * e ) );

	const cw = Math.cos( w ), sw = Math.sin( w );
	const co = Math.cos( om ), so = Math.sin( om );
	const ci = Math.cos( i ), si = Math.sin( i );

	const m11 = cw * co - sw * so * ci, m12 = - sw * co - cw * so * ci;
	const m21 = cw * so + sw * co * ci, m22 = - sw * so + cw * co * ci;
	const m31 = sw * si, m32 = cw * si;

	for ( let k = 0; k <= segments; k ++ ) {

		const E = ( k / segments ) * TAU;
		const px = a * ( Math.cos( E ) - e );
		const py = a * beta * Math.sin( E );

		out[ k * 3 ] = m11 * px + m12 * py;
		out[ k * 3 + 1 ] = m21 * px + m22 * py;
		out[ k * 3 + 2 ] = m31 * px + m32 * py;

	}

	return out;

}

/** Element block -> the { a, e, i, om, w } an orbit sampler wants, in radians. */
export function orbitShape( body, T = 0 ) {

	if ( body.elements ) {
		const el = body.elements;
		const om = ( el.om + el.omdot * T ) * DEG;
		const lp = ( el.lp + el.lpdot * T ) * DEG;
		return {
			a: el.a + el.adot * T,
			e: el.e + el.edot * T,
			i: ( el.i + el.idot * T ) * DEG,
			om,
			w: lp - om
		};
	}

	return {
		a: body.a,
		e: body.e,
		i: body.i * DEG,
		om: body.node * DEG,
		w: body.peri * DEG
	};

}

/**
 * Rotation state of a body at time `days` past J2000, from its IAU pole and
 * prime-meridian model.
 *
 * @returns {{ raDeg:number, decDeg:number, wRad:number }}
 */
export function rotationState( rot, days ) {

	const T = days / DAYS_PER_CENTURY;

	let raDeg = rot.ra + ( rot.raDot || 0 ) * T;
	let decDeg = rot.dec + ( rot.decDot || 0 ) * T;
	let wDeg = rot.w0 + rot.wdot * days;

	// Some poles carry periodic terms -- Neptune's is driven by the precession
	// of Triton's orbit, and omitting it puts the obliquity half a degree out.
	const p = rot.periodic;
	if ( p ) {
		const N = ( p.argument0 + p.argumentRate * T ) * DEG;
		raDeg += ( p.raAmplitude || 0 ) * Math.sin( N );
		decDeg += ( p.decAmplitude || 0 ) * Math.cos( N );
		wDeg += ( p.wAmplitude || 0 ) * Math.sin( N );
	}

	return { raDeg, decDeg, wRad: wrapTau( wDeg * DEG ) };

}

/** Obliquity of a body's rotation axis to its own orbital plane, in degrees. */
export function axialTiltDeg( poleEcliptic, orbitNormal ) {
	const d = poleEcliptic.x * orbitNormal.x + poleEcliptic.y * orbitNormal.y + poleEcliptic.z * orbitNormal.z;
	return Math.acos( Math.max( -1, Math.min( 1, d ) ) ) / DEG;
}

export { makeState };
