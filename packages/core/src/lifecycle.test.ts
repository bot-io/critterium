import { describe, it, expect } from 'vitest';
import { processReproduction } from './lifecycle.js';
import { EcosystemWorld } from './ecosystem-world.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  type EcosystemConfig,
  ALIVE,
  DEAD,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────────

function reproConfig(count = 5, cap = 100): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: [
      {
        name: 'Bug',
        count,
        color: '#ff0000',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig({
          initialEnergy: 100,
          maxEnergy: 200,
          reproductionCost: 30,
        }),
        lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 2 }),
        diet: defaultDietConfig(),
      },
    ],
    interactionRules: [[null]],
  };
}

// ─── Reproduction ────────────────────────────────────────────────

describe('processReproduction', () => {
  it('spawns children for eligible particles', () => {
    const cfg = reproConfig(3, 100);
    // Clear cooldown on first particle
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBeGreaterThanOrEqual(1);
    expect(eco.aliveCount).toBeGreaterThan(3);
  });

  it('does not reproduce when at cap', () => {
    const cfg = reproConfig(3, 3);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBe(0);
    expect(eco.aliveCount).toBe(3);
  });

  it('does not reproduce when energy is too low', () => {
    const cfg = reproConfig(1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.eco.energy[0] = 5; // below reproductionCost of 30
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBe(0);
  });

  it('deducts reproduction cost from parent', () => {
    const cfg = reproConfig(1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    const energyBefore = eco.eco.energy[0];

    processReproduction(eco);
    expect(eco.eco.energy[0]).toBe(energyBefore - 30);
  });

  it('does not process newborns in same frame', () => {
    const cfg = reproConfig(2, 100);
    const eco = new EcosystemWorld(cfg);
    // Both have zero cooldown and enough energy
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.reproductionCooldown[1] = 0;

    const born = processReproduction(eco);
    // Each original can reproduce once, but newborns won't be processed
    // (they start with cooldown > 0)
    expect(born).toBeLessThanOrEqual(2);
  });
});
