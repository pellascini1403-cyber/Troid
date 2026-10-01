import * as THREE from 'three';
import { AssetManager } from '@/assets/AssetManager';
import { CameraRig, DEFAULT_CAMERA, type CameraTarget } from '@/camera/CameraRig';
import { CameraView } from '@/camera/CameraView';
import { ABILITIES, MODELS, PLAYER, ROOMS } from '@/content';
import { DisposableStore } from '@/core/lifecycle';
import { ColliderOverlay } from '@/debug/ColliderOverlay';
import { DebugActions } from '@/debug/DebugActions';
import { DebugPanel } from '@/debug/DebugPanel';
import { DebugState } from '@/debug/DebugState';
import { FpsMeter } from '@/debug/FpsMeter';
import { GameSession } from '@/gameplay/GameSession';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import { PlayerVisual } from '@/player/PlayerVisual';
import { createRenderer } from '@/render/createRenderer';
import { disposeTree } from '@/render/dispose';
import { SunRig } from '@/render/SunRig';
import { buildBlockout } from '@/world/view/RoomBlockout';
import { listen } from './dom';
import { GameLoop } from './GameLoop';
import { optionsFromQuery, type GameOptions } from './options';

/** Room started when `?room=` is absent. */
const DEFAULT_ROOM = 'movement_test';

