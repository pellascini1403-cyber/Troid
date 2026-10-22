import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAudio, ROOT } from './build';
import { checkAudio } from './check';
import { balance } from './levels';
import { mulberry32, seedOf, SR } from './dsp/core';
import { activeRmsDb, bandProfile, integratedLufs, loopSeam, momentaryLufs, OCTAVES, peakDb, silence, spectralCentroid, truePeakDb } from './dsp/measure';
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
  const trims = balance();
  console.log(`levels set: ${trims.length} sounds got a new trim`);
} else if (command === 'balance') {
  const trims = balance();
  for (const t of trims) console.log(`  ${t.id.padEnd(26)} ${t.from.toFixed(1).padStart(6)} → ${t.to.toFixed(1).padStart(6)} dB`);
  console.log(`${trims.length} sounds got a new trim`);
} else if (command === 'check') {
  const report = checkAudio();
  for (const w of report.warnings) console.log(`warning: ${w}`);
  for (const e of report.errors) console.error(`ERROR: ${e}`);
  console.log(`${report.counts.sounds} sounds, ${report.counts.tracks} pieces, ${report.counts.files} files, ${(report.counts.bytes / 1048576).toFixed(2)} MiB: ${report.errors.length} errors, ${report.warnings.length} warnings`);
  process.exit(report.errors.length > 0 ? 1 : 0);
} else if (command === 'spec') {
  const out = join(ROOT, '.audio-spec');
  mkdirSync(out, { recursive: true });
  const wanted = args.filter((a) => !a.startsWith('--'));
  for (const prefix of wanted.slice(1)) {
    for (const t of TRACKS.filter((x) => x.id === prefix || x.id.startsWith(prefix))) {
      const layers = t.render(mulberry32(seedOf(t.id)));
      for (const [layer, pcm] of Object.entries(layers)) {
        const mono = toMono(pcm);
        const name = `${t.id}.${layer}`;
        await spectrogramPng(pcm, join(out, `${name}.spec.png`));
        await waveformPng(pcm, join(out, `${name}.wave.png`));
        const seam = loopSeam(pcm);
        console.log(`   octaves ${OCTAVES.map((o, k) => `${o}:${bandProfile(pcm)[k]}`).join('  ')}`);
        console.log(
          `${name.padEnd(28)} ${(pcm.l.length / SR).toFixed(2)} s  peak ${peakDb(pcm).toFixed(1)}  true ${truePeakDb(pcm).toFixed(1)}  lufs ${integratedLufs(pcm).toFixed(1)}  rms ${activeRmsDb(pcm).toFixed(1)}  centroid ${Math.round(spectralCentroid(mono))} Hz  silent ${silence(pcm).longestMs} ms  seam×${seam.step.toFixed(1)} Δ${seam.levelDb.toFixed(1)} dB jump ${seam.jumpDb.toFixed(1)} dBFS`,
        );
      }
    }
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
