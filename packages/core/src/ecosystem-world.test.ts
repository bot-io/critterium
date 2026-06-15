import { describe, it, expect } from 'vitest';
import {
  EcosystemWorld,
  type LifecycleResult,
  type EcosystemWorldSnapshot,
} from './ecosystem-world.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  predatorPreyConfig,
  type SpeciesConfig,
  type EcosystemConfig,
  ALIVE,
  DEAD,
} from './ecosystem.js';
import { processReproduction } from './lifecycle.js';

// ─── Helpers ─────────────────────────────────────────────────────

function singleSpeciesConfig(count = 10, cap = 100): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: [
      {
        name: 'TestCritter',
        count,
        color: '#ff0000',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig(),
        lifecycle: defaultLifecycleConfig(),
        diet: defaultDietConfig(),
      },
    ],
    interactionRules: [[null]],
  };
}

// ─── Construction ────────────────────────────────────────────────

describe('EcosystemWorld construction', () => {
  it('initializes with correct alive count', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(20));
    expect(eco.aliveCount).toBe(20);
  });

  it('initializes ecosystem state for all particles', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5));
    for (let i = 0; i < 5; i++) {
      expect(eco.eco.alive[i]).toBe(ALIVE);
      expect(eco.eco.energy[i]).toBeGreaterThan(0);
    }
  });

  it('reports population cap from config', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10, 50));
    expect(eco.populationCap).toBe(50);
    expect(eco.isAtCap).toBe(false);
  });
});

// ─── Spawn ───────────────────────────────────────────────────────

describe('EcosystemWorld.spawn', () => {
  it('spawns a new particle and increments alive count', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 100));
    const idx = eco.spawn(0);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(eco.aliveCount).toBe(6);
    expect(eco.eco.alive[idx]).toBe(ALIVE);
  });

  it('spawns at specified position', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 100));
    const idx = eco.spawn(0, 123, 456);
    expect(eco.world.x[idx]).toBeCloseTo(123, 3);
    expect(eco.world.y[idx]).toBeCloseTo(456, 3);
  });

  it('initializes energy from species config', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 100));
    const idx = eco.spawn(0);
    expect(eco.eco.energy[idx]).toBe(eco.species[0].energy.initialEnergy);
  });

  it('returns -1 when at population cap', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10, 10));
    expect(eco.isAtCap).toBe(true);
    const idx = eco.spawn(0);
    expect(idx).toBe(-1);
    expect(eco.aliveCount).toBe(10);
  });

  it('reuses free slots from killed particles', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 100));
    eco.kill(2);
    expect(eco.aliveCount).toBe(4);
    const idx = eco.spawn(0);
    expect(idx).toBe(2); // reused slot
    expect(eco.aliveCount).toBe(5);
  });

  it('multiple spawns at cap are all rejected', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 6));
    expect(eco.spawn(0)).toBeGreaterThanOrEqual(0); // 6th particle OK
    expect(eco.spawn(0)).toBe(-1); // 7th rejected
    expect(eco.aliveCount).toBe(6);
  });
});

// ─── Kill ────────────────────────────────────────────────────────

describe('EcosystemWorld.kill', () => {
  it('marks particle as dead and decrements alive count', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10));
    eco.kill(5);
    expect(eco.aliveCount).toBe(9);
    expect(eco.eco.alive[5]).toBe(DEAD);
  });

  it('zeros out velocity on kill', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10));
    eco.kill(5);
    expect(eco.world.vx[5]).toBe(0);
    expect(eco.world.vy[5]).toBe(0);
  });

  it('ignores double kill (idempotent)', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10));
    eco.kill(5);
    eco.kill(5); // should not crash or double-count
    expect(eco.aliveCount).toBe(9);
  });

  it('ignores invalid indices', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10));
    eco.kill(-1);
    eco.kill(999);
    expect(eco.aliveCount).toBe(10);
  });

  it('kill + spawn recycles the slot', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 100));
    eco.kill(3);
    expect(eco.aliveCount).toBe(4);
    const idx = eco.spawn(0, 200, 300);
    expect(idx).toBe(3);
    expect(eco.eco.alive[3]).toBe(ALIVE);
    expect(eco.aliveCount).toBe(5);
  });
});

