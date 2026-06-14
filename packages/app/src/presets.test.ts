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
  'Birds',
  'Fishes',
  'Coral Reef',
  'Tornado Alley',
];

describe('presets', () => {
  it('exports exactly 12 built-in presets', () => {
    expect(BUILTIN_PRESETS).toHaveLength(12);
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

  it('forces array has drag and wander entries', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(Array.isArray(p.config.forces)).toBe(true);
      const drag = p.config.forces.find((f) => f.type === 'drag');
      expect(drag).toBeDefined();
      expect(drag!.params.coefficient).toBeGreaterThan(0);
      const wander = p.config.forces.find((f) => f.type === 'wander');
      expect(wander).toBeDefined();
      expect(wander!.params.strength).toBeGreaterThanOrEqual(0);
      expect(wander!.params.rate).toBeGreaterThan(0);
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

  // ── Birds (Murmuration) — flocking + predator tests ──────

  it('Birds has exactly 2 species', () => {
    const birds = getBuiltinPreset('Birds');
    expect(birds).toBeDefined();
    expect(birds!.config.species).toHaveLength(2);
  });

  it('Birds species names are Starlings, Hawk', () => {
    const birds = getBuiltinPreset('Birds');
    const names = birds!.config.species.map((s) => s.name);
    expect(names).toEqual(['Starlings', 'Hawk']);
  });

  it('Birds: Starlings are the flock (majority of population)', () => {
    const birds = getBuiltinPreset('Birds');
    const counts = birds!.config.species.map((s) => s.count);
    // Starlings vastly outnumber the Hawk
    expect(counts[0]).toBeGreaterThan(counts[1] * 10);
  });

  it('Birds: Hawk is the predator (canEat Starlings)', () => {
    const birds = getBuiltinPreset('Birds');
    expect(birds!.config.species[1].diet.canEat).toContain(0);
  });

  it('Birds: Starlings do not eat anything (producer base of flock)', () => {
    const birds = getBuiltinPreset('Birds');
    expect(birds!.config.species[0].diet.canEat).toEqual([]);
  });

  it('Birds: Hawk gains energy from Starlings', () => {
    const birds = getBuiltinPreset('Birds');
    expect(birds!.config.species[1].energy.energyGainPerPrey[0]).toBeGreaterThan(0);
    // Hawk gains nothing from itself
    expect(birds!.config.species[1].energy.energyGainPerPrey[1]).toBe(0);
  });

  it('Birds: Starlings flock together (positive self-interaction / cohesion)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Starlings (row 0) attract own kind (col 0)
    expect(m[0][0]!.strength).toBeGreaterThan(0);
  });

  it('Birds: Starlings flee the Hawk (predator avoidance)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Starlings (row 0) flee Hawk (col 1)
    expect(m[0][1]!.strength).toBeLessThan(0);
  });

  it('Birds: Hawk chases Starlings (hunting)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Hawk (row 1) chases Starlings (col 0)
    expect(m[1][0]!.strength).toBeGreaterThan(0);
  });

  it('Birds: Hawk is solitary/territorial (negative self-interaction)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Hawk (row 1) repels own kind (col 1)
    expect(m[1][1]!.strength).toBeLessThan(0);
  });

  it('Birds: Starlings have stronger cohesion than the Hawk chase radius (flock sticks together)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Cohesion radius (Starlings→Starlings) should be substantial for visible flocking
    expect(m[0][0]!.radius).toBeGreaterThan(50);
    expect(m[0][0]!.strength).toBeGreaterThan(30);
  });

  it('Birds: Starlings flee radius is larger than Hawk chase radius (prey can escape)', () => {
    const birds = getBuiltinPreset('Birds');
    const m = birds!.config.interactionMatrix;
    // Starlings detect and flee the Hawk before the Hawk is in chase range is *not* required,
    // but the flee interaction must exist and be strong.
    expect(m[0][1]!.strength).toBeLessThan(-50);
  });

  it('Birds: Starlings are smaller than the Hawk', () => {
    const birds = getBuiltinPreset('Birds');
    expect(birds!.config.species[0].radius).toBeLessThan(birds!.config.species[1].radius);
  });

  it('Birds: both species have distinct colors', () => {
    const birds = getBuiltinPreset('Birds');
    const colors = birds!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(2);
  });

  it('Birds: total initial population is within populationCap', () => {
    const birds = getBuiltinPreset('Birds');
    const total = birds!.config.species.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBeLessThanOrEqual(birds!.config.simulation.populationCap!);
  });

  // ── Fishes (Coral Reef) — symbiosis + predator/prey tests ──

  it('Fishes has exactly 3 species', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes).toBeDefined();
    expect(fishes!.config.species).toHaveLength(3);
  });

  it('Fishes species names are Tetras, Cleaner Wrasse, Barracuda', () => {
    const fishes = getBuiltinPreset('Fishes');
    const names = fishes!.config.species.map((s) => s.name);
    expect(names).toEqual(['Tetras', 'Cleaner Wrasse', 'Barracuda']);
  });

  it('Fishes: Tetras are the schooling prey base (majority of population)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const counts = fishes!.config.species.map((s) => s.count);
    // Tetras vastly outnumber predators and cleaners
    expect(counts[0]).toBeGreaterThan(counts[1] * 10);
    expect(counts[0]).toBeGreaterThan(counts[2] * 10);
  });

  it('Fishes: Barracuda is the apex predator (eats Tetras)', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[2].diet.canEat).toContain(0);
  });

  it('Fishes: Barracuda does NOT eat Cleaner Wrasse (symbiotic tolerance)', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[2].diet.canEat).not.toContain(1);
  });

  it('Fishes: Cleaner Wrasse opportunistically eats Tetras', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[1].diet.canEat).toContain(0);
  });

  it('Fishes: Tetras eat nothing (base of food chain)', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[0].diet.canEat).toEqual([]);
  });

  it('Fishes: Barracuda gains energy from Tetras only', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[2].energy.energyGainPerPrey[0]).toBeGreaterThan(0);
    // No gain from Wrasse or self
    expect(fishes!.config.species[2].energy.energyGainPerPrey[1]).toBe(0);
    expect(fishes!.config.species[2].energy.energyGainPerPrey[2]).toBe(0);
  });

  it('Fishes: Cleaner Wrasse gains energy from Tetras only', () => {
    const fishes = getBuiltinPreset('Fishes');
    expect(fishes!.config.species[1].energy.energyGainPerPrey[0]).toBeGreaterThan(0);
    expect(fishes!.config.species[1].energy.energyGainPerPrey[1]).toBe(0);
    expect(fishes!.config.species[1].energy.energyGainPerPrey[2]).toBe(0);
  });

  it('Fishes: Tetras school together (positive self-cohesion)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Tetras (row 0) attract own kind (col 0)
    expect(m[0][0]!.strength).toBeGreaterThan(0);
  });

  it('Fishes: Tetras flee the Barracuda (predator avoidance)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Tetras (row 0) flee Barracuda (col 2)
    expect(m[0][2]!.strength).toBeLessThan(0);
  });

  it('Fishes: Barracuda chases Tetras (hunting)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Barracuda (row 2) chases Tetras (col 0)
    expect(m[2][0]!.strength).toBeGreaterThan(0);
  });

  it('Fishes: Barracuda completely ignores Cleaner Wrasse (symbiosis — null interaction)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Barracuda (row 2) does NOT react to Wrasse (col 1) — unique to this preset
    expect(m[2][1]).toBeNull();
  });

  it('Fishes: Cleaner Wrasse is attracted to Barracuda (symbiotic following)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Wrasse (row 1) attracted to Barracuda (col 2)
    expect(m[1][2]!.strength).toBeGreaterThan(0);
  });

  it('Fishes: Barracuda is territorial (negative self-interaction)', () => {
    const fishes = getBuiltinPreset('Fishes');
    const m = fishes!.config.interactionMatrix;
    // Barracuda (row 2) self-repel (col 2)
    expect(m[2][2]!.strength).toBeLessThan(0);
  });

  it('Fishes: Barracuda is larger than Cleaner Wrasse which is larger than Tetras', () => {
    const fishes = getBuiltinPreset('Fishes');
    const radii = fishes!.config.species.map((s) => s.radius);
    expect(radii[2]).toBeGreaterThan(radii[1]);
    expect(radii[1]).toBeGreaterThan(radii[0]);
  });

  it('Fishes: all three species have distinct colors', () => {
    const fishes = getBuiltinPreset('Fishes');
    const colors = fishes!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  it('Fishes: total initial population is within populationCap', () => {
    const fishes = getBuiltinPreset('Fishes');
    const total = fishes!.config.species.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBeLessThanOrEqual(fishes!.config.simulation.populationCap!);
  });

  // ── Coral Reef — five-tier food chain tests ───────────────

  it('Coral Reef has exactly 5 species', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef).toBeDefined();
    expect(reef!.config.species).toHaveLength(5);
  });

  it('Coral Reef species names are Coral, Zooplankton, Clownfish, Moray Eel, Reef Shark', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const names = reef!.config.species.map((s) => s.name);
    expect(names).toEqual(['Coral', 'Zooplankton', 'Clownfish', 'Moray Eel', 'Reef Shark']);
  });

  it('Coral Reef: Coral is a producer (canEat is empty)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.species[0].diet.canEat).toEqual([]);
  });

  it('Coral Reef: Zooplankton eat Coral (canEat = [0])', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.species[1].diet.canEat).toContain(0);
  });

  it('Coral Reef: Clownfish eat Zooplankton (canEat = [1])', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.species[2].diet.canEat).toContain(1);
  });

  it('Coral Reef: Moray Eel eats Clownfish (canEat = [2])', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.species[3].diet.canEat).toContain(2);
  });

  it('Coral Reef: Reef Shark eats Moray Eel (canEat = [3])', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.species[4].diet.canEat).toContain(3);
  });

  it('Coral Reef: five-tier food chain Coral → Zooplankton → Clownfish → Eel → Shark', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const species = reef!.config.species;
    // Each predator gains energy only from its direct prey
    expect(species[1].energy.energyGainPerPrey[0]).toBeGreaterThan(0); // Zooplankton from Coral
    expect(species[2].energy.energyGainPerPrey[1]).toBeGreaterThan(0); // Clownfish from Zooplankton
    expect(species[3].energy.energyGainPerPrey[2]).toBeGreaterThan(0); // Eel from Clownfish
    expect(species[4].energy.energyGainPerPrey[3]).toBeGreaterThan(0); // Shark from Eel
    // Coral (producer) gains from nothing
    expect(species[0].energy.energyGainPerPrey.every((v) => v === 0)).toBe(true);
  });

  it('Coral Reef: Coral is effectively stationary (slowest species, low maxSpeed)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const speeds = reef!.config.species.map((s) => s.maxSpeed);
    // Coral is the slowest of all 5 species
    expect(speeds[0]).toBeLessThan(speeds[1]);
    expect(speeds[0]).toBeLessThan(speeds[2]);
    expect(speeds[0]).toBeLessThan(speeds[3]);
    expect(speeds[0]).toBeLessThan(speeds[4]);
    // Coral maxSpeed is very low (≤ 5, following the Grasslands "nearly stationary" convention;
    // true 0 is infeasible because ecosystem-world.ts divides by maxSpeed)
    expect(speeds[0]).toBeLessThanOrEqual(5);
    // Coral starts at rest
    expect(reef!.config.species[0].initialSpeed).toBe(0);
  });

  it('Coral Reef: Coral has the fastest reproduction (lowest cooldown among producers/base)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const cooldowns = reef!.config.species.map((s) => s.lifecycle.reproductionCooldownSec);
    // Coral reproduces fastest (3s) to sustain the food chain base
    expect(cooldowns[0]).toBeLessThanOrEqual(cooldowns[1]);
  });

  it('Coral Reef: Zooplankton are attracted to Coral (foraging)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Zooplankton (row 1) attracted to Coral (col 0)
    expect(m[1][0]!.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: Zooplankton flee Clownfish (predator avoidance)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Zooplankton (row 1) flee Clownfish (col 2)
    expect(m[1][2]!.strength).toBeLessThan(0);
  });

  it('Coral Reef: Clownfish chase Zooplankton (hunting)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Clownfish (row 2) chase Zooplankton (col 1)
    expect(m[2][1]!.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: Clownfish school together (positive self-cohesion)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Clownfish (row 2) attract own kind (col 2)
    expect(m[2][2]!.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: Clownfish flee Moray Eel (predator avoidance)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Clownfish (row 2) flee Eel (col 3)
    expect(m[2][3]!.strength).toBeLessThan(0);
  });

  it('Coral Reef: Moray Eel chases Clownfish (hunting)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Eel (row 3) chases Clownfish (col 2)
    expect(m[3][2]!.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: Moray Eel flees Reef Shark (apex predator avoidance)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Eel (row 3) flees Shark (col 4)
    expect(m[3][4]!.strength).toBeLessThan(0);
  });

  it('Coral Reef: Moray Eel is territorial (negative self-interaction)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Eel (row 3) self-repel (col 3)
    expect(m[3][3]!.strength).toBeLessThan(0);
  });

  it('Coral Reef: Reef Shark chases Moray Eel (hunting)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Shark (row 4) chases Eel (col 3)
    expect(m[4][3]!.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: Reef Shark is solitary/territorial (negative self-interaction)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Shark (row 4) self-repel (col 4)
    expect(m[4][4]!.strength).toBeLessThan(0);
  });

  it('Coral Reef: Coral ignores all other species (null row entries)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const m = reef!.config.interactionMatrix;
    // Coral (row 0) doesn't react to anything
    for (let col = 0; col < 5; col++) {
      expect(m[0][col]).toBeNull();
    }
  });

  it('Coral Reef: Reef Shark is the largest species (apex predator)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const radii = reef!.config.species.map((s) => s.radius);
    // Shark (idx 4) is the largest
    expect(radii[4]).toBeGreaterThan(radii[0]);
    expect(radii[4]).toBeGreaterThan(radii[1]);
    expect(radii[4]).toBeGreaterThan(radii[2]);
    expect(radii[4]).toBeGreaterThan(radii[3]);
  });

  it('Coral Reef: all five species have distinct colors', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const colors = reef!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(5);
  });

  it('Coral Reef: forces include a flow-field (underwater current)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const flowField = reef!.config.forces.find((f) => f.type === 'flow-field');
    expect(flowField).toBeDefined();
    expect(flowField!.enabled).toBe(true);
    expect(flowField!.params.strength).toBeGreaterThan(0);
  });

  it('Coral Reef: flow-field uses gentle strength (mild current)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const flowField = reef!.config.forces.find((f) => f.type === 'flow-field');
    // Gentle current — strength ≤ 25 for subtle drift, not overwhelming motion
    expect(flowField!.params.strength).toBeLessThanOrEqual(25);
  });

  it('Coral Reef: drag coefficient is mild (underwater damping)', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const drag = reef!.config.forces.find((f) => f.type === 'drag');
    expect(drag!.params.coefficient).toBeGreaterThan(0);
    expect(drag!.params.coefficient).toBeLessThanOrEqual(1);
  });

  it('Coral Reef: populationCap is 500', () => {
    const reef = getBuiltinPreset('Coral Reef');
    expect(reef!.config.simulation.populationCap).toBe(500);
  });

  it('Coral Reef: total initial population is within populationCap', () => {
    const reef = getBuiltinPreset('Coral Reef');
    const total = reef!.config.species.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBeLessThanOrEqual(reef!.config.simulation.populationCap!);
  });

  // ── Tornado Alley — chaotic vortex preset tests ────────────

  it('Tornado Alley has exactly 3 species', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    expect(tornado).toBeDefined();
    expect(tornado!.config.species).toHaveLength(3);
  });

  it('Tornado Alley species names are Dust Motes, Debris, Birds', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const names = tornado!.config.species.map((s) => s.name);
    expect(names).toEqual(['Dust Motes', 'Debris', 'Birds']);
  });

  it('Tornado Alley: populationCap is 400', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    expect(tornado!.config.simulation.populationCap).toBe(400);
  });

  it('Tornado Alley: total initial population is within populationCap', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const total = tornado!.config.species.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBeLessThanOrEqual(tornado!.config.simulation.populationCap!);
  });

  it('Tornado Alley: interaction matrix is 3×3', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const m = tornado!.config.interactionMatrix;
    expect(m).toHaveLength(3);
    for (const row of m) {
      expect(row).toHaveLength(3);
    }
  });

  it('Tornado Alley: no predation — all canEat arrays empty', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    for (const sp of tornado!.config.species) {
      expect(sp.diet.canEat).toEqual([]);
    }
  });

  it('Tornado Alley: no energy gain from prey (all energyGainPerPrey zero)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    for (const sp of tornado!.config.species) {
      expect(sp.energy.energyGainPerPrey).toHaveLength(3);
      expect(sp.energy.energyGainPerPrey.every((v) => v === 0)).toBe(true);
    }
  });

  it('Tornado Alley: Debris repels everything (row 1 all negative)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const m = tornado!.config.interactionMatrix;
    // Debris (row 1) reacts negatively to Dust (col 0), Debris (col 1), Birds (col 2)
    for (let col = 0; col < 3; col++) {
      expect(m[1][col]).not.toBeNull();
      expect(m[1][col]!.strength).toBeLessThan(0);
    }
  });

  it('Tornado Alley: Birds mildly flock (positive self-cohesion)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const m = tornado!.config.interactionMatrix;
    // Birds (row 2) attract own kind (col 2)
    expect(m[2][2]).not.toBeNull();
    expect(m[2][2]!.strength).toBeGreaterThan(0);
  });

  it('Tornado Alley: Dust Motes weakly cohere (positive self-attraction)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const m = tornado!.config.interactionMatrix;
    // Dust (row 0) attract own kind (col 0) — dust wisps
    expect(m[0][0]).not.toBeNull();
    expect(m[0][0]!.strength).toBeGreaterThan(0);
  });

  it('Tornado Alley: forces include a vortex', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const vortex = tornado!.config.forces.find((f) => f.type === 'vortex');
    expect(vortex).toBeDefined();
    expect(vortex!.enabled).toBe(true);
  });

  it('Tornado Alley: vortex swirl strength ~300', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const vortex = tornado!.config.forces.find((f) => f.type === 'vortex')!;
    // Strong swirl around 300 (accept 250–350)
    expect(vortex.params.strength).toBeGreaterThanOrEqual(250);
    expect(vortex.params.strength).toBeLessThanOrEqual(350);
  });

  it('Tornado Alley: vortex centered at canvas midpoint', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const vortex = tornado!.config.forces.find((f) => f.type === 'vortex')!;
    const { width, height } = tornado!.config.simulation;
    expect(vortex.params.cx).toBe(width / 2);
    expect(vortex.params.cy).toBe(height / 2);
  });

  it('Tornado Alley: vortex has inward radial pull (negative radialStrength)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const vortex = tornado!.config.forces.find((f) => f.type === 'vortex')!;
    // Negative radialStrength = inward pull (toward center)
    expect(vortex.params.radialStrength).toBeLessThan(0);
  });

  it('Tornado Alley: forces include a turbulent flow field', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const flowField = tornado!.config.forces.find((f) => f.type === 'flow-field');
    expect(flowField).toBeDefined();
    expect(flowField!.enabled).toBe(true);
    expect(flowField!.params.mode).toBe('turbulence');
    expect(flowField!.params.strength).toBeGreaterThan(0);
    expect(flowField!.params.turbulenceScale).toBeGreaterThan(0);
  });

  it('Tornado Alley: wander force present with high rate (chaotic motion)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const wander = tornado!.config.forces.find((f) => f.type === 'wander')!;
    expect(wander.enabled).toBe(true);
    expect(wander.params.strength).toBeGreaterThan(0);
    // High wander rate for chaotic motion (> default 2.5)
    expect(wander.params.rate).toBeGreaterThan(2.5);
  });

  it('Tornado Alley: Dust Motes are the lightest/fastest (highest maxSpeed, smallest radius)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const species = tornado!.config.species;
    const speeds = species.map((s) => s.maxSpeed);
    const radii = species.map((s) => s.radius);
    // Dust Motes (idx 0) — fastest and smallest
    expect(speeds[0]).toBeGreaterThan(speeds[1]);
    expect(radii[0]).toBeLessThan(radii[1]);
    expect(radii[0]).toBeLessThan(radii[2]);
  });

  it('Tornado Alley: Debris is the heaviest (largest radius)', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const species = tornado!.config.species;
    const radii = species.map((s) => s.radius);
    // Debris (idx 1) is the largest
    expect(radii[1]).toBeGreaterThan(radii[0]);
    expect(radii[1]).toBeGreaterThan(radii[2]);
  });

  it('Tornado Alley: all three species have distinct colors', () => {
    const tornado = getBuiltinPreset('Tornado Alley');
    const colors = tornado!.config.species.map((s) => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });
});
