/**
 * Critterium — Comprehensive Controls UI Panel
 *
 * Full-featured collapsible right-side drawer with sections:
 * Simulation, Species, Forces, Interaction Matrix, Actions.
 * Dark semi-transparent panel, monospace font, mobile-friendly.
 */

import type { CritteriumConfig } from '@critterium/core';
import { BUILTIN_PRESET_NAMES } from './presets.js';

// ─── Options Interface ────────────────────────────────────────

export interface ControlsPanelOptions {
  onTogglePause?: (paused: boolean) => void;
  onReset?: () => void;
  onReseed?: () => void;
  onSpeedChange?: (multiplier: number) => void;
  onPopulationCapChange?: (cap: number) => void;
  onForceToggle?: (forceId: string, enabled: boolean) => void;
  onForceChange?: (forceId: string, param: string, value: number) => void;
  onMatrixChange?: (i: number, j: number, strength: number, radius: number, falloff: string) => void;
  onRandomizeMatrix?: () => void;
  onClearMatrix?: () => void;
  onSpeciesChange?: (speciesIndex: number, param: string, value: number | string | boolean) => void;
  onExport?: () => void;
  onImport?: () => void;
  onSavePreset?: (name: string) => void;
  onLoadPreset?: (name: string) => void;
  onDeletePreset?: (name: string) => void;
  onLoadBuiltinPreset?: (name: string) => void;
  getSavedPresets?: () => string[];
  getConfig?: () => CritteriumConfig;
  applyImportedConfig?: (config: CritteriumConfig) => void;
  speciesCount?: number;
  speciesNames?: string[];
  speciesColors?: string[];
  initialForceValues?: Record<string, Record<string, number>>;
  initialMatrixValues?: Array<Array<{ strength: number; radius: number; falloff: string } | null>>;
  initialSpeciesValues?: Array<Record<string, number>>;
}

// ─── Slider Registry ─────────────────────────────────────────

interface SliderRef {
  slider: HTMLInputElement;
  valueEl: HTMLElement;
}

/** Global registry of all slider elements, keyed by compound id. */
const sliderRegistry = new Map<string, SliderRef>();

/** Register a slider for later programmatic update. */
function registerSlider(key: string, slider: HTMLInputElement, valueEl: HTMLElement): void {
  sliderRegistry.set(key, { slider, valueEl });
}

/** Update a registered slider's value and display. */
function setSliderValue(key: string, value: number): void {
  const ref = sliderRegistry.get(key);
  if (ref) {
    ref.slider.value = String(value);
    ref.valueEl.textContent = formatNum(value);
  }
}

/**
 * Reset all sliders to match the given values.
 * `speciesValues` is indexed by species index, then param name.
 * `simValues` contains { speed, popCap }.
 * `forceValues` contains per-force params.
 */
export function resetAllSliders(opts: {
  speciesValues: Array<Record<string, number>>;
  simValues: { speed: number; popCap: number };
  forceValues: Record<string, Record<string, number>>;
}): void {
  // Simulation sliders
  setSliderValue('sim.speed', opts.simValues.speed);
  setSliderValue('sim.popCap', opts.simValues.popCap);

  // Force sliders
  if (opts.forceValues['drag']) {
    setSliderValue('force.drag.coefficient', opts.forceValues['drag']['coefficient'] ?? 0.8);
  }
  if (opts.forceValues['wander']) {
    setSliderValue('force.wander.strength', opts.forceValues['wander']['strength'] ?? 40);
    setSliderValue('force.wander.rate', opts.forceValues['wander']['rate'] ?? 2.5);
  }
  if (opts.forceValues['pointer']) {
    setSliderValue('force.pointer.strength', opts.forceValues['pointer']['strength'] ?? 200);
    setSliderValue('force.pointer.radius', opts.forceValues['pointer']['radius'] ?? 150);
  }

  // Species sliders
  for (let si = 0; si < opts.speciesValues.length; si++) {
    const iv = opts.speciesValues[si];
    if (!iv) continue;

    setSliderValue(`species.${si}.count`, iv['count'] ?? 80);
    setSliderValue(`species.${si}.radius`, iv['radius'] ?? 3);
    setSliderValue(`species.${si}.initialSpeed`, iv['initialSpeed'] ?? 50);
    setSliderValue(`species.${si}.maxSpeed`, iv['maxSpeed'] ?? 100);
    setSliderValue(`species.${si}.maxEnergy`, iv['maxEnergy'] ?? 100);
    setSliderValue(`species.${si}.initialEnergy`, iv['initialEnergy'] ?? 50);
    setSliderValue(`species.${si}.reproductionCost`, iv['reproductionCost'] ?? 40);
    setSliderValue(`species.${si}.movementCostPerSec`, iv['movementCostPerSec'] ?? 2);
    setSliderValue(`species.${si}.idleDrainPerSec`, iv['idleDrainPerSec'] ?? 1);
    setSliderValue(`species.${si}.maxAgeSec`, iv['maxAgeSec'] ?? 60);
    setSliderValue(`species.${si}.starvationDamagePerSec`, iv['starvationDamagePerSec'] ?? 10);
    setSliderValue(`species.${si}.reproductionCooldownSec`, iv['reproductionCooldownSec'] ?? 5);
  }
}

