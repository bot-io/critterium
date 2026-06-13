import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS, BUILTIN_PRESET_NAMES, getBuiltinPreset } from './presets.js';
import type { EcosystemPreset } from './presets.js';

const EXPECTED_PRESET_NAMES = [
  'Classic',
  'Plankton Bloom',
  'Swarm Intelligence',
  'Predator Arena',
  'Tiny Pond',
  'Zen Garden',
  'Rock Paper Scissors',
  'Grasslands',
];

describe('presets', () => {
  it('exports exactly 8 built-in presets', () => {
    expect(BUILTIN_PRESETS).toHaveLength(8);
  });

  it('BUILTIN_PRESET_NAMES matches expected list', () => {
    expect(BUILTIN_PRESET_NAMES).toEqual(EXPECTED_PRESET_NAMES);
  });

  it('each preset has a non-empty name and description', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it('each preset has version === 1', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.config.version).toBe(1);
    }
  });

  it('each preset has valid simulation dimensions', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.config.simulation.width).toBeGreaterThan(0);
      expect(p.config.simulation.height).toBeGreaterThan(0);
      expect(Number.isFinite(p.config.simulation.width)).toBe(true);
      expect(Number.isFinite(p.config.simulation.height)).toBe(true);
    }
  });

  it('each preset has valid boundaryMode', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(['bounce', 'wrap']).toContain(p.config.simulation.boundaryMode);
    }
  });

  it('each preset has at least 1 species', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.config.species.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each species has no NaN numeric fields in energy', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const sp of p.config.species) {
        const e = sp.energy;
        expect(Number.isNaN(e.maxEnergy)).toBe(false);
        expect(Number.isNaN(e.initialEnergy)).toBe(false);
        expect(Number.isNaN(e.movementCostPerSec)).toBe(false);
        expect(Number.isNaN(e.reproductionCost)).toBe(false);
        expect(Number.isNaN(e.idleDrainPerSec)).toBe(false);
      }
    }
  });

  it('each species has no NaN numeric fields in lifecycle', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const sp of p.config.species) {
        const lc = sp.lifecycle;
        expect(Number.isNaN(lc.maxAgeSec)).toBe(false);
        expect(Number.isNaN(lc.starvationDamagePerSec)).toBe(false);
        expect(Number.isNaN(lc.reproductionCooldownSec)).toBe(false);
      }
    }
  });

  it('each species has positive radius, speed, and energy', () => {
    for (const p of BUILTIN_PRESETS) {
      for (const sp of p.config.species) {
        expect(sp.radius).toBeGreaterThan(0);
        expect(sp.initialSpeed).toBeGreaterThanOrEqual(0);
        expect(sp.maxSpeed).toBeGreaterThan(0);
        expect(sp.energy.maxEnergy).toBeGreaterThan(0);
        expect(sp.energy.initialEnergy).toBeGreaterThan(0);
      }
    }
  });

  it('interactionMatrix is N×N where N = species count', () => {
    for (const p of BUILTIN_PRESETS) {
      const n = p.config.species.length;
      expect(p.config.interactionMatrix).toHaveLength(n);
      for (const row of p.config.interactionMatrix) {
        expect(row).toHaveLength(n);
      }
    }
  });

  it('interactionMatrix entries have valid falloff values', () => {
    const validFalloffs = ['linear', 'inverse', 'constant'];
    for (const p of BUILTIN_PRESETS) {
      for (const row of p.config.interactionMatrix) {
        for (const entry of row) {
          if (entry !== null) {
            expect(validFalloffs).toContain(entry.falloff);
            expect(Number.isFinite(entry.strength)).toBe(true);
            expect(Number.isFinite(entry.radius)).toBe(true);
            expect(entry.radius).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('energyGainPerPrey array length matches species count', () => {
    for (const p of BUILTIN_PRESETS) {
      const n = p.config.species.length;
      for (const sp of p.config.species) {
        expect(sp.energy.energyGainPerPrey).toHaveLength(n);
      }
    }
  });

  it('diet.canEat indices are valid species indices', () => {
    for (const p of BUILTIN_PRESETS) {
      const n = p.config.species.length;
      for (const sp of p.config.species) {
        for (const idx of sp.diet.canEat) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(n);
        }
      }
    }
  });

  it('forces object has drag and wander', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.config.forces.drag).toBeDefined();
      expect(p.config.forces.drag.coefficient).toBeGreaterThan(0);
      expect(p.config.forces.wander).toBeDefined();
      expect(p.config.forces.wander.strength).toBeGreaterThanOrEqual(0);
      expect(p.config.forces.wander.rate).toBeGreaterThan(0);
    }
  });

  it('populationCap is positive', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.config.simulation.populationCap).toBeGreaterThan(0);
    }
  });

  it('getBuiltinPreset returns preset by name', () => {
    const classic = getBuiltinPreset('Classic');
    expect(classic).toBeDefined();
    expect(classic!.name).toBe('Classic');
  });

  it('getBuiltinPreset returns undefined for unknown name', () => {
    expect(getBuiltinPreset('Nonexistent')).toBeUndefined();
  });

  it('all preset names are unique', () => {
    const names = BUILTIN_PRESETS.map((p) => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  // ── Rock Paper Scissors — cyclic dominance tests ──────────

  it('Rock Paper Scissors has exactly 3 species', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    expect(rps).toBeDefined();
    expect(rps!.config.species).toHaveLength(3);
  });

  it('Rock Paper Scissors species names are Rock, Paper, Scissors', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const names = rps!.config.species.map((s) => s.name);
    expect(names).toEqual(['Rock', 'Paper', 'Scissors']);
  });

  it('Rock Paper Scissors has cyclic eating: 0→2, 1→0, 2→1', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const diets = rps!.config.species.map((s) => s.diet.canEat);
    // Rock eats Scissors (idx 2), Paper eats Rock (idx 0), Scissors eats Paper (idx 1)
    expect(diets[0]).toContain(2);
    expect(diets[1]).toContain(0);
    expect(diets[2]).toContain(1);
  });

  it('Rock Paper Scissors: each species gains energy only from its prey', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const species = rps!.config.species;
    // Rock gains from Scissors (idx 2), Paper gains from Rock (idx 0), Scissors gains from Paper (idx 1)
    expect(species[0].energy.energyGainPerPrey[2]).toBeGreaterThan(0);
    expect(species[1].energy.energyGainPerPrey[0]).toBeGreaterThan(0);
    expect(species[2].energy.energyGainPerPrey[1]).toBeGreaterThan(0);
    // Self-gain should be zero
    expect(species[0].energy.energyGainPerPrey[0]).toBe(0);
    expect(species[1].energy.energyGainPerPrey[1]).toBe(0);
    expect(species[2].energy.energyGainPerPrey[2]).toBe(0);
  });

  it('Rock Paper Scissors: each species chases prey (positive) and flees predator (negative)', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const m = rps!.config.interactionMatrix;
    // source = row, target = col
    // Rock (0) chases Scissors (2): positive strength
    expect(m[0][2]!.strength).toBeGreaterThan(0);
    // Rock (0) flees Paper (1): negative strength
    expect(m[0][1]!.strength).toBeLessThan(0);
    // Paper (1) chases Rock (0): positive
    expect(m[1][0]!.strength).toBeGreaterThan(0);
    // Paper (1) flees Scissors (2): negative
    expect(m[1][2]!.strength).toBeLessThan(0);
    // Scissors (2) chases Paper (1): positive
    expect(m[2][1]!.strength).toBeGreaterThan(0);
    // Scissors (2) flees Rock (0): negative
    expect(m[2][0]!.strength).toBeLessThan(0);
  });

  it('Rock Paper Scissors: self-repulsion prevents collapse', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const m = rps!.config.interactionMatrix;
    // Diagonal (self-interaction) should be repulsive (negative)
    expect(m[0][0]!.strength).toBeLessThan(0);
    expect(m[1][1]!.strength).toBeLessThan(0);
    expect(m[2][2]!.strength).toBeLessThan(0);
  });

  it('Rock Paper Scissors: all three species have distinct colors', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const colors = rps!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  it('Rock Paper Scissors: balanced params — all species have same radius and maxSpeed', () => {
    const rps = getBuiltinPreset('Rock Paper Scissors');
    const species = rps!.config.species;
    const radii = species.map((s) => s.radius);
    const speeds = species.map((s) => s.maxSpeed);
    expect(new Set(radii).size).toBe(1);
    expect(new Set(speeds).size).toBe(1);
  });

  // ── Grasslands — three-tier food web tests ────────────────

  it('Grasslands has exactly 3 species', () => {
    const gl = getBuiltinPreset('Grasslands');
    expect(gl).toBeDefined();
    expect(gl!.config.species).toHaveLength(3);
  });

  it('Grasslands species names are Grass, Rabbits, Foxes', () => {
    const gl = getBuiltinPreset('Grasslands');
    const names = gl!.config.species.map((s) => s.name);
    expect(names).toEqual(['Grass', 'Rabbits', 'Foxes']);
  });

  it('Grasslands: Grass is a producer (canEat is empty)', () => {
    const gl = getBuiltinPreset('Grasslands');
    expect(gl!.config.species[0].diet.canEat).toEqual([]);
  });

  it('Grasslands: Rabbits eat Grass (canEat = [0])', () => {
    const gl = getBuiltinPreset('Grasslands');
    expect(gl!.config.species[1].diet.canEat).toContain(0);
  });

  it('Grasslands: Foxes eat Rabbits (canEat = [1])', () => {
    const gl = getBuiltinPreset('Grasslands');
    expect(gl!.config.species[2].diet.canEat).toContain(1);
  });

  it('Grasslands: three-tier food chain Grass → Rabbits → Foxes', () => {
    const gl = getBuiltinPreset('Grasslands');
    const species = gl!.config.species;
    // Grass gains from nothing, Rabbits gain from Grass (idx 0), Foxes gain from Rabbits (idx 1)
    expect(species[1].energy.energyGainPerPrey[0]).toBeGreaterThan(0);
    expect(species[2].energy.energyGainPerPrey[1]).toBeGreaterThan(0);
    // Grass should not gain from anything
    expect(species[0].energy.energyGainPerPrey.every((v) => v === 0)).toBe(true);
  });

  it('Grasslands: Grass has the fastest reproduction (lowest cooldown)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const cooldowns = gl!.config.species.map((s) => s.lifecycle.reproductionCooldownSec);
    // Grass reproduces fastest
    expect(cooldowns[0]).toBeLessThan(cooldowns[1]);
    expect(cooldowns[0]).toBeLessThan(cooldowns[2]);
  });

  it('Grasslands: Grass is the slowest species (nearly stationary)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const speeds = gl!.config.species.map((s) => s.maxSpeed);
    // Grass is slowest, Foxes are fastest
    expect(speeds[0]).toBeLessThan(speeds[1]);
    expect(speeds[0]).toBeLessThan(speeds[2]);
  });

  it('Grasslands: Rabbits are attracted to Grass (foraging)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Rabbits (row 1) attracted to Grass (col 0)
    expect(m[1][0]!.strength).toBeGreaterThan(0);
  });

  it('Grasslands: Rabbits flee Foxes (predator avoidance)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Rabbits (row 1) flee Foxes (col 2)
    expect(m[1][2]!.strength).toBeLessThan(0);
  });

  it('Grasslands: Foxes chase Rabbits (hunting)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Foxes (row 2) chase Rabbits (col 1)
    expect(m[2][1]!.strength).toBeGreaterThan(0);
  });

  it('Grasslands: Foxes are territorial (self-repulsion)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Foxes (row 2) self-repel (col 2)
    expect(m[2][2]!.strength).toBeLessThan(0);
  });

  it('Grasslands: Rabbits flock with own kind (positive self-interaction)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Rabbits (row 1) attract own kind (col 1)
    expect(m[1][1]!.strength).toBeGreaterThan(0);
  });

  it('Grasslands: Grass ignores animals (null entries to Rabbits and Foxes)', () => {
    const gl = getBuiltinPreset('Grasslands');
    const m = gl!.config.interactionMatrix;
    // Grass (row 0) doesn't react to Rabbits (col 1) or Foxes (col 2)
    expect(m[0][1]).toBeNull();
    expect(m[0][2]).toBeNull();
  });

  it('Grasslands: all three species have distinct colors', () => {
    const gl = getBuiltinPreset('Grasslands');
    const colors = gl!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  it('Grasslands: total initial population is within populationCap', () => {
    const gl = getBuiltinPreset('Grasslands');
    const total = gl!.config.species.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBeLessThanOrEqual(gl!.config.simulation.populationCap!);
  });
});
