import type { TransitionSnapshot } from '@/gameplay/RoomTransition';
import { transitionOpacity } from './transitionOverlayModel';

/**
 * The room-transition overlay (DOM): a black screen that follows the transition's snapshot. It has no text (so nothing to
 * translate), only touches the DOM when a value changed, and is `pointer-events: none`: it never blocks input. It sits under the
 * defeat overlay (a defeat in the middle of a transition covers everything).
 */
export class TransitionOverlay {
  readonly root: HTMLDivElement;
  private shown = false;
  private opacity = -1;

  constructor(parent: HTMLElement) {
    this.root = parent.ownerDocument.createElement('div');
    this.root.dataset['testid'] = 'transition-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, { position: 'absolute', inset: '0', display: 'none', background: '#000', opacity: '0', pointerEvents: 'none', zIndex: '38' });
    parent.appendChild(this.root);
  }

  /** Once per frame with the transition's snapshot. */
  update(snapshot: TransitionSnapshot): void {
    const opacity = transitionOpacity(snapshot);
    const show = snapshot.phase !== 'none';
    if (show !== this.shown) {
      this.root.style.display = show ? 'block' : 'none';
      this.shown = show;
    }
    if (show && Math.abs(opacity - this.opacity) > 0.004) {
      this.root.style.opacity = opacity.toFixed(3);
      this.opacity = opacity;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
