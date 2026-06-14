/**
 * Force Registry — Unit Tests
 *
 * Verifies that all built-in force types can be created via the registry,
 * have correct metadata, and produce working Force instances.
 */

import { describe, it, expect } from 'vitest';
import {
  createForce,
  getForceDescriptor,
  listForceTypes,
  getRegisteredTypes,
} from './force-registry.js';
import { World, SpatialHashGrid, type SimulationConfig } from './index.js';

function makeWorld(count: number): World {
  const config: SimulationConfig = {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    types: [{ count, color: '#44cc44', radius: 3, initialSpeed: 50, maxSpeed: 200 }],
  };
  return new World(config);
}

const grid = new SpatialHashGrid(800, 600, 150, 10);
grid.rebuild(makeWorld(1));

describe('ForceRegistry — Built-in types', () => {
  it('registers all 8 built-in force types', () => {
    const types = getRegisteredTypes();
    expect(types).toContain('drag');
    expect(types).toContain('wander');
    expect(types).toContain('gravity');
    expect(types).toContain('flow-field');
    expect(types).toContain('vortex');
    expect(types).toContain('pointer');
    expect(types).toContain('alignment');
    expect(types).toContain('boids');
    expect(types.length).toBe(8);
  });

  it('listForceTypes returns descriptors with display names', () => {
    const descs = listForceTypes();
    expect(descs.length).toBe(8);
    for (const d of descs) {
      expect(d.type).toBeTruthy();
      expect(d.displayName).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.defaultParams).toBeDefined();
      expect(d.paramSchema.length).toBeGreaterThan(0);
    }
  });
});

describe('ForceRegistry — createForce', () => {
  it('creates DragForce with default params', () => {
    const f = createForce('drag');
    expect(f.id).toBe('drag');
    expect(f.params.coefficient).toBe(0.8);
  });

  it('creates DragForce with custom params', () => {
    const f = createForce('drag', { coefficient: 2.5 });
    expect(f.params.coefficient).toBe(2.5);
  });

  it('creates WanderForce with default params', () => {
    const f = createForce('wander');
    expect(f.id).toBe('wander');
    expect(f.params.strength).toBe(40);
    expect(f.params.rate).toBe(2.5);
  });

  it('creates WanderForce with custom params', () => {
    const f = createForce('wander', { strength: 100, rate: 5 });
    expect(f.params.strength).toBe(100);
    expect(f.params.rate).toBe(5);
  });

  it('creates GravityForce', () => {
    const f = createForce('gravity', { acceleration: 500 });
    expect(f.id).toBe('gravity');
    expect(f.params.acceleration).toBe(500);
  });

  it('creates FlowFieldForce with turbulence mode', () => {
    const f = createForce('flow-field', {
      strength: 80,
      mode: 'turbulence',
      turbulenceScale: 0.05,
    });
    expect(f.id).toBe('flow-field');
    expect(f.params.strength).toBe(80);
    expect(f.params.mode).toBe('turbulence');
  });

  it('creates VortexForce with custom center', () => {
    const f = createForce('vortex', { cx: 200, cy: 200, strength: 300, radialStrength: -50 });
    expect(f.id).toBe('vortex');
    expect(f.params.cx).toBe(200);
    expect(f.params.strength).toBe(300);
    expect(f.params.radialStrength).toBe(-50);
  });

  it('creates PointerForce', () => {
    const f = createForce('pointer', { strength: 300, radius: 200 });
    expect(f.id).toBe('pointer');
    expect(f.params.strength).toBe(300);
  });

  it('creates AlignmentForce with default params', () => {
    const f = createForce('alignment');
    expect(f.id).toBe('alignment');
    expect(f.params.radius).toBe(60);
    expect(f.params.strength).toBe(40);
    expect(f.params.crossType).toBe(false);
  });

  it('creates AlignmentForce with custom params', () => {
    const f = createForce('alignment', { radius: 100, strength: 80, crossType: true });
    expect(f.params.radius).toBe(100);
    expect(f.params.strength).toBe(80);
    expect(f.params.crossType).toBe(true);
  });

  it('creates BoidsForce with default params', () => {
    const f = createForce('boids');
    expect(f.id).toBe('boids');
    expect(f.params.separationRadius).toBe(25);
    expect(f.params.separationStrength).toBe(50);
    expect(f.params.alignmentRadius).toBe(60);
    expect(f.params.alignmentStrength).toBe(30);
    expect(f.params.cohesionRadius).toBe(60);
    expect(f.params.cohesionStrength).toBe(20);
    expect(f.params.crossType).toBe(false);
  });

  it('creates BoidsForce with custom params', () => {
    const f = createForce('boids', {
      separationRadius: 40,
      separationStrength: 100,
      alignmentRadius: 80,
      alignmentStrength: 60,
      cohesionRadius: 100,
      cohesionStrength: 40,
      crossType: true,
    });
    expect(f.params.separationRadius).toBe(40);
    expect(f.params.separationStrength).toBe(100);
    expect(f.params.alignmentRadius).toBe(80);
    expect(f.params.cohesionStrength).toBe(40);
    expect(f.params.crossType).toBe(true);
  });

  it('ignores extra/unknown params gracefully (forward-compatible)', () => {
    const f = createForce('drag', { coefficient: 1.5, unknownKey: 42, bogus: 'ignored' });
    expect(f.id).toBe('drag');
    expect(f.params.coefficient).toBe(1.5);
  });

  it('throws on unknown type', () => {
    expect(() => createForce('nonexistent')).toThrow(/Unknown force type/);
  });
});

