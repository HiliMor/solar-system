import { Group, Vector3 } from 'three';

import { PLANETS, SUN } from '../data/planets.js';
import { MOONS } from '../data/moons.js';
import { DWARF_PLANETS, COMETS, SPACECRAFT } from '../data/smallBodies.js';
import {
	AU_KM, KM_PER_UNIT, DEG, DAYS_PER_CENTURY, SUN_RADIUS_KM, DAYS_PER_YEAR
} from '../data/constants.js';

import { planetState, fixedElementState, orbitShape, makeState } from '../physics/ephemeris.js';
import { moonState } from '../physics/lunar.js';
import { poleToEcliptic } from '../physics/frames.js';
import { Body } from './Body.js';
import { OrbitPath } from './OrbitPath.js';
import { createSunMaterial, createCoronaMaterial } from '../shaders/sunMaterial.js';
import { createBelt, BELT_CONFIGS } from './SmallBodies.js';
import { createCometTail } from './CometTail.js';
import { createSpacecraftMarker } from './Spacecraft.js';
import { sphereDetailFor } from './geometry.js';
import { Mesh } from 'three';

const _state = makeState();
const _pole = { x: 0, y: 0, z: 1 };
const _basisX = { x: 1, y: 0, z: 0 };
const _basisY = { x: 0, y: 1, z: 0 };
const _sunWorld = new Vector3();
const _v = new Vector3();
const _velocity = new Vector3();

/** Ecliptic north, for building a parent's equatorial basis. */
const ECLIPTIC_NORTH = { x: 0, y: 0, z: 1 };

function normalise( v ) {
	const l = Math.hypot( v.x, v.y, v.z ) || 1;
	v.x /= l; v.y /= l; v.z /= l;
	return v;
}

function cross( a, b, out ) {
	const x = a.y * b.z - a.z * b.y;
	const y = a.z * b.x - a.x * b.z;
	const z = a.x * b.y - a.y * b.x;
	out.x = x; out.y = y; out.z = z;
	return out;
}

/**
 * Builds and drives every body in the scene.
 *
 * The update order matters and is deliberate:
 *
 *   1. integrate positions in float64, in real physical units
 *   2. apply the scale policy to get render positions
 *   3. pick the floating origin, and only then convert to float32 transforms
 *   4. orient each body from its rotation model
 *   5. work out who is casting a shadow on whom, and feed the lighting uniforms
 *
 * Steps 1 and 2 never see the render scale distortion, so distances, phases and
 * illumination stay physically correct no matter how the view is squashed.
 */
export class SolarSystem {

	constructor( textures, options = {} ) {

		this.textures = textures;
		this.options = options;

		this.root = new Group();

		this.orbitRoot = new Group();
		this.root.add( this.orbitRoot );

		// Heliocentric paths are sampled in Sun-centred coordinates, so they ride
		// a group pinned to the Sun's *rendered* position. Without that they draw
		// at absolute coordinates while every body is drawn relative to the
		// floating origin, and the orbits detach from the system the moment the
		// focus is anything but the Sun.
		this.heliocentricOrbits = new Group();
		this.orbitRoot.add( this.heliocentricOrbits );

		this.bodies = [];
		this.byId = new Map();
		this.orbits = new Map();

		this.showOrbits = true;
		this.showMoons = true;
		this.showDwarfs = true;
		this.showComets = true;

		this._buildSun();
		this._buildPlanets();
		this._buildDwarfPlanets();
		this._buildMoons();
		this._buildComets();
		this._buildSpacecraft();
		this._buildBelts();

		this._linkHierarchy();

	}

	// -- construction --------------------------------------------------------

	_register( body ) {
		this.bodies.push( body );
		this.byId.set( body.id, body );
		this.root.add( body.group );
		return body;
	}

