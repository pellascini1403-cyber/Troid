import { DisposableStore } from '@/core/lifecycle';
import { listen } from '@/app/dom';
import type { DebugActions } from './DebugActions';
import type { DebugFlags, DebugState } from './DebugState';
import type { FpsMeter } from './FpsMeter';
import { createTuningInspector } from './TuningInspector';

export interface TuningTarget {
  title: string;
  target: object;
  onChange?: () => void;
}

export interface DebugPanelDeps {
  state: DebugState;
  actions: DebugActions;
  fps: FpsMeter;
  /** Text shown at the top of the panel (player position, state…). Called ~8×/s while visible. */
  readout: () => string;
  tuning: TuningTarget[];
  /** Runs one simulation tick while paused. */
  step: () => void;
}

const TOGGLES: Array<[keyof DebugFlags, string]> = [
  ['colliders', 'colliders'],
  ['hitboxes', 'hitboxes'],
  ['fps', 'FPS'],
  ['godMode', 'god mode'],
  ['paused', 'pause'],
];

/**
 * Developer panel. Hidden during normal play; shown with ` (backtick), `?debug=1` or a four-tap on the top-left corner.
 * It is a pure view over DebugState / DebugActions: it owns no game logic, so deleting it changes nothing else.
 */
export class DebugPanel {
  private readonly store = new DisposableStore();
  private readonly root = document.createElement('div');
  private readonly readout = document.createElement('pre');
  private readonly fpsBadge = document.createElement('div');
  private readonly checks = new Map<keyof DebugFlags, HTMLInputElement>();
  private readonly actionsHost = document.createElement('div');
  private lastReadout = 0;

  constructor(
    parent: HTMLElement,
    private readonly deps: DebugPanelDeps,
  ) {
    const r = this.root;
    r.setAttribute('data-ui-block', '');
    r.style.cssText =
      'position:absolute;right:8px;top:8px;width:min(310px,46vw);max-height:92vh;overflow:auto;pointer-events:auto;' +
      'font:11px/1.35 ui-monospace,Menlo,monospace;color:#e8f0e0;background:rgba(8,10,8,.78);padding:8px 10px;' +
      'border-radius:6px;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(3px);z-index:50;display:none';
    r.append(this.title('DEBUG'), this.readout);
    this.readout.style.cssText = 'margin:4px 0 6px;white-space:pre-wrap;color:#b9f0a6';

    const toggles = document.createElement('div');
    toggles.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 10px';
    for (const [key, label] of TOGGLES) {
      const l = document.createElement('label');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.addEventListener('change', () => deps.state.set(key, c.checked as never));
      l.append(c, ` ${label}`);
      toggles.appendChild(l);
      this.checks.set(key, c);
    }
    r.appendChild(toggles);

    const speed = document.createElement('label');
    speed.style.cssText = 'display:grid;grid-template-columns:auto 1fr 36px;gap:6px;align-items:center;margin:6px 0';
    const speedOut = document.createElement('span');
    const speedIn = document.createElement('input');
    speedIn.type = 'range';
    speedIn.min = '0.05';
    speedIn.max = '2';
    speedIn.step = '0.05';
    speedIn.value = '1';
    speedIn.addEventListener('input', () => {
      deps.state.set('timeScale', Number(speedIn.value));
      speedOut.textContent = `${Number(speedIn.value).toFixed(2)}×`;
    });
    speedOut.textContent = '1.00×';
    speed.append('speed', speedIn, speedOut);
    r.appendChild(speed);

    const stepBtn = this.button('step 1 tick', () => deps.step());
    r.appendChild(stepBtn);
    r.appendChild(this.actionsHost);
    for (const t of deps.tuning) r.appendChild(createTuningInspector(t.target, `tuning · ${t.title}`, t.onChange));

    this.fpsBadge.style.cssText =
      'position:absolute;left:8px;top:8px;pointer-events:none;font:700 11px ui-monospace,monospace;color:#fff;' +
      'background:rgba(0,0,0,.55);padding:2px 6px;border-radius:3px;display:none;z-index:50';
    parent.append(r, this.fpsBadge);

    this.store.add(
      deps.state.changed.on('change', () => this.syncFromState()),
    );
    // Hidden touch gesture: four quick taps on the top-left corner toggle the panel.
    let taps = 0;
    let first = 0;
    listen(this.store, window, 'pointerdown', (e) => {
      if (e.clientX > 70 || e.clientY > 70) return;
      const now = performance.now();
      if (now - first > 1500) taps = 0;
      if (taps === 0) first = now;
      if (++taps >= 4) {
        taps = 0;
        deps.state.toggle('panel');
      }
    });
    this.store.add(() => {
      r.remove();
      this.fpsBadge.remove();
    });
    this.syncFromState();
  }

  /** Call once per rendered frame (cheap: it throttles itself). */
  update(now: number): void {
    const s = this.deps.state;
    if (s.get('fps')) {
      const f = this.deps.fps;
      this.fpsBadge.textContent = `${f.fps.toFixed(0)} fps · ${f.frameMs.toFixed(1)} ms (worst ${f.worstMs.toFixed(0)})`;
    }
    if (!s.get('panel') || now - this.lastReadout < 120) return;
    this.lastReadout = now;
    this.readout.textContent = this.deps.readout();
    this.refreshActions();
  }

  dispose(): void {
    this.store.dispose();
  }

  private syncFromState(): void {
    const s = this.deps.state;
    this.root.style.display = s.get('panel') ? 'block' : 'none';
    this.fpsBadge.style.display = s.get('fps') ? 'block' : 'none';
    for (const [key, el] of this.checks) el.checked = Boolean(s.get(key));
  }

  private actionsSignature = '';
  private refreshActions(): void {
    const list = this.deps.actions.list();
    const sig = list.map((a) => a.id).join('|');
    if (sig === this.actionsSignature) return;
    this.actionsSignature = sig;
    this.actionsHost.replaceChildren();
    const groups = new Map<string, HTMLElement>();
    for (const a of list) {
      let g = groups.get(a.group);
      if (!g) {
        g = document.createElement('div');
        g.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0';
        const t = document.createElement('div');
        t.textContent = a.group;
        t.style.cssText = 'width:100%;opacity:.65;margin-top:4px';
        g.appendChild(t);
        groups.set(a.group, g);
        this.actionsHost.appendChild(g);
      }
      g.appendChild(this.button(a.label, () => a.run()));
    }
  }

  private title(text: string): HTMLElement {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'font-weight:800;letter-spacing:.12em;opacity:.8';
    return t;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'font:inherit;color:#e8f0e0;background:#2a3a2a;border:1px solid #4d6a4d;border-radius:4px;padding:3px 7px;cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  }
}
