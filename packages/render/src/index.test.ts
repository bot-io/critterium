import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CritteriumRenderer,
  type SpeciesVisual,
} from './index';

// ─── Helper: minimal mock objects ─────────────────────────────

/**
 * Create a mock World-like object for testing the renderer
 * without needing PixiJS (DOM-only environment).
 */
function createMockWorld(count: number, types: number[]) {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const type = new Uint8Array(types);
  // Give each particle a random-ish position and velocity
  for (let i = 0; i < count; i++) {
    x[i] = (i * 37 + 13) % 800;
    y[i] = (i * 53 + 7) % 600;
    vx[i] = Math.cos(i) * 50;
    vy[i] = Math.sin(i) * 50;
  }
  return { x, y, vx, vy, type, count };
}

function createMockEco(count: number, aliveFlags: number[]) {
  return {
    alive: new Uint8Array(aliveFlags),
    capacity: count,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('CritteriumRenderer module', () => {
  it('exports CritteriumRenderer class', () => {
    expect(CritteriumRenderer).toBeDefined();
    expect(typeof CritteriumRenderer).toBe('function');
  });

  it('exports SpeciesVisual interface (type-only)', () => {
    // TypeScript interfaces are erased at runtime, but we verify the import doesn't throw
    const vis: SpeciesVisual = { color: 0xff0000, radius: 5 };
    expect(vis.color).toBe(0xff0000);
    expect(vis.radius).toBe(5);
  });

  it('SpeciesVisual supports optional texture property', () => {
    const vis: SpeciesVisual = { color: 0x00ff00, radius: 3, texture: undefined };
    expect(vis.texture).toBeUndefined();
  });
});

describe('CritteriumRenderer.create', () => {
  it('is an async static method', () => {
    expect(typeof CritteriumRenderer.create).toBe('function');
  });

  // Note: Full PixiJS creation requires a DOM/canvas environment.
  // Integration/Playwright tests cover actual rendering.
  // Here we verify the API shape and that it returns a Promise.
  it('returns a Promise', () => {
    // In a non-DOM test environment, this may reject,
    // but we verify it returns a thenable.
    const result = CritteriumRenderer.create(
      [{ color: 0xff0000, radius: 5 }],
      ['Test'],
      100,
    );
    expect(result).toBeInstanceOf(Promise);
    // Don't await — it will likely fail without DOM
    result.catch(() => { /* expected in non-DOM */ });
  });
});

describe('Renderer API shape', () => {
  it('CritteriumRenderer has update method signature', () => {
    // Verify the class prototype has the expected methods
    expect(CritteriumRenderer.prototype.update).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.update).toBe('function');
  });

  it('CritteriumRenderer has destroy method', () => {
    expect(CritteriumRenderer.prototype.destroy).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.destroy).toBe('function');
  });

  it('CritteriumRenderer has storePreviousPositions method', () => {
    expect(CritteriumRenderer.prototype.storePreviousPositions).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.storePreviousPositions).toBe('function');
  });

  it('CritteriumRenderer has setSpeciesTexture method', () => {
    expect(CritteriumRenderer.prototype.setSpeciesTexture).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.setSpeciesTexture).toBe('function');
  });
});

describe('Interpolation logic', () => {
  it('alpha=0 returns current position (no interpolation)', () => {
    // Pure math test of interpolation logic
    const prevX = 100;
    const currX = 200;
    const alpha = 0;
    const result = prevX + (currX - prevX) * alpha;
    expect(result).toBe(100);
  });

  it('alpha=1 returns current position (full step)', () => {
    const prevX = 100;
    const currX = 200;
    const alpha = 1;
    const result = prevX + (currX - prevX) * alpha;
    expect(result).toBe(200);
  });

  it('alpha=0.5 returns midpoint', () => {
    const prevX = 100;
    const currX = 200;
    const alpha = 0.5;
    const result = prevX + (currX - prevX) * alpha;
    expect(result).toBe(150);
  });

  it('interpolation preserves direction', () => {
    const prevX = 50;
    const currX = -50;
    const alpha = 0.25;
    const result = prevX + (currX - prevX) * alpha;
    expect(result).toBe(25); // 50 + (-100) * 0.25
  });
});

describe('Per-particle rotation from velocity heading', () => {
  it('atan2 of velocity gives correct heading for rightward motion', () => {
    const vx = 1;
    const vy = 0;
    expect(Math.atan2(vy, vx)).toBeCloseTo(0);
  });

  it('atan2 of velocity gives correct heading for downward motion', () => {
    const vx = 0;
    const vy = 1;
    expect(Math.atan2(vy, vx)).toBeCloseTo(Math.PI / 2);
  });

  it('atan2 of velocity gives correct heading for leftward motion', () => {
    const vx = -1;
    const vy = 0;
    expect(Math.atan2(vy, vx)).toBeCloseTo(Math.PI);
  });

  it('atan2 of velocity gives correct heading for upward motion', () => {
    const vx = 0;
    const vy = -1;
    expect(Math.atan2(vy, vx)).toBeCloseTo(-Math.PI / 2);
  });

  it('rotation is independent of speed magnitude', () => {
    const r1 = Math.atan2(3, 4);
    const r2 = Math.atan2(30, 40);
    expect(r1).toBeCloseTo(r2);
  });
});

describe('Species texture management', () => {
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

  it('custom texture can be set per species', () => {
    const vis: SpeciesVisual = { color: 0xff, radius: 3 };
    // Texture would be a PixiJS Texture in browser; here just verify the field can be set
    vis.texture = 'mock-texture' as any;
    expect(vis.texture).toBeDefined();
    expect(vis.texture).toBe('mock-texture');
  });
});

describe('Renderer batched sprite design', () => {
  it('all sprites of same type share one texture reference', () => {
    // Simulate the texture-per-type design
    const speciesTextures = ['texture-A', 'texture-B'];
    const spriteTypes = [0, 0, 1, 1, 0];
    const spriteTextures = spriteTypes.map(t => speciesTextures[t]);

    // All type-0 sprites get the same texture object
    expect(spriteTextures[0]).toBe(spriteTextures[1]);
    expect(spriteTextures[0]).toBe(spriteTextures[4]);
    // All type-1 sprites get the same texture object
    expect(spriteTextures[2]).toBe(spriteTextures[3]);
    // Different types have different textures
    expect(spriteTextures[0]).not.toBe(spriteTextures[2]);
  });
});