// ─── Styles ───────────────────────────────────────────────────

const STYLES = `
  .crit-controls-toggle {
    position: fixed; top: 10px; right: 10px; z-index: 10001;
    width: 40px; height: 40px; border: none; border-radius: 8px;
    background: rgba(30,30,30,0.9); color: #ccc; font-size: 22px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s, transform 0.2s;
    touch-action: manipulation;
  }
  .crit-controls-toggle:hover { background: rgba(60,60,60,0.95); transform: scale(1.05); }

  .crit-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
    z-index: 10000; background: rgba(20,20,24,0.95);
    color: #ddd; font: 12px/1.5 'Consolas', 'Monaco', 'Courier New', monospace;
    overflow-y: auto; overflow-x: hidden;
    padding: 50px 12px 20px 12px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-left: 1px solid rgba(255,255,255,0.06);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
  }
  .crit-panel.hidden { transform: translateX(380px); }
  .crit-panel::-webkit-scrollbar { width: 6px; }
  .crit-panel::-webkit-scrollbar-track { background: transparent; }
  .crit-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

  .crit-section { margin-bottom: 10px; }
  .crit-section-hdr {
    display: flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 6px 8px; border-radius: 4px;
    background: rgba(255,255,255,0.04);
    transition: background 0.15s;
    user-select: none; -webkit-user-select: none;
  }
  .crit-section-hdr:hover { background: rgba(255,255,255,0.08); }
  .crit-section-arrow { font-size: 10px; color: #888; width: 14px; text-align: center; flex-shrink: 0; }
  .crit-section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: #999; flex: 1;
  }
  .crit-section-body {
    overflow: hidden; transition: max-height 0.3s ease, opacity 0.2s ease;
    max-height: 2000px; opacity: 1; padding: 6px 0 0 0;
  }
  .crit-section-body.collapsed { max-height: 0; opacity: 0; padding: 0; }

  .crit-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; min-height: 28px; }
  .crit-label { min-width: 90px; max-width: 110px; color: #aaa; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crit-value { color: #eee; font-size: 11px; min-width: 34px; text-align: right; flex-shrink: 0; }

  input[type="range"] {
    flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
    background: rgba(255,255,255,0.15); border-radius: 2px; outline: none;
    min-width: 60px;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: #6af; cursor: pointer;
    touch-action: manipulation;
  }
  input[type="range"]::-moz-range-thumb {
    width: 14px; height: 14px; border: none;
    border-radius: 50%; background: #6af; cursor: pointer;
  }

  input[type="color"] {
    width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; cursor: pointer; background: transparent; padding: 1px;
    touch-action: manipulation;
  }

  input[type="text"].crit-name-input {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px; color: #eee; font: 11px 'Consolas', monospace;
    padding: 2px 6px; width: 90px; outline: none;
    touch-action: manipulation;
  }
  input[type="text"].crit-name-input:focus { border-color: #6af; }

  select.crit-select {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px; color: #eee; font: 11px 'Consolas', monospace;
    padding: 2px 4px; outline: none; cursor: pointer;
  }
  select.crit-select:focus { border-color: #6af; }
  select.crit-select option { background: #1a1a1e; color: #eee; }

  .crit-btn {
    padding: 5px 10px; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; background: rgba(255,255,255,0.06);
    color: #ccc; font: 11px/1.4 'Consolas', monospace; cursor: pointer;
    transition: background 0.15s; white-space: nowrap;
    touch-action: manipulation; min-height: 28px;
  }
  .crit-btn:hover { background: rgba(255,255,255,0.15); }
  .crit-btn:active { background: rgba(255,255,255,0.2); }
  .crit-btn.active { background: rgba(100,180,255,0.25); border-color: #6af; color: #6af; }
  .crit-btn-small { padding: 3px 8px; font-size: 10px; }
  .crit-btn-danger { border-color: rgba(255,80,80,0.3); color: #f66; }
  .crit-btn-danger:hover { background: rgba(255,80,80,0.15); }

  .crit-toggle-wrap {
    display: flex; align-items: center; gap: 6px; cursor: pointer;
    min-height: 28px; touch-action: manipulation;
  }
  .crit-toggle {
    position: relative; width: 34px; height: 18px; border-radius: 9px;
    background: rgba(255,255,255,0.1); transition: background 0.2s;
    border: none; padding: 0; flex-shrink: 0;
  }
  .crit-toggle.on { background: rgba(100,180,255,0.5); }
  .crit-toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: #ccc; transition: transform 0.2s;
  }
  .crit-toggle.on::after { transform: translateX(16px); }

  .crit-species-hdr {
    display: flex; align-items: center; gap: 6px; padding: 5px 8px;
    border-radius: 4px; cursor: pointer; transition: background 0.15s;
    user-select: none; -webkit-user-select: none;
    border-left: 3px solid transparent; margin-bottom: 2px;
  }
  .crit-species-hdr:hover { filter: brightness(1.2); }

  .crit-subsection { margin-left: 12px; margin-bottom: 4px; }
  .crit-subsection-hdr {
    font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 3px 0; cursor: pointer; user-select: none; -webkit-user-select: none;
  }

  .crit-matrix-grid { display: grid; gap: 2px; margin-top: 6px; }
  .crit-matrix-cell {
    display: flex; flex-direction: column; align-items: center;
    padding: 3px 2px; border-radius: 3px; min-height: 36px;
    cursor: pointer; transition: background 0.15s;
  }
  .crit-matrix-cell:hover { filter: brightness(1.3); }
  .crit-matrix-header {
    font-size: 9px; color: #666; text-align: center;
    padding: 2px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crit-matrix-val { font-size: 9px; color: #ddd; margin-top: 1px; }

  .crit-preset-row { display: flex; gap: 4px; margin: 4px 0; align-items: center; }
  .crit-preset-select {
    flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px; color: #eee; font: 11px 'Consolas', monospace;
    padding: 4px 6px; outline: none; cursor: pointer;
  }
  .crit-preset-select option { background: #1a1a1e; color: #eee; }
`;

