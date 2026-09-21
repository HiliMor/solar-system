import { Scene, Vector3, Raycaster, Vector2, Timer, MathUtils, Matrix4, Color } from 'three';
import { uniform, float } from 'three/tsl';

import { createRenderer, createPostProcessing, isWebGPU } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { GroundCamera } from './GroundCamera.js';
import { observerWorld } from '../physics/observer.js';
import { createGround } from '../scene/Ground.js';
import { STANDABLE } from '../data/locations.js';
import { OrbitAudio } from '../audio/OrbitAudio.js';
import { Scale } from './Scale.js';
import { Frame } from './Frame.js';
import { loadTextures } from './textures.js';
import { SimClock } from '../physics/time.js';
import { SolarSystem } from '../scene/SolarSystem.js';
import { createStarfield } from '../scene/Starfield.js';
import { AU_KM, SUN_RADIUS_KM, KM_PER_UNIT } from '../data/constants.js';

const _groundUp = new Vector3();
const _groundNorth = new Vector3();
const _groundEast = new Vector3();
const _groundMatrix = new Matrix4();
const _sunDir = new Vector3();
const _toOcc = new Vector3();
const WHITE = new Color( 1, 1, 1 );

/** Standing eye height, metres. */
const EYE_HEIGHT_M = 1.7;

/**
 * Fraction of full illumination that still reaches a point deep inside an
 * eclipse umbra, scattered in from the sunlit atmosphere beyond it. Reported
 * sky brightness at totality ranges from roughly a thousandth of daylight to
 * rather more near the edge of the umbra; this sits at the brighter end, where
 * the sky reads as the deep twilight people describe rather than as black.
 */
const UMBRA_SCATTER_FLOOR = 0.0038;

const smootherstep = ( edge0, edge1, x ) => {
	const t = Math.min( 1, Math.max( 0, ( x - edge0 ) / ( edge1 - edge0 ) ) );
	return t * t * ( 3 - 2 * t );
};

const _v = new Vector3();
const _pointer = new Vector2();

/**
 * Application shell: owns the renderer, the clock, the scale policy and the
 * frame loop, and exposes the handful of commands the UI drives.
 */
export class App {

	constructor( canvas ) {
		this.canvas = canvas;
		this.scene = new Scene();
		this.clock = new SimClock( new Date() );
		this.scale = new Scale();
		this.frame = new Frame();
		this.rig = new CameraRig( canvas );
		this.realClock = new Timer();

		this.timeUniform = uniform( float( 0 ) );

		this.focusId = 'earth';
		this.focus = null;

		/** 'orbit' -- circling a body. 'ground' -- standing on one, looking up. */
		this.mode = 'orbit';
		this.observer = null;
		this.ground = null;

		this.settings = {
			orbits: true,
			labels: true,
			moons: true,
			dwarfs: true,
			comets: true,
			spacecraft: true,
			belts: true,
			atmospheres: true,
			rings: true,
			starfield: true,
			bloom: true,
			autoExposure: true,
			manualExposure: 1,
			starfieldIntensity: 1
		};

		this.audio = new OrbitAudio();

		this._scaleDirty = true;
		this._listeners = new Map();
		this._raycaster = new Raycaster();
	}

	on( event, fn ) {
		( this._listeners.get( event ) || this._listeners.set( event, new Set() ).get( event ) ).add( fn );
		return () => this._listeners.get( event ).delete( fn );
	}

	emit( event, payload ) {
		const set = this._listeners.get( event );
		if ( set ) for ( const fn of set ) fn( payload );
	}

