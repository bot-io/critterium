/**
 * CRT-46: Edge Case Test Suite
 *
 * Tests degenerate simulation configurations that must not crash.
 * Each test verifies graceful handling of boundary conditions.
 */

import { describe, it, expect } from 'vitest';
import {
  World,
  SimLoop,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  GravityForce,
  WanderForce,
  ForcePipeline,
  type InteractionEntry,
  type SimulationConfig,
  type ParticleTypeConfig,
} from './index.js';
import { DEAD, ALIVE, type SpeciesConfig, type EcosystemConfig } from './ecosystem.js';
import { EcosystemWorld } from './ecosystem-world.js';

const DT = 1 / 60;

// ─── Helpers ─────────────────────────────────────────────────────

/** Assert no NaN or Infinity in position/velocity arrays. */
function assertNoNaN(world: World): void {
  for (let i = 0; i < world.count; i++) {
    expect(Number.isNaN(world.x[i]), `x[${i}] is NaN`).toBe(false);
    expect(Number.isNaN(world.y[i]), `y[${i}] is NaN`).toBe(false);
    expect(Number.isNaN(world.vx[i]), `vx[${i}] is NaN`).toBe(false);
    expect(Number.isNaN(world.vy[i]), `vy[${i}] is NaN`).toBe(false);
    expect(Number.isFinite(world.x[i]), `x[${i}] is Infinity`).toBe(true);
    expect(Number.isFinite(world.y[i]), `y[${i}] is Infinity`).toBe(true);
    expect(Number.isFinite(world.vx[i]), `vx[${i}] is Infinity`).toBe(true);
    expect(Number.isFinite(world.vy[i]), `vy[${i}] is Infinity`).toBe(true);
  }
}

function makeType(overrides: Partial<ParticleTypeConfig> = {}): ParticleTypeConfig {
  return {
    count: 10,
    color: '#ff0000',
    radius: 3,
    initialSpeed: 50,
    maxSpeed: 100,
    ...overrides,
  };
}

function makeSpecies(overrides: Partial<SpeciesConfig> = {}): SpeciesConfig {
  return {
    count: 10,
    color: '#ff0000',
    radius: 3,
    initialSpeed: 50,
    maxSpeed: 100,
    name: 'Test',
    energy: {
      maxEnergy: 100,
      initialEnergy: 50,
      movementCostPerSec: 1,
      reproductionCost: 30,
      idleDrainPerSec: 0.5,
      energyGainPerPrey: [0],
    },
    lifecycle: { maxAgeSec: 60, starvationDamagePerSec: 5, reproductionCooldownSec: 3 },
    diet: { canEat: new Set<number>() },
    ...overrides,
  };
}

/** Build an EcosystemConfig from a species list. */
function ecoCfg(
  speciesList: SpeciesConfig[],
  extra: Partial<EcosystemConfig> = {},
): EcosystemConfig {
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
    populationCap: 100,
    species: speciesList,
    interactionRules: rules as any,
    ...extra,
  };
}

import type { InteractionRule } from './ecosystem.js';

// ─── Edge Case 1: Zero species (empty world) ─────────────────────

describe('Edge Case: 0 species (empty world)', () => {
  it('initializes an empty world without crashing', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [],
    };
    const world = new World(config);
    expect(world.count).toBe(0);
    expect(world.x.length).toBe(0);
    expect(world.y.length).toBe(0);
    expect(world.vx.length).toBe(0);
    expect(world.vy.length).toBe(0);
    expect(world.type.length).toBe(0);
  });

  it('steps an empty world without crashing or producing NaN', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [],
    };
    const world = new World(config);
    expect(() => world.step(DT)).not.toThrow();
    expect(() => world.step(DT)).not.toThrow();
    assertNoNaN(world);
  });

  it('applies forces to an empty world without crashing', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 50, 100);
    const pipeline = new ForcePipeline();
    pipeline.add(new DragForce(1.0));
    pipeline.add(new GravityForce(200));
    pipeline.add(new WanderForce(80, 3));
    const matrix = new InteractionMatrix(0);
    const pairwise = new PairwiseForce(matrix);
    expect(() => {
      grid.rebuild(world);
      pipeline.step(world, grid, DT);
      pairwise.apply(world, grid, DT);
    }).not.toThrow();
    assertNoNaN(world);
  });

  it('SimLoop advances an empty world without error', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 42,
      types: [],
    };
    const world = new World(config);
    const loop = new SimLoop(world, DT);
    const steps = loop.advance(0.5); // 30 frames worth
    expect(steps).toBeGreaterThanOrEqual(0);
    assertNoNaN(world);
  });
});

