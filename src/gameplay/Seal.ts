import type { Combatant, HitInfo, HitOutcome, Hurtbox } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import type { SealDef } from '@/world/RoomDefinition';
import type { SimEntity } from './SimEntity';
import type { SimServices } from './SimServices';

/** Ticks the flash of a blow that was turned away lasts. */
export const SEAL_REJECT_TICKS = 12;
/** Ticks from the break until the ward is gone (it dissolves). */
export const SEAL_BREAK_TICKS = 30;
/** How hard a blow that is turned away jolts the camera (0..1): felt, not violent. */
const REJECT_SHAKE = 0.1;
const DEFAULT_HALF_WIDTH = 1.4;
const DEFAULT_HEIGHT = 3.6;

/** What the view reads of a seal: the flash of a turned-away blow, how much of it is left, and where its sigil hangs. */
export interface SealViewState {
  /** 1 → 0 over `SEAL_REJECT_TICKS` after a blow was turned away. */
  rejected: number;
  /** 1 → 0 over `SEAL_BREAK_TICKS` once broken. */
  opacity: number;
  broken: boolean;
}

/**
 * A ward of violet ink that holds a way shut (docs/PROMPT6-LOG.md S28). It is a NEUTRAL `Combatant`: the player's attacks reach it
 * (enemies' never do) and the combat system asks it what it makes of each one. A blow whose attack id is not in `def.accepts` — the sword
 * — is turned away: the hit is spent, nothing is hurt, the seal flashes and says so (`seal:rejected`). A blow that is accepted — the Spirit
 * Bolt — breaks it in one go: it announces its death like any guardian (`actor:died`), which is how the session sets the flag that opens
 * the door it holds, and it dissolves over `SEAL_BREAK_TICKS`.
 *
 * It has no body and does not move: its vulnerable area is a rectangle standing on `(x, y)`. Deterministic, no randomness, no view.
 */
export class Seal implements SimEntity, Combatant {
  readonly kind = 'seal';
  readonly team = 'neutral' as const;
  readonly health = new Health(1);
  expired = false;
  readonly view: SealViewState = { rejected: 0, opacity: 1, broken: false };
  readonly halfWidth: number;
  readonly height: number;
  private rejectTicks = 0;
  private brokenTicks = -1;
  private sim: SimServices | null = null;

  constructor(
    readonly id: string,
    readonly def: Readonly<SealDef>,
  ) {
    this.halfWidth = def.halfWidth ?? DEFAULT_HALF_WIDTH;
    this.height = def.height ?? DEFAULT_HEIGHT;
  }

  get x(): number {
    return this.def.x;
  }
  get y(): number {
    return this.def.y;
  }
  get broken(): boolean {
    return this.health.dead;
  }
  /** A broken seal cannot be hit again while it dissolves. */
  get invulnerable(): boolean {
    return this.health.dead;
  }

  onSpawn(sim: SimServices): void {
    this.sim = sim;
    sim.combat.add(this);
  }

  dispose(sim: SimServices): void {
    sim.combat.remove(this);
    this.sim = null;
  }

  tick(): void {
    if (this.rejectTicks > 0) this.rejectTicks--;
    if (this.brokenTicks >= 0 && ++this.brokenTicks >= SEAL_BREAK_TICKS) this.expired = true;
    this.view.rejected = this.rejectTicks / SEAL_REJECT_TICKS;
    this.view.broken = this.brokenTicks >= 0;
    this.view.opacity = this.brokenTicks < 0 ? 1 : Math.max(0, 1 - this.brokenTicks / SEAL_BREAK_TICKS);
  }

  collectHurtboxes(out: Hurtbox[]): void {
    out.push({ rect: { x0: this.x - this.halfWidth, x1: this.x + this.halfWidth, y0: this.y, y1: this.y + this.height }, multiplier: 1, part: 'seal' });
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.health.dead) return 'ignored';
    if (!this.def.accepts.includes(hit.attackId)) {
      // turned away: the blow is spent (`blocked`), the seal shows it, and nothing else happens
      this.rejectTicks = SEAL_REJECT_TICKS;
      this.view.rejected = 1; // the blow lands after this tick's view was published: show it NOW (as an enemy's hit flash does)
      this.sim?.bus.emit('seal:rejected', { id: this.id, attackId: hit.attackId, x: hit.x, y: hit.y, direction: hit.direction, shake: REJECT_SHAKE });
      return 'blocked';
    }
    this.health.damage(this.health.max);
    this.brokenTicks = 0;
    this.view.broken = true;
    this.sim?.bus.emit('actor:died', { id: this.id, team: this.team, x: this.x, y: this.y + this.height / 2 });
    return 'hit';
  }
}
