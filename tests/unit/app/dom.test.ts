// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { listen } from '@/app/dom';
import { DisposableStore } from '@/core/lifecycle';

/** The shared helper of the DOM layer: a listener whose removal is owned by a store. */
describe('listen', () => {
  it('is removed with its store: a disposed owner leaves no listener behind', () => {
    const store = new DisposableStore();
    const el = document.createElement('div');
    let n = 0;
    listen(store, el, 'click', () => void n++);
    el.click();
    store.dispose();
    el.click();
    expect(n).toBe(1);
  });
});
