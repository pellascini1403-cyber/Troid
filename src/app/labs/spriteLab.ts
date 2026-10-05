import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { SpriteAssetManager, type LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { PROCEDURAL_ATLASES, SPRITE_SETS } from '@/content';
import { PLAYER_PLACEHOLDER, PLAYER_PLACEHOLDER_SPEC } from '@/content/placeholders/playerPlaceholder';
import { PALETTE } from '@/presentation/palette';
import { buildPlaceholderSet } from '@/presentation/placeholder';
import { createActorViewState } from '@/presentation/actorViewState';
import { clipFrameNames } from '@/presentation/SpriteSetDefinition';
import { validateSpriteSet } from '@/presentation/validateSpriteSet';
import type { AnchorId, AnimPhase, AnimState } from '@/presentation/vocabulary';
import { ActorSprite } from '@/render/ActorSprite';
import { Renderer2D } from '@/render/Renderer2D';

/**
 * Sprite contact sheet (`?lab=sprites`): every clip of a sprite set, frame by frame, with the anchors drawn on top
 * (hand = dot, sword = grip→tip line, head tick) and the standing-height guide, plus a LIVE actor driven through the
 * same `ActorViewState` the simulation writes. It is the successor of the glTF model lab: how to look at a sprite set
 * without playing, and how to check what the validator reports.
 *
 *   ?set=<id>  any sprite set registered in `content/sprites.ts` (default: the player's placeholder)
 *   ?s=24      px per metre of the sheet · ?variant=1  start with the second art resolution (swap check)
 *
 * `window.__sprites` lets the E2E scenario drive it.
 */
const ATTACK_TICKS = { startup: 4, active: 3, recovery: 8 } as const;

const num = (params: URLSearchParams, k: string, d: number): number => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);

