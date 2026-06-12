import { describe, it, expect } from 'vitest';
import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  type InteractionEntry,
} from './index.js';
import { DEAD, ALIVE, type SpeciesConfig } from './ecosystem.js';
import { EcosystemWorld } from './ecosystem-world.js';
import { processEating } from './eating.js';
import { processReproduction } from './lifecycle.js';

const DT = 1 / 60;

function species(overrides: Partial<SpeciesConfig> = {}): SpeciesConfig {
  return {
    count: 1, color: '#ff0000', radius: 3, initialSpeed: 50, maxSpeed: 100, name: 'Test',
    energy: { maxEnergy: 100, initialEnergy: 50, movementCostPerSec: 1, reproductionCost: 30, idleDrainPerSec: 0.5, energyGainPerPrey: [0] },
    lifecycle: { maxAgeSec: 60, starvationDamagePerSec: 5, reproductionCooldownSec: 3 },
    diet: { canEat: new Set<number>() },
    ...overrides,
  };
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function makeGrid(w: number, h: number, maxP = 100): SpatialHashGrid {
  return new SpatialHashGrid(w, h, 200, maxP);
}

/** Build an EcosystemConfig with defaults and proper interactionRules. */
function ecoCfg(
  speciesList: SpeciesConfig[],
  extra: Record<string, any> = {},
) {
  const n = speciesList.length;
  const rules: (any | null)[][] = [];
  for (let i = 0; i < n; i++) {
    rules.push(new Array(n).fill(null));
  }
  return {
    width: 400, height: 300, boundaryMode: 'bounce' as const,
    seed: 42, populationCap: 500,
    species: speciesList,
    interactionRules: rules,
    ...extra,
  };
}

// ─── Forces ──────────────────────────────────────────────────

describe('sim: forces', () => {
  it('attraction moves particles closer', () => {
    const world = new World({
      width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 100 },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 100 },
      ],
    });
    world.x[0] = 100; world.y[0] = 150; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 130; world.y[1] = 150; world.vx[1] = 0; world.vy[1] = 0;

    const grid = makeGrid(400, 300);
    grid.rebuild(world);

    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 50, radius: 200, falloff: 'constant' });
    matrix.set(1, 0, { strength: 50, radius: 200, falloff: 'constant' });
    const pf = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const d0 = dist(world.x[0], world.y[0], world.x[1], world.y[1]);

    pf.apply(world, grid, DT);
    world.clampVelocities();
    world.integrate(DT);

    expect(dist(world.x[0], world.y[0], world.x[1], world.y[1])).toBeLessThan(d0);
  });

  it('repulsion moves particles apart', () => {
    const world = new World({
      width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 100 },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 100 },
      ],
    });
    world.x[0] = 200; world.y[0] = 150; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 210; world.y[1] = 150; world.vx[1] = 0; world.vy[1] = 0;

    const grid = makeGrid(400, 300);
    grid.rebuild(world);

    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: -50, radius: 200, falloff: 'constant' });
    matrix.set(1, 0, { strength: -50, radius: 200, falloff: 'constant' });
    const pf = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const d0 = dist(world.x[0], world.y[0], world.x[1], world.y[1]);

    pf.apply(world, grid, DT);
    world.clampVelocities();
    world.integrate(DT);

    expect(dist(world.x[0], world.y[0], world.x[1], world.y[1])).toBeGreaterThan(d0);
  });

  it('no force + no drag = stationary particles stay put', () => {
    const world = new World({
      width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 100 }],
    });
    world.x[0] = 200; world.y[0] = 150; world.vx[0] = 0; world.vy[0] = 0;
    for (let i = 0; i < 10; i++) { world.integrate(DT); world.applyBoundaries(); }
    expect(world.x[0]).toBeCloseTo(200, 5);
    expect(world.y[0]).toBeCloseTo(150, 5);
  });

  it('drag decays velocity over time', () => {
    const world = new World({
      width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    world.x[0] = 200; world.y[0] = 150; world.vx[0] = 100; world.vy[0] = 0;
    const grid = makeGrid(400, 300);
    const drag = new DragForce(2.0);
    for (let i = 0; i < 60; i++) {
      drag.apply(world, grid, DT);
      world.clampVelocities();
      world.integrate(DT);
      world.applyBoundaries();
    }
    expect(world.vx[0]).toBeCloseTo(100 * Math.pow(1 - 2 * DT, 60), 1);
  });

  it('force beyond radius has no effect', () => {
    const world = new World({
      width: 800, height: 600, boundaryMode: 'bounce' as const, seed: 42,
      types: [
        { count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 500 },
        { count: 1, color: '#0f0', radius: 3, initialSpeed: 0, maxSpeed: 500 },
      ],
    });
    world.x[0] = 400; world.y[0] = 300; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 600; world.y[1] = 300; world.vx[1] = 0; world.vy[1] = 0;
    const grid = makeGrid(800, 600);
    grid.rebuild(world);

    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: 100, radius: 100, falloff: 'constant' });
    matrix.set(1, 0, { strength: 100, radius: 100, falloff: 'constant' });
    new PairwiseForce(matrix, { strength: 0, radius: 0 }).apply(world, grid, DT);
    expect(world.vx[0]).toBe(0);
    expect(world.vy[0]).toBe(0);
  });
});

