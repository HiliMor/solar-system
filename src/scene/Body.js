import { Group, Mesh, Vector3, Quaternion, Matrix4, Object3D } from 'three';

import { KM_PER_UNIT, DEG, AU_KM, SOLAR_CONSTANT, SUN_RADIUS_KM } from '../data/constants.js';
import { poleToEcliptic, ICRF_POLE_ECLIPTIC, eclipticToScene } from '../physics/frames.js';
import { rotationState } from '../physics/ephemeris.js';
import { createBodyMaterial, createCloudMaterial } from '../shaders/bodyMaterial.js';
import { createAtmosphereMaterial } from '../shaders/atmosphere.js';
import { createRingMaterial } from '../shaders/ringMaterial.js';
import { sphereDetailFor, makeRingGeometry } from './geometry.js';

const _pole = { x: 0, y: 0, z: 1 };
const _node = { x: 1, y: 0, z: 0 };
const _prime = { x: 1, y: 0, z: 0 };
const _vy = new Vector3();
const _vx = new Vector3();
const _vz = new Vector3();
const _m = new Matrix4();

const cross = ( a, b, out ) => {
	const x = a.y * b.z - a.z * b.y;
	const y = a.z * b.x - a.x * b.z;
	const z = a.x * b.y - a.y * b.x;
	out.x = x; out.y = y; out.z = z;
	return out;
};

const normalise = ( v ) => {
	const l = Math.hypot( v.x, v.y, v.z ) || 1;
	v.x /= l; v.y /= l; v.z /= l;
	return v;
};

/**
 * One solid body: planet, moon, dwarf planet or comet nucleus.
 *
 * Holds its own float64 ecliptic state (position in scene units, before the
 * floating-origin subtraction), its rendered radius, and every material whose
 * uniforms need feeding each frame.
 */
export class Body {

	constructor( def, textures, options = {} ) {

		this.def = def;
		this.id = def.id;
		this.name = def.name;
		this.type = def.type;
		this.isSun = def.type === 'star';

		/** Heliocentric ecliptic position in AU (planets) or km (moons, relative). */
		this.statePosition = { x: 0, y: 0, z: 0 };
		this.stateVelocity = { x: 0, y: 0, z: 0 };

		/** Absolute position in scene units, ecliptic axes, float64. */
		this.renderPosition = { x: 0, y: 0, z: 0 };
		/** Absolute position in km, ecliptic axes, float64 -- the physical truth. */
		this.truePosition = { x: 0, y: 0, z: 0 };

		this.parent = null;
		this.children = [];

		this.radiusUnits = 1;
		this.distanceFromSunKm = AU_KM;

		this.group = new Group();
		this.group.name = def.id;

		this.pivot = new Group();       // carries the body's orientation
		this.group.add( this.pivot );

		const geometry = sphereDetailFor( def.radius, !! def.normalTexture );

		const body = createBodyMaterial( def, textures );
		this.material = body.material;
		this.uniforms = body.uniforms;

		this.mesh = new Mesh( geometry, this.material );
		this.mesh.frustumCulled = false;
		this.mesh.userData.bodyId = def.id;
		this.mesh.renderOrder = 0;

		// Oblateness. Jupiter is 6.5% flatter at the poles and it is obvious.
		const polarScale = 1 - ( def.flattening || 0 );
		this.mesh.scale.set( 1, polarScale, 1 );
		this.polarScale = polarScale;

		this.pivot.add( this.mesh );

		this.cloud = null;
		this.atmosphere = null;
		this.rings = [];

		if ( def.cloudTexture && textures.has( def.cloudTexture ) ) {
			const cloud = createCloudMaterial( def, textures );
			this.cloud = {
				mesh: new Mesh( geometry, cloud.material ),
				uniforms: cloud.uniforms,
				altitude: def.cloudAltitude || 10,
				rotationPeriod: def.cloudRotationPeriod || 0
			};
			this.cloud.mesh.frustumCulled = false;
			this.cloud.mesh.renderOrder = 1;
			this.cloud.mesh.scale.set( 1, polarScale, 1 );
			this.pivot.add( this.cloud.mesh );
		}

		if ( def.atmosphere ) {
			const atmo = createAtmosphereMaterial( def, { quality: options.profile?.atmosphereQuality } );
			this.atmosphere = {
				mesh: new Mesh( sphereDetailFor( def.radius ), atmo.material ),
				uniforms: atmo.uniforms,
				setInside: atmo.setInside,
				height: def.atmosphere.height
			};
			this.atmosphere.mesh.frustumCulled = false;
			this.atmosphere.mesh.renderOrder = 3;
			// The shell hangs off `group`, not `pivot`: it must not spin with the
			// body, and its shader works in world space anyway.
			this.group.add( this.atmosphere.mesh );
		}

		if ( def.rings ) {
			for ( const ring of def.rings ) {
				const mat = createRingMaterial( ring, textures );
				const mesh = new Mesh(
					makeRingGeometry( 1, ring.outer / ring.inner, ring.detail ? 768 : 256, ring.detail ? 12 : 4 ),
					mat.material
				);
				mesh.frustumCulled = false;
				mesh.renderOrder = 2;
				mesh.userData.bodyId = def.id;
				this.rings.push( { mesh, uniforms: mat.uniforms, def: ring } );
				// Rings sit in the body's equatorial plane, so they ride the pivot
				// but must not inherit its spin -- handled by counter-rotating below.
				this.ringAnchor ??= new Group();
				this.ringAnchor.add( mesh );
			}
			if ( this.ringAnchor ) this.group.add( this.ringAnchor );
		}

		/** Every material that needs sun/occluder uniforms fed each frame. */
		this.litUniforms = [
			this.uniforms,
			this.cloud?.uniforms,
			this.atmosphere?.uniforms,
			...this.rings.map( ( r ) => r.uniforms )
		].filter( Boolean );

	}

