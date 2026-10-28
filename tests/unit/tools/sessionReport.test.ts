import { describe, expect, it } from 'vitest';
import { newProgress, serializeProgress, parseProgress, type ProgressData } from '@/save/ProgressData';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { describe as describeSession, report, summarize } from '../../../tools/sessionReport';

/**
 * THE REPORT OF A SESSION (docs/PROMPT22-LOG.md §8): what the people who play the game leave in their saved games — the time by zone, the falls, the time to each guardian — read back as numbers a person can compare. It prints what was counted and nothing more.
 */
const start = { room: 'r1_gate', entry: 'start' };
const game = (over: Partial<ProgressData['stats']>, flags: string[] = []): ProgressData => ({ ...newProgress(start), flags, stats: { ticks: 0, deaths: 0, kills: 0, rooms: ['r1_gate'], ...over } });

describe('the report of a session', () => {
  it('says how long the game was played, where the time went and how long each guardian took to reach, in the order of the world', () => {
    const text = describeSession({
      name: 'a.json',
      data: game({ ticks: 60 * 3600 + 120, deaths: 4, kills: 31, zones: { sunken_roots: 60 * 1200, ancient_forest_ruins: 60 * 600 }, falls: { sunken_roots: 3 }, guardians: { boss_root_tyrant: 60 * 1700, ink_warden: 60 * 900 } }, [COMPLETED_FLAG]),
    });
    expect(text).toContain('COMPLETED · time played 1:00:02 · 4 defeats · 31 enemies');
    expect(text.indexOf('Ruins of the ancient forest')).toBeLessThan(text.indexOf('Sunken Roots'));
    expect(text).toMatch(/Sunken Roots\s+0:20:00\s+3 defeats/);
    expect(text.indexOf('Ink Warden')).toBeLessThan(text.indexOf('Root Tyrant'));
    expect(text).toMatch(/Ink Warden\s+0:15:00/);
  });

  it('says so when a game was saved before the time was counted by zone, and invents nothing', () => {
    const text = describeSession({ name: 'old.json', data: game({ ticks: 600 }) });
    expect(text).toContain('in progress');
    expect(text).toContain('no time by zone');
    expect(text).not.toContain('guardians');
  });

  it('with several games it gives, for each zone, the shortest, the median and the longest time spent in it, and how many people got there', () => {
    const roots = (min: number): ProgressData => game({ ticks: 60 * 60 * min, zones: { sunken_roots: 60 * 60 * min } });
    const text = summarize([{ name: 'a', data: roots(10) }, { name: 'b', data: roots(30) }, { name: 'c', data: roots(20) }]);
    expect(text).toContain('3 sessions');
    expect(text).toMatch(/Sunken Roots\s+0:10:00\s+0:20:00\s+0:30:00\s+\(3\)/);
    expect(summarize([{ name: 'a', data: roots(10) }]), 'one is not a summary').toBe('');
  });

  it('reads what the game exports: the file is the saved game, nothing else, and the report reads it back through the same parser', () => {
    const data = game({ ticks: 7200, zones: { glowmire: 7200 } });
    const back = parseProgress(serializeProgress(data))!;
    expect(report([{ name: 'x.json', data: back }])).toMatch(/Glowmire\s+0:02:00/);
  });
});
