import type { Page } from 'playwright-core';

/**
 * Waits until the page is really drawing: `n` animation frames in a row. The first frames after a change can be very slow with
 * software GL (a long first draw), and the HUD plays its short transients (a shake, a fade) in REAL time: an event that lands in
 * the middle of such a frame would be over before the next one. Call this before anything that depends on a transient, or on
 * what the DOM shows after the simulation moved (the interaction icon follows the camera frame by frame).
 */
export const frames = (page: Page, n = 8): Promise<unknown> =>
  page.evaluate(`new Promise((resolve) => { let k = 0; const f = () => (++k >= ${n} ? resolve(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
