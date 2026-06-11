/**
 * Critterium — Render Module (CRT-9)
 *
 * PixiJS v8 adapter for rendering the simulation.
 * Uses batched tinted Sprites from a single shared circle texture
 * for maximum GPU batching performance.
 *
 * Features:
 * - Single shared circle texture → batched tinted sprites per species
 * - Interpolation between sim steps for smooth rendering
 * - Per-type texture swap support (one-point change for future skins)
 * - Per-particle rotation from velocity heading (one-point change for future creatures)
 * - FPS counter + species count HUD overlay
 */

import { Application, Container, Sprite, Texture, Graphics, Text, TextStyle } from 'pixi.js';
import type { World } from '@critterium/core';
import { DEAD } from '@critterium/core/ecosystem';
import type { EcosystemState } from '@critterium/core/ecosystem';

// ─── Species visual config ────────────────────────────────────

export interface SpeciesVisual {
  color: number;
  radius: number;
  /** Optional custom texture for this species (for skin swaps). If not set, uses default circle. */
  texture?: Texture;
}

// ─── Texture Factory ──────────────────────────────────────────

/**
 * Creates a shared circle RenderTexture at the given radius.
 * The texture includes a slight glow halo behind the solid circle.
 * Uses the renderer to rasterize a Graphics object into a texture.
 */
function createCircleTexture(renderer: { generateTexture: (g: Graphics) => Texture }, radius: number, color: number): Texture {
  const padding = 4;
  const glowPadding = 3;
  const size = (radius + padding + glowPadding) * 2;
  const g = new Graphics();
  // Glow halo
  g.circle(size / 2, size / 2, radius + glowPadding);
  g.fill({ color, alpha: 0.15 });
  // Main circle
  g.circle(size / 2, size / 2, radius);
  g.fill({ color, alpha: 0.85 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

// ─── CritteriumRenderer ──────────────────────────────────────

export class CritteriumRenderer {
  readonly app: Application;
  private particleContainer!: Container;
  private hudContainer!: Container;
  private hudText!: Text;

  /** Per-particle Sprite objects (indexed by particle index). */
  private sprites: Sprite[] = [];

  /** Per-sprite cached species index (avoid texture swap). */
  private spriteSpecies: number[] = [];

  /** Species visual config (indexed by species/type). */
  private speciesVisuals: SpeciesVisual[];

  /** Cached species names for HUD. */
  private speciesNames: string[];

  /** Per-species textures (default or custom). */
  private speciesTextures: Texture[] = [];

  /** FPS tracking. */
  private frameCount = 0;
  private fpsTimer = 0;
  private lastFps = 0;

  /** Previous-frame positions for interpolation. */
  private prevX: Float32Array;
  private prevY: Float32Array;
  private hasPrevFrame = false;

  private constructor(
    app: Application,
    speciesVisuals: SpeciesVisual[],
    speciesNames: string[],
  ) {
    this.app = app;
    this.speciesVisuals = speciesVisuals;
    this.speciesNames = speciesNames;
    this.prevX = new Float32Array(0);
    this.prevY = new Float32Array(0);
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

  /** Set up the display containers, textures, and pre-allocate particle sprites. */
  private setupScene(maxParticles: number): void {
    this.particleContainer = new Container();
    this.particleContainer.label = 'particles';
    this.app.stage.addChild(this.particleContainer);

    this.hudContainer = new Container();
    this.hudContainer.label = 'hud';
    this.app.stage.addChild(this.hudContainer);

    // Create per-species textures (batched tinted sprites share the same texture per type)
    this.speciesTextures = this.speciesVisuals.map((vis) => {
      if (vis.texture) return vis.texture; // custom texture swap
      return createCircleTexture(this.app.renderer, vis.radius, vis.color);
    });

    // Pre-allocate sprites for the max particle count
    for (let i = 0; i < maxParticles; i++) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.visible = false;
      sprite.anchor.set(0.5);
      this.particleContainer.addChild(sprite);
      this.sprites.push(sprite);
      this.spriteSpecies.push(-1);
    }

    // Pre-allocate interpolation arrays
    this.prevX = new Float32Array(maxParticles);
    this.prevY = new Float32Array(maxParticles);

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
   * Swap the texture for a species at runtime.
   * One-point change for future skin/creature systems.
   */
  setSpeciesTexture(speciesIndex: number, texture: Texture): void {
    this.speciesTextures[speciesIndex] = texture;
    // Invalidate cached species for all sprites of this type so they rebind
    for (let i = 0; i < this.spriteSpecies.length; i++) {
      if (this.spriteSpecies[i] === speciesIndex) {
        this.spriteSpecies[i] = -1;
      }
    }
  }

  /**
   * Store current world positions as "previous" for next frame's interpolation.
   * Call BEFORE the simulation step.
   */
  storePreviousPositions(world: World): void {
    const count = Math.min(world.count, this.prevX.length);
    for (let i = 0; i < count; i++) {
      this.prevX[i] = world.x[i];
      this.prevY[i] = world.y[i];
    }
    this.hasPrevFrame = true;
  }

  /**
   * Sync all particle positions, visibility, colors, and rotation from the world state.
   * Uses interpolation (lerp) between previous and current positions using alpha.
   * Call once per frame after simulation step.
   *
   * @param world     Current world state
   * @param eco       Ecosystem state (alive flags)
   * @param dt        Frame delta time (for FPS calculation)
   * @param alpha     Interpolation alpha (0–1) from the fixed timestep accumulator
   */
  update(
    world: World,
    eco: EcosystemState,
    dt: number,
    alpha: number = 0,
  ): void {
    const { x, y, vx, vy, type } = world;
    const len = Math.min(world.count, this.sprites.length);

    // Ensure interpolation arrays are large enough
    if (len > this.prevX.length) {
      const newPrevX = new Float32Array(len);
      const newPrevY = new Float32Array(len);
      newPrevX.set(this.prevX);
      newPrevY.set(this.prevY);
      this.prevX = newPrevX;
      this.prevY = newPrevY;
    }

    // Track species counts for HUD
    const speciesCounts = new Int32Array(this.speciesVisuals.length);

    for (let i = 0; i < len; i++) {
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

      // Interpolated position
      if (this.hasPrevFrame && alpha > 0 && alpha < 1) {
        sprite.x = this.prevX[i] + (x[i] - this.prevX[i]) * alpha;
        sprite.y = this.prevY[i] + (y[i] - this.prevY[i]) * alpha;
      } else {
        sprite.x = x[i];
        sprite.y = y[i];
      }

      sprite.visible = true;

      // Per-particle rotation from velocity heading
      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (speed > 0.5) {
        sprite.rotation = Math.atan2(vy[i], vx[i]);
      }

      // Rebind texture only when species changes (minimizes GPU state changes)
      if (this.spriteSpecies[i] !== speciesIdx) {
        sprite.texture = this.speciesTextures[speciesIdx];
        sprite.tint = 0xffffff; // texture already has the color
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
    for (const tex of this.speciesTextures) {
      tex.destroy(true);
    }
    this.app.destroy(true);
  }
}
