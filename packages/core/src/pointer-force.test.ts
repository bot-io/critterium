/**
 * PointerForce tests
 */
import { describe, it, expect } from 'vitest';
import { PointerForce } from './pointer-force.js';
import { World, SpatialHashGrid } from './index.js';

function makeWorld(count: number, cx = 400, cy = 300): World {
  return new World({
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    types: [{ count, color: '#ff0000', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
  });
}

function makeGrid(): SpatialHashGrid {
  return new SpatialHashGrid(800, 600, 150, 500);
}

describe('PointerForce', () => {
  it('has id "pointer"', () => {
    const pf = new PointerForce();
    expect(pf.id).toBe('pointer');
  });

  it('default params: strength=200, radius=150, falloff=linear', () => {
    const pf = new PointerForce();
    expect(pf.params.strength).toBe(200);
    expect(pf.params.radius).toBe(150);
    expect(pf.params.falloff).toBe('linear');
  });

  it('setPosition updates px, py, active', () => {
    const pf = new PointerForce();
    pf.setPosition(100, 200, true);
    expect(pf.px).toBe(100);
    expect(pf.py).toBe(200);
    expect(pf.active).toBe(true);
  });

  it('does nothing when not active', () => {
    const world = makeWorld(5);
    const grid = makeGrid();
    const pf = new PointerForce(200, 150);
    // Set position but NOT active
    pf.setPosition(400, 300, false);
    const vxBefore = new Float32Array(world.vx);
    const vyBefore = new Float32Array(world.vy);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    for (let i = 0; i < world.count; i++) {
      expect(world.vx[i]).toBe(vxBefore[i]);
      expect(world.vy[i]).toBe(vyBefore[i]);
    }
  });

  it('attracts particles toward pointer when strength > 0', () => {
    // Place one particle at origin, pointer at (100, 0)
    const world = makeWorld(1);
    world.x[0] = 0;
    world.y[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200, 'linear');
    pf.setPosition(100, 0, true);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    // Particle should have moved toward pointer (positive vx)
    expect(world.vx[0]).toBeGreaterThan(0);
  });

  it('repels particles from pointer when strength < 0', () => {
    const world = makeWorld(1);
    world.x[0] = 0;
    world.y[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(-200, 200, 'linear');
    pf.setPosition(100, 0, true);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    // Particle should have moved away from pointer (negative vx)
    expect(world.vx[0]).toBeLessThan(0);
  });

  it('does not affect particles outside radius', () => {
    const world = makeWorld(1);
    world.x[0] = 0;
    world.y[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 50, 'linear'); // radius 50
    pf.setPosition(400, 300, true); // far away

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });

  it('force is stronger when particle is closer (linear falloff)', () => {
    const world1 = makeWorld(1);
    world1.x[0] = 50;
    world1.y[0] = 0;
    world1.vx[0] = 0;
    world1.vy[0] = 0;

    const world2 = makeWorld(1);
    world2.x[0] = 140;
    world2.y[0] = 0;
    world2.vx[0] = 0;
    world2.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200, 'linear');
    pf.setPosition(0, 0, true);

    grid.rebuild(world1);
    pf.apply(world1, grid, 1 / 60);
    const forceNear = Math.abs(world1.vx[0]);

    grid.rebuild(world2);
    pf.apply(world2, grid, 1 / 60);
    const forceFar = Math.abs(world2.vx[0]);

    expect(forceNear).toBeGreaterThan(forceFar);
  });

  it('constant falloff applies same force regardless of distance', () => {
    const world1 = makeWorld(1);
    world1.x[0] = 50;
    world1.y[0] = 0;
    world1.vx[0] = 0;
    world1.vy[0] = 0;

    const world2 = makeWorld(1);
    world2.x[0] = 140;
    world2.y[0] = 0;
    world2.vx[0] = 0;
    world2.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200, 'constant');
    pf.setPosition(0, 0, true);

    grid.rebuild(world1);
    pf.apply(world1, grid, 1 / 60);
    const forceNear = Math.abs(world1.vx[0]);

    grid.rebuild(world2);
    pf.apply(world2, grid, 1 / 60);
    const forceFar = Math.abs(world2.vx[0]);

    // Should be very close (within floating point precision)
    expect(Math.abs(forceNear - forceFar)).toBeLessThan(0.01);
  });

  it('works with multiple particles', () => {
    const world = makeWorld(5);
    const grid = makeGrid();
    const pf = new PointerForce(200, 300, 'linear');
    pf.setPosition(400, 300, true);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    // All particles within radius should have some velocity change
    let anyChanged = false;
    for (let i = 0; i < world.count; i++) {
      const dx = 400 - world.x[i];
      const dy = 300 - world.y[i];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 300) {
        if (world.vx[i] !== 0 || world.vy[i] !== 0) {
          anyChanged = true;
        }
      }
    }
    expect(anyChanged).toBe(true);
  });

  it('setPosition can deactivate pointer', () => {
    const world = makeWorld(1);
    world.x[0] = 50;
    world.y[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200);
    pf.setPosition(0, 0, true);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);
    expect(world.vx[0]).not.toBe(0);

    // Deactivate
    pf.setPosition(0, 0, false);
    world.vx[0] = 0;
    world.vy[0] = 0;

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);
    expect(world.vx[0]).toBe(0);
  });

  it('inverse falloff is stronger at close range', () => {
    const world1 = makeWorld(1);
    world1.x[0] = 10;
    world1.y[0] = 0;
    world1.vx[0] = 0;
    world1.vy[0] = 0;

    const world2 = makeWorld(1);
    world2.x[0] = 100;
    world2.y[0] = 0;
    world2.vx[0] = 0;
    world2.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200, 'inverse');
    pf.setPosition(0, 0, true);

    grid.rebuild(world1);
    pf.apply(world1, grid, 1 / 60);
    const forceNear = Math.abs(world1.vx[0]);

    grid.rebuild(world2);
    pf.apply(world2, grid, 1 / 60);
    const forceFar = Math.abs(world2.vx[0]);

    expect(forceNear).toBeGreaterThan(forceFar);
  });

  it('skip particles extremely close to pointer (< 0.001 dist)', () => {
    const world = makeWorld(1);
    world.x[0] = 0.0001;
    world.y[0] = 0;
    world.vx[0] = 0;
    world.vy[0] = 0;

    const grid = makeGrid();
    const pf = new PointerForce(200, 200, 'linear');
    pf.setPosition(0, 0, true);

    grid.rebuild(world);
    pf.apply(world, grid, 1 / 60);

    // Should be skipped (distSq < 0.001)
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });
});
