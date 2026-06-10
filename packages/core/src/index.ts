/**
 * Critterium — Simulation Core
 *
 * Pure TypeScript, deterministic, zero dependencies.
 * Typed-array particle storage with spatial hash grid,
 * fixed-timestep loop, and pluggable force pipeline.
 */

/** Maximum number of particle types (Uint8Array index). */
export const MAX_TYPES = 16;

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
