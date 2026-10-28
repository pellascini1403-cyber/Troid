import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxBindings, VfxDefinition, VfxSpawn, VfxTrigger } from '@/presentation/vfx';
import type { VfxSystem } from './VfxSystem';

/** The light the hero carries: not an event but a state (their magic), which the director lets go as motes now and then. */
export interface AmbientOptions {
  /** The effect (a particle burst of one) that lets a mote go. */
  effect: string;
  /** 0–1: how much light the hero carries now. Nothing is let go at 0. */
  level: () => number;
  /** Seconds between motes at full level; at lower ones the level squared stretches it, so a spent hero is dark. */
  every: number;
}

/** The longest a stalled frame may owe the ambient light (a frame that comes late must not let go a burst of motes). */
const MAX_AMBIENT_DEBT = 1.5;

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
  /** Seconds of ambient light owed (the level squared, summed over the frames). */
  private ambientOwed = 0;

  constructor(
    bus: EventBus<GameEvents>,
    private readonly system: VfxSystem,
    private readonly bindings: VfxBindings,
    defs: Readonly<Record<string, VfxDefinition>>,
    /** Where the player is NOW (the trail is laid along the path, whatever the frame rate). */
    private readonly playerPosition: () => { x: number; y: number },
    /** The ids of the skills that fly as projectiles: a hit by one of them is a bolt impact, not a sword hit. */
    private readonly projectileSkills: ReadonlySet<string> = new Set(),
    /** The light the hero carries (their magic): none when the game gives none (the lab, the tests). */
    private readonly ambient: AmbientOptions | null = null,
    /** Told every time a trigger fires, with where: the light a moment leaves is drawn by whoever listens (it costs none of the effects' budget). */
    private readonly onFire: ((trigger: VfxTrigger, spawn: VfxSpawn) => void) | null = null,
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
      // the power gathers in the hand for the ticks of the preparation, and is let go at the release
      bus.on('skill:castStarted', (e) => {
        this.fire('boltCharge', { x: e.x, y: e.y, facing: e.facing, dirX: e.facing, dirY: 0 });
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
      // resting at a shrine: the place awakens — a pillar of light on the spot where the hero stands, which is where they come back now
      bus.on('checkpoint:set', (e) => {
        this.fire('checkpoint', { x: e.x, y: e.y, facing: 1 });
      }),
      // a power gained: the event names no place, it is the hero's — where they stand
      bus.on('ability:unlocked', () => {
        const p = this.playerPosition();
        this.fire('abilityGained', { x: p.x, y: p.y, facing: 1 });
      }),
      // something taken up (the fourth bottle, a card): its light opens where it floated — the notice names the point its ICON hangs at,
      // 1.2 m over the object's feet, and the object floats 0.85 m over them
      bus.on('interaction:performed', (e) => {
        if (e.kind === 'pickup') this.fire('pickup', { x: e.x, y: e.y - 0.35, facing: 1 });
      }),
      // the boss (S29): it wakes with a ring and a swell of light from its crest, each strike erupts where it lands, it burns hotter at half its
      // health and it falls with a great ring (its `actor:died` plays the ink burst of any death on top)
      bus.on('boss:started', (e) => this.fire('bossWake', { x: e.x, y: e.y + 3.2, facing: 1 })),
      bus.on('boss:strike', (e) => this.fire('bossStrike', { x: e.x, y: e.y + 0.2, facing: 1, dirX: 0, dirY: 1 })),
      bus.on('boss:phase', (e) => this.fire('bossPhase', { x: e.x, y: e.y + 3.2, facing: 1 })),
      bus.on('boss:defeated', (e) => this.fire('bossDefeated', { x: e.x, y: e.y + 1.5, facing: 1 })),
      // a blow a seal turned away: a violet ring where it landed and sparks that spring back the way it came from
      bus.on('seal:rejected', (e) => {
        this.fire('sealRejected', { x: e.x, y: e.y, facing: e.direction, dirX: e.direction, dirY: 0 });
      }),
      // a blow an enemy's shield turned away: the same ring and sparks
      bus.on('enemy:blocked', (e) => {
        this.fire('sealRejected', { x: e.x, y: e.y, facing: e.direction, dirX: e.direction, dirY: 0 });
      }),
      bus.on('player:hurt', (e) => {
        this.fire('playerHurt', { x: e.x, y: e.y, facing: e.direction, dirX: e.direction, dirY: 0.2 });
      }),
      // lava: the hero's own hurt comes from `player:hurt` (the cyan); the lava adds what is the lava's
      bus.on('hazard:hit', (e) => {
        if (e.kind === 'lava') this.fire('lavaBurn', { x: e.x, y: e.y, facing: 1, dirX: 0, dirY: 1 });
      }),
      bus.on('player:dashed', (e) => {
        this.fire('dashStart', { x: e.x, y: e.y + 0.9, facing: e.facing });
        this.fire('dashDust', { x: e.x, y: e.y + 0.1, facing: e.facing });
        this.trail = { x: e.x, facing: e.facing };
      }),
      bus.on('player:dashEnded', () => {
        this.layTrail(); // leave the last puffs up to where the dash ended
        this.trail = null;
      }),
      bus.on('actor:died', (e) => {
        if (e.team === 'player') return;
        // a seal is the one neutral thing that falls: a ward breaks (its point is its centre); a creature dies (its point is its feet)
        if (e.team === 'neutral') this.fire('sealBroken', { x: e.x, y: e.y, facing: 1 });
        else this.fire('enemyDied', { x: e.x, y: e.y + 0.7, facing: 1 });
      }),
      bus.on('enemy:telegraph', (e) => {
        this.fire('enemyTelegraph', { x: e.x, y: e.y + 0.45, facing: e.facing });
      }),
      bus.on('player:died', (e) => {
        this.fire('playerDied', { x: e.x, y: e.y + 0.9, facing: 1 });
      }),
    );
  }

  /** Once per rendered frame (`dt` seconds of the effects' own time): lays the dash trail along the distance travelled since the last puff, and lets go the light the hero carries. */
  update(dt = 0): void {
    this.letGoAmbient(dt);
    this.layTrail();
  }

  /** A mote of the hero's own light now and then, as often as their magic is high. At most a few are alive at once (`AMBIENT_CONTRACT`). */
  private letGoAmbient(dt: number): void {
    const a = this.ambient;
    if (!a || !(dt > 0)) return;
    const level = Math.min(1, Math.max(0, a.level()));
    if (level <= 0) {
      this.ambientOwed = 0;
      return;
    }
    this.ambientOwed = Math.min(MAX_AMBIENT_DEBT, this.ambientOwed + dt * level * level);
    if (this.ambientOwed < a.every) return;
    this.ambientOwed -= a.every;
    const p = this.playerPosition();
    this.system.spawn(a.effect, { x: p.x, y: p.y + 0.9, facing: 1 });
  }

  private layTrail(): void {
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
    this.onFire?.(trigger, spawn);
    let made = 0;
    for (const id of this.bindings[trigger]) if (this.system.spawn(id, spawn)) made++;
    return made;
  }

  dispose(): void {
    for (const off of this.off.splice(0)) off();
    this.trail = null;
  }
}
