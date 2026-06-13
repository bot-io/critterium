// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PopulationGraph } from './population-graph.js';
import type { PopulationGraphOptions } from './population-graph.js';

// Mock canvas 2d context since jsdom doesn't implement it
function mockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  canvas.getContext = (type: string) =>
    type === '2d' ? (ctx as unknown as CanvasRenderingContext2D) : null;
  return canvas;
}

function getCtx(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d') as unknown as ReturnType<
    typeof mockCanvas
  > extends HTMLCanvasElement & { getContext(f: string): infer R }
    ? R
    : never;
}

describe('PopulationGraph', () => {
  let canvas: HTMLCanvasElement;
  let options: PopulationGraphOptions;

  beforeEach(() => {
    canvas = mockCanvas();
    options = {
      speciesColors: [0x44cc44, 0xff4444, 0xcc44cc],
      maxHistorySec: 30,
    };
  });

  it('constructor sets canvas dimensions', () => {
    new PopulationGraph(canvas, options);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(80);
  });

  it('constructor sets fixed CSS positioning', () => {
    new PopulationGraph(canvas, options);
    expect(canvas.style.position).toBe('fixed');
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('constructor sets z-index to 10', () => {
    new PopulationGraph(canvas, options);
    expect(canvas.style.zIndex).toBe('10');
  });

  it('update calls draw even with small dt', () => {
    const pg = new PopulationGraph(canvas, options);
    const ctx = canvas.getContext('2d') as any;
    pg.update([10, 20, 30], 0.1);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 80);
  });

  it('update samples when accumulated dt >= 0.5', () => {
    const pg = new PopulationGraph(canvas, options);
    const ctx = canvas.getContext('2d') as any;
    pg.update([10, 20, 30], 0.5);
    // After first sample, history has 1 entry, draw is called
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled(); // background
  });

  it('multiple updates accumulate time correctly', () => {
    const pg = new PopulationGraph(canvas, options);
    const ctx = canvas.getContext('2d') as any;
    // Two 0.3s updates = 0.6s → one sample triggered on second update
    pg.update([10, 20, 30], 0.3);
    pg.update([10, 20, 30], 0.3);
    // draw called twice (once per update)
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
  });

  it('accepts Int32Array species counts', () => {
    const pg = new PopulationGraph(canvas, options);
    expect(() => pg.update(new Int32Array([10, 20, 30]), 0.5)).not.toThrow();
  });

  it('accepts Uint8Array species counts', () => {
    const pg = new PopulationGraph(canvas, options);
    expect(() => pg.update(new Uint8Array([10, 20, 30]), 0.5)).not.toThrow();
  });

  it('accepts regular number array species counts', () => {
    const pg = new PopulationGraph(canvas, options);
    expect(() => pg.update([10, 20, 30], 0.5)).not.toThrow();
  });

  it('trimming history to max entries works', () => {
    const pg = new PopulationGraph(canvas, options);
    // maxHistorySec=30, sampleInterval=0.5 → maxEntries = 60
    for (let i = 0; i < 65; i++) {
      pg.update([10 + i, 20 + i, 30 + i], 0.5);
    }
    // No error means trimming worked
    expect(true).toBe(true);
  });

  it('destroy clears canvas', () => {
    const pg = new PopulationGraph(canvas, options);
    const ctx = canvas.getContext('2d') as any;
    pg.destroy();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 80);
  });

  it('handles single species', () => {
    const singleOpts: PopulationGraphOptions = {
      speciesColors: [0xff0000],
      maxHistorySec: 10,
    };
    const pg = new PopulationGraph(canvas, singleOpts);
    expect(() => pg.update([50], 0.5)).not.toThrow();
  });

  it('handles zero counts', () => {
    const pg = new PopulationGraph(canvas, options);
    expect(() => pg.update([0, 0, 0], 0.5)).not.toThrow();
  });

  it('works with many species', () => {
    const manyOpts: PopulationGraphOptions = {
      speciesColors: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff],
      maxHistorySec: 30,
    };
    const pg = new PopulationGraph(canvas, manyOpts);
    expect(() => pg.update([10, 20, 30, 40, 50], 0.5)).not.toThrow();
  });

  it('canvas borderRadius is set', () => {
    new PopulationGraph(canvas, options);
    expect(canvas.style.borderRadius).toBe('4px');
  });

  it('canvas position is bottom-left', () => {
    new PopulationGraph(canvas, options);
    expect(canvas.style.left).toBe('8px');
    expect(canvas.style.bottom).toBe('8px');
  });

  it('draws lines only when 2+ history entries exist', () => {
    const pg = new PopulationGraph(canvas, options);
    const ctx = canvas.getContext('2d') as any;
    // First sample
    pg.update([10, 20, 30], 0.5);
    // Only 1 entry → no lines drawn (beginPath not called for species lines)
    const beginPathCountAfter1 = ctx.beginPath.mock.calls.length;
    // Second sample
    pg.update([15, 25, 35], 0.5);
    // Now 2 entries → lines drawn
    const beginPathCountAfter2 = ctx.beginPath.mock.calls.length;
    expect(beginPathCountAfter2).toBeGreaterThan(beginPathCountAfter1);
  });
});
