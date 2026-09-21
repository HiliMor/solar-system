import { PerspectiveCamera, Vector3, MathUtils } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const _v = new Vector3();
const _target = new Vector3();

/**
 * Camera and focus handling.
 *
 * Because the scene uses a floating origin, the focused body sits at the world
 * origin and the camera orbits that. Switching focus therefore does not move
 * the camera through space -- it re-centres the universe. The transition is
 * animated in *spherical* terms (distance and direction separately) so a jump
 * from Mercury to Neptune pulls back, swings round and settles rather than
 * tearing across the solar system in a straight line.
 */
export class CameraRig {

	constructor( canvas ) {

		this.camera = new PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.002, 4e9 );
		this.camera.position.set( 0, 6, 18 );

		this.controls = new OrbitControls( this.camera, canvas );
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.075;
		this.controls.rotateSpeed = 0.55;
		this.controls.zoomSpeed = 1.1;
		this.controls.panSpeed = 0.6;
		this.controls.enablePan = false;
		this.controls.minDistance = 0.01;
		this.controls.maxDistance = 1e9;
		this.controls.target.set( 0, 0, 0 );

		/** Distance from the focus, in scene units. */
		this.distance = 18;

		this.transition = null;
		this.followRotation = false;

	}

	get position() { return this.camera.position; }

	resize( width, height ) {
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	/**
	 * Frames a body: sets sensible near/far planes and zoom limits for its size,
	 * and eases the camera to a good viewing distance.
	 *
	 * @param {number} radiusUnits rendered radius of the new focus
	 * @param {boolean} animate
	 */
	focusOn( radiusUnits, animate = true, multiplier = 4.2 ) {

		const r = this.retarget( radiusUnits );
		const targetDistance = Math.max( r * multiplier, r * 1.1 );

		if ( ! animate ) {
			this._setDistance( targetDistance );
			this.distance = targetDistance;
			return;
		}

		this.transition = {
			from: this.camera.position.length(),
			to: targetDistance,
			t: 0,
			duration: 1.1
		};

	}

	/** Updates the zoom limits for a focus of the given radius, without moving. */
	retarget( radiusUnits ) {
		const r = Math.max( radiusUnits, 1e-4 );
		this.controls.minDistance = r * 1.06;
		this.controls.maxDistance = Math.max( r * 4e6, 3e7 );
		return r;
	}

	/** Keeps the camera outside the focused body's surface at all times. */
	clampToSurface( radiusUnits ) {
		const minimum = radiusUnits * 1.04;
		if ( this.camera.position.length() < minimum ) this._setDistance( minimum );
	}

	_setDistance( d ) {
		_v.copy( this.camera.position );
		if ( _v.lengthSq() < 1e-12 ) _v.set( 0, 0.3, 1 );
		_v.setLength( d );
		this.camera.position.copy( _v );
	}

	update( dt ) {

		if ( this.transition ) {

			const tr = this.transition;
			tr.t = Math.min( 1, tr.t + dt / tr.duration );

			// Ease in and out, interpolated in log space so crossing five orders
			// of magnitude feels linear rather than exploding at one end.
			const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - ( -2 * tr.t + 2 ) ** 3 / 2;
			const d = Math.exp( MathUtils.lerp( Math.log( tr.from ), Math.log( tr.to ), e ) );
			this._setDistance( d );

			if ( tr.t >= 1 ) this.transition = null;

		}

		this.controls.target.set( 0, 0, 0 );
		this.controls.update();
		this.distance = this.camera.position.length();

	}

	/** Camera-relative field of view of a sphere of `radius` at the origin. */
	apparentSize( radiusUnits ) {
		const d = Math.max( this.distance, 1e-6 );
		return 2 * Math.atan( radiusUnits / d );
	}

}
