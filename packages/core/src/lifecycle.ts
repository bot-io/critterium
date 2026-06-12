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
 * Process reproduction for all alive particles.
 * A particle reproduces (fission) when:
 * - It has enough energy (>= reproductionCost)
 * - Its cooldown has expired
 * - Population is not at cap
 *
 * Returns the number of new children spawned.
 */
export function processReproduction(eco: EcosystemWorld): number {
  let born = 0;
  const hwm = eco.highWaterMark;

  // Snapshot the current alive set to avoid processing newborns this frame
  for (let i = 0; i < hwm; i++) {
    if (eco.eco.alive[i] === DEAD) continue;

    const childIdx = eco.tryReproduce(i);
    if (childIdx >= 0) {
      born++;
    }
  }

  return born;
}
