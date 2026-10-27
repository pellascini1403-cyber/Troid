import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/content';
import { hasBrain, type Archetype } from '@/enemies/archetypes';

/** Every way of behaving the definitions can ask for has a brain, once the content is in (docs/PROMPT21-LOG.md): the compiler no longer checks a `switch`, this does. */
const ALL: readonly Archetype[] = ['slime', 'crawler', 'toad', 'guard', 'spore', 'spitter', 'bat', 'wisp', 'toller', 'roller', 'piston', 'leech', 'weaver', 'shade'];

describe('the brains', () => {
  it('there is one for each of the fourteen archetypes', () => {
    for (const a of ALL) expect(hasBrain(a), a).toBe(true);
  });

  it('and every enemy of the world asks for one that exists', () => {
    for (const e of Object.values(ENEMIES)) expect(ALL, e.id).toContain(e.ai.archetype);
    expect(new Set(Object.values(ENEMIES).map((e) => e.ai.archetype)).size).toBe(14);
  });
});
