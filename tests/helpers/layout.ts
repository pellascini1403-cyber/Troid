/**
 * A browser lays things out; happy-dom does not. For what a test needs of the layout of a scrolling element — how tall its content is, how much of it is seen, where it is scrolled to — the three numbers a
 * browser would report are set by hand (and can be changed afterwards through the object that is returned).
 */
export interface ScrollLayout {
  scroll: number;
  client: number;
  top: number;
}

export function stubScrollLayout(el: HTMLElement, layout: Partial<ScrollLayout> = {}): ScrollLayout {
  const v: ScrollLayout = { scroll: 0, client: 0, top: 0, ...layout };
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => v.scroll });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => v.client });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => v.top, set: (n: number) => void (v.top = n) });
  return v;
}
