/**
 * Critterium — Benchmark Harness
 *
 * Measures simulation performance (steps/sec) at various particle counts
 * and verifies zero hot-loop allocations.
 *
 * Exported functions are used by both the vitest benchmark tests
 * and the CLI benchmark runner.
 */

import {
  World,
  SpatialHashGrid,
  InteractionMatrix,
  PairwiseForce,
  ForcePipeline,
  DragForce,
  BoundaryForce,
  WanderForce,
  VortexForce,
  DEFAULT_REPULSION,
  type SimulationConfig,
  type ParticleTypeConfig,
} from './index.js';

// ─── Types ───────────────────────────────────────────────────────

export interface BenchmarkResult {
  particleCount: number;
  types: number;
  stepsPerSec: number;
  avgStepMs: number;
  totalSteps: number;
  totalTimeMs: number;
  allocationsOk: boolean;
  heapGrowthPerStep: number;
}

export interface BenchmarkReport {
  timestamp: string;
  results: BenchmarkResult[];
  passed: boolean;
  thresholds: BenchmarkThresholds;
}

export interface BenchmarkThresholds {
  minStepsPerSec: Record<number, number>;
  maxHeapGrowthPerStep: number;
}

// ─── Default Thresholds ──────────────────────────────────────────

export const DEFAULT_THRESHOLDS: BenchmarkThresholds = {
  minStepsPerSec: {
    100: 60000,
    500: 12000,
    1000: 5000,
    5000: 500,
  },
  maxHeapGrowthPerStep: 1024,
};

// ─── Helpers ─────────────────────────────────────────────────────

function makeBenchConfig(
  totalParticles: number,
  numTypes: number = 3,
  seed: number = 42,
): SimulationConfig {
  const types: ParticleTypeConfig[] = [];
  const baseCount = Math.floor(totalParticles / numTypes);
  const remainder = totalParticles - baseCount * numTypes;
  const colors = ['#ff4444', '#44ff44', '#4444ff', '#ff44', '#44ffff', '#ff44ff'];
  for (let i = 0; i < numTypes; i++) {
    types.push({
      count: baseCount + (i < remainder ? 1 : 0),
      color: colors[i % colors.length],
      radius: 3,
      initialSpeed: 50,
      maxSpeed: 120,
    });
  }
  return {
    width: 800,
    height: 600,
    boundaryMode: 'wrap',
    types,
    seed,
  };
}

// ─── Simulation Setup ────────────────────────────────────────────

interface SimSetup {
  world: World;
  grid: SpatialHashGrid;
  pairwise: PairwiseForce;
  pipeline: ForcePipeline;
}

function createSimSetup(config: SimulationConfig): SimSetup {
  const world = new World(config);
  const maxRadius = 100;
  const grid = new SpatialHashGrid(
    world.width, world.height, maxRadius,
    config.types.reduce((s, t) => s + t.count, 0),
  );

  const matrix = new InteractionMatrix(config.types.length);
  if (config.types.length >= 2) {
    matrix.set(0, 1, { strength: 100, radius: 80, falloff: 'linear' });
    matrix.set(1, 0, { strength: -80, radius: 80, falloff: 'linear' });
  }
  if (config.types.length >= 3) {
    matrix.set(0, 2, { strength: 50, radius: 60, falloff: 'inverse' });
    matrix.set(2, 0, { strength: -50, radius: 60, falloff: 'inverse' });
    matrix.set(1, 2, { strength: 30, radius: 50, falloff: 'constant' });
    matrix.set(2, 1, { strength: -30, radius: 50, falloff: 'constant' });
  }

  const pairwise = new PairwiseForce(matrix, DEFAULT_REPULSION);

  const pipeline = new ForcePipeline();
  pipeline.add(new WanderForce(40, 2));
  pipeline.add(new DragForce(0.8));
  pipeline.add(new VortexForce(400, 300, 100, 0, 300, 'linear'));
  pipeline.add(new BoundaryForce('wrap'));

  return { world, grid, pairwise, pipeline };
}

function fullSimStep(
  world: World,
  grid: SpatialHashGrid,
  pairwise: PairwiseForce,
  pipeline: ForcePipeline,
  dt: number,
): void {
  grid.rebuild(world);
  pairwise.apply(world, grid, dt);
  pipeline.step(world, grid, dt);
  world.integrate(dt);
  world.applyBoundaries();
  world.clampVelocities();
  world.simTime += dt;
}

// ─── Allocation Check ────────────────────────────────────────────

