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
    });
    this.view.anim = out.anim;
    this.view.animSpeed = out.speed;
    this.view.animSerial = c.animSerial;
  }
}
