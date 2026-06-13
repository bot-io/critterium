import { describe, it, expect } from 'vitest';
import {
  MAX_TYPES,
  createRng,
  World,
  SimLoop,
  SpatialHashGrid,
  bruteForceNeighbors,
  defaultConfig,
  InteractionMatrix,
  PairwiseForce,
  DEFAULT_REPULSION,
  type SimulationConfig,
  type ParticleTypeConfig,
  type InteractionEntry,
  type BoundaryMode,
  Force,
  ForcePipeline,
  DragForce,
  GravityForce,
  BoundaryForce,
  WanderForce,
  FlowFieldForce,
  VortexForce,
} from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeConfig(types: ParticleTypeConfig[], seed = 42): SimulationConfig {
  return { width: 800, height: 600, boundaryMode: 'bounce', types, seed };
}

function singleTypeConfig(count = 10, opts?: Partial<ParticleTypeConfig>): SimulationConfig {
  return makeConfig([
    { count, color: '#ff0000', radius: 3, initialSpeed: 50, maxSpeed: 100, ...opts },
  ]);
}

// ─── RNG ─────────────────────────────────────────────────────────

describe('createRng (mulberry32)', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);
    let anyDifferent = false;
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('passes basic uniformity (mean near 0.5)', () => {
    const rng = createRng(42);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) sum += rng();
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

// ─── World ───────────────────────────────────────────────────────

describe('World', () => {
  it('allocates typed arrays of correct size', () => {
    const world = new World(singleTypeConfig(50));
    expect(world.count).toBe(50);
    expect(world.x.length).toBe(50);
    expect(world.y.length).toBe(50);
    expect(world.vx.length).toBe(50);
    expect(world.vy.length).toBe(50);
    expect(world.type.length).toBe(50);
  });

  it('sets type indices correctly for single type', () => {
    const world = new World(singleTypeConfig(20));
    for (let i = 0; i < 20; i++) {
      expect(world.type[i]).toBe(0);
    }
  });

  it('sets type indices correctly for multiple types', () => {
    const cfg = makeConfig([
      { count: 5, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 100 },
      { count: 3, color: '#0f0', radius: 4, initialSpeed: 40, maxSpeed: 80 },
    ]);
    const world = new World(cfg);
    expect(world.count).toBe(8);
    // First 5 are type 0, next 3 are type 1
    for (let i = 0; i < 5; i++) expect(world.type[i]).toBe(0);
    for (let i = 5; i < 8; i++) expect(world.type[i]).toBe(1);
  });

  it('spawns particles within world bounds', () => {
    const world = new World(singleTypeConfig(100));
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThanOrEqual(800);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThanOrEqual(600);
    }
  });

  it('spawns with initialSpeed magnitude', () => {
    const world = new World(singleTypeConfig(100, { initialSpeed: 50 }));
    for (let i = 0; i < world.count; i++) {
      const spd = Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
      // Floating point tolerance
      expect(spd).toBeCloseTo(50, 3);
    }
  });

  it('stores seed and rng for determinism', () => {
    const world1 = new World(singleTypeConfig(10, undefined));
    const world2 = new World(singleTypeConfig(10, undefined));
    // Same seed → same initial positions
    for (let i = 0; i < 10; i++) {
      expect(world1.x[i]).toBe(world2.x[i]);
      expect(world1.y[i]).toBe(world2.y[i]);
    }
  });
});

// ─── Velocity clamping ───────────────────────────────────────────

describe('World.clampVelocities', () => {
  it('does not change particles below maxSpeed', () => {
    const world = new World(singleTypeConfig(1, { initialSpeed: 10, maxSpeed: 100 }));
    const vxBefore = world.vx[0];
    const vyBefore = world.vy[0];
    world.clampVelocities();
    expect(world.vx[0]).toBe(vxBefore);
    expect(world.vy[0]).toBe(vyBefore);
  });

  it('clamps particles exceeding maxSpeed', () => {
    const world = new World(singleTypeConfig(1, { initialSpeed: 10, maxSpeed: 100 }));
    // Set a velocity that exceeds maxSpeed
    world.vx[0] = 200;
    world.vy[0] = 200;
    world.clampVelocities();
    // After clamping, speed should be at most maxSpeed
    const actualSpd = Math.sqrt(world.vx[0] ** 2 + world.vy[0] ** 2);
    expect(actualSpd).toBeLessThanOrEqual(100.001); // float tolerance
  });

  it('clamps per-type independently', () => {
    const cfg = makeConfig([
      { count: 1, color: '#f00', radius: 3, initialSpeed: 10, maxSpeed: 50 },
      { count: 1, color: '#0f0', radius: 3, initialSpeed: 10, maxSpeed: 150 },
    ]);
    const world = new World(cfg);
    // Both set to same high velocity
    world.vx[0] = 200;
    world.vy[0] = 0;
    world.vx[1] = 200;
    world.vy[1] = 0;
    world.clampVelocities();
    const spd0 = Math.sqrt(world.vx[0] ** 2 + world.vy[0] ** 2);
    const spd1 = Math.sqrt(world.vx[1] ** 2 + world.vy[1] ** 2);
    expect(spd0).toBeCloseTo(50, 3);
    expect(spd1).toBeCloseTo(150, 3);
  });

  it('preserves velocity direction when clamping', () => {
    const world = new World(singleTypeConfig(1, { initialSpeed: 10, maxSpeed: 100 }));
    world.vx[0] = 300;
    world.vy[0] = 400;
    world.clampVelocities();
    // Direction should be preserved (3:4 ratio)
    expect(world.vx[0] / world.vy[0]).toBeCloseTo(0.75, 5);
  });
});

// ─── Boundaries ──────────────────────────────────────────────────

describe('World.applyBoundaries (bounce)', () => {
  it('bounces particles off left wall + soft repulsion', () => {
    const world = new World(singleTypeConfig(1));
    world.x[0] = -10;
    world.vx[0] = -50;
    world.applyBoundaries();
    expect(world.x[0]).toBe(10);
    // Hard bounce: vx = 50, soft repulsion: x=10, margin=30, t=(1-10/30)²*10 = 4.444
    expect(world.vx[0]).toBeCloseTo(50 + (1 - 10 / 30) ** 2 * World.BOUNCE_REPULSION, 3);
  });

  it('bounces particles off right wall + soft repulsion', () => {
    const world = new World(singleTypeConfig(1));
    world.x[0] = 810;
    world.vx[0] = 50;
    world.applyBoundaries();
    expect(world.x[0]).toBeCloseTo(790, 3);
    // Hard bounce: vx = -50, distToRight=10, soft: -(1-10/30)²*10 = -4.444
    expect(world.vx[0]).toBeCloseTo(-50 - (1 - 10 / 30) ** 2 * World.BOUNCE_REPULSION, 3);
  });

  it('bounces particles off top wall + soft repulsion', () => {
    const world = new World(singleTypeConfig(1));
    world.y[0] = -5;
    world.vy[0] = -30;
    world.applyBoundaries();
    expect(world.y[0]).toBe(5);
    // Hard bounce: vy = 30, distToTop=5, soft: (1-5/30)²*10 = 6.944
    expect(world.vy[0]).toBeCloseTo(30 + (1 - 5 / 30) ** 2 * World.BOUNCE_REPULSION, 3);
  });

  it('bounces particles off bottom wall + soft repulsion', () => {
    const world = new World(singleTypeConfig(1));
    world.y[0] = 610;
    world.vy[0] = 30;
    world.applyBoundaries();
    expect(world.y[0]).toBeCloseTo(590, 3);
    // Hard bounce: vy = -30, distToBottom=10, soft: -(1-10/30)²*10 = -4.444
    expect(world.vy[0]).toBeCloseTo(-30 - (1 - 10 / 30) ** 2 * World.BOUNCE_REPULSION, 3);
  });
});

describe('World.applyBoundaries (wrap)', () => {
  it('wraps particles that go past right edge', () => {
    const cfg = makeConfig([
      { count: 1, color: '#f00', radius: 3, initialSpeed: 10, maxSpeed: 100 },
    ]);
    cfg.boundaryMode = 'wrap';
    const world = new World(cfg);
    world.x[0] = 810;
    world.applyBoundaries();
    expect(world.x[0]).toBeCloseTo(10, 3);
  });

  it('wraps particles that go past left edge', () => {
    const cfg = makeConfig([
      { count: 1, color: '#f00', radius: 3, initialSpeed: 10, maxSpeed: 100 },
    ]);
    cfg.boundaryMode = 'wrap';
    const world = new World(cfg);
    world.x[0] = -10;
    world.applyBoundaries();
    expect(world.x[0]).toBeCloseTo(790, 3);
  });
});

// ─── Integration ─────────────────────────────────────────────────

describe('World.integrate', () => {
  it('moves particles according to velocity * dt', () => {
    const world = new World(singleTypeConfig(1, { initialSpeed: 0 }));
    world.x[0] = 100;
    world.y[0] = 100;
    world.vx[0] = 50;
    world.vy[0] = 30;
    world.integrate(1);
    expect(world.x[0]).toBeCloseTo(150, 5);
    expect(world.y[0]).toBeCloseTo(130, 5);
  });
});

