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
 * - The global population is not at cap
 *
 * Returns the number of new children spawned.
 *
 * ALLOCATION-FREE (CRT-59): the per-species queues and cursors are
 * pre-allocated on the EcosystemWorld and reused every call via
 * beginReproductionPass() / collectReadyReproducer() / nextReproducer().
 * No `new Array()`, `new Int32Array()`, or `.push()` happens here.
 */
export function processReproduction(eco: EcosystemWorld, dt: number): number {
  let born = 0;
  const hwm = eco.highWaterMark;
  const numSpecies = eco.species.length;

  if (eco.isAtCap) return 0;

  // Phase 1: collect ready individuals per species into pre-allocated queues.
  // "Ready" = alive, cooldown expired, enough energy.
  eco.beginReproductionPass();
  for (let i = 0; i < hwm; i++) {
    if (eco.eco.alive[i] === DEAD) continue;
    if (eco.eco.reproductionCooldown[i] > 0) continue;
    const speciesIdx = eco.world.type[i];
    const species = eco.species[speciesIdx];
    if (eco.eco.energy[i] < species.energy.reproductionCost) continue;
    eco.collectReadyReproducer(speciesIdx, i);
  }

  // Phase 2: round-robin reproduction.
  // Process one individual per species per round. Per-species cursors
  // (on the world) advance over the pre-allocated queues for O(1) progress.
  for (;;) {
    if (eco.isAtCap) break;

    let processedAny = false;

    for (let s = 0; s < numSpecies; s++) {
      if (eco.isAtCap) break;

      // Advance cursor to the next still-alive individual for this species.
      // nextReproducer() returns -1 when the queue is exhausted.
      for (;;) {
        const idx = eco.nextReproducer(s);
        if (idx < 0) break;
        processedAny = true;
        // Individual may have died this frame (e.g. eaten between phases).
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