// ─── Eating ──────────────────────────────────────────────────

describe('sim: eating', () => {
  it('predator eats overlapping prey', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, name: 'Prey' }),
      species({ count: 1, name: 'Predator', diet: { canEat: new Set([0]) },
        energy: { maxEnergy: 100, initialEnergy: 50, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [25, 0] } }),
    ]));
    eco.world.x[0] = 200; eco.world.y[0] = 150;
    eco.world.x[1] = 200; eco.world.y[1] = 150;
    const r = processEating(eco);
    expect(r.killed).toBe(1);
    expect(eco.eco.alive[0]).toBe(DEAD);
    expect(eco.eco.alive[1]).toBe(ALIVE);
  });

  it('predator gains energy from eating', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, name: 'Prey' }),
      species({ count: 1, name: 'Predator', diet: { canEat: new Set([0]) },
        energy: { maxEnergy: 200, initialEnergy: 50, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [25, 0] } }),
    ]));
    const e0 = eco.eco.energy[1];
    eco.world.x[0] = 200; eco.world.y[0] = 150;
    eco.world.x[1] = 200; eco.world.y[1] = 150;
    processEating(eco);
    expect(eco.eco.energy[1]).toBe(e0 + 25);
  });

  it('predator cannot eat beyond radius', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, name: 'Prey', radius: 3 }),
      species({ count: 1, name: 'Predator', radius: 5, diet: { canEat: new Set([0]) } }),
    ]));
    eco.world.x[0] = 100; eco.world.y[0] = 150;
    eco.world.x[1] = 200; eco.world.y[1] = 150;
    expect(processEating(eco).killed).toBe(0);
    expect(eco.eco.alive[0]).toBe(ALIVE);
  });

  it('prey can only be eaten once per step', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, name: 'Prey' }),
      species({ count: 2, name: 'Predator', diet: { canEat: new Set([0]) } }),
    ]));
    eco.world.x[0] = 200; eco.world.y[0] = 150;
    eco.world.x[1] = 200; eco.world.y[1] = 150;
    eco.world.x[2] = 200; eco.world.y[2] = 150;
    expect(processEating(eco).killed).toBe(1);
    expect(eco.eco.alive[0]).toBe(DEAD);
  });
});

// ─── Energy ──────────────────────────────────────────────────