	_buildSun() {

		const def = SUN;
		this.sun = new Body( { ...def, airless: false }, this.textures );

		// The Sun gets its own emissive material rather than the lit one.
		const sunMat = createSunMaterial( def, this.textures, this.options.timeUniform );
		this.sun.mesh.material.dispose();
		this.sun.mesh.material = sunMat.material;
		this.sun.material = sunMat.material;
		this.sunUniforms = sunMat.uniforms;
		this.sun.litUniforms = [];

		// Corona shell.
		const corona = createCoronaMaterial( this.options.timeUniform );
		this.coronaUniforms = corona.uniforms;
		this.corona = new Mesh( sphereDetailFor( 1000 ), corona.material );
		this.corona.frustumCulled = false;
		this.corona.renderOrder = 4;
		this.sun.group.add( this.corona );

		this._register( this.sun );

	}

	_buildPlanets() {
		for ( const def of PLANETS ) {
			const body = this._register( new Body( def, this.textures, this.options ) );
			body.kind = 'planet';
			body.orbitAU = def.elements.a;
			this._makeOrbit( body, def.color, 0.55 );
		}
	}

	_buildDwarfPlanets() {
		for ( const def of DWARF_PLANETS ) {
			const body = this._register( new Body( def, this.textures, this.options ) );
			body.kind = 'dwarf';
			body.orbitAU = def.elements ? def.elements.a : def.a;
			this._makeOrbit( body, def.color, 0.32 );
		}
	}

	_buildMoons() {
		for ( const def of MOONS ) {
			const body = this._register( new Body( def, this.textures, this.options ) );
			body.kind = 'moon';
			body.parentId = def.parent;
			this._makeOrbit( body, def.color, 0.35, true );
		}
	}

	_buildComets() {
		for ( const def of COMETS ) {
			const body = this._register( new Body( { ...def, radius: def.radius }, this.textures, this.options ) );
			body.kind = 'comet';
			body.orbitAU = def.a;
			this._makeOrbit( body, 0x7fd4ff, 0.3 );

			const tail = createCometTail( def );
			this.root.add( tail.object );
			body.tail = tail;
		}
	}

	_buildSpacecraft() {
		this.spacecraft = SPACECRAFT.map( ( def ) => {
			const marker = createSpacecraftMarker( def );
			this.root.add( marker.group );
			this.orbitRoot.add( marker.trail );
			return {
				def,
				id: def.id,
				name: def.name,
				type: 'spacecraft',
				kind: 'spacecraft',
				marker,
				group: marker.group,
				renderPosition: { x: 0, y: 0, z: 0 },
				truePosition: { x: 0, y: 0, z: 0 },
				distanceFromSunKm: 0,
				radiusUnits: 0
			};
		} );
	}

	_buildBelts() {
		this.belts = BELT_CONFIGS.map( ( config ) => {
			const belt = createBelt( config );
			this.root.add( belt.object );
			return belt;
		} );
	}

	/**
	 * Updates the comet tails.
	 *
	 * Activity is driven by heliocentric distance: sublimation of water ice only
	 * really starts inside about 3 AU, and rises steeply from there, which is why
	 * a comet is an inert lump for most of its orbit and grows a tail spanning
	 * tens of millions of kilometres for a few months around perihelion.
	 */
	updateComets( scale, frame, camera, exposure ) {

		const pixelScale = window.innerHeight / ( 2 * Math.tan( camera.fov * DEG / 2 ) );

		for ( const body of this.bodies ) {

			if ( ! body.tail ) continue;

			const u = body.tail.uniforms;
			const distanceAU = body.distanceFromSunKm / AU_KM;

			// Rises as roughly 1/r^2 once inside the sublimation line, and is
			// clamped so Hale-Bopp at 0.9 AU does not fill the sky.
			const onset = 3.4;
			const raw = distanceAU < onset
				? Math.min( 1, Math.pow( onset / Math.max( distanceAU, 0.12 ), 2 ) / 9 )
				: 0;
			const activity = raw * ( body.def.tail?.activity ?? 1 );

			body.tail.object.visible = activity > 0.002 && body.group.visible;
			if ( ! body.tail.object.visible ) continue;

			u.activity.value = Math.min( activity, 1.6 );
			u.pixelScale.value = pixelScale;
			u.exposureBias.value = exposure;
			u.nucleus.value.copy( body.group.position );

			// Direction to the Sun, and the direction of travel.
			_v.copy( this.sunWorld ).sub( body.group.position ).normalize();
			u.sunDirection.value.copy( _v );

			const state = body.heliocentricState;
			if ( state ) {
				frame.dirToWorld( state.vx, state.vy, state.vz, _velocity ).normalize();
				u.velocity.value.copy( _velocity );
			}

			// Real tails run tens of millions of km; expressed against the local
			// orbit scale so they stay proportionate in either view mode.
			const unitsPerAU = body.orbitUnitsPerAU || scale.unitsPerAU( distanceAU );
			u.dustLength.value = unitsPerAU * 0.32 * ( body.def.tail?.dust ?? 1 ) * Math.min( activity * 1.6, 1.4 );
			u.ionLength.value = unitsPerAU * 0.62 * ( body.def.tail?.ion ?? 1 ) * Math.min( activity * 1.8, 1.5 );

		}

	}

