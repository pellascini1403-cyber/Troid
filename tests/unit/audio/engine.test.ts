import { describe, expect, it } from 'vitest';
import { makeRig, type Rig } from '../../helpers/audioRig';
import { FakeGain, type FakeBiquad, type FakeConvolver, type FakePanner, type FakeSource } from '../../helpers/fakeAudio';

/** A rig whose engine runs and whose `core` sounds are in. */
async function running(options: Parameters<typeof makeRig>[0] = {}): Promise<Rig> {
  const rig = makeRig(options);
  rig.start();
  await rig.loader.retain('core');
  return rig;
}

/** The sources of sounds (not of loops, and not the one-sample silence that unlocks iOS). */
const sourcesOf = (rig: Rig): FakeSource[] => rig.ctx.sources.filter((s) => !s.loop && (s.buffer?.length ?? 0) > 1);

describe('AudioEngine: the browser\'s rules', () => {
  it('lets every sound go until a gesture has unlocked it, and counts them', () => {
    const rig = makeRig({ context: { blocked: true } });
    expect(rig.engine.state).toBe('locked');
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    expect(rig.engine.stats().dropped.locked).toBe(1);
    expect(rig.ctx.nodes).toHaveLength(1); // only the destination: no context graph is built before a gesture
  });

  it('stays locked when the browser refuses to run the context, and runs on the next gesture that it accepts', async () => {
    const rig = makeRig({ context: { blocked: true } });
    const runs: number[] = [];
    rig.engine.onRunning(() => runs.push(1));
    rig.engine.unlock();
    expect(rig.engine.state).toBe('locked');
    expect(rig.ctx.resumes).toBe(1);
    rig.ctx.allow();
    rig.engine.unlock();
    expect(rig.engine.state).toBe('running');
    expect(runs).toHaveLength(1);
    rig.engine.unlock(); // a third gesture wakes nothing
    expect(runs).toHaveLength(1);
    expect(rig.ctx.resumes).toBe(2);
  });

  it('makes one context, however many gestures there are', () => {
    const rig = makeRig();
    let made = 0;
    const again = makeRig({ engine: { createContext: () => { made++; return rig.ctx.asAudioContext(); } } });
    for (let i = 0; i < 5; i++) again.engine.unlock();
    expect(made).toBe(1);
  });

  it('reports itself unsupported — and plays nothing, without throwing — when there is no audio at all', () => {
    const warnings: string[] = [];
    const rig = makeRig({ engine: { createContext: () => { throw new Error('this browser has no Web Audio'); }, warn: (m) => warnings.push(m) } });
    rig.engine.unlock();
    expect(rig.engine.state).toBe('unsupported');
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    expect(warnings[0]).toMatch(/no Web Audio/);
    rig.engine.unlock();
    expect(warnings).toHaveLength(1);
  });

  it('survives a graph that cannot be built', () => {
    const rig = makeRig();
    rig.ctx.createDynamicsCompressor = () => { throw new Error('no compressor'); };
    rig.engine.unlock();
    expect(rig.engine.state).toBe('unsupported');
  });

  it('is frozen with the page in the background and thawed when it returns, and says so', async () => {
    const rig = await running();
    const states: string[] = [];
    rig.engine.onState((s) => states.push(s));
    rig.engine.setHidden(true);
    await rig.settle();
    expect(rig.ctx.state).toBe('suspended');
    expect(rig.engine.state).toBe('suspended');
    rig.engine.setHidden(false);
    await rig.settle();
    expect(rig.engine.state).toBe('running');
    expect(states).toEqual(['suspended', 'running']);
  });
});

