import { describe, it, expect } from 'vitest';
import {
  MAX_SPECIES,
  NOT_INFECTED,
  ALIVE,
  DEAD,
  EcosystemState,
  FreeList,
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  predatorPreyConfig,
  type SpeciesConfig,
  type EcosystemConfig,
  type EcosystemSnapshot,
} from './ecosystem.js';
import { createRng } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────

function testSpecies(overrides?: Partial<SpeciesConfig>): SpeciesConfig {
  return {
    name: 'TestCritter',
    count: 10,
    color: '#ff0000',
    radius: 3,
    initialSpeed: 50,
    maxSpeed: 100,
    energy: defaultEnergyConfig(),
    lifecycle: defaultLifecycleConfig(),
    diet: defaultDietConfig(),
    ...overrides,
  };
}

// ─── Constants ───────────────────────────────────────────────────

describe('Constants', () => {
  it('MAX_SPECIES is 12', () => {
    expect(MAX_SPECIES).toBe(12);
  });
  it('NOT_INFECTED is -1', () => {
    expect(NOT_INFECTED).toBe(-1);
  });
  it('ALIVE is 1, DEAD is 0', () => {
    expect(ALIVE).toBe(1);
    expect(DEAD).toBe(0);
  });
});

// ─── EcosystemState ──────────────────────────────────────────────

describe('EcosystemState', () => {
  it('allocates typed arrays of correct capacity', () => {
    const state = new EcosystemState(100);
    expect(state.energy.length).toBe(100);
    expect(state.age.length).toBe(100);
    expect(state.health.length).toBe(100);
    expect(state.alive.length).toBe(100);
    expect(state.reproductionCooldown.length).toBe(100);
    expect(state.infectedBy.length).toBe(100);
    expect(state.infectionTime.length).toBe(100);
  });

  it('initializes all alive to DEAD by default', () => {
    const state = new EcosystemState(10);
    for (let i = 0; i < 10; i++) {
      expect(state.alive[i]).toBe(0);
    }
  });

  it('initializes all infectedBy to NOT_INFECTED by default', () => {
    const state = new EcosystemState(10);
    for (let i = 0; i < 10; i++) {
      expect(state.infectedBy[i]).toBe(NOT_INFECTED);
    }
  });
});

describe('EcosystemState.initParticle', () => {
  it('sets alive state and energy from species config', () => {
    const state = new EcosystemState(10);
    const species = testSpecies({
      energy: defaultEnergyConfig({ initialEnergy: 75 }),
    });
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    expect(state.alive[0]).toBe(ALIVE);
    expect(state.energy[0]).toBe(75);
    expect(state.age[0]).toBe(0);
    expect(state.health[0]).toBe(1.0);
    expect(state.infectedBy[0]).toBe(NOT_INFECTED);
    expect(state.infectionTime[0]).toBe(0);
  });

  it('sets reproduction cooldown to species cooldown', () => {
    const state = new EcosystemState(10);
    const species = testSpecies({
      lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 7 }),
    });
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    expect(state.reproductionCooldown[0]).toBe(7);
  });

  it('can initialize multiple particles independently', () => {
    const state = new EcosystemState(10);
    const species = testSpecies();
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    state.initParticle(5, 0, species, rng);
    expect(state.alive[0]).toBe(ALIVE);
    expect(state.alive[5]).toBe(ALIVE);
    expect(state.alive[1]).toBe(DEAD); // untouched
    expect(state.alive[4]).toBe(DEAD); // untouched
  });
});

describe('EcosystemState.kill', () => {
  it('marks particle as dead', () => {
    const state = new EcosystemState(10);
    const species = testSpecies();
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    expect(state.alive[0]).toBe(ALIVE);
    state.kill(0);
    expect(state.alive[0]).toBe(DEAD);
    expect(state.energy[0]).toBe(0);
    expect(state.infectedBy[0]).toBe(NOT_INFECTED);
  });

  it('clears all state for the killed particle', () => {
    const state = new EcosystemState(10);
    const species = testSpecies();
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    state.infectedBy[0] = 2;
    state.infectionTime[0] = 5;
    state.energy[0] = 80;
    state.kill(0);
    expect(state.energy[0]).toBe(0);
    expect(state.age[0]).toBe(0);
    expect(state.health[0]).toBe(0);
    expect(state.reproductionCooldown[0]).toBe(0);
    expect(state.infectedBy[0]).toBe(NOT_INFECTED);
    expect(state.infectionTime[0]).toBe(0);
  });
});

describe('EcosystemState.snapshot', () => {
  it('returns a copy — modifying original does not affect snapshot', () => {
    const state = new EcosystemState(10);
    const species = testSpecies();
    const rng = createRng(42);
    state.initParticle(0, 0, species, rng);
    const snap = state.snapshot();
    state.kill(0);
    expect(snap.alive[0]).toBe(ALIVE);
    expect(snap.energy[0]).toBe(species.energy.initialEnergy);
  });
});

// ─── FreeList ────────────────────────────────────────────────────

