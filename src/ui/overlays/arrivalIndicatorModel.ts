import { ARRIVAL } from '@/presentation/arrival';

/** Seconds the indicator takes to come in and to go, how many times per second the line closes on the measured share, and the seconds one pass of the travelling light takes. */
export const INDICATOR = { fadeIn: 0.3, fadeOut: 0.2, catchUp: 8, sweepPeriod: 1.6 } as const;

/** What the loading indicator is told each frame. */
export interface ArrivalIndicatorInput {
  /** The world is held for a room whose art is still on its way. */
  waiting: boolean;
  /** Milliseconds it has been held. */
  waited: number;
  /** 0 … 1 as measured on the transfers, or `null` when it cannot be measured. */
  progress: number | null;
}

/** What the indicator shows in one frame. Plain numbers: the DOM view only applies them. */
export interface ArrivalIndicatorState {
  /** Opacity of the whole indicator (0: hidden, and it costs nothing). */
  opacity: number;
  /** The share of the line that is lit, or `null` when the load cannot be measured: a light travels along the line instead, which says "waiting" and nothing more. */
  fill: number | null;
  /** Where the travelling light is (0 … 1 along the line). */
  sweep: number;
  /** The whole number written beside the line, or `null`. Never 100 while it is still waiting: the last stretch is the room being put together. */
  percent: number | null;
  /** The highest share measured so far in this wait: the line never goes back. */
  peak: number;
}

export const createIndicatorState = (): ArrivalIndicatorState => ({ opacity: 0, fill: null, sweep: 0, percent: null, peak: 0 });

/**
 * The loading indicator as a PURE function of what the arrival says (docs/PROMPT13-LOG.md): nothing at all until the wait has lasted `ARRIVAL.graceMs` — a change of zone that is ready at once
 * shows no screen of loading — then a hairline of cyan light appears beneath the black. If the transfers say how big they are it fills, never backward, with the real share beside it; if they do
 * not, a light travels along it instead and no number is written. With reduced motion the light stands still.
 */
export function stepIndicator(s: ArrivalIndicatorState, input: ArrivalIndicatorInput, dt: number, reducedMotion = false): ArrivalIndicatorState {
  const want = input.waiting && input.waited >= ARRIVAL.graceMs;
  const target = want ? 1 : 0;
  const rate = Math.max(0, dt) / (want ? INDICATOR.fadeIn : INDICATOR.fadeOut);
  s.opacity = target > s.opacity ? Math.min(target, s.opacity + rate) : Math.max(target, s.opacity - rate);

  if (!input.waiting && s.opacity === 0) {
    // the wait is over and the line has gone: the next one starts from nothing
    s.fill = null;
    s.percent = null;
    s.peak = 0;
    s.sweep = 0;
    return s;
  }
  if (input.progress !== null) {
    s.peak = Math.max(s.peak, Math.min(1, Math.max(0, input.progress)));
    const k = 1 - Math.exp(-INDICATOR.catchUp * Math.max(0, dt));
    s.fill = (s.fill ?? 0) + (s.peak - (s.fill ?? 0)) * k;
  }
  s.percent = s.fill === null ? null : Math.min(99, Math.floor(s.fill * 100));
  s.sweep = reducedMotion ? 0.5 : (s.sweep + Math.max(0, dt) / INDICATOR.sweepPeriod) % 1;
  return s;
}
