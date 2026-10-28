import assert from 'node:assert/strict';
import { ROOMS } from '@/content';
import { MEMORY_BUDGET_MIB, MIB } from '@/presentation/stressModel';
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
 *   F · R2, the Root Gallery: the thorns of the ditch, the shrine (resting → lit when it is the checkpoint) and the vial of the fourth bottle (gone once taken) are drawn by the art,
 *       the blockout lets go of exactly those, the room's own data is untouched, and the draw calls stay under the budget along the whole room
 *   G · R3, the Seal Chamber: the door of the ward fades with its gate, the sigil of the ward is hung by the seal's own view (a blow turned away makes the flash come on), the card of the
 *       Spirit Bolt floats until it is taken, and the blockout keeps drawing all of it with `?art=`
 *   H · R4, the Sanctum: the floor, the walls and the two doors of the arena are drawn by the art (the doors shut when the fight begins), the shrine of the last rest, the rune of the Air Dash that
 *       is not there until the Warden has fallen, nothing of the environment is left to the blockout, and the draw calls stay under the budget from the portal to the way out
 *   I · the Ink Warden and the arena that answers it (phase F): the boss is drawn by the parts of its art (and by its shapes with `?art=`), the eye of the wall burns while the fight is on and closes
 *       once the Warden has fallen, the reward lights up when it falls, the scenery only READS the flags, and a room that opens with the Warden fallen does not fade its dead eye in
 *   J · the Ink Slimes (phase G): the one of R1 and the one of R2 are drawn by the parts of their art (and by their shapes with `?art=`, or in a room whose art has none), the bristle rises as one winds up, and
 *       the art follows the zone: it is let go when the hero leaves the rooms that hold it
 *   K · the guardians of the engine (docs/PROMPT22-LOG.md §8): the art of a boss that is not the Warden comes in the six parts of an ink creature, tagged with the boss's look, and its view takes them — with `?art=` it keeps its shapes
 */
const PHONE = { width: 844, height: 390, dpr: 1 };
const R1 = ROOMS['r1_gate']!;
const R2 = ROOMS['r2_hall']!;
const R3 = ROOMS['r3_chamber']!;
const R4 = ROOMS['r4_sanctum']!;
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

/** The Ink Warden's view, read from the scene graph: whether it has one, how many of its shapes (Graphics of its body) are drawn and how many sprites it has (the art's parts). */
const bossOf = (ctx: Ctx): Promise<{ found: boolean; shapes: number; sprites: number }> =>
  ctx.page.evaluate(`(() => {
    const find = (c, label) => (c.label === label ? c : (c.children || []).map((k) => find(k, label)).find(Boolean));
    const layers = window.__troid.game.renderer.layers;
    const root = find(layers.actors, 'guardian') || find(layers.fxWorld, 'guardian');
    if (!root) return { found: false, shapes: 0, sprites: 0 };
    const actor = find(root, 'guardian-actor');
    const all = (c) => [c, ...(c.children || []).flatMap(all)];
    const nodes = all(actor).filter((c) => c !== actor);
    // (a node is told by how it is rendered, not by its class name: a production build has no class names)
    return { found: true, shapes: nodes.filter((c) => c.renderPipeId === 'graphics' && c.visible).length, sprites: nodes.filter((c) => c.renderPipeId === 'sprite').length };
  })()`) as Promise<{ found: boolean; shapes: number; sprites: number }>;

/** The Ink Slime's view, read from the scene graph: whether it has one, how many of its shapes (Graphics) are drawn and how many sprites it has (the art's parts, and the soft lights). */
const slimeOf = (ctx: Ctx): Promise<{ found: boolean; shapes: number; sprites: number; spines: boolean }> =>
  ctx.page.evaluate(`(() => {
    const find = (c, label) => (c.label === label ? c : (c.children || []).map((k) => find(k, label)).find(Boolean));
    const root = find(window.__troid.game.renderer.layers.actors, 'procedural');
    if (!root) return { found: false, shapes: 0, sprites: 0, spines: false };
    const shape = find(root, 'shape');
    const all = (c) => [c, ...(c.children || []).flatMap(all)];
    const nodes = all(root).filter((c) => c !== root);
    // (a node is told by how it is rendered, not by its class name: a production build has no class names)
    return {
      found: true,
      shapes: nodes.filter((c) => c.renderPipeId === 'graphics' && c.visible).length,
      sprites: nodes.filter((c) => c.renderPipeId === 'sprite').length,
      // (dressed, the second child of the shape is the bristle, over the body)
      spines: !!shape && !!shape.children[1] && shape.children[1].renderPipeId === 'sprite' && shape.children[1].visible,
    };
  })()`) as Promise<{ found: boolean; shapes: number; sprites: number; spines: boolean }>;

