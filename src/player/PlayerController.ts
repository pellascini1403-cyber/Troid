import { clamp, lerp, sign } from '@/core/math';
import { StateMachine } from '@/core/stateMachine';
import { TICK_SECONDS, secondsToTicks } from '@/core/time';
import type { SkillDefinition } from '@/abilities/SkillDefinition';
import type { HitInfo } from '@/combat/Combatant';
import { Projectile } from '@/gameplay/Projectile';
import { interactLock } from '@/interaction/InteractionSystem';
import { NEUTRAL_INPUT, type InputFrame } from '@/input/InputFrame';
import type { SimServices } from '@/gameplay/SimServices';
import type { MovementTuning } from './MovementTuning';
import type { Player } from './Player';

export type PlayerStateId = 'free' | 'crouch' | 'dash' | 'attack' | 'cast' | 'drink' | 'interact' | 'hurt' | 'dead';

/** Ticks the white hit flash lasts. */
const FLASH_TICKS = 6;

/**
 * PLAYER LOGIC (movement): turns one `InputFrame` into velocities and moves the body.
 *
 * It knows nothing about meshes, clips, sounds or the DOM: it reads tuning from the PlayerDefinition (live, so
 * the debug panel can tweak it), asks `abilities` what the player may do, moves through `CollisionWorld`, and
 * announces what happened through the event bus.
 *
 * Tick order: timers → state update (decide velocities) → integrate (move + collide + landing).
 *
 * Posture: `crouch` is a state AND a body shape (docs/GAME-SPEC-2D.md §6). The shape (`crouched`) is what the world
 * sees: the collision body is 1.0 m instead of 1.7 m and the hurtbox loses the head. It survives a dash (a crouched
 * dash slides under low passages) and it can only end when there is room to stand.
 *
 * Combat (docs/GAME-SPEC-2D.md §5.1, §7, §9): `attack` (ground / air / crouch variants, chain of two), `hurt` (stun,
 * knockback, i-frames) and `dead`. Magic (§10): `cast` runs the skill of the equipped card (6 ticks of preparation, the release
 * that pays the cost and spawns the projectile, 8 of recovery). Bottles (§11): `drink` is a channel of 24 ticks standing still
 * on the ground; the effect lands, and the bottle is spent, on its LAST tick, so a hit in the middle costs nothing.
 * Interaction (§12): `interact` performs the object that has the icon and holds the control for its `lock` (at most 12 ticks).
 * Priority: dead > hurt > dash > attack > cast > drink > interact > crouch > free.
 * `free`, `crouch` and `dash` behave exactly as before (the 40 movement tests are the proof).
 */
export class PlayerController {
  private readonly fsm: StateMachine<PlayerController, PlayerStateId>;
  private sim!: SimServices;
  private input: InputFrame = NEUTRAL_INPUT;

  // timers, all in simulation ticks
  private coyote = 0;
  private jumpBuffer = 0;
  private dropBuffer = 0;
  private abilityBuffer = 0;
  private bottleBuffer = 0;
  private interactBuffer = 0;
  private dashBuffer = 0;
  private dashCooldown = 0;
  private dashTicksLeft = 0;
  private dropThrough = 0;
  private jumpHeldTicks = 0;
  private airDashesUsed = 0;
  /** Ticks of damage immunity left (dash i-frames and hit i-frames). */
  invulnerable = 0;
  /** Ticks left on the hit blink / on the white flash / on the stun of `hurt`. */
  private hurtInvuln = 0;
  private flashTicks = 0;
  private hurtTicks = 0;
  /** Ticks left on the landing animation after a hard landing. */
  landTicks = 0;
  /** Bumped when an animation must restart (new jump, new dash). */
  animSerial = 0;
  /** The skill being cast, the ticks since the cast began, and whether its release (cost + projectile) already happened. */
  private castSkill: SkillDefinition | null = null;
  private castTicks = 0;
  private castReleased = false;
  /** Which bottle the pending request asked for (−1 = the next one that is ready), the slot being drunk (−1 = none) and the ticks of the channel done. */
  private bottleRequest = -1;
  private drinkSlot = -1;
  private drinkTicks = 0;
  /** Ticks of the `interact` pose left (the control is held until it runs out). */
  private interactTicks = 0;

