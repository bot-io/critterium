/**
 * CRT-45 — Stress Test Suite
 *
 * Verifies the simulation remains stable and leak-free under heavy load and
 * rapid mutation. Covers five stress categories:
 *
 * 1. Max-capacity particle count (800) with the full force pipeline
 * 2. Rapid species add/remove cycles (world rebuild / reseed)
 * 3. Rapid force pipeline toggle (add/remove 100 iterations)
 * 4. Max-size config serialization round-trip (10 species + 7 forces)
 * 5. Memory stability over 10,000 simulation steps (no buffer growth)
 *
 * These tests protect against performance regressions and allocation leaks.
 */

import { describe, it, expect } from 'vitest';
import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  WanderForce,
  GravityForce,
  FlowFieldForce,
  VortexForce,
  AlignmentForce,
  type Force,
  type InteractionEntry,
} from './index.js';
import {
  DEAD,
  ALIVE,
  type SpeciesConfig,
  type EcosystemConfig,
  type InteractionRule,
} from './ecosystem.js';
import { EcosystemWorld } from './ecosystem-world.js';
import { serializeConfig, deserializeConfig } from './config-schema.js';
import { createForce, getRegisteredTypes } from './force-registry.js';

const DT = 1 / 60;

// ─── Helpers ───────────────────────────────────────────────────

/** Build a SpeciesConfig with sensible defaults and optional overrides. */
function makeSpecies(
  name: string,
  count: number,
  overrides: Partial<SpeciesConfig> = {},
): SpeciesConfig {
  return {
    name,
    count,
    color: '#ff4444',
    radius: 3,
    initialSpeed: 50,
    maxSpeed: 100,
    energy: {
      maxEnergy: 200,
      initialEnergy: 150,
      movementCostPerSec: 1,
      reproductionCost: 60,
      idleDrainPerSec: 0.5,
      energyGainPerPrey: [],
    },
    lifecycle: { maxAgeSec: 300, starvationDamagePerSec: 5, reproductionCooldownSec: 5 },
    diet: { canEat: new Set<number>() },
    ...overrides,
  };
}

/** Build an EcosystemConfig with a null interaction-rules matrix. */
function makeEcoConfig(speciesList: SpeciesConfig[], cap = 800): EcosystemConfig {
  const n = speciesList.length;
  const rules: (InteractionRule | null)[][] = [];
  for (let i = 0; i < n; i++) {
    rules.push(new Array(n).fill(null));
  }
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: speciesList,
    interactionRules: rules,
  };
}

/** Build a InteractionMatrix pre-populated with a circular chase pattern. */
function buildChaseMatrix(n: number): InteractionMatrix {
  const matrix = new InteractionMatrix(n);
  for (let i = 0; i < n; i++) {
    const prey = (i + 1) % n;
    const entry: InteractionEntry = { strength: 40, radius: 100, falloff: 'linear' };
    matrix.set(i, prey, entry);
    // Flee from predator
    const predator = (i + n - 1) % n;
    matrix.set(i, predator, { strength: -40, radius: 100, falloff: 'linear' });
  }
  return matrix;
}

/** Assert no NaN or Infinity in particle position/velocity arrays up to hwm. */
function assertFiniteState(world: World, hwm: number): void {
  for (let i = 0; i < hwm; i++) {
    expect(Number.isFinite(world.x[i])).toBe(true);
    expect(Number.isFinite(world.y[i])).toBe(true);
    expect(Number.isFinite(world.vx[i])).toBe(true);
    expect(Number.isFinite(world.vy[i])).toBe(true);
  }
}

// ─── 1. Max-capacity particle stress ───────────────────────────