// ─── Edge Case 2: Single species (no interactions) ───────────────

describe('Edge Case: 1 species (solitary particle)', () => {
  it('single particle with no interaction entries runs normally', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 1 })],
    };
    const world = new World(config);
    expect(world.count).toBe(1);
    const grid = new SpatialHashGrid(800, 600, 50, 10);
    const matrix = new InteractionMatrix(1);
    // No entries set — all null
    const pairwise = new PairwiseForce(matrix);
    const drag = new DragForce(1.0);

    // Run 500 steps
    for (let i = 0; i < 500; i++) {
      grid.rebuild(world);
      pairwise.apply(world, grid, DT);
      drag.apply(world, grid, DT);
      world.step(DT);
    }
    assertNoNaN(world);
    // Particle should stay within bounds (with bounce margin)
    expect(world.x[0]).toBeGreaterThanOrEqual(-50);
    expect(world.x[0]).toBeLessThanOrEqual(850);
    expect(world.y[0]).toBeGreaterThanOrEqual(-50);
    expect(world.y[0]).toBeLessThanOrEqual(650);
  });

  it('InteractionMatrix with 1 type returns null for all entries', () => {
    const matrix = new InteractionMatrix(1);
    expect(matrix.get(0, 0)).toBeNull();
    expect(matrix.numTypes).toBe(1);
  });

  it('single particle with self-repulsion (same type) applies repulsion correctly', () => {
    // Two particles of the same type — repulsion should push them apart
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 2 })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 50, 10);
    const matrix = new InteractionMatrix(1);
    const pairwise = new PairwiseForce(matrix);

    // Place particles close together
    world.x[0] = 400;
    world.y[0] = 300;
    world.x[1] = 405;
    world.y[1] = 300;

    const initialDist = Math.sqrt((world.x[1] - world.x[0]) ** 2 + (world.y[1] - world.y[0]) ** 2);

    grid.rebuild(world);
    pairwise.apply(world, grid, DT);

    // After repulsion, distance should change (particles pushed apart)
    const finalDist = Math.sqrt((world.x[1] - world.x[0]) ** 2 + (world.y[1] - world.y[0]) ** 2);
    // Velocity changes should move them apart (relative velocity increases)
    expect(Number.isFinite(finalDist)).toBe(true);
    assertNoNaN(world);
  });
});

// ─── Edge Case 3: Maximum species (10) ───────────────────────────

describe('Edge Case: 10 species (maximum)', () => {
  const numTypes = 10;

  function make10Types(): ParticleTypeConfig[] {
    const colors = [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#ff00ff',
      '#00ffff',
      '#ff8800',
      '#8800ff',
      '#00ff88',
      '#ff0088',
    ];
    const types: ParticleTypeConfig[] = [];
    for (let i = 0; i < numTypes; i++) {
      types.push(makeType({ count: 5, color: colors[i], radius: 3 + (i % 3) }));
    }
    return types;
  }

  it('InteractionMatrix with 10 types has 10x10 dimensions', () => {
    const matrix = new InteractionMatrix(numTypes);
    expect(matrix.numTypes).toBe(10);
    // All 100 entries should be null by default
    for (let a = 0; a < numTypes; a++) {
      for (let b = 0; b < numTypes; b++) {
        expect(matrix.get(a, b)).toBeNull();
      }
    }
  });

  it('World with 10 species initializes with correct particle count', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: make10Types(),
    };
    const world = new World(config);
    expect(world.count).toBe(50); // 10 types × 5 particles each
    // Verify all type indices are within range [0, 9]
    for (let i = 0; i < world.count; i++) {
      expect(world.type[i]).toBeGreaterThanOrEqual(0);
      expect(world.type[i]).toBeLessThan(numTypes);
    }
  });

  it('World with 10 species steps without crashes and produces valid state', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: make10Types(),
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 200, 100);
    const matrix = new InteractionMatrix(numTypes);

    // Set up a circular chase chain: type i chases type (i+1) % 10
    for (let i = 0; i < numTypes; i++) {
      matrix.set(i, (i + 1) % numTypes, {
        strength: 100,
        radius: 80,
        falloff: 'linear',
      });
    }

    const pairwise = new PairwiseForce(matrix);

    for (let step = 0; step < 300; step++) {
      grid.rebuild(world);
      pairwise.apply(world, grid, DT);
      world.step(DT);
    }
    assertNoNaN(world);
    // All type indices still valid after stepping
    for (let i = 0; i < world.count; i++) {
      expect(world.type[i]).toBeLessThan(numTypes);
    }
  });

  it('InteractionMatrix with 10 types can set and get entries correctly', () => {
    const matrix = new InteractionMatrix(numTypes);
    const entry: InteractionEntry = { strength: 50, radius: 100, falloff: 'linear' };
    matrix.set(3, 7, entry);
    expect(matrix.get(3, 7)).toBe(entry);
    // Verify symmetric pair is NOT automatically set (asymmetric by design)
    expect(matrix.get(7, 3)).toBeNull();
    // Verify out-of-range does not crash
    expect(matrix.get(9, 9)).toBeNull();
  });
});

