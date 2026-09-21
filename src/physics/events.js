import { PLANETS } from '../data/planets.js';
import { MOONS } from '../data/moons.js';
import { planetState, fixedElementState } from './ephemeris.js';
import { moonPosition } from './lunar.js';
import { poleToEcliptic, ICRF_POLE_ECLIPTIC } from './frames.js';
import { rotationState } from './ephemeris.js';
import { observerBodyFixed } from './observer.js';
import { AU_KM, DEG, RAD, SUN_RADIUS_KM, DAYS_PER_CENTURY, DAYS_PER_YEAR } from '../data/constants.js';

/**
 * Finding events, rather than listing them.
 *
 * Most sites that tell you when the next eclipse is are reading a table
 * somebody else computed. This searches the same ephemeris the scene is drawn
 * from: sample a geometric quantity coarsely over the requested span, find its
 * local minima, refine each one by golden-section search, and keep the ones
 * that clear a threshold. Nothing is stored; change the observer and the
 * answers change.
 *
 * The cost of that honesty is that the answers are only as good as the model --
 * which for eclipses means a minute or so, not the second-level precision of a
 * proper canon. Every result carries that caveat.
 */

const EARTH = PLANETS.find( ( p ) => p.id === 'earth' );
const LUNA = MOONS.find( ( m ) => m.id === 'luna' );
const MOON_RADIUS = LUNA.radius;
const EARTH_RADIUS = EARTH.radius;
const MOON_MASS_RATIO = 7.342e22 / ( 5.97237e24 + 7.342e22 );

const vec = () => ( { x: 0, y: 0, z: 0 } );
const sub = ( a, b, out ) => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; };
const dot = ( a, b ) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = ( a ) => Math.hypot( a.x, a.y, a.z );

const _earth = vec(), _moon = vec(), _toSun = vec(), _toMoon = vec(), _tmp = vec();
const _bodyPos = vec(), _obs = vec();

/** Heliocentric position of Earth's centre, in km, accounting for the barycentre. */
function earthPosition( days, out ) {
	const state = planetState( EARTH.elements, days / DAYS_PER_CENTURY );
	const moon = moonPosition( days, _tmp );
	out.x = state.position.x * AU_KM - moon.x * MOON_MASS_RATIO;
	out.y = state.position.y * AU_KM - moon.y * MOON_MASS_RATIO;
	out.z = state.position.z * AU_KM - moon.z * MOON_MASS_RATIO;
	return out;
}

/**
 * Solar eclipse geometry as seen from Earth's centre: how far the centre lies
 * from the Moon's shadow axis, and the two angular radii that decide whether an
 * eclipse is total or annular.
 */
function solarEclipseGeometry( days ) {

	earthPosition( days, _earth );
	moonPosition( days, _moon );                      // geocentric

	_toSun.x = - _earth.x; _toSun.y = - _earth.y; _toSun.z = - _earth.z;
	const sunDistance = len( _toSun );
	const sx = _toSun.x / sunDistance, sy = _toSun.y / sunDistance, sz = _toSun.z / sunDistance;

	const moonDistance = len( _moon );
	const along = _moon.x * sx + _moon.y * sy + _moon.z * sz;

	const px = _moon.x - sx * along, py = _moon.y - sy * along, pz = _moon.z - sz * along;
	const axisOffset = Math.hypot( px, py, pz );

	return {
		axisOffset,
		moonDistance,
		sunDistance,
		moonAngular: Math.asin( Math.min( 1, MOON_RADIUS / moonDistance ) ),
		sunAngular: Math.asin( Math.min( 1, SUN_RADIUS_KM / sunDistance ) ),
		towardSun: along > 0
	};

}

/**
 * Fraction of the Sun's disc hidden from a specific observer, using the same
 * two-disc overlap the shaders use so the number on screen and the number in
 * the search agree.
 */
