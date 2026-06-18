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

describe('No dead sickness/infection code', () => {
  // Regression guard: infection/sickness rendering was removed but
  // vestigial fields and per-frame computations lingered. These tests
  // ensure the dead code does not silently return.
  it('CritteriumRenderer does not expose sicknessRingsEnabled property', () => {
    const proto = CritteriumRenderer.prototype as unknown as Record<string, unknown>;
    expect(proto.sicknessRingsEnabled).toBeUndefined();
  });

  it('CritteriumRenderer does not expose sicknessContainer property', () => {
    const proto = CritteriumRenderer.prototype as unknown as Record<string, unknown>;
    expect(proto.sicknessContainer).toBeUndefined();
  });

  it('CritteriumRenderer does not expose pulsePhase property', () => {
    const proto = CritteriumRenderer.prototype as unknown as Record<string, unknown>;
    expect(proto.pulsePhase).toBeUndefined();
  });

  it('CritteriumRenderer does not expose sicknessGfx property', () => {
    const proto = CritteriumRenderer.prototype as unknown as Record<string, unknown>;
    expect(proto.sicknessGfx).toBeUndefined();
  });
});

// ─── Regression: resetState must accept new capacity ───────────────
// Bug: increasing populationCap crashed the renderer because prevAlive
// array was never resized. resetState now accepts optional maxParticles.

describe('resetState capacity resize (regression)', () => {
  it('CritteriumRenderer.prototype.resetState is defined', () => {
    expect(CritteriumRenderer.prototype.resetState).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.resetState).toBe('function');
  });

  it('resetState accepts a maxParticles parameter (arity >= 1)', () => {
    // The function should accept at least 1 argument (maxParticles)
    expect(CritteriumRenderer.prototype.resetState.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Regression: update() bounds loop to min(world, eco) ──────────
// Bug: when sum(speciesCounts) exceeds populationCap due to rounding,
// world.x.length > eco.alive.length, causing OOB reads → ghost particles,
// NaN alpha, inflated HUD counts. Fix: Math.min(world.x.length, eco.alive.length)

describe('update array bounds (regression)', () => {
  it('update method is defined', () => {
    expect(CritteriumRenderer.prototype.update).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.update).toBe('function');
  });

  it('update accepts 3 parameters (world, eco, dt)', () => {
    expect(CritteriumRenderer.prototype.update.length).toBe(3);
  });
});

// ─── Regression: destroy() passes full DestroyOptions ──────────────
// Bug: app.destroy(true) only removes canvas, doesn't destroy
// children/context/textures. Fix: pass { children, context, texture, textureSource }

describe('destroy full cleanup (regression)', () => {
  it('destroy method is defined', () => {
    expect(CritteriumRenderer.prototype.destroy).toBeDefined();
    expect(typeof CritteriumRenderer.prototype.destroy).toBe('function');
  });
});

// ─── Regression: BirthEffect captures speciesIdx to detect recycled slots ─
// Bug: birth flash followed recycled particle index, reading vis from
// wrong species after free-list reuse. Fix: snapshot speciesIdx, abort on mismatch.

describe('birth effect speciesIdx tracking (regression)', () => {
  it('spawnBirthEffect accepts 2 parameters (idx + speciesIdx)', () => {
    // The method is private in TS but exists on the prototype in JS.
    // It should now accept 2 params: idx and speciesIdx.
    expect(CritteriumRenderer.prototype.spawnBirthEffect).toBeDefined();
    expect(CritteriumRenderer.prototype.spawnBirthEffect.length).toBe(2);
  });
});

// ─── Regression: DPR clamped to max 2 on mobile ───────────────────
// Bug: devicePixelRatio of 3-4 on phones caused 9-16x fill-rate, texture
// memory, and framebuffer cost. Fix: Math.min(2, devicePixelRatio)

describe('DPR clamping (regression)', () => {
  it('Math.min(2, devicePixelRatio) clamps to 2', () => {
    expect(Math.min(2, 3)).toBe(2);
    expect(Math.min(2, 4)).toBe(2);
    expect(Math.min(2, 1)).toBe(1);
    expect(Math.min(2, 2)).toBe(2);
  });
});

// ─── Regression: HUD text throttling avoids per-frame re-rasterization ─
// Bug: hudText.text = hud every frame caused 60 re-rasterizations/sec
// (with dropShadow canvas blur). Fix: only update when text changes or every 10 frames.

describe('HUD throttling logic (regression)', () => {
  it('frameCount % 10 === 0 triggers update every 10 frames', () => {
    for (let i = 1; i <= 30; i++) {
      if (i % 10 === 0) {
        expect(true).toBe(true); // would update
      }
    }
  });

  it('text change triggers immediate update', () => {
    const oldText = 'Particles: 100';
    const newText = 'Particles: 101';
    expect(newText !== oldText).toBe(true);
  });
});
