/**
 * Device profile.
 *
 * A phone has perhaps a tenth the fill rate of a desktop GPU and a screen that
 * is often 3x dense, so the naive result is a beautiful scene at nine frames a
 * second. The heavy items are all adjustable without changing what anything
 * looks like structurally: fewer rocks in the belt, fewer steps through the
 * atmosphere, fewer pixels.
 */

function detect() {

	const coarse = window.matchMedia?.( '(pointer: coarse)' ).matches ?? false;
	const narrow = Math.min( window.innerWidth, window.innerHeight ) < 620;
	const cores = navigator.hardwareConcurrency || 4;
	const memory = navigator.deviceMemory || 4;

	// Coarse pointer *and* a small screen is a phone. A coarse pointer on a big
	// screen is a tablet or a touch laptop, which can take more.
	if ( coarse && narrow ) return 'phone';
	if ( coarse || cores <= 4 || memory <= 4 ) return 'modest';
	return 'full';

}

const PROFILES = {
	phone: {
		beltScale: 0.18,
		atmosphereQuality: 'low',
		pixelRatioCap: 1.5,
		sphereScale: 0.55,
		orbitSegments: 320,
		cometParticles: 3000
	},
	modest: {
		beltScale: 0.45,
		atmosphereQuality: 'low',
		pixelRatioCap: 1.75,
		sphereScale: 0.75,
		orbitSegments: 480,
		cometParticles: 6000
	},
	full: {
		beltScale: 1,
		atmosphereQuality: 'high',
		pixelRatioCap: 2,
		sphereScale: 1,
		orbitSegments: 640,
		cometParticles: 11000
	}
};

export function deviceProfile( override ) {
	const name = override || detect();
	return { name, ...PROFILES[ name ] };
}

/** True when the interface should use the phone layout. */
export const isPhoneLayout = () => window.innerWidth < 760 || ( window.matchMedia?.( '(pointer: coarse)' ).matches && window.innerWidth < 900 );
