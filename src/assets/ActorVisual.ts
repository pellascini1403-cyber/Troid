import * as THREE from 'three';
import { damp, DEG2RAD } from '@/core/math';
import type { ActorViewState } from '@/gameplay/actorView';
import type { CharacterModel } from './CharacterModel';

export interface ActorVisualOptions {
  /**
   * Yaw (degrees) used when facing left/right. 90 would be a pure profile; a bit less turns the actor
   * slightly toward the camera, which shows volume and keeps the 3D feel while still reading as side-on.
   */
  facingYawDeg?: number;
  /** How fast the actor pivots when it changes direction (1/s). */
  turnRate?: number;
  /** Blink frequency (Hz) while `blink` is set (i-frames). */
  blinkHz?: number;
}

/**
 * Binds one ActorViewState (written by the simulation) to one CharacterModel (three.js).
 *
 * This is the ONLY bridge between an actor's simulation state and its mesh: it interpolates the position
 * between ticks, pivots the model, drives the AnimationController and applies flash/opacity. Because it only
 * consumes ActorViewState, the same class serves the player, every enemy and every boss.
 */
export class ActorVisual {
  /** Add this to the scene. Origin = feet centre in world space. */
  readonly root = new THREE.Group();

  private yaw: number;
  private serial = -1;
  private clock = 0;
  private readonly facingYaw: number;
  private readonly turnRate: number;
  private readonly blinkHz: number;

  constructor(
    readonly model: CharacterModel,
    options: ActorVisualOptions = {},
  ) {
    this.facingYaw = (options.facingYawDeg ?? 78) * DEG2RAD;
    this.turnRate = options.turnRate ?? 22;
    this.blinkHz = options.blinkHz ?? 14;
    this.yaw = this.facingYaw;
    this.root.name = `Actor:${model.asset.def.id}`;
    this.root.add(model.root);
    model.root.rotation.y = this.yaw;
  }

  /** `alpha` ∈ [0,1): interpolation between the previous and current simulation tick. `dt`: real seconds. */
  sync(view: ActorViewState, alpha: number, dt: number): void {
    this.clock += dt;
    this.root.visible = view.visible;
    if (!view.visible) return;

    this.root.position.set(
      view.prevX + (view.x - view.prevX) * alpha,
      view.prevY + (view.y - view.prevY) * alpha,
      view.z,
    );

    const targetYaw = view.facing * this.facingYaw;
    this.yaw = damp(this.yaw, targetYaw, this.turnRate, dt);
    this.model.root.rotation.y = this.yaw;

    const restart = view.animSerial !== this.serial;
    this.serial = view.animSerial;
    this.model.animation.play(view.anim, {
      speed: view.animSpeed,
      duration: view.animDuration,
      restart,
    });
    this.model.animation.update(dt);

    this.model.setFlash(view.flash);
    const blinkDim = view.blink && Math.floor(this.clock * this.blinkHz) % 2 === 0 ? 0.35 : 1;
    this.model.setOpacity(view.opacity * blinkDim);
  }

  /** Snaps the facing without pivoting (spawns, room transitions). */
  snapFacing(facing: 1 | -1): void {
    this.yaw = facing * this.facingYaw;
    this.model.root.rotation.y = this.yaw;
  }

  dispose(): void {
    this.model.dispose();
    this.root.removeFromParent();
  }
}
