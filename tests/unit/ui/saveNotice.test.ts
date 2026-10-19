// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { NOTICE_FADE, NOTICE_HOLD, NoticeModel } from '@/ui/overlays/saveNoticeModel';
import { SaveNotice } from '@/ui/overlays/SaveNotice';

/**
 * WHAT BECAME OF THE SAVED GAME, TOLD DISCREETLY (docs/PROMPT14-LOG.md): "saved" is a blink that must never ask for attention in a fight; what the player has to know stays long enough to read, and is
 * never pushed out by a plain "saved". The model is pure and runs on real time; the view only applies it.
 */
describe('the notice model', () => {
  it('is nothing until something is shown, and then comes in, holds, and goes — and is nothing again', () => {
    const m = new NoticeModel();
    expect(m.update(1).kind).toBeNull();
    m.show('saved', 1);
    expect(m.update(0).opacity).toBe(0);
    expect(m.update(NOTICE_FADE.in / 2).opacity).toBeCloseTo(0.5, 5);
    expect(m.update(NOTICE_FADE.in).opacity).toBe(1);
    m.update(NOTICE_HOLD.saved);
    expect(m.update(0).kind).toBe('saved');
    expect(m.update(NOTICE_FADE.out / 2).opacity).toBeCloseTo(0.5, 5);
    expect(m.update(NOTICE_FADE.out).opacity).toBe(0);
    expect(m.state.kind).toBeNull();
  });

  it('a plain "saved" is shorter than anything the player has to know', () => {
    expect(NOTICE_HOLD.saved).toBeLessThan(2);
    for (const k of ['failed', 'recovered', 'damaged', 'unavailable'] as const) expect(NOTICE_HOLD[k], k).toBeGreaterThanOrEqual(6);
  });

  it('a warning is never pushed out by a "saved" that arrives while it shows; a newer warning replaces an older one; "saved" after "saved" starts its hold again', () => {
    const m = new NoticeModel();
    m.show('failed', 1);
    m.update(1);
    m.show('saved', 1);
    expect(m.state.kind).toBe('failed');
    m.show('damaged', 2);
    expect(m.state).toMatchObject({ kind: 'damaged', slot: 2 });
    const s = new NoticeModel();
    s.show('saved', 1);
    s.update(1);
    s.show('saved', 1);
    s.update(NOTICE_HOLD.saved - 0.1);
    expect(s.state.kind, 'the second one started the hold again').toBe('saved');
    expect(s.state.opacity).toBe(1);
  });

  it('once a warning has gone, a "saved" shows again', () => {
    const m = new NoticeModel();
    m.show('failed', 1);
    m.update(NOTICE_FADE.in + NOTICE_HOLD.failed + NOTICE_FADE.out + 1);
    m.update(NOTICE_FADE.out);
    expect(m.state.kind).toBeNull();
    m.show('saved', 1);
    expect(m.state.kind).toBe('saved');
  });

  it('a negative or huge step never breaks it: a frame that comes after a tab was hidden for hours still SHOWS the notice once, and the next one ends it', () => {
    const m = new NoticeModel();
    m.show('saved', 1);
    expect(m.update(-5).opacity).toBe(0);
    expect(m.update(1e9)).toMatchObject({ kind: 'saved', opacity: 1 });
    expect(m.update(1e9).kind).toBeNull();
  });
});

describe('the notice on the page', () => {
  let parent: HTMLDivElement;
  let notice: SaveNotice;
  const tr = createTranslator(CATALOGS, 'es');
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    tr.setLocale('es');
    notice = new SaveNotice(parent, tr);
    notice.place(844, 390, { top: 10, right: 20, bottom: 0, left: 0 }, 1);
  });
  afterEach(() => notice.dispose());
  const el = (): HTMLElement => parent.querySelector('[data-testid="save-notice"]') as HTMLElement;
  const words = (): string => (parent.querySelector('[data-testid="save-notice-text"]') as HTMLElement).textContent ?? '';

  it('is a polite status region, takes no touch, and is closed until something is shown', () => {
    expect(el().getAttribute('role')).toBe('status');
    expect(el().getAttribute('aria-live')).toBe('polite');
    expect(el().dataset['open']).toBe('0');
    expect(getComputedStyle(el()).pointerEvents).toBe('none');
  });

  it('says what happened, in the language in force, and follows a change of language', () => {
    notice.show('saved', 1);
    notice.update(0.5);
    expect(el().dataset['open']).toBe('1');
    expect(el().dataset['kind']).toBe('saved');
    expect(words()).toBe('Guardado');
    tr.setLocale('en');
    expect(words()).toBe('Saved');
    notice.show('failed', 2);
    notice.update(0.5);
    expect(words()).toBe('Could not save');
  });

  it('names the slot in what it says about one', () => {
    notice.show('damaged', 2);
    notice.update(0.5);
    expect(words()).toMatch(/2/);
    notice.show('recovered', 3);
    notice.update(0.5);
    expect(words()).toMatch(/3/);
  });

  it('closes itself when it is done and costs nothing then', () => {
    notice.show('saved', 1);
    notice.update(NOTICE_FADE.in);
    notice.update(NOTICE_HOLD.saved);
    notice.update(NOTICE_FADE.out + 0.1);
    expect(el().dataset['open']).toBe('0');
    expect(notice.current.kind).toBeNull();
  });

  it('hangs from the top right corner, inside the safe area', () => {
    expect(el().style.transform).toContain(`translate(${844 - 20 - 16}px, ${10 + 16}px)`);
    notice.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 1.5);
    expect(el().style.transform).toContain(`translate(${844 - 24}px, ${24}px)`);
  });
});
