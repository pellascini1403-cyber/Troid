import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { log } from '@/core/log';
import { clipFrameNames } from '@/presentation/SpriteSetDefinition';
import { validateSpriteSet } from '@/presentation/validateSpriteSet';

beforeAll(() => log.setSink(() => {}));

const { def, meta, frames } = PLAYER_PLACEHOLDER;
const available = new Set(frames.map((f) => f.name));

/**
 * The states Prompt 5 added to the player (`cast`, `drink`; `interact` with its step) have their OWN clip in the
 * abstract placeholder, so playing them never falls back (a fallback logs a warning every time). The poses are the placeholder's
 * own abstract ones — a capsule and a sword — and no new character art is invented.
 */
const PROMPT5_STATES = ['cast', 'drink'] as const;

describe('placeholder: the states of Prompt 5', () => {
  it('each has its own clip, with every frame in the atlas', () => {
    for (const state of PROMPT5_STATES) {
      const clip = def.clips[state];
      expect(clip, state).toBeDefined();
      for (const name of clipFrameNames(clip!)) expect(available.has(name), `${state}: ${name}`).toBe(true);
    }
  });

  it('the cast is phase-driven like an attack (preparation, release, recovery), so the controller can show where it is', () => {
    const cast = def.clips.cast!;
    expect(cast.phases).toBeDefined();
    expect(Object.keys(cast.phases!).sort()).toEqual(['active', 'recovery', 'startup']);
  });

  it('adds no frames: the cast shows the sword poses the placeholder already has', () => {
    expect(def.clips.cast!.frames).toBe(def.clips.attack2!.frames);
    expect(def.clips.cast!.count).toBe(def.clips.attack2!.count);
    expect(frames).toHaveLength(62);
  });

  it('the drink shows the standing poses, looping: no new frames either', () => {
    const drink = def.clips.drink!;
    expect(drink.frames).toBe(def.clips.idle!.frames);
    expect(drink.count).toBe(def.clips.idle!.count);
    expect(drink.loop).toBe(true);
    expect(frames).toHaveLength(62);
  });

  it('the set is still valid with no errors or warnings', () => {
    expect(validateSpriteSet(def, meta, available).filter((i) => i.level !== 'info')).toEqual([]);
  });
});
