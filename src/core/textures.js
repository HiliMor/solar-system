import { TextureLoader, SRGBColorSpace, LinearSRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter } from 'three';

import { PLANETS, SUN } from '../data/planets.js';
import { MOONS } from '../data/moons.js';
import { DWARF_PLANETS } from '../data/smallBodies.js';

/** Maps that hold data rather than colour must stay in linear space. */
const LINEAR_MAPS = new Set( [ 'earth_normal.png', 'earth_specular.png' ] );

function collectTextureNames() {
	const names = new Set( [ 'stars_milky_way.jpg' ] );
	const add = ( def ) => {
		for ( const key of [ 'texture', 'nightTexture', 'normalTexture', 'specularTexture', 'cloudTexture' ] ) {
			if ( def[ key ] ) names.add( def[ key ] );
		}
		if ( def.rings ) for ( const r of def.rings ) if ( r.texture ) names.add( r.texture );
	};
	add( SUN );
	PLANETS.forEach( add );
	MOONS.forEach( add );
	DWARF_PLANETS.forEach( add );
	return [ ...names ];
}

/**
 * Loads every map the scene asks for.
 *
 * Missing files are not an error: the fetch script can fail on any individual
 * map, and every material has a procedural or flat-colour fallback. A body with
 * no map simply takes the other path.
 *
 * @param {(loaded:number, total:number, name:string) => void} onProgress
 * @returns {Promise<{ textures: Map<string, Texture>, missing: string[] }>}
 */
export async function loadTextures( onProgress ) {

	const loader = new TextureLoader();
	loader.setPath( 'textures/' );

	const names = collectTextureNames();
	const textures = new Map();
	const missing = [];
	let loaded = 0;

	await Promise.all( names.map( ( name ) => new Promise( ( resolve ) => {

		loader.load(
			name,
			( tex ) => {
				tex.colorSpace = LINEAR_MAPS.has( name ) ? LinearSRGBColorSpace : SRGBColorSpace;
				tex.anisotropy = 16;
				tex.wrapS = RepeatWrapping;
				tex.generateMipmaps = true;
				tex.minFilter = LinearMipmapLinearFilter;
				tex.name = name;
				textures.set( name, tex );
				onProgress?.( ++ loaded, names.length, name );
				resolve();
			},
			undefined,
			() => {
				missing.push( name );
				onProgress?.( ++ loaded, names.length, name );
				resolve();
			}
		);

	} ) ) );

	return { textures, missing };

}
