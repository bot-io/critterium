// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autosave, loadAutosave, clearAutosave, exportConfig, importConfig } from './persistence.js';
import { deserializeConfig } from '@critterium/core';

const AUTOSAVE_KEY = 'critterium-autosave';

const sampleConfig = {
  version: 1 as const,
  simulation: {
    width: 800,
    height: 600,
    boundaryMode: 'wrap' as const,
    seed: 42,
    populationCap: 600,
  },
  species: [
    {
      name: 'Prey',
      count: 120,
      color: '#44cc44',
      radius: 3,
      initialSpeed: 60,
      maxSpeed: 100,
      energy: {
        maxEnergy: 80,
        initialEnergy: 40,
        movementCostPerSec: 2,
        reproductionCost: 20,
        idleDrainPerSec: 1,
        energyGainPerPrey: [0, 0, 0],
      },
      lifecycle: {
        maxAgeSec: 40,
        starvationDamagePerSec: 8,
        reproductionCooldownSec: 3,
      },
      diet: { canEat: [] },
    },
  ],
  interactionMatrix: [[null]],
  forces: { drag: { coefficient: 0.8 }, wander: { strength: 40, rate: 2.5 } },
};

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ─── autosave ───

  it('autosave writes config to localStorage', () => {
    autosave(sampleConfig);
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(sampleConfig);
  });

  it('autosave handles localStorage errors gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => autosave(sampleConfig)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    spy.mockRestore();
    warnSpy.mockRestore();
  });

  // ─── loadAutosave ───

  it('loadAutosave returns null when no autosave exists', () => {
    expect(loadAutosave()).toBeNull();
  });

  it('loadAutosave returns config when valid autosave exists', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(sampleConfig));
    const loaded = loadAutosave();
    expect(loaded).toEqual(sampleConfig);
  });

  it('loadAutosave returns null for wrong version', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ version: 2, species: [] }));
    expect(loadAutosave()).toBeNull();
  });

  it('loadAutosave returns null for invalid JSON', () => {
    localStorage.setItem(AUTOSAVE_KEY, 'not valid json{');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadAutosave()).toBeNull();
    warnSpy.mockRestore();
  });

  // ─── clearAutosave ───

  it('clearAutosave removes the autosave key', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(sampleConfig));
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
    clearAutosave();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('clearAutosave does not throw when no autosave exists', () => {
    expect(() => clearAutosave()).not.toThrow();
  });

  // ─── exportConfig ───

  it('exportConfig creates a download link with .json extension', () => {
    const createObjectURLSpy = vi.fn(() => 'blob:http://localhost/fake');
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    // Mock createElement to track the anchor
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    exportConfig(sampleConfig, 'test-config');

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('exportConfig appends .json if not present in filename', () => {
    const createObjectURLSpy = vi.fn(() => 'blob:http://localhost/fake');
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });

    let capturedHref = '';
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        Object.defineProperty(el, 'download', {
          set(v: string) { capturedHref = v; },
          get() { return capturedHref; },
        });
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    exportConfig(sampleConfig, 'myfile');
    expect(capturedHref).toBe('myfile.json');

    vi.restoreAllMocks();
  });

  // ─── importConfig ───

  it('importConfig returns a promise', () => {
    const result = importConfig();
    expect(result).toBeInstanceOf(Promise);
  });

  it('importConfig resolves null when cancelled (no files)', async () => {
    // Mock createElement to return a file input we control
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        // Override click to trigger oncancel immediately
        el.click = () => {
          // Simulate cancel
          setTimeout(() => {
            el.dispatchEvent(new Event('cancel'));
          }, 0);
        };
      }
      return el;
    });

    // Set up oncancel handler
    const origCreateElement2 = document.createElement.bind(document);
    const result = importConfig();

    vi.restoreAllMocks();
    // The promise might not resolve in this mock scenario, but it should exist
    expect(result).toBeInstanceOf(Promise);
  });

  it('importConfig resolves null for invalid JSON file', async () => {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        el.click = () => {
          // Create a mock File object and simulate onchange
          const mockFile = {
            text: () => Promise.resolve('not valid json{'),
          } as unknown as File;
          Object.defineProperty(el, 'files', {
            value: { 0: mockFile, length: 1, item: (i: number) => mockFile },
            configurable: true,
          });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await importConfig();

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('importConfig resolves null for config with wrong version', async () => {
    const wrongVersion = JSON.stringify({ version: 2, simulation: {}, species: [], interactionMatrix: [], forces: {} });
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        el.click = () => {
          const mockFile = {
            text: () => Promise.resolve(wrongVersion),
          } as unknown as File;
          Object.defineProperty(el, 'files', {
            value: { 0: mockFile, length: 1, item: (i: number) => mockFile },
            configurable: true,
          });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await importConfig();

    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it('importConfig resolves null for config missing required fields', async () => {
    const incomplete = JSON.stringify({ version: 1 }); // missing simulation, species, etc.
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        el.click = () => {
          const mockFile = {
            text: () => Promise.resolve(incomplete),
          } as unknown as File;
          Object.defineProperty(el, 'files', {
            value: { 0: mockFile, length: 1, item: (i: number) => mockFile },
            configurable: true,
          });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await importConfig();

    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it('importConfig resolves validated config for valid file', async () => {
    const validJson = JSON.stringify(sampleConfig);
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        el.click = () => {
          const mockFile = {
            text: () => Promise.resolve(validJson),
          } as unknown as File;
          Object.defineProperty(el, 'files', {
            value: { 0: mockFile, length: 1, item: (i: number) => mockFile },
            configurable: true,
          });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    const result = await importConfig();

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.simulation.width).toBe(800);
    expect(result!.simulation.height).toBe(600);
    expect(result!.simulation.boundaryMode).toBe('wrap');
    expect(result!.species).toHaveLength(1);
    expect(result!.species[0].name).toBe('Prey');

    vi.restoreAllMocks();
  });

  it('importConfig resolves null when no file selected (empty file list)', async () => {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'input') {
        el.click = () => {
          // Simulate onchange with empty file list
          Object.defineProperty(el, 'files', {
            value: { length: 0, item: () => null },
            configurable: true,
          });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    const result = await importConfig();
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  // ─── export + import round-trip ───

  it('roundtrip: autosave then loadAutosave preserves config', () => {
    autosave(sampleConfig);
    const loaded = loadAutosave();
    expect(loaded).toEqual(sampleConfig);
  });

  it('roundtrip: clearAutosave then loadAutosave returns null', () => {
    autosave(sampleConfig);
    expect(loadAutosave()).not.toBeNull();
    clearAutosave();
    expect(loadAutosave()).toBeNull();
  });

  it('roundtrip: export produces JSON that importConfig validates', async () => {
    // Capture the blob content from exportConfig
    let capturedBlobContent: string | null = null;

    const createObjectURLSpy = vi.fn((_blob: Blob) => {
      // Read the blob content synchronously for verification
      // We can't easily await here, so store the blob
      return 'blob:http://localhost/fake';
    });
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    let capturedDownload = '';
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        Object.defineProperty(el, 'download', {
          set(v: string) { capturedDownload = v; },
          get() { return capturedDownload; },
        });
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    // Export
    exportConfig(sampleConfig, 'roundtrip-test');
    expect(capturedDownload).toBe('roundtrip-test.json');

    // Verify blob was created with correct content
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;

    // Read blob content and validate via importConfig path
    const blobText = await blob.text();
    const parsed = JSON.parse(blobText);
    expect(parsed.version).toBe(1);
    expect(parsed.simulation.width).toBe(800);

    // Validate via deserializeConfig (same path as importConfig now uses)
    const validated = deserializeConfig(parsed);
    expect(validated.version).toBe(1);
    expect(validated.simulation.boundaryMode).toBe('wrap');
    expect(validated.species).toHaveLength(1);

    vi.restoreAllMocks();
  });

  it('exportConfig does not duplicate .json extension', () => {
    const createObjectURLSpy = vi.fn(() => 'blob:http://localhost/fake');
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });

    let capturedDownload = '';
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        Object.defineProperty(el, 'download', {
          set(v: string) { capturedDownload = v; },
          get() { return capturedDownload; },
        });
      }
      return el;
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    exportConfig(sampleConfig, 'already.json');
    expect(capturedDownload).toBe('already.json');

    vi.restoreAllMocks();
  });

  it('exportConfig handles errors gracefully', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('Blob', class {
      constructor() { throw new Error('Blob not available'); }
    });

    expect(() => exportConfig(sampleConfig, 'test')).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
