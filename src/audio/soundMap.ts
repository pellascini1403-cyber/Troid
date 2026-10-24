import type { AudioCueEvent, AudioCueId } from '@/presentation/audioCues';

/**
 * WHICH SOUND IS FOR WHICH MOMENT (docs/PROMPT18-LOG.md): the table that turns a cue of the game — "the hero swung the second blow of the chain", "a heavy landing", "the boss's rain falls" — into the sound (or sounds) of the
 * manifest to play, with the little that depends on how strong the moment was: a light hit and a heavy one are different sounds, a first blow is a little softer than its finisher, a footstep is softer crouched.
 *
 * PURE: ids in, ids out. The engine decides whether the sound can be played; this decides which one it is, and the test that reads the real manifest proves that every id named here exists there.
 */
export interface PlaySpec {
  /** The logical id of the sound in the manifest. */
  id: string;
  /** Added to the sound's own level (dB). */
  gainDb?: number;
  /** Multiplies the speed it plays at. */
  rate?: number;
  /** Seconds to wait before it starts. */
  delay?: number;
}

/** What the table needs to know about where the hero is. */
export interface SoundContext {
  /** What the floor is: stone, earth and roots, wet stone. */
  surface: 'stone' | 'earth' | 'wet';
}

export const SURFACES = ['stone', 'earth', 'wet'] as const;

/** The sounds that are not a cue of the simulation but of the interface (the menu, the sliders, a saved game). */
export const UI_SOUNDS = {
  open: 'ui.pause.open',
  close: 'ui.pause.close',
  tap: 'ui.tap',
  slider: 'ui.slider',
  on: 'ui.toggle.on',
  off: 'ui.toggle.off',
  save: 'ui.save',
} as const;
export type UiSoundKind = keyof typeof UI_SOUNDS;

/** The stingers: the short pieces of music that mark a moment, in the order of how much they matter (a bigger one is not cut off by a smaller one). */
export const STINGERS = { victory: 'stinger.victory', unlock: 'stinger.unlock', card: 'stinger.card' } as const;
export const STINGER_RANK: Readonly<Record<string, number>> = { 'stinger.victory': 3, 'stinger.unlock': 2, 'stinger.card': 1 };

const ATTACK_SOUND: Readonly<Record<string, string>> = {
  slash_1: 'hero.slash.1',
  slash_2: 'hero.slash.2',
  air_slash: 'hero.slash.air',
  crouch_slash: 'hero.slash.crouch',
};

/** A landing softer than this is not heard: a step down a ledge is not a landing. */
export const LAND_SILENCE = 0.1;

/** How many dB under full a moment of this strength is: 0 at full strength, `depth` at none (never −0). */
const db = (intensity: number, depth: number): number => (1 - Math.min(1, Math.max(0, intensity))) * depth * -1 || 0;