	/**
	 * Orients the body from its IAU pole and prime-meridian model.
	 *
	 * Builds the body-fixed basis directly rather than composing Euler angles:
	 * +Y is the north pole, +X is the prime meridian, which is exactly how the
	 * equirectangular maps are laid out (u = 0.5 sits on the body's +X axis in
	 * three's SphereGeometry).
	 */
	orient( days, frame, spinOffset = 0 ) {

		const def = this.def;

		if ( def.tidallyLocked && this.parent ) {

			// Same face toward the parent, spin axis along the orbit normal.
			const dx = this.parent.renderPosition.x - this.renderPosition.x;
			const dy = this.parent.renderPosition.y - this.renderPosition.y;
			const dz = this.parent.renderPosition.z - this.renderPosition.z;

			_prime.x = dx; _prime.y = dy; _prime.z = dz;
			normalise( _prime );

			// Orbit normal from position x velocity, in the parent's frame.
			const r = this.relativePosition || _prime;
			const v = this.relativeVelocity;
			if ( v ) {
				cross( r, v, _pole );
				normalise( _pole );
			} else {
				_pole.x = 0; _pole.y = 0; _pole.z = 1;
			}

		} else if ( def.rotation ) {

			const state = rotationState( def.rotation, days );
			this._spin = state.wRad;
			poleToEcliptic( state.raDeg, state.decDeg, _pole );

			// IAU prime meridian is measured from the ascending node of the body's
			// equator on the ICRF equator.
			cross( ICRF_POLE_ECLIPTIC, _pole, _node );
			if ( Math.hypot( _node.x, _node.y, _node.z ) < 1e-8 ) {
				_node.x = 1; _node.y = 0; _node.z = 0;
			}
			normalise( _node );

			// Rotate the node about the pole by W to reach the prime meridian.
			const w = this._spin + spinOffset;
			const c = Math.cos( w ), s = Math.sin( w );
			cross( _pole, _node, _prime );                  // completes the frame
			_prime.x = _node.x * c + _prime.x * s;
			_prime.y = _node.y * c + _prime.y * s;
			_prime.z = _node.z * c + _prime.z * s;
			normalise( _prime );

		} else {
			_pole.x = 0; _pole.y = 0; _pole.z = 1;
			_prime.x = 1; _prime.y = 0; _prime.z = 0;
		}

		// Ecliptic -> three.js, then build an orthonormal basis: Y = pole,
		// X = prime meridian, Z = X cross Y (right-handed, as three expects).
		frame.dirToWorld( _pole.x, _pole.y, _pole.z, _vy ).normalize();
		frame.dirToWorld( _prime.x, _prime.y, _prime.z, _vx );

		_vx.addScaledVector( _vy, - _vx.dot( _vy ) ).normalize();
		_vz.crossVectors( _vx, _vy );

		_m.makeBasis( _vx, _vy, _vz );
		this.pivot.quaternion.setFromRotationMatrix( _m );

		this.poleWorld = this.poleWorld || new Vector3();
		this.poleWorld.copy( _vy );

		// The ring plane follows the equator but must not inherit the spin.
		if ( this.ringAnchor ) {
			this.ringAnchor.quaternion.copy( this.pivot.quaternion );
			if ( this.uniforms.ringNormal ) {
				this.uniforms.ringNormal.value.copy( _vy );
				this.uniforms.ringCentre.value.copy( this.group.position );
			}
		}

		// Clouds drift relative to the surface.
		if ( this.cloud && this.cloud.rotationPeriod ) {
			const extra = ( days / ( this.cloud.rotationPeriod / 24 ) ) * Math.PI * 2;
			this.cloud.mesh.rotation.y = extra % ( Math.PI * 2 );
		}

	}