describe('ForceRegistry — apply forces', () => {
  it('created DragForce actually applies drag', () => {
    const world = makeWorld(3);
    world.vx[0] = 100;
    world.vy[0] = 100;
    world.vx[1] = 50;
    world.vy[1] = 0;
    world.vx[2] = -80;
    world.vy[2] = 30;

    const f = createForce('drag', { coefficient: 1.0 });
    f.apply(world, grid, 0.1);

    // v *= (1 - coeff * dt) = (1 - 0.1) = 0.9
    expect(world.vx[0]).toBeCloseTo(90, 1);
    expect(world.vy[0]).toBeCloseTo(90, 1);
    expect(world.vx[1]).toBeCloseTo(45, 1);
  });

  it('created GravityForce actually applies gravity', () => {
    const world = makeWorld(2);
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 10;
    world.vy[1] = 10;

    const f = createForce('gravity', { acceleration: 200 });
    f.apply(world, grid, 0.5);

    // vy += 200 * 0.5 = 100
    expect(world.vy[0]).toBeCloseTo(100, 1);
    expect(world.vy[1]).toBeCloseTo(110, 1);
    // vx unchanged
    expect(world.vx[0]).toBe(0);
    expect(world.vx[1]).toBe(10);
  });

  it('created VortexForce applies tangential force', () => {
    const world = makeWorld(1);
    world.x[0] = 500;
    world.y[0] = 300; // 100px from vortex center (400,300)
    world.vx[0] = 0;
    world.vy[0] = 0;

    const f = createForce('vortex', {
      cx: 400,
      cy: 300,
      strength: 100,
      radius: 300,
      radialStrength: 0,
    });
    f.apply(world, grid, 1.0);

    // Should have non-zero velocity (tangential force applied)
    const speed = Math.sqrt(world.vx[0] ** 2 + world.vy[0] ** 2);
    expect(speed).toBeGreaterThan(0);
  });

  it('created WanderForce applies wander force', () => {
    const world = makeWorld(2);
    world.vx[0] = 50;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 50;

    const f = createForce('wander', { strength: 100, rate: 3 });
    f.apply(world, grid, 0.1);

    // Both particles should have some velocity change
    const speed0 = Math.sqrt(world.vx[0] ** 2 + world.vy[0] ** 2);
    const speed1 = Math.sqrt(world.vx[1] ** 2 + world.vy[1] ** 2);
    expect(speed0).toBeGreaterThan(0);
    expect(speed1).toBeGreaterThan(0);
  });

  it('created AlignmentForce steers toward neighbor heading', () => {
    const world = makeWorld(3);
    // Co-locate all 3 particles so they are mutual neighbors
    world.x[0] = 400;
    world.y[0] = 300;
    world.x[1] = 400;
    world.y[1] = 300;
    world.x[2] = 400;
    world.y[2] = 300;
    // Divergent headings: right, down, left → average heading is downward
    world.vx[0] = 100;
    world.vy[0] = 0;
    world.vx[1] = 0;
    world.vy[1] = 100;
    world.vx[2] = -100;
    world.vy[2] = 0;
    grid.rebuild(world);

    const f = createForce('alignment', { radius: 60, strength: 40 });
    f.apply(world, grid, 1.0);

    // Particles 0 and 2 (no downward velocity) should gain downward component
    expect(world.vy[0]).toBeGreaterThan(0);
    expect(world.vy[2]).toBeGreaterThan(0);
  });

  it('created AlignmentForce respects crossType=false (ignores other types)', () => {
    const world = makeWorld(2);
    // Two particles at same location, but different types
    world.x[0] = 400;
    world.y[0] = 300;
    world.type[0] = 0;
    world.x[1] = 400;
    world.y[1] = 300;
    world.type[1] = 1;
    world.vx[0] = 0;
    world.vy[0] = 0;
    world.vx[1] = 100;
    world.vy[1] = 0; // type-1 moving right
    grid.rebuild(world);

    // crossType=false: particle 0 (type 0) should NOT align with type 1
    const f = createForce('alignment', { radius: 60, strength: 40, crossType: false });
    f.apply(world, grid, 1.0);
    expect(world.vx[0]).toBe(0); // unchanged — no same-type neighbors

    // crossType=true: particle 0 should now align with type 1
    const f2 = createForce('alignment', { radius: 60, strength: 40, crossType: true });
    f2.apply(world, grid, 1.0);
    expect(world.vx[0]).toBeGreaterThan(0); // gained rightward velocity
  });
});

