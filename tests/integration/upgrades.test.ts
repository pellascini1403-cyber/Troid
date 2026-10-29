import { describe, expect, it } from 'vitest';
import { UPGRADES } from '@/content/upgrades';
import { ground, block, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { spawnDummy, strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * THE VESSELS AND THE RELICS OF docs/PROMPT21-LOG.md, through the simulation. A vessel is a flag the pickup sets, and the size of the bars is DERIVED from the flags that are set — in a game that is loaded and in one that is played;
 * a relic is a passive ability, one `has(…)` where it matters. Each one changes what the hero does, and the hero without it does what they always did.
 */
function room(): RoomDefinition {
  return {
    id: 'relics', regionId: 't', name: 'relics', bounds: rect(-5, -20, 200, 40), killY: -30,
    entries: [{ id: 's', x: 10, y: 0 }],
    solids: [ground('a', -5, 200), block('wl', -7, -20, -5, 40)],
  };
}

function hero(abilities: string[] = ['dash'], flags: string[] = []): Driver {
  const d = driver({ room: room(), unlocked: abilities, extra: { upgrades: UPGRADES, flags } });
  d.step(20);
  return d;
}

describe('the vessels', () => {
  it('a new game has the bars it was made with: 5 points of life, 100 units of magic', () => {
    const d = hero();
    expect(d.p.health.max).toBe(5);
    expect(d.session.magic.max).toBe(100);
  });

  it('a game that begins with vessels already taken has bigger bars, full: it is a loaded one', () => {
    const d = hero(['dash'], ['taken:life_1', 'taken:life_2', 'taken:mana_1']);
    expect(d.p.health.max).toBe(7);
    expect(d.p.health.current).toBe(7);
    expect(d.session.magic.max).toBe(120);
    expect(d.session.magic.current).toBe(120);
  });

  it('a vessel taken in play makes the bar bigger and fills the part it added — and no more than that', () => {
    const d = hero();
    d.p.health.damage(2);
    d.session.magic.spend(50);
    d.session.flags.set('taken:life_3');
    d.session.flags.set('taken:mana_2');
    expect(d.p.health.max).toBe(6);
    expect(d.p.health.current, '3 + the new point').toBe(4);
    expect(d.session.magic.max).toBe(120);
    expect(d.session.magic.current, '50 + the new 20').toBe(70);
  });

  it('every vessel counts once: the flag set twice is the same flag, and one that is not in the list changes nothing', () => {
    const d = hero();
    d.session.flags.set('taken:life_1');
    d.session.flags.set('taken:life_1');
    d.session.flags.set('taken:something_else');
    expect(d.p.health.max).toBe(6);
  });

  it('all of them together: 14 points of life and 200 units of magic (10 and 160 with the vessels of the first half)', () => {
    const d = hero(['dash'], UPGRADES.map((u) => u.flag));
    expect(d.p.health.max).toBe(14);
    expect(d.session.magic.max).toBe(200);
    const first = hero(['dash'], UPGRADES.map((u) => u.flag).filter((f) => !/^taken:(life_[6-9]|mana_[45])$/.test(f)));
    expect(first.p.health.max).toBe(10);
    expect(first.session.magic.max).toBe(160);
  });

  it('a defeat brings the hero back with the bars full at their size', () => {
    const d = hero(['dash'], ['taken:life_1', 'taken:mana_1']);
    d.p.health.damage(4);
    d.session.magic.spend(100);
    d.session.rest('s');
    expect(d.p.health.current).toBe(6);
    expect(d.session.magic.current).toBe(120);
  });
});

describe('Keen Edge: a blow of the sword hits for one more', () => {
  const swing = (abilities: string[]): number => {
    const d = hero(abilities);
    const dummy = spawnDummy(d, { x: d.body.x + 1.1, y: 0, health: 20 });
    d.tap('attack');
    d.step(20);
    return 20 - dummy.health.current;
  };
  it('2 instead of 1', () => {
    expect(swing(['dash'])).toBe(1);
    expect(swing(['dash', 'relic_edge'])).toBe(2);
  });
});

describe('Siphon Bead: a blow that lands gives magic back', () => {
  it('8 units for each, up to the size of the bar; a blow in the air hits nothing and gives nothing', () => {
    const run = (abilities: string[]): number => {
      const d = hero(abilities);
      d.session.magic.spend(60);
      const before = d.session.magic.current;
      spawnDummy(d, { x: d.body.x + 1.1, y: 0, health: 20 });
      d.tap('attack');
      d.step(14);
      return d.session.magic.current - before;
    };
    expect(run(['dash'])).toBeLessThan(2); // (the slow regeneration of a second)
    expect(run(['dash', 'relic_siphon'])).toBeGreaterThanOrEqual(8);
    const empty = hero(['dash', 'relic_siphon']);
    empty.session.magic.spend(60);
    const b = empty.session.magic.current;
    empty.tap('attack');
    empty.step(14);
    expect(empty.session.magic.current - b).toBeLessThan(2);
  });
});

describe('Swift Sash: the dash is ready again sooner', () => {
  const cooldown = (abilities: string[]): number => {
    const d = hero(abilities);
    d.tap('dash');
    d.until(() => !d.p.controller.dashing, 30);
    d.step(1);
    let ticks = 0;
    while (d.p.controller.dashCooldown01 > 0 && ticks < 120) {
      d.step(1);
      ticks++;
    }
    return ticks;
  };
  it('0.6 of the time', () => {
    const slow = cooldown(['dash']);
    const fast = cooldown(['dash', 'relic_swift']);
    expect(slow).toBeGreaterThanOrEqual(24);
    expect(fast).toBeLessThan(slow * 0.7);
    expect(fast).toBeGreaterThan(slow * 0.5);
  });
});

describe('Warding Thread: the hero stays untouchable longer after a hit', () => {
  const guard = (abilities: string[]): number => {
    const d = hero(abilities);
    strikeOnPlayer(d);
    d.step(1);
    let ticks = 0;
    while (d.p.controller.isInvulnerable && ticks < 400) {
      d.step(1);
      ticks++;
    }
    return ticks;
  };
  it('1.6 times as long', () => {
    const base = guard(['dash']);
    const warded = guard(['dash', 'relic_ward']);
    expect(base).toBeGreaterThan(50);
    expect(warded).toBeGreaterThan(base * 1.5);
    expect(warded).toBeLessThan(base * 1.7);
  });
});

describe('Strong Brew: a bottle heals one point more', () => {
  const drink = (abilities: string[]): number => {
    const d = hero(abilities);
    d.p.health.damage(4);
    const before = d.p.health.current;
    d.tap('bottle');
    d.step(30);
    return d.p.health.current - before;
  };
  it('3 instead of 2', () => {
    expect(drink(['dash'])).toBe(2);
    expect(drink(['dash', 'relic_brew'])).toBe(3);
  });
});

describe('Piercing Ink: the Spirit Bolt goes through two enemies', () => {
  const kills = (abilities: string[]): number => {
    const d = hero(abilities);
    d.session.loadout.acquire('card_spirit_bolt');
    d.step(2);
    const row = [4, 6, 8, 10].map((dx) => spawnDummy(d, { x: d.body.x + dx, y: 0, health: 2 }));
    d.tap('ability');
    d.step(60);
    return row.filter((x) => x.health.dead).length;
  };
  it('without it the bolt ends on the first; with it, on the third', () => {
    expect(kills(['dash'])).toBe(1);
    expect(kills(['dash', 'relic_pierce'])).toBe(3);
  });
});
