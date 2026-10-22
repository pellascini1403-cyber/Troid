import { describe, expect, it } from 'vitest';
import { LoopChannel } from '@/audio/loops';
import { makeRig, type Rig } from '../../helpers/audioRig';
import { FakeGain, type FakeSource } from '../../helpers/fakeAudio';

function channel(rig: Rig, bus: 'music' | 'ambience' = 'music', warn?: (m: string) => void): LoopChannel {
  return new LoopChannel({ engine: rig.engine, loader: rig.loader, index: rig.index, levels: rig.levels, bus, warn });
}

/** The looped sources that exist and have not ended. */
const loops = (rig: Rig): FakeSource[] => rig.ctx.sources.filter((s) => s.loop && !s.ended && s.startedAt !== null && s.outputs.length > 0);

/** Lets time pass in steps of the engine's frames, ticking each one. */
function run(rig: Rig, seconds: number, step = 0.05): void {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    rig.ctx.advance(step);
    rig.engine.tick();
  }
}

describe('LoopChannel: music that waits for a gesture', () => {
  it('remembers the piece it was asked for and loads and plays nothing until the engine runs', async () => {
    const rig = makeRig({ context: { blocked: true } });
    const music = channel(rig);
    music.play('a');
    await rig.settle();
    expect(rig.fetched).toHaveLength(0);
    expect(loops(rig)).toHaveLength(0);
    expect(music.stats().wanted).toBe('a');
    expect(music.stats().current).toBeNull();
    rig.start();
    await rig.settle();
    expect(music.stats().current).toBe('a');
    expect(loops(rig)).toHaveLength(2); // base and drive, together
    expect(rig.fetched.length).toBeGreaterThan(0);
  });

  it('starts every layer of a piece at the same instant, looping over its whole length with no gap', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    const sources = loops(rig);
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map((s) => s.startedAt)).size).toBe(1);
    for (const s of sources) {
      expect(s.loop).toBe(true);
      expect(s.loopStart).toBe(0);
      expect(s.loopEnd).toBeCloseTo(30, 9);
      expect(s.offset).toBe(0);
    }
  });

  it('plays the base at full and keeps the drive layer silent until the game asks for it', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    const [base, drive] = loops(rig) as [FakeSource, FakeSource];
    const baseGain = base.outputs[0] as FakeGain;
    const driveGain = drive.outputs[0] as FakeGain;
    expect(baseGain.gain.valueAt(rig.ctx.currentTime)).toBe(1);
    expect(driveGain.gain.valueAt(rig.ctx.currentTime)).toBe(0);
    music.setLayer('drive', 1, 1);
    expect(driveGain.gain.valueAt(rig.ctx.currentTime + 2)).toBeCloseTo(10 ** (-2 / 20), 2); // the layer's own trim is −2 dB
    expect(music.stats().layers).toEqual({ base: 1, drive: 1 });
    music.setLayer('drive', 0, 4);
    expect(driveGain.gain.valueAt(rig.ctx.currentTime + 8)).toBeLessThan(0.01);
  });

  it('gives a piece started later the drive level the game already asked for', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.setLayer('drive', 0.5);
    music.play('b');
    await rig.settle();
    const drive = loops(rig).find((s) => (s.buffer?.duration ?? 0) === 24 && s !== loops(rig)[0]) as FakeSource;
    expect((drive.outputs[0] as FakeGain).gain.value).toBeCloseTo(0.5, 6);
  });
});