	async init( onProgress ) {

		this.renderer = await createRenderer( this.canvas );
		this.usingWebGPU = isWebGPU( this.renderer );

		const { textures, missing } = await loadTextures( onProgress );
		this.textures = textures;
		this.missingTextures = missing;

		this.system = new SolarSystem( textures, { timeUniform: this.timeUniform } );
		this.scene.add( this.system.root );

		this.starfield = createStarfield( textures );
		this.scene.add( this.starfield.group );

		this.groundCamera = new GroundCamera( this.rig.camera, this.canvas );

		this.postProcessing = createPostProcessing( this.renderer, this.scene, this.rig.camera );

		// Seed positions before the first frame so nothing pops.
		this.system.integrate( this.clock.days, this.scale );
		this.system.applyScale( this.scale, this.clock.days );
		this.setFocus( this.focusId, false );

		window.addEventListener( 'resize', () => this.resize() );
		this.resize();

		return this;

	}

	resize() {
		const w = window.innerWidth, h = window.innerHeight;
		this.renderer.setSize( w, h );
		this.rig.resize( w, h );
		this.emit( 'resize', { width: w, height: h } );
	}

	// -- focus ---------------------------------------------------------------

	setFocus( id, animate = true ) {

		const target = this.system.byId.get( id )
			|| this.system.spacecraft.find( ( c ) => c.id === id );

		if ( ! target ) return;

		this.focusId = id;
		this.focus = target;

		const radius = target.radiusUnits || this.scale.km( 2000 );
		this.rig.focusOn( radius, animate, target.kind === 'spacecraft' ? 8000 : 4.2 );

		this.emit( 'focus', target );

	}

	/**
	 * Stand on a body.
	 *
	 * Ground mode forces true scale. From a surface the whole point is angular
	 * size -- whether the Moon covers the Sun, how wide Jupiter looks from
	 * Europa -- and the compressed view would make every one of those answers
	 * wrong. So the compression is set aside while you are standing somewhere.
	 *
	 * @param {string} bodyId
	 * @param {number} latitude  planetographic, degrees north
	 * @param {number} longitude east, degrees
	 * @param {number} altitude  metres above the reference ellipsoid
	 */
	enterGround( bodyId, latitude, longitude, altitude = 0, label = null ) {

		const body = this.system.byId.get( bodyId );
		if ( ! body || ! STANDABLE.has( bodyId ) ) return false;

		this._orbitState = {
			blend: this.scale.blend,
			bodySize: this.scale.bodySize,
			sunSize: this.scale.sunSize,
			focusId: this.focusId,
			cameraPosition: this.rig.camera.position.clone(),
			fov: this.rig.camera.fov
		};

		this.scale.blend = 0;
		this.scale.bodySize = 1;
		this.scale.sunSize = 1;
		this.markScaleDirty();

		this.setFocus( bodyId, false );

		// `altitude` is the terrain elevation; the observer's eyes are above it.
		this.observer = {
			bodyId, latitude, longitude, label,
			altitude, eyeAltitude: altitude + EYE_HEIGHT_M,
			frame: null
		};

		// A near plane of a metre. The camera is standing on the surface and the
		// default two-kilometre near plane would clip the observer's own feet.
		const camera = this.rig.camera;
		camera.near = 1e-6;
		camera.far = 1e10;
		camera.updateProjectionMatrix();

		this.mode = 'ground';
		this.rig.controls.enabled = false;
		this.applyVisibility();
		this.groundCamera.enabled = true;
		this.groundCamera.setFov( 65, true );

		// Integrate once so the body is oriented before the observer is placed.
		this.system.integrate( this.clock.days, this.scale );
		this.system.applyScale( this.scale, this.clock.days );
		this._scaleDirty = false;
		this.frame.setOrigin( body.renderPosition.x, body.renderPosition.y, body.renderPosition.z );
		this.system.applyTransforms( this.frame, this.clock.days );
		this._recentreOnObserver();
		this.system.applyTransforms( this.frame, this.clock.days );
		this._updateObserver();

		this._buildGround( body );

		// The body you are standing on must not be drawn -- you are inside it.
		body.mesh.visible = false;
		if ( body.cloud ) body.cloud.mesh.visible = false;

		// Face the Sun if it is up, otherwise face north.
		const sunDirection = this.system.sunWorld.clone().sub( this.observer.frame.position ).normalize();
		if ( sunDirection.dot( this.observer.frame.up ) > -0.1 ) this.groundCamera.lookAt( sunDirection, 0.001 );
		else this.groundCamera.slew( 25, 0, 0.001 );

		this.emit( 'mode', this );
		return true;

	}

