import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from 'playwright-core';
import { openPage } from '../harness';
import type { Ctx, GameState, Scenario } from '../scenario';

/**
 * THE SOUND OF THE GAME in a real browser (docs/PROMPT18-LOG.md). Everything the unit tests prove about the engine, the loader, the channels and the conductor is proved there against a fake audio context; what is proved HERE
 * is the same against the real one — Chromium's Web Audio, its decoders, its autoplay rule, the page's real keyboard — and what only a real browser can say: that the files decode and loop, that sound comes out of the
 * graph and is stopped by a volume, that a page is silent until it is touched, that a failure of the network leaves the game playing.
 *
 *   A · the page before its first touch and after it: no audio context is made until a key (a browser keeps an untouched page silent; THIS headless Chromium does not — measured: a context made by an untouched page
 *       runs under every `--autoplay-policy` — so the game's own lock is what is proved, and the browser's rule is left to the unit tests' blocked context), the files are decoded all the same, a key unlocks it and the
 *       music starts
 *   B · the loops, with the real decoder and the real loader: they decode to the length they were made at, the engine plays them with the settings of a sample-exact loop, the browser repeats them without a gap, and
 *       their seams are closed — the codec had opened some
 *
 *   C · the sounds, through the real graph: nothing comes out of an idle one, every kind of sound comes out audible, under full scale and in the order of loudness the mix is built on, and each ends
 *   D · the music through the world, with real changes of room: the piece of the ruins goes on through R1 → R2 (a door does not restart it), is crossfaded into the chamber's at R3, never has two copies of
 *       anything, and what the hero has left is let go of from memory
 *   E · the volumes: the gain of a category follows its slider (the square of it), zero is silence and silences only its own category, the general one scales them all
 *
 *   F · the pause: the world's sounds stop and are not started, the music is dimmed and goes on (nothing restarts), the interface still sounds, and the first sounds after the menu are not muffled; a page in the
 *       background is frozen and wakes
 *
 *   G · the choices of the person, through the real menu: the four sliders are heard at once, are saved, and are what the next load starts with; a category left at zero is not fetched or played, and
 *       plays from the moment it is raised
 *
 *   H · the network fails: every sound file refused, only the Opus files refused (the MP3 stand in, and their loops close too), no manifest at all, a file that is not audio, music that is slow to come — the game
 *       goes on playing each time, and says what it could not do
 *   I · a storm of sounds: six hundred requests in one frame never put more than the limit of voices on the graph, every request is accounted for, the output never passes full scale, and everything ends and is
 *       let go
 *
 *   J · the sound of the game as it is played, with the real keyboard: what the hero does and what is done to them, the slime that warns, lunges and falls (and the danger it brings into the music), the boss
 *       that wakes, speaks with its own sounds and its own piece, and falls to a silence and a victory
 *
 * (The sections that follow in this file are added as they are written.) `AUDIO_SECTIONS=C,E npm run test:e2e -- --only=audio` runs only some of them (a sketch of the rest is printed as skipped).
 */
const SIZE = { width: 844, height: 390, dpr: 1 };
/** A key nothing is bound to: the first touch of a person. */
const UNLOCK = 'Digit9';

type Audio = NonNullable<GameState['audio']>;
interface Meter { peak: number; rmsMax: number; rmsMean: number; n: number }
/** What the page asked of a source when it started it (the probe installed before the page's own scripts). */
interface Started { seconds: number; channels: number; loop: boolean; loopStart: number; loopEnd: number; rate: number }
interface Probe { contexts: number; rates: number[]; offline: number; starts: Started[] }

interface IndexFile {
  sounds: Record<string, { group: string; bus: string; gainDb: number; loop?: { start: number; end: number }; variants: Array<{ opus: string; mp3: string; seconds: number }> }>;
  tracks: Record<string, { group: string; layers: Record<string, string>; seconds: number }>;
}
const INDEX = JSON.parse(readFileSync('public/audio/index.json', 'utf8')) as IndexFile;
const MEASURES = JSON.parse(readFileSync('tools/audio/measures.json', 'utf8')) as Record<string, { peakDb: number }>;
const LOOPS = Object.entries(INDEX.sounds).filter(([, s]) => s.loop);
const LOOP_GROUPS = [...new Set(LOOPS.map(([, s]) => s.group))].sort();

/**
 * Installed before the page's own scripts: counts the contexts it makes (the audible ones and the offline ones that decode) and records every source it starts — with the settings it was started with. A source of music
 * is told from a sound effect by the loop.
 */
const PROBE = `(() => {
  const probe = { contexts: 0, rates: [], offline: 0, starts: [] };
  window.__audioProbe = probe;
  const Base = window.AudioContext;
  if (Base) window.AudioContext = class extends Base { constructor(...a) { super(...a); probe.contexts++; probe.rates.push(this.sampleRate); } };
  const Off = window.OfflineAudioContext;
  if (Off) window.OfflineAudioContext = class extends Off { constructor(...a) { super(...a); probe.offline++; } };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    const b = this.buffer;
    probe.starts.push({ seconds: b ? b.duration : 0, channels: b ? b.numberOfChannels : 0, loop: this.loop, loopStart: this.loopStart, loopEnd: this.loopEnd, rate: this.playbackRate.value });
    return start.apply(this, a);
  };
})()`;

/** Gives a context the probe, before its first page is navigated. */
const probed = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(PROBE);
};

/** A page that was just loaded: the game, its cosmetic chunks and its sound (which comes with them) are in. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction('window.__troid && window.__troid.ready()', undefined, { timeout: 60000 });
  await page.waitForFunction('window.__troid.effectsReady()', undefined, { timeout: 60000 });
  await page.evaluate('window.__troid.pause()');
  await page.waitForTimeout(100);
}
const audioOf = async (page: Page): Promise<Audio> => {
  const a = (await page.evaluate('window.__troid.audio()')) as Audio | null;
  assert.ok(a, 'the sound is on');
  return a;
};
const probeOf = (page: Page): Promise<Probe> => page.evaluate('window.__audioProbe') as Promise<Probe>;
/** The loops the page has started so far (music and beds: a sound effect never loops). */
const loopsStarted = async (page: Page): Promise<Started[]> => (await probeOf(page)).starts.filter((s) => s.loop);
/** Waits for a condition on the sound's snapshot `a`. */
const waitAudio = (page: Page, cond: string, timeout = 30000): Promise<unknown> =>
  page.waitForFunction(`(() => { const a = window.__troid.audio(); return !!a && (${cond}); })()`, undefined, { timeout, polling: 50 });
/** What came out of the speakers over `ms`: the loudest peak, the loudest and the mean rms (linear). */
const listen = (page: Page, ms: number): Promise<Meter> =>
  page.evaluate(
    `(async () => { const t0 = performance.now(); let peak = 0, rmsMax = 0, sum = 0, n = 0;
      while (performance.now() - t0 < ${ms}) { const m = window.__troid.audioMeter(); if (m) { peak = Math.max(peak, m.peak); rmsMax = Math.max(rmsMax, m.rms); sum += m.rms * m.rms; n++; } await new Promise((r) => setTimeout(r, 12)); }
      return { peak, rmsMax, rmsMean: Math.sqrt(sum / Math.max(1, n)), n }; })()`,
  ) as Promise<Meter>;
/** Waits until nothing is heard (a sound and the tail of its echo have ended). */
const hush = (page: Page, within = 8000): Promise<unknown> =>
  page.waitForFunction(
    `(() => { const m = window.__troid.audioMeter(); if (!m) return false; const w = (window.__quiet = window.__quiet || { n: 0 }); w.n = m.peak < 1e-4 ? w.n + 1 : 0; return w.n >= 10; })()`,
    undefined,
    { timeout: within, polling: 25 },
  );
