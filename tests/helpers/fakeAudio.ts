/**
 * A WEB AUDIO THAT CAN BE LOOKED AT (docs/PROMPT18-LOG.md): just enough of `AudioContext` to run the engine without a browser — nodes that remember what they are connected to, parameters that remember what they were told
 * and can say what value they have at any moment of a clock the test moves by hand, sources that end when their time comes. The engine is written against the real API; this is how the tests see what it did with it.
 */

type Event = { type: 'set' | 'target' | 'ramp'; time: number; value: number; tau: number };

export class FakeParam {
  private events: Event[] = [];
  private base: number;
  constructor(value: number, private readonly clock: () => number) {
    this.base = value;
  }

  /** As in the real API: what the parameter is now (the value it was given, moved by whatever is scheduled); setting it gives it a new value to start from. */
  get value(): number {
    return this.valueAt(this.clock());
  }

  set value(v: number) {
    this.base = v;
  }

  setValueAtTime(value: number, time: number): this {
    this.insert({ type: 'set', time, value, tau: 0 });
    return this;
  }

  setTargetAtTime(value: number, time: number, tau: number): this {
    this.insert({ type: 'target', time, value, tau });
    return this;
  }

  /** (A ramp is told by the time it ENDS; it starts where the event before it left the parameter.) */
  linearRampToValueAtTime(value: number, time: number): this {
    this.insert({ type: 'ramp', time, value, tau: 0 });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }

  private insert(e: Event): void {
    // a stable insert by time: the events of the same instant stay in the order they were given
    let i = this.events.length;
    while (i > 0 && (this.events[i - 1] as Event).time > e.time) i--;
    this.events.splice(i, 0, e);
  }

  /** What the parameter is at time `t`: the value it was given, moved by the events up to `t` as the Web Audio rules say (a target approaches exponentially from where the parameter was, a ramp is a straight line from the event before it). */
  valueAt(t: number): number {
    let time0 = -Infinity;
    let v0 = this.base;
    let target: { to: number; start: number; tau: number } | null = null;
    const now = (x: number): number => (target && x > target.start ? target.to + (v0 - target.to) * Math.exp(-(x - target.start) / target.tau) : v0);
    for (const e of this.events) {
      if (e.type === 'ramp') {
        if (t >= e.time) {
          v0 = e.value;
          time0 = e.time;
          target = null;
          continue;
        }
        return time0 === -Infinity || t <= time0 ? v0 : v0 + (e.value - v0) * ((t - time0) / (e.time - time0));
      }
      if (e.time > t) break;
      if (e.type === 'set') {
        v0 = e.value;
        target = null;
      } else {
        v0 = now(e.time);
        target = { to: e.value, start: e.time, tau: Math.max(1e-9, e.tau) };
      }
      time0 = e.time;
    }
    return now(t);
  }

  /** The value now, on the clock. */
  get current(): number {
    return this.valueAt(this.clock());
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  connected = false;
  constructor(readonly ctx: FakeContext, readonly kind: string) {
    ctx.nodes.push(this);
  }

  connect(dest: FakeNode): FakeNode {
    if (!this.outputs.includes(dest)) this.outputs.push(dest);
    this.connected = true;
    return dest;
  }

  disconnect(): void {
    this.outputs.length = 0;
    this.connected = false;
  }
}

export class FakeGain extends FakeNode {
  readonly gain: FakeParam;
  constructor(ctx: FakeContext) {
    super(ctx, 'gain');
    this.gain = new FakeParam(1, () => ctx.currentTime);
  }
}

export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  constructor(ctx: FakeContext) {
    super(ctx, 'biquad');
    this.frequency = new FakeParam(350, () => ctx.currentTime);
    this.Q = new FakeParam(1, () => ctx.currentTime);
  }
}

export class FakePanner extends FakeNode {
  readonly pan: FakeParam;
  constructor(ctx: FakeContext) {
    super(ctx, 'panner');
    this.pan = new FakeParam(0, () => ctx.currentTime);
  }
}

export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeContext) {
    super(ctx, 'convolver');
  }
}

export class FakeCompressor extends FakeNode {
  readonly threshold: FakeParam;
  readonly knee: FakeParam;
  readonly ratio: FakeParam;
  readonly attack: FakeParam;
  readonly release: FakeParam;
  constructor(ctx: FakeContext) {
    super(ctx, 'compressor');
    const p = (v: number): FakeParam => new FakeParam(v, () => ctx.currentTime);
    this.threshold = p(-24);
    this.knee = p(30);
    this.ratio = p(12);
    this.attack = p(0.003);
    this.release = p(0.25);
  }
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  /** What the test wants `getFloatTimeDomainData` to return. */
  level = 0;
  constructor(ctx: FakeContext) {
    super(ctx, 'analyser');
  }

