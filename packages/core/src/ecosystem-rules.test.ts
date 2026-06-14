/**
 * Ecosystem Rules — Tests for photosynthesis, predator-prey balance, cannibalism
 *
 * Tests the new gameplay rules:
 * 1. Negative idleDrainPerSec = photosynthesis (plants gain energy passively)
 * 2. Predators have 2× energy capacity and 2× reproduction cost of prey
 * 3. Cannibalism: a species can eat its own kind (canEat includes self-index)
 */

import { describe, it, expect } from 'vitest';
import { EcosystemWorld } from './ecosystem-world.js';
import { processEating } from './eating.js';
import { SpatialHashGrid } from './index.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  type SpeciesConfig,
  type EcosystemConfig,
  DEAD,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeConfig(species: SpeciesConfig[], cap = 100): EcosystemConfig {
  const n = species.length;
  // Build NxN null interactionRules matrix
  const interactionRules: (any | null)[][] = [];
  for (let i = 0; i < n; i++) {
    const row: (any | null)[] = [];
    for (let j = 0; j < n; j++) row.push(null);
    interactionRules.push(row);
  }
  return {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    populationCap: cap,
    species,
    interactionRules,
  };
}

function plantSpecies(name: string, count: number): SpeciesConfig {
  return {
    name,
    count,
    color: '#3aaa3a',
    radius: 2,
    initialSpeed: 2,
    maxSpeed: 5,
    energy: defaultEnergyConfig({
      maxEnergy: 30,
      initialEnergy: 10,
      movementCostPerSec: 0,
      reproductionCost: 5,
      idleDrainPerSec: -5, // photosynthesis: gains 5 energy/sec
      energyGainPerPrey: [],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 60,
      starvationDamagePerSec: 0, // plants don't starve
      reproductionCooldownSec: 1.5,
    }),
    diet: defaultDietConfig(),
  };
}

function preySpecies(name: string, count: number): SpeciesConfig {
  return {
    name,
    count,
    color: '#d4a373',
    radius: 3,
    initialSpeed: 55,
    maxSpeed: 100,
    energy: defaultEnergyConfig({
      maxEnergy: 80,
      initialEnergy: 40,
      movementCostPerSec: 0,
      reproductionCost: 20,
      idleDrainPerSec: 1,
      energyGainPerPrey: [15],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 40,
      starvationDamagePerSec: 6,
      reproductionCooldownSec: 3,
    }),
    diet: defaultDietConfig({ canEat: new Set([0]) }),
  };
}

function predatorSpecies(name: string, count: number): SpeciesConfig {
  return {
    name,
    count,
    color: '#cc4125',
    radius: 5,
    initialSpeed: 65,
    maxSpeed: 120,
    energy: defaultEnergyConfig({
      maxEnergy: 160, // 2× prey's 80
      initialEnergy: 80,
      movementCostPerSec: 0,
      reproductionCost: 40, // 2× prey's 20
      idleDrainPerSec: 2,
      energyGainPerPrey: [0, 35],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 70,
      starvationDamagePerSec: 4,
      reproductionCooldownSec: 10,
    }),
    diet: defaultDietConfig({ canEat: new Set([1]) }),
  };
}

// ─── Photosynthesis (negative idleDrain) ─────────────────────────

describe('Photosynthesis — negative idleDrainPerSec', () => {
  it('plant gains energy when idleDrainPerSec is negative', () => {
    const config = makeConfig([plantSpecies('Grass', 5)]);
    const eco = new EcosystemWorld(config);

    const energyBefore = eco.eco.energy[0];

    // processLifecycle drains/awards energy
    eco.processLifecycle(1);

    const energyAfter = eco.eco.energy[0];

    // Plant should have GAINED energy (5 per sec, movementCost=0)
    expect(energyAfter).toBeGreaterThan(energyBefore);
    expect(energyAfter - energyBefore).toBeCloseTo(5, 0);
  });

  it('plant energy does not exceed maxEnergy', () => {
    const config = makeConfig([plantSpecies('Grass', 5)]);
    const eco = new EcosystemWorld(config);

    // Run many steps to let photosynthesis max out energy
    for (let i = 0; i < 100; i++) {
      eco.processLifecycle(1);
    }

    // Energy should be clamped at maxEnergy (30)
    for (let i = 0; i < eco.highWaterMark; i++) {
      if (eco.eco.alive[i] !== DEAD) {
        expect(eco.eco.energy[i]).toBeLessThanOrEqual(30);
      }
    }
  });

  it('plant with 0 starvationDamage does not take health damage at low energy', () => {
    const config = makeConfig([plantSpecies('Grass', 5)]);
    const eco = new EcosystemWorld(config);

    // Force energy to 0
    for (let i = 0; i < eco.highWaterMark; i++) {
      if (eco.eco.alive[i] !== DEAD) eco.eco.energy[i] = 0;
    }

    const healthBefore = eco.eco.health[0];
    eco.processLifecycle(1);

    // Health should not decrease because starvationDamagePerSec = 0
    expect(eco.eco.health[0]).toBeGreaterThanOrEqual(healthBefore);
  });
});

