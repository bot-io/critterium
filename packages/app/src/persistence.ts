/**
 * Critterium — Persistence (CRT-13 + CRT-14)
 *
 * Autosave to localStorage, and export/import config files.
 */

import { type CritteriumConfig, deserializeConfig } from '@critterium/core';

const AUTOSAVE_KEY = 'critterium-autosave';

// ─── Autosave (CRT-13) ───────────────────────────────────────

/**
 * Save a config to localStorage.
 */
export function autosave(config: CritteriumConfig): void {
  try {
    const json = JSON.stringify(config);
    localStorage.setItem(AUTOSAVE_KEY, json);
  } catch (err) {
    console.warn('[Critterium] Autosave failed:', err);
  }
}

/**
 * Load the autosaved config from localStorage.
 * Returns null if no autosave exists or if it's invalid.
 */
export function loadAutosave(): CritteriumConfig | null {
  try {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return null;
    const parsed = JSON.parse(json);
    // Basic version check
    if (parsed.version !== 1) return null;
    return parsed as CritteriumConfig;
  } catch (err) {
    console.warn('[Critterium] Failed to load autosave:', err);
    return null;
  }
}

/**
 * Clear the autosave from localStorage.
 */
export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore
  }
}

// ─── Export / Import (CRT-14) ────────────────────────────────

/**
 * Export a config as a downloadable .json file.
 * On Android/Capacitor, uses the Web Share API (or falls back to anchor download).
 */
export function exportConfig(config: CritteriumConfig, filename: string): void {
  try {
    const json = JSON.stringify(config, null, 2);
    const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;

    // On Android/Capacitor, the anchor-download trick doesn't work.
    // Try Web Share API first (available on modern Android WebView).
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], safeName, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'Critterium Config',
      }).catch((err) => {
        // User cancelled or share failed — fall back to download
        if ((err as DOMException).name !== 'AbortError') {
          fallbackDownload(blob, safeName);
        }
      });
      return;
    }

    // Fallback: traditional anchor download (works on desktop browsers)
    fallbackDownload(blob, safeName);
  } catch (err) {
    console.error('[Critterium] Export failed:', err);
  }
}

function fallbackDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a config from a file picker.
 * Returns the parsed CritteriumConfig, or null if cancelled/invalid.
 */
export function importConfig(): Promise<CritteriumConfig | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        // Full validation via deserializeConfig
        const validated = deserializeConfig(parsed);
        resolve(validated);
      } catch (err) {
        console.error('[Critterium] Import failed:', err);
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);

    // Trigger the file picker
    input.click();
  });
}
