import { PLANETS } from '../data/planets.js';
import { DAYS_PER_YEAR, TAU } from '../data/constants.js';

/**
 * The orbits, played.
 *
 * Each body sounds a note when it passes periapsis, at a pitch taken from its
 * period: frequency proportional to 1/period, folded by octaves into something
 * audible. That is not a decoration on the data, it *is* the data -- the
 * intervals you hear are the period ratios.
 *
 * Which makes one thing audible that is hard to see. Io, Europa and Ganymede
 * are locked in a 1:2:4 Laplace resonance, so their notes come out exactly two
 * octaves apart and every fourth Io note lands with all three together. The
 * resonance is a chord.
 *
 * Reference pitches are per system. Mapping the Galilean moons against Earth's
 * year would put them fifteen octaves up and fold them all onto the same note,
 * which would hide the very thing worth hearing.
 */

const EARTH_PERIOD = DAYS_PER_YEAR;

/** Folds a frequency into a range by octaves, preserving pitch class. */
function fold( frequency, low, high ) {
	let f = frequency;
	while ( f > high ) f /= 2;
	while ( f < low ) f *= 2;
	return f;
}

export class OrbitAudio {

	constructor() {
		this.context = null;
		this.master = null;
		this.enabled = false;
		this.volume = 0.5;
		this.voices = new Map();
		this._lastPhase = new Map();
		this._lastPlayed = new Map();
	}

	/** Web Audio needs a user gesture, so the context is built on first enable. */
	async enable() {

		if ( ! this.context ) {
			const Context = window.AudioContext || window.webkitAudioContext;
			if ( ! Context ) return false;
			this.context = new Context();

			this.master = this.context.createGain();
			this.master.gain.value = this.volume * 0.25;

			// A gentle low-pass keeps the plucks from getting glassy when several
			// inner bodies fire at once.
			this.filter = this.context.createBiquadFilter();
			this.filter.type = 'lowpass';
			this.filter.frequency.value = 5200;
			this.filter.Q.value = 0.6;

			this.reverb = this.context.createConvolver();
			this.reverb.buffer = this._impulse( 2.6, 2.2 );
			const wet = this.context.createGain();
			wet.gain.value = 0.32;

			this.filter.connect( this.master );
			this.filter.connect( this.reverb );
			this.reverb.connect( wet );
			wet.connect( this.master );
			this.master.connect( this.context.destination );
		}

		if ( this.context.state === 'suspended' ) await this.context.resume();
		this.enabled = true;
		return true;

	}

	disable() {
		this.enabled = false;
		if ( this.context && this.context.state === 'running' ) this.context.suspend();
	}

	setVolume( value ) {
		this.volume = value;
		if ( this.master ) this.master.gain.value = value * 0.25;
	}

	/** Exponentially decaying noise: a cheap, convincing room. */
	_impulse( seconds, decay ) {
		const rate = this.context.sampleRate;
		const length = Math.floor( rate * seconds );
		const buffer = this.context.createBuffer( 2, length, rate );
		for ( let channel = 0; channel < 2; channel ++ ) {
			const data = buffer.getChannelData( channel );
			for ( let i = 0; i < length; i ++ ) {
				data[ i ] = ( Math.random() * 2 - 1 ) * Math.pow( 1 - i / length, decay );
			}
		}
		return buffer;
	}

	/**
	 * Pitch for a body, in Hz.
	 * @param {object} body
	 * @param {number} referencePeriod days
	 * @param {number} referenceFrequency Hz
	 */
	static pitchFor( periodDays, referencePeriod, referenceFrequency, low, high ) {
		return fold( referenceFrequency * ( referencePeriod / periodDays ), low, high );
	}

	/** A soft struck tone. */
	play( frequency, { gain = 0.5, decay = 1.6, brightness = 1 } = {} ) {

		if ( ! this.enabled || ! this.context ) return;

		const now = this.context.currentTime;
		const osc = this.context.createOscillator();
		const partial = this.context.createOscillator();
		const envelope = this.context.createGain();
		const partialGain = this.context.createGain();

		osc.type = 'sine';
		osc.frequency.value = frequency;

		// A quiet, faster-decaying third harmonic gives the attack some edge
		// without making it a synth lead.
		partial.type = 'triangle';
		partial.frequency.value = frequency * 3;
		partialGain.gain.setValueAtTime( 0.16 * brightness, now );
		partialGain.gain.exponentialRampToValueAtTime( 0.0001, now + decay * 0.28 );

		envelope.gain.setValueAtTime( 0.0001, now );
		envelope.gain.exponentialRampToValueAtTime( Math.max( gain, 0.0002 ), now + 0.008 );
		envelope.gain.exponentialRampToValueAtTime( 0.0001, now + decay );

		osc.connect( envelope );
		partial.connect( partialGain );
		partialGain.connect( envelope );
		envelope.connect( this.filter );

		osc.start( now );
		partial.start( now );
		osc.stop( now + decay + 0.05 );
		partial.stop( now + decay + 0.05 );

	}

