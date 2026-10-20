// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScrollHint } from '@/ui/settings/scrollHint';
import { stubScrollLayout, type ScrollLayout } from '../../helpers/layout';

/**
 * THE "MORE BELOW" HINT of the menu's screens (docs/PROMPT14-LOG.md §8): `data-more` says whether there is anything to scroll to below what is seen, so that the stylesheet can fade the last lines out only
 * then. A browser lays things out; here the three numbers it would report are set by hand.
 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the scroll hint', () => {
  let el: HTMLDivElement;
  let v: ScrollLayout;
  let hint: ScrollHint;
  beforeEach(() => {
    document.body.innerHTML = '';
    el = document.createElement('div');
    document.body.appendChild(el);
    v = stubScrollLayout(el, { scroll: 200, client: 200 });
    hint = new ScrollHint(el);
  });
  afterEach(() => hint.dispose());

  it('starts as "nothing more" (a screen that is not shown has no size) and says "more" as soon as there is something below what is seen', () => {
    expect(el.dataset['more']).toBe('0');
    v.scroll = 529;
    v.client = 278;
    hint.update();
    expect(el.dataset['more']).toBe('1');
  });

  it('a screen that fits says nothing, a pixel of rounding is not "more", and the end of a scroll says "nothing more"', () => {
    v.scroll = 278;
    v.client = 278;
    hint.update();
    expect(el.dataset['more']).toBe('0');
    v.scroll = 279;
    hint.update();
    expect(el.dataset['more'], 'one pixel is rounding, not a line of text').toBe('0');
    v.scroll = 529;
    v.top = 0;
    hint.update();
    expect(el.dataset['more']).toBe('1');
    v.top = 251;
    hint.update();
    expect(el.dataset['more'], 'at the end the last line is shown plainly').toBe('0');
    v.top = 250.5; // a scroll position is not always a whole number
    hint.update();
    expect(el.dataset['more']).toBe('0');
  });

  it('looks again by itself: when the element is scrolled, when the window changes size and when what is inside it changes', async () => {
    v.scroll = 529;
    v.client = 278;
    el.dispatchEvent(new Event('scroll'));
    expect(el.dataset['more'], 'scrolled').toBe('1');
    v.top = 251;
    el.dispatchEvent(new Event('scroll'));
    expect(el.dataset['more']).toBe('0');
    v.client = 600; // the phone was turned: there is room now
    window.dispatchEvent(new Event('resize'));
    expect(el.dataset['more'], 'the window changed size').toBe('0');
    v.client = 278;
    v.top = 0;
    window.dispatchEvent(new Event('resize'));
    expect(el.dataset['more']).toBe('1');
    v.scroll = 278; // what was inside got shorter (a question that closed)
    el.appendChild(document.createElement('p'));
    await tick();
    expect(el.dataset['more'], 'what is inside changed').toBe('0');
    v.scroll = 700; // …and longer (a language with longer words, a question that opened in a card)
    el.firstElementChild!.textContent = 'more words';
    await tick();
    expect(el.dataset['more']).toBe('1');
  });

  it('does not write the attribute again when nothing changed (it would be a style recalculation for nothing)', () => {
    v.scroll = 529;
    v.client = 278;
    hint.update();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(el, { attributes: true });
    for (let i = 0; i < 10; i++) hint.update();
    expect([...records, ...observer.takeRecords()]).toHaveLength(0);
    observer.disconnect();
  });

  it('after dispose it listens to nothing', async () => {
    hint.dispose();
    v.scroll = 529;
    v.client = 278;
    el.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    el.appendChild(document.createElement('p'));
    await tick();
    expect(el.dataset['more']).toBe('0');
    hint.dispose(); // (twice is nothing)
  });
});
