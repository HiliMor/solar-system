import { jdToDate, formatDate } from '../physics/time.js';
import { J2000_JD, AU_KM } from '../data/constants.js';
import { LOCATIONS } from '../data/locations.js';
import { EventSearch } from '../core/EventSearch.js';

const el = ( tag, className, text ) => {
	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== undefined ) node.textContent = text;
	return node;
};

const dateOf = ( days ) => jdToDate( days + J2000_JD );

const shortDate = ( days ) => {
	const d = dateOf( days );
	return d.toISOString().slice( 0, 10 );
};

const shortTime = ( days ) => dateOf( days ).toISOString().slice( 11, 16 ) + ' UTC';

function duration( seconds ) {
	if ( seconds < 60 ) return `${ seconds.toFixed( 0 ) }s`;
	return `${ Math.floor( seconds / 60 ) }m ${ String( Math.round( seconds % 60 ) ).padStart( 2, '0' ) }s`;
}

/**
 * The event finder.
 *
 * Every row here is computed on demand from the same ephemeris that draws the
 * scene, not read from a table. Change where you are standing and the eclipse
 * list changes with you.
 */
export function createEventPanel( app, container ) {

	const search = new EventSearch();

	const root = el( 'aside', 'events' );

	const header = el( 'button', 'events-toggle' );
	header.type = 'button';
	header.innerHTML = '<span>Find an event</span>';
	header.addEventListener( 'click', () => root.classList.toggle( 'is-open' ) );

	const body = el( 'div', 'events-body' );

	// --- what to look for ---------------------------------------------------
	const kinds = [
		{ id: 'solar-eclipse', label: 'Solar eclipses', needsObserver: true, years: 60,
			blurb: 'From wherever you are standing.' },
		{ id: 'lunar-eclipse', label: 'Lunar eclipses', years: 25,
			blurb: 'Visible from the whole night side at once.' },
		{ id: 'transit', label: 'Transits of Mercury & Venus', years: 120,
			blurb: 'A planet’s silhouette crossing the Sun.' },
		{ id: 'opposition', label: 'Oppositions', years: 12,
			blurb: 'Closest approach: the best night to look.' },
		{ id: 'shadow-transit', label: 'Moon shadows on Jupiter', years: 0.25,
			blurb: 'A black dot crawling over the cloud tops.' },
		{ id: 'ring-plane-crossing', label: 'Saturn ring-plane crossings', years: 40,
			blurb: 'Twice a Saturnian year the rings vanish.' }
	];

	const kindSelect = el( 'select', 'events-select' );
	kindSelect.setAttribute( 'aria-label', 'Kind of event' );
	for ( const kind of kinds ) {
		const option = el( 'option', null, kind.label );
		option.value = kind.id;
		kindSelect.appendChild( option );
	}

	const blurb = el( 'p', 'events-blurb', kinds[ 0 ].blurb );
	kindSelect.addEventListener( 'change', () => {
		blurb.textContent = kinds.find( ( k ) => k.id === kindSelect.value ).blurb;
		results.replaceChildren();
		status.textContent = '';
	} );

	const fromRow = el( 'div', 'events-row' );
	const fromLabel = el( 'label', 'events-label', 'From' );
	const fromInput = el( 'input', 'date-input' );
	fromInput.type = 'date';
	fromInput.value = new Date().toISOString().slice( 0, 10 );
	fromRow.append( fromLabel, fromInput );

	const go = el( 'button', 'btn btn-primary events-go', 'Search' );
	go.type = 'button';

	const status = el( 'div', 'events-status' );
	const results = el( 'div', 'events-results' );

	body.append( kindSelect, blurb, fromRow, go, status, results );
	root.append( header, body );
	container.appendChild( root );

	// --- rendering results --------------------------------------------------

	function describe( event ) {

		switch ( event.type ) {

			case 'solar-eclipse': {
				const pct = ( event.obscuration * 100 ).toFixed( 1 );
				const main = event.kind === 'total' ? `TOTAL · ${ duration( event.duration ) }`
					: event.kind === 'annular' ? `ANNULAR · ${ duration( event.duration ) }`
						: `${ pct }% covered`;
				return { main, sub: `Sun ${ event.altitude.toFixed( 0 ) }° above the horizon`, strong: event.obscuration > 0.999 };
			}

			case 'lunar-eclipse':
				return {
					main: event.kind === 'total' ? 'TOTAL' : event.kind === 'partial' ? 'Partial' : 'Penumbral',
					sub: event.kind === 'penumbral' ? 'Subtle — a faint shading' : `Umbral magnitude ${ event.magnitude.toFixed( 2 ) }`,
					strong: event.kind === 'total'
				};

			case 'transit':
				return {
					main: `${ event.name } crosses the Sun`,
					sub: event.central ? 'Near-central passage' : `${ ( event.separation / 60 ).toFixed( 1 ) }′ from centre`,
					strong: event.central
				};

			case 'opposition':
				return {
					main: event.name,
					sub: `${ event.distanceAU.toFixed( 3 ) } AU from Earth — closest and brightest`,
					strong: false
				};

			case 'shadow-transit':
				return { main: `${ event.name }’s shadow`, sub: 'Crossing Jupiter’s disc', strong: false };

			case 'ring-plane-crossing':
				return { main: 'Rings edge-on', sub: 'Saturn’s rings all but disappear', strong: true };

			default:
				return { main: event.type, sub: '', strong: false };

		}

	}

	function render( events, kind ) {

		results.replaceChildren();

		if ( ! events.length ) {
			results.appendChild( el( 'p', 'events-empty', 'Nothing found in that span.' ) );
			return;
		}

		for ( const event of events.slice( 0, 40 ) ) {

			const { main, sub, strong } = describe( event );

			const row = el( 'button', `event-row${ strong ? ' is-strong' : '' }` );
			row.type = 'button';

			const when = el( 'div', 'event-when' );
			when.append( el( 'span', 'event-date', shortDate( event.days ) ), el( 'span', 'event-time', shortTime( event.days ) ) );

			const what = el( 'div', 'event-what' );
			what.append( el( 'span', 'event-main', main ), el( 'span', 'event-sub', sub ) );

			row.append( when, what );

			row.addEventListener( 'click', () => goTo( event, kind ) );
			results.appendChild( row );

		}

		if ( events.length > 40 ) {
			results.appendChild( el( 'p', 'events-empty', `… and ${ events.length - 40 } more.` ) );
		}

	}

	/**
	 * Takes you to the event: sets the clock, and for anything you would watch
	 * from the ground, puts you on the ground looking at it.
	 */
	function goTo( event, kind ) {

		app.clock.date = dateOf( event.days );
		app.clock.paused = false;
		app.clock.setRate( 1 / 1440 );                    // a minute a second

		if ( kind.needsObserver || event.type === 'lunar-eclipse' || event.type === 'transit' ) {

			const observer = app.observer || currentObserver();
			if ( app.mode !== 'ground' ) {
				app.enterGround( 'earth', observer.latitude, observer.longitude, observer.altitude, observer.label );
			}
			// Look at whatever the event is about.
			requestAnimationFrame( () => {
				const target = event.type === 'lunar-eclipse' ? 'luna' : 'sun';
				app.lookAtFromGround( target );
			} );

		} else if ( event.body ) {

			app.setFocus( event.body );

		}

		app.emit( 'event-selected', event );

	}

	function currentObserver() {
		if ( app.observer ) return app.observer;
		const luxor = LOCATIONS[ 0 ];
		return { latitude: luxor.lat, longitude: luxor.lon, altitude: luxor.alt, label: luxor.name };
	}

	// --- running a search ---------------------------------------------------

	go.addEventListener( 'click', async () => {

		const kind = kinds.find( ( k ) => k.id === kindSelect.value );
		const observer = currentObserver();

		go.disabled = true;
		results.replaceChildren();
		status.textContent = kind.needsObserver
			? `Searching ${ kind.years } years from ${ observer.label || 'your location' }…`
			: `Searching ${ kind.years >= 1 ? kind.years + ' years' : '3 months' }…`;

		const from = fromInput.value ? new Date( `${ fromInput.value }T00:00:00Z` ) : new Date();

		try {

			const found = await search.run( kind.id, {
				observer: { latitude: observer.latitude, longitude: observer.longitude, altitude: observer.altitude || 0 },
				from, years: kind.years,
				onProgress: ( f ) => { status.textContent = `Searching… ${ ( f * 100 ).toFixed( 0 ) }%`; }
			} );

			status.textContent = `${ found.length } found · computed, not looked up`;
			render( found, kind );

		} catch ( error ) {

			status.textContent = `Search failed: ${ error.message }`;

		} finally {

			go.disabled = false;

		}

	} );

	return {
		root,
		open() { root.classList.add( 'is-open' ); },
		dispose() { search.dispose(); }
	};

}
