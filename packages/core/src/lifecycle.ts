/**
 * Critterium — Lifecycle System
 *
 * Coordinates reproduction (fission) for all alive particles each frame.
 *
 * This is part of the ecosystem tick pipeline:
 * 1. processLifecycle (from EcosystemWorld) — age, energy, death
 * 2. processEating — predator/prey consumption
 * 3. processReproduction — fission for eligible particles
 */

import { type EcosystemWorld, type LifecycleResult } from './ecosystem-world.js';
import { type EatingResult } from './eating.js';
import { DEAD } from './ecosystem.js';

/** Combined result from one full ecosystem step. */
export interface EcosystemStepResult {
  lifecycle: LifecycleResult;
  eating: EatingResult;
  born: number;
}

/**
 * Process reproduction for all alive particles using a round-robin queue.
 *
 * This ensures fair reproduction across species: instead of iterating
 * particles by index (which biases toward lower-indexed species), we collect
 * ready individuals per species and process them one at a time per species
 * per round. So if species A has 50 ready individuals and species B has 5,
 * B still gets every other reproduction slot.
 *
 * A particle reproduces (fission) when:
 * - Its cooldown has expired
 * - It has enough energy (>= reproductionCost)
 * - Its species is not at per-species cap
 * - The global population is not at cap
 *
 * Returns the number of new children spawned.
 */
export function processReproduction(eco: EcosystemWorld, dt: number): number {
  let born = 0;
  const hwm = eco.highWaterMark;
  const numSpecies = eco.species.length;

  if (eco.isAtCap) return 0;

  // Phase 1: collect ready individuals per species.
  // "Ready" = alive, cooldown expired, enough energy, species not at cap.
  const readyBySpecies: number[][] = [];
  for (let s = 0; s < numSpecies; s++) readyBySpecies.push([]);

  for (let i = 0; i < hwm; i++) {
    if (eco.eco.alive[i] === DEAD) continue;
    if (eco.eco.reproductionCooldown[i] > 0) continue;
    const speciesIdx = eco.world.type[i];
    if (eco.isSpeciesAtCap(speciesIdx)) continue;
    const species = eco.species[speciesIdx];
    if (eco.eco.energy[i] < species.energy.reproductionCost) continue;
    readyBySpecies[speciesIdx].push(i);
  }

  // Phase 2: round-robin reproduction.
  // Process one individual per species per round. Per-species cursors
  // avoid array.shift() for O(1) advancement.
  const cursors = new Int32Array(numSpecies);

  for (;;) {
    if (eco.isAtCap) break;

    let processedAny = false;

    for (let s = 0; s < numSpecies; s++) {
      if (eco.isAtCap) break;
      if (eco.isSpeciesAtCap(s)) continue;

      // Advance cursor to next still-alive individual for this species
      while (cursors[s] < readyBySpecies[s].length) {
        const idx = readyBySpecies[s][cursors[s]++];
        processedAny = true;
        // Individual may have died this frame (e.g. eaten between phases)
        if (eco.eco.alive[idx] === DEAD) continue;
        const childIdx = eco.tryReproduce(idx, dt);
        if (childIdx >= 0) born++;
        break; // one reproduction per species per round
      }
    }

    if (!processedAny) break;
  }

  return born;
}
