/**
 * Critterium — Config Schema v1 + Serialization
 *
 * Defines the JSON-serializable configuration format for saving,
 * loading, and sharing simulation states. Provides serialize,
 * deserialize, and apply functions.
 *
 * CRT-11: Config schema v1 + serialization
 */

import { InteractionMatrix, type FalloffType } from './index.js';
import {
  type EcosystemConfig,
  type SpeciesConfig,
  type EnergyConfig,
  type LifecycleConfig,
  type DietConfig,
  type StaminaConfig,
  ALIVE,
} from './ecosystem.js';
import { EcosystemWorld } from './ecosystem-world.js';

// ─── JSON-serializable config types ────────────────────────────

/** JSON-serializable energy config (arrays instead of Sets). */
export interface JsonEnergyConfig {
  maxEnergy: number;
  initialEnergy: number;
  movementCostPerSec: number;
  reproductionCost: number;
  idleDrainPerSec: number;
  energyGainPerPrey: number[];
}

/** JSON-serializable lifecycle config. */
export interface JsonLifecycleConfig {
  maxAgeSec: number;
  starvationDamagePerSec: number;
  reproductionCooldownSec: number;
}

/** JSON-serializable diet config (arrays instead of Sets). */
export interface JsonDietConfig {
  canEat: number[];
}

/** JSON-serializable stamina config. */
export interface JsonStaminaConfig {
  sprintDurationSec: number;
  sprintCooldownSec: number;
  sprintSpeedMultiplier: number;
  tiredSpeedMultiplier: number;
}

/** JSON-serializable species definition. */
export interface JsonSpeciesConfig {
  name: string;
  count: number;
  color: string;
  radius: number;
  initialSpeed: number;
  maxSpeed: number;
  energy: JsonEnergyConfig;
  lifecycle: JsonLifecycleConfig;
  diet: JsonDietConfig;
  stamina?: JsonStaminaConfig;
}

/** JSON-serializable interaction matrix entry. */
export interface JsonInteractionEntry {
  strength: number;
  radius: number;
  falloff: FalloffType;
}

/** JSON-serializable force configuration. */
export interface JsonForcesConfig {
  drag?: { coefficient: number } | null;
  wander?: { strength: number; rate: number } | null;
  gravity?: { acceleration: number } | null;
  flowField?: { strength: number; mode: string; angle: number; turbulenceScale: number } | null;
  vortex?: {
    cx: number;
    cy: number;
    strength: number;
    radialStrength: number;
    radius: number;
    falloff: FalloffType;
  } | null;
  pointer?: { strength: number; radius: number; falloff: FalloffType } | null;
}

/** JSON-serializable particle snapshot (all typed arrays → number[]). */
export interface JsonSnapshot {
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  type: number[];
  seed: number;
  simTime: number;
  energy: number[];
  alive: number[];
}

/** The full config schema v1. */
export interface CritteriumConfig {
  version: 1;
  simulation: {
    width: number;
    height: number;
    boundaryMode: 'bounce' | 'wrap';
    seed: number;
    populationCap: number;
  };
  species: JsonSpeciesConfig[];
  interactionMatrix: (JsonInteractionEntry | null)[][];
  forces: JsonForcesConfig;
  snapshot?: JsonSnapshot;
}

// ─── Helpers ───────────────────────────────────────────────────

/** Convert an EnergyConfig to JSON-serializable form. */
function energyToJson(energy: EnergyConfig): JsonEnergyConfig {
  return {
    maxEnergy: energy.maxEnergy,
    initialEnergy: energy.initialEnergy,
    movementCostPerSec: energy.movementCostPerSec,
    reproductionCost: energy.reproductionCost,
    idleDrainPerSec: energy.idleDrainPerSec,
    energyGainPerPrey: [...energy.energyGainPerPrey],
  };
}

/** Parse a JSON energy config. */
function jsonToEnergy(json: JsonEnergyConfig): EnergyConfig {
  return {
    maxEnergy: json.maxEnergy,
    initialEnergy: json.initialEnergy,
    movementCostPerSec: json.movementCostPerSec,
    reproductionCost: json.reproductionCost,
    idleDrainPerSec: json.idleDrainPerSec,
    energyGainPerPrey: [...json.energyGainPerPrey],
  };
}

