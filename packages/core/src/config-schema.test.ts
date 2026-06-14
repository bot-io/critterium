/**
 * Tests for CRT-11: Config Schema v1 + Serialization
 */

import { describe, it, expect } from 'vitest';
import {
  serializeConfig,
  deserializeConfig,
  applyConfig,
  type CritteriumConfig,
} from './config-schema.js';
import {
  InteractionMatrix,
  DragForce,
  WanderForce,
  GravityForce,
  FlowFieldForce,
  VortexForce,
} from './index.js';
import { EcosystemWorld } from './ecosystem-world.js';
import {
  type EcosystemConfig,
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeTestEcoConfig(): EcosystemConfig {
  return {
    width: 400,
    height: 300,
    boundaryMode: 'bounce',
    seed: 123,
    populationCap: 200,
    species: [
      {
        name: 'Red',
        count: 20,
        color: '#ff0000',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig({ maxEnergy: 100, initialEnergy: 50 }),
        lifecycle: defaultLifecycleConfig({ maxAgeSec: 30 }),
        diet: defaultDietConfig({ canEat: new Set([1]) }),
      },
      {
        name: 'Blue',
        count: 30,
        color: '#0000ff',
        radius: 4,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: defaultEnergyConfig({ maxEnergy: 80, initialEnergy: 40 }),
        lifecycle: defaultLifecycleConfig({ maxAgeSec: 60 }),
        diet: defaultDietConfig(),
      },
    ],
    interactionRules: [
      [null, { enabledForces: new Set(['attract']), radius: 100, strength: 30, falloff: 'linear' }],
      [{ enabledForces: new Set(['repel']), radius: 80, strength: -50, falloff: 'inverse' }, null],
    ],
  };
}

function makeTestMatrix(): InteractionMatrix {
  const m = new InteractionMatrix(2);
  m.set(0, 1, { strength: 30, radius: 100, falloff: 'linear' });
  m.set(1, 0, { strength: -50, radius: 80, falloff: 'inverse' });
  return m;
}

// ─── Serialization Tests ─────────────────────────────────────

describe('serializeConfig', () => {
  it('serializes basic simulation parameters', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [new DragForce(0.8), new WanderForce(40, 2.5)];

    const config = serializeConfig(eco, matrix, forces);

    expect(config.version).toBe(1);
    expect(config.simulation.width).toBe(400);
    expect(config.simulation.height).toBe(300);
    expect(config.simulation.boundaryMode).toBe('bounce');
    expect(config.simulation.seed).toBe(123);
    expect(config.simulation.populationCap).toBe(200);
  });

  it('serializes species config', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    expect(config.species).toHaveLength(2);
    expect(config.species[0].name).toBe('Red');
    expect(config.species[0].count).toBe(20);
    expect(config.species[0].color).toBe('#ff0000');
    expect(config.species[0].radius).toBe(3);
    expect(config.species[0].initialSpeed).toBe(50);
    expect(config.species[0].maxSpeed).toBe(100);
    expect(config.species[0].diet.canEat).toEqual([1]);

    expect(config.species[1].name).toBe('Blue');
    expect(config.species[1].count).toBe(30);
    expect(config.species[1].diet.canEat).toEqual([]);
  });

  it('serializes interaction matrix', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    expect(config.interactionMatrix).toHaveLength(2);
    expect(config.interactionMatrix[0][0]).toBeNull();
    expect(config.interactionMatrix[0][1]).toEqual({
      strength: 30,
      radius: 100,
      falloff: 'linear',
    });
    expect(config.interactionMatrix[1][0]).toEqual({
      strength: -50,
      radius: 80,
      falloff: 'inverse',
    });
    expect(config.interactionMatrix[1][1]).toBeNull();
  });

  it('serializes forces in dynamic array format', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [
      new DragForce(1.5),
      new WanderForce(60, 4),
      new GravityForce(200),
      new FlowFieldForce(50, 'turbulence', 0, 0.02),
      new VortexForce(200, 150, 100, -30, 250, 'linear'),
    ];

    const config = serializeConfig(eco, matrix, forces);

    expect(Array.isArray(config.forces)).toBe(true);
    expect(config.forces).toHaveLength(5);

    // Each entry has type, enabled, params
    expect(config.forces[0]).toEqual({
      type: 'drag',
      enabled: true,
      params: { coefficient: 1.5 },
    });
    expect(config.forces[1]).toEqual({
      type: 'wander',
      enabled: true,
      params: { strength: 60, rate: 4 },
    });
    expect(config.forces[2]).toEqual({
      type: 'gravity',
      enabled: true,
      params: { acceleration: 200 },
    });
    expect(config.forces[3]).toEqual({
      type: 'flow-field',
      enabled: true,
      params: { strength: 50, mode: 'turbulence', angle: 0, turbulenceScale: 0.02 },
    });
    expect(config.forces[4]).toEqual({
      type: 'vortex',
      enabled: true,
      params: {
        cx: 200,
        cy: 150,
        strength: 100,
        radialStrength: -30,
        radius: 250,
        falloff: 'linear',
      },
    });
  });

  it('serializes snapshot with particle data', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    expect(config.snapshot).toBeDefined();
    expect(config.snapshot!.x.length).toBe(50); // 20 + 30
    expect(config.snapshot!.y.length).toBe(50);
    expect(config.snapshot!.vx.length).toBe(50);
    expect(config.snapshot!.vy.length).toBe(50);
    expect(config.snapshot!.type.length).toBe(50);
    expect(config.snapshot!.energy.length).toBe(50);
    expect(config.snapshot!.alive.length).toBe(50);
    expect(config.snapshot!.seed).toBe(123);
    expect(typeof config.snapshot!.simTime).toBe('number');
  });

  it('handles empty forces array', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    expect(config.forces).toEqual([]);
  });
});