// ─── Determinism ─────────────────────────────────────────────────

describe('Determinism', () => {
  it('produces identical state after 1000 steps with same seed', () => {
    const cfg = defaultConfig({ seed: 42 });

    // Run world 1
    const world1 = new World({ ...cfg, seed: 42 });
    for (let i = 0; i < 1000; i++) {
      world1.step(1 / 60);
    }
    const snap1 = world1.snapshot();

    // Run world 2 with same seed
    const world2 = new World({ ...cfg, seed: 42 });
    for (let i = 0; i < 1000; i++) {
      world2.step(1 / 60);
    }
    const snap2 = world2.snapshot();

    // States must be identical
    expect(snap1.count).toBe(snap2.count);
    for (let i = 0; i < snap1.count; i++) {
      expect(snap1.x[i]).toBe(snap2.x[i]);
      expect(snap1.y[i]).toBe(snap2.y[i]);
      expect(snap1.vx[i]).toBe(snap2.vx[i]);
      expect(snap1.vy[i]).toBe(snap2.vy[i]);
      expect(snap1.type[i]).toBe(snap2.type[i]);
    }
    expect(snap1.simTime).toBe(snap2.simTime);
  });

  it('different seeds produce different states', () => {
    const world1 = new World(defaultConfig({ seed: 42 }));
    const world2 = new World(defaultConfig({ seed: 99 }));
    for (let i = 0; i < 100; i++) {
      world1.step(1 / 60);
      world2.step(1 / 60);
    }
    // Extremely unlikely to be identical
    let anyDifferent = false;
    for (let i = 0; i < world1.count; i++) {
      if (world1.x[i] !== world2.x[i] || world1.y[i] !== world2.y[i]) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

// ─── SimLoop ─────────────────────────────────────────────────────

describe('SimLoop', () => {
  it('takes fixed steps for accumulated time', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const loop = new SimLoop(world, 1 / 60);
    const steps = loop.advance(1 / 60);
    expect(steps).toBe(1);
  });

  it('accumulates fractional time', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const loop = new SimLoop(world, 1 / 60);
    // Two half-steps should result in 1 full step
    loop.advance(1 / 120);
    const steps = loop.advance(1 / 120);
    expect(steps).toBe(1);
  });

  it('computes interpolation alpha', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const loop = new SimLoop(world, 1 / 60);
    loop.advance(1 / 120); // half a step
    expect(loop.alpha).toBeCloseTo(0.5, 3);
  });

  it('clamps excessive dt to prevent spiral of death', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const loop = new SimLoop(world, 1 / 60);
    // Pass a huge dt
    const steps = loop.advance(100);
    expect(steps).toBeLessThanOrEqual(10); // MAX_ACCUMULATOR_STEPS
  });

  it('simulation time advances correctly', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const loop = new SimLoop(world, 1 / 60);
    // Advance in small increments to avoid MAX_ACCUMULATOR_STEPS cap
    for (let i = 0; i < 60; i++) {
      loop.advance(1 / 60);
    }
    // Should have taken ~60 steps → ~1s sim time
    expect(world.simTime).toBeGreaterThan(0.9);
  });
});

// ─── Snapshot ────────────────────────────────────────────────────

describe('World.snapshot', () => {
  it('returns a copy of the state', () => {
    const world = new World(defaultConfig({ seed: 42 }));
    const snap = world.snapshot();
    // Modify world state
    world.x[0] = 9999;
    // Snapshot should be unaffected
    expect(snap.x[0]).not.toBe(9999);
  });
});

// ─── Constants ───────────────────────────────────────────────────

describe('Constants', () => {
  it('MAX_TYPES is 16', () => {
    expect(MAX_TYPES).toBe(16);
  });
});

// ─── Spatial Hash Grid ──────────────────────────────────────────

