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

function preset(name: string, description: string, config: CritteriumConfig): EcosystemPreset {
  return { name, description, config };
}

// ─── 1. Classic ──────────────────────────────────────────────

const CLASSIC: EcosystemPreset = preset(
  'Classic',
  'The default ecosystem: Prey flocks and flees, Predator hunts.',
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
          energyGainPerPrey: [0, 0],
        },
        lifecycle: {
          maxAgeSec: 40,
          starvationDamagePerSec: 8,
          reproductionCooldownSec: 3,
        },
        diet: {
          canEat: [],
        },
        stamina: {
          sprintDurationSec: 8,
          sprintCooldownSec: 2,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.6,
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
          energyGainPerPrey: [40, 0],
        },
        lifecycle: {
          maxAgeSec: 60,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 8,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
    ],
    interactionMatrix: [
      /*         Prey     Predator */
      /* Prey     */ [
        { strength: 30, radius: 80, falloff: 'linear' },
        { strength: -80, radius: 120, falloff: 'linear' },
      ],
      /* Predator */ [
        { strength: 60, radius: 150, falloff: 'linear' },
        { strength: -20, radius: 50, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.8 } },
      { type: 'wander', enabled: true, params: { strength: 40, rate: 2.5 } },
    ],
  },
);

// ─── 2. Plankton Bloom ───────────────────────────────────────

const PLANKTON_BLOOM: EcosystemPreset = preset(
  'Plankton Bloom',
  'Deep ocean food chain: Algae, Zooplankton, Small Fish, Big Fish, and Whales.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 77,
      populationCap: 800,
    },
    species: [
      {
        name: 'Algae',
        count: 360,
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
        },
        diet: {
          canEat: [],
        },
      },
      {
        name: 'Zooplankton',
        count: 225,
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
        },
        diet: {
          canEat: [0],
        },
      },
      {
        name: 'Small Fish',
        count: 135,
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
        },
        diet: {
          canEat: [1],
        },
      },
      {
        name: 'Big Fish',
        count: 70,
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
        },
        diet: {
          canEat: [2],
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
        },
        diet: {
          canEat: [3],
        },
      },
    ],
    interactionMatrix: [
      /*           Algae   Zoopl.  SmFish  BigFish Whale  */
      /* Algae   */ [null, null, null, null, null],
      /* Zoopl.  */ [
        { strength: 40, radius: 100, falloff: 'linear' },
        null,
        { strength: -60, radius: 80, falloff: 'linear' },
        { strength: -80, radius: 120, falloff: 'linear' },
        null,
      ],
      /* SmFish  */ [
        null,
        { strength: 50, radius: 100, falloff: 'linear' },
        { strength: 25, radius: 60, falloff: 'linear' },
        { strength: -70, radius: 120, falloff: 'linear' },
        null,
      ],
      /* BigFish */ [
        null,
        null,
        { strength: 60, radius: 150, falloff: 'linear' },
        { strength: -30, radius: 80, falloff: 'linear' },
        { strength: -50, radius: 150, falloff: 'linear' },
      ],
      /* Whale   */ [null, null, null, { strength: 40, radius: 200, falloff: 'linear' }, null],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.6 } },
      { type: 'wander', enabled: true, params: { strength: 30, rate: 2 } },
    ],
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
        },
        diet: {
          canEat: [],
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
        },
        diet: {
          canEat: [],
        },
      },
    ],
    interactionMatrix: [
      /*         Birds     Locusts */
      /* Birds   */ [{ strength: 50, radius: 80, falloff: 'linear' }, null],
      /* Locusts */ [null, { strength: 60, radius: 50, falloff: 'linear' }],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 1.2 } },
      { type: 'wander', enabled: true, params: { strength: 20, rate: 3 } },
    ],
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
        },
        diet: {
          canEat: [1, 2, 3],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
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
        },
        diet: {
          canEat: [2, 3],
        },
        stamina: {
          sprintDurationSec: 4,
          sprintCooldownSec: 4,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.45,
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
        },
        diet: {
          canEat: [],
        },
        stamina: {
          sprintDurationSec: 7,
          sprintCooldownSec: 2,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.6,
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
        },
        diet: {
          canEat: [],
        },
        stamina: {
          sprintDurationSec: 8,
          sprintCooldownSec: 2,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.55,
        },
      },
    ],
    interactionMatrix: [
      /*         Lions    Wolves   Deer     Rabbits */
      /* Lions  */ [
        { strength: -40, radius: 60, falloff: 'linear' },
        { strength: 30, radius: 150, falloff: 'linear' },
        { strength: 70, radius: 180, falloff: 'linear' },
        { strength: 50, radius: 140, falloff: 'linear' },
      ],
      /* Wolves */ [
        { strength: -60, radius: 120, falloff: 'linear' },
        { strength: -25, radius: 50, falloff: 'linear' },
        { strength: 65, radius: 160, falloff: 'linear' },
        { strength: 55, radius: 130, falloff: 'linear' },
      ],
      /* Deer   */ [
        { strength: -90, radius: 150, falloff: 'linear' },
        { strength: -80, radius: 130, falloff: 'linear' },
        { strength: 30, radius: 70, falloff: 'linear' },
        null,
      ],
      /* Rabbits*/ [
        { strength: -70, radius: 120, falloff: 'linear' },
        { strength: -60, radius: 100, falloff: 'linear' },
        null,
        { strength: 20, radius: 40, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.7 } },
      { type: 'wander', enabled: true, params: { strength: 45, rate: 2 } },
    ],
  },
);