describe('sim: energy', () => {
  it('movement drains energy', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, energy: { maxEnergy: 100, initialEnergy: 100, movementCostPerSec: 10, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [0] } }),
    ]));
    eco.world.vx[0] = 50; eco.world.vy[0] = 0;
    const e0 = eco.eco.energy[0];
    eco.processLifecycle(DT);
    expect(eco.eco.energy[0]).toBeCloseTo(e0 - 10 * 0.5 * DT, 4);
  });

  it('idle drain reduces energy', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, energy: { maxEnergy: 100, initialEnergy: 100, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 5, energyGainPerPrey: [0] } }),
    ]));
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    const e0 = eco.eco.energy[0];
    eco.processLifecycle(DT);
    expect(eco.eco.energy[0]).toBeCloseTo(e0 - 5 * DT, 4);
  });

  it('energy clamps to 0', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, energy: { maxEnergy: 100, initialEnergy: 0.001, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 100, energyGainPerPrey: [0] } }),
    ]));
    eco.processLifecycle(DT);
    expect(eco.eco.energy[0]).toBe(0);
  });
});

// ─── Lifecycle ───────────────────────────────────────────────

describe('sim: lifecycle', () => {
  it('particle dies of old age', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1,
        energy: { maxEnergy: 999, initialEnergy: 999, movementCostPerSec: 0, reproductionCost: 999, idleDrainPerSec: 0, energyGainPerPrey: [0] },
        lifecycle: { maxAgeSec: 2, starvationDamagePerSec: 0, reproductionCooldownSec: 999 } }),
    ]));
    for (let i = 0; i < 130; i++) eco.processLifecycle(DT);
    expect(eco.eco.alive[0]).toBe(DEAD);
  });

  it('dead particles are skipped', () => {
    const eco = new EcosystemWorld(ecoCfg([species({ count: 1 })]));
    eco.kill(0);
    const age = eco.eco.age[0];
    eco.processLifecycle(DT);
    expect(eco.eco.age[0]).toBe(age);
  });
});

// ─── Reproduction ────────────────────────────────────────────

describe('sim: reproduction', () => {
  it('particle with enough energy reproduces', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1,
        energy: { maxEnergy: 200, initialEnergy: 100, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [0] },
        lifecycle: { maxAgeSec: 999, starvationDamagePerSec: 0, reproductionCooldownSec: 0 } }),
    ]));
    expect(processReproduction(eco)).toBe(1);
    expect(eco.aliveCount).toBe(2);
  });

  it('reproduction deducts energy', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1,
        energy: { maxEnergy: 200, initialEnergy: 100, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [0] },
        lifecycle: { maxAgeSec: 999, starvationDamagePerSec: 0, reproductionCooldownSec: 0 } }),
    ]));
    const e0 = eco.eco.energy[0];
    processReproduction(eco);
    expect(eco.eco.energy[0]).toBe(e0 - 30);
  });

  it('insufficient energy prevents reproduction', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1,
        energy: { maxEnergy: 200, initialEnergy: 20, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [0] },
        lifecycle: { maxAgeSec: 999, starvationDamagePerSec: 0, reproductionCooldownSec: 0 } }),
    ]));
    expect(processReproduction(eco)).toBe(0);
  });

  it('respects population cap', () => {
    const eco = new EcosystemWorld(ecoCfg(
      [species({ count: 1,
        energy: { maxEnergy: 200, initialEnergy: 100, movementCostPerSec: 0, reproductionCost: 30, idleDrainPerSec: 0, energyGainPerPrey: [0] },
        lifecycle: { maxAgeSec: 999, starvationDamagePerSec: 0, reproductionCooldownSec: 0 } })],
      { populationCap: 1 },
    ));
    expect(processReproduction(eco)).toBe(0);
  });
});

// ─── Boundaries ──────────────────────────────────────────────