const levels = (page: Page, patch: Partial<Record<'master' | 'music' | 'sfx' | 'ambience', number>>): Promise<unknown> =>
  page.evaluate(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(patch)})) window.__troid.setLevel(k, v); })()`);
const play = (page: Page, id: string, request: Record<string, unknown> = {}): Promise<boolean> => page.evaluate(`window.__troid.playSound(${JSON.stringify(id)}, ${JSON.stringify(request)})`) as Promise<boolean>;
const db = (linear: number): number => 20 * Math.log10(Math.max(linear, 1e-9));

// ===================================================================================================================== A · the page before its first touch, and after
async function lock(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;

  // ---- before the first touch: the sound is loaded and nothing else
  let a = await audioOf(page);
  assert.equal(a.engine.state, 'locked', 'untouched: the engine has no context');
  assert.deepEqual(a.formats.slice(0, 2), ['opus', 'mp3'], 'Chromium plays Ogg Opus, and MP3 stands behind it');
  assert.equal(a.sounds, Object.keys(INDEX.sounds).length, 'the whole manifest was read');
  assert.equal(a.tracks, Object.keys(INDEX.tracks).length);
  assert.equal(await play(page, 'hero.slash.1'), false, 'a sound that cannot be heard when it happens is not played late');
  a = await audioOf(page);
  assert.equal(a.engine.dropped['locked'], 1, 'and it is counted as dropped because the page is locked');
  assert.equal(a.engine.played, 0);
  // the files of the hero are fetched and DECODED without any context of the page's own (an offline one decodes them): the first touch already finds them
  await waitAudio(page, `a.loader.groups.core && a.loader.groups.core.state === 'ready'`, 60000);
  a = await audioOf(page);
  assert.ok(a.loader.bytes > 10 * 1048576, `the sounds of the hero are in memory, decoded (${(a.loader.bytes / 1048576).toFixed(1)} MiB)`);
  assert.equal(a.loader.groups['core']?.failed, 0);
  let probe = await probeOf(page);
  assert.equal(probe.contexts, 0, 'no audible context is made before the page is touched');
  assert.ok(probe.offline >= 1, 'the offline one that decodes is');
  assert.equal(probe.starts.length, 0, 'and not one source has been started');
  assert.equal(a.music.current, null, 'there is no music yet…');
  assert.equal(a.music.wanted, 'ruins', '…but it is what the place asks for, and it is remembered');
  // things that are not a touch do not unlock it: a moving mouse, a wheel
  await page.mouse.move(120, 90);
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(250);
  assert.equal((await audioOf(page)).engine.state, 'locked', 'a mouse that moves is not a touch');
  assert.equal((await probeOf(page)).contexts, 0);

  // ---- the first touch: a key
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running'`, 10000);
  probe = await probeOf(page);
  assert.equal(probe.contexts, 1, 'one context, made by the touch');
  assert.equal(probe.rates[0], 48000, 'at the rate the files were made at, so that a loop is exact');
  // what was asked for starts: the piece of the place, and its bed
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000);
  a = await audioOf(page);
  assert.deepEqual(a.music.loaded, ['base'], 'the piece plays its base; its drive is not fetched until a fight');
  assert.equal(a.music.sources, 1);
  assert.equal(a.loader.groups['music.ruins.drive']?.state, 'idle', 'the drive layer is not in memory');
  assert.equal(a.loader.groups['music.chamber']?.state, 'idle', 'nor is the piece of another place');
  // and it is heard (the music fades in over a few seconds)
  await page.waitForTimeout(2500);
  const heard = await listen(page, 800);
  assert.ok(heard.rmsMean > 0.002, `the music is heard (rms ${heard.rmsMean.toFixed(4)}, ${db(heard.rmsMean).toFixed(1)} dBFS)`);
  assert.ok(heard.peak <= 1, `and does not clip (peak ${heard.peak.toFixed(3)})`);
  assert.equal(await play(page, 'hero.slash.1'), true, 'the sounds play now');
  assert.equal((await probeOf(page)).contexts, 1, 'still one context');
  return `no context until a key (${(a.loader.bytes / 1048576).toFixed(1)} MiB decoded before any touch), then one at 48 kHz and the music at ${db(heard.rmsMean).toFixed(0)} dBFS`;
}

// ===================================================================================================================== B · the loops, in the real decoder
/**
 * Decodes each loop of the manifest in the page, in the format asked for, and plays it for two laps in an offline context exactly as the engine configures a source (looped from 0 to the buffer's duration): the second lap
 * must be the buffer, sample for sample — that is what a loop without a gap is. Answers, per loop, the decoded length against the manifest's and the largest difference between the lap and the buffer.
 */
const LAP_PROOF = (format: 'opus' | 'mp3'): string => `(async () => {
  const base = new URL('audio/index.json', document.baseURI);
  const index = await (await fetch(base)).json();
  const rate = 48000, out = [];
  for (const [id, s] of Object.entries(index.sounds)) {
    if (!s.loop) continue;
    const v = s.variants[0];
    const bytes = await (await fetch(new URL(v['${format}'], base))).arrayBuffer();
    const buffer = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
    const n = buffer.length, chs = buffer.numberOfChannels;
    const off = new OfflineAudioContext(chs, n * 2, rate);
    const src = off.createBufferSource();
    src.buffer = buffer; src.loop = true; src.loopStart = 0; src.loopEnd = buffer.duration;
    src.connect(off.destination); src.start(0);
    const rendered = await off.startRendering();
    let diff = 0;
    for (let c = 0; c < chs; c++) { const d = buffer.getChannelData(c), r = rendered.getChannelData(c); for (let k = 0; k < n; k++) { const e = Math.abs(r[n + k] - d[k]); if (e > diff) diff = e; } }
    out.push({ id, frames: n, channels: chs, ms: (n / rate - v.seconds) * 1000, diff });
  }
  return out;
})()`;

async function loops(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;

  // ---- the files decode to the length they were made at, and the browser repeats them with no gap (both formats)
  for (const format of ['opus', 'mp3'] as const) {
    const rows = (await page.evaluate(LAP_PROOF(format))) as Array<{ id: string; frames: number; channels: number; ms: number; diff: number }>;
    assert.equal(rows.length, LOOPS.length, `${format}: every loop of the manifest was decoded`);
    for (const r of rows) {
      const want = INDEX.sounds[r.id]!.variants[0]!.seconds;
      assert.ok(Math.abs(r.ms) < 0.6, `${format} ${r.id}: ${r.frames} samples are ${(r.frames / 48000).toFixed(4)} s and the manifest says ${want} s (${r.ms.toFixed(3)} ms apart: the manifest keeps milliseconds)`);
      assert.ok(r.diff < 1e-6, `${format} ${r.id}: the second lap is not the buffer (it differs by ${r.diff})`);
    }
  }

  // ---- the engine plays what plays on and on with the settings of a sample-exact loop (the proof above started sources of its own, offline: they are forgotten)
  await page.evaluate('window.__audioProbe.starts.length = 0');
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running' && a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000);
  const started = await loopsStarted(page);
  assert.equal(started.length, 2, 'one piece (its base layer) and one bed');
  for (const s of started) {
    assert.equal(s.loopStart, 0);
    assert.equal(s.loopEnd, s.seconds, `a loop of ${s.seconds.toFixed(4)} s ends exactly where its buffer does (${s.loopEnd})`);
    assert.equal(s.rate, 1, 'at the speed it was made at');
  }
  assert.deepEqual(started.map((s) => [s.channels, Math.round(s.seconds * 1000)]).sort(), [[2, 12000], [2, 43636]], 'the piece of the ruins (stereo, 43.6 s) and the bed (stereo, 12 s)');

  // ---- the loader's own pipeline: fetched, decoded, and the seam closed. Every loop, in Opus (this browser's first choice)
  for (const group of LOOP_GROUPS) await page.evaluate(`window.__troid.audioWarm([${JSON.stringify(group)}])`);
  const seams = (await audioOf(page)).loader.seams;
  assert.deepEqual(Object.keys(seams).sort(), LOOPS.map(([id]) => id).sort(), 'the seam of every loop was looked at');
  let opened = 0;
  for (const [id, r] of Object.entries(seams)) {
    const closes = (m: { step: number; jumpDb: number }): boolean => m.step <= 4 || m.jumpDb <= -45;
    if (!closes(r.before)) opened++;
    assert.ok(closes(r.after), `${id}: the seam is closed (×${r.after.step.toFixed(2)}, ${r.after.jumpDb.toFixed(1)} dBFS; the decoder left ×${r.before.step.toFixed(2)}, ${r.before.jumpDb.toFixed(1)} dBFS)`);
    assert.ok(r.after.step < 1.5, `${id}: and well inside the limit (×${r.after.step.toFixed(2)})`);
  }
  assert.ok(opened >= 1, 'the codec had opened at least one seam of the Opus files (this is what the mending is for)');
  return `${LOOPS.length} loops × 2 formats decode to their length and repeat with no gap; the Opus codec had opened ${opened} seams, all closed once decoded`;
}

