import { OBLIQUITY, DEG } from '../data/constants.js';

const COS_EPS = Math.cos( OBLIQUITY );
const SIN_EPS = Math.sin( OBLIQUITY );

/**
 * The simulation works in the J2000 ecliptic frame: +X toward the vernal
 * equinox, +Z toward the ecliptic north pole. three.js is Y-up, so the render
 * layer maps (x, y, z) -> (x, z, -y). That is a -90 degree rotation about X:
 * handedness is preserved and no mirroring sneaks in.
 */
export function eclipticToScene( v, out ) {
	const { x, y, z } = v;
	out.set( x, z, - y );
	return out;
}

/** Inverse of {@link eclipticToScene}, for turning a picked ray back into ecliptic space. */
export function sceneToEcliptic( v, out ) {
	out.x = v.x;
	out.y = - v.z;
	out.z = v.y;
	return out;
}

/** ICRF/equatorial unit vector -> ecliptic. */
export function equatorialToEcliptic( x, y, z, out ) {
	out.x = x;
	out.y = y * COS_EPS + z * SIN_EPS;
	out.z = - y * SIN_EPS + z * COS_EPS;
	return out;
}

/** ICRF north pole expressed in ecliptic coordinates. */
export const ICRF_POLE_ECLIPTIC = Object.freeze( { x: 0, y: SIN_EPS, z: COS_EPS } );

/**
 * IAU right ascension / declination of a body's north pole -> unit vector in
 * the ecliptic frame.
 */
export function poleToEcliptic( raDeg, decDeg, out ) {
	const a = raDeg * DEG, d = decDeg * DEG;
	const cd = Math.cos( d );
	return equatorialToEcliptic( cd * Math.cos( a ), cd * Math.sin( a ), Math.sin( d ), out );
}
