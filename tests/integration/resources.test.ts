import { describe, expect, it } from 'vitest';
import { driver } from '../helpers/sim';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import type { GameEvents } from '@/gameplay/events';
import { R1_GATE_ROOM } from '@/content/rooms/r1Gate';

/**
 * The player's resources inside the session (docs/GAME-SPEC-2D.md §9.2, §10, §11): they start as the design says, they tick
 * with the simulation (and only with it), a defeat refills life and magic but NOT the bottles, and the HUD reads them through
 * one reusable snapshot.
 */
function setup() {
  const d = driver();
  const events: Array<[string, unknown]> = [];
  for (const k of ['magic:changed', 'bottle:changed', 'card:changed'] as const) d.session.bus.on(k, (e) => void events.push([k, e]));
  return { d, s: d.session, events };
}

describe('the resources at the start', () => {
  it('magic is 100 / 100, three bottles are ready, and the hero has NO card (there is no initial ability)', () => {
    const { s } = setup();
    expect([s.magic.current, s.magic.max]).toEqual([100, 100]);
    expect(s.bottles.slots.map((b) => b.state)).toEqual(['ready', 'ready', 'ready']);
    expect(s.loadout.equipped).toBeNull();
    expect(s.loadout.owned).toEqual([]);
    expect(s.player.health.max).toBe(5);
  });
});

describe('they live in the simulation clock', () => {
  it('the magic regenerates 6 per second after 1 s while the simulation runs', () => {
    const { d, s } = setup();
    s.magic.spend(30);
    d.step(60);
    expect(s.magic.current).toBe(70);
    d.step(120);
    expect(s.magic.current).toBeCloseTo(82, 9);
  });

  it('a bottle recharges in 3600 ticks of the simulation', () => {
    const { d, s } = setup();
    s.bottles.consume(0);
    d.step(3599);
    expect(s.bottles.slots[0]?.state).toBe('recharging');
    d.step(1);
    expect(s.bottles.slots[0]?.state).toBe('ready');
  });

  it('a hit-stop freezes them with the rest of the world: nothing regenerates or recharges while it lasts', () => {
    const { d, s } = setup();
    s.magic.spend(30);
    s.bottles.consume(0);
    d.step(60); // the magic delay is over
    s.requestHitStop(10);
    const progress = s.bottles.slots[0]?.progress;
    const magic = s.magic.current;
    d.step(10);
    expect(s.magic.current).toBe(magic);
    expect(s.bottles.slots[0]?.progress).toBe(progress);
    d.step(1);
    expect(s.magic.current).toBeGreaterThan(magic);
  });

  it('magic and bottles are independent: spending one never touches the other', () => {
    const { d, s } = setup();
    s.magic.spend(100);
    expect(s.bottles.readyCount).toBe(3);
    s.magic.restore();
    s.bottles.consume(1);
    d.step(30);
    expect(s.magic.current).toBe(100);
    s.magic.spend(40);
    expect(s.bottles.slots.map((b) => b.state)).toEqual(['ready', 'recharging', 'ready']);
  });
});

describe('a defeat', () => {
  it('refills life and magic and does NOT refill the bottles (their recharge is slow on purpose)', () => {
    const { d, s } = setup();
    s.magic.spend(70);
    s.bottles.consume(0);
    s.bottles.consume(1);
    d.step(300);
    const progress = s.bottles.slots[0]?.progress as number;
    expect(progress).toBeGreaterThan(0);
    s.player.health.damage(5);
    s.bus.emit('player:died', { x: 0, y: 0 });
    d.until(() => s.death.phase === 'none' && !s.player.health.dead && s.now > 200, 600);
    expect(s.player.health.current).toBe(5);
    expect(s.magic.current).toBe(100);
    expect(s.bottles.slots.map((b) => b.state)).toEqual(['recharging', 'empty', 'ready']);
    expect(s.bottles.slots[0]?.progress).toBeGreaterThanOrEqual(progress); // it went on counting: nothing was reset
  });

  it('loading a room is always entering alive: life and magic come back full there too', () => {
    const { s } = setup();
    s.magic.spend(50);
    s.player.health.damage(5);
    expect(s.player.health.dead).toBe(true);
    s.loadRoom(s.room.id);
    expect(s.player.health.dead).toBe(false);
    expect(s.magic.current).toBe(100);
  });

  it('a card, once acquired, is not lost by dying (dying costs nothing in the first version)', () => {
    const { d, s } = setup();
    s.loadout.acquire('card_spirit_bolt');
    s.player.health.damage(5);
    s.bus.emit('player:died', { x: 0, y: 0 });
    d.until(() => s.death.phase === 'none' && !s.player.health.dead && s.now > 200, 600);
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });
});

