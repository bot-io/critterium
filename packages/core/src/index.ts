/**
 * Critterium — Simulation Core
 *
 * Pure TypeScript, deterministic, zero dependencies.
 * Typed-array particle storage with spatial hash grid,
 * fixed-timestep loop, and pluggable force pipeline.
 */

// ─── Constants ───────────────────────────────────────────────────

/** Maximum number of particle types (Uint8Array index). */
export const MAX_TYPES = 16;

/** Default simulation width. */
export const DEFAULT_WIDTH = 800;

/** Default simulation height. */
export const DEFAULT_HEIGHT = 600;

/** Default fixed timestep (60 Hz). */
export const DEFAULT_DT = 1 / 60;

/** Maximum dt to prevent spiral of death. */
export const MAX_DT = 0.1;

/** Maximum number of accumulator steps per frame to prevent hanging. */
export const MAX_ACCUMULATOR_STEPS = 10;

// ─── Types ───────────────────────────────────────────────────────

/** World boundaries mode. */
export type BoundaryMode = 'bounce' | 'wrap';

/** Per-type configuration. */
export interface ParticleTypeConfig {
  count: number;
  color: string;
  radius: number;
  initialSpeed: number;
  maxSpeed: number;
}

/** Simulation configuration (schema v1). */
export interface SimulationConfig {
  width: number;
  height: number;
  boundaryMode: BoundaryMode;
  types: ParticleTypeConfig[];
  seed: number;
}

/** Scalar channel descriptor for future extensibility (ecosystem mode). */
export interface ScalarChannel {
  name: string;
  data: Float32Array;
}

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────

/** Creates a seeded PRNG using mulberry32. Returns a function that produces [0, 1) values. */
export function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── World ───────────────────────────────────────────────────────

/** The core simulation state. All particle data in typed arrays. */
export class World {
  // Particle count
  count: number;

  // Position and velocity (SoA layout)
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;

  // Per-particle type index
  readonly type: Uint8Array;

  // Per-type config
  readonly typeConfigs: readonly ParticleTypeConfig[];

  // World dimensions
  readonly width: number;
  readonly height: number;

  // Boundary mode
  readonly boundaryMode: BoundaryMode;

  // RNG
  readonly rng: () => number;

  // Current seed (for serialization)
  seed: number;

  // Simulation time accumulator
  simTime: number = 0;

  // Future: scalar channels (ecosystem mode)
  // Pattern reserved — forces can add channels without redesign
  readonly scalarChannels: ScalarChannel[] = [];

  // Per-type max speed lookup
  private readonly maxSpeeds: Float32Array;

  constructor(config: SimulationConfig) {
    this.width = config.width;
    this.height = config.height;
    this.boundaryMode = config.boundaryMode;
    this.typeConfigs = config.types;
    this.seed = config.seed;
    this.rng = createRng(config.seed);

    // Calculate total particle count
    this.count = config.types.reduce((sum, t) => sum + t.count, 0);

    // Allocate typed arrays
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.type = new Uint8Array(this.count);

    // Per-type max speed lookup
    this.maxSpeeds = new Float32Array(MAX_TYPES);
    for (let i = 0; i < config.types.length; i++) {
      this.maxSpeeds[i] = config.types[i].maxSpeed;
    }

    // Spawn particles
    this.spawnParticles();
  }

  /** Spawn all particles with random positions and per-type initial velocities. */
  private spawnParticles(): void {
    let idx = 0;
    for (let typeIdx = 0; typeIdx < this.typeConfigs.length; typeIdx++) {
      const cfg = this.typeConfigs[typeIdx];
      for (let i = 0; i < cfg.count; i++) {
        this.type[idx] = typeIdx;
        // Random position within world bounds
        this.x[idx] = this.rng() * this.width;
        this.y[idx] = this.rng() * this.height;
        // Random direction, fixed speed
        const angle = this.rng() * Math.PI * 2;
        this.vx[idx] = Math.cos(angle) * cfg.initialSpeed;
        this.vy[idx] = Math.sin(angle) * cfg.initialSpeed;
        idx++;
      }
    }
  }

