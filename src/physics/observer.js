import { Vector3, Quaternion } from 'three';
import { DEG, RAD, KM_PER_UNIT } from '../data/constants.js';

/**
 * Standing on a surface.
 *
 * Converts a planetographic latitude/longitude into a position and a local
 * frame -- up, north, east -- in world space, so the camera can be planted on a
 * body and look at the sky from there.
 *
 * The bodies are oblate and it matters: Earth's geodetic and geocentric
 * latitudes differ by up to 11 arcminutes, and on Saturn, flattened by 10%, the
 * difference reaches nearly six degrees. Since an eclipse turns on the
 * arcminute, the ellipsoid is done properly rather than treating everything as
 * a sphere.
 */

const _up = new Vector3();
const _north = new Vector3();
const _east = new Vector3();
const _position = new Vector3();
const _q = new Quaternion();

/**
 * Body-fixed geometry for an observer.
 *
 * The body frame follows the render convention: +Y is the north pole and +X is
 * the prime meridian, with east longitude increasing as a positive rotation
 * about +Y.
 *
 * @param {object} body       a Body, for its radius and flattening
 * @param {number} latDeg     planetographic latitude, degrees north
 * @param {number} lonDeg     east longitude, degrees
 * @param {number} altitudeM  height above the reference ellipsoid, metres
 */
export function observerBodyFixed( body, latDeg, lonDeg, altitudeM = 1.7 ) {

	const a = body.def.radius;                       // equatorial radius, km
	const f = body.def.flattening || 0;
	const eSquared = 2 * f - f * f;

	const lat = latDeg * DEG;
	const lon = lonDeg * DEG;

	const sinLat = Math.sin( lat ), cosLat = Math.cos( lat );
	const sinLon = Math.sin( lon ), cosLon = Math.cos( lon );

	const h = altitudeM / 1000;                      // km

	// Radius of curvature in the prime vertical.
	const N = a / Math.sqrt( 1 - eSquared * sinLat * sinLat );

	const equatorial = ( N + h ) * cosLat;
	const polar = ( N * ( 1 - eSquared ) + h ) * sinLat;

	return {
		/** Position in body-fixed kilometres. */
		position: { x: equatorial * cosLon, y: polar, z: - equatorial * sinLon },
		/** Geodetic normal -- the local vertical, which is not the radius vector. */
		up: { x: cosLat * cosLon, y: sinLat, z: - cosLat * sinLon },
		/** Toward the north pole, tangent to the surface. */
		north: { x: - sinLat * cosLon, y: cosLat, z: sinLat * sinLon },
		/** Toward increasing longitude. */
		east: { x: - sinLon, y: 0, z: - cosLon },
		/** Geometric horizon distance and dip, for sizing the ground. */
		horizonKm: Math.sqrt( Math.max( 2 * a * h + h * h, 1e-9 ) ),
		horizonDip: Math.acos( a / ( a + Math.max( h, 1e-9 ) ) )
	};

}

/**
 * Lifts the body-fixed frame into world space using the body's current
 * orientation, which already carries its IAU pole and rotation phase.
 *
 * @returns {{ position: Vector3, up: Vector3, north: Vector3, east: Vector3 }}
 */
export function observerWorld( body, latDeg, lonDeg, altitudeM, out = {} ) {

	const local = observerBodyFixed( body, latDeg, lonDeg, altitudeM );

	// The pivot carries orientation *and* the render scale; only the rotation is
	// wanted here, because the position is converted from real kilometres.
	body.pivot.getWorldQuaternion( _q );

	out.position = ( out.position || new Vector3() )
		.set( local.position.x, local.position.y, local.position.z )
		.divideScalar( KM_PER_UNIT )
		.applyQuaternion( _q )
		.add( body.group.position );

	out.up = ( out.up || new Vector3() ).copy( local.up ).applyQuaternion( _q ).normalize();
	out.north = ( out.north || new Vector3() ).copy( local.north ).applyQuaternion( _q ).normalize();
	out.east = ( out.east || new Vector3() ).copy( local.east ).applyQuaternion( _q ).normalize();

	out.horizonKm = local.horizonKm;
	out.horizonDip = local.horizonDip;
	out.bodyFixed = local;

	return out;

}

/**
 * World direction -> local altitude and azimuth.
 * Azimuth is measured from north through east, the surveyor's convention.
 */
export function altAz( direction, frame, out = { altitude: 0, azimuth: 0 } ) {

	const alt = Math.asin( Math.max( -1, Math.min( 1, direction.dot( frame.up ) ) ) );
	let az = Math.atan2( direction.dot( frame.east ), direction.dot( frame.north ) );
	if ( az < 0 ) az += Math.PI * 2;

	out.altitude = alt * RAD;
	out.azimuth = az * RAD;
	return out;

}

/** Local altitude and azimuth -> a world direction. */
export function directionFromAltAz( altitudeDeg, azimuthDeg, frame, out = new Vector3() ) {

	const alt = altitudeDeg * DEG;
	const az = azimuthDeg * DEG;
	const cosAlt = Math.cos( alt );

	return out
		.copy( frame.north ).multiplyScalar( cosAlt * Math.cos( az ) )
		.addScaledVector( frame.east, cosAlt * Math.sin( az ) )
		.addScaledVector( frame.up, Math.sin( alt ) )
		.normalize();

}

/** Compass point for an azimuth, for the heading readout. */
const COMPASS = [ 'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW' ];
export const compassPoint = ( azimuthDeg ) => COMPASS[ Math.round( ( ( azimuthDeg % 360 ) + 360 ) % 360 / 22.5 ) % 16 ];

/** Formats a latitude/longitude pair the way a map would. */
export function formatCoordinates( latDeg, lonDeg ) {
	const ns = latDeg >= 0 ? 'N' : 'S';
	const ew = lonDeg >= 0 ? 'E' : 'W';
	return `${ Math.abs( latDeg ).toFixed( 2 ) }°${ ns } ${ Math.abs( lonDeg ).toFixed( 2 ) }°${ ew }`;
}