describe('LoopChannel: the music does not restart, and is never twice', () => {
  it('does nothing when it is asked again for the piece that already plays', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    const first = loops(rig);
    const fetches = rig.fetched.length;
    for (let i = 0; i < 5; i++) music.play('a', 1);
    await rig.settle();
    expect(loops(rig)).toEqual(first);
    expect(rig.fetched).toHaveLength(fetches);
    expect(rig.ctx.sources.filter((s) => s.loop)).toHaveLength(2);
  });

  it('crossfades to another piece: the new one rises as the old one falls, with no step, and the old one is let go after', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 4); // the first fade-in is over
    const aBase = loops(rig)[0] as FakeSource;
    const aOut = (aBase.outputs[0] as FakeGain).outputs[0] as FakeGain;
    music.play('b', 3);
    await rig.settle();
    const bBase = loops(rig).find((s) => s.buffer?.duration === 24) as FakeSource;
    const bOut = (bBase.outputs[0] as FakeGain).outputs[0] as FakeGain;
    const t0 = rig.ctx.currentTime;
    expect(aOut.gain.valueAt(t0 - 0.001)).toBeCloseTo(1, 1);
    let prevA = aOut.gain.valueAt(t0);
    let prevB = bOut.gain.valueAt(t0);
    for (let t = t0 + 0.01; t < t0 + 5; t += 0.01) {
      const a = aOut.gain.valueAt(t);
      const b = bOut.gain.valueAt(t);
      expect(Math.abs(a - prevA)).toBeLessThan(0.05); // no jump on the way out
      expect(Math.abs(b - prevB)).toBeLessThan(0.05); // nor on the way in
      prevA = a;
      prevB = b;
    }
    expect(aOut.gain.valueAt(t0 + 4)).toBeLessThan(0.02);
    expect(bOut.gain.valueAt(t0 + 4)).toBeGreaterThan(0.95);
    expect(music.stats().leaving).toEqual(['a']);
    run(rig, 4.5);
    expect(music.stats().leaving).toEqual([]);
    expect(music.stats().current).toBe('b');
    expect(loops(rig)).toHaveLength(2); // only b's layers
    expect(loops(rig).every((s) => s.buffer?.duration === 24)).toBe(true);
    expect(aBase.ended || aBase.stoppedAt !== null).toBe(true);
  });

  it('brings back a piece that is asked for again while it is still fading out, instead of starting a second copy', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 4);
    const original = loops(rig);
    music.play('b', 4);
    await rig.settle();
    run(rig, 1); // a is on its way out
    music.play('a', 2); // the hero turned back
    await rig.settle();
    expect(music.stats().current).toBe('a');
    // no new source of a was made: the ones that were fading are the ones that play
    const aSources = rig.ctx.sources.filter((s) => s.loop && s.buffer?.duration === 30);
    expect(aSources).toHaveLength(2);
    expect(aSources.every((s) => original.includes(s))).toBe(true);
    run(rig, 6);
    expect(music.stats().current).toBe('a');
    expect(music.stats().leaving).toEqual([]);
    expect(loops(rig)).toHaveLength(2);
    expect(loops(rig).every((s) => s.buffer?.duration === 30)).toBe(true);
    const out = (original[0]?.outputs[0] as FakeGain).outputs[0] as FakeGain;
    expect(out.gain.valueAt(rig.ctx.currentTime)).toBeGreaterThan(0.95);
  });

  it('never has more than one copy of a piece, whatever the order of the changes', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    const copies = (seconds: number): number => rig.ctx.sources.filter((s) => s.loop && !s.ended && s.startedAt !== null && s.stoppedAt === null && s.buffer?.duration === seconds).length;
    for (const id of ['a', 'b', 'a', 'a', 'b', 'b', 'a', 'b', 'a']) {
      music.play(id, 1.5);
      await rig.settle();
      run(rig, 0.4);
      // a piece has two layers: two sources is one copy
      expect(copies(30)).toBeLessThanOrEqual(2);
      expect(copies(24)).toBeLessThanOrEqual(2);
    }
    run(rig, 8);
    expect(loops(rig)).toHaveLength(2);
    expect(music.stats().current).toBe('a');
  });

  it('drops a piece that was asked for and replaced before it arrived: only the last one plays', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    music.play('b'); // before a's files are in
    await rig.settle();
    expect(music.stats().current).toBe('b');
    expect(loops(rig).every((s) => s.buffer?.duration === 24)).toBe(true);
    expect(loops(rig)).toHaveLength(2);
    // the group nobody holds is let go after its grace period
    expect(rig.loader.stats().groups['music.a']?.refs).toBe(0);
  });

  it('keeps playing the piece it had when a change is asked for and then taken back before it arrived', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    music.play('b');
    music.play('a'); // changed its mind before b was in
    await rig.settle();
    expect(music.stats().current).toBe('a');
    expect(loops(rig)).toHaveLength(2);
    expect(rig.loader.stats().groups['music.b']?.refs).toBe(0);
  });

  it('fades out and stops everything for null, and starts again from the beginning when asked again', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 2);
    const before = loops(rig);
    music.play(null, 2);
    run(rig, 3);
    expect(loops(rig)).toHaveLength(0);
    expect(music.stats()).toMatchObject({ current: null, wanted: null, leaving: [], sources: 0 });
    music.play('a');
    await rig.settle();
    expect(loops(rig)).toHaveLength(2);
    expect(loops(rig).some((s) => before.includes(s))).toBe(false);
  });
});

