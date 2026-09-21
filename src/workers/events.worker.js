import * as events from '../physics/events.js';
import { dateToJ2000Days } from '../physics/time.js';

/**
 * Event search, off the main thread.
 *
 * A fifty-year sweep for solar eclipses is a few hundred milliseconds of solid
 * arithmetic. That is not long, but it is long enough to drop frames, and the
 * scene is still turning while someone waits for an answer.
 */

self.onmessage = ( message ) => {

	const { id, kind, observer, startDays, endDays } = message.data;

	try {

		let results = [];

		switch ( kind ) {

			case 'solar-eclipse':
				results = events.findSolarEclipses( observer, startDays, endDays,
					( fraction ) => self.postMessage( { id, progress: fraction } ) );
				break;

			case 'lunar-eclipse':
				results = events.findLunarEclipses( startDays, endDays );
				break;

			case 'transit':
				results = events.findTransits( startDays, endDays );
				break;

			case 'opposition':
				results = events.findOppositions( startDays, endDays );
				break;

			case 'shadow-transit':
				results = events.findJovianShadowTransits( startDays, endDays );
				break;

			case 'ring-plane-crossing':
				results = events.findRingPlaneCrossings( startDays, endDays );
				break;

			default:
				throw new Error( `unknown search: ${ kind }` );

		}

		results.sort( ( a, b ) => a.days - b.days );
		self.postMessage( { id, results } );

	} catch ( error ) {

		self.postMessage( { id, error: error.message } );

	}

};