	/** Applies the current scale policy to radii and ring sizes. */
	applyScale( scale ) {

		this.radiusUnits = scale.radius( this.def.radius, this.isSun );
		this.pivot.scale.setScalar( this.radiusUnits );

		if ( this.cloud ) {
			const r = 1 + this.cloud.altitude / this.def.radius;
			this.cloud.mesh.scale.set( r, r * this.polarScale, r );
		}

		if ( this.atmosphere ) {
			const top = this.radiusUnits * ( 1 + this.atmosphere.height / this.def.radius );
			this.atmosphere.mesh.scale.setScalar( top );
			this.atmosphere.uniforms.surfaceRadius.value = this.radiusUnits;
			this.atmosphere.uniforms.topRadius.value = top;
			this.atmosphereTopUnits = top;
		}

		for ( const ring of this.rings ) {
			// Ring geometry is built with inner radius 1, so one scale sets both.
			const inner = scale.km( ring.def.inner ) * scale.bodySize;
			ring.mesh.scale.setScalar( inner );
			ring.innerUnits = inner;
			ring.outerUnits = inner * ( ring.def.outer / ring.def.inner );
		}

		this.occluderRadius = this.radiusUnits;

		// Hand the surface shader the geometry of its own ring system, so the
		// rings can cast a shadow onto the planet.
		const shadowRing = this.rings.find( ( r ) => r.def.detail );
		if ( shadowRing && this.uniforms.ringInner ) {
			this.uniforms.ringInner.value = shadowRing.innerUnits;
			this.uniforms.ringOuter.value = shadowRing.outerUnits;
		}

	}

	/** Feeds the per-frame lighting uniforms shared by all of this body's materials. */
	updateLighting( sunWorld, exposure, occluders ) {

		const world = this.group.position;

		const dx = sunWorld.x - world.x;
		const dy = sunWorld.y - world.y;
		const dz = sunWorld.z - world.z;
		const len = Math.hypot( dx, dy, dz ) || 1;

		// Irradiance comes from the *true* distance, never the rendered one.
		const irradiance = this.isSun ? 1 : Math.pow( AU_KM / Math.max( this.distanceFromSunKm, 1 ), 2 );
		const sunAngular = Math.atan( SUN_RADIUS_KM / Math.max( this.distanceFromSunKm, SUN_RADIUS_KM ) );

		for ( const u of this.litUniforms ) {

			u.sunDirection.value.set( dx / len, dy / len, dz / len );
			u.sunPosition.value.copy( sunWorld );
			u.irradiance.value = irradiance;
			u.sunAngularRadius.value = sunAngular;
			if ( u.exposureBias ) u.exposureBias.value = exposure;
			if ( u.centre ) u.centre.value.copy( world );

			for ( let k = 0; k < u.occluders.length; k ++ ) {
				const o = occluders[ k ];
				if ( o ) u.occluders[ k ].value.set( o.x, o.y, o.z, o.r );
				else u.occluders[ k ].value.set( 0, 0, 0, 0 );
			}

		}

	}

	setVisible( visible ) {
		this.group.visible = visible;
	}

	dispose() {
		this.mesh.geometry.dispose?.();
		this.material.dispose();
		this.cloud?.material?.dispose?.();
		this.atmosphere?.mesh.material.dispose();
		for ( const r of this.rings ) { r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
	}

}