describe('LoopChannel: pause, volume and the page in the background', () => {
  it('goes on through a pause — the same sources, never stopped — and the engine only dims it', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 3);
    const before = loops(rig);
    rig.engine.setPaused(true);
    run(rig, 5);
    expect(loops(rig)).toEqual(before);
    expect(before.every((s) => s.stoppedAt === null)).toBe(true);
    rig.engine.setPaused(false);
    run(rig, 1);
    expect(loops(rig)).toEqual(before);
    expect(rig.ctx.sources.filter((s) => s.loop)).toHaveLength(2); // no copy was made by resuming
  });

  it('mutes the ambience of the world in a pause and not the music', async () => {
    const rig = makeRig();
    const music = channel(rig);
    const ambience = channel(rig, 'ambience');
    rig.start();
    music.play('a');
    ambience.play('bed.hall');
    await rig.settle();
    run(rig, 5);
    const musicSource = loops(rig).find((s) => s.buffer?.duration === 30) as FakeSource;
    const bedSource = loops(rig).find((s) => s.buffer?.duration === 20) as FakeSource;
    expect(rig.ctx.audibleGain(bedSource)).toBeGreaterThan(0.1);
    rig.engine.setPaused(true);
    const later = rig.ctx.currentTime + 2;
    expect(rig.ctx.audibleGain(bedSource, later)).toBeLessThan(1e-4);
    expect(rig.ctx.audibleGain(musicSource, later)).toBeGreaterThan(0.1); // dimmed, still there
    expect(loops(rig)).toHaveLength(3); // the bed keeps running behind the gate: it will be where it should be
  });

  it('plays nothing, loads nothing and keeps nothing running while its volume is zero — and plays the wish when the volume comes back', async () => {
    const rig = makeRig({ levels: { music: 0 } });
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    expect(rig.fetched).toHaveLength(0);
    expect(loops(rig)).toHaveLength(0);
    expect(music.stats().wanted).toBe('a');
    rig.levels.set('music', 0.6);
    await rig.settle();
    expect(music.stats().current).toBe('a');
    expect(loops(rig)).toHaveLength(2);
  });

  it('lets a piece go when its volume goes to zero, remembering the wish, and brings it back from the start', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 2);
    const first = loops(rig);
    rig.levels.set('music', 0);
    run(rig, 1);
    expect(loops(rig)).toHaveLength(0);
    expect(music.stats().wanted).toBe('a');
    rig.levels.set('music', 0.5);
    await rig.settle();
    expect(music.stats().current).toBe('a');
    expect(loops(rig).some((s) => first.includes(s))).toBe(false);
    expect(loops(rig)).toHaveLength(2);
  });

  it('is silent for the general volume at zero as well', async () => {
    const rig = makeRig({ levels: { master: 0 } });
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    expect(loops(rig)).toHaveLength(0);
    rig.levels.set('master', 0.4);
    await rig.settle();
    expect(loops(rig)).toHaveLength(2);
  });

  it('does not react to the volume of another category', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    const before = loops(rig);
    rig.levels.set('sfx', 0);
    rig.levels.set('ambience', 0);
    await rig.settle();
    expect(loops(rig)).toEqual(before);
  });

  it('keeps its place through the page going to the background: the clock stops, so does the fade', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    run(rig, 5);
    music.play('b', 4);
    await rig.settle();
    rig.engine.setHidden(true);
    await rig.settle();
    const t = rig.ctx.currentTime;
    rig.ctx.advance(60); // a suspended context's clock does not move
    rig.engine.tick();
    expect(rig.ctx.currentTime).toBe(t);
    expect(music.stats().leaving).toEqual(['a']);
    rig.engine.setHidden(false);
    await rig.settle();
    run(rig, 6);
    expect(music.stats().leaving).toEqual([]);
    expect(music.stats().current).toBe('b');
  });
});