describe('SpatialHashGrid', () => {
  const W = 800,
    H = 600;
  const CELL = 100; // max interaction radius
  const MAX_P = 1000;

  function makeGrid(cellSize = CELL, maxP = MAX_P): SpatialHashGrid {
    return new SpatialHashGrid(W, H, cellSize, maxP);
  }

  // ─── Construction ───────────────────────────────────────────

  it('computes correct grid dimensions', () => {
    const grid = makeGrid();
    expect(grid.cols).toBe(8); // ceil(800/100)
    expect(grid.rows).toBe(6); // ceil(600/100)
    expect(grid.numCells).toBe(48);
  });

  it('handles non-divisible cell sizes', () => {
    const grid = new SpatialHashGrid(800, 600, 70, 100);
    expect(grid.cols).toBe(12); // ceil(800/70)
    expect(grid.rows).toBe(9); // ceil(600/70)
  });

  it('handles cell size equal to world size', () => {
    const grid = new SpatialHashGrid(800, 600, 800, 100);
    expect(grid.cols).toBe(1);
    expect(grid.rows).toBe(1);
    expect(grid.numCells).toBe(1);
  });

  // ─── Insert & cellAt ────────────────────────────────────────

  it('inserts particles into correct cells', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 50, 50); // col 0, row 0 → cell 0
    grid.insert(1, 150, 50); // col 1, row 0 → cell 1
    grid.insert(2, 50, 150); // col 0, row 1 → cell 8
    expect(grid.cellAt(50, 50)).toBe(0);
    expect(grid.cellAt(150, 50)).toBe(1);
    expect(grid.cellAt(50, 150)).toBe(8);
  });

  it('clamps particles at edges to valid cells', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 799, 599); // near edge
    grid.insert(1, 0, 0); // corner
    expect(grid.cellAt(799, 599)).toBe(47); // last cell
    expect(grid.cellAt(0, 0)).toBe(0);
  });

  it('returns -1 for out-of-bounds cellAt', () => {
    const grid = makeGrid();
    expect(grid.cellAt(-1, 0)).toBe(-1);
    expect(grid.cellAt(0, -1)).toBe(-1);
    expect(grid.cellAt(800, 600)).toBe(-1);
  });

  // ─── Query ──────────────────────────────────────────────────

  it('finds nearby particles', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);
    grid.insert(1, 110, 100);
    grid.insert(2, 500, 500); // far away

    const xArr = new Float32Array([100, 110, 500]);
    const yArr = new Float32Array([100, 100, 500]);

    const neighbors: number[] = [];
    grid.queryRadius(100, 100, 50, xArr, yArr, 3, (idx) => {
      neighbors.push(idx);
    });
    expect(neighbors).toContain(1); // 10 units away
    expect(neighbors).not.toContain(0); // self (dist=0, excluded)
    expect(neighbors).not.toContain(2); // too far
  });

  it('finds particles in adjacent cells', () => {
    const grid = makeGrid();
    grid.clear();
    // Particle at (99, 50) — in cell col 0, row 0
    // Particle at (101, 50) — in cell col 1, row 0
    // They're only 2 units apart but in different cells
    grid.insert(0, 99, 50);
    grid.insert(1, 101, 50);

    const xArr = new Float32Array([99, 101]);
    const yArr = new Float32Array([50, 50]);

    const neighbors: number[] = [];
    grid.queryRadius(99, 50, 10, xArr, yArr, 2, (idx) => {
      neighbors.push(idx);
    });
    expect(neighbors).toContain(1);
  });

  it('excludes particles beyond radius', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);
    grid.insert(1, 200, 100); // 100 units away

    const xArr = new Float32Array([100, 200]);
    const yArr = new Float32Array([100, 100]);

    const neighbors: number[] = [];
    grid.queryRadius(100, 100, 50, xArr, yArr, 2, (idx) => {
      neighbors.push(idx);
    });
    expect(neighbors).toHaveLength(0);
  });

  it('handles query at world edge (clamped cells)', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 5, 5);
    grid.insert(1, 15, 5); // 10 units away

    const xArr = new Float32Array([5, 15]);
    const yArr = new Float32Array([5, 5]);

    const neighbors: number[] = [];
    grid.queryRadius(5, 5, 20, xArr, yArr, 2, (idx) => {
      neighbors.push(idx);
    });
    expect(neighbors).toContain(1);
  });

  // ─── selfIdx (co-located particle support) ──────────────────

  it('queryRadius with selfIdx finds co-located particles (dSq=0)', () => {
    // Two particles at the exact same position
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);
    grid.insert(1, 100, 100);

    const xArr = new Float32Array([100, 100]);
    const yArr = new Float32Array([100, 100]);

    // Without selfIdx: dSq > 0 filter excludes co-located particles
    const neighborsNoSelf: number[] = [];
    grid.queryRadius(100, 100, 50, xArr, yArr, 2, (idx) => {
      neighborsNoSelf.push(idx);
    });
    expect(neighborsNoSelf).toHaveLength(0);

    // With selfIdx=0: finds particle 1 (co-located, not self)
    const neighborsWithSelf: number[] = [];
    grid.queryRadius(
      100,
      100,
      50,
      xArr,
      yArr,
      2,
      (idx) => {
        neighborsWithSelf.push(idx);
      },
      0,
    );
    expect(neighborsWithSelf).toEqual([1]);
  });

  it('queryRadius with selfIdx excludes self by index, not distance', () => {
    // Particles at different positions
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);
    grid.insert(1, 105, 100);

    const xArr = new Float32Array([100, 105]);
    const yArr = new Float32Array([100, 100]);

    // With selfIdx=0: should find particle 1 but NOT particle 0
    const neighbors: number[] = [];
    grid.queryRadius(
      100,
      100,
      50,
      xArr,
      yArr,
      2,
      (idx) => {
        neighbors.push(idx);
      },
      0,
    );
    expect(neighbors).toContain(1);
    expect(neighbors).not.toContain(0);
  });

  it('queryRadiusToArray collects into pre-allocated array', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);
    grid.insert(1, 105, 100);
    grid.insert(2, 500, 500);

    const xArr = new Float32Array([100, 105, 500]);
    const yArr = new Float32Array([100, 100, 500]);
    const out = new Int32Array(10);

    const count = grid.queryRadiusToArray(100, 100, 20, xArr, yArr, 3, out, 10);
    expect(count).toBe(1);
    expect(out[0]).toBe(1);
  });

  it('queryRadiusToArray respects maxResults', () => {
    const grid = makeGrid();
    grid.clear();
    for (let i = 0; i < 10; i++) {
      grid.insert(i, 100 + i * 2, 100);
    }

    const xArr = new Float32Array(10);
    const yArr = new Float32Array(10);
    for (let i = 0; i < 10; i++) {
      xArr[i] = 100 + i * 2;
      yArr[i] = 100;
    }

    const out = new Int32Array(3);
    const count = grid.queryRadiusToArray(100, 100, 50, xArr, yArr, 10, out, 3);
    // Should find neighbors but cap at 3
    expect(count).toBe(3);
  });

  // ─── Rebuild ────────────────────────────────────────────────

  it('rebuild from World', () => {
    const world = new World(singleTypeConfig(50));
    const grid = makeGrid();
    grid.rebuild(world);

    // Verify querying all particles doesn't crash and returns consistent results
    for (let i = 0; i < world.count; i++) {
      const neighbors: number[] = [];
      grid.queryRadius(world.x[i], world.y[i], 1, world.x, world.y, world.count, (idx) => {
        neighbors.push(idx);
      });
      // No crash = success. Neighbors within 1 unit are valid.
    }
  });

  it('rebuild clears previous state', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 100, 100);

    // Rebuild with a world that has particles far from (100, 100)
    const world = new World(singleTypeConfig(5));
    // Move all particles far away
    for (let i = 0; i < world.count; i++) {
      world.x[i] = 700;
      world.y[i] = 500;
    }
    grid.rebuild(world);

    // Query near (100, 100) should find nothing
    const neighbors: number[] = [];
    grid.queryRadius(100, 100, 200, world.x, world.y, world.count, (idx) => {
      neighbors.push(idx);
    });
    expect(neighbors).toHaveLength(0);
  });

  // ─── Zero-allocation verification ──────────────────────────

  it('rebuild+query produces zero allocations (heap growth check)', () => {
    const world = new World(singleTypeConfig(200));
    const grid = makeGrid(100, 200);

    // Warm up
    grid.rebuild(world);
    const buf = new Int32Array(200);
    grid.queryRadiusToArray(100, 100, 50, world.x, world.y, world.count, buf, 200);

    // Measure heap before
    const before = (performance as any).memory?.usedJSHeapSize;
    if (!before) {
      // memory API not available (non-Chrome) — skip the heap check,
      // but verify the operations still work correctly
      for (let i = 0; i < 100; i++) {
        grid.rebuild(world);
        grid.queryRadiusToArray(100, 100, 50, world.x, world.y, world.count, buf, 200);
      }
      return; // soft pass
    }

    // Run many cycles
    for (let i = 0; i < 100; i++) {
      grid.rebuild(world);
      grid.queryRadiusToArray(100, 100, 50, world.x, world.y, world.count, buf, 200);
    }

    const after = (performance as any).memory?.usedJSHeapSize;
    // Allow small fluctuation but no significant growth
    const growth = after - before;
    // Less than 1MB growth from 100 cycles of rebuild+query
    expect(growth).toBeLessThan(1_000_000);
  });

  // ─── Property test: grid matches brute force ───────────────

  it('matches brute-force for random positions (property test, 200 trials)', () => {
    const rng = createRng(12345);
    const N = 100;
    const RADIUS = 80;

    for (let trial = 0; trial < 200; trial++) {
      // Generate random positions
      const xArr = new Float32Array(N);
      const yArr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        xArr[i] = rng() * W;
        yArr[i] = rng() * H;
      }

      // Build grid
      const grid = makeGrid(RADIUS, N);
      grid.clear();
      for (let i = 0; i < N; i++) {
        grid.insert(i, xArr[i], yArr[i]);
      }

      // Pick a random query particle
      const qi = Math.floor(rng() * N);
      const px = xArr[qi];
      const py = yArr[qi];

      // Grid query
      const gridResult: number[] = [];
      grid.queryRadius(px, py, RADIUS, xArr, yArr, N, (idx) => {
        gridResult.push(idx);
      });
      gridResult.sort((a, b) => a - b);

      // Brute force
      const bruteResult = bruteForceNeighbors(px, py, RADIUS, xArr, yArr, N);

      // Must match exactly
      expect(gridResult).toEqual(bruteResult);
    }
  });

  it('matches brute-force for large world (500 particles, 50 trials)', () => {
    const rng = createRng(99999);
    const N = 500;
    const RADIUS = 60;

    for (let trial = 0; trial < 50; trial++) {
      const xArr = new Float32Array(N);
      const yArr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        xArr[i] = rng() * W;
        yArr[i] = rng() * H;
      }

      const grid = makeGrid(RADIUS, N);
      grid.clear();
      for (let i = 0; i < N; i++) {
        grid.insert(i, xArr[i], yArr[i]);
      }

      const qi = Math.floor(rng() * N);

      const gridResult: number[] = [];
      grid.queryRadius(xArr[qi], yArr[qi], RADIUS, xArr, yArr, N, (idx) => {
        gridResult.push(idx);
      });
      gridResult.sort((a, b) => a - b);

      const bruteResult = bruteForceNeighbors(xArr[qi], yArr[qi], RADIUS, xArr, yArr, N);
      expect(gridResult).toEqual(bruteResult);
    }
  });

  // ─── Correctness with World integration ────────────────────

  it('finds neighbors correctly after simulation steps', () => {
    const cfg = defaultConfig({ seed: 777 });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(world.width, world.height, 100, world.count);

    // Step a few times
    for (let i = 0; i < 100; i++) {
      world.step(1 / 60);
    }

    grid.rebuild(world);

    // Verify against brute force for several particles
    const rng = createRng(777);
    for (let t = 0; t < 20; t++) {
      const qi = Math.floor(rng() * world.count);

      const gridResult: number[] = [];
      grid.queryRadius(world.x[qi], world.y[qi], 100, world.x, world.y, world.count, (idx) => {
        gridResult.push(idx);
      });
      gridResult.sort((a, b) => a - b);

      const bruteResult = bruteForceNeighbors(
        world.x[qi],
        world.y[qi],
        100,
        world.x,
        world.y,
        world.count,
      );
      expect(gridResult).toEqual(bruteResult);
    }
  });
});

// ─── InteractionMatrix ─────────────────────────────────────────

describe('InteractionMatrix', () => {
  it('creates NxN matrix initialized to null', () => {
    const m = new InteractionMatrix(3);
    expect(m.numTypes).toBe(3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(m.get(i, j)).toBeNull();
      }
    }
  });

  it('stores and retrieves entries', () => {
    const m = new InteractionMatrix(2);
    const entry: InteractionEntry = { strength: 100, radius: 50, falloff: 'linear' };
    m.set(0, 1, entry);
    const got = m.get(0, 1);
    expect(got).not.toBeNull();
    expect(got!.strength).toBe(100);
    expect(got!.radius).toBe(50);
    expect(got!.falloff).toBe('linear');
  });

  it('supports asymmetric entries (A→B ≠ B→A)', () => {
    const m = new InteractionMatrix(2);
    m.set(0, 1, { strength: 100, radius: 50, falloff: 'linear' }); // A chases B
    m.set(1, 0, { strength: -80, radius: 40, falloff: 'inverse' }); // B flees A
    const aToB = m.get(0, 1)!;
    const bToA = m.get(1, 0)!;
    expect(aToB.strength).toBe(100);
    expect(bToA.strength).toBe(-80);
    expect(aToB.radius).toBe(50);
    expect(bToA.radius).toBe(40);
    expect(aToB.falloff).toBe('linear');
    expect(bToA.falloff).toBe('inverse');
  });

  describe('forceAtDistance', () => {
    it('returns 0 when distance >= radius', () => {
      const entry: InteractionEntry = { strength: 100, radius: 50, falloff: 'linear' };
      expect(InteractionMatrix.forceAtDistance(entry, 50)).toBe(0);
      expect(InteractionMatrix.forceAtDistance(entry, 60)).toBe(0);
    });

    it('returns 0 when distance <= 0', () => {
      const entry: InteractionEntry = { strength: 100, radius: 50, falloff: 'linear' };
      expect(InteractionMatrix.forceAtDistance(entry, 0)).toBe(0);
      expect(InteractionMatrix.forceAtDistance(entry, -5)).toBe(0);
    });

    it('linear falloff: force = strength * (1 - d/r)', () => {
      const entry: InteractionEntry = { strength: 100, radius: 100, falloff: 'linear' };
      expect(InteractionMatrix.forceAtDistance(entry, 0)).toBeCloseTo(0, 3); // d=0 excluded
      expect(InteractionMatrix.forceAtDistance(entry, 25)).toBeCloseTo(75, 3);
      expect(InteractionMatrix.forceAtDistance(entry, 50)).toBeCloseTo(50, 3);
      expect(InteractionMatrix.forceAtDistance(entry, 75)).toBeCloseTo(25, 3);
    });

    it('inverse falloff: force = strength / (d/r + 0.1)', () => {
      const entry: InteractionEntry = { strength: 100, radius: 100, falloff: 'inverse' };
      const d = 50;
      const expected = 100 / (0.5 + 0.1); // 100/0.6 ≈ 166.67
      expect(InteractionMatrix.forceAtDistance(entry, d)).toBeCloseTo(expected, 2);
    });

    it('constant falloff: force = strength regardless of distance', () => {
      const entry: InteractionEntry = { strength: 100, radius: 100, falloff: 'constant' };
      expect(InteractionMatrix.forceAtDistance(entry, 10)).toBeCloseTo(100, 3);
      expect(InteractionMatrix.forceAtDistance(entry, 50)).toBeCloseTo(100, 3);
      expect(InteractionMatrix.forceAtDistance(entry, 99)).toBeCloseTo(100, 3);
    });

    it('negative strength produces repulsive force', () => {
      const entry: InteractionEntry = { strength: -200, radius: 50, falloff: 'constant' };
      expect(InteractionMatrix.forceAtDistance(entry, 25)).toBe(-200);
    });
  });
});

