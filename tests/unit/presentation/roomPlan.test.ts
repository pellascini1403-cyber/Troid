import { describe, expect, it } from 'vitest';
import { readEnvLook } from '@/presentation/environment';
import { PICKUP_FLOAT, sealSigilY } from '@/presentation/environment';
import { cropFrame, exposedEdges, planHazards, planInteractables, planSeals, planStrip, planTerrain, subtractSpans, type PieceInfo, type PieceLookup, type PlanRoom } from '@/presentation/roomPlan';
import { rect } from '@/world/builders';
import { R1_GATE_ROOM } from '@/content/rooms/r1Gate';
import { R2_HALL_ROOM } from '@/content/rooms/r2Hall';
import { R3_CHAMBER_ROOM } from '@/content/rooms/r3Chamber';
import { R4_SANCTUM_ROOM } from '@/content/rooms/r4Sanctum';

/**
 * WHAT TO DRAW OF A ROOM'S OWN DATA (docs/ART-PIPELINE-2D.md, part M): the pure plan that turns the room's solids and the size of each piece of art into rectangles.
 * The rule that governs it: the room is the truth and the art is cut to it — the last cell of a repetition is clipped, never scaled, and nothing moves a collider.
 */
const piece = (w: number, h: number, tags: string[] = [], frames = 1): PieceInfo => ({ frames, w, h, look: readEnvLook(tags) });

describe('subtractSpans', () => {
  it('cuts the covered parts out of a span and keeps the rest in order', () => {
    expect(subtractSpans(0, 10, [[2, 4], [6, 7]])).toEqual([[0, 2], [4, 6], [7, 10]]);
    expect(subtractSpans(0, 10, [[-5, 20]])).toEqual([]);
    expect(subtractSpans(0, 10, [])).toEqual([[0, 10]]);
    expect(subtractSpans(0, 10, [[0, 3], [3, 10]])).toEqual([]);
  });
});

describe('exposedEdges: only what can be seen', () => {
  const ground = { id: 'g', rect: rect(0, -6, 20, 0), kind: 'solid' as const };
  const hurdle = { id: 'h', rect: rect(5, 0, 7, 1), kind: 'solid' as const };

  it('a block standing on the ground hides the ground\'s cap under it and has no cap-free top of its own', () => {
    expect(exposedEdges(ground, [ground, hurdle]).top).toEqual([[0, 5], [7, 20]]);
    expect(exposedEdges(hurdle, [ground, hurdle]).top).toEqual([[5, 7]]);
  });

  it('a block against another has no side where they touch, and a side that faces air is open', () => {
    const wall = { id: 'w', rect: rect(20, -6, 22, 10), kind: 'solid' as const };
    expect(exposedEdges(ground, [ground, wall]).right).toEqual([]);
    expect(exposedEdges(ground, [ground]).right).toEqual([[-6, 0]]);
    // the hurdle's sides are open above the ground only
    expect(exposedEdges(hurdle, [ground, hurdle]).left).toEqual([[0, 1]]);
  });

  it('a one-way platform is not a wall: it covers nothing', () => {
    const plat = { id: 'p', rect: rect(2, 0, 8, 0.3), kind: 'oneway' as const };
    expect(exposedEdges(ground, [ground, plat]).top).toEqual([[0, 20]]);
  });
});

