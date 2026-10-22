/**
 * THE CUES OF THE SOUND (docs/ART-PIPELINE-2D.md, part H; docs/PROMPT18-LOG.md): the list of MOMENTS a sound is made for, each tied to the simulation event that raises it, with what a sound needs to
 * know — where it happened, how strong it was, which kind of it. The audio engine plugs in as an `AudioSink` and reads nothing else: it never looks into the simulation, never polls, and the simulation never knows it
 * exists. PURE.
 *
 * The same rule the effects obey: WHEN a cue happens is the simulation's (the event), never the sound's. The cue of a blow is the tick its hitbox appears, not the tick
 * a button was pressed; the cue of a hit is the tick the damage is done.
 */
export const AUDIO_CUES = [
  'attack',
  'hit',
  'dash',
  'hurt',
  'death',
  'boltCast',
  'boltImpact',
  'bottleStart',
  'bottleDrunk',
  'interact',
  'bossAttack',
  'bossDeath',
  'roomTransition',
  'jump',
  'land',
  'enemyTelegraph',
  'enemyDeath',
  'step',
  'respawn',
  'castStart',
  'boltFizzle',
  'skillDenied',
  'bottleDenied',
  'bottleInterrupted',
  'bottleReady',
  'gate',
  'checkpoint',
  'sealRejected',
  'sealBroken',
  'hazardHit',
  'abilityUnlocked',
  'cardAcquired',
  'enemyAlert',
  'enemyStrike',
  'bossWake',
  'bossPhase',
] as const;
export type AudioCueId = (typeof AUDIO_CUES)[number];

export interface AudioCueEvent {
  cue: AudioCueId;
  /** The simulation tick it happened on (the host's clock; 0 when it gave none). */
  tick: number;
  /** Where it happened in the world, metres, +y up — for panning and distance. `null` for what has no place (a change of room). */
  x: number | null;
  y: number | null;
  /** 0–1: how strong. 1 when the event has no magnitude. */
  intensity: number;
  /** A kind to pick a variation by (the attack, the object, the boss's attack…). Empty when there is none. */
  variant: string;
}

/** What a sound engine is: it receives cues. It may drop, delay, mix or ignore them; it cannot ask the game for anything. */
export interface AudioSink {
  cue(event: Readonly<AudioCueEvent>): void;
}

export type AudioFamily = 'combat' | 'movement' | 'resource' | 'world' | 'boss';

export interface AudioCueSpec {
  family: AudioFamily;
  /** The simulation events (`GameEvents` keys) that raise it. */
  events: readonly string[];
  /** Has a place in the world (`x`, `y` are numbers). */
  positional: boolean;
  /** What `intensity` says, in words (1 when the event has no magnitude). */
  intensity: string;
  /** What `variant` says, in words. */
  variant: string;
}

