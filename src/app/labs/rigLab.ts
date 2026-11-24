import { Graphics } from 'pixi.js';
import { createVfxAtlas } from '@/assets/vfxAtlas';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import type { AnimPhase, AnimState } from '@/presentation/vocabulary';
import { Renderer2D } from '@/render/Renderer2D';
import { createRigAssets, RIGS, RigActor, type RigDef } from '@/rigs';

/**
 * Rig lab (`?lab=rigs`): the creatures' rigs, looked at without playing (docs/PROMPT24-LOG.md). Every species is drawn by the game's own renderer on a flat floor, one pose per cell — every animation at the start, the middle and the end of its
 * state — so what is judged is what the game shows.
 *
 *   ?id=cave_bat            one species (several with commas, `all` for every rig)
 *   ?pick=0,6,8,11          only these poses of the sheet (by index)
 *   ?cols=6                 poses per row · ?vh=3.4 visible height in metres · ?pose=attack:0.5 a single pose, big
 *   ?crowd=12               a crowd of the species at the middle of its idle, to count draw calls
 *
 * `window.__rigs` lets a test move the lab clock and read the draw calls.
 */
interface PoseSpec {
  label: string;
  anim: AnimState;
  phase?: AnimPhase;
  t?: number;
  flash?: number;
  /** Metres per tick the creature is moving along its facing (so its speed reads as walking, running, falling). */
  vx?: number;
  vy?: number;
  /** Frames to let the creature settle into the pose (its springs and smoothed feelings need time). */
  settle?: number;
  facing?: 1 | -1;
}

const SHEET: readonly PoseSpec[] = [
  { label: 'idle', anim: 'idle', settle: 90 },
  { label: 'walk', anim: 'walk', vx: 0.025, settle: 90 },
  { label: 'run', anim: 'run', vx: 0.07, settle: 90 },
  { label: 'alert', anim: 'alert', t: 0.5, settle: 30 },
  { label: 'telegraph 0.1', anim: 'telegraph', phase: 'startup', t: 0.1, settle: 20 },
  { label: 'telegraph 0.5', anim: 'telegraph', phase: 'startup', t: 0.5, settle: 36 },
  { label: 'telegraph 0.95', anim: 'telegraph', phase: 'startup', t: 0.95, settle: 50 },
  { label: 'attack 0.2', anim: 'attack', phase: 'active', t: 0.2, vx: 0.09, settle: 14 },
  { label: 'attack 0.5', anim: 'attack', phase: 'active', t: 0.5, vx: 0.12, settle: 20 },
  { label: 'attack 0.85', anim: 'attack', phase: 'active', t: 0.85, vx: 0.05, settle: 26 },
  { label: 'recovery 0', anim: 'idle', phase: 'recovery', t: 0, settle: 20 },
  { label: 'recovery 1', anim: 'idle', phase: 'recovery', t: 1, settle: 50 },
  { label: 'hurt', anim: 'hurt', t: 0.1, flash: 1, settle: 6 },
  { label: 'death 0.3', anim: 'death', t: 0.3, settle: 20 },
  { label: 'death 0.65', anim: 'death', t: 0.65, settle: 40 },
  { label: 'death 0.92', anim: 'death', t: 0.92, settle: 55 },
  { label: 'idle mirrored', anim: 'idle', settle: 90, facing: -1 },
  { label: 'run mirrored', anim: 'run', vx: 0.07, settle: 90, facing: -1 },
  { label: 'crouch', anim: 'crouch', t: 0.5, settle: 60 },
  { label: 'land 0.3', anim: 'land', phase: 'active', t: 0.3, settle: 40 },
  { label: 'land 0.8', anim: 'land', phase: 'active', t: 0.8, settle: 60 },
  { label: 'run fast', anim: 'run', vx: 0.12, settle: 90 },
];

