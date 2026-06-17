/**
 * AttractorForce — Unit Tests
 *
 * Verifies point-based attraction/repulsion (gravity well) with all three
 * falloff modes, radius cutoff, purely-radial direction (no tangential
 * component), and edge cases (zero particles, particle at exact center).
 */

import { describe, it, expect } from 'vitest';
import {
  AttractorForce,
  VortexForce,
  World,
  SpatialHashGrid,
  type SimulationConfig,
  type FalloffType,
} from './index.js';
import { createForce, getForceDescriptor, listForceTypes } from './force-registry.js';

// ─── Test Helpers ──────────────────────────────────────────────

function makeWorld(count: number): World {
  const config: SimulationConfig = {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    types: [
      {
        count,
        color: '#44cc44',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 500,
      },
    ],
  };
  return new World(config);
}

function makeGrid(): SpatialHashGrid {
  return new SpatialHashGrid(800, 600, 150, 10);
}

/** Set up a single particle at a known position with zero velocity. */
function placeParticle(world: World, px: number, py: number): void {
  world.x[0] = px;
  world.y[0] = py;
  world.vx[0] = 0;
  world.vy[0] = 0;
}

/**
 * Expected velocity-change magnitude for a particle at distance `dist`
 * from the attractor point, given the force's strength/radius/falloff.
 * Mirrors the AttractorForce.apply() computation exactly.
 */
function expectedDeltaV(
  dist: number,
  strength: number,
  radius: number,
  falloff: FalloffType,
  dt: number,
): number {
  const t = dist / radius;
  let mult: number;
  switch (falloff) {
    case 'linear':
      mult = 1 - t;
      break;
    case 'inverse':
      mult = 1 / (t + 0.1);
      break;
    case 'constant':
      mult = 1;
      break;
  }
  return strength * mult * dt;
}

// ─── Tests ─────────────────────────────────────────────────────

describe('AttractorForce — Constructor & Params', () => {
  it('has correct id and default params', () => {
    const f = new AttractorForce();
    expect(f.id).toBe('attractor');
    expect(f.params.x).toBe(400);
    expect(f.params.y).toBe(300);
    expect(f.params.strength).toBe(200);
    expect(f.params.radius).toBe(250);
    expect(f.params.falloff).toBe('linear');
  });

  it('accepts custom params and serialises them', () => {
    const f = new AttractorForce(100, 200, -350, 500, 'inverse');
    expect(f.params.x).toBe(100);
    expect(f.params.y).toBe(200);
    expect(f.params.strength).toBe(-350);
    expect(f.params.radius).toBe(500);
    expect(f.params.falloff).toBe('inverse');
  });
});

