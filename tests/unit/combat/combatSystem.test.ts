import { describe, expect, it } from 'vitest';
import type { Combatant, HitboxSubmission, HitInfo, HitOutcome, Hurtbox, Team } from '@/combat/Combatant';
import { CombatSystem, type CombatEvents, type CombatHost } from '@/combat/CombatSystem';
import { Health } from '@/combat/Health';
import type { Rect } from '@/core/math';

class Target implements Combatant {
  readonly health: Health;
  invulnerable = false;
  hits: HitInfo[] = [];
  outcome: HitOutcome = 'hit';
  constructor(
    readonly id: string,
    readonly team: Team,
    private readonly boxes: Hurtbox[],
    hp = 5,
  ) {
    this.health = new Health(hp);
  }
  collectHurtboxes(out: Hurtbox[]): void {
    out.push(...this.boxes);
  }
  receiveHit(hit: HitInfo): HitOutcome {
    this.hits.push(hit);
    if (this.outcome === 'hit') this.health.damage(hit.damage);
    return this.outcome;
  }
}

const box = (x0: number, y0: number, x1: number, y1: number, multiplier = 1, part?: string): Hurtbox => ({ rect: { x0, y0, x1, y1 }, multiplier, ...(part ? { part } : {}) });

function setup() {
  const events: Array<[keyof CombatEvents, unknown]> = [];
  const stops: number[] = [];
  const host: CombatHost = {
    bus: { emit: (type, payload) => void events.push([type, payload]) },
    requestHitStop: (n) => void stops.push(n),
  };
  return { combat: new CombatSystem(host), events, stops };
}

const strike = (over: Partial<HitboxSubmission> & { rect: Rect }): HitboxSubmission => ({
  ownerId: 'p',
  team: 'player',
  attackId: 'slash',
  damage: 1,
  knockback: { x: 5, y: 2 },
  stun: 12,
  hitStop: 4,
  shake: 0.1,
  facing: 1,
  alreadyHit: new Set(),
  ...over,
});

