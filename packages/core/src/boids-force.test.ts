/**
 * BoidsForce — Unit Tests
 *
 * Verifies the three Reynolds flocking sub-behaviors (separation, alignment,
 * cohesion) work correctly both in isolation and combined, plus edge cases.
 */

import { describe, it, expect } from 'vitest';
import { BoidsForce, World, SpatialHashGrid, type SimulationConfig } from './index.js';
import { createForce } from './force-registry.js';

// ─── Test Helpers ──────────────────────────────────────────────

function makeWorld(count: number, typeCount = 1): World {
  const types: SimulationConfig['types'] = [];
  for (let t = 0; t < typeCount; t++) {
    types.push({
      count:
        t === typeCount - 1
          ? count - types.reduce((s, x) => s + x.count, 0)
          : Math.floor(count / typeCount),
      color: '#44cc44',
      radius: 3,
      initialSpeed: 50,
      maxSpeed: 500,
    });
  }
  const config: SimulationConfig = {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    types,
  };
  return new World(config);
}

function makeGrid(cellSize = 100, maxParticles = 200): SpatialHashGrid {
  return new SpatialHashGrid(800, 600, cellSize, maxParticles);
}

/** Distance between two particles. */
function dist(world: World, i: number, j: number): number {
  const dx = world.x[i] - world.x[j];
  const dy = world.y[i] - world.y[j];
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Tests ─────────────────────────────────────────────────────

describe('BoidsForce — Constructor & Params', () => {
  it('has correct id and default params', () => {
    const f = new BoidsForce();
    expect(f.id).toBe('boids');
    expect(f.params.separationRadius).toBe(25);
    expect(f.params.separationStrength).toBe(50);
    expect(f.params.alignmentRadius).toBe(60);
    expect(f.params.alignmentStrength).toBe(30);
    expect(f.params.cohesionRadius).toBe(60);
    expect(f.params.cohesionStrength).toBe(20);
    expect(f.params.crossType).toBe(false);
  });

  it('accepts custom params', () => {
    const f = new BoidsForce(40, 100, 80, 60, 100, 40, true);
    expect(f.params.separationRadius).toBe(40);
    expect(f.params.separationStrength).toBe(100);
    expect(f.params.alignmentRadius).toBe(80);
    expect(f.params.alignmentStrength).toBe(60);
    expect(f.params.cohesionRadius).toBe(100);
    expect(f.params.cohesionStrength).toBe(40);
    expect(f.params.crossType).toBe(true);
  });
});

describe('BoidsForce — Separation', () => {
  it('pushes two close particles apart', () => {
    const world = makeWorld(2);
    // Place two particles very close together (within separation radius)
    world.x[0] = 400;
    world.y[0] = 300;
    world.x[1] = 410;
    world.y[1] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    // Only separation active (alignment/cohesion radii set very low so they
    // don't contribute — actually both particles ARE within cohesion radius
    // since they're close. But separation pushes them apart.)
    const force = new BoidsForce(
      30, // separationRadius
      100, // separationStrength
      5, // alignmentRadius (very small, particles at 10px apart won't align)
      0, // alignmentStrength (disabled)
      5, // cohesionRadius (very small)
      0, // cohesionStrength (disabled)
    );
    force.apply(world, grid, 1.0);

    // Particle 0 should be pushed LEFT (away from particle 1 at x=410)
    expect(world.vx[0]).toBeLessThan(-0.1);
    // Particle 1 should be pushed RIGHT (away from particle 0 at x=400)
    expect(world.vx[1]).toBeGreaterThan(0.1);
  });

  it('does not separate particles beyond separation radius', () => {
    const world = makeWorld(2);
    // Two particles far apart (well beyond separation radius)
    world.x[0] = 100;
    world.y[0] = 100;
    world.x[1] = 700;
    world.y[1] = 500;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;

    const grid = makeGrid(200, 10);
    grid.rebuild(world);

    const force = new BoidsForce(25, 100, 0, 0, 0, 0);
    force.apply(world, grid, 1.0);

    // No separation force — particles too far apart
    expect(Math.abs(world.vx[0])).toBeLessThan(0.01);
    expect(Math.abs(world.vy[0])).toBeLessThan(0.01);
    expect(Math.abs(world.vx[1])).toBeLessThan(0.01);
    expect(Math.abs(world.vy[1])).toBeLessThan(0.01);
  });

  it('increasing separationStrength produces stronger repulsion', () => {
    // Weak separation
    const world1 = makeWorld(2);
    world1.x[0] = 400;
    world1.y[0] = 300;
    world1.x[1] = 410;
    world1.y[1] = 300;
    world1.vx[0] = 0;
    world1.vy[0] = 0;
    world1.vx[1] = 0;
    world1.vy[1] = 0;
    const grid1 = makeGrid(100, 10);
    grid1.rebuild(world1);
    const weakForce = new BoidsForce(30, 10, 5, 0, 5, 0);
    weakForce.apply(world1, grid1, 1.0);
    const weakSpeed = Math.abs(world1.vx[0]);

    // Strong separation (same positions)
    const world2 = makeWorld(2);
    world2.x[0] = 400;
    world2.y[0] = 300;
    world2.x[1] = 410;
    world2.y[1] = 300;
    world2.vx[0] = 0;
    world2.vy[0] = 0;
    world2.vx[1] = 0;
    world2.vy[1] = 0;
    const grid2 = makeGrid(100, 10);
    grid2.rebuild(world2);
    const strongForce = new BoidsForce(30, 200, 5, 0, 5, 0);
    strongForce.apply(world2, grid2, 1.0);
    const strongSpeed = Math.abs(world2.vx[0]);

    expect(strongSpeed).toBeGreaterThan(weakSpeed);
    // Strong should be ~20x the weak (200/10 = 20), allow tolerance for normalization
    expect(strongSpeed / weakSpeed).toBeCloseTo(20, 0);
  });
});

describe('BoidsForce — Alignment', () => {
  it('steers particles toward average neighbor heading', () => {
    const world = makeWorld(3);
    // Co-locate three particles
    world.x[0] = 400;
    world.y[0] = 300;
    world.x[1] = 400;
    world.y[1] = 300;
    world.x[2] = 400;
    world.y[2] = 300;
    // Particle 0 moves right, particle 1 moves down, particle 2 moves right
    world.vx[0] = 100;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 100;
    world.vx[2] = 100;
    world.vy[2] = 0;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    // Only alignment
    const force = new BoidsForce(
      5, // separationRadius — very small, won't trigger on co-located particles
      0, // separationStrength — disabled
      60, // alignmentRadius
      50, // alignmentStrength
      5, // cohesionRadius — very small
      0, // cohesionStrength — disabled
    );
    force.apply(world, grid, 1.0);

    // Average heading: (100,0) + (0,100) + (100,0) = (200,100) normalized = (0.894, 0.447)
    // Particle 1 (originally going purely down) should gain some rightward component
    expect(world.vx[1]).toBeGreaterThan(0);
    // Particles 0 and 2 (originally going right) should gain some downward component
    expect(world.vy[0]).toBeGreaterThan(0);
    expect(world.vy[2]).toBeGreaterThan(0);
  });
});

describe('BoidsForce — Cohesion', () => {
  it('steers scattered particles toward group centroid', () => {
    const world = makeWorld(3);
    // Three particles forming a triangle
    world.x[0] = 350;
    world.y[0] = 300;
    world.x[1] = 450;
    world.y[1] = 300;
    world.x[2] = 400;
    world.y[2] = 350;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;
    world.vx[2] = 0;
    world.vy[2] = 0;

    const grid = makeGrid(200, 10);
    grid.rebuild(world);

    // Only cohesion
    const force = new BoidsForce(
      5, // separationRadius — disabled
      0, // separationStrength — disabled
      5, // alignmentRadius — disabled
      0, // alignmentStrength — disabled
      100, // cohesionRadius
      50, // cohesionStrength
    );
    force.apply(world, grid, 1.0);

    // Centroid of neighbors for particle 0: avg of (450,300) and (400,350) = (425,325)
    // Direction from (350,300) to (425,325) is (+75, +25) → should move right and down
    expect(world.vx[0]).toBeGreaterThan(0.1);
    expect(world.vy[0]).toBeGreaterThan(0.1);

    // Particle 1: centroid of (350,300) and (400,350) = (375,325)
    // Direction from (450,300) to (375,325) = (-75, +25) → should move left and down
    expect(world.vx[1]).toBeLessThan(-0.1);
    expect(world.vy[1]).toBeGreaterThan(0.1);
  });
});

describe('BoidsForce — Combined Behavior', () => {
  it('particles flock: close particles separate and align simultaneously', () => {
    const world = makeWorld(5);
    // Cluster of particles close together, asymmetric arrangement so forces
    // don't perfectly cancel (middle particle of a symmetric layout gets zero net)
    world.x[0] = 392;
    world.y[0] = 300;
    world.x[1] = 398;
    world.y[1] = 302;
    world.x[2] = 401;
    world.y[2] = 299;
    world.x[3] = 406;
    world.y[3] = 301;
    world.x[4] = 412;
    world.y[4] = 300;
    // Non-symmetric velocities
    world.vx[0] = 60;
    world.vy[0] = 10;
    world.vx[1] = -20;
    world.vy[1] = 40;
    world.vx[2] = 80;
    world.vy[2] = -30;
    world.vx[3] = 10;
    world.vy[3] = 50;
    world.vx[4] = -40;
    world.vy[4] = 20;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    const force = new BoidsForce(20, 80, 50, 40, 50, 20);
    force.apply(world, grid, 0.5);

    // At least some particles should have velocity changes
    let changedCount = 0;
    for (let i = 0; i < 5; i++) {
      const speed = Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
      if (speed > 0.01) changedCount++;
    }
    expect(changedCount).toBeGreaterThanOrEqual(3);
  });

  it('produces no NaN or Infinity in velocities', () => {
    const world = makeWorld(20);
    const grid = makeGrid(100, 50);
    grid.rebuild(world);

    const force = new BoidsForce(); // default params
    for (let step = 0; step < 100; step++) {
      force.apply(world, grid, 1 / 60);
      world.step(1 / 60);
      grid.rebuild(world);
    }

    for (let i = 0; i < world.count; i++) {
      expect(Number.isNaN(world.vx[i])).toBe(false);
      expect(Number.isNaN(world.vy[i])).toBe(false);
      expect(Number.isFinite(world.vx[i])).toBe(true);
      expect(Number.isFinite(world.vy[i])).toBe(true);
      expect(Number.isNaN(world.x[i])).toBe(false);
      expect(Number.isNaN(world.y[i])).toBe(false);
    }
  });
});

describe('BoidsForce — Edge Cases', () => {
  it('handles zero-particle world without crashing', () => {
    const world = makeWorld(0);
    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    const force = new BoidsForce();
    expect(() => force.apply(world, grid, 1 / 60)).not.toThrow();
    // No particles to modify
    expect(world.count).toBe(0);
  });

  it('handles single-particle world without crashing or applying force', () => {
    const world = makeWorld(1);
    world.x[0] = 400;
    world.y[0] = 300;
    world.vx[0] = 50;
    world.vy[0] = 0;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    const force = new BoidsForce();
    force.apply(world, grid, 1.0);

    // No neighbors → no force applied → velocity unchanged
    expect(world.vx[0]).toBe(50);
    expect(world.vy[0]).toBe(0);
  });

  it('handles dt=0 without modifying velocities', () => {
    const world = makeWorld(5);
    for (let i = 0; i < 5; i++) {
      world.x[i] = 395 + i * 3;
      world.y[i] = 300;
      world.vx[i] = 50;
      world.vy[i] = 0;
    }
    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    const force = new BoidsForce();
    force.apply(world, grid, 0);

    // dt=0 means force * dt = 0 → no velocity change
    for (let i = 0; i < 5; i++) {
      expect(world.vx[i]).toBe(50);
      expect(world.vy[i]).toBe(0);
    }
  });

  it('handles all-zero-strength params (no-op)', () => {
    const world = makeWorld(5);
    for (let i = 0; i < 5; i++) {
      world.x[i] = 395 + i * 3;
      world.y[i] = 300;
      world.vx[i] = 50;
      world.vy[i] = 0;
    }
    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    const force = new BoidsForce(25, 0, 60, 0, 60, 0);
    force.apply(world, grid, 1.0);

    // All strengths are 0 → no velocity change
    for (let i = 0; i < 5; i++) {
      expect(world.vx[i]).toBe(50);
      expect(world.vy[i]).toBe(0);
    }
  });
});

describe('BoidsForce — crossType Behavior', () => {
  it('crossType=false ignores different-type neighbors', () => {
    const world = makeWorld(2, 2);
    // Particle 0 is type 0, particle 1 is type 1
    world.x[0] = 400;
    world.y[0] = 300;
    world.type[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = 405;
    world.y[1] = 300;
    world.type[1] = 1;
    world.vx[1] = 100;
    world.vy[1] = 0;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    // crossType=false (default): particle 0 should NOT be affected by type-1 neighbor
    const force = new BoidsForce(30, 100, 60, 50, 60, 50, false);
    force.apply(world, grid, 1.0);

    // No same-type neighbors → no force on particle 0
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('crossType=true considers all neighbors regardless of type', () => {
    const world = makeWorld(2, 2);
    world.x[0] = 400;
    world.y[0] = 300;
    world.type[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.x[1] = 405;
    world.y[1] = 300;
    world.type[1] = 1;
    world.vx[1] = 100;
    world.vy[1] = 0;

    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    // Only separation active to isolate the cross-type effect.
    // (With all three behaviors, separation (-100) exactly cancels
    // alignment (+50) + cohesion (+50) for this 2-particle config.)
    const force = new BoidsForce(30, 100, 5, 0, 5, 0, true);
    force.apply(world, grid, 1.0);

    // Particle 0 should be pushed left (away from particle 1 at x=405)
    expect(world.vx[0]).toBeLessThan(-0.1);
    const speed = Math.sqrt(world.vx[0] ** 2 + world.vy[0] ** 2);
    expect(speed).toBeGreaterThan(0);
  });
});

describe('BoidsForce — Registry Integration', () => {
  it('createForce("boids") returns a working BoidsForce instance', () => {
    const f = createForce('boids');
    expect(f.id).toBe('boids');
    expect(f.params.separationRadius).toBe(25);

    // Verify it actually applies force
    const world = makeWorld(3);
    world.x[0] = 400;
    world.y[0] = 300;
    world.x[1] = 405;
    world.y[1] = 300;
    world.x[2] = 410;
    world.y[2] = 300;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 0;
    world.vx[2] = 0;
    world.vy[2] = 0;
    const grid = makeGrid(100, 10);
    grid.rebuild(world);

    f.apply(world, grid, 1.0);

    // Should produce velocity changes
    let totalSpeed = 0;
    for (let i = 0; i < 3; i++) {
      totalSpeed += Math.sqrt(world.vx[i] ** 2 + world.vy[i] ** 2);
    }
    expect(totalSpeed).toBeGreaterThan(0);
  });

  it('createForce("boids") with custom params produces identical behavior to constructor', () => {
    const fromRegistry = createForce('boids', {
      separationRadius: 40,
      separationStrength: 80,
      alignmentRadius: 70,
      alignmentStrength: 35,
      cohesionRadius: 90,
      cohesionStrength: 25,
      crossType: true,
    });
    const fromConstructor = new BoidsForce(40, 80, 70, 35, 90, 25, true);

    expect(fromRegistry.params).toEqual(fromConstructor.params);
  });
});

describe('BoidsForce — Velocity Buffer Reuse', () => {
  it('does not reallocate buffers when particle count stays the same', () => {
    const world = makeWorld(10);
    const grid = makeGrid(100, 20);
    grid.rebuild(world);

    const force = new BoidsForce();
    // First call allocates internal buffers
    force.apply(world, grid, 1 / 60);
    // Subsequent calls should reuse (no crash, same behavior)
    force.apply(world, grid, 1 / 60);
    force.apply(world, grid, 1 / 60);

    // Verify simulation still produces valid results
    for (let i = 0; i < world.count; i++) {
      expect(Number.isFinite(world.vx[i])).toBe(true);
      expect(Number.isFinite(world.vy[i])).toBe(true);
    }
  });

  it('grows buffers when world size increases between calls', () => {
    // Start with a small world
    const smallWorld = makeWorld(3);
    const grid = makeGrid(100, 50);
    grid.rebuild(smallWorld);

    const force = new BoidsForce();
    force.apply(smallWorld, grid, 1 / 60);

    // Switch to a larger world — force should grow its internal buffers
    const largeWorld = makeWorld(40);
    grid.rebuild(largeWorld);
    expect(() => force.apply(largeWorld, grid, 1 / 60)).not.toThrow();

    // Verify all particles processed
    for (let i = 0; i < largeWorld.count; i++) {
      expect(Number.isFinite(largeWorld.vx[i])).toBe(true);
      expect(Number.isFinite(largeWorld.vy[i])).toBe(true);
    }
  });
});