// ===================================================================================================================== C · the sounds, through the real graph
/** A sound of each kind: the hero's body, its blows, its pain, the magic, the world, the enemy and the interface. (A stinger is music: it is heard when the music is.) */
const KINDS = ['hero.step.stone', 'hero.jump', 'hero.dash.ground', 'hero.land.heavy', 'hero.slash.1', 'hero.hurt.heavy', 'hit.light', 'hit.heavy', 'magic.cast.release', 'bottle.drunk', 'interact.pickup', 'gate.open', 'slime.death', 'ui.tap'];

async function sounds(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`);
  await levels(page, { music: 0, ambience: 0 }); // only the effects are looked at
  await hush(page);
  const idle = await listen(page, 300);
  assert.equal(idle.peak, 0, 'with the music and the ambience off and nothing playing, nothing comes out of the speakers at all');

  const heard: Record<string, Meter> = {};
  for (const id of KINDS) {
    await page.evaluate('window.__quiet = { n: 0 }');
    assert.equal(await play(page, id), true, `${id} starts`);
    const seconds = INDEX.sounds[id]!.variants[0]!.seconds;
    heard[id] = await listen(page, Math.min(1800, seconds * 1000 + 200));
    await hush(page, 12000);
    assert.equal((await audioOf(page)).engine.voices, 0, `${id}: and ends (no voice is left)`);
  }
  const peak = (id: string): number => heard[id]!.peak;
  for (const id of KINDS) {
    assert.ok(peak(id) > 0.004, `${id} is heard (peak ${db(peak(id)).toFixed(1)} dBFS)`);
    assert.ok(peak(id) <= 1, `${id} does not clip (peak ${peak(id).toFixed(3)})`);
  }
  // not one sound for all the actions: each has a level and a shape of its own
  const shapes = new Set(KINDS.map((id) => `${Math.round(db(peak(id)))}/${Math.round(db(heard[id]!.rmsMean))}`));
  assert.ok(shapes.size >= Math.round(KINDS.length * 0.7), `the sounds are not alike: ${shapes.size} different levels in ${KINDS.length} (${[...shapes].join(' ')})`);
  // the mix is built on an order: the interface and the feet are quiet, the blows come out ahead, pain is the loudest of the hero's sounds
  assert.ok(peak('hero.step.stone') < peak('hero.slash.1'), 'a footstep is under a blow');
  assert.ok(peak('ui.tap') < peak('hit.heavy'), 'the interface is under combat');
  assert.ok(peak('hero.slash.1') < peak('hero.hurt.heavy') * 1.2, 'pain is not under a blow');
  assert.ok(peak('hit.light') < peak('hit.heavy') * 1.3, 'a heavy hit is not under a light one');
  const summary = KINDS.map((id) => `${id.replace('hero.', '').replace('interact.', '')} ${db(peak(id)).toFixed(0)}`).join(', ');

  // ---- the effects stay over the music: a blow sounds clear of the piece that is playing under it
  await levels(page, { music: 0.7 });
  await waitAudio(page, `a.music.current === 'ruins'`, 30000);
  await page.waitForTimeout(4500); // (it fades in)
  const under = await listen(page, 1500);
  assert.ok(under.rmsMax > 0.001, 'the music plays');
  await play(page, 'hero.hurt.heavy');
  const over = await listen(page, 500);
  assert.ok(over.rmsMax > under.rmsMax * 1.8, `a cry of pain stands over the music (${db(over.rmsMax).toFixed(1)} dBFS over ${db(under.rmsMax).toFixed(1)})`);
  // a stinger is music: it plays with the music's volume, over the piece that is playing
  await hush(page, 12000).catch(() => undefined);
  assert.equal(await play(page, 'stinger.card'), true, 'a stinger plays when the music is on');
  const stung = await listen(page, 1200);
  assert.ok(stung.rmsMax > 0.001, 'and is heard');
  await levels(page, { music: 0 });
  assert.equal(await play(page, 'stinger.unlock'), false, 'with the music at zero a stinger is not started: it is music');
  await levels(page, { music: 0.7 });
  return `${KINDS.length} sounds, each audible and under full scale (${summary}); a cry is ${(db(over.rmsMax) - db(under.rmsMax)).toFixed(0)} dB over the music`;
}

// ===================================================================================================================== E · the volumes
async function volumes(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`);
  const gain = async (): Promise<Record<string, number>> => ((await ctx.state()).volume?.gains ?? {}) as Record<string, number>;
  /** One tap of the interface (it has no variation and no jitter: every one is the same sound) and the loudest it came out. */
  const tap = async (): Promise<number> => {
    await page.evaluate('window.__quiet = { n: 0 }');
    assert.equal(await play(page, 'ui.tap'), true);
    const m = await listen(page, 400);
    await hush(page, 8000);
    return m.peak;
  };

  // the chain is unity: at full volume a sound comes out of the speakers with the peak of its file and its trim — the browser's own make-up, added by its compressor, is taken back
  await levels(page, { master: 1, music: 0, sfx: 1, ambience: 0 });
  await page.waitForTimeout(600);
  const unity = await tap();
  const expected = 10 ** ((MEASURES['ui_tap']!.peakDb + INDEX.sounds['ui.tap']!.gainDb) / 20);
  assert.ok(Math.abs(db(unity) - db(expected)) < 1, `at full volume ui.tap peaks at ${db(unity).toFixed(2)} dBFS and its file and its trim say ${db(expected).toFixed(2)}`);

  // the first sound after a slider moved is already at the new level: a gain moved while nothing plays through it must not keep the old one until sound arrives
  await levels(page, { master: 0.8, sfx: 0.9 });
  await page.waitForTimeout(600);
  const reference = await tap();
  await levels(page, { sfx: 0.45 });
  await page.waitForTimeout(600); // (idle: nothing plays)
  const first = await tap();
  const second = await tap();
  assert.ok(first / second > 0.9 && first / second < 1.1, `the first sound after the slider moved is at its new level (x${(first / second).toFixed(2)} of the second; at the old level it would be x${(reference / second).toFixed(2)})`);
  assert.ok(Math.abs(db(second) - db(reference) + 12.04) < 1, `and the new level is the square of the slider (${(db(second) - db(reference)).toFixed(1)} dB)`);
  await levels(page, { sfx: 0.9 });
  await page.waitForTimeout(600);
  const back = await tap();
  assert.ok(back / reference > 0.9 && back / reference < 1.1, `and so is the first one after it is raised again (x${(back / reference).toFixed(2)})`);

  // the ambience is a steady bed: its level is what the slider says
  await levels(page, { master: 0.8, music: 0, sfx: 0.9, ambience: 0.8 });
  await waitAudio(page, `a.ambience.current === 'bed.ruins'`, 30000);
  await page.waitForTimeout(3500);
  const full = await listen(page, 1500);
  assert.ok(full.rmsMean > 0.0007, `the bed is heard (${db(full.rmsMean).toFixed(1)} dBFS)`);
  await levels(page, { ambience: 0.4 });
  await page.waitForTimeout(900);
  const half = await listen(page, 1500);
  const byAmbience = half.rmsMean / full.rmsMean;
  assert.ok(byAmbience > 0.15 && byAmbience < 0.42, `the ambience at 0.4 instead of 0.8 is a quarter of the gain (x${byAmbience.toFixed(2)}, ${db(byAmbience).toFixed(1)} dB; the curve squares the level)`);
  assert.ok(Math.abs((await gain())['ambience']! - 0.16) < 1e-9);
  // the general volume scales everything under it
  await levels(page, { ambience: 0.8, master: 0.4 });
  await page.waitForTimeout(900);
  const quarter = await listen(page, 1500);
  const byMaster = quarter.rmsMean / full.rmsMean;
  assert.ok(byMaster > 0.15 && byMaster < 0.42, `the general volume at 0.4 instead of 0.8 is a quarter too (x${byMaster.toFixed(2)})`);
  // zero is silence, not a very low volume
  await levels(page, { master: 0.8, ambience: 0 });
  await page.waitForTimeout(900);
  const muted = await listen(page, 600);
  assert.equal(muted.peak, 0, 'the ambience at zero is not heard at all');
  assert.equal(await play(page, 'amb.drip'), false, 'and a sound of its category is not even started');
  assert.ok(((await audioOf(page)).engine.dropped['silent'] ?? 0) >= 1, 'it is counted as silent');
  // a category that is muted silences only itself
  assert.equal(await play(page, 'hit.heavy', { variant: 0 }), true, 'the effects go on');
  const alone = await listen(page, 700);
  assert.ok(alone.peak > 0.004, 'and are heard');
  await hush(page);
  // the effects follow their slider the same way (a sound with a variation fixed and no jitter in its level)
  await levels(page, { sfx: 0.9 });
  const peaks: number[] = [];
  for (const level of [0.9, 0.45]) {
    await levels(page, { sfx: level });
    await page.waitForTimeout(200);
    let best = 0;
    for (let k = 0; k < 3; k++) {
      await play(page, 'hit.heavy', { variant: 0 });
      best = Math.max(best, (await listen(page, 700)).peak);
      await hush(page, 8000);
    }
    peaks.push(best);
  }
  const bySfx = peaks[1]! / peaks[0]!;
  assert.ok(bySfx > 0.12 && bySfx < 0.5, `the effects at 0.45 instead of 0.9 are a quarter of the gain (x${bySfx.toFixed(2)})`);
  // the general volume at zero is the whole game silent, at once
  await levels(page, { master: 0, sfx: 0.9, ambience: 0.8, music: 0.7 });
  await page.waitForTimeout(700);
  assert.equal(await play(page, 'hit.heavy'), false, 'with the general volume at zero nothing is started');
  const none = await listen(page, 600);
  assert.equal(none.peak, 0, 'and nothing is heard');
  await levels(page, { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8 });
  return `ambience ${db(byAmbience).toFixed(1)} dB for half the slider, master ${db(byMaster).toFixed(1)} dB, effects ${db(bySfx).toFixed(1)} dB; zero is silence and silences only its own category`;
}

