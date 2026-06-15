/**
 * Critterium — Simulation Logger
 *
 * Captures simulation events: population snapshots, extinctions, crashes,
 * errors, and performance warnings. Ring buffer + crash-safe localStorage
 * persistence so logs survive app crashes.
 *
 * Export via Capacitor Share/Filesystem (Android) or clipboard fallback.
 */

// ─── Types ─────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

export interface PopulationSnapshot {
  time: number; // sim time in seconds
  species: number[]; // alive count per species index
  total: number; // total alive
}

export interface ExtinctionEvent {
  time: number; // sim time
  speciesIndex: number;
  speciesName: string;
  remainingSpecies: number;
}

export interface LogEntry {
  timestamp: number; // wall clock (Date.now())
  simTime: number; // simulation time in seconds
  level: LogLevel;
  category: string; // 'crash' | 'extinction' | 'population' | 'system' | 'config'
  message: string;
  data?: unknown;
}

// ─── Ring Buffer ───────────────────────────────────────────────

const MAX_ENTRIES = 500;
const MAX_SNAPSHOTS = 120; // 2 min at 1/sec
const PERSIST_KEY = 'critterium-sim-log';
const PERSIST_INTERVAL_MS = 5000;

let entries: LogEntry[] = [];
let snapshots: PopulationSnapshot[] = [];
let extinctions: ExtinctionEvent[] = [];
let speciesNames: string[] = [];
let currentSimTime = 0;
let lastSnapshotTime = -1;
const SNAPSHOT_INTERVAL = 1.0; // seconds between population snapshots

// ─── Core API ──────────────────────────────────────────────────

