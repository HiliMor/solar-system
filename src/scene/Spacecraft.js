import {
	Group, Mesh, Sprite, BufferGeometry, BufferAttribute, Line, Vector3,
	AdditiveBlending, OctahedronGeometry
} from 'three';
import { SpriteNodeMaterial, LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { uniform, float, vec2, vec3, vec4, color, uv, length, smoothstep, attribute, oneMinus, pow } from 'three/tsl';

import { AU_KM, DEG, DAYS_PER_YEAR } from '../data/constants.js';

const TRAJECTORY_SEGMENTS = 96;

/**
 * Interstellar probes.
 *
 * They are a few metres across and more than a hundred AU away, so there is no
 * meaningful geometry to render: what matters is knowing where they are and how
 * far out they have got. Each is drawn as a fixed-size marker with its escape
 * trajectory trailing back toward the planets.
 *
 * The trajectory is drawn only from 5 AU outward, which is deliberate. Past the
 * outer planets the path really is a straight asymptote and the extrapolation is
 * good to a fraction of a percent; the years spent being flung between Jupiter
 * and Neptune are not something this model reproduces, so they are not drawn.
 */
export function createSpacecraftMarker( def ) {

	const group = new Group();

	const uniforms = {
		pixelScale: uniform( float( 500 ) ),
		markerSize: uniform( float( 9 ) ),
		opacity: uniform( float( 1 ) ),
		tint: uniform( color( def.color ?? 0xffd27f ) ),
		// Markers are annotations; they hold still while the exposure moves.
		exposureCompensation: uniform( float( 1 ) )
	};

	// --- marker -------------------------------------------------------------
	const markerMaterial = new SpriteNodeMaterial();
	markerMaterial.transparent = true;
	markerMaterial.depthWrite = false;
	markerMaterial.depthTest = false;
	markerMaterial.blending = AdditiveBlending;

	// A fixed size on screen, whatever the distance. With sizeAttenuation off,
	// the sprite's world scale is multiplied by view depth, so the scale that
	// yields a given pixel size is simply pixels / pixelScale -- without this the
	// default scale of 1 makes each marker about as tall as the viewport.
	markerMaterial.sizeAttenuation = false;
	markerMaterial.scaleNode = vec2( uniforms.markerSize.div( uniforms.pixelScale ) );

	const d = length( uv().sub( 0.5 ) );
	// A small ring rather than a blob, so it does not read as another star.
	const ring = oneMinus( smoothstep( 0.42, 0.5, d ) ).mul( smoothstep( 0.26, 0.34, d ) );
	const core = oneMinus( smoothstep( 0.0, 0.1, d ) );

	markerMaterial.colorNode = vec4( uniforms.tint.mul( uniforms.exposureCompensation ), 1 );
	markerMaterial.opacityNode = ring.add( core.mul( 0.9 ) ).mul( uniforms.opacity );

	const marker = new Sprite( markerMaterial );
	marker.frustumCulled = false;
	marker.renderOrder = 20;
	marker.userData.bodyId = def.id;
	group.add( marker );

	// --- trajectory ---------------------------------------------------------
	const positions = new Float32Array( ( TRAJECTORY_SEGMENTS + 1 ) * 3 );
	const along = new Float32Array( TRAJECTORY_SEGMENTS + 1 );
	for ( let i = 0; i <= TRAJECTORY_SEGMENTS; i ++ ) along[ i ] = i / TRAJECTORY_SEGMENTS;

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'trailPhase', new BufferAttribute( along, 1 ) );

	const trailMaterial = new LineBasicNodeMaterial();
	trailMaterial.transparent = true;
	trailMaterial.depthWrite = false;
	trailMaterial.blending = AdditiveBlending;

	const trailUniforms = {
		opacity: uniform( float( 0.5 ) ),
		tint: uniform( color( def.color ?? 0xffd27f ) ),
		exposureCompensation: uniforms.exposureCompensation
	};
	const phase = attribute( 'trailPhase', 'float' );
	const brightness = pow( phase, 1.6 ).mul( trailUniforms.opacity );

	trailMaterial.colorNode = vec4( trailUniforms.tint.mul( trailUniforms.exposureCompensation ), 1 );
	trailMaterial.opacityNode = brightness;

	const trail = new Line( geometry, trailMaterial );
	trail.frustumCulled = false;
	trail.renderOrder = - 1;

	return {
		id: def.id,
		def,
		group,
		marker,
		trail,
		positions,
		geometry,
		uniforms: { ...uniforms, trailOpacity: trailUniforms.opacity },

		/**
		 * Rewrites the trajectory for the current scale and origin. The probe
		 * travels radially outward, so the path is a ray from `fromAU` to where it
		 * is now, sampled densely enough that the orbit compression -- which is
		 * non-linear in distance -- stays smooth.
		 */
		updateTrajectory( direction, currentAU, scale, frame, fromAU = 5 ) {

			const p = this.positions;
			const start = Math.min( fromAU, currentAU );

			for ( let i = 0; i <= TRAJECTORY_SEGMENTS; i ++ ) {

				const distanceAU = start + ( currentAU - start ) * ( i / TRAJECTORY_SEGMENTS );
				const k = scale.unitsPerAU( distanceAU );

				const ex = direction.x * distanceAU * k - frame.origin.x;
				const ey = direction.y * distanceAU * k - frame.origin.y;
				const ez = direction.z * distanceAU * k - frame.origin.z;

				p[ i * 3 ] = ex;
				p[ i * 3 + 1 ] = ez;
				p[ i * 3 + 2 ] = - ey;

			}

			geometry.attributes.position.needsUpdate = true;
			geometry.computeBoundingSphere();

		},

		setVisible( visible ) {
			group.visible = visible;
			trail.visible = visible;
		},

		dispose() {
			geometry.dispose();
			trailMaterial.dispose();
			markerMaterial.dispose();
		}
	};

}
