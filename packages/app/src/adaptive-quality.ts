/**
 * Critterium — Adaptive Quality System
 *
 * Monitors FPS and automatically adjusts visual quality to maintain
 * smooth performance on mobile devices.
 *
 * Quality tiers:
 * - High (FPS >= 45): All effects enabled, no render skipping
 * - Medium (FPS 25-45): Disable energy opacity
 * - Low (FPS < 25): Disable all effects, disable graph, render skip 2
 *
 * Features:
 * - Rolling average of last 8 FPS samples (sampled every 0.5s)
 * - Hysteresis: 3 consecutive samples before changing tier
 * - Upgrade cooldown: never upgrades faster than every 5 seconds
 * - Change callback for app-level logging
 */

// ─── Quality Settings ────────────────────────────────────────

export interface QualitySettings {
  /** Particle effects: death/birth effects enabled */
  effectsEnabled: boolean;
  /** Population graph updates */
  graphEnabled: boolean;
  /** Target particle reduction factor when underperforming (0.5 = halve particles) */
  reductionFactor: number;
  /** Render all particles, or skip every Nth for cheap rendering */
  renderSkip: number;
  /** Energy-based opacity (cheap but adds overhead) */
  energyOpacityEnabled: boolean;
}

// ─── Quality Level Helpers ───────────────────────────────────

const QUALITY_HIGH: QualitySettings = {
  effectsEnabled: true,
  graphEnabled: true,
  reductionFactor: 1,
  renderSkip: 1,
  energyOpacityEnabled: true,
};

const QUALITY_MEDIUM: QualitySettings = {
  effectsEnabled: true,
  graphEnabled: true,
  reductionFactor: 0.75,
  renderSkip: 1,
  energyOpacityEnabled: false,
};

const QUALITY_LOW: QualitySettings = {
  effectsEnabled: false,
  graphEnabled: false,
  reductionFactor: 0.5,
  renderSkip: 2,
  energyOpacityEnabled: false,
};

const LEVEL_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

type QualityLevel = 'high' | 'medium' | 'low';

// ─── Adaptive Quality Manager ────────────────────────────────

export class AdaptiveQuality {
  private fpsHistory: number[];
  private currentQuality: QualitySettings;
  private currentLevel: QualityLevel;
  private consecutiveSamples: number;
  private lastUpgradeTime: number;
  private onChangeCallback?: (level: QualityLevel, settings: QualitySettings) => void;

  constructor() {
    this.fpsHistory = [];
    this.currentLevel = 'high';
    this.consecutiveSamples = 0;
    this.lastUpgradeTime = 0;
    this.currentQuality = QUALITY_HIGH;
  }

  /** Register a callback fired when the quality level changes. */
  onChange(callback: (level: QualityLevel, settings: QualitySettings) => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Called each frame (or every 0.5s) with the current FPS.
   * Maintains a rolling window of 8 samples and adjusts quality
   * based on rolling average with hysteresis.
   */
  update(fps: number): void {
    // Push sample, maintain rolling window of 8
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 8) {
      this.fpsHistory.shift();
    }

    // Need at least a few samples to make decisions
    if (this.fpsHistory.length < 3) return;

    // Compute rolling average (no allocation — simple loop)
    let sum = 0;
    for (let i = 0; i < this.fpsHistory.length; i++) {
      sum += this.fpsHistory[i];
    }
    const avg = sum / this.fpsHistory.length;

    // Determine target tier from average
    let targetLevel: QualityLevel;
    if (avg >= 45) targetLevel = 'high';
    else if (avg >= 25) targetLevel = 'medium';
    else targetLevel = 'low';

    // If already at target, reset hysteresis counter
    if (targetLevel === this.currentLevel) {
      this.consecutiveSamples = 0;
      return;
    }

    // Hysteresis: require 3 consecutive samples pointing to a different tier
    this.consecutiveSamples++;
    if (this.consecutiveSamples < 3) return;

    // Prevent rapid upgrade oscillation (never upgrade faster than every 5s)
    const isUpgrade = LEVEL_ORDER[targetLevel] > LEVEL_ORDER[this.currentLevel];
    const now = performance.now() / 1000;
    if (isUpgrade && now - this.lastUpgradeTime < 5) {
      return;
    }

    // Apply quality change
    this.currentLevel = targetLevel;
    this.currentQuality = this.makeQuality(targetLevel);
    this.consecutiveSamples = 0;

    if (isUpgrade) {
      this.lastUpgradeTime = now;
    }

    // Fire callback
    if (this.onChangeCallback) {
      this.onChangeCallback(targetLevel, this.currentQuality);
    }
  }

  /** Get current quality settings. */
  get quality(): QualitySettings {
    return this.currentQuality;
  }

  /** Force a specific quality level (resets hysteresis). */
  setQuality(level: QualityLevel): void {
    this.currentLevel = level;
    this.currentQuality = this.makeQuality(level);
    this.consecutiveSamples = 0;
  }

  /** Get current quality level name. */
  get level(): QualityLevel {
    return this.currentLevel;
  }

  private makeQuality(level: QualityLevel): QualitySettings {
    switch (level) {
      case 'high': return { ...QUALITY_HIGH };
      case 'medium': return { ...QUALITY_MEDIUM };
      case 'low': return { ...QUALITY_LOW };
    }
  }
}
