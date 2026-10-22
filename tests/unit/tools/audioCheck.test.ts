import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AudioIndex } from '@/audio/manifest';
import { checkAudio, LONGEST_SFX_SECONDS, SEAM, SIZE_BUDGET_BYTES } from '../../../tools/audio/check';
import { INDEX_PATH, MEASURES_PATH, type Measure } from '../../../tools/audio/build';
import { LEVEL_TARGETS, measureName, PEAK_CEILING, targetOf, TRIM_LIMITS, trimFor } from '../../../tools/audio/levels';
import { SOUNDS, TRACKS } from '../../../tools/audio/sounds';

/**
 * THE AUDIO THE GAME SHIPS, CHECKED IN THE REPOSITORY (docs/PROMPT18-LOG.md): the manifest, every file in both formats, what `tools/audio` measured of each and what the game asks for — all must agree, on every run of the
 * tests. The check reads the committed files (it renders nothing and runs no ffmpeg); a change to a recipe that was not followed by `npm run audio:build`, a file that was edited by hand, a sound the game names that has no
 * file, a loop that clicks or a sound that clips fails here.
 */
describe('the audio of the game, as it is in the repository', () => {
  const report = checkAudio();

  it('is consistent: the files, the manifest, the recipes, what the game asks for, the levels, the loops', () => {
    expect(report.errors).toEqual([]);
  });

  it('has the sounds and the music the game is made of, in both formats', () => {
    expect(report.counts.sounds).toBeGreaterThanOrEqual(80);
    expect(report.counts.tracks).toBe(8); // four pieces of music and four beds of ambience
    expect(report.counts.files % 2, 'one file in each of the two formats').toBe(0);
    expect(report.counts.bytes).toBeLessThan(SIZE_BUDGET_BYTES);
  });

  it('says nothing it should not about the sounds that have a long silence inside them', () => {
    expect(report.warnings).toEqual([]);
  });

  it('has a recipe for every sound and one loudness target for every kind of sound: none is left at whatever it came out as', () => {
    for (const r of SOUNDS) expect(targetOf(r.id), `${r.id} has a loudness target`).toBeDefined();
    for (const t of TRACKS) {
      const layers = t.id.startsWith('bed.') ? ['base'] : ['base', 'drive'];
      for (const l of layers) expect(targetOf(`${t.id}.${l}`), `${t.id}.${l} has a loudness target`).toBeDefined();
    }
    for (const t of LEVEL_TARGETS) expect(t.lufs).toBeLessThan(-10);
  });

  it('keeps the pieces of the interface the quietest of the effects, the hero\'s pain the loudest of the hero\'s sounds and the footsteps under the music', () => {
    const lufs = (id: string): number => (targetOf(id) as { lufs: number }).lufs;
    expect(lufs('ui.tap')).toBeLessThan(lufs('hero.slash.1'));
    expect(lufs('ui.slider')).toBeLessThan(lufs('ui.tap'));
    expect(lufs('hero.hurt.heavy')).toBeGreaterThan(lufs('hero.hurt.light'));
    for (const id of ['hero.slash.1', 'hero.jump', 'hero.land.heavy', 'hero.dash.ground', 'hit.heavy']) expect(lufs('hero.hurt.heavy'), id).toBeGreaterThanOrEqual(lufs(id));
    expect(lufs('hero.step.stone')).toBeLessThan(lufs('ruins.base') - 5);
    expect(lufs('hit.heavy')).toBeGreaterThan(lufs('hit.light'));
    expect(lufs('amb.drip')).toBeLessThanOrEqual(lufs('hero.step.stone')); // (and the ambience bus is lower than the effects' by default as well)
    expect(lufs('boss.death')).toBeGreaterThanOrEqual(lufs('slime.death'));
  });

  it('has the limits the check holds the files to', () => {
    expect(LONGEST_SFX_SECONDS).toBeLessThanOrEqual(10);
    expect(SEAM.step).toBeLessThanOrEqual(5);
    expect(SEAM.jumpDb).toBeLessThan(-40);
    expect(PEAK_CEILING).toBeLessThan(0);
  });
});

