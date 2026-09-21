import { DEG, DAYS_PER_CENTURY } from '../data/constants.js';

/**
 * The Moon's position, from the abridged ELP-2000/82 series (Meeus,
 * *Astronomical Algorithms*, ch. 47).
 *
 * Every other satellite in this scene is fine as a precessing ellipse. The Moon
 * is not, and it is the one place where that matters: the Sun pulls it around
 * hard enough that its true longitude departs from a Keplerian orbit by well
 * over a degree. Evection alone is 1.27 degrees, the variation another 0.66.
 *
 * A degree is nothing to look at -- but the Moon's disc is half a degree wide,
 * so a purely Keplerian Moon misses every solar eclipse in history. With these
 * terms the shadow lands where it actually landed.
 *
 * Accuracy here is roughly 10 arcseconds in longitude and a few kilometres in
 * distance over 1900-2100, degrading gracefully outside that.
 */

/** D, M, M', F, coefficient of sin for longitude (1e-6 deg), cos for distance (1e-3 km). */
const LONGITUDE_TERMS = [
	[ 0, 0, 1, 0, 6288774, -20905355 ],
	[ 2, 0, -1, 0, 1274027, -3699111 ],
	[ 2, 0, 0, 0, 658314, -2955968 ],
	[ 0, 0, 2, 0, 213618, -569925 ],
	[ 0, 1, 0, 0, -185116, 48888 ],
	[ 0, 0, 0, 2, -114332, -3149 ],
	[ 2, 0, -2, 0, 58793, 246158 ],
	[ 2, -1, -1, 0, 57066, -152138 ],
	[ 2, 0, 1, 0, 53322, -170733 ],
	[ 2, -1, 0, 0, 45758, -204586 ],
	[ 0, 1, -1, 0, -40923, -129620 ],
	[ 1, 0, 0, 0, -34720, 108743 ],
	[ 0, 1, 1, 0, -30383, 104755 ],
	[ 2, 0, 0, -2, 15327, 10321 ],
	[ 0, 0, 1, 2, -12528, 0 ],
	[ 0, 0, 1, -2, 10980, 79661 ],
	[ 4, 0, -1, 0, 10675, -34782 ],
	[ 0, 0, 3, 0, 10034, -23210 ],
	[ 4, 0, -2, 0, 8548, -21636 ],
	[ 2, 1, -1, 0, -7888, 24208 ],
	[ 2, 1, 0, 0, -6766, 30824 ],
	[ 1, 0, -1, 0, -5163, -8379 ],
	[ 1, 1, 0, 0, 4987, -16675 ],
	[ 2, -1, 1, 0, 4036, -12831 ],
	[ 2, 0, 2, 0, 3994, -10445 ],
	[ 4, 0, 0, 0, 3861, -11650 ],
	[ 2, 0, -3, 0, 3665, 14403 ],
	[ 0, 1, -2, 0, -2689, -7003 ],
	[ 2, 0, -1, 2, -2602, 0 ],
	[ 2, -1, -2, 0, 2390, 10056 ],
	[ 1, 0, 1, 0, -2348, 6322 ],
	[ 2, -2, 0, 0, 2236, -9884 ],
	[ 0, 1, 2, 0, -2120, 5751 ],
	[ 0, 2, 0, 0, -2069, 0 ],
	[ 2, -2, -1, 0, 2048, -4950 ],
	[ 2, 0, 1, -2, -1773, 4130 ],
	[ 2, 0, 0, 2, -1595, 0 ],
	[ 4, -1, -1, 0, 1215, -3958 ],
	[ 0, 0, 2, 2, -1110, 0 ],
	[ 3, 0, -1, 0, -892, 3258 ],
	[ 2, 1, 1, 0, -810, 2616 ],
	[ 4, -1, -2, 0, 759, -1897 ],
	[ 0, 2, -1, 0, -713, -2117 ],
	[ 2, 2, -1, 0, -700, 2354 ],
	[ 2, 1, -2, 0, 691, 0 ],
	[ 2, -1, 0, -2, 596, 0 ],
	[ 4, 0, 1, 0, 549, -1423 ],
	[ 0, 0, 4, 0, 537, -1117 ],
	[ 4, -1, 0, 0, 520, -1571 ],
	[ 1, 0, -2, 0, -487, -1739 ],
	[ 2, 1, 0, -2, -399, 0 ],
	[ 0, 0, 2, -2, -381, -4421 ],
	[ 1, 1, 1, 0, 351, 0 ],
	[ 3, 0, -2, 0, -340, 0 ],
	[ 4, 0, -3, 0, 330, 0 ],
	[ 2, -1, 2, 0, 327, 0 ],
	[ 0, 2, 1, 0, -323, 1165 ],
	[ 1, 1, -1, 0, 299, 0 ],
	[ 2, 0, 3, 0, 294, 0 ],
	[ 2, 0, -1, -2, 0, 8752 ]
];