/** The sounds for one cue. Empty when the moment has no sound of its own (or has been given to another cue, so that it is not sounded twice). */
export function soundsFor(cue: Readonly<AudioCueEvent>, context: SoundContext): PlaySpec[] {
  const v = cue.variant;
  const i = cue.intensity;
  switch (cue.cue as AudioCueId) {
    // ---- the hero
    case 'attack':
      return [{ id: ATTACK_SOUND[v] ?? 'hero.slash.1', gainDb: db(i, 5) }];
    case 'dash':
      return [{ id: v === 'air' ? 'hero.dash.air' : 'hero.dash.ground' }];
    case 'jump':
      return [{ id: v === 'air' ? 'hero.jump.air' : 'hero.jump' }];
    case 'land':
      if (i < LAND_SILENCE) return [];
      return [{ id: i < 0.35 ? 'hero.land.light' : i < 0.7 ? 'hero.land.medium' : 'hero.land.heavy' }];
    case 'step':
      return [{ id: `hero.step.${context.surface}`, gainDb: v === 'crouch' ? -7 : db(i, 5) }];
    case 'hurt':
      return [{ id: i >= 0.75 ? 'hero.hurt.heavy' : 'hero.hurt.light' }];
    case 'death':
      return [{ id: 'hero.death' }];
    case 'respawn':
      return [{ id: 'hero.respawn' }];
    // ---- combat
    case 'hit':
      return [{ id: i < 0.6 ? 'hit.light' : 'hit.heavy', gainDb: db(i, 3) }];
    case 'boltImpact':
      return [{ id: 'hit.bolt', gainDb: db(i, 3) }];
    // ---- the magic
    case 'castStart':
      return [{ id: 'magic.cast.start' }];
    case 'boltCast':
      return [{ id: 'magic.cast.release' }];
    case 'boltFizzle':
      return [{ id: 'magic.bolt.fizzle', gainDb: v === 'wall' ? -3 : 0 }];
    case 'skillDenied':
      return [{ id: 'magic.denied' }];
    // ---- the bottles
    case 'bottleStart':
      return [{ id: 'bottle.start' }];
    case 'bottleDrunk':
      return [{ id: 'bottle.drunk' }];
    case 'bottleDenied':
      return [{ id: 'bottle.denied' }];
    case 'bottleInterrupted':
      return [{ id: 'bottle.interrupted' }];
    case 'bottleReady':
      return [{ id: 'bottle.ready' }];
    // ---- the world
    case 'interact':
      // the shrine has its own cue (`checkpoint`): the object itself is silent so that the rest is not sounded twice
      if (v === 'rest') return [];
      return [{ id: v === 'pickup' ? 'interact.pickup' : v === 'open' ? 'interact.open' : 'interact.activate' }];
    case 'checkpoint':
      return [{ id: 'interact.rest' }];
    case 'gate':
      return [{ id: v === 'open' ? 'gate.open' : 'gate.close' }];
    case 'sealRejected':
      return [{ id: 'seal.reject', gainDb: db(i, 3) }];
    case 'sealBroken':
      return [{ id: 'seal.break' }];
    case 'hazardHit':
      return [{ id: 'hazard.spikes' }];
    case 'roomTransition':
      return [{ id: 'transition.pass' }];
    // ---- the moments that are also music
    case 'cardAcquired':
      return [{ id: STINGERS.card, delay: 0.35 }];
    case 'abilityUnlocked':
      return [{ id: STINGERS.unlock, delay: 0.35 }];
    // ---- the enemies
    case 'enemyAlert':
      // every creature of ink wakes with the slime's gasp (the guardians have their own wake: `boss.wake`)
      return isBoss(v) ? [] : [{ id: 'slime.alert' }];
    case 'enemyTelegraph':
      // the boss's warnings are the boss's, one for each attack; every creature's is the slime's (the sound of ink drawing itself in)
      if (v === 'warden_charge') return [{ id: 'boss.telegraph.charge' }];
      if (v === 'warden_rain') return [{ id: 'boss.telegraph.rain' }];
      if (v === 'ink_warden' || v.startsWith('warden_')) return []; // an unknown warning of the Warden is not a slime's
      if (v.startsWith('boss_')) return [{ id: v.endsWith('_rain') || v.endsWith('_fall') ? 'boss.telegraph.rain' : 'boss.telegraph.charge' }];
      return [{ id: 'slime.telegraph' }];
    case 'enemyStrike':
      return isBoss(v) ? [] : [{ id: 'slime.lunge' }];
    case 'enemyDeath':
      return [{ id: 'slime.death' }];
    // ---- the boss
    case 'bossWake':
      return [{ id: 'boss.wake' }];
    case 'bossPhase':
      return [{ id: 'boss.phase' }];
    case 'bossAttack':
      // the strikes of the guardians that came after the Warden are one of its two: a blow that falls from above sounds like the rain, one that sweeps the ground like the charge
      if (v === 'warden_rain') return [{ id: 'boss.strike.rain' }];
      if (v === 'warden_charge') return [{ id: 'boss.strike.charge' }];
      if (!v.startsWith('boss_')) return [];
      return v.endsWith('_rain') || v.endsWith('_fall') ? [{ id: 'boss.strike.rain' }] : [{ id: 'boss.strike.charge' }];
    case 'bossDeath':
      return [{ id: 'boss.death' }, { id: STINGERS.victory, delay: 1.1 }];
    default:
      return [];
  }
}

/** A guardian's attack or name (the Warden, and the ones that came after it: their ids begin with `boss_`). */
function isBoss(v: string): boolean {
  return v === 'ink_warden' || v.startsWith('boss_') || v.startsWith('warden_');
}

/** Every sound id the table can name (the test reads the real manifest against it). */
export function namedSounds(): string[] {
  const ids = new Set<string>();
  const surfaces: SoundContext[] = SURFACES.map((surface) => ({ surface }));
  const variants = ['', 'crouch', 'air', 'ground', 'wall', 'range', 'open', 'close', 'pickup', 'activate', 'rest', 'ink_slime', 'ink_warden', 'slime_lunge', 'warden_charge', 'warden_rain', ...Object.keys(ATTACK_SOUND)];
  const cues = [
    'attack', 'hit', 'dash', 'hurt', 'death', 'boltCast', 'boltImpact', 'bottleStart', 'bottleDrunk', 'interact', 'bossAttack', 'bossDeath', 'roomTransition', 'jump', 'land', 'enemyTelegraph', 'enemyDeath', 'step', 'respawn', 'castStart',
    'boltFizzle', 'skillDenied', 'bottleDenied', 'bottleInterrupted', 'bottleReady', 'gate', 'checkpoint', 'sealRejected', 'sealBroken', 'hazardHit', 'abilityUnlocked', 'cardAcquired', 'enemyAlert', 'enemyStrike', 'bossWake', 'bossPhase',
  ] as const;
  for (const cue of cues) for (const variant of variants) for (const intensity of [0.05, 0.3, 0.5, 0.7, 1]) for (const context of surfaces) for (const s of soundsFor({ cue, tick: 0, x: 0, y: 0, intensity, variant }, context)) ids.add(s.id);
  for (const id of Object.values(UI_SOUNDS)) ids.add(id);
  return [...ids].sort();
}
