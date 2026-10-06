import type { Page } from 'playwright-core';

/** What every E2E scenario receives. */
export interface Ctx {
  page: Page;
  /** Fresh load of the game at `?<query>` (hooks on). Resolves when the player model has loaded. */
  open(query?: string, size?: { width: number; height: number; dpr?: number; touch?: boolean }): Promise<void>;
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
  /** The body is the crouched size, and its current collision height in metres. */
  crouched?: boolean;
  bodyHeight?: number;
  /** 2D view only: combat. */
  health?: number;
  maxHealth?: number;
  hitStop?: number;
  now?: number;
  /** Camera shake trauma 0..1. */
  trauma?: number;
  /** Impacts that shook the camera, and the strength of the last one. */
  shakes?: { count: number; last: number };
  invulnerable?: boolean;
  blink?: boolean;
  flash?: number;
  combat?: { attack: string | null; phase: string; ticks: number; combo: number };
  dummies?: Array<{ id: string; x: number; y: number; vx: number; hp: number; hits: number }>;
  enemies?: Array<{
    id: string; def: string; state: string; ticks: number; x: number; y: number; vx: number; facing: number;
    hp: number; hits: number; anim: string; phase: string; phaseT: number; opacity: number;
  }>;
  /** 2D view only: the room, the world flags, each gate (open in the simulation, and how drawn: 1 closed → 0 gone) and the exits touched. */
  /** 2D view only: how many objects each scene layer holds (rebuilding a room must not grow any of them). */
  scene?: Record<string, number>;
  room?: string;
  flags?: string[];
  gates?: Record<string, { open: boolean; alpha: number | null }>;
  exits?: string[];
  views?: number;
  /** 2D view only: the defeat flow, the interface language and the respawn point. */
  death?: { phase: string; ticks: number; length: number; canSkip: boolean };
  lang?: string;
  /** 2D view only: the device the player used last (keyboard / touch / gamepad). */
  device?: string;
  respawnPoint?: { room: string; entry: string };
  /** 2D view only: VFX counters. */
  vfx?: { particles: number; sprites: number; spawned: number; dropped: number; peakParticles: number; poolCreated: number };
  /** 2D view only: median / worst GL draw calls per frame over the last 120 frames. */
  draws?: number;
  drawsMax?: number;
  /** 2D view only: viewport layout and canvas sizes. */
  view?: { contentWidth: number; contentHeight: number; ppm: number; resolution: number; visibleWidth: number; barX: number; barY: number; rotateDevice: boolean };
  canvas?: { cssWidth: number; cssHeight: number; width: number; height: number };
  /** 2D view only: the player's sprite (set, frame on screen, facing, anchors in world metres). */
  sprite?: {
    set: string;
    frame: string | null;
    facing: number;
    visible: boolean;
    hand: { x: number; y: number };
    grip: { x: number; y: number };
    tip: { x: number; y: number };
  };
  /** 2D view only: camera centre (world metres) and the visible height. */
  camera?: { x: number; y: number; viewHeight: number };
}

export interface Scenario {
  name: string;
  run(ctx: Ctx): Promise<void>;
}
