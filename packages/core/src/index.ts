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

  /**
   * Soft boundary repulsion margin (pixels). Particles within this distance
   * of a wall in bounce mode receive a gentle inward velocity impulse,
   * counteracting the asymmetric inter-particle repulsion that causes
   * edge clustering.
   */
  static readonly BOUNCE_MARGIN = 30;

  /**
   * Soft boundary repulsion impulse strength (velocity units per step).
   * Applied with quadratic falloff: strongest at the wall, zero at the margin.
   */
  static readonly BOUNCE_REPULSION = 10;

  /** Apply boundary conditions (bounce or wrap). */
  applyBoundaries(): void {
    const margin = World.BOUNCE_MARGIN;
    const strength = World.BOUNCE_REPULSION;

    for (let i = 0; i < this.count; i++) {
      if (this.boundaryMode === 'bounce') {
        // Hard bounce: reflect position and velocity at boundaries
        if (this.x[i] < 0) {
          this.x[i] = -this.x[i];
          this.vx[i] = -this.vx[i];
        }
        if (this.x[i] > this.width) {
          this.x[i] = 2 * this.width - this.x[i];
          this.vx[i] = -this.vx[i];
        }
        if (this.y[i] < 0) {
          this.y[i] = -this.y[i];
          this.vy[i] = -this.vy[i];
        }
        if (this.y[i] > this.height) {
          this.y[i] = 2 * this.height - this.y[i];
          this.vy[i] = -this.vy[i];
        }

        // Soft boundary repulsion: gentle inward push near walls to prevent
        // edge clustering. Particles near the wall receive an asymmetric
        // inward impulse that counteracts the net outward push from having
        // all their neighbors on the interior side.
        const distToLeft = this.x[i];
        const distToRight = this.width - this.x[i];
        const distToTop = this.y[i];
        const distToBottom = this.height - this.y[i];

        if (distToLeft < margin) {
          const t = 1 - distToLeft / margin;
          this.vx[i] += t * t * strength;
        }
        if (distToRight < margin) {
          const t = 1 - distToRight / margin;
          this.vx[i] -= t * t * strength;
        }
        if (distToTop < margin) {
          const t = 1 - distToTop / margin;
          this.vy[i] += t * t * strength;
        }
        if (distToBottom < margin) {
          const t = 1 - distToBottom / margin;
          this.vy[i] -= t * t * strength;
        }
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

// ─── Spatial Hash Grid ──────────────────────────────────────────

/**
 * Spatial hash grid for O(n) neighbor queries.
 *
 * Cell size should be >= max interaction radius so that any particle's
 * neighbors are guaranteed to be in the same cell or one of the 8
 * surrounding cells.
 *
 * Designed for zero allocations per rebuild: arrays are pre-allocated
 * to hold maxParticles entries and reused across clear/rebuild cycles.
 */
export class SpatialHashGrid {
  readonly cellSize: number;
  readonly invCellSize: number;
  readonly cols: number;
  readonly rows: number;

  // head[cellIndex] = first particle index in linked list for that cell, or -1
  private head: Int32Array;
  // next[particleIndex] = next particle in the same cell's linked list, or -1
  private next: Int32Array;

  constructor(width: number, height: number, cellSize: number, maxParticles: number) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);

    const numCells = this.cols * this.rows;
    this.head = new Int32Array(numCells);
    this.next = new Int32Array(maxParticles);
  }

  /** Clear the grid. Resets all linked lists. Call before each rebuild. */
  clear(): void {
    this.head.fill(-1);
  }

  /**
   * Insert a particle into the grid.
   * @param index  Particle index (0-based)
   * @param px     Particle x position
   * @param py     Particle y position
   */
  insert(index: number, px: number, py: number): void {
    const col = Math.max(0, Math.min(Math.floor(px * this.invCellSize), this.cols - 1));
    const row = Math.max(0, Math.min(Math.floor(py * this.invCellSize), this.rows - 1));
    const cellIdx = row * this.cols + col;
    this.next[index] = this.head[cellIdx];
    this.head[cellIdx] = index;
  }

  /**
   * Rebuild the grid from a World's current positions.
   * Calls clear() then inserts all particles. Zero allocations.
   *
   * @param world  The simulation world
   * @param alive  Optional alive array (from EcosystemState). If provided,
   *               dead particles (alive[i] === 0) are skipped to prevent
   *               phantom neighbors in force/eating queries.
   * @param hwm    Optional high-water mark. If provided, only particles
   *               [0, hwm) are inserted instead of [0, world.count).
   */
  rebuild(world: World, alive?: Uint8Array, hwm?: number): void {
    this.clear();
    const limit = hwm ?? world.count;
    if (alive) {
      for (let i = 0; i < limit; i++) {
        if (alive[i] === 0) continue;
        this.insert(i, world.x[i], world.y[i]);
      }
    } else {
      for (let i = 0; i < limit; i++) {
        this.insert(i, world.x[i], world.y[i]);
      }
    }
  }

  /**
   * Query all neighbors within a given radius of a point.
   * Uses a callback to avoid allocations.
   *
   * @param px       Query x position
   * @param py       Query y position
   * @param radius   Search radius
   * @param xArr     Particle x positions (world.x)
   * @param yArr     Particle y positions (world.y)
   * @param count    Number of particles
   * @param callback Called for each neighbor: (particleIndex, dx, dy, distSq)
   * @param selfIdx  Optional: when querying from a particle's own position, pass
   *                 that particle's index to exclude it by index (instead of by
   *                 zero-distance). This allows co-located particles (dSq === 0)
   *                 to be found as neighbors, which is essential for the eating
   *                 system where predator and prey may overlap perfectly.
   */
  queryRadius(
    px: number,
    py: number,
    radius: number,
    xArr: Float32Array,
    yArr: Float32Array,
    count: number,
    callback: (idx: number, dx: number, dy: number, distSq: number) => void,
    selfIdx = -1,
  ): void {
    const rSq = radius * radius;
    const invCS = this.invCellSize;

    const centerCol = Math.floor(px * invCS);
    const centerRow = Math.floor(py * invCS);
    const minCol = Math.max(0, centerCol - 1);
    const maxCol = Math.min(this.cols - 1, centerCol + 1);
    const minRow = Math.max(0, centerRow - 1);
    const maxRow = Math.min(this.rows - 1, centerRow + 1);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        let pIdx = this.head[row * this.cols + col];
        while (pIdx !== -1) {
          if (pIdx < count) {
            // When selfIdx is provided, exclude self by index so that
            // co-located particles (dSq === 0) are still returned.
            // When selfIdx is not provided, use dSq > 0 for backward-
            // compatible self-exclusion (prevents division-by-zero in
            // force calculations that divide by dist = sqrt(dSq)).
            if (selfIdx >= 0) {
              if (pIdx !== selfIdx) {
                const dx = xArr[pIdx] - px;
                const dy = yArr[pIdx] - py;
                const dSq = dx * dx + dy * dy;
                if (dSq <= rSq) {
                  callback(pIdx, dx, dy, dSq);
                }
              }
            } else {
              const dx = xArr[pIdx] - px;
              const dy = yArr[pIdx] - py;
              const dSq = dx * dx + dy * dy;
              if (dSq <= rSq && dSq > 0) {
                callback(pIdx, dx, dy, dSq);
              }
            }
          }
          pIdx = this.next[pIdx];
        }
      }
    }
  }

  /**
   * Query neighbors and collect into a pre-allocated Int32Array.
   * Returns the count of neighbors found.
   */
  queryRadiusToArray(
    px: number,
    py: number,
    radius: number,
    xArr: Float32Array,
    yArr: Float32Array,
    count: number,
    outIndices: Int32Array,
    maxResults: number,
  ): number {
    let n = 0;
    this.queryRadius(px, py, radius, xArr, yArr, count, (idx) => {
      if (n < maxResults) {
        outIndices[n++] = idx;
      }
    });
    return n;
  }

  /** Get the total number of cells. */
  get numCells(): number {
    return this.cols * this.rows;
  }

  /** Get cell index for a position. Returns -1 if out of bounds. */
  cellAt(px: number, py: number): number {
    const col = Math.floor(px * this.invCellSize);
    const row = Math.floor(py * this.invCellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return row * this.cols + col;
  }
}

