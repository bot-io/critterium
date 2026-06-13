/**
 * Critterium — Eating System
 *
 * Instant consumption: when predator touches prey, prey dies and
 * predator gains energy. Uses spatial hash grid for O(n) neighbor lookups.
 * Respects diet.canEat from SpeciesConfig.
 */

import { type EcosystemWorld } from './ecosystem-world.js';
import { DEAD } from './ecosystem.js';
import { type SpatialHashGrid } from './index.js';

/** Result of a single eating step. */
export interface EatingResult {
  killed: number;       // total prey killed this step
  energyGained: number; // total energy gained by predators
}

// Pre-allocated buffer for tracking eaten particles — reused across calls
let eatenBuffer: Uint8Array | null = null;

function getEatenBuffer(size: number): Uint8Array {
  if (!eatenBuffer || eatenBuffer.length < size) {
    eatenBuffer = new Uint8Array(size);
  }
  return eatenBuffer;
}

/**
 * Process eating for one simulation step.
 *
 * Uses spatial hash grid for O(n) neighbor lookups instead of brute-force O(n²).
 * A predator can eat multiple prey per step.
 * A prey can only be eaten once (dead = removed immediately).
 *
 * @param eco   The ecosystem world
 * @param grid  Spatial hash grid (rebuilt for current positions)
 */
export function processEating(eco: EcosystemWorld, grid: SpatialHashGrid): EatingResult {
  const result: EatingResult = { killed: 0, energyGained: 0 };
  const { world, eco: state, species } = eco;

  // Compute max eat radius across all predator-prey pairs
  let maxEatRadius = 0;
  for (let s = 0; s < species.length; s++) {
    if (species[s].diet.canEat.size > 0) {
      species[s].diet.canEat.forEach((preyIdx) => {
        if (preyIdx < species.length) {
          const dist = species[s].radius + species[preyIdx].radius;
          if (dist > maxEatRadius) maxEatRadius = dist;
        }
      });
    }
  }

  // No predator species — skip entirely
  if (maxEatRadius === 0) return result;

  // Reuse pre-allocated eaten buffer (zero per-step allocation)
  const eaten = getEatenBuffer(state.alive.length);
  eaten.fill(0);

  const { x, y, type, count } = world;
  const hwm = eco.highWaterMark;

  for (let i = 0; i < hwm; i++) {
    if (state.alive[i] === DEAD || eaten[i]) continue;

    const speciesIdx = type[i];
    const diet = species[speciesIdx].diet;

    // Skip if this species doesn't eat anything
    if (diet.canEat.size === 0) continue;

    const ri = species[speciesIdx].radius;

    // Query spatial hash for neighbors within max eat radius.
    // Pass selfIdx=i so co-located prey (dSq===0) are still found.
    grid.queryRadius(x[i], y[i], maxEatRadius, x, y, count, (j, _dx, _dy, distSq) => {
      // selfIdx already excludes self, but keep as defensive guard
      if (j === i) return;
      if (state.alive[j] === DEAD || eaten[j]) return;

      const preySpeciesIdx = type[j];
      if (!diet.canEat.has(preySpeciesIdx)) return;

      // Check overlap: distance < sum of radii
      const rj = species[preySpeciesIdx].radius;
      const minDist = ri + rj;
      if (distSq >= minDist * minDist) return;

      // Energy gain from energyGainPerPrey array
      const energyGain = species[speciesIdx].energy.energyGainPerPrey[preySpeciesIdx] ?? 0;

      // Don't eat if it would exceed max energy — predator is "full"
      const maxE = species[speciesIdx].energy.maxEnergy;
      if (state.energy[i] + energyGain > maxE) return;

      // Eat! Instant kill + energy gain
      eaten[j] = 1;
      eco.kill(j);
      result.killed++;

      if (energyGain > 0) {
        state.energy[i] += energyGain;
        result.energyGained += energyGain;
      }
    }, i);
  }

  return result;
}
