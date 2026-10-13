import assert from 'node:assert/strict';
import { FIGHT_MOOD, moodFor } from '@/content/atmosphere';
import { LIGHT_STRENGTH } from '@/content/lights';
import { PALETTE } from '@/presentation/palette';
import { lightCapacity, pulseCapacity } from '@/presentation/lighting';
import type { QualityTier } from '@/presentation/viewport';
import { frames } from '../frames';
import { decodePng, type Image } from '../png';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE LIGHT OF THE WORLD AND THE ATMOSPHERE OF THE SCREEN, in the real game (docs/PROMPT8-LOG.md, phase I): the hero carries a soft cyan light that grows with their magic and gives way to the violet of a warning; a
 * bolt lights the room it crosses; the guardian is a big violet light; the moments of the game leave light where they happen. All of it BEHIND the actors, so the silhouette is cut out against it: the picture around the
 * hero is LIGHTER with the light than without it (the hero is nearly black: a dark thing against a lit one is what the eye finds first), the ground under them is lit, and the screen closes the night of its room in
 * from the corners without taking a thing from the middle. The edge of the screen answers a blow taken and a power gained. With `?light=off` the game is exactly the game it was. Draw calls stay ≤ 60 and the console
 * stays clean (the runner fails the scenario otherwise).
 */
const SIZE = { width: 844, height: 390, dpr: 1 };

type Rect = { x0: number; y0: number; x1: number; y1: number };