/** Convert a LifecycleConfig to JSON form. */
function lifecycleToJson(lc: LifecycleConfig): JsonLifecycleConfig {
  return {
    maxAgeSec: lc.maxAgeSec,
    starvationDamagePerSec: lc.starvationDamagePerSec,
    reproductionCooldownSec: lc.reproductionCooldownSec,
  };
}

/** Parse a JSON lifecycle config. */
function jsonToLifecycle(json: JsonLifecycleConfig): LifecycleConfig {
  return {
    maxAgeSec: json.maxAgeSec,
    starvationDamagePerSec: json.starvationDamagePerSec,
    reproductionCooldownSec: json.reproductionCooldownSec,
  };
}

/** Convert a DietConfig to JSON form (Set → Array). */
function dietToJson(diet: DietConfig): JsonDietConfig {
  return {
    canEat: Array.from(diet.canEat),
  };
}

/** Parse a JSON diet config (Array → Set). */
function jsonToDiet(json: JsonDietConfig): DietConfig {
  return {
    canEat: new Set(json.canEat),
  };
}

/** Default stamina values for deserialization fallback. */
const DEFAULT_STAMINA: StaminaConfig = {
  sprintDurationSec: 5,
  sprintCooldownSec: 3,
  sprintSpeedMultiplier: 1.0,
  tiredSpeedMultiplier: 0.5,
};

/** Convert a StaminaConfig to JSON form. */
function staminaToJson(stamina: StaminaConfig): JsonStaminaConfig {
  return {
    sprintDurationSec: stamina.sprintDurationSec,
    sprintCooldownSec: stamina.sprintCooldownSec,
    sprintSpeedMultiplier: stamina.sprintSpeedMultiplier,
    tiredSpeedMultiplier: stamina.tiredSpeedMultiplier,
  };
}

/** Parse a JSON stamina config, filling defaults for missing fields. */
function jsonToStamina(json?: JsonStaminaConfig): StaminaConfig {
  if (!json) return { ...DEFAULT_STAMINA };
  return {
    sprintDurationSec: json.sprintDurationSec ?? DEFAULT_STAMINA.sprintDurationSec,
    sprintCooldownSec: json.sprintCooldownSec ?? DEFAULT_STAMINA.sprintCooldownSec,
    sprintSpeedMultiplier: json.sprintSpeedMultiplier ?? DEFAULT_STAMINA.sprintSpeedMultiplier,
    tiredSpeedMultiplier: json.tiredSpeedMultiplier ?? DEFAULT_STAMINA.tiredSpeedMultiplier,
  };
}

/** Convert a SpeciesConfig to JSON form. */
function speciesToJson(sp: SpeciesConfig): JsonSpeciesConfig {
  return {
    name: sp.name,
    count: sp.count,
    color: sp.color,
    radius: sp.radius,
    initialSpeed: sp.initialSpeed,
    maxSpeed: sp.maxSpeed,
    energy: energyToJson(sp.energy),
    lifecycle: lifecycleToJson(sp.lifecycle),
    diet: dietToJson(sp.diet),
    stamina: staminaToJson(sp.stamina ?? DEFAULT_STAMINA),
  };
}

/** Parse a JSON species config. */
function jsonToSpecies(json: JsonSpeciesConfig): SpeciesConfig {
  return {
    name: json.name,
    count: json.count,
    color: json.color,
    radius: json.radius,
    initialSpeed: json.initialSpeed,
    maxSpeed: json.maxSpeed,
    energy: jsonToEnergy(json.energy),
    lifecycle: jsonToLifecycle(json.lifecycle),
    diet: jsonToDiet(json.diet),
    stamina: jsonToStamina(json.stamina),
  };
}

// ─── Force interface for serialization ─────────────────────────

/** Minimal interface for force objects we need to serialize. */
interface SerializeableForce {
  readonly id: string;
  readonly params: Record<string, unknown>;
}

// ─── Serialize ─────────────────────────────────────────────────