// ===================================================================================================================== D · the music through the world
/** Looks at the channels every 25 ms for as long as it is on: the most sources either ever had, whether a piece ever appeared twice, and the pieces that were current, in order. */
const WATCH_ON = `(() => {
  const w = (window.__watch = { maxMusic: 0, maxBed: 0, bad: [], current: [] });
  window.__watchTimer = setInterval(() => {
    const a = window.__troid.audio();
    if (!a) return;
    w.maxMusic = Math.max(w.maxMusic, a.music.sources);
    w.maxBed = Math.max(w.maxBed, a.ambience.sources);
    for (const [name, ch] of [['music', a.music], ['bed', a.ambience]]) {
      const names = [ch.current, ...ch.leaving].filter(Boolean);
      if (new Set(names).size !== names.length) w.bad.push(name + ': ' + names.join(','));
    }
    if (w.current[w.current.length - 1] !== a.music.current) w.current.push(a.music.current);
  }, 25);
})()`;
const WATCH_OFF = `(() => { clearInterval(window.__watchTimer); return window.__watch; })()`;
const sess = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const s = window.__troid.session; ${code} })()`);

async function journey(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000);
  const pieces = async (): Promise<number[]> => (await loopsStarted(page)).filter((s) => s.seconds > 30).map((s) => Math.round(s.seconds * 1000));
  const beds = async (): Promise<number> => (await loopsStarted(page)).filter((s) => s.seconds < 30).length;
  assert.deepEqual(await pieces(), [43636], 'R1: the piece of the ruins is playing, once');
  await page.evaluate(WATCH_ON);
  await sess(page, `s.flags.set('defeated:r1_slime')`);
  await page.evaluate('window.__troid.game.debug.set("godMode", true)');

  // ---- R1 → R2: a door does not restart the music; the bed changes
  await ctx.teleport(110, 0);
  await ctx.step(40);
  assert.equal((await ctx.state()).room, 'r2_hall');
  await waitAudio(page, `a.ambience.current === 'bed.roots'`, 20000);
  let a = await audioOf(page);
  assert.equal(a.music.current, 'ruins', 'R2 plays the same piece: it goes on');
  assert.equal(a.music.wanted, 'ruins');
  assert.deepEqual(a.music.leaving, [], 'nothing of the music is fading: it was not touched');
  assert.deepEqual(await pieces(), [43636], 'and it was not started a second time');
  assert.equal(await beds(), 2, 'the bed of the roots is a second bed');
  await waitAudio(page, `a.ambience.leaving.length === 0`, 15000);
  await waitAudio(page, `a.loader.groups['amb.ruins'].state === 'idle'`, 20000);
  a = await audioOf(page);
  assert.equal(a.loader.groups['amb.roots']?.state, 'ready', 'the bed of the roots is in memory');
  assert.equal(a.loader.groups['amb.ruins']?.state, 'idle', 'and the bed of the ruins, which the hero has left, has been let go');

  // ---- R2 → R3: the chamber has a piece of its own, crossfaded in; the old one is let go afterwards
  await ctx.teleport(89.5, 0);
  await ctx.step(40);
  assert.equal((await ctx.state()).room, 'r3_chamber');
  assert.equal((await audioOf(page)).music.wanted, 'chamber', 'the chamber asks for its piece');
  await waitAudio(page, `a.music.current === 'chamber'`, 30000);
  a = await audioOf(page);
  assert.deepEqual(a.music.leaving, ['ruins'], 'the ruins fade out as it comes in');
  assert.equal(a.music.sources, 2, 'two sources, two different pieces');
  await waitAudio(page, `a.music.leaving.length === 0`, 15000);
  a = await audioOf(page);
  assert.equal(a.music.sources, 1, 'afterwards one');
  await waitAudio(page, `a.loader.groups['music.ruins'].state === 'idle'`, 20000);
  a = await audioOf(page);
  assert.equal(a.loader.groups['music.chamber']?.state, 'ready');
  assert.equal(a.loader.groups['music.ruins']?.state, 'idle', 'the piece of the ruins, twenty MiB decoded, is no longer in memory');
  assert.deepEqual(await pieces(), [43636, 45000], 'two pieces were started in all, each once');
  const memory = a.loader.bytes / 1048576;
  assert.ok(memory < 60, `what is in memory in the chamber: ${memory.toFixed(1)} MiB`);

  // ---- back and forth through the doors, quickly: the channels settle on one piece, and never hold two copies of one
  for (const x of [1.2, 89.5, 1.2, 89.5]) {
    await ctx.teleport(x, 0);
    await ctx.step(40);
    await page.waitForTimeout(120);
  }
  assert.equal((await ctx.state()).room, 'r3_chamber');
  await waitAudio(page, `a.music.current === 'chamber' && a.music.leaving.length === 0 && a.ambience.leaving.length === 0 && a.music.sources === 1`, 40000);
  a = await audioOf(page);
  assert.equal(a.music.wanted, 'chamber');
  assert.equal(a.ambience.current, 'bed.chamber');
  const watched = (await page.evaluate(WATCH_OFF)) as { maxMusic: number; maxBed: number; bad: string[]; current: Array<string | null> };
  assert.deepEqual(watched.bad, [], 'never two copies of one piece, one bed');
  assert.ok(watched.maxMusic <= 2, `never more than two pieces at once, and that only in a crossfade (${watched.maxMusic})`);
  assert.ok(watched.maxBed <= 2, `nor beds (${watched.maxBed})`);
  assert.deepEqual(watched.current.filter((c, i, all) => c !== all[i - 1]).slice(0, 3), ['ruins', 'chamber', 'ruins'], 'and the pieces came in the order of the places');
  return `R1 → R2 keeps the one piece (started once), R2 → R3 crossfades to the chamber's and lets the ruins go (${memory.toFixed(0)} MiB in memory); ${(await pieces()).length} pieces started across ${watched.current.length} changes, at most ${watched.maxMusic} sources at once`;
}

