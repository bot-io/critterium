import { describe, it, expect } from 'vitest';
import {
  MAX_TYPES,
  createRng,
  World,
  SimLoop,
  defaultConfig,
  type SimulationConfig,
  type ParticleTypeConfig,
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
