/**
 * Major natural satellites.
 *
 * Elements are mean values relative to the parent, in kilometres and degrees.
 * `frame` says which plane the inclination is measured against:
 *
 *   'equator'  -- the parent's equatorial plane (the Laplace plane for close-in
 *                 moons; correct for essentially every regular satellite)
 *   'ecliptic' -- the ecliptic itself, used for Luna, whose orbit tracks the
 *                 ecliptic to within 5.1 degrees rather than Earth's equator
 *
 * `node` is the longitude of the ascending node and `peri` the argument of
 * periapsis in that frame; `M0` is the mean anomaly at J2000. Node/periapsis
 * precession is applied for the moons where it is fast enough to matter.
 *
 * Sources: JPL Solar System Dynamics satellite element tables and the NASA
 * planetary satellite fact sheets.
 */

export const MOONS = [

	// --- Earth -------------------------------------------------------------
	{
		id: 'luna', name: 'Moon', parent: 'earth', frame: 'ecliptic',
		// Elements at J2000 from the ELP/Meeus mean arguments: mean longitude
		// 218.3164477, mean anomaly 134.9633964, node 125.0445479, and the
		// argument of perigee that follows from L = node + peri + M.
		//
		// `anomalisticPeriod` is the one that drives the mean anomaly. The Moon's
		// perigee swings all the way round in 8.85 years, so the anomalistic
		// month (27.5545 d) is a quarter of a day longer than the sidereal month
		// (27.3217 d). Advancing M at the sidereal rate instead looks harmless
		// and puts the Moon's phase wrong by tens of degrees within a decade,
		// which destroys eclipse prediction entirely.
		// `theory: 'elp'` switches the Moon onto the perturbation series in
		// physics/lunar.js. The elements below are still used to draw its orbit
		// path and to describe the orbit in the interface.
		theory: 'elp',
		a: 384399, e: 0.0549, i: 5.145,
		node: 125.0445479, peri: 318.3085, M0: 134.9633964,
		period: 27.321661, anomalisticPeriod: 27.554549,
		nodeDot: -0.0529539, periDot: 0.1643586,
		radius: 1737.4, mass: 7.342e22, albedo: 0.136, texture: 'moon.jpg',
		tidallyLocked: true, color: 0x9a9691,
		facts: {
			'Mean radius': '1,737.4 km (0.273 Earth)',
			'Mass': '7.342e22 kg (0.0123 Earth)',
			'Surface gravity': '1.62 m/s2',
			'Orbital period': '27.322 days (sidereal)',
			'Distance': '384,399 km mean, receding 3.8 cm/yr',
			'Mean temperature': '-20 C (-173 to 127 C)'
		},
		note: 'Tidally locked, so the same hemisphere always faces Earth. The node regresses once every 18.6 years, which is what sets the eclipse cycle.'
	},

	// --- Mars --------------------------------------------------------------
	{
		id: 'phobos', name: 'Phobos', parent: 'mars', frame: 'equator',
		a: 9376, e: 0.0151, i: 1.093, node: 84.0, peri: 150.2, M0: 92.5,
		period: 0.31891023, radius: 11.267, mass: 1.0659e16, albedo: 0.071,
		tidallyLocked: true, color: 0x6b625a, irregular: 0.28,
		facts: {
			'Dimensions': '27 x 22 x 18 km',
			'Orbital period': '7h 39m -- faster than Mars rotates',
			'Distance': '9,376 km from centre (6,000 km altitude)',
			'Fate': 'Spiralling in; breaks up in ~50 million years'
		},
		note: 'Orbits faster than Mars turns, so from the surface it rises in the west and sets in the east twice a day.'
	},
	{
		id: 'deimos', name: 'Deimos', parent: 'mars', frame: 'equator',
		a: 23463, e: 0.00033, i: 0.93, node: 79.4, peri: 260.7, M0: 296.2,
		period: 1.263, radius: 6.2, mass: 1.4762e15, albedo: 0.068,
		tidallyLocked: true, color: 0x74695e, irregular: 0.22,
		facts: { 'Dimensions': '15 x 12 x 11 km', 'Orbital period': '30.3 hours', 'Distance': '23,463 km' }
	},

	// --- Jupiter -----------------------------------------------------------
	{
		id: 'amalthea', name: 'Amalthea', parent: 'jupiter', frame: 'equator',
		a: 181366, e: 0.0032, i: 0.374, node: 108.9, peri: 155.9, M0: 185.2,
		period: 0.49817905, radius: 83.5, mass: 2.08e18, albedo: 0.09,
		tidallyLocked: true, color: 0x8c4a3a, irregular: 0.35,
		facts: { 'Dimensions': '250 x 146 x 128 km', 'Orbital period': '11.96 hours' }
	},
	{
		id: 'io', name: 'Io', parent: 'jupiter', frame: 'equator',
		a: 421800, e: 0.0041, i: 0.050, node: 43.98, peri: 84.13, M0: 342.02,
		period: 1.769137786, radius: 1821.6, mass: 8.9319e22, albedo: 0.63,
		tidallyLocked: true, color: 0xd8c05a,
		surface: { kind: 'volcanic', base: 0xd9c25c, accent: 0xa84a2a, scale: 5.5, contrast: 0.55 },
		facts: {
			'Mean radius': '1,821.6 km',
			'Orbital period': '1.769 days',
			'Volcanism': '400+ active volcanoes, plumes to 500 km',
			'Surface temperature': '-143 C, hotspots above 1,300 C'
		},
		note: 'The most volcanically active body known. Tidal flexing from Jupiter and the Laplace resonance with Europa and Ganymede keeps its interior molten.'
	},
	{
		id: 'europa', name: 'Europa', parent: 'jupiter', frame: 'equator',
		a: 671100, e: 0.0094, i: 0.471, node: 219.11, peri: 88.97, M0: 171.02,
		period: 3.551181041, radius: 1560.8, mass: 4.7998e22, albedo: 0.67,
		tidallyLocked: true, color: 0xd9cfc0,
		surface: { kind: 'ice', base: 0xe6ded0, accent: 0x9a7b5e, scale: 9.0, contrast: 0.30, cracks: 1.0 },
		facts: {
			'Mean radius': '1,560.8 km',
			'Orbital period': '3.551 days',
			'Surface': 'Water ice, fewer than 30 impact craters',
			'Ocean': '60-150 km deep under 15-25 km of ice',
			'Surface temperature': '-160 C'
		},
		note: 'Holds roughly twice the liquid water of all Earth’s oceans, under an ice shell scored by tidal cracks.'
	},
	{
		id: 'ganymede', name: 'Ganymede', parent: 'jupiter', frame: 'equator',
		a: 1070400, e: 0.0013, i: 0.204, node: 63.55, peri: 192.42, M0: 317.54,
		period: 7.15455296, radius: 2634.1, mass: 1.4819e23, albedo: 0.43,
		tidallyLocked: true, color: 0x9c948a,
		surface: { kind: 'grooved', base: 0x9e958a, accent: 0x5f5952, scale: 7.0, contrast: 0.42 },
		facts: {
			'Mean radius': '2,634.1 km -- larger than Mercury',
			'Orbital period': '7.155 days',
			'Magnetic field': 'Intrinsic -- the only moon with one',
			'Surface': 'Dark cratered terrain and bright grooved terrain'
		},
		note: 'The largest moon in the solar system, and the only one generating its own magnetic field.'
	},
	{
		id: 'callisto', name: 'Callisto', parent: 'jupiter', frame: 'equator',
		a: 1882700, e: 0.0074, i: 0.205, node: 298.85, peri: 52.64, M0: 181.41,
		period: 16.6890184, radius: 2410.3, mass: 1.0759e23, albedo: 0.22,
		tidallyLocked: true, color: 0x6e645a,
		surface: { kind: 'cratered', base: 0x70665b, accent: 0xb9ae9f, scale: 11.0, contrast: 0.5 },
		facts: {
			'Mean radius': '2,410.3 km',
			'Orbital period': '16.689 days',
			'Surface age': '~4 billion years -- the most cratered body known'
		},
		note: 'Outside Jupiter’s worst radiation belts and geologically dead, which makes it the usual pick for a crewed Jovian base.'
	},

	// --- Saturn ------------------------------------------------------------
	{
		id: 'mimas', name: 'Mimas', parent: 'saturn', frame: 'equator',
		a: 185539, e: 0.0196, i: 1.574, node: 173.03, peri: 332.5, M0: 14.9,
		period: 0.9424218, radius: 198.2, mass: 3.749e19, albedo: 0.962,
		tidallyLocked: true, color: 0xbdb8b0,
		surface: { kind: 'cratered', base: 0xc3beb6, accent: 0x7d786f, scale: 10, contrast: 0.45 },
		facts: { 'Mean radius': '198.2 km', 'Orbital period': '22.6 hours', 'Herschel crater': '139 km across -- a third of Mimas' }
	},
	{
		id: 'enceladus', name: 'Enceladus', parent: 'saturn', frame: 'equator',
		a: 237948, e: 0.0047, i: 0.009, node: 342.5, peri: 0.0, M0: 199.7,
		period: 1.370218, radius: 252.1, mass: 1.08022e20, albedo: 1.375,
		tidallyLocked: true, color: 0xf2f4f5,
		surface: { kind: 'ice', base: 0xf4f6f7, accent: 0xc4cdd4, scale: 12, contrast: 0.18, cracks: 0.7 },
		facts: {
			'Mean radius': '252.1 km',
			'Orbital period': '1.370 days',
			'Albedo': '1.375 -- the most reflective body in the solar system',
			'Plumes': 'Water vapour and ice from south-polar fissures'
		},
		note: 'Its geysers feed Saturn’s E ring. Cassini flew through them and found salts and organic molecules.'
	},
	{
		id: 'tethys', name: 'Tethys', parent: 'saturn', frame: 'equator',
		a: 294619, e: 0.0001, i: 1.12, node: 259.8, peri: 45.2, M0: 243.4,
		period: 1.887802, radius: 531.1, mass: 6.17449e20, albedo: 1.229,
		tidallyLocked: true, color: 0xdcd8d1,
		surface: { kind: 'ice', base: 0xdedad3, accent: 0xa09a92, scale: 9, contrast: 0.3 },
		facts: { 'Mean radius': '531.1 km', 'Ithaca Chasma': 'A canyon 2,000 km long', 'Density': '0.98 g/cm3 -- almost pure water ice' }
	},
	{
		id: 'dione', name: 'Dione', parent: 'saturn', frame: 'equator',
		a: 377396, e: 0.0022, i: 0.019, node: 290.4, peri: 284.3, M0: 322.0,
		period: 2.736915, radius: 561.4, mass: 1.095452e21, albedo: 0.998,
		tidallyLocked: true, color: 0xcfcbc4,
		surface: { kind: 'ice', base: 0xd2cec7, accent: 0x8f8a83, scale: 8, contrast: 0.34, cracks: 0.5 },
		facts: { 'Mean radius': '561.4 km', 'Orbital period': '2.737 days', 'Surface': 'Bright ice cliffs up to several hundred metres' }
	},
	{
		id: 'rhea', name: 'Rhea', parent: 'saturn', frame: 'equator',
		a: 527108, e: 0.001, i: 0.345, node: 351.2, peri: 241.6, M0: 179.2,
		period: 4.518212, radius: 763.8, mass: 2.306518e21, albedo: 0.949,
		tidallyLocked: true, color: 0xc9c5bd,
		surface: { kind: 'cratered', base: 0xccc8c0, accent: 0x847f77, scale: 9, contrast: 0.4 },
		facts: { 'Mean radius': '763.8 km', 'Orbital period': '4.518 days' }
	},
	{
		id: 'titan', name: 'Titan', parent: 'saturn', frame: 'equator',
		a: 1221870, e: 0.0288, i: 0.349, node: 28.06, peri: 180.5, M0: 163.3,
		period: 15.945421, radius: 2574.7, mass: 1.3452e23, albedo: 0.22,
		tidallyLocked: true, color: 0xd8a45a,
		atmosphere: { height: 700, color: 0xe0a95c, haze: 0xffb95e, density: 1, rayleigh: 0.35, mie: 2.4, g: 0.55 },
		surface: { kind: 'hazy', base: 0xd8a45a, accent: 0x9c6a33, scale: 6, contrast: 0.25 },
		facts: {
			'Mean radius': '2,574.7 km -- bigger than Mercury',
			'Orbital period': '15.945 days',
			'Surface pressure': '1.45 bar -- denser than Earth’s',
			'Atmosphere': '94.2% N2, 5.7% CH4',
			'Surface temperature': '-179 C',
			'Surface liquids': 'Methane/ethane lakes and seas'
		},
		note: 'The only moon with a substantial atmosphere, and the only other place with stable surface liquid -- rivers and seas of methane.'
	},
	{
		id: 'hyperion', name: 'Hyperion', parent: 'saturn', frame: 'equator',
		a: 1481009, e: 0.1230, i: 0.43, node: 263.8, peri: 324.0, M0: 89.0,
		period: 21.276, radius: 135, mass: 5.62e18, albedo: 0.3,
		tidallyLocked: false, chaotic: true, color: 0xa08a6c, irregular: 0.32,
		facts: { 'Dimensions': '360 x 266 x 205 km', 'Rotation': 'Chaotic -- no fixed axis or period', 'Density': '0.54 g/cm3 -- mostly empty space' },
		note: 'Tumbles chaotically. Its rotation is genuinely unpredictable more than a few weeks out.'
	},
	{
		id: 'iapetus', name: 'Iapetus', parent: 'saturn', frame: 'equator',
		a: 3560820, e: 0.0286, i: 15.47, node: 81.1, peri: 271.6, M0: 201.8,
		period: 79.3215, radius: 734.5, mass: 1.805635e21, albedo: 0.05,
		tidallyLocked: true, color: 0x8c8375,
		surface: { kind: 'twotone', base: 0xd8d2c6, accent: 0x2a2118, scale: 3, contrast: 0.9 },
		facts: {
			'Mean radius': '734.5 km',
			'Orbital period': '79.32 days',
			'Albedo': '0.05 on the leading side, 0.6 on the trailing side',
			'Equatorial ridge': '13 km high, 1,300 km long'
		},
		note: 'Two-toned: the leading hemisphere sweeps up dark dust from Phoebe, and a 13 km equatorial ridge runs most of the way around it.'
	},

	// --- Uranus ------------------------------------------------------------
	{
		id: 'miranda', name: 'Miranda', parent: 'uranus', frame: 'equator',
		a: 129390, e: 0.0013, i: 4.232, node: 326.0, peri: 68.3, M0: 311.3,
		period: 1.413479, radius: 235.8, mass: 6.59e19, albedo: 0.32,
		tidallyLocked: true, color: 0x9d9a96,
		surface: { kind: 'grooved', base: 0xa3a09c, accent: 0x605d59, scale: 12, contrast: 0.5 },
		facts: { 'Mean radius': '235.8 km', 'Verona Rupes': 'A 20 km cliff -- the tallest known' },
		note: 'Looks assembled from mismatched parts, possibly reaccreted after a catastrophic impact.'
	},
	{
		id: 'ariel', name: 'Ariel', parent: 'uranus', frame: 'equator',
		a: 190900, e: 0.0012, i: 0.260, node: 22.4, peri: 115.3, M0: 39.5,
		period: 2.520379, radius: 578.9, mass: 1.353e21, albedo: 0.53,
		tidallyLocked: true, color: 0xb6b3af,
		surface: { kind: 'ice', base: 0xbab7b3, accent: 0x7c7975, scale: 8, contrast: 0.32, cracks: 0.6 },
		facts: { 'Mean radius': '578.9 km', 'Orbital period': '2.520 days' }
	},
	{
		id: 'umbriel', name: 'Umbriel', parent: 'uranus', frame: 'equator',
		a: 266000, e: 0.0039, i: 0.128, node: 33.5, peri: 84.7, M0: 12.5,
		period: 4.144177, radius: 584.7, mass: 1.172e21, albedo: 0.26,
		tidallyLocked: true, color: 0x6f6d6a,
		surface: { kind: 'cratered', base: 0x726f6c, accent: 0x9d9a95, scale: 10, contrast: 0.3 },
		facts: { 'Mean radius': '584.7 km', 'Albedo': '0.26 -- darkest of the Uranian moons' }
	},
	{
		id: 'titania', name: 'Titania', parent: 'uranus', frame: 'equator',
		a: 436300, e: 0.0011, i: 0.340, node: 99.8, peri: 284.4, M0: 24.6,
		period: 8.705872, radius: 788.4, mass: 3.527e21, albedo: 0.35,
		tidallyLocked: true, color: 0x9b958d,
		surface: { kind: 'grooved', base: 0x9e988f, accent: 0x625d57, scale: 7, contrast: 0.36 },
		facts: { 'Mean radius': '788.4 km -- largest Uranian moon', 'Messina Chasma': '1,500 km rift system' }
	},
	{
		id: 'oberon', name: 'Oberon', parent: 'uranus', frame: 'equator',
		a: 583500, e: 0.0014, i: 0.058, node: 279.8, peri: 104.4, M0: 283.1,
		period: 13.463239, radius: 761.4, mass: 3.014e21, albedo: 0.31,
		tidallyLocked: true, color: 0x8e867d,
		surface: { kind: 'cratered', base: 0x91897f, accent: 0x554f48, scale: 9, contrast: 0.42 },
		facts: { 'Mean radius': '761.4 km', 'Orbital period': '13.463 days' }
	},

	// --- Neptune -----------------------------------------------------------
	{
		id: 'proteus', name: 'Proteus', parent: 'neptune', frame: 'equator',
		a: 117647, e: 0.00053, i: 0.524, node: 162.8, peri: 301.4, M0: 117.0,
		period: 1.122315, radius: 210, mass: 4.4e19, albedo: 0.096,
		tidallyLocked: true, color: 0x5e5b58, irregular: 0.18,
		facts: { 'Dimensions': '424 x 390 x 396 km', 'Note': 'About as large as a body can get without pulling itself round' }
	},
	{
		id: 'triton', name: 'Triton', parent: 'neptune', frame: 'equator',
		a: 354759, e: 0.000016, i: 156.885, node: 178.1, peri: 66.1, M0: 264.8,
		period: 5.876854, radius: 1353.4, mass: 2.139e22, albedo: 0.76,
		tidallyLocked: true, retrograde: true, color: 0xd6cfc4,
		atmosphere: { height: 40, color: 0xbcd0e0, haze: 0xe8f0f8, density: 1, rayleigh: 0.30, mie: 0.10, g: 0.7 },
		surface: { kind: 'ice', base: 0xdcd5c9, accent: 0xa89a86, scale: 7, contrast: 0.22, cracks: 0.45 },
		facts: {
			'Mean radius': '1,353.4 km',
			'Orbital period': '5.877 days (retrograde)',
			'Surface temperature': '-235 C -- coldest measured',
			'Geysers': 'Nitrogen plumes 8 km high',
			'Fate': 'Spiralling in; tidally disrupted in ~3.6 billion years'
		},
		note: 'Orbits backwards, which means it was captured rather than formed in place -- almost certainly a Kuiper belt object Neptune caught.'
	},
	{
		id: 'nereid', name: 'Nereid', parent: 'neptune', frame: 'ecliptic',
		a: 5513800, e: 0.7507, i: 7.23, node: 319.9, peri: 296.6, M0: 359.3,
		period: 360.1362, radius: 170, mass: 3.1e19, albedo: 0.155,
		tidallyLocked: false, color: 0x7d7973, irregular: 0.2,
		facts: { 'Mean radius': '170 km', 'Eccentricity': '0.751 -- ranges from 1.4 to 9.7 million km' }
	},

	// --- Pluto -------------------------------------------------------------
	{
		id: 'charon', name: 'Charon', parent: 'pluto', frame: 'equator',
		a: 19591.4, e: 0.0002, i: 0.080, node: 223.05, peri: 146.1, M0: 56.4,
		period: 6.3872304, radius: 606, mass: 1.586e21, albedo: 0.372,
		tidallyLocked: true, color: 0x9b9289,
		surface: { kind: 'cratered', base: 0x9e958b, accent: 0x6d4f42, scale: 8, contrast: 0.3 },
		facts: {
			'Mean radius': '606 km -- half Pluto’s',
			'Orbital period': '6.387 days',
			'Barycentre': 'Outside Pluto -- they orbit a point in space',
			'Mordor Macula': 'A red north-polar cap of Pluto-sourced tholins'
		},
		note: 'Big enough relative to Pluto that the pair is mutually tidally locked, turning about a barycentre outside both bodies.'
	}

];
