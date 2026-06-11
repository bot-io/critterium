/**
 * Critterium — Lifecycle System
 *
 * Coordinates aging, energy drain, starvation, old-age death,
 * and reproduction (fission) for all alive particles each frame.
 *
 * This is the top-level "ecosystem tick" that combines:
 * 1. processLifecycle (from EcosystemWorld) — age, energy, death
 * 2. processEating — predator/prey consumption
 * 3. processReproduction — fission for eligible particles
 * 4. processInfection — sickness spread and death
 */

import { type EcosystemWorld, type LifecycleResult } from './ecosystem-world.js';
import { type EatingResult } from './eating.js';
import { DEAD, NOT_INFECTED } from './ecosystem.js';

/** Combined result from one full ecosystem step. */
export interface EcosystemStepResult {
  lifecycle: LifecycleResult;
  eating: EatingResult;
  born: number;
  diedInfection: number;
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

/**
 * Process sickness/infection for all alive particles.
 * - Infected particles age their infection timer
 * - When timer exceeds sicknessDurationSec, particle dies
 * - Infected particles spread to nearby vulnerable particles
 *
 * Returns count of infection deaths.
 */
export function processInfection(eco: EcosystemWorld, _dt: number): number {
  let diedInfection = 0;
  const { world, eco: state, species } = eco;
  const hwm = eco.highWaterMark;

  // Track newly infected this step to prevent cascade
  const newlyInfected = new Uint8Array(hwm);

  for (let i = 0; i < hwm; i++) {
    if (state.alive[i] === DEAD) continue;
    if (newlyInfected[i]) continue; // just got infected, skip processing

    // Process existing infections
    if (state.infectedBy[i] !== NOT_INFECTED) {
      const speciesIdx = world.type[i];
      const sp = species[speciesIdx];
      if (sp.lifecycle.sicknessDurationSec > 0) {
        // Infection time is already advanced in processLifecycle
        if (state.infectionTime[i] >= sp.lifecycle.sicknessDurationSec) {
          eco.kill(i);
          diedInfection++;
          continue;
        }
      }

      // Spread infection to nearby vulnerable particles
      const sicknessSpeciesIdx = state.infectedBy[i];
      const contagionRadius = sp.lifecycle.contagionRadius;
      if (contagionRadius <= 0) continue;

      for (let j = 0; j < hwm; j++) {
        if (j === i) continue;
        if (state.alive[j] === DEAD) continue;
        if (state.infectedBy[j] !== NOT_INFECTED) continue; // already infected
        if (newlyInfected[j]) continue;

        const preySpIdx = world.type[j];
        const preySp = species[preySpIdx];

        // Check if this species can be infected by the sickness species
        if (!preySp.diet.infectionVulnerability.has(sicknessSpeciesIdx)) continue;

        // Check distance
        const dx = world.x[i] - world.x[j];
        const dy = world.y[i] - world.y[j];
        const distSq = dx * dx + dy * dy;
        if (distSq < contagionRadius * contagionRadius) {
          state.infectedBy[j] = sicknessSpeciesIdx;
          state.infectionTime[j] = 0;
          newlyInfected[j] = 1;
        }
      }
    }
  }

  return diedInfection;
}

/**
 * Infect a particle with a sickness species.
 * Returns true if the infection was applied.
 */
export function infectParticle(
  eco: EcosystemWorld,
  particleIdx: number,
  sicknessSpeciesIdx: number,
): boolean {
  const { world, eco: state, species } = eco;
  if (state.alive[particleIdx] === DEAD) return false;
  if (state.infectedBy[particleIdx] !== NOT_INFECTED) return false;

  const sp = species[world.type[particleIdx]];
  if (!sp.diet.infectionVulnerability.has(sicknessSpeciesIdx)) return false;

  state.infectedBy[particleIdx] = sicknessSpeciesIdx;
  state.infectionTime[particleIdx] = 0;
  return true;
}