	/** Places the probe markers and redraws their escape trajectories. */
	updateSpacecraft( scale, frame, camera, exposureCompensation = 1 ) {

		const pixelScale = window.innerHeight / ( 2 * Math.tan( camera.fov * DEG / 2 ) );

		for ( const craft of this.spacecraft ) {
			if ( ! craft.group.visible ) continue;
			craft.marker.uniforms.pixelScale.value = pixelScale;
			craft.marker.uniforms.exposureCompensation.value = exposureCompensation;
			craft.marker.updateTrajectory( craft.direction, craft.distanceAU, scale, frame );
		}

	}

	/** Feeds the belts the frame's time, scale and camera parameters. */
	updateBelts( days, scale, frame, camera, exposure ) {

		if ( ! this.belts ) return;

		// One pixel of screen size per world unit at unit depth.
		const pixelScale = window.innerHeight / ( 2 * Math.tan( camera.fov * DEG / 2 ) );

		for ( const belt of this.belts ) {
			belt.uniforms.days.value = days;
			belt.uniforms.blend.value = scale.blend;
			belt.uniforms.origin.value.set( frame.origin.x, frame.origin.y, frame.origin.z );
			belt.uniforms.pixelScale.value = pixelScale;
			belt.uniforms.exposureBias.value = exposure;
		}

	}

	_makeOrbit( body, tint, opacity, isMoonOrbit = false ) {
		const path = new OrbitPath( tint ?? 0x5588cc, opacity );
		path.isMoonOrbit = isMoonOrbit;
		path.bodyId = body.id;
		this.orbits.set( body.id, path );
		if ( isMoonOrbit ) {
			// Moon paths are drawn in the parent's frame so their vertices stay
			// small -- see the note on precision in core/Frame.js.
			body.orbitAnchor = new Group();
			this.orbitRoot.add( body.orbitAnchor );
			body.orbitAnchor.add( path.line );
		} else {
			this.heliocentricOrbits.add( path.line );
		}
		body.orbitPath = path;
	}

	_linkHierarchy() {
		for ( const body of this.bodies ) {
			if ( body.parentId ) {
				const parent = this.byId.get( body.parentId );
				if ( parent ) {
					body.parent = parent;
					parent.children.push( body );
				}
			}
		}
	}

	// -- per-frame integration ----------------------------------------------

