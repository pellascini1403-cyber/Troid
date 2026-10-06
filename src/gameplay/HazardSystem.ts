import type { Combatant, HitboxSubmission, HitInfo } from '@/combat/Combatant';
import { overlaps, type Rect } from '@/core/math';
import type { HazardDef } from '@/world/RoomDefinition';

/**
 * How a hazard hurts (docs/PROMPT6-LOG.md S25): the standard hurt of GAME-SPEC-2D §9.1 — 14 ticks of stun, hit-stop 6 — with a knockback that
 * is mostly UP (a hero who has touched spikes is thrown out of them, not along them) and a little AWAY from the middle of the zone.
 */
export const HAZARD_HIT = { damage: 1, stun: 14, hitStop: 6, shake: 0.22, knockback: { x: 3.5, y: 7 } } as const;

/** What the system needs of the world each tick: where the hero is, how to hurt them, and who to tell. */
export interface HazardHost {
  readonly combat: { submit(hb: HitboxSubmission): void };
  readonly player: { readonly body: Readonly<{ x: number; y: number; halfW: number; height: number }>; readonly facing: 1 | -1; readonly health: { readonly dead: boolean } };
  /** A hazard hurt the hero (a confirmed hit: not during the i-frames that follow one). */
  hit(e: { hazardId: string; kind: string; damage: number; x: number; y: number }): void;
}

/**
 * The hazards of the current room (docs/PROMPT6-LOG.md S25). They are not entities and have no brain: while the hero stands in a zone,
 * the zone submits a hitbox to the COMBAT system every tick, and combat decides — so the i-frames (a second touch during them does
 * nothing), the knockback, the hit-stop, the death and the events are exactly those of any other hit, and "repetition" is simply the hit
 * coming again once the i-frames end. PURE and deterministic: a position in, hitboxes out.
 */
export class HazardSystem {
  private defs: readonly HazardDef[] = [];
  private readonly body: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  /** The hazards of the room that was just built (none when it has none). */
  setRoom(defs: readonly HazardDef[] | undefined): void {
    this.defs = defs ?? [];
  }

  get count(): number {
    return this.defs.length;
  }

  /** Does a box overlap any hazard? (The safe-ground tracker never records a spot inside one.) */
  touches(box: Readonly<Rect>): boolean {
    for (const h of this.defs) if (overlaps(box, h.rect)) return true;
    return false;
  }

  /** Once per tick, after the hero has moved and before combat resolves: every zone the hero stands in hurts. */
  update(host: HazardHost): void {
    if (this.defs.length === 0 || host.player.health.dead) return;
    const b = host.player.body;
    this.body.x0 = b.x - b.halfW;
    this.body.x1 = b.x + b.halfW;
    this.body.y0 = b.y;
    this.body.y1 = b.y + b.height;
    for (const h of this.defs) {
      if (!overlaps(this.body, h.rect)) continue;
      const dx = b.x - (h.rect.x0 + h.rect.x1) / 2;
      // pushed away from the middle of the zone; dead centre: against the way they were facing
      const away: 1 | -1 = dx > 0 ? 1 : dx < 0 ? -1 : host.player.facing === 1 ? -1 : 1;
      const damage = h.damage ?? HAZARD_HIT.damage;
      host.combat.submit({
        ownerId: `hazard:${h.id}`,
        team: 'enemy',
        rect: h.rect,
        attackId: `hazard_${h.kind}`,
        damage,
        knockback: HAZARD_HIT.knockback,
        stun: HAZARD_HIT.stun,
        hitStop: HAZARD_HIT.hitStop,
        shake: HAZARD_HIT.shake,
        facing: away,
        alreadyHit: new Set(),
        hits: ['player'],
        onConfirm: (_target: Combatant, info: HitInfo) => host.hit({ hazardId: h.id, kind: h.kind, damage: info.damage, x: info.x, y: info.y }),
      });
    }
  }
}