describe('ForceRegistry — descriptors', () => {
  it('getForceDescriptor returns correct metadata', () => {
    const d = getForceDescriptor('vortex');
    expect(d).toBeDefined();
    expect(d!.type).toBe('vortex');
    expect(d!.displayName).toBe('Vortex');
    expect(d!.paramSchema.length).toBe(6); // cx, cy, strength, radial, radius, falloff
  });

  it('paramSchema includes slider constraints', () => {
    const d = getForceDescriptor('drag');
    expect(d).toBeDefined();
    const coeff = d!.paramSchema.find((s) => s.key === 'coefficient');
    expect(coeff).toBeDefined();
    expect(coeff!.min).toBe(0);
    expect(coeff!.max).toBe(10);
    expect(coeff!.step).toBe(0.1);
  });

  it('select params have options', () => {
    const d = getForceDescriptor('flow-field');
    const modeParam = d!.paramSchema.find((s) => s.key === 'mode');
    expect(modeParam!.type).toBe('select');
    expect(modeParam!.options).toContain('uniform');
    expect(modeParam!.options).toContain('turbulence');
  });

  it('getForceDescriptor returns undefined for unknown type', () => {
    expect(getForceDescriptor('nonexistent')).toBeUndefined();
  });

  it('every registered type has a matching descriptor (no drift)', () => {
    const types = getRegisteredTypes();
    const descs = listForceTypes();
    expect(types.length).toBe(descs.length);
    for (const t of types) {
      expect(descs.find((d) => d.type === t)).toBeDefined();
    }
  });

  it('alignment descriptor has correct metadata', () => {
    const d = getForceDescriptor('alignment');
    expect(d).toBeDefined();
    expect(d!.displayName).toBe('Alignment');
    expect(d!.paramSchema.length).toBe(3); // radius, strength, crossType
    const radiusSchema = d!.paramSchema.find((s) => s.key === 'radius');
    expect(radiusSchema).toBeDefined();
    expect(radiusSchema!.min).toBe(10);
    expect(radiusSchema!.max).toBe(300);
  });
});
