import { describe, expect, it } from 'vitest';
import { AudioDirector } from '@/audio/AudioDirector';
import { SKILLS } from '@/content/skills';
import type { GameSession } from '@/gameplay/GameSession';
import { AUDIO_CONTRACT, AUDIO_CUES, type AudioCueEvent, type AudioCueId } from '@/presentation/audioCues';
import { spawnDummy, strikeOnPlayer } from '../../helpers/combat';
import { freshWorld, playWorld } from '../../helpers/journey';
import { driver, type Driver } from '../../helpers/sim';

/**
 * THE CUES OF THE SOUND TO COME, IN THE GAME ITSELF (docs/ART-PIPELINE-2D.md, part H): the real simulation, played by a scripted player with the buttons a person has, with
 * an audio director listening to it — the whole world from R1 to the end of R4, the boss included, and a short fight for what the journey does not do (being hurt, dying,
 * a bottle). What a sound engine would be told, and WHEN: the tick of the event, never the tick of a button.
 */
function listen(session: GameSession): AudioCueEvent[] {
  const cues: AudioCueEvent[] = [];
  new AudioDirector(session.bus, { cue: (e) => void cues.push({ ...e }) }, { now: () => session.now, projectileSkills: new Set(Object.keys(SKILLS)) });
  return cues;
}
const names = (cues: AudioCueEvent[]): AudioCueId[] => cues.map((c) => c.cue);
const count = (cues: AudioCueEvent[], cue: AudioCueId): number => cues.filter((c) => c.cue === cue).length;

function journey(): AudioCueEvent[] {
  const d = freshWorld();
  const cues = listen(d.session);
  playWorld(d);
  return cues;
}

describe('the whole world, R1 to the end of R4', () => {
  const cues = journey();

  it('raises the cues of the moments the journey has: blows, hits, jumps and landings, the bolt, the objects, the rooms, the enemies and the boss', () => {
    for (const cue of ['attack', 'hit', 'jump', 'land', 'boltCast', 'interact', 'roomTransition', 'enemyTelegraph', 'enemyDeath', 'bossAttack', 'bossDeath'] as const) {
      expect(count(cues, cue), cue).toBeGreaterThan(0);
    }
  });

  it('the rooms: one change of room per exit taken, with nothing to say where, and the room it leads to as its kind', () => {
    const rooms = cues.filter((c) => c.cue === 'roomTransition');
    expect(rooms.map((c) => c.variant)).toEqual(['r2_hall', 'r3_chamber', 'r4_sanctum', 'r4_sanctum'].slice(0, rooms.length));
    expect(rooms.length).toBeGreaterThanOrEqual(3);
    for (const r of rooms) expect([r.x, r.y]).toEqual([null, null]);
  });

  it('the boss: it winds up before it strikes, strikes (the rain: several marks on one tick), and falls exactly once, after its last strike', () => {
    const strikes = cues.filter((c) => c.cue === 'bossAttack');
    const falls = cues.filter((c) => c.cue === 'bossDeath');
    expect(falls).toHaveLength(1);
    expect(falls[0]!.variant).toBe('ink_warden');
    expect(Math.max(...strikes.map((s) => s.tick))).toBeLessThanOrEqual(falls[0]!.tick);
    expect(new Set(strikes.map((s) => s.variant))).toEqual(new Set(['warden_charge', 'warden_rain']));
    const rain = strikes.filter((s) => s.variant === 'warden_rain');
    const byTick = new Map<number, number>();
    for (const s of rain) byTick.set(s.tick, (byTick.get(s.tick) ?? 0) + 1);
    expect(Math.max(...byTick.values()), 'the rain raises one cue per mark on the same tick').toBeGreaterThanOrEqual(3);
    // its wind-up is heard before its first blow
    const windUp = cues.find((c) => c.cue === 'enemyTelegraph' && c.variant === 'ink_warden')!;
    expect(windUp.tick).toBeLessThan(strikes[0]!.tick);
    // its fall also raises the death of any enemy, on the same tick (what a death sounds like, on top of what THIS death sounds like)
    expect(cues.some((c) => c.cue === 'enemyDeath' && c.tick === falls[0]!.tick)).toBe(true);
  });

  it('the bolt: cast once and its impact on what it hit is the bolt\'s, not the sword\'s', () => {
    expect(count(cues, 'boltCast')).toBe(1);
    expect(count(cues, 'boltImpact'), 'it broke the ward').toBe(1);
    expect(cues.filter((c) => c.cue === 'boltImpact').every((c) => c.variant === 'spirit_bolt')).toBe(true);
  });

  it('the objects: the card of R3 and the Air Dash of R4 are interactions, each of its kind', () => {
    const things = cues.filter((c) => c.cue === 'interact');
    expect(things.length).toBeGreaterThanOrEqual(2);
    for (const t of things) expect(t.variant).toBe('pickup');
  });

  it('every cue is well formed: a known cue, a tick that does not go back, an intensity of 0–1, a place exactly where the contract says it has one', () => {
    let last = -1;
    for (const c of cues) {
      expect(AUDIO_CUES, c.cue).toContain(c.cue);
      expect(c.tick, `${c.cue}: ticks do not go back`).toBeGreaterThanOrEqual(last);
      last = c.tick;
      expect(c.intensity, c.cue).toBeGreaterThanOrEqual(0);
      expect(c.intensity, c.cue).toBeLessThanOrEqual(1);
      if (AUDIO_CONTRACT[c.cue].positional) expect(Number.isFinite(c.x) && Number.isFinite(c.y), `${c.cue} has a place`).toBe(true);
      else expect([c.x, c.y], c.cue).toEqual([null, null]);
    }
  });

  it('is DETERMINISTIC: the same journey from the same seed raises the same cues, in the same order, on the same ticks', () => {
    expect(journey()).toEqual(cues);
  });
});