/**
 * Brute-force neighbor query (reference for property testing).
 * Returns sorted array of particle indices within radius (excluding self).
 */
export function bruteForceNeighbors(
  px: number,
  py: number,
  radius: number,
  xArr: Float32Array,
  yArr: Float32Array,
  count: number,
): number[] {
  const rSq = radius * radius;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const dx = xArr[i] - px;
    const dy = yArr[i] - py;
    const dSq = dx * dx + dy * dy;
    if (dSq <= rSq && dSq > 0) {
      result.push(i);
    }
  }
  return result.sort((a, b) => a - b);
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

// ─── Interaction Matrix & Pairwise Force ────────────────────────

/** Falloff curve for an interaction entry. */
export type FalloffType = 'linear' | 'inverse' | 'constant';

/** A single entry in the N×N interaction matrix. */
export interface InteractionEntry {
  /** Force magnitude. Positive = attract, negative = repel. */
  strength: number;
  /** Minimum interaction radius. No effect below this distance. */
  minRadius?: number;
  /** Maximum interaction radius. No effect beyond this distance. */
  radius: number;
  /** How force decays with distance. */
  falloff: FalloffType;
}

/** N×N interaction matrix. matrix[typeA][typeB] = effect of typeB on typeA. */
export class InteractionMatrix {
  readonly numTypes: number;
  private readonly entries: (InteractionEntry | null)[][];

