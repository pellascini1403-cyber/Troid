import { describe, expect, it } from 'vitest';
import { ENEMY_PARTS, SPINE_FRAMES, enemyArtIssues, enemyFramesNeeded, enemyParts, readEnemyTags } from '@/presentation/enemyArt';
import { bossArtIssues, readBossTags } from '@/presentation/bossArt';

/**
 * THE ART OF AN INK CREATURE (docs/PROMPT8-LOG.md, phase G): an ordinary enemy is drawn in parts, and a sprite set says whose part it is and which with two tags; the body says where its eyes and its sigil stand with two anchors.
 * With every part the view draws the creature with the art; with any missing it keeps its shapes — a creature is never half-painted — and the pack check says what is lacking.
 */
const ANCHORS = { head: [0.27, 0.45], vfx_origin: [-0.12, 0.38] } as const;
const sprite = (id: string, tags: string[], idle = 1, anchors?: Record<string, readonly [number, number]>) => ({ id, tags, clips: { idle: { frames: `${id}_`, count: idle } }, ...(anchors ? { anchors } : {}) });
/** A whole creature: every part, the body with its boil, the bristle with its three states and the body with the anchors that place the eyes and the sigil. */
const WHOLE = [
  sprite('body', ['enemy:ink_slime', 'part:body'], 4, ANCHORS),
  sprite('flash', ['enemy:ink_slime', 'part:flash']),
  sprite('eyes', ['enemy:ink_slime', 'part:eyes']),
  sprite('sigil', ['enemy:ink_slime', 'part:sigil']),
  sprite('spines', ['enemy:ink_slime', 'part:spines'], SPINE_FRAMES),
  sprite('pool', ['enemy:ink_slime', 'part:pool']),
];
const pack = (sprites: ReturnType<typeof sprite>[]) => ({ id: 'ink-slime', status: 'provisional' as const, sprites: sprites as never });

describe('readEnemyTags', () => {
  it('reads whose part a sprite set is and which', () => {
    expect(readEnemyTags(['enemy:ink_slime', 'part:sigil', 'blend:add'])).toEqual({ look: 'ink_slime', part: 'sigil', problems: [] });
    expect(readEnemyTags(['role:decor'])).toEqual({ look: null, part: null, problems: [] });
  });

  it('says what is wrong with a tag, without throwing', () => {
    expect(readEnemyTags(['enemy:a', 'enemy:b', 'part:body']).problems.join(' ')).toMatch(/names 2 enemies/);
    expect(readEnemyTags(['enemy:a', 'part:body', 'part:eyes']).problems.join(' ')).toMatch(/names 2 parts/);
    expect(readEnemyTags(['enemy:a', 'part:crest']).problems.join(' ')).toMatch(/not a part of an enemy/);
    expect(readEnemyTags(['enemy:a']).problems.join(' ')).toMatch(/says no "part:<name>"/);
    expect(readEnemyTags(['enemy:a', 'part:crest']).part).toBeNull();
  });

  it('a boss\'s parts are not an enemy\'s and an enemy\'s are not a boss\'s: each reader looks only at the sets that name its own kind', () => {
    // `part:` is shared by the scenery, the bosses and the enemies: only the `enemy:` / `boss:` tag says which this is
    expect(readEnemyTags(['boss:ink_warden', 'part:crest'])).toEqual({ look: null, part: null, problems: [] });
    expect(readBossTags(['enemy:ink_slime', 'part:eyes'])).toEqual({ look: null, part: null, problems: [] });
    expect(bossArtIssues({ id: 'ink-slime', status: 'provisional', sprites: WHOLE as never })).toEqual([]);
    expect(enemyArtIssues({ id: 'ink-warden', status: 'provisional', sprites: [sprite('crest', ['boss:ink_warden', 'part:crest'], 3)] as never })).toEqual([]);
  });
});

