/**
 * Critterium — Pointer Interaction Force
 *
 * Attracts or repels particles near the pointer/touch position.
 * Works on both mouse (web) and touch (mobile).
 *
 * Core implementation — no DOM dependency. The app layer
 * feeds pointer position and active state via `setPosition()`.
 */

import { World, SpatialHashGrid, Force } from './index.js';

/** Pointer force parameters. */
export interface PointerParams {
  [key: string]: unknown;
  /** Force strength. Positive = attract, negative = repel. */
  strength: number;
  /** Maximum interaction radius. */
  radius: number;
  /** Falloff type: 'linear', 'inverse', 'constant'. */
  falloff: 'linear' | 'inverse' | 'constant';
}

/**
 * PointerForce: applies attract/repel force from a pointer/touch position.
 *
 * The app layer calls `setPosition(x, y, active)` on each pointer event.
 * When active, particles within `radius` receive a force toward/away from
 * the pointer based on `strength` and `falloff`.
 *
 * Zero allocations per step.
 */
export class PointerForce implements Force {
  readonly id = 'pointer';
  readonly params: PointerParams;

  private _px = 0;
  private _py = 0;
  private _active = false;

  constructor(
    strength: number = 200,
    radius: number = 150,
    falloff: 'linear' | 'inverse' | 'constant' = 'linear',
  ) {
    this.params = { strength, radius, falloff };
  }

  /** Update pointer/touch position and active state. */
  setPosition(x: number, y: number, active: boolean): void {
    this._px = x;
    this._py = y;
    this._active = active;
  }

  /** Whether the pointer is currently active (pressed/touching). */
  get active(): boolean {
    return this._active;
  }

  /** Current pointer x position. */
  get px(): number {
    return this._px;
  }

  /** Current pointer y position. */
  get py(): number {
    return this._py;
  }

  apply(world: World, _grid: SpatialHashGrid, dt: number): void {
    if (!this._active) return;

    const { x, y, vx, vy, count } = world;
    const { strength, radius, falloff } = this.params;
    const px = this._px;
    const py = this._py;
    const rSq = radius * radius;

    for (let i = 0; i < count; i++) {
      const dx = px - x[i];
      const dy = py - y[i];
      const distSq = dx * dx + dy * dy;

      if (distSq >= rSq || distSq < 0.001) continue;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;

      // Falloff
      const t = dist / radius;
      let falloffMult: number;
      switch (falloff) {
        case 'linear':
          falloffMult = 1 - t;
          break;
        case 'inverse':
          falloffMult = 1 / (t + 0.1);
          break;
        case 'constant':
          falloffMult = 1;
          break;
      }

      const force = strength * falloffMult;
      vx[i] += nx * force * dt;
      vy[i] += ny * force * dt;
    }
  }
}