  constructor(numTypes: number) {
    this.numTypes = numTypes;
    this.entries = [];
    for (let i = 0; i < numTypes; i++) {
      this.entries[i] = [];
      for (let j = 0; j < numTypes; j++) {
        this.entries[i][j] = null;
      }
    }
  }

  /** Set the interaction for (typeA, typeB): how typeB affects typeA. */
  set(typeA: number, typeB: number, entry: InteractionEntry): void {
    this.entries[typeA][typeB] = entry;
  }

  /** Get the interaction entry for (typeA, typeB). Returns null if not set. */
  get(typeA: number, typeB: number): InteractionEntry | null {
    return this.entries[typeA][typeB];
  }

  /**
   * Compute the force magnitude for a given entry at a given distance.
   * Returns 0 if distance >= entry.radius.
   */
  static forceAtDistance(entry: InteractionEntry, dist: number): number {
    if (dist >= entry.radius || dist <= 0) return 0;
    const t = dist / entry.radius; // normalized distance [0, 1)
    switch (entry.falloff) {
      case 'linear':
        return entry.strength * (1 - t);
      case 'inverse':
        return entry.strength / (t + 0.1); // +0.1 prevents singularity at 0
      case 'constant':
        return entry.strength;
    }
  }
}

/** Short-range repulsion parameters. */
export interface RepulsionConfig {
  /** Force strength (always positive = repulsive). */
  strength: number;
  /** Distance below which repulsion activates. */
  radius: number;
}

/** Default short-range repulsion. */
export const DEFAULT_REPULSION: RepulsionConfig = {
  strength: 500,
  radius: 8,
};

/**
 * PairwiseForce: applies interaction-matrix forces and short-range repulsion.
 *
 * Uses the spatial hash grid for O(n) neighbor lookups.
 * For each particle pair within range, computes:
 *   1. Interaction force from the N×N matrix (asymmetric: A→B ≠ B→A)
 *   2. Universal short-range repulsion (symmetric, prevents collapse)
 *
 * Forces are applied as velocity changes (impulse-style: dv = force * dt).
 */
export class PairwiseForce {
  readonly matrix: InteractionMatrix;
  readonly repulsion: RepulsionConfig;

  // Pre-allocated velocity delta buffers — grow on demand, never reallocated per-step
  private dvx: Float32Array = new Float32Array(0);
  private dvy: Float32Array = new Float32Array(0);

  constructor(matrix: InteractionMatrix, repulsion: RepulsionConfig = DEFAULT_REPULSION) {
    this.matrix = matrix;
    this.repulsion = repulsion;
  }