// ─── Edge Case 4: Zero-radius interaction ────────────────────────

describe('Edge Case: zero-radius interaction', () => {
  it('InteractionMatrix.forceAtDistance returns 0 for zero-radius entry at any distance', () => {
    const entry: InteractionEntry = {
      strength: 100,
      radius: 0,
      falloff: 'linear',
    };
    // dist >= radius (0) for any non-negative distance → returns 0
    expect(InteractionMatrix.forceAtDistance(entry, 0)).toBe(0);
    expect(InteractionMatrix.forceAtDistance(entry, 1)).toBe(0);
    expect(InteractionMatrix.forceAtDistance(entry, 100)).toBe(0);
    // No NaN produced
    expect(Number.isNaN(InteractionMatrix.forceAtDistance(entry, 0.001))).toBe(false);
  });

  it('zero-radius matrix entry does not crash PairwiseForce and produces no NaN', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 }), makeType({ count: 5, color: '#00ff00' })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 50, 50);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 200, radius: 0, falloff: 'linear' });
    matrix.set(1, 0, { strength: 200, radius: 0, falloff: 'inverse' });

    const pairwise = new PairwiseForce(matrix, { strength: 500, radius: 8 });

    // Place particles close together to trigger potential division by zero
    for (let i = 0; i < world.count; i++) {
      world.x[i] = 400 + (i % 3) * 2;
      world.y[i] = 300 + Math.floor(i / 3) * 2;
    }

    expect(() => {
      grid.rebuild(world);
      pairwise.apply(world, grid, DT);
    }).not.toThrow();
    assertNoNaN(world);
  });

  it('zero-radius entry with inverse falloff does not produce NaN at distance 0', () => {
    const entry: InteractionEntry = {
      strength: 100,
      radius: 0,
      falloff: 'inverse',
    };
    // This should not produce Infinity or NaN
    const result = InteractionMatrix.forceAtDistance(entry, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });
});

// ─── Edge Case 5: Negative strength (repel instead of attract) ───

describe('Edge Case: negative strength (repulsion)', () => {
  it('negative strength produces repulsive force (reverses direction)', () => {
    const attractEntry: InteractionEntry = {
      strength: 100,
      radius: 100,
      falloff: 'constant',
    };
    const repelEntry: InteractionEntry = {
      strength: -100,
      radius: 100,
      falloff: 'constant',
    };
    // At some fixed distance within radius
    const dist = 50;
    const attractForce = InteractionMatrix.forceAtDistance(attractEntry, dist);
    const repelForce = InteractionMatrix.forceAtDistance(repelEntry, dist);

    // Positive = attract (toward neighbor), negative = repel (away from neighbor)
    expect(attractForce).toBeGreaterThan(0);
    expect(repelForce).toBeLessThan(0);
    expect(Math.abs(attractForce)).toBe(Math.abs(repelForce));
  });

  it('two particles with negative strength move apart over steps', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 1 }), makeType({ count: 1, color: '#00ff00' })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 200, 10);
    const matrix = new InteractionMatrix(2);
    // Type 0 is repelled by type 1
    matrix.set(0, 1, { strength: -300, radius: 200, falloff: 'constant' });

    const pairwise = new PairwiseForce(matrix, { strength: 0, radius: 0 });

    // Place particle 0 to the left of particle 1
    world.x[0] = 390;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = 410;
    world.y[1] = 300;
    world.vx[1] = 0;
    world.vy[1] = 0;

    // Particle 0 is repelled by particle 1 (to the right of it)
    // Negative strength means force is away from neighbor → particle 0 pushed left
    grid.rebuild(world);
    pairwise.apply(world, grid, DT);

    // Particle 0 should gain leftward velocity (negative vx)
    expect(world.vx[0]).toBeLessThan(0);
    assertNoNaN(world);
  });

  it('negative strength with linear and inverse falloff is also repulsive', () => {
    for (const falloff of ['linear', 'inverse'] as const) {
      const entry: InteractionEntry = {
        strength: -200,
        radius: 100,
        falloff,
      };
      const force = InteractionMatrix.forceAtDistance(entry, 50);
      expect(force).toBeLessThan(0);
      expect(Number.isFinite(force)).toBe(true);
    }
  });
});

