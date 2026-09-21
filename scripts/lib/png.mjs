/**
 * Minimal PNG encoder built on node's zlib -- enough to re-encode the TIFF-only
 * maps (Earth normal / specular) into something a browser can actually decode,
 * without pulling in a native image dependency.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = ( () => {
	const t = new Int32Array( 256 );
	for ( let n = 0; n < 256; n ++ ) {
		let c = n;
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xEDB88320 ^ ( c >>> 1 ) : c >>> 1;
		t[ n ] = c;
	}
	return t;
} )();

function crc32( buf ) {
	let c = -1;
	for ( let i = 0; i < buf.length; i ++ ) c = CRC_TABLE[ ( c ^ buf[ i ] ) & 0xFF ] ^ ( c >>> 8 );
	return ( c ^ -1 ) >>> 0;
}

function chunk( type, data ) {
	const len = Buffer.alloc( 4 );
	len.writeUInt32BE( data.length );
	const body = Buffer.concat( [ Buffer.from( type, 'latin1' ), data ] );
	const crc = Buffer.alloc( 4 );
	crc.writeUInt32BE( crc32( body ) );
	return Buffer.concat( [ len, body, crc ] );
}

/**
 * @param {Uint8Array} pixels interleaved samples, row-major
 * @param {number} width
 * @param {number} height
 * @param {1|3} channels 1 -> greyscale, 3 -> RGB
 */
export function encodePNG( pixels, width, height, channels = 3 ) {

	const stride = width * channels;
	const raw = Buffer.alloc( ( stride + 1 ) * height );

	// Filter type 1 (Sub) pays for itself on smooth maps and costs one pass.
	for ( let y = 0; y < height; y ++ ) {
		const src = y * stride;
		const dst = y * ( stride + 1 );
		raw[ dst ] = 1;
		for ( let x = 0; x < stride; x ++ ) {
			const left = x >= channels ? pixels[ src + x - channels ] : 0;
			raw[ dst + 1 + x ] = ( pixels[ src + x ] - left ) & 0xFF;
		}
	}

	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( width, 0 );
	ihdr.writeUInt32BE( height, 4 );
	ihdr[ 8 ] = 8;                            // bit depth
	ihdr[ 9 ] = channels === 1 ? 0 : 2;       // colour type
	ihdr[ 10 ] = 0; ihdr[ 11 ] = 0; ihdr[ 12 ] = 0;

	return Buffer.concat( [
		Buffer.from( [ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ] ),
		chunk( 'IHDR', ihdr ),
		chunk( 'IDAT', deflateSync( raw, { level: 8 } ) ),
		chunk( 'IEND', Buffer.alloc( 0 ) )
	] );

}