  /**
   * Apply pairwise forces to the world for one timestep.
   * Modifies world.vx and world.vy in-place.
   *
   * @param world  The simulation world
   * @param grid   Spatial hash grid (must be rebuilt for current positions)
   * @param dt     Timestep duration
   */
  apply(world: World, grid: SpatialHashGrid, dt: number): void {
    const { x, y, vx, vy, type, count } = world;
    const { matrix, repulsion } = this;

    // Pre-compute max interaction radius from matrix entries
    let maxRadius = repulsion.radius;
    for (let a = 0; a < matrix.numTypes; a++) {
      for (let b = 0; b < matrix.numTypes; b++) {
        const entry = matrix.get(a, b);
        if (entry && entry.radius > maxRadius) {
          maxRadius = entry.radius;
        }
      }
    }

    // Ensure velocity delta buffers are large enough (grow only, never shrink)
    if (this.dvx.length < count) {
      this.dvx = new Float32Array(count);
      this.dvy = new Float32Array(count);
    } else {
      // Zero-fill only the active range
      this.dvx.fill(0, 0, count);
      this.dvy.fill(0, 0, count);
    }
    const dvx = this.dvx;
    const dvy = this.dvy;

    for (let i = 0; i < count; i++) {
      const xi = x[i];
      const yi = y[i];
      const typeI = type[i];

      grid.queryRadius(xi, yi, maxRadius, x, y, count, (j, dx, dy, distSq) => {
        const dist = Math.sqrt(distSq);
        const typeJ = type[j];
        const nx = dx / dist; // unit normal from i to j
        const ny = dy / dist;

        // 1. Interaction matrix force: how typeJ affects typeI
        const entry = matrix.get(typeI, typeJ);
        if (entry && dist < entry.radius && dist >= (entry.minRadius ?? 0)) {
          const force = InteractionMatrix.forceAtDistance(entry, dist);
          // Positive strength = attract (toward j), negative = repel (away from j)
          dvx[i] += nx * force * dt;
          dvy[i] += ny * force * dt;
        }

        // 2. Universal short-range repulsion (always repulsive, symmetric)
        if (dist < repulsion.radius) {
          // Linear falloff: strongest at dist=0, zero at repulsion.radius
          const t = dist / repulsion.radius;
          const repForce = repulsion.strength * (1 - t);
          // Repel: push i away from j (opposite direction of normal)
          dvx[i] -= nx * repForce * dt;
          dvy[i] -= ny * repForce * dt;
        }
      });
    }

    // Apply accumulated velocity changes
    for (let i = 0; i < count; i++) {
      vx[i] += dvx[i];
      vy[i] += dvy[i];
    }
  }
}

// ─── Force Interface & Pipeline ────────────────────────────────

/**
 * Base force interface. All forces implement this contract.
 * Forces are serializable (via params) and composed in a pipeline.
 *
 * `grid` may be unused by global forces (drag, gravity, boundaries)
 * but is required for pairwise/neighborhood forces.
 */
export interface Force<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier for this force instance. */
  readonly id: string;
  /** Serializable parameters (for config persistence). */
  readonly params: P;
  /** Apply the force to the world for one timestep. */
  apply(world: World, grid: SpatialHashGrid, dt: number): void;
}

/**
 * ForcePipeline: composes multiple forces and applies them in order.
 * Typical order: pairwise → neighborhood → global (drag, gravity) → boundaries.
 *
 * After all forces apply, the pipeline integrates positions and applies boundaries.
 */
export class ForcePipeline {
  readonly forces: Force[] = [];

  /** Add a force to the pipeline. */
  add(force: Force): void {
    this.forces.push(force);
  }

  /** Remove a force by id. Returns true if found and removed. */
  remove(id: string): boolean {
    const idx = this.forces.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    this.forces.splice(idx, 1);
    return true;
  }

  /** Get a force by id. Returns undefined if not found. */
  get(id: string): Force | undefined {
    return this.forces.find((f) => f.id === id);
  }

