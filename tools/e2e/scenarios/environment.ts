import assert from 'node:assert/strict';
import { ROOMS } from '@/content';
import { ENV_LAYERS, PARALLAX_FACTOR } from '@/presentation/environment';
import { frames } from '../frames';
import type { GameState, Scenario } from '../scenario';

/**
 * THE ENVIRONMENT CONTRACT in a real browser (docs/ART-PIPELINE-2D.md, part I) — the BLOCKOUT that the scenery will replace, held to the rules the scenery will obey:
 *
 *   A · each piece of a room's data has its drawn object, in the layer the contract says, and nothing is left over: terrain = the solids' block + one per gate + one per
 *       hazard, three parallax strips and a foreground when the room has a backdrop, a shaft per exit and a floating mark per pickup in the light layer — in every room of
 *       the world, loaded one by one
 *   B · the parallax layers sit where the contract says as the camera moves: `layer = (1 − factor) × the world's pivot`, so the far scenery lags, the near moves almost with the
 *       world and the foreground runs ahead of it
 */
const SIZE = { width: 844, height: 390, dpr: 1 };

export const environment: Scenario = {
  name: 'environment',
  async run(ctx) {
    // ================================================================================================ A · each piece of data, its drawn object
    for (const id of ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']) {
      const room = ROOMS[id]!;
      await ctx.open(`room=${id}`, SIZE);
      await ctx.step(10);
      const s = await ctx.state();
      assert.equal(s.room, id);
      const scene = s.scene!;
      const backdrop = room.art ? 1 : 0;
      const expected = {
        terrain: 1 + (room.gates?.length ?? 0) + (room.hazards?.length ?? 0), // the solids' block, each door on its own (so it can dissolve), each zone of thorns
        backdropFar: backdrop,
        backdropMid: backdrop,
        backdropNear: backdrop,
        foreground: backdrop,
        lightOverlay: (room.exits?.length ?? 0) + (room.interactables ?? []).filter((i) => i.kind === 'pickup').length, // a shaft per exit, a floating mark per pickup
      };
      for (const [layer, n] of Object.entries(expected)) assert.equal(scene[layer], n, `${id}: ${layer} holds ${scene[layer]} objects, the room's data asks for ${n}`);
    }

    // ================================================================================================ B · parallax: layer = (1 − factor) × pivot
    await ctx.open('', SIZE);
    const layerOf: Record<string, keyof NonNullable<GameState['parallax']>['layers']> = { backdropFar: 'backdropFar', backdropMid: 'backdropMid', backdropNear: 'backdropNear', foreground: 'foreground' };
    const settled = async (x: number): Promise<NonNullable<GameState['parallax']>> => {
      await ctx.teleport(x, 0);
      await ctx.page.evaluate('window.__troid.settleCamera(4)');
      let p: GameState['parallax'];
      for (let i = 0; i < 60; i++) {
        await frames(ctx.page, 2);
        p = (await ctx.state()).parallax;
        // the layers follow the camera in the render loop: wait until they have been placed for THIS position
        if (p && Math.abs(p.pivot.x - x) < 8 && Math.abs(p.layers.backdropFar.x - (1 - PARALLAX_FACTOR.backdropFar) * p.pivot.x) < 0.05) break;
      }
      return p!;
    };
    const near = await settled(20);
    const far = await settled(80);
    assert.ok(far.pivot.x - near.pivot.x > 30, `the camera travelled (${near.pivot.x.toFixed(1)} → ${far.pivot.x.toFixed(1)})`);
    for (const [layer, key] of Object.entries(layerOf)) {
      const f = PARALLAX_FACTOR[layer as keyof typeof PARALLAX_FACTOR];
      for (const p of [near, far]) {
        assert.ok(Math.abs(p.layers[key].x - (1 - f) * p.pivot.x) < 0.05, `${layer} at pivot ${p.pivot.x.toFixed(2)}: ${p.layers[key].x.toFixed(3)} m, the contract says ${((1 - f) * p.pivot.x).toFixed(3)} m`);
      }
      // what the camera covered, a layer covered f of: its screen position moves by f × the travel
      const moved = (far.layers[key].x - far.pivot.x) - (near.layers[key].x - near.pivot.x); // (position relative to the world, in view space)
      const travelled = far.pivot.x - near.pivot.x;
      assert.ok(Math.abs(moved + f * travelled) < 0.08, `${layer} moved ${(-moved).toFixed(2)} m of ${travelled.toFixed(2)} m of camera: factor ${f}`);
    }
    // the order: far < mid < near < the world < the foreground
    const lag = (p: NonNullable<GameState['parallax']>) => ['backdropFar', 'backdropMid', 'backdropNear', 'foreground'].map((k) => p.layers[k as keyof typeof p.layers].x);
    const [a, b, c, d] = lag(far) as [number, number, number, number];
    assert.ok(a > b && b > c && c > 0 && d < 0, `far ${a.toFixed(1)} > mid ${b.toFixed(1)} > near ${c.toFixed(1)} > 0 > foreground ${d.toFixed(1)}`);
    // and the contract's table says the same factors the scene uses
    for (const l of ENV_LAYERS) if (l.id in PARALLAX_FACTOR) assert.equal(l.parallax, PARALLAX_FACTOR[l.id as keyof typeof PARALLAX_FACTOR]);
    assert.equal(ctx.errors.length, 0);
  },
};
