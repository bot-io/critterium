/**
 * Critterium — Ecosystem World
 *
 * Extends the base World with lifecycle management:
 * - Free-list for dead particle slot reuse
 * - Spawn/kill with population cap
 * - EcosystemState companion (energy, age, health, infection)
 * - Per-frame lifecycle processing
 */

import {
  World,
  SimLoop,
  createRng,
  type SimulationConfig,
  type ParticleTypeConfig,
} from './index.js';
import {
  ALIVE,
  DEAD,
  NOT_INFECTED,
  EcosystemState,
  FreeList,
  type EcosystemConfig,
  type EcosystemSnapshot,
  type SpeciesConfig,
} from './ecosystem.js';

// ─── EcosystemWorld ──────────────────────────────────────────────

/**
 * World with ecosystem lifecycle support.
 * Owns both the base World (physics) and EcosystemState (lifecycle).
 */
export class EcosystemWorld {
  readonly config: EcosystemConfig;
  readonly species: readonly SpeciesConfig[];

  // Base physics world
  readonly world: World;

  // Ecosystem state (energy, age, etc.)
  readonly eco: EcosystemState;

  // Free list for dead particle slots
  readonly freeList: FreeList;

  // Current alive count
  private _aliveCount: number = 0;

  // Current highest used index
  private _highWaterMark: number = 0;

  // RNG
  readonly rng: () => number;

  constructor(config: EcosystemConfig) {
    this.config = config;
    this.species = config.species;
    this.rng = createRng(config.seed);

    // Calculate total initial particles
    const totalCount = config.species.reduce((sum, s) => sum + s.count, 0);

    // Create base world with a compatible config
    const simConfig: SimulationConfig = {
      width: config.width,
      height: config.height,
      boundaryMode: config.boundaryMode,
      seed: config.seed,
      types: config.species.map((s) => ({
        count: s.count,
        color: s.color,
        radius: s.radius,
        initialSpeed: s.initialSpeed,
        maxSpeed: s.maxSpeed,
      })),
    };
    this.world = new World(simConfig);
    this.eco = new EcosystemState(totalCount);
    this.freeList = new FreeList(totalCount);

    // Initialize ecosystem state for all spawned particles
    for (let i = 0; i < totalCount; i++) {
      this.eco.initParticle(i, this.world.type[i], config.species[this.world.type[i]], this.rng);
    }

    this._aliveCount = totalCount;
    this._highWaterMark = totalCount;
  }

  /** Number of currently alive particles. */
  get aliveCount(): number {
    return this._aliveCount;
  }

  /** Population cap from config. */
  get populationCap(): number {
    return this.config.populationCap;
  }

  /** Is the population at cap? */
  get isAtCap(): boolean {
    return this._aliveCount >= this.config.populationCap;
  }

  /**
   * Spawn a new particle of the given species.
   * Returns the particle index, or -1 if at population cap.
   */
  spawn(speciesIndex: number, x?: number, y?: number): number {
    if (this.isAtCap) return -1;

    const species = this.species[speciesIndex];

    // Try to reuse a free slot
    let idx = this.freeList.pop();
    let needsGrow = false;

    if (idx === -1) {
      // No free slots — append
      idx = this._highWaterMark;
      this._highWaterMark++;
      needsGrow = idx >= this.eco.capacity;
    }

    if (needsGrow) {
      this.growArrays(idx + 1);
    }

    // Set position
    const px = x ?? this.rng() * this.world.width;
    const py = y ?? this.rng() * this.world.height;

    // Random direction, species initial speed
    const angle = this.rng() * Math.PI * 2;
    const speed = species.initialSpeed;

    // Write to world arrays (may need to extend if idx >= world.count)
    this.ensureWorldCapacity(idx + 1);
    this.world.x[idx] = px;
    this.world.y[idx] = py;
    this.world.vx[idx] = Math.cos(angle) * speed;
    this.world.vy[idx] = Math.sin(angle) * speed;
    this.world.type[idx] = speciesIndex;

    // Initialize ecosystem state
    this.eco.initParticle(idx, speciesIndex, species, this.rng);
    this._aliveCount++;

    return idx;
  }

  /**
   * Kill a particle by index. Adds its slot to the free list.
   */
  kill(index: number): void {
    if (index < 0 || index >= this._highWaterMark) return;
    if (this.eco.alive[index] === DEAD) return; // already dead

    this.eco.kill(index);
    this.freeList.push(index);
    this._aliveCount--;

    // Zero out velocity to prevent ghost movement
    this.world.vx[index] = 0;
    this.world.vy[index] = 0;
  }