// ===================================================================================================================== F · the pause
async function pausing(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000);
  await page.evaluate('window.__troid.resume()'); // the loop runs in real time: a player's game
  const menuIs = (open: boolean): Promise<unknown> => page.waitForFunction(`document.querySelector('[data-testid="pause-menu"]')?.dataset.open === '${open ? '1' : '0'}'`, undefined, { timeout: 15000 });

  // ---- the first sounds after the first menu are at their level. The gate of the world has never been moved and nothing is playing through it (the music and the ambience are off): a gate moved in that state must not
  // keep the sounds that follow muffled until it is reached
  await levels(page, { music: 0, ambience: 0 });
  await page.waitForTimeout(1500);
  const blow = async (): Promise<number> => {
    await page.evaluate('window.__quiet = { n: 0 }');
    await play(page, 'hero.slash.1', { variant: 0 });
    const m = await listen(page, 500);
    await hush(page, 8000);
    return m.peak;
  };
  const before = Math.max(await blow(), await blow());
  await page.keyboard.press('Escape');
  await menuIs(true);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await menuIs(false);
  await page.waitForTimeout(900); // (idle)
  const after = await blow();
  assert.ok(after / before > 0.6 && after / before < 1.5, `the first blow after the first menu is at its level (x${(after / before).toFixed(2)})`);
  await levels(page, { music: 0.7, ambience: 0.8 });
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000); // (a category that was muted starts again from its beginning: that is the volume's doing, not the pause's)
  await page.waitForTimeout(4500); // (the music fades in)
  const started = (await loopsStarted(page)).length;
  const playing = await listen(page, 1500);
  assert.ok(playing.rmsMean > 0.001, `the world is heard: ${db(playing.rmsMean).toFixed(1)} dBFS`);

  // ---- the menu opens: the world's sounds stop and are not started, the music is dimmed and goes on, the interface sounds
  await page.keyboard.press('Escape');
  await menuIs(true);
  let a = await audioOf(page);
  assert.equal(a.engine.paused, true);
  assert.equal(a.conductor.paused, true);
  assert.ok(a.engine.recent.includes('ui.pause.open'), 'the menu opening is heard');
  await page.waitForTimeout(1500);
  const dimmed = await listen(page, 1500);
  const by = dimmed.rmsMean / playing.rmsMean;
  assert.ok(by > 0.01 && by < 0.7, `the music is dimmed and dulled, the ambience gone, and something is left (${db(by).toFixed(1)} dB)`);
  assert.equal(await play(page, 'hero.slash.1'), false, 'a sound of the world is not started in a menu');
  assert.ok(((await audioOf(page)).engine.dropped['paused'] ?? 0) >= 1, 'and is counted as dropped by the pause');
  assert.equal(await play(page, 'ui.tap'), true, 'the interface sounds');
  a = await audioOf(page);
  assert.equal(a.music.current, 'ruins', 'the music is where it was');
  assert.equal((await loopsStarted(page)).length, started, 'and nothing was started again');

  // ---- the menu closes: everything is back, once
  await page.keyboard.press('Escape');
  await menuIs(false);
  a = await audioOf(page);
  assert.equal(a.engine.paused, false);
  assert.ok(a.engine.recent.includes('ui.pause.close'), 'the menu closing is heard');
  await page.waitForTimeout(2000);
  const back = await listen(page, 1500);
  const again = back.rmsMean / playing.rmsMean;
  assert.ok(again > 0.55 && again < 1.8, `the world is back (${db(again).toFixed(1)} dB from before)`);
  assert.equal((await loopsStarted(page)).length, started, 'with the same sources: nothing was restarted by a pause');
  assert.equal((await audioOf(page)).music.sources, 1);

  // ---- the page goes to the background: the context is frozen, and wakes when the page returns
  const hide = (hidden: boolean): Promise<unknown> => page.evaluate(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${hidden} }); document.dispatchEvent(new Event('visibilitychange')); })()`);
  await hide(true);
  await waitAudio(page, `a.engine.state === 'suspended'`, 5000);
  assert.equal(await play(page, 'hero.slash.1'), false, 'a page in the background plays nothing');
  await menuIs(true); // (a page that goes to the background opens the menu: the player resumes when they are ready)
  await hide(false);
  await waitAudio(page, `a.engine.state === 'running'`, 5000);
  assert.equal(await play(page, 'ui.tap'), true, 'the interface plays again when the page returns');
  await page.keyboard.press('Escape');
  await menuIs(false);
  await page.waitForTimeout(400);
  assert.equal(await play(page, 'hero.slash.1'), true, 'and so does the world once the player has resumed');
  a = await audioOf(page);
  assert.equal(a.music.current, 'ruins');
  assert.equal((await loopsStarted(page)).length, started, 'with the music where it was: it was frozen, not stopped');
  return `the music dims ${db(by).toFixed(0)} dB in the menu and is back within ${Math.abs(db(again)).toFixed(1)} dB, never restarted; the first blow after the menu is x${(after / before).toFixed(2)}; the page frozen in the background wakes`;
}

// ===================================================================================================================== G · what the person chose
const q = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`[data-testid="${id}"]`);
/** A slider as a finger leaves it: its value set and its `input` event sent. */
const setRange = (page: Page, id: string, value: number): Promise<void> =>
  q(page, id).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
const savedVolume = async (page: Page): Promise<Record<string, number> | null> => {
  const raw = (await page.evaluate(`localStorage.getItem('troid.settings')`)) as string | null;
  return raw === null ? null : (JSON.parse(raw) as { volume: Record<string, number> }).volume;
};
const SLIDERS = { master: 'settings-volume', music: 'settings-volume-music', sfx: 'settings-volume-sfx', ambience: 'settings-volume-ambience' } as const;

/** The pause button and the sound screen (the four sliders), as a person presses them. */
async function openSettings(page: Page): Promise<void> {
  await q(page, 'pause-button').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="1"]', { timeout: 15000 });
  await q(page, 'pause-sound').click();
  await page.waitForSelector('[data-testid="sound-screen"][data-open="1"]', { timeout: 15000 });
}
async function closeMenu(page: Page): Promise<void> {
  await q(page, 'sound-back').click();
  await q(page, 'pause-resume').click();
  await page.waitForSelector('[data-testid="pause-menu"][data-open="0"]', { state: 'attached', timeout: 15000 });
}

async function remembering(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins'`, 30000);

  // ---- the four sliders of the menu are heard at once, and make themselves heard
  await openSettings(page);
  const want = { master: 0.5, music: 0.25, sfx: 0.6, ambience: 0.4 };
  for (const [category, id] of Object.entries(SLIDERS)) await setRange(page, id, want[category as keyof typeof want]);
  let a = await audioOf(page);
  assert.deepEqual(a.levels, want, 'the engine has the four levels the sliders were moved to');
  assert.ok(a.engine.recent.includes('ui.slider'), 'a slider that moves is heard');
  assert.ok(a.engine.recent.includes('ui.pause.open'), 'and so was the menu opening');
  await q(page, 'sound-back').click();
  await q(page, 'pause-settings').click(); // (a press of a button taps)
  await page.waitForTimeout(150);
  assert.ok((await audioOf(page)).engine.recent.includes('ui.tap'), 'a press of a button is heard');
  const gains = ((await ctx.state()).volume?.gains ?? {}) as Record<string, number>;
  assert.ok(Math.abs(gains['music']! - 0.0625) < 1e-9 && Math.abs(gains['sfx']! - 0.36) < 1e-9, 'and each is the square of its slider');
  // saved
  for (let i = 0; i < 60 && JSON.stringify(await savedVolume(page)) !== JSON.stringify(want); i++) await page.waitForTimeout(50);
  assert.deepEqual(await savedVolume(page), want, 'the four are saved');
  await closeMenu(page);

  // ---- a new load starts with them, before anything is touched
  await page.reload();
  await ready(page);
  a = await audioOf(page);
  assert.deepEqual(a.levels, want, 'the page that loads next has the four levels of the last one');
  assert.equal(a.engine.state, 'locked');
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running' && a.music.current === 'ruins'`, 30000);
  const reloaded = ((await ctx.state()).volume?.gains ?? {}) as Record<string, number>;
  assert.ok(Math.abs(reloaded['music']! - 0.0625) < 1e-9, 'and the music is under the gain it was left at');

  // ---- zero is remembered, and what is muted is not fetched or played
  await openSettings(page);
  await setRange(page, SLIDERS.music, 0);
  assert.match((await q(page, 'settings-volume-music').getAttribute('aria-valuetext')) ?? '', /Muted/);
  a = await audioOf(page);
  assert.equal(a.music.current, null, 'the music stops at once');
  assert.equal(a.music.wanted, 'ruins', 'but the place still asks for it, and that is remembered');
  for (let i = 0; i < 60 && (await savedVolume(page))?.['music'] !== 0; i++) await page.waitForTimeout(50);
  assert.equal((await savedVolume(page))?.['music'], 0);
  await closeMenu(page);
  await page.reload();
  await ready(page);
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.engine.state === 'running' && a.ambience.current === 'bed.ruins'`, 30000);
  await page.waitForTimeout(2500); // (long enough for a piece to have been fetched, if it were going to be)
  a = await audioOf(page);
  assert.equal(a.levels.music, 0);
  assert.equal(a.music.current, null, 'a category at zero plays nothing…');
  assert.equal(a.music.wanted, 'ruins');
  assert.equal(a.loader.groups['music.ruins']?.state, 'idle', '…and its files are not even fetched');
  assert.equal(a.loader.groups['music.ruins']?.loaded, 0);
  assert.equal((await loopsStarted(page)).filter((l) => l.seconds > 30).length, 0, 'not one piece of music was started');
  // raising it brings it in from where it is
  await openSettings(page);
  await setRange(page, SLIDERS.music, 0.6);
  await waitAudio(page, `a.music.current === 'ruins'`, 30000);
  a = await audioOf(page);
  assert.equal(a.loader.groups['music.ruins']?.state, 'ready');
  await closeMenu(page);
  return 'the four sliders are heard as they move, saved, and the next load starts with them; a category at zero is not fetched or started and comes in when it is raised';
}

// ===================================================================================================================== H · the network fails
async function failing(ctx: Ctx): Promise<string> {
  await ctx.open('audio=off', SIZE); // (to learn where the game is served and which browser runs it)
  const browser = ctx.page.context().browser()!;
  const origin = new URL(ctx.page.url()).origin;
  const visit = async (setup: (c: BrowserContext) => Promise<unknown>) => {
    const requested: string[] = [];
    const opened = await openPage(browser, `${origin}/?hooks=1&audio=on`, {
      ...SIZE,
      prepare: async (c) => {
        c.on('request', (r) => void requested.push(r.url()));
        await c.addInitScript(PROBE);
        await setup(c);
      },
    });
    await ready(opened.page);
    return { ...opened, requested };
  };
  /** The game goes on: its clock runs and nothing in the page threw. */
  const playing = async (o: Awaited<ReturnType<typeof visit>>, what: string): Promise<void> => {
    const t0 = ((await o.page.evaluate('window.__troid.state()')) as GameState).tick;
    await o.page.evaluate('window.__troid.step(30)');
    assert.equal(((await o.page.evaluate('window.__troid.state()')) as GameState).tick - t0, 30, `${what}: the game runs`);
    assert.deepEqual(o.errors.filter((e) => e.startsWith('pageerror')), [], `${what}: nothing in the page threw`);
  };
  const done: string[] = [];

  // ---- every sound file refused: no sound, a game
  {
    const o = await visit((c) => c.route(/\/audio\/(sfx|music|ambience)\//, (r) => r.abort('failed')));
    await o.page.keyboard.press(UNLOCK);
    await waitAudio(o.page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`, 60000);
    await playing(o, 'with every file refused');
    const a = await audioOf(o.page);
    assert.equal(a.loader.groups['core']?.loaded, 0, 'nothing was loaded');
    assert.ok((a.loader.groups['core']?.failed ?? 0) > 20, `and it says which: ${a.loader.groups['core']?.failed} files`);
    assert.equal(await play(o.page, 'hero.slash.1'), false, 'a sound with no file does not play…');
    assert.ok(((await audioOf(o.page)).engine.dropped['notLoaded'] ?? 0) >= 1, '…and is counted as not loaded');
    assert.equal(a.music.current, null, 'there is no music');
    assert.ok(o.warnings.some((w) => w.includes('could not be loaded')), 'and the console is told why');
    await o.page.context().close();
    done.push('no files');
  }

  // ---- only the Opus files refused: the MP3 stand in, every loop included
  {
    const o = await visit((c) => c.route(/\.opus$/, (r) => r.abort('failed')));
    await o.page.keyboard.press(UNLOCK);
    await waitAudio(o.page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`, 60000);
    let a = await audioOf(o.page);
    assert.equal(a.loader.groups['core']?.failed, 0, 'every sound was found in the other format');
    assert.ok((a.loader.groups['core']?.loaded ?? 0) > 60);
    const mp3 = o.requested.filter((u) => u.endsWith('.mp3')).length;
    assert.ok(mp3 > 60, `${mp3} MP3 files were fetched`);
    await levels(o.page, { music: 0, ambience: 0 });
    await hush(o.page);
    assert.equal(await play(o.page, 'hit.heavy'), true);
    assert.ok((await listen(o.page, 500)).peak > 0.004, 'and they are heard');
    for (const group of LOOP_GROUPS) await o.page.evaluate(`window.__troid.audioWarm([${JSON.stringify(group)}])`);
    a = await audioOf(o.page);
    const open = Object.entries(a.loader.seams).filter(([, r]) => !(r.after.step <= 4 || r.after.jumpDb <= -45));
    assert.equal(Object.keys(a.loader.seams).length, LOOPS.length, 'the seam of every loop was looked at in this format too');
    assert.deepEqual(open.map(([id]) => id), [], 'and every one is closed');
    await playing(o, 'with the Opus refused');
    await o.page.context().close();
    done.push(`Opus refused → ${mp3} MP3 files and ${LOOPS.length} closed loops`);
  }

  // ---- no manifest: the game is silent, and a game
  {
    const o = await visit((c) => c.route(/\/audio\/index\.json/, (r) => r.fulfill({ status: 404, body: 'not here' })));
    assert.equal(await o.page.evaluate('window.__troid.audio()'), null, 'there is no sound system');
    assert.equal(await o.page.evaluate(`window.__troid.playSound('hero.slash.1')`), false);
    await o.page.keyboard.press(UNLOCK);
    await playing(o, 'with no manifest');
    assert.equal(((await o.page.evaluate('window.__audioProbe')) as Probe).contexts, 0, 'not even a context is made');
    assert.ok(o.warnings.some((w) => w.includes('manifest could not be read')), 'and the console says why');
    await o.page.context().close();
    done.push('no manifest');
  }

  // ---- a file that is not audio (it arrives, with a good status): the sound has its other variations, and the game goes on
  {
    const variant = INDEX.sounds['hero.slash.1']!.variants[1]!;
    const garbage = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 131 + 17) % 251));
    const names = [variant.opus, variant.mp3].map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const o = await visit((c) => c.route(new RegExp(`(${names.join('|')})$`), (r) => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: garbage })));
    await o.page.keyboard.press(UNLOCK);
    await waitAudio(o.page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`, 60000);
    const a = await audioOf(o.page);
    assert.equal(a.loader.groups['core']?.failed, 1, 'one file could not be decoded, and it is the only one that is left out');
    await levels(o.page, { music: 0, ambience: 0 });
    let played = 0;
    for (let i = 0; i < 12; i++) {
      if (await play(o.page, 'hero.slash.1')) played++;
      await o.page.waitForTimeout(40);
    }
    assert.equal(played, 12, 'the sound still plays, with the variations it has');
    assert.equal((await audioOf(o.page)).engine.dropped['notLoaded'], 0);
    await playing(o, 'with a file that is not audio');
    await o.page.context().close();
    done.push('a bad file');
  }

  // ---- music that is slow to come: the game and its effects do not wait for it, and it starts when it arrives, once
  {
    const o = await visit((c) =>
      c.route(/\/audio\/music\//, async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await r.continue();
      }),
    );
    await o.page.keyboard.press(UNLOCK);
    await waitAudio(o.page, `a.engine.state === 'running' && a.loader.groups.core.state === 'ready'`, 60000);
    let a = await audioOf(o.page);
    assert.equal(a.music.current, null, 'the music has not come');
    assert.equal(a.music.wanted, 'ruins');
    assert.equal(a.music.loading, true, 'it is on its way');
    assert.equal(await play(o.page, 'hero.slash.1'), true, 'the effects do not wait for it');
    await playing(o, 'with slow music');
    await waitAudio(o.page, `a.music.current === 'ruins'`, 40000);
    a = await audioOf(o.page);
    assert.equal(a.music.sources, 1);
    assert.equal(((await o.page.evaluate('window.__audioProbe')) as Probe).starts.filter((x) => x.loop && x.seconds > 30).length, 1, 'once');
    await o.page.context().close();
    done.push('slow music');
  }
  return `the game goes on and says what it could not do: ${done.join(', ')}`;
}

