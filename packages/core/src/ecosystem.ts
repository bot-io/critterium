/**
 * Critterium — Ecosystem Data Model
 *
 * Extends the base simulation with per-particle energy, lifecycle,
 * and diet state. All data in typed arrays — zero per-particle objects.
 *
 * Design decisions (D14–D20):
 * - Full energy budget: movement costs, eating gains, reproduction costs
 * - Binary fission reproduction
 * - 3 death types: old age, starvation, eaten (instant)
 * - Hard population cap
 * - Instant eating (touch → gone)
 */

// MAX_TYPES reserved for future use
// import { MAX_TYPES } from './index.js';

// ─── Constants ───────────────────────────────────────────────────

/** Maximum number of species (updated from 12 per D2). */
export const MAX_SPECIES = 12;

/** Sentinel value for "dead/free slot". */
export const DEAD = 0;
export const ALIVE = 1;

// ─── Config Types ────────────────────────────────────────────────

/** Energy configuration per species. */
export interface EnergyConfig {
  /** Maximum energy this species can hold. */
  maxEnergy: number;
  /** Energy a newly spawned creature starts with. */
  initialEnergy: number;
  /** Energy cost per second of movement (scaled by speed). */
  movementCostPerSec: number;
  /** Energy cost to reproduce (fission). Deducted from parent. */
  reproductionCost: number;
  /** Idle energy drain per second (base metabolic rate). */
  idleDrainPerSec: number;
  /** Energy gained per prey eaten, keyed by prey species index. */
  energyGainPerPrey: number[];
}

/** Lifecycle configuration per species. */
export interface LifecycleConfig {
  /** Maximum age in sim-seconds before dying of old age. 0 = immortal. */
  maxAgeSec: number;
  /** Seconds without food before starving (energy hits 0). 0 = immune to starvation. */
  starvationDamagePerSec: number;
  /** Cooldown in sim-seconds between reproductions. */
  reproductionCooldownSec: number;
}

/** Diet configuration per species. */
export interface DietConfig {
  /** Set of species indices this species can eat. */
  canEat: Set<number>;
}

/** Stamina/sprint configuration per species. */
export interface StaminaConfig {
  /** How long (seconds) a particle can maintain sprint speed. Default: 5 */
  sprintDurationSec: number;
  /** Recovery time (seconds) before sprinting again. Default: 3 */
  sprintCooldownSec: number;
  /** Effective max speed multiplier during sprint. Default: 1.0 */
  sprintSpeedMultiplier: number;
  /** Effective max speed multiplier when tired. Default: 0.5 */
  tiredSpeedMultiplier: number;
}

/** Full species configuration. */
export interface SpeciesConfig {
  /** Base particle config. */
  count: number;
  color: string;
  radius: number;
  initialSpeed: number;
  maxSpeed: number;
  /** Species display name. */
  name: string;
  /** Energy parameters. */
  energy: EnergyConfig;
  /** Lifecycle parameters. */
  lifecycle: LifecycleConfig;
  /** Diet parameters. */
  diet: DietConfig;
  /** Stamina/sprint parameters. */
  stamina?: StaminaConfig;
}

/** Interaction rule between two species. */
export interface InteractionRule {
  /** Which forces are enabled for this pair. */
  enabledForces: Set<string>;
  /** Interaction radius (pixels). */
  radius: number;
  /** Force strength (positive = attract, negative = repel). */
  strength: number;
  /** Falloff type. */
  falloff: 'linear' | 'inverse' | 'constant';
}

/** Full ecosystem simulation config. */
export interface EcosystemConfig {
  width: number;
  height: number;
  boundaryMode: 'bounce' | 'wrap';
  seed: number;
  /** Maximum total alive particles. */
  populationCap: number;
  /** Species definitions. */
  species: SpeciesConfig[];
  /** Interaction rules matrix: [source][target]. */
  interactionRules: (InteractionRule | null)[][];
}

// ─── Per-Particle State (typed arrays) ───────────────────────────

/**
 * Ecosystem particle state — companion to World's typed arrays.
 * One Float32Array/Uint8Array per attribute, indexed by particle index.
 */
export class EcosystemState {
  readonly capacity: number;

  // Per-particle energy
  readonly energy: Float32Array;
  // Per-particle age (sim-seconds)
  readonly age: Float32Array;
  // Per-particle health (damage tracking)
  readonly health: Float32Array;
  // Alive flag (ALIVE=1, DEAD=0)
  readonly alive: Uint8Array;
  // Reproduction cooldown (seconds remaining)
  readonly reproductionCooldown: Float32Array;
  // Sprint timer: >0 = sprinting (time remaining), <=0 = tired/cooldown
  readonly sprintTimer: Float32Array;
  // Sprint cooldown: >0 = recovering (time remaining), 0 = ready to sprint
  readonly sprintCooldown: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.energy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.health = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.reproductionCooldown = new Float32Array(capacity);
    this.sprintTimer = new Float32Array(capacity);
    this.sprintCooldown = new Float32Array(capacity);
  }

  /** Initialize a particle slot for a living creature. */
  initParticle(
    index: number,
    _speciesIndex: number,
    species: SpeciesConfig,
    rng: () => number,
  ): void {
    this.alive[index] = ALIVE;
    this.energy[index] = species.energy.initialEnergy;
    this.age[index] = 0;
    this.health[index] = 1.0; // full health
    // Randomize initial cooldown (0 to max) so particles don't all reproduce in unison
    this.reproductionCooldown[index] = rng() * species.lifecycle.reproductionCooldownSec;
    this.sprintTimer[index] = species.stamina?.sprintDurationSec ?? 5;
    this.sprintCooldown[index] = 0;
  }

  /** Mark a particle as dead (free its slot). */
  kill(index: number): void {
    this.alive[index] = DEAD;
    this.energy[index] = 0;
    this.age[index] = 0;
    this.health[index] = 0;
    this.reproductionCooldown[index] = 0;
    this.sprintTimer[index] = 0;
    this.sprintCooldown[index] = 0;
  }

  /** Snapshot the ecosystem state (copies). */
  snapshot(): EcosystemSnapshot {
    return {
      energy: new Float32Array(this.energy),
      age: new Float32Array(this.age),
      health: new Float32Array(this.health),
      alive: new Uint8Array(this.alive),
      reproductionCooldown: new Float32Array(this.reproductionCooldown),
      sprintTimer: new Float32Array(this.sprintTimer),
      sprintCooldown: new Float32Array(this.sprintCooldown),
      capacity: this.capacity,
    };
  }
}

