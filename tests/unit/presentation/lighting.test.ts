import { describe, expect, it } from 'vitest';
import { LIGHT_PULSES, LIGHT_RECIPES, LIGHT_STRENGTH, lightPeaks } from '@/content/lights';
import { VFX_BINDINGS } from '@/content/vfx';
import {
  collectLights,
  LIGHT_CONTRACT,
  LIGHT_KINDS,
  LightBook,
  lightCapacity,
  lightIssues,
  menaceOver,
  PULSE_CONTRACT,
  pulseCapacity,
  pulseIssues,
  pulseLevel,
  type LightBody,
  type LightFrame,
  type LightKind,
  type LightPulse,
} from '@/presentation/lighting';
import { viewY } from '@/presentation/worldTransform';

/**
 * THE LIGHT OF THE WORLD (docs/PROMPT8-LOG.md, phase I): which lights there are, where, how big and how strong; and the rules that keep them from costing the player the reading of the game. The contract is
 * measured against the DATA the game ships (`content/lights`), so a number changed there that breaks a rule fails here.
 */
const frame = (patch: Partial<LightFrame> = {}): LightFrame => ({ alpha: 1, hero: { x: 10, y: 0, dead: false, magic: 1 }, bodies: [], ...patch });
const gather = (f: LightFrame, capacity = 8): LightBook => {
  const book = new LightBook(capacity);
  book.begin();
  collectLights(f, LIGHT_RECIPES, LIGHT_STRENGTH, book);
  book.end();
  return book;
};
const names = (b: LightBook): string[] => b.sources.slice(0, b.count).map((s) => s.key);
const find = (b: LightBook, key: string) => b.sources.slice(0, b.count).find((s) => s.key === key);

const slime = (x: number, anim: string, phaseT = 0, id = 's1'): LightBody => ({ id, kind: 'enemy', view: { x, y: 0, prevX: x, prevY: 0, anim, phaseT, visible: true, opacity: 1 } });
const bolt = (x: number, prevX = x, id = 'b1'): LightBody => ({ id, kind: 'projectile', x, y: 1, prevX, prevY: 1 });
const warden = (patch: Partial<NonNullable<LightBody['view']>> = {}): LightBody => ({
  id: 'g1',
  kind: 'guardian',
  body: { height: 2.9 },
  view: { x: 20, y: 0, prevX: 20, prevY: 0, anim: 'idle', phaseT: 0, visible: true, opacity: 1, awake: true, enraged: false, attack: null, ...patch },
});

describe('the rules of the light', () => {
  it('the recipes and the strengths the game ships keep the contract', () => {
    expect(lightIssues(LIGHT_RECIPES, lightPeaks(), LIGHT_STRENGTH.duck)).toEqual([]);
  });

  it('say what is wrong with a recipe that breaks it', () => {
    const peaks = lightPeaks();
    expect(lightIssues({ ...LIGHT_RECIPES, hero: { ...LIGHT_RECIPES.hero, slot: 'accent' } }, peaks).join()).toMatch(/hero.*accent/);
    expect(lightIssues({ ...LIGHT_RECIPES, bolt: { ...LIGHT_RECIPES.bolt, radius: 20 } }, peaks).join()).toMatch(/bolt.*20 m wide/);
    expect(lightIssues({ ...LIGHT_RECIPES, foe: { ...LIGHT_RECIPES.foe, squash: 0 } }, peaks).join()).toMatch(/foe.*squashed/);
    expect(lightIssues(LIGHT_RECIPES, { ...peaks, hero: 0.9 }).join()).toMatch(/hero.*over its ceiling/);
    // a hero who stands in the three lights that are theirs at once must not be lost in white
    expect(lightIssues(LIGHT_RECIPES, { ...peaks, hero: 0.34, floor: 0.3, bolt: 0.62 }).join()).toMatch(/add up/);
    // the hero's light must give way to a warning (or it greys the violet) but never so far that the hero is lost
    expect(lightIssues(LIGHT_RECIPES, peaks, 0).join()).toMatch(/must stay violet/);
    expect(lightIssues(LIGHT_RECIPES, peaks, 0.95).join()).toMatch(/must stay seen/);
  });

  it('keep the hero\'s own lights among those the lowest profile draws, whatever else there is', () => {
    const low = [...LIGHT_KINDS].sort((a, b) => LIGHT_RECIPES[a].rank - LIGHT_RECIPES[b].rank).slice(0, lightCapacity('low'));
    expect([...low].sort()).toEqual(['bolt', 'floor', 'hero']);
  });

  it('draw fewer lights on a smaller profile and never more than the profile says', () => {
    expect([lightCapacity('low'), lightCapacity('medium'), lightCapacity('high')]).toEqual([3, 6, 8]);
    expect(lightCapacity('low')).toBeLessThan(lightCapacity('high'));
    expect([pulseCapacity('low'), pulseCapacity('medium'), pulseCapacity('high')]).toEqual([2, 3, 4]);
  });

  it('are in the hero\'s colour or the enemy\'s, and nothing else', () => {
    for (const kind of LIGHT_KINDS) expect(['energy', 'enemy']).toContain(LIGHT_RECIPES[kind].slot);
    expect(LIGHT_RECIPES.hero.slot).toBe('energy');
    expect(LIGHT_RECIPES.bolt.slot).toBe('energy');
    expect(LIGHT_RECIPES.foe.slot).toBe('enemy');
    expect(LIGHT_RECIPES.boss.slot).toBe('enemy');
  });
});

