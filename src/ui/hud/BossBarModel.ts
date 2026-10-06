/**
 * The boss's bar as a PURE model (docs/PROMPT6-LOG.md S29): what the interface shows of a fight, as plain numbers. The simulation tells it things
 * (a boss woke, it took a blow, it changed phase, it fell, the room was left); `update` moves its short transients in REAL time. It knows no DOM,
 * no Pixi and no entity — the same split as the HUD model.
 */
export interface BossBarState {
  /** Anything to draw at all (it is `false` before the fight and a moment after it). */
  visible: boolean;
  /** 0 → 1: how much of the bar is there (it fades in as the boss wakes and out after it has fallen). */
  appear: number;
  /** 0 … 1: the boss's health. */
  fraction: number;
  /** The white trail behind the bar: where the health WAS, easing down to `fraction` (a hit leaves it behind). */
  ghost: number;
  /** Text key of the boss's name. */
  nameKey: string;
  /** The second phase: the bar burns. */
  enraged: boolean;
  /** 1 → 0 over `FLASH_SECONDS` when the boss takes a blow. */
  flash: number;
}

export const APPEAR_SECONDS = 0.5;
export const FLASH_SECONDS = 0.18;
/** How fast the ghost eases down to the health (fractions per second). */
export const GHOST_RATE = 0.6;
/** Seconds the empty bar stays up after the boss has fallen, before it fades. */
export const LINGER_SECONDS = 1.4;

export class BossBarModel {
  readonly state: BossBarState = { visible: false, appear: 0, fraction: 1, ghost: 1, nameKey: '', enraged: false, flash: 0 };
  private target = 0;
  private linger = 0;

  /** A boss woke: the bar fades in, full. */
  start(nameKey: string, fraction = 1): void {
    const s = this.state;
    s.visible = true;
    s.nameKey = nameKey;
    s.fraction = s.ghost = Math.min(1, Math.max(0, fraction));
    s.enraged = false;
    s.flash = 0;
    this.target = 1;
    this.linger = 0;
  }

  /** The boss took a blow: `fraction` is what is left of it. */
  hit(fraction: number): void {
    const s = this.state;
    if (!s.visible) return;
    s.fraction = Math.min(1, Math.max(0, fraction));
    s.flash = 1;
  }

  /** The boss entered its second phase. */
  phase(): void {
    if (this.state.visible) this.state.enraged = true;
  }

  /** The boss fell: the bar empties, stays a moment and fades. */
  end(): void {
    if (!this.state.visible) return;
    this.state.fraction = 0;
    this.state.flash = 1;
    this.linger = LINGER_SECONDS;
  }

  /** The room was left or rebuilt (a defeat, a reload): nothing is shown any more, at once. */
  hide(): void {
    const s = this.state;
    s.visible = false;
    s.appear = 0;
    this.target = 0;
    this.linger = 0;
  }

  /** Once per rendered frame, in real seconds. */
  update(dt: number): Readonly<BossBarState> {
    const s = this.state;
    if (!s.visible) return s;
    const d = Math.max(0, dt);
    if (this.linger > 0) {
      this.linger -= d;
      if (this.linger <= 0) this.target = 0;
    }
    const step = d / APPEAR_SECONDS;
    s.appear = this.target > s.appear ? Math.min(this.target, s.appear + step) : Math.max(this.target, s.appear - step);
    if (s.appear === 0 && this.target === 0) s.visible = false;
    s.ghost = s.ghost > s.fraction ? Math.max(s.fraction, s.ghost - GHOST_RATE * d) : s.fraction;
    s.flash = Math.max(0, s.flash - d / FLASH_SECONDS);
    return s;
  }
}