describe('FreeList', () => {
  it('pushes and pops in LIFO order', () => {
    const list = new FreeList(10);
    list.push(5);
    list.push(3);
    list.push(7);
    expect(list.pop()).toBe(7);
    expect(list.pop()).toBe(3);
    expect(list.pop()).toBe(5);
  });

  it('returns -1 when empty', () => {
    const list = new FreeList(10);
    expect(list.pop()).toBe(-1);
  });

  it('reports size correctly', () => {
    const list = new FreeList(10);
    expect(list.size).toBe(0);
    expect(list.isEmpty).toBe(true);
    list.push(1);
    expect(list.size).toBe(1);
    expect(list.isEmpty).toBe(false);
    list.pop();
    expect(list.size).toBe(0);
    expect(list.isEmpty).toBe(true);
  });

  it('auto-grows on overflow', () => {
    const list = new FreeList(2);
    list.push(0);
    list.push(1);
    // No longer throws — auto-grows
    list.push(2);
    expect(list.size).toBe(3);
    expect(list.pop()).toBe(2);
    expect(list.pop()).toBe(1);
    expect(list.pop()).toBe(0);
  });

  it('grow() expands capacity', () => {
    const list = new FreeList(2);
    list.push(0);
    list.push(1);
    list.grow(10);
    // Existing entries preserved
    expect(list.size).toBe(2);
    // Can now push more
    for (let i = 2; i < 10; i++) list.push(i);
    expect(list.size).toBe(10);
  });
});

// ─── Default Configs ─────────────────────────────────────────────

describe('defaultEnergyConfig', () => {
  it('provides sensible defaults', () => {
    const cfg = defaultEnergyConfig();
    expect(cfg.maxEnergy).toBe(100);
    expect(cfg.initialEnergy).toBe(50);
    expect(cfg.movementCostPerSec).toBe(2);
    expect(cfg.reproductionCost).toBe(40);
    expect(cfg.idleDrainPerSec).toBe(1);
    expect(cfg.energyGainPerPrey).toEqual([]);
  });

  it('allows overrides', () => {
    const cfg = defaultEnergyConfig({ maxEnergy: 200, reproductionCost: 80 });
    expect(cfg.maxEnergy).toBe(200);
    expect(cfg.reproductionCost).toBe(80);
    expect(cfg.initialEnergy).toBe(50); // unchanged
  });
});

describe('defaultLifecycleConfig', () => {
  it('provides sensible defaults', () => {
    const cfg = defaultLifecycleConfig();
    expect(cfg.maxAgeSec).toBe(60);
    expect(cfg.starvationDamagePerSec).toBe(10);
    expect(cfg.reproductionCooldownSec).toBe(5);
    expect(cfg.sicknessDurationSec).toBe(10);
  });
});

describe('defaultDietConfig', () => {
  it('provides empty sets by default', () => {
    const cfg = defaultDietConfig();
    expect(cfg.canEat.size).toBe(0);
    expect(cfg.infectionVulnerability.size).toBe(0);
  });
});

// ─── Predator/Prey Config ────────────────────────────────────────

describe('predatorPreyConfig', () => {
  it('has 2 species', () => {
    const cfg = predatorPreyConfig();
    expect(cfg.species.length).toBe(2);
  });

  it('predator can eat prey', () => {
    const cfg = predatorPreyConfig();
    expect(cfg.species[0].diet.canEat.has(1)).toBe(true);
    expect(cfg.species[1].diet.canEat.size).toBe(0);
  });

  it('predator gains energy from prey', () => {
    const cfg = predatorPreyConfig();
    expect(cfg.species[0].energy.energyGainPerPrey[1]).toBe(50);
  });

  it('has interaction rules', () => {
    const cfg = predatorPreyConfig();
    // predator → prey: attract
    expect(cfg.interactionRules[0][1]).not.toBeNull();
    expect(cfg.interactionRules[0][1]!.enabledForces.has('attract')).toBe(true);
    // prey → predator: repel
    expect(cfg.interactionRules[1][0]).not.toBeNull();
    expect(cfg.interactionRules[1][0]!.enabledForces.has('repel')).toBe(true);
  });

  it('has population cap', () => {
    const cfg = predatorPreyConfig();
    expect(cfg.populationCap).toBeGreaterThan(0);
  });
});

// ─── Config Validation (types compile) ───────────────────────────

describe('EcosystemConfig type compatibility', () => {
  it('accepts a well-formed config', () => {
    const cfg: EcosystemConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 1000,
      species: [
        testSpecies({
          name: 'A',
          diet: defaultDietConfig({
            canEat: new Set([1]),
          }),
          energy: defaultEnergyConfig({
            energyGainPerPrey: [0, 30],
          }),
        }),
        testSpecies({ name: 'B' }),
      ],
      interactionRules: [
        [null, { enabledForces: new Set(['attract']), radius: 100, strength: 50, falloff: 'linear' }],
        [null, null],
      ],
    };
    expect(cfg.species.length).toBe(2);
    expect(cfg.populationCap).toBe(1000);
  });
});
