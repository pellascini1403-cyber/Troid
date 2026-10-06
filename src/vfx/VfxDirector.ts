import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxBindings, VfxDefinition, VfxSpawn, VfxTrigger } from '@/presentation/vfx';
import type { VfxSystem } from './VfxSystem';

/**
 * Listens to the simulation's events and starts effects (docs/ARCHITECTURE-2D.md §7.7). The simulation never knows this
 * class exists: it only emits events. WHICH events raise WHICH trigger is the code below (a handful of lines of
 * mapping); WHAT each trigger looks like is the data table `VFX_BINDINGS` + `VfxDefinition`s injected by the app.
 */
export class VfxDirector {
  private readonly off: Array<() => void> = [];
  /** The dash in progress: where the last trail puff was left. */
  private trail: { x: number; facing: 1 | -1 } | null = null;
  private readonly trailSpacing: number;

  constructor(
    bus: EventBus<GameEvents>,
    private readonly system: VfxSystem,
    private readonly bindings: VfxBindings,
    defs: Readonly<Record<string, VfxDefinition>>,
    /** Where the player is NOW (the trail is laid along the path, whatever the frame rate). */
    private readonly playerPosition: () => { x: number; y: number },
    /** The ids of the skills that fly as projectiles: a hit by one of them is a bolt impact, not a sword hit. */
    private readonly projectileSkills: ReadonlySet<string> = new Set(),
  ) {
    let spacing = 0.5;
    for (const id of bindings.dashTrail) {
      const d = defs[id];
      if (d?.kind === 'flash' && d.spacing) spacing = Math.min(spacing, d.spacing);
    }
    this.trailSpacing = spacing;

    this.off.push(
      bus.on('player:attackActive', (e) => {
        this.fire(e.combo >= 1 ? 'slashFinisher' : 'slash', { x: e.x, y: e.y + 0.8, facing: e.facing, rect: e.rect, variant: e.attackId });
      }),
      bus.on('combat:hit', (e) => {
        // the hero's own hurt effect comes from `player:hurt`; this is the blow that LANDS on something else
        if (e.targetTeam === 'player') return;
        const trigger = this.projectileSkills.has(e.attackId) ? 'boltImpact' : 'hitLanded';
        this.fire(trigger, { x: e.x, y: e.y, facing: e.direction, dirX: e.direction, dirY: 0.15, scale: e.killed ? 1.3 : 1 });
      }),
      bus.on('skill:cast', (e) => {
        this.fire('boltCast', { x: e.x, y: e.y, facing: e.facing, dirX: e.facing, dirY: 0 });
      }),
      bus.on('projectile:ended', (e) => {
        // when it hit something the impact effect already played; a bolt that ends on a wall or at the end of its range fizzles
        if (e.reason !== 'hit') this.fire('boltEnd', { x: e.x, y: e.y, facing: e.facing });
      }),
      bus.on('bottle:drinkStarted', (e) => {
        this.fire('drinkStart', { x: e.x, y: e.y + 0.9, facing: 1 });
      }),
      bus.on('bottle:drunk', (e) => {
        this.fire('drinkHeal', { x: e.x, y: e.y + 0.9, facing: 1 });
      }),
      // resting at a shrine restores the hero the way a bottle does: the same warm light, where they stand
      bus.on('checkpoint:set', (e) => {
        this.fire('drinkHeal', { x: e.x, y: e.y + 0.9, facing: 1 });
      }),
      bus.on('player:hurt', (e) => {
        this.fire('playerHurt', { x: e.x, y: e.y, facing: e.direction, dirX: e.direction, dirY: 0.2 });
      }),
      bus.on('player:dashed', (e) => {
        this.fire('dashStart', { x: e.x, y: e.y + 0.9, facing: e.facing });
        this.fire('dashDust', { x: e.x, y: e.y + 0.1, facing: e.facing });
        this.trail = { x: e.x, facing: e.facing };
      }),
      bus.on('player:dashEnded', () => {
        this.update(); // leave the last puffs up to where the dash ended
        this.trail = null;
      }),
      bus.on('actor:died', (e) => {
        if (e.team !== 'player') this.fire('enemyDied', { x: e.x, y: e.y + 0.7, facing: 1 });
      }),
      bus.on('enemy:telegraph', (e) => {
        this.fire('enemyTelegraph', { x: e.x, y: e.y + 0.45, facing: e.facing });
      }),
      bus.on('player:died', (e) => {
        this.fire('playerDied', { x: e.x, y: e.y + 0.9, facing: 1 });
      }),
    );
  }

  /** Once per rendered frame: lays the dash trail along the distance travelled since the last puff. */
  update(): void {
    const t = this.trail;
    if (!t) return;
    const p = this.playerPosition();
    const dx = p.x - t.x;
    const n = Math.min(12, Math.floor(Math.abs(dx) / this.trailSpacing));
    const dir = dx >= 0 ? 1 : -1;
    for (let k = 1; k <= n; k++) this.fire('dashTrail', { x: t.x + dir * k * this.trailSpacing, y: p.y + 0.85, facing: t.facing });
    t.x += dir * n * this.trailSpacing;
  }

  /** Starts every effect bound to a trigger. Returns how many produced something. */
  fire(trigger: VfxTrigger, spawn: VfxSpawn): number {
    let made = 0;
    for (const id of this.bindings[trigger]) if (this.system.spawn(id, spawn)) made++;
    return made;
  }

  dispose(): void {
    for (const off of this.off.splice(0)) off();
    this.trail = null;
  }
}