	/**
	 * Advances every body to `days` past J2000 and writes render transforms.
	 *
	 * @param {number} days
	 * @param {Scale} scale
	 * @param {Frame} frame  floating origin (its origin must already be set)
	 */
	integrate( days, scale ) {

		const T = days / DAYS_PER_CENTURY;

		// --- Sun at the origin of the heliocentric frame -----------------------
		this.sun.truePosition.x = this.sun.truePosition.y = this.sun.truePosition.z = 0;
		this.sun.renderPosition.x = this.sun.renderPosition.y = this.sun.renderPosition.z = 0;
		this.sun.distanceFromSunKm = SUN_RADIUS_KM;

		// --- planets and dwarf planets ----------------------------------------
		for ( const body of this.bodies ) {

			if ( body.kind === 'planet' || ( body.kind === 'dwarf' && body.def.elements ) ) {

				planetState( body.def.elements, T, _state );
				this._placeHeliocentric( body, _state, scale, body.def.elements.a + body.def.elements.adot * T );

			} else if ( body.kind === 'dwarf' || body.kind === 'comet' ) {

				const def = body.def;
				fixedElementState( def, days, def.period * DAYS_PER_YEAR, _state );
				this._placeHeliocentric( body, _state, scale, def.a );

			}

		}

		// --- moons, after their parents are positioned -------------------------
		for ( const body of this.bodies ) {
			if ( body.kind !== 'moon' ) continue;
			this._placeSatellite( body, days, scale );
		}

		// --- barycentre corrections -------------------------------------------
		// The JPL element set for "Earth" is really the Earth-Moon barycentre,
		// and Pluto's is the Pluto-Charon barycentre. Both pairs are massive
		// enough that the offset is visible: Earth swings 4,670 km about the
		// barycentre every month, which is most of an Earth radius.
		this._applyBarycentre( 'earth', 'luna', scale );
		this._applyBarycentre( 'pluto', 'charon', scale );

		// --- spacecraft ---------------------------------------------------------
		for ( const craft of this.spacecraft ) this._placeSpacecraft( craft, days, scale );

		// --- distances from the Sun, used for illumination ---------------------
		for ( const body of this.bodies ) {
			const p = body.truePosition;
			body.distanceFromSunKm = Math.max( Math.hypot( p.x, p.y, p.z ), SUN_RADIUS_KM );
		}
		this.sun.distanceFromSunKm = AU_KM;

	}

	_placeHeliocentric( body, state, scale, semiMajorAU ) {

		const k = scale.unitsPerAU( semiMajorAU );

		body.truePosition.x = state.position.x * AU_KM;
		body.truePosition.y = state.position.y * AU_KM;
		body.truePosition.z = state.position.z * AU_KM;

		body.renderPosition.x = state.position.x * k;
		body.renderPosition.y = state.position.y * k;
		body.renderPosition.z = state.position.z * k;

		body.orbitPhaseAngle = state.eccentricAnomaly;
		body.heliocentricState = {
			r: state.r, trueAnomaly: state.trueAnomaly,
			vx: state.velocity.x, vy: state.velocity.y, vz: state.velocity.z
		};
		body.orbitUnitsPerAU = k;

	}

	/**
	 * Basis that takes a satellite's orbital elements out of its parent's
	 * equatorial plane and into the ecliptic.
	 *
	 * X is the ascending node of the parent's equator on the ecliptic, Z is the
	 * parent's north pole. Consistent, and it puts every regular satellite in
	 * the plane it actually occupies -- the Galileans on Jupiter's equator,
	 * Triton retrograde at 157 degrees, Iapetus tilted 15 degrees out.
	 */
	_parentEquatorBasis( parent, days ) {

		if ( ! parent.def.rotation ) {
			_basisX.x = 1; _basisX.y = 0; _basisX.z = 0;
			_basisY.x = 0; _basisY.y = 1; _basisY.z = 0;
			_pole.x = 0; _pole.y = 0; _pole.z = 1;
			return;
		}

		const rot = parent.def.rotation;
		const T = days / DAYS_PER_CENTURY;
		poleToEcliptic( rot.ra + ( rot.raDot || 0 ) * T, rot.dec + ( rot.decDot || 0 ) * T, _pole );
		normalise( _pole );

		cross( ECLIPTIC_NORTH, _pole, _basisX );
		if ( Math.hypot( _basisX.x, _basisX.y, _basisX.z ) < 1e-8 ) {
			_basisX.x = 1; _basisX.y = 0; _basisX.z = 0;
		}
		normalise( _basisX );
		cross( _pole, _basisX, _basisY );
		normalise( _basisY );

	}

