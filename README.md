# Solar System

Most solar system viewers show you the solar system, from outside, looking in.

This one also shows you **the sky** — from a latitude and longitude on any solid
body, at any moment in history or the future — and it **finds** the moments worth
looking at instead of reading them from a table.

Stand in Luxor at 10:07 UTC on 2 August 2027 and the Sun is 81.8° up and
completely covered, because that is where and when it will be. Ask for eclipses
visible from where you are and it sweeps the ephemeris and tells you, with the
duration of totality and how high the Sun will be. Turn the sound on and Io,
Europa and Ganymede sound two octaves apart, because their 1:2:4 resonance is a
chord.

Built with three.js and WebGPU. Positions come from real ephemerides rather than
art direction; the asteroid belt is forty-two thousand individual orbits solved
on the GPU every frame, Kirkwood gaps and all.

```bash
npm install
npm run textures     # fetches ~100 MB of surface maps, once
npm run dev
```

Needs a browser with WebGPU. Chrome 113+, Edge 113+ and Safari 18+ qualify; it
falls back to WebGL2 elsewhere, with everything intact but slower.

---

## The three things it does that others do not

### Stand somewhere and look up

The camera lands at a latitude and longitude and becomes a planetarium: fixed in
place, free to look around, zoom changing the field of view rather than the
position, the way raising binoculars does. Twenty-one places are set up by name,
or use your own location.

Because everything is computed rather than staged, the interesting things simply
happen. Totality from Luxor drains the light out of the landscape and brings the
stars out. Jupiter hangs twenty degrees wide over Europa and never moves,
because Europa is tidally locked. From the far side of the Moon, Earth never
rises at all.

Ground mode forces true angular sizes. From a surface the whole question is how
big things look — whether the Moon covers the Sun, how wide Jupiter is from
Europa — and a compressed view would make every one of those answers wrong.

### Find events, rather than look them up

Pick a kind of event and a date, and it scans the ephemeris: sample a geometric
quantity coarsely, find the local minima, refine each by golden-section search,
keep the ones that clear a threshold. Solar eclipses from your exact location,
lunar eclipses, transits of Mercury and Venus, oppositions, shadows of the
Galilean moons crossing Jupiter, Saturn's ring-plane crossings.

An eleven-year eclipse sweep takes about 130 ms, in a worker. Nothing is stored,
so moving the observer changes the answers. Checked against the published
record, it finds every Mercury and Venus transit between 2000 and 2130 with no
misses and no spurious ones, and its opposition and ring-plane dates land on the
published ones.

Click a result and it takes you there — sets the clock, puts you on the ground,
and points you at the right part of the sky.

### Play the orbits

Each body sounds a note as it passes periapsis, pitched by 1/period and folded
into an audible range. The intervals you hear are the period ratios. Reference
pitches are per system, so satellites are heard on their own terms: against
Io at A, Europa lands six cents from the octave below and Ganymede nineteen
cents from two octaves below. The resonance is a chord.

---

## Controls

| | |
|---|---|
| drag | orbit the focused body |
| scroll | zoom |
| click a body | focus it |
| `space` | pause |
| `,` / `.` | slower / faster |
| `r` | run time backwards |
| `n` | jump to now |
| `/` | search |
| `t` | toggle true scale |
| `l` / `o` | labels / orbit paths |
| `h` | hide the shortcut list |

Standing on a surface, drag turns your head, scroll works like binoculars, and
`esc` returns you to orbit.

Time runs from real-time up to a thousand years a second, forwards or backwards,
and you can jump to any date.

---

## What is in it

**43 bodies** — the Sun, eight planets, five dwarf planets, twenty-five major
moons and four comets, each with real physical data and its own rotation model.
Thirty-one of them are solid enough to stand on.

**~77,000 small bodies** — the main asteroid belt with its Kirkwood gaps, the
Hilda group, Jupiter's Trojan clouds at L4 and L5, and the Kuiper belt. Each
carries its own orbital elements and solves Kepler's equation in the vertex
shader, so the belt is a real population rather than a texture.

