// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { INTERACTION_TEST_ROOM } from '@/content/rooms/interactionTest';
import { R2_HALL_ROOM } from '@/content/rooms/r2Hall';
import { createLayers, type Layers } from '@/render/layers';
import { InteractableViews } from '@/render/InteractableViews';

/**
 * What the player sees of the interactables (docs/GAME-SPEC-2D.md §12): a pickup is a floating card of light that vanishes when
 * it is taken, a lever is a post whose knob dims when it is spent. The view decides nothing: availability is the simulation's.
 */
function stage(): { layers: Layers; views: InteractableViews; available: Set<string> } {
  const layers = createLayers(new Container());
  const available = new Set(INTERACTION_TEST_ROOM.interactables!.map((i) => i.id));
  const views = new InteractableViews(layers);
  views.build(INTERACTION_TEST_ROOM.interactables!, (id) => available.has(id));
  return { layers, views, available };
}
const markers = (layers: Layers): Record<string, Container> =>
  Object.fromEntries([...layers.lightOverlay.children, ...layers.propsBack.children].filter((c) => c.label.startsWith('interactable:')).map((c) => [c.label.slice('interactable:'.length), c as Container]));

describe('InteractableViews', () => {
  it('draws one marker per interactable: pickups of light in the additive layer, levers and doors as posts in the dark props layer', () => {
    const { layers, views } = stage();
    expect(views.count).toBe(4);
    const m = markers(layers);
    expect(Object.keys(m).sort()).toEqual(['bottle_slot', 'card_spirit_bolt', 'door_b', 'lever']);
    expect(layers.lightOverlay.children).toContain(m['card_spirit_bolt']);
    expect(layers.lightOverlay.children).toContain(m['bottle_slot']);
    expect(layers.propsBack.children).toContain(m['lever']);
    expect(layers.propsBack.children).toContain(m['door_b']);
    expect(layers.lightOverlay.blendMode).toBe('add');
  });

  it('puts each one where the object stands (a pickup floats a little above its feet; view space is y-down)', () => {
    const { layers } = stage();
    const m = markers(layers);
    expect(m['card_spirit_bolt']!.x).toBe(12);
    expect(m['card_spirit_bolt']!.y).toBeCloseTo(-0.85, 1);
    expect(m['lever']!.x).toBe(30);
    expect(m['lever']!.y).toBeCloseTo(0, 9);
  });

  it('a pickup that was taken disappears; one that is still there is shown', () => {
    const { layers, views, available } = stage();
    const m = markers(layers);
    expect(m['card_spirit_bolt']!.visible).toBe(true);
    available.delete('card_spirit_bolt');
    views.update(1 / 60, (id) => available.has(id));
    expect(m['card_spirit_bolt']!.visible).toBe(false);
    expect(m['bottle_slot']!.visible).toBe(true);
  });

  it('a lever stays where it is but dims once it is spent', () => {
    const { layers, views, available } = stage();
    const lever = markers(layers)['lever']!;
    expect(lever.alpha).toBe(1);
    available.delete('lever');
    views.update(1 / 60, (id) => available.has(id));
    expect(lever.visible).toBe(true);
    expect(lever.alpha).toBeLessThan(0.5);
  });

  it('the floating things bob in real time and not in step with each other', () => {
    const { layers, views, available } = stage();
    const m = markers(layers);
    const y0 = m['card_spirit_bolt']!.y;
    views.update(0.35, (id) => available.has(id));
    expect(m['card_spirit_bolt']!.y).not.toBe(y0);
    expect(m['card_spirit_bolt']!.y - -0.85).not.toBeCloseTo(m['bottle_slot']!.y - -0.85, 3);
    expect(Math.abs(m['card_spirit_bolt']!.y - -0.85)).toBeLessThan(0.1); // a bob, not a wander
  });

  it('building again replaces the markers (a room change leaves nothing behind) and clear removes them all', () => {
    const { layers, views, available } = stage();
    views.build(INTERACTION_TEST_ROOM.interactables!, (id) => available.has(id));
    expect(layers.lightOverlay.children.filter((c) => c.label.startsWith('interactable:'))).toHaveLength(2);
    expect(layers.propsBack.children.filter((c) => c.label.startsWith('interactable:'))).toHaveLength(2);
    views.clear();
    expect(views.count).toBe(0);
    expect([...layers.lightOverlay.children, ...layers.propsBack.children].filter((c) => c.label.startsWith('interactable:'))).toHaveLength(0);
  });

  it('a room with no interactables is just empty', () => {
    const layers = createLayers(new Container());
    const views = new InteractableViews(layers);
    views.build([], () => true);
    views.update(1, () => true);
    expect(views.count).toBe(0);
  });
});

describe('a pickup that gives a bottle is a vial, not a card (S27)', () => {
  const build = (): { layers: Layers; views: InteractableViews; available: Set<string> } => {
    const layers = createLayers(new Container());
    const defs = [...R2_HALL_ROOM.interactables!, ...INTERACTION_TEST_ROOM.interactables!.filter((i) => i.id === 'card_spirit_bolt')];
    const available = new Set(defs.map((d) => d.id));
    const views = new InteractableViews(layers);
    views.build(defs, (id) => available.has(id));
    return { layers, views, available };
  };
  const body = (c: Container): { width: number; height: number } => {
    const b = (c.children[1] as Container).getLocalBounds();
    return { width: b.maxX - b.minX, height: b.maxY - b.minY };
  };

  it('R2 floats the fourth bottle over its ledge: in the additive layer, 0.85 m over the feet of the object', () => {
    const { layers } = build();
    const m = markers(layers);
    expect(layers.lightOverlay.children).toContain(m['bottle_fourth']);
    expect(layers.propsBack.children).toContain(m['shrine']);
    expect(m['bottle_fourth']!.x).toBe(49.5);
    expect(Math.abs(m['bottle_fourth']!.y - -(4.8 + 0.85))).toBeLessThan(0.1); // it bobs ±0.06 m around that height
  });

  it('its drawing is the vial\'s — taller than the card\'s and wider — and the card of the other pickup keeps its own', () => {
    const { layers } = build();
    const m = markers(layers);
    const vial = body(m['bottle_fourth']!);
    const card = body(m['card_spirit_bolt']!);
    expect(vial.height).toBeGreaterThan(card.height + 0.05);
    expect(vial.width).toBeGreaterThan(card.width + 0.03);
    expect(vial.height).toBeLessThan(0.9); // a thing you can pick up, not a landmark
  });

  it('it disappears once taken, and the shrine stays', () => {
    const { layers, views, available } = build();
    const m = markers(layers);
    available.delete('bottle_fourth');
    views.update(1 / 60, (id) => available.has(id));
    expect(m['bottle_fourth']!.visible).toBe(false);
    expect(m['shrine']!.visible).toBe(true);
  });
});
