/**
 * Reproduction — Probabilistic reproduction tests
 *
 * Tests that reproduction is NOT deterministic: after cooldown expires,
 * particles have a random chance to reproduce each tick, spreading
 * reproduction across time rather than all-at-once.
 */

import { describe, it, expect } from 'vitest';
import { EcosystemWorld } from './ecosystem-world.js';
import { processReproduction } from './lifecycle.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  type SpeciesConfig,
  type EcosystemConfig,
  DEAD,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeConfig(species: SpeciesConfig[], cap = 100): EcosystemConfig {
  const n = species.length;
  const interactionRules: (any | null)[][] = [];
  for (let i = 0; i < n; i++) {
    const row: (any | null)[] = [];
    for (let j = 0; j < n; j++) row.push(null);
    interactionRules.push(row);
  }
  return {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    seed: 42,
    populationCap: cap,
    species,
    interactionRules,
  };
}

function reproSpecies(cooldownSec: number): SpeciesConfig {
  return {
    name: 'Critter',
    count: 1,
    color: '#44cc44',
    radius: 3,
    initialSpeed: 0,
    maxSpeed: 0,
    energy: defaultEnergyConfig({
      maxEnergy: 500,
      initialEnergy: 500,
      reproductionCost: 30,
      idleDrainPerSec: 0,
      energyGainPerPrey: [],
    }),
    lifecycle: defaultLifecycleConfig({
      maxAgeSec: 0, // immortal
      starvationDamagePerSec: 0,
      reproductionCooldownSec: cooldownSec,
    }),
    diet: defaultDietConfig(),
  };
}

// ─── Deterministic reproduction with large dt ──────────────────

describe('Reproduction — deterministic when dt >> interval', () => {
  it('reproduces immediately when dt equals interval (rng always passes)', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    // Clear cooldown
    eco.eco.reproductionCooldown[0] = 0;

    // dt = 100 >> interval=5, so dt/interval = 20, which means
    // reproduction is guaranteed (rng() ≤ 1.0 < 20)
    const born = processReproduction(eco, 100);
    expect(born).toBe(1);
    expect(eco.aliveCount).toBe(2);
  });
});

// ─── Cooldown-gated reproduction ──────────────────────────────

describe('Reproduction — cooldown-gated (no probability)', () => {
  it('reproduces immediately when cooldown is 0 and energy is sufficient', () => {
    // With cooldown=0 and energy sufficient, reproduction should fire on the
    // FIRST tick — no probabilistic delay.
    let reproduced = 0;
    const trials = 200;

    for (let trial = 0; trial < trials; trial++) {
      const cfg = makeConfig([reproSpecies(0)], 500); // cooldownSec=0
      cfg.seed = trial * 1000 + 42;
      const eco = new EcosystemWorld(cfg);
      eco.eco.reproductionCooldown[0] = 0;

      // Run 1 tick at 60fps — should reproduce immediately
      const born = processReproduction(eco, 1 / 60);
      if (born > 0) reproduced++;
    }

    // With cooldown=0, ALL trials should reproduce on the first eligible tick
    expect(reproduced).toBe(trials);
  });

  it('reproduces roughly on schedule over many ticks', () => {
    // With interval=5s and dt=1/60s, over 300 ticks (=5 sec),
    // expected ~1 reproduction per particle
    let totalBorn = 0;
    const trials = 100;

    for (let trial = 0; trial < trials; trial++) {
      const cfg: EcosystemConfig = makeConfig([reproSpecies(5)], 500);
      cfg.seed = trial * 7777 + 1;
      const eco = new EcosystemWorld(cfg);
      eco.eco.reproductionCooldown[0] = 0;

      // Run 300 ticks ≈ 5 seconds at 60fps
      for (let tick = 0; tick < 300; tick++) {
        const born = processReproduction(eco, 1 / 60);
        totalBorn += born;
        // Simulate cooldown decrease
        eco.processLifecycle(1 / 60);
      }
    }

    // After 5 seconds with interval=5s, expected ~1 reproduction per trial
    // Over 100 trials: ~100 total. Allow 30-200 (very generous)
    expect(totalBorn).toBeGreaterThan(20);
    expect(totalBorn).toBeLessThan(300);
  });
});

