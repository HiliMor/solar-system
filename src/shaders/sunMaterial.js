import { MeshBasicNodeMaterial, AdditiveBlending, FrontSide, BackSide, DoubleSide } from 'three/webgpu';
import {
	Fn, vec2, vec3, vec4, float, uniform, texture, uv, positionLocal, positionWorld,
	normalWorld, cameraPosition, dot, normalize, saturate, mix, pow, max, min, abs,
	smoothstep, oneMinus, length, color, exp, sin, cos, mx_fractal_noise_float,
	mx_noise_float, mx_worley_noise_float, clamp
} from 'three/tsl';

/**
 * The photosphere.
 *
 * Three things make a rendered star stop looking like a glowing ball:
 *
 *   limb darkening -- the Sun is 40% dimmer at the edge of the disc than at
 *     the centre, because near the limb you see higher, cooler layers. The
 *     Eddington approximation, I(mu)/I(1) = 1 - u(1 - mu), is close enough.
 *
 *   granulation -- convection cells about 1,000 km across, rising bright in
 *     the middle and sinking dark at the edges, turning over in ~8 minutes.
 *
 *   temperature colour -- the hot upwellings are measurably bluer than the
 *     cool lanes, not just brighter.
 */
export function createSunMaterial( def, textures, timeUniform ) {

	const material = new MeshBasicNodeMaterial();
	material.side = FrontSide;
	material.toneMapped = true;

	const extras = {
		time: timeUniform,
		exposureBias: uniform( float( 1 ) ),
		activity: uniform( float( 1 ) ),
		brightness: uniform( float( 1 ) )
	};

	const map = def.texture ? textures.get( def.texture ) : null;

	// 5772 K blackbody, normalised so the disc centre is near white.
	const hot = color( 0xfff4e0 );
	const cool = color( 0xff9a3c );
	const spot = color( 0x923c10 );

	material.colorNode = Fn( () => {

		const N = normalize( normalWorld );
		const V = normalize( cameraPosition.sub( positionWorld ) );
		const mu = saturate( dot( N, V ) );

		// Eddington limb darkening.
		const limb = float( 1 ).sub( float( 0.62 ).mul( oneMinus( mu ) ) );

		const p = normalize( positionLocal );
		const t = extras.time.mul( 0.035 );

		// Granulation: two scales, the finer one advecting faster.
		const gran = mx_fractal_noise_float( p.mul( 26 ).add( vec3( t, t.mul( 0.7 ), t.mul( -0.5 ) ) ), 4, 2.1, 0.55 );
		const fine = mx_fractal_noise_float( p.mul( 70 ).add( vec3( t.mul( 2.1 ) ) ), 3, 2.0, 0.5 );
		const granulation = gran.mul( 0.65 ).add( fine.mul( 0.35 ) );

		// Supergranulation and active regions drift much more slowly.
		const active = mx_fractal_noise_float( p.mul( 4.5 ).add( vec3( t.mul( 0.12 ) ) ), 3, 2.0, 0.6 );

		// Sunspot umbrae: rare, dark, and only inside active latitudes.
		const latitudeBand = oneMinus( smoothstep( 0.18, 0.55, abs( p.y ) ) );
		const spotField = mx_worley_noise_float( p.mul( 6 ).add( vec3( t.mul( 0.05 ) ) ), 1 );
		const spots = oneMinus( smoothstep( 0.0, 0.10, spotField ) )
			.mul( latitudeBand ).mul( extras.activity );

		let base = map
			? texture( map, uv() ).rgb
			: mix( cool, hot, saturate( granulation.mul( 0.5 ).add( 0.55 ) ) );

		// Modulate whatever the base is with live convection.
		const temperature = saturate( granulation.mul( 0.5 ).add( 0.5 ).mul( 0.8 ).add( active.mul( 0.2 ).add( 0.2 ) ) );

		base = base.mul( float( 0.78 ).add( temperature.mul( 0.5 ) ) );
		base = mix( base, base.mul( hot ).mul( 1.25 ), saturate( temperature.sub( 0.55 ).mul( 2.4 ) ) );
		base = mix( base, spot.mul( 0.22 ), spots.mul( 0.85 ) );

		// Faculae: bright ribbons around the spots, brightest at the limb.
		const faculae = smoothstep( 0.10, 0.22, spotField ).mul( oneMinus( smoothstep( 0.22, 0.34, spotField ) ) )
			.mul( latitudeBand ).mul( oneMinus( mu ) ).mul( extras.activity );
		base = base.add( hot.mul( faculae ).mul( 0.35 ) );

		// A thin chromospheric rim -- the red edge just past the photosphere.
		const rim = pow( oneMinus( mu ), 6 ).mul( 0.9 );
		base = base.add( vec3( 1.0, 0.32, 0.16 ).mul( rim ) );

		// The photosphere is rendered far brighter than the scene's white point.
		// It has to be: it is about a hundred thousand times brighter than a
		// sunlit surface, and anything dimmer reads as a warm ball rather than
		// as something you cannot look at. As it saturates, it is pushed toward
		// white -- every eye and every sensor loses hue long before it stops
		// responding, which is why the Sun looks white and not orange.
		const intensity = base.mul( limb ).mul( extras.brightness ).mul( 42 );
		const whiteOut = saturate( limb.mul( extras.brightness ).mul( 1.4 ) );
		const shown = mix( intensity, vec3( 1, 1, 1 ).mul( intensity.r.add( intensity.g ).add( intensity.b ).div( 3 ) ), whiteOut.mul( 0.8 ) );

		return vec4( shown.mul( extras.exposureBias ), 1 );

	} )();

	return { material, uniforms: extras };

}