/**
 * Serialize the current simulation state into a JSON-serializable config.
 *
 * @param eco     The EcosystemWorld (simulation + ecosystem state)
 * @param matrix  The InteractionMatrix (physics forces)
 * @param forces  Array of active force instances (drag, wander, etc.)
 * @returns       A CritteriumConfig ready for JSON.stringify()
 */
export function serializeConfig(
  eco: EcosystemWorld,
  matrix: InteractionMatrix,
  forces: SerializeableForce[],
): CritteriumConfig {
  const config: CritteriumConfig = {
    version: 1,
    simulation: {
      width: eco.config.width,
      height: eco.config.height,
      boundaryMode: eco.config.boundaryMode,
      seed: eco.config.seed,
      populationCap: eco.config.populationCap,
    },
    species: eco.config.species.map(speciesToJson),
    interactionMatrix: serializeInteractionMatrix(matrix),
    forces: serializeForces(forces),
    snapshot: serializeSnapshot(eco),
  };
  return config;
}

/** Serialize the InteractionMatrix to JSON-compatible 2D array. */
function serializeInteractionMatrix(matrix: InteractionMatrix): (JsonInteractionEntry | null)[][] {
  const result: (JsonInteractionEntry | null)[][] = [];
  for (let i = 0; i < matrix.numTypes; i++) {
    const row: (JsonInteractionEntry | null)[] = [];
    for (let j = 0; j < matrix.numTypes; j++) {
      const entry = matrix.get(i, j);
      if (entry) {
        row.push({
          strength: entry.strength,
          radius: entry.radius,
          falloff: entry.falloff,
        });
      } else {
        row.push(null);
      }
    }
    result.push(row);
  }
  return result;
}

/** Serialize force instances to JSON config. */
function serializeForces(forces: SerializeableForce[]): JsonForcesConfig {
  const result: JsonForcesConfig = {};
  for (const force of forces) {
    switch (force.id) {
      case 'drag':
        result.drag = { coefficient: force.params.coefficient as number };
        break;
      case 'wander':
        result.wander = {
          strength: force.params.strength as number,
          rate: force.params.rate as number,
        };
        break;
      case 'gravity':
        result.gravity = { acceleration: force.params.acceleration as number };
        break;
      case 'flow-field':
        result.flowField = {
          strength: force.params.strength as number,
          mode: force.params.mode as string,
          angle: force.params.angle as number,
          turbulenceScale: force.params.turbulenceScale as number,
        };
        break;
      case 'vortex':
        result.vortex = {
          cx: force.params.cx as number,
          cy: force.params.cy as number,
          strength: force.params.strength as number,
          radialStrength: force.params.radialStrength as number,
          radius: force.params.radius as number,
          falloff: force.params.falloff as FalloffType,
        };
        break;
      case 'pointer':
        result.pointer = {
          strength: force.params.strength as number,
          radius: force.params.radius as number,
          falloff: force.params.falloff as FalloffType,
        };
        break;
    }
  }
  return result;
}

/** Serialize ecosystem world snapshot to JSON-compatible format. */
function serializeSnapshot(eco: EcosystemWorld): JsonSnapshot {
  const snap = eco.snapshot();
  const hwm = snap.highWaterMark;

  // Extract particle data up to highWaterMark
  const xArr: number[] = [];
  const yArr: number[] = [];
  const vxArr: number[] = [];
  const vyArr: number[] = [];
  const typeArr: number[] = [];
  const energyArr: number[] = [];
  const aliveArr: number[] = [];

  for (let i = 0; i < hwm; i++) {
    xArr.push(snap.world.x[i]);
    yArr.push(snap.world.y[i]);
    vxArr.push(snap.world.vx[i]);
    vyArr.push(snap.world.vy[i]);
    typeArr.push(snap.world.type[i]);
    energyArr.push(snap.eco.energy[i]);
    aliveArr.push(snap.eco.alive[i]);
  }

  return {
    x: xArr,
    y: yArr,
    vx: vxArr,
    vy: vyArr,
    type: typeArr,
    seed: snap.seed,
    simTime: snap.simTime,
    energy: energyArr,
    alive: aliveArr,
  };
}

