import type { Rect } from '@/core/math';
import { Actor } from '@/gameplay/Actor';
import type { SimServices } from '@/gameplay/SimServices';
import type { InputFrame } from '@/input/InputFrame';
import { PlayerController } from './PlayerController';
import type { PlayerDefinition } from './PlayerDefinition';
import { deriveAnimation } from './playerAnimation';

/**
 * The player entity: a body, a view state and a controller. Presentation lives in PlayerVisual, data in
 * PlayerDefinition, movement in PlayerController, animation choice in playerAnimation — each replaceable alone.
 */
export class Player extends Actor {
  readonly controller: PlayerController;
  /** Session-private copy of the definition: the debug panel may tweak its movement tuning live. */
  readonly def: PlayerDefinition;

  constructor(def: PlayerDefinition, id: string) {
    super(id, 'player', def.body.halfWidth, def.body.height);
    this.def = { ...def, movement: structuredClone(def.movement) };
    this.controller = new PlayerController(this);
  }

  tick(sim: SimServices, input: InputFrame): void {
    this.beginTick();
    this.controller.update(sim, input);
    this.syncView();
    this.publishAnimation();
  }

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

  /** Back to a clean slate at `(x, y)` (respawn, room entry). Abilities and progression are not touched. */
  respawn(x: number, y: number, facing: 1 | -1 = 1): void {
    this.teleport(x, y, facing);
    this.controller.reset();
    this.view.flash = 0;
    this.view.opacity = 1;
    this.view.blink = false;
    this.view.anim = 'idle';
    this.view.animSerial++;
  }

  private publishAnimation(): void {
    const c = this.controller;
    const m = this.def.movement;
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
    this.view.anim = out.anim;
    this.view.animSpeed = out.speed;
    this.view.animSerial = c.animSerial;
  }
}
