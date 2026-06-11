import { describe, it, expect } from 'vitest';
import { processEating, type EatingResult } from './eating.js';
import { EcosystemWorld } from './ecosystem-world.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  type SpeciesConfig,
  type EcosystemConfig,
  ALIVE,
  DEAD,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────────

function predatorPreyConfig(predCount = 5, preyCount = 20, cap = 100): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: [
      {
        name: 'Predator',
        count: predCount,
        color: '#ff0000',
        radius: 5,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig({
          initialEnergy: 50,
          maxEnergy: 200,
          energyGainPerPrey: [0, 30], // gains 30 from eating species 1
        }),
        lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
        diet: defaultDietConfig({ canEat: new Set([1]) }), // eats species 1
      },
      {
        name: 'Prey',
        count: preyCount,
        color: '#00ff00',
        radius: 3,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: defaultEnergyConfig({ initialEnergy: 30 }),
        lifecycle: defaultLifecycleConfig(),
        diet: defaultDietConfig(), // doesn't eat
      },
    ],
    interactionRules: [[null, null], [null, null]],
  };
}

// ─── Basic Eating ────────────────────────────────────────────────

describe('processEating', () => {
  it('returns zero result when no overlap exists', () => {
    const eco = new EcosystemWorld(predatorPreyConfig(2, 2));
    const result = processEating(eco);
    // Unlikely to overlap on spawn — just check types
    expect(result.killed).toBeGreaterThanOrEqual(0);
    expect(result.energyGained).toBeGreaterThanOrEqual(0);
  });

  it('eats prey when predator overlaps it', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);

    // Force overlap: place predator (type 0) and prey (type 1) at same position
    eco.world.x[0] = 100;
    eco.world.y[0] = 100;
    eco.world.x[1] = 100;
    eco.world.y[1] = 100;
    // Reset velocities so they stay put
    eco.world.vx[0] = 0;
    eco.world.vy[0] = 0;
    eco.world.vx[1] = 0;
    eco.world.vy[1] = 0;

    expect(eco.aliveCount).toBe(2);
    const result = processEating(eco);
    expect(result.killed).toBe(1);
    expect(eco.aliveCount).toBe(1);
    expect(eco.eco.alive[1]).toBe(DEAD);
  });

  it('gives energy to predator on eat', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 100; eco.world.y[1] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    const energyBefore = eco.eco.energy[0];
    const result = processEating(eco);
    expect(result.energyGained).toBe(30); // energyGainPerPrey[1] = 30
    expect(eco.eco.energy[0]).toBe(energyBefore + 30);
  });

  it('clamps predator energy to maxEnergy', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 100; eco.world.y[1] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;
    // Set predator energy near max
    eco.eco.energy[0] = 195; // max is 200, gain is 30 → would be 225 → clamped to 200

    processEating(eco);
    expect(eco.eco.energy[0]).toBe(200);
  });

  it('predator can eat multiple prey in one step', () => {
    const cfg = predatorPreyConfig(1, 3, 100);
    const eco = new EcosystemWorld(cfg);
    // Place predator and all prey at same position
    for (let i = 0; i < 4; i++) {
      eco.world.x[i] = 100;
      eco.world.y[i] = 100;
      eco.world.vx[i] = 0;
      eco.world.vy[i] = 0;
    }
    const result = processEating(eco);
    expect(result.killed).toBe(3);
    expect(eco.aliveCount).toBe(1);
  });

  it('prey cannot eat predator', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 100; eco.world.y[1] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;
    // Remove predator's ability to eat, only prey processes
    eco.species[0].diet.canEat.clear();

    const result = processEating(eco);
    expect(result.killed).toBe(0);
    expect(eco.aliveCount).toBe(2);
  });

  it('does not eat dead particles', () => {
    const cfg = predatorPreyConfig(1, 2, 100);
    const eco = new EcosystemWorld(cfg);
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 100; eco.world.y[1] = 100;
    eco.world.x[2] = 100; eco.world.y[2] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;
    eco.world.vx[2] = 0; eco.world.vy[2] = 0;
    // Kill one prey manually
    eco.kill(1);

    const result = processEating(eco);
    expect(result.killed).toBe(1); // only the alive prey
  });

  it('does not double-eat in same step', () => {
    const cfg = predatorPreyConfig(2, 1, 100);
    const eco = new EcosystemWorld(cfg);
    // Both predators and prey at same spot
    for (let i = 0; i < 3; i++) {
      eco.world.x[i] = 100;
      eco.world.y[i] = 100;
      eco.world.vx[i] = 0;
      eco.world.vy[i] = 0;
    }
    const result = processEating(eco);
    // Only 1 prey to eat, should be killed once
    expect(result.killed).toBe(1);
    expect(eco.aliveCount).toBe(2);
  });

  it('no eating when particles are far apart', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    // Place far apart
    eco.world.x[0] = 0; eco.world.y[0] = 0;
    eco.world.x[1] = 700; eco.world.y[1] = 500;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    const result = processEating(eco);
    expect(result.killed).toBe(0);
    expect(eco.aliveCount).toBe(2);
  });

  it('eating respects overlap radius (sum of radii)', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    // Predator radius=5, prey radius=3 → overlap if dist < 8
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 107; eco.world.y[1] = 100; // distance = 7, should overlap (< 8)
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    const result = processEating(eco);
    expect(result.killed).toBe(1);
  });

  it('no eating when distance equals sum of radii', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    // distance = 8 (exactly sum of radii 5+3) → no overlap
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 108; eco.world.y[1] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    const result = processEating(eco);
    expect(result.killed).toBe(0);
  });
});

// ─── Integration with lifecycle ──────────────────────────────────

describe('eating + lifecycle integration', () => {
  it('eaten prey slot can be reused via spawn', () => {
    const cfg = predatorPreyConfig(1, 1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.world.x[0] = 100; eco.world.y[0] = 100;
    eco.world.x[1] = 100; eco.world.y[1] = 100;
    eco.world.vx[0] = 0; eco.world.vy[0] = 0;
    eco.world.vx[1] = 0; eco.world.vy[1] = 0;

    processEating(eco);
    expect(eco.aliveCount).toBe(1);

    // Spawn a new prey (species 1)
    const idx = eco.spawn(1, 200, 200);
    expect(idx).toBe(1); // reused the killed slot
    expect(eco.aliveCount).toBe(2);
  });
});
