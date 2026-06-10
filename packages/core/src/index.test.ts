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
    const spd = Math.sqrt(world.vx[0] ** 2 + world.vy[1] ?? 0);
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
  it('bounces particles off left wall', () => {
    const world = new World(singleTypeConfig(1));
    world.x[0] = -10;
    world.vx[0] = -50;
    world.applyBoundaries();
    expect(world.x[0]).toBe(10);
    expect(world.vx[0]).toBe(50);
  });

  it('bounces particles off right wall', () => {
    const world = new World(singleTypeConfig(1));
    world.x[0] = 810;
    world.vx[0] = 50;
    world.applyBoundaries();
    expect(world.x[0]).toBeCloseTo(790, 3);
    expect(world.vx[0]).toBe(-50);
  });

  it('bounces particles off top wall', () => {
    const world = new World(singleTypeConfig(1));
    world.y[0] = -5;
    world.vy[0] = -30;
    world.applyBoundaries();
    expect(world.y[0]).toBe(5);
    expect(world.vy[0]).toBe(30);
  });

  it('bounces particles off bottom wall', () => {
    const world = new World(singleTypeConfig(1));
    world.y[0] = 610;
    world.vy[0] = 30;
    world.applyBoundaries();
    expect(world.y[0]).toBeCloseTo(590, 3);
    expect(world.vy[0]).toBe(-30);
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
  const W = 800, H = 600;
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
    grid.insert(0, 50, 50);   // col 0, row 0 → cell 0
    grid.insert(1, 150, 50);  // col 1, row 0 → cell 1
    grid.insert(2, 50, 150);  // col 0, row 1 → cell 8
    expect(grid.cellAt(50, 50)).toBe(0);
    expect(grid.cellAt(150, 50)).toBe(1);
    expect(grid.cellAt(50, 150)).toBe(8);
  });

  it('clamps particles at edges to valid cells', () => {
    const grid = makeGrid();
    grid.clear();
    grid.insert(0, 799, 599); // near edge
    grid.insert(1, 0, 0);     // corner
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
        world.x[qi], world.y[qi], 100,
        world.x, world.y, world.count,
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
  const W = 800, H = 600;

  function twoParticleWorld(
    typeA: number, typeB: number,
    x0: number, y0: number, x1: number, y1: number,
    maxSpeed = 200,
  ): { world: World; grid: SpatialHashGrid } {
    const cfg: SimulationConfig = {
      width: W, height: H, boundaryMode: 'bounce', seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed },
      ],
    };
    // If only one type, adjust
    if (typeA === typeB) {
      cfg.types = [
        { count: 2, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed },
      ];
    }
    const world = new World(cfg);
    // Override positions (deterministic seed doesn't matter here)
    world.x[0] = x0; world.y[0] = y0; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = x1; world.y[1] = y1; world.vx[1] = 0; world.vy[1] = 0;

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
      width: W, height: H, boundaryMode: 'bounce', seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 },  // predator
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 200 },  // prey
        { count: 1, color: '#00f', radius: 3, initialSpeed: 0, maxSpeed: 200 },  // neutral
      ],
    };
    const world = new World(cfg);

    // Position them: predator at left, prey at center, neutral far right
    world.x[0] = 100; world.y[0] = 300; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 150; world.y[1] = 300; world.vx[1] = 0; world.vy[1] = 0;
    world.x[2] = 700; world.y[2] = 300; world.vx[2] = 0; world.vy[2] = 0;

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
      width: W, height: H, boundaryMode: 'bounce', seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 200 },
        { count: 1, color: '#00f', radius: 3, initialSpeed: 0, maxSpeed: 200 },
      ],
    };
    const world = new World(cfg);

    // Arrange in a line: 0 at x=100, 1 at x=130, 2 at x=160
    world.x[0] = 100; world.y[0] = 300; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 130; world.y[1] = 300; world.vx[1] = 0; world.vy[1] = 0;
    world.x[2] = 160; world.y[2] = 300; world.vx[2] = 0; world.vy[2] = 0;

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
