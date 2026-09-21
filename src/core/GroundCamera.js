import { Vector3, MathUtils } from 'three';
import { directionFromAltAz, altAz, compassPoint } from '../physics/observer.js';
import { DEG } from '../data/constants.js';

const _target = new Vector3();
const _dir = new Vector3();

/**
 * Planetarium camera: fixed in place, free to look around.
 *
 * Deliberately not an orbit camera. Standing somewhere and turning your head is
 * a different act from circling an object, and it is the one that makes a sky
 * read as a sky. Zoom changes the field of view rather than the position, the
 * way raising binoculars does -- so the Sun keeps its true half-degree and only
 * the framing changes.
 */
export class GroundCamera {

	constructor( camera, domElement ) {

		this.camera = camera;
		this.domElement = domElement;

		/** Where the camera is pointing, in local horizon coordinates. */
		this.azimuth = 180;
		this.altitude = 20;

		this.fov = 65;
		this.minFov = 0.35;          // about 80x -- enough to resolve Jupiter's moons
		this.maxFov = 100;

		this.enabled = false;
		this.frame = null;

		this._dragging = false;
		this._last = { x: 0, y: 0 };
		this._velocity = { azimuth: 0, altitude: 0 };
		this._fovTarget = this.fov;

		this._onPointerDown = ( e ) => {
			if ( ! this.enabled || e.button !== 0 ) return;
			this._dragging = true;
			this._last.x = e.clientX;
			this._last.y = e.clientY;
			domElement.setPointerCapture?.( e.pointerId );
		};

		this._onPointerMove = ( e ) => {
			if ( ! this._dragging || ! this.enabled ) return;
			// Scale by the field of view so the control stays proportional when
			// zoomed in; at 0.5 degrees a pixel of drag must be a small step.
			const perPixel = this.fov / window.innerHeight;
			this.azimuth -= ( e.clientX - this._last.x ) * perPixel;
			this.altitude += ( e.clientY - this._last.y ) * perPixel;
			this._clamp();
			this._last.x = e.clientX;
			this._last.y = e.clientY;
		};

		this._onPointerUp = ( e ) => {
			this._dragging = false;
			domElement.releasePointerCapture?.( e.pointerId );
		};

		this._onWheel = ( e ) => {
			if ( ! this.enabled ) return;
			e.preventDefault();
			this._fovTarget = MathUtils.clamp(
				this._fovTarget * Math.exp( e.deltaY * 0.0012 ), this.minFov, this.maxFov
			);
		};

		domElement.addEventListener( 'pointerdown', this._onPointerDown );
		domElement.addEventListener( 'pointermove', this._onPointerMove );
		domElement.addEventListener( 'pointerup', this._onPointerUp );
		domElement.addEventListener( 'pointercancel', this._onPointerUp );
		domElement.addEventListener( 'wheel', this._onWheel, { passive: false } );

	}

	_clamp() {
		this.altitude = MathUtils.clamp( this.altitude, - 89.9, 89.9 );
		this.azimuth = ( ( this.azimuth % 360 ) + 360 ) % 360;
	}

	/** Points the camera at a world direction, easing there over `seconds`. */
	lookAt( direction, seconds = 1.2 ) {
		if ( ! this.frame ) return;
		const target = altAz( direction, this.frame );
		this.slew( target.altitude, target.azimuth, seconds );
	}

	/** Eases the heading toward a given altitude and azimuth. */
	slew( altitude, azimuth, seconds = 1.2 ) {
		// Take the short way round the compass.
		let delta = ( ( azimuth - this.azimuth + 540 ) % 360 ) - 180;
		this._slew = {
			fromAlt: this.altitude, toAlt: altitude,
			fromAz: this.azimuth, toAz: this.azimuth + delta,
			t: 0, duration: Math.max( seconds, 0.001 )
		};
	}

	setFov( fov, immediate = false ) {
		this._fovTarget = MathUtils.clamp( fov, this.minFov, this.maxFov );
		if ( immediate ) this.fov = this._fovTarget;
	}

	/**
	 * @param {number} dt
	 * @param {object} frame observer frame from observerWorld()
	 */
	update( dt, frame ) {

		this.frame = frame;
		if ( ! frame ) return;

		if ( this._slew ) {
			const s = this._slew;
			s.t = Math.min( 1, s.t + dt / s.duration );
			const e = s.t < 0.5 ? 4 * s.t ** 3 : 1 - ( - 2 * s.t + 2 ) ** 3 / 2;
			this.altitude = MathUtils.lerp( s.fromAlt, s.toAlt, e );
			this.azimuth = MathUtils.lerp( s.fromAz, s.toAz, e );
			this._clamp();
			if ( s.t >= 1 ) this._slew = null;
		}

		// Zoom eases in log space so the last few degrees of a deep zoom do not
		// snap past the target.
		this.fov = Math.exp( MathUtils.lerp( Math.log( this.fov ), Math.log( this._fovTarget ), 1 - Math.pow( 0.0015, dt ) ) );

		const camera = this.camera;
		camera.position.copy( frame.position );
		camera.up.copy( frame.up );

		directionFromAltAz( this.altitude, this.azimuth, frame, _dir );
		_target.copy( frame.position ).addScaledVector( _dir, 1000 );
		camera.lookAt( _target );

		if ( Math.abs( camera.fov - this.fov ) > 1e-4 ) {
			camera.fov = this.fov;
			camera.updateProjectionMatrix();
		}

	}

	/** Heading readout for the interface. */
	get heading() {
		return {
			azimuth: this.azimuth,
			altitude: this.altitude,
			compass: compassPoint( this.azimuth ),
			fov: this.fov,
			magnification: 50 / this.fov
		};
	}

	dispose() {
		const d = this.domElement;
		d.removeEventListener( 'pointerdown', this._onPointerDown );
		d.removeEventListener( 'pointermove', this._onPointerMove );
		d.removeEventListener( 'pointerup', this._onPointerUp );
		d.removeEventListener( 'pointercancel', this._onPointerUp );
		d.removeEventListener( 'wheel', this._onWheel );
	}

}
