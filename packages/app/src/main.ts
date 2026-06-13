/**
 * Critterium — App Entry Point
 *
 * Bootstraps the simulation core and renderer.
 * Two species: prey (green), predator (red).
 * Predator eats prey. Prey flocks with prey.
 *
 * Full controls panel with: Simulation, Species, Forces, Matrix, Actions.
 * PointerForce wired to mouse/touch.
 * Preset save/load via localStorage.
 */

import {
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  DragForce,
  WanderForce,
  PointerForce,
  type InteractionEntry,
  type FalloffType,
  // Ecosystem barrel re-exports
  type EcosystemConfig,
  type SpeciesConfig,
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  defaultStaminaConfig,
  EcosystemWorld,
  processEating,
  processReproduction,
  // Config schema
  serializeConfig,
  deserializeConfig,
  applyConfig,
  type CritteriumConfig,
} from '@critterium/core';
import { CritteriumRenderer, type SpeciesVisual } from '@critterium/render';
import { createControlsPanel, resetAllSliders } from './controls.js';
import { autosave, loadAutosave, clearAutosave, exportConfig, importConfig } from './persistence.js';
import { installErrorCapture, getErrors, clearErrors, formatErrors } from './error-log.js';
import { getBuiltinPreset } from './presets.js';
import { PopulationGraph } from './population-graph.js';
import { AdaptiveQuality } from './adaptive-quality.js';

// ─── Species Definitions ─────────────────────────────────────

const SPECIES_CONFIGS: SpeciesConfig[] = [
  // 0: Prey — green, fast breeder, high endurance
  {
    name: 'Prey',
    count: 120,
    color: '#44cc44',
    radius: 3,
    initialSpeed: 60,
    maxSpeed: 100,
    energy: defaultEnergyConfig({
      maxEnergy: 80,
      initialEnergy: 100,
      reproductionCost: 20,
      movementCostPerSec: 1,
      idleDrainPerSec: 0,
      energyGainPerPrey: [0, 0],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 101,
      starvationDamagePerSec: 8,
      reproductionCooldownSec: 3,
    }),
    diet: defaultDietConfig({
      canEat: new Set<number>(),
    }),
    stamina: defaultStaminaConfig({
      sprintDurationSec: 8,
      sprintCooldownSec: 2,
      sprintSpeedMultiplier: 1.0,
      tiredSpeedMultiplier: 0.6,
    }),
  },
  // 1: Predator — red, hunts prey, burst predator
  {
    name: 'Predator',
    count: 40,
    color: '#ff4444',
    radius: 5,
    initialSpeed: 70,
    maxSpeed: 130,
    energy: defaultEnergyConfig({
      maxEnergy: 305,
      initialEnergy: 20,
      reproductionCost: 20,
      movementCostPerSec: 3,
      idleDrainPerSec: 2,
      energyGainPerPrey: [40, 0],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 60,
      starvationDamagePerSec: 5,
      reproductionCooldownSec: 8,
    }),
    diet: defaultDietConfig({
      canEat: new Set([0]),
    }),
    stamina: defaultStaminaConfig({
      sprintDurationSec: 3,
      sprintCooldownSec: 5,
      sprintSpeedMultiplier: 1.0,
      tiredSpeedMultiplier: 0.4,
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
    // [prey→*]: attract own, flee predator
    [{ enabledForces: new Set(['attract']), radius: 80, strength: 25, falloff: 'linear' },
     { enabledForces: new Set(['attract']), radius: 120, strength: -80, falloff: 'linear' }],
    // [predator→*]: chase prey, repel own
    [{ enabledForces: new Set(['attract']), radius: 150, strength: 60, falloff: 'linear' },
     { enabledForces: new Set(['attract']), radius: 50, strength: -20, falloff: 'linear' }],
  ],
};

// ─── Species Visuals ─────────────────────────────────────────
// Default visuals are now derived from liveConfig.species dynamically.

// ─── Interaction Matrix (for physics forces) ─────────────────

function buildInteractionMatrix(): InteractionMatrix {
  const matrix = new InteractionMatrix(2);

  // Prey ↔ Prey: mild flocking (attract at distance, repel close)
  matrix.set(0, 0, { strength: 30, radius: 80, falloff: 'linear' });

  // Prey → Predator: flee (repel)
  matrix.set(0, 1, { strength: -80, radius: 120, falloff: 'linear' });

  // Predator → Prey: chase (attract)
  matrix.set(1, 0, { strength: 60, radius: 150, falloff: 'linear' });

  // Predator ↔ Predator: mild spacing (repel)
  matrix.set(1, 1, { strength: -20, radius: 50, falloff: 'linear' });

  return matrix;
}

// ─── Deep clone helper ────────────────────────────────────────

function deepCloneSpeciesConfig(species: SpeciesConfig[]): SpeciesConfig[] {
  return species.map(sp => ({
    name: sp.name,
    count: sp.count,
    color: sp.color,
    radius: sp.radius,
    initialSpeed: sp.initialSpeed,
    maxSpeed: sp.maxSpeed,
    energy: { ...sp.energy, energyGainPerPrey: [...sp.energy.energyGainPerPrey] },
    lifecycle: { ...sp.lifecycle },
    diet: {
      canEat: new Set(sp.diet.canEat),
    },
    stamina: { ...sp.stamina },
  }));
}

function deepCloneConfig(config: EcosystemConfig): EcosystemConfig {
  return {
    width: config.width,
    height: config.height,
    boundaryMode: config.boundaryMode,
    seed: config.seed,
    populationCap: config.populationCap,
    species: deepCloneSpeciesConfig(config.species),
    interactionRules: config.interactionRules,
  };
}

// ─── Preset helpers ───────────────────────────────────────────

const PRESETS_KEY = 'critterium-presets';

function getSavedPresets(): string[] {
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    return json ? Object.keys(JSON.parse(json)) : [];
  } catch { return []; }
}

function savePreset(name: string, config: CritteriumConfig): void {
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    const presets = json ? JSON.parse(json) : {};
    presets[name] = config;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (err) {
    console.warn('[Critterium] Save preset failed:', err);
  }
}

function loadPreset(name: string): CritteriumConfig | null {
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    if (!json) return null;
    const presets = JSON.parse(json);
    return presets[name] ?? null;
  } catch { return null; }
}

