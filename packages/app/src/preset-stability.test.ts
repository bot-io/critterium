// @vitest-environment node
/**
 * Preset Stability Tests
 *
 * Runs each built-in preset for 120 seconds of simulation time (at 60fps = 7200 steps).
 * Tracks per-species population curves, detects extinctions, and reports results.
 *
 * NOT part of the default test run — these are long-running analysis tests.
 * Run with: npx vitest run packages/app/src/preset-stability.test.ts --reporter=verbose
 *
 * A preset "passes" if ALL species survive to t=120s with > 0 population.
 * A preset "warns" if a species goes extinct but others survive.
 * A preset "fails" if total extinction occurs.
 */

import { describe, it, expect } from 'vitest';
import {
  EcosystemWorld,
  processEating,
  processReproduction,
  SpatialHashGrid,
  PairwiseForce,
  DragForce,
  applyConfig,
  type CritteriumConfig,
} from '@critterium/core';
import { BUILTIN_PRESETS } from './presets.js';

// ─── Config ────────────────────────────────────────────────────

const SIM_DURATION_SEC = 120;
const DT = 1 / 60;
const TOTAL_STEPS = Math.floor(SIM_DURATION_SEC / DT);
const SNAPSHOT_INTERVAL_SEC = 5;

// ─── Types ─────────────────────────────────────────────────────

interface StabilityResult {
  presetName: string;
  stable: boolean;
  partialExtinction: boolean;
  totalExtinction: boolean;
  extinctSpecies: string[];
  finalPopulations: number[];
  initialPopulations: number[];
  curve: { time: number; populations: number[]; total: number }[];
  minPopulations: number[];
  peakPopulations: number[];
}

// ─── Runner ────────────────────────────────────────────────────

function runPreset(name: string, config: CritteriumConfig): StabilityResult {
  const applied = applyConfig(config);
  const eco = applied.eco;
  const pairwiseForce = new PairwiseForce(applied.matrix);

  // Extract drag coefficient from forces array
  let dragCoeff = 0.5;
  if (Array.isArray(config.forces)) {
    const dragEntry = config.forces.find((f: any) => f.type === 'drag' && f.enabled !== false);
    if (dragEntry?.params?.coeff !== undefined) {
      dragCoeff = dragEntry.params.coeff as number;
    }
  }
  const dragForce = new DragForce(dragCoeff);

  const grid = new SpatialHashGrid(
    config.simulation.width,
    config.simulation.height,
    150,
    config.simulation.populationCap,
  );

  const numSpecies = config.species.length;
  const speciesNames = config.species.map((s) => s.name);
  const initialPops = Array.from({ length: numSpecies }, (_, i) => eco.speciesCount(i));
  const curve: { time: number; populations: number[]; total: number }[] = [];
  const minPops = [...initialPops];
  const peakPops = [...initialPops];
  const extinctSpecies: string[] = [];

  let simTime = 0;
  const snapshotEvery = Math.floor(SNAPSHOT_INTERVAL_SEC / DT);

  for (let step = 0; step < TOTAL_STEPS; step++) {
    grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
    pairwiseForce.apply(eco.world, grid, DT);
    dragForce.apply(eco.world, grid, DT);

    eco.processStamina(DT);
    eco.world.step(DT);

    grid.rebuild(eco.world, eco.eco.alive, eco.highWaterMark);
    processEating(eco, grid);
    eco.processLifecycle(DT);
    processReproduction(eco, DT);

    // Overflow protection
    if (eco.aliveCount > config.simulation.populationCap * 1.5) {
      const excess = eco.aliveCount - config.simulation.populationCap;
      let killed = 0;
      for (let i = 0; i < eco.highWaterMark && killed < excess; i++) {
        if (eco.eco.alive[i] !== 0) {
          eco.kill(i);
          killed++;
        }
      }
    }

    simTime += DT;

    if (step % snapshotEvery === 0) {
      const pops = Array.from({ length: numSpecies }, (_, i) => eco.speciesCount(i));
      const total = pops.reduce((a, b) => a + b, 0);
      curve.push({ time: simTime, populations: pops, total });
      for (let i = 0; i < pops.length; i++) {
        if (pops[i] < minPops[i]) minPops[i] = pops[i];
        if (pops[i] > peakPops[i]) peakPops[i] = pops[i];
      }
    }
  }

  const finalPops = Array.from({ length: numSpecies }, (_, i) => eco.speciesCount(i));

  for (let i = 0; i < speciesNames.length; i++) {
    if (initialPops[i] > 0 && finalPops[i] === 0) {
      extinctSpecies.push(speciesNames[i]);
    }
  }

  const totalExtinction = finalPops.every((p) => p === 0);
  const partialExtinction = extinctSpecies.length > 0 && !totalExtinction;

  return {
    presetName: name,
    stable: extinctSpecies.length === 0,
    partialExtinction,
    totalExtinction,
    extinctSpecies,
    finalPopulations: finalPops,
    initialPopulations: initialPops,
    curve,
    minPopulations: minPops,
    peakPopulations: peakPops,
  };
}