export function solarObscuration( days, observer ) {

	earthPosition( days, _earth );
	moonPosition( days, _moon );

	// Observer offset from Earth's centre, rotated into the ecliptic frame.
	observerOffset( days, observer, _obs );

	// Vector from the observer to the Sun, and to the Moon.
	_toSun.x = - _earth.x - _obs.x;
	_toSun.y = - _earth.y - _obs.y;
	_toSun.z = - _earth.z - _obs.z;
	sub( _moon, _obs, _toMoon );

	const sunDistance = len( _toSun );
	const sx = _toSun.x / sunDistance, sy = _toSun.y / sunDistance, sz = _toSun.z / sunDistance;

	// Below the horizon means no eclipse to see, whatever the geometry.
	const upDotSun = ( _obs.x * sx + _obs.y * sy + _obs.z * sz ) / Math.max( len( _obs ), 1e-9 );

	const moonDistance = len( _toMoon );
	const along = _toMoon.x * sx + _toMoon.y * sy + _toMoon.z * sz;
	if ( along <= 0 ) return { obscuration: 0, altitude: Math.asin( Math.max( -1, Math.min( 1, upDotSun ) ) ) * RAD };

	const px = _toMoon.x - sx * along, py = _toMoon.y - sy * along, pz = _toMoon.z - sz * along;
	const separation = Math.hypot( px, py, pz ) / along;

	const moonAngular = MOON_RADIUS / moonDistance;
	const sunAngular = SUN_RADIUS_KM / sunDistance;

	return {
		obscuration: discOverlap( separation, moonAngular, sunAngular ),
		altitude: Math.asin( Math.max( -1, Math.min( 1, upDotSun ) ) ) * RAD,
		annular: moonAngular < sunAngular,
		ratio: moonAngular / sunAngular
	};

}

/** Fraction of a disc of radius `rSun` hidden by one of radius `rOcc`, centres `sep` apart. */
function discOverlap( sep, rOcc, rSun ) {

	if ( sep >= rOcc + rSun ) return 0;
	if ( sep <= Math.abs( rOcc - rSun ) ) return Math.min( 1, ( rOcc * rOcc ) / ( rSun * rSun ) );

	// Exact circle-circle intersection area, divided by the Sun's area.
	const d = sep, r = rOcc, R = rSun;
	const a1 = Math.acos( Math.max( -1, Math.min( 1, ( d * d + r * r - R * R ) / ( 2 * d * r ) ) ) );
	const a2 = Math.acos( Math.max( -1, Math.min( 1, ( d * d + R * R - r * r ) / ( 2 * d * R ) ) ) );
	const area = r * r * ( a1 - Math.sin( 2 * a1 ) / 2 ) + R * R * ( a2 - Math.sin( 2 * a2 ) / 2 );
	return Math.min( 1, area / ( Math.PI * R * R ) );

}

/** Observer's offset from Earth's centre, in ecliptic km. */
function observerOffset( days, observer, out ) {

	const local = observerBodyFixed( { def: EARTH }, observer.latitude, observer.longitude, observer.altitude || 0 );
	const state = rotationState( EARTH.rotation, days );

	// Body frame -> ecliptic, via the IAU pole and prime meridian.
	const pole = poleToEcliptic( state.raDeg, state.decDeg, vec() );
	const node = normalise( cross( ICRF_POLE_ECLIPTIC, pole, vec() ) );
	const perp = cross( pole, node, vec() );
	const c = Math.cos( state.wRad ), s = Math.sin( state.wRad );
	const prime = normalise( {
		x: node.x * c + perp.x * s,
		y: node.y * c + perp.y * s,
		z: node.z * c + perp.z * s
	} );
	const east = normalise( cross( pole, prime, vec() ) );

	// local is in the render frame: x = prime meridian, y = pole, z = -east.
	out.x = prime.x * local.position.x + pole.x * local.position.y - east.x * local.position.z;
	out.y = prime.y * local.position.x + pole.y * local.position.y - east.y * local.position.z;
	out.z = prime.z * local.position.x + pole.z * local.position.y - east.z * local.position.z;
	return out;

}

function cross( a, b, out ) {
	const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
	out.x = x; out.y = y; out.z = z; return out;
}
function normalise( v ) {
	const l = Math.hypot( v.x, v.y, v.z ) || 1;
	v.x /= l; v.y /= l; v.z /= l; return v;
}

/**
 * Golden-section search for the minimum of `f` on [a, b]. Used to sharpen a
 * coarse sample into an event time; the quantities here are smooth and
 * unimodal near an event, which is exactly what this wants.
 */
