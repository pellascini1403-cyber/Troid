// @vitest-environment happy-dom
import { Container, type Sprite } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { log } from '@/core/log';
import { ActorPresenter } from '@/presentation/ActorPresenter';
import { createActorViewState } from '@/presentation/actorViewState';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { ANCHOR_IDS } from '@/presentation/vocabulary';
import { ActorSprite } from '@/render/ActorSprite';
import { fakeSet } from '../../helpers/sprites';

beforeAll(() => log.setSink(() => {}));

const body = (a: ActorSprite): Sprite => a.root.children[0] as Sprite;
const flash = (a: ActorSprite): Sprite => a.root.children[1] as Sprite;

describe('anchors (port of CharacterModel sockets)', () => {
  it('resolves every anchor id from per-frame data (no fallbacks for the placeholder)', () => {
    const presenter = new ActorPresenter(PLAYER_PLACEHOLDER.def, PLAYER_PLACEHOLDER.meta);
    for (const id of ANCHOR_IDS) {
      const a = presenter.anchor(id);
      expect(a.fallback, id).toBe(false);
      expect(Number.isFinite(a.x) && Number.isFinite(a.y), id).toBe(true);
    }
  });

  it('synthesises proportional fallback anchors for a set that has none (gameplay never needs null checks)', () => {
    const bare: SpriteSetDefinition = { id: 'bare', atlas: 'x', artPxPerMeter: 50, pivot: [0.5, 1], height: 2, clips: { idle: { frames: 'idle_', count: 1 } } };
    const presenter = new ActorPresenter(bare, null);
    for (const id of ANCHOR_IDS) expect(presenter.anchor(id).fallback, id).toBe(true);
    expect(presenter.anchor('head').y).toBeCloseTo(1.9, 5); // 0.95 × height
    expect(presenter.hasAnchorData('weapon_tip')).toBe(false);
  });

  it('anchors mirror with the facing: the sword tip is in FRONT of the actor either way', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    Object.assign(view, { x: 10, prevX: 10, y: 2, prevY: 2, facing: 1 });
    a.sync(view, 0, 0);
    const right = a.anchorWorld('weapon_grip');
    view.facing = -1;
    a.sync(view, 0, 0);
    const left = a.anchorWorld('weapon_grip');
    expect(right.x).toBeGreaterThan(10);
    expect(left.x).toBeLessThan(10);
    expect(right.x - 10).toBeCloseTo(10 - left.x, 6);
    expect(right.y).toBeCloseTo(left.y, 6);
  });

  it('the grip follows the hand frame by frame during an attack (the sword is attached to the right hand)', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    view.anim = 'attack';
    const grips: number[] = [];
    for (const [phase, t] of [['startup', 0], ['startup', 0.9], ['active', 0], ['active', 0.9], ['recovery', 0], ['recovery', 0.9]] as const) {
      view.phase = phase;
      view.phaseT = t;
      a.sync(view, 0, 0);
      const hand = a.anchor('hand_r');
      const grip = a.anchor('weapon_grip');
      expect(Math.hypot(hand.x - grip.x, hand.y - grip.y)).toBeLessThanOrEqual(0.04);
      grips.push(grip.x);
    }
    expect(new Set(grips.map((g) => g.toFixed(3))).size).toBeGreaterThan(4); // it really moves
    expect(Math.max(...grips)).toBeGreaterThan(0.75); // extended forward in the active frames
  });
});

