import { describe, expect, it } from 'vitest';
import { WorldFlags } from '@/progression/WorldFlags';

function make() {
  const events: Array<[string, string]> = [];
  const flags = new WorldFlags({ emit: (type, payload) => void events.push([type, payload.flag]) });
  return { flags, events };
}

describe('WorldFlags (the memory that outlives rooms and deaths)', () => {
  it('starts empty and answers has()', () => {
    const { flags } = make();
    expect(flags.has('defeated:r1_slime')).toBe(false);
    expect(flags.list()).toEqual([]);
  });

  it('set() announces once: setting a flag that is already set is a silent no-op', () => {
    const { flags, events } = make();
    expect(flags.set('a')).toBe(true);
    expect(flags.set('a')).toBe(false);
    expect(flags.has('a')).toBe(true);
    expect(events).toEqual([['flag:set', 'a']]);
  });

  it('clear() announces once and only for a flag that was set', () => {
    const { flags, events } = make();
    expect(flags.clear('a')).toBe(false);
    flags.set('a');
    expect(flags.clear('a')).toBe(true);
    expect(flags.clear('a')).toBe(false);
    expect(flags.has('a')).toBe(false);
    expect(events).toEqual([['flag:set', 'a'], ['flag:cleared', 'a']]);
  });

  it('list() is sorted: a stable snapshot for saves and tests, whatever the order they were set in', () => {
    const { flags } = make();
    for (const f of ['pickup:r03_bolt', 'defeated:r1_slime', 'seal:r02_door']) flags.set(f);
    expect(flags.list()).toEqual(['defeated:r1_slime', 'pickup:r03_bolt', 'seal:r02_door']);
  });

  it('restore() replaces the state without announcing it (loading a save is not an event)', () => {
    const { flags, events } = make();
    flags.set('old');
    events.length = 0;
    flags.restore(['x', 'y']);
    expect(flags.list()).toEqual(['x', 'y']);
    expect(flags.has('old')).toBe(false);
    expect(events).toEqual([]);
  });

  it('works without anyone listening', () => {
    const flags = new WorldFlags();
    expect(flags.set('a')).toBe(true);
    expect(flags.has('a')).toBe(true);
  });
});
