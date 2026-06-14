import { describe, it, expect } from 'vitest';
import { processReproduction } from './lifecycle.js';
import { EcosystemWorld } from './ecosystem-world.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  defaultStaminaConfig,
  type EcosystemConfig,
  type StaminaConfig,
  ALIVE,
  DEAD,
} from './ecosystem.js';

// ─── Helpers ─────────────────────────────────────────────────────

function reproConfig(count = 5, cap = 100): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: [
      {
        name: 'Bug',
        count,
        color: '#ff0000',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: defaultEnergyConfig({
          initialEnergy: 100,
          maxEnergy: 200,
          reproductionCost: 30,
        }),
        lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 2 }),
        diet: defaultDietConfig(),
      },
    ],
    interactionRules: [[null]],
  };
}

/** Config tuned for controlled lifecycle testing (stationary, predictable energy). */
function lifecycleConfig(overrides?: {
  count?: number;
  cap?: number;
  maxAgeSec?: number;
  starvationDamagePerSec?: number;
  reproductionCooldownSec?: number;
  initialEnergy?: number;
  maxEnergy?: number;
  reproductionCost?: number;
  idleDrainPerSec?: number;
  movementCostPerSec?: number;
  maxSpeed?: number;
  initialSpeed?: number;
  stamina?: Partial<StaminaConfig>;
}): EcosystemConfig {
  const o = overrides ?? {};
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: o.cap ?? 100,
    species: [
      {
        name: 'Critter',
        count: o.count ?? 3,
        color: '#00ff00',
        radius: 3,
        initialSpeed: o.initialSpeed ?? 0,
        maxSpeed: o.maxSpeed ?? 100,
        energy: defaultEnergyConfig({
          initialEnergy: o.initialEnergy ?? 100,
          maxEnergy: o.maxEnergy ?? 200,
          reproductionCost: o.reproductionCost ?? 30,
          idleDrainPerSec: o.idleDrainPerSec ?? 1,
          movementCostPerSec: o.movementCostPerSec ?? 2,
        }),
        lifecycle: defaultLifecycleConfig({
          maxAgeSec: o.maxAgeSec ?? 60,
          starvationDamagePerSec: o.starvationDamagePerSec ?? 10,
          reproductionCooldownSec: o.reproductionCooldownSec ?? 5,
        }),
        diet: defaultDietConfig(),
        stamina: o.stamina ? defaultStaminaConfig(o.stamina) : undefined,
      },
    ],
    interactionRules: [[null]],
  };
}

/** Set a particle's velocity to exactly (vx, vy) and zero the other. */
function setVelocity(eco: EcosystemWorld, idx: number, vx: number, vy: number): void {
  eco.world.vx[idx] = vx;
  eco.world.vy[idx] = vy;
}

/** Speed (magnitude) of a particle's velocity. */
function speed(eco: EcosystemWorld, idx: number): number {
  return Math.sqrt(eco.world.vx[idx] ** 2 + eco.world.vy[idx] ** 2);
}

// ─── Reproduction (original tests) ───────────────────────────────