describe('CRT-45: max-capacity particle stress', () => {
  it('runs 800 particles with full force pipeline for 120 steps without crash', () => {
    const species = [
      makeSpecies('Red', 280, { color: '#ff4444', maxSpeed: 120, initialSpeed: 60 }),
      makeSpecies('Green', 280, { color: '#44ff44', maxSpeed: 100, initialSpeed: 50 }),
      makeSpecies('Blue', 140, { color: '#4444ff', maxSpeed: 80, initialSpeed: 40 }),
      makeSpecies('Yellow', 100, { color: '#ffff44', maxSpeed: 150, initialSpeed: 70 }),
    ];
    // Total = 800 = populationCap
    const eco = new EcosystemWorld(makeEcoConfig(species, 800));
    const matrix = buildChaseMatrix(4);
    const pairwise = new PairwiseForce(matrix);

    // Build the force pipeline (6 Force-interface forces)
    const forces: Force[] = [
      new DragForce(0.8),
      new WanderForce(40, 2.5),
      new GravityForce(80),
      new FlowFieldForce(40, 'uniform', 0.5, 0.01),
      new VortexForce(400, 300, 100, -30, 300, 'linear'),
      new AlignmentForce(60, 30, false),
    ];

    const grid = new SpatialHashGrid(800, 600, 120, 800);

    expect(eco.aliveCount).toBe(800);

    for (let step = 0; step < 120; step++) {
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      pairwise.apply(eco.world, grid, DT);
      for (const f of forces) {
        f.apply(eco.world, grid, DT);
      }
      eco.world.step(DT);
    }

    // No NaN / Infinity after heavy load
    assertFiniteState(eco.world, eco.highWaterMark);
    // Particles should still be within reasonable bounds (wrap/bounce keeps them in-world)
    for (let i = 0; i < eco.highWaterMark; i++) {
      if (eco.eco.alive[i] === ALIVE) {
        expect(eco.world.x[i]).toBeGreaterThanOrEqual(-50);
        expect(eco.world.x[i]).toBeLessThanOrEqual(850);
        expect(eco.world.y[i]).toBeGreaterThanOrEqual(-50);
        expect(eco.world.y[i]).toBeLessThanOrEqual(650);
      }
    }
  });

  it('handles 800 particles with ALL force types via registry', () => {
    const species = [makeSpecies('A', 400), makeSpecies('B', 400)];
    const eco = new EcosystemWorld(makeEcoConfig(species, 800));
    const matrix = buildChaseMatrix(2);
    const pairwise = new PairwiseForce(matrix);

    // Create every registered force type from the registry
    const registered = getRegisteredTypes();
    expect(registered.length).toBeGreaterThanOrEqual(7);
    const registryForces = registered
      .filter((t) => t !== 'pointer') // pointer requires active pointer position
      .map((t) => createForce(t));

    const grid = new SpatialHashGrid(800, 600, 120, 800);

    for (let step = 0; step < 50; step++) {
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      pairwise.apply(eco.world, grid, DT);
      for (const f of registryForces) {
        f.apply(eco.world, grid, DT);
      }
      eco.world.step(DT);
    }

    assertFiniteState(eco.world, eco.highWaterMark);
    expect(eco.world.simTime).toBeCloseTo(50 * DT, 5);
  });

  it('population stays within cap even with aggressive reproduction', () => {
    // High reproduction rate, low cost, short cooldown → many spawn attempts
    const species = [
      makeSpecies('Breeder', 100, {
        energy: {
          maxEnergy: 1000,
          initialEnergy: 900,
          movementCostPerSec: 0.1,
          reproductionCost: 10,
          idleDrainPerSec: 0.1,
          energyGainPerPrey: [],
        },
        lifecycle: { maxAgeSec: 9999, starvationDamagePerSec: 0, reproductionCooldownSec: 1 },
      }),
    ];
    const eco = new EcosystemWorld(makeEcoConfig(species, 800));
    const grid = new SpatialHashGrid(800, 600, 200, 800);

    for (let step = 0; step < 200; step++) {
      // Attempt reproduction for every alive particle
      for (let i = 0; i < eco.highWaterMark; i++) {
        if (eco.eco.alive[i] === ALIVE) {
          eco.tryReproduce(i);
        }
      }
      eco.world.step(DT);
    }

    // Must never exceed population cap
    expect(eco.aliveCount).toBeLessThanOrEqual(800);
    assertFiniteState(eco.world, eco.highWaterMark);
  });
});

