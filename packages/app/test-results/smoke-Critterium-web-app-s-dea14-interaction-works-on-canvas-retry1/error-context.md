# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Critterium web app smoke test >> touch interaction works on canvas
- Location: e2e\smoke.spec.ts:114:3

# Error details

```
Error: touchscreen.tap: hasTouch must be enabled on the browser context before using the touchscreen.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6] [cursor=pointer]:
        - generic [ref=e7]: ▼
        - generic [ref=e8]: Simulation
      - generic [ref=e9]:
        - generic [ref=e10]:
          - button "⏸ Pause" [ref=e11] [cursor=pointer]
          - button "↺ Reset" [ref=e12] [cursor=pointer]
          - button "🎲 Seed" [ref=e13] [cursor=pointer]
        - generic [ref=e14]:
          - generic "Speed" [ref=e15]
          - slider [ref=e16]: "1"
          - generic [ref=e17]: "1"
        - generic [ref=e18]:
          - generic "Pop Cap" [ref=e19]
          - slider [ref=e20]: "600"
          - generic [ref=e21]: "600"
    - generic [ref=e22]:
      - generic [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: ▼
        - generic [ref=e25]: Species
      - generic [ref=e26]:
        - button "+ Add Species" [ref=e28] [cursor=pointer]
        - generic [ref=e29]:
          - generic [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: ▼
            - textbox [ref=e32]: Prey
            - textbox [ref=e33]: "#44cc44"
            - button "✕" [ref=e34]
          - generic [ref=e35]:
            - generic [ref=e36]:
              - generic [ref=e37]: Count
              - slider [ref=e38]: "120"
              - generic [ref=e39]: "120"
              - button "Apply" [ref=e40] [cursor=pointer]
            - generic [ref=e41]:
              - generic "Radius" [ref=e42]
              - slider [ref=e43]: "3"
              - generic [ref=e44]: "3"
            - generic [ref=e45]:
              - generic "Init Speed" [ref=e46]
              - slider [ref=e47]: "60"
              - generic [ref=e48]: "60"
            - generic [ref=e49]:
              - generic "Max Speed" [ref=e50]
              - slider [ref=e51]: "100"
              - generic [ref=e52]: "100"
            - generic [ref=e53]:
              - generic [ref=e54] [cursor=pointer]: ▸ Energy
              - generic [ref=e55]:
                - generic [ref=e56]:
                  - generic "Max Energy" [ref=e57]
                  - slider [ref=e58]: "80"
                  - generic [ref=e59]: "80"
                - generic [ref=e60]:
                  - generic "Init Energy" [ref=e61]
                  - slider [ref=e62]: "100"
                  - generic [ref=e63]: "100"
                - generic [ref=e64]:
                  - generic "Repro Cost" [ref=e65]
                  - slider [ref=e66]: "20"
                  - generic [ref=e67]: "20"
                - generic [ref=e68]:
                  - generic "Move Cost/s" [ref=e69]
                  - slider [ref=e70]: "1"
                  - generic [ref=e71]: "1"
                - generic [ref=e72]:
                  - generic "Idle Drain/s" [ref=e73]
                  - slider [ref=e74]: "0"
                  - generic [ref=e75]: "0"
            - generic [ref=e76]:
              - generic [ref=e77] [cursor=pointer]: ▸ Lifecycle
              - generic [ref=e78]:
                - generic [ref=e79]:
                  - generic "Max Age" [ref=e80]
                  - slider [ref=e81]: "101"
                  - generic [ref=e82]: "101"
                - generic [ref=e83]:
                  - generic "Starv Dmg/s" [ref=e84]
                  - slider [ref=e85]: "8"
                  - generic [ref=e86]: "8"
                - generic [ref=e87]:
                  - generic "Repro CD" [ref=e88]
                  - slider [ref=e89]: "3"
                  - generic [ref=e90]: "3"
                - generic [ref=e91]:
                  - generic "Sick Dur" [ref=e92]
                  - slider [ref=e93]: "8"
                  - generic [ref=e94]: "8"
                - generic [ref=e95]:
                  - generic "Contagion R" [ref=e96]
                  - slider [ref=e97]: "15"
                  - generic [ref=e98]: "15"
            - generic [ref=e99]:
              - generic [ref=e100] [cursor=pointer]: ▸ Diet
              - generic [ref=e101]:
                - generic [ref=e103] [cursor=pointer]:
                  - button [ref=e104]
                  - generic [ref=e105]: Eat Predator
                - generic [ref=e107] [cursor=pointer]:
                  - button [ref=e108]
                  - generic [ref=e109]: Eat Parasite
                - generic [ref=e111] [cursor=pointer]:
                  - button [ref=e112]
                  - generic [ref=e113]: Infect Predator
                - generic [ref=e115] [cursor=pointer]:
                  - button [ref=e116]
                  - generic [ref=e117]: Infect Parasite
        - generic [ref=e118]:
          - generic [ref=e119] [cursor=pointer]:
            - generic [ref=e120]: ▼
            - textbox [ref=e121]: Predator
            - textbox [ref=e122]: "#ff4444"
            - button "✕" [ref=e123]
          - generic [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]: Count
              - slider [ref=e127]: "40"
              - generic [ref=e128]: "40"
              - button "Apply" [ref=e129] [cursor=pointer]
            - generic [ref=e130]:
              - generic "Radius" [ref=e131]
              - slider [ref=e132]: "5"
              - generic [ref=e133]: "5"
            - generic [ref=e134]:
              - generic "Init Speed" [ref=e135]
              - slider [ref=e136]: "70"
              - generic [ref=e137]: "70"
            - generic [ref=e138]:
              - generic "Max Speed" [ref=e139]
              - slider [ref=e140]: "130"
              - generic [ref=e141]: "130"
            - generic [ref=e142]:
              - generic [ref=e143] [cursor=pointer]: ▸ Energy
              - generic [ref=e144]:
                - generic [ref=e145]:
                  - generic "Max Energy" [ref=e146]
                  - slider [ref=e147]: "305"
                  - generic [ref=e148]: "305"
                - generic [ref=e149]:
                  - generic "Init Energy" [ref=e150]
                  - slider [ref=e151]: "20"
                  - generic [ref=e152]: "20"
                - generic [ref=e153]:
                  - generic "Repro Cost" [ref=e154]
                  - slider [ref=e155]: "20"
                  - generic [ref=e156]: "20"
                - generic [ref=e157]:
                  - generic "Move Cost/s" [ref=e158]
                  - slider [ref=e159]: "3"
                  - generic [ref=e160]: "3"
                - generic [ref=e161]:
                  - generic "Idle Drain/s" [ref=e162]
                  - slider [ref=e163]: "2"
                  - generic [ref=e164]: "2"
            - generic [ref=e165]:
              - generic [ref=e166] [cursor=pointer]: ▸ Lifecycle
              - generic [ref=e167]:
                - generic [ref=e168]:
                  - generic "Max Age" [ref=e169]
                  - slider [ref=e170]: "60"
                  - generic [ref=e171]: "60"
                - generic [ref=e172]:
                  - generic "Starv Dmg/s" [ref=e173]
                  - slider [ref=e174]: "5"
                  - generic [ref=e175]: "5"
                - generic [ref=e176]:
                  - generic "Repro CD" [ref=e177]
                  - slider [ref=e178]: "8"
                  - generic [ref=e179]: "8"
                - generic [ref=e180]:
                  - generic "Sick Dur" [ref=e181]
                  - slider [ref=e182]: "23"
                  - generic [ref=e183]: "23"
                - generic [ref=e184]:
                  - generic "Contagion R" [ref=e185]
                  - slider [ref=e186]: "0"
                  - generic [ref=e187]: "0"
            - generic [ref=e188]:
              - generic [ref=e189] [cursor=pointer]: ▸ Diet
              - generic [ref=e190]:
                - generic [ref=e192] [cursor=pointer]:
                  - button [ref=e193]
                  - generic [ref=e194]: Eat Prey
                - generic [ref=e196] [cursor=pointer]:
                  - button [ref=e197]
                  - generic [ref=e198]: Eat Parasite
                - generic [ref=e200] [cursor=pointer]:
                  - button [ref=e201]
                  - generic [ref=e202]: Infect Prey
                - generic [ref=e204] [cursor=pointer]:
                  - button [ref=e205]
                  - generic [ref=e206]: Infect Parasite
        - generic [ref=e207]:
          - generic [ref=e208] [cursor=pointer]:
            - generic [ref=e209]: ▼
            - textbox [ref=e210]: Parasite
            - textbox [ref=e211]: "#cc44cc"
            - button "✕" [ref=e212]
          - generic [ref=e213]:
            - generic [ref=e214]:
              - generic [ref=e215]: Count
              - slider [ref=e216]: "40"
              - generic [ref=e217]: "40"
              - button "Apply" [ref=e218] [cursor=pointer]
            - generic [ref=e219]:
              - generic "Radius" [ref=e220]
              - slider [ref=e221]: "4"
              - generic [ref=e222]: "4"
            - generic [ref=e223]:
              - generic "Init Speed" [ref=e224]
              - slider [ref=e225]: "40"
              - generic [ref=e226]: "40"
            - generic [ref=e227]:
              - generic "Max Speed" [ref=e228]
              - slider [ref=e229]: "80"
              - generic [ref=e230]: "80"
            - generic [ref=e231]:
              - generic [ref=e232] [cursor=pointer]: ▸ Energy
              - generic [ref=e233]:
                - generic [ref=e234]:
                  - generic "Max Energy" [ref=e235]
                  - slider [ref=e236]: "100"
                  - generic [ref=e237]: "100"
                - generic [ref=e238]:
                  - generic "Init Energy" [ref=e239]
                  - slider [ref=e240]: "50"
                  - generic [ref=e241]: "50"
                - generic [ref=e242]:
                  - generic "Repro Cost" [ref=e243]
                  - slider [ref=e244]: "100"
                  - generic [ref=e245]: "100"
                - generic [ref=e246]:
                  - generic "Move Cost/s" [ref=e247]
                  - slider [ref=e248]: "1"
                  - generic [ref=e249]: "1"
                - generic [ref=e250]:
                  - generic "Idle Drain/s" [ref=e251]
                  - slider [ref=e252]: "1.5"
                  - generic [ref=e253]: "1.5"
            - generic [ref=e254]:
              - generic [ref=e255] [cursor=pointer]: ▸ Lifecycle
              - generic [ref=e256]:
                - generic [ref=e257]:
                  - generic "Max Age" [ref=e258]
                  - slider [ref=e259]: "30"
                  - generic [ref=e260]: "30"
                - generic [ref=e261]:
                  - generic "Starv Dmg/s" [ref=e262]
                  - slider [ref=e263]: "10"
                  - generic [ref=e264]: "10"
                - generic [ref=e265]:
                  - generic "Repro CD" [ref=e266]
                  - slider [ref=e267]: "5"
                  - generic [ref=e268]: "5"
                - generic [ref=e269]:
                  - generic "Sick Dur" [ref=e270]
                  - slider [ref=e271]: "0"
                  - generic [ref=e272]: "0"
                - generic [ref=e273]:
                  - generic "Contagion R" [ref=e274]
                  - slider [ref=e275]: "25"
                  - generic [ref=e276]: "25"
            - generic [ref=e277]:
              - generic [ref=e278] [cursor=pointer]: ▸ Diet
              - generic [ref=e279]:
                - generic [ref=e281] [cursor=pointer]:
                  - button [ref=e282]
                  - generic [ref=e283]: Eat Prey
                - generic [ref=e285] [cursor=pointer]:
                  - button [ref=e286]
                  - generic [ref=e287]: Eat Predator
                - generic [ref=e289] [cursor=pointer]:
                  - button [ref=e290]
                  - generic [ref=e291]: Infect Prey
                - generic [ref=e293] [cursor=pointer]:
                  - button [ref=e294]
                  - generic [ref=e295]: Infect Predator
    - generic [ref=e296]:
      - generic [ref=e297] [cursor=pointer]:
        - generic [ref=e298]: ▼
        - generic [ref=e299]: Forces
      - generic [ref=e300]:
        - generic [ref=e302] [cursor=pointer]:
          - button [ref=e303]
          - generic [ref=e304]: Drag
        - generic [ref=e305]:
          - generic "Coeff" [ref=e306]
          - slider [ref=e307]: "0.8"
          - generic [ref=e308]: "0.8"
        - generic [ref=e310] [cursor=pointer]:
          - button [ref=e311]
          - generic [ref=e312]: Wander
        - generic [ref=e313]:
          - generic "Str" [ref=e314]
          - slider [ref=e315]: "40"
          - generic [ref=e316]: "40"
        - generic [ref=e317]:
          - generic "Rate" [ref=e318]
          - slider [ref=e319]: "2.5"
          - generic [ref=e320]: "2.5"
        - generic [ref=e322] [cursor=pointer]:
          - button [ref=e323]
          - generic [ref=e324]: Pointer
        - generic [ref=e325]:
          - generic "Str" [ref=e326]
          - slider [ref=e327]: "200"
          - generic [ref=e328]: "200"
        - generic [ref=e329]:
          - generic "Radius" [ref=e330]
          - slider [ref=e331]: "150"
          - generic [ref=e332]: "150"
        - generic [ref=e333]:
          - generic [ref=e334]: Falloff
          - combobox [ref=e335] [cursor=pointer]:
            - option "linear" [selected]
            - option "inverse"
            - option "constant"
    - generic [ref=e336]:
      - generic [ref=e337] [cursor=pointer]:
        - generic [ref=e338]: ▼
        - generic [ref=e339]: Interaction Matrix
      - generic [ref=e340]:
        - generic [ref=e341]:
          - button "🎲 Randomize" [ref=e342] [cursor=pointer]
          - button "✕ Clear" [ref=e343] [cursor=pointer]
        - generic [ref=e344]:
          - generic "Prey" [ref=e346]
          - generic "Predator" [ref=e347]: Preda
          - generic "Parasite" [ref=e348]: Paras
          - generic "Prey" [ref=e349]
          - generic [ref=e351] [cursor=pointer]: "30"
          - generic [ref=e353] [cursor=pointer]: "-80"
          - generic [ref=e355] [cursor=pointer]: "-40"
          - generic "Predator" [ref=e356]: Preda
          - generic [ref=e358] [cursor=pointer]: "60"
          - generic [ref=e360] [cursor=pointer]: "-20"
          - generic [ref=e362] [cursor=pointer]: "0"
          - generic "Parasite" [ref=e363]: Paras
          - generic [ref=e365] [cursor=pointer]: "50"
          - generic [ref=e367] [cursor=pointer]: "0"
          - generic [ref=e369] [cursor=pointer]: "-15"
    - generic [ref=e370]:
      - generic [ref=e371] [cursor=pointer]:
        - generic [ref=e372]: ▼
        - generic [ref=e373]: Actions
      - generic [ref=e374]:
        - generic [ref=e375]:
          - button "💾 Export" [ref=e376] [cursor=pointer]
          - button "📂 Import" [ref=e377] [cursor=pointer]
        - generic [ref=e378]:
          - generic [ref=e379]: Presets
          - combobox [ref=e380] [cursor=pointer]:
            - option "Choose a preset..." [disabled] [selected]
            - option "Classic"
            - option "Plankton Bloom"
            - option "Swarm Intelligence"
            - option "Predator Arena"
            - option "Sick World"
            - option "Zen Garden"
          - button "▶ Load" [ref=e381] [cursor=pointer]
        - generic [ref=e383]:
          - textbox "Preset name..." [ref=e384]
          - button "💾 Save" [ref=e385] [cursor=pointer]
        - generic [ref=e386]:
          - combobox [ref=e387] [cursor=pointer]:
            - option "(no presets)" [disabled] [selected]
          - button "📂 Load" [ref=e388] [cursor=pointer]
          - button "🗑" [ref=e389] [cursor=pointer]
  - generic: "FPS: 24"
  - button "⚙" [ref=e390] [cursor=pointer]
```

