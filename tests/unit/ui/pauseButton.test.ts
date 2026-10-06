// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseButton } from '@/ui/settings/PauseButton';

/**
 * The entry to the pause menu (docs/GAME-SPEC-2D.md §17): one small icon at the TOP CENTRE — never on the right, where Attack,
 * Dash and Ability are — inside the safe area, that never takes the keyboard focus, holds no text and is never a game press.
 */
describe('pause button', () => {
  let host: HTMLDivElement;
  let button: PauseButton;
  let presses: number;
  const tr = createTranslator(CATALOGS, 'es');

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    presses = 0;
    button = new PauseButton(host, tr, () => presses++);
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
  });
  afterEach(() => {
    button.dispose();
    tr.setLocale('es');
  });

  const centre = (): number => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(button.root.style.transform)!;
    return Number(m[1]) + 25; // 50 px wide
  };

  it('is one icon with no text of its own: its name is the translator\'s, in both languages', () => {
    expect(host.textContent?.trim()).toBe('');
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(button.root.getAttribute('aria-label')).toBe('Pausa y ajustes');
    tr.setLocale('en');
    expect(button.root.getAttribute('aria-label')).toBe('Pause and settings');
  });

  it('sits at the TOP CENTRE of the usable screen: centred between the left and right insets, below the top inset', () => {
    expect(centre()).toBe(422); // 844 / 2
    button.place(844, 390, { top: 24, right: 47, bottom: 21, left: 47 });
    expect(centre()).toBe(422);
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 94 }); // a notch on the left: the middle of what is usable moves
    expect(centre()).toBe(469);
    button.place(844, 390, { top: 24, right: 47, bottom: 21, left: 47 });
    expect(Number(/translate\(-?[\d.]+px, (-?[\d.]+)px\)/.exec(button.root.style.transform)![1])).toBeGreaterThanOrEqual(24);
  });

  it('is never on the right half of the screen, at any aspect ratio (4:3 … 21:9)', () => {
    for (const [w, h] of [[800, 600], [1280, 720], [844, 390], [1000, 430], [2520, 1080]] as const) {
      button.place(w, h, { top: 0, right: 0, bottom: 0, left: 0 });
      expect(Math.abs(centre() - w / 2), `${w}×${h}`).toBeLessThanOrEqual(1);
    }
  });

  it('a click presses it; it never takes the keyboard focus (a Space that jumps must not also click it)', () => {
    expect(button.root.tabIndex).toBe(-1);
    button.root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(presses).toBe(1);
    const down = new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true });
    button.root.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // no focus, no selection
    expect(button.root.dataset['pressed']).toBe('1');
    button.root.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(button.root.dataset['pressed']).toBe('0');
  });

  it('catches a finger (the interface layer lets everything through except what asks for it)', () => {
    expect(getComputedStyle(button.root).pointerEvents).toBe('auto');
  });

  it('is UI: a mouse click on it is never an attack', () => {
    expect(button.root.hasAttribute('data-ui-block')).toBe(true);
  });

  it('steps out of the way while the menu is open', () => {
    button.setHidden(true);
    expect(button.root.style.visibility).toBe('hidden');
    button.setHidden(false);
    expect(button.root.style.visibility).toBe('visible');
  });

  it('scales with the controls', () => {
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 1.4);
    expect(button.root.style.transform).toContain('scale(1.4)');
  });

  it('dispose removes it and its listeners', () => {
    button.dispose();
    button.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(presses).toBe(0);
    expect(host.querySelector('.troid-pause')).toBeNull();
  });
});