describe('LoopChannel: when the files are not there', () => {
  it('plays nothing, without a sound of complaint from the game, when the piece cannot be fetched', async () => {
    const warnings: string[] = [];
    const rig = makeRig({ failing: ['music.a', 'a_base', 'a_drive'], loader: { warn: (m) => warnings.push(m) } });
    const music = channel(rig, 'music', (m) => warnings.push(m));
    rig.start();
    music.play('a');
    await rig.settle();
    expect(music.stats().current).toBeNull();
    expect(loops(rig)).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    // the other piece is fine
    music.play('b');
    await rig.settle();
    expect(music.stats().current).toBe('b');
  });

  it('plays the layers it has when one is missing', async () => {
    const rig = makeRig({ failing: ['a_drive'] });
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    expect(loops(rig)).toHaveLength(1);
    expect(music.stats().layers).toEqual({ base: 1 });
    expect(() => music.setLayer('drive', 1)).not.toThrow();
  });

  it('ignores a piece the manifest does not have', () => {
    const rig = makeRig();
    const warnings: string[] = [];
    const music = channel(rig, 'music', (m) => warnings.push(m));
    rig.start();
    music.play('nope');
    expect(music.stats().wanted).toBeNull();
    expect(warnings[0]).toMatch(/no piece "nope"/);
  });

  it('releases what it held when it is put away, and ignores everything after', async () => {
    const rig = makeRig();
    const music = channel(rig);
    rig.start();
    music.play('a');
    await rig.settle();
    music.dispose();
    expect(loops(rig)).toHaveLength(0);
    expect(rig.loader.stats().groups['music.a']?.refs).toBe(0);
    music.play('b');
    rig.levels.set('music', 0.2);
    rig.engine.tick();
    await rig.settle();
    expect(loops(rig)).toHaveLength(0);
    expect(() => music.dispose()).not.toThrow();
  });
});

describe('LoopChannel: the ambience bed', () => {
  it('plays a bed under the ambience volume and moves from one to another like the music does', async () => {
    const rig = makeRig({ levels: { master: 1, ambience: 0.5, music: 1 } });
    const ambience = channel(rig, 'ambience');
    rig.start();
    ambience.play('bed.hall', 2);
    await rig.settle();
    run(rig, 3);
    const hall = loops(rig)[0] as FakeSource;
    // the bed's own trim is −3 dB, the bus is at the square of 0.5
    expect(rig.ctx.audibleGain(hall)).toBeCloseTo(10 ** (-3 / 20) * 0.25, 2);
    ambience.play('bed.well', 2);
    await rig.settle();
    run(rig, 4);
    expect(ambience.stats().current).toBe('bed.well');
    expect(loops(rig)).toHaveLength(1);
  });
});