  /**
   * Apply all forces in order, then integrate and apply boundaries.
   * @returns the number of forces applied
   */
  step(world: World, grid: SpatialHashGrid, dt: number): number {
    for (const force of this.forces) {
      force.apply(world, grid, dt);
    }
    return this.forces.length;
  }
}

// ─── Drag Force ─────────────────────────────────────────────────

/** Drag force parameters. */
export interface DragParams {
  [key: string]: unknown;
  /**
   * Drag coefficient. Velocity is multiplied by (1 - coefficient * dt) each step.
   * Typical range: 0.5–5.0. Higher = more drag (slower particles).
   */
  coefficient: number;
}

/**
 * DragForce: linear drag that reduces velocity proportionally.
 *
 * Each step: v *= (1 - coefficient * dt)
 *
 * This is an exponential decay model: after time T, speed is reduced by
 * factor e^(-coefficient * T). For coefficient=1, speed halves in ~0.7s.
 *
 * Zero allocations per step.
 */
export class DragForce implements Force {
  readonly id = 'drag';
  readonly params: DragParams;

  constructor(coefficient: number = 1.0) {
    this.params = { coefficient };
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    const factor = 1 - this.params.coefficient * dt;
    // Clamp to prevent velocity inversion (if dt is very large)
    const safeFactor = Math.max(0, factor);
    const { vx, vy, count } = world;
    for (let i = 0; i < count; i++) {
      vx[i] *= safeFactor;
      vy[i] *= safeFactor;
    }
  }
}

// ─── Gravity Force ──────────────────────────────────────────────

/** Gravity force parameters. */
export interface GravityParams {
  [key: string]: unknown;
  /**
   * Gravitational acceleration (units/s²). Applied as downward velocity change.
   * Positive = downward (standard gravity), negative = upward (anti-gravity).
   * Typical: 0 for no gravity, 100–500 for mild-to-strong gravity.
   */
  acceleration: number;
}

/**
 * GravityForce: constant downward (positive y) acceleration.
 *
 * Each step: vy += acceleration * dt
 *
 * Zero allocations per step.
 */
export class GravityForce implements Force {
  readonly id = 'gravity';
  readonly params: GravityParams;

  constructor(acceleration: number = 200) {
    this.params = { acceleration };
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    const { vy, count } = world;
    const dv = this.params.acceleration * dt;
    for (let i = 0; i < count; i++) {
      vy[i] += dv;
    }
  }
}

// ─── Boundary Force (adapter for World.applyBoundaries) ─────────

/** Boundary force parameters. */
export interface BoundaryParams {
  [key: string]: unknown;
  mode: BoundaryMode;
}

/**
 * BoundaryForce: adapter that wraps World.applyBoundaries() as a Force.
 *
 * This allows boundaries to participate in the ForcePipeline.
 * Note: World.applyBoundaries() already handles bounce/wrap internally,
 * reading from world.boundaryMode. This force exists for pipeline consistency.
 */
export class BoundaryForce implements Force {
  readonly id = 'boundary';
  readonly params: BoundaryParams;

  constructor(mode: BoundaryMode = 'bounce') {
    this.params = { mode };
  }

  apply(world: World, _grid: SpatialHashGrid, _dt: number): void {
    world.applyBoundaries();
  }
}

// ─── Wander Force ────────────────────────────────────────────

/** Wander force parameters. */
export interface WanderParams {
  [key: string]: unknown;
  /**
   * Strength of the wander steering force.
   * Higher values produce more erratic motion.
   * Typical range: 20–200.
   */
  strength: number;
  /**
   * Angular noise rate (radians/sec). Controls how quickly
   * the wander angle changes. Higher = more frequent direction changes.
   * Typical range: 1–10.
   */
  rate: number;
}

/**
 * WanderForce: per-particle smooth noise for organic motion.
 *
 * Each particle has its own wander angle that evolves smoothly over time.
 * The wander angle is perturbed by a noise function derived from the
 * particle index and current simulation time, producing a smooth random
 * walk in angle space. The resulting force steers the particle's velocity
 * toward the wander angle.
 *
 * Pre-allocates a Float32Array for per-particle wander angles.
 * Zero hot-loop allocations.
 */