// ─── 5. Tiny Pond ────────────────────────────────────────────

const TINY_POND: EcosystemPreset = preset(
  'Tiny Pond',
  'Small ecosystem: Minnows school for safety while Bass pick off stragglers.',
  {
    version: 1,
    simulation: {
      width: 400,
      height: 300,
      boundaryMode: 'wrap',
      seed: 13,
      populationCap: 200,
    },
    species: [
      {
        name: 'Minnows',
        count: 80,
        color: '#88bbff',
        radius: 2,
        initialSpeed: 50,
        maxSpeed: 90,
        energy: {
          maxEnergy: 50,
          initialEnergy: 30,
          movementCostPerSec: 1,
          reproductionCost: 10,
          idleDrainPerSec: 0.5,
          energyGainPerPrey: [0, 0],
        },
        lifecycle: {
          maxAgeSec: 30,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 2,
        },
        diet: {
          canEat: [],
        },
      },
      {
        name: 'Bass',
        count: 8,
        color: '#336633',
        radius: 6,
        initialSpeed: 40,
        maxSpeed: 80,
        energy: {
          maxEnergy: 200,
          initialEnergy: 120,
          movementCostPerSec: 2,
          reproductionCost: 60,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [0, 25],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 3,
          reproductionCooldownSec: 15,
        },
        diet: {
          canEat: [0],
        },
      },
    ],
    interactionMatrix: [
      /*         Minnows  Bass */
      /* Minnows */ [
        { strength: 40, radius: 60, falloff: 'linear' },
        { strength: -100, radius: 100, falloff: 'linear' },
      ],
      /* Bass    */ [
        { strength: 70, radius: 150, falloff: 'linear' },
        { strength: -30, radius: 60, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.7 } },
      { type: 'wander', enabled: true, params: { strength: 25, rate: 2 } },
    ],
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
        },
        diet: {
          canEat: [],
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
        },
        diet: {
          canEat: [],
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
        },
        diet: {
          canEat: [],
        },
      },
    ],
    interactionMatrix: [
      /*           Fireflies  Koi       Leaves  */
      /* Fireflies*/ [{ strength: 15, radius: 60, falloff: 'linear' }, null, null],
      /* Koi      */ [null, null, null],
      /* Leaves   */ [null, null, null],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 2.5 } },
      { type: 'wander', enabled: true, params: { strength: 8, rate: 0.5 } },
    ],
  },
);

// ─── 7. Rock/Paper/Scissors ───────────────────────────────────

