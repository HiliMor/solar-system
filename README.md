# Solar System

An interactive model of the solar system, rendered with three.js and WebGPU.

Positions come from real ephemerides rather than art direction. Set the clock to
2 August 2027 and the Moon's shadow falls on Upper Egypt, because that is where
it fell. Set it to 1986 and Halley rounds the Sun with its dust and ion tails
pointing in the two different directions they actually point. The asteroid belt
is forty-two thousand individual orbits solved on the GPU every frame, gaps and
all.

```bash
npm install
npm run textures     # fetches ~100 MB of surface maps, once
npm run dev
```

Needs a browser with WebGPU. Chrome 113+, Edge 113+ and Safari 18+ qualify; it
falls back to WebGL2 elsewhere, with everything intact but slower.

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

Time runs from real-time up to a thousand years a second, forwards or backwards,
and you can jump to any date.

---

## What is in it

**43 bodies** — the Sun, eight planets, five dwarf planets, twenty-five major
moons and four comets, each with real physical data and its own rotation model.

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
  data/        physical and orbital data, with sources cited inline
  physics/     Kepler solver, ephemerides, lunar theory, time, frames
  core/        renderer, camera, scale policy, floating origin, app loop
  scene/       bodies, orbits, belts, comet tails, spacecraft, starfield
  shaders/     TSL materials: surfaces, atmospheres, rings, the Sun
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