// ─── PairwiseForce ──────────────────────────────────────────────

describe('PairwiseForce', () => {
  const W = 800,
    H = 600;

  function twoParticleWorld(
    typeA: number,
    typeB: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    maxSpeed = 200,
  ): { world: World; grid: SpatialHashGrid } {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed },
      ],
    };
    // If only one type, adjust
    if (typeA === typeB) {
      cfg.types = [{ count: 2, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed }];
    }
    const world = new World(cfg);
    // Override positions (deterministic seed doesn't matter here)
    world.x[0] = x0;
    world.y[0] = y0;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = x1;
    world.y[1] = y1;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);
    return { world, grid };
  }

  // ─── AC1: N×N interaction matrix ──────────────────────────────

  it('applies attraction via interaction matrix (analytic two-particle)', () => {
    // Two particles at distance 20, attraction strength 1000, radius 50, linear
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 120, 300);
    const matrix = new InteractionMatrix(2);
    // Type 0 is attracted to type 1
    matrix.set(0, 1, { strength: 1000, radius: 50, falloff: 'linear' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Particle 0 should have gained velocity toward particle 1 (positive x direction)
    expect(world.vx[0]).toBeGreaterThan(0);
    expect(world.vy[0]).toBeCloseTo(0, 5);

    // Analytic: force = strength * (1 - d/r) = 1000 * (1 - 20/50) = 1000 * 0.6 = 600
    // dv = force * dt = 600 * 1/60 = 10
    expect(world.vx[0]).toBeCloseTo(10, 1);
  });

  it('applies repulsion via interaction matrix (negative strength)', () => {
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 120, 300);
    const matrix = new InteractionMatrix(2);
    // Type 0 is repelled by type 1
    matrix.set(0, 1, { strength: -1000, radius: 50, falloff: 'linear' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Particle 0 should have velocity AWAY from particle 1 (negative x)
    expect(world.vx[0]).toBeLessThan(0);
  });

  // ─── AC2: Asymmetric interactions ─────────────────────────────

  it('asymmetric: A chases B, B flees A', () => {
    // Two particles: type 0 (predator) at x=100, type 1 (prey) at x=120
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 120, 300);
    const matrix = new InteractionMatrix(2);

    // Predator (type 0) is attracted to prey (type 1) → chases
    matrix.set(0, 1, { strength: 1000, radius: 50, falloff: 'linear' });
    // Prey (type 1) is repelled by predator (type 0) → flees
    matrix.set(1, 0, { strength: -800, radius: 50, falloff: 'linear' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Predator (0) should move toward prey (positive x) — chasing
    expect(world.vx[0]).toBeGreaterThan(0);
    // Prey (1) should move away from predator (positive x, further away) — fleeing
    expect(world.vx[1]).toBeGreaterThan(0);

    // The forces are asymmetric: predator is attracted, prey is repelled
    // Both move in same direction but for different reasons
    // Predator: attracted toward prey at +x → vx[0] > 0
    // Prey: repelled from predator at -x → vx[1] > 0
  });

  it('asymmetric interaction does not affect same-type pairs (no self-interaction set)', () => {
    const { world, grid } = twoParticleWorld(0, 0, 100, 300, 120, 300);
    const matrix = new InteractionMatrix(1);
    // No entries set — no interaction

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    force.apply(world, grid, 1 / 60);

    // No forces applied → velocities stay at 0
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
    expect(world.vx[1]).toBe(0);
    expect(world.vy[1]).toBe(0);
  });

  // ─── AC3: Universal short-range repulsion ─────────────────────

  it('short-range repulsion prevents particle collapse', () => {
    // Two particles very close (distance 2), with strong repulsion
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 102, 300);
    const matrix = new InteractionMatrix(2);
    // Attraction that would collapse particles
    matrix.set(0, 1, { strength: 1000, radius: 50, falloff: 'constant' });

    // Repulsion with radius 8 will kick in at distance 2
    const force = new PairwiseForce(matrix, { strength: 5000, radius: 8 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Particle 0 should be pushed AWAY from particle 1 (net repulsion wins)
    // At distance 2: repulsion = 5000 * (1 - 2/8) = 5000 * 0.75 = 3750
    // Attraction = 1000 (constant)
    // Net on particle 0 = 1000 (attract toward) - 3750 (repel away) = -2750
    expect(world.vx[0]).toBeLessThan(0);
  });

  it('repulsion has linear falloff: zero at repulsion radius', () => {
    // Two particles at exactly repulsion radius — repulsion should be ~0
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 108, 300);
    const matrix = new InteractionMatrix(2);
    // No interaction, only repulsion at radius 8
    const force = new PairwiseForce(matrix, { strength: 5000, radius: 8 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Distance = 8, which is exactly repulsion.radius → repForce = 5000 * (1-1) = 0
    expect(world.vx[0]).toBeCloseTo(0, 3);
    expect(world.vx[1]).toBeCloseTo(0, 3);
  });

  it('repulsion is stronger at closer distances', () => {
    const dt = 1 / 60;
    const repulsion = { strength: 5000, radius: 8 };

    // Close pair (distance 1)
    const { world: closeWorld, grid: closeGrid } = twoParticleWorld(0, 1, 100, 300, 101, 300);
    const closeForce = new PairwiseForce(new InteractionMatrix(2), repulsion);
    closeForce.apply(closeWorld, closeGrid, dt);
    const closeVx = Math.abs(closeWorld.vx[0]);

    // Far pair (distance 4)
    const { world: farWorld, grid: farGrid } = twoParticleWorld(0, 1, 100, 300, 104, 300);
    const farForce = new PairwiseForce(new InteractionMatrix(2), repulsion);
    farForce.apply(farWorld, farGrid, dt);
    const farVx = Math.abs(farWorld.vx[0]);

    // Closer particles should have stronger repulsion
    expect(closeVx).toBeGreaterThan(farVx);
  });

  // ─── AC4: Analytic two-particle tests ─────────────────────────

  it('analytic: two particles on x-axis, known force magnitude', () => {
    const dist = 30;
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 100 + dist, 300);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 600, radius: 60, falloff: 'linear' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // force = strength * (1 - d/r) = 600 * (1 - 30/60) = 600 * 0.5 = 300
    // dv = force * dt = 300 * 1/60 = 5
    expect(world.vx[0]).toBeCloseTo(5, 2);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('analytic: two particles on y-axis, known force magnitude', () => {
    const dist = 25;
    const { world, grid } = twoParticleWorld(0, 1, 400, 200, 400, 200 + dist);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 900, radius: 50, falloff: 'linear' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // force = 900 * (1 - 25/50) = 900 * 0.5 = 450
    // dv = 450 * 1/60 = 7.5
    expect(world.vy[0]).toBeCloseTo(7.5, 2);
    expect(world.vx[0]).toBeCloseTo(0, 5);
  });

  it('analytic: two particles diagonal, force direction correct', () => {
    const { world, grid } = twoParticleWorld(0, 1, 200, 200, 230, 230);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 1000, radius: 100, falloff: 'constant' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Distance ≈ 42.43, direction = (1/√2, 1/√2)
    // force = 1000 (constant), dv = 1000/60 ≈ 16.67
    // vx = 16.67 * (30/42.43) ≈ 11.79
    // vy = 16.67 * (30/42.43) ≈ 11.79
    expect(world.vx[0]).toBeGreaterThan(0);
    expect(world.vy[0]).toBeGreaterThan(0);
    // Should be equal (diagonal)
    expect(world.vx[0]).toBeCloseTo(world.vy[0], 3);
  });

  // ─── AC5: Asymmetry test: chase/flee scenario ─────────────────

  it('chase/flee: predator accelerates toward prey, prey accelerates away', () => {
    // 3 types: predator (0), prey (1), neutral (2)
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }, // predator
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 200 }, // prey
        { count: 1, color: '#00f', radius: 3, initialSpeed: 0, maxSpeed: 200 }, // neutral
      ],
    };
    const world = new World(cfg);

    // Position them: predator at left, prey at center, neutral far right
    world.x[0] = 100;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = 150;
    world.y[1] = 300;
    world.vx[1] = 0;
    world.vy[1] = 0;
    world.x[2] = 700;
    world.y[2] = 300;
    world.vx[2] = 0;
    world.vy[2] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const matrix = new InteractionMatrix(3);
    // Predator chases prey
    matrix.set(0, 1, { strength: 1000, radius: 100, falloff: 'linear' });
    // Prey flees predator
    matrix.set(1, 0, { strength: -600, radius: 80, falloff: 'linear' });
    // Neutral has no interactions

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const dt = 1 / 60;
    force.apply(world, grid, dt);

    // Predator (0) should move toward prey → positive x
    expect(world.vx[0]).toBeGreaterThan(0);
    // Prey (1) should flee from predator → positive x (away from predator at -x)
    expect(world.vx[1]).toBeGreaterThan(0);
    // Neutral (2) should be unaffected
    expect(world.vx[2]).toBeCloseTo(0, 5);
    expect(world.vy[2]).toBeCloseTo(0, 5);
  });

  it('3x3 matrix: each pair gets its own interaction', () => {
    // 3 types, 9 entries
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 200 },
        { count: 1, color: '#00f', radius: 3, initialSpeed: 0, maxSpeed: 200 },
      ],
    };
    const world = new World(cfg);

    // Arrange in a line: 0 at x=100, 1 at x=130, 2 at x=160
    world.x[0] = 100;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = 130;
    world.y[1] = 300;
    world.vx[1] = 0;
    world.vy[1] = 0;
    world.x[2] = 160;
    world.y[2] = 300;
    world.vx[2] = 0;
    world.vy[2] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const matrix = new InteractionMatrix(3);
    // 0→1: strong attract, 0→2: weak attract
    matrix.set(0, 1, { strength: 1000, radius: 50, falloff: 'constant' });
    matrix.set(0, 2, { strength: 100, radius: 50, falloff: 'constant' });
    // 1→0: repel, 1→2: attract
    matrix.set(1, 0, { strength: -500, radius: 50, falloff: 'constant' });
    matrix.set(1, 2, { strength: 800, radius: 50, falloff: 'constant' });
    // 2→0: repel, 2→1: repel
    matrix.set(2, 0, { strength: -200, radius: 50, falloff: 'constant' });
    matrix.set(2, 1, { strength: -300, radius: 50, falloff: 'constant' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    force.apply(world, grid, 1 / 60);

    // Particle 0: attracted to both 1 (1000, +x) and 2 (100, +x) → net +x
    expect(world.vx[0]).toBeGreaterThan(0);
    // Particle 1: repelled by 0 (-500, pushes away from 0 which is at -x → +x)
    //              + attracted to 2 (800, +x toward 2) → net +x
    expect(world.vx[1]).toBeGreaterThan(0);
    // Particle 2: repelled by 0 (-200) + repelled by 1 (-300).
    // Both 0 and 1 are to the LEFT of 2, so "repel from them" = push RIGHT (+x)
    expect(world.vx[2]).toBeGreaterThan(0);
  });

  // ─── Integration: pairwise force in simulation loop ───────────

  it('pairwise force integrated with simulation steps', () => {
    const cfg = defaultConfig({ seed: 42 });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(world.width, world.height, 100, world.count);

    const matrix = new InteractionMatrix(3);
    // Type 0 attracted to type 1
    matrix.set(0, 1, { strength: 500, radius: 80, falloff: 'linear' });
    // Type 1 repelled by type 0
    matrix.set(1, 0, { strength: -300, radius: 60, falloff: 'linear' });
    // Type 2 neutral

    const force = new PairwiseForce(matrix, { strength: 1000, radius: 5 });
    const dt = 1 / 60;

    // Run 100 steps with force application
    for (let step = 0; step < 100; step++) {
      grid.rebuild(world);
      force.apply(world, grid, dt);
      world.step(dt);
    }

    // Should not have exploded (positions stay in bounds due to bounce)
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThanOrEqual(world.width);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThanOrEqual(world.height);
    }

    // Simulation time should be ~100/60 ≈ 1.67s
    expect(world.simTime).toBeGreaterThan(1);
  });

  // ─── Edge cases ───────────────────────────────────────────────

  it('no forces when no matrix entries and no repulsion', () => {
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 105, 300);
    const matrix = new InteractionMatrix(2);
    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    force.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
    expect(world.vx[1]).toBe(0);
    expect(world.vy[1]).toBe(0);
  });

  it('particles beyond interaction radius are unaffected', () => {
    const { world, grid } = twoParticleWorld(0, 1, 100, 300, 500, 300);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 10000, radius: 50, falloff: 'constant' });

    const force = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    force.apply(world, grid, 1 / 60);

    // Distance = 400, interaction radius = 50 → no force
    expect(world.vx[0]).toBe(0);
    expect(world.vx[1]).toBe(0);
  });

  it('DEFAULT_REPULSION has expected values', () => {
    expect(DEFAULT_REPULSION.strength).toBe(500);
    expect(DEFAULT_REPULSION.radius).toBe(8);
  });
});

