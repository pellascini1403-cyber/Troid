import type { CDPSession, Page } from 'playwright-core';

/**
 * A touch screen for the browser E2E: REAL touches through the DevTools protocol (`Input.dispatchTouchEvent`), the same events a
 * finger makes — Chromium turns them into pointer events, which is what the game listens to. Several fingers at once, each one
 * identified, so multitouch is exercised for real (move + attack, move + dash…), not simulated at the DOM level.
 *
 * Each protocol event names the points it is about: a `touchStart` the finger that touched, a `touchMove` the finger that
 * slid, a `touchEnd` / `touchCancel` the finger that LIFTED (not the ones that remain). The driver keeps where every finger is.
 */
export class TouchScreen {
  private cdp!: CDPSession;
  private readonly points = new Map<number, { x: number; y: number }>();
  /**
   * Time of the touches. Each event carries an explicit timestamp from this virtual clock instead of "now": with software
   * rendering the browser delivers pointer events at the pace of its frames (100 ms or more apart), which would turn every
   * flick into a slow drag. The gestures are timed by the events' own timestamps, so the test says how long each took.
   */
  private clockMs = 0;
  private baseSeconds = Date.now() / 1000;

  constructor(private readonly page: Page) {}

  /** Lets `ms` of the touches' own time pass (a finger resting on the screen). */
  rest(ms: number): void {
    this.clockMs += ms;
  }

  async init(): Promise<this> {
    this.cdp = await this.page.context().newCDPSession(this.page);
    return this;
  }

  get down(): number {
    return this.points.size;
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', ids: number[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: ids.map((id) => ({ x: this.points.get(id)?.x ?? 0, y: this.points.get(id)?.y ?? 0, id })),
      timestamp: this.baseSeconds + this.clockMs / 1000,
    });
  }

  /** A finger touches the screen at `(x, y)`. */
  async touch(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchStart', [id]);
  }

  /** The finger slides to `(x, y)`. */
  async slide(id: number, x: number, y: number): Promise<void> {
    if (!this.points.has(id)) throw new Error(`finger ${id} is not on the screen`);
    this.points.set(id, { x, y });
    await this.send('touchMove', [id]);
  }

  /** The finger slides by `(dx, dy)` in `steps` events, `gapMs` of the touches' own time apart (default 10 ms: a flick). */
  async drag(id: number, dx: number, dy: number, steps = 4, gapMs = 10): Promise<void> {
    const p = this.points.get(id);
    if (!p) throw new Error(`finger ${id} is not on the screen`);
    const x0 = p.x;
    const y0 = p.y;
    for (let i = 1; i <= steps; i++) {
      this.clockMs += gapMs;
      await this.slide(id, x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    }
  }

  /** The finger lifts. */
  async lift(id: number): Promise<void> {
    if (!this.points.has(id)) return;
    await this.send('touchEnd', [id]);
    this.points.delete(id);
  }

  /** The system takes the touches away (an edge gesture, an incoming call): every finger is cancelled. */
  async cancelAll(): Promise<void> {
    await this.send('touchCancel', []); // the protocol cancels every touch and wants no points listed
    this.points.clear();
  }

  /** A quick tap. */
  async tap(id: number, x: number, y: number): Promise<void> {
    await this.touch(id, x, y);
    await this.lift(id);
  }
}

/** The centre of an element (by `data-testid`) in page coordinates. */
export async function centreOf(page: Page, testid: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const box = await page.locator(`[data-testid="${testid}"]`).boundingBox();
  if (!box) throw new Error(`[data-testid="${testid}"] has no box (hidden?)`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height };
}
