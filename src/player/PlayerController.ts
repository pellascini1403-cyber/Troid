import { clamp, lerp, sign } from '@/core/math';
import { StateMachine } from '@/core/stateMachine';
import { TICK_SECONDS, secondsToTicks } from '@/core/time';
import type { SkillDefinition } from '@/abilities/SkillDefinition';
import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { HitInfo } from '@/combat/Combatant';
import { attackRect } from '@/combat/hitboxGeometry';
import { Projectile } from '@/gameplay/Projectile';
import { interactLock } from '@/interaction/InteractionSystem';
import { NEUTRAL_INPUT, type InputFrame } from '@/input/InputFrame';
import type { SimServices } from '@/gameplay/SimServices';
import type { MovementTuning } from './MovementTuning';
import type { Player } from './Player';

export type PlayerStateId = 'free' | 'crouch' | 'dash' | 'attack' | 'slam' | 'cast' | 'drink' | 'interact' | 'hurt' | 'dead';

/** Ticks the white hit flash lasts. */
const FLASH_TICKS = 6;

/** Metres of ground per footstep: the distance the feet of the walk and run animations (matched to the ground speed) cover between two contacts. */
const STRIDE = { walk: 1.05, run: 1.7, crouch: 0.8 } as const;

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
 * `free`, `crouch` and `dash` behave exactly as before (the 40 movement tests are the proof) for a hero who has not learned the three movement abilities of docs/PROMPT21-LOG.md: the
 * Double Jump (one more jump in the air), the Wall Jump (hold against a wall in the air to slide down it, and a press kicks off it) and the Ground Slam (`slam`: in the air, down and attack —
 * a short hover, a dive, and the shockwave where it lands). Each is one `abilities.has(…)` and nothing else changes without it.
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
  /** Extra jumps made in the air since the feet last touched the ground (the Double Jump). */
  private airJumpsUsed = 0;
  /** The side a wall was last held against (−1 left, 1 right) and the ticks a press still kicks off it; the ticks the control toward it stays ignored after a kick (the Wall Jump). */
  private wallSide: 1 | -1 = 1;
  private wallTimer = 0;
  private wallLock = 0;
  /** The Ground Slam: where it is (`windup` hover, `dive`, `impact` stuck in the ground), the ticks into that part, and who the dive has already hit. */
  private slamPhase: 'windup' | 'dive' | 'impact' = 'windup';
  private slamTicks = 0;
  private slamHit = new Set<string>();
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

  /** Metres of ground covered since the last footstep: the footsteps are the hero's pace, one per stride, as far as the animation's feet go (docs/PROMPT18-LOG.md). */
  private strideDistance = 0;

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
        slam: { enter: (c) => c.enterSlam(), update: (c) => c.updateSlam() },
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
  /** Holding against a wall in the air and sliding down it (the Wall Jump): the body is on the wall, falling slowly. */
  get wallSliding(): boolean {
    return this.fsm.current === 'free' && !this.player.body.grounded && this.wallHeld() !== 0 && this.player.body.vy < 0;
  }
  /** Where the Ground Slam is, for the animation: its part and how far through it (0 … 1). `null` when the hero is not slamming. */
  slamProgress(): { phase: 'windup' | 'dive' | 'impact'; t: number } | null {
    if (this.fsm.current !== 'slam') return null;
    const s = this.tuning.slam;
    const length = this.slamPhase === 'windup' ? s.windup : this.slamPhase === 'impact' ? s.landLag : 1;
    return { phase: this.slamPhase, t: Math.min(1, this.slamTicks / Math.max(1, length)) };
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
  /** How much of the hit i-frames are left, 1 (a blow just landed) … 0 (none): what the HUD's guard line drains with. The dash i-frames are not these. */
  get hurtGuard01(): number {
    const total = this.player.def.combat.hurt.invulnerability;
    return total > 0 ? Math.min(1, this.hurtInvuln / total) : 0;
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
    this.airJumpsUsed = this.wallTimer = this.wallLock = this.slamTicks = 0;
    this.slamHit = new Set();
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

    // (a kick off a wall ignores the stick that is still held toward it for a moment: the hero keeps facing away)
    const towardWall = this.wallLock > 0 && sign(mx) === this.wallSide;
    if (Math.abs(mx) > 0.25 && !towardWall) p.facing = mx > 0 ? 1 : -1;

    // ---- ground contact bookkeeping ----
    if (grounded) {
      this.coyote = secondsToTicks(t.coyoteTime);
      this.airDashesUsed = 0;
      this.airJumpsUsed = 0;
      this.jumping = false;
    } else if (this.coyote > 0) {
      this.coyote--;
    }

    // ---- the wall (the Wall Jump): a wall the body pushed into is remembered for a few ticks, so a press kicks off it even on the very tick the stick turns away, or the instant after ----
    const touched = crouching ? 0 : this.wallTouched();
    if (touched !== 0) {
      this.wallSide = touched;
      this.wallTimer = secondsToTicks(t.wall.coyoteTime);
    } else if (this.wallTimer > 0) this.wallTimer--;
    const wall = touched !== 0 && sign(mx) === touched && Math.abs(mx) > 0.25 ? touched : 0; // held against: the stick is toward it too
    if (grounded) this.wallTimer = 0;
    if (this.wallLock > 0) this.wallLock--;

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
    } else if (!crouching && this.tryWallJump()) {
      // (kicked off a wall)
    } else if (!crouching && this.tryAirJump()) {
      // (jumped again in the air)
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
    const target = towardWall ? 0 : sign(mx) * (crouching ? Math.min(top, t.crouch.speed) : top);
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
    if (wall !== 0 && b.vy < -t.wall.slideSpeed) b.vy = -t.wall.slideSpeed; // sliding down a wall: the fall is slowed to a slide

    // ---- posture: in / out of the crouch, with hysteresis; standing up needs room ----
    if (crouching) {
      const pushingDown = inp.move.y < -t.crouch.exit;
      if ((!b.grounded || !pushingDown) && this.canStand()) this.fsm.go('free');
    } else if (b.grounded && inp.move.y <= -t.crouch.enter) {
      this.fsm.go('crouch');
    }

    // ---- attack: a buffered press starts it (ground / air / crouch variant); overrides the posture change. In the air, with the Ground Slam, down and attack is the slam ----
    if (this.player.combat.wantsAttack) this.fsm.go(this.slamWanted() ? 'slam' : 'attack');

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

  /** The take-off speed of a jump that rises `height` metres. +g·dt/2 compensates the half tick lost to semi-implicit integration, so `height` is the real apex height. */
  private jumpSpeed(height: number): number {
    const g = this.tuning.gravity;
    return Math.sqrt(2 * g * height) + (g * TICK_SECONDS) / 2;
  }

  private startJump(fromGround: boolean): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    b.vy = this.jumpSpeed(t.jumpHeight);
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

  // ------------------------------------------------------------------------------------- the Double Jump and the Wall Jump

  /** One more jump in the air: a FRESH press with nothing under the feet, no coyote time to make it a plain jump, the ability, and a jump left. */
  private tryAirJump(): boolean {
    const b = this.player.body;
    const t = this.tuning;
    if (!this.input.jumpPressed || b.grounded || this.coyote > 0 || this.airJumpsUsed >= t.doubleJump.jumps) return false;
    if (!this.sim.abilities.has('double_jump')) return false;
    this.airJumpsUsed++;
    b.vy = this.jumpSpeed(t.doubleJump.height);
    this.jumping = true;
    this.jumpCut = false;
    this.jumpHeldTicks = 0;
    this.jumpBuffer = 0;
    this.animSerial++;
    this.sim.bus.emit('player:jumped', { x: b.x, y: b.y, air: true });
    return true;
  }

  /** The side of the body a wall touches: the body pushed into it last tick, in the air, and the hero has the ability. 0: none. */
  private wallTouched(): -1 | 0 | 1 {
    const b = this.player.body;
    if (b.grounded || (!b.hitRight && !b.hitLeft)) return 0;
    return this.sim.abilities.has('wall_jump') ? (b.hitRight ? 1 : -1) : 0;
  }

  /** The side of the body a wall is HELD against: it touches, and the stick is toward it. The hero slides down it. */
  private wallHeld(): -1 | 0 | 1 {
    const side = this.wallTouched();
    const mx = this.input.move.x;
    return side !== 0 && sign(mx) === side && Math.abs(mx) > 0.25 ? side : 0;
  }

  /** A press within a few ticks of a wall that was held kicks off it: up and away, with the stick toward the wall ignored for a moment (it would undo the kick). */
  private tryWallJump(): boolean {
    const p = this.player;
    const b = p.body;
    const t = this.tuning.wall;
    if (this.jumpBuffer <= 0 || this.wallTimer <= 0 || b.grounded) return false;
    const away: 1 | -1 = this.wallSide === 1 ? -1 : 1;
    b.vx = away * t.kickSpeed;
    b.vy = this.jumpSpeed(t.jumpHeight);
    p.facing = away;
    this.wallLock = secondsToTicks(t.lockTime);
    this.wallTimer = 0;
    this.jumping = true;
    this.jumpCut = false;
    this.jumpHeldTicks = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.animSerial++;
    this.sim.bus.emit('player:jumped', { x: b.x, y: b.y, air: true });
    return true;
  }

  // ------------------------------------------------------------------------------------------------ the Ground Slam

  /** In the air, with the ability and the attacks it needs, down and a press of attack. */
  private slamWanted(): boolean {
    const c = this.player.def.combat;
    return !this.crouching && !this.player.body.grounded && this.input.move.y <= -0.6 && !!c.slamDive && !!c.slamWave && this.sim.abilities.has('ground_slam');
  }

  private enterSlam(): void {
    this.player.combat.consumeBuffer();
    this.slamPhase = 'windup';
    this.slamTicks = 0;
    this.slamHit = new Set();
    this.jumping = false;
    this.animSerial++;
  }

  /**
   * One tick of the slam. A hover in the air (nothing hurts yet: it is the warning, and the moment to change your mind with a dash), the dive straight down at `slam.speed`, hitting whatever it falls on once each, and, the tick after the feet touch the ground, the
   * shockwave: two halves of a wide blow either side of the body for a few ticks, then the hero is stuck in the ground until the lag has run out. `attack ids`: the dive is `slam_dive`, the wave is `slam` (what a breakable floor asks for).
   */
  private updateSlam(): void {
    const p = this.player;
    const b = p.body;
    const t = this.tuning;
    const s = t.slam;
    const defs = p.def.combat;
    if (this.slamPhase === 'windup') {
      b.vx = approachValue(b.vx, 0, t.airDecel * 2 * TICK_SECONDS);
      b.vy = 0;
      if (++this.slamTicks >= s.windup) {
        this.slamPhase = 'dive';
        this.slamTicks = 0;
      }
      return;
    }
    if (this.slamPhase === 'dive') {
      if (b.grounded) {
        this.slamPhase = 'impact';
        this.slamTicks = 0;
        this.slamHit = new Set(); // the wave is a new blow: it can hit what the dive already hit
        const wave = defs.attacks[defs.slamWave!];
        this.sim.bus.emit('player:slammed', { x: b.x, y: b.y, shake: wave?.shake ?? 0 });
      } else {
        b.vx = 0;
        b.vy = -s.speed;
        const dive = defs.attacks[defs.slamDive!];
        if (dive) this.submitSlam(dive, 1);
        this.slamTicks++;
        return;
      }
    }
    // the impact: stuck in the ground, the wave going out both ways
    b.vx = 0;
    b.vy = Math.max(b.vy - this.gravityNow() * TICK_SECONDS, -t.maxFallSpeed);
    if (this.slamTicks < s.waveTicks) {
      const wave = defs.attacks[defs.slamWave!];
      if (wave) {
        this.submitSlam(wave, 1);
        this.submitSlam(wave, -1);
      }
    }
    if (++this.slamTicks >= s.landLag) this.fsm.go(this.postAttackState());
  }

  /** One hitbox of the slam this tick; the dive and the two halves of the wave each remember who they hit in the set of the phase they belong to. */
  private submitSlam(a: AttackDefinition, facing: 1 | -1): void {
    const p = this.player;
    const rect = attackRect(a, p.body.x, p.body.y, facing, { x0: 0, y0: 0, x1: 0, y1: 0 });
    this.sim.combat.submit({
      ownerId: p.id,
      team: 'player',
      rect,
      attackId: a.id,
      damage: a.damage,
      knockback: a.knockback,
      stun: a.stun,
      hitStop: a.hitStop,
      shake: a.shake,
      facing,
      alreadyHit: this.slamHit,
      onConfirm: () => {},
    });
  }

  // ------------------------------------------------------------------------------------------------ dash

  private canDash(): boolean {
    const t = this.tuning.dash;
    if (!this.sim.abilities.has('dash')) return false;
    if (this.dashCooldown > 0) return false;
    // the Air Dash (the boss's reward, docs/PROMPT6-LOG.md S29) is one more dash in the air, on top of the one the dash itself allows
    return this.player.body.grounded || this.airDashesUsed < t.airDashes + (this.sim.abilities.has('air_dash') ? 1 : 0);
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
    // the light gathers where the projectile will leave from (the interface and the effects only listen: nothing here depends on it)
    if (this.castSkill) {
      const m = this.castSkill.projectile.muzzle;
      this.sim.bus.emit('skill:castStarted', { skillId: this.castSkill.id, x: p.body.x + p.facing * m.x, y: p.body.y + (this.crouching ? m.yCrouched : m.y), facing: p.facing, ticks: this.castSkill.startup });
    }
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
    const relics = p.def.combat.relics;
    sim.spawn(new Projectile(sim.newId('bolt'), skill.id, skill.projectile, p.id, x, y, p.facing, relics && sim.abilities.has('relic_pierce') ? relics.pierce : 0));
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
    const relics = p.def.combat.relics;
    const healed = effect.type === 'heal' ? p.health.heal(effect.amount + (relics && sim.abilities.has('relic_brew') ? relics.brewBonus : 0)) : 0;
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
    const relics = p.def.combat.relics;
    const guard = Math.round(def.invulnerability * (relics && this.sim?.abilities.has('relic_ward') ? relics.wardScale : 1));
    this.invulnerable = Math.max(this.invulnerable, guard);
    this.hurtInvuln = guard;
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
    const relics = this.player.def.combat.relics;
    this.dashCooldown = secondsToTicks(t.dash.cooldown * (relics && this.sim.abilities.has('relic_swift') ? relics.swiftScale : 1));
    this.sim.bus.emit('player:dashEnded', { x: b.x, y: b.y });
  }

  // -------------------------------------------------------------------------------------------- movement

  private integrate(): void {
    const b = this.player.body;
    const t = this.tuning;
    const wasGrounded = b.grounded;
    const fallSpeed = -b.vy;
    const x0 = b.x;
    this.sim.collision.moveBody(b, b.vx * TICK_SECONDS, b.vy * TICK_SECONDS, this.dropThrough > 0);
    if (!wasGrounded && b.grounded && fallSpeed > 0) {
      this.landTicks = fallSpeed >= t.landImpactSpeed ? 10 : 0;
      this.sim.bus.emit('player:landed', { x: b.x, y: b.y, impact: fallSpeed });
    }
    this.stepOn(Math.abs(b.x - x0), wasGrounded);
  }

  /**
   * The footsteps: a stride of ground covered on foot — on the ground before and after the tick, free to walk or crouched — is one step. The stride is the distance the animation's feet cover per step (the walk and the run
   * clips are matched to the ground speed), so that the sound lands with the foot: 1.05 m walking, 1.7 m running, 0.8 m crouched. Anything that is not walking (the air, a dash, a blow, a drink) starts the next stride afresh.
   */
  private stepOn(dx: number, wasGrounded: boolean): void {
    const b = this.player.body;
    const t = this.tuning;
    const state = this.fsm.current;
    if (!wasGrounded || !b.grounded || (state !== 'free' && state !== 'crouch')) {
      this.strideDistance = 0;
      return;
    }
    this.strideDistance += dx;
    const speed = Math.abs(b.vx);
    const stride = this.crouching ? STRIDE.crouch : speed <= t.walkSpeed * 1.15 ? STRIDE.walk : STRIDE.run;
    if (this.strideDistance < stride) return;
    this.strideDistance -= stride;
    this.sim.bus.emit('player:stepped', { x: b.x, y: b.y, speed, crouch: this.crouching });
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
