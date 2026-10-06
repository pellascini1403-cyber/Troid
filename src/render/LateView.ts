import { Container } from 'pixi.js';
import type { EntityView } from './EntityViews';

/**
 * The view of an entity whose DRAWING is still on its way (a lazy chunk, docs/PROMPT6-LOG.md S29): an empty container now, the real view the moment
 * the code arrives. The simulation never waits for a picture — the entity exists, acts and can be fought whether or not it can be seen yet — and a
 * view destroyed before the chunk arrives never mounts it. If the chunk cannot be fetched there is nothing to draw and nothing breaks: the next entity
 * of the kind asks again.
 */
export class LateView implements EntityView {
  readonly root = new Container({ label: 'late-view' });
  private inner: EntityView | null = null;
  private gone = false;

  /** `arrival` resolves to the function that builds the real view (its code has arrived by then); it may reject. */
  constructor(arrival: Promise<() => EntityView>) {
    arrival.then(
      (make) => {
        if (this.gone) return;
        this.inner = make();
        this.root.addChild(this.inner.root);
      },
      () => undefined,
    );
  }

  /** The real view, once it has arrived. */
  get view(): EntityView | null {
    return this.inner;
  }

  sync(alpha: number, dt: number): void {
    this.inner?.sync(alpha, dt);
  }

  destroy(): void {
    this.gone = true;
    this.inner?.destroy();
    this.inner = null;
    this.root.destroy({ children: true });
  }
}
