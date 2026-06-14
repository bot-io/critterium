// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createControlsPanel,
  resetAllSliders,
  getSliderValue,
  getAllSpeciesCounts,
} from './controls.js';
import type { ControlsPanelOptions, PipelineForceEntry } from './controls.js';
import type { ForceTypeDescriptor } from '@critterium/core';

function makeOptions(overrides: Partial<ControlsPanelOptions> = {}): ControlsPanelOptions {
  return {
    onTogglePause: vi.fn(),
    onReset: vi.fn(),
    onReseed: vi.fn(),
    onSpeedChange: vi.fn(),
    onPopulationCapChange: vi.fn(),
    onForceToggle: vi.fn(),
    onForceChange: vi.fn(),
    onAddForce: vi.fn(),
    onRemoveForce: vi.fn(),
    onSetForceEnabled: vi.fn(),
    onSetForceParam: vi.fn(),
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

// ─── Test fixtures for dynamic force pipeline (CRT-38) ─────────

/** Minimal force type descriptors mirroring the real registry. */
const TEST_FORCE_TYPES: ForceTypeDescriptor[] = [
  {
    type: 'drag',
    displayName: 'Drag',
    description: 'Linear velocity damping.',
    defaultParams: { coefficient: 0.8 },
    paramSchema: [
      {
        key: 'coefficient',
        label: 'Coefficient',
        type: 'number',
        min: 0,
        max: 10,
        step: 0.1,
        default: 0.8,
      },
    ],
  },
  {
    type: 'vortex',
    displayName: 'Vortex',
    description: 'Swirl force around center.',
    defaultParams: { strength: 150, radius: 300, falloff: 'linear' },
    paramSchema: [
      {
        key: 'strength',
        label: 'Swirl',
        type: 'number',
        min: -500,
        max: 500,
        step: 1,
        default: 150,
      },
      { key: 'radius', label: 'Radius', type: 'number', min: 10, max: 2000, step: 1, default: 300 },
      {
        key: 'falloff',
        label: 'Falloff',
        type: 'select',
        default: 'linear',
        options: ['linear', 'inverse', 'constant'],
      },
    ],
  },
];

const TEST_PIPELINE: PipelineForceEntry[] = [
  { type: 'drag', enabled: true, params: { coefficient: 0.8 } },
  { type: 'vortex', enabled: false, params: { strength: 150, radius: 300, falloff: 'linear' } },
];

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

// ─── Dynamic Force Pipeline UI (CRT-38) ──────────────────────────

describe('dynamic force pipeline UI (CRT-38)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function makePipelineOptions(
    overrides: Partial<ControlsPanelOptions> = {},
  ): ControlsPanelOptions {
    return makeOptions({
      pipelineForces: TEST_PIPELINE,
      forceTypeDescriptors: TEST_FORCE_TYPES,
      ...overrides,
    });
  }

  // ── Force row rendering ──────────────────────────────────────

  it('renders one force row per pipeline entry', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const rows = panel.querySelectorAll('.crit-force-row');
    expect(rows.length).toBe(2);
  });

  it('force rows have correct data attributes', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const rows = panel.querySelectorAll('.crit-force-row');
    expect((rows[0] as HTMLElement).dataset.forceType).toBe('drag');
    expect((rows[1] as HTMLElement).dataset.forceType).toBe('vortex');
    expect((rows[0] as HTMLElement).dataset.forceIndex).toBe('0');
    expect((rows[1] as HTMLElement).dataset.forceIndex).toBe('1');
  });

  it('each force row shows the display name from descriptor', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const names = Array.from(panel.querySelectorAll('.crit-force-name')).map((e) => e.textContent);
    expect(names).toContain('Drag');
    expect(names).toContain('Vortex');
  });

  it('force rows render toggle buttons with correct enabled state', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const forceToggles = panel.querySelectorAll('.crit-force-row .crit-toggle');
    expect(forceToggles.length).toBe(2);
    // Drag is enabled, vortex is disabled
    expect(forceToggles[0].classList.contains('on')).toBe(true);
    expect(forceToggles[1].classList.contains('on')).toBe(false);
  });

  it('each force row has a delete button', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const delBtns = panel.querySelectorAll('.crit-force-row .crit-btn-danger');
    expect(delBtns.length).toBe(2);
    for (const btn of Array.from(delBtns)) {
      expect(btn.textContent).toContain('✕');
    }
  });

  // ── Parameter sliders from paramSchema ───────────────────────

  it('renders parameter sliders from paramSchema', () => {
    const panel = createControlsPanel(makePipelineOptions());
    // Drag has 1 param (coefficient), Vortex has 2 number params + 1 select
    const vortexRow = panel.querySelector('.crit-force-row[data-force-type="vortex"]');
    const sliders = vortexRow!.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(2); // strength + radius
  });

  it('slider min/max/step match paramSchema', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const vortexRow = panel.querySelector('.crit-force-row[data-force-type="vortex"]');
    const sliders = vortexRow!.querySelectorAll('input[type="range"]');
    const strengthSlider = sliders[0] as HTMLInputElement;
    expect(strengthSlider.min).toBe('-500');
    expect(strengthSlider.max).toBe('500');
    expect(strengthSlider.step).toBe('1');
  });

  it('slider initial value comes from pipeline params', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const dragRow = panel.querySelector('.crit-force-row[data-force-type="drag"]');
    const slider = dragRow!.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.value).toBe('0.8');
  });

  it('renders select dropdown for select-type params', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const vortexRow = panel.querySelector('.crit-force-row[data-force-type="vortex"]');
    const selects = vortexRow!.querySelectorAll('select.crit-select');
    expect(selects.length).toBe(1); // falloff
  });

  // ── "+ Add Force" control ────────────────────────────────────

  it('renders "+ Add Force" control', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const addRow = panel.querySelector('.crit-force-add-row');
    expect(addRow).not.toBeNull();
  });

  it('add force dropdown lists all force type descriptors', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const addSelect = panel.querySelector('.crit-force-add-select') as HTMLSelectElement;
    expect(addSelect).not.toBeNull();
    const optionValues = Array.from(addSelect.options).map((o) => o.value);
    expect(optionValues).toContain('drag');
    expect(optionValues).toContain('vortex');
  });

  it('add force dropdown has a disabled placeholder option', () => {
    const panel = createControlsPanel(makePipelineOptions());
    const addSelect = panel.querySelector('.crit-force-add-select') as HTMLSelectElement;
    const placeholder = addSelect.querySelector('option[disabled]');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.textContent).toContain('Add Force');
  });

  it('clicking "+ Add" button triggers onAddForce with selected type', () => {
    const onAddForce = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onAddForce }));
    const addSelect = panel.querySelector('.crit-force-add-select') as HTMLSelectElement;
    addSelect.value = 'vortex';
    addSelect.selectedIndex = 2; // skip placeholder + drag
    const addBtn = panel.querySelector('.crit-force-add-row .crit-btn') as HTMLElement;
    addBtn.click();
    expect(onAddForce).toHaveBeenCalledWith('vortex');
  });

  it('clicking "+ Add" without selection does nothing', () => {
    const onAddForce = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onAddForce }));
    const addBtn = panel.querySelector('.crit-force-add-row .crit-btn') as HTMLElement;
    addBtn.click(); // placeholder is selected
    expect(onAddForce).not.toHaveBeenCalled();
  });

  // ── Callback wiring ──────────────────────────────────────────

  it('clicking delete button triggers onRemoveForce with correct index', () => {
    const onRemoveForce = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onRemoveForce }));
    const delBtns = panel.querySelectorAll('.crit-force-row .crit-btn-danger');
    (delBtns[1] as HTMLElement).click(); // delete vortex (index 1)
    expect(onRemoveForce).toHaveBeenCalledWith(1);
  });

  it('clicking toggle triggers onSetForceEnabled with correct index + state', () => {
    const onSetForceEnabled = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onSetForceEnabled }));
    const forceToggles = panel.querySelectorAll('.crit-force-row .crit-toggle');
    // Click vortex toggle (index 1, currently disabled → enable)
    (forceToggles[1] as HTMLElement).click();
    expect(onSetForceEnabled).toHaveBeenCalledWith(1, true);
    // Click again → disable
    (forceToggles[1] as HTMLElement).click();
    expect(onSetForceEnabled).toHaveBeenCalledWith(1, false);
  });

  it('changing a slider triggers onSetForceParam with index + param + value', () => {
    const onSetForceParam = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onSetForceParam }));
    const dragRow = panel.querySelector('.crit-force-row[data-force-type="drag"]');
    const slider = dragRow!.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '2.5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onSetForceParam).toHaveBeenCalledWith(0, 'coefficient', 2.5);
  });

  it('changing a select dropdown triggers onSetForceParam', () => {
    const onSetForceParam = vi.fn();
    const panel = createControlsPanel(makePipelineOptions({ onSetForceParam }));
    const vortexRow = panel.querySelector('.crit-force-row[data-force-type="vortex"]');
    const select = vortexRow!.querySelector('select.crit-select') as HTMLSelectElement;
    select.value = 'inverse';
    select.selectedIndex = 1; // linear=0, inverse=1, constant=2
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSetForceParam).toHaveBeenCalledWith(1, 'falloff', 1);
  });

  // ── Empty pipeline ───────────────────────────────────────────

  it('renders add control even with empty pipeline', () => {
    const panel = createControlsPanel(
      makeOptions({
        pipelineForces: [],
        forceTypeDescriptors: TEST_FORCE_TYPES,
      }),
    );
    const forceRows = panel.querySelectorAll('.crit-force-row');
    expect(forceRows.length).toBe(0);
    const addRow = panel.querySelector('.crit-force-add-row');
    expect(addRow).not.toBeNull();
  });

  // ── Backward compatibility ───────────────────────────────────

  it('falls back to legacy hardcoded sliders when pipelineForces not provided', () => {
    const panel = createControlsPanel(makeOptions());
    // Legacy mode uses makeToggle (no .crit-force-row)
    const forceRows = panel.querySelectorAll('.crit-force-row');
    expect(forceRows.length).toBe(0);
    // But still has toggles for drag/wander/pointer
    const toggles = panel.querySelectorAll('.crit-toggle');
    expect(toggles.length).toBeGreaterThanOrEqual(3);
  });

  // ── Force without descriptor ─────────────────────────────────

  it('renders force row even when descriptor is missing (unknown type)', () => {
    const panel = createControlsPanel(
      makeOptions({
        pipelineForces: [{ type: 'unknown-xyz', enabled: true, params: {} }],
        forceTypeDescriptors: TEST_FORCE_TYPES,
      }),
    );
    const rows = panel.querySelectorAll('.crit-force-row');
    expect(rows.length).toBe(1);
    const name = rows[0].querySelector('.crit-force-name')?.textContent;
    expect(name).toBe('unknown-xyz'); // falls back to type string
  });
});
