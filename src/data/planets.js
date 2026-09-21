/**
 * Orbital elements: "Keplerian Elements for Approximate Positions of the Major
 * Planets", E. M. Standish, JPL/Caltech (ssd.jpl.nasa.gov). Valid 1800-2050 AD
 * to better than a few arcminutes; the b/c/s/f correction terms on Jupiter
 * through Pluto extend usable accuracy to roughly 3000 BC - 3000 AD.
 *
 *   a   semi-major axis              AU          adot  AU/century
 *   e   eccentricity                 -           edot  /century
 *   i   inclination to the ecliptic  degrees     idot  deg/century
 *   L   mean longitude               degrees     Ldot  deg/century
 *   lp  longitude of perihelion      degrees     lpdot deg/century
 *   om  longitude of ascending node  degrees     omdot deg/century
 *
 * Rotation: IAU Working Group on Cartographic Coordinates and Rotational
 * Elements, 2015 report. `ra`/`dec` give the north pole in J2000 equatorial
 * coordinates; `w0` + `wdot` * d gives the prime meridian angle, with d in days
 * since J2000. A negative wdot is a retrograde rotator.
 *
 * Physical data: NASA planetary fact sheets (nssdc.gsfc.nasa.gov).
 */

export const PLANETS = [

	{
		id: 'mercury',
		name: 'Mercury',
		type: 'planet',
		elements: {
			a: 0.38709927, adot: 0.00000037,
			e: 0.20563593, edot: 0.00001906,
			i: 7.00497902, idot: -0.00594749,
			L: 252.25032350, Ldot: 149472.67411175,
			lp: 77.45779628, lpdot: 0.16047689,
			om: 48.33076593, omdot: -0.12534081
		},
		rotation: { ra: 281.0103, raDot: -0.0328, dec: 61.4155, decDot: -0.0049, w0: 329.5988, wdot: 6.1385108 },
		radius: 2439.7,
		flattening: 0,
		mass: 3.3011e23,
		albedo: 0.142,
		texture: 'mercury.jpg',
		color: 0x8c8378,
		facts: {
			'Mean radius': '2,439.7 km (0.383 Earth)',
			'Mass': '3.301e23 kg (0.055 Earth)',
			'Surface gravity': '3.70 m/s2',
			'Day length': '175.94 Earth days (solar)',
			'Sidereal rotation': '58.646 days',
			'Orbital period': '87.969 days',
			'Mean temperature': '167 C (-173 to 427 C)',
			'Atmosphere': 'Exosphere only: O, Na, H, He, K',
			'Moons': 'None'
		},
		note: 'Locked in a 3:2 spin-orbit resonance: three rotations for every two orbits, so a solar day lasts two Mercurian years.'
	},

	{
		id: 'venus',
		name: 'Venus',
		type: 'planet',
		elements: {
			a: 0.72333566, adot: 0.00000390,
			e: 0.00677672, edot: -0.00004107,
			i: 3.39467605, idot: -0.00078890,
			L: 181.97909950, Ldot: 58517.81538729,
			lp: 131.60246718, lpdot: 0.00268329,
			om: 76.67984255, omdot: -0.27769418
		},
		rotation: { ra: 272.76, raDot: 0, dec: 67.16, decDot: 0, w0: 160.20, wdot: -1.4813688 },
		radius: 6051.8,
		flattening: 0,
		mass: 4.8675e24,
		albedo: 0.689,
		texture: 'venus_surface.jpg',
		cloudTexture: 'venus_clouds.jpg',
		cloudAltitude: 50,
		cloudOpacity: 1.0,
		cloudRotationPeriod: -4.0,
		atmosphere: { height: 110, color: 0xe8c88a, haze: 0xfff0d8, density: 1, rayleigh: 1.4, mie: 0.55, g: 0.7 },
		color: 0xd9b382,
		facts: {
			'Mean radius': '6,051.8 km (0.949 Earth)',
			'Mass': '4.867e24 kg (0.815 Earth)',
			'Surface gravity': '8.87 m/s2',
			'Surface pressure': '92 bar',
			'Sidereal rotation': '243.02 days (retrograde)',
			'Orbital period': '224.70 days',
			'Mean temperature': '464 C',
			'Atmosphere': '96.5% CO2, 3.5% N2, sulphuric acid clouds',
			'Moons': 'None'
		},
		note: 'Rotates backwards and slower than it orbits. The cloud deck superrotates, lapping the surface every four days.'
	},

	{
		id: 'earth',
		name: 'Earth',
		type: 'planet',
		elements: {
			a: 1.00000261, adot: 0.00000562,
			e: 0.01671123, edot: -0.00004392,
			i: -0.00001531, idot: -0.01294668,
			L: 100.46457166, Ldot: 35999.37244981,
			lp: 102.93768193, lpdot: 0.32327364,
			om: 0.0, omdot: 0.0
		},
		rotation: { ra: 0.00, raDot: -0.641, dec: 90.00, decDot: -0.557, w0: 190.147, wdot: 360.9856235 },
		radius: 6378.137,
		flattening: 1 / 298.257223563,
		mass: 5.97237e24,
		albedo: 0.306,
		texture: 'earth_day.jpg',
		nightTexture: 'earth_night.jpg',
		normalTexture: 'earth_normal.png',
		specularTexture: 'earth_specular.png',
		cloudTexture: 'earth_clouds.jpg',
		cloudAltitude: 12,
		cloudOpacity: 0.92,
		cloudRotationPeriod: 24,
		atmosphere: { height: 90, color: 0x6ea8ff, haze: 0xfff2e2, density: 1, rayleigh: 1.0, mie: 0.25, g: 0.76 },
		color: 0x3f6fbf,
		facts: {
			'Mean radius': '6,371.0 km',
			'Equatorial radius': '6,378.137 km',
			'Mass': '5.972e24 kg',
			'Surface gravity': '9.807 m/s2',
			'Sidereal rotation': '23h 56m 04s',
			'Orbital period': '365.256 days',
			'Mean temperature': '15 C',
			'Atmosphere': '78% N2, 21% O2, 0.93% Ar',
			'Moons': '1 (Luna)'
		},
		note: 'The night side is lit by real city-light data; cloud cover is a separate shell rotating slightly faster than the surface.'
	},

	{
		id: 'mars',
		name: 'Mars',
		type: 'planet',
		elements: {
			a: 1.52371034, adot: 0.00001847,
			e: 0.09339410, edot: 0.00007882,
			i: 1.84969142, idot: -0.00813131,
			L: -4.55343205, Ldot: 19140.30268499,
			lp: -23.94362959, lpdot: 0.44441088,
			om: 49.55953891, omdot: -0.29257343
		},
		rotation: { ra: 317.68143, raDot: -0.1061, dec: 52.88650, decDot: -0.0609, w0: 176.630, wdot: 350.89198226 },
		radius: 3396.2,
		flattening: 0.00589,
		mass: 6.4171e23,
		albedo: 0.250,
		texture: 'mars.jpg',
		atmosphere: { height: 70, color: 0xd9a17a, haze: 0xe8b98f, density: 1, rayleigh: 0.10, mie: 0.30, g: 0.62 },
		color: 0xb05c3a,
		facts: {
			'Mean radius': '3,389.5 km (0.532 Earth)',
			'Mass': '6.417e23 kg (0.107 Earth)',
			'Surface gravity': '3.71 m/s2',
			'Surface pressure': '6.36 mbar',
			'Sidereal rotation': '24h 37m 22s',
			'Orbital period': '686.98 days',
			'Mean temperature': '-65 C',
			'Atmosphere': '95% CO2, 2.6% N2, 1.9% Ar',
			'Moons': '2 (Phobos, Deimos)'
		},
		note: 'Olympus Mons rises 22 km and Valles Marineris runs 4,000 km -- both visible on the map at full zoom.'
	},

	{
		id: 'jupiter',
		name: 'Jupiter',
		type: 'planet',
		elements: {
			a: 5.20288700, adot: -0.00011607,
			e: 0.04838624, edot: -0.00013253,
			i: 1.30439695, idot: -0.00183714,
			L: 34.39644051, Ldot: 3034.74612775,
			lp: 14.72847983, lpdot: 0.21252668,
			om: 100.47390909, omdot: 0.20469106,
			b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000
		},
		rotation: { ra: 268.056595, raDot: -0.006499, dec: 64.495303, decDot: 0.002413, w0: 284.95, wdot: 870.5360000 },
		radius: 71492,
		flattening: 0.06487,
		mass: 1.8982e27,
		albedo: 0.538,
		texture: 'jupiter.jpg',
		atmosphere: { height: 1400, color: 0xc9d8f0, haze: 0xf2e4c8, density: 1, rayleigh: 0.55, mie: 0.30, g: 0.7 },
		rings: [ { inner: 122500, outer: 129000, opacity: 0.05, color: 0xa08868, tilt: 0 } ],
		color: 0xc2a582,
		facts: {
			'Equatorial radius': '71,492 km (11.21 Earth)',
			'Mass': '1.898e27 kg (317.8 Earth)',
			'Surface gravity': '24.79 m/s2 (1 bar level)',
			'Sidereal rotation': '9h 55m 30s (System III)',
			'Orbital period': '11.862 years',
			'Cloud-top temperature': '-110 C',
			'Atmosphere': '89.8% H2, 10.2% He, traces CH4, NH3',
			'Moons': '97 confirmed',
			'Oblateness': '6.5% -- visibly squashed'
		},
		note: 'Spins once every ten hours, which flattens it by 6.5%. The Great Red Spot has been shrinking since the 1800s.'
	},

	{
		id: 'saturn',
		name: 'Saturn',
		type: 'planet',
		elements: {
			a: 9.53667594, adot: -0.00125060,
			e: 0.05386179, edot: -0.00050991,
			i: 2.48599187, idot: 0.00193609,
			L: 49.95424423, Ldot: 1222.49362201,
			lp: 92.59887831, lpdot: -0.41897216,
			om: 113.66242448, omdot: -0.28867794,
			b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000
		},
		rotation: { ra: 40.589, raDot: -0.036, dec: 83.537, decDot: -0.004, w0: 38.90, wdot: 810.7939024 },
		radius: 60268,
		flattening: 0.09796,
		mass: 5.6834e26,
		albedo: 0.499,
		texture: 'saturn.jpg',
		atmosphere: { height: 1300, color: 0xcadcf2, haze: 0xf4e6c4, density: 1, rayleigh: 0.45, mie: 0.30, g: 0.7 },
		rings: [ {
			inner: 66900, outer: 140220, opacity: 1.0, texture: 'saturn_ring.png',
			color: 0xffffff, tilt: 0, detail: true
		} ],
		color: 0xd8c08a,
		facts: {
			'Equatorial radius': '60,268 km (9.45 Earth)',
			'Mass': '5.683e26 kg (95.2 Earth)',
			'Mean density': '0.687 g/cm3 -- less than water',
			'Sidereal rotation': '10h 33m 38s',
			'Orbital period': '29.457 years',
			'Cloud-top temperature': '-140 C',
			'Ring span': '66,900 - 140,220 km (C through F)',
			'Ring thickness': '~10 m to 1 km',
			'Moons': '274 confirmed'
		},
		note: 'The rings are under a kilometre thick across a 140,000 km span -- proportionally thinner than a sheet of paper the size of a city block.'
	},

	{
		id: 'uranus',
		name: 'Uranus',
		type: 'planet',
		elements: {
			a: 19.18916464, adot: -0.00196176,
			e: 0.04725744, edot: -0.00004397,
			i: 0.77263783, idot: -0.00242939,
			L: 313.23810451, Ldot: 428.48202785,
			lp: 170.95427630, lpdot: 0.40805281,
			om: 74.01692503, omdot: 0.04240589,
			b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000
		},
		rotation: { ra: 257.311, raDot: 0, dec: -15.175, decDot: 0, w0: 203.81, wdot: -501.1600928 },
		radius: 25559,
		flattening: 0.02293,
		mass: 8.6810e25,
		albedo: 0.488,
		texture: 'uranus.jpg',
		atmosphere: { height: 900, color: 0x7fd8e8, haze: 0xdff2f6, density: 1, rayleigh: 1.25, mie: 0.12, g: 0.7 },
		rings: [
			{ inner: 41837, outer: 42571, opacity: 0.30, color: 0x6f7378, tilt: 0 },
			{ inner: 44718, outer: 45661, opacity: 0.30, color: 0x6f7378, tilt: 0 },
			{ inner: 47176, outer: 47379, opacity: 0.35, color: 0x6f7378, tilt: 0 },
			{ inner: 50724, outer: 51149, opacity: 0.55, color: 0x7a7e84, tilt: 0 }
		],
		color: 0x96d7de,
		facts: {
			'Equatorial radius': '25,559 km (4.01 Earth)',
			'Mass': '8.681e25 kg (14.5 Earth)',
			'Axial tilt': '97.77 degrees -- rolls on its side',
			'Sidereal rotation': '17h 14m 24s (retrograde)',
			'Orbital period': '84.011 years',
			'Cloud-top temperature': '-195 C (coldest in the solar system)',
			'Atmosphere': '82.5% H2, 15.2% He, 2.3% CH4',
			'Moons': '28 confirmed'
		},
		note: 'Tipped 98 degrees, so each pole spends 42 years in continuous sunlight and 42 in darkness. Methane absorbs red light, hence the cyan.'
	},

	{
		id: 'neptune',
		name: 'Neptune',
		type: 'planet',
		elements: {
			a: 30.06992276, adot: 0.00026291,
			e: 0.00859048, edot: 0.00005105,
			i: 1.77004347, idot: 0.00035372,
			L: -55.12002969, Ldot: 218.45945325,
			lp: 44.96476227, lpdot: -0.32241464,
			om: 131.78422574, omdot: -0.00508664,
			b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000
		},
		// Neptune's pole carries a periodic term driven by the precession of
		// Triton's orbit; leaving it out puts the obliquity half a degree out.
		rotation: {
			ra: 299.36, raDot: 0, dec: 43.46, decDot: 0, w0: 253.18, wdot: 536.3128492,
			periodic: { argument0: 357.85, argumentRate: 52.316, raAmplitude: 0.70, decAmplitude: -0.51, wAmplitude: -0.48 }
		},
		radius: 24764,
		flattening: 0.01708,
		mass: 1.02413e26,
		albedo: 0.442,
		texture: 'neptune.jpg',
		atmosphere: { height: 900, color: 0x4f82e0, haze: 0xd6e4fa, density: 1, rayleigh: 1.45, mie: 0.12, g: 0.7 },
		rings: [
			{ inner: 41900, outer: 42900, opacity: 0.12, color: 0x55606e, tilt: 0 },
			{ inner: 53200, outer: 53400, opacity: 0.15, color: 0x55606e, tilt: 0 },
			{ inner: 61950, outer: 62930, opacity: 0.20, color: 0x5b6572, tilt: 0 }
		],
		color: 0x3f68c4,
		facts: {
			'Equatorial radius': '24,764 km (3.88 Earth)',
			'Mass': '1.024e26 kg (17.1 Earth)',
			'Surface gravity': '11.15 m/s2',
			'Sidereal rotation': '16h 06m 36s',
			'Orbital period': '164.79 years',
			'Cloud-top temperature': '-201 C',
			'Wind speeds': 'up to 2,100 km/h -- fastest known',
			'Atmosphere': '80% H2, 19% He, 1.5% CH4',
			'Moons': '16 confirmed'
		},
		note: 'Found in 1846 by pointing a telescope where Le Verrier calculated it had to be, from the way it was tugging on Uranus.'
	}

];

export const SUN = {
	id: 'sun',
	name: 'Sun',
	type: 'star',
	radius: 696340,
	flattening: 0,
	mass: 1.9885e30,
	texture: 'sun.jpg',
	rotation: { ra: 286.13, raDot: 0, dec: 63.87, decDot: 0, w0: 84.176, wdot: 14.1844000 },
	color: 0xfff3d9,
	facts: {
		'Radius': '696,340 km (109 Earth)',
		'Mass': '1.989e30 kg (333,000 Earth)',
		'Surface temperature': '5,772 K',
		'Core temperature': '15.7 million K',
		'Luminosity': '3.828e26 W',
		'Sidereal rotation': '25.05 days at the equator, 34 at the poles',
		'Composition': '73% H, 25% He by mass',
		'Age': '4.6 billion years',
		'Share of system mass': '99.86%'
	},
	note: 'Fuses 600 million tonnes of hydrogen a second. The photosphere granulation you see is convection cells roughly the size of Texas.'
};