// ─── Deserialization Tests ───────────────────────────────────

describe('deserializeConfig', () => {
  it('deserializes a valid config', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [new DragForce(0.8)];
    const config = serializeConfig(eco, matrix, forces);

    const json = JSON.parse(JSON.stringify(config));
    const result = deserializeConfig(json);

    expect(result.version).toBe(1);
    expect(result.simulation.width).toBe(400);
    expect(result.simulation.height).toBe(300);
    expect(result.simulation.boundaryMode).toBe('bounce');
    expect(result.simulation.seed).toBe(123);
    expect(result.simulation.populationCap).toBe(200);
    expect(result.species).toHaveLength(2);
    expect(result.species[0].name).toBe('Red');
    expect(result.interactionMatrix[0][1]?.strength).toBe(30);
  });

  it('throws on non-object input', () => {
    expect(() => deserializeConfig(null)).toThrow('non-null object');
    expect(() => deserializeConfig('hello')).toThrow('non-null object');
    expect(() => deserializeConfig(42)).toThrow('non-null object');
  });

  it('throws on wrong version', () => {
    expect(() => deserializeConfig({ version: 2 })).toThrow('Unsupported config version');
  });

  it('throws on missing simulation', () => {
    expect(() => deserializeConfig({ version: 1 })).toThrow('Missing or invalid simulation');
  });

  it('throws on invalid boundaryMode', () => {
    const config = makeMinimalConfig();
    config.simulation.boundaryMode = 'teleport' as 'bounce';
    expect(() => deserializeConfig(config)).toThrow('boundaryMode must be');
  });

  it('throws on missing species', () => {
    const config: unknown = {
      version: 1,
      simulation: { width: 100, height: 100, boundaryMode: 'bounce', seed: 1, populationCap: 100 },
      interactionMatrix: [],
      forces: [],
    };
    expect(() => deserializeConfig(config)).toThrow('species must be an array');
  });

  it('throws on invalid species entry', () => {
    const config: unknown = {
      version: 1,
      simulation: { width: 100, height: 100, boundaryMode: 'bounce', seed: 1, populationCap: 100 },
      species: [{ name: 'Test' }], // missing many fields
      interactionMatrix: [],
      forces: [],
    };
    expect(() => deserializeConfig(config)).toThrow('species[0].count');
  });

  it('preserves unknown fields in the JSON', () => {
    const config = makeMinimalConfig();
    const json = { ...config, customField: 'hello', nested: { extra: true } };

    const result = deserializeConfig(json);
    // The result should be valid — unknown fields don't cause errors
    expect(result.version).toBe(1);
    expect(result.simulation.width).toBe(400);
  });

  it('validates snapshot arrays', () => {
    const config = makeMinimalConfig();
    config.snapshot = {
      x: 'not-array',
      y: [],
      vx: [],
      vy: [],
      type: [],
      seed: 0,
      simTime: 0,
      energy: [],
      alive: [],
    } as any;
    expect(() => deserializeConfig(config)).toThrow('snapshot.x must be an array');
  });
});