  /**
   * Process one ecosystem frame: age, energy drain, starvation, old age.
   * Does NOT handle eating, reproduction, or sickness (those are forces/systems).
   */
  processLifecycle(dt: number): LifecycleResult {
    const result: LifecycleResult = {
      diedOldAge: 0,
      diedStarvation: 0,
      totalAlive: 0,
    };

    for (let i = 0; i < this._highWaterMark; i++) {
      if (this.eco.alive[i] === DEAD) continue;

      const speciesIdx = this.world.type[i];
      const species = this.species[speciesIdx];

      // Age
      this.eco.age[i] += dt;

      // Energy drain: idle + movement cost
      const speed = Math.sqrt(this.world.vx[i] ** 2 + this.world.vy[i] ** 2);
      const movementCost = species.energy.movementCostPerSec * (speed / species.maxSpeed) * dt;
      const idleCost = species.energy.idleDrainPerSec * dt;
      this.eco.energy[i] -= movementCost + idleCost;

      // Clamp energy to [0, max]
      if (this.eco.energy[i] < 0) this.eco.energy[i] = 0;
      if (this.eco.energy[i] > species.energy.maxEnergy) {
        this.eco.energy[i] = species.energy.maxEnergy;
      }

      // Starvation: energy at 0 → health damage
      if (this.eco.energy[i] <= 0 && species.lifecycle.starvationDamagePerSec > 0) {
        this.eco.health[i] -= species.lifecycle.starvationDamagePerSec * dt;
        if (this.eco.health[i] <= 0) {
          this.kill(i);
          result.diedStarvation++;
          continue;
        }
      }

      // Old age
      if (species.lifecycle.maxAgeSec > 0 && this.eco.age[i] >= species.lifecycle.maxAgeSec) {
        this.kill(i);
        result.diedOldAge++;
        continue;
      }

      // Sickness death
      if (this.eco.infectedBy[i] !== NOT_INFECTED && species.lifecycle.sicknessDurationSec > 0) {
        this.eco.infectionTime[i] += dt;
        if (this.eco.infectionTime[i] >= species.lifecycle.sicknessDurationSec) {
          this.kill(i);
          result.diedStarvation++; // count as sickness death
          continue;
        }
      }

      // Reproduction cooldown tick
      if (this.eco.reproductionCooldown[i] > 0) {
        this.eco.reproductionCooldown[i] -= dt;
        if (this.eco.reproductionCooldown[i] < 0) this.eco.reproductionCooldown[i] = 0;
      }

      result.totalAlive++;
    }

    return result;
  }

  /**
   * Attempt reproduction for a particle.
   * Returns child index if successful, -1 if not.
   */
  tryReproduce(index: number): number {
    if (this.eco.alive[index] === DEAD) return -1;
    if (this.isAtCap) return -1;

    const speciesIdx = this.world.type[index];
    const species = this.species[speciesIdx];

    // Check conditions
    if (this.eco.reproductionCooldown[index] > 0) return -1;
    if (this.eco.energy[index] < species.energy.reproductionCost) return -1;

    // Deduct energy
    this.eco.energy[index] -= species.energy.reproductionCost;

    // Reset cooldown
    this.eco.reproductionCooldown[index] = species.lifecycle.reproductionCooldownSec;

    // Spawn child near parent
    const offsetX = (this.rng() - 0.5) * 20;
    const offsetY = (this.rng() - 0.5) * 20;
    const childX = this.world.x[index] + offsetX;
    const childY = this.world.y[index] + offsetY;

    const childIdx = this.spawn(speciesIdx, childX, childY);
    return childIdx;
  }

  /**
   * Get the full snapshot (world + ecosystem) for serialization.
   */
  snapshot(): EcosystemWorldSnapshot {
    return {
      world: this.world.snapshot(),
      eco: this.eco.snapshot(),
      aliveCount: this._aliveCount,
      highWaterMark: this._highWaterMark,
      seed: this.world.seed,
      simTime: this.world.simTime,
    };
  }

  /** Grow ecosystem arrays to new capacity. */
  private growArrays(newCapacity: number): void {
    const oldEco = this.eco;
    // We need to re-create with larger capacity
    // Since EcosystemState arrays are readonly, we create a new one and copy
    // This is a rare operation (only when spawning beyond initial allocation)
    const newEco = new EcosystemState(newCapacity);
    newEco.energy.set(oldEco.energy);
    newEco.age.set(oldEco.age);
    newEco.health.set(oldEco.health);
    newEco.alive.set(oldEco.alive);
    newEco.reproductionCooldown.set(oldEco.reproductionCooldown);
    newEco.infectedBy.set(oldEco.infectedBy);
    newEco.infectionTime.set(oldEco.infectionTime);
    // Replace internal reference (need to cast away readonly)
    (this as { eco: EcosystemState }).eco = newEco;
  }

  /** Ensure world arrays can hold up to `capacity` particles. */
  private ensureWorldCapacity(capacity: number): void {
    if (capacity <= this.world.x.length) return;
    // World arrays are readonly Float32Arrays — need to reallocate
    const newX = new Float32Array(capacity);
    const newY = new Float32Array(capacity);
    const newVx = new Float32Array(capacity);
    const newVy = new Float32Array(capacity);
    const newType = new Uint8Array(capacity);

    newX.set(this.world.x);
    newY.set(this.world.y);
    newVx.set(this.world.vx);
    newVy.set(this.world.vy);
    newType.set(this.world.type);

    // Replace (cast away readonly)
    (this.world as { x: Float32Array }).x = newX;
    (this.world as { y: Float32Array }).y = newY;
    (this.world as { vx: Float32Array }).vx = newVx;
    (this.world as { vy: Float32Array }).vy = newVy;
    (this.world as { type: Uint8Array }).type = newType;
    (this.world as { count: number }).count = capacity;
  }
}

/** Result of lifecycle processing. */
export interface LifecycleResult {
  diedOldAge: number;
  diedStarvation: number;
  totalAlive: number;
}

/** Full snapshot of ecosystem world state. */
export interface EcosystemWorldSnapshot {
  world: ReturnType<World['snapshot']>;
  eco: EcosystemSnapshot;
  aliveCount: number;
  highWaterMark: number;
  seed: number;
  simTime: number;
}
