import { Scene, Vector3, Raycaster, Vector2, Timer, MathUtils } from 'three';
import { uniform, float } from 'three/tsl';

import { createRenderer, createPostProcessing, isWebGPU } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { Scale } from './Scale.js';
import { Frame } from './Frame.js';
import { loadTextures } from './textures.js';
import { SimClock } from '../physics/time.js';
import { SolarSystem } from '../scene/SolarSystem.js';
import { createStarfield } from '../scene/Starfield.js';
import { AU_KM, SUN_RADIUS_KM, KM_PER_UNIT } from '../data/constants.js';

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

	frameTick() {

		this.realClock.update();
		const dt = Math.min( this.realClock.getDelta(), 0.1 );

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

		// 3. floating origin on the focused body
		const f = this.focus?.renderPosition || { x: 0, y: 0, z: 0 };
		this.frame.setOrigin( f.x, f.y, f.z );

		// 4. transforms and orientation
		this.system.applyTransforms( this.frame, days );


		// 5. camera
		this.rig.update( dt );
		if ( this.focus?.radiusUnits ) this.rig.clampToSurface( this.focus.radiusUnits );
		this.starfield.follow( this.rig.camera.position );

		// 6. exposure and lighting
		const exposure = this._computeExposure();

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
		this.starfield.uniforms.exposureBias.value = this.settings.starfieldIntensity / Math.max( exposure.tone, 0.02 );

		// 7. atmosphere culling flip when the camera enters a shell
		this._updateAtmosphereSides();

		this.emit( 'frame', { dt, days } );

		this.postProcessing.post.render();

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
		const irradiance = Math.pow( AU_KM / Math.max( distanceKm, SUN_RADIUS_KM ), 2 );

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
		}
	}

	// -- visibility ----------------------------------------------------------

	applyVisibility() {

		const s = this.settings;

		for ( const body of this.system.bodies ) {

			let visible = true;
			if ( body.kind === 'moon' ) visible = s.moons;
			else if ( body.kind === 'dwarf' ) visible = s.dwarfs;
			else if ( body.kind === 'comet' ) visible = s.comets;

			body.setVisible( visible );

			if ( body.atmosphere ) body.atmosphere.mesh.visible = s.atmospheres;
			for ( const ring of body.rings ) ring.mesh.visible = s.rings;

			const path = this.system.orbits.get( body.id );
			if ( path ) path.setWanted( visible && s.orbits );

		}

		for ( const belt of this.system.belts ) belt.setVisible( s.belts );
		for ( const craft of this.system.spacecraft ) {
			craft.marker.setVisible( s.spacecraft );
			craft.marker.trail.visible = s.spacecraft && s.orbits;
		}
		this.system.setOrbitsVisible( s.orbits );
		this.starfield.group.visible = s.starfield;
		this.postProcessing.setEnabled( s.bloom );

	}

}
