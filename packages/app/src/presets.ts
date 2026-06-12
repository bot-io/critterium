/**
 * Critterium — Built-in Ecosystem Presets
 *
 * Ready-to-use configurations that produce interesting emergent behavior.
 * Each preset is a CritteriumConfig-compatible object that can be loaded
 * via the deserializeConfig → applyConfig pipeline.
 *
 * Species counts use energyGainPerPrey arrays sized to the number of species
 * in that preset. Arrays are used (not Sets) because these are JSON objects.
 */

import type { CritteriumConfig } from '@critterium/core';

// ─── Preset Type ─────────────────────────────────────────────

export interface EcosystemPreset {
  name: string;
  description: string;
  config: CritteriumConfig;
}

// ─── Helpers ─────────────────────────────────────────────────

function preset(
  name: string,
  description: string,
  config: CritteriumConfig,
): EcosystemPreset {
  return { name, description, config };
}

// ─── 1. Classic ──────────────────────────────────────────────

const CLASSIC: EcosystemPreset = preset(
  'Classic',
  'The default ecosystem: Prey flocks and flees, Predator hunts, Parasite infects.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 42,
      populationCap: 600,
    },
    species: [
      {
        name: 'Prey',
        count: 120,
        color: '#44cc44',
        radius: 3,
        initialSpeed: 60,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 40,
          movementCostPerSec: 2,
          reproductionCost: 20,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 40,
          starvationDamagePerSec: 8,
          reproductionCooldownSec: 3,
          sicknessDurationSec: 8,
          contagionRadius: 15,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [2],
        },
      },
      {
        name: 'Predator',
        count: 40,
        color: '#ff4444',
        radius: 5,
        initialSpeed: 70,
        maxSpeed: 130,
        energy: {
          maxEnergy: 150,
          initialEnergy: 80,
          movementCostPerSec: 3,
          reproductionCost: 50,
          idleDrainPerSec: 2,
          energyGainPerPrey: [40, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 60,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 8,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [0],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Parasite',
        count: 40,
        color: '#cc44cc',
        radius: 4,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: {
          maxEnergy: 100,
          initialEnergy: 50,
          movementCostPerSec: 1,
          reproductionCost: 30,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 30,
          starvationDamagePerSec: 10,
          reproductionCooldownSec: 5,
          sicknessDurationSec: 0,
          contagionRadius: 25,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*         Prey     Predator  Parasite */
      /* Prey     */ [{ strength: 30, radius: 80, falloff: 'linear' }, { strength: -80, radius: 120, falloff: 'linear' }, { strength: -40, radius: 80, falloff: 'linear' }],
      /* Predator */ [{ strength: 60, radius: 150, falloff: 'linear' }, { strength: -20, radius: 50, falloff: 'linear' }, null],
      /* Parasite */ [{ strength: 50, radius: 120, falloff: 'linear' }, null, { strength: -15, radius: 40, falloff: 'linear' }],
    ],
    forces: {
      drag: { coefficient: 0.8 },
      wander: { strength: 40, rate: 2.5 },
    },
  },
);

// ─── 2. Plankton Bloom ───────────────────────────────────────

const PLANKTON_BLOOM: EcosystemPreset = preset(
  'Plankton Bloom',
  'Deep ocean food chain: 885 particles from Algae to Whales.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 77,
      populationCap: 1200,
    },
    species: [
      {
        name: 'Algae',
        count: 400,
        color: '#22dd22',
        radius: 2,
        initialSpeed: 10,
        maxSpeed: 20,
        energy: {
          maxEnergy: 30,
          initialEnergy: 15,
          movementCostPerSec: 0.2,
          reproductionCost: 8,
          idleDrainPerSec: 0.3,
          energyGainPerPrey: [0, 0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 20,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 2,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Zooplankton',
        count: 250,
        color: '#4488ff',
        radius: 3,
        initialSpeed: 30,
        maxSpeed: 60,
        energy: {
          maxEnergy: 60,
          initialEnergy: 30,
          movementCostPerSec: 1,
          reproductionCost: 15,
          idleDrainPerSec: 0.8,
          energyGainPerPrey: [20, 0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 30,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 4,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [0],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Small Fish',
        count: 150,
        color: '#eedd44',
        radius: 4,
        initialSpeed: 50,
        maxSpeed: 90,
        energy: {
          maxEnergy: 100,
          initialEnergy: 50,
          movementCostPerSec: 2,
          reproductionCost: 25,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [0, 30, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 6,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [1],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Big Fish',
        count: 80,
        color: '#ff8833',
        radius: 6,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: {
          maxEnergy: 200,
          initialEnergy: 100,
          movementCostPerSec: 3,
          reproductionCost: 60,
          idleDrainPerSec: 2,
          energyGainPerPrey: [0, 0, 50, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 12,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [2],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Whale',
        count: 5,
        color: '#888899',
        radius: 10,
        initialSpeed: 15,
        maxSpeed: 35,
        energy: {
          maxEnergy: 500,
          initialEnergy: 300,
          movementCostPerSec: 1.5,
          reproductionCost: 200,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 0, 0, 80, 0],
        },
        lifecycle: {
          maxAgeSec: 200,
          starvationDamagePerSec: 2,
          reproductionCooldownSec: 30,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [3],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*           Algae   Zoopl.  SmFish  BigFish Whale  */
      /* Algae   */ [null, null, null, null, null],
      /* Zoopl.  */ [{ strength: 40, radius: 100, falloff: 'linear' }, null, { strength: -60, radius: 80, falloff: 'linear' }, { strength: -80, radius: 120, falloff: 'linear' }, null],
      /* SmFish  */ [null, { strength: 50, radius: 100, falloff: 'linear' }, { strength: 25, radius: 60, falloff: 'linear' }, { strength: -70, radius: 120, falloff: 'linear' }, null],
      /* BigFish */ [null, null, { strength: 60, radius: 150, falloff: 'linear' }, { strength: -30, radius: 80, falloff: 'linear' }, { strength: -50, radius: 150, falloff: 'linear' }],
      /* Whale   */ [null, null, null, { strength: 40, radius: 200, falloff: 'linear' }, null],
    ],
    forces: {
      drag: { coefficient: 0.6 },
      wander: { strength: 30, rate: 2 },
    },
  },
);

// ─── 3. Swarm Intelligence ───────────────────────────────────

const SWARM_INTELLIGENCE: EcosystemPreset = preset(
  'Swarm Intelligence',
  'Pure flocking: 700 Birds and Locusts with strong alignment forces. No eating, no infection.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 123,
      populationCap: 800,
    },
    species: [
      {
        name: 'Birds',
        count: 300,
        color: '#eeeeff',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 90,
        energy: {
          maxEnergy: 200,
          initialEnergy: 100,
          movementCostPerSec: 0.5,
          reproductionCost: 40,
          idleDrainPerSec: 0.2,
          energyGainPerPrey: [0, 0],
        },
        lifecycle: {
          maxAgeSec: 120,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 10,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Locusts',
        count: 400,
        color: '#8b6914',
        radius: 2,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: {
          maxEnergy: 150,
          initialEnergy: 75,
          movementCostPerSec: 0.3,
          reproductionCost: 20,
          idleDrainPerSec: 0.15,
          energyGainPerPrey: [0, 0],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 5,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*         Birds     Locusts */
      /* Birds   */ [{ strength: 50, radius: 80, falloff: 'linear' }, null],
      /* Locusts */ [null, { strength: 60, radius: 50, falloff: 'linear' }],
    ],
    forces: {
      drag: { coefficient: 1.2 },
      wander: { strength: 20, rate: 3 },
    },
  },
);

// ─── 4. Predator Arena ───────────────────────────────────────

const PREDATOR_ARENA: EcosystemPreset = preset(
  'Predator Arena',
  'Rock-paper-scissors dynamics: Lions, Wolves, Deer, and Rabbits in a territorial battleground.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 55,
      populationCap: 400,
    },
    species: [
      {
        name: 'Lions',
        count: 30,
        color: '#ffd700',
        radius: 6,
        initialSpeed: 55,
        maxSpeed: 110,
        energy: {
          maxEnergy: 250,
          initialEnergy: 150,
          movementCostPerSec: 3,
          reproductionCost: 80,
          idleDrainPerSec: 2.5,
          energyGainPerPrey: [0, 50, 60, 30],
        },
        lifecycle: {
          maxAgeSec: 100,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 15,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [1, 2, 3],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Wolves',
        count: 40,
        color: '#c0c0c0',
        radius: 5,
        initialSpeed: 65,
        maxSpeed: 120,
        energy: {
          maxEnergy: 200,
          initialEnergy: 100,
          movementCostPerSec: 2.5,
          reproductionCost: 60,
          idleDrainPerSec: 2,
          energyGainPerPrey: [0, 0, 45, 25],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 10,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [2, 3],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Deer',
        count: 80,
        color: '#8b6914',
        radius: 4,
        initialSpeed: 60,
        maxSpeed: 110,
        energy: {
          maxEnergy: 100,
          initialEnergy: 50,
          movementCostPerSec: 2,
          reproductionCost: 25,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 5,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Rabbits',
        count: 120,
        color: '#ffffff',
        radius: 3,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: {
          maxEnergy: 60,
          initialEnergy: 30,
          movementCostPerSec: 1,
          reproductionCost: 12,
          idleDrainPerSec: 0.5,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 25,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 2,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*         Lions    Wolves   Deer     Rabbits */
      /* Lions  */ [{ strength: -40, radius: 60, falloff: 'linear' }, { strength: 30, radius: 150, falloff: 'linear' }, { strength: 70, radius: 180, falloff: 'linear' }, { strength: 50, radius: 140, falloff: 'linear' }],
      /* Wolves */ [{ strength: -60, radius: 120, falloff: 'linear' }, { strength: -25, radius: 50, falloff: 'linear' }, { strength: 65, radius: 160, falloff: 'linear' }, { strength: 55, radius: 130, falloff: 'linear' }],
      /* Deer   */ [{ strength: -90, radius: 150, falloff: 'linear' }, { strength: -80, radius: 130, falloff: 'linear' }, { strength: 30, radius: 70, falloff: 'linear' }, null],
      /* Rabbits*/ [{ strength: -70, radius: 120, falloff: 'linear' }, { strength: -60, radius: 100, falloff: 'linear' }, null, { strength: 20, radius: 40, falloff: 'linear' }],
    ],
    forces: {
      drag: { coefficient: 0.7 },
      wander: { strength: 45, rate: 2 },
    },
  },
);

// ─── 5. Sick World ───────────────────────────────────────────

const SICK_WORLD: EcosystemPreset = preset(
  'Sick World',
  'Infection outbreak: Zombies chase the Healthy, Carriers spread silently, Healers try to cure.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 666,
      populationCap: 350,
    },
    species: [
      {
        name: 'Healthy',
        count: 150,
        color: '#44cc44',
        radius: 4,
        initialSpeed: 50,
        maxSpeed: 90,
        energy: {
          maxEnergy: 100,
          initialEnergy: 60,
          movementCostPerSec: 1.5,
          reproductionCost: 25,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 60,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 5,
          sicknessDurationSec: 10,
          contagionRadius: 20,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [2],
        },
      },
      {
        name: 'Carriers',
        count: 50,
        color: '#dddd44',
        radius: 4,
        initialSpeed: 35,
        maxSpeed: 70,
        energy: {
          maxEnergy: 150,
          initialEnergy: 100,
          movementCostPerSec: 0.5,
          reproductionCost: 30,
          idleDrainPerSec: 0.3,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 100,
          starvationDamagePerSec: 2,
          reproductionCooldownSec: 8,
          sicknessDurationSec: 0,
          contagionRadius: 30,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Zombies',
        count: 20,
        color: '#aa2222',
        radius: 5,
        initialSpeed: 30,
        maxSpeed: 60,
        energy: {
          maxEnergy: 200,
          initialEnergy: 150,
          movementCostPerSec: 0.5,
          reproductionCost: 50,
          idleDrainPerSec: 0.5,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 120,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 0,
          sicknessDurationSec: 0,
          contagionRadius: 25,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Healers',
        count: 30,
        color: '#44dddd',
        radius: 3,
        initialSpeed: 55,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 50,
          movementCostPerSec: 2,
          reproductionCost: 30,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 8,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*          Healthy  Carriers Zombies  Healers */
      /* Healthy */ [null, null, { strength: -70, radius: 100, falloff: 'linear' }, { strength: 30, radius: 80, falloff: 'linear' }],
      /* Carriers*/ [null, null, null, null],
      /* Zombies */ [{ strength: 80, radius: 150, falloff: 'linear' }, null, { strength: -20, radius: 50, falloff: 'linear' }, { strength: -40, radius: 80, falloff: 'linear' }],
      /* Healers */ [null, { strength: 50, radius: 100, falloff: 'linear' }, { strength: 60, radius: 120, falloff: 'linear' }, null],
    ],
    forces: {
      drag: { coefficient: 0.8 },
      wander: { strength: 35, rate: 2 },
    },
  },
);

// ─── 6. Zen Garden ───────────────────────────────────────────

const ZEN_GARDEN: EcosystemPreset = preset(
  'Zen Garden',
  'Calm and meditative: Fireflies glow, Koi drift gracefully, Leaves float on still water.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 999,
      populationCap: 200,
    },
    species: [
      {
        name: 'Fireflies',
        count: 100,
        color: '#ffdd55',
        radius: 2,
        initialSpeed: 8,
        maxSpeed: 20,
        energy: {
          maxEnergy: 200,
          initialEnergy: 100,
          movementCostPerSec: 0.1,
          reproductionCost: 30,
          idleDrainPerSec: 0.1,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 150,
          starvationDamagePerSec: 0.5,
          reproductionCooldownSec: 15,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Koi',
        count: 15,
        color: '#ff8833',
        radius: 5,
        initialSpeed: 12,
        maxSpeed: 25,
        energy: {
          maxEnergy: 500,
          initialEnergy: 300,
          movementCostPerSec: 0.2,
          reproductionCost: 100,
          idleDrainPerSec: 0.1,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 300,
          starvationDamagePerSec: 0.3,
          reproductionCooldownSec: 40,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
      {
        name: 'Leaves',
        count: 60,
        color: '#8b6914',
        radius: 3,
        initialSpeed: 2,
        maxSpeed: 8,
        energy: {
          maxEnergy: 300,
          initialEnergy: 200,
          movementCostPerSec: 0,
          reproductionCost: 50,
          idleDrainPerSec: 0.05,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 200,
          starvationDamagePerSec: 0.2,
          reproductionCooldownSec: 20,
          sicknessDurationSec: 0,
          contagionRadius: 0,
        },
        diet: {
          canEat: [],
          infectionVulnerability: [],
        },
      },
    ],
    interactionMatrix: [
      /*           Fireflies  Koi       Leaves  */
      /* Fireflies*/ [{ strength: 15, radius: 60, falloff: 'linear' }, null, null],
      /* Koi      */ [null, null, null],
      /* Leaves   */ [null, null, null],
    ],
    forces: {
      drag: { coefficient: 2.5 },
      wander: { strength: 8, rate: 0.5 },
    },
  },
);

// ─── Export all presets ───────────────────────────────────────

export const BUILTIN_PRESETS: EcosystemPreset[] = [
  CLASSIC,
  PLANKTON_BLOOM,
  SWARM_INTELLIGENCE,
  PREDATOR_ARENA,
  SICK_WORLD,
  ZEN_GARDEN,
];

export const BUILTIN_PRESET_NAMES: string[] = BUILTIN_PRESETS.map((p) => p.name);

export function getBuiltinPreset(name: string): EcosystemPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.name === name);
}