export function initLogger(names: string[]): void {
  speciesNames = [...names];
  entries = [];
  snapshots = [];
  extinctions = [];
  currentSimTime = 0;
  lastSnapshotTime = -1;
  // Clear any stale persisted log
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

export function log(level: LogLevel, category: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: Date.now(),
    simTime: currentSimTime,
    level,
    category,
    message,
    data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  // For fatal errors, persist immediately
  if (level === 'fatal') {
    persistToStorage();
  }
}

/**
 * Record a population snapshot. Should be called every simulation step.
 * Internally throttled to SNAPSHOT_INTERVAL seconds.
 */
export function recordPopulation(simTime: number, speciesCounts: number[]): void {
  currentSimTime = simTime;

  if (simTime - lastSnapshotTime < SNAPSHOT_INTERVAL && lastSnapshotTime >= 0) return;
  lastSnapshotTime = simTime;

  const total = speciesCounts.reduce((a, b) => a + b, 0);
  const snapshot: PopulationSnapshot = {
    time: simTime,
    species: [...speciesCounts],
    total,
  };
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();

  // Detect extinctions
  if (snapshots.length >= 2) {
    const prev = snapshots[snapshots.length - 2];
    for (let i = 0; i < speciesCounts.length; i++) {
      const wasAlive = prev.species[i] > 0;
      const isDead = speciesCounts[i] === 0;
      // Check it's a fresh extinction (not already recorded)
      const alreadyExtinct = extinctions.some((e) => e.speciesIndex === i);
      if (wasAlive && isDead && !alreadyExtinct) {
        const remainingSpecies = speciesCounts.filter((c) => c > 0).length;
        const event: ExtinctionEvent = {
          time: simTime,
          speciesIndex: i,
          speciesName: speciesNames[i] ?? `Species ${i}`,
          remainingSpecies,
        };
        extinctions.push(event);
        log(
          'warn',
          'extinction',
          `${event.speciesName} went extinct at t=${simTime.toFixed(1)}s (${remainingSpecies} species remain)`,
        );
      }
    }
  }
}

// ─── Crash-Safe Persistence ────────────────────────────────────

let persistTimer: ReturnType<typeof setInterval> | null = null;

interface PersistedLog {
  entries: LogEntry[];
  snapshots: PopulationSnapshot[];
  extinctions: ExtinctionEvent[];
  speciesNames: string[];
  crashedAt: number;
}

export function startAutoPersist(): void {
  stopAutoPersist();
  persistTimer = setInterval(persistToStorage, PERSIST_INTERVAL_MS);
}

export function stopAutoPersist(): void {
  if (persistTimer !== null) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
}

export function persistToStorage(): void {
  try {
    const data: PersistedLog = {
      entries: entries.slice(-50), // last 50 log entries
      snapshots: [...snapshots],
      extinctions: [...extinctions],
      speciesNames: [...speciesNames],
      crashedAt: Date.now(),
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function loadPersistedLog(): PersistedLog | null {
  try {
    const json = localStorage.getItem(PERSIST_KEY);
    if (!json) return null;
    return JSON.parse(json) as PersistedLog;
  } catch {
    return null;
  }
}

export function clearPersistedLog(): void {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Formatting & Export ───────────────────────────────────────

export function formatLogText(): string {
  const lines: string[] = [];
  lines.push(`Critterium Simulation Log — ${new Date().toISOString()}`);
  lines.push('');

  // Extinctions summary
  if (extinctions.length > 0) {
    lines.push('=== EXTINCTIONS ===');
    for (const e of extinctions) {
      lines.push(
        `  t=${e.time.toFixed(1)}s: ${e.speciesName} extinct (${e.remainingSpecies} species remain)`,
      );
    }
    lines.push('');
  }

  // Population curve
  if (snapshots.length > 0) {
    lines.push('=== POPULATION TIMELINE ===');
    lines.push(`  time  total  ${speciesNames.map((n) => n.padStart(8)).join('  ')}`);
    for (const s of snapshots) {
      const counts = s.species.map((c) => String(c).padStart(8)).join('  ');
      lines.push(`  ${s.time.toFixed(1).padStart(5)}  ${String(s.total).padStart(5)}  ${counts}`);
    }
    lines.push('');
  }

  // Recent log entries
  if (entries.length > 0) {
    lines.push('=== LOG ENTRIES ===');
    for (const e of entries) {
      const time = new Date(e.timestamp).toISOString().slice(11, 23);
      const simT = e.simTime.toFixed(1);
      lines.push(`  [${time}] sim=${simT}s [${e.level}] [${e.category}] ${e.message}`);
    }
    lines.push('');
  }

  // Check for persisted crash log
  const persisted = loadPersistedLog();
  if (persisted) {
    lines.push('=== PREVIOUS CRASH LOG (from storage) ===');
    lines.push(`  App crashed at: ${new Date(persisted.crashedAt).toISOString()}`);
    if (persisted.extinctions.length > 0) {
      lines.push('  Extinctions before crash:');
      for (const e of persisted.extinctions) {
        lines.push(`    t=${e.time.toFixed(1)}s: ${e.speciesName} extinct`);
      }
    }
    if (persisted.entries.length > 0) {
      lines.push('  Last entries before crash:');
      for (const e of persisted.entries.slice(-20)) {
        const time = new Date(e.timestamp).toISOString().slice(11, 23);
        lines.push(`    [${time}] [${e.level}] [${e.category}] ${e.message}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Export the full log as a shareable text file.
 * Uses Capacitor Share API on Android, falls back to clipboard.
 */
export async function exportLog(): Promise<void> {
  const text = formatLogText();
  const filename = `critterium-log-${Date.now()}.txt`;

  try {
    // Try Capacitor Share plugin first (Android)
    try {
      const { Share } = await import('@capacitor/share');
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

      const result = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: 'Critterium Log',
        text: filename,
        url: result.uri,
      });
      return;
    } catch {
      // Capacitor not available — fall through
    }

    // Web Share API
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Critterium Log' });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }

    // Fallback: anchor download (desktop)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Last resort: clipboard
    try {
      await navigator.clipboard.writeText(text);
      alert('Log copied to clipboard');
    } catch {
      console.error('[Critterium] Log export failed');
    }
  }
}

/** Check if a previous crash log exists in storage. */
export function hasPersistedCrashLog(): boolean {
  try {
    return localStorage.getItem(PERSIST_KEY) !== null;
  } catch {
    return false;
  }
}
