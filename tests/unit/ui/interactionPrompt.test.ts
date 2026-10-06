// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { InteractionPrompt, type PromptPointerSink, type PromptState } from '@/ui/prompt/InteractionPrompt';

/**
 * The interaction icon as DOM (docs/GAME-SPEC-2D.md §12): it exists only over an object that has it, it is a button only then,
 * it names its verb through the translator in both languages, it carries the key of the device in use, it stays inside the usable
 * screen, it writes to the DOM only when something changed, and a finger on it reaches the touch source.
 */
const q = (root: ParentNode, id: string): HTMLElement => root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

const state = (patch: Partial<PromptState> = {}): PromptState => ({
  active: true, id: 'card_spirit_bolt', kind: 'pickup', verbKey: 'interact.pickUp', x: 400, y: 200, glyph: '', ...patch,
});

describe('interaction prompt', () => {
  let host: HTMLDivElement;
  let prompt: InteractionPrompt;
  let downs: Array<[number, number, number]>;
  let ups: number[];
  const tr = createTranslator(CATALOGS, 'es');
  const sink: PromptPointerSink = {
    down: (id, x, y) => {
      downs.push([id, x, y]);
      return true;
    },
    up: (id) => void ups.push(id),
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    downs = [];
    ups = [];
    prompt = new InteractionPrompt(host, tr, sink);
    prompt.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
  });
  afterEach(() => {
    prompt.dispose();
    tr.setLocale('es');
  });

  it('is not there when nothing can be interacted with: invisible, and it does not catch a finger', () => {
    prompt.update(state({ active: false }));
    const hit = q(host, 'prompt-hit');
    expect(hit.dataset['active']).toBe('0');
    expect(getComputedStyle(hit).pointerEvents).toBe('none');
    expect(host.textContent?.trim()).toBe('');
    expect(host.querySelector('svg')).toBeNull(); // no icon is even built until there is something to show
  });

  it('shows over the object: active, with the icon of its kind, and it is a button', () => {
    prompt.update(state());
    const hit = q(host, 'prompt-hit');
    expect(hit.dataset['active']).toBe('1');
    expect(hit.dataset['kind']).toBe('pickup');
    expect(hit.dataset['object']).toBe('card_spirit_bolt');
    expect(hit.getAttribute('role')).toBe('button');
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(getComputedStyle(hit).pointerEvents).toBe('auto');
  });

  it('a lever has its own icon, and another object replaces the icon rather than adding one', () => {
    prompt.update(state());
    const pickup = host.querySelector('svg')!.innerHTML;
    prompt.update(state({ id: 'lever', kind: 'activate', verbKey: 'interact.activate' }));
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(host.querySelector('svg')!.innerHTML).not.toBe(pickup);
    expect(q(host, 'prompt-hit').dataset['object']).toBe('lever');
  });

  it('is DOM and holds no text of its own: the verb is its accessible name, in the language of the player', () => {
    prompt.update(state());
    expect(host.textContent?.trim()).toBe('');
    const hit = q(host, 'prompt-hit');
    expect(hit.getAttribute('aria-label')).toBe('Recoger');
    tr.setLocale('en');
    expect(hit.getAttribute('aria-label')).toBe('Pick up');
    prompt.update(state({ id: 'lever', kind: 'activate', verbKey: 'interact.activate' }));
    expect(hit.getAttribute('aria-label')).toBe('Activate');
    tr.setLocale('es');
    expect(hit.getAttribute('aria-label')).toBe('Activar');
  });

  it('carries the key or button of the device in use as a badge, and none on touch', () => {
    prompt.update(state({ glyph: 'E' }));
    expect(q(host, 'prompt-glyph').textContent).toBe('E');
    prompt.update(state({ glyph: 'LT' }));
    expect(q(host, 'prompt-glyph').textContent).toBe('LT');
    prompt.update(state({ glyph: '' }));
    expect(q(host, 'prompt-glyph').textContent).toBe('');
  });

  it('floats just above the point it is given (the top of the object): centred on it and 34 px up, and moves with it', () => {
    prompt.update(state({ x: 400, y: 200 }));
    const hit = q(host, 'prompt-hit');
    expect(hit.style.transform).toBe('translate(370px, 136px)'); // 60 px wide: its centre is at (400, 200 − 24 − 10)
    prompt.update(state({ x: 420, y: 180 }));
    expect(hit.style.transform).toBe('translate(390px, 116px)');
  });

  it('keeps the same gap, scaled, on a window whose controls are bigger — and the touch target grows with the icon', () => {
    prompt.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 1.5);
    prompt.update(state({ x: 400, y: 300 }));
    expect(q(host, 'prompt-hit').style.transform).toBe('translate(370px, 219px) scale(1.5)'); // centre at 300 − 34 × 1.5 = 249
  });

  it('never leaves the usable part of the screen: the safe area is respected on every side', () => {
    const insets = { top: 24, right: 47, bottom: 21, left: 47 };
    prompt.place(844, 390, insets);
    const at = (x: number, y: number): [number, number] => {
      prompt.update(state({ x, y }));
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(q(host, 'prompt-hit').style.transform)!;
      return [Number(m[1]) + 30, Number(m[2]) + 30]; // back to the centre
    };
    expect(at(-500, -500)).toEqual([47 + 30, 24 + 30]);
    expect(at(5000, 5000)).toEqual([844 - 47 - 30, 390 - 21 - 30]);
    expect(at(400, 200)).toEqual([400, 200 - 34]);
  });

  it('writes to the DOM only when something changed: an identical frame mutates nothing, a moved one only the position', () => {
    prompt.update(state());
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(host, { attributes: true, childList: true, subtree: true, characterData: true });
    prompt.update(state());
    expect(observer.takeRecords()).toHaveLength(0);
    prompt.update(state({ x: 410 }));
    const moved = observer.takeRecords();
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((r) => r.type === 'attributes' && r.attributeName === 'style')).toBe(true);
    observer.disconnect();
  });

  it('a finger on the icon reaches the touch source, and lifting (or cancelling) lets go', () => {
    prompt.update(state());
    const hit = q(host, 'prompt-hit');
    hit.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: 400, clientY: 200, bubbles: true, cancelable: true, pointerType: 'touch' }));
    expect(downs).toEqual([[5, 400, 200]]);
    expect(hit.dataset['pressed']).toBe('1');
    hit.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, bubbles: true, pointerType: 'touch' }));
    expect(ups).toEqual([5]);
    expect(hit.dataset['pressed']).toBe('0');
    hit.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, clientX: 1, clientY: 1, bubbles: true, cancelable: true, pointerType: 'touch' }));
    hit.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 6, bubbles: true }));
    expect(ups).toEqual([5, 6]);
  });

  it('a pointer that is not the one that holds the icon is ignored on release', () => {
    prompt.update(state());
    const hit = q(host, 'prompt-hit');
    hit.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, bubbles: true, cancelable: true }));
    hit.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }));
    expect(ups).toEqual([]);
  });

  it('when the icon goes away under a finger it lets go of it (no Interact press is kept for an icon that is not there)', () => {
    prompt.update(state());
    q(host, 'prompt-hit').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, bubbles: true, cancelable: true }));
    prompt.update(state({ active: false }));
    expect(ups).toEqual([5]);
    expect(q(host, 'prompt-hit').dataset['pressed']).toBe('0');
    prompt.update(state({ active: false }));
    expect(ups).toEqual([5]); // once
  });

  it('is above the HUD and below the overlays, and honours reduced motion', () => {
    const css = document.getElementById('troid-prompt-style')?.textContent ?? '';
    expect(css).toContain('z-index:26');
    expect(css).toContain('prefers-reduced-motion');
    expect(getComputedStyle(host.querySelector('.troid-prompt') as HTMLElement).pointerEvents).toBe('none');
  });

  it('dispose removes it and its listeners', () => {
    prompt.update(state());
    const hit = q(host, 'prompt-hit');
    prompt.dispose();
    hit.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    expect(downs).toEqual([]);
    expect(host.querySelector('.troid-prompt')).toBeNull();
  });
});
