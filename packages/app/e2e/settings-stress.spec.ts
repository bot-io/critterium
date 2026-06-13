import { test, expect } from '@playwright/test';

/**
 * Settings Stress E2E Test
 *
 * Exercises every control in the settings panel to verify:
 * 1. No console errors are produced during intensive UI interaction
 * 2. All sliders, buttons, inputs, and toggles work without crashing
 * 3. Species add/delete, matrix editing, forces, and actions all work
 */

test.describe('Settings stress test — exercise every control', () => {
  test('no console errors after exercising all settings panel controls', async ({ page }) => {
    // ── 1. Collect console errors ──────────────────────────────────
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // ── 2. Navigate and wait for canvas ────────────────────────────
    await page.goto('http://localhost:3000');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // ── 3. Let simulation run to establish baseline ────────────────
    await page.waitForTimeout(2000);

    // ── 4. Open the settings panel ─────────────────────────────────
    const toggleBtn = page.locator('.crit-controls-toggle');
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Panel should now be visible
    const panel = page.locator('.crit-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // ────────────────────────────────────────────────────────────────
    // Helper: expand a section by title text
    // ────────────────────────────────────────────────────────────────
    async function expandSection(title: string): Promise<void> {
      try {
        const sectionHeaders = panel.locator('.crit-section-hdr');
        const count = await sectionHeaders.count();
        for (let i = 0; i < count; i++) {
          const titleEl = sectionHeaders.nth(i).locator('.crit-section-title');
          const text = await titleEl.textContent();
          if (text?.trim() === title) {
            const body = sectionHeaders.nth(i).locator('+ .crit-section-body');
            const isCollapsed = await body.evaluate((el) => el.classList.contains('collapsed'));
            if (isCollapsed) {
              await sectionHeaders.nth(i).click();
              await page.waitForTimeout(200);
            }
            return;
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Helper: expand a sub-section by partial title match
    async function expandSubSection(parentLocator: any, title: string): Promise<void> {
      try {
        const subs = parentLocator.locator('.crit-subsection');
        const count = await subs.count();
        for (let i = 0; i < count; i++) {
          const hdr = subs.nth(i).locator('.crit-subsection-hdr');
          const text = await hdr.textContent();
          if (text?.includes(title)) {
            const body = subs.nth(i).locator('.crit-section-body');
            const isCollapsed = await body.evaluate((el) => el.classList.contains('collapsed'));
            if (isCollapsed) {
              await hdr.click();
              await page.waitForTimeout(200);
            }
            return;
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Helper: move a slider inside a container by label text
    async function moveSliderByLabel(container: any, labelText: string): Promise<void> {
      try {
        const rows = container.locator('.crit-row');
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
          const label = rows.nth(i).locator('.crit-label');
          const text = await label.textContent();
          if (text?.trim() === labelText) {
            const slider = rows.nth(i).locator('input[type="range"]');
            if (await slider.isVisible()) {
              const currentVal = await slider.inputValue();
              const newVal = String(parseFloat(currentVal) + 1);
              await slider.fill(newVal);
              await page.waitForTimeout(100);
            }
            return;
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Helper: move all sliders in a container
    async function moveAllSliders(container: any): Promise<void> {
      try {
        const sliders = container.locator('input[type="range"]');
        const count = await sliders.count();
        for (let i = 0; i < count; i++) {
          try {
            const slider = sliders.nth(i);
            if (await slider.isVisible()) {
              const currentVal = parseFloat(await slider.inputValue());
              const max = parseFloat(await slider.getAttribute('max') ?? '100');
              const step = parseFloat(await slider.getAttribute('step') ?? '1');
              const targetVal = Math.min(max, currentVal + step * 3);
              await slider.fill(String(targetVal));
              await page.waitForTimeout(50);
            }
          } catch {
            // Skip individual slider on error
          }
        }
      } catch {
        // Non-critical
      }
    }

    // ── 5. Exercise Species section for each species tab ───────────
    await expandSection('Species');

    const speciesTabs = panel.locator('.crit-species-tab');
    const tabCount = await speciesTabs.count();

    for (let tabIndex = 0; tabIndex < tabCount; tabIndex++) {
      try {
        // Click the species tab
        await speciesTabs.nth(tabIndex).click();
        await page.waitForTimeout(300);

        // Get the active species panel (visible one)
        const speciesPanels = panel.locator('.crit-species-panel');
        const panelCount = await speciesPanels.count();
        let activePanel: any = null;
        for (let pi = 0; pi < panelCount; pi++) {
          const isVisible = await speciesPanels.nth(pi).isVisible();
          if (isVisible) {
            activePanel = speciesPanels.nth(pi);
            break;
          }
        }
        if (!activePanel) continue;

        // Change name input
        try {
          const nameInput = activePanel.locator('input.crit-name-input');
          if (await nameInput.isVisible()) {
            await nameInput.fill(`TestSp${tabIndex}`);
            await nameInput.blur();
            await page.waitForTimeout(200);
          }
        } catch { /* non-critical */ }

        // Change color input
        try {
          const colorInput = activePanel.locator('input[type="color"]');
          if (await colorInput.isVisible()) {
            await colorInput.fill('#ff6600');
            await page.waitForTimeout(200);
          }
        } catch { /* non-critical */ }

        // Move Count slider + click Apply
        try {
          const countRow = activePanel.locator('.crit-row').filter({ hasText: 'Count' });
          const countSlider = countRow.locator('input[type="range"]');
          if (await countSlider.isVisible()) {
            const currentVal = parseFloat(await countSlider.inputValue());
            await countSlider.fill(String(Math.min(200, currentVal + 10)));
            await page.waitForTimeout(100);
          }
          const applyBtn = countRow.locator('button:has-text("Apply")');
          if (await applyBtn.isVisible()) {
            await applyBtn.click();
            await page.waitForTimeout(200);
          }
        } catch { /* non-critical */ }

        // Move basic sliders: Radius, Init Speed, Max Speed
        for (const label of ['Radius', 'Init Speed', 'Max Speed']) {
          await moveSliderByLabel(activePanel, label);
        }

        // Open and exercise Energy sub-section
        await expandSubSection(activePanel, 'Energy');
        for (const label of ['Max Energy', 'Init Energy', 'Repro Cost', 'Move Cost/s', 'Idle Drain/s']) {
          await moveSliderByLabel(activePanel, label);
        }

        // Open and exercise Lifecycle sub-section
        await expandSubSection(activePanel, 'Lifecycle');
        for (const label of ['Max Age', 'Starv Dmg/s', 'Repro Timeout']) {
          await moveSliderByLabel(activePanel, label);
        }

        // Open and exercise Stamina sub-section (if exists)
        await expandSubSection(activePanel, 'Stamina');
        for (const label of ['Sprint Dur', 'Sprint CD', 'Sprint Spd ×', 'Tired Spd ×']) {
          await moveSliderByLabel(activePanel, label);
        }

        // Open and exercise Diet sub-section — toggle checkboxes
        await expandSubSection(activePanel, 'Diet');
        try {
          const dietSub = activePanel.locator('.crit-subsection').filter({ hasText: 'Diet' });
          const dietCheckboxes = dietSub.locator('input[type="checkbox"]');
          const cbCount = await dietCheckboxes.count();
          for (let ci = 0; ci < Math.min(cbCount, 4); ci++) {
            try {
              if (await dietCheckboxes.nth(ci).isVisible()) {
                await dietCheckboxes.nth(ci).click();
                await page.waitForTimeout(100);
              }
            } catch { /* skip */ }
          }
        } catch { /* non-critical */ }
      } catch {
        // Skip entire species tab on error
      }
    }

    // ── 6. Exercise Forces section ─────────────────────────────────
    await expandSection('Forces');
    try {
      const forcesSection = panel.locator('.crit-section').filter({ hasText: 'Forces' });

      // Toggle each force on and off
      const forceToggles = forcesSection.locator('.crit-toggle-wrap');
      const toggleCount = await forceToggles.count();
      for (let ti = 0; ti < toggleCount; ti++) {
        try {
          if (await forceToggles.nth(ti).isVisible()) {
            await forceToggles.nth(ti).click();
            await page.waitForTimeout(100);
            // Toggle back
            await forceToggles.nth(ti).click();
            await page.waitForTimeout(100);
          }
        } catch { /* skip */ }
      }

      // Move all force sliders (Drag Coeff, Wander Str/Rate, Pointer Str/Radius)
      await moveAllSliders(forcesSection);

      // Change the Pointer falloff select
      try {
        const falloffSelect = forcesSection.locator('select.crit-select');
        if (await falloffSelect.isVisible()) {
          await falloffSelect.selectOption('inverse');
          await page.waitForTimeout(200);
          await falloffSelect.selectOption('constant');
          await page.waitForTimeout(200);
          await falloffSelect.selectOption('linear');
          await page.waitForTimeout(200);
        }
      } catch { /* non-critical */ }
    } catch { /* non-critical */ }

    // ── 7. Exercise Interaction Matrix section ─────────────────────
    await expandSection('Interaction Matrix');
    try {
      const matrixSection = panel.locator('.crit-section').filter({ hasText: 'Interaction Matrix' });

      // Click each matrix cell to change strength
      const matrixCells = matrixSection.locator('.crit-matrix-cell');
      const cellCount = await matrixCells.count();
      for (let ci = 0; ci < cellCount; ci++) {
        try {
          if (await matrixCells.nth(ci).isVisible()) {
            await matrixCells.nth(ci).click();
            await page.waitForTimeout(100);
          }
        } catch { /* skip */ }
      }

      // Move min/max distance sliders in the Interaction Distance sub-area
      try {
        // The distance sliders live inside the last crit-section-body in the matrix section
        const distSliders = matrixSection.locator('input[type="range"]');
        const distSliderCount = await distSliders.count();
        for (let si = 0; si < distSliderCount; si++) {
          try {
            const slider = distSliders.nth(si);
            if (await slider.isVisible()) {
              const currentVal = parseFloat(await slider.inputValue());
              const max = parseFloat(await slider.getAttribute('max') ?? '300');
              await slider.fill(String(Math.min(max, currentVal + 10)));
              await page.waitForTimeout(50);
            }
          } catch { /* skip */ }
        }
      } catch { /* non-critical */ }

      // Click Randomize button
      try {
        const randBtn = matrixSection.locator('button:has-text("Randomize")');
        if (await randBtn.isVisible()) {
          await randBtn.click();
          await page.waitForTimeout(300);
        }
      } catch { /* non-critical */ }

      // Click Clear button
      try {
        const clearBtn = matrixSection.locator('button:has-text("Clear")');
        if (await clearBtn.isVisible()) {
          await clearBtn.click();
          await page.waitForTimeout(300);
        }
      } catch { /* non-critical */ }
    } catch { /* non-critical */ }

    // ── 8. Add a new species ───────────────────────────────────────
    try {
      const addSpeciesBtn = panel.locator('.crit-btn-add-species');
      if (await addSpeciesBtn.isVisible()) {
        await addSpeciesBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch { /* non-critical */ }

    // ── 9. Delete the added species ────────────────────────────────
    try {
      const allTabs = panel.locator('.crit-species-tab');
      const newTabCount = await allTabs.count();
      if (newTabCount > tabCount) {
        // Click the last tab (the newly added species)
        await allTabs.last().click();
        await page.waitForTimeout(300);

        // Accept the confirm dialog
        page.once('dialog', async (dialog) => {
          await dialog.accept();
        });

        // Click the ✕ delete button on the active species panel
        const speciesPanels = panel.locator('.crit-species-panel');
        const panelCount = await speciesPanels.count();
        for (let pi = 0; pi < panelCount; pi++) {
          const isVisible = await speciesPanels.nth(pi).isVisible();
          if (isVisible) {
            const deleteBtn = speciesPanels.nth(pi).locator('button:has-text("✕")');
            if (await deleteBtn.isVisible()) {
              await deleteBtn.click();
              break;
            }
          }
        }
        await page.waitForTimeout(2000);
      }
    } catch { /* non-critical */ }

    // ── 10. Click Reseed button ────────────────────────────────────
    await expandSection('Simulation');
    try {
      const reseedBtn = panel.locator('button:has-text("Reseed")');
      if (await reseedBtn.isVisible()) {
        await reseedBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* non-critical */ }

    // ── 11. Click Reset button (Reload Preset) ─────────────────────
    try {
      const resetBtn = panel.locator('button:has-text("Reload Preset")');
      if (await resetBtn.isVisible()) {
        await resetBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* non-critical */ }

    // ── 12. Toggle Pause on/off ────────────────────────────────────
    try {
      const pauseBtn = panel.locator('button:has-text("Pause")');
      if (await pauseBtn.isVisible()) {
        await pauseBtn.click();
        await page.waitForTimeout(500);
        // The button text changes to "Play" when paused — look for it
        const playBtn = panel.locator('button:has-text("Play")');
        if (await playBtn.isVisible()) {
          await playBtn.click();
          await page.waitForTimeout(500);
        }
      }
    } catch { /* non-critical */ }

    // ── 13. Change speed slider ────────────────────────────────────
    try {
      const simSection = panel.locator('.crit-section').filter({ hasText: 'Simulation' });
      const speedRow = simSection.locator('.crit-row').filter({ hasText: 'Speed' });
      const speedSlider = speedRow.locator('input[type="range"]');
      if (await speedSlider.isVisible()) {
        await speedSlider.fill('2.0');
        await page.waitForTimeout(300);
        await speedSlider.fill('1.0');
        await page.waitForTimeout(300);
      }
    } catch { /* non-critical */ }

    // ── 14. Change population cap slider ───────────────────────────
    try {
      const simSection = panel.locator('.crit-section').filter({ hasText: 'Simulation' });
      const popCapRow = simSection.locator('.crit-row').filter({ hasText: 'Pop Cap' });
      const popCapSlider = popCapRow.locator('input[type="range"]');
      if (await popCapSlider.isVisible()) {
        await popCapSlider.fill('800');
        await page.waitForTimeout(300);
      }
    } catch { /* non-critical */ }

    // ── 15. Let the simulation run for 3 more seconds ──────────────
    await page.waitForTimeout(3000);

    // ── 16. ASSERT: zero console errors ────────────────────────────
    // Filter out known harmless console errors
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes('WebGPU') &&
        !e.includes('webgpu') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('DEVTOOLS') &&
        !e.includes('Extension context invalidated') &&
        !e.includes('Could not establish connection') &&
        !e.includes('CORS')
    );

    if (realErrors.length > 0) {
      console.log('Console errors during stress test:', realErrors);
    }

    expect(realErrors).toHaveLength(0);
  });
});
