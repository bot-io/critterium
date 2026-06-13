/**
 * Critterium — Eating System
 *
 * Instant consumption: when predator touches prey, prey dies and
 * predator gains energy. Uses spatial hash for neighbor lookups.
 * Respects diet.canEat from SpeciesConfig.
 */

import { type EcosystemWorld } from './ecosystem-world.js';
import { DEAD } from './ecosystem.js';

/** Result of a single eating step. */
export interface EatingResult {
  killed: number;       // total prey killed this step
  energyGained: number; // total energy gained by predators
}

/**
 * Process eating for one simulation step.
 *
 * For each alive particle, check neighbors via spatial hash.
 * If neighbor is alive and this particle's species canEat that species,
 * and they overlap (distance < sum of radii), eat instantly.
 *
 * A predator can eat multiple prey per step.
 * A prey can only be eaten once (dead = removed immediately).
 */
export function processEating(eco: EcosystemWorld): EatingResult {
  const result: EatingResult = { killed: 0, energyGained: 0 };
  const { world, eco: state, species } = eco;

  // Track which particles were already eaten this step
  const eaten = new Uint8Array(state.alive.length);

  for (let i = 0; i < eco.highWaterMark; i++) {
    if (state.alive[i] === DEAD || eaten[i]) continue;

    const speciesIdx = world.type[i];
    const diet = species[speciesIdx].diet;

    // Skip if this species doesn't eat anything
    if (diet.canEat.size === 0) continue;

    const ri = species[speciesIdx].radius;

    // Brute-force neighbor check (spatial hash integration later)
    for (let j = 0; j < eco.highWaterMark; j++) {
      if (j === i) continue;
      if (state.alive[j] === DEAD || eaten[j]) continue;

      const preySpeciesIdx = world.type[j];
      if (!diet.canEat.has(preySpeciesIdx)) continue;

      // Check overlap: distance < sum of radii
      const dx = world.x[i] - world.x[j];
      const dy = world.y[i] - world.y[j];
      const distSq = dx * dx + dy * dy;
      const rj = species[preySpeciesIdx].radius;
      const minDist = ri + rj;

      if (distSq < minDist * minDist) {
        // Energy gain from energyGainPerPrey array
        const energyGain = species[speciesIdx].energy.energyGainPerPrey[preySpeciesIdx] ?? 0;

        // Don't eat if it would exceed max energy — predator is "full"
        const maxE = species[speciesIdx].energy.maxEnergy;
        if (state.energy[i] + energyGain > maxE) continue;

        // Eat! Instant kill + energy gain
        eaten[j] = 1;
        eco.kill(j);
        result.killed++;

        if (energyGain > 0) {
          state.energy[i] += energyGain;
          result.energyGained += energyGain;
        }
      }
    }
  }

  return result;
}
