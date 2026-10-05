import type { HitboxSubmission, Team } from '@/combat/Combatant';
import type { Rect } from '@/core/math';
import { TrainingDummy, type TrainingDummyOptions } from '@/enemies/TrainingDummy';
import type { Driver } from './sim';

/** Spawns a training dummy and lets the session flush it into the world (entities join at the end of a tick). */
export function spawnDummy(d: Driver, opts: TrainingDummyOptions): TrainingDummy {
  const dummy = d.session.spawn(new TrainingDummy(d.session.ids.next('dummy'), opts));
  d.step(1);
  return dummy;
}

export interface Strike {
  /** World-space hitbox. */
  rect: Rect;
  damage?: number;
  facing?: 1 | -1;
  knockback?: { x: number; y: number };
  stun?: number;
  hitStop?: number;
  team?: Team;
  attackId?: string;
}

/**
 * An ENEMY attack, as the Ink Slime will submit it: a hitbox for the next combat step with the standard damage numbers
 * of docs/GAME-SPEC-2D.md §9.1 (1 damage, knockback 5.5/4, stun 14, hit-stop 6). Submitted between ticks, it is
 * resolved by the next `tick()` — after the player has moved, exactly like a real enemy's hitbox.
 */
export function strike(d: Driver, s: Strike): HitboxSubmission {
  const hb: HitboxSubmission = {
    ownerId: 'test_enemy',
    team: s.team ?? 'enemy',
    rect: { ...s.rect },
    attackId: s.attackId ?? 'test_strike',
    damage: s.damage ?? 1,
    knockback: s.knockback ?? { x: 5.5, y: 4 },
    stun: s.stun ?? 14,
    hitStop: s.hitStop ?? 6,
    shake: 0.2,
    facing: s.facing ?? 1,
    alreadyHit: new Set(),
  };
  d.session.combat.submit(hb);
  return hb;
}

/** A hitbox exactly over the player's torso. */
export function strikeOnPlayer(d: Driver, s: Partial<Strike> = {}): HitboxSubmission {
  const b = d.body;
  return strike(d, { rect: { x0: b.x - 0.5, x1: b.x + 0.5, y0: b.y + 0.2, y1: b.y + 1.2 }, ...s });
}

/** Records every hitbox the combat system receives (the simulation submits them only on active ticks). */
export function recordSubmissions(d: Driver): Array<{ tick: number; attackId: string; rect: Rect }> {
  const log: Array<{ tick: number; attackId: string; rect: Rect }> = [];
  const combat = d.session.combat;
  const original = combat.submit.bind(combat);
  combat.submit = (hb) => {
    log.push({ tick: d.session.now, attackId: hb.attackId, rect: { ...hb.rect } });
    original(hb);
  };
  return log;
}
