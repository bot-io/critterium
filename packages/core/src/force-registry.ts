/**
 * Force Registry & Factory
 *
 * Maps force type IDs to factory functions, enabling dynamic force creation.
 * The registry is the single source of truth for available force types,
 * their metadata (display name, description, default params, param schema),
 * and their constructors.
 *
 * This allows forces to be added/removed at runtime — just like species —
 * without hardcoding force types in main.ts.
 */

import {
  DragForce,
  GravityForce,
  WanderForce,
  FlowFieldForce,
  VortexForce,
  AlignmentForce,
  BoidsForce,
  type FalloffType,
  type Force,
} from './index.js';
import { PointerForce } from './pointer-force.js';

// ─── Param Schema ─────────────────────────────────────────────

export interface ParamSchema {
  key: string;
  label: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  options?: string[]; // for 'select' type
}

// ─── Force Type Descriptor ────────────────────────────────────

export interface ForceTypeDescriptor {
  /** Unique type identifier (e.g. 'drag', 'vortex'). */
  type: string;
  /** Human-readable name for UI. */
  displayName: string;
  /** Short description of what the force does. */
  description: string;
  /** Default parameter values (used when creating a new instance). */
  defaultParams: Record<string, unknown>;
  /** Parameter schema for auto-generating UI sliders/dropdowns. */
  paramSchema: ParamSchema[];
}

// ─── Factory Function Type ────────────────────────────────────

export type ForceFactory = (params: Record<string, unknown>) => Force;

// ─── Registry ────────────────────────────────────────────────

const registry = new Map<string, { descriptor: ForceTypeDescriptor; factory: ForceFactory }>();

/**
 * Register a force type.
 * @param descriptor metadata for UI and serialization
 * @param factory function that creates a Force from params
 */
export function registerForceType(descriptor: ForceTypeDescriptor, factory: ForceFactory): void {
  registry.set(descriptor.type, { descriptor, factory });
}

/**
 * Create a force instance from a type ID and params.
 * Falls back to defaultParams for missing keys.
 */
export function createForce(type: string, params?: Record<string, unknown>): Force {
  const entry = registry.get(type);
  if (!entry) {
    throw new Error(
      `Unknown force type: "${type}". Registered: ${Array.from(registry.keys()).join(', ')}`,
    );
  }
  const merged = { ...entry.descriptor.defaultParams, ...params };
  return entry.factory(merged);
}

/**
 * Get the descriptor for a force type (for UI generation).
 */
export function getForceDescriptor(type: string): ForceTypeDescriptor | undefined {
  return registry.get(type)?.descriptor;
}

/**
 * List all registered force type descriptors.
 */
export function listForceTypes(): ForceTypeDescriptor[] {
  return Array.from(registry.values()).map((e) => e.descriptor);
}

/**
 * Get all registered type IDs.
 */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}

// ─── Built-in Force Types ────────────────────────────────────

/**
 * Register all built-in force types.
 * Called once at module load (via auto-register below).
 */
