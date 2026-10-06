// @vitest-environment happy-dom
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { R1_GATE_ROOM } from '@/content/rooms/r1Gate';
import { PARALLAX_FACTOR, createLayers, type Layers } from '@/render/layers';
import { backdropIds, buildBackdrop, layerSpan } from '@/render/backdrops';
import { RoomView2D } from '@/render/RoomView2D';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

function stage(): { layers: Layers; view: RoomView2D } {
  const layers = createLayers(new Container());
  return { layers, view: new RoomView2D(layers) };
}
const count = (c: Container): number => c.children.length;
const labels = (c: Container): string[] => c.children.map((ch) => ch.label);

/** A small room with one gate and one exit, with or without a backdrop. */
function room(art?: RoomDefinition['art']): RoomDefinition {
  return {
    id: 't', regionId: 't', name: 't', bounds: rect(-1, -12, 60, 18), entries: [{ id: 'start', x: 4, y: 0 }],
    solids: [ground('g', 0, 60), block('door', 30, 0, 31.5, 8, 'gate'), block('wall', 59, 0, 61, 8)],
    gates: [{ id: 'door_1', solid: 'door', openWhen: 'f' }],
    exits: [{ id: 'out', rect: rect(50, 0, 56, 4) }],
    ...(art ? { art } : {}),
  };
}