// ─── Deserialize ───────────────────────────────────────────────

/**
 * Validate and deserialize a JSON object into a CritteriumConfig.
 * Unknown fields are preserved (passed through) but not validated.
 * Throws on missing or invalid required fields.
 */
export function deserializeConfig(json: unknown): CritteriumConfig {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Config must be a non-null object');
  }

  const obj = json as Record<string, unknown>;

  // Version check
  if (obj.version !== 1) {
    throw new Error(`Unsupported config version: ${obj.version}. Expected 1.`);
  }

  // Validate simulation
  const sim = obj.simulation;
  if (typeof sim !== 'object' || sim === null) {
    throw new Error('Missing or invalid simulation config');
  }
  const simObj = sim as Record<string, unknown>;
  // Type-check dimensions before clamping
  if (typeof simObj.width !== 'number' || typeof simObj.height !== 'number') {
    throw new Error('simulation.width and simulation.height must be numbers');
  }
  if (typeof simObj.seed !== 'number') {
    throw new Error('simulation.seed must be a number');
  }
  if (typeof simObj.populationCap !== 'number') {
    throw new Error('simulation.populationCap must be a number');
  }
  // Clamp dimensions to safe ranges
  const w = Number.isFinite(simObj.width) && simObj.width >= 100 ? simObj.width : 800;
  const h = Number.isFinite(simObj.height) && simObj.height >= 100 ? simObj.height : 600;
  let cap = Number.isFinite(simObj.populationCap) && simObj.populationCap >= 1 ? simObj.populationCap : 600;
  if (cap > 5000) cap = 5000;
  simObj.width = w;
  simObj.height = h;
  simObj.populationCap = cap;
  if (simObj.boundaryMode !== 'bounce' && simObj.boundaryMode !== 'wrap') {
    throw new Error('simulation.boundaryMode must be "bounce" or "wrap"');
  }

  // Validate species
  if (!Array.isArray(obj.species)) {
    throw new Error('species must be an array');
  }
  for (let i = 0; i < obj.species.length; i++) {
    validateSpecies(obj.species[i] as Record<string, unknown>, i);
  }

  // Validate interaction matrix
  if (!Array.isArray(obj.interactionMatrix)) {
    throw new Error('interactionMatrix must be a 2D array');
  }

  // Validate forces (optional fields)
  if (obj.forces !== undefined && (typeof obj.forces !== 'object' || obj.forces === null)) {
    throw new Error('forces must be an object if provided');
  }

  // Validate snapshot (optional)
  if (obj.snapshot !== undefined) {
    validateSnapshot(obj.snapshot as Record<string, unknown>);
  }

  // Return the validated config (allow extra fields to pass through)
  return {
    version: 1,
    simulation: {
      width: simObj.width as number,
      height: simObj.height as number,
      boundaryMode: simObj.boundaryMode as 'bounce' | 'wrap',
      seed: simObj.seed as number,
      populationCap: simObj.populationCap as number,
    },
    species: obj.species as JsonSpeciesConfig[],
    interactionMatrix: obj.interactionMatrix as (JsonInteractionEntry | null)[][],
    forces: (obj.forces ?? {}) as JsonForcesConfig,
    snapshot: obj.snapshot as JsonSnapshot | undefined,
  };
}