export const AUDIO_CONTRACT: Readonly<Record<AudioCueId, AudioCueSpec>> = {
  attack: { family: 'combat', events: ['player:attackActive'], positional: true, intensity: '0.7 the first blow, 1 the finisher of the chain', variant: 'the attack: slash_1, slash_2, air_slash, crouch_slash' },
  hit: { family: 'combat', events: ['combat:hit'], positional: true, intensity: 'the damage over 2, and 1 when it kills', variant: 'the attack that landed' },
  dash: { family: 'movement', events: ['player:dashed'], positional: true, intensity: '1', variant: '"ground" or "air"' },
  hurt: { family: 'combat', events: ['player:hurt'], positional: true, intensity: 'the damage over 2', variant: '' },
  death: { family: 'combat', events: ['player:died'], positional: true, intensity: '1', variant: '' },
  boltCast: { family: 'combat', events: ['skill:cast'], positional: true, intensity: '1', variant: 'the skill: spirit_bolt' },
  boltImpact: { family: 'combat', events: ['combat:hit'], positional: true, intensity: 'the damage over 2, and 1 when it kills', variant: 'the attack of the projectile' },
  bottleStart: { family: 'resource', events: ['bottle:drinkStarted'], positional: true, intensity: '1', variant: '' },
  bottleDrunk: { family: 'resource', events: ['bottle:drunk'], positional: true, intensity: 'the life restored over 2', variant: '' },
  interact: { family: 'world', events: ['interaction:performed'], positional: true, intensity: '1', variant: 'the kind of object: pickup, lever, open…' },
  bossAttack: { family: 'boss', events: ['boss:strike'], positional: true, intensity: '1', variant: 'the boss attack: warden_charge, warden_rain (the rain raises one per mark, up to four on the same tick)' },
  bossDeath: { family: 'boss', events: ['boss:defeated'], positional: true, intensity: '1', variant: 'the boss: ink_warden' },
  roomTransition: { family: 'world', events: ['transition:started'], positional: false, intensity: '1', variant: 'the room it leads to' },
  jump: { family: 'movement', events: ['player:jumped'], positional: true, intensity: '1', variant: '"ground" or "air"' },
  land: { family: 'movement', events: ['player:landed'], positional: true, intensity: 'the speed it landed at over 20', variant: '' },
  enemyTelegraph: { family: 'combat', events: ['enemy:telegraph'], positional: true, intensity: '1', variant: 'the attack winding up: slime_lunge, warden_charge, warden_rain (the rain raises one per mark)' },
  enemyDeath: { family: 'combat', events: ['actor:died'], positional: true, intensity: '1', variant: 'empty — the death of an enemy that is not a boss (a boss\'s fall is `bossDeath` only)' },
  step: { family: 'movement', events: ['player:stepped'], positional: true, intensity: 'the pace over the run speed (a walk is about 0.5, a run 1)', variant: '"crouch" when crouched, else empty' },
  respawn: { family: 'world', events: ['death:respawned'], positional: false, intensity: '1', variant: 'the room the hero comes back in' },
  castStart: { family: 'combat', events: ['skill:castStarted'], positional: true, intensity: '1', variant: 'the skill: spirit_bolt' },
  boltFizzle: { family: 'combat', events: ['projectile:ended'], positional: true, intensity: '1', variant: 'how it ended without hitting: "wall" or "range"' },
  skillDenied: { family: 'resource', events: ['skill:denied'], positional: false, intensity: '1', variant: 'why: noMagic' },
  bottleDenied: { family: 'resource', events: ['bottle:denied'], positional: false, intensity: '1', variant: 'why: "none" (no bottle ready) or "full" (the life is full)' },
  bottleInterrupted: { family: 'resource', events: ['bottle:interrupted'], positional: false, intensity: '1', variant: 'why: "hit", "air" or "full"' },
  bottleReady: { family: 'resource', events: ['bottle:changed'], positional: false, intensity: '1', variant: 'the slot that finished recharging' },
  gate: { family: 'world', events: ['gate:changed'], positional: false, intensity: '1', variant: '"open" or "close"' },
  checkpoint: { family: 'world', events: ['checkpoint:set'], positional: true, intensity: '1', variant: 'the room' },
  sealRejected: { family: 'world', events: ['seal:rejected'], positional: true, intensity: 'the jolt of the blow, 0–1', variant: 'the attack the seal turned away' },
  sealBroken: { family: 'world', events: ['flag:set'], positional: false, intensity: '1', variant: 'the flag: broken:r3_seal' },
  hazardHit: { family: 'world', events: ['hazard:hit'], positional: true, intensity: 'the damage over 2', variant: 'the kind of hazard: spikes' },
  abilityUnlocked: { family: 'world', events: ['ability:unlocked'], positional: false, intensity: '1', variant: 'the ability: air_dash, magic_attack…' },
  cardAcquired: { family: 'world', events: ['card:changed'], positional: false, intensity: '1', variant: 'the card' },
  enemyAlert: { family: 'combat', events: ['enemy:alerted'], positional: true, intensity: '1', variant: 'the enemy: ink_slime, ink_warden' },
  enemyStrike: { family: 'combat', events: ['enemy:struck'], positional: true, intensity: '1', variant: 'the attack that begins: slime_lunge' },
  bossWake: { family: 'boss', events: ['boss:started'], positional: true, intensity: '1', variant: 'the boss: ink_warden' },
  bossPhase: { family: 'boss', events: ['boss:phase'], positional: true, intensity: 'the phase over 2', variant: 'the boss: ink_warden' },
};

export const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** How strong a blow that landed was: its damage over 2 (one point is half), and always full when it killed. */
export function hitIntensity(damage: number, killed: boolean): number {
  return killed ? 1 : clamp01(damage / 2);
}

/** How strong a blow the hero received was. */
export function hurtIntensity(damage: number): number {
  return clamp01(damage / 2);
}

/** How hard a landing was: the speed it landed at over 20 m/s (the fall tops out at 26). */
export function landIntensity(impact: number): number {
  return clamp01(impact / 20);
}

/** How briskly the hero goes: their speed over the run speed (8.5 m/s). A step at a walk (4.2 m/s) is about half; a run is full. */
export function stepIntensity(speed: number): number {
  return clamp01(speed / 8.5);
}

/** The first blow of the chain is lighter than its finisher. */
export function attackIntensity(combo: number): number {
  return combo >= 1 ? 1 : 0.7;
}
