/**
 * Units and scale policy.
 *
 * Everything in the simulation layer is kept in real physical units (kilometres,
 * days, degrees) as float64. The render layer converts to "scene units" only at
 * the last moment, so no accuracy is lost to the graphics pipeline.
 *
 * 1 scene unit = 1000 km. That puts Earth's radius at 6.378 units and Neptune's
 * orbit at 4.5e6 units -- a range float32 cannot hold on its own, which is why
 * positions are made camera-relative before they ever reach the GPU (see
 * FloatingOrigin in src/core/Frame.js).
 */

export const KM_PER_UNIT = 1000;
export const AU_KM = 149597870.7;

/** One AU in scene units, at true scale. */
export const AU_TRUE = AU_KM / KM_PER_UNIT;          // 149597.87

/** One "display AU" in scene units, for the compressed view. */
export const AU_DISPLAY = 6000;

/**
 * Compressed mode maps a semi-major axis of `a` AU to `a ** ORBIT_COMPRESSION`
 * display-AU. Every orbit is scaled *uniformly by its own factor*, so ellipses
 * keep their exact shape, eccentricity and inclination -- only the spacing
 * between orbits is squeezed. Earth stays at 1.0 by construction.
 */
export const ORBIT_COMPRESSION = 0.5;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

/** Obliquity of the ecliptic at J2000, in radians. */
export const OBLIQUITY = 23.43928111 * DEG;

/** Julian date of the J2000.0 epoch (2000-01-01 12:00 TT). */
export const J2000_JD = 2451545.0;

/** Unix epoch expressed as a Julian date. */
export const UNIX_EPOCH_JD = 2440587.5;

export const DAY_MS = 86400000;

/** Solar constants. */
export const SUN_RADIUS_KM = 696340;
export const SUN_LUMINOSITY_W = 3.828e26;
/** Solar irradiance at 1 AU, W/m^2. Used as the 1.0 reference for exposure. */
export const SOLAR_CONSTANT = 1361;

/** Gravitational parameter of the Sun, km^3/s^2. */
export const GM_SUN = 1.32712440018e11;

export const SECONDS_PER_DAY = 86400;
export const DAYS_PER_YEAR = 365.25;
export const DAYS_PER_CENTURY = 36525;