// ─── Lifecycle Processing ────────────────────────────────────────

describe('EcosystemWorld.processLifecycle', () => {
  it('ages all alive particles', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5));
    const result = eco.processLifecycle(1);
    for (let i = 0; i < 5; i++) {
      expect(eco.eco.age[i]).toBeCloseTo(1, 3);
    }
  });

  it('drains energy over time (idle + movement)', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5));
    const initialEnergy = eco.eco.energy[0];
    eco.processLifecycle(1);
    expect(eco.eco.energy[0]).toBeLessThan(initialEnergy);
  });

  it('kills particles from old age', () => {
    const cfg = singleSpeciesConfig(5);
    cfg.species[0].lifecycle.maxAgeSec = 5;
    const eco = new EcosystemWorld(cfg);
    // Age them past the limit
    const result = eco.processLifecycle(6);
    expect(result.diedOldAge).toBe(5);
    expect(eco.aliveCount).toBe(0);
  });

  it('kills particles from starvation (energy depletion → health damage)', () => {
    const cfg = singleSpeciesConfig(5);
    // Make energy drain fast and health fragile
    cfg.species[0].energy.initialEnergy = 1;
    cfg.species[0].energy.idleDrainPerSec = 10;
    cfg.species[0].energy.movementCostPerSec = 0;
    cfg.species[0].lifecycle.starvationDamagePerSec = 100;
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(1);
    expect(result.diedStarvation).toBe(5);
    expect(eco.aliveCount).toBe(0);
  });

  it('reports totalAlive correctly', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10));
    const result = eco.processLifecycle(1);
    expect(result.totalAlive).toBe(10);
  });

  it('does not process dead particles', () => {
    const cfg = singleSpeciesConfig(5);
    cfg.species[0].lifecycle.maxAgeSec = 1;
    const eco = new EcosystemWorld(cfg);
    // Kill one manually
    eco.kill(0);
    // Age past limit
    const result = eco.processLifecycle(2);
    // Only 4 should die (the 5th was already dead)
    expect(result.diedOldAge).toBe(4);
    expect(eco.aliveCount).toBe(0);
  });
});

// ─── Reproduction ────────────────────────────────────────────────

describe('EcosystemWorld.tryReproduce', () => {
  it('spawns child near parent when conditions are met', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 0;
    const eco = new EcosystemWorld(cfg);
    // Parent should have enough energy and no cooldown
    const childIdx = eco.tryReproduce(0, 100);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(eco.aliveCount).toBe(2);
    // Child should be near parent
    expect(Math.abs(eco.world.x[childIdx] - eco.world.x[0])).toBeLessThan(15);
  });

  it('deducts reproduction cost from parent energy', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 0;
    const eco = new EcosystemWorld(cfg);
    const energyBefore = eco.eco.energy[0];
    eco.tryReproduce(0, 100);
    expect(eco.eco.energy[0]).toBe(energyBefore - 30);
  });

  it('sets reproduction cooldown on parent', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 5;
    const eco = new EcosystemWorld(cfg);
    // Need to clear initial cooldown first
    eco.eco.reproductionCooldown[0] = 0;
    eco.tryReproduce(0, 100);
    expect(eco.eco.reproductionCooldown[0]).toBe(5);
  });

  it('fails when energy is too low', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 10;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 0;
    const eco = new EcosystemWorld(cfg);
    const result = eco.tryReproduce(0, 100);
    expect(result).toBe(-1);
    expect(eco.aliveCount).toBe(1);
  });

  it('fails when on cooldown', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 10;
    const eco = new EcosystemWorld(cfg);
    // Initial cooldown is set to 10
    const result = eco.tryReproduce(0, 100);
    expect(result).toBe(-1);
  });

  it('fails when at population cap', () => {
    const cfg = singleSpeciesConfig(1, 1);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 0;
    const eco = new EcosystemWorld(cfg);
    expect(eco.isAtCap).toBe(true);
    const result = eco.tryReproduce(0, 100);
    expect(result).toBe(-1);
  });

  it('fails for dead particles', () => {
    const cfg = singleSpeciesConfig(1, 100);
    cfg.species[0].energy.initialEnergy = 100;
    cfg.species[0].energy.reproductionCost = 30;
    cfg.species[0].lifecycle.reproductionCooldownSec = 0;
    const eco = new EcosystemWorld(cfg);
    eco.kill(0);
    const result = eco.tryReproduce(0, 100);
    expect(result).toBe(-1);
  });
});