describe('the hero\'s light', () => {
  it('is a soft light about their chest and a pool on the floor under their feet, both cyan', () => {
    const book = gather(frame());
    expect(names(book)).toEqual(['hero', 'floor']);
    const hero = find(book, 'hero')!;
    const floor = find(book, 'floor')!;
    expect(hero.x).toBe(10);
    expect(hero.y).toBeCloseTo(viewY(0 + LIGHT_STRENGTH.heroRise), 9);
    expect(floor.y).toBeCloseTo(viewY(0), 9);
    expect(floor.squash).toBeLessThan(0.3); // lying on the ground
    expect(hero.slot).toBe('energy');
  });

  it('grows with their magic: the hero with the bolt ready is brighter than the one who is spent', () => {
    const spent = find(gather(frame({ hero: { x: 0, y: 0, dead: false, magic: 0 } })), 'hero')!;
    const full = find(gather(frame({ hero: { x: 0, y: 0, dead: false, magic: 1 } })), 'hero')!;
    const half = find(gather(frame({ hero: { x: 0, y: 0, dead: false, magic: 0.5 } })), 'hero')!;
    expect(spent.intensity).toBeCloseTo(LIGHT_STRENGTH.hero[0], 9);
    expect(full.intensity).toBeCloseTo(LIGHT_STRENGTH.hero[1], 9);
    expect(spent.intensity).toBeLessThan(half.intensity);
    expect(half.intensity).toBeLessThan(full.intensity);
    // a spent hero is still seen: the light never goes out while they live
    expect(spent.intensity).toBeGreaterThan(0.05);
  });

  it('the pool lies on the FLOOR under them, where they will land, and fades as they rise from it', () => {
    const at = (ground: number | null | undefined, y = 0) => find(gather(frame({ hero: { x: 10, y, dead: false, magic: 1, ...(ground === undefined ? {} : { ground }) } })), 'floor');
    const standing = at(undefined)!;
    expect(standing.y).toBeCloseTo(viewY(0), 9);
    // in the air, 1.5 m over a floor: the pool is on the floor and half as bright
    const air = at(0, 1.5)!;
    expect(air.y).toBeCloseTo(viewY(0), 9);
    expect(air.intensity).toBeCloseTo(standing.intensity * 0.5, 9);
    // high above it there is none, and over a pit there is none at all
    expect(at(0, LIGHT_CONTRACT.floorReach)).toBeUndefined();
    expect(at(0, 7)).toBeUndefined();
    expect(at(null, 0)).toBeUndefined();
    // the floor may be above the feet's old place (a platform): the pool is on IT
    expect(at(2.4, 2.4)!.y).toBeCloseTo(viewY(2.4), 9);
    // the light about them does not need a floor
    const pit = gather(frame({ hero: { x: 10, y: 0, dead: false, magic: 1, ground: null } }));
    expect(find(pit, 'hero')).toBeDefined();
  });

  it('goes out with them: a dead hero casts no light, and an out-of-range magic is held to 0–1', () => {
    expect(gather(frame({ hero: { x: 0, y: 0, dead: true, magic: 1 } })).count).toBe(0);
    expect(find(gather(frame({ hero: { x: 0, y: 0, dead: false, magic: 7 } })), 'hero')!.intensity).toBeCloseTo(LIGHT_STRENGTH.hero[1], 9);
    expect(find(gather(frame({ hero: { x: 0, y: 0, dead: false, magic: -3 } })), 'hero')!.intensity).toBeCloseTo(LIGHT_STRENGTH.hero[0], 9);
  });
});

