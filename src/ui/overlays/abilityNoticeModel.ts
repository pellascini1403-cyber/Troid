/**
 * WHAT THE PLAYER IS TOLD WHEN THEY LEARN SOMETHING (docs/PROMPT22-LOG.md §6): a hero who has just been given the Double Jump, the Wall Jump or the Ground Slam has nothing but a glow and a sound to say that it exists — and
 * the Ground Slam asks for a combination (down and attack, in the air) that nobody finds by chance. For a moment the page names what was learned and says how it is done on the device in use.
 * The model is only the clock of it: which one, for how long, and the ones that arrive while another is being read.
 */
export const ABILITY_NOTICE = {
  /** Seconds it stays, once in: long enough to read a name and a line. */
  hold: 7,
  /** Seconds it takes to come in and to go. */
  fade: { in: 0.25, out: 0.6 },
} as const;

export interface AbilityNoticeState {
  /** The ability being told (`null`: nothing). */
  id: string | null;
  /** 0 … 1. */
  opacity: number;
}

/**
 * A pure state machine. `update(dt, paused)` takes REAL seconds: while the game is held (the menu is open) the notice stands still — it neither fades nor runs out of time, so a player who opens the map the moment they pick
 * something up finds it still there. Two abilities in a row are told one after the other, never on top of each other; the same one twice is told once.
 */
export class AbilityNoticeModel {
  readonly state: AbilityNoticeState = { id: null, opacity: 0 };
  private readonly waiting: string[] = [];
  private left = 0;

  show(id: string): void {
    const s = this.state;
    if (s.id === id || this.waiting.includes(id)) return;
    if (s.id === null) {
      s.id = id;
      this.left = ABILITY_NOTICE.hold;
    } else this.waiting.push(id);
  }

  /** Advances by `dt` seconds (nothing while `paused`) and returns the state (the same object every time). */
  update(dt: number, paused = false): Readonly<AbilityNoticeState> {
    const s = this.state;
    if (s.id === null || paused) return s;
    const step = Math.max(0, dt);
    if (this.left > 0) {
      this.left = Math.max(0, this.left - step);
      s.opacity = Math.min(1, s.opacity + step / ABILITY_NOTICE.fade.in);
    } else {
      s.opacity = Math.max(0, s.opacity - step / ABILITY_NOTICE.fade.out);
      if (s.opacity === 0) {
        const next = this.waiting.shift();
        s.id = next ?? null;
        this.left = next === undefined ? 0 : ABILITY_NOTICE.hold;
      }
    }
    return s;
  }
}