// ─── Snapshot ────────────────────────────────────────────────────

describe('EcosystemWorld.snapshot', () => {
  it('captures world and ecosystem state', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5));
    const snap = eco.snapshot();
    expect(snap.aliveCount).toBe(5);
    expect(snap.eco.alive.length).toBeGreaterThanOrEqual(5);
    expect(snap.world.x.length).toBeGreaterThanOrEqual(5);
  });

  it('snapshot is independent of live state', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(5));
    const snap = eco.snapshot();
    eco.kill(0);
    expect(snap.aliveCount).toBe(5);
    expect(snap.eco.alive[0]).toBe(ALIVE);
  });
});

// ─── Predator/Prey Integration ───────────────────────────────────

describe('EcosystemWorld with predatorPreyConfig', () => {
  it('creates world with 2 species', () => {
    const cfg = predatorPreyConfig();
    const eco = new EcosystemWorld(cfg);
    expect(eco.aliveCount).toBe(120); // 20 predators + 100 prey
    expect(eco.species.length).toBe(2);
  });

  it('predator can eat prey (diet config)', () => {
    const cfg = predatorPreyConfig();
    const eco = new EcosystemWorld(cfg);
    expect(eco.species[0].diet.canEat.has(1)).toBe(true);
    expect(eco.species[1].diet.canEat.size).toBe(0);
  });
});

// ─── Hard Cap Enforcement ────────────────────────────────────────

