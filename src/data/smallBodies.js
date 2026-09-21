/**
 * Dwarf planets, comets and spacecraft.
 *
 * Unlike the major planets, these use osculating elements at a stated epoch
 * rather than a fitted secular theory, so they are accurate near that epoch and
 * drift slowly away from it. Values from the JPL Small-Body Database.
 *
 * Angles in degrees, `a` in AU, `period` in Julian years, `M0` at `epoch`
 * (days since J2000).
 */

export const DWARF_PLANETS = [

	{
		id: 'ceres', name: 'Ceres', type: 'dwarf',
		a: 2.7660, e: 0.07839, i: 10.5877, node: 80.2549, peri: 73.5977,
		M0: 291.428, epoch: 0, period: 4.6009,
		radius: 469.7, flattening: 0.075, mass: 9.3835e20, albedo: 0.09,
		texture: 'ceres.jpg', color: 0x8d8880,
		rotation: { ra: 291.418, dec: 66.764, w0: 170.650, wdot: 952.1532 },
		facts: {
			'Mean radius': '469.7 km',
			'Mass': '9.38e20 kg -- a third of the whole asteroid belt',
			'Orbital period': '4.60 years',
			'Location': 'Main asteroid belt, 2.77 AU',
			'Discovered': '1 January 1801 by Giuseppe Piazzi',
			'Water': 'Likely a subsurface briny layer; water vapour detected'
		},
		note: 'Classified as a planet for fifty years, then an asteroid, then a dwarf planet. Dawn orbited it from 2015.'
	},
	{
		id: 'pluto', name: 'Pluto', type: 'dwarf',
		elements: {
			a: 39.48211675, adot: -0.00031596,
			e: 0.24882730, edot: 0.00005170,
			i: 17.14001206, idot: 0.00004818,
			L: 238.92903833, Ldot: 145.20780515,
			lp: 224.06891629, lpdot: -0.04062942,
			om: 110.30393684, omdot: -0.01183482,
			b: -0.01262724, c: 0, s: 0, f: 0
		},
		period: 247.94,
		radius: 1188.3, flattening: 0, mass: 1.303e22, albedo: 0.52,
		color: 0xc2a88d,
		rotation: { ra: 132.993, dec: -6.163, w0: 302.695, wdot: -56.3625225 },
		surface: { kind: 'twotone', base: 0xd8b48c, accent: 0x6e5240, scale: 4, contrast: 0.55 },
		atmosphere: { height: 60, color: 0x9ec3e0, haze: 0xdce8f2, density: 1, rayleigh: 0.35, mie: 0.15, g: 0.7 },
		facts: {
			'Mean radius': '1,188.3 km (0.186 Earth)',
			'Mass': '1.303e22 kg',
			'Orbital period': '247.94 years',
			'Distance': '29.7 - 49.3 AU',
			'Inclination': '17.14 degrees',
			'Surface temperature': '-232 C',
			'Atmosphere': 'N2, CH4, CO -- freezes out near aphelion',
			'Moons': '5 (Charon, Styx, Nix, Kerberos, Hydra)',
			'Discovered': '18 February 1930 by Clyde Tombaugh'
		},
		note: 'In a 3:2 resonance with Neptune, which is why their crossing orbits never let them meet. Sputnik Planitia is a nitrogen-ice glacier the size of Texas.'
	},
	{
		id: 'haumea', name: 'Haumea', type: 'dwarf',
		a: 43.116, e: 0.19126, i: 28.2137, node: 122.167, peri: 239.041,
		M0: 218.205, epoch: 0, period: 283.28,
		radius: 816, flattening: 0.5, mass: 4.006e21, albedo: 0.51,
		texture: 'haumea.jpg', color: 0xd6d2cb,
		rotation: { ra: 285.1, dec: -10.6, w0: 0, wdot: 2325.29 },
		rings: [ { inner: 2287, outer: 2357, opacity: 0.35, color: 0x8d8880, tilt: 0 } ],
		facts: {
			'Dimensions': '2,100 x 1,680 x 1,074 km',
			'Mass': '4.006e21 kg',
			'Rotation': '3.92 hours -- fastest of any large body',
			'Orbital period': '283.3 years',
			'Rings': 'Yes -- confirmed by stellar occultation in 2017',
			'Moons': '2 (Hiʻiaka, Namaka)'
		},
		note: 'Spun so fast by an ancient collision that it is stretched into an ellipsoid twice as long as it is thick.'
	},
	{
		id: 'makemake', name: 'Makemake', type: 'dwarf',
		a: 45.430, e: 0.16126, i: 28.9835, node: 79.620, peri: 294.834,
		M0: 165.514, epoch: 0, period: 306.21,
		radius: 715, flattening: 0.02, mass: 3.1e21, albedo: 0.82,
		texture: 'makemake.jpg', color: 0xc4a08a,
		rotation: { ra: 0, dec: 90, w0: 0, wdot: 1141.0 },
		facts: {
			'Mean radius': '715 km',
			'Orbital period': '306.2 years',
			'Surface': 'Methane and ethane ice',
			'Discovered': '31 March 2005',
			'Moons': '1 (S/2015 (136472) 1)'
		}
	},
	{
		id: 'eris', name: 'Eris', type: 'dwarf',
		a: 67.864, e: 0.43607, i: 44.040, node: 35.951, peri: 151.639,
		M0: 205.989, epoch: 0, period: 559.07,
		radius: 1163, flattening: 0, mass: 1.6466e22, albedo: 0.96,
		texture: 'eris.jpg', color: 0xd8d5ce,
		rotation: { ra: 0, dec: 90, w0: 0, wdot: 23.2 },
		facts: {
			'Mean radius': '1,163 km',
			'Mass': '1.647e22 kg -- 27% more massive than Pluto',
			'Orbital period': '559 years',
			'Distance': '38.3 - 97.5 AU',
			'Surface temperature': '-243 C',
			'Discovered': '5 January 2005'
		},
		note: 'Finding something more massive than Pluto out here is what forced the IAU to define "planet" in 2006 -- and to reclassify Pluto.'
	}

];