// ─── CRT-5: Force Interface, DragForce, GravityForce, ForcePipeline ──

describe('Force Interface', () => {
  it('Force type is satisfied by DragForce', () => {
    const drag: Force = new DragForce(1.0);
    expect(drag.id).toBe('drag');
    expect(drag.params.coefficient).toBe(1.0);
  });

  it('Force type is satisfied by GravityForce', () => {
    const gravity: Force = new GravityForce(200);
    expect(gravity.id).toBe('gravity');
    expect(gravity.params.acceleration).toBe(200);
  });

  it('Force type is satisfied by BoundaryForce', () => {
    const boundary: Force = new BoundaryForce('bounce');
    expect(boundary.id).toBe('boundary');
    expect(boundary.params.mode).toBe('bounce');
  });
});

// ─── DragForce ──────────────────────────────────────────────────

describe('DragForce', () => {
  const W = 800,
    H = 600;

  function makeWorld(velocity = 100): { world: World; grid: SpatialHashGrid } {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    world.vx[0] = velocity;
    world.vy[0] = 0;
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);
    return { world, grid };
  }

  it('reduces velocity by factor (1 - coefficient * dt)', () => {
    const { world, grid } = makeWorld(100);
    const drag = new DragForce(2.0); // coefficient = 2.0
    const dt = 1 / 60;

    drag.apply(world, grid, dt);

    // factor = 1 - 2.0 * (1/60) = 1 - 0.0333... ≈ 0.9667
    // vx = 100 * 0.9667 ≈ 96.67
    const factor = 1 - 2.0 * dt;
    expect(world.vx[0]).toBeCloseTo(100 * factor, 5);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('applies to both vx and vy', () => {
    const { world, grid } = makeWorld(0);
    world.vx[0] = 60;
    world.vy[0] = 80;
    const drag = new DragForce(1.0);
    const dt = 1 / 60;

    drag.apply(world, grid, dt);

    const factor = 1 - 1.0 * dt;
    expect(world.vx[0]).toBeCloseTo(60 * factor, 5);
    expect(world.vy[0]).toBeCloseTo(80 * factor, 5);
  });

  it('analytic: velocity after N steps matches exponential decay', () => {
    const { world, grid } = makeWorld(100);
    const drag = new DragForce(3.0);
    const dt = 1 / 60;

    // Apply 60 times (= 1 second of simulation)
    for (let i = 0; i < 60; i++) {
      drag.apply(world, grid, dt);
    }

    // After time T=1s: v = v0 * (1 - coeff*dt)^steps = 100 * (1 - 3/60)^60
    // = 100 * (0.95)^60 ≈ 100 * 0.04607 ≈ 4.607
    // Equivalent to e^(-3 * 1) ≈ e^(-3) ≈ 0.04979 → 4.979
    // Using discrete: 100 * 0.95^60
    const expected = 100 * Math.pow(1 - 3.0 / 60, 60);
    expect(world.vx[0]).toBeCloseTo(expected, 2);
  });

  it('zero drag coefficient does not change velocity', () => {
    const { world, grid } = makeWorld(100);
    const drag = new DragForce(0);
    drag.apply(world, grid, 1 / 60);
    expect(world.vx[0]).toBeCloseTo(100, 5);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('high drag with large dt clamps to zero (no velocity inversion)', () => {
    const { world, grid } = makeWorld(100);
    const drag = new DragForce(1000); // very high drag
    drag.apply(world, grid, 1); // dt = 1 second

    // factor = 1 - 1000 * 1 = -999 → clamped to 0
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('preserves velocity direction (only reduces magnitude)', () => {
    const { world, grid } = makeWorld(0);
    world.vx[0] = 300;
    world.vy[0] = 400;
    const drag = new DragForce(1.0);

    drag.apply(world, grid, 1 / 60);

    // Direction ratio should be preserved (3:4)
    const ratio = world.vx[0] / world.vy[0];
    expect(ratio).toBeCloseTo(0.75, 5);
  });

  it('applies to all particles in world', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, world.count);
    grid.rebuild(world);

    // Record speeds before
    const speedsBefore: number[] = [];
    for (let i = 0; i < world.count; i++) {
      speedsBefore.push(Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2));
    }

    const drag = new DragForce(2.0);
    drag.apply(world, grid, 1 / 60);

    const factor = 1 - 2.0 / 60;
    for (let i = 0; i < world.count; i++) {
      const speedAfter = Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
      expect(speedAfter).toBeCloseTo(speedsBefore[i] * factor, 3);
    }
  });

  it('default coefficient is 1.0', () => {
    const drag = new DragForce();
    expect(drag.params.coefficient).toBe(1.0);
  });

  it('id is "drag"', () => {
    expect(new DragForce().id).toBe('drag');
  });
});

// ─── GravityForce ───────────────────────────────────────────────

describe('GravityForce', () => {
  const W = 800,
    H = 600;

  function makeWorld(): { world: World; grid: SpatialHashGrid } {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    world.vx[0] = 50;
    world.vy[0] = 0;
    world.x[0] = 400;
    world.y[0] = 300;
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);
    return { world, grid };
  }

  it('increases vy by acceleration * dt', () => {
    const { world, grid } = makeWorld();
    const gravity = new GravityForce(200);
    const dt = 1 / 60;

    gravity.apply(world, grid, dt);

    // dv = 200 * 1/60 ≈ 3.333
    expect(world.vy[0]).toBeCloseTo(200 / 60, 5);
    // vx should be unchanged
    expect(world.vx[0]).toBe(50);
  });

  it('analytic: velocity after N steps equals acceleration * T', () => {
    const { world, grid } = makeWorld();
    const gravity = new GravityForce(300);
    const dt = 1 / 60;

    // Apply 60 times (= 1 second)
    for (let i = 0; i < 60; i++) {
      gravity.apply(world, grid, dt);
    }

    // vy should be 300 * 1 = 300 (accumulated over 1 second)
    expect(world.vy[0]).toBeCloseTo(300, 2);
  });

  it('negative acceleration produces upward force (anti-gravity)', () => {
    const { world, grid } = makeWorld();
    const gravity = new GravityForce(-200);
    gravity.apply(world, grid, 1 / 60);

    // Should decrease vy (push upward)
    expect(world.vy[0]).toBeLessThan(0);
  });

  it('zero acceleration does not change velocity', () => {
    const { world, grid } = makeWorld();
    const gravity = new GravityForce(0);
    gravity.apply(world, grid, 1 / 60);

    expect(world.vy[0]).toBe(0);
    expect(world.vx[0]).toBe(50);
  });

  it('does not modify vx', () => {
    const { world, grid } = makeWorld();
    const vxBefore = world.vx[0];
    const gravity = new GravityForce(500);
    gravity.apply(world, grid, 1 / 60);
    expect(world.vx[0]).toBe(vxBefore);
  });

  it('applies to all particles equally', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 10, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, world.count);
    grid.rebuild(world);

    const gravity = new GravityForce(200);
    const dt = 1 / 60;
    gravity.apply(world, grid, dt);

    const expectedDv = 200 / 60;
    for (let i = 0; i < world.count; i++) {
      expect(world.vy[i]).toBeCloseTo(expectedDv, 5);
    }
  });

  it('default acceleration is 200', () => {
    const gravity = new GravityForce();
    expect(gravity.params.acceleration).toBe(200);
  });

  it('id is "gravity"', () => {
    expect(new GravityForce().id).toBe('gravity');
  });
});