	/** Back to orbit, restoring the view that was in place before. */
	exitGround() {

		if ( this.mode !== 'ground' ) return;

		const body = this.system.byId.get( this.observer.bodyId );
		if ( body ) {
			body.mesh.visible = true;
			if ( body.cloud ) body.cloud.mesh.visible = true;
		}

		if ( this.ground ) {
			this.scene.remove( this.ground.group );
			this.ground.dispose();
			this.ground = null;
		}

		const previous = this._orbitState;
		this.mode = 'orbit';
		this.groundCamera.enabled = false;
		this.observer = null;

		const camera = this.rig.camera;
		camera.near = 0.002;
		camera.far = 4e9;
		camera.fov = previous?.fov ?? 50;
		camera.updateProjectionMatrix();

		if ( previous ) {
			this.scale.blend = previous.blend;
			this.scale.bodySize = previous.bodySize;
			this.scale.sunSize = previous.sunSize;
			this.markScaleDirty();
			this.setFocus( previous.focusId, false );
		}

		this.rig.controls.enabled = true;
		this.applyVisibility();
		if ( body ) this.rig.focusOn( body.radiusUnits, false, 4.2 );

		this.emit( 'mode', this );

	}

	_buildGround( body ) {

		if ( this.ground ) {
			this.scene.remove( this.ground.group );
			this.ground.dispose();
		}

		this.ground = createGround( body, this.observer.frame.horizonKm );
		this.scene.add( this.ground.group );

	}

	/**
	 * Moves the floating origin from the body's centre onto the observer, so
	 * every coordinate near the camera is close to zero.
	 */
	_recentreOnObserver() {

		this._updateObserver();

		const position = this.observer.frame.position;

		// World -> ecliptic scene axes, and on to the absolute origin.
		this.frame.setOrigin(
			this.frame.origin.x + position.x,
			this.frame.origin.y - position.z,
			this.frame.origin.z + position.y
		);

	}

	/** Points the ground camera at a body, by id. */
	lookAtFromGround( bodyId ) {
		if ( this.mode !== 'ground' ) return;
		const body = this.system.byId.get( bodyId );
		if ( ! body || ! this.observer?.frame ) return;
		_v.copy( body.group.position ).sub( this.observer.frame.position ).normalize();
		this.groundCamera.lookAt( _v, 1.4 );
	}

	/** Recomputes the observer's world frame from the body's current rotation. */
	_updateObserver() {

		const o = this.observer;
		if ( ! o ) return;

		const body = this.system.byId.get( o.bodyId );
		if ( ! body ) return;

		o.frame = observerWorld( body, o.latitude, o.longitude, o.eyeAltitude, o.frame || {} );
		o.body = body;

	}

	markScaleDirty() { this._scaleDirty = true; }

	setScaleBlend( blend ) {
		this.scale.blend = blend;
		this.markScaleDirty();
	}

	setBodySize( multiplier ) {
		this.scale.bodySize = multiplier;
		this.markScaleDirty();
	}

	setSunSize( multiplier ) {
		this.scale.sunSize = multiplier;
		this.markScaleDirty();
	}

	// -- picking -------------------------------------------------------------

	/** Nearest body under the pointer, if any. */
	pick( clientX, clientY ) {

		_pointer.x = ( clientX / window.innerWidth ) * 2 - 1;
		_pointer.y = - ( clientY / window.innerHeight ) * 2 + 1;

		this._raycaster.setFromCamera( _pointer, this.rig.camera );
		// Bodies span eight orders of magnitude in size; the default near/far on
		// the ray would cull most of them.
		this._raycaster.near = 0;
		this._raycaster.far = Infinity;

		const meshes = [];
		for ( const body of this.system.bodies ) {
			if ( ! body.group.visible ) continue;
			meshes.push( body.mesh );
		}

		const hits = this._raycaster.intersectObjects( meshes, false );
		if ( hits.length ) return this.system.byId.get( hits[ 0 ].object.userData.bodyId );

		// Nothing hit directly: fall back to the nearest body within a small
		// screen-space radius, so sub-pixel planets are still clickable.
		return this._pickByScreenDistance( clientX, clientY );

	}

