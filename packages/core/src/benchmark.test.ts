import { describe, it, expect } from 'vitest';
import {
  runSingleBenchmark,
  runBenchmarks,
  formatReportMarkdown,
  type BenchmarkThresholds,
} from './benchmark.js';

// ─── Relaxed thresholds for CI environments ──────────────────────

/**
 * CI and dev environments vary. These thresholds are deliberately generous.
 * The key purpose is to catch severe regressions (e.g. O(n^3) accidentally
 * introduced) rather than enforce absolute performance numbers.
 */
const CI_THRESHOLDS: BenchmarkThresholds = {
  minStepsPerSec: {
    100: 100,
    500: 20,
    1000: 10,
    5000: 2,
  },
  maxHeapGrowthPerStep: 4096,
};

const TIMEOUT_5K = 120_000;
const TIMEOUT_FULL = 300_000;

// ─── Unit tests ──────────────────────────────────────────────────

describe('Benchmark Harness', () => {
  it('runSingleBenchmark returns valid result for 100 particles', () => {
    const result = runSingleBenchmark(100, 100, CI_THRESHOLDS);
    expect(result.particleCount).toBe(100);
    expect(result.types).toBe(3);
    expect(result.stepsPerSec).toBeGreaterThan(0);
    expect(result.avgStepMs).toBeGreaterThan(0);
    expect(result.totalSteps).toBe(100);
    expect(result.totalTimeMs).toBeGreaterThan(0);
  });

  it('runSingleBenchmark returns valid result for 500 particles', () => {
    const result = runSingleBenchmark(500, 100, CI_THRESHOLDS);
    expect(result.particleCount).toBe(500);
    expect(result.stepsPerSec).toBeGreaterThan(0);
  });

  it('performance scales: more particles = fewer steps/sec', () => {
    const r100 = runSingleBenchmark(100, 100, CI_THRESHOLDS);
    const r1000 = runSingleBenchmark(1000, 100, CI_THRESHOLDS);
    expect(r1000.stepsPerSec).toBeLessThan(r100.stepsPerSec);
  });

  it('runBenchmarks produces a complete report', { timeout: TIMEOUT_FULL }, () => {
    const report = runBenchmarks(CI_THRESHOLDS, 100);
    expect(report.results).toHaveLength(4);
    expect(report.timestamp).toBeTruthy();
    expect(report.thresholds).toEqual(CI_THRESHOLDS);
    const counts = report.results.map((r) => r.particleCount);
    expect(counts).toContain(100);
    expect(counts).toContain(500);
    expect(counts).toContain(1000);
    expect(counts).toContain(5000);
  });

  it('formatReportMarkdown produces valid markdown', { timeout: TIMEOUT_FULL }, () => {
    const report = runBenchmarks(CI_THRESHOLDS, 100);
    const md = formatReportMarkdown(report);
    expect(md).toContain('# Critterium - Benchmark Report');
    expect(md).toContain('## Performance');
    expect(md).toContain('| Particles |');
    expect(md).toContain(String(report.results[0].particleCount));
    // Report should contain PASS or FAIL status
    const hasStatus = md.includes('PASS') || md.includes('FAIL');
    expect(hasStatus).toBe(true);
  });

  it('allocation check returns a boolean', () => {
    const result = runSingleBenchmark(100, 100, CI_THRESHOLDS);
    expect(typeof result.allocationsOk).toBe('boolean');
    expect(typeof result.heapGrowthPerStep).toBe('number');
  });
});

// ─── CI Performance Gate ─────────────────────────────────────────

describe('CI Performance Gate', () => {
  it('100 particles meets minimum performance threshold', () => {
    const result = runSingleBenchmark(100, 200, CI_THRESHOLDS);
    expect(result.stepsPerSec).toBeGreaterThanOrEqual(CI_THRESHOLDS.minStepsPerSec[100]);
  });

  it('500 particles meets minimum performance threshold', () => {
    const result = runSingleBenchmark(500, 100, CI_THRESHOLDS);
    expect(result.stepsPerSec).toBeGreaterThanOrEqual(CI_THRESHOLDS.minStepsPerSec[500]);
  });

  it('1000 particles meets minimum performance threshold', () => {
    const result = runSingleBenchmark(1000, 50, CI_THRESHOLDS);
    expect(result.stepsPerSec).toBeGreaterThanOrEqual(CI_THRESHOLDS.minStepsPerSec[1000]);
  });

  it('5000 particles meets minimum performance threshold', { timeout: TIMEOUT_5K }, () => {
    const result = runSingleBenchmark(5000, 20, CI_THRESHOLDS);
    expect(result.stepsPerSec).toBeGreaterThanOrEqual(CI_THRESHOLDS.minStepsPerSec[5000]);
  });

  it('full benchmark report passes all thresholds', { timeout: TIMEOUT_FULL }, () => {
    const report = runBenchmarks(CI_THRESHOLDS, 50);
    expect(report.passed).toBe(true);
  });
});
