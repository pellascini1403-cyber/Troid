import type { DeathSnapshot } from '@/gameplay/DeathFlow';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { deathOverlayState, type DeathOverlayState } from './deathOverlayModel';

/**
 * The defeat overlay (DOM, docs/ARCHITECTURE-2D.md §8): a black screen with the localized title. It owns no text: it
 * asks the translator for `death.title` / `death.hint`, so changing language re-reads them. It only touches the DOM when
 * a value actually changed. `pointer-events: none`: it never blocks input.
 */
export class DeathOverlay {
  readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly state: DeathOverlayState = { active: false, opacity: 0, titleOpacity: 0, hint: false };
  private readonly last = { active: false, opacity: -1, titleOpacity: -1, hint: false };
  private readonly off: () => void;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    this.root = doc.createElement('div');
    this.root.dataset['testid'] = 'death-overlay';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.2rem',
      background: '#000',
      opacity: '0',
      pointerEvents: 'none',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      textAlign: 'center',
      padding: '0 1.5rem',
    });
    this.title = doc.createElement('div');
    this.title.dataset['testid'] = 'death-title';
    Object.assign(this.title.style, {
      fontSize: 'clamp(1.8rem, 6vw, 3.4rem)',
      fontWeight: '300',
      letterSpacing: '0.14em',
      color: cssHex(PALETTE.whiteHot),
      textShadow: `0 0 22px ${cssHex(PALETTE.energyCore)}99`,
      opacity: '0',
    });
    this.hint = doc.createElement('div');
    this.hint.dataset['testid'] = 'death-hint';
    Object.assign(this.hint.style, {
      fontSize: 'clamp(0.8rem, 2.2vw, 1.1rem)',
      color: cssHex(PALETTE.worldHaze),
      letterSpacing: '0.06em',
      opacity: '0',
    });
    this.root.append(this.title, this.hint);
    parent.appendChild(this.root);
    this.refreshText();
    this.off = translator.changed.subscribe(() => this.refreshText());
  }

  /** Once per frame with the flow's snapshot. */
  update(snapshot: DeathSnapshot): void {
    const s = deathOverlayState(snapshot, this.state);
    const l = this.last;
    if (s.active !== l.active) {
      this.root.style.display = s.active ? 'flex' : 'none';
      l.active = s.active;
    }
    if (!s.active) return;
    if (Math.abs(s.opacity - l.opacity) > 0.004) {
      this.root.style.opacity = s.opacity.toFixed(3);
      l.opacity = s.opacity;
    }
    if (Math.abs(s.titleOpacity - l.titleOpacity) > 0.004) {
      this.title.style.opacity = s.titleOpacity.toFixed(3);
      l.titleOpacity = s.titleOpacity;
    }
    if (s.hint !== l.hint) {
      this.hint.style.opacity = s.hint ? '1' : '0';
      l.hint = s.hint;
    }
  }

  dispose(): void {
    this.off();
    this.root.remove();
  }

  private refreshText(): void {
    this.title.textContent = this.translator.t('death.title');
    this.hint.textContent = this.translator.t('death.hint');
  }
}
