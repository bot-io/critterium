/**
 * Critterium — Controls UI Overlay (CRT-12)
 *
 * A collapsible HTML overlay panel for live simulation control.
 * Sections: Simulation, Species, Forces, Matrix, Actions.
 */

import type { CritteriumConfig } from '@critterium/core';
import type { autosave, exportConfig, importConfig } from './persistence.js';

/** Options for the controls panel. */
export interface ControlsPanelOptions {
  /** Called when play/pause is toggled. Receives new paused state. */
  onTogglePause?: (paused: boolean) => void;
  /** Called to reset the simulation. */
  onReset?: () => void;
  /** Called to re-seed the simulation with a new random seed. */
  onReseed?: () => void;
  /** Called when population cap changes. */
  onPopulationCapChange?: (cap: number) => void;
  /** Called when a force parameter changes. */
  onForceChange?: (forceId: string, param: string, value: number) => void;
  /** Called when an interaction matrix entry changes. */
  onMatrixChange?: (i: number, j: number, strength: number) => void;
  /** Called to randomize the interaction matrix. */
  onRandomizeMatrix?: () => void;
  /** Called to export the config. */
  onExport?: () => void;
  /** Called to import a config. */
  onImport?: () => void;
  /** Get current config for export/import. */
  getConfig?: () => CritteriumConfig;
  /** Apply an imported config. */
  applyImportedConfig?: (config: CritteriumConfig) => void;
  /** Current number of species. */
  speciesCount?: number;
  /** Species names for the matrix grid. */
  speciesNames?: string[];
}

// ─── Styles ───────────────────────────────────────────────────

const STYLES = `
  .crit-controls-toggle {
    position: fixed; top: 10px; right: 10px; z-index: 10001;
    width: 36px; height: 36px; border: none; border-radius: 6px;
    background: rgba(30,30,30,0.85); color: #ccc; font-size: 20px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
  }
  .crit-controls-toggle:hover { background: rgba(60,60,60,0.95); }

  .crit-controls-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 320px;
    z-index: 10000; background: rgba(20,20,24,0.92);
    color: #ddd; font: 12px/1.5 'Consolas', 'Monaco', monospace;
    overflow-y: auto; padding: 50px 12px 12px 12px;
    backdrop-filter: blur(8px); border-left: 1px solid rgba(255,255,255,0.08);
    transition: transform 0.25s ease;
  }
  .crit-controls-panel.hidden { transform: translateX(340px); }

  .crit-section { margin-bottom: 14px; }
  .crit-section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: #888; margin: 0 0 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;
  }

  .crit-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
  .crit-label { min-width: 80px; color: #aaa; font-size: 11px; }
  .crit-value { color: #eee; font-size: 11px; min-width: 32px; text-align: right; }

  input[type="range"] {
    flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
    background: rgba(255,255,255,0.15); border-radius: 2px; outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #6af; cursor: pointer;
  }

  input[type="color"] {
    width: 24px; height: 24px; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 3px; cursor: pointer; background: transparent; padding: 0;
  }

  .crit-btn {
    padding: 4px 10px; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; background: rgba(255,255,255,0.06);
    color: #ccc; font: 11px/1.4 'Consolas', monospace; cursor: pointer;
    transition: background 0.15s;
  }
  .crit-btn:hover { background: rgba(255,255,255,0.15); }
  .crit-btn.active { background: rgba(100,180,255,0.25); border-color: #6af; }

  .crit-matrix-grid {
    display: grid; gap: 2px; margin-top: 4px;
  }
  .crit-matrix-cell {
    display: flex; align-items: center; justify-content: center;
    padding: 2px; font-size: 9px; border-radius: 3px;
    min-height: 28px;
  }
  .crit-matrix-header {
    font-size: 9px; color: #666; text-align: center;
    padding: 2px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crit-toggle {
    position: relative; width: 30px; height: 16px; border-radius: 8px;
    background: rgba(255,255,255,0.1); cursor: pointer; transition: background 0.2s;
    border: none; padding: 0;
  }
  .crit-toggle.on { background: rgba(100,180,255,0.5); }
  .crit-toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px; border-radius: 50%;
    background: #ccc; transition: transform 0.2s;
  }
  .crit-toggle.on::after { transform: translateX(14px); }
`;