// ─── Helpers ──────────────────────────────────────────────────

function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function makeSlider(
  label: string, min: number, max: number, step: number, initial: number,
  onChange: (v: number) => void,
  registryKey?: string,
): HTMLElement {
  const row = el('div', 'crit-row');
  const lbl = el('span', 'crit-label');
  lbl.textContent = label;
  lbl.title = label;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(initial);
  const val = el('span', 'crit-value');
  val.textContent = formatNum(initial);
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    val.textContent = formatNum(v);
    onChange(v);
  });

  // Register for programmatic reset
  if (registryKey) {
    registerSlider(registryKey, slider, val);
  }

  row.appendChild(lbl);
  row.appendChild(slider);
  row.appendChild(val);
  return row;
}

function formatNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function makeToggle(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = el('div', 'crit-row');
  const toggleBtn = el('button', 'crit-toggle' + (initial ? ' on' : ''));
  const lbl = el('span', 'crit-label');
  lbl.textContent = label;
  let state = initial;
  const wrap = el('div', 'crit-toggle-wrap');
  wrap.appendChild(toggleBtn);
  wrap.appendChild(lbl);
  wrap.addEventListener('click', () => {
    state = !state;
    toggleBtn.classList.toggle('on', state);
    onChange(state);
  });
  row.appendChild(wrap);
  return row;
}