describe('the hero\'s light gives way to a warning', () => {
  const at = (bodies: LightBody[], hero = { x: 10, y: 0, dead: false, magic: 1 }) => gather(frame({ bodies, hero }));
  const heroLight = (bodies: LightBody[]): number => find(at(bodies), 'hero')!.intensity;
  const floorLight = (bodies: LightBody[]): number => find(at(bodies), 'floor')!.intensity;

  it('an enemy that winds up near them takes the dark from it, as far as the wind-up has got', () => {
    const calm = heroLight([slime(14, 'idle')]);
    expect(calm).toBeCloseTo(LIGHT_STRENGTH.hero[1], 9);
    const half = heroLight([slime(14, 'telegraph', 0.5)]);
    const full = heroLight([slime(14, 'telegraph', 1)]);
    expect(half).toBeLessThan(calm);
    expect(full).toBeLessThan(half);
    expect(full).toBeCloseTo(LIGHT_STRENGTH.hero[1] * (1 - LIGHT_STRENGTH.duck), 9);
    // the pool under their feet gives way with it
    expect(floorLight([slime(14, 'telegraph', 1)])).toBeCloseTo(LIGHT_STRENGTH.floor[1] * (1 - LIGHT_STRENGTH.duck), 9);
  });

  it('a blow on its way takes all of it that a warning would at its end, and the hero is never put out', () => {
    expect(heroLight([slime(14, 'attack')])).toBeCloseTo(LIGHT_STRENGTH.hero[1] * (1 - LIGHT_STRENGTH.duck), 9);
    expect(heroLight([slime(14, 'attack')])).toBeGreaterThan(0.05);
    expect(menaceOver(frame({ bodies: [slime(14, 'telegraph', 0.3), slime(15, 'attack', 0, 'b')] }))).toBe(1);
  });

  it('only what is near enough counts: an enemy far away, one that merely stands there and one that dies leave the light alone', () => {
    const calm = heroLight([]);
    expect(heroLight([slime(10 + LIGHT_CONTRACT.menaceReach + 1, 'telegraph', 1)])).toBeCloseTo(calm, 9);
    expect(heroLight([slime(14, 'idle')])).toBeCloseTo(calm, 9);
    expect(heroLight([slime(14, 'death')])).toBeCloseTo(calm, 9);
    expect(menaceOver(frame())).toBe(0);
  });

  it('the guardian\'s blows cover the arena: it takes the dark from the hero from further away than an enemy does', () => {
    const farBoss = warden({ x: 10 + LIGHT_CONTRACT.menaceReach + 3, prevX: 10 + LIGHT_CONTRACT.menaceReach + 3, anim: 'telegraph', phaseT: 1 });
    expect(heroLight([farBoss])).toBeCloseTo(LIGHT_STRENGTH.hero[1] * (1 - LIGHT_STRENGTH.duck), 9);
    const tooFar = warden({ x: 10 + LIGHT_CONTRACT.bossReach + 1, prevX: 10 + LIGHT_CONTRACT.bossReach + 1, anim: 'telegraph', phaseT: 1 });
    expect(heroLight([tooFar])).toBeCloseTo(LIGHT_STRENGTH.hero[1], 9);
  });

  it('it is the warning that decides, not the wake: a guardian that is only awake leaves the hero\'s light as it is', () => {
    expect(heroLight([warden()])).toBeCloseTo(LIGHT_STRENGTH.hero[1], 9);
  });
});