	_placeSatellite( body, days, scale ) {

		const def = body.def;
		const parent = body.parent;
		if ( ! parent ) return;

		if ( def.theory === 'elp' ) {
			// The Moon gets a real perturbation series rather than an ellipse. A
			// Keplerian Moon is a degree or more out of position, which is twice
			// its own apparent diameter -- enough to miss every eclipse.
			moonState( days, _state );
		} else {
			// The mean anomaly advances at the anomalistic rate where that differs
			// measurably from the sidereal one -- see the note on Luna's elements.
			fixedElementState( def, days, def.anomalisticPeriod || def.period, _state );
		}

		let rx = _state.position.x, ry = _state.position.y, rz = _state.position.z;
		let vx = _state.velocity.x, vy = _state.velocity.y, vz = _state.velocity.z;

		if ( def.frame === 'equator' ) {
			this._parentEquatorBasis( parent, days );
			const x = rx, y = ry, z = rz;
			rx = _basisX.x * x + _basisY.x * y + _pole.x * z;
			ry = _basisX.y * x + _basisY.y * y + _pole.y * z;
			rz = _basisX.z * x + _basisY.z * y + _pole.z * z;
			const ax = vx, ay = vy, az = vz;
			vx = _basisX.x * ax + _basisY.x * ay + _pole.x * az;
			vy = _basisX.y * ax + _basisY.y * ay + _pole.y * az;
			vz = _basisX.z * ax + _basisY.z * ay + _pole.z * az;
		}

		// Elements are in km, so the relative position is already physical.
		body.relativePosition = { x: rx, y: ry, z: rz };
		body.relativeVelocity = { x: vx, y: vy, z: vz };

		body.truePosition.x = parent.truePosition.x + rx;
		body.truePosition.y = parent.truePosition.y + ry;
		body.truePosition.z = parent.truePosition.z + rz;

		// Satellite orbits stay physically true unless the parent's rendered
		// radius would swallow them (Phobos, or any use of the size slider).
		const parentRadiusUnits = scale.radius( parent.def.radius );
		const expand = scale.moonOrbit( def.a * ( 1 - def.e ), parentRadiusUnits );
		const f = expand / KM_PER_UNIT;
		body.moonOrbitScale = expand;

		body.renderPosition.x = parent.renderPosition.x + rx * f;
		body.renderPosition.y = parent.renderPosition.y + ry * f;
		body.renderPosition.z = parent.renderPosition.z + rz * f;

		body.orbitPhaseAngle = _state.eccentricAnomaly;
		body.orbitUnitsPerAU = f;

	}

	_applyBarycentre( primaryId, secondaryId, scale ) {

		const primary = this.byId.get( primaryId );
		const secondary = this.byId.get( secondaryId );
		if ( ! primary || ! secondary || ! secondary.relativePosition ) return;

		const mu = secondary.def.mass / ( primary.def.mass + secondary.def.mass );
		const r = secondary.relativePosition;

		// Shift the primary back from the barycentre; the satellite's absolute
		// position was built from the primary, so it moves with it.
		const dx = - r.x * mu, dy = - r.y * mu, dz = - r.z * mu;

		primary.truePosition.x += dx;
		primary.truePosition.y += dy;
		primary.truePosition.z += dz;

		const f = ( secondary.moonOrbitScale || 1 ) / KM_PER_UNIT;
		primary.renderPosition.x += dx * f;
		primary.renderPosition.y += dy * f;
		primary.renderPosition.z += dz * f;

		secondary.truePosition.x += dx;
		secondary.truePosition.y += dy;
		secondary.truePosition.z += dz;
		secondary.renderPosition.x += dx * f;
		secondary.renderPosition.y += dy * f;
		secondary.renderPosition.z += dz * f;

	}

