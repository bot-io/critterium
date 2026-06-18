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
 * Full validation via deserializeConfig ensures the returned config is
 * always safe to use (consistent with importConfig).
 */
export function loadAutosave(): CritteriumConfig | null {
  try {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return null;
    const parsed = JSON.parse(json);
    // Full validation — same path as importConfig
    return deserializeConfig(parsed);
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
 * On Android/Capacitor, writes to Documents and opens share sheet.
 */
export async function exportConfig(config: CritteriumConfig, filename: string): Promise<void> {
  const json = JSON.stringify(config, null, 2);
  const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;
  await shareContent(json, safeName, 'Critterium Config');
}

/**
 * Core share/export utility — works on Android (Capacitor) and desktop.
 *
 * Strategy:
 * 1. Capacitor Share + Filesystem (Android native) — share file URI
 * 2. Web Share API with files (mobile browser / PWA)
 * 3. Anchor download (desktop browser)
 * 4. Clipboard (last resort)
 */
export async function shareContent(text: string, filename: string, title: string): Promise<void> {
  // ── 1. Capacitor (Android native) ──────────────────────────────
  try {
    const { Share } = await import('@capacitor/share');
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

    // Write to Cache — Android share sheet can read file:// URIs from here
    const writeFileResult = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    // Share the file URI — user sees "Save to Drive / Send to Telegram / etc."
    await Share.share({
      dialogTitle: title,
      url: writeFileResult.uri,
    });
    return;
  } catch (err) {
    // If user cancelled the share sheet, don't try fallbacks
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('cancelled') || msg.includes('Cancel') || msg.includes('ABORT_ERR')) return;
    // Otherwise Capacitor failed — fall through to web fallbacks
  }

  // ── 2. Web Share API with file ─────────────────────────────────
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return;
  }

  // ── 3. Anchor download (desktop) ───────────────────────────────
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  } catch {
    // ignore
  }

  // ── 4. Clipboard (last resort) ─────────────────────────────────
  try {
    await navigator.clipboard.writeText(text);
    alert(`${title} copied to clipboard`);
  } catch {
    console.error(`[Critterium] Export of ${filename} failed — no share method available`);
  }
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
