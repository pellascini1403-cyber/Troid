import { EventBus } from '@/core/events';

export interface DebugFlags {
  /** Panel visible. Off in normal play; toggled with ` (backtick), `?debug=1`, or a 4-tap on the top-left corner (touch). */
  panel: boolean;
  colliders: boolean;
  hitboxes: boolean;
  fps: boolean;
  godMode: boolean;
  /** Simulation paused (rendering continues). */
  paused: boolean;
  /** Simulation speed multiplier (slow-mo for inspecting frames). */
  timeScale: number;
}

export const DEFAULT_DEBUG_FLAGS: Readonly<DebugFlags> = {
  panel: false,
  colliders: false,
  hitboxes: false,
  fps: false,
  godMode: false,
  paused: false,
  timeScale: 1,
};

/** Debug switches. Plain data + a change event; nothing here touches the game, the views read it. */
export class DebugState {
  private flags: DebugFlags = { ...DEFAULT_DEBUG_FLAGS };
  readonly changed = new EventBus<{ change: { key: keyof DebugFlags; value: DebugFlags[keyof DebugFlags] } }>();

  get<K extends keyof DebugFlags>(key: K): DebugFlags[K] {
    return this.flags[key];
  }

  set<K extends keyof DebugFlags>(key: K, value: DebugFlags[K]): void {
    if (this.flags[key] === value) return;
    this.flags[key] = value;
    this.changed.emit('change', { key, value });
  }

  toggle(key: { [K in keyof DebugFlags]: DebugFlags[K] extends boolean ? K : never }[keyof DebugFlags]): void {
    this.set(key, !this.flags[key]);
  }

  snapshot(): Readonly<DebugFlags> {
    return { ...this.flags };
  }
}
