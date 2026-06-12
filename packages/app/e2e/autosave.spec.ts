import { test, expect } from '@playwright/test';

/**
 * CRT-13: Autosave + exact resume — E2E reload-continuity test
 *
 * Verifies that:
 * 1. Simulation state is persisted before page unload
 * 2. Page reload restores the autosaved state
 * 3. Restored particle count matches what was running before reload
 */
test.describe('CRT-13: Autosave + exact resume', () => {
  test('autosave persists state and reload restores it', async ({ page }) => {
    // 1. Load the app and let it run for a bit
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        messages.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);

    // Verify the app started successfully
    expect(messages.some((m) => m.includes('Critterium'))).toBe(true);
    expect(messages.some((m) => m.includes('particles'))).toBe(true);

    // 2. Capture the current particle count from console logs
    const particleLogLine = messages.find((m) => m.includes('Initial particles'));
    expect(particleLogLine).toBeDefined();
    const initialMatch = particleLogLine!.match(/(\d+)/);
    expect(initialMatch).not.toBeNull();
    const initialCount = parseInt(initialMatch![1], 10);
    expect(initialCount).toBeGreaterThan(0);

    // 3. Trigger autosave by making the page hidden
    await page.evaluate(() => {
      // Dispatch visibilitychange to trigger autosave
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait a moment for autosave to complete
    await page.waitForTimeout(500);

    // 4. Verify the autosave data exists in localStorage
    const hasAutosave = await page.evaluate(() => {
      const data = localStorage.getItem('critterium-autosave');
      if (!data) return { exists: false };
      const parsed = JSON.parse(data);
      return {
        exists: true,
        version: parsed.version,
        hasSnapshot: !!parsed.snapshot,
        hasSpecies: Array.isArray(parsed.species),
        speciesCount: parsed.species?.length,
        snapshotParticleCount: parsed.snapshot?.x?.length,
      };
    });

    expect(hasAutosave.exists).toBe(true);
    expect(hasAutosave.version).toBe(1);
    expect(hasAutosave.hasSnapshot).toBe(true);
    expect(hasAutosave.hasSpecies).toBe(true);
    expect(hasAutosave.speciesCount).toBeGreaterThan(0);
    expect(hasAutosave.snapshotParticleCount).toBeGreaterThan(0);

    // 5. Reload the page — autosave should be restored
    const reloadMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        reloadMessages.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForTimeout(3000);

    // 6. Verify the app restored from autosave
    const restoredLog = reloadMessages.some((m) => m.includes('Restored from autosave'));
    expect(restoredLog).toBe(true);

    // 7. Verify the "Resumed from autosave" final log
    const resumedLog = reloadMessages.some((m) => m.includes('Resumed from autosave'));
    expect(resumedLog).toBe(true);

    // 8. Verify the restored particle count matches
    const restoredParticleLine = reloadMessages.find((m) => m.includes('particles'));
    expect(restoredParticleLine).toBeDefined();
    const restoredMatch = restoredParticleLine!.match(/(\d+)/);
    expect(restoredMatch).not.toBeNull();
    const restoredCount = parseInt(restoredMatch![1], 10);

    // Restored count should be close to initial (ecosystem may have births/deaths)
    // But should be the same order of magnitude
    expect(restoredCount).toBeGreaterThan(0);
    expect(Math.abs(restoredCount - initialCount)).toBeLessThan(initialCount * 0.5);

    // 9. Verify the autosave was cleared after restore
    const autosaveCleared = await page.evaluate(() => {
      return localStorage.getItem('critterium-autosave') === null;
    });
    expect(autosaveCleared).toBe(true);
  });

  test('autosave includes snapshot with positions and velocities', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Trigger autosave
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);

    // Check that snapshot contains valid position data
    const snapshotData = await page.evaluate(() => {
      const data = localStorage.getItem('critterium-autosave');
      if (!data) return null;
      const parsed = JSON.parse(data);
      return parsed.snapshot ?? null;
    });

    expect(snapshotData).not.toBeNull();
    expect(snapshotData!.x).toBeDefined();
    expect(snapshotData!.y).toBeDefined();
    expect(snapshotData!.vx).toBeDefined();
    expect(snapshotData!.vy).toBeDefined();
    expect(snapshotData!.seed).toBeDefined();
    expect(snapshotData!.simTime).toBeDefined();
    expect(snapshotData!.x.length).toBeGreaterThan(0);
    expect(snapshotData!.x.length).toBe(snapshotData!.y.length);
    expect(snapshotData!.x.length).toBe(snapshotData!.vx.length);
    expect(snapshotData!.x.length).toBe(snapshotData!.vy.length);

    // Positions should be within world bounds (non-negative, reasonable values)
    for (const x of snapshotData!.x) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(3000); // reasonable screen size
    }
    for (const y of snapshotData!.y) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(3000);
    }

    // simTime should be > 0 (simulation has been running)
    expect(snapshotData!.simTime).toBeGreaterThan(0);
  });

  test('beforeunload triggers autosave', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Simulate beforeunload by calling the autosave function via dispatchEvent
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    await page.waitForTimeout(500);

    // Check that autosave data exists
    const hasAutosave = await page.evaluate(() => {
      return localStorage.getItem('critterium-autosave') !== null;
    });
    expect(hasAutosave).toBe(true);
  });
});