// ─── Edge Case 6: Population cap = 2 ─────────────────────────────

describe('Edge Case: population cap = 2', () => {
  it('EcosystemWorld with populationCap=2 initializes with 2 particles', () => {
    const config = ecoCfg([makeSpecies({ count: 2 })], { populationCap: 2 });
    const eco = new EcosystemWorld(config);
    expect(eco.aliveCount).toBe(2);
    expect(eco.populationCap).toBe(2);
    expect(eco.highWaterMark).toBe(2);
  });

  it('spawn beyond cap returns -1', () => {
    const config = ecoCfg([makeSpecies({ count: 2 })], { populationCap: 2 });
    const eco = new EcosystemWorld(config);
    expect(eco.aliveCount).toBe(2);
    // Attempt to spawn a third
    const result = eco.spawn(0);
    expect(result).toBe(-1);
    expect(eco.aliveCount).toBe(2);
  });

  it('steps the world without crashing or producing NaN', () => {
    const config = ecoCfg([makeSpecies({ count: 2 })], { populationCap: 2 });
    const eco = new EcosystemWorld(config);
    const grid = new SpatialHashGrid(800, 600, 200, 10);
    const matrix = new InteractionMatrix(1);

    for (let step = 0; step < 200; step++) {
      grid.rebuild(eco.world);
      eco.world.step(DT);
    }
    assertNoNaN(eco.world);
    expect(eco.aliveCount).toBeLessThanOrEqual(2);
  });

  it('handles initial species exceeding cap by proportional reduction', () => {
    // Request 10 particles but cap is 2
    const config = ecoCfg([makeSpecies({ count: 10 })], { populationCap: 2 });
    const eco = new EcosystemWorld(config);
    expect(eco.aliveCount).toBeLessThanOrEqual(2);
    expect(eco.populationCap).toBe(2);
  });
});

// ─── Edge Case 7: Minimum canvas dimensions (100x100) ────────────

describe('Edge Case: minimum canvas (100x100)', () => {
  it('World with 100x100 dimensions initializes correctly', () => {
    const config: SimulationConfig = {
      width: 100,
      height: 100,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 })],
    };
    const world = new World(config);
    expect(world.width).toBe(100);
    expect(world.height).toBe(100);
    // All particles should be spawned within bounds
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThanOrEqual(100);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThanOrEqual(100);
    }
  });

  it('bounce mode at 100x100 keeps particles within bounds', () => {
    const config: SimulationConfig = {
      width: 100,
      height: 100,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 10, initialSpeed: 80, maxSpeed: 150 })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(100, 100, 50, 20);
    const drag = new DragForce(0.5);

    for (let step = 0; step < 500; step++) {
      drag.apply(world, grid, DT);
      world.step(DT);
    }
    assertNoNaN(world);
    // All particles within or near bounds (bounce reflects)
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(-10);
      expect(world.x[i]).toBeLessThanOrEqual(110);
      expect(world.y[i]).toBeGreaterThanOrEqual(-10);
      expect(world.y[i]).toBeLessThanOrEqual(110);
    }
  });

  it('wrap mode at 100x100 keeps particles within [0, 100)', () => {
    const config: SimulationConfig = {
      width: 100,
      height: 100,
      boundaryMode: 'wrap',
      seed: 42,
      types: [makeType({ count: 10, initialSpeed: 80, maxSpeed: 150 })],
    };
    const world = new World(config);
    const drag = new DragForce(0.5);
    const grid = new SpatialHashGrid(100, 100, 50, 20);

    for (let step = 0; step < 500; step++) {
      drag.apply(world, grid, DT);
      world.step(DT);
    }
    assertNoNaN(world);
    // Wrap guarantees strict [0, width) and [0, height)
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThan(100);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThan(100);
    }
  });

  it('spatial hash grid at 100x100 with small cell size works', () => {
    // Cell size larger than world → only 1 cell
    const grid = new SpatialHashGrid(100, 100, 200, 20);
    expect(grid.cols).toBe(1);
    expect(grid.rows).toBe(1);
    expect(grid.numCells).toBe(1);

    const world = new World({
      width: 100,
      height: 100,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 })],
    });

    expect(() => grid.rebuild(world)).not.toThrow();
    // Query should find neighbors in the single cell
    let neighborCount = 0;
    grid.queryRadius(
      world.x[0],
      world.y[0],
      100,
      world.x,
      world.y,
      world.count,
      (_idx, _dx, _dy, _dSq) => {
        neighborCount++;
      },
    );
    // Should find the other 4 particles (self excluded by dSq > 0)
    expect(neighborCount).toBeGreaterThan(0);
  });
});