/**
 * Comets.
 *
 * Each is anchored at a *known perihelion passage* -- `epoch` is that date in
 * days past J2000 and `M0` is therefore 0 -- rather than at some arbitrary
 * osculating epoch. That way the one date anybody can check is exactly right,
 * and `a` is derived from the period so Kepler's third law holds.
 *
 * `tail` scales the rendered dust and ion plumes; both only appear inside
 * roughly 3.4 AU, where water ice starts to sublimate in earnest.
 */
export const COMETS = [
	{
		id: 'halley', name: '1P/Halley', type: 'comet',
		a: 17.8467, e: 0.96714, i: 162.262, node: 58.420, peri: 111.332,
		M0: 0, epoch: -5074.1, period: 75.40,        // perihelion 1986-02-09
		radius: 5.5, color: 0x6b6a68, nucleusAlbedo: 0.04,
		tail: { dust: 1.0, ion: 1.0, activity: 1.0 },
		facts: {
			'Nucleus': '15 x 8 x 8 km',
			'Orbital period': '75.3 years (retrograde)',
			'Perihelion': '0.586 AU',
			'Aphelion': '35.1 AU',
			'Last perihelion': '9 February 1986',
			'Next perihelion': '28 July 2061'
		},
		note: 'The first comet recognised as periodic. Halley predicted its 1758 return from Newton’s laws and was proved right sixteen years after he died.'
	},
	{
		id: 'encke', name: '2P/Encke', type: 'comet',
		a: 2.21540, e: 0.84833, i: 11.781, node: 334.568, peri: 186.545,
		M0: 0, epoch: 7481.0, period: 3.30,          // perihelion 2020-06-26
		radius: 2.4, color: 0x7a7876, nucleusAlbedo: 0.046,
		tail: { dust: 0.45, ion: 0.6, activity: 0.7 },
		facts: {
			'Nucleus': '4.8 km',
			'Orbital period': '3.30 years -- shortest of any known comet',
			'Perihelion': '0.336 AU',
			'Associated shower': 'Taurids'
		}
	},
	{
		id: 'churyumov', name: '67P/Churyumov-Gerasimenko', type: 'comet',
		a: 3.46296, e: 0.64102, i: 7.044, node: 50.135, peri: 12.780,
		M0: 0, epoch: 7976.0, period: 6.44,          // perihelion 2021-11-02
		radius: 2.0, color: 0x59564f, nucleusAlbedo: 0.06, irregular: 0.4,
		tail: { dust: 0.5, ion: 0.45, activity: 0.6 },
		facts: {
			'Nucleus': '4.3 x 4.1 x 3.3 km, two lobes',
			'Orbital period': '6.44 years',
			'Perihelion': '1.24 AU',
			'Visited by': 'Rosetta and Philae, 2014-2016'
		},
		note: 'The only comet humans have orbited and landed on. Rosetta rode it through perihelion and then set itself down on the surface.'
	},
	{
		id: 'halebopp', name: 'C/1995 O1 (Hale-Bopp)', type: 'comet',
		a: 186.0, e: 0.995087, i: 89.288, node: 282.471, peri: 130.591,
		M0: 0, epoch: -1005.0, period: 2533.0,       // perihelion 1997-04-01
		radius: 30, color: 0x807d78, nucleusAlbedo: 0.04,
		tail: { dust: 2.2, ion: 2.0, activity: 2.4 },
		facts: {
			'Nucleus': '40-80 km -- unusually large',
			'Orbital period': '~2,500 years',
			'Perihelion': '0.914 AU, on 1 April 1997',
			'Visible to the naked eye': '18 months -- a record'
		},
		note: 'Bright enough to see from city centres for a year and a half. It will not be back until roughly the year 4530.'
	}
];