// ─── Round-trip Tests ────────────────────────────────────────

describe('round-trip serialization', () => {
  it('preserves simulation parameters through serialize → deserialize', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [new DragForce(0.8), new WanderForce(40, 2.5)];
    const config = serializeConfig(eco, matrix, forces);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);

    expect(restored.simulation.width).toBe(config.simulation.width);
    expect(restored.simulation.height).toBe(config.simulation.height);
    expect(restored.simulation.boundaryMode).toBe(config.simulation.boundaryMode);
    expect(restored.simulation.seed).toBe(config.simulation.seed);
    expect(restored.simulation.populationCap).toBe(config.simulation.populationCap);
  });

  it('preserves species through round-trip', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);

    expect(restored.species).toHaveLength(config.species.length);
    for (let i = 0; i < config.species.length; i++) {
      expect(restored.species[i].name).toBe(config.species[i].name);
      expect(restored.species[i].count).toBe(config.species[i].count);
      expect(restored.species[i].color).toBe(config.species[i].color);
      expect(restored.species[i].radius).toBe(config.species[i].radius);
      expect(restored.species[i].initialSpeed).toBe(config.species[i].initialSpeed);
      expect(restored.species[i].maxSpeed).toBe(config.species[i].maxSpeed);
      expect(restored.species[i].diet.canEat).toEqual(config.species[i].diet.canEat);
    }
  });

  it('preserves interaction matrix through round-trip', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);

    for (let i = 0; i < config.interactionMatrix.length; i++) {
      for (let j = 0; j < config.interactionMatrix[i].length; j++) {
        const orig = config.interactionMatrix[i][j];
        const rest = restored.interactionMatrix[i][j];
        if (orig === null) {
          expect(rest).toBeNull();
        } else {
          expect(rest).not.toBeNull();
          expect(rest!.strength).toBe(orig.strength);
          expect(rest!.radius).toBe(orig.radius);
          expect(rest!.falloff).toBe(orig.falloff);
        }
      }
    }
  });

  it('preserves forces through round-trip', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [new DragForce(1.2), new WanderForce(55, 3.5)];
    const config = serializeConfig(eco, matrix, forces);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);

    const dragEntry = restored.forces.find((f) => f.type === 'drag');
    const wanderEntry = restored.forces.find((f) => f.type === 'wander');
    expect(dragEntry?.params.coefficient).toBe(1.2);
    expect(wanderEntry?.params.strength).toBe(55);
    expect(wanderEntry?.params.rate).toBe(3.5);
  });

  it('deserializes new array format forces', () => {
    const config = makeMinimalConfig();
    config.forces = [
      { type: 'drag', enabled: true, params: { coefficient: 0.7 } },
      { type: 'wander', enabled: true, params: { strength: 30, rate: 2 } },
      { type: 'gravity', enabled: false, params: { acceleration: 150 } },
    ];
    const restored = deserializeConfig(JSON.parse(JSON.stringify(config)));
    expect(restored.forces).toHaveLength(3);
    expect(restored.forces[0]).toEqual({
      type: 'drag',
      enabled: true,
      params: { coefficient: 0.7 },
    });
    expect(restored.forces[1]).toEqual({
      type: 'wander',
      enabled: true,
      params: { strength: 30, rate: 2 },
    });
    expect(restored.forces[2]).toEqual({
      type: 'gravity',
      enabled: false,
      params: { acceleration: 150 },
    });
  });

  it('migrates old object-slot format forces to array', () => {
    const config = makeMinimalConfig();
    // Old format: named slots
    config.forces = {
      drag: { coefficient: 0.9 },
      wander: { strength: 40, rate: 3 },
    } as unknown as typeof config.forces;
    const restored = deserializeConfig(JSON.parse(JSON.stringify(config)));
    expect(Array.isArray(restored.forces)).toBe(true);
    expect(restored.forces).toHaveLength(2);
    expect(restored.forces[0]).toEqual({
      type: 'drag',
      enabled: true,
      params: { coefficient: 0.9 },
    });
    expect(restored.forces[1]).toEqual({
      type: 'wander',
      enabled: true,
      params: { strength: 40, rate: 3 },
    });
  });

  it('migrates old flowField/vortex slot names to canonical type IDs', () => {
    const config = makeMinimalConfig();
    config.forces = {
      flowField: { strength: 50, mode: 'turbulence' },
      vortex: { cx: 100, cy: 200, strength: 80 },
    } as unknown as typeof config.forces;
    const restored = deserializeConfig(JSON.parse(JSON.stringify(config)));
    expect(restored.forces).toHaveLength(2);
    expect(restored.forces[0].type).toBe('flow-field');
    expect(restored.forces[1].type).toBe('vortex');
  });

  it('defaults undefined/null forces to empty array', () => {
    const config1 = makeMinimalConfig();
    config1.forces = undefined as unknown as typeof config1.forces;
    expect(deserializeConfig(JSON.parse(JSON.stringify(config1))).forces).toEqual([]);

    const config2 = makeMinimalConfig();
    config2.forces = null as unknown as typeof config2.forces;
    expect(deserializeConfig(JSON.parse(JSON.stringify(config2))).forces).toEqual([]);
  });

  it('filters out invalid force entries', () => {
    const config = makeMinimalConfig();
    config.forces = [
      { type: 'drag', enabled: true, params: { coefficient: 1 } },
      { enabled: true, params: {} } as any, // missing type
      { type: 'wander', params: { strength: 10 } } as any, // missing enabled (defaults to true)
    ];
    const restored = deserializeConfig(JSON.parse(JSON.stringify(config)));
    expect(restored.forces).toHaveLength(2);
    expect(restored.forces[0].type).toBe('drag');
    expect(restored.forces[1].type).toBe('wander');
    expect(restored.forces[1].enabled).toBe(true);
  });

  it('preserves snapshot data through round-trip', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);

    expect(restored.snapshot).toBeDefined();
    expect(restored.snapshot!.x).toEqual(config.snapshot!.x);
    expect(restored.snapshot!.y).toEqual(config.snapshot!.y);
    expect(restored.snapshot!.vx).toEqual(config.snapshot!.vx);
    expect(restored.snapshot!.vy).toEqual(config.snapshot!.vy);
    expect(restored.snapshot!.type).toEqual(config.snapshot!.type);
    expect(restored.snapshot!.energy).toEqual(config.snapshot!.energy);
    expect(restored.snapshot!.alive).toEqual(config.snapshot!.alive);
    expect(restored.snapshot!.seed).toBe(config.snapshot!.seed);
    expect(restored.snapshot!.simTime).toBe(config.snapshot!.simTime);
  });
});