function makeFalloffSelect(initial: string, onChange: (v: string) => void): HTMLElement {
  const row = el('div', 'crit-row');
  const lbl = el('span', 'crit-label');
  lbl.textContent = 'Falloff';
  const sel = document.createElement('select');
  sel.className = 'crit-select';
  for (const opt of ['linear', 'inverse', 'constant']) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === initial) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(lbl);
  row.appendChild(sel);
  return row;
}

// ─── Collapsible Section ──────────────────────────────────────

interface SectionState { collapsed: boolean; }

function makeSection(title: string, buildBody: (body: HTMLElement) => void, state?: SectionState): HTMLElement {
  const section = el('div', 'crit-section');
  const hdr = el('div', 'crit-section-hdr');
  const arrow = el('span', 'crit-section-arrow');
  arrow.textContent = '▼';
  const titleEl = el('span', 'crit-section-title');
  titleEl.textContent = title;
  hdr.appendChild(arrow);
  hdr.appendChild(titleEl);

  const body = el('div', 'crit-section-body');
  if (state && state.collapsed) {
    body.classList.add('collapsed');
    arrow.textContent = '▶';
  }
  buildBody(body);

  hdr.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('collapsed');
    arrow.textContent = isCollapsed ? '▶' : '▼';
  });

  section.appendChild(hdr);
  section.appendChild(body);
  return section;
}

// ─── Panel Creation ───────────────────────────────────────────

let panelOpen = false;

export function createControlsPanel(options: ControlsPanelOptions): HTMLElement {
  // Inject styles once
  if (!document.getElementById('crit-controls-styles')) {
    const style = document.createElement('style');
    style.id = 'crit-controls-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Toggle button
  const toggle = el('button', 'crit-controls-toggle');
  toggle.textContent = '⚙';
  toggle.title = 'Toggle Controls';

  // Panel
  const panel = el('div', 'crit-panel hidden');

  toggle.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.classList.toggle('hidden', !panelOpen);
  });

  // Build all sections
  panel.appendChild(buildSimSection(options));
  panel.appendChild(buildSpeciesSection(options));
  panel.appendChild(buildForcesSection(options));
  panel.appendChild(buildMatrixSection(options));
  panel.appendChild(buildActionsSection(options));

  document.body.appendChild(toggle);
  return panel;
}

// ─── Simulation Section ───────────────────────────────────────

function buildSimSection(opts: ControlsPanelOptions): HTMLElement {
  return makeSection('Simulation', (body) => {
    // Play/Pause, Reset, Re-seed row
    const btnRow = el('div', 'crit-row');
    let paused = false;
    const pauseBtn = el('button', 'crit-btn');
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.style.minWidth = '80px';
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
      pauseBtn.classList.toggle('active', paused);
      opts.onTogglePause?.(paused);
    });
    btnRow.appendChild(pauseBtn);

    const resetBtn = el('button', 'crit-btn');
    resetBtn.textContent = '↺ Reset';
    resetBtn.addEventListener('click', () => opts.onReset?.());
    btnRow.appendChild(resetBtn);

    const reseedBtn = el('button', 'crit-btn');
    reseedBtn.textContent = '🎲 Seed';
    reseedBtn.addEventListener('click', () => opts.onReseed?.());
    btnRow.appendChild(reseedBtn);
    body.appendChild(btnRow);

    // Speed slider
    body.appendChild(makeSlider('Speed', 0.25, 3, 0.05, 1, (v) => {
      opts.onSpeedChange?.(v);
    }, 'sim.speed'));

    // Population cap slider
    const capInit = (opts.initialForceValues?.['_popCap'] as unknown as number | undefined) ?? 600;
    body.appendChild(makeSlider('Pop Cap', 50, 2000, 50, capInit, (v) => {
      opts.onPopulationCapChange?.(v);
    }, 'sim.popCap'));
  });
}

// ─── Species Section ──────────────────────────────────────────