/** Validate a single species config entry. Range-clamps unsafe values. */
function validateSpecies(sp: Record<string, unknown>, index: number): void {
  const req = (field: string) => {
    if (sp[field] === undefined) throw new Error(`species[${index}].${field} is required`);
  };
  req('name'); req('count'); req('color'); req('radius');
  req('initialSpeed'); req('maxSpeed'); req('energy'); req('lifecycle'); req('diet');

  // Type checks + range clamping to prevent NaN/Infinity/zero-division crashes
  sp.count = clampNum(sp.count, 0, 10000, 1, index, 'count');
  sp.radius = clampNum(sp.radius, 0.5, 50, 3, index, 'radius');
  sp.initialSpeed = clampNum(sp.initialSpeed, 0, 500, 50, index, 'initialSpeed');
  sp.maxSpeed = clampNum(sp.maxSpeed, 1, 1000, 100, index, 'maxSpeed');

  // Validate nested energy config
  if (typeof sp.energy === 'object' && sp.energy !== null) {
    const e = sp.energy as Record<string, unknown>;
    e.maxEnergy = clampNum(e.maxEnergy, 1, 1e6, 100, index, 'energy.maxEnergy');
    e.initialEnergy = clampNum(e.initialEnergy, 0, e.maxEnergy as number, 50, index, 'energy.initialEnergy');
    e.reproductionCost = clampNum(e.reproductionCost, 0, e.maxEnergy as number, 20, index, 'energy.reproductionCost');
    e.movementCostPerSec = clampNum(e.movementCostPerSec, 0, 1000, 2, index, 'energy.movementCostPerSec');
    e.idleDrainPerSec = clampNum(e.idleDrainPerSec, 0, 1000, 1, index, 'energy.idleDrainPerSec');
  }

  // Validate nested lifecycle config
  if (typeof sp.lifecycle === 'object' && sp.lifecycle !== null) {
    const lc = sp.lifecycle as Record<string, unknown>;
    lc.maxAgeSec = clampNum(lc.maxAgeSec, 1, 1e6, 60, index, 'lifecycle.maxAgeSec');
    lc.starvationDamagePerSec = clampNum(lc.starvationDamagePerSec, 0, 1000, 5, index, 'lifecycle.starvationDamagePerSec');
    lc.reproductionCooldownSec = clampNum(lc.reproductionCooldownSec, 0, 600, 5, index, 'lifecycle.reproductionCooldownSec');
  }
}

/**
 * Clamp a numeric value to a safe range.
 * Returns `fallback` if the value is NaN, Infinity, or not a number.
 */
function clampNum(val: unknown, min: number, max: number, fallback: number, speciesIdx: number, field: string): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    console.warn(`[Critterium] species[${speciesIdx}].${field} = ${val}, using fallback ${fallback}`);
    return fallback;
  }
  if (val < min) return min;
  if (val > max) return max;
  return val;
}

/** Validate a snapshot object. */
function validateSnapshot(snap: Record<string, unknown>): void {
  const arrFields = ['x', 'y', 'vx', 'vy', 'type', 'energy', 'alive'];
  for (const field of arrFields) {
    if (!Array.isArray(snap[field])) {
      throw new Error(`snapshot.${field} must be an array`);
    }
  }
  if (typeof snap.seed !== 'number') throw new Error('snapshot.seed must be a number');
  if (typeof snap.simTime !== 'number') throw new Error('snapshot.simTime must be a number');
}

// ─── Apply Config ──────────────────────────────────────────────

/** Result of applying a config. */
export interface AppliedConfig {
  eco: EcosystemWorld;
  matrix: InteractionMatrix;
  species: SpeciesConfig[];
}

/**
 * Rebuild an EcosystemWorld and InteractionMatrix from a CritteriumConfig.
 * If the config contains a snapshot, the exact state (positions, velocities, etc.)
 * will be restored.
 *
 * @param config  The validated CritteriumConfig to apply
 * @returns       The rebuilt eco system and matrix
 */
export function applyConfig(config: CritteriumConfig): AppliedConfig {
  // Build EcosystemConfig
  const species = config.species.map(jsonToSpecies);

  // Build interaction rules from the ecosystem config format
  const interactionRules = buildInteractionRulesFromMatrix(config.interactionMatrix);

  const ecoConfig: EcosystemConfig = {
    width: config.simulation.width,
    height: config.simulation.height,
    boundaryMode: config.simulation.boundaryMode,
    seed: config.simulation.seed,
    populationCap: config.simulation.populationCap,
    species,
    interactionRules,
  };

  // Create the EcosystemWorld
  const eco = new EcosystemWorld(ecoConfig);

  // If snapshot present, restore exact state
  if (config.snapshot) {
    restoreSnapshot(eco, config.snapshot);
  }

  // Build InteractionMatrix (for physics)
  const matrix = buildInteractionMatrix(config.interactionMatrix);

  return { eco, matrix, species };
}