function refineMinimum( f, a, b, iterations = 60 ) {
	const phi = ( Math.sqrt( 5 ) - 1 ) / 2;
	let c = b - phi * ( b - a ), d = a + phi * ( b - a );
	let fc = f( c ), fd = f( d );
	for ( let i = 0; i < iterations; i ++ ) {
		if ( fc < fd ) { b = d; d = c; fd = fc; c = b - phi * ( b - a ); fc = f( c ); }
		else { a = c; c = d; fc = fd; d = a + phi * ( b - a ); fd = f( d ); }
	}
	return ( a + b ) / 2;
}

/**
 * Scans `metric` over a span and returns the refined times of its local minima.
 *
 * @param {(days:number)=>number} metric  smaller means closer to an event
 * @param {number} start  days past J2000
 * @param {number} end
 * @param {number} step   coarse sample spacing, days
 */
export function findMinima( metric, start, end, step ) {

	const results = [];
	let previous = metric( start );
	let current = metric( start + step );

	for ( let t = start + step; t < end - step; t += step ) {

		const next = metric( t + step );

		if ( current < previous && current <= next ) {
			const refined = refineMinimum( metric, t - step, t + step );
			results.push( { days: refined, value: metric( refined ) } );
		}

		previous = current;
		current = next;

	}

	return results;

}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Solar eclipses visible from a given place on Earth.
 *
 * Two passes: a coarse global scan for any eclipse at all -- the shadow axis
 * passing near Earth's centre, which is cheap -- and then, for each candidate,
 * a fine search for the moment of greatest obscuration at the observer.
 */
export function findSolarEclipses( observer, startDays, endDays, onProgress ) {

	const globalMetric = ( d ) => {
		const g = solarEclipseGeometry( d );
		return g.towardSun ? g.axisOffset : 1e9;
	};

	// Six hours is comfortably finer than the ~36 hour spacing of new moons.
	const candidates = findMinima( globalMetric, startDays, endDays, 0.25 );

	const events = [];

	for ( let i = 0; i < candidates.length; i ++ ) {

		const candidate = candidates[ i ];
		onProgress?.( i / candidates.length );

		// The shadow has to reach Earth at all.
		if ( candidate.value > EARTH_RADIUS + 2000 ) continue;

		// Now maximise obscuration for this observer, within half a day.
		const local = ( d ) => 1 - solarObscuration( d, observer ).obscuration;
		const peak = refineMinimum( local, candidate.days - 0.25, candidate.days + 0.25, 80 );

		const detail = solarObscuration( peak, observer );
		if ( detail.obscuration < 0.002 || detail.altitude < 0 ) continue;

		const geometry = solarEclipseGeometry( peak );

		events.push( {
			type: 'solar-eclipse',
			days: peak,
			obscuration: detail.obscuration,
			altitude: detail.altitude,
			annular: detail.annular,
			ratio: detail.ratio,
			kind: detail.obscuration > 0.999
				? ( detail.annular ? 'annular' : 'total' )
				: detail.obscuration > 0.9 ? 'deep partial' : 'partial',
			// Duration of totality or annularity at the observer, if any.
			duration: detail.obscuration > 0.999
				? measureTotality( observer, peak )
				: 0,
			globalKind: geometry.moonAngular > geometry.sunAngular ? 'total' : 'annular'
		} );

	}

	return events;

}

/** Seconds for which the Sun stays fully covered at the observer. */
function measureTotality( observer, peakDays ) {
	const covered = ( d ) => solarObscuration( d, observer ).obscuration > 0.999;
	let lo = peakDays, hi = peakDays + 0.01;
	for ( let i = 0; i < 40; i ++ ) { const m = ( lo + hi ) / 2; if ( covered( m ) ) lo = m; else hi = m; }
	const end = lo;
	lo = peakDays - 0.01; hi = peakDays;
	for ( let i = 0; i < 40; i ++ ) { const m = ( lo + hi ) / 2; if ( covered( m ) ) hi = m; else lo = m; }
	return Math.max( 0, ( end - hi ) * 86400 );
}

/**
 * Lunar eclipses: the Moon passing through Earth's shadow. Visible from the
 * whole night side at once, so there is no observer dependence beyond whether
 * the Moon happens to be up.
 */