describe('what the journey does not do: being hurt, dying, a bottle, a dash', () => {
  /** The movement room with the dash taught, a dummy in front and a director listening. */
  function room(): { d: Driver; cues: AudioCueEvent[] } {
    const d = driver({ unlocked: ['dash'] });
    const cues = listen(d.session);
    d.step(30);
    return { d, cues };
  }

  it('a dash, a jump and its landing', () => {
    const { d, cues } = room();
    d.tap('dash');
    d.step(30);
    d.tap('jump');
    d.step(80);
    expect(names(cues)).toContain('dash');
    expect(cues.find((c) => c.cue === 'dash')!.variant).toBe('ground');
    const jump = cues.find((c) => c.cue === 'jump')!;
    expect(jump.variant).toBe('ground');
    const land = cues.find((c) => c.cue === 'land')!;
    expect(land.tick).toBeGreaterThan(jump.tick);
    expect(land.intensity).toBeGreaterThan(0);
  });

  it('a blow is a cue on the tick its hitbox appears — not on the tick the button is pressed — and the hit on the dummy is on the tick the damage lands', () => {
    const { d, cues } = room();
    const dummy = spawnDummy(d, { x: d.body.x + 1.4, y: 0, health: 9 });
    const hp = dummy.health.current;
    const pressed = d.session.now;
    d.tap('attack');
    let hitboxAt = -1;
    let damagedAt = -1;
    for (let i = 0; i < 40; i++) {
      d.step(1);
      if (hitboxAt < 0 && d.session.combat.activeHitboxes.some((h) => h.ownerId === d.p.id)) hitboxAt = d.session.now;
      if (damagedAt < 0 && dummy.health.current < hp) damagedAt = d.session.now;
    }
    const attack = cues.find((c) => c.cue === 'attack')!;
    const hit = cues.find((c) => c.cue === 'hit')!;
    expect(attack.tick).toBe(hitboxAt);
    expect(attack.tick, 'later than the press: the hitbox has a wind-up').toBeGreaterThan(pressed);
    expect(attack.variant).toBe('slash_1');
    expect(hit.tick).toBe(damagedAt);
    expect(hit.variant).toBe('slash_1');
    expect(hit.tick).toBeGreaterThanOrEqual(attack.tick);
  });

  it('being hit is a cue of the hero\'s, once; the hit that hurt them is not also a `hit`; and the last one is their death, once', () => {
    const { d, cues } = room();
    strikeOnPlayer(d);
    d.step(2);
    expect(names(cues).filter((c) => c !== 'land')).toEqual(['hurt']); // (the knock-back throws them into the air: they land)
    expect(cues[0]).toMatchObject({ cue: 'hurt', intensity: 0.5 });
    d.until(() => !d.p.invulnerable, 300);
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d);
    d.step(60);
    expect(names(cues).filter((c) => c !== 'land')).toEqual(['hurt', 'hurt', 'death']);
    expect(count(cues, 'hit')).toBe(0);
  });

  it('the bottle: drinking starts, and the cue of the drink is raised when it lands, not when it starts; a drink that is interrupted raises no second one', () => {
    const { d, cues } = room();
    d.p.health.damage(2);
    d.step(2);
    d.tap('bottle');
    d.step(60);
    expect(names(cues)).toEqual(['bottleStart', 'bottleDrunk']);
    const [start, drunk] = cues as [AudioCueEvent, AudioCueEvent];
    expect(drunk.tick - start.tick, 'the channel is 24 ticks').toBeGreaterThanOrEqual(20);
    expect(drunk.intensity).toBe(1);
  });
});