describe('AttractorForce — Attraction (positive strength)', () => {
  it('accelerates particle toward the attractor point', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (600, 300) — directly to the right
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(600, 300, 200, 250, 'linear');
    force.apply(world, grid, 1.0);

    // Distance = 200, radius = 250, linear mult = 1 - 200/250 = 0.2
    // Expected Δvx = 200 * 0.2 * 1.0 = 40 (positive = toward attractor at +x)
    expect(world.vx[0]).toBeCloseTo(40, 1);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('produces the correct magnitude for attraction', () => {
    const world = makeWorld(1);
    placeParticle(world, 350, 300); // 150 units left of attractor at (500,300)

    const grid = makeGrid();
    grid.rebuild(world);

    const strength = 200;
    const radius = 300;
    const dt = 0.5;
    const force = new AttractorForce(500, 300, strength, radius, 'linear');
    force.apply(world, grid, dt);

    const dist = 150;
    const expected = expectedDeltaV(dist, strength, radius, 'linear', dt);
    // |Δv| = sqrt(vx² + vy²); since force is purely along +x, vx = expected
    expect(world.vx[0]).toBeCloseTo(expected, 1);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('works for diagonal attraction direction', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (500, 400) — diagonal down-right
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(500, 400, 100, 200, 'linear');
    force.apply(world, grid, 1.0);

    // Distance = sqrt(100² + 100²) = ~141.42
    // Direction to attractor: (100, 100) / 141.42 = (0.7071, 0.7071)
    // Both vx and vy should be positive and roughly equal (diagonal symmetry)
    expect(world.vx[0]).toBeGreaterThan(0);
    expect(world.vy[0]).toBeGreaterThan(0);
    expect(world.vx[0]).toBeCloseTo(world.vy[0], 1);
  });
});

describe('AttractorForce — Repulsion (negative strength)', () => {
  it('accelerates particle away from the attractor point', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (600, 300) — to the right
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(600, 300, -200, 250, 'linear');
    force.apply(world, grid, 1.0);

    // Same magnitude as attraction test but direction is AWAY (negative vx)
    // Distance = 200, linear mult = 0.2, force = -200 * 0.2 = -40
    expect(world.vx[0]).toBeCloseTo(-40, 1);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });

  it('repulsion pushes particle in opposite direction of attraction', () => {
    const world1 = makeWorld(1);
    const world2 = makeWorld(1);
    placeParticle(world1, 400, 300);
    placeParticle(world2, 400, 300);

    const grid1 = makeGrid();
    const grid2 = makeGrid();
    grid1.rebuild(world1);
    grid2.rebuild(world2);

    const attract = new AttractorForce(600, 300, 200, 250, 'linear');
    const repel = new AttractorForce(600, 300, -200, 250, 'linear');
    attract.apply(world1, grid1, 1.0);
    repel.apply(world2, grid2, 1.0);

    // Same magnitude, opposite sign
    expect(world1.vx[0]).toBeCloseTo(-world2.vx[0], 5);
    expect(world1.vy[0]).toBeCloseTo(-world2.vy[0], 5);
  });
});

describe('AttractorForce — Radius cutoff', () => {
  it('applies no force to particle beyond radius', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (600, 300), dist = 200, radius = 100
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(600, 300, 200, 100, 'linear');
    force.apply(world, grid, 1.0);

    // dist (200) >= radius (100) → zero force
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('applies force to particle exactly at radius boundary (exclusive)', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (500, 300), dist = 100, radius = 100
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(500, 300, 200, 100, 'constant');
    force.apply(world, grid, 1.0);

    // dist == radius (boundary) → force excluded (dist >= radius check)
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('applies force to particle just inside radius', () => {
    const world = makeWorld(1);
    // Particle at (400, 300), attractor at (500, 300), dist ≈ 99, radius = 100
    placeParticle(world, 400, 300);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(499, 300, 200, 100, 'constant');
    force.apply(world, grid, 1.0);

    // dist ≈ 99 < radius 100 → force applied, constant = strength * 1 * dt
    expect(world.vx[0]).toBeCloseTo(200, 0);
    expect(world.vy[0]).toBeCloseTo(0, 5);
  });
});

describe('AttractorForce — Falloff modes', () => {
  it('linear: force decreases linearly with distance', () => {
    const world = makeWorld(2);
    // Particle 0 at distance 50, particle 1 at distance 150 from attractor (400,300)
    world.x[0] = 350;
    world.y[0] = 300;
    world.x[1] = 250;
    world.y[1] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = makeGrid();
    grid.rebuild(world);

    const radius = 300;
    const strength = 200;
    const force = new AttractorForce(400, 300, strength, radius, 'linear');
    force.apply(world, grid, 1.0);

    // Particle 0: dist=50, t=50/300≈0.167, mult=0.833, Δv=200*0.833=166.67
    // Particle 1: dist=150, t=150/300=0.5, mult=0.5, Δv=200*0.5=100
    expect(world.vx[0]).toBeCloseTo(strength * (1 - 50 / radius), 0);
    expect(world.vx[1]).toBeCloseTo(strength * (1 - 150 / radius), 0);
    // Closer particle gets more force
    expect(Math.abs(world.vx[0])).toBeGreaterThan(Math.abs(world.vx[1]));
  });

  it('inverse: force is stronger near point than linear', () => {
    const world = makeWorld(1);
    placeParticle(world, 350, 300); // 50 units from attractor at (400,300)

    const grid = makeGrid();
    grid.rebuild(world);

    const radius = 300;
    const strength = 200;
    const force = new AttractorForce(400, 300, strength, radius, 'inverse');
    force.apply(world, grid, 1.0);

    // dist=50, t=50/300≈0.167, mult = 1/(0.167+0.1) = 1/0.267 ≈ 3.75
    const expected = strength * (1 / (50 / radius + 0.1));
    expect(world.vx[0]).toBeCloseTo(expected, 0);
  });

  it('inverse: magnitude at two distances', () => {
    const world = makeWorld(2);
    world.x[0] = 360; // dist=40 from attractor (400,300)
    world.y[0] = 300;
    world.x[1] = 300; // dist=100 from attractor
    world.y[1] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = makeGrid();
    grid.rebuild(world);

    const radius = 200;
    const strength = 100;
    const force = new AttractorForce(400, 300, strength, radius, 'inverse');
    force.apply(world, grid, 1.0);

    const exp0 = strength * (1 / (40 / radius + 0.1));
    const exp1 = strength * (1 / (100 / radius + 0.1));
    expect(world.vx[0]).toBeCloseTo(exp0, 0);
    expect(world.vx[1]).toBeCloseTo(exp1, 0);
    // Near particle gets much more force
    expect(Math.abs(world.vx[0])).toBeGreaterThan(Math.abs(world.vx[1]));
  });

  it('constant: uniform force regardless of distance', () => {
    const world = makeWorld(2);
    world.x[0] = 360; // dist=40
    world.y[0] = 300;
    world.x[1] = 320; // dist=80
    world.y[1] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = makeGrid();
    grid.rebuild(world);

    const strength = 150;
    const force = new AttractorForce(400, 300, strength, 200, 'constant');
    force.apply(world, grid, 1.0);

    // Both get exactly strength * 1 * dt = 150
    expect(world.vx[0]).toBeCloseTo(strength, 5);
    expect(world.vx[1]).toBeCloseTo(strength, 5);
  });
});

describe('AttractorForce — No tangential component (purely radial)', () => {
  it('force vector is parallel to radial direction', () => {
    const world = makeWorld(1);
    // Particle at (300, 200), attractor at (500, 400)
    placeParticle(world, 300, 200);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(500, 400, 200, 300, 'linear');
    force.apply(world, grid, 1.0);

    // The radial direction from particle to attractor is (200, 200) normalized = (0.707, 0.707)
    // The force vector (Δvx, Δvy) must be parallel to this.
    // Cross product = Δvx * radialY - Δvy * radialX must be ≈ 0
    const radialX = 200;
    const radialY = 200;
    const cross = world.vx[0] * radialY - world.vy[0] * radialX;
    expect(Math.abs(cross)).toBeLessThan(0.001);
  });

  it('no tangential component for off-axis particle', () => {
    const world = makeWorld(1);
    // Particle at (300, 400), attractor at (500, 200)
    placeParticle(world, 300, 400);

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(500, 200, 300, 250, 'inverse');
    force.apply(world, grid, 1.0);

    // Radial direction: (200, -200)
    const radialX = 200;
    const radialY = -200;
    const cross = world.vx[0] * radialY - world.vy[0] * radialX;
    expect(Math.abs(cross)).toBeLessThan(0.001);
  });

  it('differs from VortexForce which has a tangential component', () => {
    const world = makeWorld(1);
    placeParticle(world, 350, 300); // 50 left of center

    const grid = makeGrid();
    grid.rebuild(world);

    // Vortex with radial=0, only tangential → force should be purely along y
    const vortex = new VortexForce(400, 300, 200, 0, 300, 'constant');
    vortex.apply(world, grid, 1.0);

    // Vortex tangential direction for particle at (350,300) relative to (400,300):
    // dx = -50, dy = 0 → nx = -1, ny = 0 → tangential = (-ny, nx) = (0, -1)
    // So vx should be 0, vy should be -200 (pure tangential)
    expect(world.vx[0]).toBeCloseTo(0, 5);
    expect(world.vy[0]).not.toBeCloseTo(0, 1);

    // Now attractor with same geometry → purely radial (along x)
    const world2 = makeWorld(1);
    placeParticle(world2, 350, 300);
    const grid2 = makeGrid();
    grid2.rebuild(world2);

    const attractor = new AttractorForce(400, 300, 200, 300, 'constant');
    attractor.apply(world2, grid2, 1.0);

    // Attractor radial direction: (1, 0) → vx > 0, vy = 0
    expect(world2.vx[0]).not.toBeCloseTo(0, 1);
    expect(world2.vy[0]).toBeCloseTo(0, 5);
  });
});

describe('AttractorForce — Edge cases', () => {
  it('particle at exact center receives no force (avoids div by zero)', () => {
    const world = makeWorld(1);
    placeParticle(world, 400, 300); // exactly at attractor

    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(400, 300, 200, 300, 'linear');
    force.apply(world, grid, 1.0);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('zero-particle world does not crash', () => {
    const world = makeWorld(0);
    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(400, 300, 200, 300, 'linear');
    expect(() => force.apply(world, grid, 1.0)).not.toThrow();
  });

  it('multiple particles each receive correct force', () => {
    const world = makeWorld(3);
    // Three particles at different distances on x-axis from attractor (400,300)
    world.x[0] = 300; // dist=100
    world.y[0] = 300;
    world.x[1] = 350; // dist=50
    world.y[1] = 300;
    world.x[2] = 250; // dist=150
    world.y[2] = 300;
    for (let i = 0; i < 3; i++) {
      world.vx[i] = 0;
      world.vy[i] = 0;
    }

    const grid = makeGrid();
    grid.rebuild(world);

    const radius = 200;
    const strength = 100;
    const force = new AttractorForce(400, 300, strength, radius, 'linear');
    force.apply(world, grid, 1.0);

    // All should move right (toward attractor), closer ones faster
    expect(world.vx[0]).toBeCloseTo(strength * (1 - 100 / radius), 0);
    expect(world.vx[1]).toBeCloseTo(strength * (1 - 50 / radius), 0);
    expect(world.vx[2]).toBeCloseTo(strength * (1 - 150 / radius), 0);
    expect(world.vx[1]).toBeGreaterThan(world.vx[0]);
    expect(world.vx[0]).toBeGreaterThan(world.vx[2]);
    // All purely radial (along x)
    for (let i = 0; i < 3; i++) {
      expect(world.vy[i]).toBeCloseTo(0, 5);
    }
  });

  it('produces no NaN or Infinity under normal operation', () => {
    const world = makeWorld(5);
    const grid = makeGrid();
    grid.rebuild(world);

    const force = new AttractorForce(400, 300, 250, 200, 'inverse');
    force.apply(world, grid, 0.016);

    for (let i = 0; i < world.count; i++) {
      expect(Number.isFinite(world.vx[i])).toBe(true);
      expect(Number.isFinite(world.vy[i])).toBe(true);
    }
  });
});

describe('AttractorForce — ForceRegistry integration', () => {
  it('createForce("attractor") returns an AttractorForce instance', () => {
    const f = createForce('attractor');
    expect(f).toBeInstanceOf(AttractorForce);
    expect(f.id).toBe('attractor');
    expect(f.params.x).toBe(400);
    expect(f.params.y).toBe(300);
    expect(f.params.strength).toBe(200);
    expect(f.params.radius).toBe(250);
    expect(f.params.falloff).toBe('linear');
  });

  it('createForce("attractor") accepts custom params', () => {
    const f = createForce('attractor', { x: 100, y: 200, strength: -50, radius: 400 });
    expect(f.params.x).toBe(100);
    expect(f.params.y).toBe(200);
    expect(f.params.strength).toBe(-50);
    expect(f.params.radius).toBe(400);
    expect(f.params.falloff).toBe('linear'); // default preserved
  });

  it('createForce("attractor") ignores unknown params', () => {
    const f = createForce('attractor', { x: 50, unknownParam: 999 });
    expect(f.params.x).toBe(50);
    expect((f.params as Record<string, unknown>).unknownParam).toBeUndefined();
  });

  it('getForceDescriptor("attractor") returns full metadata', () => {
    const desc = getForceDescriptor('attractor');
    expect(desc).toBeDefined();
    expect(desc!.type).toBe('attractor');
    expect(desc!.displayName).toBe('Attractor');
    expect(desc!.description).toContain('radial');
    expect(desc!.defaultParams).toEqual({
      x: 400,
      y: 300,
      strength: 200,
      radius: 250,
      falloff: 'linear',
    });
    expect(desc!.paramSchema.length).toBe(5);
    // Verify paramSchema entries
    const keys = desc!.paramSchema.map((p) => p.key);
    expect(keys).toEqual(['x', 'y', 'strength', 'radius', 'falloff']);
  });

  it('is listed in listForceTypes()', () => {
    const types = listForceTypes();
    const attractorDesc = types.find((t) => t.type === 'attractor');
    expect(attractorDesc).toBeDefined();
    expect(attractorDesc!.displayName).toBe('Attractor');
  });

  it('paramSchema has valid min/max/step for all number params', () => {
    const desc = getForceDescriptor('attractor')!;
    for (const param of desc.paramSchema) {
      if (param.type === 'number') {
        expect(param.min).toBeDefined();
        expect(param.max).toBeDefined();
        expect(param.step).toBeDefined();
        expect(param.min!).toBeLessThanOrEqual(param.max!);
      }
      if (param.type === 'select') {
        expect(param.options).toBeDefined();
        expect(param.options!.length).toBeGreaterThan(0);
      }
    }
  });

  it('registry-created force produces the same physics as direct constructor', () => {
    const world1 = makeWorld(1);
    const world2 = makeWorld(1);
    placeParticle(world1, 350, 300);
    placeParticle(world2, 350, 300);

    const grid1 = makeGrid();
    const grid2 = makeGrid();
    grid1.rebuild(world1);
    grid2.rebuild(world2);

    const direct = new AttractorForce(500, 300, 200, 250, 'linear');
    const fromRegistry = createForce('attractor', {
      x: 500,
      y: 300,
      strength: 200,
      radius: 250,
      falloff: 'linear',
    });

    direct.apply(world1, grid1, 1.0);
    fromRegistry.apply(world2, grid2, 1.0);

    expect(world1.vx[0]).toBeCloseTo(world2.vx[0], 5);
    expect(world1.vy[0]).toBeCloseTo(world2.vy[0], 5);
  });
});