export class WanderForce implements Force {
  readonly id = 'wander';
  readonly params: WanderParams;

  /** Per-particle wander angle (radians). Pre-allocated. */
  private angles: Float32Array;

  /** Per-particle accumulated noise phase. */
  private phase: Float32Array;

  private capacity: number;

  constructor(strength: number = 80, rate: number = 3) {
    this.params = { strength, rate };
    this.angles = new Float32Array(0);
    this.phase = new Float32Array(0);
    this.capacity = 0;
  }

  /**
   * Ensure internal arrays are large enough for the current particle count.
   * Only reallocates when count increases (no hot-loop allocations).
   */
  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return;
    const newAngles = new Float32Array(count);
    const newPhase = new Float32Array(count);
    // Preserve existing data
    if (this.capacity > 0) {
      newAngles.set(this.angles.subarray(0, this.capacity));
      newPhase.set(this.phase.subarray(0, this.capacity));
    }
    this.angles = newAngles;
    this.phase = newPhase;
    this.capacity = count;
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    const { vx, vy, count } = world;
    this.ensureCapacity(count);

    const { strength, rate } = this.params;
    const simTime = world.simTime;

    for (let i = 0; i < count; i++) {
      // Smooth noise: use sin/cos of a compound phase for smooth random walk.
      // Phase evolves based on index (unique per particle) and time.
      const noiseInput = simTime * rate + i * 7.31;
      // Smooth noise value in [-1, 1]
      const noise =
        Math.sin(noiseInput) * 0.5 +
        Math.sin(noiseInput * 2.17 + 1.3) * 0.3 +
        Math.sin(noiseInput * 0.73 + 2.1) * 0.2;

      // Update wander angle: integrate noise
      this.angles[i] += noise * rate * dt;

      // Compute desired heading from wander angle
      const desiredVx = Math.cos(this.angles[i]);
      const desiredVy = Math.sin(this.angles[i]);

      // Get current speed to normalize
      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      // Steer: add force toward wander direction, scaled by strength
      if (speed > 0.01) {
        // Blend between current heading and wander heading
        vx[i] += desiredVx * strength * dt;
        vy[i] += desiredVy * strength * dt;
      } else {
        // If nearly stationary, give a push in wander direction
        vx[i] += desiredVx * strength * dt * 2;
        vy[i] += desiredVy * strength * dt * 2;
      }
    }
  }
}

// ─── Flow Field Force ────────────────────────────────────────

/** Flow field function type: maps (x, y) to a force vector [fx, fy]. */
export type FlowFieldFn = (x: number, y: number) => [number, number];

/** Flow field force parameters. */
export interface FlowFieldParams {
  [key: string]: unknown;
  /** Force magnitude multiplier. */
  strength: number;
  /** Flow field mode: 'uniform', 'turbulence', or 'custom'. */
  mode: string;
  /** Uniform flow direction angle (radians). Used when mode='uniform'. */
  angle: number;
  /** Turbulence scale. Used when mode='turbulence'. */
  turbulenceScale: number;
}

/**
 * FlowFieldForce: spatially varying directional force.
 *
 * Applies a force at each particle's position based on a flow field function.
 * Built-in modes:
 * - 'uniform': constant direction everywhere
 * - 'turbulence': sin/cos-based pseudo-turbulence field
 *
 * Custom flow fields can be provided via setCustomField().
 *
 * Zero allocations per step.
 */
export class FlowFieldForce implements Force {
  readonly id = 'flow-field';
  readonly params: FlowFieldParams;

  private customField: FlowFieldFn | null = null;

  constructor(
    strength: number = 50,
    mode: string = 'uniform',
    angle: number = 0,
    turbulenceScale: number = 0.01,
  ) {
    this.params = { strength, mode, angle, turbulenceScale };
  }

  /** Set a custom flow field function. Overrides mode-based field. */
  setCustomField(fn: FlowFieldFn): void {
    this.customField = fn;
  }

