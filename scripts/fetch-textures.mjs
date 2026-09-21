#!/usr/bin/env node
/**
 * Downloads the surface maps the renderer uses into `public/textures/`.
 *
 * Imagery comes from Solar System Scope (https://www.solarsystemscope.com/textures/),
 * released under CC BY 4.0 and built from NASA/JPL, USGS and ESA source data.
 * It is not committed to this repository -- run `npm run textures` once after cloning.
 *
 * Each entry lists candidate resolutions in preference order; the first one that
 * responds with a 200 wins, so the script degrades gracefully if a given map is
 * not published at 8k.
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import UTIF from 'utif';
import { encodePNG } from './lib/png.mjs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const OUT = join( ROOT, 'public', 'textures' );
const BASE = 'https://www.solarsystemscope.com/textures/download/';

/** local name -> remote candidates, best first */
const MANIFEST = {
	'sun.jpg':              [ '8k_sun.jpg', '2k_sun.jpg' ],
	'mercury.jpg':          [ '8k_mercury.jpg', '2k_mercury.jpg' ],
	'venus_surface.jpg':    [ '8k_venus_surface.jpg', '2k_venus_surface.jpg' ],
	'venus_clouds.jpg':     [ '4k_venus_atmosphere.jpg', '2k_venus_atmosphere.jpg' ],
	'earth_day.jpg':        [ '8k_earth_daymap.jpg', '2k_earth_daymap.jpg' ],
	'earth_night.jpg':      [ '8k_earth_nightmap.jpg', '2k_earth_nightmap.jpg' ],
	'earth_clouds.jpg':     [ '8k_earth_clouds.jpg', '2k_earth_clouds.jpg' ],
	// Published only as TIFF, which no browser decodes -- converted to PNG below.
	'earth_normal.png':     [ '8k_earth_normal_map.tif', '2k_earth_normal_map.tif' ],
	'earth_specular.png':   [ '8k_earth_specular_map.tif', '2k_earth_specular_map.tif' ],
	'moon.jpg':             [ '8k_moon.jpg', '2k_moon.jpg' ],
	'mars.jpg':             [ '8k_mars.jpg', '2k_mars.jpg' ],
	'jupiter.jpg':          [ '8k_jupiter.jpg', '2k_jupiter.jpg' ],
	'saturn.jpg':           [ '8k_saturn.jpg', '2k_saturn.jpg' ],
	'saturn_ring.png':      [ '8k_saturn_ring_alpha.png', '2k_saturn_ring_alpha.png' ],
	'uranus.jpg':           [ '2k_uranus.jpg' ],
	'neptune.jpg':          [ '2k_neptune.jpg' ],
	'ceres.jpg':            [ '4k_ceres_fictional.jpg', '2k_ceres_fictional.jpg' ],
	'eris.jpg':             [ '4k_eris_fictional.jpg', '2k_eris_fictional.jpg' ],
	'haumea.jpg':           [ '4k_haumea_fictional.jpg', '2k_haumea_fictional.jpg' ],
	'makemake.jpg':         [ '4k_makemake_fictional.jpg', '2k_makemake_fictional.jpg' ],
	'stars_milky_way.jpg':  [ '8k_stars_milky_way.jpg', '2k_stars_milky_way.jpg' ]
};

const quietIfPresent = process.argv.includes( '--quiet-if-present' );
const force = process.argv.includes( '--force' );

const exists = async ( p ) => { try { return ( await stat( p ) ).size > 1024; } catch { return false; } };
const mb = ( n ) => `${ ( n / 1048576 ).toFixed( 1 ) } MB`;

/**
 * Decodes a TIFF buffer and re-encodes it as PNG. Normal maps keep all three
 * channels; masks that are visually greyscale collapse to one channel, which
 * roughly thirds the file for no loss.
 */
function tiffToPNG( buf ) {

	const ifds = UTIF.decode( buf );
	UTIF.decodeImage( buf, ifds[ 0 ], ifds );
	const rgba = UTIF.toRGBA8( ifds[ 0 ] );       // Uint8Array, 4 bytes/px
	const { width, height } = ifds[ 0 ];
	const px = width * height;

	let grey = true;
	for ( let i = 0; i < px && grey; i += 97 ) {
		const o = i * 4;
		if ( rgba[ o ] !== rgba[ o + 1 ] || rgba[ o + 1 ] !== rgba[ o + 2 ] ) grey = false;
	}

	const channels = grey ? 1 : 3;
	const out = new Uint8Array( px * channels );
	for ( let i = 0; i < px; i ++ ) {
		const o = i * 4;
		if ( grey ) out[ i ] = rgba[ o ];
		else { out[ i * 3 ] = rgba[ o ]; out[ i * 3 + 1 ] = rgba[ o + 1 ]; out[ i * 3 + 2 ] = rgba[ o + 2 ]; }
	}

	return encodePNG( out, width, height, channels );

}

async function fetchOne( local, candidates ) {

	const dest = join( OUT, local );

	if ( ! force && await exists( dest ) ) return { local, skipped: true, bytes: 0 };

	for ( const remote of candidates ) {

		let res;
		try {
			res = await fetch( BASE + remote, { redirect: 'follow' } );
		} catch ( err ) {
			throw new Error( `network error fetching ${ remote }: ${ err.message }` );
		}

		if ( ! res.ok ) continue;

		let buf = Buffer.from( await res.arrayBuffer() );
		if ( buf.length < 1024 ) continue;

		if ( remote.endsWith( '.tif' ) ) buf = tiffToPNG( buf );

		await writeFile( dest, buf );
		return { local, remote, bytes: buf.length };

	}

	throw new Error( `none of [${ candidates.join( ', ' ) }] could be downloaded` );

}

async function main() {

	await mkdir( OUT, { recursive: true } );

	const entries = Object.entries( MANIFEST );

	if ( quietIfPresent ) {
		const all = await Promise.all( entries.map( ( [ n ] ) => exists( join( OUT, n ) ) ) );
		if ( all.every( Boolean ) ) return;
	}

	console.log( `Fetching ${ entries.length } texture maps into public/textures/ ...` );
	console.log( 'Source: Solar System Scope (CC BY 4.0), derived from NASA/JPL/USGS imagery.\n' );

	let total = 0, downloaded = 0, skipped = 0;
	const failures = [];

	// Four at a time: fast enough without hammering the host.
	const queue = entries.slice();
	const worker = async () => {
		while ( queue.length ) {
			const [ local, candidates ] = queue.shift();
			try {
				const r = await fetchOne( local, candidates );
				if ( r.skipped ) { skipped ++; console.log( `  = ${ local } (already present)` ); }
				else { downloaded ++; total += r.bytes; console.log( `  + ${ local.padEnd( 22 ) } ${ mb( r.bytes ).padStart( 9 ) }  <- ${ r.remote }` ); }
			} catch ( err ) {
				failures.push( `${ local }: ${ err.message }` );
				console.log( `  ! ${ local } FAILED -- ${ err.message }` );
			}
		}
	};

	await Promise.all( Array.from( { length: 4 }, worker ) );

	console.log( `\nDone. ${ downloaded } downloaded (${ mb( total ) }), ${ skipped } already present.` );

	if ( failures.length ) {
		console.log( `\n${ failures.length } map(s) could not be fetched. The app still runs -- it falls back to` );
		console.log( 'procedural surfaces for anything missing. Re-run `npm run textures` to retry.' );
		process.exitCode = 0;
	}

}

main().catch( ( err ) => { console.error( err ); process.exit( 1 ); } );