function buildSpeciesSection(opts: ControlsPanelOptions): HTMLElement {
  return makeSection('Species', (body) => {
    const n = opts.speciesCount ?? 3;
    const names = opts.speciesNames ?? Array.from({ length: n }, (_, i) => `Species ${i}`);
    const colors = opts.speciesColors ?? Array.from({ length: n }, (_, i) => ['#44cc44', '#ff4444', '#cc44cc'][i % 3]);
    const initVals = opts.initialSpeciesValues ?? [];

    for (let si = 0; si < n; si++) {
      const speciesIdx = si;
      const color = colors[si] ?? '#888';
      const iv = initVals[si] ?? {};

      // Species collapsible sub-panel
      const subPanel = el('div', 'crit-section');
      const hdr = el('div', 'crit-species-hdr');
      hdr.style.borderLeftColor = color;
      hdr.style.background = hexToRgba(color, 0.1);

      const arrow = el('span', 'crit-section-arrow');
      arrow.textContent = '▼';
      hdr.appendChild(arrow);

      // Name input
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'crit-name-input';
      nameInput.value = names[si];
      nameInput.addEventListener('change', () => {
        opts.onSpeciesChange?.(speciesIdx, 'name', nameInput.value);
      });
      hdr.appendChild(nameInput);

      // Color picker
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = color;
      colorInput.addEventListener('input', () => {
        hdr.style.borderLeftColor = colorInput.value;
        hdr.style.background = hexToRgba(colorInput.value, 0.1);
        opts.onSpeciesChange?.(speciesIdx, 'color', colorInput.value);
      });
      hdr.appendChild(colorInput);

      const subBody = el('div', 'crit-section-body');
      hdr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        const isCollapsed = subBody.classList.toggle('collapsed');
        arrow.textContent = isCollapsed ? '▶' : '▼';
      });

      // Count slider + Apply button
      const countRow = el('div', 'crit-row');
      const countLbl = el('span', 'crit-label'); countLbl.textContent = 'Count';
      const countSlider = document.createElement('input');
      countSlider.type = 'range'; countSlider.min = '1'; countSlider.max = '200';
      countSlider.value = String(iv['count'] ?? 80); countSlider.step = '1';
      const countVal = el('span', 'crit-value');
      countVal.textContent = countSlider.value;
      countSlider.addEventListener('input', () => { countVal.textContent = countSlider.value; });
      // Register count slider
      registerSlider(`species.${si}.count`, countSlider, countVal);
      countRow.appendChild(countLbl); countRow.appendChild(countSlider); countRow.appendChild(countVal);
      const applyBtn = el('button', 'crit-btn crit-btn-small');
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        opts.onSpeciesChange?.(speciesIdx, 'count', parseInt(countSlider.value));
      });
      countRow.appendChild(applyBtn);
      subBody.appendChild(countRow);

      // Basic sliders
      subBody.appendChild(makeSlider('Radius', 1, 10, 0.5, iv['radius'] ?? 3, (v) => opts.onSpeciesChange?.(speciesIdx, 'radius', v), `species.${si}.radius`));
      subBody.appendChild(makeSlider('Init Speed', 0, 200, 1, iv['initialSpeed'] ?? 50, (v) => opts.onSpeciesChange?.(speciesIdx, 'initialSpeed', v), `species.${si}.initialSpeed`));
      subBody.appendChild(makeSlider('Max Speed', 10, 300, 1, iv['maxSpeed'] ?? 100, (v) => opts.onSpeciesChange?.(speciesIdx, 'maxSpeed', v), `species.${si}.maxSpeed`));

      // Energy sub-section
      subBody.appendChild(buildSubSection('Energy', (sub) => {
        sub.appendChild(makeSlider('Max Energy', 10, 500, 5, iv['maxEnergy'] ?? 100, (v) => opts.onSpeciesChange?.(speciesIdx, 'maxEnergy', v), `species.${si}.maxEnergy`));
        sub.appendChild(makeSlider('Init Energy', 5, 250, 5, iv['initialEnergy'] ?? 50, (v) => opts.onSpeciesChange?.(speciesIdx, 'initialEnergy', v), `species.${si}.initialEnergy`));
        sub.appendChild(makeSlider('Repro Cost', 5, 200, 5, iv['reproductionCost'] ?? 40, (v) => opts.onSpeciesChange?.(speciesIdx, 'reproductionCost', v), `species.${si}.reproductionCost`));
        sub.appendChild(makeSlider('Move Cost/s', 0, 10, 0.1, iv['movementCostPerSec'] ?? 2, (v) => opts.onSpeciesChange?.(speciesIdx, 'movementCostPerSec', v), `species.${si}.movementCostPerSec`));
        sub.appendChild(makeSlider('Idle Drain/s', 0, 10, 0.1, iv['idleDrainPerSec'] ?? 1, (v) => opts.onSpeciesChange?.(speciesIdx, 'idleDrainPerSec', v), `species.${si}.idleDrainPerSec`));
      }));

      // Lifecycle sub-section
      subBody.appendChild(buildSubSection('Lifecycle', (sub) => {
        sub.appendChild(makeSlider('Max Age', 0, 300, 1, iv['maxAgeSec'] ?? 60, (v) => opts.onSpeciesChange?.(speciesIdx, 'maxAgeSec', v), `species.${si}.maxAgeSec`));
        sub.appendChild(makeSlider('Starv Dmg/s', 0, 50, 0.5, iv['starvationDamagePerSec'] ?? 10, (v) => opts.onSpeciesChange?.(speciesIdx, 'starvationDamagePerSec', v), `species.${si}.starvationDamagePerSec`));
        sub.appendChild(makeSlider('Repro CD', 0, 30, 0.5, iv['reproductionCooldownSec'] ?? 5, (v) => opts.onSpeciesChange?.(speciesIdx, 'reproductionCooldownSec', v), `species.${si}.reproductionCooldownSec`));
      }));

      // Diet sub-section
      subBody.appendChild(buildSubSection('Diet', (sub) => {
        // Can eat toggles
        for (let j = 0; j < n; j++) {
          if (j === si) continue;
          const canEatInitial = !!(iv['canEat_' + j]);
          sub.appendChild(makeToggle(`Eat ${names[j]}`, canEatInitial, (on) => {
            opts.onSpeciesChange?.(speciesIdx, 'canEat_' + j, on);
          }));
        }
      }));

      subPanel.appendChild(hdr);
      subPanel.appendChild(subBody);
      body.appendChild(subPanel);
    }
  });
}

