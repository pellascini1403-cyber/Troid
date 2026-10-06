import {
  DEFAULT_ICON_HEIGHT,
  DEFAULT_REACH,
  MAX_INTERACT_LOCK,
  REACH_HYSTERESIS,
  type InteractAction,
  type InteractableDef,
  type InteractionKind,
} from './Interactable';

/** What the system needs from the world: to read flags, to write them, and to hand out rewards. The session implements it. */
export interface InteractionHost {
  hasFlag(flag: string): boolean;
  setFlag(flag: string): void;
  clearFlag(flag: string): void;
  acquireCard(cardId: string): boolean;
  addBottleSlot(bottleId: string): boolean;
  /** The hero rests at the entry `entry` of the current room (it becomes their checkpoint). */
  checkpoint(entry: string): void;
}

/** What is announced about an interactable: the point its ICON is anchored to — the top of the object, world metres — and the key of its verb. */
export interface InteractionNotice {
  id: string;
  kind: InteractionKind;
  verbKey: string;
  x: number;
  y: number;
}

/** What the system tells the world; the session turns each into a gameplay event. */
export interface InteractionEvents {
  available(e: InteractionNotice): void;
  lost(e: { id: string }): void;
  performed(e: InteractionNotice): void;
}

/** How many ticks the hero is held in the `interact` pose after performing `def` (0 … 12). */
export function interactLock(def: Readonly<InteractableDef>): number {
  return Math.max(0, Math.min(MAX_INTERACT_LOCK, Math.floor(def.lock ?? MAX_INTERACT_LOCK)));
}

function noticeOf(d: Readonly<InteractableDef>): InteractionNotice {
  return { id: d.id, kind: d.kind, verbKey: d.verbKey, x: d.x, y: d.y + (d.iconHeight ?? DEFAULT_ICON_HEIGHT) };
}

/**
 * Chooses what the player can interact with and performs it (docs/GAME-SPEC-2D.md §12, ARCHITECTURE-2D §5.7). PURE and
 * deterministic: it reads a position and the world flags, and writes through the host.
 *
 * - **Choice:** among the objects that are AVAILABLE (their flags allow it) and within reach (1.6 m across, 1.2 m up and down by
 *   default) the NEAREST wins; a tie goes to the higher `priority`, then to the first in the room's list.
 * - **Hysteresis:** the object that has the icon keeps it until the player is 0.3 m beyond its reach, or until another object is
 *   clearly nearer (by more than 0.3 m), so the icon never flickers at the edge.
 * - **Events:** `available` when an object gets the icon, `lost` when it loses it (also when it stops being available, when the
 *   player cannot interact, or when the room changes), `performed` when its actions ran.
 *
 * It does not move the player, hold the control or draw anything: the controller decides WHEN a press may be accepted (and holds
 * the `interact` pose), the interface shows the icon from the events and the status.
 */
export class InteractionSystem {
  private defs: readonly InteractableDef[] = [];
  private chosen: InteractableDef | null = null;

  constructor(
    private readonly host: InteractionHost,
    private readonly events: InteractionEvents,
  ) {}

  /** The interactables of the room that was just built. The icon of the old room goes away. */
  setRoom(defs: readonly InteractableDef[]): void {
    this.drop();
    this.defs = defs;
  }

  /** The object that has the icon right now, if any. */
  get current(): Readonly<InteractableDef> | null {
    return this.chosen;
  }

  /** Do the flags let this object be used? (The world view hides a pickup that was taken.) */
  isAvailable(id: string): boolean {
    const d = this.defs.find((x) => x.id === id);
    return d !== undefined && this.allowed(d);
  }

  /**
   * One tick: `(x, y)` is where the player's feet are; `enabled` is false when he cannot interact at all (he is dead), which takes
   * the icon away.
   */
  update(x: number, y: number, enabled: boolean): void {
    const next = enabled ? this.choose(x, y) : null;
    const prev = this.chosen;
    if (next === prev) return;
    this.chosen = next;
    if (prev) this.events.lost({ id: prev.id });
    if (next) this.events.available(noticeOf(next));
  }

  /** The player pressed Interact (or tapped the icon) while the object has the icon: its actions run, in order. Null when nothing has it. */
  perform(): Readonly<InteractableDef> | null {
    const d = this.chosen;
    if (!d || !this.allowed(d)) return null;
    for (const a of d.actions) this.apply(a);
    this.events.performed(noticeOf(d));
    return d;
  }

  /** The icon of `chosen` as the interface needs it (world metres), or null. */
  notice(): InteractionNotice | null {
    return this.chosen ? noticeOf(this.chosen) : null;
  }

  private drop(): void {
    const prev = this.chosen;
    this.chosen = null;
    if (prev) this.events.lost({ id: prev.id });
  }

  private allowed(d: Readonly<InteractableDef>): boolean {
    if (d.whenSet !== undefined && !this.host.hasFlag(d.whenSet)) return false;
    if (d.whenClear !== undefined && this.host.hasFlag(d.whenClear)) return false;
    return true;
  }

  private choose(x: number, y: number): InteractableDef | null {
    const within = (d: Readonly<InteractableDef>, extra: number): boolean => {
      const r = d.reach ?? DEFAULT_REACH;
      return Math.abs(x - d.x) <= r.x + extra && Math.abs(y - d.y) <= r.y + extra;
    };
    const dist = (d: Readonly<InteractableDef>): number => Math.hypot(x - d.x, y - d.y);

    let best: InteractableDef | null = null;
    for (const d of this.defs) {
      if (!this.allowed(d) || !within(d, 0)) continue;
      if (!best) {
        best = d;
        continue;
      }
      const nearer = dist(d) - dist(best);
      if (nearer < -1e-9 || (Math.abs(nearer) <= 1e-9 && (d.priority ?? 0) > (best.priority ?? 0))) best = d;
    }

    const cur = this.chosen;
    if (cur && this.allowed(cur) && within(cur, REACH_HYSTERESIS)) {
      // it keeps the icon, unless something else is clearly nearer
      return best && best !== cur && dist(best) + REACH_HYSTERESIS < dist(cur) ? best : cur;
    }
    return best;
  }

  private apply(a: InteractAction): void {
    switch (a.type) {
      case 'acquireCard':
        this.host.acquireCard(a.cardId);
        break;
      case 'addBottleSlot':
        this.host.addBottleSlot(a.bottleId);
        break;
      case 'setFlag':
        this.host.setFlag(a.flag);
        break;
      case 'clearFlag':
        this.host.clearFlag(a.flag);
        break;
      case 'checkpoint':
        this.host.checkpoint(a.entry);
        break;
      default: {
        const never: never = a;
        throw new Error(`unknown interaction action ${JSON.stringify(never)}`);
      }
    }
  }
}
