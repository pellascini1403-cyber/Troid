import { attackLength, type AttackDefinition } from '@/combat/AttackDefinition';
import { attackRect } from '@/combat/hitboxGeometry';
import type { Rect } from '@/core/math';
import { secondsToTicks } from '@/core/time';
import type { SimServices } from '@/gameplay/SimServices';
import type { Player } from './Player';

export type AttackPhase = 'startup' | 'active' | 'recovery' | 'done';
export type AttackKind = 'ground' | 'air' | 'crouch';

/**
 * PLAYER COMBAT: owns everything about the player's attacks — buffering, the current attack, its phase, combo
 * chaining and the hit-once set — and nothing about movement (that stays in PlayerController). The controller asks it
 * questions ("may I chain?") and tells it when to start; it submits hitboxes to the CombatSystem on the active ticks.
 *
 * Rescued from the `wip/f6-combat-core` branch (docs/PROMPT4-LOG.md S6); the energy bar is not part of it (the
 * magic system of Prompt 5 replaces it).
 */
export class PlayerCombat {
  private current: AttackDefinition | null = null;
  private ticks = 0;
  private hitSet = new Set<string>();
  private buffer = 0;
  private _combo = 0;
  private _confirmed = false;
  private readonly rect: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(private readonly player: Player) {}

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

  /** Starts the first attack of a chain (ground / air / crouch variant). */
  begin(kind: AttackKind, sim: SimServices): AttackDefinition {
    const c = this.player.def.combat;
    const id = kind === 'air' ? c.airAttack : kind === 'crouch' ? c.crouchAttack : c.groundAttack;
    return this.start(c.attacks[id], 0, kind === 'air', sim);
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

  /** The phase the NEXT `advance` will belong to (no side effects): lets the controller decide before the tick runs. */
  peekPhase(): AttackPhase {
    const a = this.current;
    if (!a) return 'done';
    return phaseOf(a, this.ticks);
  }

  /** Where the animation is: the phase of the tick that just ran and the progress (0..1] inside it. */
  progress(): { phase: AttackPhase; t: number } {
    const a = this.current;
    if (!a || this.ticks === 0) return { phase: a ? 'startup' : 'done', t: 0 };
    const tick = this.ticks - 1; // the tick that has just been advanced
    const phase = phaseOf(a, tick);
    const start = phase === 'startup' ? 0 : phase === 'active' ? a.startup : a.startup + a.active;
    const len = phase === 'startup' ? a.startup : phase === 'active' ? a.active : a.recovery;
    return { phase, t: len > 0 ? Math.min(1, (tick - start + 1) / len) : 1 };
  }

  /**
   * Advances the attack by one tick. Submits the hitbox on active ticks. Returns the phase the tick belonged to,
   * or `done` once the whole attack (including recovery) has elapsed.
   */
  advance(sim: SimServices): AttackPhase {
    const a = this.current;
    if (!a) return 'done';
    const phase = phaseOf(a, this.ticks);
    if (phase === 'active') {
      const p = this.player;
      attackRect(a, p.body.x, p.body.y, p.facing, this.rect);
      if (this.ticks === a.startup) {
        // the blow starts now: VFX and audio hang their slash from this moment, not from the press
        sim.bus.emit('player:attackActive', {
          attackId: a.id, x: p.body.x, y: p.body.y, facing: p.facing, air: !p.body.grounded, combo: this._combo, rect: { ...this.rect },
        });
      }
      sim.combat.submit({
        ownerId: p.id,
        team: 'player',
        rect: { ...this.rect },
        attackId: a.id,
        damage: a.damage,
        knockback: a.knockback,
        stun: a.stun,
        hitStop: a.hitStop,
        shake: a.shake,
        facing: p.facing,
        alreadyHit: this.hitSet,
        onConfirm: () => {
          this._confirmed = true;
        },
      });
    }
    this.ticks++;
    return phase;
  }

  /** Landing during an air attack cuts the recovery short (docs/GAME-SPEC-2D.md §7.2). */
  shortenRecovery(maxTicksLeft: number): void {
    const a = this.current;
    if (!a || phaseOf(a, this.ticks) !== 'recovery') return;
    this.ticks = Math.max(this.ticks, attackLength(a) - maxTicksLeft);
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
}

function phaseOf(a: AttackDefinition, tick: number): AttackPhase {
  if (tick < a.startup) return 'startup';
  if (tick < a.startup + a.active) return 'active';
  if (tick < attackLength(a)) return 'recovery';
  return 'done';
}
