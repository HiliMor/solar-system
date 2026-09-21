import { RenderTarget, UnsignedByteType, LinearFilter, NoColorSpace, SRGBColorSpace } from 'three';

/**
 * Dev-only frame capture.
 *
 * Renders the current view into an offscreen target, reads it back through the
 * renderer and posts the PNG to the dev server's capture sink. Going via a
 * render target rather than the canvas is deliberate: reading a WebGPU canvas
 * back through the 2D APIs is unreliable, while a render target readback is
 * exactly the frame the GPU produced.
 */
export async function captureFrame( app, { name = 'frame', width, height, post = true } = {} ) {

	const renderer = app.renderer;
	// WebGPU reads back with rows padded to 256 bytes. Snapping the width to a
	// multiple of 64 pixels (= 256 bytes at RGBA8) means there is no padding to
	// unpick, and the readback is a plain contiguous buffer.
	const requested = width || Math.min( 1600, Math.floor( window.innerWidth ) );
	const w = Math.max( 64, Math.round( requested / 64 ) * 64 );
	const h = height || Math.round( w * window.innerHeight / window.innerWidth );

	const target = new RenderTarget( w, h, {
		type: UnsignedByteType,
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		colorSpace: SRGBColorSpace
	} );

	// The scene pass inside the pipeline only re-renders when the node frame id
	// advances, which normally happens once per animation-loop tick. A capture
	// taken outside that loop -- for instance while the tab is backgrounded and
	// requestAnimationFrame is throttled to nothing -- would otherwise composite
	// a stale scene render. Advancing the frame by hand forces a fresh one.
	renderer._nodes?.nodeFrame?.update();

	const previous = renderer.getRenderTarget();
	renderer.setRenderTarget( target );

	if ( post && app.postProcessing ) {
		await app.postProcessing.post.renderAsync();
	} else {
		await renderer.renderAsync( app.scene, app.rig.camera );
	}

	renderer.setRenderTarget( previous );

	const pixels = await renderer.readRenderTargetPixelsAsync( target, 0, 0, w, h );

	const stride = w * 4;
	const rows = Math.floor( pixels.length / stride );
	if ( rows !== h ) console.warn( `capture: expected ${ h } rows, got ${ rows }` );

	// Readback is bottom-up; flip into image order.
	const flipped = new Uint8ClampedArray( rows * stride );
	for ( let y = 0; y < rows; y ++ ) {
		flipped.set( pixels.subarray( ( rows - 1 - y ) * stride, ( rows - y ) * stride ), y * stride );
	}

	const canvas = new OffscreenCanvas( w, rows );
	canvas.getContext( '2d' ).putImageData( new ImageData( flipped, w, rows ), 0, 0 );
	const blob = await canvas.convertToBlob( { type: 'image/png' } );

	target.dispose();

	const response = await fetch( `/__capture?name=${ encodeURIComponent( name ) }`, {
		method: 'POST',
		body: blob
	} );

	return response.json();

}