describe('sim: boundaries', () => {
  it('bounce reflects at left wall', () => {
    const w = new World({ width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }] });
    w.x[0] = -5; w.y[0] = 150; w.vx[0] = -50; w.vy[0] = 0;
    w.applyBoundaries();
    expect(w.x[0]).toBe(5); expect(w.vx[0]).toBe(50);
  });

  it('bounce reflects at right wall', () => {
    const w = new World({ width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }] });
    w.x[0] = 410; w.y[0] = 150; w.vx[0] = 50; w.vy[0] = 0;
    w.applyBoundaries();
    expect(w.x[0]).toBe(390); expect(w.vx[0]).toBe(-50);
  });

  it('wrap wraps position', () => {
    const w = new World({ width: 400, height: 300, boundaryMode: 'wrap' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }] });
    w.x[0] = 410; w.y[0] = 310;
    w.applyBoundaries();
    expect(w.x[0]).toBeCloseTo(10, 5); expect(w.y[0]).toBeCloseTo(10, 5);
  });

  it('wrap handles negative positions', () => {
    const w = new World({ width: 400, height: 300, boundaryMode: 'wrap' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 200 }] });
    w.x[0] = -10; w.y[0] = -5;
    w.applyBoundaries();
    expect(w.x[0]).toBeCloseTo(390, 5); expect(w.y[0]).toBeCloseTo(295, 5);
  });
});

// ─── InteractionMatrix.forceAtDistance ────────────────────────

describe('sim: InteractionMatrix.forceAtDistance', () => {
  it('linear falloff at boundary = 0', () => {
    const e: InteractionEntry = { strength: 100, radius: 50, falloff: 'linear' };
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBe(0);
  });
  it('linear falloff at half radius', () => {
    const e: InteractionEntry = { strength: 100, radius: 100, falloff: 'linear' };
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBeCloseTo(50, 1);
  });
  it('constant falloff same at all distances', () => {
    const e: InteractionEntry = { strength: 80, radius: 100, falloff: 'constant' };
    expect(InteractionMatrix.forceAtDistance(e, 10)).toBe(80);
    expect(InteractionMatrix.forceAtDistance(e, 99)).toBe(80);
  });
  it('returns 0 when distance >= radius', () => {
    const e: InteractionEntry = { strength: 100, radius: 50, falloff: 'constant' };
    expect(InteractionMatrix.forceAtDistance(e, 50)).toBe(0);
    expect(InteractionMatrix.forceAtDistance(e, 100)).toBe(0);
  });
  it('returns 0 when distance <= 0', () => {
    const e: InteractionEntry = { strength: 100, radius: 50, falloff: 'linear' };
    expect(InteractionMatrix.forceAtDistance(e, 0)).toBe(0);
    expect(InteractionMatrix.forceAtDistance(e, -10)).toBe(0);
  });
});

// ─── Velocity Clamping ──────────────────────────────────────

describe('sim: velocity clamping', () => {
  it('velocity clamped to maxSpeed', () => {
    const w = new World({ width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 1, color: '#f00', radius: 3, initialSpeed: 0, maxSpeed: 50 }] });
    w.vx[0] = 200; w.vy[0] = 200;
    w.clampVelocities();
    expect(Math.sqrt(w.vx[0] ** 2 + w.vy[0] ** 2)).toBeCloseTo(50, 5);
  });
});

// ─── Ecosystem Edge Cases ────────────────────────────────────

describe('sim: ecosystem edge cases', () => {
  it('spawn at population cap returns -1', () => {
    const eco = new EcosystemWorld(ecoCfg([species({ count: 2 })], { populationCap: 2 }));
    expect(eco.spawn(0)).toBe(-1);
  });
  it('killing a dead particle is no-op', () => {
    const eco = new EcosystemWorld(ecoCfg([species({ count: 1 })]));
    eco.kill(0); eco.kill(0);
    expect(eco.aliveCount).toBe(0);
  });
  it('freed slot is reused', () => {
    const eco = new EcosystemWorld(ecoCfg([species({ count: 2 })]));
    eco.kill(0);
    expect(eco.spawn(0, 200, 150)).toBe(0);
  });
  it('zero particles creates empty world', () => {
    const eco = new EcosystemWorld(ecoCfg([species({ count: 0 })]));
    expect(eco.aliveCount).toBe(0);
  });
});

// ─── Multi-Step Integration ──────────────────────────────────

