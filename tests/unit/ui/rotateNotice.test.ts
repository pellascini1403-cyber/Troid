// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTranslator, CATALOGS } from '@/i18n';
import { OVERLAY_CATALOGS } from '@/i18n/overlayCatalogs';
import { RotateNotice } from '@/ui/overlays/RotateNotice';

/**
 * THE LINE THAT ASKS THE PLAYER TO TURN THE DEVICE (docs/PROMPT20-LOG.md): it shows only where the page says so, never takes the keyboard focus, never stops the game, goes by itself when the device is turned, and a player who
 * chose to play on upright is left alone until the device has been turned and held upright again.
 */
describe('the notice that asks to turn the device', () => {
  let host: HTMLDivElement;
  let notice: RotateNotice;
  const tr = createTranslator(CATALOGS, 'es');
  for (const [lang, entries] of Object.entries(OVERLAY_CATALOGS)) tr.extend(lang, entries);

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    tr.setLocale('es');
    host = document.createElement('div');
    document.body.appendChild(host);
    notice = new RotateNotice(host, tr);
  });
  afterEach(() => notice.dispose());

  const el = (id: string): HTMLElement => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const press = (): void => {
    // a mouse press on the button: pointerdown / pointerup / click, the way a desktop browser makes it
    el('rotate-play').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  it('is closed until the page asks for it, a polite status line that no game key and no mouse click can reach', () => {
    expect(notice.isOpen).toBe(false);
    expect(el('rotate-notice').dataset['open']).toBe('0');
    expect(el('rotate-notice').getAttribute('role')).toBe('status');
    expect(el('rotate-notice').getAttribute('aria-live')).toBe('polite');
    expect('uiBlock' in el('rotate-notice').dataset, 'a mouse click on it is never an attack').toBe(true);
    expect(el('rotate-play').tabIndex, 'never focusable: the Space that jumps must not press it').toBe(-1);
  });

  it('shows when the page wants it and goes when the device is turned', () => {
    notice.want(true);
    expect(notice.isOpen).toBe(true);
    expect(el('rotate-notice').dataset['open']).toBe('1');
    notice.want(false);
    expect(notice.isOpen).toBe(false);
  });

  it('says it in the language in force, and follows a change of language', () => {
    notice.want(true);
    expect(el('rotate-text').textContent).toBe('Gira el dispositivo: el juego se juega en horizontal.');
    expect(el('rotate-play').textContent).toBe('Jugar así');
    tr.setLocale('en');
    expect(el('rotate-text').textContent).toBe('Turn your device: the game is played sideways.');
    expect(el('rotate-play').textContent).toBe('Play anyway');
  });

  it('"play anyway" closes it and keeps it closed while the window stays upright — however often the page asks again', () => {
    notice.want(true);
    press();
    expect(notice.isOpen).toBe(false);
    for (let i = 0; i < 5; i++) notice.want(true); // every resize of the window asks again
    expect(notice.isOpen, 'the choice stands').toBe(false);
  });

  it('…until the device has been turned and is held upright again: then it is worth saying once more', () => {
    notice.want(true);
    press();
    notice.want(false); // turned sideways
    expect(notice.isOpen).toBe(false);
    notice.want(true); // and upright again
    expect(notice.isOpen).toBe(true);
  });

  it('a finger lifted over the button presses it even where the browser makes no click (a thumb is on a button of the game)', () => {
    notice.want(true);
    const button = el('rotate-play');
    const at = { pointerId: 7, pointerType: 'touch', clientX: 0, clientY: 0, bubbles: true } as const;
    button.dispatchEvent(new PointerEvent('pointerdown', at));
    button.dispatchEvent(new PointerEvent('pointerup', at));
    expect(notice.isOpen).toBe(false);
  });

  it('a press on it is not heard by whatever listens to the pointer above it (the touch layer, the game)', () => {
    const heard: string[] = [];
    host.addEventListener('pointerdown', (e) => heard.push(`${e.type}@host`));
    notice.want(true);
    el('rotate-notice').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true }));
    expect(heard).toEqual([]);
  });

  it('hangs under whatever is at the top (the HUD), and further down when the controls are larger', () => {
    notice.place(0, 1);
    expect(el('rotate-notice').style.top).toBe('8px');
    notice.place(110, 1);
    expect(el('rotate-notice').style.top).toBe('118px');
    notice.place(110, 1.5);
    expect(el('rotate-notice').style.top).toBe('122px');
  });

  it('is gone when disposed, and a second one built after it is the only one on the page', () => {
    notice.dispose();
    expect(host.querySelector('[data-testid="rotate-notice"]')).toBeNull();
    notice = new RotateNotice(host, tr);
    expect(host.querySelectorAll('[data-testid="rotate-notice"]').length).toBe(1);
    expect(document.head.querySelectorAll('#troid-rotate-style').length, 'its stylesheet is added once').toBe(1);
  });
});
