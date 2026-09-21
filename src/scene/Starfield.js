import { Mesh, BackSide, SRGBColorSpace, Group, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, vec3, vec4, float, uniform, color, mix, pow, saturate } from 'three/tsl';

import { unitSphere } from './geometry.js';
import { OBLIQUITY } from '../data/constants.js';

/**
 * Sky background.
 *
 * An 8k Milky Way panorama on the inside of a very large sphere. The map is in
 * galactic-aligned equatorial coordinates, so the sphere is rotated by the
 * obliquity of the ecliptic to put the band where it actually sits relative to
 * the plane the planets orbit in -- which is why the Milky Way crosses the
 * ecliptic at a steep angle here rather than lying along it.
 */
export function createStarfield( textures ) {

	const group = new Group();

	const map = textures.get( 'stars_milky_way.jpg' );
	const uniforms = {
		intensity: uniform( float( 1 ) ),
		exposureBias: uniform( float( 1 ) )
	};

	const material = new MeshBasicNodeMaterial();
	material.side = BackSide;
	material.depthWrite = false;
	material.depthTest = false;
	material.toneMapped = true;

	const sample = map ? texture( map, uv() ).rgb : vec3( 0.01, 0.012, 0.02 );

	// The panorama is an 8-bit JPEG, so its faint stars sit in the bottom couple
	// of code values. A gamma lift separates them from the background instead of
	// leaving a grey wash, and keeps the bright stars from clipping.
	const lifted = pow( sample, vec3( 1.45 ) ).mul( 2.1 );

	material.colorNode = vec4( lifted.mul( uniforms.intensity ).mul( uniforms.exposureBias ), 1 );

	const mesh = new Mesh( unitSphere( 64, 48 ), material );
	mesh.frustumCulled = false;
	mesh.renderOrder = - 1000;
	mesh.scale.setScalar( 1e8 );

	// Equatorial map -> ecliptic frame.
	mesh.rotation.x = - OBLIQUITY;

	group.add( mesh );

	return {
		group,
		mesh,
		uniforms,
		setIntensity( v ) { uniforms.intensity.value = v; },
		/** The sky must not translate with the floating origin, only rotate. */
		follow( cameraPosition ) { mesh.position.copy( cameraPosition ); }
	};

}