describe('processReproduction', () => {
  it('spawns children for eligible particles', () => {
    const cfg = reproConfig(3, 100);
    // Clear cooldown on first particle
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBeGreaterThanOrEqual(1);
    expect(eco.aliveCount).toBeGreaterThan(3);
  });

  it('does not reproduce when at cap', () => {
    const cfg = reproConfig(3, 3);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBe(0);
    expect(eco.aliveCount).toBe(3);
  });

  it('does not reproduce when energy is too low', () => {
    const cfg = reproConfig(1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.eco.energy[0] = 5; // below reproductionCost of 30
    eco.eco.reproductionCooldown[0] = 0;

    const born = processReproduction(eco);
    expect(born).toBe(0);
  });

  it('deducts reproduction cost from parent', () => {
    const cfg = reproConfig(1, 100);
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    const energyBefore = eco.eco.energy[0];

    processReproduction(eco);
    expect(eco.eco.energy[0]).toBe(energyBefore - 30);
  });

  it('does not process newborns in same frame', () => {
    const cfg = reproConfig(2, 100);
    const eco = new EcosystemWorld(cfg);
    // Both have zero cooldown and enough energy
    eco.eco.reproductionCooldown[0] = 0;
    eco.eco.reproductionCooldown[1] = 0;

    const born = processReproduction(eco);
    // Each original can reproduce once, but newborns won't be processed
    // (they start with cooldown > 0)
    expect(born).toBeLessThanOrEqual(2);
  });
});

// ─── Aging ───────────────────────────────────────────────────────

describe('lifecycle: aging', () => {
  it('kills particle when age exceeds maxAgeSec', () => {
    const cfg = lifecycleConfig({ count: 3, maxAgeSec: 5 });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(6); // dt > maxAgeSec
    expect(result.diedOldAge).toBe(3);
    expect(eco.aliveCount).toBe(0);
  });

  it('particle with very large maxAge survives many steps', () => {
    const cfg = lifecycleConfig({
      count: 2,
      maxAgeSec: 10000,
      // Disable energy drain + starvation to isolate aging
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    for (let i = 0; i < 100; i++) {
      eco.processLifecycle(1);
    }
    expect(eco.aliveCount).toBe(2);
  });

  it('maxAgeSec = 0 means immortal (never dies of old age)', () => {
    const cfg = lifecycleConfig({
      count: 2,
      maxAgeSec: 0,
      // Disable energy drain + starvation to isolate aging
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(9999);
    expect(result.diedOldAge).toBe(0);
    expect(eco.aliveCount).toBe(2);
  });

  it('age accumulates correctly across multiple steps', () => {
    const cfg = lifecycleConfig({ count: 1, maxAgeSec: 100 });
    const eco = new EcosystemWorld(cfg);
    eco.processLifecycle(0.5);
    eco.processLifecycle(0.5);
    expect(eco.eco.age[0]).toBeCloseTo(1.0, 5);
  });

  it('particle dies exactly when age reaches maxAgeSec boundary', () => {
    const cfg = lifecycleConfig({ count: 1, maxAgeSec: 5 });
    const eco = new EcosystemWorld(cfg);
    // Age to exactly the limit
    eco.processLifecycle(5);
    expect(eco.eco.alive[0]).toBe(DEAD);
  });
});

// ─── Starvation ──────────────────────────────────────────────────

describe('lifecycle: starvation', () => {
  it('energy at 0 triggers health damage when starvationDamagePerSec > 0', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 5,
    });
    const eco = new EcosystemWorld(cfg);
    const healthBefore = eco.eco.health[0]; // 1.0
    eco.processLifecycle(0.1);
    // health should decrease by 5 * 0.1 = 0.5
    expect(eco.eco.health[0]).toBeCloseTo(healthBefore - 0.5, 5);
    expect(eco.eco.alive[0]).toBe(ALIVE); // health still > 0
  });

  it('energy above 0 does not trigger starvation damage', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 50,
      starvationDamagePerSec: 100,
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 0, 0); // stationary → minimal drain
    const healthBefore = eco.eco.health[0];
    eco.processLifecycle(1);
    // Energy still > 0 (50 - 1 idle drain = 49), so no starvation
    expect(eco.eco.health[0]).toBeCloseTo(healthBefore, 5);
  });

  it('starvation damage is proportional to dt', () => {
    const cfg = lifecycleConfig({
      count: 2,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0.5, // low enough that particles survive both dt values
    });
    const ecoA = new EcosystemWorld(cfg);
    const ecoB = new EcosystemWorld(cfg);
    ecoA.processLifecycle(0.5);
    ecoB.processLifecycle(1.0);
    // ecoB should have taken 2x the damage (both survive at health > 0)
    const damageA = 1.0 - ecoA.eco.health[0];
    const damageB = 1.0 - ecoB.eco.health[0];
    expect(damageB).toBeCloseTo(damageA * 2, 5);
  });

  it('particle dies from starvation when health reaches 0', () => {
    const cfg = lifecycleConfig({
      count: 3,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 100, // 100/sec → 1.0 health gone in 0.01s
    });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(1);
    expect(result.diedStarvation).toBe(3);
    expect(eco.aliveCount).toBe(0);
  });

  it('starvationDamagePerSec = 0 means immune to starvation damage', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(10);
    // Energy is 0 but no starvation damage → particle survives
    expect(result.diedStarvation).toBe(0);
    expect(eco.eco.health[0]).toBeCloseTo(1.0, 5);
    expect(eco.aliveCount).toBe(1);
  });
});

// ─── Energy Drain ────────────────────────────────────────────────

