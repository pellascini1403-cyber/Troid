import type { DeathSnapshot } from '@/gameplay/DeathFlow';

/** What the defeat overlay shows in one frame. Plain numbers: the DOM view only applies them. */
export interface DeathOverlayState {
  /** Anything to draw at all (false → the overlay is hidden and costs nothing). */
  active: boolean;
  /** Opacity of the black screen, 0..1. */
  opacity: number;
  /** Opacity of the defeat title, 0..1. */
  titleOpacity: number;
  /** "Press any button" is shown (a press would skip the wait now). */
  hint: boolean;
}

export const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const HIDDEN: DeathOverlayState = { active: false, opacity: 0, titleOpacity: 0, hint: false };

/**
 * The defeat overlay as a PURE function of the flow's snapshot (docs/GAME-SPEC-2D.md §9.2): while the hero is dying
 * the world keeps playing; then it fades to black, the title appears over the black, and after the respawn the black
 * fades away. No text lives here: the title and the hint are translation keys applied by the view.
 */
export function deathOverlayState(s: DeathSnapshot, out: DeathOverlayState = { ...HIDDEN }): DeathOverlayState {
  const t = s.length > 0 ? s.ticks / s.length : 1;
  out.hint = false;
  switch (s.phase) {
    case 'none':
    case 'dying':
      out.active = false;
      out.opacity = 0;
      out.titleOpacity = 0;
      break;
    case 'fadeOut':
      out.active = true;
      out.opacity = smooth(t);
      out.titleOpacity = smooth((t - 0.55) / 0.45); // the title comes in over the last half of the fade
      break;
    case 'hold':
      out.active = true;
      out.opacity = 1;
      out.titleOpacity = 1;
      out.hint = s.canSkip;
      break;
    case 'fadeIn':
      out.active = true;
      out.opacity = 1 - smooth(t);
      out.titleOpacity = 1 - smooth(t * 2.5); // the title is gone before the picture is back
      break;
  }
  return out;
}