describe('AudioEngine: playing a sound', () => {
  it('plays a loaded sound through its bus and cleans up every node when it ends', async () => {
    const rig = await running();
    const before = rig.ctx.nodes.filter((n) => n.connected).length;
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(true);
    const [src] = sourcesOf(rig);
    expect(src?.startedAt).not.toBeNull();
    expect(rig.ctx.audibleGain(src as FakeSource)).toBeGreaterThan(0);
    expect(rig.engine.stats().voices).toBe(1);
    rig.ctx.advance(1);
    expect(rig.engine.liveVoices).toBe(0);
    expect(rig.engine.stats().voices).toBe(0);
    expect(rig.ctx.nodes.filter((n) => n.connected).length).toBe(before); // nothing is left connected
  });

  it('drops, and counts by reason, what cannot be played: a sound that is not in the manifest, one that is not loaded', async () => {
    const rig = await running();
    expect(rig.engine.play({ id: 'no.such.sound' })).toBe(false);
    expect(rig.engine.play({ id: 'boss.roar' })).toBe(false); // its group was never fetched
    const d = rig.engine.stats().dropped;
    expect(d.unknown).toBe(1);
    expect(d.notLoaded).toBe(1);
  });

  it('keeps a sound from repeating faster than its cooldown', async () => {
    const rig = await running();
    expect(rig.engine.play({ id: 'hero.step' })).toBe(true);
    rig.ctx.advance(0.03);
    expect(rig.engine.play({ id: 'hero.step' })).toBe(false);
    expect(rig.engine.stats().dropped.cooldown).toBe(1);
    rig.ctx.advance(0.05);
    expect(rig.engine.play({ id: 'hero.step' })).toBe(true);
  });

  it('gives a sound no more voices than the manifest allows: a new one takes the place of the oldest', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.ctx.advance(0.01);
    rig.engine.play({ id: 'hero.slash' });
    rig.ctx.advance(0.01);
    expect(rig.engine.stats().active['hero.slash']).toBe(2);
    rig.engine.play({ id: 'hero.slash' });
    const s = rig.engine.stats();
    expect(s.active['hero.slash']).toBe(2); // voices: 2
    expect(s.stolen).toBe(1);
    // the oldest was faded out (not cut) and stops a few milliseconds later
    const [oldest] = sourcesOf(rig);
    expect((oldest as FakeSource).stoppedAt).not.toBeNull();
    expect((oldest as FakeSource).stoppedAt as number).toBeGreaterThan(rig.ctx.currentTime);
  });

  it('keeps the whole game under its limit, giving way to the sound that matters more', async () => {
    const rig = await running({ engine: { maxVoices: 3 } });
    // three footsteps (priority 2, three voices) fill it; a slash (7) takes the weakest one's place, then a hit (8) another
    for (let i = 0; i < 3; i++) {
      rig.engine.play({ id: 'hero.step' });
      rig.ctx.advance(0.08);
    }
    expect(rig.engine.stats().voices).toBe(3);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(true);
    expect(rig.engine.stats().voices).toBe(3);
    expect(rig.engine.stats().active['hero.step']).toBe(2);
    expect(rig.engine.play({ id: 'hit.heavy' })).toBe(true);
    expect(rig.engine.stats().voices).toBe(3);
    expect(rig.engine.stats().active['hero.step']).toBe(1);
    expect(rig.engine.stats().stolen).toBe(2);
    // the oldest of the weakest went first: the first footstep is the one that was faded out
    expect(sourcesOf(rig)[0]?.stoppedAt).not.toBeNull();
    expect(sourcesOf(rig)[2]?.stoppedAt).toBeNull();
  });

  it('drops a newcomer that matters less than every voice that is playing, and says the mix was full', async () => {
    const rig = await running({ engine: { maxVoices: 2 } });
    rig.engine.play({ id: 'hit.heavy' }); // 8
    rig.engine.play({ id: 'hero.slash' }); // 7
    expect(rig.engine.play({ id: 'hero.step' })).toBe(false); // 2
    expect(rig.engine.stats().dropped.full).toBe(1);
    expect(rig.engine.stats().voices).toBe(2);
  });

  it('never picks the same variation twice in a row, and honours a variation that is asked for', async () => {
    const rig = await running();
    let previous: unknown = null;
    for (let i = 0; i < 40; i++) {
      rig.engine.play({ id: 'hero.slash' });
      const src = sourcesOf(rig).at(-1) as FakeSource;
      expect(src.buffer).not.toBe(previous);
      previous = src.buffer;
      rig.ctx.advance(1);
    }
    const seen = new Set<unknown>();
    for (let i = 0; i < 40; i++) {
      rig.engine.play({ id: 'hero.slash' });
      seen.add(sourcesOf(rig).at(-1)?.buffer);
      rig.ctx.advance(1);
    }
    expect(seen.size).toBe(3); // all three are used
    const pinned = rig.loader.get('hero.slash')[1];
    rig.engine.play({ id: 'hero.slash', variant: 1 });
    expect(sourcesOf(rig).at(-1)?.buffer).toBe(pinned);
  });

  it('varies each play a little in pitch and level, inside what the manifest says, and not at all for a sound that says nothing', async () => {
    const rig = await running();
    const rates = new Set<number>();
    const gains = new Set<number>();
    for (let i = 0; i < 30; i++) {
      rig.engine.play({ id: 'hero.slash' });
      const src = sourcesOf(rig).at(-1) as FakeSource;
      rates.add(src.playbackRate.value);
      const g = (src.outputs[0] as FakeGain).gain.value;
      gains.add(g);
      expect(src.playbackRate.value).toBeGreaterThanOrEqual(2 ** (-100 / 1200) - 1e-9);
      expect(src.playbackRate.value).toBeLessThanOrEqual(2 ** (100 / 1200) + 1e-9);
      expect(g).toBeGreaterThanOrEqual(10 ** (-1 / 20) - 1e-9);
      expect(g).toBeLessThanOrEqual(10 ** (1 / 20) + 1e-9);
      rig.ctx.advance(1);
    }
    expect(rates.size).toBeGreaterThan(10);
    expect(gains.size).toBeGreaterThan(10);
    rig.engine.play({ id: 'hit.heavy' });
    const plain = sourcesOf(rig).at(-1) as FakeSource;
    expect(plain.playbackRate.value).toBe(1);
    expect((plain.outputs[0] as FakeGain).gain.value).toBe(1);
  });

  it('adds what the game asks (a trim in dB, a speed) on top of the sound\'s own', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hit.heavy', gainDb: -6.0206, rate: 1.5 });
    const src = sourcesOf(rig).at(-1) as FakeSource;
    expect(src.playbackRate.value).toBeCloseTo(1.5, 6);
    expect((src.outputs[0] as FakeGain).gain.value).toBeCloseTo(0.5, 3);
  });

  it('starts a sound later when asked to', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hit.heavy', delay: 0.25 });
    expect((sourcesOf(rig).at(-1) as FakeSource).startedAt).toBeCloseTo(rig.ctx.currentTime + 0.25, 6);
  });
});