describe('sim: multi-step', () => {
  it('two repelling particles move apart over 3s', () => {
    const world = new World({
      width: 800, height: 600, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 2, color: '#4c4', radius: 3, initialSpeed: 0, maxSpeed: 200 }],
    });
    world.x[0] = 400; world.y[0] = 300; world.vx[0] = 0; world.vy[0] = 0;
    world.x[1] = 420; world.y[1] = 300; world.vx[1] = 0; world.vy[1] = 0;

    const grid = makeGrid(800, 600);
    const matrix = new InteractionMatrix(1);
    matrix.set(0, 0, { strength: -30, radius: 200, falloff: 'linear' });
    const pf = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const drag = new DragForce(0.8);
    const d0 = dist(world.x[0], world.y[0], world.x[1], world.y[1]);

    for (let i = 0; i < 180; i++) {
      grid.rebuild(world);
      pf.apply(world, grid, DT);
      drag.apply(world, grid, DT);
      world.clampVelocities();
      world.integrate(DT);
      world.applyBoundaries();
    }
    expect(dist(world.x[0], world.y[0], world.x[1], world.y[1])).toBeGreaterThan(d0 * 1.5);
  });

  it('predator catches prey over 5s', () => {
    const eco = new EcosystemWorld(ecoCfg([
      species({ count: 1, name: 'Prey', radius: 3, maxSpeed: 60 }),
      species({ count: 1, name: 'Predator', radius: 5, maxSpeed: 80,
        diet: { canEat: new Set([0]) },
        energy: { maxEnergy: 200, initialEnergy: 100, movementCostPerSec: 0, reproductionCost: 50, idleDrainPerSec: 0, energyGainPerPrey: [0, 25] } }),
    ]));
    eco.world.x[0] = 200; eco.world.y[0] = 150; eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.x[1] = 250; eco.world.y[1] = 150; eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    const grid = makeGrid(400, 300);
    const matrix = new InteractionMatrix(2);
    matrix.set(0, 1, { strength: -60, radius: 200, falloff: 'linear' });
    matrix.set(1, 0, { strength: 80, radius: 200, falloff: 'linear' });
    const pf = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const drag = new DragForce(0.5);

    for (let i = 0; i < 300; i++) {
      grid.rebuild(eco.world);
      pf.apply(eco.world, grid, DT);
      drag.apply(eco.world, grid, DT);
      eco.world.clampVelocities();
      eco.world.integrate(DT);
      eco.world.applyBoundaries();
      processEating(eco);
    }
    expect(eco.eco.alive[0]).toBe(DEAD);
  });

  it('determinism: same seed = identical trajectories', () => {
    const cfg = {
      width: 400, height: 300, boundaryMode: 'bounce' as const, seed: 42,
      types: [{ count: 10, color: '#f00', radius: 3, initialSpeed: 50, maxSpeed: 100 }],
    };
    const w1 = new World(cfg);
    const w2 = new World(cfg);
    const g1 = makeGrid(400, 300);
    const g2 = makeGrid(400, 300);
    const matrix = new InteractionMatrix(1);
    matrix.set(0, 0, { strength: -20, radius: 80, falloff: 'linear' });
    const pf1 = new PairwiseForce(matrix, { strength: 0, radius: 0 });
    const pf2 = new PairwiseForce(matrix, { strength: 0, radius: 0 });

    for (let i = 0; i < 60; i++) {
      g1.rebuild(w1); g2.rebuild(w2);
      pf1.apply(w1, g1, DT); pf2.apply(w2, g2, DT);
      w1.clampVelocities(); w2.clampVelocities();
      w1.integrate(DT); w2.integrate(DT);
      w1.applyBoundaries(); w2.applyBoundaries();
    }
    for (let i = 0; i < 10; i++) {
      expect(w1.x[i]).toBeCloseTo(w2.x[i], 10);
      expect(w1.y[i]).toBeCloseTo(w2.y[i], 10);
      expect(w1.vx[i]).toBeCloseTo(w2.vx[i], 10);
      expect(w1.vy[i]).toBeCloseTo(w2.vy[i], 10);
    }
  });
});
