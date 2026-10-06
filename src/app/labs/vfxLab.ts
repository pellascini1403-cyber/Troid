import { Graphics, type Texture } from 'pixi.js';
import { SpriteAssetManager } from '@/assets/SpriteAssetManager';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { createVfxAtlas } from '@/assets/vfxAtlas';
import { PLAYER_ATTACKS } from '@/content/attacks';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { PROCEDURAL_ATLASES } from '@/content';
import { SKILLS, SPIRIT_BOLT } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import type { GameEvents } from '@/gameplay/events';
import { createActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET, type VfxTrigger } from '@/presentation/vfx';
import { DummyView } from '@/render/DummyView';
import { ActorSprite } from '@/render/ActorSprite';
import { Renderer2D } from '@/render/Renderer2D';
import { VfxDirector } from '@/vfx/VfxDirector';
import { VfxSystem } from '@/vfx/VfxSystem';

/**
 * VFX lab (`?lab=vfx`): every trigger of the VFX table on a plain stage, driven through the REAL director (the lab emits
 * the same simulation events the game does). Real time by default and auto-cycling; with `?manual=1` time only moves
 * when `window.__vfx.advance(seconds)` says so, which is how the E2E scenario takes frame-exact screenshots.
 *
 *   ?vh=8 visible height in metres (smaller = zoom in) · ?manual=1  · ?cycle=0 (no auto-play) · ?accent=1 (the optional warm accent ON, to compare) · ?tier=low|medium|high
 */
const TRIGGERS: readonly VfxTrigger[] = ['slash', 'slashFinisher', 'hitLanded', 'playerHurt', 'dashStart', 'enemyDied', 'enemyTelegraph', 'playerDied', 'boltCast', 'boltImpact', 'boltEnd', 'drinkStart', 'drinkHeal', 'pickup'];

