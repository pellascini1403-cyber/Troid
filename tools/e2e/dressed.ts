import type { Ctx, GameState } from './scenario';

/**
 * Waits until the art has dressed the room the hero is in. The art of a room is fetched AFTER its first frame (it is a lazy chunk and a few images), so what the scene graph holds
 * — a container per strip, a few hundred sprites — is the blockout's for the first moments and the art's afterwards: a test that counts objects, or compares two moments, must
 * not sample in between. Call it for a room the repository's art dresses (R1) after anything that builds the room (opening the page, loading a room, a transition); a room with
 * no art never becomes dressed, so a test of such a room does not call it. With `?art=` there is nothing to wait for either.
 */
export async function whenDressed(ctx: Ctx, ms = 30000): Promise<GameState> {
  const t0 = Date.now();
  for (;;) {
    const s = await ctx.state();
    if (s.roomArt) return s;
    if (Date.now() - t0 > ms) throw new Error(`the room "${s.room}" was never dressed with the art (${ms} ms): ${JSON.stringify(s.art?.packList?.map((p) => [p.id, p.held]))}`);
    await ctx.page.waitForTimeout(50);
  }
}

/** The labels of what each layer of the room holds, for a message that says WHICH object is missing or left over when two scene graphs differ. */
export async function layerLabels(ctx: Ctx): Promise<Record<string, string[]>> {
  return (await ctx.page.evaluate(
    `(() => { const L = window.__troid.game.renderer.layers; const out = {}; for (const k of ['terrain', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay']) out[k] = L[k].children.map((c) => c.label); return out; })()`,
  )) as Record<string, string[]>;
}