	/**
	 * Interstellar probes are on hyperbolic escape trajectories, so they get a
	 * published state extrapolated along a fixed asymptote rather than an
	 * ellipse. Accurate to a fraction of a percent over decades; it is an
	 * extrapolation, not an ephemeris lookup, and the info panel says so.
	 */
	_placeSpacecraft( craft, days, scale ) {

		const def = craft.def;
		const years = ( days - def.refDays ) / DAYS_PER_YEAR;
		const distanceAU = Math.max( def.refDistanceAU + def.rateAUPerYear * years, 0.05 );

		const lon = def.lonDeg * DEG;
		const lat = def.latDeg * DEG;
		const cl = Math.cos( lat );

		const ux = cl * Math.cos( lon );
		const uy = cl * Math.sin( lon );
		const uz = Math.sin( lat );

		craft.truePosition.x = ux * distanceAU * AU_KM;
		craft.truePosition.y = uy * distanceAU * AU_KM;
		craft.truePosition.z = uz * distanceAU * AU_KM;

		const k = scale.unitsPerAU( distanceAU );
		craft.renderPosition.x = ux * distanceAU * k;
		craft.renderPosition.y = uy * distanceAU * k;
		craft.renderPosition.z = uz * distanceAU * k;

		craft.distanceFromSunKm = distanceAU * AU_KM;
		craft.distanceAU = distanceAU;
		craft.direction = { x: ux, y: uy, z: uz };

	}

	// -- transforms and lighting --------------------------------------------

	/** Writes three.js transforms once the frame origin is chosen. */
	applyTransforms( frame, days ) {

		for ( const body of this.bodies ) {
			const p = body.renderPosition;
			frame.toWorld( p.x, p.y, p.z, body.group.position );
			body.orient( days, frame );
		}

		frame.toWorld( 0, 0, 0, _sunWorld );
		this.sunWorld = _sunWorld;
		this.heliocentricOrbits.position.copy( _sunWorld );

		for ( const craft of this.spacecraft ) {
			const p = craft.renderPosition;
			frame.toWorld( p.x, p.y, p.z, craft.group.position );
		}

		// Moon orbit paths ride their parent so their vertices stay small.
		for ( const body of this.bodies ) {
			if ( body.orbitAnchor && body.parent ) {
				const p = body.parent.renderPosition;
				frame.toWorld( p.x, p.y, p.z, body.orbitAnchor.position );
			}
		}

	}

	/**
	 * Decides which bodies can shadow which, and pushes the lighting uniforms.
	 *
	 * Only a body's parent, its siblings and its own primary can realistically
	 * eclipse it at these separations, which keeps the occluder list to four
	 * slots and the test to a handful of instructions.
	 */
	updateLighting( exposure ) {

		const sunWorld = this.sunWorld;

		for ( const body of this.bodies ) {

			if ( body.isSun ) {

				this.sunUniforms.exposureBias.value = exposure;
				this.coronaUniforms.exposureBias.value = exposure;

				// The corona works from the impact parameter of the view ray
				// against the Sun's centre, so it needs that centre in world
				// space every frame. Leaving it at the origin only looks right
				// while the Sun happens to be the focus -- from anywhere else
				// the falloff flattens and the corona becomes a painted disc.
				this.coronaUniforms.centre.value.copy( body.group.position );

				continue;

			}

			const occluders = body._occluders || ( body._occluders = [] );
			occluders.length = 0;

			if ( body.kind === 'moon' && body.parent ) {
				occluders.push( this._occluder( body.parent ) );
				for ( const sibling of body.parent.children ) {
					if ( sibling !== body && occluders.length < 4 ) occluders.push( this._occluder( sibling ) );
				}
			} else {
				// A planet can be eclipsed by its own moons -- Io's shadow on
				// Jupiter is the classic case.
				for ( const moon of body.children ) {
					if ( occluders.length < 4 ) occluders.push( this._occluder( moon ) );
				}
			}

			body.updateLighting( sunWorld, exposure, occluders );

			// Rings are shadowed by their own planet, which is not in the list
			// above because a body never occludes itself.
			for ( const ring of body.rings ) {
				const self = this._occluder( body );
				ring.uniforms.occluders[ 0 ].value.set( self.x, self.y, self.z, self.r );
				for ( let k = 1; k < ring.uniforms.occluders.length; k ++ ) {
					const o = occluders[ k - 1 ];
					if ( o ) ring.uniforms.occluders[ k ].value.set( o.x, o.y, o.z, o.r );
					else ring.uniforms.occluders[ k ].value.set( 0, 0, 0, 0 );
				}
			}

		}

	}