**Four interstellar probes** — Voyager 1 and 2, Pioneer 10 and New Horizons, on
their escape trajectories.

**Ring systems** — Saturn in detail, plus the faint rings of Jupiter, Uranus,
Neptune and Haumea.

### The things that took the most work

- **Eclipses.** Every body's shader tests up to four occluders against the Sun's
  finite angular size, so shadows have real penumbrae. Solar eclipses land where
  they landed; Io throws a soft shadow across Jupiter's cloud tops; Saturn's
  shadow sweeps across its rings through the seasons and the rings cast a
  hard-edged band back onto the planet, Cassini Division and all.

- **Atmospheres.** A ray-marched single-scattering integral, not a rim glow. The
  scattering coefficients are calibrated to real optical depths — Earth's
  Rayleigh depth at the zenith is (0.040, 0.094, 0.230) for red, green and blue
  — so the blue limb, the red band at the terminator and the white forward
  scatter come out of the physics rather than being painted on.

- **The Moon.** Alone among the satellites it uses a perturbation series
  (abridged ELP-2000/82) instead of an ellipse, because the Sun pulls it more
  than a degree off a Keplerian path. A degree is twice the Moon's own apparent
  diameter, which is the difference between predicting eclipses and missing all
  of them.

- **Comet tails.** Two tails, in the two directions they belong. The ion tail is
  swept straight anti-sunward by the solar wind; the dust tail is released at the
  nucleus, pushed out by radiation pressure while keeping the orbital velocity it
  was born with, and so lags into a curve.

---

## Accuracy

Every number below was checked against published values; the checks are
reproducible from the modules in `src/physics/`.