export async function startRigLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const idParam = params.get('id') ?? 'all';
  const ids = idParam === 'all' ? Object.keys(RIGS) : idParam.split(',').filter((id) => RIGS[id]);
  if (ids.length === 0) throw new Error(`no rig for "${idParam}" (known: ${Object.keys(RIGS).join(', ')})`);
  const single = params.get('pose');
  const pick = params.get('pick');
  const poses = pick
    ? pick.split(',').map((i) => SHEET[Number(i)]).filter((p): p is PoseSpec => p !== undefined)
    : single
    ? [(() => {
        const [anim, t] = single.split(':');
        return { label: single, anim: (anim ?? 'idle') as AnimState, phase: ((anim === 'attack' ? 'active' : anim === 'telegraph' ? 'startup' : 'none') as AnimPhase), t: Number(t ?? 0), settle: 60 } satisfies PoseSpec;
      })()]
    : SHEET;
  const cols = Math.max(1, Number(params.get('cols')) || (single ? 1 : 6));
  const crowd = Math.max(0, Number(params.get('crowd')) || 0);

  // each species gets a block of rows; every cell is as wide as its creature needs
  const defs = ids.map((id) => RIGS[id]!);
  const cellW = Math.max(...defs.map((d) => Math.max(1.5, d.width * 1.45)));
  const cellH = Math.max(...defs.map((d) => Math.max(1.4, d.height * 1.3)));
  const rowsPer = Math.ceil(poses.length / cols);
  const totalRows = defs.length * rowsPer;
  const vh = Number(params.get('vh')) > 0 ? Number(params.get('vh')) : totalRows * cellH + 0.5;

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const r = await Renderer2D.create({ host, viewHeight: vh, tier: 'high' });
  const L = r.layers;
  const atlas = createVfxAtlas();
  const assets = createRigAssets(atlas.frames.glow);

  const floor = new Graphics();
  L.terrain.addChild(floor);
  const actors: Array<{ actor: RigActor; view: ActorViewState; spec: PoseSpec; def: RigDef }> = [];
  const totalW = cols * cellW;
  const x0 = -totalW / 2 + cellW / 2;
  const top = (totalRows * cellH) / 2;
  const cellY = (row: number): number => top - (row + 1) * cellH + 0.15; // feet of the row, metres up from the middle

  const place = (def: RigDef, spec: PoseSpec, x: number, y: number, seed: number): void => {
    const view = createActorViewState();
    const vx = (spec.vx ?? 0) * (spec.facing ?? 1);
    Object.assign(view, { x, prevX: x - vx, y, prevY: y - (spec.vy ?? 0), facing: spec.facing ?? 1, anim: spec.anim, phase: spec.phase ?? 'none', phaseT: spec.t ?? 0, flash: spec.flash ?? 0, animSerial: 1 });
    if (spec.anim === 'death') view.opacity = 1 - (spec.t ?? 0) ** 2;
    const actor = new RigActor(def, { view }, assets, seed);
    L.actors.addChild(actor.root);
    for (let i = 0; i < (spec.settle ?? 30); i++) actor.sync(1, 1 / 60);
    actors.push({ actor, view, spec, def });
  };

  if (crowd > 0) {
    const def = defs[0]!;
    for (let i = 0; i < crowd; i++) place(def, SHEET[0]!, -((crowd - 1) * cellW) / 2 + i * cellW, 0, (i * 0.137) % 1);
    floor.rect(-crowd * cellW, 0, crowd * cellW * 2, 4).fill(PALETTE.worldDeep);
  } else {
    defs.forEach((def, d) => {
      poses.forEach((spec, i) => {
        const row = d * rowsPer + Math.floor(i / cols);
        const col = i % cols;
        const y = cellY(row);
        if (col === 0) floor.rect(x0 - cellW, -y, totalW + cellW, 8).fill(PALETTE.worldDeep).rect(x0 - cellW, -y, totalW + cellW, 0.05).fill(PALETTE.worldSlate);
        place(def, spec, x0 + col * cellW, y, 0.31);
      });
    });
  }

  const camera = { x: 0, y: 0 };
  let last = performance.now();
  let live = params.get('manual') !== '1';
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (live) for (const a of actors) a.actor.sync(1, dt);
    r.applyCamera(camera, { x: 0, y: 0, rollRad: 0 }, vh);
    counter.beginFrame();
    r.render();
    counter.endFrame();
    requestAnimationFrame(frame);
  };
  const hooks = {
    ready: () => true,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    teleport: () => undefined,
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, tick: 0 }),
  };
  (window as unknown as { __troid: typeof hooks }).__troid = hooks;
  (window as unknown as { __rigs: unknown }).__rigs = {
    ids,
    poses: poses.map((p) => p.label),
    /** Stops the free-running clock: the lab only moves when told to. */
    freeze: () => {
      live = false;
    },
    advance: (seconds: number, step = 1 / 60) => {
      for (let t = 0; t < seconds; t += step) for (const a of actors) a.actor.sync(1, step);
    },
    render: () => r.render(),
    draws: () => ({ median: counter.median, max: counter.max }),
    /** The root of every creature drawn, for a tool that wants to look inside (what breaks a batch, what a part costs). */
    roots: () => actors.map((a) => a.actor.root),
    frame: () => {
      counter.beginFrame();
      r.render();
      counter.endFrame();
      return counter.last;
    },
  };
  r.resize();
  r.applyCamera(camera, { x: 0, y: 0, rollRad: 0 }, vh);
  requestAnimationFrame(frame);
}