// ─── BoundaryForce ──────────────────────────────────────────────

describe('BoundaryForce', () => {
  const W = 800,
    H = 600;

  it('applies bounce boundaries via force pipeline', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    world.x[0] = -10;
    world.vx[0] = -50;

    const boundary = new BoundaryForce('bounce');
    boundary.apply(world, grid, 1 / 60);

    expect(world.x[0]).toBe(10);
    // Soft boundary repulsion adds impulse: (1 - 10/30)² * BOUNCE_REPULSION
    expect(world.vx[0]).toBeCloseTo(50 + (1 - 10 / 30) ** 2 * World.BOUNCE_REPULSION, 3);
  });

  it('applies wrap boundaries via force pipeline', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'wrap',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    world.x[0] = 810;
    const boundary = new BoundaryForce('wrap');
    boundary.apply(world, grid, 1 / 60);

    expect(world.x[0]).toBeCloseTo(10, 3);
  });

  it('id is "boundary"', () => {
    expect(new BoundaryForce().id).toBe('boundary');
  });
});

// ─── ForcePipeline ──────────────────────────────────────────────

describe('ForcePipeline', () => {
  const W = 800,
    H = 600;

  it('applies forces in order', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 500 }],
    };
    const world = new World(cfg);
    world.x[0] = 400;
    world.y[0] = 300;
    world.vx[0] = 100;
    world.vy[0] = 0;
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const pipeline = new ForcePipeline();
    const drag = new DragForce(1.0);
    const gravity = new GravityForce(200);
    pipeline.add(drag);
    pipeline.add(gravity);

    const dt = 1 / 60;
    const count = pipeline.step(world, grid, dt);

    expect(count).toBe(2);
    // After drag: vx = 100 * (1 - 1/60) ≈ 98.33
    const dragFactor = 1 - 1.0 * dt;
    expect(world.vx[0]).toBeCloseTo(100 * dragFactor, 3);
    // After gravity: vy = 0 + 200/60 ≈ 3.333
    expect(world.vy[0]).toBeCloseTo(200 / 60, 3);
  });

  it('add and remove forces', () => {
    const pipeline = new ForcePipeline();
    pipeline.add(new DragForce());
    pipeline.add(new GravityForce());

    expect(pipeline.forces).toHaveLength(2);
    expect(pipeline.get('drag')).toBeDefined();
    expect(pipeline.get('gravity')).toBeDefined();

    const removed = pipeline.remove('drag');
    expect(removed).toBe(true);
    expect(pipeline.forces).toHaveLength(1);
    expect(pipeline.get('drag')).toBeUndefined();

    // Removing non-existent returns false
    expect(pipeline.remove('nonexistent')).toBe(false);
  });

  it('empty pipeline does nothing', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    };
    const world = new World(cfg);
    world.vx[0] = 100;
    world.vy[0] = 50;
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const pipeline = new ForcePipeline();
    const count = pipeline.step(world, grid, 1 / 60);

    expect(count).toBe(0);
    expect(world.vx[0]).toBe(100);
    expect(world.vy[0]).toBe(50);
  });

  it('full simulation loop with pipeline: pairwise + drag + gravity + boundaries', () => {
    const cfg = defaultConfig({ seed: 42 });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(world.width, world.height, 100, world.count);

    const matrix = new InteractionMatrix(3);
    matrix.set(0, 1, { strength: 500, radius: 80, falloff: 'linear' });
    matrix.set(1, 0, { strength: -300, radius: 60, falloff: 'linear' });

    const pipeline = new ForcePipeline();
    const pairwise = new PairwiseForce(matrix, { strength: 1000, radius: 5 });
    pipeline.add(new DragForce(0.5));
    pipeline.add(new GravityForce(100));
    pipeline.add(new BoundaryForce('bounce'));

    const dt = 1 / 60;

    // Run 200 steps
    for (let step = 0; step < 200; step++) {
      grid.rebuild(world);
      pairwise.apply(world, grid, dt); // pairwise doesn't implement Force yet
      pipeline.step(world, grid, dt);
      world.step(dt);
    }

    // All particles should stay in bounds (bounce mode)
    for (let i = 0; i < world.count; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThanOrEqual(world.width);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThanOrEqual(world.height);
    }

    // Simulation time should have advanced
    expect(world.simTime).toBeGreaterThan(3);

    // Drag should have slowed particles (speeds bounded)
    for (let i = 0; i < world.count; i++) {
      const speed = Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
      // With drag and gravity, speeds shouldn't be astronomical
      expect(speed).toBeLessThan(500);
    }
  });

  it('pipeline with gravity + drag reaches terminal velocity', () => {
    const cfg: SimulationConfig = {
      width: W,
      height: H,
      boundaryMode: 'bounce',
      seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 10000 }],
    };
    const world = new World(cfg);
    world.x[0] = 400;
    world.y[0] = 300;
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const pipeline = new ForcePipeline();
    const gravityAcc = 200;
    const dragCoeff = 2.0;
    pipeline.add(new GravityForce(gravityAcc));
    pipeline.add(new DragForce(dragCoeff));

    const dt = 1 / 60;

    // Run until near terminal velocity
    for (let step = 0; step < 600; step++) {
      // 10 seconds
      pipeline.step(world, grid, dt);
      // Keep particle in bounds for testing
      if (world.y[0] > world.height) {
        world.y[0] = world.height;
        world.vy[0] = 0;
      }
    }

    // Terminal velocity = gravity / drag_coefficient = 200 / 2.0 = 100
    // vy should be close to terminal velocity
    expect(world.vy[0]).toBeGreaterThan(80);
    expect(world.vy[0]).toBeLessThan(120);
  });
});