describe('RoomView2D: the blockout', () => {
  it('draws the terrain once and each gate on its own (so it can dissolve), with the exit shaft in the additive light layer', () => {
    const { layers, view } = stage();
    view.build(room());
    expect(labels(layers.terrain)).toEqual(['room:t', 'gate:door_1']);
    expect(labels(layers.lightOverlay)).toEqual(['exit:out']);
    expect(layers.lightOverlay.blendMode).toBe('add');
    expect(layers.lightOverlay.children[0]!.blendMode).toBe('add');
  });

  it('a gate that starts closed is drawn; one that starts open is already gone (a beaten guardian stays beaten)', () => {
    const closed = stage();
    closed.view.build(room(), () => false);
    expect(closed.view.gateAlpha('door_1')).toBe(1);
    expect(closed.layers.terrain.children[1]!.visible).toBe(true);
    const open = stage();
    open.view.build(room(), () => true);
    expect(open.view.gateAlpha('door_1')).toBe(0);
    expect(open.layers.terrain.children[1]!.visible).toBe(false);
  });

  it('opening a gate dissolves the door over 0.6 s of REAL time, monotonically, then hides it; closing brings it back', () => {
    const { layers, view } = stage();
    view.build(room());
    const door = layers.terrain.children[1]!;
    view.setGateOpen('door_1', true);
    let prev = 1;
    for (let t = 0; t < 0.55; t += 1 / 60) {
      view.update(1 / 60);
      const a = view.gateAlpha('door_1')!;
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
    expect(prev).toBeGreaterThan(0); // not gone yet at 0.55 s
    expect(door.visible).toBe(true);
    for (let i = 0; i < 10; i++) view.update(1 / 60);
    expect(view.gateAlpha('door_1')).toBe(0);
    expect(door.visible).toBe(false);
    view.setGateOpen('door_1', false);
    expect(door.visible).toBe(true);
    for (let i = 0; i < 60; i++) view.update(1 / 60);
    expect(view.gateAlpha('door_1')).toBe(1);
    expect(door.alpha).toBe(1);
  });

  it('an unknown gate is ignored; a room without gates, exits or art draws only its terrain', () => {
    const { layers, view } = stage();
    view.build({ ...room(), gates: undefined, exits: undefined });
    view.setGateOpen('nope', true);
    expect(view.gateAlpha('nope')).toBeUndefined();
    expect(labels(layers.terrain)).toEqual(['room:t']);
    expect(count(layers.lightOverlay)).toBe(0);
  });

  it('rebuilding replaces everything: 40 builds leave exactly one room, no leaks in any layer', () => {
    const { layers, view } = stage();
    for (let i = 0; i < 40; i++) view.build(R1_GATE_ROOM);
    expect(count(layers.terrain)).toBe(2);
    expect(count(layers.lightOverlay)).toBe(1);
    for (const l of [layers.backdropFar, layers.backdropMid, layers.backdropNear, layers.foreground]) expect(count(l)).toBe(1);
    view.destroy();
    for (const l of [layers.terrain, layers.lightOverlay, layers.backdropFar, layers.backdropMid, layers.backdropNear, layers.foreground]) expect(count(l)).toBe(0);
  });
});

describe('provisional backdrops', () => {
  it('«ruins» fills the four parallax layers, one Graphics each', () => {
    const { layers } = stage();
    const made = buildBackdrop('ruins', layers, { bounds: R1_GATE_ROOM.bounds, seed: 1 });
    expect(made).toHaveLength(4);
    expect(made.every((g) => g instanceof Graphics)).toBe(true);
    expect(labels(layers.backdropFar)).toEqual(['backdrop:far']);
    expect(labels(layers.backdropMid)).toEqual(['backdrop:mid']);
    expect(labels(layers.backdropNear)).toEqual(['backdrop:near']);
    expect(labels(layers.foreground)).toEqual(['backdrop:front']);
  });

  it('the same seed always looks the same; another seed looks different', () => {
    const shape = (seed: number): string => {
      const { layers } = stage();
      buildBackdrop('ruins', layers, { bounds: R1_GATE_ROOM.bounds, seed });
      return [layers.backdropFar, layers.backdropMid, layers.backdropNear, layers.foreground]
        .map((l) => {
          const b = (l.children[0] as Graphics).getLocalBounds();
          return `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.width.toFixed(4)},${b.height.toFixed(4)}`;
        })
        .join('|');
    };
    expect(shape(1)).toBe(shape(1));
    expect(shape(1)).not.toBe(shape(2));
  });

  it('each layer reaches past the camera range on both sides, however slowly it scrolls (a layer of factor f spans f × the room, plus the view)', () => {
    const { layers } = stage();
    const bounds = R1_GATE_ROOM.bounds;
    buildBackdrop('ruins', layers, { bounds, seed: 1 });
    const cases: Array<[Container, number]> = [
      [layers.backdropFar, PARALLAX_FACTOR.backdropFar],
      [layers.backdropMid, PARALLAX_FACTOR.backdropMid],
      [layers.backdropNear, PARALLAX_FACTOR.backdropNear],
      [layers.foreground, PARALLAX_FACTOR.foreground],
    ];
    for (const [layer, f] of cases) {
      const b = (layer.children[0] as Graphics).getLocalBounds();
      const span = layerSpan(bounds, f);
      // what the camera shows at its two extremes, in the layer's coordinates (half the widest view on each side of f × x)
      const seenFrom = f * bounds.x0 - 15.75;
      const seenTo = f * bounds.x1 + 15.75;
      expect(b.x, `${layer.label} left`).toBeLessThanOrEqual(Math.max(span.x0 + 8, seenFrom) + 1e-6);
      expect(b.x + b.width, `${layer.label} right`).toBeGreaterThanOrEqual(Math.min(span.x1 - 8, seenTo) - 1e-6);
    }
  });

  it('the span grows with the factor (nearer layers cover more ground) and always includes the view margin', () => {
    const b = { x0: 0, y0: 0, x1: 100, y1: 10 };
    const far = layerSpan(b, 0.15);
    const near = layerSpan(b, 0.75);
    expect(near.x1 - near.x0).toBeGreaterThan(far.x1 - far.x0);
    expect(far.x0).toBeLessThan(-16);
    expect(far.x1).toBeGreaterThan(0.15 * 100 + 16);
  });

  it('an unknown backdrop id draws nothing; the known ids are listed', () => {
    const { layers } = stage();
    expect(buildBackdrop('nope', layers, { bounds: R1_GATE_ROOM.bounds, seed: 1 })).toEqual([]);
    expect(backdropIds()).toContain('ruins');
    expect(count(layers.backdropFar)).toBe(0);
  });

  it('a room with art builds it, and a room without does not', () => {
    const a = stage();
    a.view.build(room({ backdrop: 'ruins', seed: 3 }));
    expect(count(a.layers.backdropNear)).toBe(1);
    const b = stage();
    b.view.build(room());
    expect(count(b.layers.backdropNear)).toBe(0);
  });
});

describe('RoomView2D: hazards', () => {
  const withSpikes = (): RoomDefinition => ({ ...room(), hazards: [{ id: 'sp', kind: 'spikes', rect: rect(20, 0, 22.5, 0.6) }, { id: 'sp2', kind: 'spikes', rect: rect(40, 0, 42, 0.6) }] });

  it('draws each zone of spikes with the terrain, one object each, labelled by its id', () => {
    const { layers, view } = stage();
    view.build(withSpikes());
    expect(labels(layers.terrain)).toEqual(['room:t', 'gate:door_1', 'hazard:sp', 'hazard:sp2']);
  });

  it('a room without hazards draws none', () => {
    const { layers, view } = stage();
    view.build(room());
    expect(labels(layers.terrain).filter((l) => l.startsWith('hazard:'))).toEqual([]);
  });

  it('rebuilding (a transition, a defeat) leaves no spikes of the old room behind', () => {
    const { layers, view } = stage();
    for (let i = 0; i < 6; i++) view.build(withSpikes());
    expect(labels(layers.terrain).filter((l) => l.startsWith('hazard:'))).toHaveLength(2);
    view.build(room());
    expect(labels(layers.terrain).filter((l) => l.startsWith('hazard:'))).toEqual([]);
    view.destroy();
    expect(count(layers.terrain)).toBe(0);
  });
});
