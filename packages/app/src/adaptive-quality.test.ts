import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdaptiveQuality } from './adaptive-quality.js';
import type { QualitySettings } from './adaptive-quality.js';

describe('AdaptiveQuality', () => {
  let aq: AdaptiveQuality;

  beforeEach(() => {
    aq = new AdaptiveQuality();
  });

  it('starts at high quality by default', () => {
    expect(aq.level).toBe('high');
    expect(aq.quality.effectsEnabled).toBe(true);
    expect(aq.quality.graphEnabled).toBe(true);
    expect(aq.quality.renderSkip).toBe(1);
    expect(aq.quality.sicknessRingsEnabled).toBe(true);
    expect(aq.quality.energyOpacityEnabled).toBe(true);
  });

  it('has reductionFactor of 1 at high quality', () => {
    expect(aq.quality.reductionFactor).toBe(1);
  });

  it('does not change level with fewer than 3 samples', () => {
    aq.update(5);
    aq.update(5);
    expect(aq.level).toBe('high');
  });

  it('requires 5 samples to change tier (3 to fill buffer + 3 consecutive)', () => {
    // First 2 samples just fill buffer (len < 3 returns early, no consecutive tracking)
    // Sample 3: buffer full, consecutiveSamples starts at 1
    // Sample 4: consecutiveSamples = 2
    // Sample 5: consecutiveSamples = 3 → triggers change
    aq.update(5);
    aq.update(5);
    expect(aq.level).toBe('high');
    aq.update(5);
    expect(aq.level).toBe('high'); // consecutiveSamples = 1
    aq.update(5);
    expect(aq.level).toBe('high'); // consecutiveSamples = 2
    aq.update(5);
    expect(aq.level).toBe('low'); // consecutiveSamples = 3 → change!
  });

  it('resets hysteresis counter when FPS returns to current tier', () => {
    // Fill buffer with high FPS
    for (let i = 0; i < 5; i++) aq.update(60);
    expect(aq.level).toBe('high');
    // Push 1 low sample — not enough for hysteresis, and average stays high
    aq.update(30);
    // avg = (60*5+30)/6 = 55, target=high=same → counter resets
    expect(aq.level).toBe('high');
    // Push another low — avg drops but not enough
    aq.update(30);
    // avg = (60*5+30+30)/7 = 51.4, target=high=same → counter resets
    expect(aq.level).toBe('high');
    // Verify still high — the high buffer absorbs transient dips
    aq.update(60);
    expect(aq.level).toBe('high');
  });

  it('drops to medium tier for FPS 25-45', () => {
    for (let i = 0; i < 7; i++) {
      aq.update(30);
    }
    expect(aq.level).toBe('medium');
    expect(aq.quality.sicknessRingsEnabled).toBe(false);
    expect(aq.quality.energyOpacityEnabled).toBe(false);
    expect(aq.quality.effectsEnabled).toBe(true);
    expect(aq.quality.graphEnabled).toBe(true);
    expect(aq.quality.reductionFactor).toBeCloseTo(0.75);
  });

  it('drops to low tier for FPS < 25', () => {
    for (let i = 0; i < 7; i++) {
      aq.update(10);
    }
    expect(aq.level).toBe('low');
    expect(aq.quality.effectsEnabled).toBe(false);
    expect(aq.quality.graphEnabled).toBe(false);
    expect(aq.quality.renderSkip).toBe(2);
    expect(aq.quality.reductionFactor).toBeCloseTo(0.5);
  });

  it('fires onChange callback when quality changes', () => {
    const cb = vi.fn();
    aq.onChange(cb);
    for (let i = 0; i < 7; i++) {
      aq.update(10);
    }
    expect(cb).toHaveBeenCalledWith('low', expect.any(Object));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire callback when staying at same level', () => {
    const cb = vi.fn();
    aq.onChange(cb);
    for (let i = 0; i < 10; i++) {
      aq.update(60);
    }
    expect(cb).not.toHaveBeenCalled();
  });

  it('upgrade has 5-second cooldown', () => {
    const now = performance.now() / 1000;

    // Drop to low
    for (let i = 0; i < 7; i++) aq.update(10);
    expect(aq.level).toBe('low');

    // Try to upgrade immediately — should be blocked
    const origNow = performance.now;
    let fakeTime = now + 1; // only 1 second later
    vi.spyOn(performance, 'now').mockImplementation(() => fakeTime * 1000);

    for (let i = 0; i < 7; i++) aq.update(60);
    expect(aq.level).toBe('low'); // still low, cooldown not elapsed

    // Advance past 5 seconds
    fakeTime = now + 6;
    for (let i = 0; i < 7; i++) aq.update(60);
    expect(aq.level).toBe('high'); // now upgraded

    vi.restoreAllMocks();
  });

  it('setQuality forces a specific level immediately', () => {
    aq.setQuality('low');
    expect(aq.level).toBe('low');
    expect(aq.quality.effectsEnabled).toBe(false);
  });

  it('setQuality resets hysteresis counter', () => {
    aq.setQuality('low');
    // After setQuality, consecutiveSamples is reset to 0
    // So even with samples, it takes a while to change
    aq.update(60);
    aq.update(60);
    expect(aq.level).toBe('low');
  });

  it('rolling window maintains at most 8 samples', () => {
    // Push 10 high-FPS samples
    for (let i = 0; i < 10; i++) aq.update(60);
    expect(aq.level).toBe('high');
    // Push enough low-FPS samples to fill the rolling window and trigger change
    // Need to overcome the rolling average and hysteresis
    for (let i = 0; i < 15; i++) aq.update(5);
    expect(aq.level).toBe('low');
  });

  it('downgrade from medium to low works', () => {
    // First go to medium
    for (let i = 0; i < 7; i++) aq.update(30);
    expect(aq.level).toBe('medium');
    // Now push low FPS
    for (let i = 0; i < 7; i++) aq.update(10);
    expect(aq.level).toBe('low');
  });

  it('quality settings are independent objects (no shared mutation)', () => {
    aq.setQuality('high');
    const q1 = aq.quality;
    aq.setQuality('medium');
    const q2 = aq.quality;
    expect(q1).not.toBe(q2);
  });

  it('medium quality has correct reductionFactor', () => {
    aq.setQuality('medium');
    expect(aq.quality.reductionFactor).toBeCloseTo(0.75);
  });
});