	_pickByScreenDistance( clientX, clientY, tolerance = 26 ) {

		let best = null, bestDistance = tolerance;
		const camera = this.rig.camera;

		const candidates = [ ...this.system.bodies, ...this.system.spacecraft ];

		for ( const body of candidates ) {

			const position = body.group ? body.group.position : body.object?.position;
			if ( ! position ) continue;
			if ( body.group && ! body.group.visible ) continue;

			_v.copy( position ).project( camera );
			if ( _v.z > 1 ) continue;

			const sx = ( _v.x * 0.5 + 0.5 ) * window.innerWidth;
			const sy = ( - _v.y * 0.5 + 0.5 ) * window.innerHeight;
			const d = Math.hypot( sx - clientX, sy - clientY );

			if ( d < bestDistance ) { bestDistance = d; best = body; }

		}

		return best;

	}

	// -- frame loop ----------------------------------------------------------

	start() {
		this.renderer.setAnimationLoop( () => this.frameTick() );
	}

	stop() {
		this.renderer.setAnimationLoop( null );
	}

	/**
	 * @param {number} [forcedDt] overrides the wall-clock delta. Used when the
	 * loop is driven by hand -- for deterministic capture, or when the tab is
	 * backgrounded and requestAnimationFrame is throttled to nothing.
	 */
	frameTick( forcedDt ) {

		this.realClock.update();
		const dt = forcedDt !== undefined
			? forcedDt
			: Math.min( this.realClock.getDelta(), 0.1 );

		this.clock.advance( dt );
		this.timeUniform.value += dt;

		const days = this.clock.days;

		// 1. physics, in real units
		this.system.integrate( days, this.scale );

		// 2. scale policy, if anything changed
		if ( this._scaleDirty ) {
			this.system.applyScale( this.scale, days );
			this._scaleDirty = false;
			// Re-derive the zoom limits for the new sizes, but leave the camera
			// where it is: changing the scale should not also move the viewer.
			if ( this.focus ) this.rig.retarget( this.focus.radiusUnits || 1 );
		}

		// 3. floating origin
		const f = this.focus?.renderPosition || { x: 0, y: 0, z: 0 };
		this.frame.setOrigin( f.x, f.y, f.z );

		// 4. transforms and orientation
		this.system.applyTransforms( this.frame, days );

		// Standing on a surface, the body's centre is not a good enough origin.
		// float32 resolves about 0.8 m at 6.4 units from the origin -- coarser
		// than the distance from the observer's eyes to their feet, so the
		// ground would boil. The origin is therefore moved onto the observer,
		// which needs the body oriented first: hence the second pass.
		if ( this.mode === 'ground' ) {
			this._recentreOnObserver();
			this.system.applyTransforms( this.frame, days );
		}


		// 5. camera
		if ( this.mode === 'ground' ) {
			// The origin is already on the observer, so this returns a frame
			// whose position is a few microns from zero.
			this._updateObserver();
			this.groundCamera.update( dt, this.observer.frame );
			this._placeGround();
		} else {
			this.rig.update( dt );
			if ( this.focus?.radiusUnits ) this.rig.clampToSurface( this.focus.radiusUnits );
		}
		this.starfield.follow( this.rig.camera.position );

		// 6. exposure and lighting
		const exposure = this._computeExposure();
		if ( this.ground ) this._updateGroundLighting( exposure );

		// Annotations -- orbit paths, spacecraft markers, trails -- are given a
		// fixed screen brightness by dividing out the current exposure. Physical
		// objects are not: the belts and comet tails really are dimmer out there.
		const overlayCompensation = 1 / Math.max( exposure.tone, 1e-3 );

		this.system.updateBelts( days, this.scale, this.frame, this.rig.camera, 1 );
		this.system.updateComets( this.scale, this.frame, this.rig.camera, 1 );
		this.system.updateSpacecraft( this.scale, this.frame, this.rig.camera, overlayCompensation );
		this.system.updateOrbitHeads( this.rig.camera.position, overlayCompensation );
		this.renderer.toneMappingExposure = exposure.tone;
		this.system.updateLighting( exposure.bias );
		// Stars do not disappear in daylight, they are simply outshone. Dividing
		// them down by the sky's own brightness reproduces that, and is why the
		// sky here fills with stars as an eclipse deepens.
		const washout = this.mode === 'ground' ? 1 / ( 1 + ( this._skyBrightness || 0 ) * 900 ) : 1;
		this.starfield.uniforms.exposureBias.value =
			this.settings.starfieldIntensity * washout / Math.max( exposure.tone, 0.02 );

		// 7. atmosphere culling flip when the camera enters a shell
		this._updateAtmosphereSides();

		this.audio.update( this.system, this.focusId );

		this.emit( 'frame', { dt, days } );

		this.postProcessing.post.render();

	}

