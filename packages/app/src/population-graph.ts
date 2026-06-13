/**
 * Critterium — Population Graph Overlay
 *
 * Lightweight canvas-based population graph that draws on a
 * separate small canvas overlaid on the main simulation canvas.
 * Shows per-species population trends over time.
 */

export interface PopulationGraphOptions {
  speciesColors: number[];
  maxHistorySec: number;
}

interface HistoryEntry {
  counts: number[];
}

export class PopulationGraph {
  private ctx: CanvasRenderingContext2D;
  private speciesColors: number[];
  private maxHistorySec: number;

  /** History buffer: oldest first. */
  private history: HistoryEntry[] = [];

  /** Time accumulator for sampling. */
  private sampleTimer = 0;

  /** Sample interval in seconds. */
  private readonly sampleInterval = 0.5;

  /** Width of the graph canvas. */
  private readonly width = 200;

  /** Height of the graph canvas. */
  private readonly height = 80;

  constructor(canvas: HTMLCanvasElement, options: PopulationGraphOptions) {
    this.ctx = canvas.getContext('2d')!;
    this.speciesColors = options.speciesColors;
    this.maxHistorySec = options.maxHistorySec;

    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.position = 'fixed';
    canvas.style.left = '8px';
    canvas.style.bottom = '8px';
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10';
    canvas.style.borderRadius = '4px';
  }

  /**
   * Update the graph with current species counts.
   * @param speciesCounts Per-species alive counts (typed or regular array).
   * @param dt Frame delta time in seconds.
   */
  update(speciesCounts: number[] | Int32Array | Uint8Array, dt: number): void {
    this.sampleTimer += dt;

    // Only sample every 0.5s
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer = 0;
      this.history.push({ counts: Array.from(speciesCounts) });

      // Trim to max history
      const maxEntries = Math.ceil(this.maxHistorySec / this.sampleInterval);
      while (this.history.length > maxEntries) {
        this.history.shift();
      }
    }

    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    if (this.history.length < 2) return;

    // Find max population for Y-axis scaling
    let maxPop = 1;
    for (const entry of this.history) {
      for (const c of entry.counts) {
        if (c > maxPop) maxPop = c;
      }
    }

    // Draw thin grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    const gridLines = 3;
    for (let i = 1; i <= gridLines; i++) {
      const y = h - (h * i) / (gridLines + 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw one line per species
    const numSpecies = this.speciesColors.length;
    for (let s = 0; s < numSpecies; s++) {
      const color = this.speciesColors[s];
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;

      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let j = 0; j < this.history.length; j++) {
        const x = (j / (this.history.length - 1)) * w;
        const count = this.history[j].counts[s] || 0;
        const y = h - (count / maxPop) * h;
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  /** Update species colors (e.g. when species are added/removed). */
  setColors(colors: number[]): void {
    this.speciesColors = colors;
  }

  /** Clean up and reset all history. */
  reset(): void {
    this.history.length = 0;
    this.sampleTimer = 0;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /** Clean up. */
  destroy(): void {
    this.reset();
  }
}