// ===================================================================================================================== I · a storm
async function storm(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  const { page } = ctx;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins' && a.loader.groups.core.state === 'ready'`, 30000);
  await levels(page, { master: 1, sfx: 1 }); // (as loud as the person can have it)
  await page.waitForTimeout(3000);
  const total = (a: Audio): number => Object.values(a.engine.dropped).reduce((x, y) => x + y, 0);
  const before = await audioOf(page);
  const ids = ['hit.light', 'hit.heavy', 'hero.slash.1', 'hero.step.stone', 'hero.land.heavy', 'slime.death', 'hero.hurt.heavy', 'magic.cast.release', 'interact.pickup', 'gate.open', 'hero.dash.ground', 'ui.slider', 'hit.bolt', 'bottle.drunk'];
  const result = (await page.evaluate(`(() => {
    const t = window.__troid, ids = ${JSON.stringify(ids)}, t0 = performance.now();
    let started = 0;
    for (let i = 0; i < 600; i++) if (t.playSound(ids[i % ids.length], { at: { x: (i % 17) - 8, y: 0 } })) started++;
    return { ms: performance.now() - t0, started };
  })()`)) as { ms: number; started: number };
  const after = await audioOf(page);
  assert.equal(after.engine.played - before.engine.played, result.started, 'what started is what the engine counted');
  assert.equal(result.started + (total(after) - total(before)), 600, 'every one of the 600 requests is accounted for: it started, or it was dropped and counted by its reason');
  assert.ok(after.engine.peakVoices <= 24, `never more than the limit of voices sounding (${after.engine.peakVoices})`);
  assert.ok(after.engine.peakSources <= 36, `and the sources on the graph, those being taken over included, are held to a few more (${after.engine.peakSources})`);
  assert.ok(after.engine.voices <= 24);
  assert.ok(after.engine.stolen > before.engine.stolen || (after.engine.dropped['cooldown'] ?? 0) > (before.engine.dropped['cooldown'] ?? 0), 'the mix made room, or held back what came too fast');
  assert.ok(result.ms < 400, `600 requests took ${result.ms.toFixed(0)} ms of the page's time`);
  const heard = await listen(page, 1500);
  assert.ok(heard.peak > 0.1, `the storm is heard (${db(heard.peak).toFixed(1)} dBFS)`);
  assert.ok(heard.peak <= 0.84, `and the limiter holds the output under its ceiling, with the volumes at full (${db(heard.peak).toFixed(2)} dBFS; the ceiling is −2.4 and the limit of this check −1.5)`);
  // everything ends and is let go
  await waitAudio(page, `a.engine.voices === 0`, 30000);
  const settled = await audioOf(page);
  assert.deepEqual(settled.engine.active, {}, 'no voice is left');
  assert.equal(settled.loader.bytes, before.loader.bytes, 'the memory is what it was');
  assert.equal(settled.music.sources, 1, 'the music is one source');
  assert.equal(settled.music.current, 'ruins');
  // and it can be done again: a second storm, the same
  const again = (await page.evaluate(`(() => { let n = 0; for (let i = 0; i < 300; i++) if (window.__troid.playSound('hit.light')) n++; return n; })()`)) as number;
  assert.ok(again >= 1, 'the engine plays after a storm');
  return `600 requests in ${result.ms.toFixed(0)} ms: ${result.started} started, ${after.engine.stolen - before.engine.stolen} voices taken over, ${total(after) - total(before)} dropped and counted; at most ${after.engine.peakVoices} voices (${after.engine.peakSources} sources with the fading ones), peak ${db(heard.peak).toFixed(1)} dBFS, and all let go`;
}