describe('planTerrain', () => {
  const room: PlanRoom = {
    solids: [
      { id: 'ground', rect: rect(0, -4, 5, 0), kind: 'solid', material: 'earth' },
      { id: 'plat', rect: rect(1, 2.7, 4.4, 3), kind: 'oneway', material: 'wood' },
      { id: 'door', rect: rect(5, 0, 6.5, 7), kind: 'solid', material: 'gate' },
    ],
    gates: [{ id: 'exit_door', solid: 'door' }],
  };
  const pieces: Record<string, PieceInfo> = {
    'solid:earth:fill': piece(2, 2, ['grid:2x2'], 4),
    'solid:earth:cap': piece(2, 0.5, ['grid:2x1', 'rise:0.2'], 2),
    'solid:earth:edge-r': piece(0.3, 2, ['reach:0.1']),
    'platform:wood:body': piece(2, 0.4, ['rise:0.1']),
    'platform:wood:cap-r': piece(0.4, 0.4, ['reach:0.05']),
    'door:gate:body': piece(1.5, 3),
    'door:gate:top': piece(1.5, 0.8, ['rise:0.1']),
  };
  const lookup: PieceLookup = (role, subject, part) => pieces[`${role}:${subject}:${part}`] ?? null;

  it('fills a block from its top-left corner with whole cells and clips the last column and row to what is left, never scaling them', () => {
    const plan = planTerrain(room, lookup);
    const fill = plan.draws.filter((d) => d.slot === 'solid:earth:fill');
    // 5 × 4 m of 2 × 2 m cells: 3 columns (the third 1 m wide) × 2 rows
    expect(fill).toHaveLength(6);
    expect(fill.every((d) => d.top <= 0 && d.top - d.h >= -4 - 1e-9)).toBe(true);
    const last = fill.find((d) => d.x === 4)!;
    expect(last.w).toBeCloseTo(1);
    expect(last.u1).toBeCloseTo(0.5);
    expect(last.v1).toBe(1);
    // the cells tile the rectangle exactly: the areas add up to the block's
    expect(fill.reduce((a, d) => a + d.w * d.h, 0)).toBeCloseTo(5 * 4);
  });

  it('picks the cell of a grid by its place in the repetition: (column mod C) + C × (row mod R)', () => {
    const fill = planTerrain(room, lookup).draws.filter((d) => d.slot === 'solid:earth:fill');
    const frameAt = (x: number, top: number): number => fill.find((d) => d.x === x && d.top === top)!.frame;
    expect(frameAt(0, 0)).toBe(0);
    expect(frameAt(2, 0)).toBe(1);
    expect(frameAt(4, 0)).toBe(0);
    expect(frameAt(0, -2)).toBe(2);
    expect(frameAt(2, -2)).toBe(3);
  });

  it('puts the cap along the open top, lifted by what the art says it rises above the line, and the edge on the open side, pushed out by its reach', () => {
    const plan = planTerrain(room, lookup);
    const cap = plan.draws.filter((d) => d.slot === 'solid:earth:cap');
    // the ground is 5 m: 2 whole cells and a half
    expect(cap).toHaveLength(3);
    expect(cap.every((d) => Math.abs(d.top - 0.2) < 1e-9)).toBe(true);
    expect(cap[2]!.u1).toBeCloseTo(0.5);
    const edge = plan.draws.filter((d) => d.slot === 'solid:earth:edge-r');
    // the door (5…6.5) leans against the ground's right side from y = 0 up: the ground's side is open from its foot to the top of the ground only where the door does not cover — the door starts at 0
    expect(edge.length).toBeGreaterThan(0);
    expect(edge[0]!.x).toBeCloseTo(5 + 0.1 - 0.3);
  });

  it('a platform: a row of body cells (the last one clipped) and an end piece that overhangs by its reach', () => {
    const plan = planTerrain(room, lookup);
    const body = plan.draws.filter((d) => d.slot === 'platform:wood:body');
    expect(body).toHaveLength(2);
    expect(body[1]!.w).toBeCloseTo(1.4);
    const end = plan.draws.filter((d) => d.slot === 'platform:wood:cap-r');
    expect(end).toHaveLength(1);
    expect(end[0]!.x + end[0]!.w).toBeCloseTo(4.4 + 0.05);
  });

  it('a door is a column of the body from its bottom, clipped at the TOP (it keeps the bottom of the frame), and its draws belong to its gate', () => {
    const plan = planTerrain(room, lookup);
    const door = plan.gates.get('exit_door')!;
    expect(door).toBeDefined();
    const body = door.filter((d) => d.slot === 'door:gate:body');
    // 7 m of 3 m cells: two whole and one of 1 m
    expect(body).toHaveLength(3);
    expect(body[2]!.h).toBeCloseTo(1);
    expect(body[2]!.v0).toBeCloseTo(1 - 1 / 3);
    expect(body[2]!.v1).toBe(1);
    expect(body[2]!.top).toBeCloseTo(7);
    expect(door.some((d) => d.slot === 'door:gate:top')).toBe(true);
    // a door is not drawn in the terrain draws: the view fades it by itself
    expect(plan.draws.some((d) => d.slot.startsWith('door:'))).toBe(false);
  });

  it('what the art does not have is reported, and the blockout of that solid stays', () => {
    const plan = planTerrain(room, (role, subject, part) => (role === 'solid' ? null : lookup(role, subject, part)));
    expect(plan.lacking.get('solid:earth:fill')).toEqual(['ground']);
    expect(plan.dressed.has('ground')).toBe(false);
    expect(plan.dressed.has('plat')).toBe(true);
  });

  it('with a view, cells that can never be on screen are not made', () => {
    const all = planTerrain(room, lookup).draws.filter((d) => d.slot === 'solid:earth:fill').length;
    const some = planTerrain(room, lookup, rect(0, -1, 2.5, 5)).draws.filter((d) => d.slot === 'solid:earth:fill').length;
    expect(some).toBeLessThan(all);
    expect(some).toBeGreaterThan(0);
  });

  it('plans the real R1: every block is dressed when the art has stone, earth, wood and the gate', () => {
    const real = planTerrain(
      R1_GATE_ROOM,
      (_role, _subject, part) => (part === 'fill' || part === 'body' ? piece(2, 2, ['grid:2x2'], 4) : null),
      rect(-30, -12, 140, 24),
    );
    expect(real.lacking.size).toBe(0);
    expect(real.dressed.size).toBe(R1_GATE_ROOM.solids.length);
  });
});

