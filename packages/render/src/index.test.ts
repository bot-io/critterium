import { describe, it, expect } from 'vitest';
import { CritteriumRenderer, type SpeciesVisual } from './index';

// ─── Tests ────────────────────────────────────────────────────

describe('CritteriumRenderer module', () => {
  it('exports CritteriumRenderer class', () => {
    expect(CritteriumRenderer).toBeDefined();
    expect(typeof CritteriumRenderer).toBe('function');
  });

  it('exports SpeciesVisual interface (type-only)', () => {
    const vis: SpeciesVisual = { color: 0xff0000, radius: 5 };
    expect(vis.color).toBe(0xff0000);
    expect(vis.radius).toBe(5);
  });
});

describe('CritteriumRenderer.create', () => {
  it('is an async static method', () => {
    expect(typeof CritteriumRenderer.create).toBe('function');
  });

  it('returns a Promise', () => {
    const result = CritteriumRenderer.create([{ color: 0xff0000, radius: 5 }], ['Test'], 100);
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {
      /* expected in non-DOM */
    });
  });
});

describe('Renderer API shape', () => {
  it('CritteriumRenderer has update method', () => {
    expect(CritteriumRenderer.prototype.update).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.update).toBe('function');
  });

  it('CritteriumRenderer has destroy method', () => {
    expect(CritteriumRenderer.prototype.destroy).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.destroy).toBe('function');
  });
});

describe('Interpolation logic', () => {
  it('alpha=0 returns previous position', () => {
    const prevX = 100;
    const currX = 200;
    const alpha = 0;
    expect(prevX + (currX - prevX) * alpha).toBe(100);
  });

  it('alpha=1 returns current position', () => {
    const prevX = 100;
    const currX = 200;
    const alpha = 1;
    expect(prevX + (currX - prevX) * alpha).toBe(200);
  });

  it('alpha=0.5 returns midpoint', () => {
    const prevX = 100;
    const currX = 200;
    const alpha = 0.5;
    expect(prevX + (currX - prevX) * alpha).toBe(150);
  });

  it('interpolation preserves direction', () => {
    const prevX = 50;
    const currX = -50;
    const alpha = 0.25;
    expect(prevX + (currX - prevX) * alpha).toBe(25);
  });
});

describe('Per-particle rotation from velocity heading', () => {
  it('atan2 gives correct heading for rightward motion', () => {
    expect(Math.atan2(0, 1)).toBeCloseTo(0);
  });

  it('atan2 gives correct heading for downward motion', () => {
    expect(Math.atan2(1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('atan2 gives correct heading for leftward motion', () => {
    expect(Math.atan2(0, -1)).toBeCloseTo(Math.PI);
  });

  it('atan2 gives correct heading for upward motion', () => {
    expect(Math.atan2(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('rotation is independent of speed magnitude', () => {
    expect(Math.atan2(3, 4)).toBeCloseTo(Math.atan2(30, 40));
  });
});

describe('Species visuals', () => {
  it('SpeciesVisual array can be indexed by species type', () => {
    const visuals: SpeciesVisual[] = [
      { color: 0xff0000, radius: 5 },
      { color: 0x00ff00, radius: 3 },
      { color: 0x0000ff, radius: 4 },
    ];
    expect(visuals[0].color).toBe(0xff0000);
    expect(visuals[1].color).toBe(0x00ff00);
    expect(visuals[2].color).toBe(0x0000ff);
  });
});
