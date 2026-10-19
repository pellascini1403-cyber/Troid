// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { browserPlatform } from '@/app/gameSaves';

/** The page the saves live in (docs/PROMPT14-LOG.md): the real one, in a DOM. */
const hidden = (value: boolean): void => void Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
afterEach(() => hidden(false));

describe('the browser as the saves see it', () => {
  it('the page is LEFT when it is closed or navigated away from (`pagehide`) and when it is hidden — not when it becomes visible again — and each listener can be stopped', () => {
    const platform = browserPlatform();
    const events: string[] = [];
    const off = platform.onLeave(() => void events.push('left'));
    window.dispatchEvent(new Event('pagehide'));
    expect(events).toEqual(['left']);
    hidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(events, 'becoming visible is not leaving').toEqual(['left']);
    hidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(events).toEqual(['left', 'left']);
    off();
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(events).toHaveLength(2);
  });

  it('a repeating timer that stops, and a clock in milliseconds', async () => {
    const platform = browserPlatform();
    let n = 0;
    const stop = platform.every(5, () => void n++);
    await new Promise((r) => setTimeout(r, 40));
    stop();
    const seen = n;
    expect(seen).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(n).toBe(seen);
    expect(Math.abs(platform.now() - Date.now())).toBeLessThan(1000);
  });

  it('opens the page again on the same address WITHOUT `?new=1` (which would erase the game it is opening) and keeps every other part of it', () => {
    const calls: string[] = [];
    const where = { href: 'https://example.test/play/?hooks=1&new=1&lang=es#top', replace: (url: string | URL) => void calls.push(String(url)) };
    browserPlatform(where).reload();
    expect(calls).toEqual(['https://example.test/play/?hooks=1&lang=es#top']);
    const plain = { href: 'https://example.test/', replace: (url: string | URL) => void calls.push(String(url)) };
    browserPlatform(plain).reload();
    expect(calls[1]).toBe('https://example.test/');
  });
});
