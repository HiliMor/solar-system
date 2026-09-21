import { dateToJ2000Days } from '../physics/time.js';
import { DAYS_PER_YEAR } from '../data/constants.js';

/**
 * Front end to the event worker: one search at a time, newest wins.
 */
export class EventSearch {

	constructor() {
		this.worker = new Worker( new URL( '../workers/events.worker.js', import.meta.url ), { type: 'module' } );
		this.pending = new Map();
		this.nextId = 1;

		this.worker.onmessage = ( message ) => {

			const { id, results, error, progress } = message.data;
			const entry = this.pending.get( id );
			if ( ! entry ) return;

			if ( progress !== undefined ) { entry.onProgress?.( progress ); return; }

			this.pending.delete( id );
			if ( error ) entry.reject( new Error( error ) );
			else entry.resolve( results );

		};
	}

	/**
	 * @param {string} kind
	 * @param {object} options { observer, from (Date), years, onProgress }
	 */
	run( kind, { observer, from = new Date(), years = 25, onProgress } = {} ) {

		const id = this.nextId ++;
		const startDays = dateToJ2000Days( from );
		const endDays = startDays + years * DAYS_PER_YEAR;

		return new Promise( ( resolve, reject ) => {
			this.pending.set( id, { resolve, reject, onProgress } );
			this.worker.postMessage( { id, kind, observer, startDays, endDays } );
		} );

	}

	/** Abandons anything in flight; the worker keeps going but nobody is listening. */
	cancelAll() {
		for ( const [ , entry ] of this.pending ) entry.reject( new Error( 'cancelled' ) );
		this.pending.clear();
	}

	dispose() {
		this.worker.terminate();
	}

}
