import type { Texture } from 'pixi.js';
import { SpriteAssetManager, type LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { CAMERA_2D } from '@/camera/camera2d';
import type { CameraTarget } from '@/camera/CameraRig';
import { ABILITIES, PLAYER, PROCEDURAL_ATLASES, ROOMS, SPRITE_SETS } from '@/content';
import { DisposableStore } from '@/core/lifecycle';
import { ColliderOverlay2D } from '@/debug/ColliderOverlay2D';
import { DebugActions } from '@/debug/DebugActions';
import { DebugPanel } from '@/debug/DebugPanel';
import { DebugState } from '@/debug/DebugState';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { FpsMeter } from '@/debug/FpsMeter';
import { GameSession } from '@/gameplay/GameSession';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import type { AnchorId } from '@/presentation/vocabulary';
import { ActorSprite } from '@/render/ActorSprite';
import { CameraAdapter2D } from '@/render/CameraAdapter2D';
import { Renderer2D } from '@/render/Renderer2D';
import { RoomView2D } from '@/render/RoomView2D';
import { listen } from './dom';
import { GameLoop } from './GameLoop';
import { optionsFromQuery, type GameOptions } from './options';

/** Room started when `?room=` is absent. */
const DEFAULT_ROOM = 'movement_test';

/**
 * Composition root of the 2D game (`?view=2d`): wires the deterministic simulation to PixiJS. Nothing here decides
 * gameplay. It owns every listener and GPU resource through `lifecycle`, so `dispose()` (hot reload, tests) leaves
 * nothing behind. The simulation runs on its own fixed-step loop, independent of the renderer.
 */
export class Game2D {
  readonly session: GameSession;
  readonly input = new InputManager();
  readonly debug = new DebugState();
  readonly debugActions = new DebugActions();

  private readonly lifecycle = new DisposableStore();
  private readonly fps = new FpsMeter();
  private readonly loop: GameLoop;
  private readonly camera: CameraAdapter2D;
  private readonly roomView: RoomView2D;
  private readonly bindings = structuredClone(DEFAULT_BINDINGS);
  private readonly playerSprite: ActorSprite;
  private colliders: ColliderOverlay2D | null = null;
  private panel: DebugPanel | null = null;

  /** Pixi's `Application.init` is asynchronous, hence the factory. */
  static async create(host: HTMLElement, query = new URLSearchParams(location.search)): Promise<Game2D> {
    const options = optionsFromQuery(query);
    const counter = new DrawCallCounter();
    if (options.hooks || import.meta.env.DEV) DrawCallCounter.install(counter);
    const renderer = await Renderer2D.create({ host, viewHeight: options.camera.viewHeight ?? CAMERA_2D.viewHeight ?? 13.5 });
    // Sprites load asynchronously (a placeholder atlas is drawn, final art would be fetched), so the game is built only
    // once the player's set is ready: `__troid.ready()` is true as soon as `create` resolves.
    const sprites = new SpriteAssetManager<Texture>(createPixiSpriteLoader({ procedural: PROCEDURAL_ATLASES }));
    const playerDef = SPRITE_SETS[PLAYER.spriteSetId];
    if (!playerDef) throw new Error(`player sprite set "${PLAYER.spriteSetId}" is not in the content registry`);
    const playerSet = await sprites.acquire(playerDef);
    return new Game2D(renderer, counter, options, sprites, playerSet);
  }

  private constructor(
    private readonly renderer: Renderer2D,
    private readonly counter: DrawCallCounter,
    private readonly options: GameOptions,
    sprites: SpriteAssetManager<Texture>,
    playerSet: LoadedSpriteSet<Texture>,
  ) {
    this.session = new GameSession({
      rooms: ROOMS,
      player: PLAYER,
      abilities: ABILITIES,
      startRoom: options.room && ROOMS[options.room] ? options.room : DEFAULT_ROOM,
      unlocked: options.unlock,
    });
    this.lifecycle.add(() => this.session.dispose());
    this.lifecycle.add(() => sprites.dispose());
    this.lifecycle.add(() => renderer.destroy());

    // ---- camera ----
    const { bounds: _bounds, ...roomCamera } = this.session.room.camera ?? {};
    this.camera = new CameraAdapter2D(renderer, { ...roomCamera, ...options.camera });

    // ---- input ----
    attachKeyboardMouse(this.lifecycle, this.input, () => this.bindings);

    // ---- views ----
    this.roomView = new RoomView2D(renderer.layers);
    this.lifecycle.add(() => this.roomView.destroy());
    this.playerSprite = new ActorSprite(playerSet, { zIndex: 10 });
    renderer.layers.actors.addChild(this.playerSprite.root);
    this.lifecycle.add(() => this.playerSprite.dispose());
    this.buildRoomView();
    this.registerDebugActions();
    this.setupDebug();

    this.loop = new GameLoop({
      tick: () => this.tick(),
      frame: (alpha, dt) => this.render(alpha, dt),
    });
    this.lifecycle.add(() => this.loop.stop());

    listen(this.lifecycle, window, 'resize', () => this.renderer.resize());
    // Mobile: never simulate (or burn battery) while hidden, never replay the time away, never leave a key stuck.
    listen(this.lifecycle, document, 'visibilitychange', () => {
      if (document.hidden) {
        this.loop.stop();
        this.input.releaseAll();
      } else {
        this.loop.start();
      }
    });
    this.renderer.resize();
    if (options.hooks || import.meta.env.DEV) this.exposeTestHooks();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.lifecycle.dispose();
  }

  // ------------------------------------------------------------------------------------------------ simulation

  private tick(): void {
    this.session.tick(this.input.sample());
  }

  /** Runs exactly one tick with the current input (debug "step" and E2E tests). */
  stepOnce(): void {
    this.tick();
  }

  // ---------------------------------------------------------------------------------------------------- views

  private buildRoomView(): void {
    const room = this.session.room;
    this.roomView.build(room);
    this.colliders?.setRoom(this.session.collision);
    this.camera.setRoom(room);
  }

  private render(alpha: number, realDt: number): void {
    this.fps.push(realDt);
    const p = this.session.player;
    // While paused (debug / E2E) show the exact simulated state, not an interpolation of stale ticks.
    const a = this.debug.get('paused') ? 1 : alpha;
    const v = p.view;
    const x = v.prevX + (v.x - v.prevX) * a;
    const y = v.prevY + (v.y - v.prevY) * a;
    // Animation time follows the simulation clock: frozen while paused, slowed by timeScale (stable E2E and screenshots).
    const animDt = this.debug.get('paused') ? 0 : realDt * this.debug.get('timeScale');
    this.playerSprite.sync(v, a, animDt);

    // The camera follows the INTERPOLATED position — exactly what is drawn — so camera and player never jitter apart.
    const target: CameraTarget = { x, y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
    this.camera.update(realDt, target);

    if (this.debug.get('colliders') && this.colliders) this.colliders.updateBodies([p.body]);
    this.loop.timeScale = this.debug.get('timeScale');
    this.loop.paused = this.debug.get('paused');
    this.session.godMode = this.debug.get('godMode');
    this.panel?.update(performance.now());

    this.counter.beginFrame();
    this.renderer.render();
    this.counter.endFrame();
  }

  // ------------------------------------------------------------------------------------------------------ debug

  private setupDebug(): void {
    if (!this.options.debug && !import.meta.env.DEV) return;
    listen(this.lifecycle, window, 'keydown', (e) => {
      if (e.code !== 'Backquote') return;
      e.preventDefault();
      this.ensurePanel();
      this.debug.toggle('panel');
    });
    this.lifecycle.add(
      this.debug.changed.on('change', ({ key, value }) => {
        if (key === 'colliders') this.setColliderOverlay(Boolean(value));
      }),
    );
    if (this.options.debug) {
      this.ensurePanel();
      this.debug.set('panel', true);
    }
  }

  private ensurePanel(): void {
    if (this.panel) return;
    const ui = document.getElementById('ui') ?? document.body;
    const p = this.session.player;
    this.panel = new DebugPanel(ui, {
      state: this.debug,
      actions: this.debugActions,
      fps: this.fps,
      step: () => this.stepOnce(),
      readout: () => {
        const b = p.body;
        const c = p.controller;
        const vp = this.renderer.viewport;
        return [
          `room   ${this.session.room.id}   tick ${this.session.now}`,
          `pos    ${b.x.toFixed(2)}, ${b.y.toFixed(2)}`,
          `vel    ${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}`,
          `state  ${c.state}  anim ${p.view.anim}`,
          `ground ${b.grounded ? 'yes' : 'no'}  dash cd ${c.dashCooldown01.toFixed(2)}`,
          `abil   ${this.session.abilities.serialize().join(',') || '—'}`,
          `input  ${this.input.device}`,
          `view   ${vp.contentWidth.toFixed(0)}×${vp.contentHeight.toFixed(0)}  ×${vp.resolution.toFixed(2)}  ${vp.ppm.toFixed(1)} px/m  draws ${this.counter.median}`,
        ].join('\n');
      },
      tuning: [{ title: 'movement', target: p.def.movement }],
    });
    this.lifecycle.add(() => this.panel?.dispose());
  }

  private setColliderOverlay(on: boolean): void {
    if (on && !this.colliders) {
      this.colliders = new ColliderOverlay2D(this.renderer.layers.debug);
      this.colliders.setRoom(this.session.collision);
    } else if (!on && this.colliders) {
      this.colliders.destroy();
      this.colliders = null;
    }
  }

  private registerDebugActions(): void {
    const a = this.debugActions;
    const s = this.session;
    this.lifecycle.add(
      a.register('abilities', 'unlock all', () => s.abilities.list().filter((d) => d.implemented).forEach((d) => s.abilities.unlock(d.id))),
    );
    this.lifecycle.add(a.register('abilities', 'lock all', () => s.abilities.list().forEach((d) => s.abilities.lock(d.id))));
    this.lifecycle.add(a.register('player', 'rescue', () => s.rescuePlayer()));
    this.lifecycle.add(
      a.register('room', 'reset room', () => {
        s.loadRoom(s.room.id);
        this.buildRoomView();
      }),
    );
  }

  /** `window.__troid`: lets Playwright drive and inspect the game deterministically (dev builds / `?hooks=1`). */
  private exposeTestHooks(): void {
    const hooks = {
      game: this,
      session: this.session,
      input: this.input,
      /** The 2D view is ready as soon as `Game2D.create` resolved (the sprite sets are loaded before it is built). */
      ready: () => true,
      /** Freezes real-time simulation so tests can advance it tick by tick. */
      pause: () => this.debug.set('paused', true),
      resume: () => this.debug.set('paused', false),
      step: (n = 1) => {
        for (let i = 0; i < n; i++) this.stepOnce();
        // tests read the presented state right after stepping: bring the sprite up to date without waiting for a frame
        this.playerSprite.sync(this.session.player.view, 1, 0);
      },
      teleport: (x: number, y: number) => {
        this.session.player.respawn(x, y, this.session.player.facing);
        this.session.collision.probeGround(this.session.player.body);
        this.camera.snap();
        this.playerSprite.sync(this.session.player.view, 1, 0);
      },
      state: () => {
        const b = this.session.player.body;
        const vp = this.renderer.viewport;
        const ps = this.playerSprite;
        const anchor = (id: AnchorId): { x: number; y: number } => ps.anchorWorld(id);
        return {
          x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded,
          anim: this.session.player.view.anim, state: this.session.player.controller.state,
          crouched: this.session.player.controller.crouched, bodyHeight: b.height,
          sprite: {
            set: ps.spriteSetId, frame: ps.frame, facing: ps.root.scale.x, visible: ps.root.visible,
            hand: anchor('hand_r'), grip: anchor('weapon_grip'), tip: anchor('weapon_tip'),
          },
          tick: this.session.now, fps: this.fps.fps,
          // `calls` keeps the field the 3D scenes used; `draws` is the same number under its real name
          calls: this.counter.median, triangles: 0,
          draws: this.counter.median, drawsMax: this.counter.max,
          camera: { x: this.camera.centre.x, y: this.camera.centre.y, viewHeight: this.camera.rig.pose.viewHeight },
          view: { contentWidth: vp.contentWidth, contentHeight: vp.contentHeight, ppm: vp.ppm, resolution: vp.resolution, visibleWidth: vp.visibleWidth, barX: vp.barX, barY: vp.barY, rotateDevice: vp.rotateDevice },
          canvas: { cssWidth: this.renderer.app.canvas.clientWidth, cssHeight: this.renderer.app.canvas.clientHeight, width: this.renderer.app.canvas.width, height: this.renderer.app.canvas.height },
        };
      },
    };
    (window as unknown as { __troid: typeof hooks }).__troid = hooks;
    this.lifecycle.add(() => {
      delete (window as unknown as { __troid?: unknown }).__troid;
    });
  }
}