function deletePreset(name: string): void {
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    if (!json) return;
    const presets = JSON.parse(json);
    delete presets[name];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch { /* ignore */ }
}

// ─── Error boundary ──────────────────────────────────────────

let freezeDetected = false;
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

/** Show a non-blocking performance warning toast. */
function showPerfWarning(): void {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:8px 16px;background:rgba(200,120,0,0.9);color:#fff;font:13px "SF Mono","Fira Code","Consolas",monospace;border-radius:6px;z-index:9999;pointer-events:none;transition:opacity 1s ease-out;white-space:nowrap;';
  toast.textContent = '⚠ Low performance detected — effects reduced';
  document.body.appendChild(toast);
  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 1000);
  }, 4000);
}

// ─── Build initial species values for controls ───────────────

function buildSpeciesValues(species: readonly SpeciesConfig[]): Array<Record<string, number>> {
  return species.map((sp) => ({
    count: sp.count,
    radius: sp.radius,
    initialSpeed: sp.initialSpeed,
    maxSpeed: sp.maxSpeed,
    maxEnergy: sp.energy.maxEnergy,
    initialEnergy: sp.energy.initialEnergy,
    reproductionCost: sp.energy.reproductionCost,
    movementCostPerSec: sp.energy.movementCostPerSec,
    idleDrainPerSec: sp.energy.idleDrainPerSec,
    maxAgeSec: sp.lifecycle.maxAgeSec,
    starvationDamagePerSec: sp.lifecycle.starvationDamagePerSec,
    reproductionCooldownSec: sp.lifecycle.reproductionCooldownSec,
    // Diet encoded as boolean flags
    ...Object.fromEntries(Array.from(sp.diet.canEat).map((j) => ['canEat_' + j, 1])),
  }));
}

