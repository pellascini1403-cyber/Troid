/** What the player can be told about their saved game (docs/PROMPT14-LOG.md). The words are the interface's (`save.*` keys); this only says which one, and for how long. */
export type NoticeKind = 'saved' | 'failed' | 'recovered' | 'damaged' | 'unavailable' | 'conflict';

/**
 * Seconds each notice stays once it is in. A plain "saved" is a blink — it must never ask for attention in the middle of a fight — while what the player has to ACT on or know (the save did not
 * reach the storage, a game was recovered, one could not be read, nothing can be kept) stays long enough to read.
 */
export const NOTICE_HOLD: Readonly<Record<NoticeKind, number>> = { saved: 1.5, failed: 6, recovered: 6, damaged: 9, unavailable: 9, conflict: 14 };

/** Seconds it takes to come in and to go. */
export const NOTICE_FADE = { in: 0.18, out: 0.45 } as const;

export interface NoticeState {
  kind: NoticeKind | null;
  /** The saved game the notice is about (1 …). */
  slot: number;
  /** 0 … 1. */
  opacity: number;
}

const isWarning = (kind: NoticeKind): boolean => kind !== 'saved';

/**
 * The notice as a PURE state machine over real time (`dt` is the frame's: a notice goes on being read while the game is paused). A warning is never pushed out by a plain "saved" that arrives while it is
 * showing; a newer warning replaces an older one; a "saved" that follows a "saved" just starts its hold again.
 */
export class NoticeModel {
  readonly state: NoticeState = { kind: null, slot: 1, opacity: 0 };
  private left = 0;

  show(kind: NoticeKind, slot: number): void {
    const s = this.state;
    if (s.kind !== null && s.opacity > 0 && isWarning(s.kind) && !isWarning(kind)) return;
    s.kind = kind;
    s.slot = slot;
    this.left = NOTICE_HOLD[kind];
  }

  /** Advances by `dt` seconds and returns the state (the same object every time). */
  update(dt: number): Readonly<NoticeState> {
    const s = this.state;
    const step = Math.max(0, dt);
    if (s.kind === null) return s;
    if (this.left > 0) {
      this.left = Math.max(0, this.left - step);
      s.opacity = Math.min(1, s.opacity + step / NOTICE_FADE.in);
    } else {
      s.opacity = Math.max(0, s.opacity - step / NOTICE_FADE.out);
      if (s.opacity === 0) s.kind = null;
    }
    return s;
  }
}
