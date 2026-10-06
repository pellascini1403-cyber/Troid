import { describe, expect, it } from 'vitest';
import type { HitboxSubmission } from '@/combat/Combatant';
import { HAZARD_HIT, HazardSystem, type HazardHost } from '@/gameplay/HazardSystem';
import { rect } from '@/world/builders';
import type { HazardDef } from '@/world/RoomDefinition';

/**
 * The hazard system on its own (docs/PROMPT6-LOG.md S25): a position in, hitboxes out. Whether a hit LANDS — i-frames, death, the
 * knockback, the events — is combat's business and is tested with the real world in tests/integration/hazards.test.ts.
 */
const spikes: HazardDef = { id: 'sp', kind: 'spikes', rect: rect(10, 0, 14, 0.6) };

function setup(x: number, y = 0, over: { dead?: boolean; facing?: 1 | -1 } = {}) {
  const submitted: HitboxSubmission[] = [];
  const hits: Array<{ hazardId: string; kind: string; damage: number; x: number; y: number }> = [];
  const player = { body: { x, y, halfW: 0.35, height: 1.7 }, facing: over.facing ?? (1 as 1 | -1), health: { dead: over.dead ?? false } };
  const host: HazardHost = { combat: { submit: (hb) => void submitted.push(hb) }, player, hit: (e) => void hits.push(e) };
  return { host, submitted, hits, player };
}

describe('HazardSystem', () => {
  it('a room with none costs nothing and submits nothing', () => {
    const s = new HazardSystem();
    const { host, submitted } = setup(12);
    s.setRoom(undefined);
    s.update(host);
    s.setRoom([]);
    s.update(host);
    expect(submitted).toEqual([]);
    expect(s.count).toBe(0);
  });

  it('a hero standing in the zone is hit by a hitbox over the zone, standard hurt numbers, aimed at the player only', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    const { host, submitted } = setup(13);
    s.update(host);
    expect(submitted).toHaveLength(1);
    const hb = submitted[0]!;
    expect(hb.rect).toEqual(spikes.rect);
    expect(hb.team).toBe('enemy');
    expect(hb.hits).toEqual(['player']);
    expect(hb.ownerId).toBe('hazard:sp');
    expect(hb.attackId).toBe('hazard_spikes');
    expect([hb.damage, hb.stun, hb.hitStop]).toEqual([HAZARD_HIT.damage, HAZARD_HIT.stun, HAZARD_HIT.hitStop]);
    expect(hb.knockback).toEqual(HAZARD_HIT.knockback);
    expect(hb.knockback.y, 'mostly UP: a hero who touched spikes is thrown out of them').toBeGreaterThan(hb.knockback.x);
    expect(hb.alreadyHit.size).toBe(0);
  });

  it('a hero who is not touching the zone is not hit: beside it, above it, under it', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    for (const [x, y] of [[8, 0], [16, 0], [12, 1], [12, -3]] as const) {
      const { host, submitted } = setup(x, y);
      s.update(host);
      expect(submitted, `at (${x}, ${y})`).toEqual([]);
    }
    // touching the edge is not being in it; one step in is
    const edge = setup(10 - 0.35);
    s.update(edge.host);
    expect(edge.submitted).toEqual([]);
    const inside = setup(10 - 0.35 + 0.01);
    s.update(inside.host);
    expect(inside.submitted).toHaveLength(1);
  });

  it('a hero who is down is not hit again', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    const { host, submitted } = setup(12, 0, { dead: true });
    s.update(host);
    expect(submitted).toEqual([]);
  });

  it('the knockback pushes AWAY from the middle of the zone; dead centre, against the way the hero faces', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    const right = setup(13);
    s.update(right.host);
    expect(right.submitted[0]!.facing).toBe(1);
    const left = setup(11);
    s.update(left.host);
    expect(left.submitted[0]!.facing).toBe(-1);
    const centreFacingRight = setup(12, 0, { facing: 1 });
    s.update(centreFacingRight.host);
    expect(centreFacingRight.submitted[0]!.facing).toBe(-1);
    const centreFacingLeft = setup(12, 0, { facing: -1 });
    s.update(centreFacingLeft.host);
    expect(centreFacingLeft.submitted[0]!.facing).toBe(1);
  });

  it('every zone the hero stands in hurts, each with its own id; a hazard may take more than a point', () => {
    const s = new HazardSystem();
    s.setRoom([spikes, { id: 'deep', kind: 'spikes', rect: rect(12, 0, 16, 1), damage: 3 }, { id: 'far', kind: 'spikes', rect: rect(30, 0, 34, 1) }]);
    const { host, submitted } = setup(12.5);
    s.update(host);
    expect(submitted.map((h) => [h.ownerId, h.damage])).toEqual([['hazard:sp', 1], ['hazard:deep', 3]]);
  });

  it('a confirmed hit is reported with the hazard, its damage and where it landed (and only when combat confirms it)', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    const { host, submitted, hits } = setup(12);
    s.update(host);
    expect(hits).toEqual([]); // submitted, not yet landed
    submitted[0]!.onConfirm!({} as never, { damage: 1, x: 12, y: 0.3 } as never);
    expect(hits).toEqual([{ hazardId: 'sp', kind: 'spikes', damage: 1, x: 12, y: 0.3 }]);
  });

  it('`touches` says whether a box is inside any zone (the safe-ground tracker never records such a spot)', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    expect(s.touches({ x0: 11, x1: 12, y0: 0, y1: 1.7 })).toBe(true);
    expect(s.touches({ x0: 14.1, x1: 15, y0: 0, y1: 1.7 })).toBe(false);
    s.setRoom(undefined);
    expect(s.touches({ x0: 11, x1: 12, y0: 0, y1: 1.7 })).toBe(false);
  });

  it('a new room replaces the hazards of the old one', () => {
    const s = new HazardSystem();
    s.setRoom([spikes]);
    s.setRoom([{ id: 'other', kind: 'spikes', rect: rect(50, 0, 52, 1) }]);
    const { host, submitted } = setup(12);
    s.update(host);
    expect(submitted).toEqual([]);
    expect(s.count).toBe(1);
  });
});
