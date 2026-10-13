import { describe, expect, it } from 'vitest';
import { BODY_FRAMES, CREST_FRAMES, GUARDIAN_PARTS, bossArtIssues, bossParts, framesNeeded, readBossTags } from '@/presentation/bossArt';

/**
 * THE ART OF A BOSS (docs/PROMPT8-LOG.md, phase F): a guardian is drawn in parts, and a sprite set says whose part it is and which with two tags. With every part the view draws the boss with the art; with
 * any missing it keeps its shapes — a boss is never half-painted — and the pack check says what is lacking.
 */
const sprite = (id: string, tags: string[], idle = 1) => ({ id, tags, clips: { idle: { frames: `${id}_`, count: idle } } });
/** A whole boss: every part, the body with its flash and the crest with its three states. */
const WHOLE = [
  sprite('body', ['boss:ink_warden', 'part:body'], BODY_FRAMES),
  sprite('eye', ['boss:ink_warden', 'part:eye']),
  sprite('crest', ['boss:ink_warden', 'part:crest'], CREST_FRAMES),
  sprite('shard', ['boss:ink_warden', 'part:shard']),
  sprite('pool', ['boss:ink_warden', 'part:pool']),
];
const pack = (sprites: ReturnType<typeof sprite>[]) => ({ id: 'ink-warden', status: 'provisional' as const, sprites: sprites as never });

describe('readBossTags', () => {
  it('reads whose part a sprite set is and which', () => {
    expect(readBossTags(['boss:ink_warden', 'part:crest', 'blend:add'])).toEqual({ look: 'ink_warden', part: 'crest', problems: [] });
    expect(readBossTags(['role:decor'])).toEqual({ look: null, part: null, problems: [] });
  });

  it('says what is wrong with a tag, without throwing', () => {
    expect(readBossTags(['boss:a', 'boss:b', 'part:body']).problems.join(' ')).toMatch(/names 2 bosses/);
    expect(readBossTags(['boss:a', 'part:body', 'part:eye']).problems.join(' ')).toMatch(/names 2 parts/);
    expect(readBossTags(['boss:a', 'part:tail']).problems.join(' ')).toMatch(/not a part of a boss/);
    expect(readBossTags(['boss:a']).problems.join(' ')).toMatch(/says no "part:<name>"/);
    expect(readBossTags(['boss:a', 'part:tail']).part).toBeNull();
  });
});

describe('bossParts', () => {
  it('groups the parts of each boss, the first set that claims a part keeping it', () => {
    const parts = bossParts([...WHOLE, sprite('body_two', ['boss:ink_warden', 'part:body']), sprite('other', ['boss:other', 'part:eye'])]);
    expect([...parts.keys()].sort()).toEqual(['ink_warden', 'other']);
    expect(parts.get('ink_warden')!.get('body')).toBe('body');
    expect([...parts.get('ink_warden')!.keys()].sort()).toEqual([...GUARDIAN_PARTS].sort());
    expect([...parts.get('other')!.keys()]).toEqual(['eye']);
  });
});

describe('bossArtIssues', () => {
  it('has nothing to say of a whole boss', () => {
    expect(bossArtIssues(pack(WHOLE))).toEqual([]);
  });

  it('says which parts a boss lacks, and that the shapes draw it until it has them all', () => {
    const issues = bossArtIssues(pack(WHOLE.filter((s) => s.id !== 'shard' && s.id !== 'pool')));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'warn', path: 'ink-warden' });
    expect(issues[0]!.message).toMatch(/lacks shard, pool/);
    expect(issues[0]!.message).toMatch(/with its shapes/);
  });

  it('warns of a crest with fewer frames than states, a body with no flash, two sets for one part and frames that are never drawn', () => {
    const messages = bossArtIssues(
      pack([
        sprite('body', ['boss:ink_warden', 'part:body'], 1),
        sprite('eye', ['boss:ink_warden', 'part:eye'], 3),
        sprite('crest', ['boss:ink_warden', 'part:crest'], 2),
        sprite('shard', ['boss:ink_warden', 'part:shard']),
        sprite('shard_two', ['boss:ink_warden', 'part:shard']),
        sprite('pool', ['boss:ink_warden', 'part:pool']),
      ]),
    ).map((i) => `${i.level} ${i.path}: ${i.message}`);
    expect(messages.join('\n')).toMatch(/sprites\.body: the body has one frame/);
    expect(messages.join('\n')).toMatch(/sprites\.eye: a eye has 1 picture: the 2 after it are never drawn/);
    expect(messages.join('\n')).toMatch(/sprites\.crest: the crest has 2 frames and the game shows it in 3 states/);
    expect(messages.join('\n')).toMatch(/sprites\.shard_two: claims the same part as shard/);
  });

  it('refuses what cannot be drawn: a tag that names no part, a part with no idle clip', () => {
    const errors = bossArtIssues(pack([sprite('odd', ['boss:ink_warden', 'part:tail']), { id: 'mute', tags: ['boss:ink_warden', 'part:eye'], clips: {} as never }])).filter((i) => i.level === 'error');
    expect(errors.map((e) => e.path)).toEqual(['sprites.odd', 'sprites.mute']);
  });

  it('does not look at a pack that still awaits its art', () => {
    expect(bossArtIssues({ id: 'ink-warden', status: 'awaiting-art', sprites: [] as never })).toEqual([]);
  });

  it('knows how many pictures the game draws of each part', () => {
    expect(GUARDIAN_PARTS.map((p) => [p, framesNeeded(p)])).toEqual([['body', 2], ['eye', 1], ['crest', 3], ['shard', 1], ['pool', 1]]);
  });
});