/**
 * Composition root: wires the deterministic simulation to everything that can be seen, heard or touched.
 * Nothing here decides gameplay; it only connects things and renders. It owns every listener and GPU resource
 * through `lifecycle`, so `dispose()` (hot reload, tests) leaves nothing behind.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly session: GameSession;
  readonly input = new InputManager();
  readonly debug = new DebugState();
  readonly debugActions = new DebugActions();

  private readonly lifecycle = new DisposableStore();
  private readonly options: GameOptions;
  private readonly assets = new AssetManager(import.meta.env.BASE_URL);
  private readonly fps = new FpsMeter();
  private readonly loop: GameLoop;
  private readonly sun: SunRig;
  private readonly cameraRig: CameraRig;
  private readonly cameraView = new CameraView(DEFAULT_CAMERA.near, DEFAULT_CAMERA.far);
  private readonly bindings = structuredClone(DEFAULT_BINDINGS);

  private roomView: THREE.Group | null = null;
  private playerVisual: PlayerVisual | null = null;
  private colliders: ColliderOverlay | null = null;
  private panel: DebugPanel | null = null;
  private aspect = 16 / 9;
  private snapCamera = true;

  constructor(private readonly host: HTMLElement, query = new URLSearchParams(location.search)) {
    this.options = optionsFromQuery(query);
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    this.renderer = createRenderer({ canvas, antialias: true, maxPixelRatio: 2, shadows: true });

    this.session = new GameSession({
      rooms: ROOMS,
      player: PLAYER,
      abilities: ABILITIES,
      startRoom: this.options.room && ROOMS[this.options.room] ? this.options.room : DEFAULT_ROOM,
      unlocked: this.options.unlock,
    });
    this.lifecycle.add(() => this.session.dispose());

    // ---- scene (placeholder look; F17 replaces lighting/atmosphere) ----
    this.scene.background = new THREE.Color(0x9fb8a0);
    this.scene.fog = new THREE.Fog(0x9fb8a0, 40, 190);
    this.scene.add(new THREE.HemisphereLight(0xe6f0d8, 0x4a5642, 1.4));
    this.sun = new SunRig(this.scene);
    this.lifecycle.add(() => this.sun.dispose());

    // ---- camera ----
    this.cameraRig = new CameraRig({ ...this.session.room.camera, ...this.options.camera });

    // ---- input ----
    attachKeyboardMouse(this.lifecycle, this.input, () => this.bindings);

    // ---- views ----
    this.buildRoomView();
    void this.loadPlayerVisual();
    this.registerDebugActions();
    this.setupDebug();

    this.loop = new GameLoop({
      tick: () => this.tick(),
      frame: (alpha, dt) => this.render(alpha, dt),
    });
    this.lifecycle.add(() => this.loop.stop());

    listen(this.lifecycle, window, 'resize', () => this.resize());
    // Mobile: never simulate (or burn battery) while hidden, never replay the time away, never leave a key stuck.
    listen(this.lifecycle, document, 'visibilitychange', () => {
      if (document.hidden) {
        this.loop.stop();
        this.input.releaseAll();
      } else {
        this.loop.start();
      }
    });
    this.lifecycle.add(() => {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    });
    this.resize();
    if (this.options.hooks || import.meta.env.DEV) this.exposeTestHooks();
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
    if (this.roomView) disposeTree(this.roomView);
    this.roomView = buildBlockout(this.session.room);
    this.scene.add(this.roomView);
    this.colliders?.setRoom(this.session.collision);
    const room = this.session.room;
    this.cameraRig.setBounds(room.camera?.bounds ?? room.bounds, 0);
    this.snapCamera = true;
  }

  private async loadPlayerVisual(): Promise<void> {
    const def = MODELS[PLAYER.modelId];
    if (!def) throw new Error(`player model "${PLAYER.modelId}" is not in the content registry`);
    const model = await this.assets.instantiate(def);
    if (this.lifecycle.disposed) {
      model.dispose();
      return;
    }
    this.playerVisual = new PlayerVisual(model);
    this.scene.add(this.playerVisual.root);
    this.lifecycle.add(() => {
      this.playerVisual?.dispose();
      this.assets.dispose();
    });
  }

  private render(alpha: number, realDt: number): void {
    this.fps.push(realDt);
    const p = this.session.player;
    this.playerVisual?.sync(p.view, alpha, realDt);

    // The camera follows the INTERPOLATED position — exactly what is drawn — so camera and player never jitter apart.
    const v = p.view;
    const target: CameraTarget = {
      x: v.prevX + (v.x - v.prevX) * alpha,
      y: v.prevY + (v.y - v.prevY) * alpha,
      vx: p.body.vx,
      vy: p.body.vy,
      facing: p.facing,
      grounded: p.body.grounded,
    };
    if (this.snapCamera) {
      this.cameraRig.snapTo(target, this.aspect);
      this.snapCamera = false;
    }
    const pose = this.cameraRig.update(realDt, target, this.aspect);
    this.sun.follow(pose.center.x, pose.center.y);

    if (this.debug.get('colliders') && this.colliders) this.colliders.updateBodies([p.body]);
    this.loop.timeScale = this.debug.get('timeScale');
    this.loop.paused = this.debug.get('paused');
    this.session.godMode = this.debug.get('godMode');
    this.panel?.update(performance.now());

    this.renderer.render(this.scene, this.cameraView.apply(pose, this.aspect));
  }

  private resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
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
        return [
          `room   ${this.session.room.id}   tick ${this.session.now}`,
          `pos    ${b.x.toFixed(2)}, ${b.y.toFixed(2)}`,
          `vel    ${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}`,
          `state  ${c.state}  anim ${p.view.anim}`,
          `ground ${b.grounded ? 'yes' : 'no'}  dash cd ${c.dashCooldown01.toFixed(2)}`,
          `abil   ${this.session.abilities.serialize().join(',') || '—'}`,
          `input  ${this.input.device}`,
        ].join('\n');
      },
      tuning: [{ title: 'movement', target: p.def.movement }],
    });
    this.lifecycle.add(() => this.panel?.dispose());
  }

  private setColliderOverlay(on: boolean): void {
    if (on && !this.colliders) {
      this.colliders = new ColliderOverlay();
      this.colliders.setRoom(this.session.collision);
      this.scene.add(this.colliders.object);
    } else if (!on && this.colliders) {
      this.colliders.dispose();
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
      /** True once the player model has loaded (screenshots before this show an empty stage). */
      ready: () => this.playerVisual !== null,
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
        return {
          x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded,
          anim: this.session.player.view.anim, state: this.session.player.controller.state,
          tick: this.session.now, fps: this.fps.fps,
          calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
        };
      },
    };
    (window as unknown as { __troid: typeof hooks }).__troid = hooks;
    this.lifecycle.add(() => {
      delete (window as unknown as { __troid?: unknown }).__troid;
    });
  }
}