  /** Compute the flow field direction at (x, y). Returns [fx, fy] normalized. */
  private fieldAt(x: number, y: number): [number, number] {
    if (this.customField) return this.customField(x, y);

    const { mode, angle, turbulenceScale } = this.params;
    switch (mode) {
      case 'uniform':
        return [Math.cos(angle), Math.sin(angle)];
      case 'turbulence': {
        // Pseudo-turbulence: sinusoidal field that varies spatially
        const fx =
          Math.sin(y * turbulenceScale * 6.28) + Math.cos((x + y) * turbulenceScale * 3.14);
        const fy =
          Math.cos(x * turbulenceScale * 6.28) + Math.sin((x - y) * turbulenceScale * 3.14);
        return [fx, fy];
      }
      default:
        return [0, 0];
    }
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    const { x, y, vx, vy, count } = world;
    const { strength } = this.params;

    for (let i = 0; i < count; i++) {
      const [fx, fy] = this.fieldAt(x[i], y[i]);
      vx[i] += fx * strength * dt;
      vy[i] += fy * strength * dt;
    }
  }
}

// ─── Vortex Force ────────────────────────────────────────────

/** Vortex force parameters. */
export interface VortexParams {
  [key: string]: unknown;
  /** Vortex center x position. */
  cx: number;
  /** Vortex center y position. */
  cy: number;
  /**
   * Tangential (swirl) strength. Positive = counter-clockwise, negative = clockwise.
   * Typical range: 50–500.
   */
  strength: number;
  /**
   * Radial (inward/outward) component. Positive = outward, negative = inward.
   * Creates spiral patterns when combined with tangential force.
   * Typical range: -200 to 200. 0 = pure rotation.
   */
  radialStrength: number;
  /**
   * Maximum radius of influence. Beyond this, no force is applied.
   */
  radius: number;
  /**
   * Falloff type for the vortex: 'linear', 'inverse', or 'constant'.
   */
  falloff: FalloffType;
}

/**
 * VortexForce: swirl force around a point.
 *
 * Each particle within `radius` of the center receives a tangential force
 * (perpendicular to the radius vector) and an optional radial component
 * (toward or away from center). This creates orbiting/spiral patterns.
 *
 * Falloff: force decreases with distance from center based on falloff type.
 * - 'linear': strongest at center, zero at radius
 * - 'inverse': strong near center, gradual falloff
 * - 'constant': uniform strength within radius
 *
 * Zero allocations per step.
 */
export class VortexForce implements Force {
  readonly id = 'vortex';
  readonly params: VortexParams;

  constructor(
    cx: number = 400,
    cy: number = 300,
    strength: number = 150,
    radialStrength: number = 0,
    radius: number = 300,
    falloff: FalloffType = 'linear',
  ) {
    this.params = { cx, cy, strength, radialStrength, radius, falloff };
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    const { x, y, vx, vy, count } = world;
    const { cx, cy, strength, radialStrength, radius, falloff } = this.params;

    for (let i = 0; i < count; i++) {
      const dx = x[i] - cx;
      const dy = y[i] - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= radius || dist < 0.001) continue;

      // Normalized direction from center
      const nx = dx / dist;
      const ny = dy / dist;

      // Tangential direction (perpendicular, counter-clockwise)
      const tx = -ny;
      const ty = nx;

      // Falloff
      const t = dist / radius;
      let falloffMultiplier: number;
      switch (falloff) {
        case 'linear':
          falloffMultiplier = 1 - t;
          break;
        case 'inverse':
          falloffMultiplier = 1 / (t + 0.1);
          break;
        case 'constant':
          falloffMultiplier = 1;
          break;
      }

      // Tangential force (swirl)
      const tangentialForce = strength * falloffMultiplier;
      vx[i] += tx * tangentialForce * dt;
      vy[i] += ty * tangentialForce * dt;

      // Radial force (inward/outward)
      if (radialStrength !== 0) {
        const radialForce = radialStrength * falloffMultiplier;
        vx[i] += nx * radialForce * dt;
        vy[i] += ny * radialForce * dt;
      }
    }
  }
}

// ─── Alignment (Flocking) Force ────────────────────────────────

