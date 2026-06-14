import { describe, it, expect } from 'vitest';
import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DEFAULT_REPULSION,
  DragForce,
  GravityForce,
  WanderForce,
  FlowFieldForce,
  VortexForce,
  ALIVE,
  DEAD,
  type SimulationConfig,
  type InteractionEntry,
} from './index.js';

// ─── Helpers ──────────────────────────────────────────────────────

/** Build a world with N particles of a single type, with zeroed motion. */
function makeWorld(count: number, width = 2000, height = 2000): World {
  const cfg: SimulationConfig = {
    width,
    height,
    boundaryMode: 'bounce',
    seed: 1,
    types: [{ count, color: '#ffffff', radius: 3, initialSpeed: 0, maxSpeed: 10_000 }],
  };
  const world = new World(cfg);
  // Zero out whatever random spawn produced — tests set their own state.
  for (let i = 0; i < count; i++) {
    world.x[i] = 0;
    world.y[i] = 0;
    world.vx[i] = 0;
    world.vy[i] = 0;
  }
  return world;
}

/** A trivial grid (forces that don't query it still need a reference). */
function trivialGrid(max = 16): SpatialHashGrid {
  return new SpatialHashGrid(2000, 2000, 10, max);
}

// ═══════════════════════════════════════════════════════════════════
// 1. GravityForce — constant downward acceleration
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: GravityForce (isolated)', () => {
  it('increases vy by acceleration*dt each step (linear growth)', () => {
    const accel = 200;
    const dt = 0.016;
    const steps = 10;
    const world = makeWorld(1);
    const gravity = new GravityForce(accel);

    for (let s = 0; s < steps; s++) gravity.apply(world, trivialGrid(), dt);

    // vy = steps * accel * dt  (velocity starts at 0).
    // Float32 accumulation over 10 steps → ~1e-5 abs error, so use 4 decimals.
    expect(world.vy[0]).toBeCloseTo(steps * accel * dt, 4);
    expect(world.vx[0]).toBe(0);
  });

  it('does not affect vx (purely vertical force)', () => {
    const world = makeWorld(1);
    world.vx[0] = 50;
    const gravity = new GravityForce(300);
    gravity.apply(world, trivialGrid(), 0.02);
    expect(world.vx[0]).toBe(50);
  });

  it('negative acceleration accelerates upward (vy decreases)', () => {
    const world = makeWorld(1);
    const gravity = new GravityForce(-250);
    gravity.apply(world, trivialGrid(), 0.02);
    expect(world.vy[0]).toBeCloseTo(-5, 6); // -250 * 0.02
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. DragForce — exponential velocity decay
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: DragForce (isolated)', () => {
  it('multiplies velocity by (1 - coefficient*dt) each step', () => {
    const coeff = 1;
    const dt = 0.016;
    const steps = 5;
    const world = makeWorld(1);
    world.vx[0] = 100;
    world.vy[0] = 50;
    const drag = new DragForce(coeff);

    const factor = 1 - coeff * dt;
    const expectedVx = 100 * Math.pow(factor, steps);
    const expectedVy = 50 * Math.pow(factor, steps);

    for (let s = 0; s < steps; s++) drag.apply(world, trivialGrid(), dt);

    expect(world.vx[0]).toBeCloseTo(expectedVx, 4);
    expect(world.vy[0]).toBeCloseTo(expectedVy, 4);
  });

  it('coefficient 0 leaves velocity unchanged', () => {
    const world = makeWorld(1);
    world.vx[0] = 77;
    world.vy[0] = -33;
    const drag = new DragForce(0);
    drag.apply(world, trivialGrid(), 0.1);
    expect(world.vx[0]).toBe(77);
    expect(world.vy[0]).toBe(-33);
  });

  it('large dt (coeff*dt >= 1) clamps factor to 0 — no velocity inversion', () => {
    const world = makeWorld(1);
    world.vx[0] = 100;
    world.vy[0] = 100;
    // coeff*dt = 200*0.1 = 20 >> 1 → factor clamped to 0 (not -19)
    const drag = new DragForce(200);
    drag.apply(world, trivialGrid(), 0.1);
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. FlowFieldForce — spatially varying directional force
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: FlowFieldForce (isolated)', () => {
  it('uniform mode, angle=0 → force purely in +x direction', () => {
    const world = makeWorld(1);
    const strength = 50;
    const dt = 0.02;
    const flow = new FlowFieldForce(strength, 'uniform', 0);
    flow.apply(world, trivialGrid(), dt);
    // field = (cos 0, sin 0) = (1, 0)
    expect(world.vx[0]).toBeCloseTo(strength * dt, 6);
    expect(world.vy[0]).toBeCloseTo(0, 6);
  });

  it('uniform mode, angle=π/2 → force purely in +y direction', () => {
    const world = makeWorld(1);
    const strength = 50;
    const dt = 0.02;
    const flow = new FlowFieldForce(strength, 'uniform', Math.PI / 2);
    flow.apply(world, trivialGrid(), dt);
    expect(world.vx[0]).toBeCloseTo(Math.cos(Math.PI / 2) * strength * dt, 6);
    expect(world.vy[0]).toBeCloseTo(Math.sin(Math.PI / 2) * strength * dt, 6);
  });

  it('custom field direction matches the provided function output', () => {
    const world = makeWorld(1);
    world.x[0] = 123;
    world.y[0] = 456;
    const strength = 40;
    const dt = 0.05;
    const flow = new FlowFieldForce(strength, 'custom', 0);
    // (0.6, 0.8) is a unit vector
    flow.setCustomField(() => [0.6, 0.8]);
    flow.apply(world, trivialGrid(), dt);
    expect(world.vx[0]).toBeCloseTo(0.6 * strength * dt, 6);
    expect(world.vy[0]).toBeCloseTo(0.8 * strength * dt, 6);
  });

  it('turbulence mode produces a non-zero force', () => {
    const world = makeWorld(1);
    world.x[0] = 100;
    world.y[0] = 100;
    const flow = new FlowFieldForce(50, 'turbulence', 0, 0.01);
    flow.apply(world, trivialGrid(), 0.02);
    const speed = Math.hypot(world.vx[0], world.vy[0]);
    expect(speed).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. VortexForce — swirl + radial, with cutoff
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: VortexForce (isolated)', () => {
  it('positive strength swirls counter-clockwise (right side pushed +y)', () => {
    const cx = 400;
    const cy = 300;
    const world = makeWorld(1);
    // particle to the right of center: dx>0, dy=0
    world.x[0] = cx + 100;
    world.y[0] = cy;
    const strength = 150;
    const dt = 0.02;
    const vortex = new VortexForce(cx, cy, strength, 0, 300, 'constant');
    vortex.apply(world, trivialGrid(), dt);
    // tangential dir (tx,ty) = (-ny, nx) = (0, 1) → +y
    expect(world.vy[0]).toBeCloseTo(strength * dt, 5);
    expect(world.vx[0]).toBeCloseTo(0, 6);
  });

  it('negative radialStrength pulls inward (toward center)', () => {
    const cx = 400;
    const cy = 300;
    const world = makeWorld(1);
    world.x[0] = cx + 100; // to the right
    world.y[0] = cy;
    const dt = 0.02;
    const radial = -80;
    const vortex = new VortexForce(cx, cy, 0, radial, 300, 'constant');
    vortex.apply(world, trivialGrid(), dt);
    // radial dir (nx,ny) = (1,0); radialForce = -80 → vx += -80*dt (toward center = -x)
    expect(world.vx[0]).toBeCloseTo(radial * dt, 5);
    expect(world.vy[0]).toBeCloseTo(0, 6);
  });

  it('applies zero force beyond the cutoff radius', () => {
    const cx = 400;
    const cy = 300;
    const radius = 300;
    const world = makeWorld(1);
    // place particle just outside the radius
    world.x[0] = cx + radius + 10;
    world.y[0] = cy;
    const vortex = new VortexForce(cx, cy, 500, -500, radius, 'constant');
    vortex.apply(world, trivialGrid(), 0.02);
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('applies zero force to a particle exactly at the center', () => {
    const cx = 400;
    const cy = 300;
    const world = makeWorld(1);
    world.x[0] = cx;
    world.y[0] = cy;
    const vortex = new VortexForce(cx, cy, 500, -500, 300, 'constant');
    vortex.apply(world, trivialGrid(), 0.02);
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. VortexForce falloff modes — magnitude vs distance
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: VortexForce falloff modes', () => {
  // Place a particle to the right of center at distance d; only tangential
  // force acts (radialStrength=0), so |Δv| = strength * falloffMult * dt.
  function tangentialDelta(d: number, falloff: 'linear' | 'inverse' | 'constant'): number {
    const cx = 0;
    const cy = 0;
    const strength = 100;
    const radius = 200;
    const dt = 0.02;
    const world = makeWorld(1);
    world.x[0] = cx + d;
    world.y[0] = cy;
    const vortex = new VortexForce(cx, cy, strength, 0, radius, falloff);
    vortex.apply(world, trivialGrid(), dt);
    return Math.abs(world.vy[0]); // tangential → purely vy here
  }

  it('linear falloff: force is stronger near the center (d1 < d2 → F1 > F2)', () => {
    const f1 = tangentialDelta(50, 'linear');
    const f2 = tangentialDelta(150, 'linear');
    // expected: 100*(1-50/200)*0.02 = 1.5 ; 100*(1-150/200)*0.02 = 0.5
    expect(f1).toBeCloseTo(1.5, 5);
    expect(f2).toBeCloseTo(0.5, 5);
    expect(f1).toBeGreaterThan(f2);
  });

  it('constant falloff: force is independent of distance (within radius)', () => {
    const f1 = tangentialDelta(50, 'constant');
    const f2 = tangentialDelta(150, 'constant');
    // expected: 100*0.02 = 2.0 at both
    expect(f1).toBeCloseTo(2.0, 5);
    expect(f2).toBeCloseTo(2.0, 5);
    expect(f1).toBeCloseTo(f2, 6);
  });

  it('inverse falloff: force is much stronger near center than at the edge', () => {
    const f1 = tangentialDelta(50, 'inverse');
    const f2 = tangentialDelta(150, 'inverse');
    // expected: 100/(0.25+0.1)*0.02 ≈ 5.714 ; 100/(0.75+0.1)*0.02 ≈ 2.353
    expect(f1).toBeCloseTo((100 / (0.25 + 0.1)) * 0.02, 4);
    expect(f2).toBeCloseTo((100 / (0.75 + 0.1)) * 0.02, 4);
    expect(f1).toBeGreaterThan(f2);
    // inverse near-center force exceeds linear near-center force
    expect(f1).toBeGreaterThan(tangentialDelta(50, 'linear'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. InteractionMatrix.forceAtDistance — pure falloff function
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: InteractionMatrix.forceAtDistance falloff', () => {
  const entry = (falloff: InteractionEntry['falloff']): InteractionEntry => ({
    strength: 100,
    radius: 100,
    falloff,
  });

  it('linear: strength*(1 - dist/radius) — stronger when closer', () => {
    const e = entry('linear');
    expect(InteractionMatrix.forceAtDistance(e, 25)).toBeCloseTo(75, 6); // 100*(1-0.25)
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBeCloseTo(50, 6); // 100*(1-0.5)
  });

  it('inverse: strength/(dist/radius + 0.1) — stronger when closer', () => {
    const e = entry('inverse');
    expect(InteractionMatrix.forceAtDistance(e, 25)).toBeCloseTo(100 / 0.35, 4);
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBeCloseTo(100 / 0.6, 4);
  });

  it('constant: strength regardless of distance', () => {
    const e = entry('constant');
    expect(InteractionMatrix.forceAtDistance(e, 25)).toBeCloseTo(100, 6);
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBeCloseTo(100, 6);
  });

  it('returns 0 at/beyond radius and at zero distance', () => {
    const e = entry('linear');
    expect(InteractionMatrix.forceAtDistance(e, 100)).toBe(0); // dist == radius
    expect(InteractionMatrix.forceAtDistance(e, 150)).toBe(0); // beyond
    expect(InteractionMatrix.forceAtDistance(e, 0)).toBe(0); // zero distance
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Zero-particle worlds — each global force must not crash
// ═══════════════════════════════════════════════════════════════════

describe('CRT-48: zero-particle world (each global force, isolated)', () => {
  it('applies all global forces to an empty world without throwing', () => {
    const world = makeWorld(0);
    const grid = trivialGrid(4);
    const dt = 0.02;
    expect(world.count).toBe(0);

    const forces = [
      new GravityForce(200),
      new DragForce(1),
      new FlowFieldForce(50, 'uniform', 0),
      new VortexForce(400, 300, 150, 0, 300),
      new WanderForce(80, 3),
    ];
    for (const f of forces) {
      expect(() => f.apply(world, grid, dt)).not.toThrow();
    }
    // Nothing to mutate; arrays are empty.
    expect(world.vx.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Dead-particle handling (PairwiseForce respects grid alive array)
// ═══════════════════════════════════════════════════════════════════
//
// Note on architecture: global forces (gravity, drag, vortex, …) iterate
// `world.count` by design and do not track per-particle alive state — they
// are "field" forces that apply to everything in the world. Per-particle
// alive/dead semantics live in the neighbor-based PairwiseForce, which only
// "sees" particles that the spatial hash grid was rebuilt with. These tests
// exercise that dead-handling path: a dead particle is absent from the grid
// and therefore exerts no force on its neighbours.

describe('CRT-48: dead-particle handling (PairwiseForce)', () => {
  function twoCloseParticles(): { world: World; grid: SpatialHashGrid; force: PairwiseForce } {
    const world = makeWorld(2);
    // Two particles 5 units apart — within DEFAULT_REPULSION radius (8).
    world.x[0] = 100;
    world.y[0] = 100;
    world.x[1] = 105;
    world.y[1] = 100;
    const matrix = new InteractionMatrix(1);
    const grid = new SpatialHashGrid(2000, 2000, 10, 16);
    const force = new PairwiseForce(matrix, DEFAULT_REPULSION);
    return { world, grid, force };
  }

  it('all-alive: nearby particles repel each other (control case)', () => {
    const { world, grid, force } = twoCloseParticles();
    grid.rebuild(world, new Uint8Array([ALIVE, ALIVE]));
    const vx0Before = world.vx[0];
    const vx1Before = world.vx[1];
    force.apply(world, grid, 0.02);
    // Repulsion pushes particle 0 left (−x) and particle 1 right (+x).
    expect(world.vx[0]).toBeLessThan(vx0Before);
    expect(world.vx[1]).toBeGreaterThan(vx1Before);
  });

  it('all-dead: no velocity changes (empty grid → no neighbours found)', () => {
    const { world, grid, force } = twoCloseParticles();
    grid.rebuild(world, new Uint8Array([DEAD, DEAD]));
    const before = {
      vx0: world.vx[0],
      vy0: world.vy[0],
      vx1: world.vx[1],
      vy1: world.vy[1],
    };
    force.apply(world, grid, 0.02);
    expect(world.vx[0]).toBe(before.vx0);
    expect(world.vy[0]).toBe(before.vy0);
    expect(world.vx[1]).toBe(before.vx1);
    expect(world.vy[1]).toBe(before.vy1);
  });

  it('one dead: a dead particle exerts no repulsion on its alive neighbour', () => {
    const { world, grid, force } = twoCloseParticles();
    // Particle 1 is dead → absent from the grid → particle 0 finds no neighbour.
    grid.rebuild(world, new Uint8Array([ALIVE, DEAD]));
    const vx0Before = world.vx[0];
    force.apply(world, grid, 0.02);
    // Particle 0 (alive) is unaffected by the dead particle 1.
    expect(world.vx[0]).toBe(vx0Before);
  });
});