describe('the light of what flies and what fights', () => {
  it('a bolt in flight lights the room along its way: one light per bolt, at its interpolated place', () => {
    const book = gather(frame({ alpha: 0.5, bodies: [bolt(14, 12), bolt(30, 28, 'b2')] }));
    const a = find(book, 'bolt:b1')!;
    expect(a.kind).toBe('bolt');
    expect(a.x).toBeCloseTo(13, 9); // halfway between its last tick and this one
    expect(a.y).toBeCloseTo(viewY(1), 9);
    expect(a.intensity).toBe(LIGHT_STRENGTH.bolt);
    expect(find(book, 'bolt:b2')).toBeDefined();
  });

  it('an enemy has a faint violet light awake, which swells as it prepares a blow and is strongest as it strikes', () => {
    const light = (anim: string, t = 0): number => find(gather(frame({ bodies: [slime(14, anim, t)] })), 'foe:s1')!.intensity;
    const f = LIGHT_STRENGTH.foe;
    expect(light('idle')).toBeCloseTo(f.awake, 9);
    expect(light('telegraph', 0)).toBeCloseTo(f.telegraph[0], 9);
    expect(light('telegraph', 1)).toBeCloseTo(f.telegraph[1], 9);
    expect(light('telegraph', 0.5)).toBeGreaterThan(light('telegraph', 0.1));
    expect(light('attack')).toBeCloseTo(f.strike, 9);
    expect(light('telegraph', 1)).toBeGreaterThan(light('idle'));
    expect(find(gather(frame({ bodies: [slime(14, 'idle')] })), 'foe:s1')!.slot).toBe('enemy');
    // one that is dying gives none
    expect(find(gather(frame({ bodies: [slime(14, 'death')] })), 'foe:s1')).toBeUndefined();
  });

  it('the guardian is a big violet light: asleep a glimmer, awake more, enraged more, and a blow in the making or on its way adds', () => {
    const light = (patch: Partial<NonNullable<LightBody['view']>>): number => find(gather(frame({ bodies: [warden(patch)] })), 'boss:g1')!.intensity;
    const b = LIGHT_STRENGTH.boss;
    expect(light({ awake: false })).toBeCloseTo(b.asleep, 9);
    expect(light({})).toBeCloseTo(b.awake, 9);
    expect(light({ enraged: true })).toBeCloseTo(b.enraged, 9);
    expect(light({ anim: 'telegraph', phaseT: 1 })).toBeCloseTo(b.awake + b.telegraph, 9);
    expect(light({ anim: 'attack' })).toBeCloseTo(b.awake + b.strike, 9);
    expect(light({ enraged: true, anim: 'telegraph', phaseT: 1 })).toBeLessThanOrEqual(LIGHT_CONTRACT.maxIntensity.boss);
    const big = find(gather(frame({ bodies: [warden()] })), 'boss:g1')!;
    expect(big.radius).toBeGreaterThan(LIGHT_RECIPES.hero.radius);
    expect(big.y).toBeCloseTo(viewY(2.9 * 0.55), 9); // about its middle
  });

  it('things that are hidden, or far away, or not light at all, cast none', () => {
    const hidden: LightBody = { id: 'h', kind: 'enemy', view: { x: 12, y: 0, prevX: 12, prevY: 0, anim: 'idle', phaseT: 0, visible: false, opacity: 1 } };
    const faded: LightBody = { id: 'f', kind: 'enemy', view: { x: 12, y: 0, prevX: 12, prevY: 0, anim: 'idle', phaseT: 0, visible: true, opacity: 0 } };
    const far = slime(10 + LIGHT_CONTRACT.reach + 1, 'telegraph', 1, 'far');
    const pickup: LightBody = { id: 'p', kind: 'pickup' };
    const dummy: LightBody = { id: 'd', kind: 'dummy', view: { x: 12, y: 0, prevX: 12, prevY: 0, anim: 'idle', phaseT: 0, visible: true, opacity: 1 } };
    expect(names(gather(frame({ bodies: [hidden, faded, far, pickup, dummy, bolt(10 + LIGHT_CONTRACT.reach + 5)] })))).toEqual(['hero', 'floor']);
  });
});

