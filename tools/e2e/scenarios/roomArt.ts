import assert from 'node:assert/strict';
import { ROOMS } from '@/content';
import { createArtFixture, type FixturePack } from '../artFixture';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE ROOM, DRESSED WITH ART (docs/ART-PIPELINE-2D.md, part M): the first room of the slice drawn with the pictures of the repository's own art instead of the blockout — what the
 * art covers is hidden from the blockout and nothing else; the doors fade with their gate; a page with no art, or with art that lacks a material, keeps the blockout exactly where the
 * art is not; and none of it costs the game a draw call over the budget or a pixel of collision.
 *
 *   A · R1 with the art: every solid, the door and the way out are drawn by it; the backdrop strips and the foreground replace the blockout's; the library has nothing to complain of
 *   B · six places along the walk (the start, the chasm, the stairs, the crawl, the court, the gate), in the size of a phone: the draw calls stay under the budget everywhere
 *   C · the door follows its gate: the art's container and the blockout's animation fade together, and once open the door is not drawn
 *   D · no art (`?art=`): the blockout draws everything, as it always did
 *   E · art that has only some of the materials (synthetic): what it has is drawn by it, what it lacks stays the blockout's, and the room is still whole
 */
const PHONE = { width: 844, height: 390, dpr: 1 };
const R1 = ROOMS['r1_gate']!;
/** The places of the walk and what each is (x of the hero's feet). */
const PLACES: Array<[string, number]> = [['start', 6], ['chasm', 34], ['stairs', 44], ['crawl', 70], ['court', 98], ['gate', 106.6]];

const waitFor = async (ctx: Ctx, what: string, test: (s: GameState) => boolean, ms = 30000): Promise<GameState> => {
  const t0 = Date.now();
  for (;;) {
    const s = await ctx.state();
    if (test(s)) return s;
    if (Date.now() - t0 > ms) throw new Error(`gave up waiting for ${what}: ${JSON.stringify(s.roomArt)}`);
    await ctx.page.waitForTimeout(50);
  }
};

const labels = (ctx: Ctx, layer: string): Promise<Array<{ label: string; visible: boolean; children: number }>> =>
  ctx.page.evaluate(
    (k) => (window as unknown as { __troid: { game: { renderer: { layers: Record<string, { children: Array<{ label: string; visible: boolean; children?: unknown[] }> }> } } } }).__troid.game.renderer.layers[k]!.children.map((c) => ({ label: c.label, visible: c.visible, children: c.children?.length ?? 0 })),
    layer,
  );

const PARTIAL: FixturePack[] = [
  {
    id: 'partial',
    category: 'environment',
    load: 'zone',
    zones: ['r1_gate'],
    // the earth, and nothing else: the ground of R1 is earth, its blocks, walls and the roof of the tunnel are stone, its stairs are wood, its door is a gate
    sprites: [{ id: 'earth', canvas: [64, 64], clips: { idle: 1 }, prefix: 'earth_', extra: { pivot: [0, 0], artPxPerMeter: 32, tags: ['role:solid', 'material:earth', 'part:fill'] } }],
  },
];

