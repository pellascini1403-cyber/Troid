import { describe, expect, it } from 'vitest';
import { attackLength } from '@/combat/AttackDefinition';
import { attackRect } from '@/combat/hitboxGeometry';
import { ENEMIES, INK_SLIME, SLIME_LUNGE } from '@/content/enemies';
import { CATALOGS } from '@/i18n';
import { PLAYER } from '@/content/player';

/**
 * The Ink Slime's numbers are the contract of docs/GAME-SPEC-2D.md §15.1 (and DC-33): this file is where a retune that
 * drifts from the spec fails loudly instead of silently.
 */
describe('Ink Slime data (GAME-SPEC-2D §15.1)', () => {
  const p = INK_SLIME.ai.params;

  it('has 3 health and a 1.1 × 0.9 m body', () => {
    expect(INK_SLIME.health).toBe(3);
    expect(INK_SLIME.body.halfWidth * 2).toBeCloseTo(1.1, 6);
    expect(INK_SLIME.body.height).toBeCloseTo(0.9, 6);
  });

  it('patrols at 1.2 m/s and approaches at 2.4 m/s', () => {
    expect(p.patrolSpeed).toBe(1.2);
    expect(p.approachSpeed).toBe(2.4);
  });

  it('notices at 8 m and winds up at 2.2 m', () => {
    expect(p.detectRange).toBe(8);
    expect(p.attackRange).toBe(2.2);
  });

  it('winds up for 24 ticks: the telegraph IS the attack\'s startup (one number, not two)', () => {
    expect(SLIME_LUNGE.startup).toBe(24);
  });

  it('lunges at 9 m/s for 10 ticks (≈ 1.5 m) with a 1.3 × 0.9 m hitbox and 1 damage', () => {
    expect(SLIME_LUNGE.lunge).toEqual({ speed: 9, ticks: 10 });
    expect(SLIME_LUNGE.active).toBe(10);
    expect((SLIME_LUNGE.lunge!.speed * SLIME_LUNGE.lunge!.ticks) / 60).toBeCloseTo(1.5, 6);
    expect(SLIME_LUNGE.hitbox.w).toBeCloseTo(1.3, 6);
    expect(SLIME_LUNGE.hitbox.h).toBeCloseTo(0.9, 6);
    expect(SLIME_LUNGE.damage).toBe(1);
  });

  it('recovers for 36 ticks (the punish window), is stunned 14 ticks and dies in 40', () => {
    expect(SLIME_LUNGE.recovery).toBe(36);
    expect(INK_SLIME.hurt.stun).toBe(14);
    expect(INK_SLIME.death.ticks).toBe(40);
    expect(attackLength(SLIME_LUNGE)).toBe(70);
  });

  it('hurts the player with the standard hit of §9.1 (knockback 5.5 / 4, 14 ticks of stun, hit-stop 6)', () => {
    expect(SLIME_LUNGE.knockback).toEqual({ x: 5.5, y: 4 });
    expect(SLIME_LUNGE.stun).toBe(14);
    expect(SLIME_LUNGE.hitStop).toBe(6);
    expect(PLAYER.combat.hurt.stun).toBe(14);
  });

  it('its hitbox is its own body plus a hand\'s breadth: centred, mirrored, and as tall as the body', () => {
    const right = attackRect(SLIME_LUNGE, 10, 2, 1, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const left = attackRect(SLIME_LUNGE, 10, 2, -1, { x0: 0, y0: 0, x1: 0, y1: 0 });
    expect(right.x0).toBeCloseTo(9.35, 6);
    expect(right.x1).toBeCloseTo(10.65, 6);
    expect(left).toEqual(right); // centred: facing does not move it
    expect(right.y0).toBeCloseTo(2, 6);
    expect(right.y1).toBeCloseTo(2.9, 6);
    // wider than the body (1.1) on both sides: it can still touch what the body brushes
    expect(right.x1 - right.x0).toBeGreaterThan(INK_SLIME.body.halfWidth * 2);
  });

  it('its attack reaches what its attack range promises: a lunge from 2.2 m lands on a player standing still', () => {
    const travelled = (SLIME_LUNGE.lunge!.speed * SLIME_LUNGE.lunge!.ticks) / 60;
    const frontAfterLunge = travelled + (SLIME_LUNGE.hitbox.x + SLIME_LUNGE.hitbox.w); // the hitbox's leading edge, from the start centre
    // the player's nearest edge is `attackRange − halfWidth` away: the leading edge has to get past it
    expect(frontAfterLunge).toBeGreaterThanOrEqual(p.attackRange - PLAYER.body.halfWidth);
  });

  it('has a name KEY that exists in every catalog, a procedural look and a registered id', () => {
    expect(INK_SLIME.nameKey).toBe('enemy.inkSlime.name');
    for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[INK_SLIME.nameKey], lang).toBeTruthy();
    expect(INK_SLIME.view).toEqual({ proceduralId: 'ink_slime' });
    expect(ENEMIES[INK_SLIME.id]).toBe(INK_SLIME);
    expect(INK_SLIME.attacks[p.attack]).toBe(SLIME_LUNGE);
  });

  it('hysteresis: it gives up farther than it notices, and its vertical reach is smaller than its sight', () => {
    expect(p.loseRange).toBeGreaterThan(p.detectRange);
    expect(p.attackHeight).toBeLessThan(p.detectHeight);
    expect(p.idleTicks[0]).toBeLessThanOrEqual(p.idleTicks[1]);
  });
});