function buildMatrixValues(
  matrix: InteractionMatrix,
  n: number,
): Array<Array<{ strength: number; radius: number; falloff: string } | null>> {
  const result: Array<Array<{ strength: number; radius: number; falloff: string } | null>> = [];
  for (let i = 0; i < n; i++) {
    const row: Array<{ strength: number; radius: number; falloff: string } | null> = [];
    for (let j = 0; j < n; j++) {
      const entry = matrix.get(i, j);
      row.push(entry ? { strength: entry.strength, radius: entry.radius, falloff: entry.falloff } : null);
    }
    result.push(row);
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Install error capture first (before anything else)
  installErrorCapture();

  // 1. Check for autosave
  let eco: EcosystemWorld;
  let interactionMatrix: InteractionMatrix;
  let useAutosave = false;
  const savedConfig = loadAutosave();

  // Live config that all control changes update
  let liveConfig = deepCloneConfig(CONFIG);

  // Check for pending preset from a species-count-changing preset load
  let hasPendingPreset = false;
  let pendingCritConfig: CritteriumConfig | null = null;
  const pendingPresetJson = localStorage.getItem('critterium-pending-preset');
  if (pendingPresetJson) {
    localStorage.removeItem('critterium-pending-preset');
    try {
      const pendingCfg = JSON.parse(pendingPresetJson);
      pendingCritConfig = deserializeConfig(pendingCfg as any);
      hasPendingPreset = true;
      console.log('[Critterium] Loaded pending preset');
    } catch (err) {
      console.warn('[Critterium] Failed to load pending preset:', err);
    }
  }

  if (savedConfig && !hasPendingPreset) {
    try {
      const validated = deserializeConfig(savedConfig as any);
      const applied = applyConfig(validated);
      eco = applied.eco;
      interactionMatrix = applied.matrix;
      useAutosave = true;
      console.log('[Critterium] Restored from autosave');
      clearAutosave();
    } catch {
      console.warn('[Critterium] Autosave restore failed, starting fresh');
      eco = new EcosystemWorld(liveConfig);
      interactionMatrix = buildInteractionMatrix();
    }
  } else if (hasPendingPreset && pendingCritConfig) {
    // Pending preset from a species-count-changing switch — use applyConfig
    // to build a properly-sized InteractionMatrix instead of the hardcoded 2×2 one
    try {
      const applied = applyConfig(pendingCritConfig);
      eco = applied.eco;
      interactionMatrix = applied.matrix;
      liveConfig = deepCloneConfig(eco.config);
      console.log('[Critterium] Applied pending preset');
    } catch (err) {
      console.warn('[Critterium] Pending preset apply failed, starting fresh:', err);
      eco = new EcosystemWorld(liveConfig);
      interactionMatrix = buildInteractionMatrix();
    }
  } else {
    eco = new EcosystemWorld(liveConfig);
    interactionMatrix = buildInteractionMatrix();
  }

  // 2. Build physics forces
  const pairwiseForce = new PairwiseForce(interactionMatrix);
  const dragForce = new DragForce(0.8);
  const wanderForce = new WanderForce(40, 2.5);
  const pointerForce = new PointerForce(200, 150, 'linear');

  // Active force tracking
  let dragEnabled = true;
  let wanderEnabled = true;
  let pointerEnabled = false;

  // 3. Spatial hash grid (mutable — recreated when cap or world size changes)
  let grid = new SpatialHashGrid(
    eco.config.width,
    eco.config.height,
    150,
    eco.config.populationCap,
  );

  // 4. Create renderer — derive visuals from liveConfig (supports preset-loaded species)
  const activeSpeciesNames = liveConfig.species.map(s => s.name);
  const activeSpeciesVisuals = liveConfig.species.map(s => {
    const hex = s.color.replace('#', '');
    return { color: parseInt(hex, 16), radius: s.radius };
  });
  const speciesMaxEnergy = new Float32Array(liveConfig.species.map(s => s.energy.maxEnergy));
  const renderer = await CritteriumRenderer.create(
    activeSpeciesVisuals,
    activeSpeciesNames,
    eco.config.populationCap,
    speciesMaxEnergy,
  );

  /** Sync renderer species visuals from liveConfig */
  function syncRendererVisuals(): void {
    const visuals: SpeciesVisual[] = liveConfig.species.map(s => {
      const hex = s.color.replace('#', '');
      return { color: parseInt(hex, 16), radius: s.radius };
    });
    renderer.updateSpeciesVisuals(visuals);
    renderer.setSpeciesMaxEnergy(new Float32Array(liveConfig.species.map(s => s.energy.maxEnergy)));
  }

  // Attach canvas to DOM
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.appendChild(renderer.app.canvas as HTMLCanvasElement);
  }

  // 4b. Create always-visible FPS counter
  const fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;font:12px "SF Mono","Fira Code","Consolas",monospace;color:#fff;background:rgba(0,0,0,0.5);padding:3px 7px;border-radius:4px;z-index:20;pointer-events:none;';
  fpsEl.textContent = 'FPS: --';
  document.body.appendChild(fpsEl);

  // FPS tracking state
  let fpsFrameCount = 0;
  let fpsTimer = 0;

  // 4c. Create population graph overlay
  const popGraphCanvas = document.createElement('canvas');
  document.body.appendChild(popGraphCanvas);
  const popGraph = new PopulationGraph(popGraphCanvas, {
    speciesColors: activeSpeciesVisuals.map(v => v.color),
    maxHistorySec: 30,
  });

  // 4d. Adaptive quality system
  const adaptiveQuality = new AdaptiveQuality();
  let lowQualityStartTime = -1;
  let perfWarningShown = false;

  adaptiveQuality.onChange((level, settings) => {
    console.log(`[Critterium] Quality changed to ${level}`);

    // Apply quality settings to renderer
    renderer.renderSkip = settings.renderSkip;
    renderer.effectsEnabled = settings.effectsEnabled;
    renderer.energyOpacityEnabled = settings.energyOpacityEnabled;

    // Track when quality went to 'low'
    if (level === 'low') {
      lowQualityStartTime = performance.now() / 1000;
      perfWarningShown = false;
    } else {
      lowQualityStartTime = -1;
      perfWarningShown = false;
    }
  });

  // 5. Simulation loop with freeze detection
  const BASE_DT = 1 / 60;
  let speedMultiplier = 1;
  const MAX_FRAME_DT = 0.1;
  const MAX_ACCUMULATOR_STEPS = 3;
  const FREEZE_THRESHOLD_MS = 500;
  let accumulator = 0;
  let lastTime = performance.now();
  let totalSimTime = 0;
  let stepCount = 0;
  let paused = false;
  let extinctionCount = 0;

  // Pre-allocated species counts array (avoid per-frame allocation)
  let speciesCounts = new Int32Array(liveConfig.species.length);

  // ─── Matrix state tracking ──────────────────────────────────
  let nSpecies = liveConfig.species.length;
  let matrixState: Array<Array<{ strength: number; radius: number; falloff: string } | null>>;

  function initMatrixState(matrix: InteractionMatrix): void {
    matrixState = buildMatrixValues(matrix, nSpecies);
  }
  initMatrixState(interactionMatrix);

  // ─── rebuildSimulation ──────────────────────────────────────
  function rebuildSimulation(): void {
    try {
      // Create new ecosystem from live config
      eco = new EcosystemWorld(liveConfig);

      // Rebuild interaction matrix from current matrix state
      const n = matrixState.length;
      interactionMatrix = new InteractionMatrix(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cell = matrixState[i]?.[j];
          if (cell) {
            interactionMatrix.set(i, j, { strength: cell.strength, radius: cell.radius, falloff: cell.falloff as FalloffType });
          }
        }
      }
      (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;

      // Recreate spatial hash grid if cap or world dimensions changed
      if (grid.cellSize !== 150 ||
          grid.cols !== Math.ceil(liveConfig.width / 150) ||
          grid.rows !== Math.ceil(liveConfig.height / 150) ||
          eco.config.populationCap !== liveConfig.populationCap) {
        grid = new SpatialHashGrid(
          liveConfig.width,
          liveConfig.height,
          150,
          liveConfig.populationCap,
        );
      }

      // Rebuild spatial hash (skip dead particles, only up to highWaterMark)
      grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);

      // Reset timing
      accumulator = 0;
      lastTime = performance.now();

      // Reset renderer state (clear stale birth/death effects + prevAlive)
      renderer.resetState();

      // Reallocate species counts array for current species count
      speciesCounts = new Int32Array(liveConfig.species.length);

      // Update population graph colors and reset history
      popGraph.reset();
      popGraph.setColors(liveConfig.species.map(s => {
        const hex = s.color;
        return parseInt(hex.slice(1), 16);
      }));

      // Clear stale autosave
      clearAutosave();

      console.log(`[Critterium] Simulation rebuilt: ${eco.aliveCount} particles, cap ${liveConfig.populationCap}`);
    } catch (err) {
      console.error('[Critterium] rebuildSimulation failed:', err);
      onError(err);
    }
  }

  function getCurrentConfig(): CritteriumConfig {
    const activeForces: Array<{ readonly id: string; readonly params: Record<string, unknown> }> = [dragForce, wanderForce];
    if (pointerEnabled) activeForces.push(pointerForce);
    return serializeConfig(eco, interactionMatrix, activeForces);
  }

  function doAutosave(): void {
    try {
      const config = getCurrentConfig();
      autosave(config);
    } catch {
      // Silently ignore autosave failures
    }
  }

  function getEffectiveDt(): number {
    return BASE_DT * speedMultiplier;
  }

  function applyForces(dt: number): void {
    // Rebuild spatial hash (skip dead particles, only up to highWaterMark)
    grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);

    // Apply active forces
    pairwiseForce.apply(eco.world, grid, dt);
    if (dragEnabled) dragForce.apply(eco.world, grid, dt);
    if (wanderEnabled) wanderForce.apply(eco.world, grid, dt);
    if (pointerEnabled) pointerForce.apply(eco.world, grid, dt);
  }

  function loop(now: number): void {
    try {
      if (paused) {
        requestAnimationFrame(loop);
        return;
      }

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

      const dt = getEffectiveDt();
      accumulator += frameDt;

      // If accumulator is way too large, drain it immediately to prevent death spiral
      if (accumulator > dt * 2) {
        accumulator = dt;
      }

      let stepsThisFrame = 0;
      while (accumulator >= dt && stepsThisFrame < MAX_ACCUMULATOR_STEPS) {
        applyForces(dt);

        // Process stamina (after forces, before physics step)
        eco.processStamina(dt);

        // Step physics
        eco.world.step(dt);

        // Process ecosystem systems
        eco.processLifecycle(dt);
        processEating(eco, grid);
        processReproduction(eco);

        // Population overflow protection: force-kill excess particles
        if (eco.aliveCount > liveConfig.populationCap * 1.5) {
          const excess = eco.aliveCount - liveConfig.populationCap;
          let killed = 0;
          const hwm = eco.highWaterMark;
          // Kill oldest particles first
          for (let i = 0; i < hwm && killed < excess; i++) {
            if (eco.eco.alive[i] !== 0) {
              eco.kill(i);
              killed++;
            }
          }
          console.warn(`[Critterium] Population overflow: killed ${killed} excess particles`);
        }

        totalSimTime += dt;
        accumulator -= dt;
        stepsThisFrame++;
        stepCount++;
      }

      // Extinction detection: if all particles died after sim has been running,
      // auto-reseed from current config (avoids empty screen with no way back)
      if (eco.aliveCount === 0 && totalSimTime > 2 && !paused) {
        console.log('[Critterium] Extinction detected — auto-reseeding');
        extinctionCount++;
        rebuildSimulation();
        totalSimTime = 0;
      }

      // If accumulator is still large, drain it to prevent death spiral
      if (accumulator > dt * 2) {
        accumulator = 0;
      }

      // Render
      renderer.update(eco.world, eco.eco, frameDt);

      // Compute per-species counts for population graph (reuse pre-allocated array)
      speciesCounts.fill(0);
      const hwm = eco.highWaterMark;
      for (let i = 0; i < hwm; i++) {
        if (eco.eco.alive[i] !== 0) {
          const sp = eco.world.type[i];
          if (sp < speciesCounts.length) speciesCounts[sp]++;
        }
      }

      // Update population graph (pass typed array directly)
      // Respect adaptive quality graphEnabled setting
      if (adaptiveQuality.quality.graphEnabled) {
        popGraph.update(speciesCounts, frameDt);
      }

      // Update FPS counter
      fpsFrameCount++;
      fpsTimer += frameDt;
      if (fpsTimer >= 0.5) {
        const fps = Math.round(fpsFrameCount / fpsTimer);
        fpsEl.textContent = `FPS: ${fps}`;

        // Feed FPS to adaptive quality system (every 0.5s)
        adaptiveQuality.update(fps);

        // Check for sustained low FPS warning
        if (lowQualityStartTime > 0 && !perfWarningShown) {
          const now = performance.now() / 1000;
          if (now - lowQualityStartTime >= 5 && fps < 20) {
            perfWarningShown = true;
            showPerfWarning();
          }
        }

        fpsFrameCount = 0;
        fpsTimer = 0;
      }

      requestAnimationFrame(loop);
    } catch (err) {
      onError(err);
    }
  }

  // 6. Wire pointer/touch events
  const canvas = renderer.app.canvas as HTMLCanvasElement;
  let pointerDown = false;

  function updatePointerFromEvent(e: MouseEvent | Touch): void {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    pointerForce.setPosition(x, y, true);
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!pointerEnabled) return;
    pointerDown = true;
    updatePointerFromEvent(e);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!pointerDown || !pointerEnabled) return;
    updatePointerFromEvent(e);
  });
  window.addEventListener('mouseup', () => {
    pointerDown = false;
    pointerForce.setPosition(0, 0, false);
  });
  canvas.addEventListener('touchstart', (e) => {
    if (!pointerEnabled) return;
    e.preventDefault();
    pointerDown = true;
    if (e.touches[0]) updatePointerFromEvent(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!pointerEnabled) return;
    e.preventDefault();
    if (e.touches[0]) updatePointerFromEvent(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchend', () => {
    pointerDown = false;
    pointerForce.setPosition(0, 0, false);
  });

  // 7. Build initial values for controls
  const initialSpeciesValues = buildSpeciesValues(liveConfig.species);
  const initialMatrixValues = buildMatrixValues(interactionMatrix, nSpecies);

  // 8. Wire controls panel
  const controlsPanel = createControlsPanel({
    speciesCount: nSpecies,
    speciesNames: activeSpeciesNames,
    speciesColors: liveConfig.species.map(s => s.color),
    initialSpeciesValues,
    initialMatrixValues,
    initialForceValues: {
      drag: { coefficient: 0.8, _enabled: 1 },
      wander: { strength: 40, rate: 2.5, _enabled: 1 },
      pointer: { strength: 200, radius: 150, falloff: 0, _enabled: 0 },
      _popCap: liveConfig.populationCap as unknown as Record<string, number>,
    },

    onTogglePause: (p: boolean) => {
      paused = p;
      if (p) doAutosave();
    },

    onReset: () => {
      // Reset to the original CONFIG defaults
      liveConfig = deepCloneConfig(CONFIG);
      interactionMatrix = buildInteractionMatrix();
      initMatrixState(interactionMatrix);
      rebuildSimulation();
      // Sync all UI sliders to the reset values
      resetAllSliders({
        speciesValues: buildSpeciesValues(liveConfig.species),
        simValues: { speed: speedMultiplier, popCap: liveConfig.populationCap },
        forceValues: {
          drag: { coefficient: (dragForce.params as Record<string, unknown>).coefficient as number },
          wander: { strength: (wanderForce.params as Record<string, unknown>).strength as number, rate: (wanderForce.params as Record<string, unknown>).rate as number },
          pointer: { strength: (pointerForce.params as Record<string, unknown>).strength as number, radius: (pointerForce.params as Record<string, unknown>).radius as number },
        },
      });
    },

    onReseed: () => {
      const newSeed = Math.floor(Math.random() * 2147483647);
      liveConfig.seed = newSeed;
      rebuildSimulation();
    },

    onSpeedChange: (multiplier: number) => {
      speedMultiplier = multiplier;
    },

    onPopulationCapChange: (cap: number) => {
      liveConfig.populationCap = cap;
      rebuildSimulation();
    },

    onForceToggle: (forceId: string, enabled: boolean) => {
      if (forceId === 'drag') dragEnabled = enabled;
      else if (forceId === 'wander') wanderEnabled = enabled;
      else if (forceId === 'pointer') pointerEnabled = enabled;
    },

    onForceChange: (forceId: string, param: string, value: number) => {
      if (forceId === 'drag' && param === 'coefficient') {
        (dragForce.params as Record<string, unknown>).coefficient = value;
      } else if (forceId === 'wander' && param === 'strength') {
        (wanderForce.params as Record<string, unknown>).strength = value;
      } else if (forceId === 'wander' && param === 'rate') {
        (wanderForce.params as Record<string, unknown>).rate = value;
      } else if (forceId === 'pointer' && param === 'strength') {
        (pointerForce.params as Record<string, unknown>).strength = value;
      } else if (forceId === 'pointer' && param === 'radius') {
        (pointerForce.params as Record<string, unknown>).radius = value;
      } else if (forceId === 'pointer' && param.startsWith('falloff_')) {
        const falloff = param.replace('falloff_', '');
        (pointerForce.params as Record<string, unknown>).falloff = falloff;
      }
    },

    onMatrixChange: (i: number, j: number, strength: number, minRadius: number, maxRadius: number, falloff: string) => {
      const entry: InteractionEntry = { strength, minRadius, radius: maxRadius, falloff: falloff as 'linear' | 'inverse' | 'constant' };
      interactionMatrix.set(i, j, entry);
      // Update tracked state
      if (!matrixState[i]) matrixState[i] = [];
      matrixState[i][j] = { strength, radius: maxRadius, falloff };
    },

    onRandomizeMatrix: () => {
      const n = interactionMatrix.numTypes;
      interactionMatrix = new InteractionMatrix(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const str = Math.round((Math.random() - 0.5) * 200);
          if (Math.abs(str) > 10) {
            const entry = {
              strength: str,
              radius: 50 + Math.random() * 100,
              falloff: 'linear' as const,
            };
            interactionMatrix.set(i, j, entry);
            if (!matrixState[i]) matrixState[i] = [];
            matrixState[i][j] = { ...entry };
          } else {
            if (matrixState[i]) matrixState[i][j] = null;
          }
        }
      }
      (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
    },

    onClearMatrix: () => {
      const n = interactionMatrix.numTypes;
      interactionMatrix = new InteractionMatrix(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (matrixState[i]) matrixState[i][j] = null;
        }
      }
      (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
    },

    onSpeciesChange: (speciesIndex: number, param: string, value: number | string | boolean) => {
      if (speciesIndex < 0 || speciesIndex >= liveConfig.species.length) return;
      const sp = liveConfig.species[speciesIndex];
      if (!sp) return;

      if (param === 'name' && typeof value === 'string') {
        sp.name = value;
      } else if (param === 'color' && typeof value === 'string') {
        sp.color = value;
        syncRendererVisuals();
      } else if (param === 'count' && typeof value === 'number') {
        sp.count = value;
        rebuildSimulation();
      } else if (param === 'radius' && typeof value === 'number') {
        sp.radius = value;
        syncRendererVisuals();
        rebuildSimulation();
      } else if (param === 'initialSpeed' && typeof value === 'number') {
        sp.initialSpeed = value;
        rebuildSimulation();
      } else if (param === 'maxSpeed' && typeof value === 'number') {
        sp.maxSpeed = value;
        rebuildSimulation();
      } else if (param === 'maxEnergy' && typeof value === 'number') {
        sp.energy.maxEnergy = value;
        rebuildSimulation();
      } else if (param === 'initialEnergy' && typeof value === 'number') {
        sp.energy.initialEnergy = value;
        rebuildSimulation();
      } else if (param === 'reproductionCost' && typeof value === 'number') {
        sp.energy.reproductionCost = value;
        rebuildSimulation();
      } else if (param === 'movementCostPerSec' && typeof value === 'number') {
        sp.energy.movementCostPerSec = value;
        rebuildSimulation();
      } else if (param === 'idleDrainPerSec' && typeof value === 'number') {
        sp.energy.idleDrainPerSec = value;
        rebuildSimulation();
      } else if (param === 'maxAgeSec' && typeof value === 'number') {
        sp.lifecycle.maxAgeSec = value;
        rebuildSimulation();
      } else if (param === 'starvationDamagePerSec' && typeof value === 'number') {
        sp.lifecycle.starvationDamagePerSec = value;
        rebuildSimulation();
      } else if (param === 'reproductionCooldownSec' && typeof value === 'number') {
        sp.lifecycle.reproductionCooldownSec = value;
        rebuildSimulation();
      } else if (param.startsWith('canEat_') && typeof value === 'boolean') {
        const targetIdx = parseInt(param.replace('canEat_', ''));
        if (value) sp.diet.canEat.add(targetIdx);
        else sp.diet.canEat.delete(targetIdx);
        rebuildSimulation();
      } else if (param === 'sprintDurationSec' && typeof value === 'number') {
        if (!sp.stamina) sp.stamina = defaultStaminaConfig();
        sp.stamina.sprintDurationSec = value;
        rebuildSimulation();
      } else if (param === 'sprintCooldownSec' && typeof value === 'number') {
        if (!sp.stamina) sp.stamina = defaultStaminaConfig();
        sp.stamina.sprintCooldownSec = value;
        rebuildSimulation();
      } else if (param === 'sprintSpeedMultiplier' && typeof value === 'number') {
        if (!sp.stamina) sp.stamina = defaultStaminaConfig();
        sp.stamina.sprintSpeedMultiplier = value;
        rebuildSimulation();
      } else if (param === 'tiredSpeedMultiplier' && typeof value === 'number') {
        if (!sp.stamina) sp.stamina = defaultStaminaConfig();
        sp.stamina.tiredSpeedMultiplier = value;
        rebuildSimulation();
      }
    },

    onAddSpecies: () => {
      // Add a new default species to the config and reload
      const newIdx = liveConfig.species.length;
      const defaultColors = ['#44cc44', '#ff4444', '#cc44cc', '#ffcc44', '#44ccff', '#ff44cc'];
      const newSpecies: SpeciesConfig = {
        name: `Species ${newIdx + 1}`,
        count: 50,
        color: defaultColors[newIdx % defaultColors.length],
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig({
          maxEnergy: 100,
          initialEnergy: 50,
          reproductionCost: 40,
          movementCostPerSec: 2,
          idleDrainPerSec: 1,
          energyGainPerPrey: Array(newIdx + 1).fill(0),
        }),
        lifecycle: defaultLifecycleConfig({
          maxAgeSec: 60,
          starvationDamagePerSec: 10,
          reproductionCooldownSec: 5,
        }),
        diet: defaultDietConfig({ canEat: new Set<number>() }),
      };
      liveConfig.species.push(newSpecies);
      nSpecies = liveConfig.species.length;
      // Extend all existing species' energyGainPerPrey arrays for the new species count
      for (const sp of liveConfig.species) {
        while (sp.energy.energyGainPerPrey.length < nSpecies) {
          sp.energy.energyGainPerPrey.push(0);
        }
      }
      // Expand interaction matrix state to accommodate new species
      while (matrixState.length < nSpecies) {
        matrixState.push(new Array(nSpecies).fill(null));
      }
      for (const row of matrixState) {
        while (row.length < nSpecies) row.push(null);
      }
      // Build a fresh config from liveConfig + expanded matrixState instead of
      // using getCurrentConfig() which reads from the OLD eco/interactionMatrix
      // that are still sized for the previous species count.
      const pendingConfig = {
        version: 1 as const,
        simulation: {
          width: liveConfig.width,
          height: liveConfig.height,
          boundaryMode: liveConfig.boundaryMode,
          seed: liveConfig.seed,
          populationCap: liveConfig.populationCap,
        },
        species: liveConfig.species.map(sp => ({
          name: sp.name,
          count: sp.count,
          color: sp.color,
          radius: sp.radius,
          initialSpeed: sp.initialSpeed,
          maxSpeed: sp.maxSpeed,
          energy: {
            maxEnergy: sp.energy.maxEnergy,
            initialEnergy: sp.energy.initialEnergy,
            movementCostPerSec: sp.energy.movementCostPerSec,
            reproductionCost: sp.energy.reproductionCost,
            idleDrainPerSec: sp.energy.idleDrainPerSec,
            energyGainPerPrey: [...sp.energy.energyGainPerPrey],
          },
          lifecycle: {
            maxAgeSec: sp.lifecycle.maxAgeSec,
            starvationDamagePerSec: sp.lifecycle.starvationDamagePerSec,
            reproductionCooldownSec: sp.lifecycle.reproductionCooldownSec,
          },
          diet: { canEat: Array.from(sp.diet.canEat) },
        })),
        interactionMatrix: matrixState.map(row =>
          row.map(cell => cell ? { strength: cell.strength, radius: cell.radius, falloff: cell.falloff } : null)
        ),
        forces: { drag: { id: 'drag', params: { strength: dragForce.params.strength } }, wander: { id: 'wander', params: { strength: wanderForce.params.strength } } },
      };
      localStorage.setItem('critterium-pending-preset', JSON.stringify(pendingConfig));
      window.location.reload();
    },

    onDeleteSpecies: (speciesIndex: number) => {
      if (liveConfig.species.length <= 1) return;
      // Remove species from config
      liveConfig.species.splice(speciesIndex, 1);
      nSpecies = liveConfig.species.length;
      // Remove from matrixState: delete row and column
      matrixState.splice(speciesIndex, 1);
      for (const row of matrixState) {
        row.splice(speciesIndex, 1);
      }
      // Fix diet canEat references (shift indices > speciesIndex down by 1, remove speciesIndex)
      for (const sp of liveConfig.species) {
        const newCanEat = new Set<number>();
        sp.diet.canEat.forEach((idx) => {
          if (idx === speciesIndex) return;
          newCanEat.add(idx > speciesIndex ? idx - 1 : idx);
        });
        sp.diet.canEat = newCanEat;
      }
      // Fix energyGainPerPrey: remove entry at speciesIndex
      for (const sp of liveConfig.species) {
        sp.energy.energyGainPerPrey.splice(speciesIndex, 1);
      }
      // Build pending config and reload
      const pendingConfig = {
        version: 1 as const,
        simulation: {
          width: liveConfig.width,
          height: liveConfig.height,
          boundaryMode: liveConfig.boundaryMode,
          seed: liveConfig.seed,
          populationCap: liveConfig.populationCap,
        },
        species: liveConfig.species.map(sp => ({
          name: sp.name,
          count: sp.count,
          color: sp.color,
          radius: sp.radius,
          initialSpeed: sp.initialSpeed,
          maxSpeed: sp.maxSpeed,
          energy: {
            maxEnergy: sp.energy.maxEnergy,
            initialEnergy: sp.energy.initialEnergy,
            movementCostPerSec: sp.energy.movementCostPerSec,
            reproductionCost: sp.energy.reproductionCost,
            idleDrainPerSec: sp.energy.idleDrainPerSec,
            energyGainPerPrey: [...sp.energy.energyGainPerPrey],
          },
          lifecycle: {
            maxAgeSec: sp.lifecycle.maxAgeSec,
            starvationDamagePerSec: sp.lifecycle.starvationDamagePerSec,
            reproductionCooldownSec: sp.lifecycle.reproductionCooldownSec,
          },
          diet: { canEat: Array.from(sp.diet.canEat) },
        })),
        interactionMatrix: matrixState.map(row =>
          row.map(cell => cell ? { strength: cell.strength, radius: cell.radius, falloff: cell.falloff } : null)
        ),
        forces: { drag: { id: 'drag', params: { strength: dragForce.params.strength } }, wander: { id: 'wander', params: { strength: wanderForce.params.strength } } },
      };
      localStorage.setItem('critterium-pending-preset', JSON.stringify(pendingConfig));
      window.location.reload();
    },

    onExport: () => {
      const config = getCurrentConfig();
      exportConfig(config, 'critterium-config.json');
    },

    onShowErrorLog: () => {
      const errs = getErrors();
      if (errs.length === 0) {
        alert('No errors captured.');
        return;
      }
      const text = formatErrors();
      // Show in a modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#1a1a1a;color:#ff6666;border:1px solid #ff4444;border-radius:8px;padding:16px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      const title = document.createElement('span');
      title.textContent = `Error Log (${errs.length} errors)`;
      title.style.cssText = 'font-weight:bold;color:#fff;';
      header.appendChild(title);
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copy';
      copyBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #555;padding:4px 12px;border-radius:4px;cursor:pointer;margin-right:4px;';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = '✓ Copied!'; });
      });
      header.appendChild(copyBtn);
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #555;padding:4px 8px;border-radius:4px;cursor:pointer;';
      closeBtn.addEventListener('click', () => overlay.remove());
      header.appendChild(closeBtn);
      box.appendChild(header);
      const pre = document.createElement('pre');
      pre.style.cssText = 'overflow:auto;flex:1;font:11px "SF Mono","Fira Code","Consolas",monospace;white-space:pre-wrap;word-break:break-all;';
      pre.textContent = text;
      box.appendChild(pre);
      overlay.appendChild(box);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    },

    onClearErrorLog: () => {
      clearErrors();
    },

    onImport: async () => {
      const imported = await importConfig();
      if (imported) {
        try {
          const validated = deserializeConfig(imported as any);
          const applied = applyConfig(validated);
          eco = applied.eco;
          interactionMatrix = applied.matrix;
          (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
          initMatrixState(interactionMatrix);
          grid.rebuild(eco.world);
          // Update liveConfig to match
          liveConfig = deepCloneConfig(eco.config);
          accumulator = 0;
          lastTime = performance.now();
          clearAutosave();
        } catch (err) {
          console.error('[Critterium] Import failed:', err);
        }
      }
    },

    onSavePreset: (name: string) => {
      const config = getCurrentConfig();
      savePreset(name, config);
    },

    onLoadPreset: (name: string) => {
      const config = loadPreset(name);
      if (config) {
        try {
          const validated = deserializeConfig(config as any);
          const applied = applyConfig(validated);
          eco = applied.eco;
          interactionMatrix = applied.matrix;
          (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
          initMatrixState(interactionMatrix);
          grid.rebuild(eco.world);
          // Update liveConfig to match
          liveConfig = deepCloneConfig(eco.config);
          accumulator = 0;
          lastTime = performance.now();
          clearAutosave();
        } catch (err) {
          console.error('[Critterium] Load preset failed:', err);
        }
      }
    },

    onDeletePreset: (name: string) => {
      deletePreset(name);
    },

    onLoadBuiltinPreset: (name: string) => {
      const preset = getBuiltinPreset(name);
      if (!preset) {
        console.warn('[Critterium] Unknown built-in preset:', name);
        return;
      }
      try {
        // If species count differs, do a full reload with the preset as initial config
        const newCount = preset.config.species.length;
        if (newCount !== liveConfig.species.length) {
          const cfg = {
            ...preset.config,
            simulation: {
              ...preset.config.simulation,
              width: window.innerWidth,
              height: window.innerHeight,
            },
          };
          localStorage.setItem('critterium-pending-preset', JSON.stringify(cfg));
          window.location.reload();
          return;
        }

        // Same species count — fast path: hot-reload without page refresh
        // Override simulation dimensions to current viewport
        const cfg = {
          ...preset.config,
          simulation: {
            ...preset.config.simulation,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
        const validated = deserializeConfig(cfg as any);
        const applied = applyConfig(validated);
        eco = applied.eco;
        interactionMatrix = applied.matrix;
        (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
        initMatrixState(interactionMatrix);
        grid.rebuild(eco.world);
        // Update liveConfig to match
        liveConfig = deepCloneConfig(eco.config);
        // Also update drag and wander forces from preset
        if (cfg.forces?.drag) {
          (dragForce.params as Record<string, unknown>).coefficient = cfg.forces.drag.coefficient;
        }
        if (cfg.forces?.wander) {
          (wanderForce.params as Record<string, unknown>).strength = cfg.forces.wander.strength;
          (wanderForce.params as Record<string, unknown>).rate = cfg.forces.wander.rate;
        }
        accumulator = 0;
        lastTime = performance.now();
        clearAutosave();

        // Update controls panel to reflect new preset values
        resetAllSliders({
          speciesValues: buildSpeciesValues(liveConfig.species),
          simValues: { speed: speedMultiplier, popCap: liveConfig.populationCap },
          forceValues: {
            drag: { coefficient: (dragForce.params as Record<string, unknown>).coefficient as number },
            wander: {
              strength: (wanderForce.params as Record<string, unknown>).strength as number,
              rate: (wanderForce.params as Record<string, unknown>).rate as number,
            },
            pointer: {
              strength: (pointerForce.params as Record<string, unknown>).strength as number,
              radius: (pointerForce.params as Record<string, unknown>).radius as number,
            },
          },
        });
      } catch (err) {
        console.error('[Critterium] Load built-in preset failed:', err);
      }
    },

    getSavedPresets: () => getSavedPresets(),
    getConfig: () => getCurrentConfig(),
    applyImportedConfig: (config: CritteriumConfig) => {
      try {
        const validated = deserializeConfig(config as any);
        const applied = applyConfig(validated);
        eco = applied.eco;
        interactionMatrix = applied.matrix;
        (pairwiseForce as { matrix: InteractionMatrix }).matrix = interactionMatrix;
        initMatrixState(interactionMatrix);
        grid.rebuild(eco.world);
        // Update liveConfig to match
        liveConfig = deepCloneConfig(eco.config);
        accumulator = 0;
        lastTime = performance.now();
        clearAutosave();
      } catch (err) {
        console.error('[Critterium] Apply config failed:', err);
      }
    },
  });

  // Mount controls panel
  if (appEl) {
    appEl.appendChild(controlsPanel);
  }

  // 9. Autosave wiring
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      doAutosave();
    }
  });

  window.addEventListener('beforeunload', () => {
    doAutosave();
  });

  // 10. Capacitor pause/resume (mobile background handling)
  document.addEventListener('pause', () => {
    paused = true;
    doAutosave();
    console.log('[Critterium] Paused (app backgrounded)');
  });
  document.addEventListener('resume', () => {
    paused = false;
    lastTime = performance.now();
    accumulator = 0;
    console.log('[Critterium] Resumed (app foregrounded)');
  });

  console.log('Critterium — a living world in your pocket');
  console.log(`Species: ${activeSpeciesNames.join(', ')}`);
  console.log(`Initial particles: ${eco.aliveCount}`);
  console.log(`World: ${eco.config.width}×${eco.config.height}`);
  if (useAutosave) {
    console.log('[Critterium] Resumed from autosave');
  }

  requestAnimationFrame(loop);
}

// Bootstrap with error boundary
main().catch(onError);

// Global error handlers
window.addEventListener('error', (e) => onError(e.error));
window.addEventListener('unhandledrejection', (e) => onError(e.reason));