describe('events', () => {
  it('magic:changed on every spend and about once per unit regained', () => {
    const { d, s, events } = setup();
    s.magic.spend(30);
    d.step(60 + 60);
    const changes = events.filter(([k]) => k === 'magic:changed').map(([, e]) => e as GameEvents['magic:changed']);
    expect(changes[0]).toMatchObject({ current: 70, delta: -30, reason: 'spend' });
    expect(changes.filter((c) => c.reason === 'regen').length).toBeGreaterThanOrEqual(5);
  });

  it('bottle:changed says what happened and the state of every slot afterwards (the HUD pops the right vial)', () => {
    const { s, events } = setup();
    s.bottles.consume(0);
    const used = events.find(([k]) => k === 'bottle:changed')?.[1] as GameEvents['bottle:changed'];
    expect(used).toMatchObject({ type: 'used', slot: 0 });
    expect(used.states).toEqual(['empty', 'ready', 'ready']);
    const last = events.filter(([k]) => k === 'bottle:changed').at(-1)?.[1] as GameEvents['bottle:changed'];
    expect(last).toMatchObject({ type: 'recharging', slot: 0, states: ['recharging', 'ready', 'ready'] });
  });

  it('card:changed on acquiring and equipping', () => {
    const { s, events } = setup();
    s.loadout.acquire('card_spirit_bolt');
    expect(events.filter(([k]) => k === 'card:changed').map(([, e]) => e)).toEqual([
      { type: 'acquired', cardId: 'card_spirit_bolt' },
      { type: 'equipped', cardId: 'card_spirit_bolt' },
    ]);
  });
});

describe('the status snapshot the HUD reads', () => {
  it('has life, magic, the (empty) card slot and the bottles, as plain numbers', () => {
    const { s } = setup();
    const st = s.status();
    expect(st.life).toEqual({ current: 5, max: 5 });
    expect(st.magic).toEqual({ current: 100, max: 100, regenerating: false });
    expect(st.card.equipped).toBe(false);
    expect(st.bottles.map((b) => [b.state, b.fill01])).toEqual([['ready', 1], ['ready', 1], ['ready', 1]]);
    expect(st.bottles[0]?.iconId).toBe('bottle');
    expect(st.bottleUseful).toBe(false); // full life: drinking would not help
  });

  it('follows the game: damage, spent magic, a drunk bottle, a card', () => {
    const { d, s } = setup();
    s.player.health.damage(2);
    s.magic.spend(30);
    s.bottles.consume(0);
    s.loadout.acquire('card_spirit_bolt');
    d.step(30);
    const st = s.status();
    expect(st.life.current).toBe(3);
    expect(st.magic.current).toBe(70);
    expect(st.magic.regenerating).toBe(false); // still inside the 1 s delay
    expect(st.bottles[0]?.state).toBe('recharging');
    expect(st.bottles[0]?.fill01).toBeCloseTo(30 / 3600, 9);
    expect(st.card).toMatchObject({ equipped: true, id: 'card_spirit_bolt', iconId: 'spirit_bolt', nameKey: 'card.spiritBolt.name', state: 'ready' });
    expect(st.bottleUseful).toBe(true); // hurt, and two bottles are ready
    d.step(60);
    expect(s.status().magic.regenerating).toBe(true);
  });

  it('the chip is only useful while a bottle is ready AND life is below the maximum AND the hero is alive', () => {
    const { s } = setup();
    expect(s.status().bottleUseful).toBe(false);
    s.player.health.damage(1);
    expect(s.status().bottleUseful).toBe(true);
    for (let i = 0; i < 3; i++) s.bottles.consume(i);
    expect(s.status().bottleUseful).toBe(false); // none ready
    s.bottles.refillAll();
    s.player.health.damage(10);
    expect(s.status().bottleUseful).toBe(false); // dead
  });

  it('is written into the object it is given: no allocation in steady state', () => {
    const { d, s } = setup();
    const out = createPlayerStatus();
    expect(s.status(out)).toBe(out);
    const refs = [out.life, out.magic, out.card, out.bottles, out.bottles[0]];
    d.step(10);
    s.bottles.consume(1);
    s.status(out);
    expect([out.life, out.magic, out.card, out.bottles, out.bottles[0]]).toEqual(refs);
    expect([out.life, out.magic, out.card, out.bottles, out.bottles[0]].every((x, i) => x === refs[i])).toBe(true);
  });

  it('a fourth bottle appears in the snapshot', () => {
    const { s } = setup();
    s.bottles.addSlot('energy_bottle');
    expect(s.status().bottles).toHaveLength(4);
  });
});

describe('the resources exist in every room', () => {
  it('R1 starts with the same resources as the playground (they belong to the player, not to the room)', () => {
    const d = driver({ room: R1_GATE_ROOM });
    expect(d.session.magic.current).toBe(100);
    expect(d.session.bottles.count).toBe(3);
  });
});

describe('determinism', () => {
  it('the same spends and drinks at the same ticks give the same resources, bit for bit', () => {
    const run = () => {
      const { d, s } = setup();
      const out: number[] = [];
      for (let i = 0; i < 2400; i++) {
        if (i === 10 || i === 700) s.magic.spend(30);
        if (i === 20) s.bottles.consume(0);
        if (i === 90) s.bottles.consume(2);
        d.step(1);
        if (i % 100 === 0) out.push(s.magic.current, s.bottles.slots[0]?.progress ?? -1, s.bottles.slots[1]?.progress ?? -1, s.bottles.slots[2]?.progress ?? -1);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