describe('CombatSystem', () => {
  it('hits a target whose hurtbox overlaps the hitbox, once, and reports the impact point', () => {
    const { combat, events } = setup();
    const t = new Target('e1', 'enemy', [box(2, 0, 3, 2)]);
    combat.add(t);
    combat.submit(strike({ rect: { x0: 1, y0: 0.5, x1: 2.5, y1: 1.5 } }));
    combat.resolve();
    expect(t.hits).toHaveLength(1);
    const hit = t.hits[0]!;
    expect(hit.x).toBeCloseTo(2.25);
    expect(hit.y).toBeCloseTo(1.0);
    expect(hit.direction).toBe(1);
    expect(t.health.current).toBe(4);
    expect(events.map(([k]) => k)).toEqual(['combat:hit', 'health:changed']);
  });

  it('hit-once: the same attack instance (same alreadyHit set) never hits the same target twice', () => {
    const { combat } = setup();
    const t = new Target('e1', 'enemy', [box(0, 0, 2, 2)]);
    combat.add(t);
    const shared = new Set<string>();
    for (let i = 0; i < 3; i++) {
      combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 }, alreadyHit: shared }));
      combat.resolve();
    }
    expect(t.hits).toHaveLength(1);
    // a NEW instance of the attack is a new set and hits again
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(t.hits).toHaveLength(2);
  });

  it('never hits its owner, nor its own team', () => {
    const { combat } = setup();
    const self = new Target('p', 'player', [box(0, 0, 2, 2)]);
    const ally = new Target('p2', 'player', [box(0, 0, 2, 2)]);
    const foe = new Target('e', 'enemy', [box(0, 0, 2, 2)]);
    [self, ally, foe].forEach((c) => combat.add(c));
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect([self.hits.length, ally.hits.length, foe.hits.length]).toEqual([0, 0, 1]);
  });

  it('neutral combatants (breakable walls, switches) are hit by the player but never by enemies', () => {
    const { combat } = setup();
    const wall = new Target('wall', 'neutral', [box(0, 0, 2, 2)]);
    combat.add(wall);
    combat.submit(strike({ ownerId: 'e', team: 'enemy', rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(wall.hits).toHaveLength(0);
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(wall.hits).toHaveLength(1);
  });

  it('an explicit `hits` list overrides the default team rule', () => {
    const { combat } = setup();
    const ally = new Target('a', 'player', [box(0, 0, 2, 2)]);
    combat.add(ally);
    combat.submit(strike({ ownerId: 'bomb', team: 'neutral', hits: ['player'], rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(ally.hits).toHaveLength(1);
  });

  it('skips invulnerable and dead targets without consuming the hit', () => {
    const { combat } = setup();
    const t = new Target('e', 'enemy', [box(0, 0, 2, 2)]);
    combat.add(t);
    t.invulnerable = true;
    const set = new Set<string>();
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 }, alreadyHit: set }));
    combat.resolve();
    expect(t.hits).toHaveLength(0);
    expect(set.size).toBe(0); // i-frames ended later in the swing: it can still connect
    t.invulnerable = false;
    t.health.damage(99);
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(t.hits).toHaveLength(0); // dead
  });

  it('a hurtbox that answers "ignored" does not consume the hit', () => {
    const { combat, stops } = setup();
    const t = new Target('e', 'enemy', [box(0, 0, 2, 2)]);
    t.outcome = 'ignored';
    combat.add(t);
    const set = new Set<string>();
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 }, alreadyHit: set }));
    combat.resolve();
    expect(set.size).toBe(0);
    expect(stops).toEqual([]);
  });

  it('hits the FIRST overlapping region (callers order them by priority) and scales damage by its multiplier', () => {
    const { combat } = setup();
    const boss = new Target('b', 'enemy', [box(0, 1, 2, 2, 2, 'core'), box(0, 0, 2, 2, 0.5, 'armour')], 10);
    combat.add(boss);
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(boss.hits).toHaveLength(1);
    expect(boss.hits[0]!.part).toBe('core');
    expect(boss.hits[0]!.damage).toBe(2);
    expect(boss.health.current).toBe(8);
  });

  it('touching edges do not overlap', () => {
    const { combat } = setup();
    const t = new Target('e', 'enemy', [box(2, 0, 3, 2)]);
    combat.add(t);
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(t.hits).toHaveLength(0);
  });

  it('requests ONE hit-stop per resolve: the longest of the confirmed hits', () => {
    const { combat, stops } = setup();
    combat.add(new Target('a', 'enemy', [box(0, 0, 1, 1)]));
    combat.add(new Target('b', 'enemy', [box(2, 0, 3, 1)]));
    combat.submit(strike({ hitStop: 4, rect: { x0: 0, y0: 0, x1: 1, y1: 1 } }));
    combat.submit(strike({ hitStop: 7, rect: { x0: 2, y0: 0, x1: 3, y1: 1 } }));
    combat.resolve();
    expect(stops).toEqual([7]);
  });

  it('reports kills, calls onConfirm once per confirmed hit and emits the event payload', () => {
    const { combat, events } = setup();
    const t = new Target('e', 'enemy', [box(0, 0, 2, 2)], 1);
    combat.add(t);
    let confirmed = 0;
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 }, onConfirm: () => void confirmed++ }));
    combat.resolve();
    expect(confirmed).toBe(1);
    const hit = events.find(([k]) => k === 'combat:hit')![1] as CombatEvents['combat:hit'];
    expect(hit).toMatchObject({ attackId: 'slash', attackerId: 'p', targetId: 'e', targetTeam: 'enemy', damage: 1, killed: true, hitStop: 4 });
  });

  it('removed combatants are no longer targets; clear() empties everything', () => {
    const { combat } = setup();
    const t = new Target('e', 'enemy', [box(0, 0, 2, 2)]);
    combat.add(t);
    combat.add(t); // adding twice is a no-op
    expect(combat.count).toBe(1);
    combat.remove(t);
    combat.submit(strike({ rect: { x0: 0, y0: 0, x1: 2, y1: 2 } }));
    combat.resolve();
    expect(t.hits).toHaveLength(0);
    combat.add(t);
    combat.clear();
    expect(combat.count).toBe(0);
  });

  it('is deterministic: the same submissions in the same order give the same hits', () => {
    const run = (): string => {
      const { combat, events } = setup();
      for (let i = 0; i < 6; i++) combat.add(new Target(`e${i}`, 'enemy', [box(i, 0, i + 1.5, 2)]));
      for (let t = 0; t < 4; t++) combat.submit(strike({ ownerId: `p${t}`, rect: { x0: t, y0: 0, x1: t + 2.2, y1: 2 } }));
      combat.resolve();
      return JSON.stringify(events);
    };
    expect(run()).toBe(run());
  });
});
