import { Sprite } from 'pixi.js';
import { canvasTexture } from '@/assets/proceduralTextures';
import { CAMERA_2D } from '@/camera/camera2d';
import { CameraRig, type CameraTarget } from '@/camera/CameraRig';
import { ABILITIES, PLAYER, ROOMS } from '@/content';
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
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
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
  private readonly cameraRig: CameraRig;
  private readonly roomView: RoomView2D;
  private readonly bindings = structuredClone(DEFAULT_BINDINGS);
  /** S1 placeholder: replaced by the sprite pipeline in S3. */
  private readonly playerSprite: Sprite;
  private colliders: ColliderOverlay2D | null = null;
  private panel: DebugPanel | null = null;
  private snapCamera = true;

  /** Pixi's `Application.init` is asynchronous, hence the factory. */
  static async create(host: HTMLElement, query = new URLSearchParams(location.search)): Promise<Game2D> {
    const options = optionsFromQuery(query);
    const counter = new DrawCallCounter();
    if (options.hooks || import.meta.env.DEV) DrawCallCounter.install(counter);
    const renderer = await Renderer2D.create({ host, viewHeight: options.camera.viewHeight ?? CAMERA_2D.viewHeight ?? 13.5 });
    return new Game2D(renderer, counter, options);
  }

  private constructor(
    private readonly renderer: Renderer2D,
    private readonly counter: DrawCallCounter,
    private readonly options: GameOptions,
  ) {
    this.session = new GameSession({
      rooms: ROOMS,
      player: PLAYER,
      abilities: ABILITIES,
      startRoom: options.room && ROOMS[options.room] ? options.room : DEFAULT_ROOM,
      unlocked: options.unlock,
    });
    this.lifecycle.add(() => this.session.dispose());
    this.lifecycle.add(() => renderer.destroy());

    // ---- camera ----
    const { bounds: _bounds, ...roomCamera } = this.session.room.camera ?? {};
    this.cameraRig = new CameraRig({ ...CAMERA_2D, ...roomCamera, ...options.camera });

    // ---- input ----
    attachKeyboardMouse(this.lifecycle, this.input, () => this.bindings);

    // ---- views ----
    this.roomView = new RoomView2D(renderer.layers);
    this.lifecycle.add(() => this.roomView.destroy());
    this.playerSprite = this.createPlayerPlaceholder();
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

  private createPlayerPlaceholder(): Sprite {
    const h = PLAYER.body.height;
    const texture = canvasTexture(56, 136, (ctx, tw, th) => {
      ctx.fillStyle = `#${PALETTE.worldMist.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.roundRect(1, 1, tw - 2, th - 2, 12);
      ctx.fill();
      // facing notch (the art faces right; the sprite is flipped for facing = −1)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tw - 18, 22, 14, 8);
    });
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(h / texture.height);
    this.renderer.layers.actors.addChild(sprite);
    return sprite;
  }

  private buildRoomView(): void {
    const room = this.session.room;
    this.roomView.build(room);
    this.colliders?.setRoom(this.session.collision);
    this.cameraRig.setBounds(room.camera?.bounds ?? room.bounds, 0);
    this.snapCamera = true;
  }

  private render(alpha: number, realDt: number): void {
    this.fps.push(realDt);
    const p = this.session.player;
    // While paused (debug / E2E) show the exact simulated state, not an interpolation of stale ticks.
    const a = this.debug.get('paused') ? 1 : alpha;
    const v = p.view;
    const x = v.prevX + (v.x - v.prevX) * a;
    const y = v.prevY + (v.y - v.prevY) * a;
    const ps = this.playerSprite;
    ps.position.set(x, viewY(y));
    ps.scale.x = Math.abs(ps.scale.x) * v.facing;

    // The camera follows the INTERPOLATED position — exactly what is drawn — so camera and player never jitter apart.
    const target: CameraTarget = { x, y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
    const aspect = this.renderer.viewport.contentAspect;
    if (this.snapCamera) {
      this.cameraRig.snapTo(target, aspect);
      this.snapCamera = false;
    }
    const pose = this.cameraRig.update(realDt, target, aspect);
    this.renderer.applyCamera(
      pose.center,
      { x: pose.lookAt.x - pose.center.x, y: pose.lookAt.y - pose.center.y, rollRad: pose.rollRad },
      pose.viewHeight,
    );

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
      /** The 2D view is ready as soon as `Game2D.create` resolved (nothing is loaded asynchronously yet). */
      ready: () => true,
      /** Freezes real-time simulation so tests can advance it tick by tick. */
      pause: () => this.debug.set('paused', true),
      resume: () => this.debug.set('paused', false),
      step: (n = 1) => {
        for (let i = 0; i < n; i++) this.stepOnce();
      },
      teleport: (x: number, y: number) => {
        this.session.player.respawn(x, y, this.session.player.facing);
        this.session.collision.probeGround(this.session.player.body);
        this.snapCamera = true;
      },
      state: () => {
        const b = this.session.player.body;
        const vp = this.renderer.viewport;
        return {
          x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded,
          anim: this.session.player.view.anim, state: this.session.player.controller.state,
          tick: this.session.now, fps: this.fps.fps,
          // `calls` keeps the field the 3D scenes used; `draws` is the same number under its real name
          calls: this.counter.median, triangles: 0,
          draws: this.counter.median, drawsMax: this.counter.max,
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
