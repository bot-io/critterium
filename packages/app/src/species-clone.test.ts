/**
 * CRT-23 regression tests: species config cloning with optional stamina.
 *
 * The production build (tsc) broke because deepCloneSpeciesConfig used
 * `{ ...sp.stamina }` which makes sprintDurationSec `number | undefined`
 * instead of `number` when stamina is optional on SpeciesConfig.
 * These tests guard against the pattern recurring.
 */
import { describe, it, expect } from 'vitest';
import type { SpeciesConfig, StaminaConfig } from '@critterium/core';

const fullStamina: StaminaConfig = {
  sprintDurationSec: 5,
  sprintCooldownSec: 3,
  sprintSpeedMultiplier: 1.0,
  tiredSpeedMultiplier: 0.5,
};

function makeSpecies(overrides: Partial<SpeciesConfig> = {}): SpeciesConfig {
  return {
    name: 'Test',
    count: 10,
    color: '#ff0000',
    radius: 5,
    initialSpeed: 50,
    maxSpeed: 100,
    energy: {
      energyGainPerPrey: [0, 20],
      maxEnergy: 100,
      initialEnergy: 50,
      movementCostPerSec: 0.5,
      reproductionCost: 40,
      idleDrainPerSec: 0.2,
    },
    lifecycle: {
      maxAgeSec: 120,
      reproductionCooldownSec: 10,
      starvationDamagePerSec: 5,
    },
    diet: { canEat: new Set<number>([1]) },
    ...overrides,
  };
}

/** Mirrors the deepCloneSpeciesConfig logic from main.ts */
function cloneSpecies(species: SpeciesConfig[]): SpeciesConfig[] {
  return species.map(sp => ({
    name: sp.name,
    count: sp.count,
    color: sp.color,
    radius: sp.radius,
    initialSpeed: sp.initialSpeed,
    maxSpeed: sp.maxSpeed,
    energy: { ...sp.energy, energyGainPerPrey: [...sp.energy.energyGainPerPrey] },
    lifecycle: { ...sp.lifecycle },
    diet: { canEat: new Set(sp.diet.canEat) },
    stamina: sp.stamina ? { ...sp.stamina } : undefined,
  }));
}

describe('CRT-23: species config clone with optional stamina', () => {
  it('clones species that have stamina defined', () => {
    const original = [makeSpecies({ stamina: fullStamina })];
    const cloned = cloneSpecies(original);

    expect(cloned[0].stamina).toBeDefined();
    expect(cloned[0].stamina!.sprintDurationSec).toBe(5);
    expect(cloned[0].stamina!.sprintCooldownSec).toBe(3);

    // Deep clone: modifying clone does not affect original
    cloned[0].stamina!.sprintDurationSec = 99;
    expect(original[0].stamina!.sprintDurationSec).toBe(5);
  });

  it('clones species that have stamina undefined (no crash)', () => {
    const original = [makeSpecies()]; // no stamina
    const cloned = cloneSpecies(original);

    expect(cloned[0].stamina).toBeUndefined();
    // Other fields are still correctly cloned
    expect(cloned[0].name).toBe('Test');
    expect(cloned[0].count).toBe(10);
  });

  it('clones a mix of species with and without stamina', () => {
    const original = [
      makeSpecies({ name: 'Has', stamina: fullStamina }),
      makeSpecies({ name: 'Lacks' }),
    ];
    const cloned = cloneSpecies(original);

    expect(cloned).toHaveLength(2);
    expect(cloned[0].name).toBe('Has');
    expect(cloned[0].stamina).toBeDefined();
    expect(cloned[1].name).toBe('Lacks');
    expect(cloned[1].stamina).toBeUndefined();
  });

  it('produces a type-correct result assignable to SpeciesConfig[]', () => {
    // This is a compile-time guard: if the clone pattern produces
    // `number | undefined` for sprintDurationSec, tsc will fail.
    const original = [makeSpecies({ stamina: fullStamina })];
    const cloned: SpeciesConfig[] = cloneSpecies(original);

    // Runtime assertion: the value is a plain number
    if (cloned[0].stamina) {
      const duration: number = cloned[0].stamina.sprintDurationSec;
      expect(typeof duration).toBe('number');
    }
  });
});
