import { overlaps, type Rect } from '@/core/math';
import type { EventBus } from '@/core/events';
import type { Combatant, HitboxSubmission, HitInfo, Hurtbox, Team } from './Combatant';

/** Emitted for every confirmed hit. Views turn this into sparks, numbers, shake, sound. */
export interface HitEvent {
  attackId: string;
  attackerId: string;
  targetId: string;
  targetTeam: Team;
  damage: number;
  x: number;
  y: number;
  direction: 1 | -1;
  killed: boolean;
  hitStop: number;
  shake: number;
  part?: string;
}

export interface CombatEvents {
  'combat:hit': HitEvent;
  'health:changed': { id: string; team: Team; current: number; max: number; delta: number; x: number; y: number };
  'actor:died': { id: string; team: Team; x: number; y: number };
}

export interface CombatHost {
  readonly bus: EventBus<CombatEvents>;
  /** Freezes the simulation for `ticks` (the longest request in a tick wins). */
  requestHitStop(ticks: number): void;
}

const MAX_TARGETS = 256;

/**
 * Resolves attacks against vulnerable regions. Attackers SUBMIT a hitbox during their tick; once everything has
 * moved, `resolve()` tests all submissions against all combatants and applies the hits. One rule keeps it fair:
 * a given attack instance hits a given target at most once.
 */
export class CombatSystem {
  private readonly combatants: Combatant[] = [];
  private submissions: HitboxSubmission[] = [];
  private readonly hurtboxes: Hurtbox[] = [];
  private readonly overlap: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(private readonly host: CombatHost) {}

  get count(): number {
    return this.combatants.length;
  }

  add(c: Combatant): void {
    if (this.combatants.includes(c)) return;
    if (this.combatants.length >= MAX_TARGETS) throw new Error('too many combatants');
    this.combatants.push(c);
  }

  remove(c: Combatant): void {
    const i = this.combatants.indexOf(c);
    if (i >= 0) this.combatants.splice(i, 1);
  }

  clear(): void {
    this.combatants.length = 0;
    this.submissions.length = 0;
  }

  submit(hb: HitboxSubmission): void {
    this.submissions.push(hb);
  }

  /** Hitboxes submitted this tick (debug overlay). */
  get pendingHitboxes(): readonly HitboxSubmission[] {
    return this.submissions;
  }

  resolve(): void {
    const subs = this.submissions;
    if (subs.length === 0) return;
    this.submissions = [];
    let hitStop = 0;

    for (const hb of subs) {
      for (const target of [...this.combatants]) {
        if (target.id === hb.ownerId) continue;
        if (!this.canHit(hb, target.team)) continue;
        if (hb.alreadyHit.has(target.id)) continue;
        if (target.invulnerable || target.health.dead) continue;

        this.hurtboxes.length = 0;
        target.collectHurtboxes(this.hurtboxes);
        // A hit lands on the FIRST overlapping region (callers order them by priority: weak points first).
        for (const box of this.hurtboxes) {
          if (!overlaps(hb.rect, box.rect)) continue;
          const ox0 = Math.max(hb.rect.x0, box.rect.x0);
          const ox1 = Math.min(hb.rect.x1, box.rect.x1);
          const oy0 = Math.max(hb.rect.y0, box.rect.y0);
          const oy1 = Math.min(hb.rect.y1, box.rect.y1);
          const info: HitInfo = {
            attackId: hb.attackId,
            attackerId: hb.ownerId,
            damage: hb.damage * box.multiplier,
            direction: hb.facing,
            knockbackX: hb.knockback.x,
            knockbackY: hb.knockback.y,
            stun: hb.stun,
            hitStop: hb.hitStop,
            shake: hb.shake,
            x: (ox0 + ox1) / 2,
            y: (oy0 + oy1) / 2,
            part: box.part,
          };
          const hpBefore = target.health.current;
          const outcome = target.receiveHit(info);
          if (outcome === 'ignored') break; // e.g. a phase where the target ignores hits: do not consume the hit
          hb.alreadyHit.add(target.id);
          if (outcome === 'hit') {
            const delta = target.health.current - hpBefore;
            const killed = target.health.dead;
            this.host.bus.emit('combat:hit', {
              attackId: hb.attackId, attackerId: hb.ownerId, targetId: target.id, targetTeam: target.team,
              damage: -delta, x: info.x, y: info.y, direction: info.direction, killed,
              hitStop: info.hitStop, shake: info.shake, part: info.part,
            });
            if (delta !== 0) {
              this.host.bus.emit('health:changed', {
                id: target.id, team: target.team, current: target.health.current, max: target.health.max, delta, x: info.x, y: info.y,
              });
            }
            hitStop = Math.max(hitStop, info.hitStop);
            hb.onConfirm?.(target, info);
          }
          break;
        }
      }
    }
    if (hitStop > 0) this.host.requestHitStop(hitStop);
  }

  private canHit(hb: HitboxSubmission, team: Team): boolean {
    if (hb.hits) return hb.hits.includes(team);
    if (team === hb.team) return false;
    // The player's attacks also open breakable walls / switches (neutral); enemy attacks never do.
    return hb.team === 'player' || team !== 'neutral';
  }
}
