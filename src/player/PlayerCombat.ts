import { attackLength, type AttackDefinition } from '@/combat/AttackDefinition';
import type { Combatant, HitInfo } from '@/combat/Combatant';
import { attackRect } from '@/combat/hitboxGeometry';
import { Resource } from '@/combat/Resource';
import type { Rect } from '@/core/math';
import { secondsToTicks } from '@/core/time';
import type { SimServices } from '@/gameplay/SimServices';
import type { Player } from './Player';

export type AttackPhase = 'startup' | 'active' | 'recovery' | 'done';

/**
 * PLAYER COMBAT: owns everything about the player's attacks — buffering, the current attack, its phase, combo
 * chaining, the hit-once set and energy gain — and nothing about movement (that stays in PlayerController).
 * The controller asks it questions ("may I chain?") and tells it when to start; it submits hitboxes to the
 * CombatSystem on the active ticks.
 */
export class PlayerCombat {
  readonly energy: Resource;

  private current: AttackDefinition | null = null;
  private ticks = 0;
  private hitSet = new Set<string>();
  private buffer = 0;
  private _combo = 0;
  private _confirmed = false;
  private readonly rect: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(private readonly player: Player) {
    const e = player.def.combat.energy;
    this.energy = new Resource(e.max, e.start);
  }

  get attack(): AttackDefinition | null {
    return this.current;
  }
  get attackTicks(): number {
    return this.ticks;
  }
  get attacking(): boolean {
    return this.current !== null;
  }
  /** 0 for the first hit of a chain, 1 for the second… */
  get combo(): number {
    return this._combo;
  }
  /** True once this attack instance has connected with something. */
  get confirmedHit(): boolean {
    return this._confirmed;
  }
  get wantsAttack(): boolean {
    return this.buffer > 0;
  }
  /** Current hitbox rect (valid after `advance`), for the debug overlay. */
  get hitboxRect(): Readonly<Rect> {
    return this.rect;
  }

  /** Call once per tick with the raw press so a press during a recovery is remembered. */
  tickBuffer(pressed: boolean): void {
    if (pressed) this.buffer = secondsToTicks(this.player.def.combat.attackBuffer);
    else if (this.buffer > 0) this.buffer--;
  }

  consumeBuffer(): void {
    this.buffer = 0;
  }

  /** Starts the first attack of a chain (ground or air version). */
  begin(air: boolean, sim: SimServices): AttackDefinition {
    const c = this.player.def.combat;
    return this.start(c.attacks[air ? c.airAttack : c.groundAttack], 0, air, sim);
  }

  /** True when the buffered press falls inside the cancel window of the current attack. */
  canChain(): boolean {
    const a = this.current;
    if (!a?.next || !a.cancelWindow || this.buffer <= 0) return false;
    return this.ticks >= a.cancelWindow.from && this.ticks <= a.cancelWindow.to;
  }

  chain(sim: SimServices): AttackDefinition {
    const a = this.current;
    if (!a?.next) throw new Error('chain() without a next attack');
    const next = this.player.def.combat.attacks[a.next];
    if (!next) throw new Error(`attack "${a.id}" chains into unknown attack "${a.next}"`);
    return this.start(next, this._combo + 1, !this.player.body.grounded, sim);
  }

  /**
   * Advances the attack by one tick. Submits the hitbox on active ticks. Returns the phase the tick belonged to,
   * or `done` once the whole attack (including recovery) has elapsed.
   */
  advance(sim: SimServices): AttackPhase {
    const a = this.current;
    if (!a) return 'done';
    const t = this.ticks;
    let phase: AttackPhase;
    if (t < a.startup) phase = 'startup';
    else if (t < a.startup + a.active) phase = 'active';
    else if (t < attackLength(a)) phase = 'recovery';
    else phase = 'done';

    if (phase === 'active') {
      const p = this.player;
      attackRect(a, p.body.x, p.body.y, p.facing, this.rect);
      sim.combat.submit({
        ownerId: p.id,
        team: 'player',
        rect: this.rect,
        attackId: a.id,
        damage: a.damage,
        knockback: a.knockback,
        stun: a.stun,
        hitStop: a.hitStop,
        shake: a.shake,
        facing: p.facing,
        alreadyHit: this.hitSet,
        onConfirm: (target, hit) => this.onConfirm(a, target, hit),
      });
    }
    this.ticks++;
    return phase;
  }

  end(): void {
    this.current = null;
    this.ticks = 0;
    this._combo = 0;
    this._confirmed = false;
  }

  private start(a: AttackDefinition | undefined, combo: number, air: boolean, sim: SimServices): AttackDefinition {
    if (!a) throw new Error('unknown attack definition');
    this.current = a;
    this.ticks = 0;
    this.hitSet = new Set();
    this._combo = combo;
    this._confirmed = false;
    this.buffer = 0;
    const p = this.player;
    sim.bus.emit('player:attacked', { attackId: a.id, x: p.body.x, y: p.body.y, facing: p.facing, air, combo });
    return a;
  }

  private onConfirm(a: AttackDefinition, _target: Combatant, _hit: HitInfo): void {
    this._confirmed = true;
    if (a.energyOnHit) {
      this.energy.gain(a.energyOnHit);
      this.player.announceEnergy();
    }
  }
}
