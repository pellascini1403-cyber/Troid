// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURTAIN_FADE_MS, CURTAIN_ID, CURTAIN_TIMEOUT_MS, curtainUp, liftCurtain, wantsCurtain } from '@/app/curtain';

/**
 * THE BOOT CURTAIN (docs/PROMPT8-LOG.md, phase J): the page is the dark of the game until the art of the first room is in, and the player can never be held behind it.
 */
function put(): HTMLElement {
  const el = document.createElement('div');
  el.id = CURTAIN_ID;
  document.body.append(el);
  return el;
}

describe('the curtain', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset['boot'];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is up when the page has one, and not once it is lifting or gone', () => {
    expect(curtainUp()).toBe(false);
    const el = put();
    expect(curtainUp()).toBe(true);
    liftCurtain('art');
    expect(el.dataset['state']).toBe('lifting');
    expect(curtainUp()).toBe(false);
  });

  it('fades and then goes, and leaves on the page what lifted it', () => {
    const el = put();
    expect(liftCurtain('art')).toBe(true);
    expect(document.documentElement.dataset['boot']).toBe('art');
    expect(document.getElementById(CURTAIN_ID)).toBe(el);
    vi.advanceTimersByTime(CURTAIN_FADE_MS + 500);
    expect(document.getElementById(CURTAIN_ID)).toBeNull();
  });

  it('goes with the end of its transition, without waiting for the timer', () => {
    const el = put();
    liftCurtain('art');
    el.dispatchEvent(new Event('transitionend'));
    expect(document.getElementById(CURTAIN_ID)).toBeNull();
  });

  it('can be removed at once: a test, a lab or a page with no art never fades it', () => {
    put();
    expect(liftCurtain('hooks', true)).toBe(true);
    expect(document.getElementById(CURTAIN_ID)).toBeNull();
    expect(document.documentElement.dataset['boot']).toBe('hooks');
  });

  it('is lifted once: the first reason is the one that stays, and lifting what is gone does nothing', () => {
    put();
    expect(liftCurtain('art')).toBe(true);
    expect(liftCurtain('timeout')).toBe(false);
    expect(document.documentElement.dataset['boot']).toBe('art');
    vi.advanceTimersByTime(CURTAIN_FADE_MS + 500);
    expect(liftCurtain('disposed', true)).toBe(false);
    expect(document.documentElement.dataset['boot']).toBe('art');
  });

  it('is harmless on a page that has none (a lab, a test page)', () => {
    expect(liftCurtain('lab', true)).toBe(false);
    expect(document.documentElement.dataset['boot']).toBeUndefined();
  });
});

describe('who waits behind it', () => {
  const player = { present: true, art: true, hooks: false, paused: false };

  it('a player whose page has a curtain and art to fetch', () => {
    expect(wantsCurtain(player)).toBe(true);
  });

  it('nobody else: a test (hooks), a paused page, a game with no art, or a page with no curtain', () => {
    expect(wantsCurtain({ ...player, hooks: true })).toBe(false);
    expect(wantsCurtain({ ...player, paused: true })).toBe(false);
    expect(wantsCurtain({ ...player, art: false })).toBe(false);
    expect(wantsCurtain({ ...player, present: false })).toBe(false);
  });

  it('never for longer than the player can bear: the wait is ten seconds at most, and the fade less than one', () => {
    expect(CURTAIN_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(CURTAIN_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(CURTAIN_FADE_MS).toBeLessThan(1_000);
  });
});
