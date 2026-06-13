# Critterium

A living world in your pocket. A fast 2D particle sandbox where multiple particle types interact through configurable behaviors, producing emergent, lifelike patterns: clusters, chases, orbits, flocks, and full predator-prey ecosystems.

[![CI](https://github.com/bot-io/critterium/actions/workflows/ci.yml/badge.svg)](https://github.com/bot-io/critterium/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-502%20passing-brightgreen)

## Features

- **Ecosystem simulation** — particles eat, hunt, age, reproduce, starve, and die. Energy flows through food webs. Species rise and fall.
- **Configurable interaction matrix** — define per-species-pair behaviors: attract, repel, flee, eat, flock, orbit, and more. Asymmetric (A→B ≠ B→A) enables chase/flee dynamics.
- **10 built-in presets** — curated ecosystems with emergent behavior, from starling murmurations to coral reefs with symbiotic cleaner fish.
- **Live controls** — adjust species counts, colors, interaction strengths, force parameters, and boundary modes in real time. No restart needed.
- **Save & resume** — autosaves to localStorage. Reload and continue exactly where you left off (positions, velocities, seed, sim time).
- **Export/import configs** — share custom ecosystems as JSON files.
- **Pointer interaction** — stir the world with your finger or mouse.
- **Deterministic** — seeded RNG means the same seed produces the same world.
- **Performance** — 1,000+ particles at 60 fps on mid-range Android. Zero hot-loop allocations.

## Built-in Presets

| Preset                  | Description                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Classic**             | The default ecosystem: Prey flocks and flees, Predator hunts.                                                                                            |
| **Plankton Bloom**      | Deep ocean food chain: Algae → Zooplankton → Small Fish → Big Fish → Whales.                                                                             |
| **Swarm Intelligence**  | Pure flocking: 700 Birds and Locusts with strong alignment forces. No eating.                                                                            |
| **Predator Arena**      | Lions, Wolves, Deer, and Rabbits in a territorial battleground.                                                                                          |
| **Tiny Pond**           | Minnows school for safety while Bass pick off stragglers.                                                                                                |
| **Zen Garden**          | Calm and meditative: Fireflies glow, Koi drift gracefully, Leaves float.                                                                                 |
| **Rock Paper Scissors** | Three species in cyclic dominance — Rock crushes Scissors, Scissors cut Paper, Paper covers Rock.                                                        |
| **Grasslands**          | Three-tier food web: Grass regrows fast, Rabbits graze, Foxes hunt.                                                                                      |
| **Birds**               | A murmuration at dusk: hundreds of Starlings wheel as one shifting cloud while a lone Hawk picks off stragglers.                                         |
| **Fishes**              | A living coral reef: Tetras school, Cleaner Wrasse tag along with predators in rare symbiosis, and Barracuda hunt — but never the fish that cleans them. |

## Architecture

Three npm workspace packages with strict boundaries:

```
critterium/
├── packages/
│   ├── core/    # Pure TS simulation engine — zero dependencies
│   ├── render/  # PixiJS v8 rendering adapter
│   └── app/     # Web app, controls UI, persistence, Capacitor glue
├── .github/workflows/ci.yml  # CI: typecheck → lint → format → build → test → Android APK
└── package.json              # npm workspaces root
```

### `@critterium/core`

The simulation engine. Pure TypeScript, zero runtime dependencies.

- **Typed-array storage** — positions, velocities, and per-particle scalars in flat `Float32Array`/`Uint8Array`. No per-particle objects on the hot path.
- **Spatial hash grid** — O(n) neighbor queries instead of O(n²) brute force.
- **Fixed timestep loop** — deterministic accumulator with interpolation for smooth rendering.
- **Force pipeline** — pluggable forces applied in sequence each step:
  - `PairwiseForce` — N×N interaction matrix (asymmetric, drives chase/flee)
  - `GlobalForce` — drag, gravity, boundaries (bounce/wrap)
  - `WanderForce` — per-particle smooth noise for organic motion
  - `FlowFieldForce` — spatially varying directional force
  - `VortexForce` — swirl around a point
  - `PointerForce` — touch/mouse attract–repel
- **Ecosystem layer** — energy, aging, starvation, reproduction, diet rules, stamina (sprint/cooldown)
- **Config schema** — versioned JSON serialization with round-trip fidelity

### `@critterium/render`

PixiJS v8 adapter. Batched tinted sprites from per-species render textures. Per-particle rotation from velocity heading. Interpolation between simulation steps for smooth visuals.

### `@critterium/app`

Web application built with Vite. Controls UI, autosave/persistence, preset management, population graph HUD, adaptive quality system, and error capture. Capacitor integration for Android.

## Development

```bash
npm install        # Install all workspace dependencies
npm run dev        # Start Vite dev server
npm run build      # Build all packages
npm test           # Run all tests (502 across 3 packages)
npm run typecheck  # TypeScript strict type checking
npm run lint       # ESLint (flat config, typescript-eslint)
npm run format     # Prettier formatting (write)
npm run format:check  # Prettier formatting (check, CI gate)
```

## Stack

TypeScript (strict) · PixiJS v8 · Capacitor · Vite · Vitest · Playwright · ESLint · Prettier

## License

MIT