describe('AudioEngine: where a sound is', () => {
  it('pans a sound toward the side it happened on and makes it quieter the farther it was', async () => {
    const rig = await running();
    rig.engine.setListener(10, 0);
    rig.engine.play({ id: 'hit.heavy', at: { x: 17, y: 0 } });
    const right = sourcesOf(rig).at(-1) as FakeSource;
    const rightGain = (right.outputs[0] as FakeGain).gain.value;
    const panner = (right.outputs[0] as FakeGain).outputs.find((n) => n.kind === 'panner') as FakePanner;
    expect(panner.pan.value).toBeGreaterThan(0);
    rig.ctx.advance(1);
    rig.engine.play({ id: 'hit.heavy', at: { x: -30, y: 0 } });
    const left = sourcesOf(rig).at(-1) as FakeSource;
    const leftGain = (left.outputs[0] as FakeGain).gain.value;
    const lp = (left.outputs[0] as FakeGain).outputs.find((n) => n.kind === 'panner') as FakePanner;
    expect(lp.pan.value).toBeLessThan(0);
    expect(leftGain).toBeLessThan(rightGain); // 40 m away against 10 m
    expect(rightGain).toBe(1);
  });

  it('plays what has no place in the middle, at full strength, and does not pan a stereo file', async () => {
    const rig = await running();
    rig.engine.setListener(0, 0);
    rig.engine.play({ id: 'hit.heavy' });
    const centre = sourcesOf(rig).at(-1) as FakeSource;
    expect((centre.outputs[0] as FakeGain).outputs.some((n) => n.kind === 'panner')).toBe(false);
    rig.engine.play({ id: 'wide.thing', at: { x: 30, y: 0 } });
    const wide = sourcesOf(rig).at(-1) as FakeSource;
    expect((wide.outputs[0] as FakeGain).outputs.some((n) => n.kind === 'panner')).toBe(false);
    expect((wide.outputs[0] as FakeGain).gain.value).toBe(1);
  });
});

