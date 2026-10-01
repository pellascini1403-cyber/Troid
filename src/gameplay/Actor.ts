import { createBody, type KinematicBody } from '@/world/collision';
import { createActorViewState, type ActorViewState } from './actorViewState';

export type Team = 'player' | 'enemy' | 'neutral';

/**
 * Anything with a body that lives in a room and is drawn by an ActorVisual: the player, enemies, bosses.
 * It owns the two things every actor has — a physical `body` and the `view` state the renderer reads — and
 * nothing about meshes, clips or the DOM.
 */
export abstract class Actor {
  readonly body: KinematicBody;
  readonly view: ActorViewState = createActorViewState();
  facing: 1 | -1 = 1;

  protected constructor(
    readonly id: string,
    readonly team: Team,
    halfWidth: number,
    height: number,
  ) {
    this.body = createBody(halfWidth, height);
  }

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }

  /** Call first thing every simulated tick: remembers the previous position for render interpolation. */
  protected beginTick(): void {
    this.view.prevX = this.view.x;
    this.view.prevY = this.view.y;
  }

  /** Call after movement: publishes the new state to the view. */
  protected syncView(): void {
    this.view.x = this.body.x;
    this.view.y = this.body.y;
    this.view.facing = this.facing;
  }

  /** Places the actor instantly (no interpolation across the jump). */
  teleport(x: number, y: number, facing: 1 | -1 = this.facing): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.vx = b.vy = 0;
    this.facing = facing;
    this.view.prevX = this.view.x = x;
    this.view.prevY = this.view.y = y;
    this.view.facing = facing;
  }
}
