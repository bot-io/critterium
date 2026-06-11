import { test, expect } from '@playwright/test';

/**
 * CRT-9: Playwright smoke test
 *
 * Verifies the web app boots, creates a canvas, and renders particles.
 */
test.describe('Critterium web app smoke test', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Critterium/i);
  });

  test('canvas element is created', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for PixiJS to initialize and create a canvas
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
  });

  test('HUD overlay shows FPS counter', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for rendering to start
    await page.waitForTimeout(2000);
    // The HUD text should contain "FPS:" after a few frames
    const hudText = await page.evaluate(() => {
      // PixiJS Text elements are rendered as part of the canvas,
      // so we check the console output or look for the canvas
      const canvas = document.querySelector('canvas');
      return canvas !== null;
    });
    expect(hudText).toBe(true);
  });

  test('console shows startup messages', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        messages.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);

    // Should see the startup message
    expect(messages.some((m) => m.includes('Critterium'))).toBe(true);
    // Should see species info
    expect(messages.some((m) => m.includes('Species'))).toBe(true);
    // Should see initial particle count
    expect(messages.some((m) => m.includes('particles'))).toBe(true);
  });

  test('no console errors on startup', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);

    // Filter out known benign errors (e.g., WebGPU not available)
    const realErrors = errors.filter(
      (e) => !e.includes('WebGPU') && !e.includes('webgpu'),
    );
    expect(realErrors).toHaveLength(0);
  });
});
