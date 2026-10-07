import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { chooseSource, lackedClips, providesState, VISUAL_MODES, type VisualSet } from '@/presentation/visualSource';
import { ANIM_STATES, type AnimState } from '@/presentation/vocabulary';

/**
 * WHICH LOOK DRAWS A STATE (docs/ART-PIPELINE-2D.md, part D): the real art where it can really stand for the state, the placeholder where it cannot, and the way
 * back at any time. Pure: no GPU, no gameplay.
 */
const clip = { frames: 'x_', count: 2 };
const art = (states: AnimState[], over: Partial<VisualSet> = {}): VisualSet => ({ clips: Object.fromEntries(states.map((s) => [s, clip])), ...over });

describe('providesState: what the art can stand for', () => {
  it('a clip stands for its own state', () => {
    for (const s of ANIM_STATES) expect(providesState(art([s]), s), s).toBe(true);
  });

  it('the gaits stand for each other, and so do the two halves of a jump', () => {
    expect(providesState(art(['walk']), 'run')).toBe(true);
    expect(providesState(art(['run']), 'walk')).toBe(true);
    expect(providesState(art(['move']), 'walk')).toBe(true);
    expect(providesState(art(['fall']), 'jump')).toBe(true);
    expect(providesState(art(['jump']), 'fall')).toBe(true);
  });

  it('the first blow is `attack` or `attack1` (a content name and an artist\'s name for the same swing), and the second may repeat it', () => {
    expect(providesState(art(['attack1']), 'attack')).toBe(true);
    expect(providesState(art(['attack']), 'attack1')).toBe(true);
    expect(providesState(art(['attack1']), 'attack2')).toBe(true);
    expect(providesState(art(['attack']), 'attack2')).toBe(true);
  });

  it('a landing and an alert are held poses: the art\'s idle stands for them (no flicker to the placeholder for a few frames)', () => {
    expect(providesState(art(['idle']), 'land')).toBe(true);
    expect(providesState(art(['idle']), 'alert')).toBe(true);
  });

  it('nothing else is borrowed: a swing is not a cast, an idle is not a dash, a standing pose is not a crouch', () => {
    const swing = art(['idle', 'walk', 'attack1']);
    for (const s of ['cast', 'special', 'dash', 'crouch', 'crouchWalk', 'hurt', 'death', 'drink', 'interact', 'attackAir', 'attackCrouch', 'jump', 'fall'] as const) {
      expect(providesState(swing, s), s).toBe(false);
    }
    expect(providesState(art(['idle']), 'walk')).toBe(false);
  });
});

describe('chooseSource: the look on screen', () => {
  const partial = art(['idle', 'walk', 'attack1']);

  it('without art, only the placeholder — in every mode', () => {
    for (const mode of VISUAL_MODES) for (const s of ANIM_STATES) expect(chooseSource(mode, null, s), `${mode} ${s}`).toBe('placeholder');
  });

  it('auto: the art for what it provides, the placeholder for the rest — so a partial set grows in without the game looking at the difference', () => {
    expect(chooseSource('auto', partial, 'idle')).toBe('art');
    expect(chooseSource('auto', partial, 'walk')).toBe('art');
    expect(chooseSource('auto', partial, 'run')).toBe('art');
    expect(chooseSource('auto', partial, 'attack')).toBe('art');
    expect(chooseSource('auto', partial, 'land')).toBe('art');
    expect(chooseSource('auto', partial, 'dash')).toBe('placeholder');
    expect(chooseSource('auto', partial, 'death')).toBe('placeholder');
    expect(chooseSource('auto', partial, 'cast')).toBe('placeholder');
  });

  it('placeholder: the way back, always, however good the art', () => {
    for (const s of ANIM_STATES) expect(chooseSource('placeholder', art([...ANIM_STATES]), s), s).toBe('placeholder');
  });

  it('art: the art for everything, the set\'s own chain doing what it lacks (to judge it on its own)', () => {
    for (const s of ANIM_STATES) expect(chooseSource('art', art(['idle']), s), s).toBe('art');
  });

  it('a set that says `chain` for what it lacks is never replaced by the placeholder, in auto either', () => {
    for (const s of ANIM_STATES) expect(chooseSource('auto', art(['idle'], { missingClips: 'chain' }), s), s).toBe('art');
    expect(chooseSource('placeholder', art(['idle'], { missingClips: 'chain' }), 'idle'), 'and the way back still works').toBe('placeholder');
  });

  it('is a function of its inputs and nothing else', () => {
    for (const mode of VISUAL_MODES) for (const s of ANIM_STATES) expect(chooseSource(mode, partial, s)).toBe(chooseSource(mode, partial, s));
  });
});

describe('lackedClips: what is still to be drawn', () => {
  it('lists the wanted states the set has NO clip of its own for — a stand-in does not count: the artist is asked for the clip', () => {
    expect(lackedClips(art(['idle', 'walk', 'attack1']), PLAYER_VISUAL.required)).toEqual(['jump', 'fall', 'dash', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact']);
    expect(lackedClips(art([...PLAYER_VISUAL.required]), PLAYER_VISUAL.required)).toEqual([]);
    expect(lackedClips(art([]), ['idle'])).toEqual(['idle']);
  });

  it('the protagonist\'s required clips are the fifteen of the brief, every one a state the engine knows', () => {
    expect([...PLAYER_VISUAL.required]).toEqual(['idle', 'walk', 'jump', 'fall', 'dash', 'attack1', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact']);
    for (const s of PLAYER_VISUAL.required) expect(ANIM_STATES as readonly string[]).toContain(s);
  });
});
