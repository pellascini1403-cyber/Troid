import type { TransitionSnapshot } from '@/gameplay/RoomTransition';
import { smooth } from './deathOverlayModel';

/**
 * How black the screen is during a room transition, as a PURE function of the transition's snapshot (docs/PROMPT6-LOG.md S23):
 * it fades to black on the room being left, stays black while the next one is built and the camera cuts to it, and fades back in.
 * 0 means nothing is drawn at all.
 */
export function transitionOpacity(s: TransitionSnapshot): number {
  const t = s.length > 0 ? s.ticks / s.length : 1;
  switch (s.phase) {
    case 'fadeOut':
      return smooth(t);
    case 'hold':
      return 1;
    case 'fadeIn':
      return 1 - smooth(t);
    default:
      return 0;
  }
}