	/** Keeps the ground cap under the observer's feet as the body turns. */
	_placeGround() {

		const frame = this.observer?.frame;
		if ( ! this.ground || ! frame ) return;

		const group = this.ground.group;

		// Orient the cap to the local horizon. The basis must be right-handed:
		// north x up = east, whereas east x up = -north, so the columns go in
		// this order or makeBasis builds a reflection and the cap comes out
		// inside out.
		_groundUp.copy( frame.up );
		_groundNorth.copy( frame.north );
		_groundEast.copy( frame.east );
		_groundMatrix.makeBasis( _groundNorth, _groundUp, _groundEast );
		group.quaternion.setFromRotationMatrix( _groundMatrix );

		// The cap has the observer's feet at its origin, so it is dropped by eye
		// height -- not by the terrain elevation. Standing on Olympus Mons means
		// standing on ground twenty-two kilometres up, not hovering above the
		// plain; the elevation is already in the horizon distance.
		group.position.copy( frame.position )
			.addScaledVector( frame.up, - EYE_HEIGHT_M / 1e6 );

	}

	_updateGroundLighting( exposure ) {

		const body = this.observer?.body;
		if ( ! body ) return;

		const u = this.ground.uniforms;
		const sunWorld = this.system.sunWorld;
		const world = this.ground.group.position;

		_v.copy( sunWorld ).sub( world );
		const distance = _v.length() || 1;

		u.sunDirection.value.copy( _v ).divideScalar( distance );
		u.sunPosition.value.copy( sunWorld );
		u.irradiance.value = Math.pow( AU_KM / Math.max( body.distanceFromSunKm, 1 ), 2 );
		u.sunAngularRadius.value = Math.atan( SUN_RADIUS_KM / Math.max( body.distanceFromSunKm, SUN_RADIUS_KM ) );
		u.exposureBias.value = 1;
		u.scatteredFloor.value = UMBRA_SCATTER_FLOOR;

		// Everything that can eclipse the observer: the body's own satellites,
		// and -- when standing on a moon -- its primary and its siblings.
		const occluders = this._groundOccluders || ( this._groundOccluders = [] );
		occluders.length = 0;
		for ( const child of body.children ) if ( occluders.length < 4 ) occluders.push( this.system._occluder( child ) );
		if ( body.parent ) {
			if ( occluders.length < 4 ) occluders.push( this.system._occluder( body.parent ) );
			for ( const sibling of body.parent.children ) {
				if ( sibling !== body && occluders.length < 4 ) occluders.push( this.system._occluder( sibling ) );
			}
		}

		for ( let k = 0; k < u.occluders.length; k ++ ) {
			const o = occluders[ k ];
			if ( o ) u.occluders[ k ].value.set( o.x, o.y, o.z, o.r );
			else u.occluders[ k ].value.set( 0, 0, 0, 0 );
		}

		// Skylight, so the ground is not lit only from one direction on a body
		// with an atmosphere. Scaled by how much Sun the observer can actually
		// see, which is what makes the landscape dim through an eclipse.
		const atmosphere = body.def.atmosphere;
		const visible = Math.max( this.solarVisibilityHere(), UMBRA_SCATTER_FLOOR );

		if ( atmosphere ) {

			const tint = this._skyTint || ( this._skyTint = new Color() );
			const sunUp = Math.max( 0, u.sunDirection.value.dot( this.observer.frame.up ) );
			const daylight = u.irradiance.value * visible * ( 0.2 + 0.8 * sunUp );

			// Skylight falling on the ground: the sky's own colour, dimmer.
			tint.set( atmosphere.color );
			const ambientStrength = 0.13 * daylight;
			u.skyTint.value.set( tint.r * ambientStrength, tint.g * ambientStrength, tint.b * ambientStrength );

			// Aerial perspective blends the far ground toward the *horizon* sky,
			// which multiple scattering makes both brighter and whiter than the
			// zenith. Using the zenith colour instead turns distance navy blue.
			tint.lerp( WHITE, 0.62 );
			const horizonStrength = 0.30 * daylight;
			u.horizonColor.value.set( tint.r * horizonStrength, tint.g * horizonStrength, tint.b * horizonStrength );
			u.horizonFade.value = 1;

		} else {
			u.skyTint.value.set( 0, 0, 0 );
			u.horizonColor.value.set( 0, 0, 0 );
			u.horizonFade.value = 0;
		}

		this._skyBrightness = atmosphere
			? u.irradiance.value * visible * Math.max( 0, u.sunDirection.value.dot( this.observer.frame.up ) + 0.12 )
			: 0;

	}

