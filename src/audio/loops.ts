import type { AudioEngine } from './engine';
import type { Levels } from './levels';
import type { SoundLoader } from './loader';
import type { AudioIndex, SoundDef, TrackDef } from './manifest';
import { categoryOfBus } from '@/presentation/audioMix';
import { dbToGain } from './spatial';

/**
 * A CHANNEL OF LOOPS (docs/PROMPT18-LOG.md): what plays on and on — the music of a place, the bed of its ambience. A channel plays ONE piece at a time (a set of layers started together and looped without a seam), changes
 * it with a crossfade, and keeps its state through everything that is not the player's choice: a pause leaves it where it is, a room that asks for the piece that is already playing changes nothing, a piece that is asked for
 * again while it is still fading out is brought back instead of started a second time (never two copies of the same music at once).
 *
 * Layers (`base`, `drive`…) are separate files of the same length, started at the same instant and looped together, so that they stay in step for as long as the game runs. A layer's level moves smoothly to what the
 * game asks (the combat layer of a track comes in as the danger rises).
 *
 * What is silent costs nothing: with the channel's volume at zero the piece is not fetched, not decoded and not started — only remembered, and played from its start when the volume comes back (or when the first gesture
 * lets the browser make sound).
 */
export interface ChannelOptions {
  engine: AudioEngine;
  loader: SoundLoader;
  index: AudioIndex;
  levels: Levels;
  /** The bus the channel plays on (its layers' own bus must be the same). */
  bus: 'music' | 'ambience';
  warn?: (message: string) => void;
}

interface Layer {
  def: SoundDef;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  /** The level the game wants of it (0 … 1), before the sound's own trim. */
  target: number;
}

interface Instance {
  id: string;
  group: string;
  out: GainNode;
  layers: Map<string, Layer>;
  /** It is on its way out: the audio clock's time at which it is stopped for good. */
  leavingUntil: number | null;
  /** A piece that left because it was asked to can be brought back until it is gone; one that left because the volume went to zero cannot. */
  revivable: boolean;
}

export interface ChannelStats {
  /** The piece that is playing (or about to), the pieces still fading out, and the one asked for. */
  current: string | null;
  leaving: string[];
  wanted: string | null;
  /** Layer → the level it is moving to. */
  layers: Record<string, number>;
  /** How many looped sources exist now (fading pieces included): never more than one per layer of a piece. */
  sources: number;
  /** A piece is being fetched. */
  loading: boolean;
}

/** A fade of `s` seconds is an exponential approach with time constant `s / 4`: it is inaudible (−35 dB) by the end. */
const TAU_PER_FADE = 1 / 4;
/** How long a fading piece is kept after its fade is over, so that nothing is cut while it can still be heard (a fraction of the fade). */
const LINGER = 1.25;