/** The view of a guardian of the engine (`BossView`: a creature of its look, at the size of a room): whether it has one, how many of its shapes (Graphics) are on and how many sprites it has. */
const engineBossOf = (ctx: Ctx): Promise<{ found: boolean; shapes: number; sprites: number }> =>
  ctx.page.evaluate(`(() => {
    const find = (c, label) => (c.label === label ? c : (c.children || []).map((k) => find(k, label)).find(Boolean));
    const root = find(window.__troid.game.renderer.layers.actors, 'boss');
    if (!root) return { found: false, shapes: 0, sprites: 0 };
    const actor = find(root, 'procedural');
    const all = (c) => [c, ...(c.children || []).flatMap(all)];
    const nodes = all(actor).filter((c) => c !== actor);
    return { found: true, shapes: nodes.filter((c) => c.renderPipeId === 'graphics' && c.visible).length, sprites: nodes.filter((c) => c.renderPipeId === 'sprite').length };
  })()`) as Promise<{ found: boolean; shapes: number; sprites: number }>;

/** Synthetic art for the Root Tyrant of the Root Throne: the six parts of an ink creature, tagged with its look — noise, not a drawing (what a delivery looks like to the game, nothing more). */
const TYRANT: FixturePack[] = [
  // (the creatures are dressed with the room, and a room is dressed when its zone holds environment art: a sliver of earth is enough)
  { id: 'rt-earth', category: 'environment', load: 'zone', zones: ['rt_arena'], sprites: [{ id: 'earth', canvas: [64, 64], clips: { idle: 1 }, prefix: 'earth_', extra: { pivot: [0, 0], artPxPerMeter: 32, tags: ['role:solid', 'material:earth', 'part:fill'] } }] },
  {
    id: 'tyrant',
    category: 'enemies',
    load: 'zone',
    zones: ['rt_arena'],
    sprites: (['body', 'flash', 'eyes', 'sigil', 'spines', 'pool'] as const).map((part) => ({
      id: `tyrant_${part}`,
      canvas: [96, 128] as [number, number],
      prefix: `${part}_`,
      clips: { idle: part === 'body' ? 4 : part === 'spines' ? 3 : 1 },
      extra: { tags: ['enemy:boss_root_tyrant', `part:${part}`], ...(part === 'body' ? { anchors: { head: [0.35, 1.9], vfx_origin: [-0.1, 1.2] } } : {}) },
    })),
  },
];

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
    const boss = (): ReturnType<typeof bossOf> => bossOf(ctx);
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
    assert.ok(library.bytes < MEMORY_BUDGET_MIB.zone * MIB, `the zone's pages fit the proposed memory budget of ${MEMORY_BUDGET_MIB.zone} MiB (${(library.bytes / 1048576).toFixed(1)} MiB)`);
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

    // ================================================================================================ F · R2: the thorns, the shrine and the vial
    await ctx.open('room=r2_hall&paused=1', PHONE);
    const gallery = (await waitFor(ctx, 'R2 dressed with the art', (s) => s.roomArt !== null && s.roomArt !== undefined)).roomArt!;
    assert.deepEqual([...gallery.solids].sort(), R2.solids.map((x) => x.id).sort(), 'every solid of R2 — the ground, the ditch, the five timber platforms — is drawn by the art');
    assert.deepEqual(gallery.hazards, ['spikes_ditch'], 'the thorns of the ditch are drawn by the art too');
    assert.deepEqual([...gallery.interactables].sort(), ['bottle_fourth', 'shrine'], 'and so are the shrine and the vial of the fourth bottle');
    assert.deepEqual([...gallery.exits].sort(), ['east', 'west']);
    assert.deepEqual(gallery.lacking, {}, 'the art lacks nothing R2 asks for');
    assert.deepEqual(gallery.notes, [], 'and nothing it says about its strips or its foreground');
    const terrainLabels = await labels(ctx, 'terrain');
    assert.ok(terrainLabels.some((c) => c.label === 'art:hazards' && c.children >= 5), `the art's thorns are there (${JSON.stringify(terrainLabels.map((c) => c.label))})`);
    // the blockout lets go of exactly what the art draws: its thorns are not drawn, nor its marks of the shrine and the pickup
    const blockoutThorns = await ctx.page.evaluate(`(() => { const g = window.__troid.game.renderer.layers.terrain.children.find((c) => c.label === 'hazard:spikes_ditch'); return g ? g.visible : null; })()`);
    assert.equal(blockoutThorns, false, 'the blockout\'s thorns are not drawn');
    const covered = (await ctx.page.evaluate('window.__troid.game.interactableViews.covered')) as string[];
    assert.deepEqual([...covered].sort(), ['bottle_fourth', 'shrine'], 'the blockout\'s marks of the shrine and the pickup are not drawn');
    const interactive = (id: string, layer: string): Promise<{ visible: boolean; lit: number | null; alpha: number } | null> =>
      ctx.page.evaluate(
        `(() => { const c = window.__troid.game.renderer.layers.${layer}.children.find((x) => x.label === 'art:interactable:${id}'); return c ? { visible: c.visible, alpha: c.alpha, lit: c.children[1] ? c.children[1].alpha : null } : null; })()`,
      ) as Promise<{ visible: boolean; lit: number | null; alpha: number } | null>;
    // the shrine rests until it is the checkpoint; the vial floats until it is taken
    await ctx.page.waitForTimeout(300);
    const resting = await interactive('shrine', 'propsBack');
    assert.ok(resting !== null && resting.lit !== null, 'the shrine has two frames: resting and lit');
    assert.equal(resting!.lit, 0, 'it is not the checkpoint: the lit frame is off');
    const vial = await interactive('bottle_fourth', 'lightOverlay');
    assert.ok(vial !== null && vial.visible, 'the vial floats over its ledge');
    await ctx.shot('f-00-gallery');
    // resting at the shrine, with the real keyboard: it becomes the checkpoint and the lit frame comes on
    await ctx.teleport(11.2, 0);
    await ctx.step(8);
    await ctx.page.keyboard.down('KeyE');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyE');
    await ctx.step(14);
    await ctx.page.waitForFunction(
      `(() => { const c = window.__troid.game.renderer.layers.propsBack.children.find((x) => x.label === 'art:interactable:shrine'); return c && c.children[1].alpha > 0.7; })()`,
      undefined,
      { timeout: 8000 },
    );
    const lit = await interactive('shrine', 'propsBack');
    assert.ok(lit!.lit! > 0.7, `the checkpoint is lit (${lit!.lit})`);
    await ctx.shot('f-01-the-shrine-lit');
    // taking the bottle writes its flag and the pickup is gone (the art follows what the simulation says)
    await ctx.page.evaluate("window.__troid.session.flags.set('taken:bottle_fourth')");
    await ctx.step(2);
    await ctx.page.waitForFunction(
      `(() => { const c = window.__troid.game.renderer.layers.lightOverlay.children.find((x) => x.label === 'art:interactable:bottle_fourth'); return c && !c.visible; })()`,
      undefined,
      { timeout: 8000 },
    );
    // the draw calls along the room: the way in, the shrine, the lip of the ditch, the thorns, the ledge, the way out
    let worstGallery = 0;
    for (const [name, x, y] of [['start', 4, 0], ['shrine', 12, 0], ['lip', 27, 0], ['thorns', 38, -3], ['ledge', 49, 4.9], ['east', 86, 0]] as const) {
      await ctx.teleport(x, y);
      await ctx.page.evaluate('window.__troid.settleCamera(5)');
      await ctx.page.waitForTimeout(400);
      const g = await ctx.state();
      worstGallery = Math.max(worstGallery, g.drawsMax ?? 0);
      assert.ok((g.drawsMax ?? 0) <= 60, `R2 ${name}: ${g.drawsMax} draw calls (budget 60)`);
      await ctx.shot(`f-${name}`);
    }
    const lib2 = (await ctx.state()).art!;
    console.log(`  room-art: R2 = ${gallery.sprites} sprites · worst ${worstGallery} draw calls (budget 60) · art ${lib2.pages} pages, ${(lib2.bytes / 1048576).toFixed(1)} MiB resident`);
    assert.ok(lib2.bytes < MEMORY_BUDGET_MIB.zone * MIB, `R2's pages fit the proposed memory budget of ${MEMORY_BUDGET_MIB.zone} MiB (${(lib2.bytes / 1048576).toFixed(1)} MiB)`);
    assert.deepEqual(ctx.warnings.filter((w) => w.includes('[art]')), [], 'the library had nothing to say about the art of R2');
    // no art: the blockout draws the thorns and the marks, as it always did
    await ctx.open('room=r2_hall&paused=1&art=', PHONE);
    await ctx.page.waitForTimeout(800);
    assert.equal((await ctx.state()).roomArt, null, 'no art: nothing dresses R2');
    assert.equal(
      await ctx.page.evaluate(`(() => { const g = window.__troid.game.renderer.layers.terrain.children.find((c) => c.label === 'hazard:spikes_ditch'); return g ? g.visible : null; })()`),
      true,
      'the blockout draws the thorns',
    );
    assert.deepEqual(await ctx.page.evaluate('window.__troid.game.interactableViews.covered'), [], 'and the shrine and the pickup');

    // ================================================================================================ G · R3: the ward, its door, the card
    await ctx.open('room=r3_chamber&paused=1', PHONE);
    const chamber = (await waitFor(ctx, 'R3 dressed with the art', (s) => s.roomArt !== null && s.roomArt !== undefined)).roomArt!;
    assert.deepEqual([...chamber.solids].sort(), R3.solids.map((x) => x.id).sort(), 'every solid of R3 — the ground, the climb, the ledge and the door of the ward — is drawn by the art');
    assert.deepEqual(chamber.gates, ['seal_gate'], 'the door the ward holds is drawn by the art');
    assert.deepEqual(chamber.seals, ['seal'], 'and so is the sigil of the ward');
    assert.deepEqual(chamber.interactables, ['card_spirit_bolt'], 'and the card of the Spirit Bolt');
    assert.deepEqual(chamber.lacking, {}, 'the art lacks nothing R3 asks for');
    assert.deepEqual(chamber.notes, [], 'and nothing it says about its strips or its foreground');
    const sealView = (): Promise<{ shapes: boolean[]; art: number; flash: number | null } | null> =>
      ctx.page.evaluate(
        `(() => { const v = window.__troid.game.renderer.layers.fxWorld.children.find((c) => c.label === 'seal'); if (!v) return null; const a = v.children.find((c) => c.label === 'art:seal:seal'); return { shapes: v.children.slice(0, 3).map((c) => c.visible), art: v.children.filter((c) => c.label === 'art:seal:seal').length, flash: a ? a.children[1].alpha : null }; })()`,
      ) as Promise<{ shapes: boolean[]; art: number; flash: number | null } | null>;
    await ctx.page.waitForTimeout(300);
    assert.deepEqual(await sealView(), { shapes: [false, false, false], art: 1, flash: 0 }, 'the seal\'s own view hangs the art\'s sigil on itself and does not draw its blockout shapes');
    await ctx.shot('g-00-the-chamber');
    // a blow that is turned away (the sword's) makes the flash of the art come on, as it makes the blockout's flash
    await ctx.page.evaluate(
      `(() => { const s = window.__troid.session.entities.find((e) => e.kind === 'seal'); s.receiveHit({ attackId: 'sword', attackerId: null, damage: 1, direction: 1, knockbackX: 0, knockbackY: 0, stun: 0, hitStop: 0, shake: 0, x: 62, y: 1 }); })()`,
    );
    await ctx.page.waitForFunction(
      `(() => { const v = window.__troid.game.renderer.layers.fxWorld.children.find((c) => c.label === 'seal'); const a = v && v.children.find((c) => c.label === 'art:seal:seal'); return a && a.children[1].alpha > 0.5; })()`,
      undefined,
      { timeout: 8000 },
    );
    // the card floats on the ledge until it is taken
    const card = await interactive('card_spirit_bolt', 'lightOverlay');
    assert.ok(card !== null && card.visible, 'the card floats over its altar');
    await ctx.page.evaluate("window.__troid.session.flags.set('taken:card_spirit_bolt')");
    await ctx.step(2);
    await ctx.page.waitForFunction(
      `(() => { const c = window.__troid.game.renderer.layers.lightOverlay.children.find((x) => x.label === 'art:interactable:card_spirit_bolt'); return c && !c.visible; })()`,
      undefined,
      { timeout: 8000 },
    );
    // the draw calls along the room: the way in, the climb, the ledge, the lane, the portal
    let worstChamber = 0;
    for (const [name, x, y] of [['start', 4, 0], ['climb', 24, 2.5], ['ledge', 34, 4.9], ['lane', 52, 0], ['portal', 60, 0]] as const) {
      await ctx.teleport(x, y);
      await ctx.page.evaluate('window.__troid.settleCamera(5)');
      await ctx.page.waitForTimeout(400);
      const g = await ctx.state();
      worstChamber = Math.max(worstChamber, g.drawsMax ?? 0);
      assert.ok((g.drawsMax ?? 0) <= 60, `R3 ${name}: ${g.drawsMax} draw calls (budget 60)`);
      await ctx.shot(`g-${name}`);
    }
    const lib3 = (await ctx.state()).art!;
    console.log(`  room-art: R3 = ${chamber.sprites} sprites · worst ${worstChamber} draw calls (budget 60) · art ${lib3.pages} pages, ${(lib3.bytes / 1048576).toFixed(1)} MiB resident`);
    assert.ok(lib3.bytes < MEMORY_BUDGET_MIB.zone * MIB, `R3's pages fit the proposed memory budget of ${MEMORY_BUDGET_MIB.zone} MiB (${(lib3.bytes / 1048576).toFixed(1)} MiB)`);
    assert.deepEqual(ctx.warnings.filter((w) => w.includes('[art]')), [], 'the library had nothing to say about the art of R3');
    // the door of the ward follows its gate, like any door: whole while the ward holds it, gone once it is broken
    const doorOf = (): Promise<{ alpha: number; visible: boolean } | null> =>
      ctx.page.evaluate(`(() => { const d = window.__troid.game.roomArt.door('seal_gate'); return d ? { alpha: d.alpha, visible: d.visible } : null; })()`) as Promise<{ alpha: number; visible: boolean } | null>;
    assert.deepEqual(await doorOf(), { alpha: 1, visible: true }, 'the door of the ward is drawn, whole');
    await ctx.page.evaluate("window.__troid.session.flags.set('broken:r3_seal')");
    await ctx.step(2);
    await ctx.page.waitForFunction("(() => { const d = window.__troid.game.roomArt.door('seal_gate'); return d && d.alpha === 0 && !d.visible; })()", undefined, { timeout: 8000 });
    // no art: the blockout draws the sigil and the card, as it always did
    await ctx.open('room=r3_chamber&paused=1&art=', PHONE);
    await ctx.page.waitForTimeout(800);
    assert.equal((await ctx.state()).roomArt, null, 'no art: nothing dresses R3');
    assert.deepEqual(await sealView(), { shapes: [true, true, true], art: 0, flash: null }, 'the seal draws its own shapes');
    assert.deepEqual(await ctx.page.evaluate('window.__troid.game.interactableViews.covered'), [], 'and the card is the blockout\'s');

    // ================================================================================================ H · R4: the hall, the doors of the arena, the shrine of the last rest, the rune of the Air Dash
    await ctx.open('room=r4_sanctum&paused=1', PHONE);
    const sanctum = (await waitFor(ctx, 'R4 dressed with the art', (s) => s.roomArt !== null && s.roomArt !== undefined)).roomArt!;
    assert.deepEqual([...sanctum.solids].sort(), R4.solids.map((x) => x.id).sort(), 'every solid of R4 — the floor, the walls and the two doors of the arena — is drawn by the art');
    assert.deepEqual([...sanctum.gates].sort(), ['arena_door_e', 'arena_door_w'], 'both doors of the arena');
    assert.deepEqual([...sanctum.exits].sort(), ['east', 'west'], 'and both ways out');
    assert.deepEqual([...sanctum.interactables].sort(), ['reward_air_dash', 'shrine'], 'the shrine of the last rest and the rune of the Air Dash');
    assert.deepEqual(sanctum.guardians, ['ink_warden'], 'and the Ink Warden: the art has every part of it');
    assert.deepEqual(sanctum.lacking, {}, 'the art lacks nothing R4 asks for: with it, all of the environment the world asks for is drawn by art');
    assert.deepEqual(sanctum.notes, [], 'and nothing it says about its strips or its foreground');
    assert.ok(sanctum.sprites > 250, `the hall is dressed (${sanctum.sprites} sprites)`);
    assert.deepEqual([...((await ctx.page.evaluate('window.__troid.game.interactableViews.covered')) as string[])].sort(), ['reward_air_dash', 'shrine'], 'the blockout\'s marks of the shrine and the reward are not drawn');
    await ctx.shot('h-00-the-sanctum');
    // the shrine rests until it is the checkpoint; the rune is not there until the Warden has fallen
    await ctx.page.waitForTimeout(300);
    const restShrine = await interactive('shrine', 'propsBack');
    assert.ok(restShrine !== null && restShrine.lit !== null, 'the shrine has two frames: resting and lit');
    assert.equal(restShrine!.lit, 0, 'it is not the checkpoint of this playground: the lit frame is off');
    const waiting = await interactive('reward_air_dash', 'lightOverlay');
    assert.ok(waiting === null || !waiting.visible, 'the rune of the Air Dash is not there while the Warden stands');
    // the doors of the arena follow the fight: open (nothing drawn) until the hero is in the arena, then shut
    const doorArt = `(() => { const w = window.__troid.game.roomArt.door('arena_door_w'); const e = window.__troid.game.roomArt.door('arena_door_e'); return w && e ? [w.alpha, w.visible, e.alpha, e.visible] : null; })()`;
    await ctx.page.waitForFunction(`(() => { const d = ${doorArt}; return d && d[0] === 0 && !d[1] && d[2] === 0 && !d[3]; })()`, undefined, { timeout: 8000 });
    await ctx.teleport(30, 0);
    await ctx.step(10);
    await ctx.page.waitForFunction(`(() => { const d = ${doorArt}; return d && d[0] === 1 && d[1] && d[2] === 1 && d[3]; })()`, undefined, { timeout: 8000 });
    await ctx.shot('h-01-the-doors-shut');
    // the Warden falls (its flag): the rune of the Air Dash floats over the dais until it is taken
    await ctx.page.evaluate("window.__troid.session.flags.set('defeated:r4_boss')");
    await ctx.step(2);
    await ctx.page.waitForFunction(
      `(() => { const c = window.__troid.game.renderer.layers.lightOverlay.children.find((x) => x.label === 'art:interactable:reward_air_dash'); return c && c.visible; })()`,
      undefined,
      { timeout: 8000 },
    );
    // the draw calls along the room: the portal, the shrine, the door, the arena, the Warden's bed, the dais, the way out
    let worstSanctum = 0;
    for (const [name, x] of [['start', 4], ['shrine', 14], ['door', 24], ['arena', 46], ['bed', 60], ['dais', 84], ['out', 96]] as const) {
      await ctx.teleport(x, 0);
      await ctx.page.evaluate('window.__troid.settleCamera(5)');
      await ctx.page.waitForTimeout(400);
      const g = await ctx.state();
      worstSanctum = Math.max(worstSanctum, g.drawsMax ?? 0);
      assert.ok((g.drawsMax ?? 0) <= 60, `R4 ${name}: ${g.drawsMax} draw calls (budget 60)`);
      await ctx.shot(`h-${name}`);
    }
    const lib4 = (await ctx.state()).art!;
    console.log(`  room-art: R4 = ${sanctum.sprites} sprites · worst ${worstSanctum} draw calls (budget 60) · art ${lib4.pages} pages, ${(lib4.bytes / 1048576).toFixed(1)} MiB resident`);
    assert.ok(lib4.bytes < MEMORY_BUDGET_MIB.zone * MIB, `R4's pages fit the proposed memory budget of ${MEMORY_BUDGET_MIB.zone} MiB (${(lib4.bytes / 1048576).toFixed(1)} MiB)`);
    assert.deepEqual(ctx.warnings.filter((w) => w.includes('[art]')), [], 'the library had nothing to say about the art of R4');
    // no art: the blockout draws the doors, the shrine and the reward, as it always did
    await ctx.open('room=r4_sanctum&paused=1&art=', PHONE);
    await ctx.page.waitForTimeout(800);
    assert.equal((await ctx.state()).roomArt, null, 'no art: nothing dresses R4');
    assert.deepEqual(await ctx.page.evaluate('window.__troid.game.interactableViews.covered'), [], 'the shrine and the reward are the blockout\'s');
    assert.equal((await boss()).shapes > 5, true, 'and the Warden is drawn by its shapes');

    // ================================================================================================ I · the Ink Warden, and the arena that answers it
    await ctx.open('room=r4_sanctum&paused=1', PHONE);
    await waitFor(ctx, 'R4 dressed with the art', (s) => s.roomArt !== null && s.roomArt !== undefined);
    await ctx.page.waitForTimeout(400);
    const painted = await boss();
    assert.equal(painted.found, true, 'the Warden has a view');
    assert.equal(painted.shapes, 0, 'drawn by the parts of its art: none of its shapes is on');
    assert.ok(painted.sprites >= 6, `and its parts are there: pool, body, flash, eye, crest and two shards (${painted.sprites} sprites)`);
    await ctx.teleport(52, 0);
    await ctx.page.evaluate('window.__troid.settleCamera(5)');
    await ctx.page.waitForTimeout(300);
    await ctx.shot('i-00-the-warden-asleep');
    // the scenery that answers the world: nothing is on while the Warden sleeps
    const levels = async (piece: string): Promise<number[]> => ((await ctx.state()).roomArtGates ?? []).filter((g) => g.piece === piece).map((g) => g.level);
    assert.deepEqual(await levels('eye_awake'), [0], 'the eye of the wall is not burning');
    assert.deepEqual(await levels('eye_dead'), [0], 'and not closed');
    assert.deepEqual(await levels('ring_arena'), [0], 'the ring on the floor is not burning');
    assert.deepEqual(await levels('beam_a'), [0], 'the reward is dark');
    const settled = async (piece: string, want: number, what: string): Promise<void> => {
      for (let i = 0; i < 160; i++) {
        const l = await levels(piece);
        if (l.length > 0 && l.every((v) => Math.abs(v - want) < 0.01)) return;
        await ctx.page.waitForTimeout(50);
      }
      throw new Error(`${what}: ${piece} is at ${JSON.stringify(await levels(piece))}, not ${want}`);
    };
    // the fight is on (the volatile flag the room's own data names): the eye burns and fades in, it does not pop
    await ctx.page.evaluate("window.__troid.session.flags.set('~fight:r4_boss')");
    await ctx.page.waitForTimeout(300);
    const midway = (await levels('eye_awake'))[0]!;
    assert.ok(midway > 0 && midway < 1, `the eye fades in (${midway.toFixed(2)} a third of a second after the fight began)`);
    await settled('eye_awake', 1, 'the fight is on');
    await settled('ring_arena', 1, 'the fight is on');
    assert.deepEqual(await levels('eye_dead'), [0], 'the eye is not closed while the Warden fights');
    await ctx.shot('i-01-the-eye-burns');
    // the Warden falls: the eye lets go and closes, the ring settles, and the reward comes on
    await ctx.page.evaluate("window.__troid.session.flags.set('defeated:r4_boss')");
    await settled('eye_awake', 0, 'the Warden has fallen');
    await settled('eye_dead', 1, 'the Warden has fallen');
    await settled('ring_arena', 0, 'the Warden has fallen');
    await settled('beam_a', 1, 'the Warden has fallen');
    await settled('glow_cyan', 1, 'the Warden has fallen');
    await ctx.shot('i-02-the-eye-closes');
    // the scenery only READS: the flags are exactly what the simulation set
    const flags = (await ctx.state()).flags ?? [];
    assert.ok(flags.includes('defeated:r4_boss') && flags.includes('~fight:r4_boss'), 'the two flags are the ones the test set');
    assert.equal(flags.filter((f) => !['defeated:r4_boss', '~fight:r4_boss'].includes(f) && /r4|eye|ring|reward/.test(f)).length, 0, 'and the art set none of its own');
    // a room that is built again with the Warden fallen shows its dead eye at once (nothing fades in): the levels are put at their targets the first time they are read
    await ctx.page.evaluate('window.__troid.game.roomDirty = true');
    await ctx.step(1);
    await ctx.page.waitForFunction(`(() => { const g = window.__troid.state().roomArtGates || []; return g.length > 0; })()`, undefined, { timeout: 8000 });
    // (three frames of the page, not a stretch of the clock: the levels are put at their targets by the first frame that reads them, and one slow frame of a loaded machine can be longer than any stretch that would still tell "at once" from the 0.9 s fade)
    await ctx.page.evaluate('new Promise((done) => { let n = 3; const tick = () => { if (--n <= 0) done(undefined); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })');
    assert.deepEqual(await levels('eye_dead'), [1], 'rebuilt with the Warden fallen: the eye is closed at once, not fading in');
    assert.deepEqual(await levels('eye_awake'), [0], 'and the burning eye is not there');

    // ================================================================================================ J · the Ink Slimes
    for (const room of ['r1_gate', 'r2_hall']) {
      await ctx.open(`room=${room}&paused=1`, PHONE);
      const st = await waitFor(ctx, `${room} dressed with the art`, (x) => x.roomArt !== null && x.roomArt !== undefined);
      assert.deepEqual(st.roomArt!.creatures, ['ink_slime'], `${room}: the art has every part of the Ink Slime`);
      assert.deepEqual(st.roomArt!.lacking, {}, `${room}: and the art lacks nothing`);
      await ctx.page.waitForTimeout(300);
      const slime = await slimeOf(ctx);
      assert.equal(slime.found, true, `${room}: the Slime has a view`);
      assert.equal(slime.shapes, 0, `${room}: drawn by the parts of its art: none of its shapes is on`);
      assert.ok(slime.sprites >= 8, `${room}: and its parts are there: pool, body, bristle, sigil, eyes, flash and the soft lights (${slime.sprites} sprites)`);
      assert.equal(slime.spines, false, `${room}: the bristle is down while it sleeps`);
      const draws = (await ctx.state()).drawsMax ?? 99;
      assert.ok(draws <= 60, `${room}: ${draws} draw calls with the Slime dressed`);
    }
    // the bristle rises as it winds up: the Slime of R1 meets the hero and the warning builds
    await ctx.open('room=r1_gate&paused=1', PHONE);
    await waitFor(ctx, 'R1 dressed with the art', (x) => x.roomArt !== null && x.roomArt !== undefined);
    await ctx.page.evaluate('window.__troid.game.debug.set("godMode", true)');
    await ctx.teleport(91, 0);
    await ctx.page.evaluate('window.__troid.settleCamera(5)');
    let wound = false;
    for (let i = 0; i < 160 && !wound; i++) {
      await ctx.step(2);
      const e = (await ctx.state()).enemies?.[0];
      if (e?.state === 'telegraph' && e.phaseT > 0.85) {
        await ctx.page.waitForTimeout(80);
        wound = (await slimeOf(ctx)).spines;
        if (wound) await ctx.shot('j-00-the-slime-winds-up');
      }
    }
    assert.equal(wound, true, 'the bristle is up as the Slime is about to strike');
    await ctx.page.evaluate('window.__troid.game.debug.set("godMode", false)');
    // with the blockout (`?art=`) the Slime is drawn by its shapes, as ever
    await ctx.open('room=r1_gate&paused=1&art=', PHONE);
    await ctx.page.waitForTimeout(800);
    assert.equal((await ctx.state()).roomArt, null, 'no art: nothing dresses R1');
    const naked = await slimeOf(ctx);
    assert.equal(naked.found, true);
    assert.ok(naked.shapes >= 3, `and the Slime is drawn by its shapes (${naked.shapes})`);
    // R3 has no Slime and holds none of its art: the pack follows the zone, and the art of a zone that has let go is not drawn
    await ctx.open('room=r3_chamber&paused=1', PHONE);
    const hall = await waitFor(ctx, 'R3 dressed with the art', (x) => x.roomArt !== null && x.roomArt !== undefined);
    assert.deepEqual(hall.roomArt!.creatures, [], 'R3 holds no Slime art');
    assert.equal(((await ctx.state()).art?.packList ?? []).find((p) => p.id === 'ink-slime') !== undefined, true, 'the pack is in the library');

    // ================================================================================================ K · the guardians of the engine
    const tyrant = createArtFixture(TYRANT);
    try {
      await ctx.open('room=rt_arena&paused=1&art=boss-test&visual=placeholder', { ...PHONE, prepare: async (context) => tyrant.serve(context, 'boss-test') });
      const st = await waitFor(ctx, 'the room with the art of the Root Tyrant', (x) => x.roomArt !== null && x.roomArt !== undefined && (x.roomArt.creatures ?? []).length > 0);
      assert.deepEqual(st.roomArt!.creatures, ['boss_root_tyrant'], 'the art has every part of the Root Tyrant: six parts tagged with the look of the boss, and both anchors on the body');
      // (the view of a boss is a chunk of its own: it arrives after the room)
      let dressed = await engineBossOf(ctx);
      for (let i = 0; i < 200 && !(dressed.found && dressed.sprites > 0); i++) {
        await ctx.page.waitForTimeout(50);
        dressed = await engineBossOf(ctx);
      }
      assert.equal(dressed.found, true, 'the Root Tyrant has a view');
      assert.equal(dressed.shapes, 0, 'drawn by the parts of its art: none of its shapes is on');
      assert.ok(dressed.sprites >= 8, `and its parts are there: pool, body, bristle, sigil, eyes, flash and the soft lights (${dressed.sprites} sprites)`);
      await ctx.shot('k-00-the-tyrant-with-art');
    } finally {
      tyrant.cleanup();
    }
    // with the blockout (`?art=`) the same boss is drawn by its shapes, as ever
    await ctx.open('room=rt_arena&paused=1&art=', PHONE);
    let blockoutBoss = await engineBossOf(ctx);
    for (let i = 0; i < 200 && !blockoutBoss.found; i++) {
      await ctx.page.waitForTimeout(50);
      blockoutBoss = await engineBossOf(ctx);
    }
    assert.equal(blockoutBoss.found, true, 'the Root Tyrant has a view without art');
    assert.ok(blockoutBoss.shapes >= 3, `and it is drawn by its shapes (${blockoutBoss.shapes})`);
  },
};
