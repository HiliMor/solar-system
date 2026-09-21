import { J2000_JD, UNIX_EPOCH_JD, DAY_MS, DAYS_PER_CENTURY } from '../data/constants.js';

export const dateToJD = ( date ) => date.getTime() / DAY_MS + UNIX_EPOCH_JD;
export const jdToDate = ( jd ) => new Date( ( jd - UNIX_EPOCH_JD ) * DAY_MS );

/** Days since the J2000.0 epoch. */
export const jdToJ2000Days = ( jd ) => jd - J2000_JD;
export const dateToJ2000Days = ( date ) => dateToJD( date ) - J2000_JD;

/** Julian centuries since J2000.0. */
export const daysToCenturies = ( days ) => days / DAYS_PER_CENTURY;

/**
 * Simulation clock. Holds the current instant as days since J2000 (float64, so
 * sub-second resolution stays intact even thousands of years out) and advances
 * it by a signed rate expressed in simulated days per real second.
 */
export class SimClock {

	constructor( date = new Date() ) {
		this.days = dateToJ2000Days( date );
		this.rate = 1 / 86400;       // real time
		this.paused = false;
		this.listeners = new Set();
	}

	get date() { return jdToDate( this.days + J2000_JD ); }
	set date( d ) { this.days = dateToJ2000Days( d ); this.emit(); }

	get julianDate() { return this.days + J2000_JD; }

	get centuries() { return daysToCenturies( this.days ); }

	advance( realSeconds ) {
		if ( this.paused || this.rate === 0 ) return;
		this.days += this.rate * realSeconds;
		this.emit();
	}

	setRate( daysPerSecond ) { this.rate = daysPerSecond; this.emit(); }

	now() { this.days = dateToJ2000Days( new Date() ); this.emit(); }

	onChange( fn ) { this.listeners.add( fn ); return () => this.listeners.delete( fn ); }
	emit() { for ( const fn of this.listeners ) fn( this ); }

}

/**
 * Human-readable rate label. The clock rate is in simulated days per real
 * second, which spans fourteen orders of magnitude across the speed slider.
 */
export function formatRate( daysPerSecond ) {

	const s = daysPerSecond * 86400;
	const abs = Math.abs( s );
	const sign = daysPerSecond < 0 ? '-' : '';

	if ( abs === 0 ) return 'paused';
	if ( abs < 60 ) return `${ sign }${ abs.toFixed( abs < 10 ? 2 : 0 ) } s / s`;
	if ( abs < 3600 ) return `${ sign }${ ( abs / 60 ).toFixed( 1 ) } min / s`;
	if ( abs < 86400 ) return `${ sign }${ ( abs / 3600 ).toFixed( 1 ) } hr / s`;
	if ( abs < 86400 * 365.25 ) return `${ sign }${ ( abs / 86400 ).toFixed( abs < 86400 * 10 ? 1 : 0 ) } days / s`;
	return `${ sign }${ ( abs / ( 86400 * 365.25 ) ).toPrecision( 3 ) } years / s`;

}

export function formatDate( date ) {
	const iso = date.toISOString();
	const year = date.getUTCFullYear();
	const prefix = year < 0 ? `${ Math.abs( year ) } BC` : null;
	return prefix
		? `${ prefix }-${ iso.slice( 6, 10 ) } ${ iso.slice( 11, 19 ) } UTC`
		: `${ iso.slice( 0, 10 ) } ${ iso.slice( 11, 19 ) } UTC`;
}