/** Snapshot of ecosystem state for serialization. */
export interface EcosystemSnapshot {
  energy: Float32Array;
  age: Float32Array;
  health: Float32Array;
  alive: Uint8Array;
  reproductionCooldown: Float32Array;
  sprintTimer: Float32Array;
  sprintCooldown: Float32Array;
  capacity: number;
}

// ─── Free List ───────────────────────────────────────────────────

/**
 * Manages free particle slots for zero-alloc spawn/kill.
 * Uses a stack-based free list backed by a Uint32Array.
 */
export class FreeList {
  private slots: Uint32Array;
  private top: number = 0;

  constructor(capacity: number) {
    this.slots = new Uint32Array(capacity);
  }

  /** Grow internal storage to at least `minCapacity`. */
  grow(minCapacity: number): void {
    if (minCapacity <= this.slots.length) return;
    const newSlots = new Uint32Array(minCapacity);
    newSlots.set(this.slots.subarray(0, this.top));
    this.slots = newSlots;
  }

  /** Push a freed slot index. Auto-grows if needed. */
  push(index: number): void {
    if (this.top >= this.slots.length) {
      this.grow(this.slots.length * 2);
    }
    this.slots[this.top++] = index;
  }

  /** Pop a free slot index, or -1 if empty. */
  pop(): number {
    if (this.top === 0) return -1;
    return this.slots[--this.top];
  }

  /** Number of free slots available. */
  get size(): number {
    return this.top;
  }

  /** Is the free list empty? */
  get isEmpty(): boolean {
    return this.top === 0;
  }
}

// ─── Default Configs ─────────────────────────────────────────────

/** Default energy config for a species. */
export function defaultEnergyConfig(overrides?: Partial<EnergyConfig>): EnergyConfig {
  return {
    maxEnergy: 100,
    initialEnergy: 50,
    movementCostPerSec: 2,
    reproductionCost: 40,
    idleDrainPerSec: 1,
    energyGainPerPrey: [],
    ...overrides,
  };
}

/** Default lifecycle config for a species. */
export function defaultLifecycleConfig(overrides?: Partial<LifecycleConfig>): LifecycleConfig {
  return {
    maxAgeSec: 60,
    starvationDamagePerSec: 10,
    reproductionCooldownSec: 5,
    ...overrides,
  };
}

/** Default diet config — eats nothing. */
export function defaultDietConfig(overrides?: Partial<DietConfig>): DietConfig {
  return {
    canEat: new Set(),
    ...overrides,
  };
}

/** Default stamina config — moderate sprint with short cooldown. */
export function defaultStaminaConfig(overrides?: Partial<StaminaConfig>): StaminaConfig {
  return {
    sprintDurationSec: 5,
    sprintCooldownSec: 3,
    sprintSpeedMultiplier: 1.0,
    tiredSpeedMultiplier: 0.5,
    ...overrides,
  };
}

/** Create a predator/prey config pair for testing. */
export function predatorPreyConfig(): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: 500,
    species: [
      {
        name: 'Predator',
        count: 20,
        color: '#ff4444',
        radius: 5,
        initialSpeed: 80,
        maxSpeed: 120,
        energy: defaultEnergyConfig({
          maxEnergy: 150,
          initialEnergy: 80,
          reproductionCost: 60,
          energyGainPerPrey: [0, 50], // gains 50 from eating prey (species 1)
        }),
        lifecycle: defaultLifecycleConfig({
          maxAgeSec: 90,
          reproductionCooldownSec: 8,
        }),
        diet: defaultDietConfig({
          canEat: new Set([1]), // eats species 1
        }),
        stamina: defaultStaminaConfig({
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          tiredSpeedMultiplier: 0.4,
        }),
      },
      {
        name: 'Prey',
        count: 100,
        color: '#44ff44',
        radius: 3,
        initialSpeed: 60,
        maxSpeed: 100,
        energy: defaultEnergyConfig({
          maxEnergy: 80,
          initialEnergy: 40,
          reproductionCost: 25,
          energyGainPerPrey: [0, 0], // prey doesn't eat
        }),
        lifecycle: defaultLifecycleConfig({
          maxAgeSec: 45,
          reproductionCooldownSec: 3,
        }),
        diet: defaultDietConfig(),
        stamina: defaultStaminaConfig({
          sprintDurationSec: 8,
          sprintCooldownSec: 2,
          tiredSpeedMultiplier: 0.6,
        }),
      },
    ],
    interactionRules: [
      // [predator][prey]: predator chases prey
      [null, { enabledForces: new Set(['attract']), radius: 150, strength: 50, falloff: 'linear' }],
      // [prey][predator]: prey flees predator
      [{ enabledForces: new Set(['repel']), radius: 120, strength: 60, falloff: 'linear' }, null],
    ],
  };
}