	/**
	 * Fraction of the Sun's disc visible from the observer, computed on the CPU
	 * with the same geometry the shaders use. Drives the exposure, so the light
	 * really does drain away as an eclipse deepens.
	 */
	solarVisibilityHere() {

		const frame = this.observer?.frame;
		const body = this.observer?.body;
		if ( ! frame || ! body ) return 1;

		const position = frame.position;
		_v.copy( this.system.sunWorld ).sub( position );
		const sunDistance = _v.length() || 1;
		_sunDir.copy( _v ).divideScalar( sunDistance );

		const sunAngular = Math.atan( SUN_RADIUS_KM / Math.max( body.distanceFromSunKm, SUN_RADIUS_KM ) );

		let visible = 1;

		const candidates = [ ...body.children ];
		if ( body.parent ) {
			candidates.push( body.parent );
			for ( const sibling of body.parent.children ) if ( sibling !== body ) candidates.push( sibling );
		}

		for ( const other of candidates ) {

			_toOcc.copy( other.group.position ).sub( position );
			const along = _toOcc.dot( _sunDir );
			if ( along <= 0 || other.radiusUnits <= 0 ) continue;

			const perpendicular = _toOcc.addScaledVector( _sunDir, - along ).length();
			const occAngular = other.radiusUnits / along;
			const separation = perpendicular / along;

			const outer = occAngular + sunAngular;
			const inner = Math.abs( occAngular - sunAngular );
			if ( separation >= outer ) continue;

			const t = separation <= inner ? 1 : 1 - smootherstep( inner, outer, separation );
			const areaCap = Math.min( 1, ( occAngular * occAngular ) / ( sunAngular * sunAngular ) );
			visible *= 1 - t * areaCap;

		}

		return Math.max( 0, Math.min( 1, visible ) );

	}