  private jumping = false;
  private jumpCut = false;
  /** The body is currently the crouched size. Independent of the state so a dash can keep the shape. */
  private crouching = false;
  private dashDir: 1 | -1 = 1;
  /** Upward speed at the moment the dash started (restored partially when it ends). */
  private dashSavedVy = 0;

  constructor(private readonly player: Player) {
    this.fsm = new StateMachine<PlayerController, PlayerStateId>(
      this,
      {
        free: { update: (c) => c.updateFree(false) },
        crouch: {
          enter: (c) => c.setCrouched(true),
          update: (c) => c.updateFree(true),
          // A dash keeps the crouched shape; every other exit goes through `canStand()` first.
          exit: (c, to) => {
            if (to === 'free') c.setCrouched(false);
          },
        },
        dash: { enter: (c) => c.enterDash(), update: (c) => c.updateDash(), exit: (c) => c.exitDash() },
        attack: { enter: (c) => c.enterAttack(), update: (c) => c.updateAttack(), exit: (c) => c.player.combat.end() },
        cast: { enter: (c) => c.enterCast(), update: (c) => c.updateCast(), exit: (c) => c.exitCast() },
        drink: { enter: (c) => c.enterDrink(), update: (c) => c.updateDrink(), exit: (c, to) => c.exitDrink(to) },
        interact: { enter: (c) => c.enterInteract(), update: (c) => c.updateInteract() },
        hurt: { update: (c) => c.updateHurt() },
        dead: { update: (c) => c.updateDead() },
      },
      'free',
    );
  }