export function findLunarEclipses( startDays, endDays ) {

	const metric = ( d ) => {
		earthPosition( d, _earth );
		moonPosition( d, _moon );
		// Distance of the Moon from the anti-solar axis.
		const antiSun = normalise( { x: _earth.x, y: _earth.y, z: _earth.z } );
		const along = dot( _moon, antiSun );
		if ( along <= 0 ) return 1e9;
		const px = _moon.x - antiSun.x * along;
		const py = _moon.y - antiSun.y * along;
		const pz = _moon.z - antiSun.z * along;
		return Math.hypot( px, py, pz );
	};

	const events = [];

	for ( const candidate of findMinima( metric, startDays, endDays, 0.25 ) ) {

		earthPosition( candidate.days, _earth );
		moonPosition( candidate.days, _moon );

		const sunDistance = len( _earth );
		const moonDistance = len( _moon );

		// Umbra radius at the Moon's distance, from similar triangles.
		const penumbraAngle = ( SUN_RADIUS_KM + EARTH_RADIUS ) / sunDistance;
		const umbraAngle = ( SUN_RADIUS_KM - EARTH_RADIUS ) / sunDistance;
		const umbraRadius = EARTH_RADIUS - umbraAngle * moonDistance;
		const penumbraRadius = EARTH_RADIUS + penumbraAngle * moonDistance;

		const offset = candidate.value;
		if ( offset > penumbraRadius + MOON_RADIUS ) continue;

		const kind = offset + MOON_RADIUS < umbraRadius ? 'total'
			: offset - MOON_RADIUS < umbraRadius ? 'partial'
				: 'penumbral';

		events.push( {
			type: 'lunar-eclipse', days: candidate.days, kind,
			magnitude: ( umbraRadius + MOON_RADIUS - offset ) / ( 2 * MOON_RADIUS )
		} );

	}

	return events;

}

/**
 * Transits of Mercury and Venus across the Sun's disc, as seen from Earth.
 * Rare, and among the few events an amateur can watch a planet's silhouette in.
 */
export function findTransits( startDays, endDays ) {

	const events = [];

	for ( const id of [ 'mercury', 'venus' ] ) {

		const planet = PLANETS.find( ( p ) => p.id === id );

		const metric = ( d ) => {
			earthPosition( d, _earth );
			const state = planetState( planet.elements, d / DAYS_PER_CENTURY );
			_bodyPos.x = state.position.x * AU_KM; _bodyPos.y = state.position.y * AU_KM; _bodyPos.z = state.position.z * AU_KM;
			sub( _bodyPos, _earth, _toMoon );                  // Earth -> planet
			_toSun.x = - _earth.x; _toSun.y = - _earth.y; _toSun.z = - _earth.z;
			const sunDistance = len( _toSun );
			const sx = _toSun.x / sunDistance, sy = _toSun.y / sunDistance, sz = _toSun.z / sunDistance;
			const along = dot( _toMoon, { x: sx, y: sy, z: sz } );

			// The planet has to be between Earth and the Sun. Without this, every
			// superior conjunction -- the planet passing behind the Sun, at very
			// nearly the same place on the sky -- is reported as a transit.
			if ( along <= 0 || along >= sunDistance ) return 1e9;

			const px = _toMoon.x - sx * along, py = _toMoon.y - sy * along, pz = _toMoon.z - sz * along;
			return Math.hypot( px, py, pz ) / along;           // angular separation
		};

		for ( const candidate of findMinima( metric, startDays, endDays, 0.5 ) ) {

			earthPosition( candidate.days, _earth );
			const sunAngular = SUN_RADIUS_KM / len( _earth );
			if ( candidate.value > sunAngular ) continue;

			events.push( {
				type: 'transit', body: id, name: planet.name,
				days: candidate.days,
				separation: candidate.value * RAD * 3600,
				central: candidate.value < sunAngular * 0.15
			} );

		}

	}

	return events;

}

/**
 * Oppositions: a planet opposite the Sun in the sky, so it rises at sunset, is
 * closest to Earth, and is at its brightest. The best night to look at it.
 */