export async function startSpriteLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const S = num(params, 's', 24);
  // The same pose table at a DIFFERENT art resolution: proves the pipeline measures sprites in metres, not pixels.
  const variantBuilt = buildPlaceholderSet({ ...PLAYER_PLACEHOLDER_SPEC, id: 'player_placeholder_lowres', artPxPerMeter: 36 });
  const sprites = new SpriteAssetManager<Texture>(
    createPixiSpriteLoader({ procedural: { ...PROCEDURAL_ATLASES, [variantBuilt.def.id]: variantBuilt } }),
    { validate: false },
  );
  const setId = params.get('set') ?? PLAYER_PLACEHOLDER.def.id;
  const setDef = SPRITE_SETS[setId];
  if (!setDef) throw new Error(`unknown sprite set "${setId}" (registered: ${Object.keys(SPRITE_SETS).join(', ')})`);
  const main = await sprites.acquire(setDef);
  const lowres = await sprites.acquire(variantBuilt.def);

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const r = await Renderer2D.create({ host, viewHeight: 13.5 });
  const root = r.layers.screen;
  const bg = new Graphics().rect(0, 0, 4096, 4096).fill(PALETTE.worldNight);
  root.addChild(bg);

  const { def, meta, textures } = main;
  const states = Object.keys(def.clips) as AnimState[];
  const ppm = def.artPxPerMeter;
  const first = textures.get(clipFrameNames(def.clips.idle!)[0]!)!;
  const cellW = (first.orig.width / ppm) * S;
  const cellH = (first.orig.height / ppm) * S;
  const labelW = 74;
  const header = 26;
  const blocks = 2;
  const perBlock = Math.ceil(states.length / blocks);
  const maxFrames = Math.max(...states.map((s) => def.clips[s]!.count));
  const blockW = labelW + maxFrames * cellW + 16;

  const title = new Text({
    text: `${def.id}${def.placeholder ? '  (PLACEHOLDER)' : ''} · ${states.length} clips · ${Object.values(def.clips).reduce((n, c) => n + c!.count, 0)} frames · ${ppm} art px/m · sheet ${S} px/m`,
    style: { fill: PALETTE.worldGlow, fontSize: 13, fontFamily: 'monospace' },
  });
  title.position.set(10, 6);
  root.addChild(title);

  const guides = new Graphics();
  root.addChild(guides);
  states.forEach((state, row) => {
    const block = Math.floor(row / perBlock);
    const y0 = header + (row % perBlock) * cellH;
    const x0 = 10 + block * blockW;
    const label = new Text({ text: state, style: { fill: PALETTE.worldGlow, fontSize: 11, fontFamily: 'monospace' } });
    label.position.set(x0, y0 + cellH * def.pivot[1] - 14);
    root.addChild(label);
    clipFrameNames(def.clips[state]!).forEach((name, i) => {
      const fx = x0 + labelW + i * cellW;
      const sp = new Sprite(textures.get(name));
      sp.scale.set(S / ppm);
      sp.position.set(fx, y0);
      root.addChild(sp);
      const feetX = fx + def.pivot[0] * cellW;
      const feetY = y0 + def.pivot[1] * cellH;
      // cell, floor line, 1.7 m standing-height guide
      guides.rect(fx, y0, cellW, cellH).stroke({ width: 1, color: PALETTE.worldDeep, pixelLine: true });
      guides.moveTo(fx, feetY).lineTo(fx + cellW, feetY).stroke({ width: 1, color: PALETTE.worldSlate, pixelLine: true });
      guides.moveTo(fx, feetY - def.height * S).lineTo(fx + 6, feetY - def.height * S).stroke({ width: 1, color: PALETTE.worldSlate, pixelLine: true });
      const a = meta.frames[name]?.anchors;
      if (a?.weapon_grip && a.weapon_tip) {
        guides.moveTo(feetX + a.weapon_grip[0] * S, feetY - a.weapon_grip[1] * S).lineTo(feetX + a.weapon_tip[0] * S, feetY - a.weapon_tip[1] * S).stroke({ width: 1, color: PALETTE.energyCore, pixelLine: true });
      }
      if (a?.hand_r) guides.circle(feetX + a.hand_r[0] * S, feetY - a.hand_r[1] * S, 2.5).fill(PALETTE.accentWarm);
      if (a?.head) guides.circle(feetX + a.head[0] * S, feetY - a.head[1] * S, 2).fill(PALETTE.energyCore);
      guides.circle(feetX, feetY, 1.5).fill(PALETTE.whiteHot);
    });
  });

  // ---- live actor: the same ActorSprite the game uses ----
  const LIVE_S = S * 2.2;
  const stage = new Container({ label: 'live' });
  const baseY = header + perBlock * cellH + 20 + 2.4 * LIVE_S * def.pivot[1];
  stage.position.set(260, baseY);
  stage.scale.set(LIVE_S);
  root.addChild(stage);
  const actor = new ActorSprite(main);
  stage.addChild(actor.root);
  const view = createActorViewState();
  const liveLabel = new Text({ text: '', style: { fill: PALETTE.whiteHot, fontSize: 13, fontFamily: 'monospace' } });
  liveLabel.position.set(400, baseY - 90);
  root.addChild(liveLabel);

  let current: AnimState = 'idle';
  let attackTick = 0;
  const attackStates = new Set<AnimState>(['attack', 'attack1', 'attack2', 'attackAir', 'attackCrouch']);

  /** The same phase maths the simulation will publish: startup → active → recovery, progress inside each. */
  const phaseAt = (tick: number): { phase: AnimPhase; phaseT: number } => {
    const { startup, active, recovery } = ATTACK_TICKS;
    if (tick < startup) return { phase: 'startup', phaseT: tick / startup };
    if (tick < startup + active) return { phase: 'active', phaseT: (tick - startup) / active };
    return { phase: 'recovery', phaseT: Math.min(1, (tick - startup - active) / recovery) };
  };

  const apply = (dt: number): void => {
    view.anim = current;
    if (attackStates.has(current)) {
      const p = phaseAt(attackTick);
      view.phase = p.phase;
      view.phaseT = p.phaseT;
    } else {
      view.phase = 'none';
      view.phaseT = 0;
    }
    actor.sync(view, 0, dt);
    liveLabel.text = `${current}  →  ${actor.frame}   [${actor.spriteSetId}]`;
  };

  const play = (state: AnimState, phase?: AnimPhase, t = 0): string | null => {
    current = state;
    view.animSerial++;
    if (phase && phase !== 'none') {
      // pin the sim phase explicitly (E2E): phaseAt is bypassed
      view.anim = state;
      view.phase = phase;
      view.phaseT = t;
      actor.sync(view, 0, 0);
      liveLabel.text = `${state}  →  ${actor.frame}  [${actor.spriteSetId}]`;
      attackTick = -1;
    } else {
      attackTick = 0;
      apply(0);
    }
    return actor.frame;
  };

  // auto-cycle so a human looking at the lab sees the animation (E2E turns it off with ?cycle=0)
  const cycle = params.get('cycle') !== '0';
  const order: AnimState[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash', 'attack', 'attack2', 'attackAir', 'attackCrouch', 'hurt', 'death'];
  let clock = 0;
  let tickAcc = 0;
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    if (cycle) {
      const idx = Math.floor(clock / 1.4) % order.length;
      if (order[idx] !== current) play(order[idx]!);
    }
    if (attackStates.has(current) && attackTick >= 0) {
      tickAcc += dt;
      while (tickAcc >= 1 / 60) {
        tickAcc -= 1 / 60;
        attackTick = Math.min(attackTick + 1, ATTACK_TICKS.startup + ATTACK_TICKS.active + ATTACK_TICKS.recovery);
      }
    }
    if (attackTick >= 0) apply(cycle ? dt : 0);
    counter.beginFrame();
    r.render();
    counter.endFrame();
    requestAnimationFrame(loop);
  };

  const issues = validateSpriteSet(def, meta, new Set(textures.keys())).map((i) => `${i.level}: ${i.message}`);
  const sets: Record<string, LoadedSpriteSet<Texture>> = { main, lowres };

  const hooks = {
    ready: true,
    report: issues,
    states,
    frameCount: textures.size,
    play,
    frame: (): string | null => actor.frame,
    anchor: (id: AnchorId): { x: number; y: number } => actor.anchorWorld(id),
    /** Switches the live actor to another art resolution and reports sizes in metres and on screen. */
    swap: (which: 'main' | 'lowres'): { set: string; artPxPerMeter: number; spriteScaleTimesArt: number; boundsW: number; boundsH: number } => {
      const set = sets[which]!;
      actor.setSpriteSet(set);
      view.animSerial++;
      apply(0);
      const b = actor.root.children[0] instanceof Sprite ? actor.root.children[0].getBounds() : { width: 0, height: 0 };
      const body = actor.root.children[0] as Sprite;
      return {
        set: set.def.id,
        artPxPerMeter: set.def.artPxPerMeter,
        spriteScaleTimesArt: body.scale.x * set.def.artPxPerMeter,
        boundsW: b.width,
        boundsH: b.height,
      };
    },
  };
  (window as unknown as { __sprites: typeof hooks }).__sprites = hooks;
  // the E2E harness waits on / pauses the same `__troid` surface as the game
  (window as unknown as { __troid: unknown }).__troid = {
    ready: () => true,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    teleport: () => undefined,
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, tick: 0 }),
  };

  if (params.get('variant') === '1') hooks.swap('lowres');
  r.resize();
  requestAnimationFrame(loop);
}