// ─── 2. Rapid species add/remove cycles ────────────────────────

describe('CRT-45: rapid species add/remove cycles', () => {
  it('survives 5 add+reseed cycles with consistent state', () => {
    const base = [makeSpecies('Core', 100), makeSpecies('Alpha', 100)];

    let species = [...base];

    for (let cycle = 0; cycle < 5; cycle++) {
      // Add a new species (rebuild world = "reseed")
      species = [...species, makeSpecies(`Dyn${cycle}`, 50)];
      expect(species.length).toBe(2 + cycle + 1);

      const eco = new EcosystemWorld(makeEcoConfig(species, 800));
      const grid = new SpatialHashGrid(800, 600, 200, 800);
      const drag = new DragForce(0.5);

      for (let step = 0; step < 10; step++) {
        grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
        drag.apply(eco.world, grid, DT);
        eco.world.step(DT);
      }

      // Consistency: alive count matches sum of species counts (no deaths yet — long lifespan)
      const expected = species.reduce((sum, s) => sum + s.count, 0);
      expect(eco.aliveCount).toBe(Math.min(expected, 800));
      assertFiniteState(eco.world, eco.highWaterMark);
      // Type indices valid
      for (let i = 0; i < eco.highWaterMark; i++) {
        if (eco.eco.alive[i] === ALIVE) {
          expect(eco.world.type[i]).toBeLessThan(species.length);
        }
      }
    }
  });

  it('survives 5 remove+reseed cycles (shrinking species list)', () => {
    let species = Array.from({ length: 7 }, (_, i) => makeSpecies(`S${i}`, 60));

    for (let cycle = 0; cycle < 5; cycle++) {
      // Remove the last species (rebuild world)
      species = species.slice(0, -1);
      expect(species.length).toBe(7 - cycle - 1);

      const eco = new EcosystemWorld(makeEcoConfig(species, 800));
      const grid = new SpatialHashGrid(800, 600, 200, 800);

      for (let step = 0; step < 10; step++) {
        grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
        eco.world.step(DT);
      }

      // All type indices within range of the reduced species count
      for (let i = 0; i < eco.highWaterMark; i++) {
        if (eco.eco.alive[i] === ALIVE) {
          expect(eco.world.type[i]).toBeLessThan(species.length);
        }
      }
      assertFiniteState(eco.world, eco.highWaterMark);
    }
  });

  it('alternating add/remove (5 full cycles) leaves no orphaned state', () => {
    let species = [makeSpecies('Base', 100)];

    for (let cycle = 0; cycle < 5; cycle++) {
      // ADD — a fresh world each time includes the base + one transient species
      species = [...species, makeSpecies(`Add${cycle}`, 50)];
      {
        const eco = new EcosystemWorld(makeEcoConfig(species, 800));
        const grid = new SpatialHashGrid(800, 600, 200, 800);
        for (let s = 0; s < 5; s++) {
          grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
          eco.world.step(DT);
        }
        // 2 species: 100 + 50 = 150 alive, no churn deaths (long lifespan)
        expect(eco.aliveCount).toBe(150);
        expect(eco.highWaterMark).toBe(150);
      }

      // REMOVE (drop the transient species) — rebuilt world has only the base
      species = species.slice(0, -1);
      {
        const eco = new EcosystemWorld(makeEcoConfig(species, 800));
        expect(eco.aliveCount).toBe(100);
        // highWaterMark should match alive count (no dead slots from removed species)
        expect(eco.highWaterMark).toBe(100);
      }
    }

    // After 5 full add/remove cycles, species list is back to just the base
    expect(species.length).toBe(1);
  });
});

// ─── 3. Rapid force pipeline toggle ────────────────────────────

