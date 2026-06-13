/**
 * Critterium — Interaction Rule Matrix
 *
 * Per-species-pair force configuration: which forces are active,
 * at what radius and strength. Sparse 12×12 matrix (most pairs
 * don't interact). This replaces the flat `interactionRules` array
 * with a structured, toggleable system.
 *
 * Force pipeline reads the matrix to decide which interactions
 * to compute for each (source, target) pair.
 */

// ─── Force types ─────────────────────────────────────────────────

export type ForceType =
  | 'attract'
  | 'repel'
  | 'eat'
  | 'infect'
  | 'flock'
  | 'orbit'
  | 'flee'
  | 'wander';

/** All recognized force types. */
export const ALL_FORCE_TYPES: readonly ForceType[] = [
  'attract',
  'repel',
  'eat',
  'infect',
  'flock',
  'orbit',
  'flee',
  'wander',
];

/** Bit flags for force types — fast set operations. */
export const FORCE_FLAGS: Record<ForceType, number> = {
  attract: 1 << 0,
  repel: 1 << 1,
  eat: 1 << 2,
  infect: 1 << 3,
  flock: 1 << 4,
  orbit: 1 << 5,
  flee: 1 << 6,
  wander: 1 << 7,
};

// ─── Interaction rule ────────────────────────────────────────────

/** A single interaction rule between a species pair. */
export interface InteractionRule {
  /** Bit-flag set of enabled forces (use FORCE_FLAGS). */
  enabledForces: number;
  /** Radius of interaction. */
  radius: number;
  /** Strength multiplier (0–1 typical, can exceed). */
  strength: number;
}

/** Shorthand for no interaction. */
export const NO_INTERACTION: InteractionRule = {
  enabledForces: 0,
  radius: 0,
  strength: 0,
};

// ─── Matrix ──────────────────────────────────────────────────────

const MAX_SPECIES = 12;

/**
 * Interaction rule matrix — 12×12 sparse grid.
 * `rules[source * MAX_SPECIES + target]` gives the rule for
 * how `source` interacts with `target`.
 */
export class InteractionRuleMatrix {
  readonly rules: InteractionRule[];
  readonly speciesCount: number;

  constructor(speciesCount: number) {
    if (speciesCount < 1 || speciesCount > MAX_SPECIES) {
      throw new Error(`speciesCount must be 1–${MAX_SPECIES}, got ${speciesCount}`);
    }
    this.speciesCount = speciesCount;
    // Allocate with MAX_SPECIES stride so idx() = s * MAX_SPECIES + t works
    this.rules = new Array(speciesCount * MAX_SPECIES);
    for (let i = 0; i < this.rules.length; i++) {
      this.rules[i] = { ...NO_INTERACTION };
    }
  }

  /** Index into the flat rules array. */
  private idx(source: number, target: number): number {
    if (source < 0 || source >= this.speciesCount) {
      throw new Error(`source species ${source} out of range [0, ${this.speciesCount})`);
    }
    if (target < 0 || target >= this.speciesCount) {
      throw new Error(`target species ${target} out of range [0, ${this.speciesCount})`);
    }
    return source * MAX_SPECIES + target;
  }

  /** Get the interaction rule for (source, target). */
  get(source: number, target: number): InteractionRule {
    return this.rules[this.idx(source, target)];
  }

  /** Set the interaction rule for (source, target). */
  set(source: number, target: number, rule: Partial<InteractionRule>): void {
    const i = this.idx(source, target);
    this.rules[i] = {
      enabledForces: rule.enabledForces ?? this.rules[i].enabledForces,
      radius: rule.radius ?? this.rules[i].radius,
      strength: rule.strength ?? this.rules[i].strength,
    };
  }

  /** Check if a specific force is enabled for (source, target). */
  hasForce(source: number, target: number, force: ForceType): boolean {
    return (this.get(source, target).enabledForces & FORCE_FLAGS[force]) !== 0;
  }

  /** Enable a force for (source, target) with optional radius/strength. */
  enableForce(source: number, target: number, force: ForceType, radius = 50, strength = 1): void {
    const i = this.idx(source, target);
    this.rules[i].enabledForces |= FORCE_FLAGS[force];
    if (radius > 0) this.rules[i].radius = radius;
    if (strength > 0) this.rules[i].strength = strength;
  }

  /** Disable a force for (source, target). */
  disableForce(source: number, target: number, force: ForceType): void {
    const i = this.idx(source, target);
    this.rules[i].enabledForces &= ~FORCE_FLAGS[force];
    // If no forces remain, zero out radius/strength
    if (this.rules[i].enabledForces === 0) {
      this.rules[i].radius = 0;
      this.rules[i].strength = 0;
    }
  }

  /** Get all active pairs (source, target) for a given force type. */
  activePairs(force: ForceType): Array<[source: number, target: number]> {
    const result: Array<[number, number]> = [];
    const flag = FORCE_FLAGS[force];
    for (let s = 0; s < this.speciesCount; s++) {
      for (let t = 0; t < this.speciesCount; t++) {
        if (this.rules[s * MAX_SPECIES + t].enabledForces & flag) {
          result.push([s, t]);
        }
      }
    }
    return result;
  }

  /** Count of non-empty rules. */
  get activeRuleCount(): number {
    let count = 0;
    for (let i = 0; i < this.rules.length; i++) {
      if (this.rules[i].enabledForces !== 0) count++;
    }
    return count;
  }

  /** Serialize to JSON-friendly object. */
  toJSON(): object {
    const entries: Record<string, InteractionRule> = {};
    for (let s = 0; s < this.speciesCount; s++) {
      for (let t = 0; t < this.speciesCount; t++) {
        const rule = this.rules[s * MAX_SPECIES + t];
        if (rule.enabledForces !== 0) {
          entries[`${s},${t}`] = { ...rule };
        }
      }
    }
    return { speciesCount: this.speciesCount, entries };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Build a force flag from a list of force types. */
export function forceFlags(...forces: ForceType[]): number {
  let flags = 0;
  for (const f of forces) flags |= FORCE_FLAGS[f];
  return flags;
}

/** Decode a force flag into individual force types. */
export function decodeForceFlags(flags: number): ForceType[] {
  const result: ForceType[] = [];
  for (const ft of ALL_FORCE_TYPES) {
    if (flags & FORCE_FLAGS[ft]) result.push(ft);
  }
  return result;
}