/** D, M, M', F, coefficient of sin for latitude (1e-6 deg). */
const LATITUDE_TERMS = [
	[ 0, 0, 0, 1, 5128122 ],
	[ 0, 0, 1, 1, 280602 ],
	[ 0, 0, 1, -1, 277693 ],
	[ 2, 0, 0, -1, 173237 ],
	[ 2, 0, -1, 1, 55413 ],
	[ 2, 0, -1, -1, 46271 ],
	[ 2, 0, 0, 1, 32573 ],
	[ 0, 0, 2, 1, 17198 ],
	[ 2, 0, 1, -1, 9266 ],
	[ 0, 0, 2, -1, 8822 ],
	[ 2, -1, 0, -1, 8216 ],
	[ 2, 0, -2, -1, 4324 ],
	[ 2, 0, 1, 1, 4200 ],
	[ 2, 1, 0, -1, -3359 ],
	[ 2, -1, -1, 1, 2463 ],
	[ 2, -1, 0, 1, 2211 ],
	[ 2, -1, -1, -1, 2065 ],
	[ 0, 1, -1, -1, -1870 ],
	[ 4, 0, -1, -1, 1828 ],
	[ 0, 1, 0, 1, -1794 ],
	[ 0, 0, 0, 3, -1749 ],
	[ 0, 1, -1, 1, -1565 ],
	[ 1, 0, 0, 1, -1491 ],
	[ 0, 1, 1, 1, -1475 ],
	[ 0, 1, 1, -1, -1410 ],
	[ 0, 1, 0, -1, -1344 ],
	[ 1, 0, 0, -1, -1335 ],
	[ 0, 0, 3, 1, 1107 ],
	[ 4, 0, 0, -1, 1021 ],
	[ 4, 0, -1, 1, 833 ],
	[ 0, 0, 1, -3, 777 ],
	[ 4, 0, -2, 1, 671 ],
	[ 2, 0, 0, -3, 607 ],
	[ 2, 0, 2, -1, 596 ],
	[ 2, -1, 1, -1, 491 ],
	[ 2, 0, -2, 1, -451 ],
	[ 0, 0, 3, -1, 439 ],
	[ 2, 0, 2, 1, 422 ],
	[ 2, 0, -3, -1, 421 ],
	[ 2, 1, -1, 1, -366 ],
	[ 2, 1, 0, 1, -351 ],
	[ 4, 0, 0, 1, 331 ],
	[ 2, -1, 1, 1, 315 ],
	[ 2, -2, 0, -1, 302 ],
	[ 0, 0, 1, 3, -283 ],
	[ 2, 1, 1, -1, -229 ],
	[ 1, 1, 0, -1, 223 ],
	[ 1, 1, 0, 1, 223 ],
	[ 0, 1, -2, -1, -220 ],
	[ 2, 1, -1, -1, -220 ],
	[ 1, 0, 1, 1, -185 ],
	[ 2, -1, -2, -1, 181 ],
	[ 0, 1, 2, 1, -177 ],
	[ 4, 0, -2, -1, 176 ],
	[ 4, -1, -1, -1, 166 ],
	[ 1, 0, 1, -1, -164 ],
	[ 4, 0, 1, -1, 132 ],
	[ 1, 0, -1, -1, -119 ],
	[ 4, -1, 0, -1, 115 ],
	[ 2, -2, 0, 1, 107 ]
];

