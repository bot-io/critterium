/**
 * Critterium — Ecosystem World
 *
 * Extends the base World with lifecycle management:
 * - Free-list for dead particle slot reuse
 * - Spawn/kill with population cap
 * - EcosystemState companion (energy, age, health)
 * - Per-frame lifecycle processing
 */

import { World, createRng, type SimulationConfig } from './index.js';
import {
  DEAD,
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

  // Per-species alive count (for fair population cap distribution)
  private _speciesCounts: number[] = [];

  // Per-species population cap (ceil(populationCap / numSpecies))
  private _perSpeciesCap: number[] = [];

  // Current highest used index
  private _highWaterMark: number = 0;

  // RNG
  readonly rng: () => number;

  constructor(config: EcosystemConfig) {
    this.config = config;
    this.species = config.species;
    this.rng = createRng(config.seed);

    // Calculate total initial particles, capped to populationCap
    const rawTotal = config.species.reduce((sum, s) => sum + s.count, 0);

    // If capped, proportionally reduce each species count
    const speciesCounts =
      rawTotal > config.populationCap
        ? config.species.map((s) =>
            Math.max(1, Math.floor((s.count * config.populationCap) / rawTotal)),
          )
        : config.species.map((s) => s.count);

    // Total after proportional reduction (in case rounding changed it)
    const totalCount = Math.min(
      speciesCounts.reduce((sum, c) => sum + c, 0),
      config.populationCap,
    );

    // Create base world with a compatible config
    const simConfig: SimulationConfig = {
      width: config.width,
      height: config.height,
      boundaryMode: config.boundaryMode,
      seed: config.seed,
      types: config.species.map((s, i) => ({
        count: speciesCounts[i],
        color: s.color,
        radius: s.radius,
        initialSpeed: s.initialSpeed,
        maxSpeed: s.maxSpeed,
      })),
    };
    this.world = new World(simConfig);
    // Allocate ecosystem state for up to populationCap (particles may reproduce up to cap)
    this.eco = new EcosystemState(config.populationCap);
    this.freeList = new FreeList(config.populationCap);

    // Initialize ecosystem state for all spawned particles
    for (let i = 0; i < totalCount; i++) {
      this.eco.initParticle(i, this.world.type[i], config.species[this.world.type[i]], this.rng);
    }

    this._aliveCount = totalCount;
    this._highWaterMark = totalCount;

    // Per-species fair cap: each species gets ceil(populationCap / numSpecies) guaranteed slots.
    // This prevents fast-breeding species from monopolizing the global cap.
    const numSpecies = config.species.length;
    this._speciesCounts = new Array(numSpecies).fill(0);
    this._perSpeciesCap = config.species.map(() => Math.ceil(config.populationCap / numSpecies));
    for (let i = 0; i < totalCount; i++) {
      this._speciesCounts[this.world.type[i]]++;
    }

    // Limit World iteration to active range (avoids processing dead/unused slots)
    this.world.effectiveCount = totalCount;
  }

  /** Current highest used particle index (may have gaps from kills). */
  get highWaterMark(): number {
    return this._highWaterMark;
  }

  /** Number of currently alive particles. */
  get aliveCount(): number {
    return this._aliveCount;
  }

  /** Population cap from config. */
  get populationCap(): number {
    return this.config.populationCap;
  }

  /** Per-species alive count. */
  speciesCount(speciesIdx: number): number {
    return this._speciesCounts[speciesIdx] ?? 0;
  }

  /** Per-species population cap (fair share of global cap). */
  perSpeciesCap(speciesIdx: number): number {
    return this._perSpeciesCap[speciesIdx] ?? this.config.populationCap;
  }

  /** Is this species at its per-species cap? */
  isSpeciesAtCap(speciesIdx: number): boolean {
    return this._speciesCounts[speciesIdx] >= this._perSpeciesCap[speciesIdx];
  }

  /** Is the population at global cap? */
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
    let idx = this.freeList.pop();

    if (idx === -1) {
      // No free slots — append, but never exceed populationCap total slots
      if (this._highWaterMark >= this.config.populationCap) return -1;
      idx = this._highWaterMark;
      this._highWaterMark++;
      this.world.effectiveCount = this._highWaterMark;
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
    this._speciesCounts[speciesIndex]++;

    return idx;
  }

  /**
   * Kill a particle by index. Adds its slot to the free list.
   */
  kill(index: number): void {
    if (index < 0 || index >= this._highWaterMark) return;
    if (this.eco.alive[index] === DEAD) return; // already dead

    const speciesIdx = this.world.type[index];
    this.eco.kill(index);
    this.freeList.push(index);
    this._aliveCount--;
    if (speciesIdx < this._speciesCounts.length) {
      this._speciesCounts[speciesIdx]--;
    }

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
      // Clamp speed ratio to [0, 1] — sprint/forces can push beyond maxSpeed,
      // but movement cost shouldn't exceed the nominal rate
      const speedRatio = Math.min(1, speed / species.maxSpeed);
      const movementCost = species.energy.movementCostPerSec * speedRatio * dt;
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
   *
   * Reproduction is cooldown-gated: after the cooldown expires, the particle
   * reproduces immediately if it has enough energy. No probabilistic gate —
   * the cooldown alone controls the rate.
   *
   * Fairness is enforced by processReproduction(), which calls this in a
   * round-robin order across species.
   */
  tryReproduce(index: number, _dt: number = 0.016): number {
    if (this.eco.alive[index] === DEAD) return -1;

    const speciesIdx = this.world.type[index];

    // Per-species cap: prevents one fast-breeding species from monopolizing slots
    if (this.isSpeciesAtCap(speciesIdx)) return -1;

    // Global cap: total population safety valve
    if (this.isAtCap) return -1;

    const species = this.species[speciesIdx];

    // Hard gate: cooldown must be expired
    if (this.eco.reproductionCooldown[index] > 0) return -1;
    // Energy gate
    if (this.eco.energy[index] < species.energy.reproductionCost) return -1;

    // Spawn child near parent
    const offsetX = (this.rng() - 0.5) * 20;
    const offsetY = (this.rng() - 0.5) * 20;
    const childX = this.world.x[index] + offsetX;
    const childY = this.world.y[index] + offsetY;

    const childIdx = this.spawn(speciesIdx, childX, childY);
    if (childIdx < 0) return -1; // spawn failed — don't punish parent

    // Deduct energy after successful spawn
    this.eco.energy[index] -= species.energy.reproductionCost;

    // Reset cooldown
    this.eco.reproductionCooldown[index] = species.lifecycle.reproductionCooldownSec;

    return childIdx;
  }

  /**
   * Process stamina/sprint for all alive particles.
   * Updates sprint timers and clamps velocities based on sprint state.
   * Should be called after forces but before world.step() (which does its own clamp).
   *
   * Sprint state machine per particle:
   * - sprintTimer > 0: SPRINTING — velocity capped at sprintSpeedMultiplier × maxSpeed
   * - sprintTimer <= 0 && sprintCooldown > 0: TIRED — velocity capped at tiredSpeedMultiplier × maxSpeed
   * - sprintTimer <= 0 && sprintCooldown <= 0: RECOVERED — reset sprintTimer, ready to sprint
   *
   * Sprint is automatically triggered when the particle is moving above 50% of maxSpeed.
   */
  processStamina(dt: number): void {
    for (let i = 0; i < this._highWaterMark; i++) {
      if (this.eco.alive[i] === DEAD) continue;

      const speciesIdx = this.world.type[i];
      const species = this.species[speciesIdx];
      const stamina = species.stamina ?? {
        sprintDurationSec: 5,
        sprintCooldownSec: 3,
        sprintSpeedMultiplier: 1.0,
        tiredSpeedMultiplier: 0.5,
      };
      const baseMaxSpeed = species.maxSpeed;

      const speed = Math.sqrt(this.world.vx[i] ** 2 + this.world.vy[i] ** 2);

      if (this.eco.sprintTimer[i] > 0) {
        // Currently sprinting
        this.eco.sprintTimer[i] -= dt;

        // If speed dropped below threshold while sprinting, don't force sprint consumption
        // (particle is idle/slow, pause sprint timer)
        if (speed < baseMaxSpeed * 0.3) {
          this.eco.sprintTimer[i] += dt; // undo the decrement
        }

        if (this.eco.sprintTimer[i] <= 0) {
          // Sprint exhausted — enter cooldown
          this.eco.sprintTimer[i] = 0;
          this.eco.sprintCooldown[i] = stamina.sprintCooldownSec;
        }

        // Clamp to sprint speed
        const effectiveMax = baseMaxSpeed * stamina.sprintSpeedMultiplier;
        this.clampVelocity(i, effectiveMax);
      } else if (this.eco.sprintCooldown[i] > 0) {
        // Tired — recovering
        this.eco.sprintCooldown[i] -= dt;

        // Clamp to tired speed
        const effectiveMax = baseMaxSpeed * stamina.tiredSpeedMultiplier;
        this.clampVelocity(i, effectiveMax);

        if (this.eco.sprintCooldown[i] <= 0) {
          // Cooldown complete — reset sprint timer
          this.eco.sprintCooldown[i] = 0;
          this.eco.sprintTimer[i] = stamina.sprintDurationSec;
        }
      } else {
        // Ready to sprint — reset timer if needed, apply normal clamp
        if (this.eco.sprintTimer[i] <= 0) {
          this.eco.sprintTimer[i] = stamina.sprintDurationSec;
        }
        // Normal max speed (sprintSpeedMultiplier is typically 1.0 here)
        const effectiveMax = baseMaxSpeed * stamina.sprintSpeedMultiplier;
        this.clampVelocity(i, effectiveMax);
      }
    }
  }

  /** Clamp a single particle's velocity to the given max speed. */
  private clampVelocity(index: number, maxSpeed: number): void {
    const vx = this.world.vx[index];
    const vy = this.world.vy[index];
    const spdSq = vx * vx + vy * vy;
    if (spdSq > maxSpeed * maxSpeed) {
      const scale = maxSpeed / Math.sqrt(spdSq);
      this.world.vx[index] = vx * scale;
      this.world.vy[index] = vy * scale;
    }
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