  getFloatTimeDomainData(out: Float32Array): void {
    for (let i = 0; i < out.length; i++) out[i] = i % 2 === 0 ? this.level : -this.level;
  }
}

export class FakeBuffer {
  readonly length: number;
  /** The samples of each channel, made the first time they are asked for: most tests look at the graph and never do, and a minute of stereo is twenty MiB. */
  private readonly data: Float32Array[] = [];
  constructor(readonly numberOfChannels: number, length: number, readonly sampleRate: number) {
    this.length = length;
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return (this.data[channel] ??= new Float32Array(this.length));
  }

  copyToChannel(source: Float32Array, channel: number): void {
    this.getChannelData(channel).set(source);
  }
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate: FakeParam;
  readonly detune: FakeParam;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  offset = 0;
  stoppedAt: number | null = null;
  ended = false;
  constructor(ctx: FakeContext) {
    super(ctx, 'source');
    this.playbackRate = new FakeParam(1, () => ctx.currentTime);
    this.detune = new FakeParam(0, () => ctx.currentTime);
    ctx.sources.push(this);
  }

  start(when = 0, offset = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: the source was already started');
    this.startedAt = Math.max(when, this.ctx.currentTime);
    this.offset = offset;
  }

  stop(when = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: the source was never started');
    this.stoppedAt = Math.max(when, this.ctx.currentTime);
  }

  /** The time its sound runs out, on the clock (infinity for a loop that was not stopped). */
  endTime(): number {
    if (this.startedAt === null) return Infinity;
    const natural = this.loop || !this.buffer ? Infinity : this.startedAt + (this.buffer.duration - this.offset) / Math.max(1e-6, this.playbackRate.value);
    return Math.min(this.stoppedAt ?? Infinity, natural);
  }
}

export class FakeContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  readonly nodes: FakeNode[] = [];
  readonly sources: FakeSource[] = [];
  readonly destination: FakeNode;
  private readonly listeners: Array<() => void> = [];
  /** How many times `resume` was asked. */
  resumes = 0;
  /** `true`: the browser refuses to run the context (autoplay without a gesture): `resume` leaves it suspended. */
  blocked: boolean;

  constructor(options: { running?: boolean; blocked?: boolean } = {}) {
    this.destination = new FakeNode(this, 'destination');
    this.blocked = options.blocked ?? false;
    if (options.running) this.state = 'running';
  }

  createGain(): FakeGain {
    return new FakeGain(this);
  }

  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad(this);
  }

  createStereoPanner(): FakePanner {
    return new FakePanner(this);
  }

  createConvolver(): FakeConvolver {
    return new FakeConvolver(this);
  }

  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor(this);
  }

  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser(this);
  }

  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate);
  }

  addEventListener(type: string, cb: () => void): void {
    if (type === 'statechange') this.listeners.push(cb);
  }

  private set(state: FakeContext['state']): void {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.listeners) cb();
  }

  resume(): Promise<void> {
    this.resumes++;
    if (this.state === 'closed') return Promise.reject(new Error('closed'));
    if (!this.blocked) this.set('running');
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (this.state === 'running') this.set('suspended');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.set('closed');
    return Promise.resolve();
  }

  /** Lets the browser run the context (the person touched the page). */
  allow(): void {
    this.blocked = false;
  }

  /** Moves the clock: sources whose time has come end (their `onended` is called, once), but only while the context runs. */
  advance(seconds: number): void {
    if (this.state !== 'running') return;
    this.currentTime += seconds;
    for (const s of this.sources) {
      if (s.ended || s.startedAt === null) continue;
      if (s.endTime() <= this.currentTime) {
        s.ended = true;
        s.onended?.();
      }
    }
  }

  /** The sources that have started and not ended. */
  playing(): FakeSource[] {
    return this.sources.filter((s) => s.startedAt !== null && !s.ended);
  }

  /** How loud a node is at time `t` at the speakers: the product of the gains along the loudest path to the destination (a compressor, a filter and a panner count as 1). 0 when no path reaches it. */
  audibleGain(node: FakeNode, t = this.currentTime): number {
    const seen = new Set<FakeNode>();
    const walk = (n: FakeNode, acc: number): number => {
      if (n === this.destination) return acc;
      if (seen.has(n)) return 0;
      seen.add(n);
      const own = n instanceof FakeGain ? n.gain.valueAt(t) : 1;
      let best = 0;
      for (const out of n.outputs) best = Math.max(best, walk(out, acc * own));
      seen.delete(n);
      return best;
    };
    return walk(node, 1);
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

/** An `AudioBuffer` of `seconds` (a stand-in: it has a length and a duration). */
export function fakeBuffer(seconds: number, channels = 1, rate = 48000): AudioBuffer {
  return new FakeBuffer(channels, Math.round(seconds * rate), rate) as unknown as AudioBuffer;
}