describe('enemyParts', () => {
  it('groups the parts of each enemy, the first set that claims a part keeping it', () => {
    const parts = enemyParts([...WHOLE, sprite('body_two', ['enemy:ink_slime', 'part:body']), sprite('other', ['enemy:other', 'part:eyes'])]);
    expect([...parts.keys()].sort()).toEqual(['ink_slime', 'other']);
    expect(parts.get('ink_slime')!.get('body')).toBe('body');
    expect([...parts.get('ink_slime')!.keys()].sort()).toEqual([...ENEMY_PARTS].sort());
    expect([...parts.get('other')!.keys()]).toEqual(['eyes']);
  });
});

describe('enemyArtIssues', () => {
  it('has nothing to say of a whole creature', () => {
    expect(enemyArtIssues(pack(WHOLE))).toEqual([]);
  });

  it('says which parts an enemy lacks, and that the shapes draw it until it has them all', () => {
    const issues = enemyArtIssues(pack(WHOLE.filter((s) => s.id !== 'spines' && s.id !== 'pool')));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'warn', path: 'ink-slime' });
    expect(issues[0]!.message).toMatch(/lacks spines, pool/);
    expect(issues[0]!.message).toMatch(/with its shapes/);
  });

  it('asks the body where the eyes and the sigil stand: its `head` and `vfx_origin` anchors', () => {
    const noAnchors = WHOLE.map((s) => (s.id === 'body' ? sprite('body', ['enemy:ink_slime', 'part:body'], 4) : s));
    const messages = enemyArtIssues(pack(noAnchors));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ level: 'warn', path: 'sprites.body' });
    expect(messages[0]!.message).toMatch(/"head" and "vfx_origin" anchors/);
    const onlyHead = WHOLE.map((s) => (s.id === 'body' ? sprite('body', ['enemy:ink_slime', 'part:body'], 4, { head: [0.2, 0.4] }) : s));
    expect(enemyArtIssues(pack(onlyHead))[0]!.message).toMatch(/"vfx_origin" anchor /);
  });

  it('warns of a bristle with fewer frames than states, two sets for one part and frames that are never drawn; a body may have as many frames as it likes (they are a loop)', () => {
    const messages = enemyArtIssues(
      pack([
        sprite('body', ['enemy:ink_slime', 'part:body'], 7, ANCHORS),
        sprite('flash', ['enemy:ink_slime', 'part:flash'], 2),
        sprite('eyes', ['enemy:ink_slime', 'part:eyes']),
        sprite('eyes_two', ['enemy:ink_slime', 'part:eyes']),
        sprite('sigil', ['enemy:ink_slime', 'part:sigil']),
        sprite('spines', ['enemy:ink_slime', 'part:spines'], 1),
        sprite('pool', ['enemy:ink_slime', 'part:pool']),
      ]),
    ).map((i) => `${i.level} ${i.path}: ${i.message}`);
    expect(messages.join('\n')).toMatch(/warn sprites.spines: the bristle has 1 frame and the game shows it in 3 states/);
    expect(messages.join('\n')).toMatch(/warn sprites.eyes_two: claims the same part as eyes/);
    expect(messages.join('\n')).toMatch(/warn sprites.flash: a flash has 1 picture: the 1 after it are never drawn/);
    expect(messages.join('\n')).not.toMatch(/sprites.body/);
  });

  it('refuses what cannot be drawn: a tag that names no part, a part with no idle clip', () => {
    const issues = enemyArtIssues(pack([sprite('a', ['enemy:ink_slime', 'part:tail']), sprite('b', ['enemy:ink_slime', 'part:eyes'], 0)]));
    expect(issues.filter((i) => i.level === 'error').map((i) => i.path).sort()).toEqual(['sprites.a', 'sprites.b']);
  });

  it('does not look at a pack that still awaits its art', () => {
    expect(enemyArtIssues({ id: 'x', status: 'awaiting-art', sprites: [sprite('a', ['enemy:ink_slime', 'part:tail'])] as never })).toEqual([]);
  });

  it('knows how many pictures the game draws of each part', () => {
    expect(enemyFramesNeeded('body')).toBeNull();
    expect(enemyFramesNeeded('spines')).toBe(SPINE_FRAMES);
    for (const p of ['flash', 'eyes', 'sigil', 'pool'] as const) expect(enemyFramesNeeded(p)).toBe(1);
  });
});
