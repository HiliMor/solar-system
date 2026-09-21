import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Dev-only capture sink.
 *
 * WebGPU canvases do not reliably survive `toDataURL`, `drawImage` or the
 * browser's own tab-capture path, which makes visual checking during
 * development awkward. This accepts a PNG posted from the page (rendered into
 * an offscreen target and read back through the renderer, so it is the real
 * frame) and writes it to disk.
 *
 * Only ever mounted by `vite dev`; it is not part of the build.
 */
export function captureSink( outDir = '.captures' ) {

	return {
		name: 'capture-sink',
		apply: 'serve',
		configureServer( server ) {

			server.middlewares.use( '/__capture', async ( req, res ) => {

				if ( req.method !== 'POST' ) { res.statusCode = 405; res.end(); return; }

				const name = ( new URL( req.url, 'http://x' ).searchParams.get( 'name' ) || 'frame' )
					.replace( /[^a-z0-9._-]/gi, '_' );

				const chunks = [];
				for await ( const chunk of req ) chunks.push( chunk );

				const path = resolve( server.config.root, outDir, `${ name }.png` );
				await mkdir( dirname( path ), { recursive: true } );
				await writeFile( path, Buffer.concat( chunks ) );

				res.setHeader( 'content-type', 'application/json' );
				res.end( JSON.stringify( { ok: true, path, bytes: Buffer.concat( chunks ).length } ) );

			} );

		}
	};

}
