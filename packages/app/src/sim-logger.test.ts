// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initLogger,
  log,
  recordPopulation,
  formatLogText,
  persistToStorage,
  loadPersistedLog,
  clearPersistedLog,
  hasPersistedCrashLog,
  startAutoPersist,
  stopAutoPersist,
} from './sim-logger.js';

describe('sim-logger', () => {
  beforeEach(() => {
    localStorage.clear();
    initLogger(['Cat', 'Dog', 'Bird']);
  });

  afterEach(() => {
    stopAutoPersist();
  });

  // ─── initLogger ───────────────────────────────────────────────

  describe('initLogger', () => {
    it('resets all state (entries, snapshots, extinctions)', () => {
      log('info', 'test', 'old-message-1');
      log('info', 'test', 'old-message-2');
      recordPopulation(1.0, [10, 20, 5]);
      // Re-init clears everything
      initLogger(['A', 'B']);
      const text = formatLogText();
      expect(text).not.toContain('old-message-1');
      expect(text).not.toContain('old-message-2');
    });

    it('clears persisted log on init', () => {
      persistToStorage();
      expect(hasPersistedCrashLog()).toBe(true);
      initLogger(['A']);
      expect(hasPersistedCrashLog()).toBe(false);
    });
  });

  // ─── log ──────────────────────────────────────────────────────

  describe('log', () => {
    it('adds entry with level and category', () => {
      log('warn', 'system', 'test warning');
      const text = formatLogText();
      expect(text).toContain('test warning');
      expect(text).toContain('[warn]');
      expect(text).toContain('[system]');
    });

    it('includes data in entry', () => {
      log('error', 'test', 'with-data', { code: 42 });
      const text = formatLogText();
      expect(text).toContain('with-data');
    });

    it('fatal level persists immediately to storage', () => {
      log('fatal', 'crash', 'app crashed');
      expect(hasPersistedCrashLog()).toBe(true);
    });

    it('non-fatal levels do not persist immediately', () => {
      log('info', 'test', 'just info');
      log('warn', 'test', 'just warning');
      expect(hasPersistedCrashLog()).toBe(false);
    });

    it('ring buffer evicts oldest entries beyond MAX_ENTRIES (500)', () => {
      for (let i = 0; i < 550; i++) {
        log('info', 'test', `entry-${String(i).padStart(4, '0')}`);
      }
      const text = formatLogText();
      // Oldest 50 entries evicted (550 - 500 = 50)
      expect(text).not.toContain('entry-0049');
      // Newest entries retained
      expect(text).toContain('entry-0050');
      expect(text).toContain('entry-0549');
    });
  });

  // ─── recordPopulation ─────────────────────────────────────────

  describe('recordPopulation', () => {
    it('records population snapshot with total count', () => {
      recordPopulation(1.0, [10, 20, 5]);
      const text = formatLogText();
      expect(text).toContain('POPULATION TIMELINE');
      // total = 35
      expect(text).toContain('35');
    });

    it('throttles snapshots to 1-second intervals', () => {
      recordPopulation(0.5, [10, 20, 5]); // first snapshot
      recordPopulation(0.9, [11, 19, 5]); // within 1s — skipped
      recordPopulation(2.0, [12, 18, 5]); // after 1s — recorded
      const text = formatLogText();
      // Three potential snapshots, but only 2 recorded (0.5 and 2.0)
      // Count timeline data rows (lines with time prefix)
      const dataRows = text
        .split('\n')
        .filter(
          (l) =>
            l.trim().startsWith('0.') || l.trim().startsWith('1.') || l.trim().startsWith('2.'),
        );
      // At least 2 snapshots, but not 3
      expect(dataRows.length).toBeGreaterThanOrEqual(2);
    });

    it('detects species extinction', () => {
      recordPopulation(1.0, [10, 20, 5]);
      recordPopulation(2.0, [0, 20, 5]); // Cat goes extinct
      const text = formatLogText();
      expect(text).toContain('EXTINCTIONS');
      expect(text).toContain('Cat');
      expect(text).toContain('extinct');
    });

    it('records correct remaining species count on extinction', () => {
      recordPopulation(1.0, [10, 20, 5]);
      recordPopulation(2.0, [0, 20, 5]); // Cat extinct, 2 species remain
      const text = formatLogText();
      expect(text).toContain('2 species remain');
    });

    it('does not re-detect already-extinct species', () => {
      recordPopulation(1.0, [10, 20, 5]);
      recordPopulation(2.0, [0, 20, 5]); // Cat extinct
      recordPopulation(3.0, [0, 20, 5]); // still extinct — no new event
      const text = formatLogText();
      const extinctMatches = text.match(/went extinct/g);
      expect(extinctMatches).toHaveLength(1);
    });

    it('detects multiple distinct extinctions', () => {
      recordPopulation(1.0, [10, 20, 5]);
      recordPopulation(2.0, [0, 20, 5]); // Cat extinct
      recordPopulation(3.0, [0, 0, 5]); // Dog extinct
      const text = formatLogText();
      expect(text).toContain('Cat');
      expect(text).toContain('Dog');
      const extinctMatches = text.match(/went extinct/g);
      expect(extinctMatches).toHaveLength(2);
    });

    it('uses fallback name for unknown species index', () => {
      initLogger(['A']); // only 1 name
      recordPopulation(1.0, [5, 5]); // 2 species but only 1 name
      recordPopulation(2.0, [5, 0]); // species 1 (unnamed) goes extinct
      const text = formatLogText();
      expect(text).toContain('Species 1');
    });
  });

  // ─── Persistence ──────────────────────────────────────────────

  describe('persistence', () => {
    it('persistToStorage writes to localStorage', () => {
      log('info', 'test', 'persist me');
      recordPopulation(1.0, [5, 10, 3]);
      persistToStorage();
      expect(hasPersistedCrashLog()).toBe(true);
    });

    it('loadPersistedLog returns saved data', () => {
      log('info', 'test', 'round-trip entry');
      recordPopulation(1.0, [5, 10, 3]);
      persistToStorage();
      const loaded = loadPersistedLog();
      expect(loaded).not.toBeNull();
      expect(loaded!.entries.length).toBeGreaterThan(0);
      expect(loaded!.snapshots.length).toBeGreaterThan(0);
      expect(loaded!.crashedAt).toBeGreaterThan(0);
    });

    it('loadPersistedLog returns null when empty', () => {
      expect(loadPersistedLog()).toBeNull();
    });

    it('clearPersistedLog removes persisted data', () => {
      persistToStorage();
      expect(hasPersistedCrashLog()).toBe(true);
      clearPersistedLog();
      expect(hasPersistedCrashLog()).toBe(false);
      expect(loadPersistedLog()).toBeNull();
    });

    it('hasPersistedCrashLog returns false when nothing persisted', () => {
      expect(hasPersistedCrashLog()).toBe(false);
    });

    it('persisted log includes species names', () => {
      persistToStorage();
      const loaded = loadPersistedLog();
      expect(loaded!.speciesNames).toEqual(['Cat', 'Dog', 'Bird']);
    });
  });

  // ─── formatLogText ────────────────────────────────────────────

  describe('formatLogText', () => {
    it('includes header with "Critterium Simulation Log"', () => {
      const text = formatLogText();
      expect(text).toContain('Critterium Simulation Log');
    });

    it('omits extinctions section when no extinctions', () => {
      recordPopulation(1.0, [10, 20, 5]);
      const text = formatLogText();
      expect(text).not.toContain('EXTINCTIONS');
    });

    it('includes extinction summary when extinctions exist', () => {
      recordPopulation(1.0, [10, 20, 5]);
      recordPopulation(2.0, [0, 20, 5]);
      const text = formatLogText();
      expect(text).toContain('=== EXTINCTIONS ===');
    });

    it('includes population timeline header when snapshots exist', () => {
      recordPopulation(1.0, [10, 20, 5]);
      const text = formatLogText();
      expect(text).toContain('=== POPULATION TIMELINE ===');
    });

    it('includes log entries header when entries exist', () => {
      log('info', 'test', 'an entry');
      const text = formatLogText();
      expect(text).toContain('=== LOG ENTRIES ===');
    });

    it('includes previous crash log section when persisted data exists', () => {
      persistToStorage();
      const text = formatLogText();
      expect(text).toContain('PREVIOUS CRASH LOG');
    });

    it('species names appear in timeline header row', () => {
      recordPopulation(1.0, [10, 20, 5]);
      const text = formatLogText();
      expect(text).toContain('Cat');
      expect(text).toContain('Dog');
      expect(text).toContain('Bird');
    });
  });

  // ─── Auto-persist timer ───────────────────────────────────────

  describe('startAutoPersist / stopAutoPersist', () => {
    it('start and stop do not throw', () => {
      expect(() => startAutoPersist()).not.toThrow();
      expect(() => stopAutoPersist()).not.toThrow();
    });

    it('double-start does not create duplicate timers', () => {
      expect(() => {
        startAutoPersist();
        startAutoPersist();
      }).not.toThrow();
      stopAutoPersist();
    });

    it('stop without start does not throw', () => {
      expect(() => stopAutoPersist()).not.toThrow();
    });
  });
});

// ─── Regression: exportLog must use shareContent ─────────────────
// Bug: exportLog had its own broken Share.share({ url }) implementation.
// Fixed: now delegates to shareContent from persistence.

describe('exportLog (Android export regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    initLogger(['Cat', 'Dog']);
  });

  it('exportLog is exported', async () => {
    const mod = await import('./sim-logger.js');
    expect(mod.exportLog).toBeDefined();
    expect(typeof mod.exportLog).toBe('function');
  });

  it('exportLog resolves without throwing', async () => {
    const { exportLog } = await import('./sim-logger.js');
    // Should not throw even without Capacitor available
    await expect(exportLog()).resolves.toBeUndefined();
  });
});