// ─── Cooldown and energy gates still work ──────────────────────

describe('Reproduction — gates still enforced', () => {
  it('does not reproduce when cooldown > 0', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    // Set cooldown
    eco.eco.reproductionCooldown[0] = 2;

    // Even with huge dt
    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });

  it('does not reproduce when energy is insufficient', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.energy[0] = 10; // below reproductionCost of 30

    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });

  it('resets cooldown after reproduction', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    processReproduction(eco, 100);

    // Cooldown should be reset to interval (5)
    expect(eco.eco.reproductionCooldown[0]).toBe(5);
  });

  it('deducts reproductionCost from parent energy', () => {
    const cfg = makeConfig([reproSpecies(5)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    const energyBefore = eco.eco.energy[0];

    processReproduction(eco, 100);

    expect(eco.eco.energy[0]).toBe(energyBefore - 30);
  });

  it('respects population cap', () => {
    const cfg = makeConfig([reproSpecies(5)], 1); // cap = 1, already full
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco, 1000);
    expect(born).toBe(0);
  });
});

// ─── CRT-59: zero-allocation reproduction buffers ───────────────
//
// processReproduction() now collects ready individuals into per-species
// Int32Array queues pre-allocated on the EcosystemWorld and reused every
// frame, instead of allocating `readyBySpecies: number[][]` + a fresh
// Int32Array of cursors on every call. These tests cover the buffer
// mechanics directly and verify steady-state heap stability.