function buildSubSection(title: string, buildBody: (body: HTMLElement) => void): HTMLElement {
  const wrapper = el('div', 'crit-subsection');
  const hdr = el('div', 'crit-subsection-hdr');
  hdr.textContent = '▸ ' + title;
  const body = el('div', 'crit-section-body');
  let collapsed = false;
  hdr.addEventListener('click', () => {
    collapsed = !collapsed;
    body.classList.toggle('collapsed', collapsed);
    hdr.textContent = (collapsed ? '▸ ' : '▾ ') + title;
  });
  buildBody(body);
  wrapper.appendChild(hdr);
  wrapper.appendChild(body);
  return wrapper;
}

// ─── Forces Section ───────────────────────────────────────────

function buildForcesSection(opts: ControlsPanelOptions): HTMLElement {
  const fv = opts.initialForceValues ?? {};

  return makeSection('Forces', (body) => {
    // Drag
    const dragEnabled = (fv['drag']?.['_enabled'] ?? 1) !== 0;
    body.appendChild(makeToggle('Drag', dragEnabled, (on) => opts.onForceToggle?.('drag', on)));
    body.appendChild(makeSlider('  Coeff', 0, 5, 0.1, fv['drag']?.['coefficient'] ?? 0.8, (v) => opts.onForceChange?.('drag', 'coefficient', v), 'force.drag.coefficient'));

    // Wander
    const wanderEnabled = (fv['wander']?.['_enabled'] ?? 1) !== 0;
    body.appendChild(makeToggle('Wander', wanderEnabled, (on) => opts.onForceToggle?.('wander', on)));
    body.appendChild(makeSlider('  Str', 0, 200, 1, fv['wander']?.['strength'] ?? 40, (v) => opts.onForceChange?.('wander', 'strength', v), 'force.wander.strength'));
    body.appendChild(makeSlider('  Rate', 0, 10, 0.1, fv['wander']?.['rate'] ?? 2.5, (v) => opts.onForceChange?.('wander', 'rate', v), 'force.wander.rate'));

    // Pointer
    const pointerEnabled = (fv['pointer']?.['_enabled'] ?? 0) !== 0;
    body.appendChild(makeToggle('Pointer', pointerEnabled, (on) => opts.onForceToggle?.('pointer', on)));
    body.appendChild(makeSlider('  Str', -500, 500, 5, fv['pointer']?.['strength'] ?? 200, (v) => opts.onForceChange?.('pointer', 'strength', v), 'force.pointer.strength'));
    body.appendChild(makeSlider('  Radius', 10, 400, 5, fv['pointer']?.['radius'] ?? 150, (v) => opts.onForceChange?.('pointer', 'radius', v), 'force.pointer.radius'));
    body.appendChild(makeFalloffSelect((fv['pointer']?.['falloff'] as unknown as string) ?? 'linear', (v) => {
      // Store falloff as a special param via onForceChange with string value mapped to number
      // Since onForceChange expects number, encode falloff as a special call
      opts.onForceChange?.('pointer', 'falloff_' + v, 0);
    }));
  });
}