/**
 * Corona and inner K-corona glow, on a large additive shell.
 *
 * Falls off as roughly r^-2.5 with streamers modulated by latitude, which is
 * what the corona actually does outside solar maximum.
 */
export function createCoronaMaterial( timeUniform ) {

	const material = new MeshBasicNodeMaterial();
	material.side = BackSide;
	material.transparent = true;
	material.depthWrite = false;
	material.depthTest = true;
	material.blending = AdditiveBlending;

	const extras = {
		time: timeUniform,
		exposureBias: uniform( float( 1 ) ),
		centre: uniform( vec3( 0, 0, 0 ) ),
		surfaceRadius: uniform( float( 1 ) ),
		outerRadius: uniform( float( 3 ) ),
		strength: uniform( float( 1 ) )
	};

	material.colorNode = Fn( () => {

		const ro = cameraPosition.sub( extras.centre );
		const rd = normalize( positionWorld.sub( cameraPosition ) );

		// Closest approach of the view ray to the star: the corona is optically
		// thin, so brightness follows the impact parameter rather than the shell
		// surface. This keeps the glow round from every angle and distance.
		const tClosest = dot( ro.negate(), rd );
		const closest = ro.add( rd.mul( max( tClosest, float( 0 ) ) ) );
		const impact = length( closest ).div( extras.surfaceRadius );

		// The K-corona is a millionth of the photosphere's surface brightness and
		// falls off steeply; anything flatter than this reads as a lens flare.
		const falloff = pow( max( impact, float( 1.0 ) ), -2.4 );

		// Streamers: brighter at the equator, structured in longitude.
		const dir = normalize( closest );
		const lat = abs( dir.y );
		const equatorial = float( 0.45 ).add( oneMinus( smoothstep( 0.05, 0.9, lat ) ).mul( 0.85 ) );
		const streamers = mx_fractal_noise_float(
			dir.mul( 5.5 ).add( vec3( extras.time.mul( 0.008 ) ) ), 3, 2.0, 0.55
		).mul( 0.5 ).add( 0.75 );

		const intensity = falloff.mul( equatorial ).mul( streamers )
			.mul( oneMinus( smoothstep( float( 1 ), extras.outerRadius.div( extras.surfaceRadius ), impact ) ) );

		const tint = mix( color( 0xfff0d0 ), color( 0xbcd4ff ), saturate( impact.sub( 1.4 ).mul( 0.35 ) ) );

		// Corona brightness is set against the two skies it has to work in. Near
		// the limb it is roughly a millionth of the photosphere, which puts it
		// well under a daylit sky -- so it stays invisible during the partial
		// phases, exactly as it does in life -- and several times brighter than
		// the sky inside an umbra, so it appears at second contact.
		return vec4( tint.mul( intensity ).mul( extras.strength ).mul( extras.exposureBias ).mul( 0.016 ), 1 );

	} )();

	return { material, uniforms: extras };

}
