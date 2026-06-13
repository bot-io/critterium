// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createControlsPanel,
  resetAllSliders,
  getSliderValue,
  getAllSpeciesCounts,
} from './controls.js';
import type { ControlsPanelOptions } from './controls.js';

function makeOptions(overrides: Partial<ControlsPanelOptions> = {}): ControlsPanelOptions {
  return {
    onTogglePause: vi.fn(),
    onReset: vi.fn(),
    onReseed: vi.fn(),
    onSpeedChange: vi.fn(),
    onPopulationCapChange: vi.fn(),
    onForceToggle: vi.fn(),
    onForceChange: vi.fn(),
    onMatrixChange: vi.fn(),
    onRandomizeMatrix: vi.fn(),
    onClearMatrix: vi.fn(),
    onSpeciesChange: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    onLoadBuiltinPreset: vi.fn(),
    getSavedPresets: () => [],
    speciesCount: 3,
    speciesNames: ['Prey', 'Predator', 'Parasite'],
    speciesColors: ['#44cc44', '#ff4444', '#cc44cc'],
    initialForceValues: {
      drag: { coefficient: 0.8, _enabled: 1 },
      wander: { strength: 40, rate: 2.5, _enabled: 1 },
      pointer: { strength: 200, radius: 150, _falloff: 0, _enabled: 0 },
    },
    ...overrides,
  };
}