describe('AudioEngine: the player\'s volumes', () => {
  it('does not start a sound of a category whose volume is zero, and counts it as silent', async () => {
    const rig = await running({ levels: { sfx: 0 } });
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    expect(rig.engine.play({ id: 'ui.tap' })).toBe(false); // the interface follows the effects
    expect(rig.engine.stats().dropped.silent).toBe(2);
    expect(rig.ctx.sources.filter((s) => !s.loop && s.buffer && s.buffer.length > 1)).toHaveLength(0);
  });

  it('silences everything with the general volume at zero, and brings it back', async () => {
    const rig = await running();
    rig.levels.set('master', 0);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    rig.levels.set('master', 0.5);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(true);
  });

  it('puts the amplitude of each bus where the level says, at once, and the general volume on its own node', async () => {
    const rig = await running({ levels: { master: 0.5, music: 0.5, sfx: 1, ambience: 0.25 } });
    await rig.loader.retain('boss');
    rig.engine.play({ id: 'boss.roar' }); // two seconds long: still there when we look
    const src = sourcesOf(rig).at(-1) as FakeSource;
    // source → voice gain → effects bus → world gate → general → limiter → make-up → destination
    expect(rig.ctx.audibleGain(src)).toBeCloseTo(0.25 /* general */ * 1 /* effects */, 3);
    rig.levels.set('sfx', 0.5);
    rig.ctx.advance(0.15);
    expect(rig.ctx.audibleGain(src)).toBeCloseTo(0.25 * 0.25, 3);
    rig.levels.set('master', 1);
    rig.ctx.advance(0.15);
    expect(rig.ctx.audibleGain(src)).toBeCloseTo(1 * 0.25, 3);
  });

  it('lets go of the voices of a category the moment its volume goes to zero, and of no other', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.engine.play({ id: 'ui.tap' });
    rig.levels.set('sfx', 0);
    const [slash, tap] = sourcesOf(rig) as [FakeSource, FakeSource];
    expect(slash.stoppedAt).not.toBeNull();
    expect(tap.stoppedAt).not.toBeNull(); // the interface follows the effects
    expect(rig.engine.stats().voices).toBe(0);
    rig.ctx.advance(0.5);
    expect(rig.engine.liveVoices).toBe(0);
  });

  it('leaves the effects alone when the music level moves', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.levels.set('music', 0);
    expect(rig.engine.stats().voices).toBe(1);
  });
});

describe('AudioEngine: pause', () => {
  it('silences the world — its voices stop, its sounds are not started — and leaves the interface its voice', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.engine.play({ id: 'hit.heavy' });
    rig.engine.setPaused(true);
    expect(rig.engine.stats().voices).toBe(0);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    expect(rig.engine.stats().dropped.paused).toBe(1);
    expect(rig.engine.play({ id: 'ui.tap' })).toBe(true);
    const shut = rig.ctx.nodes.filter((n) => n instanceof FakeGain && n.gain.valueAt(rig.ctx.currentTime + 1) < 1e-6 && n.outputs.length === 1);
    expect(shut.length).toBeGreaterThanOrEqual(1); // the gate the world's buses pass through, and the two voices that were faded out
    const tap = sourcesOf(rig).at(-1) as FakeSource;
    expect(rig.ctx.audibleGain(tap, rig.ctx.currentTime + 0.01)).toBeGreaterThan(0.1); // the interface is not behind the gate
  });

  it('dims and dulls the music while it waits, and gives it back — all at once, none abruptly', async () => {
    const rig = await running();
    const colour = rig.ctx.nodes.find((n): n is FakeBiquad => n.kind === 'biquad') as FakeBiquad;
    const duck = rig.ctx.nodes.find((n): n is FakeGain => n.kind === 'gain' && n.outputs.includes(colour)) as FakeGain;
    const t0 = rig.ctx.currentTime;
    expect(colour.frequency.valueAt(t0)).toBeGreaterThan(20000);
    rig.engine.setPaused(true);
    expect(Math.abs(colour.frequency.valueAt(t0 + 1) - 1100)).toBeLessThan(5);
    expect(duck.gain.valueAt(t0 + 2)).toBeCloseTo(10 ** (-8 / 20), 2);
    // the way down is smooth: no step between two samples 10 ms apart is larger than a tenth
    let previous = duck.gain.valueAt(t0);
    for (let t = t0 + 0.01; t < t0 + 1; t += 0.01) {
      const v = duck.gain.valueAt(t);
      expect(Math.abs(v - previous)).toBeLessThan(0.1);
      previous = v;
    }
    rig.ctx.advance(2);
    rig.engine.setPaused(false);
    const t1 = rig.ctx.currentTime;
    expect(duck.gain.valueAt(t1 + 3)).toBeCloseTo(1, 2);
    expect(colour.frequency.valueAt(t1 + 3)).toBeGreaterThan(20000);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(true);
  });

  it('is idempotent: pausing twice, or resuming without having paused, changes nothing', async () => {
    const rig = await running();
    rig.engine.setPaused(false);
    rig.engine.setPaused(true);
    rig.engine.setPaused(true);
    expect(rig.engine.isPaused).toBe(true);
    rig.engine.setPaused(false);
    rig.engine.setPaused(false);
    expect(rig.engine.isPaused).toBe(false);
  });

  it('pauses a game that was paused before the context existed', () => {
    const rig = makeRig({ context: { blocked: true } });
    rig.engine.setPaused(true);
    rig.start();
    const gate = rig.ctx.nodes.filter((n): n is FakeGain => n.kind === 'gain').find((g) => g.gain.value === 0 && g.outputs.length === 1);
    expect(gate).toBeDefined();
    expect(rig.engine.isPaused).toBe(true);
  });
});

