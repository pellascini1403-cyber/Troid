import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ci = readFileSync(`${root}.github/workflows/ci.yml`, 'utf8');

/** The text of each job of the workflow, by name (a job starts at two spaces of indentation under `jobs:`; the comments above it belong to the job before it, which does no harm to what is looked for here). */
function jobs(): Record<string, string> {
  const body = ci.slice(ci.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const out: Record<string, string> = {};
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):\s*$/gm)];
  heads.forEach((h, i) => {
    out[h[1]!] = body.slice(h.index!, heads[i + 1]?.index ?? body.length);
  });
  return out;
}

describe('the workflow of the CI keeps what Prompt 25 made of it (docs/PROMPT25-LOG.md)', () => {
  const all = jobs();

  it('skips a commit that only touches the documentation, and never one that touches anything a test reads', () => {
    const list = /^ {4}paths-ignore: \[(.*)\]\s*$/m.exec(ci)?.[1];
    expect(list, 'the push trigger has a paths-ignore list').toBeDefined();
    const ignored = list!.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    // exactly the documentation: widening it (`**/*.md` would swallow the READMEs of `art/` that the tools' tests read, `*.json` the manifests) is a decision that goes through this test
    expect(ignored).toEqual(['docs/**', 'README.md']);
    // and nothing in `docs/` or the root README is an input of a test (they are named in comments, and read by nobody)
    expect(ci).not.toMatch(/paths-ignore:[^\n]*(src|tests|tools|\.github|package|public|art)/);
  });

  it('has the jobs it is known by', () => {
    expect(Object.keys(all).sort()).toEqual(['budget', 'check', 'e2e', 'engines']);
  });

  it('gives every job a time limit: a hung test is a stop that says so, not six hours of a runner', () => {
    for (const [name, text] of Object.entries(all)) expect(text, `job "${name}"`).toMatch(/timeout-minutes:\s*\d+/);
  });

  it('gives the token the right to read the repository and nothing else', () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(ci).not.toMatch(/contents:\s*write|permissions:\s*write-all/);
  });

  it('measures the cold-start budget in a job of its own, and none of the groups of scenes waits for it or carries it', () => {
    expect(all['budget']).toMatch(/npm run build/);
    expect(all['budget']).toMatch(/npm run bench:bundle/);
    // (a spent budget that stopped the first step of five jobs would hide what their scenes find)
    expect(all['e2e']).not.toMatch(/bench:bundle/);
    expect(all['engines']).not.toMatch(/bench:bundle/);
  });

  it('puts every job after the unit suite except the unit suite itself (no job runs on a base that does not pass)', () => {
    for (const name of ['budget', 'e2e', 'engines']) expect(all[name], `job "${name}"`).toMatch(/needs:\s*check\b/);
    expect(all['check']).not.toMatch(/needs:/);
  });

  it('keeps the screenshots of a group that fails (the failure of a runner may not exist anywhere else)', () => {
    expect(all['e2e']).toMatch(/if:\s*failure\(\)/);
    expect(all['e2e']).toMatch(/upload-artifact@v\d+/);
    expect(all['e2e']).toMatch(/path:\s*\.shots\/e2e\/\*-FAILED\.png/);
    // `.shots` is a hidden folder: without this the action uploads nothing and says nothing
    expect(all['e2e']).toMatch(/include-hidden-files:\s*true/);
  });

  it('installs the browser with a limit for each attempt, because the download sometimes stalls — and a stalled download does not leave the next attempts without the dpkg lock', () => {
    for (const name of ['budget', 'e2e', 'engines']) {
      expect(all[name], `job "${name}"`).toMatch(/timeout --kill-after=\d+ 420 npx playwright-core install/);
      // the run 162 lost its WebKit job to this: `timeout` killed the installer, `apt-get` went on holding the lock, and the two attempts that were left failed in two seconds
      expect(all[name], `job "${name}": apt gives up on a stalled transfer`).toMatch(/Acquire::http::Timeout/);
      expect(all[name], `job "${name}": apt tries a transfer again`).toMatch(/Acquire::Retries/);
      expect(all[name], `job "${name}": apt waits for the lock`).toMatch(/DPkg::Lock::Timeout/);
    }
  });

  it('installs with `npm ci` (the lockfile, to the letter) everywhere and never `npm install`', () => {
    for (const [name, text] of Object.entries(all)) {
      expect(text, `job "${name}"`).toMatch(/npm ci/);
      expect(text, `job "${name}"`).not.toMatch(/npm install/);
    }
  });
});
