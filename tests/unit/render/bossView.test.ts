// @vitest-environment happy-dom
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CRYSTAL_COLOSSUS_LOOK, FOUNDRY_ENGINE_LOOK, ROOT_TYRANT_LOOK } from '@/content/proceduralActors';
import { createActorViewState } from '@/presentation/actorViewState';
import { BossView, type BossLike } from '@/render/BossView';
import type { CreatureArt, CreatureArtPart } from '@/render/ProceduralActor';
import { fakeVfxAtlas } from '../../helpers/vfx';

/**
 * THE GUARDIANS OF THE ENGINE TAKE ART (docs/PROMPT22-LOG.md §10). Their body is an ink creature's at the size of a room (`ProceduralActor` with the look of the boss), so their art is delivered the way a creature's is — six parts tagged
 * `enemy:<lookId>` (`presentation/enemyArt`) — and the view hands them to the actor that draws it. Until Prompt 22 `dress` did nothing: art painted for one of the six would never have been seen.
 */
const atlas = fakeVfxAtlas();
const part = (frames = 1): CreatureArtPart => ({ frames: Array.from({ length: frames }, () => new Texture()), mpp: 0.02, pivot: [0.5, 1] });
const art = (): CreatureArt => ({ body: part(4), flash: part(), eyes: part(), sigil: part(), spines: part(3), pool: part(), eyesAt: [0.5, 2.6], sigilAt: [-0.2, 1.8] });

/** The boss's `view` as a test writes it (the simulation owns it for real; here the test is the simulation). */
type Writable<T> = { -readonly [K in keyof T]: T[K] };
interface Fake extends BossLike {
  view: Writable<BossLike['view']>;
}

function make(look = ROOT_TYRANT_LOOK): { boss: BossView; source: Fake } {
  const source: Fake = { view: { ...createActorViewState(), x: 40, y: 0, prevX: 40, prevY: 0, facing: -1, attack: null, marks: [], enraged: false, awake: true }, floorY: 0 };
  return { boss: new BossView(source, look, { glow: atlas.frames.glow, marks: atlas }), source };
}
/** The actor's own root (the second child of the boss: the warnings on the floor come first). */
const actorOf = (b: BossView): Container => b.root.children[1] as Container;
const shapeOf = (b: BossView): Container => actorOf(b).children.find((c) => c.label === 'shape') as Container;
const graphics = (b: BossView): Graphics[] => shapeOf(b).children.filter((c): c is Graphics => c instanceof Graphics);

describe('BossView: the art of a guardian of the engine', () => {
  it('draws the boss with its shapes until art comes, and with the art\'s parts once it has them', () => {
    const { boss } = make();
    expect(graphics(boss).every((g) => g.visible)).toBe(true);
    boss.dress(art());
    expect(graphics(boss).every((g) => !g.visible), 'the shapes are not drawn under the art').toBe(true);
    expect(shapeOf(boss).children.filter((c) => c instanceof Sprite && c.visible).length, 'the body, the sigil, the eyes and the flash stand where the shapes were').toBeGreaterThanOrEqual(4);
  });

  it('goes back to its shapes when the art is let go of (the hero left the zone): the boss is never left with no look', () => {
    const { boss } = make();
    boss.dress(art());
    boss.dress(null);
    expect(graphics(boss).every((g) => g.visible)).toBe(true);
    expect(shapeOf(boss).children.some((c) => c instanceof Sprite && c.texture !== atlas.frames.glow && (c as Sprite).blendMode !== 'add' && (c as Sprite).visible)).toBe(false);
  });

  it('is the same boss dressed or not: where it stands, its facing and the warnings of its attacks do not depend on its look', () => {
    for (const look of [ROOT_TYRANT_LOOK, CRYSTAL_COLOSSUS_LOOK, FOUNDRY_ENGINE_LOOK]) {
      const bare = make(look);
      const dressed = make(look);
      dressed.boss.dress(art());
      for (const m of [bare, dressed]) {
        m.source.view.attack = 'quake';
        m.source.view.marks = [{ x: 36, w: 2, t01: 0.5 }];
        m.boss.sync(1, 1 / 60);
      }
      const read = (b: BossView) => ({ x: actorOf(b).x, y: actorOf(b).y, sx: actorOf(b).scale.x, floor: b.root.children[0]!.children.length });
      expect(read(dressed.boss), look.id).toEqual(read(bare.boss));
    }
  });

  it('plays every state of the boss under the art without throwing, and destroys the whole graph', () => {
    const { boss, source } = make(FOUNDRY_ENGINE_LOOK);
    boss.dress(art());
    for (const anim of ['idle', 'walk', 'alert', 'telegraph', 'attack', 'hurt', 'phaseTransition', 'death'] as const) {
      source.view.anim = anim;
      source.view.phaseT = 0.5;
      boss.sync(1, 1 / 60);
    }
    boss.destroy();
    expect(boss.root.destroyed).toBe(true);
  });
});