const ROCK_PAPER_SCISSORS: EcosystemPreset = preset(
  'Rock Paper Scissors',
  'Three species in cyclic dominance — Rock crushes Scissors, Scissors cut Paper, Paper covers Rock.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 99,
      populationCap: 600,
    },
    species: [
      {
        name: 'Rock',
        count: 60,
        color: '#9e9eae',
        radius: 4,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 40,
          movementCostPerSec: 2,
          reproductionCost: 20,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 0, 30],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 4,
        },
        diet: {
          canEat: [2],
        },
        stamina: {
          sprintDurationSec: 5,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
      {
        name: 'Paper',
        count: 60,
        color: '#f0f0f0',
        radius: 4,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 40,
          movementCostPerSec: 2,
          reproductionCost: 20,
          idleDrainPerSec: 1,
          energyGainPerPrey: [30, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 4,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 5,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
      {
        name: 'Scissors',
        count: 60,
        color: '#ff9933',
        radius: 4,
        initialSpeed: 50,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 40,
          movementCostPerSec: 2,
          reproductionCost: 20,
          idleDrainPerSec: 1,
          energyGainPerPrey: [0, 30, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 4,
        },
        diet: {
          canEat: [1],
        },
        stamina: {
          sprintDurationSec: 5,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
    ],
    // Circular chase/flee: each species chases its prey, flees its predator
    interactionMatrix: [
      /*             Rock         Paper        Scissors  */
      /* Rock     */ [
        { strength: -20, radius: 40, falloff: 'linear' },
        { strength: -60, radius: 100, falloff: 'linear' },
        { strength: 50, radius: 120, falloff: 'linear' },
      ],
      /* Paper    */ [
        { strength: 50, radius: 120, falloff: 'linear' },
        { strength: -20, radius: 40, falloff: 'linear' },
        { strength: -60, radius: 100, falloff: 'linear' },
      ],
      /* Scissors */ [
        { strength: -60, radius: 100, falloff: 'linear' },
        { strength: 50, radius: 120, falloff: 'linear' },
        { strength: -20, radius: 40, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.8 } },
      { type: 'wander', enabled: true, params: { strength: 40, rate: 2.5 } },
    ],
  },
);

// ─── 8. Grasslands (Predator/Prey/Vegetation) ────────────────

const GRASSLANDS: EcosystemPreset = preset(
  'Grasslands',
  'Classic three-tier food web: Grass regrows fast, Rabbits graze, Foxes hunt — a self-sustaining ecosystem.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 42,
      populationCap: 500,
    },
    species: [
      // ── Producer: Grass ──────────────────────────────────────
      {
        name: 'Grass',
        count: 200,
        color: '#3aaa3a',
        radius: 2,
        initialSpeed: 2,
        maxSpeed: 5,
        energy: {
          maxEnergy: 30,
          initialEnergy: 20,
          movementCostPerSec: 0,
          reproductionCost: 5,
          idleDrainPerSec: 0.1,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 60,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 1.5,
        },
        diet: {
          canEat: [],
        },
      },
      // ── Primary consumer: Rabbits ────────────────────────────
      {
        name: 'Rabbits',
        count: 100,
        color: '#d4a373',
        radius: 3,
        initialSpeed: 55,
        maxSpeed: 100,
        energy: {
          maxEnergy: 80,
          initialEnergy: 40,
          movementCostPerSec: 1.5,
          reproductionCost: 20,
          idleDrainPerSec: 1,
          energyGainPerPrey: [15, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 40,
          starvationDamagePerSec: 6,
          reproductionCooldownSec: 3,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 6,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.6,
        },
      },
      // ── Secondary consumer: Foxes ────────────────────────────
      {
        name: 'Foxes',
        count: 15,
        color: '#cc4125',
        radius: 5,
        initialSpeed: 65,
        maxSpeed: 120,
        energy: {
          maxEnergy: 150,
          initialEnergy: 80,
          movementCostPerSec: 2.5,
          reproductionCost: 50,
          idleDrainPerSec: 2,
          energyGainPerPrey: [0, 35, 0],
        },
        lifecycle: {
          maxAgeSec: 70,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 10,
        },
        diet: {
          canEat: [1],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
    ],
    // src=row (how this species reacts to target col)
    //         Grass       Rabbits     Foxes
    interactionMatrix: [
      /* Grass   */ [{ strength: -15, radius: 30, falloff: 'linear' }, null, null],
      /* Rabbits */ [
        { strength: 40, radius: 100, falloff: 'linear' },
        { strength: 20, radius: 50, falloff: 'linear' },
        { strength: -80, radius: 130, falloff: 'linear' },
      ],
      /* Foxes   */ [
        null,
        { strength: 60, radius: 160, falloff: 'linear' },
        { strength: -30, radius: 60, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.8 } },
      { type: 'wander', enabled: true, params: { strength: 35, rate: 2.5 } },
    ],
  },
);

// ─── 9. Birds (Murmuration) ────────────────────────────────────

const BIRDS: EcosystemPreset = preset(
  'Birds',
  'A murmuration at dusk: hundreds of Starlings wheel as one shifting cloud while a lone Hawk picks off stragglers.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 314,
      populationCap: 450,
    },
    species: [
      // ── The flock: Starlings ─────────────────────────────────
      {
        name: 'Starlings',
        count: 350,
        color: '#1b1b2f',
        radius: 2,
        initialSpeed: 45,
        maxSpeed: 95,
        energy: {
          maxEnergy: 160,
          initialEnergy: 90,
          movementCostPerSec: 0.4,
          reproductionCost: 25,
          idleDrainPerSec: 0.2,
          energyGainPerPrey: [0, 0],
        },
        lifecycle: {
          maxAgeSec: 100,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 6,
        },
        diet: {
          canEat: [],
        },
        stamina: {
          sprintDurationSec: 4,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
      // ── The predator: Hawk ───────────────────────────────────
      {
        name: 'Hawk',
        count: 5,
        color: '#8b5a2b',
        radius: 5,
        initialSpeed: 60,
        maxSpeed: 115,
        energy: {
          maxEnergy: 180,
          initialEnergy: 100,
          movementCostPerSec: 2,
          reproductionCost: 70,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [35, 0],
        },
        lifecycle: {
          maxAgeSec: 90,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 20,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
    ],
    // src=row (how this species reacts to target col)
    //         Starlings    Hawk
    interactionMatrix: [
      /* Starlings */ [
        { strength: 55, radius: 100, falloff: 'linear' },
        { strength: -95, radius: 140, falloff: 'linear' },
      ],
      /* Hawk      */ [
        { strength: 70, radius: 170, falloff: 'linear' },
        { strength: -35, radius: 90, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.7 } },
      { type: 'wander', enabled: true, params: { strength: 25, rate: 2.5 } },
    ],
  },
);

// ─── 10. Fishes (Coral Reef) ─────────────────────────────────

const FISHES: EcosystemPreset = preset(
  'Fishes',
  'A living coral reef: Tetras school for safety, Cleaner Wrasse tag along with predators in a rare symbiosis, and Barracuda hunt — but never the fish that cleans them.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 271,
      populationCap: 450,
    },
    species: [
      // ── Schooling prey: Tetras ────────────────────────────────
      {
        name: 'Tetras',
        count: 250,
        color: '#2e86de',
        radius: 2,
        initialSpeed: 40,
        maxSpeed: 85,
        energy: {
          maxEnergy: 120,
          initialEnergy: 60,
          movementCostPerSec: 0.8,
          reproductionCost: 15,
          idleDrainPerSec: 0.4,
          energyGainPerPrey: [0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 3,
          reproductionCooldownSec: 4,
        },
        diet: {
          canEat: [],
        },
      },
      // ── Symbiotic cleaner: Cleaner Wrasse ─────────────────────
      {
        name: 'Cleaner Wrasse',
        count: 12,
        color: '#feca57',
        radius: 3,
        initialSpeed: 35,
        maxSpeed: 70,
        energy: {
          maxEnergy: 100,
          initialEnergy: 50,
          movementCostPerSec: 1,
          reproductionCost: 30,
          idleDrainPerSec: 0.5,
          energyGainPerPrey: [20, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 90,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 12,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 5,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
      // ── Apex predator: Barracuda ──────────────────────────────
      {
        name: 'Barracuda',
        count: 10,
        color: '#7f8c8d',
        radius: 6,
        initialSpeed: 55,
        maxSpeed: 120,
        energy: {
          maxEnergy: 200,
          initialEnergy: 100,
          movementCostPerSec: 2.5,
          reproductionCost: 70,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [35, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 100,
          starvationDamagePerSec: 3,
          reproductionCooldownSec: 15,
        },
        diet: {
          canEat: [0],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
    ],
    // src=row (how this species reacts to target col)
    //         Tetras        Wrasse       Barracuda
    interactionMatrix: [
      /* Tetras    */ [
        { strength: 40, radius: 80, falloff: 'linear' },
        null,
        { strength: -85, radius: 130, falloff: 'linear' },
      ],
      /* Wrasse    */ [null, null, { strength: 30, radius: 90, falloff: 'linear' }],
      /* Barracuda */ [
        { strength: 60, radius: 150, falloff: 'linear' },
        null,
        { strength: -25, radius: 70, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.7 } },
      { type: 'wander', enabled: true, params: { strength: 30, rate: 2.5 } },
    ],
  },
);

// ─── 11. Coral Reef ──────────────────────────────────────────

const CORAL_REEF: EcosystemPreset = preset(
  'Coral Reef',
  'A vibrant reef food chain: stationary Coral feeds Zooplankton, which nourish schooling Clownfish, hunted by Moray Eels, themselves preyed upon by solitary Reef Sharks. A gentle turbulence current sweeps through.',
  {
    version: 1,
    simulation: {
      width: 800,
      height: 600,
      boundaryMode: 'wrap',
      seed: 314,
      populationCap: 500,
    },
    species: [
      // ── Producer: Coral (effectively stationary) ───────────────
      // NOTE: The backlog spec requested maxSpeed = 0 (truly stationary),
      // but ecosystem-world.ts divides by maxSpeed when computing movement
      // cost (speed / maxSpeed), so maxSpeed = 0 causes division by zero.
      // We follow the established Grasslands convention (Grass = maxSpeed 5)
      // and use the lowest safe value. Coral also starts at rest (initialSpeed 0).
      {
        name: 'Coral',
        count: 150,
        color: '#ff6b6b',
        radius: 4,
        initialSpeed: 0,
        maxSpeed: 5,
        energy: {
          maxEnergy: 40,
          initialEnergy: 25,
          movementCostPerSec: 0.1,
          reproductionCost: 10,
          idleDrainPerSec: 0.1,
          energyGainPerPrey: [0, 0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 200,
          starvationDamagePerSec: 1,
          reproductionCooldownSec: 3,
        },
        diet: {
          canEat: [],
        },
      },
      // ── Primary consumer: Zooplankton (tiny, slow) ────────────
      {
        name: 'Zooplankton',
        count: 120,
        color: '#74b9ff',
        radius: 2,
        initialSpeed: 15,
        maxSpeed: 35,
        energy: {
          maxEnergy: 40,
          initialEnergy: 20,
          movementCostPerSec: 0.5,
          reproductionCost: 10,
          idleDrainPerSec: 0.4,
          energyGainPerPrey: [12, 0, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 25,
          starvationDamagePerSec: 5,
          reproductionCooldownSec: 3,
        },
        diet: {
          canEat: [0],
        },
      },
      // ── Secondary consumer: Clownfish (schooling) ─────────────
      {
        name: 'Clownfish',
        count: 90,
        color: '#ffa502',
        radius: 3,
        initialSpeed: 35,
        maxSpeed: 75,
        energy: {
          maxEnergy: 90,
          initialEnergy: 45,
          movementCostPerSec: 1.2,
          reproductionCost: 20,
          idleDrainPerSec: 0.8,
          energyGainPerPrey: [0, 25, 0, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 50,
          starvationDamagePerSec: 4,
          reproductionCooldownSec: 6,
        },
        diet: {
          canEat: [1],
        },
        stamina: {
          sprintDurationSec: 5,
          sprintCooldownSec: 3,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.5,
        },
      },
      // ── Tertiary consumer: Moray Eel (fast predator) ──────────
      {
        name: 'Moray Eel',
        count: 25,
        color: '#2d3436',
        radius: 5,
        initialSpeed: 45,
        maxSpeed: 100,
        energy: {
          maxEnergy: 160,
          initialEnergy: 90,
          movementCostPerSec: 2,
          reproductionCost: 50,
          idleDrainPerSec: 1.5,
          energyGainPerPrey: [0, 0, 40, 0, 0],
        },
        lifecycle: {
          maxAgeSec: 80,
          starvationDamagePerSec: 3,
          reproductionCooldownSec: 12,
        },
        diet: {
          canEat: [2],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 5,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
      // ── Apex predator: Reef Shark (solitary) ──────────────────
      {
        name: 'Reef Shark',
        count: 8,
        color: '#636e72',
        radius: 7,
        initialSpeed: 50,
        maxSpeed: 115,
        energy: {
          maxEnergy: 220,
          initialEnergy: 130,
          movementCostPerSec: 2.5,
          reproductionCost: 80,
          idleDrainPerSec: 2,
          energyGainPerPrey: [0, 0, 0, 55, 0],
        },
        lifecycle: {
          maxAgeSec: 120,
          starvationDamagePerSec: 2.5,
          reproductionCooldownSec: 20,
        },
        diet: {
          canEat: [3],
        },
        stamina: {
          sprintDurationSec: 3,
          sprintCooldownSec: 6,
          sprintSpeedMultiplier: 1.0,
          tiredSpeedMultiplier: 0.4,
        },
      },
    ],
    // src=row (how this species reacts to target col)
    //          Coral    Zoopl.   Clown    Eel      Shark
    interactionMatrix: [
      /* Coral   */ [null, null, null, null, null],
      /* Zoopl.  */ [
        { strength: 35, radius: 90, falloff: 'linear' },
        null,
        { strength: -50, radius: 110, falloff: 'linear' },
        null,
        null,
      ],
      /* Clown   */ [
        null,
        { strength: 50, radius: 100, falloff: 'linear' },
        { strength: 30, radius: 70, falloff: 'linear' },
        { strength: -70, radius: 130, falloff: 'linear' },
        null,
      ],
      /* Eel     */ [
        null,
        null,
        { strength: 55, radius: 140, falloff: 'linear' },
        { strength: -20, radius: 60, falloff: 'linear' },
        { strength: -40, radius: 100, falloff: 'linear' },
      ],
      /* Shark   */ [
        null,
        null,
        null,
        { strength: 45, radius: 170, falloff: 'linear' },
        { strength: -35, radius: 80, falloff: 'linear' },
      ],
    ],
    forces: [
      { type: 'drag', enabled: true, params: { coefficient: 0.6 } },
      { type: 'wander', enabled: true, params: { strength: 20, rate: 2 } },
      {
        type: 'flow-field',
        enabled: true,
        params: { strength: 15, mode: 'turbulence', angle: 0, turbulenceScale: 0.02 },
      },
    ],
  },
);

// ─── Export all presets ───────────────────────────────────────

export const BUILTIN_PRESETS: EcosystemPreset[] = [
  CLASSIC,
  PLANKTON_BLOOM,
  SWARM_INTELLIGENCE,
  PREDATOR_ARENA,
  TINY_POND,
  ZEN_GARDEN,
  ROCK_PAPER_SCISSORS,
  GRASSLANDS,
  BIRDS,
  FISHES,
  CORAL_REEF,
];

export const BUILTIN_PRESET_NAMES: string[] = BUILTIN_PRESETS.map((p) => p.name);

export function getBuiltinPreset(name: string): EcosystemPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.name === name);
}