export function findOppositions( startDays, endDays ) {

	const events = [];

	for ( const planet of PLANETS ) {

		if ( planet.id === 'mercury' || planet.id === 'venus' || planet.id === 'earth' ) continue;

		// Minimise the Earth-planet distance: for an outer planet that is
		// opposition, and it avoids any angle wrapping.
		const metric = ( d ) => {
			earthPosition( d, _earth );
			const state = planetState( planet.elements, d / DAYS_PER_CENTURY );
			return Math.hypot(
				state.position.x * AU_KM - _earth.x,
				state.position.y * AU_KM - _earth.y,
				state.position.z * AU_KM - _earth.z
			);
		};

		const step = planet.id === 'mars' ? 5 : 10;

		for ( const candidate of findMinima( metric, startDays, endDays, step ) ) {
			events.push( {
				type: 'opposition', body: planet.id, name: planet.name,
				days: candidate.days,
				distanceAU: candidate.value / AU_KM
			} );
		}

	}

	return events;

}

/**
 * Shadow transits of the Galilean moons across Jupiter -- a black dot crawling
 * over the cloud tops, and one of the few things a small telescope shows
 * changing in real time.
 */
export function findJovianShadowTransits( startDays, endDays ) {

	const jupiter = PLANETS.find( ( p ) => p.id === 'jupiter' );
	const moons = MOONS.filter( ( m ) => m.parent === 'jupiter' && m.radius > 1000 );
	const events = [];

	const jupiterPos = vec(), moonPos = vec();

	for ( const moon of moons ) {

		const metric = ( d ) => {
			const state = planetState( jupiter.elements, d / DAYS_PER_CENTURY );
			jupiterPos.x = state.position.x * AU_KM; jupiterPos.y = state.position.y * AU_KM; jupiterPos.z = state.position.z * AU_KM;
			const rel = fixedElementState( moon, d, moon.period );
			// Satellite elements are in the parent's equatorial frame; for this
			// test the small inclination difference does not matter.
			moonPos.x = jupiterPos.x + rel.position.x;
			moonPos.y = jupiterPos.y + rel.position.y;
			moonPos.z = jupiterPos.z + rel.position.z;
			// Is the moon between the Sun and Jupiter?
			const sunDir = normalise( { x: - moonPos.x, y: - moonPos.y, z: - moonPos.z } );
			sub( jupiterPos, moonPos, _tmp );
			const along = dot( _tmp, sunDir );
			if ( along <= 0 ) return 1e9;
			const px = _tmp.x - sunDir.x * along, py = _tmp.y - sunDir.y * along, pz = _tmp.z - sunDir.z * along;
			return Math.hypot( px, py, pz );
		};

		for ( const candidate of findMinima( metric, startDays, endDays, 0.05 ) ) {
			if ( candidate.value > jupiter.radius ) continue;
			events.push( {
				type: 'shadow-transit', body: moon.id, name: moon.name,
				days: candidate.days,
				offset: candidate.value / jupiter.radius
			} );
		}

	}

	return events;

}

/**
 * Saturn's ring-plane crossings: twice a Saturnian year the rings turn edge-on
 * to Earth and effectively vanish.
 */
export function findRingPlaneCrossings( startDays, endDays ) {

	const saturn = PLANETS.find( ( p ) => p.id === 'saturn' );
	const events = [];
	const saturnPos = vec();

	const metric = ( d ) => {
		earthPosition( d, _earth );
		const state = planetState( saturn.elements, d / DAYS_PER_CENTURY );
		saturnPos.x = state.position.x * AU_KM; saturnPos.y = state.position.y * AU_KM; saturnPos.z = state.position.z * AU_KM;
		const rot = rotationState( saturn.rotation, d );
		const pole = poleToEcliptic( rot.raDeg, rot.decDeg, vec() );
		sub( _earth, saturnPos, _tmp );
		normalise( _tmp );
		return Math.abs( dot( _tmp, pole ) );       // 0 exactly edge-on
	};

	for ( const candidate of findMinima( metric, startDays, endDays, 20 ) ) {
		if ( candidate.value > 0.004 ) continue;
		events.push( {
			type: 'ring-plane-crossing', body: 'saturn', name: 'Saturn',
			days: candidate.days,
			tilt: Math.asin( candidate.value ) * RAD
		} );
	}

	return events;

}
