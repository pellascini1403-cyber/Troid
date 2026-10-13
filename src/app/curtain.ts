/**
 * THE BOOT CURTAIN (docs/PROMPT8-LOG.md, phase J). The page is the dark of the game from its very first paint (`#boot-curtain` in index.html) and a cold start never shows the technical blockout — flat rectangles and
 * a capsule — on its way to the produced look: the world waits, still, behind the curtain until the art of the first room is in, and the curtain lifts then. The art is images, not code, so keeping the page
 * waiting for it costs the cold start nothing (the first JavaScript is the same); what it buys is a first picture that is the game's.
 *
 * It is DOM only (no Pixi, no simulation) and it can never hold the player: it lifts when the art is in, when there is no art to wait for, when the art fails, after `CURTAIN_TIMEOUT_MS` whatever happens, and a
 * test, a lab or a paused page never has one. What lifted it is left on the page (`<html data-boot="…">`) for whoever must check.
 */

export const CURTAIN_ID = 'boot-curtain';

/** What lifted the curtain: the art of the first room is in, there was no art to wait for, the art failed, the wait ran out, or a page that never waits (a test, a lab, a paused page). */
export type CurtainReason = 'art' | 'no-art' | 'art-failed' | 'timeout' | 'hooks' | 'lab' | 'failed' | 'disposed';

/** The longest a player waits behind the curtain for the art of the first room (ms): past it the game starts as the blockout and is dressed when its art arrives. */
export const CURTAIN_TIMEOUT_MS = 10_000;

/** How long the curtain takes to fade (ms): what `#boot-curtain` says in index.html. */
export const CURTAIN_FADE_MS = 800;

/** Whether this start-up waits behind the curtain: only a player's page, with a curtain on it and art that can arrive — a test (`?hooks=1`), a paused page or a game with no art have nothing to wait for. */
export function wantsCurtain(o: { present: boolean; art: boolean; hooks: boolean; paused: boolean }): boolean {
  return o.present && o.art && !o.hooks && !o.paused;
}

/** Whether a curtain is up (on the page and not yet lifting). */
export function curtainUp(doc: Document = document): boolean {
  const el = doc.getElementById(CURTAIN_ID);
  return el !== null && el.dataset['state'] !== 'lifting';
}

/**
 * Lifts the curtain: it fades (or, `instant`, is gone at once) and leaves on the page what lifted it. Once lifted, asking again does nothing. Returns whether this call lifted it.
 */
export function liftCurtain(reason: CurtainReason, instant = false, doc: Document = document): boolean {
  const el = doc.getElementById(CURTAIN_ID);
  if (!el || el.dataset['state'] === 'lifting') return false;
  doc.documentElement.dataset['boot'] = reason;
  if (instant) {
    el.remove();
    return true;
  }
  el.dataset['state'] = 'lifting';
  const gone = (): void => el.remove();
  el.addEventListener('transitionend', gone, { once: true });
  // a browser that skips the transition (hidden tab, reduced motion) still gets rid of it
  setTimeout(gone, CURTAIN_FADE_MS + 400);
  return true;
}
