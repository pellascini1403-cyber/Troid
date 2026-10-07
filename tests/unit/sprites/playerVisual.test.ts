// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { log, type LogEntry } from '@/core/log';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import type { AnimState } from '@/presentation/vocabulary';
import { ActorSprite } from '@/render/ActorSprite';
import { PlayerVisualSwitch } from '@/render/PlayerVisual';
import { fakeSet } from '../../helpers/sprites';

beforeAll(() => log.setSink(() => {}));

/**
 * THE PLAYER'S VISUAL (docs/ART-PIPELINE-2D.md, part D): two looks at once, one shown, the placeholder always the way back — and nothing that gameplay reads is
 * touched by any of it.
 */
const BASE = PLAYER_PLACEHOLDER.def;
/** A set of "real art": the same technical fixture as the placeholder but with only the clips asked for, under another id. */
const FRAMES_OF: Partial<Record<AnimState, AnimState>> = { attack1: 'attack' }; // the fixture's frames for the artist's name of the first blow
function artDef(states: AnimState[], over: Partial<SpriteSetDefinition> = {}): SpriteSetDefinition {
  return { ...BASE, id: 'player/hero', atlas: 'art:player/hero@1', placeholder: undefined, clips: Object.fromEntries(states.map((s) => [s, BASE.clips[FRAMES_OF[s] ?? s]!])), ...over };
}
function setup(states: AnimState[] = ['idle', 'walk', 'attack1'], over: Partial<SpriteSetDefinition> = {}, mode: 'auto' | 'placeholder' | 'art' = 'auto') {
  const placeholder = new ActorSprite(fakeSet());
  const visual = new PlayerVisualSwitch(placeholder, (set, o) => new ActorSprite(set, o), mode, { zIndex: 10 });
  const set = fakeSet(artDef(states, over), PLAYER_PLACEHOLDER.meta);
  let released = 0;
  const attach = (s = set): void => visual.attachArt(s, () => void released++);
  return { visual, placeholder, set, attach, released: () => released };
}
const viewOf = (over: Partial<ActorViewState> = {}): ActorViewState => Object.assign(createActorViewState(), { x: 5, prevX: 5, y: 1, prevY: 1, facing: 1 }, over);
const sprites = (v: PlayerVisualSwitch): Array<{ position: { x: number; y: number }; scale: { x: number }; visible: boolean }> => v.root.children as never;

