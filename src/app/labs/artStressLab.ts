import { Container, Sprite, type Texture } from 'pixi.js';
import type { LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { createVfxAtlas } from '@/assets/vfxAtlas';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { Rng } from '@/core/rng';
import { assignSet, medianOf, summarizeFrames, type FrameSummary, type StressOrder } from '@/presentation/stressModel';
import type { VfxTrigger } from '@/presentation/vfx';
import { viewY } from '@/presentation/worldTransform';
import { Renderer2D } from '@/render/Renderer2D';
import type { Art } from '../art';
import type { Effects } from '../effects';
import { artIndexUrl } from '../options';

/**
 * THE ART STRESS SCENE (`?lab=art-stress`, docs/ART-PIPELINE-2D.md part J): what a crowd of sprites drawn from ART — sprite sets that come through the real art library, in
 * several atlas pages — and the real effects cost to draw, measured: draw calls, the memory of the pages, how even the frames are and how long the art takes to arrive.
 * It is the budget check of the art pipeline, the way `?lab=stress` is the one of the renderer.
 *
 *   ?art=<folder>         the art (the lab reads `<folder>/index.json`)
 *   ?use=pack/set,…       the sprite sets the crowd is drawn from (the library loads them by name)
 *   ?hold=pack/set,…      sets that are loaded and kept resident without being drawn (to count their memory)
 *   ?n=500 · ?sets=4 · ?order=sorted|interleaved · ?animate=0|1 · ?alpha=1 · ?additive=0.2 · ?blend=layered|mixed · ?vfx=12
 *
 * It is a chunk of its own (no player downloads it) and changes nothing of the game. `window.__artStress` lets the E2E configure the crowd and measure it.
 */
export interface StressConfig {
  /** Sprites on screen. */
  n: number;
  /** How many of the `use` sets the crowd is dealt among. */
  sets: number;
  order: StressOrder;
  /** The frame of every sprite changes every few frames (a sprite from the same page: it must not break a batch). */
  animate: boolean;
  /** Sprite opacity, 0–1. */
  alpha: number;
  /** The share of the crowd that is drawn with light (additive blend). */
  additive: number;
  /** `layered`: the additive sprites have a layer of their own (what the game does). `mixed`: they are interleaved with the others in one layer (what it must not do). */
  blend: 'layered' | 'mixed';
  /** Effect bursts per second, through the real director and system (0: none). */
  vfx: number;
}

export interface Measurement {
  config: StressConfig;
  frame: FrameSummary;
  draws: { median: number; max: number; min: number };
  /** Distinct atlas pages the crowd draws from. */
  textures: number;
  vfx: { particles: number; peakParticles: number; sprites: number; spawned: number; dropped: number; poolCreated: number; budget: { particles: number; sprites: number } } | null;
  art: { pages: number; bytes: number; peakBytes: number; sets: number; requests: number; failures: number; loadMs: number };
  /** The JavaScript heap, bytes, when the browser says (Chromium does). */
  heapBytes: number | null;
}

const num = (p: URLSearchParams, k: string, d: number): number => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : d);
const list = (p: URLSearchParams, k: string): string[] => (p.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const heap = (): number | null => (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? null;

/** What a busy fight raises, in the order the director gets it. */
const BURSTS: readonly VfxTrigger[] = ['hitLanded', 'playerHurt', 'dashStart', 'enemyDied', 'bossStrike', 'boltImpact', 'slash'];

export async function startArtStressLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const renderer = await Renderer2D.create({ host, viewHeight: 13.5 });
  renderer.applyCamera({ x: 0, y: 4 }, { x: 0, y: 0, rollRad: 0 }, 13.5);
  const layers = renderer.layers;

  // ---------------------------------------------------------------------------------------------------------------- the art, through the real library
  const notes: string[] = [];
  const indexUrl = artIndexUrl(params.get('art') ?? undefined, __TROID_ART_INDEX__, document.baseURI);
  let library: Art | null = null;
  const used: Array<LoadedSpriteSet<Texture>> = [];
  const held: Array<LoadedSpriteSet<Texture>> = [];
  const t0 = performance.now();
  if (indexUrl) {
    const { createArt } = await import('../art');
    library = createArt({ indexUrl, drawnPxPerMetre: () => renderer.viewport.ppm * renderer.viewport.resolution, dev: false, note: (m) => void notes.push(m) });
    await library.start();
    for (const [into, names] of [[used, list(params, 'use')], [held, list(params, 'hold')]] as const) {
      for (const name of names) {
        const [pack, sprite] = name.split('/');
        const set = pack && sprite ? await library.acquire(pack, sprite) : null;
        if (set) into.push(set);
        else notes.push(`could not load ${name}`);
      }
    }
  }
  const loadMs = performance.now() - t0;

  // ---------------------------------------------------------------------------------------------------------------- the crowd
  const frames: Texture[][] = used.map((set) => {
    const clip = set.def.clips.idle;
    // (the frames of a clip are `<prefix>NN`; written out here so the lab shares no more code with the game than it must)
    return clip ? Array.from({ length: clip.count }, (_, i) => set.textures.get(`${clip.frames}${String(i).padStart(2, '0')}`)).filter((t): t is Texture => t !== undefined) : [];
  });
  const crowd: Array<{ sprite: Sprite; set: number; frame: number }> = [];
  const lightLayer = new Container({ label: 'stress-light' });
  lightLayer.blendMode = 'add';
  layers.fxWorld.addChild(lightLayer);
  const WIDTH = 26;
  const HEIGHT = 11;
  let config: StressConfig = {
    n: num(params, 'n', 500),
    sets: Math.max(1, Math.min(used.length || 1, num(params, 'sets', used.length || 1))),
    order: params.get('order') === 'interleaved' ? 'interleaved' : 'sorted',
    animate: params.get('animate') !== '0',
    alpha: num(params, 'alpha', 1),
    additive: num(params, 'additive', 0),
    blend: params.get('blend') === 'mixed' ? 'mixed' : 'layered',
    vfx: num(params, 'vfx', 0),
  };

  const rebuild = (): void => {
    for (const c of crowd.splice(0)) c.sprite.destroy();
    if (used.length === 0) return;
    const rng = new Rng(7);
    const cols = Math.max(1, Math.ceil(Math.sqrt((config.n * WIDTH) / HEIGHT)));
    const rows = Math.max(1, Math.ceil(config.n / cols));
    // the first `additive` share of the crowd is the one drawn with light; when the layers are mixed it is every k-th sprite instead
    const lit = (i: number): boolean => (config.blend === 'mixed' ? (i * config.additive) % 1 < config.additive && config.additive > 0 : i >= config.n * (1 - config.additive));
    for (let i = 0; i < config.n; i++) {
      const set = Math.min(config.sets, used.length) === 0 ? 0 : assignSet(i, config.n, Math.min(config.sets, used.length), config.order);
      const textures = frames[set] ?? [];
      const texture = textures[i % Math.max(1, textures.length)];
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(1.1 / Math.max(1, texture.orig.width));
      sprite.alpha = config.alpha;
      sprite.position.set(-WIDTH / 2 + ((i % cols) + rng.next() * 0.3) * (WIDTH / cols), viewY(-2 + (Math.floor(i / cols) + rng.next() * 0.3) * (HEIGHT / rows)));
      const additive = config.additive > 0 && lit(i);
      if (additive && config.blend === 'mixed') sprite.blendMode = 'add';
      (additive && config.blend === 'layered' ? lightLayer : layers.actors).addChild(sprite);
      crowd.push({ sprite, set, frame: i % Math.max(1, textures.length) });
    }
  };

  // ---------------------------------------------------------------------------------------------------------------- the effects, the real ones
  let effects: Effects | null = null;
  let vfxBudget = 0;
  const effectsRng = new Rng(11);
  const startEffects = async (): Promise<void> => {
    if (effects) return;
    const { createEffects } = await import('../effects');
    effects = createEffects({
      renderer: renderer.app.renderer,
      layers,
      atlas: createVfxAtlas(),
      bus: new EventBus<GameEvents>(),
      tier: renderer.qualityTier,
      playerPosition: () => ({ x: 0, y: 0 }),
      projectileSkills: new Set(),
    });
  };
  if (config.vfx > 0) await startEffects();

  // ---------------------------------------------------------------------------------------------------------------- the loop
  let tick = 0;
  let last = performance.now();
  let recording: { dt: number[]; draws: number[]; want: number; done: (m: Measurement) => void } | null = null;
  const textureCount = (): number => new Set(crowd.map((c) => c.sprite.texture.source)).size;
  const measurement = (rec: NonNullable<typeof recording>): Measurement => {
    const snap = library?.snapshot() ?? null;
    const stats = effects?.system.stats ?? null;
    return {
      config: { ...config },
      frame: summarizeFrames(rec.dt),
      draws: { median: medianOf(rec.draws), max: Math.max(0, ...rec.draws), min: rec.draws.length > 0 ? Math.min(...rec.draws) : 0 },
      textures: textureCount(),
      vfx: stats && effects ? { particles: stats.particles, peakParticles: stats.peakParticles, sprites: stats.sprites, spawned: stats.spawned, dropped: stats.dropped, poolCreated: stats.poolCreated, budget: { ...effects.budgets } } : null,
      art: snap ? { pages: snap.pages, bytes: snap.bytes, peakBytes: snap.peakBytes, sets: snap.sets, requests: snap.requests, failures: snap.failures, loadMs: snap.loadMs } : { pages: 0, bytes: 0, peakBytes: 0, sets: 0, requests: 0, failures: 0, loadMs: 0 },
      heapBytes: heap(),
    };
  };
  const frame = (now: number): void => {
    const dt = Math.min(0.25, (now - last) / 1000);
    const ms = now - last;
    last = now;
    tick++;
    if (config.animate && tick % 4 === 0) {
      for (const c of crowd) {
        const textures = frames[c.set];
        if (textures && textures.length > 1) {
          c.frame = (c.frame + 1) % textures.length;
          c.sprite.texture = textures[c.frame] as Texture;
        }
      }
    }
    if (effects && config.vfx > 0) {
      vfxBudget += config.vfx * dt;
      while (vfxBudget >= 1) {
        vfxBudget -= 1;
        const trigger = BURSTS[effectsRng.int(0, BURSTS.length)] as VfxTrigger;
        effects.director.fire(trigger, { x: effectsRng.range(-10, 10), y: effectsRng.range(0, 8), facing: effectsRng.chance(0.5) ? 1 : -1, dirX: effectsRng.chance(0.5) ? 1 : -1, dirY: 0.2 });
      }
    }
    effects?.system.update(dt);
    counter.beginFrame();
    renderer.render();
    counter.endFrame();
    if (recording) {
      recording.dt.push(ms);
      recording.draws.push(counter.last);
      if (recording.dt.length >= recording.want) {
        const r = recording;
        recording = null;
        r.done(measurement(r));
      }
    }
    requestAnimationFrame(frame);
  };

  const stress = {
    /** Changes the crowd and the load; the scene is rebuilt (the effects start on the first `vfx` above 0). */
    async configure(change: Partial<StressConfig>): Promise<StressConfig> {
      config = { ...config, ...change };
      if (config.vfx > 0) await startEffects();
      effects?.system.clear();
      rebuild();
      return { ...config };
    },
    /** Measures the next `n` frames after a few of warm-up (the first frames of a new crowd upload their textures). */
    measure(n = 90, warmup = 8): Promise<Measurement> {
      return new Promise((resolve) => {
        let skipped = 0;
        const wait = (): void => {
          if (skipped++ < warmup) requestAnimationFrame(wait);
          else recording = { dt: [], draws: [], want: n, done: resolve };
        };
        requestAnimationFrame(wait);
      });
    },
    loaded: () => ({ loadMs, used: used.map((s) => s.def.id), held: held.map((s) => s.def.id), notes: [...notes] }),
  };
  (window as unknown as { __artStress: typeof stress }).__artStress = stress;
  const hooks = {
    ready: () => true,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    teleport: () => undefined,
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, sprites: crowd.length, tick, config, notes: [...notes] }),
  };
  (window as unknown as { __troid: typeof hooks }).__troid = hooks;

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();
  rebuild();
  requestAnimationFrame(frame);
}
