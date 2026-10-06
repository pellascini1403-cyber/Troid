import type { Translator } from '@/i18n';
import { PALETTE, cssHex } from '@/presentation/palette';
import type { BossBarState } from './BossBarModel';

/**
 * The boss's bar (DOM, docs/PROMPT6-LOG.md S29): the name of the guardian and a violet bar of its health at the bottom centre of the screen — the
 * place the touch controls leave free — with the white trail of the last blow behind it. It is `pointer-events: none` (it never catches a finger),
 * only touches the DOM when a value changed, and the only text it has is the boss's name, from the catalogs, in the language of the player.
 */
export class BossBarView {
  readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly ghost: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private last: Record<string, string | number | boolean> = {};

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    const el = (testid: string): HTMLDivElement => {
      const e = doc.createElement('div');
      e.dataset['testid'] = testid;
      return e;
    };
    this.root = el('boss-bar');
    this.root.setAttribute('role', 'progressbar');
    this.root.setAttribute('aria-valuemin', '0');
    this.root.setAttribute('aria-valuemax', '100');
    Object.assign(this.root.style, {
      position: 'absolute', left: '50%', bottom: 'max(18px, env(safe-area-inset-bottom))', width: 'min(46vw, 440px)', transform: 'translateX(-50%)',
      display: 'none', opacity: '0', pointerEvents: 'none', zIndex: '24', userSelect: 'none',
    });
    this.name = el('boss-bar-name');
    Object.assign(this.name.style, {
      font: '600 13px/1.2 system-ui, sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '5px',
      color: cssHex(PALETTE.violetGlow), textShadow: `0 0 8px ${cssHex(PALETTE.violetCore)}`,
    });
    const track = el('boss-bar-track');
    Object.assign(track.style, {
      position: 'relative', height: '9px', boxSizing: 'border-box', border: `1px solid ${cssHex(PALETTE.violetCore)}`, borderRadius: '2px',
      background: cssHex(PALETTE.uiPanel), overflow: 'hidden',
    });
    this.ghost = el('boss-bar-ghost');
    this.fill = el('boss-bar-fill');
    this.flash = el('boss-bar-flash');
    Object.assign(this.ghost.style, { position: 'absolute', inset: '0', transformOrigin: '0 50%', background: cssHex(PALETTE.whiteHot), opacity: '0.55' });
    Object.assign(this.fill.style, { position: 'absolute', inset: '0', transformOrigin: '0 50%', background: `linear-gradient(90deg, ${cssHex(PALETTE.violetDeep)}, ${cssHex(PALETTE.violetCore)})` });
    Object.assign(this.flash.style, { position: 'absolute', inset: '0', background: cssHex(PALETTE.whiteHot), opacity: '0' });
    track.append(this.ghost, this.fill, this.flash);
    this.root.append(this.name, track);
    parent.appendChild(this.root);
  }

  update(s: Readonly<BossBarState>): void {
    const show = s.visible && s.appear > 0.001;
    if (this.set('show', show)) this.root.style.display = show ? 'block' : 'none';
    if (!show) return;
    const opacity = Math.round(s.appear * 100) / 100;
    if (this.set('opacity', opacity)) this.root.style.opacity = String(opacity);
    const name = this.translator.t(s.nameKey);
    if (this.set('name', name)) {
      this.name.textContent = name;
      this.root.setAttribute('aria-label', name);
    }
    const f = Math.round(s.fraction * 400) / 400;
    if (this.set('fill', f)) {
      this.fill.style.transform = `scaleX(${f})`;
      this.root.setAttribute('aria-valuenow', String(Math.round(s.fraction * 100)));
    }
    const g = Math.round(s.ghost * 400) / 400;
    if (this.set('ghost', g)) this.ghost.style.transform = `scaleX(${g})`;
    if (this.set('enraged', s.enraged)) {
      this.root.dataset['enraged'] = s.enraged ? '1' : '0';
      this.fill.style.background = s.enraged
        ? `linear-gradient(90deg, ${cssHex(PALETTE.violetCore)}, ${cssHex(PALETTE.violetGlow)})`
        : `linear-gradient(90deg, ${cssHex(PALETTE.violetDeep)}, ${cssHex(PALETTE.violetCore)})`;
    }
    const flash = Math.round(s.flash * 20) / 20;
    if (this.set('flash', flash)) this.flash.style.opacity = String(flash * 0.7);
  }

  /** Records a value and says whether it changed: the DOM is only written when it did. */
  private set(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  dispose(): void {
    this.root.remove();
  }
}