/** Alignment force parameters. */
export interface AlignmentParams {
  [key: string]: unknown;
  /**
   * Neighborhood query radius. Particles within this distance are
   * considered neighbors whose heading is averaged.
   * Typical range: 30–150.
   */
  radius: number;
  /**
   * Alignment strength. How strongly each particle steers toward the
   * average heading of its neighbors.
   * Typical range: 10–200.
   */
  strength: number;
  /**
   * When false (default), particles only align with neighbors of the
   * SAME type. When true, heading is averaged across all types.
   */
  crossType: boolean;
}

/**
 * AlignmentForce: steer toward the average heading of neighbors.
 *
 * Implements the classic Reynolds "alignment" flocking behavior as a
 * standalone Force. For each particle, neighbors within `radius` are
 * queried via the spatial hash grid (O(n)), their velocity vectors are
 * averaged, and the particle is nudged toward the normalized average
 * heading scaled by `strength`.
 *
 * By default only same-type neighbors contribute (`crossType: false`).
 * Set `crossType: true` to align across all species.
 *
 * Zero allocations per step.
 */
export class AlignmentForce implements Force {
  readonly id = 'alignment';
  readonly params: AlignmentParams;

  constructor(radius: number = 60, strength: number = 40, crossType: boolean = false) {
    this.params = { radius, strength, crossType };
  }

  apply(world: World, grid: SpatialHashGrid, dt: number): void {
    const { x, y, vx, vy, type, count } = world;
    const { radius, strength, crossType } = this.params;

    for (let i = 0; i < count; i++) {
      const xi = x[i];
      const yi = y[i];
      const typeI = type[i];

      let sumVx = 0;
      let sumVy = 0;
      let neighborCount = 0;

      // selfIdx=i so co-located particles can still be neighbors
      grid.queryRadius(
        xi,
        yi,
        radius,
        x,
        y,
        count,
        (j, _dx, _dy, _distSq) => {
          if (crossType || type[j] === typeI) {
            sumVx += vx[j];
            sumVy += vy[j];
            neighborCount++;
          }
        },
        i,
      );

      if (neighborCount > 0) {
        const avgVx = sumVx / neighborCount;
        const avgVy = sumVy / neighborCount;
        const mag = Math.sqrt(avgVx * avgVx + avgVy * avgVy);
        if (mag > 0.001) {
          vx[i] += (avgVx / mag) * strength * dt;
          vy[i] += (avgVy / mag) * strength * dt;
        }
      }
    }
  }
}

// ─── Re-exports for barrel import ────────────────────────────────
export type {
  EcosystemConfig,
  SpeciesConfig,
  EnergyConfig,
  LifecycleConfig,
  DietConfig,
  StaminaConfig,
  InteractionRule as EcoInteractionRule,
} from './ecosystem.js';
export {
  ALIVE,
  DEAD,
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  defaultStaminaConfig,
} from './ecosystem.js';
export type { EcosystemState } from './ecosystem.js';
export { EcosystemWorld } from './ecosystem-world.js';
export type { LifecycleResult } from './ecosystem-world.js';
export { processEating } from './eating.js';
export type { EatingResult } from './eating.js';
export { processReproduction } from './lifecycle.js';
export type { EcosystemStepResult } from './lifecycle.js';
export {
  InteractionRuleMatrix,
  FORCE_FLAGS,
  NO_INTERACTION,
  forceFlags,
  decodeForceFlags,
} from './interaction-rules.js';
export type { ForceType, InteractionRule as RuleInteractionRule } from './interaction-rules.js';
export { PointerForce } from './pointer-force.js';
export type { PointerParams } from './pointer-force.js';
export { serializeConfig, deserializeConfig, applyConfig } from './config-schema.js';
export type {
  CritteriumConfig,
  JsonSpeciesConfig,
  JsonForcesConfig,
  JsonInteractionEntry,
  JsonSnapshot,
  AppliedConfig,
} from './config-schema.js';

// Force Registry
export {
  createForce,
  registerForceType,
  getForceDescriptor,
  listForceTypes,
  getRegisteredTypes,
} from './force-registry.js';
export type { ForceFactory, ForceTypeDescriptor, ParamSchema } from './force-registry.js';