describe('ActorSprite (port of CharacterModel + ActorVisual)', () => {
  it('draws two sprites (body + additive flash overlay) from the shared set and never modifies its textures', () => {
    const set = fakeSet();
    const before = [...set.textures.values()];
    const a = new ActorSprite(set);
    expect(a.root.children).toHaveLength(2);
    expect(flash(a).blendMode).toBe('add');
    expect(before).toContain(body(a).texture);
    a.dispose();
    for (const t of set.textures.values()) expect(t.destroyed).toBe(false);
    expect([...set.textures.values()]).toEqual(before);
    expect(set.disposed).toBe(0); // the set belongs to the asset manager, not to the actor
  });

  it('instances are independent: flashing one does not flash another', () => {
    const set = fakeSet();
    const a = new ActorSprite(set);
    const b = new ActorSprite(set);
    const va = createActorViewState();
    va.flash = 1;
    a.sync(va, 0, 0);
    b.sync(createActorViewState(), 0, 0);
    expect(flash(a).visible).toBe(true);
    expect(flash(a).alpha).toBe(1);
    expect(flash(b).visible).toBe(false);
    expect(flash(b).alpha).toBe(0);
  });

  it('dispose is idempotent and detaches the root', () => {
    const a = new ActorSprite(fakeSet());
    const parent = new Container();
    parent.addChild(a.root);
    a.dispose();
    a.dispose();
    expect(parent.children).toHaveLength(0);
    expect(a.presenter.isDisposed).toBe(true);
    expect(() => a.sync(createActorViewState(), 0, 0.1)).not.toThrow();
  });

  it('interpolates the position between ticks and works in view space (Y is flipped, there is no depth)', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    Object.assign(view, { prevX: 10, x: 12, prevY: 0, y: 1 });
    a.sync(view, 0.5, 1 / 60);
    expect(a.root.position.x).toBeCloseTo(11);
    expect(a.root.position.y).toBeCloseTo(-0.5);
  });

  it('flips instantly toward the facing direction (no 3D pivot) and keeps the art scaled in metres', () => {
    const set = fakeSet();
    const a = new ActorSprite(set);
    const view = createActorViewState();
    a.sync(view, 0, 1 / 60);
    expect(a.root.scale.x).toBe(1);
    view.facing = -1;
    a.sync(view, 0, 1 / 60);
    expect(a.root.scale.x).toBe(-1);
    expect(body(a).scale.x).toBeCloseTo(1 / set.def.artPxPerMeter, 8);
    expect(body(a).anchor.x).toBeCloseTo(set.def.pivot[0], 8);
    expect(body(a).anchor.y).toBeCloseTo(set.def.pivot[1], 8);
  });

  it('restarts the clip only when animSerial changes', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    view.anim = 'jump';
    a.sync(view, 0, 1 / 60);
    a.sync(view, 0, 0.2);
    const t = a.presenter.animator.progress;
    expect(t).toBeGreaterThan(0.2);
    a.sync(view, 0, 1 / 60); // same serial: keeps playing
    expect(a.presenter.animator.progress).toBeGreaterThan(t);
    view.animSerial++;
    a.sync(view, 0, 0);
    expect(a.presenter.animator.progress).toBeCloseTo(0, 1);
  });

  it('blink dims opacity on alternate phases and respects visible=false', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    view.blink = true;
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      a.sync(view, 0, 1 / 60);
      seen.add(Number(body(a).alpha.toFixed(2)));
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(0.35)).toBe(true);
    view.visible = false;
    a.sync(view, 0, 1 / 60);
    expect(a.root.visible).toBe(false);
  });

  it('shows the frame the simulation asks for: phase-driven attack frames reach the sprite', () => {
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    view.anim = 'attack';
    view.phase = 'active';
    view.phaseT = 0.9;
    a.sync(view, 0, 0);
    expect(a.frame).toBe('attack_03');
    view.phase = 'recovery';
    view.phaseT = 0;
    a.sync(view, 0, 0);
    expect(a.frame).toBe('attack_04');
  });

  it('SWAPS the art at runtime without touching the simulation state (sprites are replaceable)', () => {
    const variant: SpriteSetDefinition = {
      id: 'variant',
      atlas: 'procedural:variant',
      artPxPerMeter: 100,
      pivot: [0.5, 1],
      height: 1.7,
      clips: { idle: { frames: 'stand_', count: 2 }, run: { frames: 'sprint_', count: 3 } },
      anchors: { weapon_grip: [0.5, 1], weapon_tip: [1.5, 1] },
    };
    const a = new ActorSprite(fakeSet());
    const view = createActorViewState();
    Object.assign(view, { x: 4, prevX: 4, y: 1, prevY: 1, anim: 'run', facing: 1 });
    a.sync(view, 0, 0);
    expect(a.frame).toMatch(/^run_/);
    const snapshot = JSON.stringify(view);

    a.setSpriteSet(fakeSet(variant, { frames: {} }));
    a.sync(view, 0, 0);
    expect(a.spriteSetId).toBe('variant');
    expect(a.frame).toMatch(/^sprint_/);
    expect(body(a).scale.x).toBeCloseTo(0.01, 8);
    expect(a.anchor('weapon_tip')).toMatchObject({ x: 1.5, y: 1, fallback: false });
    expect(JSON.stringify(view)).toBe(snapshot); // gameplay state untouched by the swap
  });
});
