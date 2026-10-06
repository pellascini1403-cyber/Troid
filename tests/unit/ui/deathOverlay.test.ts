// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { DeathSnapshot } from '@/gameplay/DeathFlow';
import { CATALOGS } from '@/i18n/catalogs';
import { createTranslator } from '@/i18n/translator';
import { deathOverlayState } from '@/ui/overlays/deathOverlayModel';
import { DeathOverlay } from '@/ui/overlays/DeathOverlay';

const snap = (phase: DeathSnapshot['phase'], ticks: number, length: number, canSkip = false): DeathSnapshot => ({ phase, ticks, length, canSkip });

describe('deathOverlayState (a pure function of the flow)', () => {
  it('shows nothing while the hero is dying: the world keeps playing the death animation and the energy dispersal', () => {
    expect(deathOverlayState(snap('none', 0, 0)).active).toBe(false);
    expect(deathOverlayState(snap('dying', 40, 72))).toMatchObject({ active: false, opacity: 0, titleOpacity: 0 });
  });

  it('fades to black, with the title arriving over the last half of the fade', () => {
    const at = (t: number) => deathOverlayState(snap('fadeOut', t, 30));
    expect(at(0)).toMatchObject({ active: true, opacity: 0, titleOpacity: 0 });
    expect(at(15).opacity).toBeGreaterThan(0.3);
    expect(at(15).opacity).toBeLessThan(0.7);
    expect(at(15).titleOpacity).toBe(0); // not yet
    expect(at(30)).toMatchObject({ opacity: 1, titleOpacity: 1 });
    // monotonic
    let prev = -1;
    for (let t = 0; t <= 30; t++) {
      const o = at(t).opacity;
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it('holds on black with the title; the hint appears only when a press would skip the wait', () => {
    expect(deathOverlayState(snap('hold', 10, 60, false))).toEqual({ active: true, opacity: 1, titleOpacity: 1, hint: false });
    expect(deathOverlayState(snap('hold', 40, 60, true)).hint).toBe(true);
  });

  it('fades back in: the title is gone before the picture is back', () => {
    const at = (t: number) => deathOverlayState(snap('fadeIn', t, 30));
    expect(at(0)).toMatchObject({ opacity: 1, titleOpacity: 1 });
    expect(at(14).titleOpacity).toBe(0);
    expect(at(14).opacity).toBeGreaterThan(0.2);
    expect(at(30)).toMatchObject({ opacity: 0, titleOpacity: 0 });
    expect(at(30).hint).toBe(false);
  });

  it('survives a zero-length phase', () => {
    expect(() => deathOverlayState(snap('hold', 0, 0))).not.toThrow();
  });
});

describe('DeathOverlay (DOM)', () => {
  const make = (lang = 'es') => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const translator = createTranslator(CATALOGS, lang);
    const overlay = new DeathOverlay(host, translator);
    return { host, translator, overlay };
  };
  const title = (h: HTMLElement): string => h.querySelector('[data-testid=death-title]')!.textContent ?? '';

  it('starts hidden and never blocks the pointer', () => {
    const { overlay } = make();
    expect(overlay.root.style.display).toBe('none');
    expect(overlay.root.style.pointerEvents).toBe('none');
  });

  it('shows the localized title and hint from the catalog (es / en), never from the code', () => {
    const es = make('es');
    expect(title(es.host)).toBe(CATALOGS['es']!['death.title']);
    expect(title(es.host)).toBe('Has caído');
    const en = make('en');
    expect(title(en.host)).toBe('You fell');
  });

  it('re-reads its texts when the language changes at runtime (no reload)', () => {
    const { host, translator } = make('es');
    translator.setLocale('en');
    expect(title(host)).toBe('You fell');
    expect(host.querySelector('[data-testid=death-hint]')!.textContent).toBe(CATALOGS['en']!['death.hint']);
  });

  it('applies the flow to the DOM: hidden → fading → black with title → faded out', () => {
    const { overlay } = make();
    overlay.update(snap('dying', 10, 72));
    expect(overlay.root.style.display).toBe('none');
    overlay.update(snap('fadeOut', 30, 30));
    expect(overlay.root.style.display).toBe('flex');
    expect(Number(overlay.root.style.opacity)).toBeCloseTo(1, 2);
    overlay.update(snap('hold', 45, 60, true));
    const hint = overlay.root.querySelector<HTMLElement>('[data-testid=death-hint]')!;
    expect(hint.style.opacity).toBe('1');
    overlay.update(snap('fadeIn', 30, 30));
    overlay.update(snap('none', 0, 0));
    expect(overlay.root.style.display).toBe('none');
  });

  it('only touches the DOM when a value changed (no style writes for identical frames)', () => {
    const { overlay } = make();
    overlay.update(snap('hold', 10, 60));
    const observer = new MutationObserver(() => {});
    observer.observe(overlay.root, { attributes: true, subtree: true, characterData: true, childList: true });
    observer.takeRecords();
    for (let i = 0; i < 20; i++) overlay.update(snap('hold', 10 + i, 60)); // the same picture every frame
    expect(observer.takeRecords()).toHaveLength(0);
    overlay.update(snap('fadeIn', 5, 30)); // a real change is written
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });

  it('dispose removes the element and stops listening to the language', () => {
    const { host, translator, overlay } = make();
    overlay.dispose();
    expect(host.children).toHaveLength(0);
    expect(translator.changed.listenerCount).toBe(0);
  });
});
