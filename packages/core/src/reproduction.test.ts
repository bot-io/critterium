/**
 * Reproduction — Probabilistic reproduction tests
 *
 * Tests that reproduction is NOT deterministic: after cooldown expires,
 * particles have a random chance to reproduce each tick, spreading
 * reproduction across time rather than all-at-once.
 */

import { describe, it, expect } from 'vitest';
import { EcosystemWorld } from './ecosystem-world.js';
import { processReproduction } from './lifecycle.js';
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

function reproSpecies(cooldownSec: number): SpeciesConfig {
  return {
    name: 'Critter',
    count: 1,
    color: '#44cc44',
    radius: 3,
    initialSpeed: 0,
    maxSpeed: 0,
    energy: defaultEnergyConfig({
      maxEnergy: 500,
      initialEnergy: 500,
      reproductionCost: 30,
      idleDrainPerSec: 0,
      energyGainPerPrey: [],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 0, // immortal
      starvationDamagePerSec: 0,
      reproductionCooldownSec: cooldownSec,
    }),
    diet: defaultDietConfig(),
  };
}

// ─── Deterministic reproduction with large dt ──────────────────

describe('Reproduction — deterministic when dt >> interval', () => {
  it('reproduces immediately when dt equals interval (rng always passes)', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    // Clear cooldown
    eco.eco.reproductionCooldown[0] = 0;

    // dt = 100 >> interval=5, so dt/interval = 20, which means
    // reproduction is guaranteed (rng() ≤ 1.0 < 20)
    const born = processReproduction(eco, 100);
    expect(born).toBe(1);
    expect(eco.aliveCount).toBe(2);
  });
});

// ─── Probabilistic reproduction with realistic dt ──────────────

describe('Reproduction — probabilistic with realistic dt', () => {
  it('does NOT reproduce every tick when dt is small', () => {
    // With interval=5s and dt=1/60≈0.0167s, probability per tick = 0.0167/5 = 0.33%
    // Over 10 ticks, expected reproductions = 10 * 0.0033 = 0.033
    // So almost certainly no reproduction in 10 ticks
    let reproduced = 0;
    const trials = 200;

    for (let trial = 0; trial < trials; trial++) {
      const cfg = makeConfig([reproSpecies(5)], 500);
      const eco = new EcosystemWorld(cfg);
      // Different seed each trial for different rng
      cfg.seed = trial * 1000 + 42;
      const eco2 = new EcosystemWorld(cfg);
      eco2.eco.reproductionCooldown[0] = 0;

      // Run 10 ticks at 60fps
      let anyBorn = false;
      for (let tick = 0; tick < 10; tick++) {
        const born = processReproduction(eco2, 1 / 60);
        if (born > 0) anyBorn = true;
      }

      if (anyBorn) reproduced++;
    }

    // With 0.33% per tick over 10 ticks: P(at least 1) ≈ 3.3%
    // So out of 200 trials, expect ~6-7 reproductions.
    // Allow generous bounds: 0-25 reproductions out of 200
    expect(reproduced).toBeLessThan(trials * 0.2); // < 20% (should be ~3%)
  });

  it('reproduces roughly on schedule over many ticks', () => {
    // With interval=5s and dt=1/60s, over 300 ticks (=5 sec),
    // expected ~1 reproduction per particle
    let totalBorn = 0;
    const trials = 100;

    for (let trial = 0; trial < trials; trial++) {
      const cfg: EcosystemConfig = makeConfig([reproSpecies(5)], 500);
      cfg.seed = trial * 7777 + 1;
      const eco = new EcosystemWorld(cfg);
      eco.eco.reproductionCooldown[0] = 0;

      // Run 300 ticks ≈ 5 seconds at 60fps
      for (let tick = 0; tick < 300; tick++) {
        const born = processReproduction(eco, 1 / 60);
        totalBorn += born;
        // Simulate cooldown decrease
        eco.processLifecycle(1 / 60);
      }
    }

    // After 5 seconds with interval=5s, expected ~1 reproduction per trial
    // Over 100 trials: ~100 total. Allow 30-200 (very generous)
    expect(totalBorn).toBeGreaterThan(20);
    expect(totalBorn).toBeLessThan(300);
  });
});

// ─── Cooldown and energy gates still work ──────────────────────

describe('Reproduction — gates still enforced', () => {
  it('does not reproduce when cooldown > 0', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    // Set cooldown
    eco.eco.reproductionCooldown[0] = 2;

    // Even with huge dt
    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });

  it('does not reproduce when energy is insufficient', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.energy[0] = 10; // below reproductionCost of 30

    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });

  it('resets cooldown after reproduction', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    processReproduction(eco, 100);

    // Cooldown should be reset to interval (5)
    expect(eco.eco.reproductionCooldown[0]).toBe(5);
  });

  it('deducts reproductionCost from parent energy', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    const energyBefore = eco.eco.energy[0];

    processReproduction(eco, 100);

    expect(eco.eco.energy[0]).toBe(energyBefore - 30);
  });

  it('respects population cap', () => {
    const cfg = makeConfig([reproSpecies(5)], 1); // cap = 1, already full
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });
});
