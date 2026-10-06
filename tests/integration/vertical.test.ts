import { describe, expect, it } from 'vitest';
import { digestOf, record } from '../../tools/e2e/replay';
import type { Enemy } from '@/enemies/Enemy';
import type { Driver } from '../helpers/sim';
import { freshR1, playDefeat, playWin, toTheCard } from '../helpers/vertical';

/**
 * R1 COMPLETE (docs/PROMPT5-LOG.md S19), on the pure simulation: the first room of the vertical slice played end to end with every
 * system of Prompt 5 — the crawl tunnel, the CARD taken by interacting, the Spirit Bolt and its magic, a BOTTLE drunk to heal, the
 * slime beaten, the door, the exit — and lost once on purpose to see what a defeat keeps. The browser replays these very scripts
 * through the real keyboard and compares digests (tools/e2e/scenarios/vertical.ts); here they are asserted on directly.
 */
function events(d: Driver): string[] {
  const log: string[] = [];
  const bus = d.session.bus;
  bus.on('interaction:available', (e) => log.push(`available:${e.id}`));
  bus.on('interaction:performed', (e) => log.push(`performed:${e.id}`));
  bus.on('interaction:lost', (e) => log.push(`lost:${e.id}`));
  bus.on('card:changed', (e) => log.push(`card:${e.type}:${e.cardId}`));
  bus.on('skill:cast', (e) => log.push(`cast:${e.skillId}:${e.cost}`));
  bus.on('skill:denied', (e) => log.push(`denied:${e.skillId}`));
  bus.on('bottle:drinkStarted', (e) => log.push(`drinking:${e.slot}`));
  bus.on('bottle:drunk', (e) => log.push(`drunk:${e.slot}:+${e.healed}`));
  bus.on('player:hurt', () => log.push('hurt'));
  bus.on('flag:set', (e) => log.push(`flag:${e.flag}`));
  bus.on('gate:changed', (e) => log.push(`gate:${e.gateId}:${e.open ? 'open' : 'shut'}`));
  bus.on('exit:reached', (e) => log.push(`exit:${e.exitId}`));
  bus.on('death:started', () => log.push('death'));
  bus.on('death:respawned', () => log.push('respawned'));
  return log;
}

const bottleStates = (d: Driver): string[] => d.session.bottles.slots.map((s) => s.state);
const slimes = (d: Driver): Enemy[] => d.session.entities.filter((e) => e.kind === 'enemy') as Enemy[];

describe('R1 complete: the win', () => {
  const d = freshR1();
  const log = events(d);
  it('starts with no card, a full bar, three bottles and nothing to interact with', () => {
    expect(d.session.loadout.equipped).toBeNull();
    expect(d.session.abilities.has('magic_attack')).toBe(false);
    expect(d.session.magic.current).toBe(100);
    expect(bottleStates(d)).toEqual(['ready', 'ready', 'ready']);
    expect(d.session.interaction.current).toBeNull();
    expect(d.p.health.current).toBe(5);
  });

  it('plays the room: the card, two bolts, a bottle, the door, the exit', () => {
    playWin(d);
    expect(d.session.exitsReached.has('east')).toBe(true);
    expect(d.session.gateOpen('exit_door')).toBe(true);
  });

  it('the card was taken by INTERACTING (icon first, then the press) and the world remembers it', () => {
    expect(log.indexOf('available:card_spirit_bolt')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('performed:card_spirit_bolt')).toBeGreaterThan(log.indexOf('available:card_spirit_bolt'));
    expect(log).toContain('card:equipped:card_spirit_bolt');
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    expect(d.session.flags.has('taken:card_spirit_bolt')).toBe(true);
    expect(log.filter((e) => e === 'performed:card_spirit_bolt')).toHaveLength(1);
  });

  it('two Spirit Bolts beat the slime (3 life, 2 damage each) and each costs exactly 30', () => {
    expect(log.filter((e) => e.startsWith('cast:'))).toEqual(['cast:spirit_bolt:30', 'cast:spirit_bolt:30']);
    expect(log.filter((e) => e.startsWith('denied:'))).toEqual([]);
    expect(d.session.flags.has('defeated:r1_slime')).toBe(true);
    expect(slimes(d)).toHaveLength(0);
    expect(d.session.magic.current).toBeGreaterThanOrEqual(40);
    expect(d.session.magic.current).toBeLessThanOrEqual(100);
  });

  it('the slime opened the door (and not before): the gate opens when the guardian falls — after the bolts, before the exit', () => {
    const door = log.indexOf('gate:exit_door:open');
    expect(log).toContain('flag:defeated:r1_slime');
    expect(door).toBeGreaterThan(log.lastIndexOf('cast:spirit_bolt:30'));
    expect(log.indexOf('exit:east')).toBeGreaterThan(door);
    expect(log.filter((e) => e === 'gate:exit_door:open')).toHaveLength(1);
  });

  it('a bottle healed the hit: one drunk, one point back, and it recharges while two stay full', () => {
    expect(log.filter((e) => e.startsWith('drunk:'))).toEqual(['drunk:0:+1']);
    expect(log.indexOf('drinking:0')).toBeGreaterThan(log.indexOf('hurt'));
    expect(d.p.health.current).toBe(5);
    expect(bottleStates(d)).toEqual(['recharging', 'ready', 'ready']);
  });

  it('never died, never refused', () => {
    expect(log).not.toContain('death');
    expect(d.p.health.dead).toBe(false);
  });
});