/** General precession in ecliptic longitude, degrees per Julian century. */
const PRECESSION_PER_CENTURY = 5029.0966 / 3600;

const sind = ( d ) => Math.sin( d * DEG );
const cosd = ( d ) => Math.cos( d * DEG );

/**
 * Geocentric position of the Moon in the J2000 ecliptic frame.
 *
 * @param {number} days days since J2000.0
 * @param {{x:number,y:number,z:number}} out
 * @returns {{x:number,y:number,z:number}} kilometres
 */
export function moonPosition( days, out = { x: 0, y: 0, z: 0 } ) {

	const T = days / DAYS_PER_CENTURY;
	const T2 = T * T, T3 = T2 * T, T4 = T3 * T;

	// Mean arguments, degrees.
	const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
	const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
	const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
	const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
	const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

	const A1 = 119.75 + 131.849 * T;
	const A2 = 53.09 + 479264.290 * T;
	const A3 = 313.45 + 481266.484 * T;

	// Eccentricity of Earth's orbit, which modulates every term containing the
	// Sun's mean anomaly.
	const E = 1 - 0.002516 * T - 0.0000074 * T2;
	const E2 = E * E;

	let sumL = 0, sumR = 0, sumB = 0;

	for ( let i = 0; i < LONGITUDE_TERMS.length; i ++ ) {
		const [ d, m, mp, f, cl, cr ] = LONGITUDE_TERMS[ i ];
		const arg = d * D + m * M + mp * Mp + f * F;
		const damping = m === 0 ? 1 : ( Math.abs( m ) === 1 ? E : E2 );
		sumL += cl * damping * sind( arg );
		sumR += cr * damping * cosd( arg );
	}

	for ( let i = 0; i < LATITUDE_TERMS.length; i ++ ) {
		const [ d, m, mp, f, cb ] = LATITUDE_TERMS[ i ];
		const arg = d * D + m * M + mp * Mp + f * F;
		const damping = m === 0 ? 1 : ( Math.abs( m ) === 1 ? E : E2 );
		sumB += cb * damping * sind( arg );
	}

	// Additive terms from Venus, Jupiter and the flattening of the Earth.
	sumL += 3958 * sind( A1 ) + 1962 * sind( Lp - F ) + 318 * sind( A2 );
	sumB += - 2235 * sind( Lp ) + 382 * sind( A3 ) + 175 * sind( A1 - F )
		+ 175 * sind( A1 + F ) + 127 * sind( Lp - Mp ) - 115 * sind( Lp + Mp );

	// The series is referred to the mean equinox and ecliptic of date; the rest
	// of this simulation works in J2000, so the general precession in longitude
	// is removed.
	const longitude = Lp + sumL / 1e6 - PRECESSION_PER_CENTURY * T;
	const latitude = sumB / 1e6;
	const distance = 385000.56 + sumR / 1000;

	const cosLat = cosd( latitude );
	out.x = distance * cosLat * cosd( longitude );
	out.y = distance * cosLat * sind( longitude );
	out.z = distance * sind( latitude );

	return out;

}

/**
 * Position and velocity. The series has no closed-form derivative, so the
 * velocity comes from a centred difference -- accurate to well under a metre
 * per second, and it is only used to orient the Moon and draw its motion.
 */
export function moonState( days, out ) {

	const h = 0.02;                                   // ~29 minutes
	const a = moonPosition( days - h, { x: 0, y: 0, z: 0 } );
	const b = moonPosition( days + h, { x: 0, y: 0, z: 0 } );

	moonPosition( days, out.position );

	out.velocity.x = ( b.x - a.x ) / ( 2 * h );
	out.velocity.y = ( b.y - a.y ) / ( 2 * h );
	out.velocity.z = ( b.z - a.z ) / ( 2 * h );

	out.r = Math.hypot( out.position.x, out.position.y, out.position.z );

	return out;

}