// ─── Interaction Matrix Section ───────────────────────────────

function buildMatrixSection(opts: ControlsPanelOptions): HTMLElement {
  const n = opts.speciesCount ?? 3;
  const names = opts.speciesNames ?? Array.from({ length: n }, (_, i) => `S${i}`);
  const initMatrix = opts.initialMatrixValues;

  return makeSection('Interaction Matrix', (body) => {
    // Buttons row
    const btnRow = el('div', 'crit-row');
    const randBtn = el('button', 'crit-btn');
    randBtn.textContent = '🎲 Randomize';
    randBtn.addEventListener('click', () => opts.onRandomizeMatrix?.());
    btnRow.appendChild(randBtn);
    const clearBtn = el('button', 'crit-btn');
    clearBtn.textContent = '✕ Clear';
    clearBtn.addEventListener('click', () => opts.onClearMatrix?.());
    btnRow.appendChild(clearBtn);
    body.appendChild(btnRow);

    // Grid
    const grid = el('div', 'crit-matrix-grid');
    grid.style.gridTemplateColumns = `44px repeat(${n}, 1fr)`;

    // Header row
    const corner = el('div', 'crit-matrix-header');
    grid.appendChild(corner);
    for (let j = 0; j < n; j++) {
      const hdr = el('div', 'crit-matrix-header');
      hdr.textContent = names[j].substring(0, 5);
      hdr.title = names[j];
      grid.appendChild(hdr);
    }

    // Data rows
    for (let i = 0; i < n; i++) {
      const rowLbl = el('div', 'crit-matrix-header');
      rowLbl.textContent = names[i].substring(0, 5);
      rowLbl.title = names[i];
      grid.appendChild(rowLbl);

      for (let j = 0; j < n; j++) {
        const init = initMatrix?.[i]?.[j];
        const cell = el('div', 'crit-matrix-cell');
        const initStr = init?.strength ?? 0;
        updateCellColor(cell, initStr);

        const valLabel = el('span', 'crit-matrix-val');
        valLabel.textContent = String(initStr);
        cell.appendChild(valLabel);

        // Click cell to cycle: +25, -25
        const ii = i, jj = j;
        let currentStr = initStr;
        cell.addEventListener('click', () => {
          currentStr += 25;
          if (currentStr > 100) currentStr = -100;
          valLabel.textContent = String(currentStr);
          updateCellColor(cell, currentStr);
          const radius = init?.radius ?? 100;
          const falloff = init?.falloff ?? 'linear';
          opts.onMatrixChange?.(ii, jj, currentStr, radius, falloff);
        });
        // Right-click to decrease
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          currentStr -= 25;
          if (currentStr < -100) currentStr = 100;
          valLabel.textContent = String(currentStr);
          updateCellColor(cell, currentStr);
          const radius = init?.radius ?? 100;
          const falloff = init?.falloff ?? 'linear';
          opts.onMatrixChange?.(ii, jj, currentStr, radius, falloff);
        });

        grid.appendChild(cell);
      }
    }

    body.appendChild(grid);
  });
}

function updateCellColor(cell: HTMLElement, strength: number): void {
  if (strength > 0) {
    cell.style.background = `rgba(80,200,80,${Math.min(Math.abs(strength) / 100, 0.6)})`;
  } else if (strength < 0) {
    cell.style.background = `rgba(200,80,80,${Math.min(Math.abs(strength) / 100, 0.6)})`;
  } else {
    cell.style.background = 'rgba(60,60,60,0.5)';
  }
}

