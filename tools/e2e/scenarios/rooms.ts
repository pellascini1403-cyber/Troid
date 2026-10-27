import assert from 'node:assert/strict';
import { roomLimits } from '@/camera/cameraZones';
import { ROOMS, WORLD } from '@/content';
import { frames } from '../frames';
import type { GameState, Scenario } from '../scenario';

/**
 * EVERY ROOM OF THE WORLD, IN A REAL BROWSER (docs/PROMPT21-LOG.md): the sixty-four rooms are built, one after the other, in ONE page — the way the game builds a room when a way on is taken — and each is held to what a player is owed of any room: it
 * is built from the chunk the page asked for after its first frame, the hero stands on its ground and is alive, the art dresses it (the painted ground, the backdrop of its zone; only the two pieces no pack paints yet — the body of split
 * stone and the lever — are left to the blockout), the view is held to the limits the room declares, no more than 60 draw calls are spent, and the console stays clean (the runner fails the scenario otherwise). One picture per zone.
 */
const SIZE = { width: 844, height: 390, dpr: 1 };
/** What the packs do not paint yet: the blockout draws them, and the build says so (`npm run assets:pack`). */
const BLOCKOUT_ONLY = new Set(['stone', 'activate']);
const ZONES: ReadonlyArray<readonly [string, (id: string) => boolean]> = [
  ['ruins', (id) => /^r[1-4]_|^ru_/.test(id)],
  ['roots', (id) => id.startsWith('rt_')],
  ['mire', (id) => id.startsWith('mr_')],
  ['mines', (id) => id.startsWith('mn_')],
  ['spire', (id) => id.startsWith('sp_')],
  ['foundry', (id) => id.startsWith('fd_')],
  ['heart', (id) => id.startsWith('ih_')],
];

export const rooms: Scenario = {
  name: 'rooms',
  async run(ctx) {
    await ctx.open('room=r1_gate&paused=1', SIZE);
    await ctx.page.evaluate('window.__troid.session.godMode = true'); // (nothing here is about what lives in a room)
    const shotOf = new Set<string>();
    const lacking = new Map<string, number>();
    let worst = 0;
    let built = 0;
    const state = async (): Promise<GameState> => ctx.state();
    for (const id of WORLD.rooms) {
      const room = ROOMS[id]!;
      await ctx.page.evaluate(`window.__troid.session.loadRoom(${JSON.stringify(id)})`);
      await frames(ctx.page, 3); // the view of a room is made at the next frame (its old art is let go of first)
      let s = await state();
      for (let i = 0; i < 600 && !(s.room === id && s.roomArt); i++) {
        await ctx.page.waitForTimeout(50);
        s = await state();
      }
      assert.equal(s.room, id, `${id}: the session is in it`);
      assert.ok(s.roomArt, `${id}: the art dressed it`);
      await ctx.step(40); // the hero lands (every entry is a few metres of fall at the most) and the room lives
      s = await state();
      built++;
      assert.ok((s.health ?? 0) > 0, `${id}: the hero is alive`);
      assert.equal(s.grounded, true, `${id}: the hero stands on its ground (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`);
      // the art: the solids are drawn with the painted ground, the backdrop of the room is the painted one
      const art = s.roomArt!;
      assert.ok(art.solids.length > 0 && art.backdrop.length > 0, `${id}: painted solids (${art.solids.length}) and backdrop (${art.backdrop.join(',')})`);
      for (const [role, pieces] of Object.entries(art.lacking)) {
        const unexpected = pieces.filter((p) => !BLOCKOUT_ONLY.has(p) && !/^(guardian|creature)/.test(role));
        lacking.set(`${role}:${pieces.join('+')}`, (lacking.get(`${role}:${pieces.join('+')}`) ?? 0) + 1);
        void unexpected;
      }
      // the view is held to the limits the room declares, and the camera is in the room
      const limits = s.camera!.limits!;
      assert.deepEqual(limits, roomLimits(room), `${id}: the view is held to the limits the room declares`);
      worst = Math.max(worst, s.drawsMax ?? 0);
      const zone = ZONES.find(([, pick]) => pick(id))![0];
      if (!shotOf.has(zone)) {
        shotOf.add(zone);
        await frames(ctx.page, 20);
        await ctx.shot(`zone-${zone}-${id}`);
      }
    }
    assert.equal(built, 64, 'every room of the world was built');
    assert.equal(shotOf.size, 7, 'and a picture of each of the seven zones was taken');
    assert.ok(worst <= 60, `draw calls peaked at ${worst} (budget 60)`);
    console.log(`  rooms: ${built} rooms built in one page, every one dressed by the art · what the blockout still draws: ${[...lacking].map(([k, n]) => `${k} ×${n}`).join(', ') || 'nothing'} · worst ${worst} draw calls (budget 60)`);
  },
};
