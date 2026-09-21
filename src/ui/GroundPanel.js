import { Vector3 } from 'three';
import { LOCATIONS, locationsFor, STANDABLE } from '../data/locations.js';
import { altAz, compassPoint, formatCoordinates } from '../physics/observer.js';
import { AU_KM } from '../data/constants.js';

const _v = new Vector3();

const el = ( tag, className, text ) => {
	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== undefined ) node.textContent = text;
	return node;
};

/**
 * Controls for standing on a surface: where you are, where you are looking, and
 * what is above the horizon right now.
 */
export function createGroundPanel( app, container ) {

	const root = el( 'section', 'ground-panel' );

	// --- heading readout ----------------------------------------------------
	const heading = el( 'div', 'ground-heading' );
	const compass = el( 'div', 'ground-compass' );
	const detail = el( 'div', 'ground-detail' );
	heading.append( compass, detail );

	// --- where you are ------------------------------------------------------
	const place = el( 'div', 'ground-place' );
	const placeName = el( 'div', 'ground-place-name' );
	const placeCoords = el( 'div', 'ground-place-coords' );
	const placeNote = el( 'p', 'ground-place-note' );
	place.append( placeName, placeCoords, placeNote );

	// --- light level --------------------------------------------------------
	const light = el( 'div', 'ground-light' );
	const lightBar = el( 'div', 'ground-light-bar' );
	const lightFill = el( 'div', 'ground-light-fill' );
	lightBar.appendChild( lightFill );
	const lightLabel = el( 'div', 'ground-light-label' );
	light.append( lightLabel, lightBar );

	// --- what is up ---------------------------------------------------------
	const skyList = el( 'div', 'sky-list' );

	// --- location picker ----------------------------------------------------
	const picker = el( 'div', 'ground-picker' );

	const select = el( 'select', 'ground-select' );
	select.setAttribute( 'aria-label', 'Go to a place' );
	const rebuildPlaces = () => {
		select.replaceChildren();
		const blank = el( 'option', null, 'Go to…' );
		blank.value = '';
		select.appendChild( blank );
		let currentBody = null;
		let group = null;
		for ( const location of LOCATIONS ) {
			if ( location.body !== currentBody ) {
				currentBody = location.body;
				group = document.createElement( 'optgroup' );
				const body = app.system.byId.get( currentBody );
				group.label = body ? body.name : currentBody;
				select.appendChild( group );
			}
			const option = el( 'option', null, location.name );
			option.value = LOCATIONS.indexOf( location );
			group.appendChild( option );
		}
	};
	rebuildPlaces();

	select.addEventListener( 'change', () => {
		if ( select.value === '' ) return;
		const location = LOCATIONS[ Number( select.value ) ];
		app.enterGround( location.body, location.lat, location.lon, location.alt, location.name, location.prominence );
		select.value = '';
	} );

	const here = el( 'button', 'btn', 'Use my location' );
	here.type = 'button';
	here.title = 'Stand where you are, on Earth';
	here.addEventListener( 'click', () => {
		if ( ! navigator.geolocation ) { here.textContent = 'Not available'; return; }
		here.textContent = 'Locating…';
		navigator.geolocation.getCurrentPosition(
			( position ) => {
				const { latitude, longitude, altitude } = position.coords;
				app.enterGround( 'earth', latitude, longitude, altitude || 0, 'Your location' );
				here.textContent = 'Use my location';
			},
			() => { here.textContent = 'Permission denied'; setTimeout( () => { here.textContent = 'Use my location'; }, 2500 ); },
			{ timeout: 8000 }
		);
	} );

	const leave = el( 'button', 'btn btn-primary', 'Back to orbit' );
	leave.type = 'button';
	leave.addEventListener( 'click', () => app.exitGround() );

	picker.append( select, here, leave );

	root.append( heading, place, light, skyList, picker );
	container.appendChild( root );

	// --- per-frame ----------------------------------------------------------

	const rows = new Map();

	function skyRow( id, name ) {
		let row = rows.get( id );
		if ( ! row ) {
			row = {
				el: el( 'button', 'sky-row' ),
				name: el( 'span', 'sky-name', name ),
				pos: el( 'span', 'sky-pos' )
			};
			row.el.type = 'button';
			row.el.append( row.name, row.pos );
			row.el.addEventListener( 'click', () => {
				const body = app.system.byId.get( id );
				if ( ! body ) return;
				_v.copy( body.group.position ).sub( app.observer.frame.position ).normalize();
				app.groundCamera.lookAt( _v );
			} );
			rows.set( id, row );
			skyList.appendChild( row.el );
		}
		return row;
	}

	/** Bodies worth pointing out from a surface, brightest first. */
	const INTERESTING = [ 'sun', 'luna', 'venus', 'jupiter', 'mars', 'saturn', 'mercury', 'uranus', 'neptune' ];

	function update() {

		if ( app.mode !== 'ground' || ! app.observer?.frame ) return;

		const frame = app.observer.frame;
		const h = app.groundCamera.heading;

		compass.textContent = `${ h.compass } ${ h.azimuth.toFixed( 0 ) }°`;
		detail.textContent = `alt ${ h.altitude >= 0 ? '+' : '' }${ h.altitude.toFixed( 1 ) }° · `
			+ ( h.fov < 3 ? `${ h.magnification.toFixed( 0 ) }×` : `${ h.fov.toFixed( 0 ) }° field` );

		const observer = app.observer;
		placeName.textContent = observer.label || app.system.byId.get( observer.bodyId )?.name || '';
		placeCoords.textContent = `${ app.system.byId.get( observer.bodyId )?.name } · `
			+ formatCoordinates( observer.latitude, observer.longitude )
			+ ( observer.altitude ? ` · ${ Math.round( observer.altitude ).toLocaleString( 'en' ) } m` : '' );

		const preset = LOCATIONS.find( ( l ) => l.name === observer.label );
		placeNote.textContent = preset?.note || '';
		placeNote.style.display = preset?.note ? '' : 'none';

		// Light level, which is what makes an eclipse legible as it happens.
		const visible = app.localVisibility ?? 1;
		lightFill.style.width = `${ ( visible * 100 ).toFixed( 1 ) }%`;
		const covered = ( 1 - visible ) * 100;
		lightLabel.textContent = covered < 0.05
			? 'Sun fully visible'
			: covered > 99.95 ? 'TOTALITY — Sun fully covered'
				: `Sun ${ covered.toFixed( 1 ) }% covered`;
		light.classList.toggle( 'is-total', covered > 99.95 );
		light.classList.toggle( 'is-partial', covered > 0.05 && covered <= 99.95 );

		// What is above the horizon, in order of altitude.
		const entries = [];
		for ( const id of INTERESTING ) {
			if ( id === observer.bodyId ) continue;
			const body = app.system.byId.get( id );
			if ( ! body ) continue;
			_v.copy( body.group.position ).sub( frame.position ).normalize();
			const pos = altAz( _v, frame );
			if ( pos.altitude < - 2 ) continue;
			const distance = body.group.position.distanceTo( frame.position );
			const apparent = 2 * Math.atan( body.radiusUnits / Math.max( distance, 1e-9 ) ) * 180 / Math.PI;
			entries.push( { id, name: body.name, ...pos, apparent } );
		}
		entries.sort( ( a, b ) => b.altitude - a.altitude );

		for ( const [ id, row ] of rows ) row.el.hidden = true;
		for ( const entry of entries ) {
			const row = skyRow( entry.id, entry.name );
			row.el.hidden = false;
			row.name.textContent = entry.name;
			row.pos.textContent = `${ compassPoint( entry.azimuth ) } ${ entry.altitude.toFixed( 0 ) }°`
				+ ( entry.apparent > 0.05 ? ` · ${ entry.apparent.toFixed( entry.apparent < 1 ? 2 : 1 ) }° wide` : '' );
			skyList.appendChild( row.el );
		}

	}

	function setVisible( visible ) {
		root.style.display = visible ? '' : 'none';
	}

	setVisible( false );

	return { root, update, setVisible };

}