// ─── Actions Section ──────────────────────────────────────────

function buildActionsSection(opts: ControlsPanelOptions): HTMLElement {
  return makeSection('Actions', (body) => {
    // Export / Import row
    const ioRow = el('div', 'crit-row');
    const exportBtn = el('button', 'crit-btn');
    exportBtn.textContent = '💾 Export';
    exportBtn.addEventListener('click', () => opts.onExport?.());
    ioRow.appendChild(exportBtn);
    const importBtn = el('button', 'crit-btn');
    importBtn.textContent = '📂 Import';
    importBtn.addEventListener('click', () => opts.onImport?.());
    ioRow.appendChild(importBtn);
    body.appendChild(ioRow);

    // Built-in Presets dropdown
    const builtinRow = el('div', 'crit-preset-row');
    const builtinLabel = el('span', 'crit-label');
    builtinLabel.textContent = 'Presets';
    builtinLabel.style.minWidth = '50px';
    const builtinSelect = document.createElement('select');
    builtinSelect.className = 'crit-preset-select';
    {
      const placeholder = document.createElement('option');
      placeholder.textContent = 'Choose a preset...';
      placeholder.disabled = true;
      placeholder.selected = true;
      builtinSelect.appendChild(placeholder);
      for (const name of BUILTIN_PRESET_NAMES) {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        builtinSelect.appendChild(o);
      }
    }
    const builtinLoadBtn = el('button', 'crit-btn crit-btn-small');
    builtinLoadBtn.textContent = '▶ Load';
    builtinLoadBtn.addEventListener('click', () => {
      const name = builtinSelect.value;
      if (name) opts.onLoadBuiltinPreset?.(name);
    });
    builtinRow.appendChild(builtinLabel);
    builtinRow.appendChild(builtinSelect);
    builtinRow.appendChild(builtinLoadBtn);
    body.appendChild(builtinRow);

    // Divider
    const divider = el('div');
    divider.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08); margin:6px 0;';
    body.appendChild(divider);

    // Save Preset
    const saveRow = el('div', 'crit-preset-row');
    const presetNameInput = document.createElement('input');
    presetNameInput.type = 'text';
    presetNameInput.className = 'crit-name-input';
    presetNameInput.style.flex = '1';
    presetNameInput.placeholder = 'Preset name...';
    presetNameInput.style.width = 'auto';
    const saveBtn = el('button', 'crit-btn crit-btn-small');
    saveBtn.textContent = '💾 Save';
    saveBtn.addEventListener('click', () => {
      const name = presetNameInput.value.trim();
      if (name) {
        opts.onSavePreset?.(name);
        presetNameInput.value = '';
        refreshPresetDropdown(presetSelect, opts);
      }
    });
    saveRow.appendChild(presetNameInput);
    saveRow.appendChild(saveBtn);
    body.appendChild(saveRow);

    // Load / Delete Preset
    const presetRow = el('div', 'crit-preset-row');
    const presetSelect = document.createElement('select');
    presetSelect.className = 'crit-preset-select';
    refreshPresetDropdown(presetSelect, opts);

    const loadBtn = el('button', 'crit-btn crit-btn-small');
    loadBtn.textContent = '📂 Load';
    loadBtn.addEventListener('click', () => {
      const name = presetSelect.value;
      if (name) opts.onLoadPreset?.(name);
    });

    const delBtn = el('button', 'crit-btn crit-btn-small crit-btn-danger');
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => {
      const name = presetSelect.value;
      if (name && confirm(`Delete preset "${name}"?`)) {
        opts.onDeletePreset?.(name);
        refreshPresetDropdown(presetSelect, opts);
      }
    });

    presetRow.appendChild(presetSelect);
    presetRow.appendChild(loadBtn);
    presetRow.appendChild(delBtn);
    body.appendChild(presetRow);
  });
}

function refreshPresetDropdown(select: HTMLSelectElement, opts: ControlsPanelOptions): void {
  select.innerHTML = '';
  const presets = opts.getSavedPresets?.() ?? [];
  if (presets.length === 0) {
    const o = document.createElement('option');
    o.textContent = '(no presets)';
    o.disabled = true;
    o.selected = true;
    select.appendChild(o);
  } else {
    for (const name of presets) {
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      select.appendChild(o);
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
