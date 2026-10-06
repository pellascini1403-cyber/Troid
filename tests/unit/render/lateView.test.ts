// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { EntityView } from '@/render/EntityViews';
import { LateView } from '@/render/LateView';

/**
 * A view whose drawing code is still on its way (docs/PROMPT6-LOG.md S29: the boss's looks travel in a chunk of their own): empty now, the real
 * view the moment it arrives, and never built for a view that was already destroyed. The simulation never waits for it.
 */
function real(): EntityView & { syncs: Array<[number, number]>; destroyed: boolean } {
  const view = {
    root: new Container({ label: 'real' }),
    syncs: [] as Array<[number, number]>,
    destroyed: false,
    sync(alpha: number, dt: number) {
      this.syncs.push([alpha, dt]);
    },
    destroy() {
      this.destroyed = true;
      this.root.destroy({ children: true });
    },
  };
  return view;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('LateView', () => {
  it('is an empty container while the code is on its way, and syncing it does nothing', async () => {
    let arrive!: (make: () => EntityView) => void;
    const v = new LateView(new Promise((r) => (arrive = r)));
    expect(v.root.children).toHaveLength(0);
    expect(v.view).toBeNull();
    expect(() => v.sync(0.5, 1 / 60)).not.toThrow();
    arrive(() => real());
    await tick();
    expect(v.root.children).toHaveLength(1);
  });

  it('mounts the real view when the code arrives, and from then on passes every frame to it', async () => {
    const r = real();
    const v = new LateView(Promise.resolve(() => r));
    await tick();
    expect(v.view).toBe(r);
    expect(v.root.children[0]).toBe(r.root);
    v.sync(0.25, 0.016);
    v.sync(1, 0);
    expect(r.syncs).toEqual([[0.25, 0.016], [1, 0]]);
  });

  it('destroyed before the code arrives, it never builds the real view (nothing leaks into the scene)', async () => {
    let arrive!: (make: () => EntityView) => void;
    const v = new LateView(new Promise((r) => (arrive = r)));
    v.destroy();
    const make = vi.fn(() => real());
    arrive(make);
    await tick();
    expect(make).not.toHaveBeenCalled();
    expect(v.view).toBeNull();
    expect(v.root.destroyed).toBe(true);
  });

  it('destroyed after it arrived, it destroys the real view with it', async () => {
    const r = real();
    const v = new LateView(Promise.resolve(() => r));
    await tick();
    v.destroy();
    expect(r.destroyed).toBe(true);
    expect(v.root.destroyed).toBe(true);
    expect(v.view).toBeNull();
    expect(() => v.sync(1, 0)).not.toThrow();
  });

  it('when the code never comes (the fetch failed) it stays empty and nothing breaks', async () => {
    const v = new LateView(Promise.reject(new Error('offline')));
    await tick();
    expect(v.root.children).toHaveLength(0);
    expect(() => v.sync(1, 0.016)).not.toThrow();
    expect(() => v.destroy()).not.toThrow();
  });
});