describe('lifecycle: energy drain', () => {
  it('stationary particle pays only idle drain', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 100,
      idleDrainPerSec: 1,
      movementCostPerSec: 2,
      maxSpeed: 100,
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 0, 0); // speed = 0
    const energyBefore = eco.eco.energy[0];
    eco.processLifecycle(1);
    // Only idle: 1/sec * 1s = 1
    expect(eco.eco.energy[0]).toBeCloseTo(energyBefore - 1, 5);
  });

  it('moving particle pays idle + movement cost', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 100,
      idleDrainPerSec: 1,
      movementCostPerSec: 2,
      maxSpeed: 100,
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 100, 0); // speed = maxSpeed
    const energyBefore = eco.eco.energy[0];
    eco.processLifecycle(1);
    // idle (1) + movement (2 * 100/100 * 1 = 2) = 3
    expect(eco.eco.energy[0]).toBeCloseTo(energyBefore - 3, 5);
  });

  it('movement cost is proportional to speed/maxSpeed ratio', () => {
    const cfg = lifecycleConfig({
      count: 2,
      initialEnergy: 100,
      idleDrainPerSec: 0, // isolate movement cost
      movementCostPerSec: 2,
      maxSpeed: 100,
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 50, 0); // half speed
    setVelocity(eco, 1, 100, 0); // full speed
    const e0Before = eco.eco.energy[0];
    const e1Before = eco.eco.energy[1];
    eco.processLifecycle(1);
    const drain0 = e0Before - eco.eco.energy[0]; // 2 * 0.5 = 1
    const drain1 = e1Before - eco.eco.energy[1]; // 2 * 1.0 = 2
    expect(drain1).toBeCloseTo(drain0 * 2, 5);
  });

  it('energy is clamped to 0 (never negative)', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 100,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    // Manually set negative energy
    eco.eco.energy[0] = -50;
    eco.processLifecycle(1);
    expect(eco.eco.energy[0]).toBe(0);
    expect(eco.eco.energy[0]).toBeGreaterThanOrEqual(0);
  });

  it('energy is clamped to maxEnergy (cannot exceed)', () => {
    const cfg = lifecycleConfig({
      count: 1,
      initialEnergy: 100,
      maxEnergy: 100,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    // Manually set energy above max
    eco.eco.energy[0] = 250;
    eco.processLifecycle(0.1);
    expect(eco.eco.energy[0]).toBe(100); // clamped to maxEnergy
  });
});

// ─── Reproduction (additional deep tests) ────────────────────────

