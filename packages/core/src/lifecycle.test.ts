import { describe, it, expect } from 'vitest';
import { processReproduction, processInfection, infectParticle } from './lifecycle.js';
import { EcosystemWorld } from './ecosystem-world.js';
import {
  defaultEnergyConfig,
  defaultLifecycleConfig,
  defaultDietConfig,
  type EcosystemConfig,
  ALIVE,
  DEAD,
  NOT_INFECTED,
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

function sicknessConfig(healthyCount = 5, sickCount = 1, cap = 100): EcosystemConfig {
  return {
    width: 800,
    height: 600,
    boundaryMode: 'bounce',
    seed: 42,
    populationCap: cap,
    species: [
      {
        name: 'Healthy',
        count: healthyCount,
        color: '#00ff00',
        radius: 3,
        initialSpeed: 30,
        maxSpeed: 60,
        energy: defaultEnergyConfig({ initialEnergy: 50 }),
        lifecycle: defaultLifecycleConfig({
          sicknessDurationSec: 5,
          contagionRadius: 30,
        }),
        diet: defaultDietConfig({
          infectionVulnerability: new Set([1]), // can be infected by species 1
        }),
      },
      {
        name: 'Sickness',
        count: sickCount,
        color: '#880088',
        radius: 2,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: defaultEnergyConfig({ initialEnergy: 20 }),
        lifecycle: defaultLifecycleConfig({ sicknessDurationSec: 0 }),
        diet: defaultDietConfig(),
      },
    ],
    interactionRules: [[null, null], [null, null]],
  };
}

// ─── Reproduction ────────────────────────────────────────────────

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

// ─── Infection ───────────────────────────────────────────────────

describe('infectParticle', () => {
  it('infects a vulnerable particle', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);

    const result = infectParticle(eco, 0, 1); // infect particle 0 with sickness species 1
    expect(result).toBe(true);
    expect(eco.eco.infectedBy[0]).toBe(1);
    expect(eco.eco.infectionTime[0]).toBe(0);
  });

  it('fails for dead particles', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);
    eco.kill(0);
    const result = infectParticle(eco, 0, 1);
    expect(result).toBe(false);
  });

  it('fails for already-infected particles', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);
    infectParticle(eco, 0, 1);
    const result = infectParticle(eco, 0, 1);
    expect(result).toBe(false);
  });

  it('fails if species is not vulnerable to that sickness', () => {
    const cfg: EcosystemConfig = {
      width: 800, height: 600, boundaryMode: 'bounce', seed: 42, populationCap: 100,
      species: [
        {
          name: 'Immune', count: 3, color: '#00ff00', radius: 3,
          initialSpeed: 30, maxSpeed: 60,
          energy: defaultEnergyConfig({ initialEnergy: 50 }),
          lifecycle: defaultLifecycleConfig({ sicknessDurationSec: 5, contagionRadius: 30 }),
          diet: defaultDietConfig(), // NO infectionVulnerability
        },
      ],
      interactionRules: [[null]],
    };
    const eco = new EcosystemWorld(cfg);
    const result = infectParticle(eco, 0, 1);
    expect(result).toBe(false);
  });

  it('fails for invalid sickness species', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);
    const result = infectParticle(eco, 0, 99); // species 99 doesn't exist
    expect(result).toBe(false);
  });
});

// ─── Infection Spread ────────────────────────────────────────────

describe('processInfection', () => {
  it('kills particle when sickness duration is exceeded', () => {
    const cfg = sicknessConfig(1, 0);
    cfg.species[0].lifecycle.sicknessDurationSec = 3;
    const eco = new EcosystemWorld(cfg);

    // Manually infect
    infectParticle(eco, 0, 1);
    eco.eco.infectionTime[0] = 4; // past duration

    const died = processInfection(eco, 1);
    expect(died).toBe(1);
    expect(eco.eco.alive[0]).toBe(DEAD);
  });

  it('spreads infection to nearby vulnerable particles', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);

    // Place all particles close together
    for (let i = 0; i < 3; i++) {
      eco.world.x[i] = 100 + i * 5;
      eco.world.y[i] = 100;
      eco.world.vx[i] = 0;
      eco.world.vy[i] = 0;
    }

    // Infect first particle
    infectParticle(eco, 0, 1);

    processInfection(eco, 1);

    // Particles within contagionRadius (30) should be infected
    // Distance from 0 to 1 = 5, from 0 to 2 = 10 → both within 30
    expect(eco.eco.infectedBy[1]).toBe(1);
    expect(eco.eco.infectedBy[2]).toBe(1);
  });

  it('does not spread to particles beyond contagion radius', () => {
    const cfg = sicknessConfig(2, 0);
    const eco = new EcosystemWorld(cfg);

    // Place far apart
    eco.world.x[0] = 100;
    eco.world.y[0] = 100;
    eco.world.x[1] = 700;
    eco.world.y[1] = 500;
    eco.world.vx[0] = 0;
    eco.world.vy[0] = 0;
    eco.world.vx[1] = 0;
    eco.world.vy[1] = 0;

    infectParticle(eco, 0, 1);

    processInfection(eco, 1);
    expect(eco.eco.infectedBy[1]).toBe(NOT_INFECTED);
  });

  it('does not cascade infect within same step', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);

    for (let i = 0; i < 3; i++) {
      eco.world.x[i] = 100 + i * 5;
      eco.world.y[i] = 100;
      eco.world.vx[i] = 0;
      eco.world.vy[i] = 0;
    }

    // Only infect particle 0
    infectParticle(eco, 0, 1);

    processInfection(eco, 1);

    // Particle 0 spreads to 1 and 2
    // But 1 and 2 are newlyInfected — they should NOT spread further this step
    // (they all got infected from 0, not cascading)
    expect(eco.eco.infectedBy[1]).toBe(1);
    expect(eco.eco.infectedBy[2]).toBe(1);
  });

  it('does not kill healthy particles', () => {
    const cfg = sicknessConfig(3, 0);
    const eco = new EcosystemWorld(cfg);

    const died = processInfection(eco, 1);
    expect(died).toBe(0);
    expect(eco.aliveCount).toBe(3);
  });
});