	_occluder( body ) {
		const p = body.group.position;
		return { x: p.x, y: p.y, z: p.z, r: body.radiusUnits };
	}

	// -- scale ---------------------------------------------------------------

	applyScale( scale, days ) {

		const T = days / DAYS_PER_CENTURY;

		for ( const body of this.bodies ) body.applyScale( scale );

		this.corona.scale.setScalar( this.sun.radiusUnits * 4.6 );
		this.coronaUniforms.surfaceRadius.value = this.sun.radiusUnits;
		this.coronaUniforms.outerRadius.value = this.sun.radiusUnits * 4.6;

		for ( const body of this.bodies ) {

			const path = this.orbits.get( body.id );
			if ( ! path ) continue;

			if ( body.kind === 'moon' ) {
				const def = body.def;
				const shape = {
					a: def.a, e: def.e, i: def.i * DEG,
					om: def.node * DEG, w: def.peri * DEG
				};
				if ( def.frame === 'equator' ) {
					// Bake the parent's equatorial basis into the sampled path.
					this._parentEquatorBasis( body.parent, days );
					path.update( shape, ( body.moonOrbitScale || 1 ) / KM_PER_UNIT );
					this._rotatePathIntoEquator( path );
				} else {
					path.update( shape, ( body.moonOrbitScale || 1 ) / KM_PER_UNIT );
				}
			} else {
				const shape = orbitShape( body.def, T );
				path.update( shape, body.orbitUnitsPerAU || scale.unitsPerAU( shape.a ) );
			}

		}

	}

	/** Applies the cached parent-equator basis to an already-sampled moon path. */
	_rotatePathIntoEquator( path ) {

		const p = path.positions;

		for ( let i = 0; i < p.length; i += 3 ) {
			// The buffer holds three.js axes, so convert back, rotate, convert on.
			const ex = p[ i ], ey = - p[ i + 2 ], ez = p[ i + 1 ];
			const x = _basisX.x * ex + _basisY.x * ey + _pole.x * ez;
			const y = _basisX.y * ex + _basisY.y * ey + _pole.y * ez;
			const z = _basisX.z * ex + _basisY.z * ey + _pole.z * ez;
			p[ i ] = x; p[ i + 1 ] = z; p[ i + 2 ] = - y;
		}

		path.geometry.attributes.position.needsUpdate = true;

	}

	/**
	 * Advances the fade on every orbit path to match where its body is, and
	 * fades whole paths in and out by how relevant they are to the current view.
	 */
	updateOrbitHeads( cameraPosition, exposureCompensation = 1 ) {

		for ( const body of this.bodies ) {

			const path = this.orbits.get( body.id );
			if ( ! path ) continue;

			path.setHead( ( body.orbitPhaseAngle ?? 0 ) / ( Math.PI * 2 ) );
			path.setExposureCompensation( exposureCompensation );

			if ( cameraPosition ) {
				const centre = body.orbitAnchor ? body.orbitAnchor.position : this.heliocentricOrbits.position;
				path.setCameraDistance( cameraPosition.distanceTo( centre ) );
			}

		}

	}

	setOrbitsVisible( visible ) {
		this.orbitRoot.visible = visible;
	}

	get focusable() {
		return [ ...this.bodies, ...this.spacecraft ];
	}

}