describe('planStrip: a seamless strip over a parallax layer', () => {
  it('covers the layer\'s span with whole copies and stands where the screen is filled at every camera height', () => {
    const bounds = rect(-1, -6, 114, 11);
    const plan = planStrip(bounds, 0.4, 48, 17, 13.5);
    // the span of a layer at factor f is f × the room's width plus the visible width on both sides: the copies reach past both ends
    expect(plan.xs[0]).toBeLessThanOrEqual(-1 * 0.4 - 24 + 1e-9);
    expect(plan.xs[plan.xs.length - 1]! + 48).toBeGreaterThanOrEqual(114 * 0.4 + 24 - 1e-9);
    expect(plan.xs.every((x, i) => i === 0 || Math.abs(x - plan.xs[i - 1]! - 48) < 1e-9)).toBe(true);
    // lowest centre 0.75: the view's bottom is 0.4 × 0.75 − 6.75 − the margin
    expect(plan.bottom).toBeCloseTo(0.4 * 0.75 - 6.75 - 0.3);
    expect(plan.coversView).toBe(true);
    expect(plan.needed).toBeLessThan(17);
  });

  it('says when the strip is too short for the camera\'s range (the sky would show over it)', () => {
    expect(planStrip(rect(0, -6, 100, 11), 0.75, 48, 14, 13.5).coversView).toBe(false);
    expect(planStrip(rect(0, -6, 100, 11), 0.15, 48, 15, 13.5).coversView).toBe(true);
    expect(planStrip(rect(0, -6, 100, 11), 0.15, 48, 14, 13.5).coversView).toBe(false);
  });
});

describe('cropFrame: the clipped last cell keeps the packer\'s alignment', () => {
  const frame = { x: 100, y: 40, w: 30, h: 20 };
  const orig = { w: 40, h: 32 };
  // the packer cut 5 px off the left and 4 off the top: the visible pixels sit at (5, 4) of the original
  const trim = { x: 5, y: 4, w: 30, h: 20 };

  it('keeping the whole original keeps the whole frame, in the same place', () => {
    const r = cropFrame(frame, orig, trim, { x0: 0, y0: 0, x1: 40, y1: 32 })!;
    expect(r.frame).toEqual(frame);
    expect(r.trim).toEqual({ x: 5, y: 4, w: 30, h: 20 });
    expect(r.orig).toEqual({ w: 40, h: 32 });
  });

  it('keeping the left part of the picture takes the matching part of the frame and a trim that still points where the pixels are', () => {
    const r = cropFrame(frame, orig, trim, { x0: 0, y0: 0, x1: 20, y1: 32 })!;
    // 20 px of the original: 5 of them are the transparent border, 15 are pixels (columns 100…115 of the page)
    expect(r.orig).toEqual({ w: 20, h: 32 });
    expect(r.trim).toEqual({ x: 5, y: 4, w: 15, h: 20 });
    expect(r.frame).toEqual({ x: 100, y: 40, w: 15, h: 20 });
  });

  it('keeping the bottom of the picture (a door\'s last cell) shifts the frame down by what is cut off the top', () => {
    const r = cropFrame(frame, orig, trim, { x0: 0, y0: 16, x1: 40, y1: 32 })!;
    expect(r.orig).toEqual({ w: 40, h: 16 });
    expect(r.trim.y).toBe(0);
    expect(r.trim.h).toBe(8);
    expect(r.frame.y).toBe(40 + (16 - 4));
  });

  it('answers null when only transparent border is left, and works for a frame that was not trimmed', () => {
    expect(cropFrame(frame, orig, trim, { x0: 0, y0: 0, x1: 4, y1: 32 })).toBeNull();
    const whole = cropFrame({ x: 0, y: 0, w: 40, h: 32 }, orig, null, { x0: 10, y0: 0, x1: 30, y1: 32 })!;
    expect(whole.frame).toEqual({ x: 10, y: 0, w: 20, h: 32 });
    expect(whole.trim).toEqual({ x: 0, y: 0, w: 20, h: 32 });
  });
});