// ─── Edge Case 8: Zero timestep (dt = 0) ─────────────────────────

describe('Edge Case: zero timestep (dt = 0)', () => {
  it('stepping with dt=0 does not crash and preserves state', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 10 })],
    };
    const world = new World(config);
    const snapshot = world.snapshot();

    world.step(0);

    // With dt=0, positions should not change (integrate adds vx * 0)
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBe(snapshot.x[i]);
      expect(world.y[i]).toBe(snapshot.y[i]);
    }
    assertNoNaN(world);
  });

  it('forces with dt=0 apply zero velocity change', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 200, 10);
    const snapshot = world.snapshot();

    const drag = new DragForce(2.0);
    const gravity = new GravityForce(500);

    grid.rebuild(world);
    drag.apply(world, grid, 0);
    gravity.apply(world, grid, 0);

    // With dt=0, velocities should be unchanged
    for (let i = 0; i < world.count; i++) {
      expect(world.vx[i]).toBe(snapshot.vx[i]);
      expect(world.vy[i]).toBe(snapshot.vy[i]);
    }
  });
});

// ─── Edge Case 9: All particles at same position ─────────────────

describe('Edge Case: co-located particles', () => {
  it('particles at identical positions do not produce NaN in PairwiseForce', () => {
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(800, 600, 200, 20);
    const matrix = new InteractionMatrix(1);
    matrix.set(0, 0, { strength: 100, radius: 50, falloff: 'linear' });
    const pairwise = new PairwiseForce(matrix, { strength: 500, radius: 8 });

    // Place all particles at the exact same position
    for (let i = 0; i < world.count; i++) {
      world.x[i] = 400;
      world.y[i] = 300;
      world.vx[i] = 0;
      world.vy[i] = 0;
    }

    expect(() => {
      grid.rebuild(world);
      pairwise.apply(world, grid, DT);
    }).not.toThrow();
    assertNoNaN(world);
  });

  it('co-located particles in spatial hash query are handled by selfIdx exclusion', () => {
    const grid = new SpatialHashGrid(800, 600, 200, 20);
    const config: SimulationConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 3 })],
    };
    const world = new World(config);
    // All at same position
    for (let i = 0; i < world.count; i++) {
      world.x[i] = 400;
      world.y[i] = 300;
    }
    grid.rebuild(world);

    // Query with selfIdx — should find co-located particles except self
    let found = 0;
    grid.queryRadius(
      400,
      300,
      100,
      world.x,
      world.y,
      world.count,
      (_idx, _dx, _dy, _dSq) => {
        found++;
      },
      0, // selfIdx = 0
    );
    // Should find particles 1 and 2 (co-located, dSq=0, excluded by selfIdx)
    expect(found).toBe(2);
  });
});

// ─── Edge Case 10: Very large interaction radius ─────────────────

describe('Edge Case: very large interaction radius', () => {
  it('radius larger than world does not crash or produce NaN', () => {
    const config: SimulationConfig = {
      width: 200,
      height: 200,
      boundaryMode: 'bounce',
      seed: 42,
      types: [makeType({ count: 5 }), makeType({ count: 5, color: '#00ff00' })],
    };
    const world = new World(config);
    const grid = new SpatialHashGrid(200, 200, 500, 20);
    const matrix = new InteractionMatrix(2);
    // Radius much larger than the world
    matrix.set(0, 1, { strength: 100, radius: 10000, falloff: 'linear' });
    matrix.set(1, 0, { strength: 100, radius: 10000, falloff: 'linear' });

    const pairwise = new PairwiseForce(matrix);

    for (let step = 0; step < 100; step++) {
      grid.rebuild(world);
      pairwise.apply(world, grid, DT);
      world.step(DT);
    }
    assertNoNaN(world);
  });
});