	/**
	 * Auto exposure.
	 *
	 * Sunlight at Neptune is 900 times weaker than at Earth. Rendered honestly
	 * that is a black screen, so the exposure tracks the focused body's actual
	 * irradiance -- the same thing a camera does, and the reason spacecraft
	 * images of the outer planets are not black either. Turning it off shows the
	 * absolute brightness instead, which is worth seeing once.
	 */
	_computeExposure() {

		if ( ! this.settings.autoExposure ) {
			return { tone: this.settings.manualExposure, bias: 1 };
		}

		const body = this.focus;
		const distanceKm = body?.distanceFromSunKm || AU_KM;
		let irradiance = Math.pow( AU_KM / Math.max( distanceKm, SUN_RADIUS_KM ), 2 );

		// Standing on a surface, the exposure follows the light actually falling
		// on the observer rather than the body's distance from the Sun. During
		// totality that collapses by a factor of ten thousand, and because the
		// adaptation is deliberately slow the landscape goes dark first and only
		// then comes back -- which is what it is like.
		if ( this.mode === 'ground' ) {
			this.localVisibility = this.solarVisibilityHere();
			irradiance *= Math.max( this.localVisibility, 2e-5 );
		}

		// Square root rather than a straight inverse: a partial compensation
		// keeps some sense that the outer system really is dimmer.
		const target = MathUtils.clamp( 1 / Math.sqrt( Math.max( irradiance, 1e-6 ) ), 0.25, 18 );

		this._exposure = this._exposure === undefined
			? target
			: MathUtils.lerp( this._exposure, target, 0.045 );

		return { tone: this._exposure * this.settings.manualExposure, bias: 1 };

	}

	_updateAtmosphereSides() {
		const camera = this.rig.camera.position;
		for ( const body of this.system.bodies ) {
			if ( ! body.atmosphere ) continue;
			const d = camera.distanceTo( body.group.position );
			body.atmosphere.setInside( d < ( body.atmosphereTopUnits || 0 ) );

			// The shell's inner sphere uses the equatorial radius, but an
			// observer at any other latitude sits *inside* that sphere because
			// the body is oblate. Rays aimed below the horizon would then miss
			// the planet and integrate all the way through it, lighting the
			// ground from beneath. Shrinking the sphere to pass through the
			// observer stops them at once.
			if ( this.mode === 'ground' && this.observer?.bodyId === body.id ) {
				const surface = Math.max( d - EYE_HEIGHT_M / 1e6, 1e-6 );
				body.atmosphere.uniforms.surfaceRadius.value = Math.min( body.radiusUnits, surface );
			} else if ( body.atmosphere.uniforms.surfaceRadius.value !== body.radiusUnits ) {
				body.atmosphere.uniforms.surfaceRadius.value = body.radiusUnits;
			}
			// Only the body being stood on needs the umbra floor; from outside,
			// a shadow crossing a planet should read as a hard shadow.
			body.atmosphere.uniforms.scatteredFloor.value =
				( this.mode === 'ground' && this.observer?.bodyId === body.id ) ? UMBRA_SCATTER_FLOOR : 0;
		}
	}

	// -- visibility ----------------------------------------------------------

	applyVisibility() {

		const s = this.settings;

		// Orbit paths, belt particles and spacecraft trails are annotations on a
		// diagram. From a surface the sky should be the sky, so they come off --
		// nobody looking up sees Neptune's orbit drawn across the stars.
		const ground = this.mode === 'ground';

		for ( const body of this.system.bodies ) {

			let visible = true;
			if ( body.kind === 'moon' ) visible = s.moons;
			else if ( body.kind === 'dwarf' ) visible = s.dwarfs;
			else if ( body.kind === 'comet' ) visible = s.comets;

			body.setVisible( visible );

			if ( body.atmosphere ) body.atmosphere.mesh.visible = s.atmospheres;
			for ( const ring of body.rings ) ring.mesh.visible = s.rings;

			const path = this.system.orbits.get( body.id );
			if ( path ) path.setWanted( visible && s.orbits && ! ground );

		}

		for ( const belt of this.system.belts ) belt.setVisible( s.belts && ! ground );
		for ( const craft of this.system.spacecraft ) {
			craft.marker.setVisible( s.spacecraft && ! ground );
			craft.marker.trail.visible = s.spacecraft && s.orbits && ! ground;
		}
		this.system.setOrbitsVisible( s.orbits && ! ground );
		this.starfield.group.visible = s.starfield;
		this.postProcessing.setEnabled( s.bloom );

	}

}