describe('what ships is what the mix was made from', () => {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as AudioIndex;
  const measures = existsSync(MEASURES_PATH) ? (JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) as Record<string, Measure>) : {};

  it('has no two sounds that are the same file: every sound, every variation, is a sound of its own', () => {
    const owner = new Map<string, string>();
    for (const [id, s] of Object.entries(index.sounds)) {
      s.variants.forEach((v, k) => {
        for (const path of [v.opus, v.mp3]) {
          if (!path) continue;
          const who = `${id} (variation ${k + 1})`;
          expect(owner.get(path), `${path} is ${who}, and also ${owner.get(path)}`).toBeUndefined();
          owner.set(path, who);
        }
      });
    }
    expect(owner.size).toBeGreaterThanOrEqual(160);
  });

  it('has its trims made from the files as a decoder gives them back, not from the samples they were made from: a codec takes the top of a bright sound off', () => {
    for (const [id, s] of Object.entries(index.sounds)) {
      s.variants.forEach((_, k) => {
        const m = measures[measureName(id, k, s.variants.length)];
        expect(m?.playedLufs, `${id} (variation ${k + 1}) was measured decoded: run \`npm run audio:balance\``).toBeTypeOf('number');
        expect(m?.playedPeakDb).toBeTypeOf('number');
      });
    }
  });

  it('keeps every sound\'s decoded peak, with its trim, under full scale: the limiter is a safety net, not part of the sound', () => {
    for (const [id, s] of Object.entries(index.sounds)) {
      let peak = -Infinity;
      s.variants.forEach((_, k) => (peak = Math.max(peak, measures[measureName(id, k, s.variants.length)]?.playedPeakDb ?? -Infinity)));
      expect(peak + Math.max(0, s.gainDb), `${id} peaks at ${(peak + Math.max(0, s.gainDb)).toFixed(1)} dBFS`).toBeLessThan(-0.3);
    }
  });

  it('closes every loop the same way in the studio and in the browser: one rule', () => {
    for (const [id, s] of Object.entries(index.sounds)) {
      if (!s.loop) continue;
      const m = measures[measureName(id, 0, 1)];
      expect(m?.seamStep, `${id} has a measured seam`).toBeTypeOf('number');
      expect(m!.seamStep! <= SEAM.step || m!.seamJumpDb! <= SEAM.jumpDb, `${id} closes`).toBe(true);
    }
  });
});

describe('trimFor: the level every sound is brought to', () => {
  it('is the target minus the loudness, to a tenth of a decibel', () => {
    expect(trimFor(-20, -17.04, -10)).toBe(-3);
    expect(trimFor(-20, -23.5, -10)).toBe(3.5);
    expect(trimFor(-20, -20, -10)).toBe(0);
  });

  it('never turns a sound up past the ceiling of its peak — a sound that cannot reach its target gets as close as it can', () => {
    expect(trimFor(-14, -24, -5)).toBe(4);
    expect(trimFor(-14, -24, -2)).toBe(1);
    expect(trimFor(-14, -24, 0)).toBe(-1);
  });

  it('never turns one by more than the limits, either way: a sound that needs more is a sound to be re-made', () => {
    expect(trimFor(-30, -5, -20)).toBe(TRIM_LIMITS.min);
    expect(trimFor(-10, -40, -30)).toBe(TRIM_LIMITS.max);
  });

  it('finds the target of a sound by its id, the first one that matches', () => {
    expect(targetOf('ui.slider')?.lufs).toBeLessThan(targetOf('ui.tap')?.lufs ?? 0); // the slider is a more specific match than ui.*
    expect(targetOf('amb.echo.far')?.lufs).toBeLessThan(targetOf('amb.drip')?.lufs ?? 0);
    expect(targetOf('no.such.sound')).toBeUndefined();
  });
});
