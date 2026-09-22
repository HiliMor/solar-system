import { WebGPURenderer, RenderPipeline } from 'three/webgpu';
import { NeutralToneMapping, SRGBColorSpace } from 'three';
import { pass, min, vec3, float, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/**
 * Renderer setup.
 *
 * Two decisions carry the whole scene:
 *
 *   logarithmic depth -- the view frustum has to hold a 5 km crater and a 4.5
 *     billion km orbit at once. A linear depth buffer cannot; a logarithmic one
 *     distributes precision by orders of magnitude and handles it without
 *     z-fighting.
 *
 *   bloom on an emissive pass -- only the Sun, the corona and the city lights
 *     are tagged as emissive, so the bloom picks out real light sources instead
 *     of smearing every bright surface. Saturn's cloud tops stay crisp.
 */
export async function createRenderer( canvas, profile = { pixelRatioCap: 2 } ) {

	const renderer = new WebGPURenderer( {
		canvas,
		antialias: true,
		logarithmicDepthBuffer: true,
		powerPreference: 'high-performance',
		alpha: false
	} );

	renderer.setPixelRatio( Math.min( window.devicePixelRatio, profile.pixelRatioCap ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	// Neutral rather than AgX: AgX desaturates as it compresses, which is fine
	// for film emulation and wrong here -- it turned a clear sky into grey and
	// bled the colour out of Mars. Neutral compresses highlights and leaves hue
	// and saturation alone.
	renderer.toneMapping = NeutralToneMapping;
	renderer.toneMappingExposure = 1;
	renderer.outputColorSpace = SRGBColorSpace;

	await renderer.init();

	return renderer;

}

/**
 * Post-processing chain: bloom over the beauty pass.
 *
 * Kept deliberately short. Everything that reads as "cinematic" here comes from
 * the scattering and lighting models rather than from screen-space effects, and
 * a heavy chain would only soften detail that was expensive to compute.
 */
export function createPostProcessing( renderer, scene, camera ) {

	const scenePass = pass( scene, camera );
	const colour = scenePass.getTextureNode( 'output' );

	// The bloom source is clamped.
	//
	// Auto exposure runs up to about 18x when the view is out at Neptune, and
	// the photosphere is rendered far brighter than 1.0 to begin with. Feeding
	// that straight into a bloom means one sub-pixel Sun can put a white haze
	// over the entire frame. Capping the input keeps the flare generous without
	// letting a single hot pixel take the image with it.
	const bloomSource = min( colour, vec3( 3.5 ) );
	const bloomNode = bloom( bloomSource, 0.45, 0.34, 0.5 );

	const post = new RenderPipeline( renderer );
	post.outputNode = colour.add( bloomNode );

	return {
		post,
		bloom: bloomNode,
		setBloom( strength, radius, threshold ) {
			bloomNode.strength.value = strength;
			bloomNode.radius.value = radius;
			bloomNode.threshold.value = threshold;
		},
		setEnabled( enabled ) {
			post.outputNode = enabled ? colour.add( bloomNode ) : colour;
			post.needsUpdate = true;
		}
	};

}

/** True when the renderer actually got WebGPU rather than falling back. */
export function isWebGPU( renderer ) {
	return renderer.backend?.isWebGPUBackend === true;
}
