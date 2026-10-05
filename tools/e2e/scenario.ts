import type { Page } from 'playwright-core';

/** What every E2E scenario receives. */
export interface Ctx {
  page: Page;
  /** Fresh load of the game at `?<query>` (hooks on). Resolves when the player model has loaded. */
  open(query?: string, size?: { width: number; height: number; dpr?: number }): Promise<void>;
  shot(name: string): Promise<void>;
  /** Advances the simulation by `n` ticks with the CURRENT keyboard/mouse state. */
  step(n: number): Promise<void>;
  state(): Promise<GameState>;
  /** Places the player (and cuts the camera) at a world position. */
  teleport(x: number, y: number): Promise<void>;
  errors: string[];
  warnings: string[];
}

export interface GameState {
  x: number; y: number; vx: number; vy: number; grounded: boolean; anim: string; state: string;
  tick: number; fps: number; calls: number; triangles: number;
  /** 2D view only: median / worst GL draw calls per frame over the last 120 frames. */
  draws?: number;
  drawsMax?: number;
  /** 2D view only: viewport layout and canvas sizes. */
  view?: { contentWidth: number; contentHeight: number; ppm: number; resolution: number; visibleWidth: number; barX: number; barY: number; rotateDevice: boolean };
  canvas?: { cssWidth: number; cssHeight: number; width: number; height: number };
}

export interface Scenario {
  name: string;
  run(ctx: Ctx): Promise<void>;
}
