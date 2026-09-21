/**
 * Places to stand.
 *
 * Chosen for what the sky does from there rather than for population: a spot in
 * the path of a coming totality, the two places humans and rovers have actually
 * stood on another world, and the vantage points where a planet hangs fixed
 * overhead because the moon beneath you is tidally locked.
 *
 * Altitudes are metres above the reference ellipsoid; longitudes are east.
 */
export const LOCATIONS = [

	// --- Earth --------------------------------------------------------------
	{ body: 'earth', name: 'Luxor, Egypt', lat: 25.687, lon: 32.640, alt: 76,
		note: 'Dead centre of the 2 August 2027 totality — six minutes and 23 seconds, the longest on land this century.' },
	{ body: 'earth', name: 'Reykjavík, Iceland', lat: 64.146, lon: -21.942, alt: 20,
		note: 'In the path of the 12 August 2026 total eclipse.' },
	{ body: 'earth', name: 'Mauna Kea, Hawaiʻi', lat: 19.823, lon: -155.470, alt: 4207,
		note: 'Above 40% of the atmosphere. The best sky on the planet.' },
	{ body: 'earth', name: 'Atacama, Chile', lat: -24.628, lon: -70.404, alt: 2635,
		note: 'The driest desert on Earth, and the clearest view of the galactic centre.' },
	{ body: 'earth', name: 'Svalbard', lat: 78.223, lon: 15.648, alt: 30,
		note: 'The Sun neither rises for four months nor sets for four months.' },
	{ body: 'earth', name: 'Amundsen-Scott, South Pole', lat: -89.997, lon: 0, alt: 2835,
		note: 'The sky turns flat, parallel to the horizon. One sunrise a year.' },
	{ body: 'earth', name: 'Greenwich, London', lat: 51.477, lon: 0.0, alt: 47,
		note: 'Longitude zero, by definition.' },

	// --- The Moon -----------------------------------------------------------
	{ body: 'luna', name: 'Tranquility Base', lat: 0.674, lon: 23.473, alt: 0,
		note: 'Where Apollo 11 landed. Earth hangs 57 degrees up and never moves.' },
	{ body: 'luna', name: 'Taurus-Littrow', lat: 20.191, lon: 30.772, alt: 0,
		note: 'Apollo 17, and the last place anyone has stood off Earth.' },
	{ body: 'luna', name: 'Far side, Von Kármán', lat: -44.8, lon: 175.9, alt: 0,
		note: 'Earth never rises here. The only naturally radio-quiet place we can reach.' },

	// --- Mars ---------------------------------------------------------------
	{ body: 'mars', name: 'Jezero Crater', lat: 18.445, lon: 77.451, alt: -2600,
		note: 'Perseverance. A river delta, dry for three billion years.' },
	{ body: 'mars', name: 'Gale Crater', lat: -4.589, lon: 137.442, alt: -4500,
		note: 'Curiosity’s landing site, at the foot of a five-kilometre mountain.' },
	{ body: 'mars', name: 'Olympus Mons summit', lat: 18.65, lon: -133.8, alt: 21229,
		note: 'Twenty-two kilometres up. The horizon falls six degrees below level.' },
	{ body: 'mars', name: 'Valles Marineris', lat: -13.9, lon: -59.2, alt: -3000,
		note: 'A canyon four thousand kilometres long and seven deep.' },

	// --- The outer system ---------------------------------------------------
	{ body: 'europa', name: 'Europa, sub-Jovian point', lat: 0, lon: 0, alt: 0,
		note: 'Jupiter sits permanently overhead, twenty degrees wide — forty times the Moon from Earth.' },
	{ body: 'io', name: 'Io, sub-Jovian point', lat: 0, lon: 0, alt: 0,
		note: 'Jupiter fills nineteen degrees of sky and never moves. The ground flexes a hundred metres a day.' },
	{ body: 'titan', name: 'Huygens landing site', lat: -10.3, lon: 167.6, alt: 0,
		note: 'The only place in the outer system anything has landed. Orange smog, and a sky that never clears.' },
	{ body: 'enceladus', name: 'Enceladus, south pole', lat: -85, lon: 0, alt: 0,
		note: 'The tiger stripes. Geysers throw ice into orbit from here.' },
	{ body: 'triton', name: 'Triton, sub-Neptunian point', lat: 0, lon: 0, alt: 0,
		note: 'Neptune hangs eight degrees wide, and rises in the west.' },
	{ body: 'pluto', name: 'Pluto, sub-Charon point', lat: 0, lon: 0, alt: 0,
		note: 'Charon fills three and a half degrees and hangs motionless. They are locked to each other.' },
	{ body: 'mercury', name: 'Caloris Basin', lat: 30.5, lon: 170.0, alt: 0,
		note: 'The Sun rises, stops, backs up, and rises again. Mercury’s orbit outruns its spin near perihelion.' }

];

export const locationsFor = ( bodyId ) => LOCATIONS.filter( ( l ) => l.body === bodyId );

/** Bodies you can stand on: anything solid that the scene models. */
export const STANDABLE = new Set( [
	'mercury', 'venus', 'earth', 'mars', 'luna', 'phobos', 'deimos',
	'io', 'europa', 'ganymede', 'callisto', 'mimas', 'enceladus', 'tethys',
	'dione', 'rhea', 'titan', 'iapetus', 'miranda', 'ariel', 'umbriel',
	'titania', 'oberon', 'triton', 'proteus', 'charon',
	'ceres', 'pluto', 'haumea', 'makemake', 'eris'
] );