/**
 * Interstellar probes. All four are on hyperbolic escape trajectories where a
 * Keplerian ellipse does not apply, so they are propagated from a published
 * state: heliocentric distance and recession rate at a reference epoch, along a
 * fixed asymptotic direction given in ecliptic longitude/latitude.
 *
 * That is accurate to well under a percent over decades -- the residual solar
 * gravity out past 100 AU barely bends the path -- but it is an extrapolation,
 * not an ephemeris lookup.
 */
export const SPACECRAFT = [
	{
		id: 'voyager1', name: 'Voyager 1', type: 'spacecraft',
		refDays: 9497.5,          // 2026-01-01
		refDistanceAU: 167.6, rateAUPerYear: 3.58,
		lonDeg: 254.5, latDeg: 35.0,
		launch: '1977-09-05', color: 0xffd27f,
		facts: {
			'Launched': '5 September 1977',
			'Speed': '17.0 km/s relative to the Sun',
			'Left the heliosphere': '25 August 2012',
			'Flybys': 'Jupiter 1979, Saturn 1980',
			'Signal delay': 'about 23 hours each way',
			'Power': 'RTG, declining ~4 W/year'
		},
		note: 'The most distant human-made object. It took the "Pale Blue Dot" photograph from 6 billion km out in 1990.'
	},
	{
		id: 'voyager2', name: 'Voyager 2', type: 'spacecraft',
		refDays: 9497.5,
		refDistanceAU: 139.7, rateAUPerYear: 3.23,
		lonDeg: 290.0, latDeg: -31.5,
		launch: '1977-08-20', color: 0xffd27f,
		facts: {
			'Launched': '20 August 1977',
			'Speed': '15.4 km/s relative to the Sun',
			'Left the heliosphere': '5 November 2018',
			'Flybys': 'Jupiter 1979, Saturn 1981, Uranus 1986, Neptune 1989',
			'Distinction': 'The only spacecraft to visit Uranus or Neptune'
		},
		note: 'Caught a planetary alignment that comes round every 175 years, and is still the only probe to have seen the ice giants up close.'
	},
	{
		id: 'newhorizons', name: 'New Horizons', type: 'spacecraft',
		refDays: 9497.5,
		refDistanceAU: 61.5, rateAUPerYear: 2.90,
		lonDeg: 293.0, latDeg: -2.0,
		launch: '2006-01-19', color: 0xbfe0ff,
		facts: {
			'Launched': '19 January 2006',
			'Pluto flyby': '14 July 2015, 12,500 km',
			'Arrokoth flyby': '1 January 2019',
			'Speed': '13.7 km/s relative to the Sun'
		},
		note: 'Left Earth faster than anything before it and still took nine and a half years to reach Pluto.'
	},
	{
		id: 'pioneer10', name: 'Pioneer 10', type: 'spacecraft',
		refDays: 9497.5,
		refDistanceAU: 141.0, rateAUPerYear: 2.53,
		lonDeg: 77.0, latDeg: 3.0,
		launch: '1972-03-02', color: 0xcdbfa8,
		facts: {
			'Launched': '2 March 1972',
			'Jupiter flyby': '3 December 1973 -- the first',
			'Last contact': '23 January 2003',
			'Heading': 'Toward Aldebaran, about 2 million years out'
		},
		note: 'First through the asteroid belt and first past Jupiter. It has been silent since 2003 but is still coasting outward.'
	}
];
