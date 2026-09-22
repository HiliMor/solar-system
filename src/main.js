import { App } from './core/App.js';

const canvas = document.getElementById( 'viewport' );
const loading = document.getElementById( 'loading' );
const fill = document.getElementById( 'loading-fill' );
const status = document.getElementById( 'loading-status' );

async function boot() {

	if ( ! navigator.gpu ) {
		status.textContent = 'WebGPU unavailable - falling back to WebGL2.';
	}

	// ?quality=phone|modest|full forces a profile, for checking the others.
	const forced = new URLSearchParams( location.search ).get( 'quality' );
	const app = new App( canvas, { quality: forced } );
	window.app = app;
	// Dev-only conveniences: a handle on three, and a frame capture that works
	// around WebGPU canvases not surviving toDataURL or tab capture.
	if ( import.meta.env?.DEV ) {
		import( 'three/webgpu' ).then( ( three ) => { window.THREE = three; } );
		import( './core/capture.js' ).then( ( m ) => { window.capture = ( o ) => m.captureFrame( app, o ); } );
	}

	try {

		await app.init( ( loaded, total, name ) => {
			fill.style.width = `${ ( loaded / total ) * 100 }%`;
			status.textContent = `${ name }  (${ loaded }/${ total })`;
		} );

	} catch ( err ) {

		status.textContent = '';
		const box = document.createElement( 'div' );
		box.className = 'loading-error';
		box.textContent = `Could not start the renderer: ${ err.message }`;
		loading.querySelector( '.loading-inner' ).appendChild( box );
		console.error( err );
		return;

	}

	app.applyVisibility();
	app.start();

	// A fresh clone has no surface maps -- they are not committed. The scene
	// still runs, on procedural and flat-colour fallbacks, but it is worth
	// saying so rather than leaving someone to wonder why Earth is a blue ball.
	if ( app.missingTextures.length ) {
		const notice = document.createElement( 'div' );
		notice.className = 'notice';
		notice.innerHTML = `<strong>${ app.missingTextures.length } surface map${ app.missingTextures.length > 1 ? 's' : '' } missing.</strong>`
			+ ' Run <code>npm run textures</code> to download them.'
			+ '<button type="button" aria-label="Dismiss">\u00d7</button>';
		notice.querySelector( 'button' ).addEventListener( 'click', () => notice.remove() );
		document.getElementById( 'ui' ).appendChild( notice );
	}

	status.textContent = app.usingWebGPU ? 'WebGPU ready' : 'Running on WebGL2';
	requestAnimationFrame( () => loading.classList.add( 'done' ) );

	const { mountUI } = await import( './ui/ui.js' );
	mountUI( app, document.getElementById( 'ui' ) );

}

boot();