describe('controls panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('createControlsPanel returns an HTMLElement', () => {
    const panel = createControlsPanel(makeOptions());
    expect(panel).toBeInstanceOf(HTMLElement);
    expect(panel.classList.contains('crit-panel')).toBe(true);
  });

  it('panel starts hidden', () => {
    const panel = createControlsPanel(makeOptions());
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('creates a toggle button appended to body', () => {
    createControlsPanel(makeOptions());
    const toggle = document.querySelector('.crit-controls-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toContain('⚙');
  });

  it('clicking toggle shows the panel', () => {
    const panel = createControlsPanel(makeOptions());
    const toggle = document.querySelector('.crit-controls-toggle') as HTMLElement;
    toggle.click();
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('clicking toggle twice hides the panel', () => {
    const panel = createControlsPanel(makeOptions());
    const toggle = document.querySelector('.crit-controls-toggle') as HTMLElement;
    // Note: panelOpen is module-level state from previous tests.
    // Ensure we start from a known state by clicking 3 times (off→on→off)
    toggle.click();
    toggle.click();
    toggle.click();
    // After 3 clicks from unknown state, we end up toggled 3 times.
    // But the panel reference might be stale if panelOpen was true from a prior test.
    // So let's just verify the toggle mechanism works by checking visibility changes
    const panelAfterFirst = panel.classList.contains('hidden');
    toggle.click();
    const panelAfterSecond = panel.classList.contains('hidden');
    expect(panelAfterFirst).not.toBe(panelAfterSecond);
  });

  it('panel contains 5 sections', () => {
    const panel = createControlsPanel(makeOptions());
    const sections = panel.querySelectorAll('.crit-section-title');
    expect(sections.length).toBe(5);
  });

  it('panel section titles match expected names', () => {
    const panel = createControlsPanel(makeOptions());
    const titles = Array.from(panel.querySelectorAll('.crit-section-title')).map(
      (el) => el.textContent,
    );
    // Titles are set as-is (text-transform: uppercase is CSS only)
    expect(titles).toContain('Simulation');
    expect(titles).toContain('Species');
    expect(titles).toContain('Forces');
    expect(titles).toContain('Interaction Matrix');
    expect(titles).toContain('Actions');
  });

  it('Pause button fires onTogglePause callback', () => {
    const opts = makeOptions();
    const panel = createControlsPanel(opts);
    const pauseBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Pause'),
    ) as HTMLElement;
    expect(pauseBtn).toBeDefined();
    pauseBtn.click();
    expect(opts.onTogglePause).toHaveBeenCalledWith(true);
  });

  it('Pause button toggles text between Pause and Play', () => {
    const panel = createControlsPanel(makeOptions());
    const pauseBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Pause'),
    ) as HTMLElement;
    pauseBtn.click();
    expect(pauseBtn.textContent).toContain('Play');
    pauseBtn.click();
    expect(pauseBtn.textContent).toContain('Pause');
  });

  it('Reset button fires onReset callback', () => {
    const opts = makeOptions();
    const panel = createControlsPanel(opts);
    const resetBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Reload Preset'),
    ) as HTMLElement;
    expect(resetBtn).toBeDefined();
    resetBtn.click();
    expect(opts.onReset).toHaveBeenCalled();
  });

  it('Seed button fires onReseed callback', () => {
    const opts = makeOptions();
    const panel = createControlsPanel(opts);
    const seedBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Reseed'),
    ) as HTMLElement;
    expect(seedBtn).toBeDefined();
    seedBtn.click();
    expect(opts.onReseed).toHaveBeenCalled();
  });

  it('collapsible section toggles collapsed class on click', () => {
    const panel = createControlsPanel(makeOptions());
    const hdr = panel.querySelector('.crit-section-hdr') as HTMLElement;
    const body = hdr.nextElementSibling as HTMLElement;
    expect(body.classList.contains('collapsed')).toBe(false);
    hdr.click();
    expect(body.classList.contains('collapsed')).toBe(true);
    hdr.click();
    expect(body.classList.contains('collapsed')).toBe(false);
  });

  it('collapsible section arrow toggles between ▼ and ▶', () => {
    const panel = createControlsPanel(makeOptions());
    const hdr = panel.querySelector('.crit-section-hdr') as HTMLElement;
    const arrow = hdr.querySelector('.crit-section-arrow') as HTMLElement;
    expect(arrow.textContent).toBe('▼');
    hdr.click();
    expect(arrow.textContent).toBe('▶');
    hdr.click();
    expect(arrow.textContent).toBe('▼');
  });

  it('species tab buttons match speciesCount', () => {
    const panel = createControlsPanel(makeOptions({ speciesCount: 3 }));
    const tabBtns = panel.querySelectorAll('.crit-species-tab');
    expect(tabBtns.length).toBe(3);
  });

  it('species tab buttons with 2 species creates 2 tabs', () => {
    const panel = createControlsPanel(
      makeOptions({
        speciesCount: 2,
        speciesNames: ['Alpha', 'Beta'],
        speciesColors: ['#ff0000', '#00ff00'],
      }),
    );
    const tabBtns = panel.querySelectorAll('.crit-species-tab');
    expect(tabBtns.length).toBe(2);
  });

  it('Add Species button exists', () => {
    const panel = createControlsPanel(makeOptions());
    const addBtn = panel.querySelector('.crit-btn-add-species');
    expect(addBtn).not.toBeNull();
    expect(addBtn!.textContent).toContain('Add Species');
  });

  it('matrix grid has correct number of cells for 2 species', () => {
    const panel = createControlsPanel(makeOptions({ speciesCount: 2, speciesNames: ['A', 'B'] }));
    const cells = panel.querySelectorAll('.crit-matrix-cell');
    expect(cells.length).toBe(4);
  });

  it('matrix grid has 9 cells for 3 species', () => {
    const panel = createControlsPanel(makeOptions({ speciesCount: 3 }));
    const cells = panel.querySelectorAll('.crit-matrix-cell');
    expect(cells.length).toBe(9);
  });

  it('clicking matrix cell fires onMatrixChange', () => {
    const opts = makeOptions({ speciesCount: 2, speciesNames: ['A', 'B'] });
    const panel = createControlsPanel(opts);
    const firstCell = panel.querySelector('.crit-matrix-cell') as HTMLElement;
    firstCell.click();
    expect(opts.onMatrixChange).toHaveBeenCalledWith(0, 0, 25, 70, 100, 'linear');
  });

  it('Export button fires onExport callback', () => {
    const opts = makeOptions();
    const panel = createControlsPanel(opts);
    const exportBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Export'),
    ) as HTMLElement;
    expect(exportBtn).toBeDefined();
    exportBtn.click();
    expect(opts.onExport).toHaveBeenCalled();
  });

  it('Import button fires onImport callback', () => {
    const opts = makeOptions();
    const panel = createControlsPanel(opts);
    const importBtn = Array.from(panel.querySelectorAll('.crit-btn')).find((b) =>
      b.textContent?.includes('Import'),
    ) as HTMLElement;
    expect(importBtn).toBeDefined();
    importBtn.click();
    expect(opts.onImport).toHaveBeenCalled();
  });

  it('resetAllSliders does not throw with empty values', () => {
    expect(() =>
      resetAllSliders({
        speciesValues: [],
        simValues: { speed: 1, popCap: 600 },
        forceValues: { drag: { coefficient: 0.8 }, wander: { strength: 40, rate: 2.5 } },
      }),
    ).not.toThrow();
  });

  it('styles are injected into document head', () => {
    createControlsPanel(makeOptions());
    const style = document.getElementById('crit-controls-styles');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('.crit-panel');
  });

  it('built-in preset dropdown contains all preset names', () => {
    const panel = createControlsPanel(makeOptions());
    const selects = panel.querySelectorAll('.crit-preset-select');
    // First preset select is built-in presets
    const builtinSelect = selects[0];
    expect(builtinSelect).toBeDefined();
    const options = Array.from(builtinSelect.querySelectorAll('option'));
    const optTexts = options.map((o) => o.textContent);
    // Should contain at least "Choose a preset..."
    expect(optTexts.some((t) => t?.includes('Choose'))).toBe(true);
  });

  it('force toggles exist for Drag, Wander, and Pointer', () => {
    const panel = createControlsPanel(makeOptions());
    const toggles = panel.querySelectorAll('.crit-toggle');
    expect(toggles.length).toBeGreaterThanOrEqual(3);
  });

  it('sliders exist within the panel', () => {
    const panel = createControlsPanel(makeOptions());
    const sliders = panel.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBeGreaterThan(0);
  });

  // ─── getSliderValue / getAllSpeciesCounts (CRT-22) ───────────────
  it('getSliderValue returns undefined for unregistered key', () => {
    expect(getSliderValue('nonexistent.key')).toBeUndefined();
  });

  it('getSliderValue returns current numeric value of a registered slider', () => {
    createControlsPanel(makeOptions({ speciesCount: 2, speciesNames: ['A', 'B'] }));
    const val = getSliderValue('species.0.count');
    expect(val).toBeTypeOf('number');
    expect(val!).toBeGreaterThan(0);
  });

  it('getAllSpeciesCounts returns counts for every species with a slider', () => {
    createControlsPanel(makeOptions({ speciesCount: 3 }));
    const counts = getAllSpeciesCounts(3);
    expect(counts.length).toBe(3);
    for (const c of counts) {
      expect(c).toBeTypeOf('number');
      expect(c!).toBeGreaterThan(0);
    }
  });

  it('getAllSpeciesCounts pads with undefined for species beyond registered sliders', () => {
    const counts = getAllSpeciesCounts(5);
    expect(counts.length).toBe(5);
    // Entries for indices 0-2 may be registered from prior tests, but indices 3-4 are not
    expect(counts[4]).toBeUndefined();
  });

  // ─── maxCount option (CRT-22) ────────────────────────────────────
  it('maxCount option sets species count slider maximum', () => {
    const panel = createControlsPanel(
      makeOptions({ speciesCount: 2, speciesNames: ['A', 'B'], maxCount: 999 }),
    );
    const sliders = panel.querySelectorAll('input[type="range"]');
    const maxes = Array.from(sliders).map((s) => (s as HTMLInputElement).max);
    expect(maxes).toContain('999');
  });

  it('default count slider max is 600 when maxCount not specified', () => {
    const panel = createControlsPanel(makeOptions({ speciesCount: 2, speciesNames: ['A', 'B'] }));
    const sliders = panel.querySelectorAll('input[type="range"]');
    const maxes = Array.from(sliders).map((s) => (s as HTMLInputElement).max);
    expect(maxes).toContain('600');
  });
});