describe('what a profile can draw', () => {
  const crowd: LightBody[] = [bolt(14), warden(), slime(13, 'telegraph', 0.5, 'a'), slime(15, 'idle', 0, 'b'), slime(16, 'attack', 0, 'c'), slime(17, 'idle', 0, 'd')];

  it('keeps the lights that matter most: the hero\'s and the bolt\'s before the guardian\'s and the enemies\'', () => {
    expect(names(gather(frame({ bodies: crowd }), 3)).sort()).toEqual(['bolt:b1', 'floor', 'hero']);
    const six = names(gather(frame({ bodies: crowd }), 6));
    expect(six).toHaveLength(6);
    expect(six).toContain('boss:g1');
    // the enemies come last: with room for six, the first of them that do fit are the first to arrive
    expect(six.filter((k) => k.startsWith('foe:'))).toEqual(['foe:a', 'foe:b']);
  });

  it('never has more than its capacity, however many things there are', () => {
    const many = Array.from({ length: 30 }, (_, i) => slime(10 + (i % 8), 'idle', 0, `m${i}`));
    for (const capacity of [3, 6, 8]) expect(gather(frame({ bodies: many }), capacity).count).toBeLessThanOrEqual(capacity);
  });

  it('is made once: filling a book again allocates nothing (the same objects are reused)', () => {
    const book = new LightBook(8);
    const before = book.sources.slice();
    for (let i = 0; i < 50; i++) {
      book.begin();
      collectLights(frame({ bodies: crowd }), LIGHT_RECIPES, LIGHT_STRENGTH, book);
      book.end();
    }
    expect(book.sources).toHaveLength(before.length);
    expect(book.sources.every((s) => before.includes(s))).toBe(true);
  });

  it('holds every light under the ceiling of its kind', () => {
    const book = gather(frame({ bodies: [...crowd, warden({ enraged: true, anim: 'telegraph', phaseT: 1 })] }));
    for (const s of book.sources.slice(0, book.count)) expect(s.intensity, s.key).toBeLessThanOrEqual(LIGHT_CONTRACT.maxIntensity[s.kind as LightKind]);
  });
});

describe('the light a moment leaves', () => {
  const p: LightPulse = { slot: 'energy', radius: 3, peak: 0.4, life: 1, rise: 0.25 };

  it('swells to its peak and falls to nothing: dark at birth, brightest at its peak, out at the end', () => {
    expect(pulseLevel(p, 0)).toBe(0);
    expect(pulseLevel(p, 0.25)).toBeCloseTo(0.4, 9);
    expect(pulseLevel(p, 0.125)).toBeCloseTo(0.1, 9); // squared on the way up
    expect(pulseLevel(p, 0.625)).toBeGreaterThan(0);
    expect(pulseLevel(p, 0.625)).toBeLessThan(0.4);
    expect(pulseLevel(p, 1)).toBe(0);
    expect(pulseLevel(p, 5)).toBe(0);
    expect(pulseLevel(p, -1)).toBe(0);
    // it only ever comes down after its peak
    let last = Infinity;
    for (let t = 0.26; t < 1; t += 0.05) {
      const v = pulseLevel(p, t);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });

  it('the ones the game ships keep the contract, and are bound to triggers that exist', () => {
    expect(pulseIssues(LIGHT_PULSES)).toEqual([]);
    for (const trigger of Object.keys(LIGHT_PULSES)) expect(Object.keys(VFX_BINDINGS), trigger).toContain(trigger);
  });

  it('say what is wrong with one that breaks it', () => {
    expect(pulseIssues({ hitLanded: [{ ...p, peak: 0.95 }] }).join()).toMatch(/peaks at 0.95/);
    expect(pulseIssues({ hitLanded: [{ ...p, radius: 30 }] }).join()).toMatch(/30 m wide/);
    expect(pulseIssues({ hitLanded: [{ ...p, life: 9 }] }).join()).toMatch(/lasts 9 s/);
    expect(pulseIssues({ hitLanded: [{ ...p, rise: 1 }] }).join()).toMatch(/neither included/);
    expect(pulseIssues({ hitLanded: [{ ...p, slot: 'accent' }] }).join()).toMatch(/accent/);
    expect(pulseIssues({ hitLanded: [p, p, p] }).join()).toMatch(/at most 2/);
  });

  it('the moments of the game that leave light are the ones the player feels: a blow, a bolt, a place, a guardian', () => {
    for (const t of ['hitLanded', 'boltCast', 'boltImpact', 'checkpoint', 'abilityGained', 'sealBroken', 'bossWake', 'bossStrike', 'bossDefeated', 'enemyDied', 'playerDied'] as const) expect(LIGHT_PULSES[t], t).toBeDefined();
    // the biggest moments are the biggest lights
    const peak = (t: keyof typeof LIGHT_PULSES): number => LIGHT_PULSES[t]![0]!.radius;
    expect(peak('sealBroken')).toBeGreaterThan(peak('hitLanded'));
    expect(peak('bossDefeated')).toBeGreaterThan(peak('bossStrike'));
    expect(peak('abilityGained')).toBeGreaterThan(peak('boltCast'));
    expect(PULSE_CONTRACT.maxPeak).toBeLessThan(0.7);
  });
});
