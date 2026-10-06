import { Graphics } from 'pixi.js';
import { createVfxAtlas } from '@/assets/vfxAtlas';
import { PROCEDURAL_LOOKS } from '@/content';
import { INK_SLIME, SLIME_LUNGE } from '@/content/enemies';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import type { GameEvents } from '@/gameplay/events';
import { createActorViewState, type ActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET } from '@/presentation/vfx';
import type { AnimPhase, AnimState } from '@/presentation/vocabulary';
import { ProceduralActor } from '@/render/ProceduralActor';
import { Renderer2D } from '@/render/Renderer2D';
import { VfxDirector } from '@/vfx/VfxDirector';
import { VfxSystem } from '@/vfx/VfxSystem';

/**
 * Ink Slime lab (`?lab=slime`): the procedural actor and its warning, outside the game.
 *
 *  - default: a SHEET of poses (every animation at the start, middle and end of its state), left to right, top to bottom:
 *      idle · walk · run · alert(0.5)  /  telegraph 0 · 0.5 · 0.96 · lunge 0.1 · lunge 0.9
 *      /  recovery 0 · recovery 1 · hurt (flash) · death 0.5 · death 0.95
 *  - `?mode=live`: ONE big slime that plays the real wind-up → lunge → recovery with the real VFX director, in manual
 *    time (`window.__slime.advance(seconds)`), so the E2E takes frame-exact screenshots.
 *
 *   ?vh=7 visible height (m) · ?cols=5 poses per row
 */
interface PoseSpec {
  anim: AnimState;
  phase?: AnimPhase;
  t?: number;
  flash?: number;
}

const SHEET: readonly PoseSpec[] = [
  { anim: 'idle' }, { anim: 'walk' }, { anim: 'run' }, { anim: 'alert', t: 0.5 }, { anim: 'telegraph', phase: 'startup', t: 0 },
  { anim: 'telegraph', phase: 'startup', t: 0.5 }, { anim: 'telegraph', phase: 'startup', t: 0.96 }, { anim: 'attack', phase: 'active', t: 0.1 },
  { anim: 'attack', phase: 'active', t: 0.9 }, { anim: 'idle', phase: 'recovery', t: 0 },
  { anim: 'idle', phase: 'recovery', t: 1 }, { anim: 'hurt', t: 0, flash: 1 }, { anim: 'death', t: 0.5 }, { anim: 'death', t: 0.95 },
];

