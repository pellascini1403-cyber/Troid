import type { Translator } from '@/i18n';
import { PALETTE, cssHex } from '@/presentation/palette';
import { NO_INSETS, type Disc, type Insets, type TouchLayout } from '../touch/layout';
import type { BossBarState } from './BossBarModel';
import { computeBossBarLayout, type Box0 } from './bossBarLayout';

/** The square a button's touch area fits in: where a finger would be, and where the bar must not. */
const areaOf = (d: Disc): Box0 => ({ x0: d.cx - d.hit / 2, y0: d.cy - d.hit / 2, x1: d.cx + d.hit / 2, y1: d.cy + d.hit / 2 });

/**
 * The boss's bar (DOM, docs/PROMPT6-LOG.md S29): the name of the guardian and a violet bar of its health at the bottom centre of the screen — the
 * place the touch controls leave free (S31: and where they do not, the bar moves aside; `bossBarLayout.ts`) — with the white trail of the last blow
 * behind it. It is `pointer-events: none` (it never catches a finger), only touches the DOM when a value changed, and the only text it has is the
 * boss's name, from the catalogs, in the language of the player.
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
      position: 'absolute', boxSizing: 'border-box', display: 'none', opacity: '0', pointerEvents: 'none', zIndex: '24', userSelect: 'none',
    });
    // until the game says where (`place`), the bar is where it is on a window without buttons or insets: the bottom centre
    this.place(parent.clientWidth || (doc.defaultView?.innerWidth ?? 0), parent.clientHeight || (doc.defaultView?.innerHeight ?? 0), NO_INSETS);
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

  /**
   * Puts the bar where `computeBossBarLayout` says for a window of `width × height` px with the given safe area, keeping clear of the touch buttons
   * (`touch` is their layout; `null` where there are none — a keyboard). All four count even when one is not on screen at the moment (the Ability button
   * exists only with a card, the chip only when a bottle would help): a bar that moved when they come and go would be a bar that jumps in the middle of a fight.
   * Called by the game on every layout (a resize, a setting that moves the buttons); only writes to the DOM when the box changed.
   */
  place(width: number, height: number, insets: Readonly<Insets>, touch: Readonly<Pick<TouchLayout, 'attack' | 'dash' | 'ability' | 'chip'>> | null = null): void {
    const b = computeBossBarLayout(width, height, insets, touch ? [touch.attack, touch.dash, touch.ability, touch.chip].map(areaOf) : []);
    if (!this.set('place', `${b.x}|${b.y}|${b.width}|${b.height}`)) return;
    Object.assign(this.root.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` });
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