describe('lifecycle: reproduction deep tests', () => {
  it('newborn has correct initial energy from species config', () => {
    const cfg = lifecycleConfig({
      count: 1,
      cap: 100,
      initialEnergy: 75,
      maxEnergy: 150,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    const childIdx = eco.tryReproduce(0);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(eco.eco.energy[childIdx]).toBe(75); // species initialEnergy
  });

  it('newborn is spawned near parent position (within offset)', () => {
    const cfg = lifecycleConfig({
      count: 1,
      cap: 100,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0;
    // Set parent at known position
    eco.world.x[0] = 400;
    eco.world.y[0] = 300;
    const childIdx = eco.tryReproduce(0);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    // Offset is ±10 in each axis
    expect(Math.abs(eco.world.x[childIdx] - 400)).toBeLessThanOrEqual(10);
    expect(Math.abs(eco.world.y[childIdx] - 300)).toBeLessThanOrEqual(10);
  });

  it('cooldown minimum enforced at 1 even when config is 0', () => {
    const cfg = lifecycleConfig({
      count: 1,
      cap: 100,
      initialEnergy: 100,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    // reproductionCooldownSec=0 → initial cooldown is rng()*0 = 0
    expect(eco.eco.reproductionCooldown[0]).toBe(0);
    eco.tryReproduce(0);
    // After reproduction, cooldown = max(1, 0) = 1
    expect(eco.eco.reproductionCooldown[0]).toBe(1);
  });

  it('multiple eligible parents all reproduce in one processReproduction call', () => {
    const cfg = lifecycleConfig({
      count: 3,
      cap: 100,
      initialEnergy: 200,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    // Clear all cooldowns
    for (let i = 0; i < 3; i++) eco.eco.reproductionCooldown[i] = 0;
    const born = processReproduction(eco);
    expect(born).toBe(3);
    expect(eco.aliveCount).toBe(6);
  });

  it('reproduction stops at cap when multiple parents compete for last slot', () => {
    const cfg = lifecycleConfig({
      count: 2,
      cap: 3, // only 1 free slot
      initialEnergy: 200,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    for (let i = 0; i < 2; i++) eco.eco.reproductionCooldown[i] = 0;
    const born = processReproduction(eco);
    // Only 1 child possible (cap = 3, 2 alive)
    expect(born).toBe(1);
    expect(eco.aliveCount).toBe(3);
  });

  it('child inherits parent species type', () => {
    const cfg: EcosystemConfig = {
      width: 800,
      height: 600,
      boundaryMode: 'bounce',
      seed: 42,
      populationCap: 100,
      species: [
        {
          name: 'Alpha',
          count: 1,
          color: '#ff0000',
          radius: 4,
          initialSpeed: 50,
          maxSpeed: 100,
          energy: defaultEnergyConfig({
            initialEnergy: 200,
            reproductionCost: 30,
          }),
          lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
          diet: defaultDietConfig(),
        },
        {
          name: 'Beta',
          count: 1,
          color: '#00ff00',
          radius: 3,
          initialSpeed: 50,
          maxSpeed: 100,
          energy: defaultEnergyConfig({
            initialEnergy: 200,
            reproductionCost: 30,
          }),
          lifecycle: defaultLifecycleConfig({ reproductionCooldownSec: 0 }),
          diet: defaultDietConfig(),
        },
      ],
      interactionRules: [
        [null, null],
        [null, null],
      ],
    };
    const eco = new EcosystemWorld(cfg);
    // Particle 0 is species 0, particle 1 is species 1
    const parentType = eco.world.type[0];
    eco.eco.reproductionCooldown[0] = 0;
    const childIdx = eco.tryReproduce(0);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(eco.world.type[childIdx]).toBe(parentType);
  });
});

// ─── Stamina / Sprint ────────────────────────────────────────────

describe('lifecycle: stamina / sprint', () => {
  it('sprint timer decrements each step while moving fast', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: { sprintDurationSec: 5, sprintCooldownSec: 3 },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 100, 0); // at maxSpeed, above 30% threshold
    const timerBefore = eco.eco.sprintTimer[0];
    eco.processStamina(1);
    expect(eco.eco.sprintTimer[0]).toBeCloseTo(timerBefore - 1, 5);
  });

  it('sprint timer pauses when particle is slow (< 30% maxSpeed)', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      stamina: { sprintDurationSec: 5, sprintCooldownSec: 3 },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 10, 0); // speed 10 < 30 (0.3 * 100)
    const timerBefore = eco.eco.sprintTimer[0];
    eco.processStamina(1);
    // Timer should be unchanged (decrement undone)
    expect(eco.eco.sprintTimer[0]).toBeCloseTo(timerBefore, 5);
  });

  it('enters cooldown when sprint timer exhausts', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: { sprintDurationSec: 2, sprintCooldownSec: 3 },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 100, 0);
    eco.processStamina(2); // exhausts sprintDurationSec=2
    expect(eco.eco.sprintTimer[0]).toBe(0);
    expect(eco.eco.sprintCooldown[0]).toBeCloseTo(3, 5);
  });

  it('recovers sprint timer after cooldown completes', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: { sprintDurationSec: 2, sprintCooldownSec: 3 },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 100, 0);
    // Exhaust sprint
    eco.processStamina(2);
    expect(eco.eco.sprintTimer[0]).toBe(0);
    expect(eco.eco.sprintCooldown[0]).toBeCloseTo(3, 5);
    // Wait through cooldown
    eco.processStamina(3);
    expect(eco.eco.sprintCooldown[0]).toBe(0);
    expect(eco.eco.sprintTimer[0]).toBeCloseTo(2, 5); // reset to sprintDurationSec
  });

  it('sprint speed multiplier allows higher velocity during sprint', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: { sprintDurationSec: 5, sprintSpeedMultiplier: 2.0 },
    });
    const eco = new EcosystemWorld(cfg);
    // Set velocity above normal maxSpeed but within sprint limit
    setVelocity(eco, 0, 150, 0); // 150 < 200 (2 * 100)
    eco.processStamina(0.1);
    // Should NOT be clamped (within sprint limit of 200)
    expect(speed(eco, 0)).toBeCloseTo(150, 3);
  });

  it('velocity above sprint limit is clamped during sprint', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: { sprintDurationSec: 5, sprintSpeedMultiplier: 2.0 },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 250, 0); // 250 > 200 (2 * 100)
    eco.processStamina(0.1);
    expect(speed(eco, 0)).toBeCloseTo(200, 3); // clamped to 2 * maxSpeed
  });

  it('tired speed multiplier clamps velocity during cooldown', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      initialSpeed: 100,
      stamina: {
        sprintDurationSec: 1,
        sprintCooldownSec: 5,
        tiredSpeedMultiplier: 0.5,
      },
    });
    const eco = new EcosystemWorld(cfg);
    setVelocity(eco, 0, 100, 0);
    // Exhaust sprint to enter cooldown
    eco.processStamina(1);
    expect(eco.eco.sprintCooldown[0]).toBeGreaterThan(0);
    // Now in tired state — velocity should be clamped to 0.5 * 100 = 50
    setVelocity(eco, 0, 100, 0); // reset to maxSpeed
    eco.processStamina(0.1);
    expect(speed(eco, 0)).toBeCloseTo(50, 3);
  });

  it('default stamina config applied when species.stamina is undefined', () => {
    const cfg = lifecycleConfig({
      count: 1,
      maxSpeed: 100,
      stamina: undefined, // no stamina config
    });
    const eco = new EcosystemWorld(cfg);
    // sprintTimer should be initialized to default (5)
    expect(eco.eco.sprintTimer[0]).toBeCloseTo(5, 5);
    // processStamina should not crash
    setVelocity(eco, 0, 50, 0);
    expect(() => eco.processStamina(1)).not.toThrow();
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────

describe('lifecycle: edge cases', () => {
  it('simultaneous starvation + old age → starvation death takes precedence', () => {
    // When a particle is both starving (health→0) AND past maxAge,
    // the starvation check runs first and claims the death.
    const cfg = lifecycleConfig({
      count: 1,
      maxAgeSec: 1,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 100, // will kill in 0.01s
    });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(2); // age=2 > maxAge=1 AND health→0
    expect(result.diedStarvation).toBe(1);
    expect(result.diedOldAge).toBe(0);
    expect(eco.aliveCount).toBe(0);
  });

  it('starvation + old age but health survives → old age death', () => {
    // When a particle is old AND starving, but starvation damage
    // doesn't bring health to 0 this step, old age claims the death.
    const cfg = lifecycleConfig({
      count: 1,
      maxAgeSec: 1,
      initialEnergy: 0,
      idleDrainPerSec: 0,
      movementCostPerSec: 0,
      starvationDamagePerSec: 0.1, // tiny damage, health stays > 0
    });
    const eco = new EcosystemWorld(cfg);
    const result = eco.processLifecycle(2);
    // health = 1.0 - 0.1*2 = 0.8 > 0, so starvation doesn't kill
    // But age = 2 > maxAge = 1, so old age kills
    expect(result.diedStarvation).toBe(0);
    expect(result.diedOldAge).toBe(1);
  });

  it('dead particle is not processed by lifecycle', () => {
    const cfg = lifecycleConfig({ count: 2, maxAgeSec: 100 });
    const eco = new EcosystemWorld(cfg);
    const ageBefore = eco.eco.age[0];
    const energyBefore = eco.eco.energy[0];
    eco.kill(0);
    eco.processLifecycle(5);
    // Dead particle's age and energy should not have changed
    expect(eco.eco.age[0]).toBe(0); // kill resets age to 0
    expect(eco.eco.energy[0]).toBe(0); // kill resets energy to 0
    // Living particle should have aged
    expect(eco.eco.age[1]).toBeCloseTo(5, 5);
  });

  it('empty world (0 particles) — processLifecycle runs without crash', () => {
    const cfg = lifecycleConfig({ count: 0, cap: 10 });
    const eco = new EcosystemWorld(cfg);
    expect(() => eco.processLifecycle(1)).not.toThrow();
    expect(eco.aliveCount).toBe(0);
  });

  it('tryReproduce on dead particle returns -1 with no side effects', () => {
    const cfg = lifecycleConfig({
      count: 1,
      cap: 100,
      initialEnergy: 200,
      reproductionCost: 30,
      reproductionCooldownSec: 0,
    });
    const eco = new EcosystemWorld(cfg);
    eco.kill(0);
    const result = eco.tryReproduce(0);
    expect(result).toBe(-1);
    expect(eco.aliveCount).toBe(0);
  });

  it('processLifecycle ticks reproduction cooldown down', () => {
    const cfg = lifecycleConfig({
      count: 1,
      reproductionCooldownSec: 10,
    });
    const eco = new EcosystemWorld(cfg);
    // Set a known cooldown
    eco.eco.reproductionCooldown[0] = 5;
    eco.processLifecycle(2);
    expect(eco.eco.reproductionCooldown[0]).toBeCloseTo(3, 5);
  });

  it('reproduction cooldown clamps to 0 (never negative)', () => {
    const cfg = lifecycleConfig({
      count: 1,
      reproductionCooldownSec: 10,
    });
    const eco = new EcosystemWorld(cfg);
    eco.eco.reproductionCooldown[0] = 0.5;
    eco.processLifecycle(1); // would go to -0.5, clamped to 0
    expect(eco.eco.reproductionCooldown[0]).toBe(0);
  });
});
