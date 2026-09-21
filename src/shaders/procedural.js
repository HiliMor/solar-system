import {
	Fn, vec2, vec3, float, mix, abs, pow, smoothstep, saturate, max, min, clamp,
	mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, dot, sin, cos, oneMinus, color
} from 'three/tsl';

/**
 * Procedural surfaces for the bodies that have no published global map.
 *
 * The Galilean moons, the mid-sized Saturnian and Uranian satellites, Triton
 * and Charon have all been imaged, but not as seamless equirectangular colour
 * maps in the public texture sets. Rather than paint them a flat colour, each
 * gets a noise field tuned to the terrain type that spacecraft actually found
 * there -- sulphur flows on Io, tidal cracks on Europa, saturation cratering on
 * Callisto -- driven from the real albedo and colour. It is an impression of
 * the surface, not data, and the info panel says so.
 */

/** Ridged multifractal: sharp crests, good for cracks and canyon systems. */
const ridged = /*#__PURE__*/ Fn( ( [ p, octaves, lacunarity, gain ] ) => {
	return oneMinus( abs( mx_fractal_noise_float( p, octaves, lacunarity, gain ) ) ).pow( 3 );
} );

/**
 * Crater field.
 *
 * Built on Worley noise -- the distance to the nearest scattered feature point
 * -- rather than cell noise, which is constant across each lattice cell and
 * produces axis-aligned cubes. The distance field is then shaped into a profile
 * with a raised rim and a sunken floor, which is what a crater is.
 */
const craters = /*#__PURE__*/ Fn( ( [ p, density ] ) => {
	const d = mx_worley_noise_float( p.mul( density ), 1 );
	const floorDepth = oneMinus( smoothstep( 0.0, 0.22, d ) );      // basin
	const rim = smoothstep( 0.16, 0.30, d ).mul( oneMinus( smoothstep( 0.30, 0.46, d ) ) );
	return rim.mul( 0.8 ).sub( floorDepth.mul( 0.5 ) );
} );

/**
 * Scattered blobs: 1 inside a feature cell's core, falling to 0 between them.
 * `variation` breaks the uniformity of the lattice so the features come in a
 * range of sizes instead of looking stamped.
 */
const blobs = /*#__PURE__*/ Fn( ( [ p, density, size, variation ] ) => {
	const jitter = mx_fractal_noise_float( p.mul( density ).mul( 0.31 ), 3, 2.0, 0.55 ).mul( variation );
	const radius = max( size.add( jitter ), float( 0.02 ) );
	return oneMinus( smoothstep( radius.mul( 0.35 ), radius, mx_worley_noise_float( p.mul( density ), 1 ) ) );
} );

/**
 * Impact record across three size classes.
 *
 * A real surface has a power-law size distribution -- a few basins, many large
 * craters, countless small ones -- so a single lattice looks stamped and this
 * sums three at different scales and depths.
 */
const crateredSurface = /*#__PURE__*/ Fn( ( [ pos, scale ] ) => {
	return craters( pos, scale.mul( 0.4 ) ).mul( 1.0 )
		.add( craters( pos.add( vec3( 11.3, 4.7, 2.9 ) ), scale.mul( 1.15 ) ).mul( 0.62 ) )
		.add( craters( pos.add( vec3( 31.1, 17.9, 23.3 ) ), scale.mul( 3.1 ) ).mul( 0.33 ) );
} );

/**
 * Builds a colour node for a body's `surface` descriptor.
 *
 * @param {object} surface { kind, base, accent, scale, contrast, cracks }
 * @param {Node<vec3>} pos unit-sphere position in object space
 * @returns {{ color: Node<vec3>, roughness: Node<float>, bump: Node<float> }}
 */
