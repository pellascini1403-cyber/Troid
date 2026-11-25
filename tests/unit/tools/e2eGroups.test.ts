import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GROUPS } from '../../../tools/e2e/groups';
import { ALL } from '../../../tools/e2e/registry';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ci = readFileSync(`${root}.github/workflows/ci.yml`, 'utf8');

describe('the CI runs the whole end-to-end suite (docs/PROMPT25-LOG.md)', () => {
  const names = ALL.map((s) => s.name);

  it('has no two scenes with the same name', () => {
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('gives every scene of the registry to exactly one group', () => {
    const given = Object.values(GROUPS).flat();
    expect(names.filter((n) => !given.includes(n)), 'scenes no CI job runs').toEqual([]);
    expect(given.filter((n) => !names.includes(n)), 'names in a group that are not scenes').toEqual([]);
    expect(given.filter((n, i) => given.indexOf(n) !== i), 'scenes given to two groups').toEqual([]);
  });

  it('has no empty group', () => {
    for (const [name, scenes] of Object.entries(GROUPS)) expect(scenes.length, `group ${name}`).toBeGreaterThan(0);
  });

  it('is run, every group, by the workflow of the CI', () => {
    for (const name of Object.keys(GROUPS)) expect(ci, `ci.yml runs the group "${name}"`).toMatch(new RegExp(`name:\\s*${name}\\b`));
    // the workflow does not keep a list of scenes of its own (the lists would drift from the groups): it asks for a group by name
    expect(ci).toMatch(/--group=\$\{\{ matrix\.group\.name \}\}/);
    expect(ci).not.toMatch(/--only=/);
  });
});
