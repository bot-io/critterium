/**
 * Critterium — Render Module
 *
 * PixiJS v8 adapter for rendering the simulation.
 * One circle Graphics per particle, colored by species.
 * HUD overlay with particle count and species counts.
 *
 * Visual effects:
 * - Energy-based opacity
 * - Sickness rings (pulsing red)
 * - Death expanding rings (object pool)
 * - Birth flash (object pool)
 * - Infection aura
 *
 * Performance controls:
 * - renderSkip: only render every Nth particle
 * - effectsEnabled: toggle death/birth effects
 * - sicknessRingsEnabled: toggle sickness ring rendering
 * - energyOpacityEnabled: toggle energy-based alpha
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { World, EcosystemState } from '@critterium/core';
import { DEAD } from '@critterium/core';

// ─── Species visual config ────────────────────────────────────

export interface SpeciesVisual {
  color: number;
  radius: number;
}

// ─── Object pool for transient effects ────────────────────────

interface DeathEffect {
  g: Graphics;
  x: number;
  y: number;
  color: number;
  radius: number;
  elapsed: number;
  duration: number;
}

interface BirthEffect {
  g: Graphics;
  idx: number;
  elapsed: number;
  duration: number;
}

const MAX_DEATH_EFFECTS = 20;
const MAX_BIRTH_EFFECTS = 20;

// ─── CritteriumRenderer ──────────────────────────────────────

export class CritteriumRenderer {
  readonly app: Application;
  private particleContainer!: Container;
  private effectsContainer!: Container;
  private sicknessContainer!: Container;
  private birthFlashContainer!: Container;
  private hudContainer!: Container;
  private hudText!: Text;

  /** Per-particle graphics objects (indexed by particle index). */
  private sprites: Graphics[] = [];

  /** Per-sprite cached species index (avoid redraws). */
  private spriteSpecies: number[] = [];

  /** Species visual config (indexed by species/type). */
  private speciesVisuals: SpeciesVisual[];

  /** Per-species max energy for opacity calculations. */
  private speciesMaxEnergy: Float32Array;

  /** Per-species names for HUD. */
  private speciesNames: string[];

  /** Previous alive state for death/birth detection. */
  private prevAlive: Uint8Array;

  /** Death effect object pool. */
  private deathPool: DeathEffect[] = [];

  /** Birth effect object pool. */
  private birthPool: BirthEffect[] = [];

  /** Skip birth/death detection for one frame after reset or fresh init. */
  private skipEffectsFrame = true;

  /** Pulsing phase for sickness rings. */
  private pulsePhase = 0;

  /** Render skip: only render every Nth particle (1 = all, 2 = every 2nd). */
  renderSkip: number = 1;

  /** Whether particle effects (death/birth) are enabled. */
  effectsEnabled: boolean = true;

  /** Whether energy-based opacity modulation is enabled. */
  energyOpacityEnabled: boolean = true;

  /** Pre-allocated species counts array (avoids per-frame allocation). */
  private speciesCounts: Int32Array;

  constructor(
    app: Application,
    speciesVisuals: SpeciesVisual[],
    speciesNames: string[],
    speciesMaxEnergy: Float32Array,
    maxParticles: number,
  ) {
    this.app = app;
    this.speciesVisuals = speciesVisuals;
    this.speciesNames = speciesNames;
    this.speciesMaxEnergy = speciesMaxEnergy;
    this.prevAlive = new Uint8Array(maxParticles);
    // Initialize all as DEAD so first frame detects births
    this.prevAlive.fill(DEAD);
    // Pre-allocate species counts (avoids allocation in hot path)
    this.speciesCounts = new Int32Array(speciesVisuals.length);
    this.setupScene(maxParticles);
  }

  /**
   * Reset tracking state (prevAlive, effect pools). Call after sim rebuild
   * to prevent stale birth/death effects from lingering.
   */
  resetState(): void {
    this.prevAlive.fill(DEAD);
    this.skipEffectsFrame = true;
    for (const effect of this.birthPool) {
      effect.g.visible = false;
      effect.elapsed = -1;
      effect.idx = -1;
    }
    for (const effect of this.deathPool) {
      effect.g.visible = false;
      effect.elapsed = -1;
    }
  }

  /**
   * Create and initialise the renderer.
   * Resolves when the PixiJS Application is ready.
   */
  static async create(
    speciesVisuals: SpeciesVisual[],
    speciesNames: string[],
    maxParticles: number,
    speciesMaxEnergy?: Float32Array,
  ): Promise<CritteriumRenderer> {
    const app = new Application();
    await app.init({
      background: '#111111',
      resizeTo: window,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Default max energy per species if not provided
    const maxE = speciesMaxEnergy ?? new Float32Array(speciesVisuals.length).fill(100);

    const renderer = new CritteriumRenderer(app, speciesVisuals, speciesNames, maxE, maxParticles);
    return renderer;
  }

  /** Set up the display containers and pre-allocate particle sprites. */
  private setupScene(maxParticles: number): void {
    this.particleContainer = new Container();
    this.particleContainer.label = 'particles';
    this.app.stage.addChild(this.particleContainer);

    this.effectsContainer = new Container();
    this.effectsContainer.label = 'death-effects';
    this.app.stage.addChild(this.effectsContainer);

    this.sicknessContainer = new Container();
    this.sicknessContainer.label = 'sickness-rings';
    this.app.stage.addChild(this.sicknessContainer);

    this.birthFlashContainer = new Container();
    this.birthFlashContainer.label = 'birth-flash';
    this.app.stage.addChild(this.birthFlashContainer);

    this.hudContainer = new Container();
    this.hudContainer.label = 'hud';
    this.app.stage.addChild(this.hudContainer);

    // Pre-allocate graphics objects for the max particle count
    for (let i = 0; i < maxParticles; i++) {
      const g = new Graphics();
      g.visible = false;
      this.particleContainer.addChild(g);
      this.sprites.push(g);
      this.spriteSpecies.push(-1);
    }

    // Pre-allocate death effect pool
    for (let i = 0; i < MAX_DEATH_EFFECTS; i++) {
      const g = new Graphics();
      g.visible = false;
      this.effectsContainer.addChild(g);
      this.deathPool.push({ g, x: 0, y: 0, color: 0, radius: 0, elapsed: -1, duration: 0.3 });
    }

    // Pre-allocate birth effect pool
    for (let i = 0; i < MAX_BIRTH_EFFECTS; i++) {
      const g = new Graphics();
      g.visible = false;
      this.birthFlashContainer.addChild(g);
      this.birthPool.push({ g, idx: -1, elapsed: -1, duration: 0.2 });
    }

    // HUD text
    const style = new TextStyle({
      fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
      fontSize: 13,
      fill: '#cccccc',
      dropShadow: {
        alpha: 0.4,
        blur: 2,
        color: '#000000',
        angle: Math.PI / 4,
        distance: 2,
      },
    });

    this.hudText = new Text({ text: '', style });
    this.hudText.x = 10;
    this.hudText.y = 10;
    this.hudContainer.addChild(this.hudText);
  }

  /** Set per-species max energy values (for energy-based opacity). */
  setSpeciesMaxEnergy(maxEnergy: Float32Array): void {
    this.speciesMaxEnergy = maxEnergy;
  }

  /** Update species visual config (color, radius) and invalidate sprite cache so particles redraw. */
  updateSpeciesVisuals(visuals: SpeciesVisual[]): void {
    this.speciesVisuals = visuals;
    // Invalidate all sprite species so they get redrawn with new visuals
    this.spriteSpecies.fill(-1);
  }

  /**
   * Sync all particle positions, visibility, and colors from the world state.
   * Call once per frame. Zero allocations in hot path.
   */
  update(
    world: World,
    eco: EcosystemState,
    dt: number,
  ): void {
    const hwm = world.x.length;
    const len = this.sprites.length;

    // Advance pulse phase for sickness rings
    this.pulsePhase += dt * 4;

    // Reset pre-allocated species counts (no allocation)
    const speciesCounts = this.speciesCounts;
    speciesCounts.fill(0);

    const renderSkip = this.renderSkip;
    const effectsEnabled = this.effectsEnabled;
    const energyOpacityEnabled = this.energyOpacityEnabled;

    for (let i = 0; i < hwm && i < len; i++) {
      const sprite = this.sprites[i];

      const isAlive = eco.alive[i] !== DEAD;
      const wasAlive = this.prevAlive[i] !== DEAD;

      // After reset, skip effects for one frame but sync prevAlive
      if (this.skipEffectsFrame) {
        this.prevAlive[i] = eco.alive[i];
        if (!isAlive) {
          sprite.visible = false;
          continue;
        }
        // fall through to normal rendering
      } else {
        // Detect death: was alive last frame, now dead
        if (wasAlive && !isAlive) {
          if (effectsEnabled) {
            const speciesIdx = world.type[i];
            const vis = this.speciesVisuals[speciesIdx];
            if (vis) {
              this.spawnDeathEffect(world.x[i], world.y[i], vis.color, vis.radius);
            }
          }
        }

        // Detect birth: was dead, now alive
        if (!wasAlive && isAlive && effectsEnabled) {
          this.spawnBirthEffect(i);
        }

        // Update prevAlive (always track for state consistency)
        this.prevAlive[i] = eco.alive[i];
      }

      if (!isAlive) {
        sprite.visible = false;
        continue;
      }

      const speciesIdx = world.type[i];
      const vis = this.speciesVisuals[speciesIdx];
      if (!vis) {
        sprite.visible = false;
        continue;
      }

      // Count per species (always, for HUD accuracy)
      speciesCounts[speciesIdx]++;

      // Render skip: only render every Nth particle
      if (renderSkip > 1 && (i % renderSkip) !== 0) {
        sprite.visible = false;
        continue;
      }

      // Position
      sprite.x = world.x[i];
      sprite.y = world.y[i];
      sprite.visible = true;

      // Energy-based opacity: modulate sprite alpha
      if (energyOpacityEnabled) {
        const maxE = this.speciesMaxEnergy[speciesIdx] || 100;
        const energyRatio = Math.min(1, Math.max(0, eco.energy[i] / maxE));
        // High energy = fully visible (1.0), low energy = 50% (0.5)
        sprite.alpha = 0.5 + energyRatio * 0.5;
      } else {
        sprite.alpha = 1.0;
      }

      // Only redraw if species changed
      if (this.spriteSpecies[i] !== speciesIdx) {
        sprite.clear();
        // Slight glow: larger translucent circle behind
        sprite.circle(0, 0, vis.radius + 2);
        sprite.fill({ color: vis.color, alpha: 0.15 });
        // Main circle
        sprite.circle(0, 0, vis.radius);
        sprite.fill({ color: vis.color, alpha: 0.85 });
        this.spriteSpecies[i] = speciesIdx;
      }
    }

    // Hide sprites beyond current array length
    for (let i = hwm; i < len; i++) {
      this.sprites[i].visible = false;
    }

    // Clear any stale sickness graphics
    if (this.sicknessGfx) {
      this.sicknessGfx.clear();
    }

    // Update death effects (always run so active effects can finish)
    this.updateDeathEffects(dt);

    // Update birth effects (always run so active effects can finish)
    this.updateBirthEffects(world, eco, dt);

    // Clear skip flag after one frame
    if (this.skipEffectsFrame) this.skipEffectsFrame = false;

    // Total alive
    let totalAlive = 0;
    for (let s = 0; s < speciesCounts.length; s++) {
      totalAlive += speciesCounts[s];
    }

    // Update HUD (no array allocation — direct string concatenation)
    let hud = 'Particles: ' + totalAlive;
    for (let s = 0; s < this.speciesNames.length; s++) {
      hud += '\n' + this.speciesNames[s] + ': ' + speciesCounts[s];
    }
    this.hudText.text = hud;
  }

  /** Spawn a death effect at the given position. */
  private spawnDeathEffect(x: number, y: number, color: number, radius: number): void {
    // Find an inactive effect in the pool
    for (let i = 0; i < this.deathPool.length; i++) {
      const effect = this.deathPool[i];
      if (effect.elapsed < 0) {
        effect.x = x;
        effect.y = y;
        effect.color = color;
        effect.radius = radius;
        effect.elapsed = 0;
        effect.g.visible = true;
        return;
      }
    }
    // Pool full — skip (or overwrite oldest, but skipping is simpler)
  }

  /** Update all active death effects. */
  private updateDeathEffects(dt: number): void {
    for (let i = 0; i < this.deathPool.length; i++) {
      const effect = this.deathPool[i];
      if (effect.elapsed < 0) continue;

      effect.elapsed += dt;
      const t = effect.elapsed / effect.duration;

      if (t >= 1) {
        effect.g.visible = false;
        effect.elapsed = -1;
        continue;
      }

      // Expand from radius to 2x radius
      const currentRadius = effect.radius * (1 + t);
      // Fade from particle color to transparent
      const alpha = 1 - t;

      effect.g.clear();
      effect.g.circle(0, 0, currentRadius);
      effect.g.stroke({ color: effect.color, alpha: alpha, width: 1.5 });
      effect.g.x = effect.x;
      effect.g.y = effect.y;
    }
  }

  /** Spawn a birth flash for a particle. */
  private spawnBirthEffect(idx: number): void {
    for (let i = 0; i < this.birthPool.length; i++) {
      const effect = this.birthPool[i];
      if (effect.elapsed < 0) {
        effect.idx = idx;
        effect.elapsed = 0;
        effect.g.visible = true;
        return;
      }
    }
  }

  /** Update all active birth effects. */
  private updateBirthEffects(world: World, eco: EcosystemState, dt: number): void {
    for (let i = 0; i < this.birthPool.length; i++) {
      const effect = this.birthPool[i];
      if (effect.elapsed < 0) continue;

      effect.elapsed += dt;
      const t = effect.elapsed / effect.duration;

      if (t >= 1) {
        effect.g.visible = false;
        effect.elapsed = -1;
        effect.idx = -1;
        continue;
      }

      const idx = effect.idx;
      if (idx < 0 || idx >= world.x.length || eco.alive[idx] === DEAD) {
        effect.g.visible = false;
        effect.elapsed = -1;
        continue;
      }

      const speciesIdx = world.type[idx];
      const vis = this.speciesVisuals[speciesIdx];
      if (!vis) {
        effect.g.visible = false;
        effect.elapsed = -1;
        continue;
      }

      // Shrink from 1.5x to normal radius, white flash fading
      const currentRadius = vis.radius * (1.5 - 0.5 * t);
      const flashAlpha = (1 - t) * 0.6;

      effect.g.clear();
      effect.g.circle(0, 0, currentRadius);
      effect.g.fill({ color: 0xffffff, alpha: flashAlpha });
      effect.g.x = world.x[idx];
      effect.g.y = world.y[idx];
    }
  }

  /** Single graphics object for all sickness rings (avoid per-frame allocations). */
  private sicknessGfx: Graphics | null = null;

  /** Destroy the renderer and clean up. */
  destroy(): void {
    this.app.destroy(true);
  }
}