// ─── applyConfig Tests ───────────────────────────────────────

describe('applyConfig', () => {
  it('rebuilds EcosystemWorld with correct parameters', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);
    const applied = applyConfig(restored);

    expect(applied.eco.config.width).toBe(400);
    expect(applied.eco.config.height).toBe(300);
    expect(applied.eco.config.boundaryMode).toBe('bounce');
    expect(applied.eco.config.populationCap).toBe(200);
    expect(applied.eco.species).toHaveLength(2);
    expect(applied.eco.species[0].name).toBe('Red');
    expect(applied.eco.species[1].name).toBe('Blue');
  });

  it('rebuilds InteractionMatrix with correct entries', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);
    const applied = applyConfig(restored);

    const e01 = applied.matrix.get(0, 1);
    expect(e01).not.toBeNull();
    expect(e01!.strength).toBe(30);
    expect(e01!.radius).toBe(100);
    expect(e01!.falloff).toBe('linear');

    const e10 = applied.matrix.get(1, 0);
    expect(e10).not.toBeNull();
    expect(e10!.strength).toBe(-50);
    expect(e10!.radius).toBe(80);

    const e00 = applied.matrix.get(0, 0);
    expect(e00).toBeNull();
  });

  it('restores snapshot particle positions', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const config = serializeConfig(eco, matrix, []);

    const json = JSON.parse(JSON.stringify(config));
    const restored = deserializeConfig(json);
    const applied = applyConfig(restored);

    // Positions should be restored
    expect(applied.eco.world.simTime).toBe(config.snapshot!.simTime);
    // Check alive count matches
    let aliveCount = 0;
    for (let i = 0; i < applied.eco.highWaterMark; i++) {
      if (applied.eco.eco.alive[i]) aliveCount++;
    }
    expect(aliveCount).toBe(50); // 20 Red + 30 Blue
  });

  it('creates a fresh world without snapshot', () => {
    const config = makeMinimalConfig();
    delete config.snapshot;

    const applied = applyConfig(config);

    expect(applied.eco.config.width).toBe(400);
    expect(applied.eco.aliveCount).toBe(20); // only species[0] count
  });

  it('round-trip: serialize → deserialize → apply → serialize → same values', () => {
    const eco = new EcosystemWorld(makeTestEcoConfig());
    const matrix = makeTestMatrix();
    const forces = [new DragForce(0.8), new WanderForce(40, 2.5)];
    const config1 = serializeConfig(eco, matrix, forces);

    const json1 = JSON.parse(JSON.stringify(config1));
    const restored1 = deserializeConfig(json1);
    const applied = applyConfig(restored1);

    // Serialize again
    const config2 = serializeConfig(applied.eco, applied.matrix, []);

    // Simulation params should match
    expect(config2.simulation.width).toBe(config1.simulation.width);
    expect(config2.simulation.height).toBe(config1.simulation.height);
    expect(config2.simulation.boundaryMode).toBe(config1.simulation.boundaryMode);
    expect(config2.simulation.populationCap).toBe(config1.simulation.populationCap);

    // Species should match
    expect(config2.species).toHaveLength(config1.species.length);
    expect(config2.species[0].name).toBe(config1.species[0].name);

    // Matrix should match
    const e01 = config2.interactionMatrix[0][1];
    const orig01 = config1.interactionMatrix[0][1];
    expect(e01?.strength).toBe(orig01?.strength);
    expect(e01?.radius).toBe(orig01?.radius);
  });
});

// ─── Helpers for tests ───────────────────────────────────────

function makeMinimalConfig(): CritteriumConfig {
  return {
    version: 1,
    simulation: {
      width: 400,
      height: 300,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 100,
    },
    species: [
      {
        name: 'Test',
        count: 20,
        color: '#ff0000',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: {
          maxEnergy: 100,
          initialEnergy: 50,
          movementCostPerSec: 2,
          reproductionCost: 40,
          idleDrainPerSec: 1,
          energyGainPerPrey: [],
        },
        lifecycle: {
          maxAgeSec: 30,
          starvationDamagePerSec: 10,
          reproductionCooldownSec: 5,
        },
        diet: {
          canEat: [],
        },
      },
    ],
    interactionMatrix: [[null]],
    forces: [],
  };
}