// ===================================================================================================================== J · the sound of the game, played
async function playedGame(ctx: Ctx): Promise<string> {
  await ctx.open('audio=on', { ...SIZE, prepare: probed });
  let page = ctx.page;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'ruins' && a.ambience.current === 'bed.ruins' && a.loader.groups.core.state === 'ready'`, 30000);
  const first = await audioOf(page);
  assert.equal(first.loader.groups['music.ruins.drive']?.state, 'idle', 'at the start nothing threatens: the drive layer of the piece is not in memory');
  assert.equal(first.conductor.drive, 0);
  const tap = async (code: string, hold = 1): Promise<void> => {
    await page.keyboard.down(code);
    await ctx.step(hold);
    await page.keyboard.up(code);
  };
  /** The sounds that were played since `mark`, oldest first. (The engine remembers the last 24; none of these moments plays more.) */
  const mark = async (): Promise<number> => (await audioOf(page)).engine.played;
  const since = async (m: number): Promise<string[]> => {
    const a = await audioOf(page);
    const n = a.engine.played - m;
    return n > 0 ? a.engine.recent.slice(-Math.min(n, a.engine.recent.length)) : [];
  };
  /** Steps in small bites (and lets the audio clock run, for cooldowns are measured on it) until the sounds that were played since `m` satisfy `ok`. */
  const until = async (what: string, m: number, ok: (heard: string[]) => boolean, ticks = 240, bite = 4): Promise<string[]> => {
    for (let i = 0; i < ticks; i += bite) {
      const heard = await since(m);
      if (ok(heard)) return heard;
      await ctx.step(bite);
      await page.waitForTimeout(20);
    }
    const heard = await since(m);
    assert.ok(ok(heard), `${what}: not within ${ticks} ticks (heard ${heard.join(', ') || 'nothing'})`);
    return heard;
  };
  const has = (heard: string[], re: RegExp): boolean => heard.some((id) => re.test(id));
  const godMode = (on: boolean): Promise<unknown> => page.evaluate(`window.__troid.game.debug.set("godMode", ${on})`);
  const said: string[] = [];

  // ---- the hero: a dash, a jump and its landing, a few steps
  let m = await mark();
  await tap('ShiftLeft', 2);
  await until('the dash sounds', m, (h) => has(h, /^hero\.dash\.ground$/));
  await ctx.step(30);
  await page.waitForTimeout(250);
  m = await mark();
  await tap('Space', 2);
  await until('the jump and its landing', m, (h) => has(h, /^hero\.jump$/) && has(h, /^hero\.land\./), 120, 6);
  await page.waitForTimeout(250);
  m = await mark();
  await page.keyboard.down('KeyD');
  await until('the hero\'s steps on stone', m, (h) => h.filter((id) => id === 'hero.step.stone').length >= 2, 200, 8);
  await page.keyboard.up('KeyD');
  said.push('dash, jump, landing, steps on stone');

  // ---- a blow, and the hit it lands
  await ctx.step(20);
  await page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 1.3, 0, 99)');
  await ctx.step(2);
  await page.waitForTimeout(250);
  m = await mark();
  await tap('KeyJ');
  const blow = await until('the blow and its hit', m, (h) => has(h, /^hero\.slash\.1$/) && has(h, /^hit\.(light|heavy)$/), 80, 2);
  assert.ok(blow.indexOf('hero.slash.1') < blow.findIndex((id) => /^hit\./.test(id)), 'the blow is heard before the hit it lands');
  said.push('a blow and its hit');

  // ---- the hero is hurt, falls, and comes back
  await godMode(false);
  for (let i = 0; i < 200 && (await ctx.state()).invulnerable; i++) await ctx.step(2);
  await page.waitForTimeout(250);
  m = await mark();
  await page.evaluate('window.__troid.strikePlayer(1)');
  await ctx.step(2);
  await until('the cry of pain', m, (h) => has(h, /^hero\.hurt\.(light|heavy)$/), 40, 2);
  for (let i = 0; i < 200 && (await ctx.state()).invulnerable; i++) await ctx.step(2);
  await sess(page, `s.player.health.damage(s.player.health.current - 1);`);
  await ctx.step(2);
  await page.waitForTimeout(1500);
  m = await mark();
  await page.evaluate('window.__troid.strikePlayer(1)');
  await until('the fall', m, (h) => has(h, /^hero\.death$/), 60, 2);
  await waitAudio(page, `a.conductor.dead === true && a.conductor.drive === 0`, 8000); // the conductor knows the hero is down, and takes the danger out of the music
  let a = await audioOf(page);
  const down = await listen(page, 1200);
  for (let i = 0; i < 700 && (await ctx.state()).death?.phase !== 'none'; i++) await ctx.step(2);
  await until('the return', m, (h) => has(h, /^hero\.respawn$/), 100, 4);
  a = await audioOf(page);
  assert.equal(a.conductor.dead, false, 'and that they are back');
  said.push('hurt, death (the music dims), respawn');
  void down;

  // ---- the Spirit Bolt and a bottle
  await sess(page, `s.loadout.acquire("card_spirit_bolt");`);
  await page.evaluate('window.__troid.spawnDummy(window.__troid.session.player.body.x + 6, 0, 99)');
  await ctx.step(2);
  await page.waitForTimeout(250);
  m = await mark();
  await tap('KeyK');
  await until('the bolt', m, (h) => has(h, /^magic\.cast\.release$/) && has(h, /^hit\.bolt$/), 160, 2);
  await sess(page, `s.player.health.damage(2);`);
  await ctx.step(60);
  await page.waitForTimeout(250);
  m = await mark();
  await tap('KeyL');
  await until('the bottle', m, (h) => has(h, /^bottle\.start$/) && has(h, /^bottle\.drunk$/), 160, 4);
  said.push('the bolt and its impact, a bottle');

  // ---- the slime: it notices, winds up, lunges, falls — and the music brings in the danger, then lets it go
  await godMode(true);
  await ctx.teleport(44, 0);
  await ctx.step(450); // (the blows and the bolt of a moment ago have brought danger into the music: seven seconds of the game's time with nothing threatening let it go)
  await waitAudio(page, `a.conductor.drive === 0 && a.music.layers.drive === 0`, 10000);
  a = await audioOf(page);
  assert.equal(a.conductor.drive, 0, 'before the fight there is no danger in the music');
  m = await mark();
  const slime = (await page.evaluate('window.__troid.spawnSlime(window.__troid.session.player.body.x + 7, 0, -1)')) as string;
  const warned = await until('the slime warns', m, (h) => has(h, /^slime\.alert$/) && has(h, /^slime\.telegraph$/) && has(h, /^slime\.lunge$/), 600, 6);
  assert.ok(warned.indexOf('slime.telegraph') < warned.indexOf('slime.lunge'), 'it winds up before it lunges');
  await waitAudio(page, `a.conductor.drive === 1 && a.music.layers.drive === 1`, 10000);
  await waitAudio(page, `a.music.loaded.includes('drive')`, 20000);
  a = await audioOf(page);
  assert.equal(a.loader.groups['music.ruins.drive']?.state, 'ready', 'the drive layer was fetched when the danger came');
  const drive = (await loopsStarted(page)).filter((l) => l.channels === 1 && Math.round(l.seconds * 1000) === 43636);
  assert.equal(drive.length, 1, 'and it is one mono source of the same length as the base: it joined it in step');
  assert.equal(a.music.sources, 2, 'the base and the drive: two sources, one piece');
  // the slime falls to three blows
  const pull = (): Promise<unknown> =>
    page.evaluate(`(() => { const t = window.__troid; const e = t.session.entities.find((x) => x.id === ${JSON.stringify(slime)}); const p = t.session.player.body; e.body.x = p.x + 1.6; e.body.vx = 0; })()`);
  m = await mark();
  for (let blowNo = 1; blowNo <= 3; blowNo++) {
    await pull();
    await ctx.step(1);
    await tap('KeyJ');
    for (let i = 0; i < 40 && ((await ctx.state()).enemies?.find((e) => e.id === slime)?.hp ?? 0) > 3 - blowNo; i++) await ctx.step(1);
    await ctx.step(30);
    await page.waitForTimeout(120);
  }
  const fell = await until('the slime falls', m, (h) => has(h, /^slime\.death$/), 120, 6);
  assert.ok(has(fell, /^hit\./), 'its death comes with the hits that did it');
  await ctx.step(450); // seven seconds of the game's time with nothing threatening
  await waitAudio(page, `a.conductor.drive === 0 && a.music.layers.drive === 0`, 10000);
  assert.equal((await audioOf(page)).music.current, 'ruins', 'and the music itself never changed');
  said.push('the slime (alert, wind-up, lunge, death) and the danger in the music');
  await godMode(false);

  // ---- the first change of room is heard
  await sess(page, `s.flags.set('defeated:r1_slime')`);
  await ctx.step(2);
  await page.waitForTimeout(250);
  m = await mark();
  await ctx.teleport(110, 0);
  await until('the way through', m, (h) => has(h, /^transition\.pass$/), 60, 2);
  said.push('a change of room');

  // ---- the boss, on its own page
  await ctx.open('room=r4_sanctum&unlock=dash&audio=on', { ...SIZE, prepare: probed });
  page = ctx.page;
  await page.keyboard.press(UNLOCK);
  await waitAudio(page, `a.music.current === 'sanctum' && a.ambience.current === 'bed.sanctum' && a.loader.groups.core.state === 'ready'`, 40000);
  await ctx.step(20);
  await godMode(true);
  m = await mark();
  await ctx.teleport(30, 0); // the feet cross x = 27.5: the Warden wakes
  await until('the Warden wakes', m, (h) => has(h, /^boss\.wake$/), 200, 4);
  await waitAudio(page, `a.conductor.boss === 'fight' && a.music.wanted === 'warden'`, 10000);
  await waitAudio(page, `a.music.current === 'warden'`, 30000);
  a = await audioOf(page);
  assert.equal(a.loader.groups['boss']?.state, 'ready', 'the boss\'s sounds were fetched with the sanctum');
  assert.deepEqual(a.music.leaving, ['sanctum'], 'the calm of the sanctum goes as the Warden\'s piece comes in');
  await until('the Warden strikes', m, (h) => has(h, /^boss\.telegraph\.(charge|rain)$/) && has(h, /^boss\.strike\.(charge|rain)$/), 2400, 6);
  a = await audioOf(page);
  assert.ok(a.conductor.drive > 0, 'a fight with a boss has the danger in the music from the first moment');
  // its last blow
  await sess(
    page,
    `const g = s.entities.find((e) => e.kind === 'guardian'); g.health.damage(g.health.current - 1);
     s.combat.submit({ ownerId: s.player.id, team: 'player', rect: { x0: g.body.x - 1, x1: g.body.x + 1, y0: g.body.y, y1: g.body.y + 3 }, attackId: 'e2e_blow', damage: 1,
       knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set() });`,
  );
  m = await mark();
  await until('the Warden falls', m, (h) => has(h, /^boss\.death$/), 40, 2);
  await ctx.step(80); // the delay of the victory is game time (1.1 s)
  await until('the victory', m, (h) => has(h, /^stinger\.victory$/), 200, 10);
  await waitAudio(page, `a.music.current === null`, 10000); // the room goes quiet for the fall…
  await ctx.step(200); // …and the calm comes back after it
  await waitAudio(page, `a.music.current === 'sanctum'`, 30000);
  said.push('the Warden (wake, its own piece, wind-up, strike, fall, silence, victory, the calm back)');
  return said.join('; ');
}

const SECTIONS = new Set((process.env['AUDIO_SECTIONS'] ?? 'A,B,C,D,E,F,G,H,I,J').split(',').map((x) => x.trim().toUpperCase()));

export const audio: Scenario = {
  name: 'audio',
  async run(ctx: Ctx) {
    const section = async (id: string, run: () => Promise<string>): Promise<void> => {
      if (!SECTIONS.has(id)) return console.log(`  audio ${id}: skipped`);
      console.log(`  audio ${id}: ${await run()}`);
    };
    await section('A', () => lock(ctx));
    await section('B', () => loops(ctx));
    await section('C', () => sounds(ctx));
    await section('D', () => journey(ctx));
    await section('E', () => volumes(ctx));
    await section('F', () => pausing(ctx));
    await section('G', () => remembering(ctx));
    await section('H', () => failing(ctx));
    await section('I', () => storm(ctx));
    await section('J', () => playedGame(ctx));
    assert.equal(ctx.errors.length, 0, ctx.errors.join(' | '));
  },
};