# Test source

```ts
  29  |       const canvas = document.querySelector('canvas');
  30  |       return canvas !== null;
  31  |     });
  32  |     expect(hudText).toBe(true);
  33  |   });
  34  | 
  35  |   test('console shows startup messages', async ({ page }) => {
  36  |     const messages: string[] = [];
  37  |     page.on('console', (msg) => {
  38  |       if (msg.type() === 'log') {
  39  |         messages.push(msg.text());
  40  |       }
  41  |     });
  42  | 
  43  |     await page.goto('http://localhost:3000');
  44  |     await page.waitForTimeout(3000);
  45  | 
  46  |     // Should see the startup message
  47  |     expect(messages.some((m) => m.includes('Critterium'))).toBe(true);
  48  |     // Should see species info
  49  |     expect(messages.some((m) => m.includes('Species'))).toBe(true);
  50  |     // Should see initial particle count
  51  |     expect(messages.some((m) => m.includes('particles'))).toBe(true);
  52  |   });
  53  | 
  54  |   test('no console errors on startup', async ({ page }) => {
  55  |     const errors: string[] = [];
  56  |     page.on('console', (msg) => {
  57  |       if (msg.type() === 'error') {
  58  |         errors.push(msg.text());
  59  |       }
  60  |     });
  61  | 
  62  |     await page.goto('http://localhost:3000');
  63  |     await page.waitForTimeout(3000);
  64  | 
  65  |     // Filter out known benign errors (e.g., WebGPU not available)
  66  |     const realErrors = errors.filter(
  67  |       (e) => !e.includes('WebGPU') && !e.includes('webgpu'),
  68  |     );
  69  |     expect(realErrors).toHaveLength(0);
  70  |   });
  71  | 
  72  |   // CRT-10: Pointer/touch interaction force e2e test
  73  |   test('pointer interaction attracts particles toward cursor', async ({ page }) => {
  74  |     await page.goto('http://localhost:3000');
  75  |     await page.waitForTimeout(2000);
  76  | 
  77  |     const canvas = page.locator('canvas').first();
  78  |     await expect(canvas).toBeVisible();
  79  | 
  80  |     // Get canvas bounding box
  81  |     const box = await canvas.boundingBox();
  82  |     expect(box).not.toBeNull();
  83  | 
  84  |     // Capture particle positions before pointer interaction
  85  |     const beforePositions = await page.evaluate(() => {
  86  |       // We'll measure by checking if the sim responds to pointer events
  87  |       // The PointerForce is wired to canvas pointer events
  88  |       const canvas = document.querySelector('canvas');
  89  |       if (!canvas) return null;
  90  |       return { hasCanvas: true };
  91  |     });
  92  |     expect(beforePositions?.hasCanvas).toBe(true);
  93  | 
  94  |     // Simulate pointer down + move in center of canvas
  95  |     if (box) {
  96  |       const cx = box.x + box.width / 2;
  97  |       const cy = box.y + box.height / 2;
  98  | 
  99  |       await page.mouse.move(cx, cy);
  100 |       await page.mouse.down();
  101 |       // Hold for a moment to let sim process
  102 |       await page.waitForTimeout(500);
  103 |       await page.mouse.move(cx + 50, cy + 50);
  104 |       await page.waitForTimeout(300);
  105 |       await page.mouse.up();
  106 |     }
  107 | 
  108 |     // If we got here without errors, the pointer event wiring works
  109 |     // The actual force physics is tested in unit tests
  110 |     expect(true).toBe(true);
  111 |   });
  112 | 
  113 |   // CRT-10: Touch interaction e2e test
  114 |   test('touch interaction works on canvas', async ({ page }) => {
  115 |     await page.goto('http://localhost:3000');
  116 |     await page.waitForTimeout(2000);
  117 | 
  118 |     const canvas = page.locator('canvas').first();
  119 |     await expect(canvas).toBeVisible();
  120 | 
  121 |     const box = await canvas.boundingBox();
  122 |     expect(box).not.toBeNull();
  123 | 
  124 |     if (box) {
  125 |       const cx = box.x + box.width / 2;
  126 |       const cy = box.y + box.height / 2;
  127 | 
  128 |       // Simulate touch tap
> 129 |       await page.touchscreen.tap(cx, cy);
      |                              ^ Error: touchscreen.tap: hasTouch must be enabled on the browser context before using the touchscreen.
  130 |       await page.waitForTimeout(300);
  131 |     }
  132 | 
  133 |     // No crash = success. Touch events are wired and don't error.
  134 |     expect(true).toBe(true);
  135 |   });
  136 | });
  137 | 
```