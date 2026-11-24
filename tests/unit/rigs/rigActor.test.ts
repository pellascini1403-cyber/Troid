// @vitest-environment happy-dom
import { Container, Mesh, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ANIM_STATES, type AnimPhase, type AnimState } from '@/presentation/vocabulary';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import { createRigAssets, RIGS, RigActor, seedOf, type RigDef } from '@/rigs';
import { fakeVfxAtlas } from '../../helpers/vfx';

/** The assets of a test: no canvas, so every ramp is a plain white texture. */
const assets = () => createRigAssets(fakeVfxAtlas().frames.glow, () => Texture.WHITE);

function make(def: RigDef, a = assets()): { actor: RigActor; view: ActorViewState } {
  const view = createActorViewState();
  const actor = new RigActor(def, { view }, a, seedOf(def.id));
  return { actor, view };
}

/** Every number a display object holds that could go wrong, found anywhere under `node`. */
function badNumbers(node: Container): string[] {
  const bad: string[] = [];
  const walk = (n: Container, path: string): void => {
    const vals: Record<string, number> = { x: n.position.x, y: n.position.y, sx: n.scale.x, sy: n.scale.y, rot: n.rotation, alpha: n.alpha };
    for (const [k, v] of Object.entries(vals)) if (!Number.isFinite(v)) bad.push(`${path}.${k}=${v}`);
    if (n instanceof Mesh) for (const v of n.geometry.positions) if (!Number.isFinite(v)) bad.push(`${path}.positions has ${v}`);
    n.children.forEach((c, i) => walk(c as Container, `${path}/${c.label || i}`));
  };
  walk(node, node.label || 'root');
  return bad;
}

const POSES: Array<{ anim: AnimState; phase: AnimPhase; t: number }> = [
  ...ANIM_STATES.map((anim) => ({ anim, phase: 'none' as AnimPhase, t: 0.5 })),
  { anim: 'telegraph', phase: 'startup', t: 0 },
  { anim: 'telegraph', phase: 'startup', t: 1 },
  { anim: 'attack', phase: 'active', t: 0 },
  { anim: 'attack', phase: 'active', t: 1 },
  { anim: 'idle', phase: 'recovery', t: 0 },
  { anim: 'idle', phase: 'recovery', t: 1 },
  { anim: 'death', phase: 'none', t: 0 },
  { anim: 'death', phase: 'none', t: 1 },
];