  /** Clamp all particle velocities to their per-type maxSpeed. */
  clampVelocities(): void {
    for (let i = 0; i < this.count; i++) {
      const maxSpd = this.maxSpeeds[this.type[i]];
      const vx = this.vx[i];
      const vy = this.vy[i];
      const spdSq = vx * vx + vy * vy;
      if (spdSq > maxSpd * maxSpd) {
        const scale = maxSpd / Math.sqrt(spdSq);
        this.vx[i] = vx * scale;
        this.vy[i] = vy * scale;
      }
    }
  }

  /** Apply boundary conditions (bounce or wrap). */
  applyBoundaries(): void {
    for (let i = 0; i < this.count; i++) {
      if (this.boundaryMode === 'bounce') {
        if (this.x[i] < 0) { this.x[i] = -this.x[i]; this.vx[i] = -this.vx[i]; }
        if (this.x[i] > this.width) { this.x[i] = 2 * this.width - this.x[i]; this.vx[i] = -this.vx[i]; }
        if (this.y[i] < 0) { this.y[i] = -this.y[i]; this.vy[i] = -this.vy[i]; }
        if (this.y[i] > this.height) { this.y[i] = 2 * this.height - this.y[i]; this.vy[i] = -this.vy[i]; }
      } else {
        // wrap
        this.x[i] = ((this.x[i] % this.width) + this.width) % this.width;
        this.y[i] = ((this.y[i] % this.height) + this.height) % this.height;
      }
    }
  }

  /** Integrate positions forward by dt (Euler). */
  integrate(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  /** Step the simulation forward by dt: clamp → integrate → boundaries. */
  step(dt: number): void {
    this.clampVelocities();
    this.integrate(dt);
    this.applyBoundaries();
    this.simTime += dt;
  }

  /**
   * Get a snapshot of the current state for exact resume.
   * Returns serialized typed-array data (copies).
   */
  snapshot(): WorldSnapshot {
    return {
      x: new Float32Array(this.x),
      y: new Float32Array(this.y),
      vx: new Float32Array(this.vx),
      vy: new Float32Array(this.vy),
      type: new Uint8Array(this.type),
      count: this.count,
      seed: this.seed,
      simTime: this.simTime,
    };
  }
}

/** Snapshot of world state for serialization. */
export interface WorldSnapshot {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  type: Uint8Array;
  count: number;
  seed: number;
  simTime: number;
}

// ─── Simulation Loop ─────────────────────────────────────────────

/** Fixed-timestep simulation loop with accumulator and interpolation. */
export class SimLoop {
  readonly world: World;
  readonly fixedDt: number;

  private accumulator: number = 0;
  private _alpha: number = 0;

  /** Interpolation alpha for rendering (0–1 between fixed steps). */
  get alpha(): number {
    return this._alpha;
  }

  constructor(world: World, fixedDt: number = DEFAULT_DT) {
    this.world = world;
    this.fixedDt = fixedDt;
  }

  /**
   * Advance the simulation by a variable real-time delta.
   * Internally accumulates and steps at fixedDt intervals.
   * Returns the number of fixed steps taken.
   */
  advance(frameDt: number): number {
    // Clamp to prevent spiral of death
    const dt = Math.min(frameDt, MAX_DT);
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < MAX_ACCUMULATOR_STEPS) {
      this.world.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }

    // Interpolation alpha for smooth rendering
    this._alpha = this.accumulator / this.fixedDt;

    return steps;
  }
}

/** Create a default simulation config for testing. */
export function defaultConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    boundaryMode: 'bounce',
    seed: 42,
    types: [
      { count: 200, color: '#ff4444', radius: 3, initialSpeed: 50, maxSpeed: 120 },
      { count: 200, color: '#44ff44', radius: 3, initialSpeed: 40, maxSpeed: 100 },
      { count: 100, color: '#4444ff', radius: 4, initialSpeed: 60, maxSpeed: 80 },
    ],
    ...overrides,
  };
}