function registerBuiltins(): void {
  // Drag
  registerForceType(
    {
      type: 'drag',
      displayName: 'Drag',
      description: 'Linear velocity damping. Particles slow down over time.',
      defaultParams: { coefficient: 0.8 },
      paramSchema: [
        {
          key: 'coefficient',
          label: 'Coefficient',
          type: 'number',
          min: 0,
          max: 10,
          step: 0.1,
          default: 0.8,
        },
      ],
    },
    (p) => new DragForce(p.coefficient as number),
  );

  // Wander
  registerForceType(
    {
      type: 'wander',
      displayName: 'Wander',
      description: 'Per-particle smooth random steering for organic motion.',
      defaultParams: { strength: 40, rate: 2.5 },
      paramSchema: [
        {
          key: 'strength',
          label: 'Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 40,
        },
        { key: 'rate', label: 'Rate', type: 'number', min: 0, max: 20, step: 0.1, default: 2.5 },
      ],
    },
    (p) => new WanderForce(p.strength as number, p.rate as number),
  );

  // Gravity
  registerForceType(
    {
      type: 'gravity',
      displayName: 'Gravity',
      description: 'Constant downward acceleration (like real gravity).',
      defaultParams: { acceleration: 200 },
      paramSchema: [
        {
          key: 'acceleration',
          label: 'Acceleration',
          type: 'number',
          min: -1000,
          max: 1000,
          step: 10,
          default: 200,
        },
      ],
    },
    (p) => new GravityForce(p.acceleration as number),
  );

  // Flow Field
  registerForceType(
    {
      type: 'flow-field',
      displayName: 'Flow Field',
      description: 'Spatially varying directional force (currents, wind).',
      defaultParams: { strength: 50, mode: 'uniform', angle: 0, turbulenceScale: 0.01 },
      paramSchema: [
        {
          key: 'strength',
          label: 'Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 50,
        },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          default: 'uniform',
          options: ['uniform', 'turbulence'],
        },
        {
          key: 'angle',
          label: 'Angle (rad)',
          type: 'number',
          min: 0,
          max: 6.28,
          step: 0.01,
          default: 0,
        },
        {
          key: 'turbulenceScale',
          label: 'Turb Scale',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.001,
          default: 0.01,
        },
      ],
    },
    (p) =>
      new FlowFieldForce(
        p.strength as number,
        p.mode as string,
        p.angle as number,
        p.turbulenceScale as number,
      ),
  );

  // Vortex
  registerForceType(
    {
      type: 'vortex',
      displayName: 'Vortex',
      description: 'Swirl force around a center point. Creates orbiting/spiral patterns.',
      defaultParams: {
        cx: 400,
        cy: 300,
        strength: 150,
        radialStrength: 0,
        radius: 300,
        falloff: 'linear',
      },
      paramSchema: [
        { key: 'cx', label: 'Center X', type: 'number', min: 0, max: 2000, step: 1, default: 400 },
        { key: 'cy', label: 'Center Y', type: 'number', min: 0, max: 2000, step: 1, default: 300 },
        {
          key: 'strength',
          label: 'Swirl',
          type: 'number',
          min: -500,
          max: 500,
          step: 1,
          default: 150,
        },
        {
          key: 'radialStrength',
          label: 'Radial',
          type: 'number',
          min: -300,
          max: 300,
          step: 1,
          default: 0,
        },
        {
          key: 'radius',
          label: 'Radius',
          type: 'number',
          min: 10,
          max: 2000,
          step: 1,
          default: 300,
        },
        {
          key: 'falloff',
          label: 'Falloff',
          type: 'select',
          default: 'linear',
          options: ['linear', 'inverse', 'constant'],
        },
      ],
    },
    (p) =>
      new VortexForce(
        p.cx as number,
        p.cy as number,
        p.strength as number,
        p.radialStrength as number,
        p.radius as number,
        p.falloff as FalloffType,
      ),
  );

  // Pointer
  registerForceType(
    {
      type: 'pointer',
      displayName: 'Pointer',
      description: 'Attract or repel particles toward/from the touch/mouse position.',
      defaultParams: { strength: 200, radius: 150, falloff: 'linear' },
      paramSchema: [
        {
          key: 'strength',
          label: 'Strength',
          type: 'number',
          min: -1000,
          max: 1000,
          step: 1,
          default: 200,
        },
        {
          key: 'radius',
          label: 'Radius',
          type: 'number',
          min: 10,
          max: 2000,
          step: 1,
          default: 150,
        },
        {
          key: 'falloff',
          label: 'Falloff',
          type: 'select',
          default: 'linear',
          options: ['linear', 'inverse', 'constant'],
        },
      ],
    },
    (p) => new PointerForce(p.strength as number, p.radius as number, p.falloff as FalloffType),
  );

  // Alignment (flocking)
  registerForceType(
    {
      type: 'alignment',
      displayName: 'Alignment',
      description: 'Flocking: steer toward the average heading of same-type neighbors.',
      defaultParams: { radius: 60, strength: 40, crossType: false },
      paramSchema: [
        { key: 'radius', label: 'Radius', type: 'number', min: 10, max: 300, step: 1, default: 60 },
        {
          key: 'strength',
          label: 'Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 40,
        },
        {
          key: 'crossType',
          label: 'Cross-Type',
          type: 'select',
          default: 'false',
          options: ['false', 'true'],
        },
      ],
    },
    (p) =>
      new AlignmentForce(
        p.radius as number,
        p.strength as number,
        p.crossType === true || p.crossType === 'true',
      ),
  );

  // Boids (combined flocking: separation + alignment + cohesion)
  registerForceType(
    {
      type: 'boids',
      displayName: 'Boids Flocking',
      description:
        'Reynolds flocking: separation (avoid crowding) + alignment (match heading) + cohesion (steer to center).',
      defaultParams: {
        separationRadius: 25,
        separationStrength: 50,
        alignmentRadius: 60,
        alignmentStrength: 30,
        cohesionRadius: 60,
        cohesionStrength: 20,
        crossType: false,
      },
      paramSchema: [
        {
          key: 'separationRadius',
          label: 'Sep Radius',
          type: 'number',
          min: 5,
          max: 200,
          step: 1,
          default: 25,
        },
        {
          key: 'separationStrength',
          label: 'Sep Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 50,
        },
        {
          key: 'alignmentRadius',
          label: 'Align Radius',
          type: 'number',
          min: 10,
          max: 300,
          step: 1,
          default: 60,
        },
        {
          key: 'alignmentStrength',
          label: 'Align Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 30,
        },
        {
          key: 'cohesionRadius',
          label: 'Cohesion Radius',
          type: 'number',
          min: 10,
          max: 300,
          step: 1,
          default: 60,
        },
        {
          key: 'cohesionStrength',
          label: 'Cohesion Strength',
          type: 'number',
          min: 0,
          max: 500,
          step: 1,
          default: 20,
        },
        {
          key: 'crossType',
          label: 'Cross-Type',
          type: 'select',
          default: 'false',
          options: ['false', 'true'],
        },
      ],
    },
    (p) =>
      new BoidsForce(
        p.separationRadius as number,
        p.separationStrength as number,
        p.alignmentRadius as number,
        p.alignmentStrength as number,
        p.cohesionRadius as number,
        p.cohesionStrength as number,
        p.crossType === true || p.crossType === 'true',
      ),
  );
}

// Auto-register on module load
registerBuiltins();