describe('every rig of the game', () => {
  const defs = Object.values(RIGS);

  it('there is at least the cave bat, and every rig is under the id of a look', () => {
    expect(defs.length).toBeGreaterThan(0);
    for (const [id, def] of Object.entries(RIGS)) expect(def.id).toBe(id);
  });

  for (const def of defs) {
    describe(def.id, () => {
      it('builds, and puts its feet where the simulation says, mirrored by the way it faces', () => {
        const { actor, view } = make(def);
        Object.assign(view, { prevX: 4, prevY: 0, x: 6, y: 2, facing: -1 });
        actor.sync(0.5, 1 / 60);
        expect(actor.root.position.x).toBeCloseTo(5, 9);
        expect(actor.root.position.y).toBeCloseTo(-1, 9);
        expect(actor.root.scale.x).toBe(-1);
        view.facing = 1;
        actor.sync(0.5, 1 / 60);
        expect(actor.root.scale.x).toBe(1);
        actor.destroy();
      });

      it('poses in every state of the vocabulary — at the start, the middle and the end of it — without a number going wrong', () => {
        const { actor, view } = make(def);
        for (const p of POSES) {
          Object.assign(view, { anim: p.anim, phase: p.phase, phaseT: p.t, animSerial: view.animSerial + 1, opacity: p.anim === 'death' ? 1 - p.t * p.t : 1 });
          for (let i = 0; i < 4; i++) actor.sync(1, 1 / 60);
          expect(badNumbers(actor.root), `${p.anim}/${p.phase}/${p.t}`).toEqual([]);
        }
        actor.destroy();
      });

      it('stays put when time is frozen (a hit-stop, the pause): no dt, no motion', () => {
        const { actor, view } = make(def);
        Object.assign(view, { anim: 'telegraph', phase: 'startup', phaseT: 0.5 });
        for (let i = 0; i < 30; i++) actor.sync(1, 1 / 60);
        const snap = (): string => JSON.stringify([actor.root.children.length, (actor.root.children[actor.root.children.length - 1] as Container).children.map((c) => [c.position.x, c.position.y, c.rotation])]);
        const before = snap();
        for (let i = 0; i < 10; i++) actor.sync(1, 0);
        expect(snap()).toBe(before);
        actor.destroy();
      });

      it('flashes white-hot when it is hit, and stops when the flash is over', () => {
        const { actor, view } = make(def);
        view.flash = 1;
        actor.sync(1, 1 / 60);
        const additive: Container[] = [];
        const walk = (n: Container): void => {
          if (n.blendMode === 'add' && n.visible && n.alpha > 0.9) additive.push(n);
          n.children.forEach((c) => walk(c as Container));
        };
        walk(actor.root);
        expect(additive.length, 'something additive and white-hot shows').toBeGreaterThan(0);
        view.flash = 0;
        actor.sync(1, 1 / 60);
        const still: Container[] = [];
        const walk2 = (n: Container): void => {
          if (n.blendMode === 'add' && n.visible && n.alpha > 0.9) still.push(n);
          n.children.forEach((c) => walk2(c as Container));
        };
        walk2(actor.root);
        expect(still.length).toBeLessThan(additive.length);
        actor.destroy();
      });

      it('is invisible when the simulation says so, and takes the art it is offered without changing', () => {
        const { actor, view } = make(def);
        view.visible = false;
        actor.sync(1, 1 / 60);
        expect(actor.root.visible).toBe(false);
        view.visible = true;
        actor.sync(1, 1 / 60);
        expect(actor.root.visible).toBe(true);
        expect(() => actor.dress(null)).not.toThrow();
        actor.destroy();
      });

      it('every mesh of it is batched (a ribbon, a membrane or a cloth over a hundred vertices would be a draw call of its own)', () => {
        const { actor } = make(def);
        const loose: string[] = [];
        const walk = (n: Container, path: string): void => {
          if (n instanceof Mesh && n.geometry.batchMode !== 'batch') loose.push(`${path} (${n.geometry.batchMode})`);
          n.children.forEach((c, i) => walk(c as Container, `${path}/${c.label || i}`));
        };
        walk(actor.root, def.id);
        expect(loose).toEqual([]);
        actor.destroy();
      });

      it('out of view it is not drawn and its clock does not run; back in view it takes up from where it was', () => {
        const a = assets();
        let inView = false;
        const asked: Array<[number, number, number]> = [];
        a.onScreen = (x, y, reach) => {
          asked.push([x, y, reach]);
          return inView;
        };
        const { actor, view } = make(def, a);
        Object.assign(view, { prevX: 10, prevY: 1, x: 12, y: 3, facing: 1 });
        actor.sync(0.5, 1 / 60);
        // asked about the interpolated place, with a reach that covers the whole creature
        expect(asked).toHaveLength(1);
        expect(asked[0]![0]).toBeCloseTo(11, 9);
        expect(asked[0]![1]).toBeCloseTo(2, 9);
        expect(asked[0]![2]).toBeGreaterThanOrEqual(Math.max(def.width, def.height));
        expect(actor.root.visible).toBe(false);
        const placed = { x: actor.root.position.x, y: actor.root.position.y };
        for (let i = 0; i < 30; i++) actor.sync(0.5, 1 / 60);
        expect(actor.root.visible).toBe(false);
        // it was not moved either: nothing of it is touched while it is out of view
        expect(actor.root.position.x).toBe(placed.x);
        expect(actor.root.position.y).toBe(placed.y);
        inView = true;
        actor.sync(0.5, 1 / 60);
        expect(actor.root.visible).toBe(true);
        expect(actor.root.position.x).toBeCloseTo(11, 9);
        expect(badNumbers(actor.root)).toEqual([]);
        actor.destroy();
      });

      it('with no way to ask whether it is in view (the lab, a test) it is always drawn', () => {
        const a = assets();
        expect(a.onScreen).toBeNull();
        const { actor, view } = make(def, a);
        Object.assign(view, { prevX: 1e6, prevY: 1e6, x: 1e6, y: 1e6 });
        actor.sync(1, 1 / 60);
        expect(actor.root.visible).toBe(true);
        actor.destroy();
      });

      it('shares its geometry between the creatures of its species: a second one builds no new shape', () => {
        const a = assets();
        const first = make(def, a);
        const count = (): number => {
          let n = 0;
          const walk = (c: Container): void => {
            n++;
            c.children.forEach((k) => walk(k as Container));
          };
          walk(first.actor.root);
          return n;
        };
        const parts = count();
        const probe = [...Array(3)].map(() => make(def, a));
        for (const p of probe) {
          const n2: number[] = [0];
          const walk = (c: Container): void => {
            n2[0]!++;
            c.children.forEach((k) => walk(k as Container));
          };
          walk(p.actor.root);
          expect(n2[0]).toBe(parts);
        }
        // the cache holds each shape once: asking for a shape of the species again hands back the one that is there
        const entry = a.shape(`${def.id}/torso`, () => undefined);
        expect(a.shape(`${def.id}/torso`, () => undefined)).toBe(entry);
      });

      it('stays within the budget of a creature on a phone: the parts are batched, so what counts is how many a frame has to place (a room holds a handful of creatures)', () => {
        const { actor } = make(def);
        let n = 0;
        let meshes = 0;
        const walk = (c: Container): void => {
          n++;
          if (c instanceof Mesh) meshes++;
          c.children.forEach((k) => walk(k as Container));
        };
        walk(actor.root);
        expect(n, 'display objects').toBeLessThanOrEqual(def.id.startsWith('boss_') ? 340 : 160);
        expect(meshes, 'meshes').toBeLessThanOrEqual(def.id.startsWith('boss_') ? 56 : 20);
        actor.destroy();
      });
    });
  }
});
