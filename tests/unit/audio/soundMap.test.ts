import { describe, expect, it } from 'vitest';
import { LAND_SILENCE, namedSounds, soundsFor, STINGER_RANK, STINGERS, SURFACES, UI_SOUNDS } from '@/audio/soundMap';
import { BOSS_MUSIC, SILENT_ZONE, ZONES, zoneOf } from '@/audio/zoneAudio';
import { AUDIO_CUES, type AudioCueEvent, type AudioCueId } from '@/presentation/audioCues';

const cue = (id: AudioCueId, variant = '', intensity = 1): AudioCueEvent => ({ cue: id, tick: 0, x: 0, y: 0, intensity, variant });
const ids = (c: AudioCueEvent, surface: 'stone' | 'earth' | 'wet' = 'stone'): string[] => soundsFor(c, { surface }).map((s) => s.id);

describe('which sound is for which moment', () => {
  it('gives each blow of the hero its own sound: the chain, the air and the crouch are not the same swing', () => {
    expect(ids(cue('attack', 'slash_1', 0.7))).toEqual(['hero.slash.1']);
    expect(ids(cue('attack', 'slash_2'))).toEqual(['hero.slash.2']);
    expect(ids(cue('attack', 'air_slash'))).toEqual(['hero.slash.air']);
    expect(ids(cue('attack', 'crouch_slash'))).toEqual(['hero.slash.crouch']);
    expect(ids(cue('attack', 'something_new'))).toEqual(['hero.slash.1']);
    // the first blow of a chain is softer than its finisher
    const first = soundsFor(cue('attack', 'slash_1', 0.7), { surface: 'stone' })[0]!.gainDb!;
    const last = soundsFor(cue('attack', 'slash_2', 1), { surface: 'stone' })[0]!.gainDb!;
    expect(first).toBeLessThan(last);
    expect(last).toBe(0);
  });

  it('tells a light hit from a heavy one, a bolt\'s impact from a sword\'s, and softens a light one a little', () => {
    expect(ids(cue('hit', 'slash_1', 0.5))).toEqual(['hit.light']);
    expect(ids(cue('hit', 'slash_1', 1))).toEqual(['hit.heavy']);
    expect(ids(cue('boltImpact', 'spirit_bolt', 1))).toEqual(['hit.bolt']);
    expect(soundsFor(cue('hit', '', 0.5), { surface: 'stone' })[0]!.gainDb!).toBeLessThan(0);
  });

  it('gives the hero\'s pain two weights, and their death and return one each', () => {
    expect(ids(cue('hurt', '', 0.5))).toEqual(['hero.hurt.light']);
    expect(ids(cue('hurt', '', 1))).toEqual(['hero.hurt.heavy']);
    expect(ids(cue('death'))).toEqual(['hero.death']);
    expect(ids(cue('respawn'))).toEqual(['hero.respawn']);
  });

  it('chooses the sound of a step by the floor, and makes it softer crouched and when it is not a run', () => {
    expect(ids(cue('step'), 'stone')).toEqual(['hero.step.stone']);
    expect(ids(cue('step'), 'earth')).toEqual(['hero.step.earth']);
    expect(ids(cue('step'), 'wet')).toEqual(['hero.step.wet']);
    const run = soundsFor(cue('step', '', 1), { surface: 'stone' })[0]!.gainDb!;
    const walk = soundsFor(cue('step', '', 0.5), { surface: 'stone' })[0]!.gainDb!;
    const crouch = soundsFor(cue('step', 'crouch', 0.3), { surface: 'stone' })[0]!.gainDb!;
    expect(run).toBe(0);
    expect(walk).toBeLessThan(run);
    expect(crouch).toBeLessThan(walk);
  });

  it('sorts a landing by how hard it was, and says nothing for the step down of a ledge', () => {
    expect(ids(cue('land', '', LAND_SILENCE - 0.01))).toEqual([]);
    // (the threshold itself is a design number, not only a name: a twentieth of a landing is silence, a sixth of one is heard)
    expect(ids(cue('land', '', 0.05))).toEqual([]);
    expect(ids(cue('land', '', 0.15))).toEqual(['hero.land.light']);
    expect(ids(cue('land', '', 0.2))).toEqual(['hero.land.light']);
    expect(ids(cue('land', '', 0.5))).toEqual(['hero.land.medium']);
    expect(ids(cue('land', '', 0.9))).toEqual(['hero.land.heavy']);
  });

  it('plays the jump and the dash of the air and of the ground differently', () => {
    expect(ids(cue('jump', 'ground'))).toEqual(['hero.jump']);
    expect(ids(cue('jump', 'air'))).toEqual(['hero.jump.air']);
    expect(ids(cue('dash', 'ground'))).toEqual(['hero.dash.ground']);
    expect(ids(cue('dash', 'air'))).toEqual(['hero.dash.air']);
  });

  it('gives the magic a start, a release, a fizzle, a refusal — each its own', () => {
    expect(ids(cue('castStart', 'spirit_bolt'))).toEqual(['magic.cast.start']);
    expect(ids(cue('boltCast', 'spirit_bolt'))).toEqual(['magic.cast.release']);
    expect(ids(cue('boltFizzle', 'range'))).toEqual(['magic.bolt.fizzle']);
    expect(soundsFor(cue('boltFizzle', 'wall'), { surface: 'stone' })[0]!.gainDb!).toBeLessThan(0);
    expect(ids(cue('skillDenied', 'noMagic'))).toEqual(['magic.denied']);
  });

  it('gives a bottle a start, a drink, a refusal, an interruption and a recharge', () => {
    expect(ids(cue('bottleStart'))).toEqual(['bottle.start']);
    expect(ids(cue('bottleDrunk'))).toEqual(['bottle.drunk']);
    expect(ids(cue('bottleDenied', 'none'))).toEqual(['bottle.denied']);
    expect(ids(cue('bottleInterrupted', 'hit'))).toEqual(['bottle.interrupted']);
    expect(ids(cue('bottleReady', '1'))).toEqual(['bottle.ready']);
  });

  it('gives each kind of object its sound, and the shrine to the checkpoint alone — it is not sounded twice', () => {
    expect(ids(cue('interact', 'pickup'))).toEqual(['interact.pickup']);
    expect(ids(cue('interact', 'open'))).toEqual(['interact.open']);
    expect(ids(cue('interact', 'activate'))).toEqual(['interact.activate']);
    expect(ids(cue('interact', 'lever'))).toEqual(['interact.activate']);
    expect(ids(cue('interact', 'rest'))).toEqual([]);
    expect(ids(cue('checkpoint', 'r2_hall'))).toEqual(['interact.rest']);
  });

  it('gives the world its doors, its seal and its spikes', () => {
    expect(ids(cue('gate', 'open'))).toEqual(['gate.open']);
    expect(ids(cue('gate', 'close'))).toEqual(['gate.close']);
    expect(ids(cue('sealRejected', 'slash_1', 0.5))).toEqual(['seal.reject']);
    expect(ids(cue('sealBroken', 'broken:r3_seal'))).toEqual(['seal.break']);
    expect(ids(cue('hazardHit', 'spikes'))).toEqual(['hazard.spikes']);
    expect(ids(cue('roomTransition', 'r2_hall'))).toEqual(['transition.pass']);
  });

  it('plays the stingers of the moments that are also music, a little after the moment itself, and the victory after the boss\'s fall has begun', () => {
    for (const [c, id] of [[cue('cardAcquired', 'card_spirit_bolt'), STINGERS.card], [cue('abilityUnlocked', 'air_dash'), STINGERS.unlock]] as const) {
      const [s] = soundsFor(c, { surface: 'stone' });
      expect(s?.id).toBe(id);
      expect(s?.delay).toBeGreaterThan(0);
    }
    const fall = soundsFor(cue('bossDeath', 'ink_warden'), { surface: 'stone' });
    expect(fall.map((s) => s.id)).toEqual(['boss.death', STINGERS.victory]);
    expect(fall[0]!.delay ?? 0).toBe(0);
    expect(fall[1]!.delay).toBeGreaterThan(0.5);
    // the bigger the moment, the higher its rank: a victory outranks a power, a power outranks a card
    expect(STINGER_RANK[STINGERS.victory]).toBeGreaterThan(STINGER_RANK[STINGERS.unlock] as number);
    expect(STINGER_RANK[STINGERS.unlock]).toBeGreaterThan(STINGER_RANK[STINGERS.card] as number);
  });

  it('gives the slime its alert, its warning, its lunge and its death, and the boss its wake, its two warnings, its two blows, its turn and its fall', () => {
    expect(ids(cue('enemyAlert', 'ink_slime'))).toEqual(['slime.alert']);
    expect(ids(cue('enemyAlert', 'ink_warden'))).toEqual([]); // the boss has its own wake
    expect(ids(cue('enemyTelegraph', 'slime_lunge'))).toEqual(['slime.telegraph']);
    expect(ids(cue('enemyTelegraph', 'ink_slime'))).toEqual(['slime.telegraph']);
    expect(ids(cue('enemyStrike', 'slime_lunge'))).toEqual(['slime.lunge']);
    expect(ids(cue('enemyDeath'))).toEqual(['slime.death']);
    expect(ids(cue('bossWake', 'ink_warden'))).toEqual(['boss.wake']);
    expect(ids(cue('enemyTelegraph', 'warden_charge'))).toEqual(['boss.telegraph.charge']);
    expect(ids(cue('enemyTelegraph', 'warden_rain'))).toEqual(['boss.telegraph.rain']);
    expect(ids(cue('enemyTelegraph', 'ink_warden'))).toEqual([]); // an unknown warning of the boss is not a slime's
    expect(ids(cue('bossAttack', 'warden_charge'))).toEqual(['boss.strike.charge']);
    expect(ids(cue('bossAttack', 'warden_rain'))).toEqual(['boss.strike.rain']);
    expect(ids(cue('bossAttack', 'warden_unknown'))).toEqual([]);
    expect(ids(cue('bossPhase', 'ink_warden'))).toEqual(['boss.phase']);
  });

  it('answers every cue there is, never throws, and never names more than two sounds for one moment', () => {
    const variants = ['', 'x', 'slash_1', 'ground', 'air', 'open', 'pickup', 'rest', 'warden_rain', 'slime_lunge', 'crouch'];
    for (const c of AUDIO_CUES) {
      for (const v of variants) for (const i of [0, 0.3, 0.7, 1]) {
        const out = soundsFor(cue(c, v, i), { surface: 'wet' });
        expect(out.length, `${c} ${v}`).toBeLessThanOrEqual(2);
        for (const s of out) {
          expect(typeof s.id).toBe('string');
          expect(Number.isFinite(s.gainDb ?? 0)).toBe(true);
          expect(s.delay ?? 0).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('names the sounds of the interface, and the set of every sound the table can name includes them', () => {
    expect(Object.values(UI_SOUNDS).every((id) => id.startsWith('ui.'))).toBe(true);
    const named = namedSounds();
    for (const id of Object.values(UI_SOUNDS)) expect(named).toContain(id);
    for (const s of SURFACES) expect(named).toContain(`hero.step.${s}`);
    expect(new Set(named).size).toBe(named.length);
  });
});

describe('the sound of each place', () => {
  it('has a place for each room of the first slice, and silence for any other', () => {
    expect(Object.keys(ZONES).sort()).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(zoneOf('movement_test')).toBe(SILENT_ZONE);
    expect(SILENT_ZONE.track).toBeNull();
    expect(SILENT_ZONE.bed).toBeNull();
    expect(SILENT_ZONE.scatter).toEqual([]);
  });

  it('shares a piece of music between R1 and R2 (the music does not restart at that door), gives R3 and R4 their own, and each place its own bed', () => {
    expect(zoneOf('r1_gate').track).toBe(zoneOf('r2_hall').track);
    expect(new Set([zoneOf('r1_gate').track, zoneOf('r3_chamber').track, zoneOf('r4_sanctum').track]).size).toBe(3);
    expect(new Set(Object.values(ZONES).map((z) => z.bed)).size).toBe(4);
    expect(BOSS_MUSIC['ink_warden']).toBe('warden');
  });

  it('gives each place the floor it has: stone, roots and earth, wet stone', () => {
    expect(zoneOf('r1_gate').surface).toBe('stone');
    expect(zoneOf('r2_hall').surface).toBe('earth');
    expect(zoneOf('r3_chamber').surface).toBe('wet');
    expect(zoneOf('r4_sanctum').surface).toBe('stone');
  });

  it('gives the sanctum the boss\'s sounds to hold while the hero is in it, and nothing else holds them', () => {
    expect(zoneOf('r4_sanctum').groups).toContain('boss');
    for (const [id, z] of Object.entries(ZONES)) if (id !== 'r4_sanctum') expect(z.groups ?? [], id).not.toContain('boss');
  });

  it('makes sense of every small sound of every place: a wait that is a real range, a chance, a distance, a level that is a whisper', () => {
    for (const [room, z] of Object.entries(ZONES)) {
      expect(z.scatter.length, room).toBeGreaterThan(0);
      for (const s of z.scatter) {
        expect(s.gap[0], `${room} ${s.id}`).toBeGreaterThan(1);
        expect(s.gap[1], `${room} ${s.id}`).toBeGreaterThan(s.gap[0]);
        expect(s.distance[0], `${room} ${s.id}`).toBeGreaterThan(0);
        expect(s.distance[1], `${room} ${s.id}`).toBeGreaterThan(s.distance[0]);
        expect(s.chance ?? 1).toBeGreaterThan(0);
        expect(s.chance ?? 1).toBeLessThanOrEqual(1);
        expect(s.gainDb ?? 0).toBeLessThanOrEqual(0);
      }
      // a place is not constantly noisy: at the shortest waits, fewer than a sound every two seconds overall
      const perSecond = z.scatter.reduce((n, s) => n + (s.chance ?? 1) / ((s.gap[0] + s.gap[1]) / 2), 0);
      expect(perSecond, room).toBeLessThan(0.5);
    }
  });

  it('echoes each place as a room of its own: the bigger and harder the room, the longer and brighter its tail', () => {
    const r = (id: string) => zoneOf(id).room;
    expect(r('r2_hall').rt60).toBeLessThan(r('r1_gate').rt60); // the roots drink the sound
    expect(r('r2_hall').damp).toBeGreaterThan(r('r3_chamber').damp);
    expect(r('r4_sanctum').rt60).toBeGreaterThanOrEqual(r('r3_chamber').rt60);
    for (const z of Object.values(ZONES)) {
      expect(z.room.rt60).toBeGreaterThan(0.5);
      expect(z.room.rt60).toBeLessThanOrEqual(3.2);
      expect(z.room.wet).toBeGreaterThan(0);
      expect(z.room.wet).toBeLessThanOrEqual(0.6);
    }
  });
});
