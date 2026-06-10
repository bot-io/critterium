# Critterium

A living world in your pocket. A fast 2D particle sandbox where multiple particle types interact through configurable behaviors, producing emergent, lifelike patterns: clusters, chases, orbits, flocks.

## Architecture

Three modules with strict boundaries:

- **`@critterium/core`** — Pure TypeScript simulation engine. Typed-array storage, spatial hash grid, fixed timestep, pluggable force pipeline. Zero dependencies.
- **`@critterium/render`** — PixiJS v8 adapter. Batched tinted sprites, per-type textures, per-particle rotation.
- **`@critterium/app`** — Web app, controls UI, persistence, Capacitor glue.

## Development

```bash
npm install        # Install all workspace dependencies
npm run build      # Build all packages
npm test           # Run all tests
npm run dev        # Start dev server (app package)
```

## Stack

TypeScript (strict) · PixiJS v8 · Capacitor · Vite · Vitest · Playwright