// ─── Panel creation ───────────────────────────────────────────

let panelOpen = false;

/**
 * Create the controls panel and toggle button.
 * Returns the panel DOM element (the toggle button is auto-mounted).
 */
export function createControlsPanel(options: ControlsPanelOptions): HTMLElement {
  // Inject styles once
  if (!document.getElementById('crit-controls-styles')) {
    const style = document.createElement('style');
    style.id = 'crit-controls-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Create toggle button
  const toggle = document.createElement('button');
  toggle.className = 'crit-controls-toggle';
  toggle.textContent = '⚙';
  toggle.title = 'Toggle Controls';

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'crit-controls-panel hidden';

  // Wire toggle
  toggle.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.classList.toggle('hidden', !panelOpen);
  });

  // Build sections
  panel.appendChild(buildSimulationSection(options));
  panel.appendChild(buildForcesSection(options));
  panel.appendChild(buildMatrixSection(options));
  panel.appendChild(buildActionsSection(options));

  // Mount toggle to body
  document.body.appendChild(toggle);

  return panel;
}

// ─── Simulation Section ───────────────────────────────────────

function buildSimulationSection(opts: ControlsPanelOptions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crit-section';

  const title = document.createElement('div');
  title.className = 'crit-section-title';
  title.textContent = 'Simulation';
  section.appendChild(title);

  // Play/Pause, Reset, Re-seed buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'crit-row';

  let paused = false;
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'crit-btn';
  pauseBtn.textContent = '⏸ Pause';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
    pauseBtn.classList.toggle('active', paused);
    opts.onTogglePause?.(paused);
  });
  btnRow.appendChild(pauseBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'crit-btn';
  resetBtn.textContent = '↺ Reset';
  resetBtn.addEventListener('click', () => opts.onReset?.());
  btnRow.appendChild(resetBtn);

  const reseedBtn = document.createElement('button');
  reseedBtn.className = 'crit-btn';
  reseedBtn.textContent = '🎲 Seed';
  reseedBtn.addEventListener('click', () => opts.onReseed?.());
  btnRow.appendChild(reseedBtn);

  section.appendChild(btnRow);

  // Population cap slider
  const capRow = document.createElement('div');
  capRow.className = 'crit-row';
  const capLabel = document.createElement('span');
  capLabel.className = 'crit-label';
  capLabel.textContent = 'Pop Cap';
  const capSlider = document.createElement('input');
  capSlider.type = 'range';
  capSlider.min = '50';
  capSlider.max = '2000';
  capSlider.value = '600';
  capSlider.step = '50';
  const capValue = document.createElement('span');
  capValue.className = 'crit-value';
  capValue.textContent = '600';
  capSlider.addEventListener('input', () => {
    const v = parseInt(capSlider.value);
    capValue.textContent = String(v);
    opts.onPopulationCapChange?.(v);
  });
  capRow.appendChild(capLabel);
  capRow.appendChild(capSlider);
  capRow.appendChild(capValue);
  section.appendChild(capRow);

  return section;
}

// ─── Forces Section ───────────────────────────────────────────

function buildForcesSection(opts: ControlsPanelOptions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crit-section';

  const title = document.createElement('div');
  title.className = 'crit-section-title';
  title.textContent = 'Forces';
  section.appendChild(title);

  // Drag
  section.appendChild(makeForceSlider('Drag', 'drag', 'coefficient', 0, 5, 0.1, 0.8, opts));
  // Wander
  section.appendChild(makeForceSlider('Wander Str', 'wander', 'strength', 0, 200, 1, 40, opts));
  section.appendChild(makeForceSlider('Wander Rate', 'wander', 'rate', 0, 10, 0.1, 2.5, opts));
  // Pointer
  section.appendChild(makeForceSlider('Pointer Str', 'pointer', 'strength', 0, 500, 5, 200, opts));
  section.appendChild(makeForceSlider('Pointer Rad', 'pointer', 'radius', 0, 400, 5, 150, opts));

  return section;
}