describe('R1 complete: the defeat', () => {
  const d = freshR1();
  const log = events(d);
  playDefeat(d);

  it('lost to the slime and came back at the entrance with full life and magic', () => {
    expect(log.filter((e) => e === 'death')).toHaveLength(1);
    expect(log.filter((e) => e === 'respawned')).toHaveLength(1);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(5);
    expect(d.session.magic.current).toBe(100);
    expect(Math.abs(d.body.x - 4)).toBeLessThan(0.2);
  });

  it('what was found STAYS found: the card is still equipped and its flag remembered', () => {
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    expect(d.session.flags.list()).toEqual(['taken:card_spirit_bolt']);
  });

  it('the bottle is NOT refilled: its recharge is slow on purpose', () => {
    expect(log.filter((e) => e.startsWith('drunk:'))).toHaveLength(1);
    expect(bottleStates(d)).toEqual(['recharging', 'ready', 'ready']);
  });

  it('the world resets: the slime is back at full life and the door is shut', () => {
    expect(slimes(d)).toHaveLength(1);
    expect(slimes(d)[0]!.health.current).toBe(3);
    expect(d.session.gateOpen('exit_door')).toBe(false);
    expect(d.session.exitsReached.size).toBe(0);
  });

  it('the card is not lying in the tunnel again: nothing has the icon where it was', () => {
    d.teleport(73.4, 0);
    d.step(5);
    expect(d.session.interaction.current).toBeNull();
  });
});

describe('R1 complete: determinism', () => {
  it('the same run twice leaves the same key presses and the same digest of the whole simulation every 50 ticks', () => {
    const a = freshR1();
    const b = freshR1();
    const ra = record(a, () => playWin(a));
    const rb = record(b, () => playWin(b));
    expect(ra.total).toBe(rb.total);
    expect(ra.runs).toEqual(rb.runs);
    expect(ra.digests).toEqual(rb.digests);
    expect(ra.digests.length).toBeGreaterThan(20);
    expect(digestOf(a.session)).toBe(digestOf(b.session));
  });

  it('the digest sees the new layer: it changes when the card is taken, a bolt is cast and a bottle is drunk', () => {
    const d = freshR1();
    toTheCard(d);
    const before = digestOf(d.session);
    expect(before).toContain('a' + 'card_spirit_bolt'); // the object with the icon
    d.tap('interact');
    d.step(14);
    const withCard = digestOf(d.session);
    expect(withCard).not.toBe(before);
    expect(withCard).toContain('ccard_spirit_bolt');
    expect(withCard).toContain('m100.000000');
    d.tap('ability');
    d.step(8);
    expect(digestOf(d.session)).toContain('m70.000000');
  });

  it('the defeat run is deterministic too', () => {
    const a = freshR1();
    const b = freshR1();
    const ra = record(a, () => playDefeat(a));
    const rb = record(b, () => playDefeat(b));
    expect(ra.digests).toEqual(rb.digests);
    expect(ra.total).toBeGreaterThan(1000);
  });
});