describe('Hard population cap enforcement', () => {
  it('constructor clamps initial count to populationCap', () => {
    // 10+10+10 = 30, but cap is 15
    const cfg: EcosystemConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 15,
      species: [
        { ...singleSpeciesConfig(10, 15).species[0], count: 10, name: 'A' },
        { ...singleSpeciesConfig(10, 15).species[0], count: 10, name: 'B' },
        { ...singleSpeciesConfig(10, 15).species[0], count: 10, name: 'C' },
      ],
      interactionRules: [],
    };
    const eco = new EcosystemWorld(cfg);
    // aliveCount must not exceed populationCap
    expect(eco.aliveCount).toBeLessThanOrEqual(15);
    // Must have at least 1 of each species
    const types = new Set<number>();
    for (let i = 0; i < eco.highWaterMark; i++) {
      if (eco.eco.alive[i] === ALIVE) types.add(eco.world.type[i]);
    }
    expect(types.size).toBe(3);
  });

  it('spawn cannot exceed populationCap even with free list exhausted', () => {
    // Start with 5 particles, cap 10
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 10));
    // Spawn 5 more to reach cap
    for (let i = 0; i < 5; i++) {
      expect(eco.spawn(0)).toBeGreaterThanOrEqual(0);
    }
    expect(eco.aliveCount).toBe(10);
    // Next spawn rejected
    expect(eco.spawn(0)).toBe(-1);
    expect(eco.aliveCount).toBe(10);
  });

  it('spawn cannot grow highWaterMark beyond populationCap', () => {
    // Start with 5 particles, cap 8
    const eco = new EcosystemWorld(singleSpeciesConfig(5, 8));
    // Spawn 3 to fill cap (no kills, so hwm grows)
    for (let i = 0; i < 3; i++) {
      expect(eco.spawn(0)).toBeGreaterThanOrEqual(0);
    }
    expect(eco.aliveCount).toBe(8);
    expect(eco.highWaterMark).toBeLessThanOrEqual(8);
    // Even after kills, spawn respects cap
    eco.kill(0);
    eco.kill(1);
    expect(eco.aliveCount).toBe(6);
    // Can spawn again (reuses free slots)
    expect(eco.spawn(0)).toBeGreaterThanOrEqual(0);
    expect(eco.aliveCount).toBe(7);
  });

  it('reproduction cannot exceed populationCap', () => {
    // Start with 8 particles, cap 10
    const cfg: EcosystemConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 10,
      species: [
        {
          ...singleSpeciesConfig(8, 10).species[0],
          count: 8,
          energy: defaultEnergyConfig({
            initialEnergy: 200,
            reproductionCost: 10,
          }),
          lifecycle: defaultLifecycleConfig({
            reproductionCooldownSec: 0, // no cooldown
          }),
        },
      ],
      interactionRules: [],
    };
    const eco = new EcosystemWorld(cfg);
    // All particles have energy and no cooldown — reproduction should work
    let totalBorn = 0;
    for (let frame = 0; frame < 5; frame++) {
      const born = processReproduction(eco, 100);
      totalBorn += born;
      eco.processLifecycle(1 / 60);
    }
    // Must not exceed cap
    expect(eco.aliveCount).toBeLessThanOrEqual(10);
    // Should have spawned exactly 2 (8 + 2 = cap)
    expect(totalBorn).toBe(2);
  });
});

// ─── Per-Species Fair Cap ────────────────────────────────────────

