/**
 * Critterium — App Entry Point
 *
 * Bootstraps the simulation core and renderer.
 * Three species: prey (green), predator (red), parasite (purple).
 *
 * Default 3-type config produces emergent behaviors:
 * - Prey flock together (same-type attract) and flee from predators/parasites
 * - Predators chase prey (cross-type attract) and space out from each other
 * - Parasites seek prey (cross-type attract) to spread infection
 *
 * Interaction matrix (asymmetric, drives chase/flee):
 * ┌──────────────┬─────────────────┬─────────────────┬─────────────────┐
 * │              │ Prey (0)        │ Predator (1)    │ Parasite (2)    │
 * ├──────────────┼─────────────────┼─────────────────┼─────────────────┤
 * │ Prey →       │ attract 30/80   │ flee -80/120    │ flee -40/80     │
 * │ Predator →   │ chase 60/150    │ repel -20/50    │ (none)          │
 * │ Parasite →   │ seek 50/120     │ (none)          │ repel -15/40    │
 * └──────────────┴─────────────────┴─────────────────┴─────────────────┘
 * Format: strength (positive=attract, negative=repel) / radius
 *
 * Ecosystem dynamics:
 * - Predators eat prey on contact → gain 40 energy
 * - Parasites infect prey on contact → prey die after 8s sickness
 * - All species reproduce via binary fission when energy is sufficient
 * - Population capped at 600
 */

import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  WanderForce,
  type InteractionEntry,
} from '@critterium/core';
import { type EcosystemConfig, type SpeciesConfig, defaultEnergyConfig, defaultLifecycleConfig, defaultDietConfig } from '@critterium/core/ecosystem';
import { EcosystemWorld } from '@critterium/core/ecosystem-world';
import { processEating } from '@critterium/core/eating';
import { processReproduction, processInfection } from '@critterium/core/lifecycle';
import { CritteriumRenderer, type SpeciesVisual } from '@critterium/render';

// ─── Species Definitions ─────────────────────────────────────

const SPECIES_NAMES = ['Prey', 'Predator', 'Parasite'] as const;

const SPECIES_CONFIGS: SpeciesConfig[] = [
  // 0: Prey — green, fast breeder
  {
    name: 'Prey',
    count: 120,
    color: '#44cc44',
    radius: 3,
    initialSpeed: 60,
    maxSpeed: 100,
    energy: defaultEnergyConfig({
      maxEnergy: 80,
      initialEnergy: 40,
      reproductionCost: 20,
      movementCostPerSec: 2,
      idleDrainPerSec: 1,
      energyGainPerPrey: [0, 0, 0],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 40,
      starvationDamagePerSec: 8,
      reproductionCooldownSec: 3,
      sicknessDurationSec: 8,
      contagionRadius: 15,
    }),
    diet: defaultDietConfig({
      canEat: new Set(),
      infectionVulnerability: new Set([2]), // vulnerable to parasite (species 2)
    }),
  },
  // 1: Predator — red, hunts prey
  {
    name: 'Predator',
    count: 40,
    color: '#ff4444',
    radius: 5,
    initialSpeed: 70,
    maxSpeed: 130,
    energy: defaultEnergyConfig({
      maxEnergy: 150,
      initialEnergy: 80,
      reproductionCost: 50,
      movementCostPerSec: 3,
      idleDrainPerSec: 2,
      energyGainPerPrey: [40, 0, 0], // gains energy from eating prey (species 0)
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 60,
      starvationDamagePerSec: 5,
      reproductionCooldownSec: 8,
      sicknessDurationSec: 0,
      contagionRadius: 0,
    }),
    diet: defaultDietConfig({
      canEat: new Set([0]), // eats prey
      infectionVulnerability: new Set(),
    }),
  },
  // 2: Parasite — purple, infects prey
  {
    name: 'Parasite',
    count: 40,
    color: '#cc44cc',
    radius: 4,
    initialSpeed: 40,
    maxSpeed: 80,
    energy: defaultEnergyConfig({
      maxEnergy: 100,
      initialEnergy: 50,
      reproductionCost: 30,
      movementCostPerSec: 1,
      idleDrainPerSec: 1.5,
      energyGainPerPrey: [0, 0, 0],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 30,
      starvationDamagePerSec: 10,
      reproductionCooldownSec: 5,
      sicknessDurationSec: 0,
      contagionRadius: 25,
    }),
    diet: defaultDietConfig({
      canEat: new Set(),
      infectionVulnerability: new Set(),
    }),
  },
];

// ─── Ecosystem Config ────────────────────────────────────────

