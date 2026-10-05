import { clamp, lerp, sign } from '@/core/math';
import { StateMachine } from '@/core/stateMachine';
import { TICK_SECONDS, secondsToTicks } from '@/core/time';
import type { HitInfo } from '@/combat/Combatant';
import { NEUTRAL_INPUT, type InputFrame } from '@/input/InputFrame';
import type { SimServices } from '@/gameplay/SimServices';
import type { MovementTuning } from './MovementTuning';
import type { Player } from './Player';

export type PlayerStateId = 'free' | 'crouch' | 'dash' | 'attack' | 'hurt' | 'dead';

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
 * knockback, i-frames) and `dead`. Priority: dead > hurt > dash > attack > crouch > free. `free`, `crouch` and `dash`
 * behave exactly as before (the 40 movement tests are the proof).
 */
export class PlayerController {
  private readonly fsm: StateMachine<PlayerController, PlayerStateId>;
  private sim!: SimServices;
  private input: InputFrame = NEUTRAL_INPUT;

  // timers, all in simulation ticks
  private coyote = 0;
  private jumpBuffer = 0;
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
    this.coyote = this.jumpBuffer = this.dashBuffer = this.dashCooldown = this.dashTicksLeft = 0;
    this.dropThrough = this.jumpHeldTicks = this.airDashesUsed = this.invulnerable = this.landTicks = 0;
    this.hurtInvuln = this.flashTicks = this.hurtTicks = 0;
    this.jumping = this.jumpCut = false;
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

    // ---- jump (buffered, with coyote time; down+jump drops through one-way platforms) ----
    if (this.jumpBuffer > 0) {
      if (grounded && inp.move.y < -0.6 && b.ground?.kind === 'oneway') {
        this.dropThrough = 10;
        this.jumpBuffer = 0;
        this.coyote = 0;
        b.grounded = false;
        b.ground = null;
      } else if ((grounded || this.coyote > 0) && this.canLeaveCrouch()) {
        // from a crouch the body stands up first; without room there is no jump (the press expires with its buffer)
        this.setCrouched(false);
        this.startJump(grounded);
      }
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
