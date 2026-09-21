import { BufferGeometry, BufferAttribute, Line, AdditiveBlending } from 'three';
import { LineBasicNodeMaterial } from 'three/webgpu';
import { attribute, vec4, float, uniform, color, varying, positionLocal } from 'three/tsl';

import { sampleOrbit } from '../physics/ephemeris.js';
import { eclipticToScene } from '../physics/frames.js';

const SEGMENTS = 640;

const smoothstepScalar = ( edge0, edge1, x ) => {
	const t = Math.min( 1, Math.max( 0, ( x - edge0 ) / ( edge1 - edge0 ) ) );
	return t * t * ( 3 - 2 * t );
};

/**
 * The trace of one orbit.
 *
 * Drawn as a closed loop that fades from bright at the body's current position
 * to nearly invisible a full revolution behind it, so the direction of travel
 * is readable at a glance without arrows or animation. The fade is a per-vertex
 * parameter plus a scalar uniform for where the body currently sits, which
 * means the whole effect costs one uniform update per frame rather than a
 * buffer rewrite.
 */
export class OrbitPath {

	constructor( tint = 0x4f7fd0, opacity = 0.5 ) {

		this.geometry = new BufferGeometry();

		const positions = new Float32Array( ( SEGMENTS + 1 ) * 3 );
		const phase = new Float32Array( SEGMENTS + 1 );
		for ( let i = 0; i <= SEGMENTS; i ++ ) phase[ i ] = i / SEGMENTS;

		this.positions = positions;
		this.geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
		this.geometry.setAttribute( 'orbitPhase', new BufferAttribute( phase, 1 ) );

		this.uniforms = {
			headPhase: uniform( float( 0 ) ),
			tint: uniform( color( tint ) ),
			opacity: uniform( float( opacity ) ),
			fadeLength: uniform( float( 0.85 ) ),
			// Auto exposure spans a factor of thirty across the solar system.
			// A path is an annotation, not a physical object, so it is divided by
			// the current exposure and ends up the same brightness everywhere.
			exposureCompensation: uniform( float( 1 ) )
		};

		const material = new LineBasicNodeMaterial();
		material.transparent = true;
		material.depthWrite = false;
		material.blending = AdditiveBlending;

		// Distance behind the body, wrapped into [0, 1).
		const behind = attribute( 'orbitPhase', 'float' ).sub( this.uniforms.headPhase ).fract();
		const brightness = behind.oneMinus().pow( 2.2 ).mul( this.uniforms.opacity );

		material.colorNode = vec4( this.uniforms.tint.mul( brightness.mul( 1.6 ).add( 0.06 ) ).mul( this.uniforms.exposureCompensation ), 1 );
		material.opacityNode = brightness.mul( 0.9 ).add( 0.05 );

		this.material = material;
		this.baseOpacity = opacity;
		this.distanceFade = 1;
		this.wanted = true;
		// A Line rather than a LineLoop: WebGPU has no line-loop topology, and the
		// sampler already emits a duplicate final vertex to close the curve.
		this.line = new Line( this.geometry, material );
		this.line.frustumCulled = false;
		this.line.renderOrder = - 1;

	}

	/**
	 * Rebuilds the path for a given orbit shape.
	 * @param {object} shape { a, e, i, om, w } with `a` in the caller's units
	 * @param {number} unitsPerA scene units per unit of `a`
	 */
	update( shape, unitsPerA ) {

		const samples = sampleOrbit( shape, SEGMENTS );
		const p = this.positions;

		for ( let i = 0; i <= SEGMENTS; i ++ ) {
			const x = samples[ i * 3 ] * unitsPerA;
			const y = samples[ i * 3 + 1 ] * unitsPerA;
			const z = samples[ i * 3 + 2 ] * unitsPerA;
			// Ecliptic -> three.js, inline.
			p[ i * 3 ] = x;
			p[ i * 3 + 1 ] = z;
			p[ i * 3 + 2 ] = - y;
		}

		this.geometry.attributes.position.needsUpdate = true;
		this.geometry.computeBoundingSphere();

		this.radiusUnits = Math.abs( shape.a ) * unitsPerA;

	}

	/**
	 * Fades the path out when the camera is either far inside it or far outside.
	 *
	 * Without this, standing next to Earth means looking through every planetary
	 * orbit at once -- a cage of straight lines across the sky, since from the
	 * inside an orbit thousands of units across is edge-on and effectively
	 * infinite. The path only earns its place when its scale is comparable to
	 * how far away you are.
	 */
	setCameraDistance( distance ) {
		const ratio = distance / Math.max( this.radiusUnits || 1, 1e-6 );
		const fadeIn = smoothstepScalar( 0.05, 0.28, ratio );
		const fadeOut = 1 - smoothstepScalar( 30, 90, ratio );
		this.distanceFade = fadeIn * fadeOut;
		this.uniforms.opacity.value = this.baseOpacity * this.distanceFade;
		this.line.visible = this.wanted !== false && this.distanceFade > 0.004;
	}

	/** Where the body currently is along the loop, 0..1 in eccentric anomaly. */
	setHead( phase ) {
		this.uniforms.headPhase.value = phase - Math.floor( phase );
	}

	setExposureCompensation( value ) { this.uniforms.exposureCompensation.value = value; }

	setOpacity( value ) {
		this.baseOpacity = value;
		this.uniforms.opacity.value = value * this.distanceFade;
	}

	/** UI visibility, kept separate from the automatic distance fade. */
	setWanted( wanted ) {
		this.wanted = wanted;
		if ( ! wanted ) this.line.visible = false;
	}
	setTint( hex ) { this.uniforms.tint.value.set( hex ); }

	dispose() {
		this.geometry.dispose();
		this.material.dispose();
	}

}
