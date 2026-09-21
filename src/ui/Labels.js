import { Vector3 } from 'three';

const _v = new Vector3();

/**
 * Screen-space labels and target markers.
 *
 * Kept in the DOM rather than in the scene. Text rendered as geometry has to
 * fight the depth buffer, the tone mapper and the bloom pass, and at these
 * scales it would also need its own precision handling. HTML sits on top,
 * stays crisp at any pixel ratio, and is searchable and selectable.
 *
 * The marker is doing real work: at true relative sizes Neptune is a fraction
 * of a pixel from anywhere useful, so without a reticle there is nothing to
 * aim at. The reticle grows as a body's apparent size shrinks and fades out
 * once the body is large enough to click on by itself.
 */
export class Labels {

	constructor( app, container ) {

		this.app = app;
		this.root = document.createElement( 'div' );
		this.root.className = 'labels';
		container.appendChild( this.root );

		this.entries = new Map();
		this.enabled = true;
		this.showMinor = true;

		for ( const body of app.system.bodies ) this._create( body.id, body.name, body.kind || body.type );
		for ( const craft of app.system.spacecraft ) this._create( craft.id, craft.name, 'spacecraft' );

	}

	_create( id, name, kind ) {

		const el = document.createElement( 'button' );
		el.className = `label label-${ kind }`;
		el.type = 'button';
		el.dataset.bodyId = id;

		const dot = document.createElement( 'span' );
		dot.className = 'label-dot';

		const text = document.createElement( 'span' );
		text.className = 'label-text';
		text.textContent = name;

		el.append( dot, text );
		el.addEventListener( 'click', ( event ) => {
			event.stopPropagation();
			this.app.setFocus( id );
		} );

		this.root.appendChild( el );
		this.entries.set( id, { el, dot, text, kind, visible: false } );

	}

	setEnabled( enabled ) {
		this.enabled = enabled;
		this.root.style.display = enabled ? '' : 'none';
	}

	setShowMinor( show ) { this.showMinor = show; }

	update() {

		if ( ! this.enabled ) return;

		const app = this.app;
		const camera = app.rig.camera;
		const halfW = window.innerWidth / 2;
		const halfH = window.innerHeight / 2;

		const candidates = [ ...app.system.bodies, ...app.system.spacecraft ];

		for ( const body of candidates ) {

			const entry = this.entries.get( body.id );
			if ( ! entry ) continue;

			const group = body.group;
			const wanted = group.visible
				&& ( this.showMinor || entry.kind === 'planet' || entry.kind === 'star' || body.id === app.focusId );

			if ( ! wanted ) { this._hide( entry ); continue; }

			_v.copy( group.position ).project( camera );

			if ( _v.z < - 1 || _v.z > 1 || Math.abs( _v.x ) > 1.35 || Math.abs( _v.y ) > 1.35 ) {
				this._hide( entry );
				continue;
			}

			const distance = camera.position.distanceTo( group.position );
			const radius = body.radiusUnits || 0;

			// Apparent radius in pixels.
			const pixelScale = window.innerHeight / ( 2 * Math.tan( camera.fov * Math.PI / 360 ) );
			const apparent = radius * pixelScale / Math.max( distance, 1e-6 );

			// Hide a moon's label once its parent is far enough away that the
			// whole system is a single dot -- otherwise Jupiter arrives with five
			// overlapping names stacked on it.
			if ( body.kind === 'moon' && body.parent ) {
				const parentApparent = ( body.parent.radiusUnits || 0 ) * pixelScale
					/ Math.max( camera.position.distanceTo( body.parent.group.position ), 1e-6 );
				if ( parentApparent < 14 && body.id !== app.focusId ) { this._hide( entry ); continue; }
			}

			const x = halfW + _v.x * halfW;
			const y = halfH - _v.y * halfH;

			// Reticle: large when the body is a speck, gone when it is not.
			const reticle = Math.max( 4, Math.min( 13, 13 - apparent * 0.5 ) );
			const reticleOpacity = Math.max( 0, Math.min( 1, ( 28 - apparent ) / 22 ) );

			entry.el.style.transform = `translate(${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px)`;
			entry.dot.style.width = entry.dot.style.height = `${ reticle * 2 }px`;
			entry.dot.style.opacity = reticleOpacity.toFixed( 2 );
			entry.el.style.setProperty( '--label-offset', `${ Math.max( reticle, apparent * 0.75 ) + 7 }px` );
			entry.el.classList.toggle( 'is-focus', body.id === app.focusId );

			if ( ! entry.visible ) { entry.el.style.display = ''; entry.visible = true; }

		}

	}

	_hide( entry ) {
		if ( entry.visible ) { entry.el.style.display = 'none'; entry.visible = false; }
	}

}