export async function startVfxLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const manual = params.get('manual') === '1';
  const cycle = params.get('cycle') !== '0' && !manual;
  const accent = params.get('accent') === '1';
  const tier = (['low', 'medium', 'high'] as const).find((t) => t === params.get('tier')) ?? 'medium';

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const vh = Number(params.get('vh')) > 0 ? Number(params.get('vh')) : 8;
  const r = await Renderer2D.create({ host, viewHeight: vh, tier });
  const L = r.layers;

  // stage: a floor line, the player (attack pose), a dummy
  const floor = new Graphics().rect(-20, 0, 40, 6).fill(PALETTE.worldDeep);
  floor.rect(-20, 0, 40, 0.06).fill(PALETTE.worldSlate);
  L.terrain.addChild(floor);

  const sprites = new SpriteAssetManager<Texture>(createPixiSpriteLoader({ procedural: PROCEDURAL_ATLASES }), { validate: false });
  const set = await sprites.acquire(PLAYER_PLACEHOLDER.def);
  const player = new ActorSprite(set, { zIndex: 10 });
  L.actors.addChild(player.root);
  const pv = createActorViewState();
  Object.assign(pv, { x: -1.6, prevX: -1.6, y: 0, prevY: 0, facing: 1, anim: 'attack', phase: 'active', phaseT: 1 });
  player.sync(pv, 1, 0);

  const dv = createActorViewState();
  Object.assign(dv, { x: 0.3, prevX: 0.3, y: 0, prevY: 0, facing: -1 });
  const dummy = new DummyView({ view: dv, body: { halfW: 0.4, height: 1.4 } });
  L.actors.addChild(dummy.root);
  dummy.sync(1);

  const atlas = createVfxAtlas();
  const vfx = new VfxSystem({ add: L.fxWorld, normal: L.fxNormal }, atlas, VFX, {
    particleBudget: PARTICLE_BUDGET[tier],
    spriteBudget: SPRITE_FX_BUDGET[tier],
    accent,
  });
  vfx.prewarm();
  const bus = new EventBus<GameEvents>();
  const body = { x: -1.6, y: 0 };
  const director = new VfxDirector(bus, vfx, VFX_BINDINGS, VFX, () => ({ x: body.x, y: body.y }), new Set(Object.keys(SKILLS)));

  const hitRect = { x0: -1.4, y0: 0.3, x1: 0.2, y1: 1.4 };
  const fire = (trigger: VfxTrigger): void => {
    body.x = -1.6;
    switch (trigger) {
      case 'slash':
      case 'slashFinisher':
        bus.emit('player:attackActive', {
          attackId: trigger === 'slash' ? 'slash_1' : 'slash_2', x: -1.6, y: 0, facing: 1, air: false, combo: trigger === 'slash' ? 0 : 1,
          rect: { ...hitRect, x1: -1.6 + PLAYER_ATTACKS.slash_1!.hitbox.x + PLAYER_ATTACKS.slash_1!.hitbox.w, y0: PLAYER_ATTACKS.slash_1!.hitbox.y, y1: PLAYER_ATTACKS.slash_1!.hitbox.y + PLAYER_ATTACKS.slash_1!.hitbox.h, x0: -1.6 + 0.2 },
        });
        break;
      case 'hitLanded':
        bus.emit('combat:hit', { attackId: 'slash_1', attackerId: 'p', targetId: 'd', targetTeam: 'enemy', damage: 1, x: -0.2, y: 0.9, direction: 1, killed: false, hitStop: 4, shake: 0.06 });
        break;
      case 'playerHurt':
        bus.emit('player:hurt', { x: -1.6, y: 0.9, damage: 1, direction: -1 });
        break;
      case 'dashStart':
        bus.emit('player:dashed', { x: -3, y: 0, facing: 1, air: false });
        body.x = -3;
        break;
      case 'enemyDied':
        bus.emit('actor:died', { id: 'd', team: 'enemy', x: 0.3, y: 0 });
        break;
      case 'enemyTelegraph':
        bus.emit('enemy:telegraph', { id: 'lab_slime', defId: 'ink_slime', x: 0.3, y: 0, facing: -1, ticks: 24 });
        break;
      case 'playerDied':
        bus.emit('player:died', { x: -1.6, y: 0 });
        break;
      case 'boltCast':
        bus.emit('skill:cast', { skillId: SPIRIT_BOLT.id, x: -1.6 + SPIRIT_BOLT.projectile.muzzle.x, y: SPIRIT_BOLT.projectile.muzzle.y, facing: 1, cost: SPIRIT_BOLT.cost });
        break;
      case 'boltImpact':
        bus.emit('combat:hit', { attackId: SPIRIT_BOLT.id, attackerId: 'p', targetId: 'd', targetTeam: 'enemy', damage: SPIRIT_BOLT.projectile.damage, x: -0.2, y: 0.9, direction: 1, killed: false, hitStop: SPIRIT_BOLT.projectile.hitStop, shake: SPIRIT_BOLT.projectile.shake });
        break;
      case 'boltEnd':
        bus.emit('projectile:ended', { id: 'lab_bolt', skillId: SPIRIT_BOLT.id, x: 0.3, y: 1, facing: 1, reason: 'range' });
        break;
      case 'drinkStart':
        bus.emit('bottle:drinkStarted', { slot: 0, x: -1.6, y: 0, ticks: 24 });
        break;
      case 'drinkHeal':
        bus.emit('bottle:drunk', { slot: 0, healed: 2, x: -1.6, y: 0 });
        break;
      case 'pickup':
        bus.emit('interaction:performed', { id: 'lab_pickup', kind: 'pickup', verbKey: 'interact.pickUp', x: -1.6, y: 1.2 });
        break;
      default:
        break;
    }
  };

  /** The dash trail needs the player to MOVE: walk the position along the dash path in `seconds` of lab time. */
  let dashLeft = 0;
  const advance = (seconds: number): void => {
    if (dashLeft > 0) {
      const d = Math.min(dashLeft, seconds);
      body.x += 21 * d;
      dashLeft -= d;
      director.update();
      if (dashLeft <= 0) bus.emit('player:dashEnded', { x: body.x, y: 0 });
    }
    vfx.update(seconds);
  };

  const play = (trigger: VfxTrigger): void => {
    vfx.clear();
    fire(trigger);
    if (trigger === 'dashStart') dashLeft = 0.17;
  };

  let current = 0;
  let clock = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!manual) {
      clock += dt;
      if (cycle && clock > 1.3) {
        clock = 0;
        play(TRIGGERS[current++ % TRIGGERS.length]!);
      }
      advance(dt);
    }
    r.applyCamera({ x: -0.8, y: 0.9 + vh * 0.12 }, { x: 0, y: 0, rollRad: 0 }, vh);
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
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, tick: 0, vfx: vfx.stats }),
  };
  (window as unknown as { __troid: typeof hooks }).__troid = hooks;
  (window as unknown as { __vfx: unknown }).__vfx = {
    triggers: TRIGGERS,
    /** Clears the stage and plays one trigger. */
    play,
    /** Plays a trigger on top of whatever is alive (budget stress). */
    fire,
    advance,
    clear: () => vfx.clear(),
    stats: () => vfx.stats,
    render: () => r.render(),
  };
  r.resize();
  r.applyCamera({ x: -0.8, y: 0.9 + vh * 0.12 }, { x: 0, y: 0, rollRad: 0 }, vh);
  requestAnimationFrame(frame);
}
