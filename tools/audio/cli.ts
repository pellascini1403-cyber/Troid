import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAudio, ROOT } from './build';
import { mulberry32, seedOf, SR } from './dsp/core';
import { activeRmsDb, integratedLufs, loopSeam, momentaryLufs, peakDb, silence, spectralCentroid, truePeakDb } from './dsp/measure';
import { toMono } from './dsp/sfxlib';
import { spectrogramPng, waveformPng } from './encode';
import { SOUNDS, TRACKS } from './sounds';

/**
 * `npm run audio:build [-- --only=hero.,ui.]` makes the sounds (all, or the ones whose id starts with what is given); `npm run audio:spec -- <id>` renders one and draws it (a spectrogram and a waveform in `.audio-spec/`) with its
 * numbers, to look at a sound that cannot be listened to here.
 */
const args = process.argv.slice(2);
const command = args[0] ?? 'build';
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);

if (command === 'build') {
  const t0 = Date.now();
  const index = await buildAudio({ only: only.length ? only : undefined, log: (l) => console.log(l), recipes: { sounds: SOUNDS, tracks: TRACKS } });
  console.log(`\n${Object.keys(index.sounds).length} sounds and ${Object.keys(index.tracks).length} tracks written to public/audio (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} else if (command === 'spec') {
  const out = join(ROOT, '.audio-spec');
  mkdirSync(out, { recursive: true });
  const wanted = args.filter((a) => !a.startsWith('--'));
  for (const prefix of wanted.slice(1)) {
    for (const r of SOUNDS.filter((s) => s.id === prefix || s.id.startsWith(prefix))) {
      for (let v = 0; v < r.variants; v++) {
        const pcm = r.render(v, mulberry32(seedOf(r.id, v)));
        const mono = toMono(pcm);
        const name = `${r.id}${r.variants > 1 ? `_${v + 1}` : ''}`;
        const target = r.channels === 1 ? mono : pcm;
        await spectrogramPng(target, join(out, `${name}.spec.png`));
        await waveformPng(target, join(out, `${name}.wave.png`));
        const seam = r.loop ? ` seam×${loopSeam(pcm).step.toFixed(1)}` : '';
        console.log(
          `${name.padEnd(28)} ${(pcm.l.length / SR).toFixed(2)} s  peak ${peakDb(pcm).toFixed(1)}  true ${truePeakDb(pcm).toFixed(1)}  lufs ${(pcm.l.length / SR >= 3 ? integratedLufs(pcm) : momentaryLufs(pcm)).toFixed(1)}  rms ${activeRmsDb(pcm).toFixed(1)}  centroid ${Math.round(spectralCentroid(mono))} Hz  silent ${silence(pcm).longestMs} ms${seam}`,
        );
      }
    }
  }
} else {
  console.error(`unknown command: ${command}`);
  process.exit(1);
}
