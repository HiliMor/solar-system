import { PLANETS, SUN } from '../data/planets.js';
import { MOONS } from '../data/moons.js';
import { DWARF_PLANETS, COMETS, SPACECRAFT } from '../data/smallBodies.js';
import { AU_KM, DEG, SUN_RADIUS_KM } from '../data/constants.js';
import { formatDate, formatRate } from '../physics/time.js';
import { Labels } from './Labels.js';
import { createGroundPanel } from './GroundPanel.js';
import { createEventPanel } from './EventPanel.js';
import { STANDABLE, locationsFor } from '../data/locations.js';

/**
 * Time-rate ladder, in simulated days per real second.
 *
 * Logarithmic and hand-chosen rather than a continuous slider: the interesting
 * speeds are landmarks (real time, a day a second, a year a second) and a
 * linear control cannot reach across fourteen orders of magnitude usefully.
 */
const RATES = [
	1 / 86400,          // real time
	1 / 1440,           // 1 min/s
	1 / 144,            // 10 min/s
	1 / 24,             // 1 hour/s
	0.25,               // 6 hours/s
	1,                  // 1 day/s
	7,
	30.4,               // 1 month/s
	182.6,
	365.25,             // 1 year/s
	3652.5,             // 10 years/s
	36525,              // 100 years/s
	365250              // 1000 years/s
];

const SIZE_PRESETS = [ 1, 2, 5, 10, 25, 60, 150 ];

const ORBIT_HELP = `
	<strong>Controls</strong>
	<span>drag \u2014 orbit</span><span>scroll \u2014 zoom</span><span>click \u2014 focus a body</span>
	<span>space \u2014 pause</span><span>, / . \u2014 time rate</span><span>r \u2014 reverse</span>
	<span>n \u2014 now</span><span>/ \u2014 search</span><span>l \u2014 labels</span><span>o \u2014 orbits</span>
	<span>t \u2014 true scale</span><span>h \u2014 hide this</span>`;

const GROUND_HELP = `
	<strong>Looking up</strong>
	<span>drag \u2014 turn your head</span><span>scroll \u2014 zoom, like binoculars</span>
	<span>space \u2014 pause</span><span>, / . \u2014 time rate</span><span>esc \u2014 back to orbit</span>
	<span>h \u2014 hide this</span>`;

const el = ( tag, className, text ) => {
	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== undefined ) node.textContent = text;
	return node;
};

function group( title, ...children ) {
	const section = el( 'section', 'panel-section' );
	if ( title ) section.appendChild( el( 'h3', 'panel-heading', title ) );
	section.append( ...children );
	return section;
}

function toggle( label, initial, onChange, hint ) {
	const wrapper = el( 'label', 'toggle' );
	const input = el( 'input' );
	input.type = 'checkbox';
	input.checked = initial;
	input.addEventListener( 'change', () => onChange( input.checked ) );
	const track = el( 'span', 'toggle-track' );
	const text = el( 'span', 'toggle-label', label );
	wrapper.append( input, track, text );
	if ( hint ) wrapper.title = hint;
	return { root: wrapper, input, set: ( v ) => { input.checked = v; } };
}

function slider( label, { min, max, step, value, format, onInput } ) {
	const wrapper = el( 'div', 'slider' );
	const head = el( 'div', 'slider-head' );
	const name = el( 'span', 'slider-label', label );
	const readout = el( 'span', 'slider-value', format( value ) );
	head.append( name, readout );

	const input = el( 'input' );
	input.type = 'range';
	Object.assign( input, { min, max, step, value } );
	input.addEventListener( 'input', () => {
		const v = parseFloat( input.value );
		readout.textContent = format( v );
		onInput( v );
	} );

	wrapper.append( head, input );
	return { root: wrapper, input, readout, set: ( v ) => { input.value = v; readout.textContent = format( v ); } };
}

/**
 * Builds the whole interface and binds it to the app.
 */
