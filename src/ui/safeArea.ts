import type { Insets } from './touch/layout';

/**
 * The parts of the screen the system uses (a notch, the Dynamic Island, the home indicator, rounded corners), read through
 * CSS `env(safe-area-inset-*)` with a probe element, so the HUD and the touch controls are placed by numbers that agree.
 *
 * `--safe-<side>-px` on `:root` overrides the `env()` value: how a test (or `?safe=top,right,bottom,left`) imitates a notch
 * in a browser that has none — the very same code path as a real phone.
 */
export class SafeArea {
  private readonly probe: HTMLDivElement;

  constructor(private readonly parent: HTMLElement) {
    const doc = parent.ownerDocument;
    this.probe = doc.createElement('div');
    this.probe.setAttribute('aria-hidden', 'true');
    this.probe.dataset['testid'] = 'safe-area-probe';
    Object.assign(this.probe.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
      paddingTop: 'var(--safe-top-px, env(safe-area-inset-top, 0px))',
      paddingRight: 'var(--safe-right-px, env(safe-area-inset-right, 0px))',
      paddingBottom: 'var(--safe-bottom-px, env(safe-area-inset-bottom, 0px))',
      paddingLeft: 'var(--safe-left-px, env(safe-area-inset-left, 0px))',
    });
    parent.appendChild(this.probe);
  }

  /** The insets right now, in CSS px (0 where the browser reports none). */
  read(): Insets {
    const view = this.parent.ownerDocument.defaultView;
    const cs = view ? view.getComputedStyle(this.probe) : null;
    const px = (v: string | undefined): number => {
      const n = v ? Number.parseFloat(v) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    return { top: px(cs?.paddingTop), right: px(cs?.paddingRight), bottom: px(cs?.paddingBottom), left: px(cs?.paddingLeft) };
  }

  dispose(): void {
    this.probe.remove();
  }
}

/** `?safe=44,47,21,47` (top, right, bottom, left, px): imitates a notch for tests and for looking at a layout on a desktop. */
export function applySafeOverride(root: HTMLElement, value: string | undefined): void {
  if (!value) return;
  const parts = value.split(',').map((p) => Number.parseFloat(p));
  const names = ['top', 'right', 'bottom', 'left'] as const;
  names.forEach((side, i) => {
    const n = parts[i];
    if (n !== undefined && Number.isFinite(n) && n >= 0) root.style.setProperty(`--safe-${side}-px`, `${n}px`);
  });
}