  get state(): PlayerStateId {
    return this.fsm.current;
  }
  get dashing(): boolean {
    return this.fsm.current === 'dash';
  }
  /** The body is the crouched size (also true while dashing out of a crouch, or when forced by a low ceiling). */
  get crouched(): boolean {
    return this.crouching;
  }
  /** A cast is in progress (preparation or recovery): the magic does not regenerate meanwhile. */
  get casting(): boolean {
    return this.fsm.current === 'cast';
  }
  /** A bottle is being drunk (the channel): the hero stands still. */
  get drinking(): boolean {
    return this.fsm.current === 'drink';
  }
  /** The bottle being drunk (−1 = none) and how far through the channel it is, 0 … 1 (the HUD drains that vial meanwhile). */
  drinkProgress(): { slot: number; t: number } {
    if (this.fsm.current !== 'drink') return { slot: -1, t: 0 };
    return { slot: this.drinkSlot, t: Math.min(1, this.drinkTicks / Math.max(1, this.sim.bottles.channelLength)) };
  }
  /** Where the cast is, for the animation: its phase and how far through it. `startup` → the release tick is `active` → `recovery`. */
  castProgress(): { phase: 'startup' | 'active' | 'recovery'; t: number } {
    const s = this.castSkill;
    if (!s) return { phase: 'recovery', t: 1 };
    const n = Math.max(0, this.castTicks - 1); // `castTicks` already counts the tick being shown
    if (n < s.startup) return { phase: 'startup', t: n / Math.max(1, s.startup) };
    if (n === s.startup) return { phase: 'active', t: 0 };
    return { phase: 'recovery', t: Math.min(1, (n - s.startup) / Math.max(1, s.recovery)) };
  }
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }
  /** The hit i-frames are running: the sprite blinks (the dash i-frames do not blink). */
  get blinking(): boolean {
    return this.hurtInvuln > 0;
  }
  /** White hit flash intensity 0..1. */
  get flash01(): number {
    return this.flashTicks / FLASH_TICKS;
  }
  /** 0 = ready, 1 = just used (for the HUD cooldown ring). */
  get dashCooldown01(): number {
    const total = Math.max(1, secondsToTicks(this.tuning.dash.cooldown));
    return clamp(this.dashCooldown / total, 0, 1);
  }

  private get tuning(): MovementTuning {
    return this.player.def.movement;
  }

  update(sim: SimServices, input: InputFrame): void {
    this.sim = sim;
    this.input = input;
    this.tickTimers();
    this.fsm.update();
    this.integrate();
  }

  /** Clears transient state (respawn, room change, debug teleport). Permanent progression is untouched. */
  reset(): void {
    this.coyote = this.jumpBuffer = this.dropBuffer = this.abilityBuffer = this.bottleBuffer = this.interactBuffer = this.dashBuffer = this.dashCooldown = this.dashTicksLeft = 0;
    this.dropThrough = this.jumpHeldTicks = this.airDashesUsed = this.invulnerable = this.landTicks = 0;
    this.hurtInvuln = this.flashTicks = this.hurtTicks = 0;
    this.jumping = this.jumpCut = false;
    this.castSkill = null;
    this.castReleased = false;
    this.bottleRequest = this.drinkSlot = -1; // a reset is not a gameplay interruption: no event
    this.drinkTicks = 0;
    this.interactTicks = 0;
    this.player.combat.end();
    this.fsm.go('free');
    // Hard reset of the shape (respawn / room change): the spawn point is always free, so no room check.
    this.crouching = false;
    this.player.body.height = this.player.def.body.height;
  }

  // ------------------------------------------------------------------------------------------------ timers

  private tickTimers(): void {
    const t = this.tuning;
    if (this.input.jumpPressed) this.jumpBuffer = secondsToTicks(t.jumpBuffer);
    else if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.input.dropPressed) this.dropBuffer = secondsToTicks(t.dropBuffer);
    else if (this.dropBuffer > 0) this.dropBuffer--;
    if (this.input.abilityPressed) this.abilityBuffer = secondsToTicks(t.abilityBuffer);
    else if (this.abilityBuffer > 0) this.abilityBuffer--;
    if (this.input.bottlePressed) {
      this.bottleBuffer = secondsToTicks(t.abilityBuffer); // same grace as the Ability press
      this.bottleRequest = this.input.bottleSlot;
    } else if (this.bottleBuffer > 0) this.bottleBuffer--;
    if (this.input.interactPressed) this.interactBuffer = secondsToTicks(t.abilityBuffer); // the same grace as the other presses
    else if (this.interactBuffer > 0) this.interactBuffer--;
    if (this.input.dashPressed) this.dashBuffer = secondsToTicks(t.dash.buffer);
    else if (this.dashBuffer > 0) this.dashBuffer--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.invulnerable > 0) this.invulnerable--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.landTicks > 0) this.landTicks--;
    if (this.hurtInvuln > 0) this.hurtInvuln--;
    if (this.flashTicks > 0) this.flashTicks--;
  }

  // -------------------------------------------------------------------------------------------- free state

  /** One routine for the two ground-capable states: `crouching` only changes the speed cap and the posture exits. */
  private updateFree(crouching: boolean): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    const inp = this.input;
    const grounded = b.grounded;
    const mx = inp.move.x;

    if (Math.abs(mx) > 0.25) p.facing = mx > 0 ? 1 : -1;

    // ---- ground contact bookkeeping ----
    if (grounded) {
      this.coyote = secondsToTicks(t.coyoteTime);
      this.airDashesUsed = 0;
      this.jumping = false;
    } else if (this.coyote > 0) {
      this.coyote--;
    }

    // ---- jump (buffered, with coyote time) and drop (down + jump, or the flick down of the touch controls: only ever
    // through a one-way platform; on anything else the drop press is ignored and expires with its buffer) ----
    const dropRequested = this.dropBuffer > 0 || (this.jumpBuffer > 0 && inp.move.y < -0.6);
    if (dropRequested && grounded && b.ground?.kind === 'oneway') {
      this.dropThrough = 10;
      this.jumpBuffer = 0;
      this.dropBuffer = 0;
      this.coyote = 0;
      b.grounded = false;
      b.ground = null;
    } else if (this.jumpBuffer > 0 && (grounded || this.coyote > 0) && this.canLeaveCrouch()) {
      // from a crouch the body stands up first; without room there is no jump (the press expires with its buffer)
      this.setCrouched(false);
      this.startJump(grounded);
    }

    // ---- variable jump height: releasing the button while rising cuts the jump ----
    if (this.jumping) {
      this.jumpHeldTicks++;
      if (b.vy <= 0) this.jumping = false;
      else if (!inp.jumpHeld && !this.jumpCut && this.jumpHeldTicks >= secondsToTicks(t.jumpMinHold)) {
        b.vy *= t.jumpCutMultiplier;
        this.jumpCut = true;
      }
    }

    // ---- horizontal: accelerate toward the target speed, snappier when reversing ----
    const top = speedForMagnitude(Math.abs(mx), t);
    const target = sign(mx) * (crouching ? Math.min(top, t.crouch.speed) : top);
    const air = !b.grounded;
    let accel: number;
    if (target === 0) {
      accel = air ? t.airDecel : t.groundDecel;
    } else if (sign(target) === sign(b.vx) && Math.abs(b.vx) > Math.abs(target)) {
      accel = air ? t.airDecel : t.groundDecel * 0.6; // carrying dash momentum: bleed it off gently
    } else {
      const reversing = b.vx !== 0 && sign(target) !== sign(b.vx);
      accel = air ? t.airAccel * (reversing ? 1.3 : 1) : t.groundAccel * (reversing ? t.turnBoost : 1);
    }
    b.vx = approachValue(b.vx, target, accel * TICK_SECONDS);

    // ---- gravity: heavier when falling, floatier at the apex while jump is held ----
    let g = t.gravity;
    if (b.vy < 0) g *= t.fallGravityMultiplier;
    else if (air && Math.abs(b.vy) < t.apexThreshold && inp.jumpHeld) g *= t.apexGravityMultiplier;
    b.vy = Math.max(b.vy - g * TICK_SECONDS, -t.maxFallSpeed);

    // ---- posture: in / out of the crouch, with hysteresis; standing up needs room ----
    if (crouching) {
      const pushingDown = inp.move.y < -t.crouch.exit;
      if ((!b.grounded || !pushingDown) && this.canStand()) this.fsm.go('free');
    } else if (b.grounded && inp.move.y <= -t.crouch.enter) {
      this.fsm.go('crouch');
    }

    // ---- attack: a buffered press starts it (ground / air / crouch variant); overrides the posture change ----
    if (this.player.combat.wantsAttack) this.fsm.go('attack');

    // ---- ability: a buffered press casts the skill of the equipped card, unless an attack is starting this very tick ----
    // ---- bottle: a buffered request drinks (the next ready one, or the one asked for) when it would help; the cast wins a tie ----
    const attacking = this.player.combat.wantsAttack;
    if (!attacking && this.abilityBuffer > 0 && this.canCast()) this.fsm.go('cast');
    else if (!attacking && this.bottleBuffer > 0 && this.canDrink()) this.fsm.go('drink');
    else if (!attacking && this.interactBuffer > 0 && this.canInteract()) this.fsm.go('interact');

    // ---- dash (overrides the rest: a dash keeps whatever shape the body has) ----
    if (this.dashBuffer > 0 && this.canDash()) this.fsm.go('dash');
  }

  // ----------------------------------------------------------------------------------------------- posture

  /** Is there room for the standing body where the feet are? (Crouched under a low ceiling: no.) */
  private canStand(): boolean {
    return this.sim.collision.hasRoom(this.player.body, this.player.def.body.height);
  }

  /** A crouched player may only jump (or stand) when the standing body fits. */
  private canLeaveCrouch(): boolean {
    return !this.crouching || this.canStand();
  }

  private setCrouched(on: boolean): void {
    if (this.crouching === on) return;
    this.crouching = on;
    this.player.body.height = on ? this.tuning.crouch.height : this.player.def.body.height;
  }

  private startJump(fromGround: boolean): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    // +g·dt/2 compensates the half tick lost to semi-implicit integration, so `jumpHeight` is the real apex height.
    b.vy = Math.sqrt(2 * t.gravity * t.jumpHeight) + (t.gravity * TICK_SECONDS) / 2;
    b.grounded = false;
    b.ground = null;
    this.jumping = true;
    this.jumpCut = false;
    this.jumpHeldTicks = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.animSerial++;
    this.sim.bus.emit('player:jumped', { x: b.x, y: b.y, air: !fromGround });
  }

  // ------------------------------------------------------------------------------------------------ dash

  private canDash(): boolean {
    const t = this.tuning.dash;
    if (!this.sim.abilities.has('dash')) return false;
    if (this.dashCooldown > 0) return false;
    return this.player.body.grounded || this.airDashesUsed < t.airDashes;
  }

  private enterDash(): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning.dash;
    const dir: 1 | -1 = Math.abs(this.input.move.x) > 0.25 ? (this.input.move.x > 0 ? 1 : -1) : p.facing;
    this.dashDir = dir;
    p.facing = dir;
    this.dashTicksLeft = secondsToTicks(t.duration);
    this.dashSavedVy = Math.max(0, b.vy);
    b.vx = dir * t.speed;
    b.vy = 0;
    const air = !b.grounded;
    if (air) this.airDashesUsed++;
    this.invulnerable = Math.max(this.invulnerable, secondsToTicks(t.invulnerability));
    this.dashBuffer = 0;
    this.jumping = false;
    this.animSerial++;
    this.sim.bus.emit('player:dashed', { x: b.x, y: b.y, facing: dir, air });
  }

  private updateDash(): void {
    const b = this.player.body;
    const t = this.tuning;
    b.vx = this.dashDir * t.dash.speed;
    b.vy = 0;
    if (b.hitLeft || b.hitRight) {
      this.fsm.go(this.postDashState()); // slammed into a wall: the dash is over
      return;
    }
    // Dash-jump: on the ground (or within coyote) a jump press ends the dash and takes off at run speed
    // (from a crouched dash only if the body can stand).
    if (this.jumpBuffer > 0 && (b.grounded || this.coyote > 0) && this.canLeaveCrouch()) {
      this.setCrouched(false);
      this.fsm.go('free');
      this.startJump(b.grounded);
      b.vx = this.dashDir * t.runSpeed;
      return;
    }
    if (--this.dashTicksLeft <= 0) this.fsm.go(this.postDashState());
  }

  /** A dash that started crouched ends crouched: `crouch` then stands up as soon as it is allowed (see `updateFree`). */
  private postDashState(): PlayerStateId {
    return this.crouching ? 'crouch' : 'free';
  }

  // ------------------------------------------------------------------------------------------------ attack

  /** Attacks, hits and the dash all hand control back the same way: crouched bodies return to `crouch` (which stands up when allowed). */
  private postAttackState(): PlayerStateId {
    return this.crouching ? 'crouch' : 'free';
  }

  private enterAttack(): void {
    const p = this.player;
    const b = p.body;
    // the facing can still be steered by the stick on the first tick of the attack
    if (Math.abs(this.input.move.x) > 0.25) p.facing = this.input.move.x > 0 ? 1 : -1;
    const kind = !b.grounded ? 'air' : this.crouching ? 'crouch' : 'ground';
    p.combat.begin(kind, this.sim);
    this.jumping = false; // an attack closes the variable-jump window
    this.animSerial++;
  }

  /**
   * One tick of an attack: dash may cancel the RECOVERY (never the startup or the active frames), a buffered press
   * inside the cancel window chains into the next attack, the attack's own data decides how much control and
   * gravity the body keeps, and the hitbox is submitted on the active ticks.
   */
  private updateAttack(): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    const c = p.combat;
    if (!c.attack) {
      this.fsm.go(this.postAttackState());
      return;
    }

    if (this.dashBuffer > 0 && c.peekPhase() === 'recovery' && this.canDash()) {
      c.end();
      this.fsm.go('dash');
      return;
    }
    if (c.canChain()) {
      c.chain(this.sim);
      this.animSerial++;
    }
    const a = c.attack;
    if (!a) return;

    // landing cuts the recovery of an air attack short
    if (b.grounded && a.id === p.def.combat.airAttack) c.shortenRecovery(3);

    // ---- movement under the attack's control ----
    const air = !b.grounded;
    if (a.lunge && !air && c.attackTicks < a.lunge.ticks) {
      b.vx = p.facing * a.lunge.speed;
    } else {
      const mx = this.input.move.x;
      const target = sign(mx) * speedForMagnitude(Math.abs(mx), t) * a.moveControl;
      const accel = air ? (target === 0 ? t.airDecel : t.airAccel) : target === 0 ? t.groundDecel : t.groundAccel;
      b.vx = approachValue(b.vx, target, accel * TICK_SECONDS);
    }
    let g = t.gravity;
    if (b.vy < 0) g *= t.fallGravityMultiplier;
    if (air && a.airGravityScale !== undefined) g *= a.airGravityScale;
    b.vy = Math.max(b.vy - g * TICK_SECONDS, -t.maxFallSpeed);

    if (c.advance(this.sim) === 'done') {
      c.end();
      this.fsm.go(this.postAttackState());
    }
  }

  // ------------------------------------------------------------------------------------------------ cast

  /**
   * Can the Ability start now? Only with an equipped card whose skill is ready and affordable. With no card it does nothing
   * (the button is not even drawn); too little magic is a refusal the interface answers; a cooldown keeps the press for the
   * buffer, so a press just before the previous cast is over still goes off.
   */
  private canCast(): boolean {
    const sim = this.sim;
    const card = sim.loadout.equipped;
    if (!card) return false;
    const check = sim.skills.check(card.skillId, sim.magic);
    if (check === 'ok') return true;
    if (check === 'noMagic') {
      this.abilityBuffer = 0; // refused once, not once per tick of the buffer
      if (this.input.abilityPressed) sim.bus.emit('skill:denied', { skillId: card.skillId, reason: 'noMagic' });
    }
    return false;
  }

  private enterCast(): void {
    const p = this.player;
    const card = this.sim.loadout.equipped;
    this.castSkill = card ? (this.sim.skills.definition(card.skillId) ?? null) : null;
    this.castTicks = 0;
    this.castReleased = false;
    this.abilityBuffer = 0;
    if (Math.abs(this.input.move.x) > 0.25) p.facing = this.input.move.x > 0 ? 1 : -1;
    this.jumping = false; // a cast closes the variable-jump window, like an attack
    this.animSerial++;
  }

  /**
   * One tick of a cast: the dash may cancel the RECOVERY (never the preparation), the cost is paid and the projectile leaves
   * on the first tick after the preparation, and the skill's own data says how much control the caster keeps meanwhile.
   * A hit during the preparation ends the cast WITHOUT paying (the cost is taken at the release).
   */
  private updateCast(): void {
    const skill = this.castSkill;
    if (!skill) {
      this.fsm.go(this.postAttackState());
      return;
    }
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    if (this.castReleased && this.dashBuffer > 0 && this.canDash()) {
      this.fsm.go('dash');
      return;
    }
    if (!this.castReleased && this.castTicks >= skill.startup) {
      if (!this.releaseCast(skill)) {
        this.fsm.go(this.postAttackState());
        return;
      }
    }
    const air = !b.grounded;
    const mx = this.input.move.x;
    const target = sign(mx) * speedForMagnitude(Math.abs(mx), t) * skill.moveControl;
    const accel = air ? (target === 0 ? t.airDecel : t.airAccel) : target === 0 ? t.groundDecel : t.groundAccel;
    b.vx = approachValue(b.vx, target, accel * TICK_SECONDS);
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
    this.castTicks++;
    if (this.castTicks >= skill.startup + skill.recovery) this.fsm.go(this.postAttackState());
  }

  /** The release: pay the cost, start the cooldown, send the projectile and say so. False when the magic is no longer there. */
  private releaseCast(skill: SkillDefinition): boolean {
    const sim = this.sim;
    const p = this.player;
    if (!sim.magic.spend(skill.cost)) {
      sim.bus.emit('skill:denied', { skillId: skill.id, reason: 'noMagic' });
      return false;
    }
    this.castReleased = true;
    sim.skills.startCooldown(skill.id);
    const m = skill.projectile.muzzle;
    const x = p.body.x + p.facing * m.x;
    const y = p.body.y + (this.crouching ? m.yCrouched : m.y);
    sim.spawn(new Projectile(sim.newId('bolt'), skill.id, skill.projectile, p.id, x, y, p.facing));
    sim.bus.emit('skill:cast', { skillId: skill.id, x, y, facing: p.facing, cost: skill.cost });
    return true;
  }

  private exitCast(): void {
    this.castSkill = null;
    this.castReleased = false;
  }

  // ------------------------------------------------------------------------------------------------ drink

  /**
   * Can a bottle be drunk now? It needs a READY bottle (the one asked for, or the next) whose effect would help — a heal with
   * the life already full does not — otherwise the request is REFUSED, once, with `bottle:denied` (the interface answers;
   * nothing is spent). The effect needs the ground: in the air the request waits for the landing inside its buffer.
   */
  private canDrink(): boolean {
    const sim = this.sim;
    const slot = sim.bottles.resolve(this.bottleRequest);
    if (slot < 0 || !this.bottleHelps(slot)) {
      this.bottleBuffer = 0; // refused once, not once per tick of the buffer
      sim.bus.emit('bottle:denied', { reason: slot < 0 ? 'none' : 'full' });
      return false;
    }
    return this.player.body.grounded;
  }

  /** Would the effect of this bottle change anything? Today every bottle heals: it helps while the life is below the maximum. */
  private bottleHelps(slot: number): boolean {
    const effect = this.sim.bottles.definition(slot)?.effect;
    if (!effect) return false;
    return effect.type === 'heal' ? this.player.health.current < this.player.health.max : true;
  }

  private enterDrink(): void {
    const sim = this.sim;
    const b = this.player.body;
    this.drinkSlot = sim.bottles.resolve(this.bottleRequest);
    this.drinkTicks = 0;
    this.bottleBuffer = 0;
    this.jumping = false;
    this.animSerial++;
    sim.bus.emit('bottle:drinkStarted', { slot: this.drinkSlot, x: b.x, y: b.y, ticks: sim.bottles.channelLength });
  }

  /**
   * One tick of the channel: the hero stands still (nothing steers him, the run speed bleeds off) and the effect lands on the
   * last tick. Losing the ground ends it without spending anything; a hit does too (`exitDrink`).
   */
  private updateDrink(): void {
    const b = this.player.body;
    const t = this.tuning;
    if (!b.grounded) {
      this.breakDrink('air');
      return;
    }
    b.vx = approachValue(b.vx, 0, t.groundDecel * TICK_SECONDS);
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
    if (++this.drinkTicks >= this.sim.bottles.channelLength) this.finishDrink();
  }

  /** The end of the channel: the bottle is spent and the effect lands — unless it no longer helps, in which case nothing is spent. */
  private finishDrink(): void {
    const sim = this.sim;
    const p = this.player;
    const slot = this.drinkSlot;
    const effect = sim.bottles.definition(slot)?.effect;
    if (!effect || !this.bottleHelps(slot) || !sim.bottles.consume(slot)) {
      this.breakDrink('full');
      return;
    }
    const healed = effect.type === 'heal' ? p.health.heal(effect.amount) : 0;
    this.drinkSlot = -1; // done: leaving the state is not an interruption
    sim.bus.emit('bottle:drunk', { slot, healed, x: p.body.x, y: p.body.y });
    this.fsm.go(this.postAttackState());
  }

  /** Ends the channel before its last tick without spending anything. */
  private breakDrink(reason: 'air' | 'full'): void {
    this.sim.bus.emit('bottle:interrupted', { slot: this.drinkSlot, reason });
    this.drinkSlot = -1;
    this.fsm.go(this.postAttackState());
  }

  /** Whatever ends the state while a channel is still running (a hit, death) spent nothing, and says so. */
  private exitDrink(to: PlayerStateId): void {
    if (this.drinkSlot >= 0) {
      this.sim.bus.emit('bottle:interrupted', { slot: this.drinkSlot, reason: to === 'hurt' || to === 'dead' ? 'hit' : 'air' });
    }
    this.drinkSlot = -1;
    this.drinkTicks = 0;
  }

  // -------------------------------------------------------------------------------------------- interact

  /**
   * Can the press be accepted now? Only while an object has the icon and the hero is on the ground. With nothing in reach the
   * press does nothing (there is no refusal: the icon is the only cue); one made just before reaching it waits in the buffer.
   */
  private canInteract(): boolean {
    return this.sim.interaction.current !== null && this.player.body.grounded;
  }

  /** Performs the object that has the icon (its actions run NOW) and holds the control for its lock; the hero turns to face it. */
  private enterInteract(): void {
    const p = this.player;
    const def = this.sim.interaction.perform();
    this.interactBuffer = 0;
    this.interactTicks = def ? interactLock(def) : 0;
    if (def && Math.abs(def.x - p.body.x) > 0.2) p.facing = def.x > p.body.x ? 1 : -1;
    this.jumping = false;
    this.animSerial++;
  }

  /** The pose: he stands still (the run speed bleeds off) until the lock runs out. A hit ends it at once (the actions already ran). */
  private updateInteract(): void {
    const b = this.player.body;
    const t = this.tuning;
    b.vx = approachValue(b.vx, 0, t.groundDecel * TICK_SECONDS);
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
    if (--this.interactTicks <= 0) this.fsm.go(this.postAttackState());
  }

  // ------------------------------------------------------------------------------------- hurt and death

  /**
   * Called by `Player.receiveHit` (inside the combat step of the tick, outside this controller's update): knockback,
   * stun, i-frames and the white flash. Interrupts whatever the player was doing; a fatal hit goes to `dead`.
   */
  onHit(hit: HitInfo, killed: boolean): void {
    const p = this.player;
    const b = p.body;
    const def = p.def.combat.hurt;
    p.combat.end();
    b.vx = hit.direction * hit.knockbackX * def.knockbackScale;
    b.vy = hit.knockbackY * def.knockbackScale;
    this.hurtTicks = hit.stun > 0 ? hit.stun : def.stun;
    this.invulnerable = Math.max(this.invulnerable, def.invulnerability);
    this.hurtInvuln = def.invulnerability;
    this.flashTicks = FLASH_TICKS;
    this.jumping = false;
    this.animSerial++;
    this.fsm.go(killed ? 'dead' : 'hurt', true);
  }

  /** No control while stunned: knockback bleeds off, gravity still applies. */
  private updateHurt(): void {
    const b = this.player.body;
    const t = this.tuning;
    b.vx = approachValue(b.vx, 0, (b.grounded ? t.groundDecel * 0.5 : t.airDecel) * TICK_SECONDS);
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
    if (--this.hurtTicks <= 0) this.fsm.go(this.crouching ? 'crouch' : 'free');
  }

  /** Dead: the input is ignored until the death flow (or a test) calls `reset()`. */
  private updateDead(): void {
    const b = this.player.body;
    const t = this.tuning;
    b.vx = approachValue(b.vx, 0, (b.grounded ? t.groundDecel : t.airDecel) * TICK_SECONDS);
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
  }

  private gravityNow(): number {
    const t = this.tuning;
    return this.player.body.vy < 0 ? t.gravity * t.fallGravityMultiplier : t.gravity;
  }

  private exitDash(): void {
    const b = this.player.body;
    const t = this.tuning;
    if (b.vx !== 0) b.vx = this.dashDir * t.runSpeed * t.dash.exitSpeedFactor;
    if (!b.grounded && this.dashSavedVy > 0) b.vy = this.dashSavedVy * t.dash.ascentRetention;
    this.dashSavedVy = 0;
    this.dashCooldown = secondsToTicks(t.dash.cooldown);
    this.sim.bus.emit('player:dashEnded', { x: b.x, y: b.y });
  }

  // -------------------------------------------------------------------------------------------- movement

  private integrate(): void {
    const b = this.player.body;
    const t = this.tuning;
    const wasGrounded = b.grounded;
    const fallSpeed = -b.vy;
    this.sim.collision.moveBody(b, b.vx * TICK_SECONDS, b.vy * TICK_SECONDS, this.dropThrough > 0);
    if (!wasGrounded && b.grounded && fallSpeed > 0) {
      this.landTicks = fallSpeed >= t.landImpactSpeed ? 10 : 0;
      this.sim.bus.emit('player:landed', { x: b.x, y: b.y, impact: fallSpeed });
    }
  }
}

/** Analog stick magnitude → target speed: a gentle tilt walks, a firm push ramps up to the run speed. */
function speedForMagnitude(m: number, t: MovementTuning): number {
  if (m < 0.15) return 0;
  if (m < t.runThreshold) return t.walkSpeed * (0.4 + (0.6 * m) / t.runThreshold);
  return lerp(t.walkSpeed, t.runSpeed, clamp((m - t.runThreshold) / (0.85 - t.runThreshold), 0, 1));
}

function approachValue(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
