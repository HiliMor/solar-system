import { MeshBasicNodeMaterial, FrontSide, BackSide, AdditiveBlending } from 'three/webgpu';
import {
	Fn, vec3, vec4, float, uniform, positionWorld, cameraPosition, dot, normalize,
	saturate, mix, pow, max, min, smoothstep, oneMinus, length, color, exp, Loop,
	clamp, sqrt, If
} from 'three/tsl';

import { createLightUniforms, solarVisibility, rayleighPhase, miePhase } from './lighting.js';

/**
 * Ray-marched single-scattering atmosphere.
 *
 * The view ray is intersected with a shell around the planet, marched, and at
 * each step the optical depth back out toward the Sun is accumulated -- the
 * Nishita/O'Neil single-scattering integral, with the Rayleigh and Mie terms
 * kept separate so the limb goes blue while the forward glow goes white.
 *
 * That integral is what produces, for free and without any art direction: the
 * blue halo on Earth's limb, the red band along the terminator where sunlight
 * has travelled through the most air, the white forward-scatter when you look
 * back toward the Sun, and Titan's flat orange smog.
 *
 * All geometry is done in world space with the planet centre supplied as a
 * uniform, which keeps every number small thanks to the floating origin.
 */
export function createAtmosphereMaterial( def, options = {} ) {

	const atm = def.atmosphere;

	const material = new MeshBasicNodeMaterial();
	material.side = FrontSide;
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;

	const L = createLightUniforms();

	const extras = {
		exposureBias: uniform( float( 1 ) ),
		/** Planet centre in world space. */
		centre: uniform( vec3( 0, 0, 0 ) ),
		/** Surface and atmosphere-top radii, world units. */
		surfaceRadius: uniform( float( 1 ) ),
		topRadius: uniform( float( 1.03 ) ),
		strength: uniform( float( atm.density ?? 1 ) )
	};

	const STEPS = options.quality === 'low' ? 8 : 16;
	const LIGHT_STEPS = options.quality === 'low' ? 3 : 6;

	// Scattering coefficients.
	//
	// These are calibrated, not dialled in by eye. Densities below are
	// normalised by the shell thickness, so the vertical optical depth works out
	// as beta * integral(exp(-h/H) dh) / thickness = beta * H/thickness, which
	// with H = 0.22 * thickness is beta * 0.218.
	//
	// Earth's Rayleigh optical depth at the zenith is about (0.040, 0.094, 0.230)
	// for red, green and blue, so beta must be about (0.18, 0.43, 1.06) -- which
	// is just the linear colour of a clear sky, times 1.05. Every other body
	// scales that by `rayleigh`. Mie is near-neutral haze at a zenith depth of
	// roughly 0.05, so its beta lands around 0.23.
	const RAYLEIGH_CALIBRATION = 1.05;
	const MIE_CALIBRATION = 1.05;

	const tint = color( atm.color );
	const haze = color( atm.haze ?? 0xfff2e2 );
	const betaRayleigh = vec3( tint ).mul( float( ( atm.rayleigh ?? 1 ) * RAYLEIGH_CALIBRATION ) );
	const betaMie = vec3( haze ).mul( float( ( atm.mie ?? 0.22 ) * MIE_CALIBRATION ) );
	const g = float( atm.g ?? 0.76 );
	const scaleHeightFactor = float( atm.scaleHeight ?? 0.22 );

	material.colorNode = Fn( () => {

		const Rp = extras.surfaceRadius;
		const Ra = extras.topRadius;
		const thickness = max( Ra.sub( Rp ), 1e-6 );
		const H = thickness.mul( scaleHeightFactor );

		const ro = cameraPosition.sub( extras.centre );
		const rd = normalize( positionWorld.sub( cameraPosition ) );

		// --- find the segment of the ray inside the shell ----------------------
		const b = dot( ro, rd );
		const cAtm = dot( ro, ro ).sub( Ra.mul( Ra ) );
		const discAtm = b.mul( b ).sub( cAtm );
		const sAtm = sqrt( max( discAtm, float( 0 ) ) );

		const tStart = max( b.negate().sub( sAtm ), float( 0 ) );
		let tEnd = b.negate().add( sAtm );

		// Stop at the planet if the ray hits it.
		const cSurf = dot( ro, ro ).sub( Rp.mul( Rp ) );
		const discSurf = b.mul( b ).sub( cSurf );
		const tSurface = b.negate().sub( sqrt( max( discSurf, float( 0 ) ) ) );
		tEnd = discSurf.greaterThan( 0 ).and( tSurface.greaterThan( tStart ) )
			.select( min( tEnd, tSurface ), tEnd );

		const segment = max( tEnd.sub( tStart ), float( 0 ) );
		const ds = segment.div( float( STEPS ) );

		const sunDir = L.sunDirection;
		const cosTheta = dot( rd, sunDir );
		const phaseR = rayleighPhase( cosTheta );
		const phaseM = miePhase( cosTheta, g );

		const accumR = vec3( 0 ).toVar();
		const accumM = vec3( 0 ).toVar();
		const opticalR = float( 0 ).toVar();
		const opticalM = float( 0 ).toVar();

		Loop( STEPS, ( { i } ) => {

			const t = tStart.add( ds.mul( float( i ).add( 0.5 ) ) );
			const p = ro.add( rd.mul( t ) );

			const height = length( p ).sub( Rp );
			const density = exp( height.div( H ).negate() ).mul( ds ).div( thickness );

			opticalR.addAssign( density );
			opticalM.addAssign( density );

			// --- optical depth from this sample out toward the Sun -------------
			const bl = dot( p, sunDir );
			const cl = dot( p, p ).sub( Ra.mul( Ra ) );
			const tLight = bl.negate().add( sqrt( max( bl.mul( bl ).sub( cl ), float( 0 ) ) ) );
			const dsl = max( tLight, float( 0 ) ).div( float( LIGHT_STEPS ) );

			const lightOptical = float( 0 ).toVar();

			Loop( LIGHT_STEPS, ( { i: j } ) => {
				const lp = p.add( sunDir.mul( dsl.mul( float( j ).add( 0.5 ) ) ) );
				const lh = max( length( lp ).sub( Rp ), float( 0 ) );
				lightOptical.addAssign( exp( lh.div( H ).negate() ).mul( dsl ).div( thickness ) );
			} );

			// Ground shadow: samples on the night side of the terminator see no Sun.
			const groundShadow = smoothstep(
				float( -0.02 ), float( 0.06 ),
				dot( normalize( p ), sunDir ).add( saturate( height.div( thickness ) ).mul( 0.25 ) )
			);

			// Extinction along the whole path travelled so far: in from the Sun
			// to this sample, then out to the eye. Mie extinction exceeds Mie
			// scattering because aerosols absorb as well as scatter.
			const transmittance = exp(
				betaRayleigh.mul( opticalR.add( lightOptical ) )
					.add( betaMie.mul( 1.1 ).mul( opticalM.add( lightOptical ) ) )
					.negate()
			);

			accumR.addAssign( transmittance.mul( density ).mul( groundShadow ) );
			accumM.addAssign( transmittance.mul( density ).mul( groundShadow ) );

		} );

		const visibility = solarVisibility( positionWorld, sunDir, L.sunAngularRadius, L.occluders );

		const scattered = betaRayleigh.mul( accumR ).mul( phaseR )
			.add( betaMie.mul( accumM ).mul( phaseM ) );

		// The phase functions carry a 1/4pi, so the result is a radiance ratio
		// L/E. Surfaces in this scene are shaded as albedo * cos(theta), which is
		// pi * L/E, so the atmosphere is multiplied by pi to sit on the same
		// scale. Without that the sky would be a factor of three too dark
		// relative to the ground beneath it.
		const outColour = scattered
			.mul( Math.PI )
			.mul( L.irradiance )
			.mul( visibility )
			.mul( extras.strength )
			.mul( extras.exposureBias );

		return vec4( max( outColour, vec3( 0 ) ), 1 );

	} )();

	return {
		material, uniforms: { ...L, ...extras },
		/** Flip culling when the camera crosses into the shell. */
		setInside( inside ) {
			const want = inside ? BackSide : FrontSide;
			if ( material.side !== want ) { material.side = want; material.needsUpdate = true; }
		}
	};

}