describe('CRT-45: rapid force pipeline toggle', () => {
  it('toggles all forces on/off 100 times without crash', () => {
    const eco = new EcosystemWorld(makeEcoConfig([makeSpecies('X', 200)], 800));
    const grid = new SpatialHashGrid(800, 600, 200, 800);

    const types = ['drag', 'wander', 'gravity', 'flow-field', 'vortex', 'alignment'];

    let pipelineForces: Force[] = [];

    for (let iter = 0; iter < 100; iter++) {
      // Toggle OFF — empty pipeline
      pipelineForces = [];
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      for (const f of pipelineForces) f.apply(eco.world, grid, DT);
      eco.world.step(DT);

      // Toggle ON — recreate all forces
      pipelineForces = types.map((t) => createForce(t));
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      for (const f of pipelineForces) f.apply(eco.world, grid, DT);
      eco.world.step(DT);
    }

    // Final pipeline has all 6 forces
    expect(pipelineForces.length).toBe(6);
    // Each force is a distinct type
    const ids = new Set(pipelineForces.map((f) => f.id));
    expect(ids.size).toBe(6);
    assertFiniteState(eco.world, eco.highWaterMark);
  });

  it('toggling a single force 100 times leaves pipeline correct', () => {
    const eco = new EcosystemWorld(makeEcoConfig([makeSpecies('X', 100)], 800));
    const grid = new SpatialHashGrid(800, 600, 200, 800);

    const base = [new DragForce(0.5), new WanderForce(30, 2)];
    let toggleForce: Force | null = new VortexForce(400, 300, 100, 0, 300, 'linear');

    for (let iter = 0; iter < 100; iter++) {
      const all = toggleForce ? [...base, toggleForce] : base;
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      for (const f of all) f.apply(eco.world, grid, DT);
      eco.world.step(DT);

      // Alternate toggle state every iteration
      toggleForce = toggleForce ? null : new VortexForce(400, 300, 100, 0, 300, 'linear');
    }

    // After 100 iters (even count), toggleForce is back to non-null
    expect(toggleForce).not.toBeNull();
    assertFiniteState(eco.world, eco.highWaterMark);
  });

  it('rapidly removing and re-adding forces preserves simTime progression', () => {
    const eco = new EcosystemWorld(makeEcoConfig([makeSpecies('X', 100)], 800));
    const grid = new SpatialHashGrid(800, 600, 200, 800);
    const forces: Force[] = [];

    for (let iter = 0; iter < 100; iter++) {
      // Add all
      forces.push(new DragForce(0.5), new GravityForce(50));
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      for (const f of forces) f.apply(eco.world, grid, DT);
      eco.world.step(DT);
      // Remove all
      forces.length = 0;
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      eco.world.step(DT);
    }

    // 200 steps total (100 with forces + 100 without)
    expect(eco.world.simTime).toBeCloseTo(200 * DT, 5);
  });
});

// ─── 4. Max config serialization round-trip ────────────────────