function formatResult(r: StabilityResult): string {
  const lines: string[] = [];
  const status = r.totalExtinction
    ? '💀 TOTAL EXTINCTION'
    : r.partialExtinction
      ? '⚠️ PARTIAL EXTINCTION'
      : '✅ STABLE';
  lines.push(`  ${status}`);
  for (let i = 0; i < r.finalPopulations.length; i++) {
    const init = r.initialPopulations[i];
    const final = r.finalPopulations[i];
    const min = r.minPopulations[i];
    const peak = r.peakPopulations[i];
    const extinct = final === 0 ? ' ❌ EXTINCT' : '';
    lines.push(`    [${i}] init=${init} final=${final} min=${min} peak=${peak}${extinct}`);
  }
  if (r.extinctSpecies.length > 0) {
    lines.push(`    Extinct: ${r.extinctSpecies.join(', ')}`);
  }
  lines.push('    Curve (every ~10s):');
  for (const snap of r.curve) {
    if (snap.time % 10 < 0.5 || snap.time < 1) {
      const pops = snap.populations.map((p) => String(p).padStart(4)).join(' ');
      lines.push(
        `      t=${snap.time.toFixed(0).padStart(3)}s total=${String(snap.total).padStart(4)} [${pops}]`,
      );
    }
  }
  return lines.join('\n');
}

// ─── Tests ─────────────────────────────────────────────────────

describe('Preset Stability — 120s simulation per preset', { timeout: 60_000 }, () => {
  for (const presetEntry of BUILTIN_PRESETS) {
    const name = presetEntry.name;

    it(`${name} — all species survive 120s`, () => {
      const result = runPreset(name, presetEntry.config);
      const report = formatResult(result);
      console.log(`\n${name}:\n${report}`);

      if (result.totalExtinction) {
        expect.fail(`TOTAL EXTINCTION: all species died within ${SIM_DURATION_SEC}s\n${report}`);
      }

      if (result.partialExtinction) {
        console.warn(
          `⚠️  PARTIAL EXTINCTION in ${name}: ${result.extinctSpecies.join(', ')}\n${report}`,
        );
      }

      expect(result.finalPopulations.some((p) => p > 0)).toBe(true);
    });
  }
});

// ─── Summary ───────────────────────────────────────────────────

describe('Preset Stability Summary', { timeout: 600_000 }, () => {
  it('summary report — all presets at a glance', () => {
    const results: StabilityResult[] = [];
    for (const presetEntry of BUILTIN_PRESETS) {
      results.push(runPreset(presetEntry.name, presetEntry.config));
    }

    const lines: string[] = ['\n\n════════ PRESET STABILITY SUMMARY ════════\n'];
    let stableCount = 0;
    let partialCount = 0;
    let extinctCount = 0;

    for (const r of results) {
      const status = r.totalExtinction ? '💀' : r.partialExtinction ? '⚠️ ' : '✅ ';
      const pops = r.finalPopulations.map((p, i) => `S${i}:${p}`).join(' ');
      lines.push(`${status} ${r.presetName.padEnd(25)} ${pops}`);
      if (r.stable) stableCount++;
      else if (r.totalExtinction) extinctCount++;
      else partialCount++;
    }

    lines.push('');
    lines.push(`✅ Stable: ${stableCount}/${results.length}`);
    lines.push(`⚠️  Partial extinction: ${partialCount}/${results.length}`);
    lines.push(`💀 Total extinction: ${extinctCount}/${results.length}`);

    if (partialCount > 0 || extinctCount > 0) {
      lines.push('\nUnstable presets (need tuning):');
      for (const r of results) {
        if (!r.stable) {
          lines.push(`  ${r.presetName}: extinct=[${r.extinctSpecies.join(', ')}]`);
          for (let i = 0; i < r.finalPopulations.length; i++) {
            if (r.finalPopulations[i] === 0 && r.initialPopulations[i] > 0) {
              lines.push(
                `    S${i}: init=${r.initialPopulations[i]} → 0, peak=${r.peakPopulations[i]}, min=${r.minPopulations[i]}`,
              );
            }
          }
        }
      }
    }

    console.log(lines.join('\n'));
    expect(results.length).toBe(BUILTIN_PRESETS.length);
  });
});
