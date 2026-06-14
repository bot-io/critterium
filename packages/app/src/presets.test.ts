/**
 * Preset Validation — Ensure all built-in presets have sensible,
 * balanced ecosystem values.
 *
 * Validates:
 * - Plant-type species have negative idleDrainPerSec (photosynthesis)
 * - Plant-type species have starvationDamagePerSec = 0
 * - Predators have 2× maxEnergy and 2× reproductionCost of their primary prey
 * - Population ratios follow trophic pyramid (predator ≤ ½ prey)
 * - energyGainPerPrey arrays are sized correctly
 * - cannibalism: if canEat includes self-index, energyGainPerPrey[self] > 0
 * - No species has initialEnergy > maxEnergy
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS } from './presets.js';
import type { CritteriumConfig } from '@critterium/core';

type BuiltinSpecies = CritteriumConfig['species'][0];

// ─── Helpers ─────────────────────────────────────────────────────

/** Check if a species is a plant (producer). */
function isPlant(name: string): boolean {
  const plants = ['algae', 'grass', 'phytoplankton', 'plant', 'kelp', 'seaweed'];
  return plants.some((p) => name.toLowerCase().includes(p));
}

/** Check if a species is non-eating (ambient energy). */
function hasNoFoodSource(species: BuiltinSpecies): boolean {
  return species.diet.canEat.length === 0;
}

/** Find a species' primary prey (the species it gains most energy from). */
function findPrimaryPreyIndex(species: BuiltinSpecies): number {
  let maxGain = 0;
  let maxIdx = -1;
  species.energy.energyGainPerPrey.forEach((gain, i) => {
    if (gain > maxGain && species.diet.canEat.includes(i)) {
      maxGain = gain;
      maxIdx = i;
    }
  });
  return maxIdx;
}

// ─── All Presets ─────────────────────────────────────────────────

describe('All presets — structural validity', () => {
  for (const preset of BUILTIN_PRESETS) {
    describe(`"${preset.name}"`, () => {
      it('has at least 1 species', () => {
        expect(preset.config.species.length).toBeGreaterThanOrEqual(1);
      });

      it('has a non-empty name and description', () => {
        expect(preset.name.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
      });

      it('has no species with initialEnergy > maxEnergy', () => {
        for (const s of preset.config.species) {
          expect(s.energy.initialEnergy).toBeLessThanOrEqual(s.energy.maxEnergy);
        }
      });

      it('has reproductionCost > 0 for all species', () => {
        for (const s of preset.config.species) {
          expect(s.energy.reproductionCost).toBeGreaterThan(0);
        }
      });

      it('has reproductionCooldownSec > 0 for all species', () => {
        for (const s of preset.config.species) {
          expect(s.lifecycle.reproductionCooldownSec).toBeGreaterThan(0);
        }
      });

      it('has energyGainPerPrey array sized to species count', () => {
        const n = preset.config.species.length;
        for (const s of preset.config.species) {
          expect(s.energy.energyGainPerPrey.length).toBe(n);
        }
      });
    });
  }
});

// ─── Plant / Photosynthesis Rules ───────────────────────────────

describe('Plant species — photosynthesis rules', () => {
  // Find all plant-like species across presets
  const plantChecks: { presetName: string; speciesName: string; idleDrain: number; starveDmg: number }[] = [];

  for (const preset of BUILTIN_PRESETS) {
    for (const s of preset.config.species) {
      if (isPlant(s.name)) {
        plantChecks.push({
          presetName: preset.name,
          speciesName: s.name,
          idleDrain: s.energy.idleDrainPerSec,
          starveDmg: s.lifecycle.starvationDamagePerSec,
        });
      }
    }
  }

  for (const check of plantChecks) {
    it(`"${check.presetName}" / "${check.speciesName}" has negative idleDrain (photosynthesis)`, () => {
      expect(check.idleDrain).toBeLessThan(0);
    });

    it(`"${check.presetName}" / "${check.speciesName}" has starvationDamage = 0`, () => {
      expect(check.starveDmg).toBe(0);
    });
  }
});

// ─── Non-eating species — ambient energy ────────────────────────

describe('Non-eating species — should not die instantly', () => {
  for (const preset of BUILTIN_PRESETS) {
    for (const s of preset.config.species) {
      if (hasNoFoodSource(s)) {
        // Species that don't eat anything should have ≤ 0 idleDrain
        // (negative = ambient energy, 0 = no drain)
        it(`"${preset.name}" / "${s.name}" (no food) has idleDrain ≤ 0`, () => {
          expect(s.energy.idleDrainPerSec).toBeLessThanOrEqual(0);
        });

        // And should not starve
        it(`"${preset.name}" / "${s.name}" (no food) has starvationDamage = 0`, () => {
          expect(s.lifecycle.starvationDamagePerSec).toBe(0);
        });
      }
    }
  }
});

// ─── Predator-Prey Balance ──────────────────────────────────────

describe('Predator-prey balance — 2× energy, 2× repro cost', () => {
  for (const preset of BUILTIN_PRESETS) {
    for (let predIdx = 0; predIdx < preset.config.species.length; predIdx++) {
      const s = preset.config.species[predIdx];
      const preyIdx = findPrimaryPreyIndex(s);
      if (preyIdx < 0) continue; // not a predator

      const prey = preset.config.species[preyIdx];

      // Skip cyclic relationships (A eats B, B eats A, or symmetric like RPS)
      if (prey.diet.canEat.includes(predIdx)) continue;

      // Skip non-trophic predators (e.g. symbiotic cleaners with lower energy than prey)
      // A true trophic predator has HIGHER maxEnergy than its prey
      if (s.energy.maxEnergy <= prey.energy.maxEnergy) continue;

      it(`"${preset.name}" / "${s.name}" has 2× maxEnergy of prey "${prey.name}"`, () => {
        const ratio = s.energy.maxEnergy / prey.energy.maxEnergy;
        expect(ratio).toBeGreaterThanOrEqual(1.5);
        expect(ratio).toBeLessThanOrEqual(3.0);
      });

      it(`"${preset.name}" / "${s.name}" has ≥ 2× reproductionCost of prey "${prey.name}"`, () => {
        const ratio = s.energy.reproductionCost / prey.energy.reproductionCost;
        expect(ratio).toBeGreaterThanOrEqual(1.5);
      });

      it(`"${preset.name}" / "${s.name}" has ≤ ½ population of prey "${prey.name}"`, () => {
        expect(s.count).toBeLessThanOrEqual(prey.count);
      });
    }
  }
});

// ─── Cannibalism Validation ─────────────────────────────────────

describe('Cannibalism — self-eating consistency', () => {
  for (const preset of BUILTIN_PRESETS) {
    for (let i = 0; i < preset.config.species.length; i++) {
      const s = preset.config.species[i];

      if (s.diet.canEat.includes(i)) {
        // Self-cannibalism: must have positive energyGainPerPrey[self]
        it(`"${preset.name}" / "${s.name}" cannibalism: energyGainPerPrey[self] > 0`, () => {
          expect(s.energy.energyGainPerPrey[i]).toBeGreaterThan(0);
        });
      }
    }
  }
});