describe('CRT-45: max config serialization round-trip', () => {
  it('10 species + 7 forces survive serialize → deserialize → serialize', () => {
    const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#fff', '#800', '#080', '#008'];
    const species = Array.from({ length: 10 }, (_, i) =>
      makeSpecies(`Species${i}`, 50, {
        color: colors[i],
        radius: 2 + (i % 4),
        maxSpeed: 80 + i * 10,
        energy: {
          maxEnergy: 200,
          initialEnergy: 150,
          movementCostPerSec: 1 + i * 0.1,
          reproductionCost: 50,
          idleDrainPerSec: 0.5,
          energyGainPerPrey: Array(10).fill(0),
        },
      }),
    );

    const eco = new EcosystemWorld(makeEcoConfig(species, 800));
    const matrix = buildChaseMatrix(10);

    const forces: { id: string; params: Record<string, unknown> }[] = [
      { id: 'drag', params: { coefficient: 0.8 } },
      { id: 'wander', params: { strength: 40, rate: 2.5 } },
      { id: 'gravity', params: { acceleration: 100 } },
      {
        id: 'flow-field',
        params: { strength: 50, mode: 'uniform', angle: 0.5, turbulenceScale: 0.01 },
      },
      {
        id: 'vortex',
        params: {
          cx: 400,
          cy: 300,
          strength: 150,
          radialStrength: -30,
          radius: 300,
          falloff: 'linear',
        },
      },
      { id: 'alignment', params: { radius: 60, strength: 40, crossType: false } },
      { id: 'pointer', params: { strength: 200, radius: 150, falloff: 'linear' } },
    ];

    // First serialization
    const cfg1 = serializeConfig(eco, matrix, forces);

    expect(cfg1.species.length).toBe(10);
    expect(cfg1.forces.length).toBe(7);
    expect(cfg1.interactionMatrix.length).toBe(10);

    // Round-trip through JSON
    const json = JSON.stringify(cfg1);
    const parsed = JSON.parse(json);
    const cfg2 = deserializeConfig(parsed);

    expect(cfg2.species.length).toBe(10);
    expect(cfg2.forces.length).toBe(7);

    // Force types preserved in order
    const types1 = cfg1.forces.map((f) => f.type);
    const types2 = cfg2.forces.map((f) => f.type);
    expect(types2).toEqual(types1);

    // Re-serialize from rebuilt world
    const rebuilt = new EcosystemWorld({
      width: cfg2.simulation.width,
      height: cfg2.simulation.height,
      boundaryMode: cfg2.simulation.boundaryMode,
      seed: cfg2.simulation.seed,
      populationCap: cfg2.simulation.populationCap,
      species: cfg2.species.map((s) => ({
        name: s.name,
        count: s.count,
        color: s.color,
        radius: s.radius,
        initialSpeed: s.initialSpeed,
        maxSpeed: s.maxSpeed,
        energy: {
          maxEnergy: s.energy.maxEnergy,
          initialEnergy: s.energy.initialEnergy,
          movementCostPerSec: s.energy.movementCostPerSec,
          reproductionCost: s.energy.reproductionCost,
          idleDrainPerSec: s.energy.idleDrainPerSec,
          energyGainPerPrey: [...s.energy.energyGainPerPrey],
        },
        lifecycle: { ...s.lifecycle },
        diet: { canEat: new Set(s.diet.canEat) },
      })),
      interactionRules: Array.from({ length: 10 }, () => new Array(10).fill(null)),
    });

    const matrix2 = buildChaseMatrix(10);
    const cfg3 = serializeConfig(rebuilt, matrix2, forces);

    expect(cfg3.species.length).toBe(10);
    expect(cfg3.forces.length).toBe(7);
    expect(cfg3.forces.map((f) => f.type)).toEqual(types1);
  });

  it('interaction matrix 10×10 round-trips with correct dimensions', () => {
    const species = Array.from({ length: 10 }, (_, i) => makeSpecies(`S${i}`, 30));
    const eco = new EcosystemWorld(makeEcoConfig(species, 800));
    const matrix = buildChaseMatrix(10);

    const cfg = serializeConfig(eco, matrix, [new DragForce(1)]);

    // Matrix is 10×10
    expect(cfg.interactionMatrix.length).toBe(10);
    for (const row of cfg.interactionMatrix) {
      expect(row.length).toBe(10);
    }

    // Round-trip
    const cfg2 = deserializeConfig(JSON.parse(JSON.stringify(cfg)));
    expect(cfg2.interactionMatrix.length).toBe(10);
    for (const row of cfg2.interactionMatrix) {
      expect(row.length).toBe(10);
    }
  });
});

// ─── 5. Memory stability over 10,000 steps ─────────────────────