async function until(ctx: Ctx, what: string, ok: (s: GameState) => boolean, ms = 20000): Promise<GameState> {
  const t0 = Date.now();
  let s = await ctx.state();
  while (!ok(s)) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for ${what}`);
    await ctx.page.waitForTimeout(80);
    s = await ctx.state();
  }
  return s;
}

/** Mean luminance (0–1, gamma-encoded) of the pixels of a rectangle that are not inside the hole. */
function luma(img: Image, r: Rect, hole?: Rect): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(r.y0)); y < Math.min(img.height, Math.ceil(r.y1)); y++) {
    for (let x = Math.max(0, Math.floor(r.x0)); x < Math.min(img.width, Math.ceil(r.x1)); x++) {
      if (hole && x >= hole.x0 && x < hole.x1 && y >= hole.y0 && y < hole.y1) continue;
      const o = (y * img.width + x) * 4;
      sum += (0.2126 * img.data[o]! + 0.7152 * img.data[o + 1]! + 0.0722 * img.data[o + 2]!) / 255;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

const linear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const relative = (rgb: number): number => 0.2126 * linear((rgb >> 16) & 0xff) + 0.7152 * linear((rgb >> 8) & 0xff) + 0.0722 * linear(rgb & 0xff);

/**
 * The contrast (WCAG: (L + 0.05) / (Link + 0.05)) of the ink of the hero against the mean light of a rectangle round them, outside the hole where they stand — docs/GAME-SPEC-2D.md §3.3 asks for 2.5 : 1 in a ring of
 * 1 m round the silhouette, as the warning level (a nearly black hero on a dark room: the eyes carry the rest).
 */
function contrastAround(img: Image, r: Rect, hole: Rect): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(r.y0)); y < Math.min(img.height, Math.ceil(r.y1)); y++) {
    for (let x = Math.max(0, Math.floor(r.x0)); x < Math.min(img.width, Math.ceil(r.x1)); x++) {
      if (x >= hole.x0 && x < hole.x1 && y >= hole.y0 && y < hole.y1) continue;
      const o = (y * img.width + x) * 4;
      sum += 0.2126 * linear(img.data[o]!) + 0.7152 * linear(img.data[o + 1]!) + 0.0722 * linear(img.data[o + 2]!);
      n++;
    }
  }
  return (sum / Math.max(1, n) + 0.05) / (relative(PALETTE.heroInk) + 0.05);
}

/** Mean of one channel (0–255) over a rectangle. */
function channel(img: Image, r: Rect, c: 0 | 1 | 2): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(r.y0)); y < Math.min(img.height, Math.ceil(r.y1)); y++) {
    for (let x = Math.max(0, Math.floor(r.x0)); x < Math.min(img.width, Math.ceil(r.x1)); x++) {
      sum += img.data[(y * img.width + x) * 4 + c]!;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

export const lighting: Scenario = {
  name: 'lighting',
  async run(ctx) {
    const sess = (code: string): Promise<unknown> => ctx.page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);
    const hooks = (expr: string): Promise<unknown> => ctx.page.evaluate(`window.__troid.${expr}`);
    let worst = 0;
    const state = async (): Promise<GameState> => {
      const s = await ctx.state();
      worst = Math.max(worst, s.drawsMax ?? 0);
      return s;
    };
    /** Lets the effects run `seconds` of their own time — after the game has drawn a frame or two, so the lights have read what the simulation says NOW. */
    const advance = async (seconds: number): Promise<void> => {
      await frames(ctx.page, 3);
      await hooks(`advanceEffects(${seconds})`);
    };
    const level = (s: GameState, kind: string): number | undefined => s.lights?.lights.find((l) => l.kind === kind)?.level;
    const kinds = (s: GameState): string[] => (s.lights?.lights ?? []).map((l) => l.kind).sort();
    const shot = async (): Promise<Image> => decodePng(await ctx.page.screenshot());
    /** The game, paused, with the effects settled, the hero at `x` of `room`. */
    const stand = async (room: string, x: number, query = ''): Promise<GameState> => {
      await ctx.open(`room=${room}&unlock=dash&paused=1${query}`, SIZE);
      await until(ctx, 'the effects and the room dressed', (s) => !!s.roomArt && s.vfxLook !== null && s.vfxLook !== undefined);
      await ctx.teleport(x, 0);
      await hooks('settleCamera(4)');
      await ctx.step(2);
      await advance(3);
      await ctx.page.waitForTimeout(250);
      return state();
    };

    // ================================================================================================ the hero's light
    let s = await stand('r1_gate', 6);
    const tier = s.quality!.tier as QualityTier;
    assert.ok(s.lights, 'the world has its light');
    assert.equal(s.lights!.capacity, lightCapacity(tier), 'the profile draws as many lights as it says');
    assert.equal(s.lights!.pulseCapacity, pulseCapacity(tier));
    assert.deepEqual(kinds(s), ['floor', 'hero'], 'the hero carries a light about them and a pool of it on the ground, and nothing else is lit in a quiet room');
    assert.deepEqual([s.screen!.room, s.screen!.fighting, s.screen!.pulses], ['r1_gate', false, []], 'the screen has the night of its room');
    assert.ok(Math.abs(s.screen!.strength - moodFor('r1_gate').strength) < 0.01, `and it is at its dark (${s.screen!.strength})`);
    const heroAt = s.lights!.lights.find((l) => l.kind === 'hero')!;
    const feetAt = s.lights!.lights.find((l) => l.kind === 'floor')!;
    assert.ok(Math.abs(heroAt.x - s.x) < 0.05 && Math.abs(feetAt.x - s.x) < 0.05, 'the lights stand where the hero stands');
    assert.ok(heroAt.y < feetAt.y, 'the light of the hero is about their chest, over the pool at their feet (view space: up is less)');
    await sess('s.magic.restore();');
    await advance(2);
    const full = level(await state(), 'hero')!;
    assert.ok(Math.abs(full - LIGHT_STRENGTH.hero[1]) < 0.01, `with all their magic the hero\'s light is at its strongest (${full.toFixed(3)})`);
    await sess('s.magic.spend(s.magic.current);');
    await advance(2);
    const spent = level(await state(), 'hero')!;
    assert.ok(spent < full - 0.05, `the hero who is spent is dimmer (${spent.toFixed(3)} < ${full.toFixed(3)})`);
    assert.ok(spent >= LIGHT_STRENGTH.hero[0] - 0.01, `but never dark (${spent.toFixed(3)})`);
    await sess('s.magic.restore();');
    await advance(2);
    await ctx.shot('01-the-hero-carries-light');

    // ================================================================================================ the Spirit Bolt lights the room it crosses
    await sess('s.loadout.acquire("card_spirit_bolt"); s.magic.restore();');
    await advance(3); // (gaining the card is a moment of its own)
    await ctx.step(40);
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 6; e.body.vx = 0; }');
    await ctx.step(1);
    await ctx.page.keyboard.down('KeyK');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyK');
    for (let i = 0; i < 12 && (await state()).state !== 'cast'; i++) await ctx.step(1);
    s = await state();
    assert.equal(s.state, 'cast', 'the hero is casting');
    assert.ok(s.lights!.pulses >= 1, `the power gathering leaves light in the hand (${s.lights!.pulses} pulse)`);
    for (let i = 0; i < 12 && (await state()).projectiles!.length === 0; i++) await ctx.step(1);
    await ctx.step(4);
    await advance(0.3);
    s = await state();
    assert.equal(s.projectiles!.length, 1, 'the bolt is in flight');
    const bolt1 = s.lights!.lights.find((l) => l.kind === 'bolt');
    assert.ok(bolt1 && bolt1.level >= LIGHT_STRENGTH.bolt - 0.02, `and it lights the room it crosses (${bolt1?.level.toFixed(3)})`);
    await ctx.shot('02-the-bolt-lights-the-room');
    await ctx.step(6);
    await advance(0.1);
    const bolt2 = (await state()).lights!.lights.find((l) => l.kind === 'bolt');
    assert.ok(bolt2 && bolt2.x > bolt1.x + 0.5, `the light goes with it (${bolt1.x.toFixed(2)} → ${bolt2?.x.toFixed(2)})`);
    for (let i = 0; i < 30 && (await state()).projectiles!.length > 0; i++) await ctx.step(2);
    s = await state();
    assert.ok(s.lights!.pulses >= 1, `where it lands it leaves a light of its own (${s.lights!.pulses})`);
    await advance(0.08);
    await ctx.shot('03-the-bolt-lands');
    await advance(3);
    s = await state();
    assert.equal(s.lights!.pulses, 0, 'and the light of the moment goes out');
    assert.equal(level(s, 'bolt'), undefined, 'with the bolt');
    assert.ok(kinds(s).includes('hero') && kinds(s).includes('floor'), 'the hero\'s own light stays');

    // ================================================================================================ an enemy that winds up takes the dark from the hero, and the warning is violet
    s = await stand('r1_gate', 4);
    await sess('s.magic.restore();');
    await advance(2);
    const calm = level(await state(), 'hero')!;
    await hooks('spawnSlime(8.5, 0, -1)');
    await ctx.step(2);
    for (let i = 0; i < 300 && (await state()).enemies?.find((e) => e.x < 20)?.state !== 'telegraph'; i++) await ctx.step(1);
    await ctx.step(18);
    await frames(ctx.page, 3); // (the lights read what the simulation says when a frame is drawn)
    s = await state();
    const foe = s.lights!.lights.find((l) => l.kind === 'foe');
    assert.ok(foe && foe.level > LIGHT_STRENGTH.foe.awake + 0.05, `an enemy that winds up lights its warning (${foe?.level.toFixed(3)}; ${JSON.stringify(s.enemies?.map((e) => [e.id, e.state, e.anim, +e.phaseT.toFixed(2), +e.x.toFixed(1)]))})`);
    const ducked = level(s, 'hero')!;
    assert.ok(ducked < calm * 0.7, `and takes the dark from the hero\'s light: ${calm.toFixed(3)} → ${ducked.toFixed(3)} (a violet warning must stay violet)`);
    assert.ok(ducked > 0.05, 'without ever putting it out');
    await ctx.shot('04-the-warning-is-violet');

    // ================================================================================================ the hero falls: their light goes with them
    await hooks('game.debug.set("godMode", false)');
    await sess('s.player.health.damage(s.player.health.current - 1);');
    await hooks('strikePlayer(1)');
    await ctx.step(2);
    await advance(0.05);
    s = await state();
    assert.notEqual(s.death?.phase, 'none', 'the hero fell');
    assert.ok(!kinds(s).includes('hero') && !kinds(s).includes('floor'), `a fallen hero casts no light (${kinds(s).join(', ')})`);
    assert.ok(s.lights!.pulses >= 1, 'and what they were bursts out where they fell');

    // ================================================================================================ the guardian is a big violet light, and the night closes in on the fight
    s = await stand('r4_sanctum', 15);
    assert.equal(level(s, 'boss'), undefined, 'the guardian is far: nothing of it is lit yet');
    assert.equal(s.screen!.fighting, false);
    const calmDark = s.screen!.strength;
    const b = s.boss!;
    await ctx.teleport(b.x - 7, 0);
    await hooks('settleCamera(4)');
    await ctx.step(120);
    s = await state();
    assert.ok(s.lights!.pulses >= 1, 'the waking left a light of its own');
    await advance(2);
    s = await state();
    assert.notEqual(s.boss!.state, 'dormant', 'the guardian woke');
    const boss = s.lights!.lights.find((l) => l.kind === 'boss');
    assert.ok(boss && boss.level >= LIGHT_STRENGTH.boss.awake - 0.02, `awake, the guardian is a violet light (${boss?.level.toFixed(3)})`);
    assert.equal(s.screen!.fighting, true, 'and the screen knows there is a fight');
    assert.ok(s.screen!.strength > calmDark + 0.03 && Math.abs(s.screen!.strength - FIGHT_MOOD.strength) < 0.01, `the night closes in (${calmDark.toFixed(2)} → ${s.screen!.strength.toFixed(2)})`);
    await ctx.shot('05-the-guardian-wakes');

    // ================================================================================================ the picture: lighter around the hero, the ground lit, the corners in the dark of the room
    const rooms: Array<[string, number]> = [['r1_gate', 6], ['r2_hall', 8], ['r3_chamber', 28], ['r4_sanctum', 15]];
    const rows: string[] = [];
    for (const [room, x] of rooms) {
      const portrait = async (query: string): Promise<{ ring: number; floor: number; corners: number; contrast: number }> => {
        const st = await stand(room, x, query);
        const ppm = st.view!.ppm;
        const c = (await ctx.page.evaluate(`window.__troid.worldToScreen(${st.x}, ${st.y + 0.85})`)) as { x: number; y: number };
        const f = (await ctx.page.evaluate(`window.__troid.worldToScreen(${st.x}, ${st.y})`)) as { x: number; y: number };
        const img = await shot();
        const core: Rect = { x0: c.x - 0.45 * ppm, x1: c.x + 0.45 * ppm, y0: c.y - 0.75 * ppm, y1: c.y + 0.75 * ppm };
        const ring: Rect = { x0: c.x - 1.9 * ppm, x1: c.x + 1.9 * ppm, y0: c.y - 1.7 * ppm, y1: f.y - 0.05 * ppm };
        const floor: Rect = { x0: f.x - 2.5 * ppm, x1: f.x + 2.5 * ppm, y0: f.y + 0.08 * ppm, y1: f.y + 0.5 * ppm };
        const corner = (cx: number, cy: number): number => luma(img, { x0: cx, y0: cy, x1: cx + 60, y1: cy + 60 });
        if (query === '') await ctx.shot(`06-${room}-with-light`);
        else await ctx.shot(`06-${room}-without-light`);
        const around: Rect = { x0: c.x - 1.4 * ppm, x1: c.x + 1.4 * ppm, y0: c.y - 1.5 * ppm, y1: f.y - 0.05 * ppm };
        const where: Rect = { x0: c.x - 0.7 * ppm, x1: c.x + 0.7 * ppm, y0: c.y - 0.95 * ppm, y1: c.y + 0.95 * ppm };
        return { ring: luma(img, ring, core), floor: luma(img, floor), corners: (corner(0, 0) + corner(784, 0) + corner(0, 330) + corner(784, 330)) / 4, contrast: contrastAround(img, around, where) };
      };
      const on = await portrait('');
      const off = await portrait('&light=off');
      rows.push(`${room}: contrast ${off.contrast.toFixed(2)} → ${on.contrast.toFixed(2)} : 1, ring ×${(on.ring / off.ring).toFixed(2)}, floor ×${(on.floor / off.floor).toFixed(2)}, corners ×${(on.corners / off.corners).toFixed(2)}`);
      assert.ok(on.contrast >= off.contrast * 1.25 && on.contrast >= 1.5, `${room}: the hero\'s ink against what is round them reads better (${off.contrast.toFixed(2)} → ${on.contrast.toFixed(2)} : 1; the specification\'s warning is 2.5)`);
      assert.ok(on.ring > off.ring * 1.15 && on.ring > off.ring + 0.03, `${room}: the picture around the hero is lighter with the light (${off.ring.toFixed(3)} → ${on.ring.toFixed(3)}): the silhouette is cut out against it`);
      assert.ok(on.ring < 0.45, `${room}: and it is not washed out (${on.ring.toFixed(3)})`);
      assert.ok(on.floor > off.floor * 1.3, `${room}: the ground under the hero is lit (${off.floor.toFixed(3)} → ${on.floor.toFixed(3)})`);
      assert.ok(on.corners < off.corners * 0.95 && on.corners > off.corners * 0.35, `${room}: the corners are in the dark of the room, not lost in it (${off.corners.toFixed(3)} → ${on.corners.toFixed(3)})`);
    }

    // ================================================================================================ the edge of the screen answers what happens to the hero
    s = await stand('r1_gate', 6);
    const edges: Rect[] = [{ x0: 0, y0: 140, x1: 22, y1: 250 }, { x0: 822, y0: 140, x1: 844, y1: 250 }];
    const edge = (img: Image, c: 0 | 1 | 2): number => (channel(img, edges[0]!, c) + channel(img, edges[1]!, c)) / 2;
    const quiet = await shot();
    await sess('const p = s.player.body; s.bus.emit("player:hurt", { x: p.x, y: p.y, damage: 1, direction: 1 });');
    assert.deepEqual((await state()).screen!.pulses, ['hurt'], 'a blow taken');
    await advance(0.05);
    const hurt = await shot();
    assert.ok(edge(hurt, 0) > edge(quiet, 0) + 6, `reddens the edge (red ${edge(quiet, 0).toFixed(1)} → ${edge(hurt, 0).toFixed(1)})`);
    assert.ok(edge(hurt, 0) - edge(hurt, 2) > edge(quiet, 0) - edge(quiet, 2) + 6, 'and it is carmín, not a grey');
    await ctx.shot('07-a-blow-taken');
    await advance(1);
    s = await state();
    assert.deepEqual(s.screen!.pulses, [], 'and it goes');
    const after = await shot();
    assert.ok(Math.abs(edge(after, 0) - edge(quiet, 0)) < 3, `leaving the edge as it was (red ${edge(after, 0).toFixed(1)})`);
    await sess('s.bus.emit("ability:unlocked", { id: "air_dash" });');
    assert.ok((await state()).screen!.pulses.includes('power'), 'a power gained');
    await advance(0.1);
    const power = await shot();
    assert.ok(edge(power, 2) > edge(quiet, 2) + 8, `floods the edge with light (blue ${edge(quiet, 2).toFixed(1)} → ${edge(power, 2).toFixed(1)})`);
    await ctx.shot('08-a-power-gained');
    await advance(3);

    // ================================================================================================ a smaller profile draws fewer lights, and keeps the hero's
    await ctx.page.locator('[data-testid="pause-button"]').click();
    await ctx.page.waitForSelector('[data-testid="settings-menu"][data-open="1"]', { timeout: 20000 });
    await ctx.page.locator('[data-testid="settings-quality-low"]').click();
    s = await until(ctx, 'the effects to be built again', (x) => x.quality?.tier === 'low' && !!x.lights);
    assert.equal(s.lights!.capacity, lightCapacity('low'));
    assert.equal(s.lights!.pulseCapacity, pulseCapacity('low'));
    assert.deepEqual([lightCapacity('low'), pulseCapacity('low')], [3, 2], 'three lights and two pulses at most');
    await advance(2);
    assert.deepEqual(kinds(await state()), ['floor', 'hero'], 'the hero\'s light and the pool under them are among those it keeps');
    assert.ok((s.drawsMax ?? 0) <= 60, `draw calls ${s.drawsMax}`);

    // ================================================================================================ without it, the game as it was
    s = await stand('r1_gate', 6, '&light=off');
    assert.equal(s.lights, null, 'no lights of the world');
    assert.equal(s.screen, null, 'and no atmosphere on the screen');
    assert.ok(s.vfxLook, 'the effects are all there');
    await hooks('game.debug.set("godMode", true)');
    await sess('const e = s.entities.find((x) => x.kind === "enemy"); const p = s.player.body; if (e) { e.body.x = p.x + 1.5; e.body.vx = 0; }');
    await ctx.step(1);
    await ctx.page.keyboard.down('KeyJ');
    await ctx.step(1);
    await ctx.page.keyboard.up('KeyJ');
    for (let i = 0; i < 16 && (await state()).combat!.phase !== 'active'; i++) await ctx.step(1);
    s = await state();
    assert.ok(s.vfx!.spawned > 0, 'a blow still has its effects');
    assert.equal(s.lights, null);

    assert.ok(worst <= 60, `draw calls stay within the budget (worst ${worst})`);
    console.log(`  lighting: ${rows.join(' · ')} · worst frame ${worst} draw calls`);
  },
};