| | |
|---|---|
| Planet positions | JPL/Standish Keplerian elements with secular rates. Heliocentric distances match JPL to ~3 × 10⁻⁵ AU; sidereal periods are exact to five figures. Valid 1800–2050 to a few arcminutes, degrading gracefully to roughly 3000 BC – 3000 AD. |
| Axial tilts | All eight planets reproduce their published obliquity to 0.01°, from the IAU 2015 pole and prime-meridian model (including Neptune's periodic term). |
| Earth's rotation | The sub-solar point lands within a tenth of a degree: solstice declinations come out at exactly ±23.44°. |
| The Moon | Matches Meeus's worked example 47.a exactly in longitude, latitude and distance. |
| Eclipses | Every total solar eclipse tested from 1919 to 2045 puts the Moon's shadow axis on Earth, with the offsets in the right proportions. |
| Satellites | The Galilean elements recover Jupiter's mass to 0.1% through Kepler's third law; the Laplace resonance holds to 0.4%. |
| Comets | Anchored at known perihelion passages; perihelion distances match to four figures. |
| Event search | Every Mercury and Venus transit from 2000 to 2130 found, none missed, none spurious. Oppositions and Saturn ring-plane crossings land on the published dates. Eclipse timings are good to about a minute, not to the second. |
| Observer geometry | On the reference ellipsoid, not a sphere. Geodetic and geocentric latitude differ by 11 arcminutes on Earth and nearly six degrees on Saturn, and an eclipse turns on the arcminute. |

### Where it stops being data

The interface says so on each body, but in short:

- **Frame.** Everything is in the J2000 ecliptic, not the equinox of date. Dates
  near an equinox therefore read about 0.4° off a modern almanac — that offset is
  precession, not error.
- **Moons other than Luna** use precessing ellipses, which ignores mutual
  perturbations. Fine for a human lifetime, not for millennia.
- **Dwarf planets** use osculating elements held at J2000, so accuracy falls off
  far from that epoch.
- **Comets** use a fixed period. Real comets drift by weeks between returns
  because of outgassing; Halley's 2061 return is about a month early here.
- **Spacecraft** are extrapolated along their published escape asymptote. Good to
  a fraction of a percent on the cruise, and it does not reproduce the planetary
  flybys.
- **Surfaces without a published map** — most of the moons — are procedural,
  tuned to the terrain type spacecraft found there. An impression, not imagery.
- **The ground you stand on** is procedural too, and flat apart from the
  curvature of the body. There is no terrain data: Olympus Mons puts you at the
  right altitude with the right horizon, not on a modelled volcano.
- **Eclipse times** are as good as the model, which is roughly a minute — fine
  for finding one, not a substitute for a proper canon if you are travelling.

---

## Scale

Real distances and real sizes cannot be shown at once: Earth is 23,000 times
smaller than its own orbit. Two views, cross-faded by a slider:

**Compressed** (default) maps an orbit of semi-major axis `a` to `a^0.5`
display-AU. The factor is constant *per orbit*, so every ellipse is scaled
uniformly — eccentricity, inclination and the direction of perihelion all
survive exactly. Only the spacing between orbits shrinks. A radial warp would
have been simpler and would have turned every orbit into an egg.

**True scale** is 1:1 and mostly empty space, which is the point.

Body radii stay physically true by default. The size slider exaggerates them
when you want to see something; satellite orbits expand only when the parent
would otherwise swallow them.

---

## How it is put together

```
src/
  data/        physical and orbital data, and places to stand
  physics/     Kepler solver, ephemerides, lunar theory, observer geometry,
               event search, time, frames
  core/        renderer, cameras, scale policy, floating origin, app loop
  scene/       bodies, orbits, belts, comet tails, spacecraft, ground, starfield
  shaders/     TSL materials: surfaces, atmospheres, rings, the Sun
  audio/       orbital sonification
  workers/     event search, off the main thread
  ui/          panels, labels, controls
```

Three decisions shape everything else:

**Simulation is separated from rendering.** All orbital mechanics happens in
float64, in kilometres and days, and never sees the render scale. Illumination
is computed from *true* distances even when the view is compressed, so a planet
is lit correctly no matter how the geometry is squashed.

**A floating origin.** Neptune's orbit is 4.5 × 10⁶ scene units across while a
crater on Europa is a fraction of one, and float32 — all the GPU has — cannot
hold both. So the focused body's position is subtracted before anything reaches
a transform. The camera stays near the origin and the universe moves around it.
Standing on a surface the origin moves onto the observer, because a body's
centre is not close enough: at 6.4 units out, float32 resolves 0.8 m, which is
coarser than the distance from someone's eyes to their feet.

**No three.js lights.** The Sun is 150 million km away and the render scale is
deliberately non-physical, so an inverse-square PointLight would be wrong by
orders of magnitude. Each body carries uniforms describing its true
illumination — direction to the Sun, irradiance relative to the solar constant —
and the shading is written out in TSL. That also makes room for the things the
standard model has no slot for: eclipse penumbrae, city lights on the night side,
and the back-scatter that makes airless regolith look like rock instead of a
shaded ball.

### Development

`npm run dev` mounts a small capture sink. WebGPU canvases do not survive
`toDataURL` or tab capture reliably, so `window.capture({ name })` renders the
current view into an offscreen target, reads it back through the renderer and
writes a PNG to `.captures/`. Dev only; not part of the build.

`npm run textures` is safe to re-run — it skips maps already present. Add
`--force` to refetch.

---

## Credits

- **Ephemerides** — *Keplerian Elements for Approximate Positions of the Major
  Planets*, E. M. Standish, JPL/Caltech.
- **Rotation models** — IAU Working Group on Cartographic Coordinates and
  Rotational Elements, 2015 report.
- **Lunar theory** — abridged ELP-2000/82 via Meeus, *Astronomical Algorithms*,
  ch. 47.
- **Physical data** — NASA planetary fact sheets; JPL Small-Body Database.
- **Surface maps** — [Solar System Scope](https://www.solarsystemscope.com/textures/),
  CC BY 4.0, built from NASA/JPL-Caltech, USGS and ESA imagery.
- **Engine** — [three.js](https://threejs.org) r186, WebGPURenderer and TSL.

Code is MIT (see `LICENSE`). The texture maps are not — they stay CC BY 4.0 and
are not committed to this repository.
