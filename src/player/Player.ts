import type { Combatant, HitInfo, HitOutcome, Hurtbox } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import type { Rect } from '@/core/math';
import { Actor } from '@/gameplay/Actor';
import type { SimServices } from '@/gameplay/SimServices';
import type { InputFrame } from '@/input/InputFrame';
import { PlayerCombat } from './PlayerCombat';
import { PlayerController } from './PlayerController';
import type { PlayerDefinition } from './PlayerDefinition';
import { deriveAnimation } from './playerAnimation';

/**
 * The player entity: a body, a view state, a controller and its combat. Presentation lives in `ActorSprite`, data in
 * PlayerDefinition, movement in PlayerController, attacks in PlayerCombat, animation choice in playerAnimation — each
 * replaceable alone. It is a `Combatant` (docs/ARCHITECTURE-2D.md §5.4): the combat system asks it for its
 * vulnerable regions and tells it when it was hit; the player decides how to react.
 */
export class Player extends Actor implements Combatant {
  readonly controller: PlayerController;
  readonly combat: PlayerCombat;
  readonly health: Health;
  /** Session-private copy of the definition: the debug panel may tweak its movement tuning live. */
  readonly def: PlayerDefinition;
  private sim: SimServices | null = null;

  constructor(def: PlayerDefinition, id: string) {
    super(id, 'player', def.body.halfWidth, def.body.height);
    this.def = { ...def, movement: structuredClone(def.movement) };
    this.health = new Health(def.combat.maxHealth);
    this.controller = new PlayerController(this);
    this.combat = new PlayerCombat(this);
  }

  /** Dash i-frames, hit i-frames and the debug god mode all make the player untouchable. */
  get invulnerable(): boolean {
    return this.controller.isInvulnerable || (this.sim?.godMode ?? false);
  }

  tick(sim: SimServices, input: InputFrame): void {
    this.sim = sim;
    this.beginTick();
    this.combat.tickBuffer(input.attackPressed);
    this.controller.update(sim, input);
    this.syncView();
    this.publishAnimation();
  }

  // ------------------------------------------------------------------------------------------------ Combatant

  /**
   * The vulnerable region this tick (world space). It is smaller than the body and it LOSES THE HEAD when crouched:
   * a hit at head height misses a crouched player (docs/GAME-SPEC-2D.md §6). Combat reads this, never the sprite.
   */
  hurtbox(out: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 }): Rect {
    const hb = this.def.body.hurtbox;
    const h = this.controller.crouched ? this.def.movement.crouch.hurtboxHeight : hb.height;
    out.x0 = this.body.x - hb.halfWidth;
    out.x1 = this.body.x + hb.halfWidth;
    out.y0 = this.body.y;
    out.y1 = this.body.y + h;
    return out;
  }

  collectHurtboxes(out: Hurtbox[]): void {
    out.push({ rect: this.hurtbox(), multiplier: 1 });
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.invulnerable || this.health.dead) return 'ignored';
    const dealt = this.health.damage(hit.damage);
    this.controller.onHit(hit, this.health.dead);
    // The hit lands AFTER this tick's view was published, and the hit-stop that follows freezes the next ticks: show the
    // hurt pose, the flash and the blink right now, which is what makes the impact read.
    this.publishAnimation();
    const sim = this.sim;
    if (sim) {
      sim.bus.emit('player:hurt', { x: this.body.x, y: this.body.y + this.body.height * 0.6, damage: dealt, direction: hit.direction });
      if (this.health.dead) {
        sim.requestHitStop(this.def.combat.hurt.deathHitStop);
        sim.bus.emit('player:died', { x: this.body.x, y: this.body.y });
      }
    }
    return 'hit';
  }

  // ------------------------------------------------------------------------------------------------ lifecycle

  /** Back to a clean slate at `(x, y)` (room entry, debug teleport). Health, abilities and progression are not touched. */
  respawn(x: number, y: number, facing: 1 | -1 = 1): void {
    this.teleport(x, y, facing);
    this.controller.reset();
    this.view.flash = 0;
    this.view.opacity = 1;
    this.view.blink = false;
    this.view.anim = 'idle';
    this.view.phase = 'none';
    this.view.phaseT = 0;
    this.view.animSerial++;
  }

  /** Full health again (the death flow of docs/GAME-SPEC-2D.md §9.2 calls this when the player reappears). */
  revive(): void {
    this.health.restore();
  }

  private publishAnimation(): void {
    const c = this.controller;
    const m = this.def.movement;
    const v = this.view;
    v.flash = c.flash01;
    v.blink = c.blinking;
    v.animSpeed = 1;
    v.animDuration = 0;
    v.phase = 'none';
    v.phaseT = 0;
    const attack = this.combat.attack;
    if (c.state === 'dead') {
      v.anim = 'death';
    } else if (c.state === 'hurt') {
      v.anim = 'hurt';
    } else if (c.state === 'cast') {
      const cp = c.castProgress();
      v.anim = 'cast';
      v.phase = cp.phase;
      v.phaseT = cp.t;
    } else if (c.state === 'drink') {
      v.anim = 'drink';
    } else if (c.state === 'interact') {
      v.anim = 'interact';
    } else if (c.state === 'attack' && attack) {
      const p = this.combat.progress();
      v.anim = attack.anim;
      v.phase = p.phase === 'done' ? 'recovery' : p.phase;
      v.phaseT = p.t;
    } else {
      const out = deriveAnimation({
        dashing: c.dashing,
        grounded: this.body.grounded,
        vx: this.body.vx,
        vy: this.body.vy,
        landTicks: c.landTicks,
        walkSpeed: m.walkSpeed,
        runSpeed: m.runSpeed,
        crouching: c.crouched,
        crouchSpeed: m.crouch.speed,
      });
      v.anim = out.anim;
      v.animSpeed = out.speed;
    }
    v.animSerial = c.animSerial;
  }
}
