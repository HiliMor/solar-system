import { AU_TRUE, AU_DISPLAY, ORBIT_COMPRESSION, KM_PER_UNIT } from '../data/constants.js';

const SUN_COMPRESSED_FACTOR = 0.15;

/**
 * Converts physical distances to scene units under the current viewing policy.
 *
 * Two policies, cross-faded by `blend` (0 = true scale, 1 = compressed):
 *
 *   true scale   1 AU is always AU_TRUE units. Exact, and mostly empty space.
 *
 *   compressed   an orbit with semi-major axis `a` AU is drawn at
 *                `a ** ORBIT_COMPRESSION` display-AU. Crucially the factor is
 *                constant *per orbit*, so each ellipse is scaled uniformly:
 *                eccentricity, inclination and the direction of perihelion all
 *                survive untouched. Only the gaps between orbits shrink.
 *
 * A radial warp would have been simpler and would have turned every orbit into
 * an egg, so it is not used.
 */
export class Scale {

	constructor() {
		/** 0 = true scale, 1 = compressed. Animated, not switched. */
		this.blend = 1;
		/** Multiplier on every body radius. 1 = physically true. */
		this.bodySize = 1;
		/**
		 * User multiplier on the Sun's radius, on top of the automatic reduction
		 * below. At true scale the Sun is left exact.
		 */
		this.sunSize = 1;
		this.version = 0;
	}

	/** Scene units per AU for an orbit of semi-major axis `aAU`. */
	unitsPerAU( aAU ) {
		const compressed = AU_DISPLAY * Math.pow( Math.max( aAU, 1e-6 ), ORBIT_COMPRESSION - 1 );
		return AU_TRUE + ( compressed - AU_TRUE ) * this.blend;
	}

	/**
	 * Scene units for a body radius given in km.
	 *
	 * The Sun gets an extra reduction in compressed mode. Orbits there are
	 * squeezed by roughly 25x while radii are not, so a true-size Sun would
	 * subtend 6.6 degrees from Earth instead of half a degree and dominate every
	 * wide shot. Shrinking it to 0.15x puts it back near one degree -- still
	 * generous, but recognisably a disc rather than a wall. At true scale the
	 * factor blends back to 1 and the Sun is exact.
	 */
	radius( km, isSun = false ) {
		const base = ( km / KM_PER_UNIT ) * this.bodySize;
		if ( ! isSun ) return base;
		return base * ( 1 + ( SUN_COMPRESSED_FACTOR - 1 ) * this.blend ) * this.sunSize;
	}

	/** Scene units for a true distance in km, with no orbit compression applied. */
	km( v ) {
		return v / KM_PER_UNIT;
	}

	/**
	 * Multiplier on a satellite's orbit. Kept at 1 (physically true) unless the
	 * parent's rendered radius would swallow the orbit -- which happens for
	 * Phobos, Metis-class moons and anyone using the size exaggeration slider.
	 * Then the orbit is pushed out just far enough to clear the surface.
	 */
	moonOrbit( periapsisKm, parentRadiusUnits ) {
		const periapsisUnits = periapsisKm / KM_PER_UNIT;
		if ( periapsisUnits <= 0 ) return 1;
		return Math.max( 1, ( parentRadiusUnits * 1.45 ) / periapsisUnits );
	}

	get isCompressed() { return this.blend > 0.5; }

	/** A readable description of the current distortion, for the UI. */
	describe() {
		if ( this.blend > 0.99 ) return 'Orbits compressed (a^0.5); shapes exact';
		if ( this.blend < 0.01 ) return 'True distances and sizes';
		return 'Transitioning';
	}

}