describe('Per-species fair population cap', () => {
  function twoSpeciesConfig(countA: number, countB: number, cap: number): EcosystemConfig {
    return {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: cap,
      species: [
        { ...singleSpeciesConfig(countA, cap).species[0], count: countA, name: 'A' },
        { ...singleSpeciesConfig(countB, cap).species[0], count: countB, name: 'B' },
      ],
      interactionRules: [],
    };
  }

  it('perSpeciesCap returns ceil(populationCap / numSpecies)', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(10, 10, 100));
    expect(eco.perSpeciesCap(0)).toBe(50); // ceil(100/2) = 50
    expect(eco.perSpeciesCap(1)).toBe(50);
  });

  it('perSpeciesCap handles odd division with ceil', () => {
    // 3 species, cap 100: ceil(100/3) = 34
    const base = twoSpeciesConfig(10, 10, 100);
    const cfg: EcosystemConfig = {
      ...base,
      species: [
        ...base.species,
        { ...singleSpeciesConfig(10, 100).species[0], count: 10, name: 'C' },
      ],
    };
    const eco = new EcosystemWorld(cfg);
    expect(eco.perSpeciesCap(0)).toBe(34); // ceil(100/3)
    expect(eco.perSpeciesCap(1)).toBe(34);
    expect(eco.perSpeciesCap(2)).toBe(34);
  });

  it('speciesCount returns correct per-species alive count at init', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(10, 20, 100));
    expect(eco.speciesCount(0)).toBe(10);
    expect(eco.speciesCount(1)).toBe(20);
    expect(eco.aliveCount).toBe(30);
  });

  it('speciesCount tracks spawn correctly', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(5, 5, 100));
    eco.spawn(0); // spawn species A
    expect(eco.speciesCount(0)).toBe(6);
    expect(eco.speciesCount(1)).toBe(5);
    expect(eco.aliveCount).toBe(11);
  });

  it('speciesCount tracks kill correctly', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(5, 5, 100));
    eco.kill(0); // kill a species-A particle
    expect(eco.speciesCount(0)).toBe(4);
    expect(eco.speciesCount(1)).toBe(5);
    expect(eco.aliveCount).toBe(9);
  });

  it('isSpeciesAtCap returns false below cap, true at cap', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(5, 5, 100));
    // per-species cap = 50
    expect(eco.isSpeciesAtCap(0)).toBe(false);
    // Spawn species A to reach per-species cap of 50
    for (let i = 0; i < 45; i++) eco.spawn(0);
    expect(eco.speciesCount(0)).toBe(50);
    expect(eco.isSpeciesAtCap(0)).toBe(true);
    // Species B still below cap
    expect(eco.isSpeciesAtCap(1)).toBe(false);
  });

  it('tryReproduce respects per-species cap before global cap', () => {
    // 2 species, cap 100 (50 each). Fill species A to its per-species cap.
    const eco = new EcosystemWorld(twoSpeciesConfig(10, 10, 100));
    // Spawn species A up to 50 (per-species cap)
    for (let i = 0; i < 40; i++) eco.spawn(0);
    expect(eco.speciesCount(0)).toBe(50);
    expect(eco.isSpeciesAtCap(0)).toBe(true);
    // Global cap NOT reached (60/100)
    expect(eco.aliveCount).toBe(60);
    expect(eco.isAtCap).toBe(false);

    // Particle 0 is species A — reproduction blocked by per-species cap
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.energy[0] = 200;
    expect(eco.tryReproduce(0, 100)).toBe(-1);

    // Particle 10 is species B — reproduction allowed (below per-species cap)
    eco.eco.reproductionCooldown[10] = 0;
    eco.eco.energy[10] = 200;
    expect(eco.tryReproduce(10, 100)).toBeGreaterThanOrEqual(0);
    expect(eco.speciesCount(1)).toBe(11);
  });

  it('per-species cap prevents monopolization during reproduction', () => {
    // 2 species, cap 100 (50 each). Species A can reproduce, B cannot.
    const cfg: EcosystemConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 100,
      species: [
        {
          ...singleSpeciesConfig(10, 100).species[0],
          count: 10,
          name: 'FastBreeder',
          energy: defaultEnergyConfig({ initialEnergy: 500, reproductionCost: 5 }),
          lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
        },
        {
          ...singleSpeciesConfig(10, 100).species[0],
          count: 10,
          name: 'SlowBreeder',
          energy: defaultEnergyConfig({ initialEnergy: 50, reproductionCost: 999 }),
          lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 999 }),
        },
      ],
      interactionRules: [],
    };
    const eco = new EcosystemWorld(cfg);
    // Run several reproduction cycles — species A breeds fast
    for (let frame = 0; frame < 10; frame++) {
      processReproduction(eco, 100);
      eco.processLifecycle(1 / 60);
    }
    // Species A capped at per-species cap (50), never monopolizes
    expect(eco.speciesCount(0)).toBeLessThanOrEqual(50);
    // Species B unchanged (can't reproduce)
    expect(eco.speciesCount(1)).toBe(10);
    // Total within global cap
    expect(eco.aliveCount).toBeLessThanOrEqual(100);
  });

  it('speciesCount for invalid index returns 0', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(5, 5, 100));
    expect(eco.speciesCount(99)).toBe(0);
    expect(eco.speciesCount(-1)).toBe(0);
  });

  it('perSpeciesCap for invalid index falls back to global cap', () => {
    const eco = new EcosystemWorld(twoSpeciesConfig(5, 5, 100));
    expect(eco.perSpeciesCap(99)).toBe(100);
  });

  it('single species: per-species cap equals global cap', () => {
    const eco = new EcosystemWorld(singleSpeciesConfig(10, 80));
    expect(eco.perSpeciesCap(0)).toBe(80);
    expect(eco.isSpeciesAtCap(0)).toBe(false);
  });
});