export function mountUI( app, container ) {

	container.classList.add( 'ui-root' );

	const labels = new Labels( app, container );
	app.labels = labels;

	// ------------------------------------------------------------------ HUD
	const hud = el( 'div', 'hud' );

	const clockBox = el( 'div', 'clock' );
	const dateLine = el( 'div', 'clock-date' );
	const rateLine = el( 'div', 'clock-rate' );
	clockBox.append( dateLine, rateLine );

	const transport = el( 'div', 'transport' );

	const makeButton = ( label, title, onClick, className = '' ) => {
		const b = el( 'button', `btn ${ className }`.trim(), label );
		b.type = 'button';
		b.title = title;
		b.addEventListener( 'click', onClick );
		return b;
	};

	// One hour per second: Earth turns once every 24 seconds and the Moon comes
	// round in 11 minutes, so the system is visibly alive without the surface
	// blurring. A day per second -- a full rotation every second -- is too fast
	// to read anything by.
	let rateIndex = 3;
	let direction = 1;

	const applyRate = () => {
		app.clock.setRate( RATES[ rateIndex ] * direction );
		rateLine.textContent = app.clock.paused ? 'paused' : formatRate( app.clock.rate );
		playButton.textContent = app.clock.paused ? '▶' : '❚❚';
		playButton.title = app.clock.paused ? 'Resume (space)' : 'Pause (space)';
	};

	const slower = makeButton( '◀◀', 'Slower (,)', () => { rateIndex = Math.max( 0, rateIndex - 1 ); applyRate(); } );
	const playButton = makeButton( '❚❚', 'Pause (space)', () => { app.clock.paused = ! app.clock.paused; applyRate(); }, 'btn-primary' );
	const faster = makeButton( '▶▶', 'Faster (.)', () => { rateIndex = Math.min( RATES.length - 1, rateIndex + 1 ); applyRate(); } );
	const reverse = makeButton( '↺', 'Reverse time (r)', () => { direction *= -1; reverse.classList.toggle( 'is-active', direction < 0 ); applyRate(); } );
	const nowButton = makeButton( 'Now', 'Jump to the present moment (n)', () => { app.clock.now(); } );

	const dateInput = el( 'input', 'date-input' );
	dateInput.type = 'date';
	dateInput.title = 'Jump to a date';
	dateInput.addEventListener( 'change', () => {
		if ( ! dateInput.value ) return;
		const [ y, m, d ] = dateInput.value.split( '-' ).map( Number );
		app.clock.date = new Date( Date.UTC( y, m - 1, d, 12 ) );
	} );

	transport.append( reverse, slower, playButton, faster, nowButton, dateInput );
	clockBox.appendChild( transport );
	hud.appendChild( clockBox );

	// ------------------------------------------------------- body info panel
	const info = el( 'aside', 'info' );
	const infoName = el( 'h2', 'info-name' );
	const standButton = el( 'button', 'btn btn-stand' );
	standButton.type = 'button';
	standButton.textContent = 'Stand on the surface';
	const infoKind = el( 'div', 'info-kind' );
	const infoNote = el( 'p', 'info-note' );
	const infoLive = el( 'dl', 'info-live' );
	const infoFacts = el( 'dl', 'info-facts' );
	const infoCaveat = el( 'p', 'info-caveat' );
	info.append( infoName, infoKind, standButton, infoLive, infoNote, infoFacts, infoCaveat );

	const KIND_LABEL = {
		star: 'Star', planet: 'Planet', moon: 'Natural satellite',
		dwarf: 'Dwarf planet', comet: 'Comet', spacecraft: 'Spacecraft'
	};

	const defFor = ( id ) => {
		if ( id === 'sun' ) return SUN;
		return PLANETS.find( ( p ) => p.id === id )
			|| MOONS.find( ( m ) => m.id === id )
			|| DWARF_PLANETS.find( ( d ) => d.id === id )
			|| COMETS.find( ( c ) => c.id === id )
			|| SPACECRAFT.find( ( s ) => s.id === id );
	};

	function renderInfo( target ) {

		const def = defFor( target.id ) || target.def || {};

		// Anything solid can be stood on. Where there are named places, the
		// first is offered by name -- it reads better than a pair of numbers.
		const standable = STANDABLE.has( target.id );
		standButton.hidden = ! standable;
		if ( standable ) {
			const places = locationsFor( target.id );
			standButton.textContent = places.length
				? `Stand at ${ places[ 0 ].name }`
				: `Stand on ${ target.name }`;
			standButton.onclick = () => {
				const place = places[ 0 ];
				if ( place ) app.enterGround( place.body, place.lat, place.lon, place.alt, place.name, place.prominence );
				else app.enterGround( target.id, 0, 0, 0, null );
			};
		}

		infoName.textContent = def.name || target.name;

		const parentName = target.parent ? target.parent.name : null;
		infoKind.textContent = parentName
			? `${ KIND_LABEL[ target.kind ] || 'Body' } of ${ parentName }`
			: ( KIND_LABEL[ target.kind || target.type ] || 'Body' );

		infoNote.textContent = def.note || '';
		infoNote.style.display = def.note ? '' : 'none';

		infoFacts.replaceChildren();
		for ( const [ key, value ] of Object.entries( def.facts || {} ) ) {
			infoFacts.append( el( 'dt', null, key ), el( 'dd', null, value ) );
		}

		// Honesty about where the model stops being data.
		const caveats = [];
		if ( target.kind === 'moon' && ! def.texture ) {
			caveats.push( 'Surface is procedural, tuned to the terrain type spacecraft found there — an impression, not imagery.' );
		}
		if ( target.kind === 'spacecraft' ) {
			caveats.push( 'Position extrapolated along the published escape asymptote, not an ephemeris lookup.' );
		}
		if ( target.kind === 'comet' ) {
			caveats.push( 'Fixed-period orbit anchored at a known perihelion; real comets drift by weeks between returns.' );
		}
		if ( target.kind === 'dwarf' && def.a ) {
			caveats.push( 'Osculating elements held fixed at J2000, so accuracy degrades far from that epoch.' );
		}
		infoCaveat.textContent = caveats.join( ' ' );
		infoCaveat.style.display = caveats.length ? '' : 'none';

	}

	function renderLive( target ) {

		infoLive.replaceChildren();

		const rows = [];

		if ( target.distanceFromSunKm ) {
			const au = target.distanceFromSunKm / AU_KM;
			rows.push( [ 'Distance from Sun', au < 0.01
				? `${ ( target.distanceFromSunKm ).toLocaleString( 'en', { maximumFractionDigits: 0 } ) } km`
				: `${ au.toFixed( au < 10 ? 4 : 3 ) } AU` ] );
		}

		if ( target.kind === 'moon' && target.relativePosition ) {
			const r = target.relativePosition;
			rows.push( [ `Distance from ${ target.parent.name }`,
				`${ Math.hypot( r.x, r.y, r.z ).toLocaleString( 'en', { maximumFractionDigits: 0 } ) } km` ] );
		}

		const earth = app.system.byId.get( 'earth' );
		if ( earth && target !== earth && target.truePosition ) {
			const dx = target.truePosition.x - earth.truePosition.x;
			const dy = target.truePosition.y - earth.truePosition.y;
			const dz = target.truePosition.z - earth.truePosition.z;
			const km = Math.hypot( dx, dy, dz );
			rows.push( [ 'Distance from Earth', `${ ( km / AU_KM ).toFixed( 4 ) } AU` ] );
			// Light travel time is the one figure that makes the distances land.
			const minutes = km / 299792.458 / 60;
			rows.push( [ 'Light travel time', minutes < 1
				? `${ ( minutes * 60 ).toFixed( 1 ) } s`
				: minutes < 120 ? `${ minutes.toFixed( 1 ) } min` : `${ ( minutes / 60 ).toFixed( 2 ) } hours` ] );
		}

		if ( target.heliocentricState ) {
			const s = target.heliocentricState;
			const speed = Math.hypot( s.vx, s.vy, s.vz ) * AU_KM / 86400;
			rows.push( [ 'Orbital speed', `${ speed.toFixed( 2 ) } km/s` ] );
		}

		for ( const [ key, value ] of rows ) {
			infoLive.append( el( 'dt', null, key ), el( 'dd', null, value ) );
		}

	}

	// ------------------------------------------------------------ body list
	const nav = el( 'nav', 'bodies' );
	const search = el( 'input', 'search' );
	search.type = 'search';
	search.placeholder = 'Search bodies…  (/)';
	search.setAttribute( 'aria-label', 'Search bodies' );
	nav.appendChild( search );

	const list = el( 'div', 'body-list' );
	nav.appendChild( list );

	const navEntries = [];

	function addNavGroup( title, items ) {
		const heading = el( 'div', 'body-group', title );
		list.appendChild( heading );
		const groupItems = [];
		for ( const item of items ) {
			const button = el( 'button', `body-item body-${ item.kind }` );
			button.type = 'button';
			button.dataset.bodyId = item.id;
			const swatch = el( 'span', 'body-swatch' );
			swatch.style.background = `#${ ( item.color ?? 0x8899aa ).toString( 16 ).padStart( 6, '0' ) }`;
			button.append( swatch, el( 'span', 'body-name', item.name ) );
			if ( item.sub ) button.append( el( 'span', 'body-sub', item.sub ) );
			button.addEventListener( 'click', () => app.setFocus( item.id ) );
			list.appendChild( button );
			const entry = { button, item, heading };
			navEntries.push( entry );
			groupItems.push( entry );
		}
		heading._items = groupItems;
	}

	addNavGroup( 'Star', [ { id: 'sun', name: 'Sun', kind: 'star', color: SUN.color } ] );
	addNavGroup( 'Planets', PLANETS.map( ( p ) => ( { id: p.id, name: p.name, kind: 'planet', color: p.color } ) ) );
	addNavGroup( 'Dwarf planets', DWARF_PLANETS.map( ( d ) => ( { id: d.id, name: d.name, kind: 'dwarf', color: d.color } ) ) );
	addNavGroup( 'Moons', MOONS.map( ( m ) => ( {
		id: m.id, name: m.name, kind: 'moon', color: m.color,
		sub: ( PLANETS.find( ( p ) => p.id === m.parent ) || DWARF_PLANETS.find( ( d ) => d.id === m.parent ) )?.name
	} ) ) );
	addNavGroup( 'Comets', COMETS.map( ( c ) => ( { id: c.id, name: c.name, kind: 'comet', color: 0x8fd0ff } ) ) );
	addNavGroup( 'Spacecraft', SPACECRAFT.map( ( s ) => ( { id: s.id, name: s.name, kind: 'spacecraft', color: s.color } ) ) );

	search.addEventListener( 'input', () => {
		const q = search.value.trim().toLowerCase();
		const seen = new Set();
		for ( const entry of navEntries ) {
			const match = ! q
				|| entry.item.name.toLowerCase().includes( q )
				|| ( entry.item.sub || '' ).toLowerCase().includes( q );
			entry.button.hidden = ! match;
			if ( match ) seen.add( entry.heading );
		}
		for ( const entry of navEntries ) entry.heading.hidden = ! seen.has( entry.heading );
	} );

	search.addEventListener( 'keydown', ( event ) => {
		if ( event.key === 'Enter' ) {
			const first = navEntries.find( ( e ) => ! e.button.hidden );
			if ( first ) { app.setFocus( first.item.id ); search.blur(); }
		}
		if ( event.key === 'Escape' ) { search.value = ''; search.dispatchEvent( new Event( 'input' ) ); search.blur(); }
	} );

	// ------------------------------------------------------------- settings
	const settings = el( 'aside', 'settings' );
	const settingsBody = el( 'div', 'settings-body' );

	const scaleNote = el( 'p', 'panel-note' );

	const scaleSlider = slider( 'Orbit compression', {
		min: 0, max: 1, step: 0.01, value: 1,
		format: ( v ) => v > 0.995 ? 'compressed' : v < 0.005 ? 'true scale' : `${ Math.round( v * 100 ) }%`,
		onInput: ( v ) => { app.setScaleBlend( v ); scaleNote.textContent = app.scale.describe(); }
	} );
	scaleNote.textContent = app.scale.describe();

	const sizeSlider = slider( 'Body size', {
		min: 0, max: SIZE_PRESETS.length - 1, step: 1, value: 0,
		format: ( v ) => SIZE_PRESETS[ v ] === 1 ? 'true' : `×${ SIZE_PRESETS[ v ] }`,
		onInput: ( v ) => app.setBodySize( SIZE_PRESETS[ v ] )
	} );

	const sunSlider = slider( 'Sun size', {
		min: 0.25, max: 4, step: 0.05, value: 1,
		format: ( v ) => `×${ v.toFixed( 2 ) }`,
		onInput: ( v ) => app.setSunSize( v )
	} );

	const exposureSlider = slider( 'Exposure', {
		min: -3, max: 3, step: 0.05, value: 0,
		format: ( v ) => `${ v >= 0 ? '+' : '' }${ v.toFixed( 2 ) } EV`,
		onInput: ( v ) => { app.settings.manualExposure = Math.pow( 2, v ); }
	} );

	const starSlider = slider( 'Starfield', {
		min: 0, max: 2.5, step: 0.05, value: 1,
		format: ( v ) => v === 0 ? 'off' : `×${ v.toFixed( 2 ) }`,
		onInput: ( v ) => { app.settings.starfieldIntensity = v; }
	} );

	const toggles = [
		[ 'orbits', 'Orbit paths', 'Fade in and out with how relevant they are to the current view' ],
		[ 'labels', 'Labels', null ],
		[ 'moons', 'Moons', null ],
		[ 'dwarfs', 'Dwarf planets', null ],
		[ 'comets', 'Comets', null ],
		[ 'belts', 'Asteroid & Kuiper belts', '77,000 bodies, integrated on the GPU' ],
		[ 'spacecraft', 'Spacecraft', null ],
		[ 'rings', 'Ring systems', null ],
		[ 'atmospheres', 'Atmospheres', 'Ray-marched single scattering' ],
		[ 'starfield', 'Milky Way', null ],
		[ 'bloom', 'Bloom', null ]
	];

	const toggleControls = {};
	const toggleRows = toggles.map( ( [ key, label, hint ] ) => {
		const control = toggle( label, app.settings[ key ], ( value ) => {
			app.settings[ key ] = value;
			if ( key === 'labels' ) labels.setEnabled( value );
			app.applyVisibility();
		}, hint );
		toggleControls[ key ] = control;
		return control.root;
	} );

	// --- sound --------------------------------------------------------------
	const audioNote = el( 'p', 'panel-note',
		'Each body sounds a note at periapsis, pitched by its period. The intervals '
		+ 'are the period ratios, so Io, Europa and Ganymede come out two octaves apart.' );

	const audioToggle = toggle( 'Orbital sonification', false, async ( value ) => {
		if ( value ) {
			const ok = await app.audio.enable();
			if ( ! ok ) { audioToggle.set( false ); audioNote.textContent = 'Web Audio is unavailable in this browser.'; }
		} else {
			app.audio.disable();
		}
		volumeSlider.root.classList.toggle( 'is-muted', ! value );
		resonance.disabled = ! value;
	} );

	const volumeSlider = slider( 'Volume', {
		min: 0, max: 1, step: 0.01, value: 0.5,
		format: ( v ) => `${ Math.round( v * 100 ) }%`,
		onInput: ( v ) => app.audio.setVolume( v )
	} );
	volumeSlider.root.classList.add( 'is-muted' );

	const resonance = el( 'button', 'btn', 'Play the Laplace resonance' );
	resonance.type = 'button';
	resonance.disabled = true;
	resonance.addEventListener( 'click', () => {
		const played = app.audio.playLaplaceResonance( app.system );
		if ( played ) {
			resonance.textContent = 'Io · Europa · Ganymede — 1:2:4';
			setTimeout( () => { resonance.textContent = 'Play the Laplace resonance'; }, ( played.duration + 2 ) * 1000 );
		}
	} );

	const autoExposure = toggle( 'Auto exposure', true, ( value ) => {
		app.settings.autoExposure = value;
		exposureSlider.root.classList.toggle( 'is-muted', value );
	}, 'Compensates for the 900x drop in sunlight between Earth and Neptune' );
	exposureSlider.root.classList.add( 'is-muted' );

	const minorLabels = toggle( 'Label minor bodies', true, ( v ) => labels.setShowMinor( v ) );

	// --- credits ------------------------------------------------------------
	// CC BY 4.0 asks for the creator, the licence, a link to the material, and
	// a note of any changes. It is cheap to do properly and the maps are the
	// reason the planets look like themselves.
	const credits = el( 'div', 'credits-block' );
	credits.innerHTML = `
		<p><strong>Surface maps</strong> by
			<a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope</a>,
			licensed <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>,
			built from NASA/JPL-Caltech, USGS and ESA imagery.
			Two maps were converted from TIFF to PNG so browsers can read them; the rest are unaltered.
			Ceres, Eris, Haumea and Makemake are artistic impressions, not survey data.</p>
		<p><strong>Ephemerides</strong> from Standish, JPL/Caltech. <strong>Rotation models</strong> from the
			IAU Working Group, 2015. <strong>Lunar theory</strong> abridged from ELP-2000/82.
			<strong>Physical data</strong> from the NASA planetary fact sheets.</p>
		<p><strong>Engine</strong> <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a>, MIT.
			This project\u2019s own code is MIT.</p>`;

	settingsBody.append(
		group( 'Scale', scaleSlider.root, scaleNote, sizeSlider.root, sunSlider.root ),
		group( 'Show', ...toggleRows, minorLabels.root ),
		group( 'Image', autoExposure.root, exposureSlider.root, starSlider.root ),
		group( 'Sound', audioToggle.root, audioNote, volumeSlider.root, resonance ),
		group( 'Credits', credits )
	);

	const settingsToggle = el( 'button', 'settings-toggle' );
	settingsToggle.type = 'button';
	settingsToggle.textContent = 'Settings';
	settingsToggle.addEventListener( 'click', () => settings.classList.toggle( 'is-open' ) );
	settings.append( settingsToggle, settingsBody );

	// ------------------------------------------------------------- footer
	const footer = el( 'div', 'footer' );
	const stats = el( 'span', 'stats' );
	const credit = el( 'span', 'credit' );
	credit.innerHTML = 'Ephemeris: JPL/Standish · Maps: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope</a> (CC BY 4.0)';
	footer.append( stats, credit );

	const help = el( 'div', 'help' );
	help.innerHTML = `
		<strong>Controls</strong>
		<span>drag — orbit</span><span>scroll — zoom</span><span>click — focus a body</span>
		<span>space — pause</span><span>, / . — time rate</span><span>r — reverse</span>
		<span>n — now</span><span>/ — search</span><span>l — labels</span><span>o — orbits</span>
		<span>t — true scale</span><span>h — hide this</span>`;

	// The info panel and the settings panel share the right-hand column: opening
	// settings shrinks the space available to the info panel rather than
	// covering it up.
	const rightColumn = el( 'div', 'sidebar-right' );
	rightColumn.append( info, settings );

	const groundPanel = createGroundPanel( app, container );
	const eventPanel = createEventPanel( app, container );

	container.append( hud, nav, rightColumn, groundPanel.root, eventPanel.root, footer, help );

	// Standing somewhere is a different activity from circling something, so
	// the interface changes shape rather than just gaining a panel.
	app.on( 'mode', () => {
		const ground = app.mode === 'ground';
		container.classList.toggle( 'is-ground', ground );
		groundPanel.setVisible( ground );
		nav.hidden = ground;
		help.innerHTML = ground ? GROUND_HELP : ORBIT_HELP;
	} );

	// ---------------------------------------------------------------- events
	let pointerMoved = false;
	let downAt = null;

	app.canvas.addEventListener( 'pointerdown', ( e ) => { pointerMoved = false; downAt = [ e.clientX, e.clientY ]; } );
	app.canvas.addEventListener( 'pointermove', ( e ) => {
		if ( downAt && Math.hypot( e.clientX - downAt[ 0 ], e.clientY - downAt[ 1 ] ) > 4 ) pointerMoved = true;
	} );
	app.canvas.addEventListener( 'pointerup', ( e ) => {
		if ( pointerMoved || app.mode === 'ground' ) return;
		const hit = app.pick( e.clientX, e.clientY );
		if ( hit ) app.setFocus( hit.id );
	} );

	window.addEventListener( 'keydown', ( event ) => {

		const typing = document.activeElement && /input|textarea/i.test( document.activeElement.tagName );

		if ( event.key === '/' && ! typing ) { event.preventDefault(); search.focus(); search.select(); return; }
		if ( typing ) return;

		switch ( event.key ) {
			case ' ': event.preventDefault(); app.clock.paused = ! app.clock.paused; applyRate(); break;
			case ',': rateIndex = Math.max( 0, rateIndex - 1 ); applyRate(); break;
			case '.': rateIndex = Math.min( RATES.length - 1, rateIndex + 1 ); applyRate(); break;
			case 'r': direction *= -1; reverse.classList.toggle( 'is-active', direction < 0 ); applyRate(); break;
			case 'n': app.clock.now(); break;
			case 'Escape': if ( app.mode === 'ground' ) app.exitGround(); break;
			case 'l': toggleControls.labels.input.click(); break;
			case 'o': toggleControls.orbits.input.click(); break;
			case 'h': help.classList.toggle( 'is-hidden' ); break;
			case 't': {
				const next = app.scale.blend > 0.5 ? 0 : 1;
				animateScale( next );
				break;
			}
			default: break;
		}

	} );

	/** Cross-fades between the two scale policies rather than snapping. */
	let scaleAnimation = null;
	function animateScale( to ) {
		scaleAnimation = { from: app.scale.blend, to, t: 0 };
	}

	// ---------------------------------------------------------------- frame
	let statsTimer = 0;
	let frames = 0;

	app.on( 'focus', ( target ) => {
		renderInfo( target );
		for ( const entry of navEntries ) {
			entry.button.classList.toggle( 'is-active', entry.item.id === target.id );
		}
		const active = list.querySelector( '.is-active' );
		active?.scrollIntoView( { block: 'nearest' } );
	} );

	app.on( 'frame', ( { dt } ) => {

		if ( scaleAnimation ) {
			scaleAnimation.t = Math.min( 1, scaleAnimation.t + dt / 1.6 );
			const e = scaleAnimation.t < 0.5
				? 4 * scaleAnimation.t ** 3
				: 1 - ( -2 * scaleAnimation.t + 2 ) ** 3 / 2;
			const v = scaleAnimation.from + ( scaleAnimation.to - scaleAnimation.from ) * e;
			app.setScaleBlend( v );
			scaleSlider.set( v );
			scaleNote.textContent = app.scale.describe();
			if ( scaleAnimation.t >= 1 ) scaleAnimation = null;
		}

		labels.update();
		groundPanel.update();

		dateLine.textContent = formatDate( app.clock.date );
		rateLine.textContent = app.clock.paused ? 'paused' : formatRate( app.clock.rate );

		if ( app.focus ) renderLive( app.focus );

		frames ++;
		statsTimer += dt;
		if ( statsTimer > 0.5 ) {
			const fps = frames / statsTimer;
			const belts = app.system.belts.reduce( ( n, b ) => n + b.count, 0 );
			stats.textContent = `${ fps.toFixed( 0 ) } fps · ${ app.system.bodies.length } bodies · `
				+ `${ belts.toLocaleString( 'en' ) } small bodies · ${ app.usingWebGPU ? 'WebGPU' : 'WebGL2' }`;
			frames = 0; statsTimer = 0;
		}

	} );

	applyRate();
	renderInfo( app.focus );

	return { labels };

}