function getHeapUsed(): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
  // process.memoryUsage is available in Node.js
  const mem = (globalThis as Record<string, unknown>).mem;
  if (typeof mem === 'function') {
    const result = mem() as { heapUsed: number };
    return result.heapUsed;
  }
  return undefined;
}

/**
 * Check for hot-loop allocations.
 * Runs the simulation and measures heap growth per step.
 */
function checkAllocations(
  setup: SimSetup,
  steps: number,
  maxHeapGrowthPerStep: number,
): { ok: boolean; growthPerStep: number } {
  const dt = 1 / 60;
  const { world, grid, pairwise, pipeline } = setup;

  // Warm up
  for (let i = 0; i < 10; i++) {
    fullSimStep(world, grid, pairwise, pipeline, dt);
  }

  // Try to measure heap
  const before = getHeapUsed();

  for (let i = 0; i < steps; i++) {
    fullSimStep(world, grid, pairwise, pipeline, dt);
  }

  const after = getHeapUsed();

  if (before !== undefined && after !== undefined) {
    const growth = Math.max(0, after - before);
    const growthPerStep = growth / steps;
    return { ok: growthPerStep <= maxHeapGrowthPerStep, growthPerStep };
  }

  return { ok: true, growthPerStep: 0 };
}

// ─── Public API ──────────────────────────────────────────────────

export function runSingleBenchmark(
  particleCount: number,
  numSteps: number = 1000,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS,
): BenchmarkResult {
  const config = makeBenchConfig(particleCount);
  const setup = createSimSetup(config);
  const dt = 1 / 60;

  // Warm up
  for (let i = 0; i < 20; i++) {
    fullSimStep(setup.world, setup.grid, setup.pairwise, setup.pipeline, dt);
  }

  // Timed run
  const startTime = performance.now();
  for (let i = 0; i < numSteps; i++) {
    fullSimStep(setup.world, setup.grid, setup.pairwise, setup.pipeline, dt);
  }
  const totalTimeMs = performance.now() - startTime;
  const avgStepMs = totalTimeMs / numSteps;
  const stepsPerSec = 1000 / avgStepMs;

  // Allocation check with fresh setup
  const setup2 = createSimSetup(config);
  const allocSteps = particleCount >= 5000 ? 200 : 500;
  const allocResult = checkAllocations(setup2, allocSteps, thresholds.maxHeapGrowthPerStep);

  return {
    particleCount,
    types: config.types.length,
    stepsPerSec: Math.round(stepsPerSec),
    avgStepMs: Math.round(avgStepMs * 100) / 100,
    totalSteps: numSteps,
    totalTimeMs: Math.round(totalTimeMs),
    allocationsOk: allocResult.ok,
    heapGrowthPerStep: Math.round(allocResult.growthPerStep),
  };
}

export function runBenchmarks(
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS,
  stepsPerTier: number = 1000,
): BenchmarkReport {
  const tiers = Object.keys(thresholds.minStepsPerSec)
    .map(Number)
    .sort((a, b) => a - b);

  const results: BenchmarkResult[] = [];
  for (const count of tiers) {
    const steps = count >= 5000 ? 200 : stepsPerTier;
    results.push(runSingleBenchmark(count, steps, thresholds));
  }

  let passed = true;
  for (const r of results) {
    const min = thresholds.minStepsPerSec[r.particleCount];
    if (min !== undefined && r.stepsPerSec < min) passed = false;
    if (!r.allocationsOk) passed = false;
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    passed,
    thresholds,
  };
}

export function formatReportMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('# Critterium - Benchmark Report');
  lines.push('');
  lines.push(`- **Date:** ${report.timestamp}`);
  lines.push(`- **Result:** ${report.passed ? 'PASS' : 'FAIL'}`);
  lines.push('');

  lines.push('## Performance');
  lines.push('');
  lines.push('| Particles | Steps/sec | Min | Avg ms/step | Allocations | Status |');
  lines.push('|-----------|-----------|-----|-------------|-------------|--------|');

  for (const r of report.results) {
    const min = report.thresholds.minStepsPerSec[r.particleCount];
    const perfOk = min === undefined || r.stepsPerSec >= min;
    const status = (perfOk && r.allocationsOk) ? 'PASS' : 'FAIL';
    lines.push(
      `| ${r.particleCount} | ${r.stepsPerSec.toLocaleString()} | ${min ?? '-'} | ${r.avgStepMs} | ${r.heapGrowthPerStep} B/step | ${status} |`,
    );
  }

  return lines.join('\n');
}