export const roomArt: Scenario = {
  name: 'room-art',
  async run(ctx) {
    // ================================================================================================ A · R1 with the art
    await ctx.open('paused=1', PHONE);
    const dressed = await waitFor(ctx, 'the room dressed with the art', (s) => s.roomArt !== null && s.roomArt !== undefined);
    const art = dressed.roomArt!;
    const every = R1.solids.map((s) => s.id);
    assert.deepEqual([...art.solids].sort(), [...every].sort(), 'every solid of R1 — the ground, the walls, the blocks, the stairs, the roof and the door — is drawn by the art');
    assert.deepEqual(art.gates, ['exit_door'], 'the door of the slime is one of them');
    assert.deepEqual(art.exits, ['east'], 'and the way out has its shaft of light');
    assert.deepEqual([...art.backdrop].sort(), ['far', 'front', 'mid', 'near'], 'the three strips and the leaves in front replace the blockout\'s backdrop');
    assert.deepEqual(art.lacking, {}, 'the art lacks nothing the room asks for');
    assert.deepEqual(art.notes, [], 'and says nothing about its strips: they are tall enough for the camera');
    assert.ok(art.sprites > 200, `a room is dozens of pieces (${art.sprites} sprites)`);
    assert.deepEqual(dressed.art?.state, 'ready', 'the library is ready');
    // the blockout lets go of what the art draws: its terrain graphics have no rectangles left
    const terrain = await labels(ctx, 'terrain');
    assert.ok(terrain.some((c) => c.label === 'art:terrain' && c.children > 100), `the art's own terrain is there (${JSON.stringify(terrain.map((c) => c.label))})`);
    const blockout = await ctx.page.evaluate(
      `(() => { const g = window.__troid.game.renderer.layers.terrain.children.find((c) => c.label === 'room:r1_gate'); return g ? { bounds: g.getLocalBounds().width } : null; })()`,
    );
    assert.ok(blockout === null || (blockout as { bounds: number }).bounds < 1, `nothing of the blockout's terrain remains (${JSON.stringify(blockout)})`);
    // the hero's body and the room's colliders are the room's data and nothing else: the art changed none of it
    assert.equal(dressed.room, 'r1_gate');
    await ctx.shot('a-00-start');

    // ================================================================================================ B · six places along the walk
    let worst = 0;
    for (const [name, x] of PLACES) {
      await ctx.teleport(x, 0);
      await ctx.page.evaluate('window.__troid.settleCamera(5)');
      await ctx.page.waitForTimeout(400);
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      assert.ok((s.drawsMax ?? 0) <= 60, `${name}: ${s.drawsMax} draw calls (budget 60)`);
      await ctx.shot(`b-${name}`);
    }
    const library = (await ctx.state()).art!;
    console.log(`  room-art: R1 = ${art.sprites} sprites · worst ${worst} draw calls (budget 60) · art ${library.pages} pages, ${(library.bytes / 1048576).toFixed(1)} MiB resident, ready in ${Math.round(library.loadMs)} ms`);
    assert.ok(library.bytes < 32 * 1048576, `the zone's pages fit the proposed memory budget of 32 MiB (${(library.bytes / 1048576).toFixed(1)} MiB)`);
    assert.deepEqual(ctx.warnings.filter((w) => w.includes('[art]')), [], 'the library had nothing to say about the art');

    // ================================================================================================ C · the door follows its gate
    await ctx.teleport(100, 0);
    const doorAlpha = (): Promise<{ art: number; visible: boolean; gate: number | null }> =>
      ctx.page.evaluate(
        `(() => { const t = window.__troid; const d = t.game.roomArt.door('exit_door'); return { art: d ? d.alpha : -1, visible: d ? d.visible : false, gate: t.state().gates.exit_door.alpha }; })()`,
      ) as Promise<{ art: number; visible: boolean; gate: number | null }>;
    const closed = await doorAlpha();
    assert.deepEqual(closed, { art: 1, visible: true, gate: 1 }, 'closed: the door is drawn, whole');
    await ctx.page.evaluate("window.__troid.session.flags.set('defeated:r1_slime')");
    await ctx.step(2);
    // the gate dissolves over 0.6 s of REAL time (the view follows the event, the simulation decides): the frames run while the game is paused
    await ctx.page.waitForFunction("(() => { const t = window.__troid; const d = t.game.roomArt.door('exit_door'); return d && d.alpha === 0 && !d.visible; })()", undefined, { timeout: 8000 });
    const open = await doorAlpha();
    assert.equal(open.art, 0, 'open: the art\'s door is gone');
    assert.equal(open.visible, false, 'and not drawn at all');
    assert.equal(open.gate, 0, 'at the same time as the blockout\'s own animation');

    // ================================================================================================ D · no art
    await ctx.open('paused=1&art=', PHONE);
    await ctx.page.waitForTimeout(800);
    const bare = await ctx.state();
    assert.equal(bare.roomArt, null, 'no art: nothing dresses the room');
    const bareTerrain = await ctx.page.evaluate(
      `(() => { const g = window.__troid.game.renderer.layers.terrain.children.find((c) => c.label === 'room:r1_gate'); return g ? g.getLocalBounds().width : 0; })()`,
    );
    assert.ok((bareTerrain as number) > 100, `the blockout draws the whole room (${bareTerrain} m wide)`);
    await ctx.shot('d-blockout');

    // ================================================================================================ E · art that lacks materials
    const fixture = createArtFixture(PARTIAL);
    try {
      await ctx.open('paused=1&art=art-test&visual=placeholder', { ...PHONE, prepare: async (context) => fixture.serve(context, 'art-test') });
      const some = (await waitFor(ctx, 'the partial art', (s) => s.roomArt !== null && s.roomArt !== undefined)).roomArt!;
      const earth = R1.solids.filter((s) => s.material === 'earth').map((s) => s.id);
      const rest = R1.solids.filter((s) => s.material !== 'earth').map((s) => s.id);
      assert.deepEqual([...some.solids].sort(), [...earth].sort(), 'what the art has (the earth) it draws');
      for (const id of rest) assert.ok(!some.solids.includes(id), `${id} is not covered: the blockout keeps it`);
      assert.deepEqual(Object.keys(some.lacking).sort(), ['door:gate:body', 'platform:wood:body', 'solid:stone:fill'], 'and the room says exactly what it lacks');
      const partial = await ctx.page.evaluate(
        `(() => { const g = window.__troid.game.renderer.layers.terrain.children.find((c) => c.label === 'room:r1_gate'); const b = g ? g.getLocalBounds() : null; return b ? { w: b.width, h: b.height } : null; })()`,
      );
      assert.ok(partial !== null && (partial as { w: number }).w > 20, `the blockout still draws the stone (${JSON.stringify(partial)})`);
      await ctx.shot('e-partial');
    } finally {
      fixture.cleanup();
    }
  },
};