const CONFIG: EcosystemConfig = {
  width: window.innerWidth,
  height: window.innerHeight,
  boundaryMode: 'wrap',
  seed: 42,
  populationCap: 600,
  species: SPECIES_CONFIGS,
  interactionRules: [
    // [prey][prey]: flock (attract)
    [{ enabledForces: new Set(['attract']), radius: 80, strength: 30, falloff: 'linear' }, null, null],
    // [predator][prey]: chase prey (strong attract)
    [null, null, null],
    // [parasite][prey]: seek prey (attract)
    [null, null, null],
  ],
};

// ─── Species Visuals ─────────────────────────────────────────

const SPECIES_VISUALS: SpeciesVisual[] = [
  { color: 0x44cc44, radius: 3 },  // Prey: green
  { color: 0xff4444, radius: 5 },  // Predator: red
  { color: 0xcc44cc, radius: 4 },  // Parasite: purple
];

// ─── Interaction Matrix (for physics forces) ─────────────────

function buildInteractionMatrix(): InteractionMatrix {
  const matrix = new InteractionMatrix(3);

  // Prey ↔ Prey: mild flocking (attract at distance, repel close)
  matrix.set(0, 0, { strength: 30, radius: 80, falloff: 'linear' });

  // Prey → Predator: flee (repel)
  matrix.set(0, 1, { strength: -80, radius: 120, falloff: 'linear' });

  // Prey → Parasite: mild flee
  matrix.set(0, 2, { strength: -40, radius: 80, falloff: 'linear' });

  // Predator → Prey: chase (attract)
  matrix.set(1, 0, { strength: 60, radius: 150, falloff: 'linear' });

  // Predator ↔ Predator: mild spacing (repel)
  matrix.set(1, 1, { strength: -20, radius: 50, falloff: 'linear' });

  // Parasite → Prey: seek (attract)
  matrix.set(2, 0, { strength: 50, radius: 120, falloff: 'linear' });

  // Parasite ↔ Parasite: mild spacing
  matrix.set(2, 2, { strength: -15, radius: 40, falloff: 'linear' });

  return matrix;
}

// ─── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Create ecosystem world
  const eco = new EcosystemWorld(CONFIG);

  // 2. Build physics forces
  const interactionMatrix = buildInteractionMatrix();
  const pairwiseForce = new PairwiseForce(interactionMatrix);
  const dragForce = new DragForce(0.8);
  const wanderForce = new WanderForce(40, 2.5);

  // 3. Spatial hash grid
  const grid = new SpatialHashGrid(
    CONFIG.width,
    CONFIG.height,
    150, // cell size >= max interaction radius
    CONFIG.populationCap,
  );

  // 4. Create renderer
  const renderer = await CritteriumRenderer.create(
    SPECIES_VISUALS,
    [...SPECIES_NAMES],
    CONFIG.populationCap,
  );

  // Attach canvas to DOM
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.appendChild(renderer.app.canvas as HTMLCanvasElement);
  }

  // 5. Simulation loop with interpolation
  const FIXED_DT = 1 / 60;
  const MAX_FRAME_DT = 0.1;
  let accumulator = 0;
  let lastTime = performance.now();
  let totalSimTime = 0;

  function loop(now: number): void {
    const frameDt = Math.min((now - lastTime) / 1000, MAX_FRAME_DT);
    lastTime = now;

    // Store previous positions for interpolation (before sim step)
    renderer.storePreviousPositions(eco.world);

    accumulator += frameDt;

    let stepsThisFrame = 0;
    while (accumulator >= FIXED_DT && stepsThisFrame < 5) {
      // Rebuild spatial hash
      grid.rebuild(eco.world);

      // Apply forces
      pairwiseForce.apply(eco.world, grid, FIXED_DT);
      dragForce.apply(eco.world, grid, FIXED_DT);
      wanderForce.apply(eco.world, grid, FIXED_DT);

      // Step physics
      eco.world.step(FIXED_DT);

      // Process ecosystem systems
      eco.processLifecycle(FIXED_DT);
      processEating(eco);
      processReproduction(eco);
      processInfection(eco, FIXED_DT);

      totalSimTime += FIXED_DT;
      accumulator -= FIXED_DT;
      stepsThisFrame++;
    }

    // Interpolation alpha: how far between the last fixed step and the next
    const alpha = accumulator / FIXED_DT;

    // Render with interpolation
    renderer.update(eco.world, eco.eco, frameDt, alpha);

    requestAnimationFrame(loop);
  }

  console.log('Critterium — a living world in your pocket');
  console.log(`Species: ${SPECIES_NAMES.join(', ')}`);
  console.log(`Initial particles: ${eco.aliveCount}`);
  console.log(`World: ${CONFIG.width}×${CONFIG.height}`);

  requestAnimationFrame(loop);
}

// Bootstrap
main().catch((err) => {
  console.error('Critterium failed to start:', err);
});