function makeForceSlider(
  label: string, forceId: string, param: string,
  min: number, max: number, step: number, initial: number,
  opts: ControlsPanelOptions,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'crit-row';
  const lbl = document.createElement('span');
  lbl.className = 'crit-label';
  lbl.textContent = label;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(initial);
  const val = document.createElement('span');
  val.className = 'crit-value';
  val.textContent = String(initial);
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    val.textContent = String(v);
    opts.onForceChange?.(forceId, param, v);
  });
  row.appendChild(lbl);
  row.appendChild(slider);
  row.appendChild(val);
  return row;
}

// ─── Matrix Section ───────────────────────────────────────────

function buildMatrixSection(opts: ControlsPanelOptions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crit-section';

  const title = document.createElement('div');
  title.className = 'crit-section-title';
  title.textContent = 'Interaction Matrix';
  section.appendChild(title);

  const n = opts.speciesCount ?? 3;
  const names = opts.speciesNames ?? Array.from({ length: n }, (_, i) => `S${i}`);

  const grid = document.createElement('div');
  grid.className = 'crit-matrix-grid';
  grid.style.gridTemplateColumns = `40px repeat(${n}, 1fr)`;

  // Header row: empty cell + species names
  const corner = document.createElement('div');
  corner.className = 'crit-matrix-header';
  grid.appendChild(corner);
  for (let j = 0; j < n; j++) {
    const hdr = document.createElement('div');
    hdr.className = 'crit-matrix-header';
    hdr.textContent = names[j].substring(0, 4);
    hdr.title = names[j];
    grid.appendChild(hdr);
  }

  // Rows
  for (let i = 0; i < n; i++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'crit-matrix-header';
    rowLabel.textContent = names[i].substring(0, 4);
    rowLabel.title = names[i];
    grid.appendChild(rowLabel);

    for (let j = 0; j < n; j++) {
      const cell = document.createElement('div');
      cell.className = 'crit-matrix-cell';
      cell.style.background = 'rgba(60,60,60,0.5)';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '-100';
      slider.max = '100';
      slider.value = '0';
      slider.step = '5';
      slider.style.width = '100%';
      slider.style.height = '4px';

      const updateColor = () => {
        const v = parseInt(slider.value);
        if (v > 0) {
          cell.style.background = `rgba(80,200,80,${Math.min(v / 100, 0.6)})`;
        } else if (v < 0) {
          cell.style.background = `rgba(200,80,80,${Math.min(-v / 100, 0.6)})`;
        } else {
          cell.style.background = 'rgba(60,60,60,0.5)';
        }
      };

      const ii = i, jj = j;
      slider.addEventListener('input', () => {
        updateColor();
        opts.onMatrixChange?.(ii, jj, parseInt(slider.value));
      });

      cell.appendChild(slider);
      grid.appendChild(cell);
    }
  }

  section.appendChild(grid);
  return section;
}

// ─── Actions Section ──────────────────────────────────────────

function buildActionsSection(opts: ControlsPanelOptions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'crit-section';

  const title = document.createElement('div');
  title.className = 'crit-section-title';
  title.textContent = 'Actions';
  section.appendChild(title);

  const row = document.createElement('div');
  row.className = 'crit-row';

  const randBtn = document.createElement('button');
  randBtn.className = 'crit-btn';
  randBtn.textContent = '🎲 Randomize Matrix';
  randBtn.addEventListener('click', () => opts.onRandomizeMatrix?.());
  row.appendChild(randBtn);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'crit-btn';
  exportBtn.textContent = '💾 Export';
  exportBtn.addEventListener('click', () => opts.onExport?.());
  row.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'crit-btn';
  importBtn.textContent = '📂 Import';
  importBtn.addEventListener('click', () => opts.onImport?.());
  row.appendChild(importBtn);

  section.appendChild(row);
  return section;
}