describe('CRT-45: memory stability over 10,000 steps', { timeout: 30_000 }, () => {
  it('array buffers do not grow beyond populationCap', () => {
    const species = [makeSpecies('A', 150), makeSpecies('B', 150)];
    const eco = new EcosystemWorld(makeEcoConfig(species, 500));
    const matrix = buildChaseMatrix(2);
    const pairwise = new PairwiseForce(matrix);
    const drag = new DragForce(0.8);
    const grid = new SpatialHashGrid(800, 600, 120, 500);

    const initialWorldLen = eco.world.x.length;
    const initialEcoCap = eco.eco.capacity;
    const cap = 500;

    for (let step = 0; step < 10_000; step++) {
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      pairwise.apply(eco.world, grid, DT);
      drag.apply(eco.world, grid, DT);
      eco.processStamina(DT);
      eco.world.step(DT);
      eco.processLifecycle(DT);

      // Periodic reproduction attempts (every 60 steps) to exercise spawn/free-list
      if (step % 60 === 0) {
        for (let i = 0; i < eco.highWaterMark; i++) {
          if (eco.eco.alive[i] === ALIVE) eco.tryReproduce(i);
        }
      }
    }

    // Core invariant: world arrays never exceed populationCap
    expect(eco.world.x.length).toBeLessThanOrEqual(cap);
    expect(eco.world.y.length).toBeLessThanOrEqual(cap);
    expect(eco.world.vx.length).toBeLessThanOrEqual(cap);
    expect(eco.world.vy.length).toBeLessThanOrEqual(cap);
    // Ecosystem arrays sized to cap, never grow
    expect(eco.eco.capacity).toBe(initialEcoCap);
    expect(eco.eco.energy.length).toBe(cap);
    expect(eco.eco.alive.length).toBe(cap);
    // Alive count within cap
    expect(eco.aliveCount).toBeLessThanOrEqual(cap);
    expect(eco.highWaterMark).toBeLessThanOrEqual(cap);
    // No NaN
    assertFiniteState(eco.world, eco.highWaterMark);
    // simTime advanced
    expect(eco.world.simTime).toBeCloseTo(10_000 * DT, 2);
  });

  it('10,000 steps with no reproduction (stable population) stays bounded', () => {
    const species = [
      makeSpecies('Stable', 300, {
        energy: {
          maxEnergy: 99999,
          initialEnergy: 99999,
          movementCostPerSec: 0,
          reproductionCost: 99999,
          idleDrainPerSec: 0,
          energyGainPerPrey: [],
        },
        lifecycle: { maxAgeSec: 0, starvationDamagePerSec: 0, reproductionCooldownSec: 9999 },
      }),
    ];
    const eco = new EcosystemWorld(makeEcoConfig(species, 500));
    const grid = new SpatialHashGrid(800, 600, 200, 500);
    const forces: Force[] = [new DragForce(0.5), new WanderForce(20, 1)];

    const initialLen = eco.world.x.length;

    for (let step = 0; step < 10_000; step++) {
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      for (const f of forces) f.apply(eco.world, grid, DT);
      eco.world.step(DT);
    }

    // No growth at all — stable population, no spawn/kill
    expect(eco.world.x.length).toBe(initialLen);
    expect(eco.aliveCount).toBe(300);
    expect(eco.highWaterMark).toBe(300);
    assertFiniteState(eco.world, eco.highWaterMark);
    expect(eco.world.simTime).toBeCloseTo(10_000 * DT, 2);
  });

  it('10,000 steps with wrap boundaries keeps all particles in-bounds', () => {
    const species = [makeSpecies('Wrap', 200, { initialSpeed: 100, maxSpeed: 200 })];
    const cfg = makeEcoConfig(species, 500);
    cfg.boundaryMode = 'wrap';
    const eco = new EcosystemWorld(cfg);
    const grid = new SpatialHashGrid(800, 600, 200, 500);

    for (let step = 0; step < 10_000; step++) {
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
      eco.world.step(DT);
    }

    // With wrap, every particle must be within [0, width) × [0, height)
    for (let i = 0; i < eco.highWaterMark; i++) {
      if (eco.eco.alive[i] === ALIVE) {
        expect(eco.world.x[i]).toBeGreaterThanOrEqual(0);
        expect(eco.world.x[i]).toBeLessThan(800);
        expect(eco.world.y[i]).toBeGreaterThanOrEqual(0);
        expect(eco.world.y[i]).toBeLessThan(600);
      }
    }
    assertFiniteState(eco.world, eco.highWaterMark);
  });
});
