import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { createIndicatorState, stepIndicator, type ArrivalIndicatorInput, type ArrivalIndicatorState } from './arrivalIndicatorModel';

const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/** Width of the travelling light, as a share of the line. */
const LIGHT = 0.28;

/**
 * The loading indicator (DOM, docs/PROMPT13-LOG.md): a hairline of cyan light with a small number beside it, under the black of a change of zone whose art is taking its time. It does not exist
 * for a change that is ready at once (the model keeps it away until the wait has lasted a moment). The words come from the translator; the number is the real share of what is arriving, and when
 * that cannot be measured a light travels along the line and no number is written. `pointer-events: none` and above the defeat screen: it never blocks input and a defeat's black cannot hide it.
 */
export class ArrivalIndicator {
  readonly root: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly lit: HTMLDivElement;
  private readonly light: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly state: ArrivalIndicatorState = createIndicatorState();
  private readonly last = { opacity: -1, fill: -2 as number | null, sweep: -1, percent: -2 as number | null };
  private reduced = false;
  private ever = false;
  private readonly off: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    this.root = doc.createElement('div');
    this.root.dataset['testid'] = 'arrival-indicator';
    this.root.setAttribute('role', 'progressbar');
    this.root.setAttribute('aria-valuemin', '0');
    this.root.setAttribute('aria-valuemax', '100');
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: 'calc(var(--safe-bottom-px, env(safe-area-inset-bottom, 0px)) + clamp(28px, 9vh, 76px))',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      opacity: '0',
      pointerEvents: 'none',
      userSelect: 'none',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      zIndex: '41', // above the defeat screen (40): a respawn into a room that is still loading shows it too
    });
    // the line: a faint rail, the lit part of it with its glow, and the light that travels when the load cannot be measured (clipped to the rail)
    this.line = doc.createElement('div');
    Object.assign(this.line.style, { position: 'relative', width: 'min(46vw, 280px)', height: '2px', borderRadius: '2px', background: rgba(PALETTE.energyGlow, 0.14) });
    this.lit = doc.createElement('div');
    Object.assign(this.lit.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: '2px',
      transformOrigin: '0 50%',
      transform: 'scaleX(0)',
      background: `linear-gradient(90deg, ${cssHex(PALETTE.energyMid)}, ${cssHex(PALETTE.energyCore)} 65%, ${cssHex(PALETTE.whiteHot)})`,
      boxShadow: `0 0 10px ${rgba(PALETTE.energyCore, 0.65)}`,
    });
    const clip = doc.createElement('div');
    Object.assign(clip.style, { position: 'absolute', inset: '0', overflow: 'hidden', borderRadius: '2px' });
    this.light = doc.createElement('div');
    Object.assign(this.light.style, {
      position: 'absolute',
      top: '0',
      bottom: '0',
      width: `${LIGHT * 100}%`,
      display: 'none',
      background: `linear-gradient(90deg, transparent, ${cssHex(PALETTE.energyCore)}, ${cssHex(PALETTE.whiteHot)}, ${cssHex(PALETTE.energyCore)}, transparent)`,
      boxShadow: `0 0 8px ${rgba(PALETTE.energyCore, 0.6)}`,
    });
    clip.append(this.light);
    this.line.append(this.lit, clip);
    this.label = doc.createElement('div');
    this.label.dataset['testid'] = 'arrival-label';
    Object.assign(this.label.style, {
      fontSize: '11px',
      letterSpacing: '0.26em',
      textTransform: 'uppercase',
      fontVariantNumeric: 'tabular-nums',
      color: rgba(PALETTE.whiteHot, 0.62),
      textShadow: `0 0 12px ${rgba(PALETTE.energyCore, 0.45)}`,
    });
    this.root.append(this.line, this.label);
    parent.appendChild(this.root);
    this.refreshText();
    this.off.push(translator.changed.subscribe(() => this.refreshText()));
    // a person who asked for less motion gets a light that stands still
    const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = query?.matches ?? false;
    if (query && typeof query.addEventListener === 'function') {
      const onChange = (e: MediaQueryListEvent): void => void (this.reduced = e.matches);
      query.addEventListener('change', onChange);
      this.off.push(() => query.removeEventListener('change', onChange));
    }
  }

  /** The indicator has been on screen at some point (the tests read it: a change of zone that was ready at once must leave this `false`). */
  get everShown(): boolean {
    return this.ever;
  }

  /** What the indicator shows right now. */
  get current(): Readonly<ArrivalIndicatorState> {
    return this.state;
  }

  /** Once per frame. `dt` is real seconds. */
  update(dt: number, input: ArrivalIndicatorInput): void {
    const s = stepIndicator(this.state, input, dt, this.reduced);
    const l = this.last;
    const shown = s.opacity > 0;
    if (shown !== l.opacity > 0) this.root.style.display = shown ? 'flex' : 'none';
    if (!shown) {
      l.opacity = 0;
      return;
    }
    if (s.opacity > 0.05) this.ever = true;
    if (Math.abs(s.opacity - l.opacity) > 0.004) {
      this.root.style.opacity = s.opacity.toFixed(3);
      l.opacity = s.opacity;
    }
    if (s.fill !== l.fill && (s.fill === null || l.fill === null || Math.abs(s.fill - l.fill) > 0.002)) {
      this.lit.style.transform = `scaleX(${(s.fill ?? 0).toFixed(4)})`;
      this.light.style.display = s.fill === null ? 'block' : 'none';
      l.fill = s.fill;
    }
    if (s.fill === null && Math.abs(s.sweep - l.sweep) > 0.002) {
      // the light enters at one end and leaves at the other
      this.light.style.left = `${(-LIGHT + s.sweep * (1 + LIGHT)) * 100}%`;
      l.sweep = s.sweep;
    }
    if (s.percent !== l.percent) {
      this.refreshText();
      l.percent = s.percent;
    }
  }

  dispose(): void {
    for (const off of this.off.splice(0)) off();
    this.root.remove();
  }

  private refreshText(): void {
    const word = this.translator.t('arrival.loading');
    const p = this.state.percent;
    this.root.setAttribute('aria-label', word);
    if (p === null) this.root.removeAttribute('aria-valuenow');
    else this.root.setAttribute('aria-valuenow', String(p));
    // the number is the real share, written the way the language writes a percentage; with none, the word
    this.label.textContent = p === null ? word : new Intl.NumberFormat(this.translator.locale, { style: 'percent', maximumFractionDigits: 0 }).format(p / 100);
  }
}
