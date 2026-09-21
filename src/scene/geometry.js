import { BufferGeometry, BufferAttribute, SphereGeometry } from 'three';

/**
 * Annulus in the XZ plane with a genuinely radial UV layout: u runs 0 -> 1 from
 * the inner edge to the outer edge, v runs 0 -> 1 around the circumference.
 *
 * three's own RingGeometry maps UVs onto a bounding square, which is useless for
 * sampling a ring profile stored as a radial strip.
 */
export function makeRingGeometry( innerRadius, outerRadius, angularSegments = 512, radialSegments = 8 ) {

	const vertexCount = ( angularSegments + 1 ) * ( radialSegments + 1 );
	const positions = new Float32Array( vertexCount * 3 );
	const normals = new Float32Array( vertexCount * 3 );
	const uvs = new Float32Array( vertexCount * 2 );
	const indices = [];

	let v = 0;

	for ( let j = 0; j <= radialSegments; j ++ ) {

		const t = j / radialSegments;
		const radius = innerRadius + ( outerRadius - innerRadius ) * t;

		for ( let i = 0; i <= angularSegments; i ++ ) {

			const phi = ( i / angularSegments ) * Math.PI * 2;

			positions[ v * 3 ] = Math.cos( phi ) * radius;
			positions[ v * 3 + 1 ] = 0;
			positions[ v * 3 + 2 ] = Math.sin( phi ) * radius;

			normals[ v * 3 + 1 ] = 1;

			uvs[ v * 2 ] = t;
			uvs[ v * 2 + 1 ] = i / angularSegments;

			v ++;

		}

	}

	for ( let j = 0; j < radialSegments; j ++ ) {
		for ( let i = 0; i < angularSegments; i ++ ) {
			const a = j * ( angularSegments + 1 ) + i;
			const b = a + angularSegments + 1;
			indices.push( a, b, a + 1, b, b + 1, a + 1 );
		}
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( normals, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( uvs, 2 ) );
	geometry.setIndex( indices );

	return geometry;

}

/**
 * Sphere geometry cache. Bodies share one unit sphere per tessellation level and
 * scale it, which keeps the buffer count low -- there are a lot of moons.
 */
const sphereCache = new Map();

export function unitSphere( widthSegments = 96, heightSegments = 64 ) {
	const key = `${ widthSegments }x${ heightSegments }`;
	let g = sphereCache.get( key );
	if ( ! g ) {
		g = new SphereGeometry( 1, widthSegments, heightSegments );
		g.computeTangents?.();
		sphereCache.set( key, g );
	}
	return g;
}

/**
 * Tessellation appropriate to how much of the screen a body will occupy.
 * Charon needs far fewer triangles than Jupiter, and there are 40 bodies.
 */
export function sphereDetailFor( radiusKm, hasNormalMap = false ) {
	if ( radiusKm > 50000 ) return unitSphere( 192, 128 );
	if ( radiusKm > 3000 ) return unitSphere( hasNormalMap ? 256 : 160, hasNormalMap ? 160 : 100 );
	if ( radiusKm > 500 ) return unitSphere( 96, 64 );
	if ( radiusKm > 100 ) return unitSphere( 64, 40 );
	return unitSphere( 40, 28 );
}