describe('planHazards: the zones that hurt', () => {
  const spikes = (w: number, h: number, frames = 1, tags: string[] = []): PieceInfo => piece(w, h, tags, frames);

  it('puts a row of the art\'s cells along the zone from its FLOOR, as big as the art says, whole cells then the clipped one (the left part of the frame, never scaled)', () => {
    const plan = planHazards([{ id: 'ditch', kind: 'spikes', rect: rect(39.5, -3.2, 42, -2.6) }], () => spikes(0.5, 0.7));
    expect(plan.draws).toHaveLength(5);
    expect(plan.draws.map((d) => d.x)).toEqual([39.5, 40, 40.5, 41, 41.5]);
    // the cell stands on the floor of the zone and is taller than the zone (the zone is what hurts; the picture only says where)
    for (const d of plan.draws) expect([d.top, d.w, d.h, d.slot]).toEqual([-3.2 + 0.7, 0.5, 0.7, 'hazard:spikes:cell']);
    expect([...plan.dressed]).toEqual(['ditch']);
    const clipped = planHazards([{ id: 'z', kind: 'spikes', rect: rect(0, 0, 1.3, 0.6) }], () => spikes(0.5, 0.7)).draws;
    expect(clipped.map((d) => [d.x, d.w, d.u1].map((n) => Math.round(n * 1e6) / 1e6))).toEqual([[0, 0.5, 1], [0.5, 0.5, 1], [1, 0.3, 0.6]]);
  });

  it('picks the cell of a grid by its place along the zone, so a long strip does not repeat one picture', () => {
    const frames = planHazards([{ id: 'z', kind: 'spikes', rect: rect(0, 0, 3, 0.6) }], () => spikes(0.5, 0.7, 3, ['grid:3x1'])).draws.map((d) => d.frame);
    expect(frames).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('a kind the art has no cell for is reported, and the blockout of that zone stays', () => {
    const plan = planHazards([{ id: 'a', kind: 'spikes', rect: rect(0, 0, 2, 0.6) }, { id: 'b', kind: 'fire', rect: rect(5, 0, 7, 0.6) }], (k) => (k === 'spikes' ? spikes(0.5, 0.7) : null));
    expect([...plan.dressed]).toEqual(['a']);
    expect([...plan.lacking]).toEqual([['hazard:fire:cell', ['b']]]);
  });

  it('with a view, cells that can never be on screen are not made', () => {
    const plan = planHazards([{ id: 'z', kind: 'spikes', rect: rect(0, 0, 100, 0.6) }], () => spikes(0.5, 0.7), rect(10, -5, 12, 5));
    expect(plan.draws.length).toBeLessThanOrEqual(5);
    expect(plan.draws.every((d) => d.x + d.w > 10 && d.x < 12)).toBe(true);
    expect([...plan.dressed]).toEqual(['z']);
  });

  it('plans the real R2: its strip of spikes is dressed when the art has a cell for them', () => {
    const plan = planHazards(R2_HALL_ROOM.hazards ?? [], () => spikes(0.5, 0.7));
    expect([...plan.dressed]).toEqual(['spikes_ditch']);
    expect(plan.draws).toHaveLength(5);
  });
});

describe('planInteractables: the shrines, the pickups and the levers', () => {
  const pieces: Record<string, PieceInfo> = {
    'rest:': piece(1.6, 2.6, [], 2),
    'pickup:bottle': piece(0.5, 0.8),
    'pickup:': piece(0.6, 0.6),
  };
  const lookup = (kind: string, variant: string): PieceInfo | null => pieces[`${kind}:${variant}`] ?? pieces[`${kind}:`] ?? null;

  it('a shrine stands on the spot its data names, behind the action, with the two frames it has (resting, lit)', () => {
    const plan = planInteractables([{ id: 'shrine', kind: 'rest', x: 12, y: 0, actions: [{ type: 'checkpoint' }] }], lookup);
    expect(plan.placements).toEqual([{ id: 'shrine', kind: 'rest', variant: '', slot: 'interactive:rest:', x: 12, y: 0, layer: 'propsBack', floats: false, frames: 2 }]);
    expect([...plan.dressed]).toEqual(['shrine']);
  });

  it('a pickup floats: centred on the height its data names plus the float, in the light layer, by what it gives', () => {
    const bottle = planInteractables([{ id: 'b', kind: 'pickup', x: 49.5, y: 4.8, actions: [{ type: 'addBottleSlot' }, { type: 'setFlag' }] }], lookup).placements[0]!;
    expect([bottle.variant, bottle.layer, bottle.floats, bottle.x]).toEqual(['bottle', 'lightOverlay', true, 49.5]);
    // the pivot is the bottom of the picture: its centre (0.8 m tall) is at 4.8 + the float
    expect(bottle.y + 0.8 / 2).toBeCloseTo(4.8 + PICKUP_FLOAT, 10);
    // a card has no variant of its own in this art: the picture with none serves it
    const card = planInteractables([{ id: 'c', kind: 'pickup', x: 1, y: 0, actions: [{ type: 'acquireCard' }] }], lookup).placements[0]!;
    expect([card.variant, card.slot, card.frames]).toEqual(['card', 'interactive:pickup:card', 1]);
  });

  it('what the art has no picture for is reported by its slot, and its blockout stays', () => {
    const plan = planInteractables(
      [{ id: 'lever', kind: 'activate', x: 3, y: 0 }, { id: 'rune', kind: 'pickup', x: 4, y: 0, actions: [{ type: 'unlockAbility' }] }],
      (kind, variant) => (kind === 'pickup' && variant === 'rune' ? null : lookup(kind, variant)),
    );
    expect([...plan.lacking]).toEqual([['interactive:activate:', ['lever']], ['interactive:pickup:rune', ['rune']]]);
    expect(plan.placements).toEqual([]);
  });

  it('plans the real world: R2 asks for a shrine and a bottle, R3 for a card, R4 for a shrine and a rune', () => {
    const asks = (room: { interactables?: ReadonlyArray<{ id: string; kind: string; x: number; y: number; actions?: ReadonlyArray<{ type: string }> }> }): string[] => [...planInteractables(room.interactables ?? [], () => null).lacking.keys()].sort();
    expect(asks(R2_HALL_ROOM)).toEqual(['interactive:pickup:bottle', 'interactive:rest:']);
    expect(asks(R3_CHAMBER_ROOM)).toEqual(['interactive:pickup:card']);
    expect(asks(R4_SANCTUM_ROOM)).toEqual(['interactive:pickup:rune', 'interactive:rest:']);
  });
});

describe('planSeals: the wards', () => {
  const sigil = (frames = 2): PieceInfo => piece(3, 3, [], frames);

  it('hangs the sigil where the blockout hangs it: the middle of the ward, or 1.8 m over its feet when it is taller than the hero reaches', () => {
    expect(sealSigilY({ y: 0, height: 3.6 })).toBeCloseTo(1.8, 10);
    expect(sealSigilY({ y: 0 })).toBeCloseTo(1.8, 10);
    expect(sealSigilY({ y: 2, height: 1 })).toBeCloseTo(2.5, 10);
    expect(sealSigilY({ y: 0, height: 9 })).toBeCloseTo(1.8, 10);
  });

  it('one placement per ward, on its spot, with the pictures the art has', () => {
    const plan = planSeals([{ id: 'a', x: 63, y: 0 }, { id: 'b', x: 10, y: 4, height: 2 }], sigil());
    expect(plan.placements).toEqual([{ id: 'a', x: 63, y: 1.8, frames: 2 }, { id: 'b', x: 10, y: 5, frames: 2 }]);
    expect(plan.lacking.size).toBe(0);
  });

  it('a room with wards and an art with no sigil reports the slot, and the blockout keeps its shapes', () => {
    const plan = planSeals(R3_CHAMBER_ROOM.seals ?? [], null);
    expect(plan.placements).toEqual([]);
    expect([...plan.lacking]).toEqual([['seal::', ['seal']]]);
    expect(planSeals([], null).lacking.size).toBe(0);
  });
});

