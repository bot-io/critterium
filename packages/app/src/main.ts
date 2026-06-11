/**
 * Critterium — App Entry Point
 *
 * Bootstraps the simulation core and renderer.
 * Three species: prey (green), predator (red), parasite (purple).
 * Predator eats prey. Parasite infects prey. Prey flocks with prey.
 */

import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  WanderForce,
  type InteractionEntry,
  // Ecosystem barrel re-exports
  type EcosystemConfig,
  type SpeciesConfig,
  type EcosystemState,
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  ALIVE,
  DEAD,
  EcosystemWorld,
  processEating,
  processReproduction,
  processInfection,
  InteractionRuleMatrix,
  FORCE_FLAGS,
  forceFlags,
} from '@critterium/core';
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
      canEat: new Set<number>(),
      infectionVulnerability: new Set([2]),
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
      energyGainPerPrey: [40, 0, 0],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 60,
      starvationDamagePerSec: 5,
      reproductionCooldownSec: 8,
      sicknessDurationSec: 0,
      contagionRadius: 0,
    }),
    diet: defaultDietConfig({
      canEat: new Set([0]),
      infectionVulnerability: new Set<number>(),
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
      canEat: new Set<number>(),
      infectionVulnerability: new Set<number>(),
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
    // [prey][*]
    [{ enabledForces: new Set(['attract']), radius: 80, strength: 30, falloff: 'linear' }, null, null],
    // [predator][*]
    [null, null, null],
    // [parasite][*]
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

// ─── Error boundary ──────────────────────────────────────────

let freezeDetected = false;
let lastLoopTime = performance.now();
let consecutiveSlowFrames = 0;

function onError(err: unknown): void {
  console.error('[Critterium] Fatal error:', err);
  const el = document.getElementById('app');
  if (el) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:12px;background:#cc0000;color:#fff;font:14px monospace;z-index:9999;white-space:pre-wrap;';
    msg.textContent = `Critterium crashed:\n${err instanceof Error ? err.message + '\n' + err.stack : String(err)}`;
    el.appendChild(msg);
  }
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
    150,
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

  // 5. Simulation loop with freeze detection
  const FIXED_DT = 1 / 60;
  const MAX_FRAME_DT = 0.1;
  const MAX_ACCUMULATOR_STEPS = 5; // Cap steps to prevent death spiral
  const FREEZE_THRESHOLD_MS = 500; // If a frame takes >500ms, likely froze
  let accumulator = 0;
  let lastTime = performance.now();
  let totalSimTime = 0;
  let stepCount = 0;

  function loop(now: number): void {
    try {
      const frameDt = Math.min((now - lastTime) / 1000, MAX_FRAME_DT);
      lastTime = now;

      // Freeze detection
      if (frameDt * 1000 > FREEZE_THRESHOLD_MS) {
        consecutiveSlowFrames++;
        if (consecutiveSlowFrames >= 3 && !freezeDetected) {
          freezeDetected = true;
          console.warn('[Critterium] Freeze detected — resetting accumulator');
          accumulator = 0;
          consecutiveSlowFrames = 0;
          // Don't schedule another frame immediately — give browser a breath
          setTimeout(() => {
            freezeDetected = false;
            lastTime = performance.now();
            requestAnimationFrame(loop);
          }, 100);
          return;
        }
      } else {
        consecutiveSlowFrames = 0;
      }

      accumulator += frameDt;

      let stepsThisFrame = 0;
      while (accumulator >= FIXED_DT && stepsThisFrame < MAX_ACCUMULATOR_STEPS) {
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
        stepCount++;
      }

      // If accumulator is still large, drain it to prevent death spiral
      if (accumulator > FIXED_DT * 3) {
        accumulator = 0;
      }

      // Render
      renderer.update(eco.world, eco.eco, frameDt);

      requestAnimationFrame(loop);
    } catch (err) {
      onError(err);
    }
  }

  console.log('Critterium — a living world in your pocket');
  console.log(`Species: ${SPECIES_NAMES.join(', ')}`);
  console.log(`Initial particles: ${eco.aliveCount}`);
  console.log(`World: ${CONFIG.width}×${CONFIG.height}`);

  requestAnimationFrame(loop);
}

// Bootstrap with error boundary
main().catch(onError);

// Global error handlers
window.addEventListener('error', (e) => onError(e.error));
window.addEventListener('unhandledrejection', (e) => onError(e.reason));