describe('AudioEngine: the music under the effects', () => {
  it('lowers the music for a loud sound and gives it back when the sound is over', async () => {
    const rig = await running();
    const colour = rig.ctx.nodes.find((n): n is FakeBiquad => n.kind === 'biquad') as FakeBiquad;
    const duck = rig.ctx.nodes.find((n): n is FakeGain => n.kind === 'gain' && n.outputs.includes(colour)) as FakeGain;
    rig.engine.play({ id: 'hit.heavy' }); // duck −3 dB for 200 ms
    const t = rig.ctx.currentTime;
    expect(duck.gain.valueAt(t + 0.15)).toBeCloseTo(10 ** (-3 / 20), 1);
    rig.ctx.advance(0.3);
    rig.engine.tick();
    expect(duck.gain.valueAt(rig.ctx.currentTime + 1.5)).toBeCloseTo(1, 2);
  });

  it('takes the deepest of the things that lower it, not their sum', async () => {
    const rig = await running();
    const colour = rig.ctx.nodes.find((n): n is FakeBiquad => n.kind === 'biquad') as FakeBiquad;
    const duck = rig.ctx.nodes.find((n): n is FakeGain => n.kind === 'gain' && n.outputs.includes(colour)) as FakeGain;
    rig.engine.setPaused(true); // −8 dB
    rig.engine.duckMusic(-3, 500); // shallower: does not add
    expect(duck.gain.valueAt(rig.ctx.currentTime + 3)).toBeCloseTo(10 ** (-8 / 20), 2);
    rig.engine.setMusicMood('death', true); // −13 dB
    expect(duck.gain.valueAt(rig.ctx.currentTime + 3)).toBeCloseTo(10 ** (-13 / 20), 2);
    rig.engine.setMusicMood('death', false);
    expect(duck.gain.valueAt(rig.ctx.currentTime + 3)).toBeCloseTo(10 ** (-8 / 20), 2);
  });
});