export async function startSlimeLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const live = params.get('mode') === 'live';
  const cols = Math.max(1, Number(params.get('cols')) || 5);
  const rows = Math.ceil(SHEET.length / cols);
  const spacingX = 2.1;
  const spacingY = 2.3;
  const vh = Number(params.get('vh')) > 0 ? Number(params.get('vh')) : live ? 3.6 : rows * spacingY + 0.6;

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const r = await Renderer2D.create({ host, viewHeight: vh, tier: 'high' });
  const L = r.layers;
  const atlas = createVfxAtlas();
  const glow = atlas.frames.glow;
  const viewDef = INK_SLIME.view;
  const look = 'proceduralId' in viewDef ? PROCEDURAL_LOOKS[viewDef.proceduralId] : undefined;
  if (!look) throw new Error(`the Ink Slime has no procedural look (${JSON.stringify(viewDef)})`);

  const floor = new Graphics();
  const addFloor = (x0: number, x1: number, y: number): void => {
    floor.rect(x0, -y, x1 - x0, 6).fill(PALETTE.worldDeep);
    floor.rect(x0, -y, x1 - x0, 0.06).fill(PALETTE.worldSlate);
  };
  L.terrain.addChild(floor);

  const actors: ProceduralActor[] = [];
  const makeView = (x: number, y: number, spec: PoseSpec): ActorViewState => {
    const v = createActorViewState();
    Object.assign(v, { x, prevX: x, y, prevY: y, facing: 1, anim: spec.anim, phase: spec.phase ?? 'none', phaseT: spec.t ?? 0, flash: spec.flash ?? 0 });
    if (spec.anim === 'death') v.opacity = 1 - (spec.t ?? 0) ** 2;
    return v;
  };

  let camera = { x: 0, y: 0 };
  const bus = new EventBus<GameEvents>();
  let vfx: VfxSystem | null = null;
  let liveView: ActorViewState | null = null;
  let liveActor: ProceduralActor | null = null;
  let clock = 0;
  let director: VfxDirector | null = null;

  if (!live) {
    const left = -((cols - 1) * spacingX) / 2;
    SHEET.forEach((spec, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * spacingX;
      const y = (rows - 1 - row) * spacingY;
      if (col === 0) addFloor(left - 1.2, left + (cols - 1) * spacingX + 1.2, y);
      const view = makeView(x, y, spec);
      const actor = new ProceduralActor(look, { view }, { glow });
      L.actors.addChild(actor.root);
      actor.sync(1, 0);
      actors.push(actor);
    });
    camera = { x: 0, y: ((rows - 1) * spacingY) / 2 + vh * 0.12 };
  } else {
    addFloor(-12, 12, 0);
    liveView = makeView(0, 0, { anim: 'idle' });
    liveActor = new ProceduralActor(look, { view: liveView }, { glow });
    L.actors.addChild(liveActor.root);
    vfx = new VfxSystem({ add: L.fxWorld, normal: L.fxNormal }, atlas, VFX, {
      particleBudget: PARTICLE_BUDGET.high,
      spriteBudget: SPRITE_FX_BUDGET.high,
    });
    vfx.prewarm();
    director = new VfxDirector(bus, vfx, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }));
    camera = { x: 0, y: 0.9 + vh * 0.12 };
  }

  // ---- live: wind-up (24 ticks) → lunge (10) → recovery (36) → idle, on the manual clock ----
  const TICK = 1 / 60;
  const windup = SLIME_LUNGE.startup * TICK;
  const lunge = SLIME_LUNGE.active * TICK;
  const recovery = SLIME_LUNGE.recovery * TICK;
  const animate = (): void => {
    if (!liveView) return;
    const t = clock;
    if (t < 0) {
      Object.assign(liveView, { anim: 'idle', phase: 'none', phaseT: 0 });
    } else if (t < windup) {
      Object.assign(liveView, { anim: 'telegraph', phase: 'startup', phaseT: t / windup });
    } else if (t < windup + lunge) {
      const k = (t - windup) / lunge;
      Object.assign(liveView, { anim: 'attack', phase: 'active', phaseT: k, x: 1.5 * k, prevX: 1.5 * k });
    } else if (t < windup + lunge + recovery) {
      Object.assign(liveView, { anim: 'idle', phase: 'recovery', phaseT: (t - windup - lunge) / recovery, x: 1.5, prevX: 1.5 });
    } else {
      Object.assign(liveView, { anim: 'idle', phase: 'none', phaseT: 0 });
    }
  };
  let time = 0;
  const advance = (seconds: number): void => {
    time += seconds;
    clock += seconds;
    animate();
    liveActor?.sync(1, seconds);
    vfx?.update(seconds);
  };
  const start = (): void => {
    if (!liveView) return;
    clock = 0;
    Object.assign(liveView, { x: 0, prevX: 0, facing: 1 });
    vfx?.clear();
    animate();
    bus.emit('enemy:telegraph', { id: 'lab', defId: INK_SLIME.id, x: 0, y: 0, facing: 1, ticks: SLIME_LUNGE.startup });
  };

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (live && params.get('manual') !== '1') {
      // free-running demo: replay the warning every 2.2 s
      if (clock === 0 || clock > windup + lunge + recovery + 0.6) start();
      advance(dt);
    }
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
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, tick: 0, vfx: vfx?.stats }),
  };
  (window as unknown as { __troid: typeof hooks }).__troid = hooks;
  (window as unknown as { __slime: unknown }).__slime = {
    poses: SHEET.length,
    /** Live mode: restarts the wind-up (and raises the real `enemy:telegraph` event). */
    start,
    /** Live mode: moves the lab clock forward `seconds` (the actor and the VFX follow). */
    advance,
    dispose: () => director?.dispose(),
    render: () => r.render(),
    time: () => time,
    stats: () => vfx?.stats ?? null,
  };
  r.resize();
  r.applyCamera(camera, { x: 0, y: 0, rollRad: 0 }, vh);
  requestAnimationFrame(frame);
}
