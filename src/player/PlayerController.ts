import { clamp, lerp, sign } from '@/core/math';
import { StateMachine } from '@/core/stateMachine';
import { TICK_SECONDS, secondsToTicks } from '@/core/time';
import { NEUTRAL_INPUT, type InputFrame } from '@/input/InputFrame';
import type { SimServices } from '@/gameplay/SimServices';
import type { MovementTuning } from './MovementTuning';
import type { Player } from './Player';

export type PlayerStateId = 'free' | 'dash';

/**
 * PLAYER LOGIC (movement): turns one `InputFrame` into velocities and moves the body.
 *
 * It knows nothing about meshes, clips, sounds or the DOM: it reads tuning from the PlayerDefinition (live, so
 * the debug panel can tweak it), asks `abilities` what the player may do, moves through `CollisionWorld`, and
 * announces what happened through the event bus.
 *
 * Tick order: timers → state update (decide velocities) → integrate (move + collide + landing).
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
  /** Ticks of damage immunity left (dash i-frames now; hurt i-frames in F6). */
  invulnerable = 0;
  /** Ticks left on the landing animation after a hard landing. */
  landTicks = 0;
  /** Bumped when an animation must restart (new jump, new dash). */
  animSerial = 0;

  private jumping = false;
  private jumpCut = false;
  private dashDir: 1 | -1 = 1;
  /** Upward speed at the moment the dash started (restored partially when it ends). */
  private dashSavedVy = 0;

  constructor(private readonly player: Player) {
    this.fsm = new StateMachine<PlayerController, PlayerStateId>(
      this,
      {
        free: { update: (c) => c.updateFree() },
        dash: { enter: (c) => c.enterDash(), update: (c) => c.updateDash(), exit: (c) => c.exitDash() },
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
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
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
    this.jumping = this.jumpCut = false;
    this.fsm.go('free');
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
  }

  // -------------------------------------------------------------------------------------------- free state

  private updateFree(): void {
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
      } else if (grounded || this.coyote > 0) {
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
    const target = sign(mx) * speedForMagnitude(Math.abs(mx), t);
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

    // ---- dash ----
    if (this.dashBuffer > 0 && this.canDash()) this.fsm.go('dash');
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
      this.fsm.go('free'); // slammed into a wall: the dash is over
      return;
    }
    // Dash-jump: on the ground (or within coyote) a jump press ends the dash and takes off at run speed.
    if (this.jumpBuffer > 0 && (b.grounded || this.coyote > 0)) {
      this.fsm.go('free');
      this.startJump(b.grounded);
      b.vx = this.dashDir * t.runSpeed;
      return;
    }
    if (--this.dashTicksLeft <= 0) this.fsm.go('free');
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