describe('AudioEngine: the echo of the room', () => {
  const hall = { rt60: 1.2, damp: 0.5, predelayMs: 10, wet: 0.4 };

  it('makes a convolver with an impulse made for the room and sends the sounds to it', async () => {
    const rig = await running();
    rig.engine.setRoom(hall);
    const conv = rig.ctx.nodes.find((n): n is FakeConvolver => n.kind === 'convolver') as FakeConvolver;
    expect(conv.buffer?.numberOfChannels).toBe(2);
    expect(conv.buffer?.duration).toBeCloseTo(1.2 * 1.15, 1);
    expect(conv.normalize).toBe(false);
    rig.engine.play({ id: 'hero.step' }); // reverb 0.25
    const src = sourcesOf(rig).at(-1) as FakeSource;
    const voiceGain = src.outputs[0] as FakeGain;
    expect(voiceGain.outputs).toHaveLength(2); // the effects bus and the send to the echo
    const send = voiceGain.outputs[1] as FakeGain;
    expect(send.gain.value).toBeCloseTo(0.25, 6);
    // the room's own level is on the convolver's output
    const out = conv.outputs[0] as FakeGain;
    expect(out.gain.valueAt(rig.ctx.currentTime + 3)).toBeCloseTo(0.4, 2);
  });

  it('sends nothing to a place with no echo, nor the interface, nor the music', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.step' });
    expect(((sourcesOf(rig).at(-1) as FakeSource).outputs[0] as FakeGain).outputs).toHaveLength(1); // only the bus
    rig.engine.setRoom(hall);
    rig.engine.play({ id: 'ui.tap' });
    expect(((sourcesOf(rig).at(-1) as FakeSource).outputs[0] as FakeGain).outputs).toHaveLength(1);
  });

  it('changes the echo with a crossfade, and lets the old one go afterwards instead of keeping it', async () => {
    const rig = await running();
    rig.engine.setRoom(hall);
    rig.engine.setRoom({ ...hall, rt60: 2.2 });
    const convs = rig.ctx.nodes.filter((n): n is FakeConvolver => n.kind === 'convolver');
    expect(convs).toHaveLength(2);
    expect((convs[0]?.outputs[0] as FakeGain).gain.valueAt(rig.ctx.currentTime + 3)).toBeCloseTo(0, 2);
    rig.ctx.advance(2);
    rig.engine.tick();
    expect(convs[0]?.connected).toBe(false);
    expect(convs[1]?.connected).toBe(true);
    rig.engine.setRoom(null);
    rig.ctx.advance(2);
    rig.engine.tick();
    expect(convs[1]?.connected).toBe(false);
  });

  it('builds the echo that was asked for before the context existed', () => {
    const rig = makeRig({ context: { blocked: true } });
    rig.engine.setRoom(hall);
    rig.start();
    expect(rig.ctx.nodes.some((n) => n.kind === 'convolver')).toBe(true);
  });
});

describe('AudioEngine: observing it and putting it away', () => {
  it('reads the level of the output through its meter', async () => {
    const rig = await running();
    const analyser = rig.ctx.nodes.find((n) => n.kind === 'analyser') as unknown as { level: number };
    analyser.level = 0.25;
    const m = rig.engine.meter();
    expect(m?.rms).toBeCloseTo(0.25, 6);
    expect(m?.peak).toBeCloseTo(0.25, 6);
    expect(makeRig({ engine: { meter: false } }).engine.meter()).toBeNull();
  });

  it('keeps the last sounds it played and the most voices it ever had', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hit.heavy' });
    rig.engine.play({ id: 'hero.slash' });
    const s = rig.engine.stats();
    expect(s.recent).toEqual(['hit.heavy', 'hero.slash']);
    expect(s.peakVoices).toBe(2);
    expect(s.played).toBe(2);
  });

  it('stops everything when asked, or only a bus', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.engine.play({ id: 'ui.tap' });
    rig.engine.stopAll('ui');
    expect(rig.engine.stats().voices).toBe(1);
    rig.engine.stopAll();
    expect(rig.engine.stats().voices).toBe(0);
  });

  it('is put away cleanly: voices stopped, the context closed, nothing played after', async () => {
    const rig = await running();
    rig.engine.play({ id: 'hero.slash' });
    rig.engine.dispose();
    expect(rig.ctx.state).toBe('closed');
    expect(rig.engine.liveVoices).toBe(0);
    expect(rig.engine.play({ id: 'hero.slash' })).toBe(false);
    expect(() => rig.engine.dispose()).not.toThrow();
    expect(() => rig.engine.unlock()).not.toThrow();
    expect(() => rig.levels.set('sfx', 0.1)).not.toThrow();
  });

  it('leaves no node connected after thousands of sounds', async () => {
    const rig = await running();
    const baseline = rig.ctx.nodes.filter((n) => n.connected).length;
    for (let i = 0; i < 400; i++) {
      rig.engine.play({ id: i % 2 ? 'hero.slash' : 'hit.heavy', at: { x: i % 40, y: 0 } });
      rig.ctx.advance(0.05);
    }
    rig.ctx.advance(2);
    expect(rig.engine.liveVoices).toBe(0);
    expect(rig.ctx.nodes.filter((n) => n.connected).length).toBe(baseline);
  });
});
