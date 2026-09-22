import { isPhoneLayout } from '../core/quality.js';

const el = ( tag, className, text ) => {
	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== undefined ) node.textContent = text;
	return node;
};

/**
 * Phone layout.
 *
 * The desktop arrangement is three panels open at once around a view of the
 * sky. On a phone that leaves a seventy-pixel sliver of sky, so the same panels
 * are moved into a single bottom sheet with a tab bar: one at a time, collapsed
 * by default, and the sky gets the screen.
 *
 * The panels themselves are moved rather than rebuilt, so every update loop,
 * event handler and reference in the rest of the interface goes on working
 * without knowing this happened.
 */
export function createMobileLayout( app, container, panels ) {

	const sheet = el( 'div', 'sheet' );

	const tabs = el( 'nav', 'sheet-tabs' );
	const body = el( 'div', 'sheet-body' );
	const grip = el( 'div', 'sheet-grip' );

	sheet.append( grip, tabs, body );

	const pages = [
		{ id: 'info', label: 'Body', node: panels.info },
		{ id: 'bodies', label: 'Browse', node: panels.bodies },
		{ id: 'sky', label: 'Sky', node: panels.ground, groundOnly: true },
		{ id: 'events', label: 'Events', node: panels.events },
		{ id: 'settings', label: 'Settings', node: panels.settings }
	];

	const buttons = new Map();
	let active = null;
	let installed = false;

	for ( const page of pages ) {
		const button = el( 'button', 'sheet-tab', page.label );
		button.type = 'button';
		button.addEventListener( 'click', () => {
			if ( active === page.id && sheet.classList.contains( 'is-open' ) ) collapse();
			else show( page.id );
		} );
		buttons.set( page.id, button );
		tabs.appendChild( button );
	}

	grip.addEventListener( 'click', () => {
		if ( sheet.classList.contains( 'is-open' ) ) collapse();
		else show( active || 'info' );
	} );

	function show( id ) {
		active = id;
		sheet.classList.add( 'is-open' );
		for ( const page of pages ) {
			const on = page.id === id;
			if ( page.node ) page.node.classList.toggle( 'is-sheet-active', on );
			buttons.get( page.id )?.classList.toggle( 'is-active', on );
		}
	}

	function collapse() {
		sheet.classList.remove( 'is-open' );
		for ( const page of pages ) page.node?.classList.remove( 'is-sheet-active' );
		for ( const [ , button ] of buttons ) button.classList.remove( 'is-active' );
	}

	/** Moves the panels into the sheet. */
	function install() {
		if ( installed ) return;
		installed = true;
		container.appendChild( sheet );
		for ( const page of pages ) {
			if ( ! page.node ) continue;
			page.node.dataset.sheetHome = '1';
			body.appendChild( page.node );
			page.node.classList.add( 'in-sheet' );
		}
		container.classList.add( 'is-phone' );
		syncTabs();
		// Collapsed to begin with. The first thing anyone should see is the sky,
		// not a panel about it.
		active = 'info';
		collapse();
	}

	/** Puts them back where the desktop layout expects them. */
	function uninstall( homes ) {
		if ( ! installed ) return;
		installed = false;
		for ( const page of pages ) {
			if ( ! page.node ) continue;
			page.node.classList.remove( 'in-sheet', 'is-sheet-active' );
			homes[ page.id ]?.appendChild( page.node );
		}
		container.classList.remove( 'is-phone' );
		sheet.remove();
	}

	/** The Sky tab only exists when you are standing somewhere; Browse only when not. */
	function syncTabs() {
		const ground = app.mode === 'ground';
		buttons.get( 'sky' ).hidden = ! ground;
		buttons.get( 'bodies' ).hidden = ground;
		if ( ground && active === 'bodies' ) show( 'sky' );
		if ( ! ground && active === 'sky' ) show( 'info' );
	}

	return {
		sheet,
		install,
		uninstall,
		syncTabs,
		show,
		collapse,
		get installed() { return installed; }
	};

}

/**
 * Switches between the two layouts as the viewport changes, remembering where
 * each panel belongs on the desktop so it can be put back.
 */
export function installResponsiveLayout( app, container, panels ) {

	const homes = {
		info: panels.info?.parentElement,
		bodies: panels.bodies?.parentElement,
		ground: panels.ground?.parentElement,
		events: panels.events?.parentElement,
		settings: panels.settings?.parentElement,
		sky: panels.ground?.parentElement
	};

	const layout = createMobileLayout( app, container, panels );

	function apply() {
		if ( isPhoneLayout() ) layout.install();
		else layout.uninstall( homes );
	}

	apply();
	window.addEventListener( 'resize', apply );
	app.on( 'mode', () => { if ( layout.installed ) layout.syncTabs(); } );

	return layout;

}