export class LoopChannel {
  private current: Instance | null = null;
  private leaving: Instance[] = [];
  private wanted: { id: string; fade: number } | null = null;
  private token = 0;
  private loading = false;
  private readonly layerTargets = new Map<string, number>();
  private readonly offs: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly o: ChannelOptions) {
    this.offs.push(
      o.engine.onRunning(() => this.resume()),
      o.engine.onTick(() => this.tick()),
      o.levels.onChange((category) => {
        if (category === 'master' || category === categoryOfBus(o.bus)) this.levelChanged();
      }),
    );
  }

  /**
   * Plays `id` (a track of the manifest) from its start, fading the piece that plays now out over `fadeSec` — or, with `null`, fades everything out. Asking for what is already playing does nothing; asking for what is
   * still fading out brings it back.
   */
  play(id: string | null, fadeSec = 3): void {
    if (this.disposed) return;
    if (id === null) {
      this.cancelLoad();
      this.wanted = null;
      this.leave(this.current, fadeSec);
      this.current = null;
      return;
    }
    if (!this.o.index.tracks[id]) {
      this.o.warn?.(`audio: there is no piece "${id}" in the manifest`);
      return;
    }
    if (this.current?.id === id) {
      // what is playing is what is wanted: a piece that was on its way (a quick change and back) is forgotten
      this.cancelLoad();
      this.wanted = { id, fade: fadeSec };
      return;
    }
    if (this.loading && this.wanted?.id === id) return; // already on its way
    this.cancelLoad();
    this.wanted = { id, fade: fadeSec };
    this.start();
  }

  /** Sets how much of a layer is heard, 0 … 1; it moves there over `seconds`. */
  setLayer(name: string, level: number, seconds = 1.2): void {
    const v = Math.min(1, Math.max(0, level));
    this.layerTargets.set(name, v);
    const layer = this.current?.layers.get(name);
    if (layer) this.moveLayer(layer, v, seconds);
  }

  stats(): ChannelStats {
    const layers: Record<string, number> = {};
    for (const [name, layer] of this.current?.layers ?? []) layers[name] = layer.target;
    let sources = 0;
    for (const inst of [this.current, ...this.leaving]) if (inst) for (const l of inst.layers.values()) if (l.source) sources++;
    return { current: this.current?.id ?? null, leaving: this.leaving.map((i) => i.id), wanted: this.wanted?.id ?? null, layers, sources, loading: this.loading };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoad();
    for (const off of this.offs.splice(0)) off();
    for (const inst of [this.current, ...this.leaving]) if (inst) this.destroy(inst);
    this.current = null;
    this.leaving = [];
  }

  // ------------------------------------------------------------------------------------------------

  private get audible(): boolean {
    return this.o.levels.audible(categoryOfBus(this.o.bus));
  }

  /** What is loading is forgotten: when it arrives it is let go instead of started. */
  private cancelLoad(): void {
    this.token++;
    this.loading = false;
  }

  /** Starts what is wanted if it can be heard now: the engine is running and the channel is not silent. */
  private start(): void {
    const want = this.wanted;
    const { engine, loader, index } = this.o;
    if (!want || this.disposed || this.current?.id === want.id) return;
    const def = index.tracks[want.id];
    if (!def) return;
    if (!engine.running || !this.audible) {
      // remembered, not played: it starts when the engine runs and the volume is above zero
      this.leave(this.current, want.fade);
      this.current = null;
      return;
    }
    // a piece that is still fading out is brought back, not started a second time
    const back = this.leaving.find((i) => i.id === want.id && i.revivable);
    if (back) {
      this.leaving = this.leaving.filter((i) => i !== back);
      this.leave(this.current, want.fade);
      this.current = back;
      back.leavingUntil = null;
      this.fade(back.out, 1, want.fade);
      return;
    }
    const token = ++this.token;
    this.loading = true;
    void loader.retain(def.group).then(() => {
      if (token !== this.token || this.disposed) {
        loader.release(def.group); // superseded while it was arriving
        return;
      }
      this.loading = false;
      if (!engine.running || !this.audible) {
        loader.release(def.group);
        return;
      }
      const inst = this.create(want.id, def);
      if (!inst) {
        loader.release(def.group);
        return;
      }
      this.leave(this.current, want.fade);
      this.current = inst;
      this.fade(inst.out, 1, want.fade);
    });
  }

  /** The piece that is wanted and could not be heard yet starts when it can: the engine began to run, or the volume came up. */
  private resume(): void {
    if (this.wanted && this.current?.id !== this.wanted.id && !this.loading) this.start();
  }

  private levelChanged(): void {
    if (this.disposed) return;
    if (!this.audible) {
      // silent: every piece is let go, the wish is kept
      this.cancelLoad();
      this.leave(this.current, 0.15);
      this.current = null;
      for (const inst of this.leaving) inst.revivable = false;
      return;
    }
    this.resume();
  }

  /** The fading pieces whose fade is over are stopped (the engine calls this each frame, with the audio clock: a context frozen in the background keeps its fade where it was). */
  private tick(): void {
    const ctx = this.o.engine.context;
    if (!ctx || this.leaving.length === 0) return;
    for (const inst of [...this.leaving]) {
      if (inst.leavingUntil !== null && ctx.currentTime >= inst.leavingUntil) {
        this.leaving = this.leaving.filter((i) => i !== inst);
        this.destroy(inst);
      }
    }
  }

  private create(id: string, def: TrackDef): Instance | null {
    const { engine, loader, index } = this.o;
    const ctx = engine.context;
    const bus = engine.input(this.o.bus);
    if (!ctx || !bus) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);
    const origin = ctx.currentTime + 0.06;
    const inst: Instance = { id, group: def.group, out, layers: new Map(), leavingUntil: null, revivable: true };
    for (const [name, soundId] of Object.entries(def.layers)) {
      const buffer = loader.get(soundId)[0];
      const sd = index.sounds[soundId];
      if (!buffer || !sd) {
        this.o.warn?.(`audio: the layer ${name} of "${id}" is not loaded`);
        continue;
      }
      const gain = ctx.createGain();
      const target = name === 'base' ? 1 : (this.layerTargets.get(name) ?? 0);
      gain.gain.value = dbToGain(sd.gainDb) * target;
      gain.connect(out);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const loop = sd.loop ?? { start: 0, end: buffer.duration };
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
      source.connect(gain);
      source.start(origin, loop.start);
      inst.layers.set(name, { def: sd, source, gain, target });
    }
    if (inst.layers.size === 0) {
      out.disconnect();
      return null;
    }
    return inst;
  }

  private moveLayer(layer: Layer, level: number, seconds: number): void {
    const ctx = this.o.engine.context;
    layer.target = level;
    if (!ctx) return;
    layer.gain.gain.setTargetAtTime(dbToGain(layer.def.gainDb) * level, ctx.currentTime, Math.max(0.02, seconds * TAU_PER_FADE));
  }

  private fade(node: GainNode, to: number, seconds: number): void {
    const ctx = this.o.engine.context;
    if (!ctx) return;
    node.gain.setTargetAtTime(to, ctx.currentTime, Math.max(0.02, seconds * TAU_PER_FADE));
  }

  /** Fades a piece out; it is stopped when `tick` finds the fade over, and until then a request for the same piece brings it back. */
  private leave(inst: Instance | null, seconds: number): void {
    if (!inst) return;
    const ctx = this.o.engine.context;
    if (!ctx) {
      this.destroy(inst);
      return;
    }
    inst.revivable = true;
    inst.leavingUntil = ctx.currentTime + seconds * LINGER;
    this.fade(inst.out, 0, seconds);
    if (!this.leaving.includes(inst)) this.leaving.push(inst);
  }

  private destroy(inst: Instance): void {
    for (const layer of inst.layers.values()) {
      try {
        layer.source?.stop();
      } catch {
        // not started
      }
      layer.source?.disconnect();
      layer.gain.disconnect();
      layer.source = null;
    }
    inst.out.disconnect();
    inst.layers.clear();
    this.o.loader.release(inst.group);
  }
}
