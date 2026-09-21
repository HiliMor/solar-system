import { Vector3 } from 'three';
import { eclipticToScene } from '../physics/frames.js';

/**
 * Floating origin.
 *
 * Neptune's orbit is 4.5e6 scene units across while a crater on Europa is a
 * fraction of one. float32 -- which is all the GPU has -- carries about seven
 * significant digits, so a vertex four million units from the origin resolves
 * to half a unit. Everything far from the Sun would visibly shimmer.
 *
 * The fix is to never hand the GPU a large coordinate. All simulation maths is
 * done in float64 on the CPU, then the focused body's position is subtracted
 * before anything is written to an object transform. The camera stays near the
 * origin and the universe moves around it.
 */
export class Frame {

	constructor() {
		/** Current origin, in scene units, ecliptic axes, float64. */
		this.origin = { x: 0, y: 0, z: 0 };
		this._v = new Vector3();
	}

	setOrigin( x, y, z ) {
		this.origin.x = x;
		this.origin.y = y;
		this.origin.z = z;
	}

	/**
	 * Ecliptic scene-unit position (float64) -> three.js world position,
	 * relative to the current origin.
	 */
	toWorld( ex, ey, ez, out = this._v ) {
		return eclipticToScene(
			{ x: ex - this.origin.x, y: ey - this.origin.y, z: ez - this.origin.z },
			out
		);
	}

	/** Same, but for a direction: no origin subtraction. */
	dirToWorld( ex, ey, ez, out = this._v ) {
		return eclipticToScene( { x: ex, y: ey, z: ez }, out );
	}

	/** three.js world position -> absolute ecliptic scene units (float64). */
	toEcliptic( v, out = { x: 0, y: 0, z: 0 } ) {
		out.x = v.x + this.origin.x;
		out.y = - v.z + this.origin.y;
		out.z = v.y + this.origin.z;
		return out;
	}

}