/** Build an InteractionMatrix from the JSON 2D array. */
function buildInteractionMatrix(json: (JsonInteractionEntry | null)[][]): InteractionMatrix {
  const numTypes = json.length;
  const matrix = new InteractionMatrix(numTypes);

  for (let i = 0; i < numTypes; i++) {
    for (let j = 0; j < json[i].length; j++) {
      const entry = json[i][j];
      if (entry) {
        matrix.set(i, j, {
          strength: entry.strength,
          radius: entry.radius,
          falloff: entry.falloff,
        });
      }
    }
  }

  return matrix;
}

/** Build ecosystem interaction rules from the JSON matrix. */
function buildInteractionRulesFromMatrix(
  json: (JsonInteractionEntry | null)[][],
): (import('./ecosystem.js').InteractionRule | null)[][] {
  return json.map((row) =>
    row.map((entry) => {
      if (!entry) return null;
      // For the ecosystem config, we create a simple enabledForces set
      const isAttract = entry.strength >= 0;
      return {
        enabledForces: new Set([isAttract ? 'attract' : 'repel']),
        radius: entry.radius,
        strength: entry.strength,
        falloff: entry.falloff as 'linear' | 'inverse' | 'constant',
      };
    }),
  );
}

/**
 * Restore exact particle positions/velocities from a snapshot.
 * Modifies the EcosystemWorld in-place.
 */
function restoreSnapshot(eco: EcosystemWorld, snapshot: JsonSnapshot): void {
  const hwm = snapshot.x.length;

  // Ensure world arrays are large enough
  (eco as { world: { count: number } }).world.count = Math.max(eco.world.count, hwm);
  const w = eco.world;

  // We may need to grow arrays
  if (hwm > w.x.length) {
    const newX = new Float32Array(hwm);
    const newY = new Float32Array(hwm);
    const newVx = new Float32Array(hwm);
    const newVy = new Float32Array(hwm);
    const newType = new Uint8Array(hwm);
    newX.set(w.x);
    newY.set(w.y);
    newVx.set(w.vx);
    newVy.set(w.vy);
    newType.set(w.type);
    (w as { x: Float32Array }).x = newX;
    (w as { y: Float32Array }).y = newY;
    (w as { vx: Float32Array }).vx = newVx;
    (w as { vy: Float32Array }).vy = newVy;
    (w as { type: Uint8Array }).type = newType;
    (w as { count: number }).count = hwm;
  }

  // Restore world state
  for (let i = 0; i < hwm; i++) {
    w.x[i] = snapshot.x[i];
    w.y[i] = snapshot.y[i];
    w.vx[i] = snapshot.vx[i];
    w.vy[i] = snapshot.vy[i];
    w.type[i] = snapshot.type[i];
  }

  // Restore simTime and seed
  (w as { simTime: number }).simTime = snapshot.simTime;
  (w as { seed: number }).seed = snapshot.seed;

  // Restore ecosystem state
  const ecoState = eco.eco;
  if (hwm > ecoState.capacity) {
    // Need to grow — but EcosystemState fields are readonly, cast
    const newEco = new (ecoState.constructor as new (cap: number) => typeof ecoState)(hwm);
    // Copy existing data
    (newEco as { energy: Float32Array }).energy.set(ecoState.energy);
    (newEco as { age: Float32Array }).age.set(ecoState.age);
    (newEco as { health: Float32Array }).health.set(ecoState.health);
    (newEco as { alive: Uint8Array }).alive.set(ecoState.alive);
    (newEco as { reproductionCooldown: Float32Array }).reproductionCooldown.set(ecoState.reproductionCooldown);
    (eco as { eco: typeof ecoState }).eco = newEco;
  }

  const es = eco.eco;
  for (let i = 0; i < hwm; i++) {
    es.energy[i] = snapshot.energy[i];
    es.alive[i] = snapshot.alive[i];
  }

  // Recount alive
  let aliveCount = 0;
  for (let i = 0; i < hwm; i++) {
    if (es.alive[i] === ALIVE) aliveCount++;
  }
  (eco as unknown as { _aliveCount: number })._aliveCount = aliveCount;
  (eco as unknown as { _highWaterMark: number })._highWaterMark = hwm;
}