	/**
	 * Watches every body for a periapsis passage and sounds it.
	 *
	 * Called once a frame. At high time rates a body can complete many orbits
	 * between frames, so each voice is rate-limited -- otherwise Mercury at a
	 * century a second is a klaxon.
	 */
	update( system, focusId ) {

		if ( ! this.enabled || ! this.context ) return;

		const now = this.context.currentTime;

		for ( const body of system.bodies ) {

			const voice = this._voiceFor( body, system );
			if ( ! voice ) continue;

			const phase = body.orbitPhaseAngle ?? 0;
			const previous = this._lastPhase.get( body.id );
			this._lastPhase.set( body.id, phase );
			if ( previous === undefined ) continue;

			// Periapsis is phase 0; a passage shows up as a wrap.
			const wrapped = Math.abs( phase - previous ) > Math.PI;
			if ( ! wrapped ) continue;

			const last = this._lastPlayed.get( body.id ) || 0;
			if ( now - last < voice.minimumGap ) continue;
			this._lastPlayed.set( body.id, now );

			// Whatever you are looking at is what you mostly hear.
			const related = body.id === focusId
				|| body.parent?.id === focusId
				|| body.id === system.byId.get( focusId )?.parent?.id;

			this.play( voice.frequency, {
				gain: voice.gain * ( related ? 1 : 0.42 ),
				decay: voice.decay,
				brightness: voice.brightness
			} );

		}

	}

	_voiceFor( body, system ) {

		let voice = this.voices.get( body.id );
		if ( voice !== undefined ) return voice;

		voice = null;

		if ( body.kind === 'planet' || body.kind === 'dwarf' ) {

			const period = body.def.elements
				? 360 / body.def.elements.Ldot * 100 * DAYS_PER_YEAR
				: body.def.period * DAYS_PER_YEAR;

			voice = {
				frequency: OrbitAudio.pitchFor( period, EARTH_PERIOD, 261.63, 65, 2100 ),
				gain: body.kind === 'planet' ? 0.5 : 0.24,
				decay: 2.6,
				brightness: 1,
				minimumGap: 0.085
			};

		} else if ( body.kind === 'moon' && body.parent ) {

			// Reference the innermost sibling, so a satellite system is heard on
			// its own terms and the resonances stay where you can hear them.
			const siblings = body.parent.children;
			const innermost = siblings.reduce( ( a, b ) => ( a.def.period < b.def.period ? a : b ) );

			voice = {
				frequency: OrbitAudio.pitchFor( body.def.period, innermost.def.period, 440, 55, 1800 ),
				gain: 0.34,
				decay: 1.5,
				brightness: 1.3,
				minimumGap: 0.07
			};

		}

		this.voices.set( body.id, voice );
		return voice;

	}

	/**
	 * Plays the Laplace resonance on its own: four Io periods, during which
	 * Europa goes round twice and Ganymede once, so the three coincide at the
	 * start of every cycle.
	 */
	playLaplaceResonance( system ) {

		if ( ! this.enabled || ! this.context ) return;

		const io = system.byId.get( 'io' );
		const europa = system.byId.get( 'europa' );
		const ganymede = system.byId.get( 'ganymede' );
		if ( ! io || ! europa || ! ganymede ) return;

		const beat = 0.34;
		const now = this.context.currentTime;

		const schedule = ( body, reference, subdivisions, gain ) => {
			const frequency = OrbitAudio.pitchFor( body.def.period, reference.def.period, 440, 55, 1800 );
			for ( let i = 0; i < subdivisions; i ++ ) {
				setTimeout( () => this.play( frequency, { gain, decay: 2.2, brightness: 1.2 } ),
					( i * beat * ( 8 / subdivisions ) ) * 1000 );
			}
		};

		// Eight Io notes, four of Europa, two of Ganymede: the ratio, played.
		schedule( io, io, 8, 0.32 );
		schedule( europa, io, 4, 0.4 );
		schedule( ganymede, io, 2, 0.5 );

		return {
			io: OrbitAudio.pitchFor( io.def.period, io.def.period, 440, 55, 1800 ),
			europa: OrbitAudio.pitchFor( europa.def.period, io.def.period, 440, 55, 1800 ),
			ganymede: OrbitAudio.pitchFor( ganymede.def.period, io.def.period, 440, 55, 1800 ),
			duration: beat * 8
		};

	}

}
