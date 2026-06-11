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

  private readonly capacity: number;

  constructor(width: number, height: number, cellSize: number, maxParticles: number) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.capacity = maxParticles;

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
   */
  rebuild(world: World): void {
    this.clear();
    for (let i = 0; i < world.count; i++) {
      this.insert(i, world.x[i], world.y[i]);
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
   */
  queryRadius(
    px: number, py: number, radius: number,
    xArr: Float32Array, yArr: Float32Array, count: number,
    callback: (idx: number, dx: number, dy: number, distSq: number) => void,
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
            const dx = xArr[pIdx] - px;
            const dy = yArr[pIdx] - py;
            const dSq = dx * dx + dy * dy;
            if (dSq <= rSq && dSq > 0) {
              callback(pIdx, dx, dy, dSq);
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
    px: number, py: number, radius: number,
    xArr: Float32Array, yArr: Float32Array, count: number,
    outIndices: Int32Array, maxResults: number,
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
  px: number, py: number, radius: number,
  xArr: Float32Array, yArr: Float32Array, count: number,
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
  /** Maximum interaction radius (must be ≤ spatial hash cell size). */
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

    // Accumulate velocity changes in temp arrays to avoid order dependency
    const dvx = new Float32Array(count);
    const dvy = new Float32Array(count);

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
        if (entry && dist < entry.radius) {
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
