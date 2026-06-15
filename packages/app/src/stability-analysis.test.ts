// @vitest-environment node
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

const SIM_DURATION_SEC = 120;
const DT = 1 / 60;
const TOTAL_STEPS = Math.floor(SIM_DURATION_SEC / DT);

// Only test the 6 previously-unstable presets to keep runtime under timeout
const UNSTABLE_PRESET_NAMES = [
  'Plankton Bloom',
  'Predator Arena',
  'Rock Paper Scissors',
  'Birds',
  'Fishes',
  'Coral Reef',
];

function runPreset(name: string, config: CritteriumConfig) {
  const applied = applyConfig(config);
  const eco = applied.eco;
  const pairwiseForce = new PairwiseForce(applied.matrix);
  let dragCoeff = 0.5;
  if (Array.isArray(config.forces)) {
    const dragEntry = config.forces.find((f: any) => f.type === 'drag' && f.enabled !== false);
    if (dragEntry?.params?.coeff !== undefined) dragCoeff = dragEntry.params.coeff as number;
  }
  const dragForce = new DragForce(dragCoeff);
  const grid = new SpatialHashGrid(config.simulation.width, config.simulation.height, 150, config.simulation.populationCap);
  const numSpecies = config.species.length;
  const speciesNames = config.species.map((s) => s.name);
  const initialPops = Array.from({ length: numSpecies }, (_, i) => eco.speciesCount(i));
  const minPops = [...initialPops];
  const peakPops = [...initialPops];
  const curve: { time: number; populations: number[]; total: number }[] = [];
  let simTime = 0;
  const snapshotEvery = Math.floor(10 / DT);
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
    if (eco.aliveCount > config.simulation.populationCap * 1.5) {
      const excess = eco.aliveCount - config.simulation.populationCap;
      let killed = 0;
      for (let i = 0; i < eco.highWaterMark && killed < excess; i++) {
        if (eco.eco.alive[i] !== 0) { eco.kill(i); killed++; }
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
  const extinctSpecies: string[] = [];
  for (let i = 0; i < speciesNames.length; i++) {
    if (initialPops[i] > 0 && finalPops[i] === 0) extinctSpecies.push(speciesNames[i]);
  }
  return { name, finalPops, initialPops, minPops, peakPops, extinctSpecies, curve, speciesNames };
}

describe('Stability Analysis (unstable presets only)', { timeout: 600_000 }, () => {
  it('runs previously-unstable presets once and reports', () => {
    const results = [];
    const presets = BUILTIN_PRESETS.filter((p) => UNSTABLE_PRESET_NAMES.includes(p.name));
    for (const preset of presets) {
      const r = runPreset(preset.name, preset.config);
      results.push(r);
      const status = r.extinctSpecies.length === 0 ? '✅ STABLE' : `⚠️ EXTINCT: ${r.extinctSpecies.join(', ')}`;
      console.log(`\n  ${preset.name} — ${status}`);
      for (let i = 0; i < r.finalPops.length; i++) {
        const ext = r.finalPops[i] === 0 ? ' ❌' : '';
        console.log(`    [${i}] ${r.speciesNames[i].padEnd(16)} init=${r.initialPops[i]} final=${r.finalPops[i]} min=${r.minPops[i]} peak=${r.peakPops[i]}${ext}`);
      }
      if (r.extinctSpecies.length > 0) {
        for (const snap of r.curve) {
          const pops = snap.populations.map((p) => String(p).padStart(4)).join(' ');
          console.log(`      t=${snap.time.toFixed(0).padStart(3)}s total=${String(snap.total).padStart(4)} [${pops}]`);
        }
      }
    }
    const stable = results.filter((r) => r.extinctSpecies.length === 0).length;
    const partial = results.filter((r) => r.extinctSpecies.length > 0).length;
    console.log(`\n══════ SUMMARY: ${stable}/${results.length} stable, ${partial} with extinctions ══════`);
    expect(results.length).toBe(presets.length);
  });
});
