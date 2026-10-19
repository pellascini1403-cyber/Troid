// @vitest-environment happy-dom
import { Container, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { EDGE_PULSES, FIGHT_MOOD, moodFor } from '@/content/atmosphere';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { ATMOSPHERE_CONTRACT } from '@/presentation/atmosphere';
import { CALM_PULSE, ScreenFx, type ScreenRect } from '@/vfx/ScreenFx';

/**
 * THE ATMOSPHERE OF THE SCREEN, drawn (docs/PROMPT8-LOG.md, phase I): the vignette follows the room and the fight, spreads over the part of the window the game is drawn in, and the edge pulses answer the
 * events of the game — and, like everything of the view, it only listens: the simulation never knows it is there.
 */
const make = (room = 'r1_gate', rect: ScreenRect = { contentX: 10, contentY: 20, contentWidth: 800, contentHeight: 400 }) => {
  const layer = new Container();
  const bars = new Container(); // the letterbox is the first thing in the screen layer
  layer.addChild(bars);
  const bus = new EventBus<GameEvents>();
  const view = { rect };
  const fx = new ScreenFx(layer, { bus, texture: Texture.EMPTY, rect: () => view.rect, room, moodFor, fight: FIGHT_MOOD, pulses: EDGE_PULSES });
  const sprites = (): Sprite[] => fx.root.children as Sprite[];
  return { fx, bus, layer, bars, view, sprites };
};
const settle = (fx: ScreenFx, seconds = 3): void => {
  for (let i = 0; i < seconds * 60; i++) fx.update(1 / 60);
};
const hurt = { x: 0, y: 0, damage: 1, direction: 1 as const };

describe('the vignette', () => {
  it('lies under the letterbox bars and over the world, and spreads over the part of the window the game is in', () => {
    const { fx, layer, view, sprites } = make();
    expect(layer.children[0]).toBe(fx.root);
    fx.update(0);
    for (const s of sprites()) {
      expect([s.x, s.y, s.width, s.height]).toEqual([10, 20, 800, 400]);
    }
    // the window turns: the sprites follow it (and only when it changed)
    view.rect = { contentX: 0, contentY: 0, contentWidth: 1000, contentHeight: 500 };
    fx.update(0);
    for (const s of sprites()) expect([s.x, s.y, s.width, s.height]).toEqual([0, 0, 1000, 500]);
  });

  it('comes over the picture instead of appearing on it: it starts clear and eases to the dark of the room', () => {
    const { fx, sprites } = make('r2_hall');
    fx.update(1 / 60);
    expect(sprites()[0]!.visible).toBe(true);
    fx.update(1 / 60);
    // the first frame it exists it is at the room\'s dark colour already (only its strength comes up)
    expect(sprites()[0]!.tint).toBe(moodFor('r2_hall').tint);
    expect(fx.state.strength).toBeLessThan(0.08);
    settle(fx);
    expect(fx.state.strength).toBeCloseTo(moodFor('r2_hall').strength, 2);
    expect(sprites()[0]!.alpha).toBeCloseTo(moodFor('r2_hall').strength, 2);
    expect(sprites()[0]!.visible).toBe(true);
  });

  it('takes the dark of the room it is in: another room, another night (and it eases there)', () => {
    const { fx, bus, sprites } = make('r1_gate');
    settle(fx);
    expect(sprites()[0]!.tint).toBe(moodFor('r1_gate').tint);
    bus.emit('room:loaded', { roomId: 'r4_sanctum', entryId: 'west' });
    expect(fx.state.room).toBe('r4_sanctum');
    fx.update(0.1);
    expect(sprites()[0]!.tint).not.toBe(moodFor('r4_sanctum').tint); // on its way
    settle(fx);
    expect(sprites()[0]!.tint).toBe(moodFor('r4_sanctum').tint);
    expect(fx.state.strength).toBeCloseTo(moodFor('r4_sanctum').strength, 2);
  });

  it('closes in and turns violet while the guardian is awake, and lets go when it falls or the hero is back', () => {
    const { fx, bus, sprites } = make('r4_sanctum');
    settle(fx);
    const calm = fx.state.strength;
    bus.emit('boss:started', { id: 'g', defId: 'ink_warden', nameKey: 'x', health: 36, maxHealth: 36, x: 58, y: 0 });
    expect(fx.state.fighting).toBe(true);
    settle(fx);
    expect(fx.state.strength).toBeGreaterThan(calm);
    expect(sprites()[0]!.tint).toBe(FIGHT_MOOD.tint);
    bus.emit('death:respawned', { roomId: 'r4_sanctum', entryId: 'rest' });
    expect(fx.state.fighting).toBe(false);
    settle(fx);
    expect(fx.state.strength).toBeCloseTo(calm, 2);
    bus.emit('boss:started', { id: 'g', defId: 'ink_warden', nameKey: 'x', health: 36, maxHealth: 36, x: 58, y: 0 });
    bus.emit('boss:defeated', { id: 'g', defId: 'ink_warden', x: 58, y: 0 });
    expect(fx.state.fighting).toBe(false);
  });

  it('with no time passing (a tool paused the effects) it is AT its dark at once, and follows the room from frame to frame', () => {
    const { fx, bus } = make();
    fx.update(0);
    expect(fx.state.strength).toBeCloseTo(moodFor('r1_gate').strength, 9);
    bus.emit('room:loaded', { roomId: 'r4_sanctum', entryId: 'west' });
    fx.update(0);
    expect(fx.state.strength).toBeCloseTo(moodFor('r4_sanctum').strength, 9);
  });

  it('can be settled by hand: the dark of its room, nothing to fade in from', () => {
    const { fx } = make();
    fx.update(1 / 600);
    expect(fx.state.strength).toBeLessThan(moodFor('r1_gate').strength);
    fx.settle();
    expect(fx.state.strength).toBeCloseTo(moodFor('r1_gate').strength, 9);
  });
});

describe('the pulses at the edge', () => {
  it('a blow taken darkens the edge carmín for a moment, then goes', () => {
    const { fx, bus, sprites } = make();
    settle(fx);
    const node = sprites().find((s) => s.tint === EDGE_PULSES.hurt.tint)!;
    expect(node.visible).toBe(false);
    bus.emit('player:hurt', hurt);
    expect(fx.state.pulses).toEqual(['hurt']);
    fx.update(0.05);
    expect(node.visible).toBe(true);
    expect(node.blendMode).toBe('normal');
    expect(node.alpha).toBeGreaterThan(0.1);
    expect(node.alpha).toBeLessThanOrEqual(EDGE_PULSES.hurt.peak);
    fx.update(EDGE_PULSES.hurt.life);
    expect(node.visible).toBe(false);
    expect(fx.state.pulses).toEqual([]);
  });

  it('a power gained and a place that awakens flood it with light; a guardian that changes or falls tints it violet', () => {
    const { fx, bus } = make();
    bus.emit('ability:unlocked', { id: 'air_dash' });
    bus.emit('checkpoint:set', { room: 'r1_gate', entry: 'rest', x: 1, y: 0 });
    bus.emit('boss:phase', { id: 'g', defId: 'ink_warden', phase: 2, x: 58, y: 0 });
    bus.emit('boss:defeated', { id: 'g', defId: 'ink_warden', x: 58, y: 0 });
    expect(fx.state.pulses.sort()).toEqual(['fall', 'guardian', 'power', 'rest']);
    fx.update(2);
    expect(fx.state.pulses).toEqual([]);
  });

  it('"fewer flashes" softens every pulse to a share of its strength — they are still told, never louder than a third of what they were — and the vignette of the room is not touched', () => {
    const calm = make();
    const loud = make();
    calm.fx.setCalm(true);
    expect(calm.fx.state.calm).toBe(true);
    expect(loud.fx.state.calm).toBe(false);
    for (const t of [calm, loud]) {
      settle(t.fx);
      t.bus.emit('player:hurt', hurt);
      t.fx.update(0.05);
    }
    const node = (m: ReturnType<typeof make>): Sprite => m.sprites().find((s) => s.tint === EDGE_PULSES.hurt.tint)!;
    expect(node(loud).alpha).toBeGreaterThan(0.1);
    expect(node(calm).visible, 'still shown: the blow is still told').toBe(true);
    expect(node(calm).alpha).toBeCloseTo(node(loud).alpha * CALM_PULSE, 9);
    expect(CALM_PULSE).toBeLessThanOrEqual(0.4);
    expect(calm.fx.state.strength).toBeCloseTo(loud.fx.state.strength, 9);
  });

  it('turning the softening off again gives the pulses back their strength, mid-pulse', () => {
    const { fx, bus, sprites } = make();
    settle(fx);
    fx.setCalm(true);
    bus.emit('player:hurt', hurt);
    fx.update(0.05);
    const node = sprites().find((s) => s.tint === EDGE_PULSES.hurt.tint)!;
    const soft = node.alpha;
    fx.setCalm(false);
    fx.update(0);
    expect(node.alpha).toBeCloseTo(soft / CALM_PULSE, 9);
  });

  it('are as long as their data says and never longer than the contract allows', () => {
    const { fx, bus } = make();
    bus.emit('ability:unlocked', { id: 'air_dash' });
    fx.update(EDGE_PULSES.power.life - 0.01);
    expect(fx.state.pulses).toEqual(['power']);
    fx.update(0.02);
    expect(fx.state.pulses).toEqual([]);
    for (const p of Object.values(EDGE_PULSES)) expect(p.life).toBeLessThanOrEqual(ATMOSPHERE_CONTRACT.maxPulseLife);
  });

  it('start over when the same thing happens again (a second blow restarts the first)', () => {
    const { fx, bus, sprites } = make();
    bus.emit('player:hurt', hurt);
    fx.update(0.4);
    bus.emit('player:hurt', hurt);
    fx.update(0.05);
    const node = sprites().find((s) => s.tint === EDGE_PULSES.hurt.tint)!;
    expect(node.alpha).toBeGreaterThan(0.1);
  });

  it('stop listening and go with the screen when it is disposed', () => {
    const { fx, bus, layer } = make();
    fx.dispose();
    expect(layer.children).not.toContain(fx.root);
    expect(() => bus.emit('player:hurt', hurt)).not.toThrow();
  });
});