// ─── Predator-Prey Balance ────────────────────────────────────────

describe('Predator-Prey balance — 2× energy, 2× repro cost', () => {
  it('predator has 2× maxEnergy and 2× reproductionCost of prey', () => {
    const prey = preySpecies('Rabbits', 100);
    const predator = predatorSpecies('Foxes', 50);

    expect(predator.energy.maxEnergy).toBe(2 * prey.energy.maxEnergy);
    expect(predator.energy.reproductionCost).toBe(2 * prey.energy.reproductionCost);
  });
});

// ─── Cannibalism ─────────────────────────────────────────────────

describe('Cannibalism — species eating their own kind', () => {
  it('predator can eat its own species when canEat includes self-index', () => {
    const cannibal: SpeciesConfig = {
      name: 'Cannibal',
      count: 10,
      color: '#ff0000',
      radius: 5,
      initialSpeed: 50,
      maxSpeed: 100,
      energy: defaultEnergyConfig({
        maxEnergy: 200,
        initialEnergy: 100,
        energyGainPerPrey: [40], // gains 40 from eating species 0 (self)
      }),
      lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
      diet: defaultDietConfig({ canEat: new Set([0]) }), // eats own species!
    };

    const config = makeConfig([cannibal], 50);
    const eco = new EcosystemWorld(config);

    // Place two cannibals at the same position
    eco.world.x[0] = 400;
    eco.world.y[0] = 300;
    eco.world.x[1] = 400;
    eco.world.y[1] = 300;
    eco.world.vx[0] = 0;
    eco.world.vy[0] = 0;
    eco.world.vx[1] = 0;
    eco.world.vy[1] = 0;

    const energyBefore = eco.eco.energy[0];

    const grid = new SpatialHashGrid(800, 600, 10, 50);
    grid.rebuild(eco.world);
    const result = processEating(eco, grid);

    // Cannibal 0 should have eaten cannibal 1
    expect(result.killed).toBeGreaterThanOrEqual(1);
    expect(eco.eco.alive[1]).toBe(DEAD);
    expect(eco.eco.energy[0]).toBeGreaterThan(energyBefore);
  });

  it('cannibalism does not trigger when self-index not in canEat', () => {
    const species: SpeciesConfig = {
      name: 'Peaceful',
      count: 10,
      color: '#00ff00',
      radius: 5,
      initialSpeed: 50,
      maxSpeed: 100,
      energy: defaultEnergyConfig({
        maxEnergy: 200,
        initialEnergy: 100,
        energyGainPerPrey: [0],
      }),
      lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
      diet: defaultDietConfig(), // eats nothing
    };

    const config = makeConfig([species], 50);
    const eco = new EcosystemWorld(config);

    // Place two at same position
    eco.world.x[0] = 400;
    eco.world.y[0] = 300;
    eco.world.x[1] = 400;
    eco.world.y[1] = 300;
    eco.world.vx[0] = 0;
    eco.world.vy[0] = 0;
    eco.world.vx[1] = 0;
    eco.world.vy[1] = 0;

    const grid = new SpatialHashGrid(800, 600, 10, 50);
    grid.rebuild(eco.world);
    const result = processEating(eco, grid);

    // Neither should be eaten
    expect(result.killed).toBe(0);
  });
});