export function proceduralSurface( surface, pos ) {

	const base = color( surface.base );
	const accent = color( surface.accent );
	const s = float( surface.scale || 6 );
	const contrast = float( surface.contrast ?? 0.4 );
	const p = pos.mul( s );

	let mask, rough, bump;

	switch ( surface.kind ) {

		case 'volcanic': {
			// Sulphur plains, dark silicate calderas, bright SO2 frost.
			// Sulphur plains streaked by flows, with dark silicate calderas and
			// bright SO2 frost rings around the active vents.
			const plains = mx_fractal_noise_float( p.mul( 0.7 ), 5, 2.1, 0.55 ).mul( 0.5 ).add( 0.5 );
			const flows = mx_fractal_noise_float( p.mul( 2.6 ), 4, 2.3, 0.6 ).mul( 0.5 ).add( 0.5 );
			const calderas = blobs( pos, s.mul( 0.5 ), float( 0.26 ), float( 0.16 ) )
				.add( blobs( pos.add( vec3( 7.7, 2.3, 5.1 ) ), s.mul( 1.3 ), float( 0.16 ), float( 0.10 ) ).mul( 0.7 ) );
			const frost = blobs( pos, s.mul( 0.5 ), float( 0.52 ), float( 0.16 ) ).sub( calderas ).max( 0 );
			mask = saturate( calderas ).mul( 0.95 ).add( plains.mul( 0.3 ) ).add( flows.mul( 0.25 ) ).sub( frost.mul( 0.35 ) );
			bump = plains.sub( calderas.mul( 0.6 ) );
			rough = float( 0.82 ).sub( frost.mul( 0.15 ) );
			break;
		}

		case 'ice': {
			// Smooth plates cut by lineae; brighter along the fracture flanks.
			const plates = mx_fractal_noise_float( p, 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
			const lineae = ridged( p.mul( 1.4 ), 4, 2.2, 0.55 ).mul( float( surface.cracks ?? 0.6 ) );
			const mottle = mx_fractal_noise_float( p.mul( 5.0 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
			mask = lineae.mul( 0.85 ).add( mottle.mul( 0.25 ) ).add( plates.mul( 0.1 ) );
			bump = lineae.mul( 0.6 ).sub( plates.mul( 0.2 ) );
			rough = float( 0.55 ).add( lineae.mul( 0.25 ) );
			break;
		}

		case 'grooved': {
			// Ganymede/Titania: dark ancient terrain crossed by bright sulci.
			const ancient = mx_fractal_noise_float( p.mul( 0.8 ), 5, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
			const sulci = ridged( p.mul( 2.2 ), 3, 2.4, 0.5 );
			const pits = crateredSurface( pos, s.mul( 1.3 ) ).mul( 0.7 );
			mask = smoothstep( 0.42, 0.62, ancient ).mul( 0.7 ).add( sulci.mul( 0.5 ) ).add( pits.mul( 0.4 ) );
			bump = sulci.mul( 0.5 ).add( pits );
			rough = float( 0.78 );
			break;
		}

		case 'cratered': {
			// Saturation cratering over a low-frequency albedo variation.
			const impacts = crateredSurface( pos, s );
			const regolithNoise = mx_fractal_noise_float( p.mul( 3 ), 4, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
			mask = impacts.mul( 0.7 ).add( regolithNoise.mul( 0.4 ) );
			bump = impacts;
			rough = float( 0.9 );
			break;
		}

		case 'twotone': {
			// Iapetus and Pluto: one hemisphere far darker than the other, with a
			// ragged boundary. +x is the leading hemisphere.
			const hemisphere = smoothstep( -0.25, 0.35, pos.x.add(
				mx_fractal_noise_float( p.mul( 1.3 ), 4, 2.0, 0.5 ).mul( 0.45 )
			) );
			const detail = mx_fractal_noise_float( p.mul( 2.5 ), 5, 2.0, 0.5 ).mul( 0.5 ).add( 0.5 );
			mask = hemisphere.mul( 0.85 ).add( detail.mul( 0.3 ) );
			bump = detail.sub( 0.5 ).mul( 0.6 );
			rough = float( 0.88 );
			break;
		}

		case 'hazy':
		default: {
			// Titan: almost no contrast, broad bright/dark provinces.
			const provinces = mx_fractal_noise_float( p, 4, 2.0, 0.6 ).mul( 0.5 ).add( 0.5 );
			mask = provinces;
			bump = float( 0 );
			rough = float( 0.75 );
			break;
		}

	}

	const t = saturate( mix( float( 0.5 ), mask, contrast.mul( 2 ) ) );

	return {
		color: mix( base, accent, saturate( t ) ),
		roughness: saturate( rough ),
		bump: bump || float( 0 )
	};

}

/**
 * Irregular-body displacement. Phobos, Hyperion and the comet nuclei are
 * nowhere near hydrostatic equilibrium; this lumps a sphere into something
 * plausibly potato-shaped, with a few big gouges.
 */
export const irregularDisplacement = /*#__PURE__*/ Fn( ( [ pos, amount ] ) => {
	const lumps = mx_fractal_noise_float( pos.mul( 1.6 ), 3, 2.0, 0.6 ).mul( 0.6 );
	const gouges = oneMinus( smoothstep( 0.0, 0.28, mx_worley_noise_float( pos.mul( 2.4 ), 1 ) ) ).mul( -0.5 );
	return float( 1 ).add( lumps.add( gouges ).mul( amount ) );
} );