describe('PlayerVisualSwitch', () => {
  it('without art it is the placeholder, exactly as before: the same set, a frame, the placeholder\'s anchors', () => {
    const { visual } = setup();
    visual.sync(viewOf({ anim: 'walk' }), 0, 0);
    expect(visual.hasArt).toBe(false);
    expect(visual.shows).toBe('placeholder');
    expect(visual.spriteSetId).toBe(BASE.id);
    expect(visual.frame).toMatch(/^walk_/);
    expect(visual.visible).toBe(true);
    expect(visual.facing).toBe(1);
    expect(visual.anchorWorld('weapon_tip').x).toBeGreaterThan(5);
    expect(visual.root.children).toHaveLength(1);
    expect(visual.root.zIndex).toBe(10);
  });

  it('with art, auto draws the art for the states it can stand for and the placeholder for the rest — one look visible at a time', () => {
    const { visual, attach } = setup();
    attach();
    expect(visual.hasArt).toBe(true);
    const [ph, art] = sprites(visual) as [ReturnType<typeof sprites>[number], ReturnType<typeof sprites>[number]];
    for (const [anim, shows] of [['idle', 'art'], ['walk', 'art'], ['run', 'art'], ['attack', 'art'], ['land', 'art'], ['dash', 'placeholder'], ['death', 'placeholder'], ['crouch', 'placeholder']] as const) {
      visual.sync(viewOf({ anim }), 0, 0);
      expect(visual.shows, anim).toBe(shows);
      expect(visual.spriteSetId, anim).toBe(shows === 'art' ? 'player/hero' : BASE.id);
      expect(ph.visible, `${anim}: the placeholder is shown only when it draws`).toBe(shows === 'placeholder');
      expect(art.visible, `${anim}: the art is shown only when it draws`).toBe(shows === 'art');
    }
  });

  it('cutting from one look to the other leaves the hero where it was: same position, same facing, same scale direction', () => {
    const { visual, attach } = setup();
    attach();
    const [ph, art] = sprites(visual) as [ReturnType<typeof sprites>[number], ReturnType<typeof sprites>[number]];
    for (const facing of [1, -1] as const) {
      for (const anim of ['idle', 'dash'] as const) {
        visual.sync(viewOf({ anim, facing, x: 12.5, prevX: 12, y: 3.25, prevY: 3 }), 0.5, 0);
        expect(art.position.x).toBeCloseTo(ph.position.x, 9);
        expect(art.position.y).toBeCloseTo(ph.position.y, 9);
        expect(Math.sign(art.scale.x)).toBe(Math.sign(ph.scale.x));
        expect(visual.facing).toBe(facing);
      }
    }
  });

  it('placeholder mode is the way back, at any time — and auto brings the art back on the very next frame', () => {
    const { visual, attach } = setup();
    attach();
    visual.sync(viewOf({ anim: 'idle' }), 0, 0);
    expect(visual.shows).toBe('art');
    visual.setMode('placeholder');
    visual.sync(viewOf({ anim: 'idle' }), 0, 0);
    expect(visual.shows).toBe('placeholder');
    expect(visual.spriteSetId).toBe(BASE.id);
    visual.setMode('auto');
    visual.sync(viewOf({ anim: 'idle' }), 0, 0);
    expect(visual.shows).toBe('art');
  });

  it('art mode draws the art for everything (its own chain doing what it lacks), to judge it on its own', () => {
    const { visual, attach } = setup(['idle'], {}, 'art');
    attach();
    for (const anim of ['idle', 'dash', 'death', 'cast'] as const) {
      visual.sync(viewOf({ anim }), 0, 0);
      expect(visual.shows, anim).toBe('art');
      expect(visual.frame, anim).toMatch(/^idle_/);
    }
  });

  it('a set that says "chain" for what it lacks is drawn everywhere in auto', () => {
    const { visual, attach } = setup(['idle'], { missingClips: 'chain' });
    attach();
    for (const anim of ['idle', 'dash', 'death'] as const) {
      visual.sync(viewOf({ anim }), 0, 0);
      expect(visual.shows, anim).toBe('art');
    }
  });

  it('hides both looks when the pose is not visible (the blink of invulnerability, a death that has ended)', () => {
    const { visual, attach } = setup();
    attach();
    visual.sync(viewOf({ anim: 'idle', visible: false }), 0, 0);
    expect(sprites(visual).every((s) => !s.visible)).toBe(true);
    expect(visual.visible).toBe(false);
  });

  it('never writes the view state: whatever the look, the simulation\'s numbers are untouched', () => {
    for (const mode of ['auto', 'placeholder', 'art'] as const) {
      const { visual, attach } = setup(['idle', 'walk'], {}, mode);
      attach();
      for (const anim of ['idle', 'walk', 'attack', 'dash', 'death'] as const) {
        const view = viewOf({ anim, phase: 'active', phaseT: 0.4, flash: 0.3, animSpeed: 1.2 });
        const before = structuredClone(view);
        visual.sync(view, 0.7, 1 / 60);
        expect(view, `${mode} ${anim}`).toEqual(before);
      }
    }
  });

  it('takes the art away at any moment: the placeholder is shown again, the art is given back once, and nothing is left in the scene', () => {
    const { visual, attach, released } = setup();
    attach();
    visual.sync(viewOf({ anim: 'idle' }), 0, 0);
    expect(visual.shows).toBe('art');
    visual.detachArt();
    expect(visual.shows).toBe('placeholder');
    expect(visual.hasArt).toBe(false);
    expect(visual.root.children).toHaveLength(1);
    expect(released()).toBe(1);
    visual.detachArt();
    expect(released(), 'idempotent').toBe(1);
    visual.sync(viewOf({ anim: 'idle' }), 0, 0);
    expect(visual.root.children[0]!.visible).toBe(true);
  });

  it('attaching new art gives back the old one first; disposing gives back what is attached, once', () => {
    const { visual, attach, released } = setup();
    attach();
    attach(fakeSet(artDef(['idle']), PLAYER_PLACEHOLDER.meta));
    expect(released()).toBe(1);
    expect(visual.root.children).toHaveLength(2);
    visual.dispose();
    expect(released()).toBe(2);
    visual.dispose();
    expect(released()).toBe(2);
  });

  it('says nothing about the states a partial art set lacks (the placeholder draws them: that is not worth a line in a player\'s console)', () => {
    const lines: LogEntry[] = [];
    log.setSink((e) => lines.push(e));
    try {
      const { visual, attach } = setup(['idle']);
      attach();
      for (const anim of ['walk', 'jump', 'dash', 'attack', 'death', 'cast', 'crouch'] as const) visual.sync(viewOf({ anim }), 0, 1 / 60);
      expect(lines.filter((l) => l.scope === 'anim' && /player\/hero/.test(l.message))).toEqual([]);
      // …while a set drawn on its own still says it (a missing clip in the placeholder is a bug somebody should see)
      const lone = new ActorSprite(fakeSet(artDef(['idle']), PLAYER_PLACEHOLDER.meta));
      lone.sync(viewOf({ anim: 'dash' }), 0, 1 / 60);
      expect(lines.some((l) => l.scope === 'anim' && /no clip for "dash"/.test(l.message))).toBe(true);
    } finally {
      log.setSink(() => {});
    }
  });

  it('answers anchors from the look that is on screen (the sword is where the visible hand is)', () => {
    const { visual, attach } = setup(['idle', 'attack1'], { anchors: undefined });
    attach();
    visual.sync(viewOf({ anim: 'attack', phase: 'active', phaseT: 0.5 }), 0, 0);
    const grip = visual.anchorWorld('weapon_grip');
    const hand = visual.anchorWorld('hand_r');
    expect(Math.hypot(grip.x - hand.x, grip.y - hand.y)).toBeLessThan(0.05);
    visual.sync(viewOf({ anim: 'dash' }), 0, 0);
    expect(visual.shows).toBe('placeholder');
    expect(Number.isFinite(visual.anchorWorld('weapon_tip').x)).toBe(true);
  });
});
