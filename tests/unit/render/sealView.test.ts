// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { R3_CHAMBER_ROOM } from '@/content/rooms/r3Chamber';
import { createLayers } from '@/render/layers';
import { RoomView2D } from '@/render/RoomView2D';
import { SealView, type SealLike } from '@/render/SealView';

/**
 * What the player sees of a seal (docs/PROMPT6-LOG.md S28): the sigil — a diamond of violet ink in the additive light layer — that flashes and
 * flinches when a blow is turned away and swells and fades when it breaks, and the door it holds, a curtain of ink that dissolves like any
 * gate. The view decides nothing: the entity's `view` state is what it reads.
 */
function seal(patch: Partial<SealLike['view']> = {}): SealLike & { view: { rejected: number; opacity: number; broken: boolean } } {
  return { x: 63, y: 0, height: 3.6, view: { rejected: 0, opacity: 1, broken: false, ...patch } };
}
const flashOf = (v: SealView): number => (v.root.children[2] as Container).alpha;
const sigilScale = (v: SealView): number => (v.root.children[1] as Container).scale.x;

describe('SealView: the sigil', () => {
  it('is light: it goes to the additive layer, where the entity views of light go', () => {
    expect(new SealView(seal()).additive).toBe(true);
  });

  it('hangs at the middle of the ward, on its spot (view space is y-down): 1.8 m over the feet of a 3.6 m ward', () => {
    const v = new SealView(seal());
    expect(v.root.x).toBe(63);
    expect(v.root.y).toBeCloseTo(-1.8, 9);
  });

  it('at rest it breathes (the halo), shows no flash and is fully there', () => {
    const view = new SealView(seal());
    view.sync(1, 0);
    expect(flashOf(view)).toBe(0);
    expect(view.root.alpha).toBe(1);
    const a = (view.root.children[0] as Container).scale.x;
    view.sync(1, 0.2);
    expect((view.root.children[0] as Container).scale.x).not.toBe(a);
    expect(Math.abs((view.root.children[0] as Container).scale.x - 1)).toBeLessThan(0.1);
  });

  it('a blow that is turned away flashes white and makes it flinch, in proportion to how fresh the blow is', () => {
    const s = seal({ rejected: 1 });
    const view = new SealView(s);
    view.sync(1, 0);
    expect(flashOf(view)).toBeGreaterThan(0.8);
    expect(sigilScale(view)).toBeLessThan(0.9);
    s.view.rejected = 0.5;
    view.sync(1, 0);
    expect(flashOf(view)).toBeCloseTo(0.45, 6);
    s.view.rejected = 0;
    view.sync(1, 0);
    expect(flashOf(view)).toBe(0);
    expect(sigilScale(view)).toBe(1);
  });

  it('once broken it swells and fades with the entity\'s opacity, and nothing flashes through the fade', () => {
    const s = seal({ broken: true, opacity: 0.5, rejected: 0 });
    const view = new SealView(s);
    view.sync(1, 0);
    expect(view.root.alpha).toBe(0.5);
    expect(sigilScale(view)).toBeGreaterThan(1.3);
    s.view.opacity = 0;
    view.sync(1, 0);
    expect(view.root.alpha).toBe(0);
  });

  it('is destroyed with its children and does not throw when the room is unloaded under it', () => {
    const view = new SealView(seal());
    expect(() => view.destroy()).not.toThrow();
    expect(view.root.destroyed).toBe(true);
  });
});

describe('the door a seal holds (R3)', () => {
  const build = (open: boolean): { view: RoomView2D; layers: ReturnType<typeof createLayers> } => {
    const layers = createLayers(new Container());
    const view = new RoomView2D(layers);
    view.build(R3_CHAMBER_ROOM, () => open);
    return { view, layers };
  };

  it('is drawn on its own, as a gate, so it can dissolve when the ward breaks — and it is gone when the room is built with the seal already broken', () => {
    const closed = build(false);
    expect(closed.layers.terrain.children.map((c) => c.label)).toContain('gate:seal_gate');
    expect(closed.view.gateAlpha('seal_gate')).toBe(1);
    expect(build(true).view.gateAlpha('seal_gate')).toBe(0);
  });

  it('is a curtain of ink, not the stone slab of R1: it has the shape of its solid (1.2 m × 9 m) and a drawing of its own, with more strokes than a stone door', () => {
    const strokes = (g: Container): number => (g as unknown as { context: { instructions: unknown[] } }).context.instructions.length;
    const { layers } = build(false);
    const door = layers.terrain.children.find((c) => c.label === 'gate:seal_gate')!;
    const b = door.getLocalBounds();
    expect(b.maxX - b.minX).toBeCloseTo(1.2, 1);
    expect(b.maxY - b.minY).toBeCloseTo(9, 1);
    // the same room with the same solid made of stone (`gate` material) is drawn with another, simpler set of shapes
    const other = createLayers(new Container());
    new RoomView2D(other).build({ ...R3_CHAMBER_ROOM, solids: R3_CHAMBER_ROOM.solids.map((s) => (s.id === 'seal_wall' ? { ...s, material: 'gate' } : s)) }, () => false);
    const stone = other.terrain.children.find((c) => c.label === 'gate:seal_gate')!;
    expect(strokes(door)).toBeGreaterThan(strokes(stone));
  });
});