// ═══════════════════════════════════════════════════════════════
// CRT-6: WanderForce, FlowFieldForce, VortexForce
// ═══════════════════════════════════════════════════════════════

const W = 800;
const H = 600;

describe('WanderForce', () => {
  it('implements Force interface', () => {
    const wf = new WanderForce();
    expect(wf.id).toBe('wander');
    expect(wf.params).toHaveProperty('strength');
    expect(wf.params).toHaveProperty('rate');
    expect(typeof wf.apply).toBe('function');
  });

  it('changes particle velocities over time', () => {
    const cfg = defaultConfig({
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const wander = new WanderForce(100, 3);
    const dt = 1 / 60;

    // Snapshot initial velocities
    const vx0 = new Float32Array(world.vx);
    const vy0 = new Float32Array(world.vy);

    // Run 60 steps (1 second)
    for (let i = 0; i < 60; i++) {
      wander.apply(world, grid, dt);
      world.step(dt);
    }

    // At least some particles should have changed velocity
    let changed = 0;
    for (let i = 0; i < world.count; i++) {
      if (Math.abs(world.vx[i] - vx0[i]) > 0.1 || Math.abs(world.vy[i] - vy0[i]) > 0.1) {
        changed++;
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('higher strength produces larger velocity changes', () => {
    const makeWorld = () => {
      const cfg = defaultConfig({
        seed: 42,
        types: [{ count: 10, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 500 }],
      });
      return new World(cfg);
    };

    const grid = new SpatialHashGrid(W, H, 100, 20);
    const w1 = makeWorld();
    const w2 = makeWorld();
    const g1 = new SpatialHashGrid(W, H, 100, 20);
    const g2 = new SpatialHashGrid(W, H, 100, 20);
    g1.rebuild(w1);
    g2.rebuild(w2);

    const weak = new WanderForce(10, 3);
    const strong = new WanderForce(200, 3);
    const dt = 1 / 60;

    for (let i = 0; i < 60; i++) {
      weak.apply(w1, g1, dt);
      strong.apply(w2, g2, dt);
      w1.step(dt);
      w2.step(dt);
    }

    // Strong wander should produce more speed on average
    let totalSpeed1 = 0,
      totalSpeed2 = 0;
    for (let i = 0; i < 10; i++) {
      totalSpeed1 += Math.sqrt(w1.vx[i] ** 2 + w1.vy[i] ** 2);
      totalSpeed2 += Math.sqrt(w2.vx[i] ** 2 + w2.vy[i] ** 2);
    }
    expect(totalSpeed2).toBeGreaterThan(totalSpeed1);
  });

  it('produces smooth motion (no discontinuous jumps)', () => {
    const cfg = defaultConfig({
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const wander = new WanderForce(80, 3);
    const dt = 1 / 60;

    // Track velocity changes per step
    let maxDeltaV = 0;
    for (let step = 0; step < 300; step++) {
      const prevVx = new Float32Array(world.vx);
      const prevVy = new Float32Array(world.vy);

      wander.apply(world, grid, dt);

      for (let i = 0; i < world.count; i++) {
        const dvx = Math.abs(world.vx[i] - prevVx[i]);
        const dvy = Math.abs(world.vy[i] - prevVy[i]);
        const delta = Math.sqrt(dvx * dvx + dvy * dvy);
        if (delta > maxDeltaV) maxDeltaV = delta;
      }

      world.step(dt);
    }

    // Max velocity change per step should be bounded
    // With strength=80, rate=3, dt=1/60: max noise contribution ≈ 80 * 1 * (1/60) ≈ 1.33
    expect(maxDeltaV).toBeLessThan(5);
  });

  it('different particles wander independently', () => {
    const cfg = defaultConfig({
      seed: 42,
      types: [{ count: 10, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 20);
    grid.rebuild(world);

    const wander = new WanderForce(80, 3);
    const dt = 1 / 60;

    for (let i = 0; i < 120; i++) {
      wander.apply(world, grid, dt);
      world.step(dt);
    }

    // Check that not all particles have the same velocity (they wander independently)
    let sameVelocity = true;
    for (let i = 1; i < world.count; i++) {
      if (
        Math.abs(world.vx[i] - world.vx[0]) > 0.01 ||
        Math.abs(world.vy[i] - world.vy[0]) > 0.01
      ) {
        sameVelocity = false;
        break;
      }
    }
    expect(sameVelocity).toBe(false);
  });

  it('zero strength produces no velocity change', () => {
    const cfg = defaultConfig({
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const wander = new WanderForce(0, 3);
    const prevVx = new Float32Array(world.vx);
    const prevVy = new Float32Array(world.vy);

    wander.apply(world, grid, 1 / 60);

    for (let i = 0; i < world.count; i++) {
      expect(world.vx[i]).toBeCloseTo(prevVx[i], 5);
      expect(world.vy[i]).toBeCloseTo(prevVy[i], 5);
    }
  });

  it('default constructor values', () => {
    const wander = new WanderForce();
    expect(wander.params.strength).toBe(80);
    expect(wander.params.rate).toBe(3);
  });

  it('handles capacity growth correctly', () => {
    // Start with small world, then verify wander works with larger world
    const cfg1 = defaultConfig({
      types: [{ count: 3, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const w1 = new World(cfg1);
    const g1 = new SpatialHashGrid(W, H, 100, 10);
    g1.rebuild(w1);

    const wander = new WanderForce(80, 3);
    wander.apply(w1, g1, 1 / 60); // capacity grows to 3

    const cfg2 = defaultConfig({
      types: [{ count: 10, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
    });
    const w2 = new World(cfg2);
    const g2 = new SpatialHashGrid(W, H, 100, 20);
    g2.rebuild(w2);

    // Should grow capacity without errors
    expect(() => wander.apply(w2, g2, 1 / 60)).not.toThrow();
  });
});

describe('FlowFieldForce', () => {
  it('implements Force interface', () => {
    const ff = new FlowFieldForce();
    expect(ff.id).toBe('flow-field');
    expect(ff.params).toHaveProperty('strength');
    expect(ff.params).toHaveProperty('mode');
    expect(typeof ff.apply).toBe('function');
  });

  it('uniform mode pushes all particles in the same direction', () => {
    const cfg = defaultConfig({
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    // Place particles at known positions
    for (let i = 0; i < 5; i++) {
      world.x[i] = 100 + i * 100;
      world.y[i] = 300;
    }
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Push rightward (angle = 0)
    const flow = new FlowFieldForce(100, 'uniform', 0);
    flow.apply(world, grid, 1 / 60);

    // All particles should have positive vx, zero vy
    for (let i = 0; i < 5; i++) {
      expect(world.vx[i]).toBeGreaterThan(0);
      expect(world.vy[i]).toBeCloseTo(0, 5);
    }
  });

  it('uniform mode with angle π/2 pushes upward', () => {
    const cfg = defaultConfig({
      types: [{ count: 3, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const flow = new FlowFieldForce(100, 'uniform', Math.PI / 2);
    flow.apply(world, grid, 1 / 60);

    for (let i = 0; i < 3; i++) {
      expect(world.vy[i]).toBeGreaterThan(0);
      expect(world.vx[i]).toBeCloseTo(0, 5);
    }
  });

  it('turbulence mode produces different forces at different positions', () => {
    const cfg = defaultConfig({
      types: [{ count: 2, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    world.x[0] = 100;
    world.y[0] = 100;
    world.x[1] = 500;
    world.y[1] = 400;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const flow = new FlowFieldForce(100, 'turbulence', 0, 0.01);
    flow.apply(world, grid, 1 / 60);

    // Particles at different positions should get different forces
    const sameForce =
      Math.abs(world.vx[0] - world.vx[1]) < 0.001 && Math.abs(world.vy[0] - world.vy[1]) < 0.001;
    expect(sameForce).toBe(false);
  });

  it('custom flow field function', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    world.x[0] = 400;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const flow = new FlowFieldForce(100);
    // Custom field: always push in (+1, +1) direction
    flow.setCustomField((_x: number, _y: number) => [1, 1]);
    flow.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBeGreaterThan(0);
    expect(world.vy[0]).toBeGreaterThan(0);
  });

  it('custom field receives particle position', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    world.x[0] = 250;
    world.y[0] = 350;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    let receivedX = 0;
    let receivedY = 0;

    const flow = new FlowFieldForce(50);
    flow.setCustomField((x: number, y: number) => {
      receivedX = x;
      receivedY = y;
      return [1, 0];
    });
    flow.apply(world, grid, 1 / 60);

    expect(receivedX).toBe(250);
    expect(receivedY).toBe(350);
  });

  it('zero strength produces no velocity change', () => {
    const cfg = defaultConfig({
      types: [{ count: 3, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const flow = new FlowFieldForce(0, 'uniform', 0);
    const prevVx = new Float32Array(world.vx);
    const prevVy = new Float32Array(world.vy);

    flow.apply(world, grid, 1 / 60);

    for (let i = 0; i < 3; i++) {
      expect(world.vx[i]).toBeCloseTo(prevVx[i], 5);
      expect(world.vy[i]).toBeCloseTo(prevVy[i], 5);
    }
  });

  it('analytic force check: uniform angle = π pushes in -x direction', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const strength = 200;
    const dt = 1 / 60;
    const flow = new FlowFieldForce(strength, 'uniform', Math.PI);
    flow.apply(world, grid, dt);

    // cos(π) = -1, so vx should decrease by strength * dt
    const expectedDv = strength * dt;
    expect(world.vx[0]).toBeCloseTo(-expectedDv, 3);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('default constructor values', () => {
    const flow = new FlowFieldForce();
    expect(flow.params.strength).toBe(50);
    expect(flow.params.mode).toBe('uniform');
    expect(flow.params.angle).toBe(0);
  });

  it('unknown mode produces no force', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const flow = new FlowFieldForce(100, 'nonexistent' as string, 0);
    flow.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });
});

describe('VortexForce', () => {
  it('implements Force interface', () => {
    const vf = new VortexForce();
    expect(vf.id).toBe('vortex');
    expect(vf.params).toHaveProperty('cx');
    expect(vf.params).toHaveProperty('cy');
    expect(vf.params).toHaveProperty('strength');
    expect(vf.params).toHaveProperty('radialStrength');
    expect(vf.params).toHaveProperty('radius');
    expect(vf.params).toHaveProperty('falloff');
    expect(typeof vf.apply).toBe('function');
  });

  it('applies tangential force to nearby particle', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    // Place particle to the right of vortex center
    const cx = 400,
      cy = 300;
    world.x[0] = cx + 100; // 100 units to the right
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Positive strength = counter-clockwise
    const vortex = new VortexForce(cx, cy, 100, 0, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    // Particle is at (cx+100, cy). Tangential (CCW) direction at this point is (0, +1).
    // So vy should increase, vx should be ~0
    expect(world.vy[0]).toBeGreaterThan(0);
    expect(Math.abs(world.vx[0])).toBeLessThan(Math.abs(world.vy[0]) * 0.01); // essentially 0
  });

  it('analytic tangential force magnitude (constant falloff)', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300,
      dist = 50;
    world.x[0] = cx; // directly above center
    world.y[0] = cy - dist;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const strength = 300;
    const dt = 1 / 60;
    const vortex = new VortexForce(cx, cy, strength, 0, 200, 'constant');
    vortex.apply(world, grid, dt);

    // Particle at (cx, cy-50) → dx=0, dy=-50 → nx=0, ny=-1
    // Tangential (CCW): tx = -ny = 1, ty = nx = 0
    // So vx should increase by strength * dt
    const expectedDv = strength * dt;
    expect(world.vx[0]).toBeCloseTo(expectedDv, 3);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('analytic tangential force magnitude (linear falloff)', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300,
      radius = 200,
      dist = 80;
    world.x[0] = cx + dist; // to the right
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const strength = 300;
    const dt = 1 / 60;
    const vortex = new VortexForce(cx, cy, strength, 0, radius, 'linear');
    vortex.apply(world, grid, dt);

    // Linear falloff: (1 - 80/200) = 0.6
    // At (cx+80, cy): dx=80, dy=0 → nx=1, ny=0 → tangential = (0, 1)
    const expectedDv = strength * (1 - dist / radius) * dt;
    expect(world.vy[0]).toBeCloseTo(expectedDv, 3);
    expect(world.vx[0]).toBeCloseTo(0, 5);
  });

  it('particle beyond radius receives no force', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    world.x[0] = 400;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Vortex at (0, 0) with radius 50 — particle at (400,300) is way outside
    const vortex = new VortexForce(0, 0, 500, 0, 50, 'constant');
    vortex.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('particle at center receives no force', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    world.x[0] = 400;
    world.y[0] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const vortex = new VortexForce(400, 300, 500, 0, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('radial inward component pulls particles toward center', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300;
    world.x[0] = cx + 100; // 100 to the right
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Negative radialStrength = inward
    const vortex = new VortexForce(cx, cy, 0, -200, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    // Radial inward at (cx+100, cy): direction toward center = (-1, 0)
    expect(world.vx[0]).toBeLessThan(0);
  });

  it('radial outward component pushes particles away from center', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300;
    world.x[0] = cx + 100;
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Positive radialStrength = outward
    const vortex = new VortexForce(cx, cy, 0, 200, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    // Radial outward at (cx+100, cy): direction away from center = (+1, 0)
    expect(world.vx[0]).toBeGreaterThan(0);
  });

  it('spiral pattern with combined tangential + radial', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 500 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300;
    world.x[0] = cx + 80;
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // CCW rotation + inward pull = spiral inward
    const vortex = new VortexForce(cx, cy, 200, -100, 200, 'linear');
    const dt = 1 / 60;

    for (let step = 0; step < 60; step++) {
      vortex.apply(world, grid, dt);
      world.step(dt);
      grid.rebuild(world);
    }

    // After 1 second with inward radial, particle should be closer to center
    const finalDist = Math.sqrt((world.x[0] - cx) ** 2 + (world.y[0] - cy) ** 2);
    // Should have moved somewhat (spiral is happening)
    expect(finalDist).not.toBeCloseTo(80, 0);
  });

  it('inverse falloff produces stronger force near center', () => {
    const cfg = defaultConfig({
      types: [{ count: 2, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 10000 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300;
    // Particle A: close to center
    world.x[0] = cx + 20;
    world.y[0] = cy;
    // Particle B: far from center
    world.x[1] = cx + 150;
    world.y[1] = cy;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const vortex = new VortexForce(cx, cy, 100, 0, 200, 'inverse');
    vortex.apply(world, grid, 1 / 60);

    // Near particle should get more force (inverse falloff)
    expect(Math.abs(world.vy[0])).toBeGreaterThan(Math.abs(world.vy[1]));
  });

  it('negative strength produces clockwise rotation', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    const cx = 400,
      cy = 300;
    world.x[0] = cx + 100;
    world.y[0] = cy;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    // Negative = clockwise
    const vortex = new VortexForce(cx, cy, -100, 0, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    // CW rotation at (cx+100, cy): tangential should be (0, -1)
    expect(world.vy[0]).toBeLessThan(0);
  });

  it('zero strength and zero radial produce no force', () => {
    const cfg = defaultConfig({
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    const world = new World(cfg);

    world.x[0] = 450;
    world.y[0] = 300;

    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const vortex = new VortexForce(400, 300, 0, 0, 200, 'constant');
    vortex.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('default constructor values', () => {
    const vf = new VortexForce();
    expect(vf.params.cx).toBe(400);
    expect(vf.params.cy).toBe(300);
    expect(vf.params.strength).toBe(150);
    expect(vf.params.radialStrength).toBe(0);
    expect(vf.params.radius).toBe(300);
    expect(vf.params.falloff).toBe('linear');
  });
});

describe('CRT-6: Integration — Wander + FlowField + Vortex together', () => {
  it('pipeline with all three forces runs stably', () => {
    const cfg = defaultConfig({
      types: [
        { count: 50, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 200 },
        { count: 50, color: '#0f0', radius: 3, initialSpeed: 40, maxSpeed: 180 },
      ],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 200);
    grid.rebuild(world);

    const pipeline = new ForcePipeline();
    pipeline.add(new WanderForce(60, 2));
    pipeline.add(new FlowFieldForce(30, 'turbulence', 0, 0.01));
    pipeline.add(new VortexForce(400, 300, 80, -30, 300, 'linear'));
    pipeline.add(new DragForce(1.5));

    const dt = 1 / 60;
    for (let step = 0; step < 600; step++) {
      // 10 seconds
      pipeline.step(world, grid, dt);
      world.step(dt);
      grid.rebuild(world);
    }

    // All particles should still be within reasonable bounds
    expect(world.simTime).toBeGreaterThan(9);
    for (let i = 0; i < world.count; i++) {
      const speed = Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
      expect(speed).toBeLessThan(1000);
    }
  });

  it('wander + vortex produces orbiting + wandering behavior', () => {
    const cfg = defaultConfig({
      types: [{ count: 5, color: '#f00', radius: 3, initialSpeed: 30, maxSpeed: 200 }],
    });
    const world = new World(cfg);
    const grid = new SpatialHashGrid(W, H, 100, 10);
    grid.rebuild(world);

    const pipeline = new ForcePipeline();
    pipeline.add(new WanderForce(40, 2));
    pipeline.add(new VortexForce(400, 300, 120, 0, 400, 'linear'));
    pipeline.add(new DragForce(2.0));

    const dt = 1 / 60;
    const positions: { x: number; y: number }[] = [];

    for (let step = 0; step < 180; step++) {
      // 3 seconds
      pipeline.step(world, grid, dt);
      world.step(dt);
      grid.rebuild(world);

      if (step === 0 || step === 89 || step === 179) {
        positions.push({ x: world.x[0], y: world.y[0] });
      }
    }

    // Particle should have moved (not stuck in same place)
    expect(positions[1].x).not.toBeCloseTo(positions[0].x, 0);
    expect(positions[2].x).not.toBeCloseTo(positions[1].x, 0);
  });
});