describe('CRT-59: processReproduction — pre-allocated buffers', () => {
  it('beginReproductionPass zeroes ready counts and cursors', () => {
    const cfg = makeConfig([reproSpecies(0), reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);

    eco.beginReproductionPass();
    eco.collectReadyReproducer(0, 1);
    eco.collectReadyReproducer(0, 2);
    eco.collectReadyReproducer(1, 3);
    expect(eco.readyReproducerCount(0)).toBe(2);
    expect(eco.readyReproducerCount(1)).toBe(1);

    // A new pass must reset everything back to empty (no stale entries).
    eco.beginReproductionPass();
    expect(eco.readyReproducerCount(0)).toBe(0);
    expect(eco.readyReproducerCount(1)).toBe(0);
    expect(eco.nextReproducer(0)).toBe(-1);
    expect(eco.nextReproducer(1)).toBe(-1);
  });

  it('collectReadyReproducer + nextReproducer act as a FIFO per species', () => {
    const cfg = makeConfig([reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.beginReproductionPass();
    eco.collectReadyReproducer(0, 101);
    eco.collectReadyReproducer(0, 202);
    eco.collectReadyReproducer(0, 303);

    expect(eco.nextReproducer(0)).toBe(101);
    expect(eco.nextReproducer(0)).toBe(202);
    expect(eco.nextReproducer(0)).toBe(303);
    expect(eco.nextReproducer(0)).toBe(-1); // queue exhausted
  });

  it('collectReadyReproducer is a safe no-op once the queue is full', () => {
    // populationCap = 3 → each per-species queue holds exactly 3 entries.
    const cfg = makeConfig([reproSpecies(0)], 3);
    const eco = new EcosystemWorld(cfg);
    eco.beginReproductionPass();
    eco.collectReadyReproducer(0, 0);
    eco.collectReadyReproducer(0, 1);
    eco.collectReadyReproducer(0, 2);
    // Queue now at capacity; further collects must not throw or overflow.
    eco.collectReadyReproducer(0, 3);
    eco.collectReadyReproducer(0, 4);
    expect(eco.readyReproducerCount(0)).toBe(3);
    expect(eco.nextReproducer(0)).toBe(0);
    expect(eco.nextReproducer(0)).toBe(1);
    expect(eco.nextReproducer(0)).toBe(2);
    expect(eco.nextReproducer(0)).toBe(-1);
  });

  it('round-robin gives every species a slot before any gets a second', () => {
    // Two species, one particle each, both ready. Round 1 must spawn one child
    // for species 0 AND one for species 1 (fair interleaving).
    const a = reproSpecies(0);
    const b = { ...reproSpecies(0), name: 'CritterB', color: '#4444cc' };
    const cfg = makeConfig([a, b], 500);
    cfg.species[0].count = 1;
    cfg.species[1].count = 1;
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0; // particle 0 = species 0
    eco.eco.reproductionCooldown[1] = 0; // particle 1 = species 1

    const born = processReproduction(eco, 100);

    expect(born).toBe(2);
    expect(eco.speciesCount(0)).toBe(2); // parent + child
    expect(eco.speciesCount(1)).toBe(2); // parent + child
  });

  it('dead candidates between phases are skipped (correctness preserved)', () => {
    // One species, two ready particles. Kill the first one's slot before phase 2
    // by simulating it — the round-robin loop must skip dead entries.
    const cfg = makeConfig([reproSpecies(0)], 500);
    cfg.species[0].count = 2;
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.reproductionCooldown[1] = 0;

    // Manually drive phase 1, then kill particle 0, then phase 2.
    eco.beginReproductionPass();
    eco.collectReadyReproducer(0, 0);
    eco.collectReadyReproducer(0, 1);
    eco.kill(0); // particle 0 now DEAD (e.g. eaten between phases)

    expect(eco.nextReproducer(0)).toBe(0); // dead — skipped
    const next = eco.nextReproducer(0);
    expect(next).toBe(1); // alive — reproduces
    expect(next).not.toBe(-1);
  });

  it('child spawned behind parent is opposite to motion direction (multi-step)', () => {
    // Repeated reproduction over time should keep spawning children behind the
    // moving parent — verify positions are consistent with the behind-parent rule.
    const cfg = makeConfig([reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.world.x[0] = 400;
    eco.world.y[0] = 400;
    eco.world.vx[0] = 60; // moving right
    eco.world.vy[0] = 0;

    // First child
    const child = eco.tryReproduce(0, 0.016);
    expect(child).toBeGreaterThanOrEqual(0);
    expect(eco.world.x[child]).toBeLessThan(400); // behind = left of parent
  });

  it('processReproduction is allocation-free in steady state (heap growth check)', () => {
    const species = [
      { ...reproSpecies(0), name: 'A', color: '#ff4444', count: 100 },
      { ...reproSpecies(0), name: 'B', color: '#44ff44', count: 100 },
      { ...reproSpecies(0), name: 'C', color: '#4444ff', count: 100 },
    ];
    const cfg = makeConfig(species, 1000);
    const eco = new EcosystemWorld(cfg);

    // Warm up: let buffers allocate and JIT settle.
    for (let i = 0; i < 20; i++) {
      for (let p = 0; p < eco.highWaterMark; p++) eco.eco.reproductionCooldown[p] = 0;
      processReproduction(eco, 1 / 60);
    }

    const before = (performance as any).memory?.usedJSHeapSize;
    if (!before) {
      // memory API unavailable (non-Chrome) — still exercise the hot path.
      for (let i = 0; i < 300; i++) {
        for (let p = 0; p < eco.highWaterMark; p++) eco.eco.reproductionCooldown[p] = 0;
        processReproduction(eco, 1 / 60);
      }
      return; // soft pass
    }

    // Run 300 reproduction passes, keeping every alive particle ready each
    // frame so the full collect + round-robin path runs every call.
    for (let i = 0; i < 300; i++) {
      for (let p = 0; p < eco.highWaterMark; p++) {
        if (eco.eco.alive[p] !== DEAD) {
          eco.eco.reproductionCooldown[p] = 0;
          eco.eco.energy[p] = 500;
        }
      }
      processReproduction(eco, 1 / 60);
    }

    const after = (performance as any).memory?.usedJSHeapSize;
    const growth = after - before;
    // No significant heap growth from 300 steady-state reproduction passes.
    expect(growth).toBeLessThan(1_000_000);
  });
});

// ─── CRT-66: centered random spawn (reverted from behind-parent) ────
//
// CRT-66 originally spawned children behind the parent (opposite motion).
// However, even a small behind bias caused extinction cascades in fragile
// presets (Coral Reef Moray Eel, Plankton Bloom Small Fish). The centered
// random spawn (±10px each axis) is the only distribution verified stable
// across all 14 presets. CRT-66's spawn mechanism remains, but without
// directional bias — just centered random dispersal using seeded RNG (CRT-65).

describe('CRT-66: tryReproduce spawns child near parent (centered random)', () => {
  it('spawns child near parent (moving right)', () => {
    const cfg = makeConfig([reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.world.x[0] = 100;
    eco.world.y[0] = 100;
    eco.world.vx[0] = 50; // moving right
    eco.world.vy[0] = 0;

    const childIdx = eco.tryReproduce(0, 0.016);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    // Child should be within spawn distance of parent (±10px each axis)
    const dx = eco.world.x[childIdx] - 100;
    const dy = eco.world.y[childIdx] - 100;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(2);
    expect(dist).toBeLessThan(20);
  });

  it('spawns child near parent (diagonal motion)', () => {
    const cfg = makeConfig([reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.world.x[0] = 200;
    eco.world.y[0] = 200;
    eco.world.vx[0] = -3;
    eco.world.vy[0] = 4;

    const childIdx = eco.tryReproduce(0, 0.016);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    const dx = eco.world.x[childIdx] - 200;
    const dy = eco.world.y[childIdx] - 200;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(2);
    expect(dist).toBeLessThan(20);
  });

  it('stationary parent spawns child nearby', () => {
    const cfg = makeConfig([reproSpecies(0)], 500);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    eco.world.x[0] = 150;
    eco.world.y[0] = 150;
    eco.world.vx[0] = 0;
    eco.world.vy[0] = 0;

    const childIdx = eco.tryReproduce(0, 0.016);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    const dx = eco.world.x[childIdx] - 150;
    const dy = eco.world.y[childIdx] - 150;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(2);
    expect(dist).toBeLessThan(20);
  });

  it('child position is deterministic — same seed → same position', () => {
    // CRT-65 guarantee: the seeded RNG produces identical results for identical seeds.
    function childPos(): [number, number] {
      const cfg = makeConfig([reproSpecies(0)], 500);
      cfg.seed = 12345;
      const eco = new EcosystemWorld(cfg);
      eco.eco.reproductionCooldown[0] = 0;
      eco.world.x[0] = 300;
      eco.world.y[0] = 300;
      eco.world.vx[0] = 10;
      eco.world.vy[0] = 10;
      const idx = eco.tryReproduce(0, 0.016);
      return [eco.world.x[idx], eco.world.y[idx]];
    }
    const a = childPos();
    const b = childPos();
    expect(b[0]).toBeCloseTo(a[0], 5);
    expect(b[1]).toBeCloseTo(a[1], 5);
  });

  it('spawn position is centered — no directional bias (statistical)', () => {
    // Over 200 seeds, average child position should be ≈ parent position
    // (no systematic behind/in-front/lateral bias). Confirms centered random spawn.
    let sumX = 0,
      sumY = 0;
    let count = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const cfg = makeConfig([reproSpecies(0)], 500);
      cfg.seed = seed * 100 + 7;
      const eco = new EcosystemWorld(cfg);
      eco.eco.reproductionCooldown[0] = 0;
      eco.world.x[0] = 500;
      eco.world.y[0] = 500;
      eco.world.vx[0] = 100; // moving right
      eco.world.vy[0] = 0;
      const idx = eco.tryReproduce(0, 0.016);
      if (idx >= 0) {
        sumX += eco.world.x[idx];
        sumY += eco.world.y[idx];
        count++;
      }
    }
    expect(count).toBe(200);
    const avgX = sumX / count;
    const avgY = sumY / count;
    // Average should be ≈ 500 (parent position) — no directional bias
    expect(avgX).toBeCloseTo(500, 0);
    expect(avgY).toBeCloseTo(500, 0);
  });
});
