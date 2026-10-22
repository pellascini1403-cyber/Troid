import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buf, SR, type Buf, type Stereo } from './dsp/core';

/**
 * TURNING SYNTHESIZED SAMPLES INTO FILES THE GAME LOADS: ffmpeg (a tool this repository uses, not a dependency of the game) encodes Ogg Opus and MP3 from raw 32-bit float samples piped to it, probes what it wrote
 * and decodes it back (to check it), and draws spectrograms and waveforms (to look at a sound that cannot be listened to here). Nothing is written to a temporary file: samples go in by a pipe.
 */

export type Format = 'opus' | 'mp3';

export interface EncodeOptions {
  /** Bits per second: what the file may cost. */
  bitrate: number;
}

/** Interleaves one or two channels as little-endian float32. */
export function interleave(pcm: Stereo | Buf): { data: Buffer; channels: 1 | 2 } {
  if (pcm instanceof Float32Array) return { data: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), channels: 1 };
  const n = pcm.l.length;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = pcm.l[i] as number;
    out[i * 2 + 1] = pcm.r[i] as number;
  }
  return { data: Buffer.from(out.buffer), channels: 2 };
}

function run(args: string[], input?: Buffer): Promise<{ out: Buffer; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let err = '';
    p.stdout?.on('data', (c: Buffer) => chunks.push(c));
    p.stderr?.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ out: Buffer.concat(chunks), err }) : reject(new Error(`ffmpeg ${args.join(' ')} → ${code}: ${err}`))));
    if (input) {
      p.stdin?.on('error', () => undefined);
      p.stdin?.end(input);
    }
  });
}

/** Writes `pcm` (mono or stereo, at `SR`) as `path`. */
export async function encodeFile(pcm: Stereo | Buf, path: string, format: Format, o: EncodeOptions): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const { data, channels } = interleave(pcm);
  const codec =
    format === 'opus'
      ? ['-c:a', 'libopus', '-b:a', String(o.bitrate), '-vbr', 'on', '-application', 'audio', '-compression_level', '10', '-f', 'ogg']
      : ['-c:a', 'libmp3lame', '-b:a', String(o.bitrate), '-f', 'mp3'];
  await run(['-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), '-i', 'pipe:0', ...codec, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', path], data);
}

export interface Probe {
  codec: string;
  sampleRate: number;
  channels: number;
  durationSec: number;
  bytes: number;
}

/** What a file is, by ffprobe. */
export async function probe(path: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration,size', '-of', 'json', path]);
    let out = '';
    let err = '';
    p.stdout?.on('data', (c: Buffer) => (out += c.toString()));
    p.stderr?.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe ${path}: ${err}`));
      const j = JSON.parse(out) as { streams: Array<{ codec_name: string; sample_rate: string; channels: number }>; format: { duration: string; size: string } };
      const s = j.streams[0] as { codec_name: string; sample_rate: string; channels: number };
      resolve({ codec: s.codec_name, sampleRate: Number(s.sample_rate), channels: s.channels, durationSec: Number(j.format.duration), bytes: Number(j.format.size) });
    });
  });
}

/** Decodes a file the way a player would, to 48 kHz stereo float: what the checks measure (the file that ships, not the samples it was made from). */
export async function decodeFile(path: string): Promise<Stereo> {
  const { out } = await run(['-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1']);
  const f = new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
  const n = Math.floor(f.length / 2);
  const l = buf(n);
  const r = buf(n);
  for (let i = 0; i < n; i++) {
    l[i] = f[i * 2] as number;
    r[i] = f[i * 2 + 1] as number;
  }
  return { l, r };
}

/** A spectrogram (frequency up, time across) of the samples, as a PNG — to look at what a sound does. */
export async function spectrogramPng(pcm: Stereo | Buf, path: string, size = '1100x360'): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const { data, channels } = interleave(pcm);
  await run(['-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), '-i', 'pipe:0', '-lavfi', `showspectrumpic=s=${size}:legend=1:scale=log:fscale=log:stop=20000:start=40:color=intensity`, path], data);
}

/** The waveform as a PNG. */
export async function waveformPng(pcm: Stereo | Buf, path: string, size = '1100x240'): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const { data, channels } = interleave(pcm);
  await run(['-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), '-i', 'pipe:0', '-lavfi', `showwavespic=s=${size}:split_channels=0`, '-frames:v', '1', path], data);
}
