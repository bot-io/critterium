/**
 * Critterium — Render Module
 *
 * PixiJS v8 adapter for rendering the simulation.
 * One circle Graphics per particle, colored by species.
 * HUD overlay with particle count, FPS, and species counts.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { World } from '@critterium/core';
import { DEAD } from '@critterium/core/ecosystem';
import type { EcosystemState } from '@critterium/core/ecosystem';

// ─── Species visual config ────────────────────────────────────

export interface SpeciesVisual {
  color: number;
  radius: number;
}

// ─── CritteriumRenderer ──────────────────────────────────────

export class CritteriumRenderer {
  readonly app: Application;
  private particleContainer!: Container;
  private hudContainer!: Container;
  private hudText!: Text;

  /** Per-particle graphics objects (indexed by particle index). */
  private sprites: Graphics[] = [];

  /** Per-sprite cached species index (avoid redraws). */
  private spriteSpecies: number[] = [];

  /** Species visual config (indexed by species/type). */
  private speciesVisuals: SpeciesVisual[];

  /** Cached species names for HUD. */
  private speciesNames: string[];

  /** FPS tracking. */
  private frameCount = 0;
  private fpsTimer = 0;
  private lastFps = 0;

  private constructor(
    app: Application,
    speciesVisuals: SpeciesVisual[],
    speciesNames: string[],
  ) {
    this.app = app;
    this.speciesVisuals = speciesVisuals;
    this.speciesNames = speciesNames;
  }

  /**
   * Create and initialise the renderer.
   * Resolves when the PixiJS Application is ready.
   */
  static async create(
    speciesVisuals: SpeciesVisual[],
    speciesNames: string[],
    maxParticles: number,
  ): Promise<CritteriumRenderer> {
    const app = new Application();
    await app.init({
      background: '#111111',
      resizeTo: window,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    const renderer = new CritteriumRenderer(app, speciesVisuals, speciesNames);
    renderer.setupScene(maxParticles);
    return renderer;
  }

  /** Set up the display containers and pre-allocate particle sprites. */
  private setupScene(maxParticles: number): void {
    this.particleContainer = new Container();
    this.particleContainer.label = 'particles';
    this.app.stage.addChild(this.particleContainer);

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

  /**
   * Sync all particle positions, visibility, and colors from the world state.
   * Call once per frame.
   */
  update(
    world: World,
    eco: EcosystemState,
    dt: number,
  ): void {
    const { x, y, type } = world;
    const len = x.length;

    // Track species counts for HUD
    const speciesCounts = new Int32Array(this.speciesVisuals.length);

    for (let i = 0; i < len && i < this.sprites.length; i++) {
      const sprite = this.sprites[i];

      const isAlive = eco.alive[i] !== DEAD;
      if (!isAlive) {
        sprite.visible = false;
        continue;
      }

      const speciesIdx = type[i];
      const vis = this.speciesVisuals[speciesIdx];
      if (!vis) {
        sprite.visible = false;
        continue;
      }

      // Count per species
      speciesCounts[speciesIdx]++;

      // Position
      sprite.x = x[i];
      sprite.y = y[i];
      sprite.visible = true;

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
    for (let i = len; i < this.sprites.length; i++) {
      this.sprites[i].visible = false;
    }

    // FPS calculation
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.lastFps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Total alive
    let totalAlive = 0;
    for (let s = 0; s < speciesCounts.length; s++) {
      totalAlive += speciesCounts[s];
    }

    // Update HUD
    const parts: string[] = [
      `FPS: ${this.lastFps}`,
      `Particles: ${totalAlive}`,
    ];
    for (let s = 0; s < this.speciesNames.length; s++) {
      parts.push(`${this.speciesNames[s]}: ${speciesCounts[s]}`);
    }
    this.hudText.text = parts.join('\n');
  }

  /** Destroy the renderer and clean up. */
  destroy(): void {
    this.app.destroy(true);
  }
}
