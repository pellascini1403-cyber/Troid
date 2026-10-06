import type { Texture } from 'pixi.js';
import { SpriteAssetManager, type LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { createVfxAtlas } from '@/assets/vfxAtlas';
import { CAMERA_2D } from '@/camera/camera2d';
import { resolveCameraView, type CameraView } from '@/camera/cameraZones';
import type { CameraTarget } from '@/camera/CameraRig';
import { ABILITIES, ENEMIES, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, ROOMS, SPRITE_SETS, START, WORLD } from '@/content';
import { BOTTLE_DEFINITIONS, BOTTLES, CARDS, MAGIC } from '@/content/resources';
import { SKILLS } from '@/content/skills';
import { DisposableStore } from '@/core/lifecycle';
import { DebugActions } from '@/debug/DebugActions';
import { DebugState } from '@/debug/DebugState';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { FpsMeter } from '@/debug/FpsMeter';
import { CATALOGS, chooseLocale, createTranslator, FALLBACK_LOCALE, SUPPORTED_LOCALES, type Translator } from '@/i18n';
import { Enemy } from '@/enemies/Enemy';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import { TrainingDummy } from '@/enemies/TrainingDummy';
import { restoreFromProgress } from '@/gameplay/progress';
import { GameSession } from '@/gameplay/GameSession';
import type { Projectile } from '@/gameplay/Projectile';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import { log } from '@/core/log';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { interactGlyph } from '@/input/glyphs';
import { attachGamepad, browserPads } from '@/input/sources/GamepadSource';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import { TouchSource } from '@/input/sources/TouchSource';
import { VirtualPad } from '@/input/sources/VirtualPad';
import type { AnchorId } from '@/presentation/vocabulary';
import { ProgressStore } from '@/save/ProgressStore';
import { SettingsStore } from '@/save/SettingsStore';
import type { TouchSettings } from '@/save/SettingsData';
import { ActorSprite } from '@/render/ActorSprite';
import { CameraAdapter2D } from '@/render/CameraAdapter2D';
import { DummyView, type DummyLike } from '@/render/DummyView';
import { EntityViews } from '@/render/EntityViews';
import { SealView, type SealLike } from '@/render/SealView';
import { InteractableViews } from '@/render/InteractableViews';
import { ProceduralActor } from '@/render/ProceduralActor';
import { ProjectileView, type ProjectileLike } from '@/render/ProjectileView';
import { Renderer2D } from '@/render/Renderer2D';
import { RoomView2D } from '@/render/RoomView2D';
import { HudModel } from '@/ui/hud/HudModel';
import { HudView } from '@/ui/hud/HudView';
import { DeathOverlay } from '@/ui/overlays/DeathOverlay';
import { TransitionOverlay } from '@/ui/overlays/TransitionOverlay';
import { InteractionPrompt } from '@/ui/prompt/InteractionPrompt';
import type { SettingsMenu } from '@/ui/settings/SettingsMenu';
import { PauseButton } from '@/ui/settings/PauseButton';
import { applySafeOverride, SafeArea } from '@/ui/safeArea';
import { TouchControls } from '@/ui/touch/TouchControls';
import { listen } from './dom';
import { createStorage } from './storage';
import type { DevTools } from './devTools';
import { GameLoop } from './GameLoop';
import { afterIdle } from './dom';
import type { Effects } from './effects';
import { attachProgressRecorder } from './progressRecorder';
import { optionsFromQuery, type GameOptions } from './options';

/** How long after the first frame the page waits before it fetches the effects (it still waits for an idle moment after that). */
const EFFECTS_DELAY_MS = 2000;
/** What the effects report while they have not arrived. */
const NO_EFFECTS = { particles: 0, sprites: 0, spawned: 0, dropped: 0, peakParticles: 0, poolCreated: 0 };

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
  /** The markers of the room's interactables (a floating card, a lever) and the DOM icon that floats over the one in reach. */
  private readonly interactableViews: InteractableViews;
  private readonly prompt: InteractionPrompt;
  private readonly promptPoint = { x: 0, y: 0 };
  private readonly bindings = structuredClone(DEFAULT_BINDINGS);
  private readonly playerSprite: ActorSprite;
  private readonly entityViews: EntityViews;
  /** The effects: a separate chunk, fetched when the page is idle (or at once under `?hooks=1`). `null` until it arrives: the game needs none of them. */
  private effects: Effects | null = null;
  private effectsRequest: Promise<void> | null = null;
  private readonly deathOverlay: DeathOverlay;
  private readonly transitionOverlay: TransitionOverlay;
  private readonly safeArea: SafeArea;
  private readonly touchSource: TouchSource;
  private readonly touchControls: TouchControls;
  /** The HUD (DOM): a pure model fed by the session's status snapshot, and the view that applies it. */
  private readonly hudModel = new HudModel();
  private readonly hud: HudView;
  private readonly hudStatus = createPlayerStatus();
  /** The abstract pad of the E2E (`__troid.pad`): while it exists it replaces the browser's pads. */
  private virtualPad: VirtualPad | null = null;
  readonly translator: Translator;
  /** A room was (re)built by the simulation (death respawn, debug reset): rebuild the scenery at the next frame. */
  private roomDirty = false;
  /** Scratch for the camera zone resolution (one object, rewritten every frame). */
  private readonly cameraView: CameraView = { bounds: { x0: 0, y0: 0, x1: 0, y1: 0 }, viewHeight: null, smoothTime: undefined, zone: null };
  /** Camera shakes triggered by impacts and the strength of the last one (the trauma itself decays in real time). */
  private shakes = { count: 0, last: 0 };
  /** What the player chose and the game saved (the language, the size and opacity of the touch controls): loaded before the game is built. */
  private readonly settings: SettingsStore;
  private readonly pauseButton: PauseButton;
  /** The pause / settings menu: a separate chunk, fetched the first time it is asked for. While it is open the simulation is paused. */
  private menu: SettingsMenu | null = null;
  private menuRequest: Promise<void> | null = null;
  private menuOpen = false;
  /** The developer tools (panel, collision overlay, debug actions): a separate chunk, fetched the first time they are asked for. */
  private tools: DevTools | null = null;
  private toolsRequest: Promise<void> | null = null;
  private closed = false;

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
    // what the player chose last time (the language, the touch controls): read before anything is drawn, so the first frame is already right
    const settings = new SettingsStore(createStorage(), { warn: (message) => log.scope('save').warn(message) });
    await settings.load();
    // the progress of the game: continued, or erased with `?new=1`. A playground (`?room=`) never reads or writes it
    const progress = options.room ? null : new ProgressStore(createStorage(), { warn: (message) => log.scope('save').warn(message) });
    if (progress) await (options.newGame ? progress.erase() : progress.load());
    return new Game2D(renderer, counter, options, sprites, playerSet, settings, progress);
  }

  private constructor(
    private readonly renderer: Renderer2D,
    private readonly counter: DrawCallCounter,
    private readonly options: GameOptions,
    sprites: SpriteAssetManager<Texture>,
    playerSet: LoadedSpriteSet<Texture>,
    settings: SettingsStore,
    progress: ProgressStore | null,
  ) {
    this.settings = settings;
    // A new game starts the vertical slice (room R1, with the starting abilities). `?room=` opens a playground instead and
    // then the abilities are exactly `?unlock=` says: the test rooms never depended on what the hero starts with.
    const startRoom = options.room && ROOMS[options.room] ? options.room : START.room;
    // a saved game continues where the hero last came into a room, with what they had won (and a defeat brings them back at the last
    // checkpoint); a place the world no longer has is never trusted (docs/PROMPT6-LOG.md S24)
    const saved = progress?.value ? restoreFromProgress(progress.value, ROOMS, WORLD.start) : null;
    this.session = new GameSession({
      rooms: ROOMS,
      player: PLAYER,
      abilities: ABILITIES,
      resources: { magic: MAGIC, bottles: { definitions: BOTTLE_DEFINITIONS, initial: BOTTLES.initial, rules: BOTTLES.rules }, cards: CARDS, skills: SKILLS },
      enemies: ENEMIES,
      startRoom: saved?.startRoom ?? startRoom,
      ...(saved ? { startEntry: saved.startEntry, checkpoint: saved.checkpoint, flags: saved.flags, restore: saved.restore } : options.room ? {} : { startEntry: START.entry }),
      unlocked: saved ? [...saved.unlocked, ...options.unlock] : options.room ? options.unlock : [...START.unlocked, ...options.unlock],
    });
    if (progress) this.lifecycle.add(attachProgressRecorder(this.session, progress));
    this.lifecycle.add(() => this.session.dispose());
    this.lifecycle.add(() => sprites.dispose());
    this.lifecycle.add(() => renderer.destroy());

    // ---- camera ----
    const { bounds: _bounds, zones: _zones, ...roomCamera } = this.session.room.camera ?? {};
    this.camera = new CameraAdapter2D(renderer, { ...roomCamera, ...options.camera });

    // interface language: `?lang=` (a one-off, never saved) > what the player chose > the device's > English; the interface only ever asks for keys
    this.translator = createTranslator(
      CATALOGS,
      chooseLocale({ url: options.lang, saved: settings.value.language, device: navigator.languages }, SUPPORTED_LOCALES, FALLBACK_LOCALE),
      FALLBACK_LOCALE,
    );
    document.documentElement.lang = this.translator.locale; // screen readers and the browser's own UI follow the game's language
    this.lifecycle.add(this.translator.changed.subscribe((lang) => (document.documentElement.lang = lang)));

    // ---- input: three devices, one abstraction (docs/PROMPT5-LOG.md S13) ----
    attachKeyboardMouse(this.lifecycle, this.input, () => this.bindings);
    const gamepad = attachGamepad(this.input, () => this.bindings, () => (this.virtualPad ? [this.virtualPad] : browserPads()));
    this.lifecycle.add(() => gamepad.dispose());
    const ui = document.getElementById('ui') ?? document.body;
    applySafeOverride(document.documentElement, options.safe);
    this.safeArea = new SafeArea(ui);
    this.lifecycle.add(() => this.safeArea.dispose());
    this.touchSource = new TouchSource(this.input, DEFAULT_TOUCH, () => this.touchControls.gestureScale);
    this.touchControls = new TouchControls(ui, this.touchSource, this.translator, { size: settings.value.touch.scale, opacity: settings.value.touch.opacity });
    this.lifecycle.add(() => this.touchControls.dispose());
    // the HUD sits in the top-left; a finger on one of its bottle icons goes through the same single-owner touch source
    this.hud = new HudView(ui, this.translator, {
      down: (id, slot, x, y, t) => this.touchSource.down(id, `bottle:${slot}`, x, y, t),
      up: (id) => this.touchSource.up(id),
    });
    this.lifecycle.add(() => this.hud.dispose());
    // the interaction icon: it exists only over the object in reach, and a finger on it is the same single-owner touch source
    this.prompt = new InteractionPrompt(ui, this.translator, {
      down: (id, x, y, t) => this.touchSource.down(id, 'interact', x, y, t),
      up: (id) => this.touchSource.up(id),
    });
    this.lifecycle.add(() => this.prompt.dispose());
    // the entry to the pause / settings menu: one small icon at the top centre (the right side belongs to Attack, Dash and Ability)
    this.pauseButton = new PauseButton(ui, this.translator, () => this.toggleMenu());
    this.lifecycle.add(() => this.pauseButton.dispose());
    this.lifecycle.add(
      this.session.bus.on('bottle:changed', (e) => {
        if (e.type === 'used') this.hudModel.bottleUsed(e.slot);
      }),
    );
    // a refused cast (not enough magic): the bar and the card shake; a refused drink (no bottle, or full life): the bottles do
    this.lifecycle.add(this.session.bus.on('skill:denied', () => this.hudModel.magicDenied()));
    this.lifecycle.add(this.session.bus.on('bottle:denied', () => this.hudModel.bottlesDenied()));
    // a desktop with a mouse and a keyboard never sees the touch layer; a touch screen (or ?touch=1) does, and so does the first touch
    this.touchControls.setVisible(options.touch || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches));
    // a screen that shows the touch controls from the start IS a touch device: the prompts speak touch until another device is used
    if (this.touchControls.isVisible) this.input.noteUse('touch');
    listen(this.lifecycle, window, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touchControls.setVisible(true);
    }, { capture: true });

    // ---- views ----
    this.roomView = new RoomView2D(renderer.layers);
    this.lifecycle.add(() => this.roomView.destroy());
    this.interactableViews = new InteractableViews(renderer.layers);
    this.lifecycle.add(() => this.interactableViews.clear());
    this.playerSprite = new ActorSprite(playerSet, { zIndex: 10 });
    renderer.layers.actors.addChild(this.playerSprite.root);
    this.lifecycle.add(() => this.playerSprite.dispose());
    const vfxAtlas = createVfxAtlas();
    this.lifecycle.add(() => vfxAtlas.destroy());
    // one view per live entity, driven by the spawn / despawn events (the simulation never knows views exist)
    this.entityViews = new EntityViews(renderer.layers.actors, {
      dummy: (e) => ('view' in e && 'body' in e ? new DummyView(e as unknown as DummyLike) : null),
      // an enemy is drawn as its definition says: a procedural look today (the ink creatures); a sprite set when the art exists
      enemy: (e) => {
        const view = (e as Enemy).def.view;
        const look = 'proceduralId' in view ? PROCEDURAL_LOOKS[view.proceduralId] : undefined;
        return look ? new ProceduralActor(look, e as Enemy, { glow: vfxAtlas.frames.glow }) : null;
      },
      // a skill's projectile (the Spirit Bolt) is light: it is drawn in the additive layer with the effects
      projectile: (e) => new ProjectileView(e as unknown as ProjectileLike, vfxAtlas),
      // the sigil of a seal (S28): violet light in front of the door it holds
      seal: (e) => new SealView(e as unknown as SealLike),
    }, renderer.layers.fxWorld);
    this.entityViews.attach(this.session.bus, this.session.entities); // the first room's enemies already exist
    this.lifecycle.add(() => this.entityViews.destroy());
    // impact → camera shake (real time: the camera keeps moving through the hit-stop)
    this.lifecycle.add(
      this.session.bus.on('combat:hit', (e) => {
        this.camera.addTrauma(e.shake);
        this.shakes.count++;
        this.shakes.last = e.shake;
      }),
    );
    // a blow turned away by a seal jolts the view a little (it is not a hit: nothing froze, nothing was hurt)
    this.lifecycle.add(this.session.bus.on('seal:rejected', (e) => this.camera.addTrauma(e.shake)));
    this.deathOverlay = new DeathOverlay(ui, this.translator);
    this.lifecycle.add(() => this.deathOverlay.dispose());
    this.transitionOverlay = new TransitionOverlay(ui);
    this.lifecycle.add(() => this.transitionOverlay.dispose());
    this.lifecycle.add(this.session.bus.on('room:loaded', () => (this.roomDirty = true)));
    // a door dissolves when the flag that opens it is set (the simulation already switched its collider off)
    this.lifecycle.add(this.session.bus.on('gate:changed', ({ gateId, open }) => this.roomView.setGateOpen(gateId, open)));
    // The effects (pooled, budgeted, event-driven, real time) are cosmetic and a tenth of the first download: the page fetches them once the
    // first frame is up and it has a moment, 2 s after it at the latest idle — or at once under `?hooks=1`, so a test never waits for them by luck.
    const body = this.session.player.body;
    const loadEffects = (): Promise<void> =>
      (this.effectsRequest ??= import('./effects').then(({ createEffects }) => {
        if (this.closed) return;
        this.effects = createEffects({
          renderer: renderer.app.renderer,
          layers: renderer.layers,
          atlas: vfxAtlas,
          bus: this.session.bus,
          tier: renderer.qualityTier,
          playerPosition: () => ({ x: body.x, y: body.y }),
          projectileSkills: new Set(Object.keys(SKILLS)),
        });
      }));
    this.lifecycle.add(() => this.effects?.dispose());
    if (options.hooks) void loadEffects();
    else this.lifecycle.add(afterIdle(() => void loadEffects(), EFFECTS_DELAY_MS));
    this.buildRoomView();
    this.setupDebug();

    this.loop = new GameLoop({
      tick: () => this.tick(),
      frame: (alpha, dt) => this.render(alpha, dt),
    });
    this.lifecycle.add(() => this.loop.stop());
    if (options.paused) {
      this.debug.set('paused', true);
      this.loop.paused = true;
    }

    listen(this.lifecycle, window, 'resize', () => {
      this.renderer.resize();
      this.layoutUi();
    });
    // Mobile: never simulate (or burn battery) while hidden, never replay the time away, never leave a key stuck.
    listen(this.lifecycle, document, 'visibilitychange', () => {
      if (document.hidden) {
        this.loop.stop();
        this.input.releaseAll();
        this.touchControls.releaseAll();
      } else {
        this.loop.start();
      }
    });
    this.renderer.resize();
    this.layoutUi();
    if (options.hooks || import.meta.env.DEV) this.exposeTestHooks();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.closed = true;
    this.menu?.dispose();
    this.tools?.dispose();
    this.lifecycle.dispose();
  }

  // ------------------------------------------------------------------------------------------------ simulation

  private tick(): void {
    const frame = this.input.sample();
    if (frame.pausePressed) {
      this.toggleMenu(); // Escape / P / Start: that press is spent here, it does not also act in the game
      return;
    }
    if (this.menuOpen) return; // a paused game does not advance, whoever asks (the game loop, a test hook)
    this.session.tick(frame);
  }

  /** Runs exactly one tick with the current input (debug "step" and E2E tests). */
  stepOnce(): void {
    this.tick();
  }

  /** Places the DOM interface (the touch controls today) for the window and its safe area. Called on start and on every resize. */
  private layoutUi(): void {
    const ui = document.getElementById('ui') ?? document.body;
    const width = ui.clientWidth || window.innerWidth;
    const height = ui.clientHeight || window.innerHeight;
    const insets = this.safeArea.read();
    this.touchControls.place(width, height, insets);
    this.hud.place(width, height, insets);
    this.prompt.place(width, height, insets, this.touchControls.gestureScale);
    this.pauseButton.place(width, height, insets, this.touchControls.gestureScale);
  }

  /** The HUD and the contextual touch controls follow the simulation's status (read through one snapshot; nothing else is touched). */
  private updateHud(dt: number): void {
    const st = this.session.status(this.hudStatus);
    this.hud.update(this.hudModel.update(st, dt));
    this.touchControls.setChip(st.bottleUseful);
    this.touchControls.setAbility(st.card.equipped, st.card.iconId, st.card.state !== 'noMagic');
  }

  /** The interaction icon floats over its object: the world point goes through the camera, the DOM gets screen pixels. */
  private updatePrompt(): void {
    const n = this.hudStatus.interaction;
    if (n.active) this.renderer.worldToScreen(n.x, n.y, this.promptPoint);
    this.prompt.update({
      active: n.active,
      id: n.id,
      kind: n.kind,
      verbKey: n.verbKey,
      x: this.promptPoint.x,
      y: this.promptPoint.y,
      glyph: interactGlyph(this.input.device, this.bindings),
    });
  }

  // ---------------------------------------------------------------------------------------------------- views

  /** Is this interactable of the current room the shrine the hero last rested at? */
  private isCheckpoint(id: string): boolean {
    const room = this.session.room;
    const rest = room.interactables?.find((i) => i.id === id)?.actions.find((a) => a.type === 'checkpoint');
    const cp = this.session.checkpoint;
    return rest?.type === 'checkpoint' && cp.room === room.id && cp.entry === rest.entry;
  }

  private buildRoomView(): void {
    const room = this.session.room;
    this.roomView.build(room, (gateId) => this.session.gateOpen(gateId));
    this.interactableViews.build(room.interactables ?? [], (id) => this.session.interaction.isAvailable(id), (id) => this.isCheckpoint(id));
    this.tools?.setRoom();
    this.camera.setRoom(room);
  }

  private render(alpha: number, realDt: number): void {
    this.fps.push(realDt);
    if (this.roomDirty) {
      this.roomDirty = false;
      this.buildRoomView();
      this.camera.snap();
      this.effects?.system.clear();
    }
    const p = this.session.player;
    // While paused (debug / E2E) show the exact simulated state, not an interpolation of stale ticks.
    const a = this.debug.get('paused') ? 1 : alpha;
    const v = p.view;
    const x = v.prevX + (v.x - v.prevX) * a;
    const y = v.prevY + (v.y - v.prevY) * a;
    // Animation time follows the simulation clock: frozen while paused or in a hit-stop, slowed by timeScale (stable E2E
    // and screenshots). Phase-driven attack frames freeze by themselves; this freezes the time-driven ones.
    const animDt = this.debug.get('paused') || this.session.frozen ? 0 : realDt * this.debug.get('timeScale');
    this.playerSprite.sync(v, a, animDt);
    this.entityViews.sync(a, animDt);
    // VFX run in real time: only the pause (debug / tests) and the debug time scale affect them, never a hit-stop
    const vfxDt = this.debug.get('paused') ? 0 : realDt * this.debug.get('timeScale');
    this.effects?.director.update();
    this.effects?.system.update(vfxDt);
    this.roomView.update(realDt);
    this.interactableViews.update(realDt, (id) => this.session.interaction.isAvailable(id), (id) => this.isCheckpoint(id));
    this.deathOverlay.update(this.session.deathSnapshot);
    this.transitionOverlay.update(this.session.transitionSnapshot);
    this.updateHud(realDt);

    // which limits hold now: the room's, or those of the camera zone the hero's feet are in (an arena; it eases, it never jumps)
    this.camera.setView(resolveCameraView(this.session.room, this.session.flags, p.body.x, p.body.y, this.cameraView));
    // The camera follows the INTERPOLATED position — exactly what is drawn — so camera and player never jitter apart.
    const target: CameraTarget = { x, y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
    this.camera.update(realDt, target);
    this.updatePrompt(); // after the camera: the icon follows the object with THIS frame's transform

    this.loop.timeScale = this.debug.get('timeScale');
    this.loop.paused = this.debug.get('paused') || this.menuOpen;
    // the game is paused, so no tick samples the input: the menu watches for the pause key / button itself
    if (this.menuOpen && this.input.sample().pausePressed) this.closeMenu();
    this.session.godMode = this.debug.get('godMode');
    this.tools?.frame(performance.now());

    this.counter.beginFrame();
    this.renderer.render();
    this.counter.endFrame();
  }

  // ----------------------------------------------------------------------------------------------------- settings

  /** Escape / P / Start / the pause button: opens the menu (and pauses the game), or closes it. */
  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  private openMenu(): void {
    if (this.menuOpen) return;
    this.menuOpen = true;
    this.loop.paused = true;
    // nothing may stay pressed while the game waits: no finger, no key, no button keeps acting behind the menu
    this.input.releaseAll();
    this.touchControls.releaseAll();
    this.pauseButton.setHidden(true);
    void this.loadMenu().then(() => {
      if (this.menuOpen) this.menu?.open();
    });
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menu?.close();
    this.pauseButton.setHidden(false);
    this.input.releaseAll();
  }

  /** Fetches the settings menu the first time it is asked for (a player's first load never carries it). */
  private loadMenu(): Promise<void> {
    this.menuRequest ??= import('@/ui/settings/SettingsMenu').then(({ SettingsMenu }) => {
      if (this.closed) return;
      this.menu = new SettingsMenu(document.getElementById('ui') ?? document.body, this.translator, {
        languages: SUPPORTED_LOCALES,
        touchAvailable: () => this.touchControls.isVisible,
        current: () => ({ language: this.translator.locale, touch: { ...this.settings.value.touch } }),
        setLanguage: (language) => this.setLanguage(language),
        setTouch: (patch) => this.setTouch(patch),
        close: () => this.closeMenu(),
      });
    });
    return this.menuRequest;
  }

  /** The player chose a language: it is applied at once (the interface re-reads every text) and saved — a `?lang=` override is not. */
  private setLanguage(language: string): void {
    this.translator.setLocale(language);
    void this.settings.update({ language: this.translator.locale });
  }

  /** The player moved a slider: the touch controls follow at once and the choice is saved. */
  private setTouch(patch: Partial<TouchSettings>): void {
    const next = { ...this.settings.value.touch, ...patch };
    this.touchControls.setSize(next.scale);
    this.touchControls.setOpacity(next.opacity);
    void this.settings.update({ touch: patch });
  }

  // ------------------------------------------------------------------------------------------------------ debug

  private setupDebug(): void {
    if (!this.options.debug && !import.meta.env.DEV) return;
    listen(this.lifecycle, window, 'keydown', (e) => {
      if (e.code !== 'Backquote') return;
      e.preventDefault();
      this.debug.toggle('panel'); // the panel reads the state when it is built, so the first press can come before its code
      void this.loadTools();
    });
    if (this.options.debug) {
      this.debug.set('panel', true);
      void this.loadTools();
    }
  }

  /** Fetches the developer tools the first time they are asked for (a player's first load never carries them). */
  private loadTools(): Promise<void> {
    this.toolsRequest ??= import('./devTools').then(({ DevTools }) => {
      if (this.closed) return;
      this.tools = new DevTools(
        {
          session: this.session,
          debug: this.debug,
          actions: this.debugActions,
          fps: this.fps,
          counter: this.counter,
          input: this.input,
          renderer: this.renderer,
          step: () => this.stepOnce(),
          spawn: {
            dummy: (x, y, facing) => void this.session.spawn(new TrainingDummy(this.session.ids.next('dummy'), { x, y, facing })),
            slime: (x, y, facing) => void this.session.spawn(new Enemy(this.session.ids.next('ink_slime'), ENEMIES.ink_slime as EnemyDefinition, { x, y, facing })),
          },
        },
        document.getElementById('ui') ?? document.body,
      );
    });
    return this.toolsRequest;
  }

  /**
   * Tests read what is PRESENTED (sprite frame, overlay) right after stepping the simulation: bring those up to date
   * without waiting for the next animation frame. A room rebuilt by the simulation is applied here too.
   */
  private refreshPresented(): void {
    if (this.roomDirty) {
      this.roomDirty = false;
      this.buildRoomView();
      this.camera.snap();
      this.effects?.system.clear();
    }
    this.playerSprite.sync(this.session.player.view, 1, 0);
    this.deathOverlay.update(this.session.deathSnapshot);
    this.transitionOverlay.update(this.session.transitionSnapshot);
    this.updateHud(0);
    this.updatePrompt();
  }

  /** `window.__troid`: lets Playwright drive and inspect the game deterministically (dev builds / `?hooks=1`). */
  private exposeTestHooks(): void {
    const hooks = {
      game: this,
      session: this.session,
      input: this.input,
      /** The 2D view is ready as soon as `Game2D.create` resolved (the sprite sets are loaded before it is built). */
      ready: () => true,
      /** The effects have arrived (they load after the first frame): a test that looks at them waits for this. */
      effectsReady: () => this.effects !== null,
      /** Freezes real-time simulation so tests can advance it tick by tick. */
      pause: () => this.debug.set('paused', true),
      resume: () => this.debug.set('paused', false),
      step: (n = 1) => {
        for (let i = 0; i < n; i++) this.stepOnce();
        this.refreshPresented();
      },
      /** Test hook: a training dummy at `(x, y)` (the entity joins the world at the end of the next tick). */
      spawnDummy: (x: number, y = 0, health = 5) => {
        const dummy = this.session.spawn(new TrainingDummy(this.session.ids.next('dummy'), { x, y, health }));
        return dummy.id;
      },
      /** Test hook: an Ink Slime at `(x, y)` looking at `facing` (joins the world at the end of the next tick). */
      spawnSlime: (x: number, y = 0, facing: 1 | -1 = -1) => {
        const slime = this.session.spawn(new Enemy(this.session.ids.next('ink_slime'), ENEMIES.ink_slime as EnemyDefinition, { x, y, facing }));
        return slime.id;
      },
      /** Test hook: an enemy hitbox over the player's torso, resolved by the next tick (1 damage, standard knockback). */
      strikePlayer: (facing: 1 | -1 = 1) => {
        const b = this.session.player.body;
        this.session.combat.submit({
          ownerId: 'e2e_enemy', team: 'enemy', rect: { x0: b.x - 0.5, x1: b.x + 0.5, y0: b.y + 0.2, y1: b.y + 1.2 }, attackId: 'e2e_strike',
          damage: 1, knockback: { x: 5.5, y: 4 }, stun: 14, hitStop: 6, shake: 0.2, facing, alreadyHit: new Set(),
        });
      },
      /** Test hook: what the touch layer sees right now (fingers owned, the movement gesture, the layout in px). */
      touch: () => ({
        visible: this.touchControls.isVisible,
        active: this.touchSource.active,
        gesture: this.touchSource.gesture,
        layout: this.touchControls.current,
      }),
      /** Test hook: where a point of the world is on screen (CSS px), with the camera of the last frame. */
      worldToScreen: (x: number, y: number) => this.renderer.worldToScreen(x, y),
      /** Test hook: the HUD as the model computed it and as laid out (px). */
      hud: () => ({ state: this.hudModel.state, layout: this.hud.current }),
      /** Test hook: the abstract gamepad, in the Gamepad API's own terms (+y of the stick is DOWN); `pressed` = held button indices. */
      pad: {
        set: (x: number, y: number, pressed: number[] = []) => {
          const pad = this.virtualPad ?? (this.virtualPad = new VirtualPad());
          pad.connected = true;
          pad.neutral().stick(x, y);
          for (const i of pressed) pad.press(i);
        },
        disconnect: () => void this.virtualPad?.disconnect(),
        remove: () => void (this.virtualPad = null),
      },
      revive: () => {
        this.session.player.revive();
        this.session.rescuePlayer();
        this.refreshPresented();
      },
      teleport: (x: number, y: number) => {
        this.session.player.respawn(x, y, this.session.player.facing);
        this.session.collision.probeGround(this.session.player.body);
        this.camera.snap();
        this.refreshPresented();
      },
      /** Lets the camera run `seconds` of its own time at 60 Hz right now: a test need not wait on slow software-GL frames to see where it settles. */
      settleCamera: (seconds = 4) => {
        const p = this.session.player;
        const v = p.view;
        const target: CameraTarget = { x: v.x, y: v.y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
        for (let i = 0, n = Math.round(seconds * 60); i < n; i++) {
          this.camera.setView(resolveCameraView(this.session.room, this.session.flags, p.body.x, p.body.y, this.cameraView));
          this.camera.update(1 / 60, target);
        }
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
          health: this.session.player.health.current, maxHealth: this.session.player.health.max,
          hitStop: this.session.hitStopLeft, now: this.session.now, trauma: this.camera.rig.currentTrauma, shakes: { ...this.shakes },
          invulnerable: this.session.player.invulnerable, blink: this.session.player.view.blink, flash: this.session.player.view.flash,
          combat: {
            attack: this.session.player.combat.attack?.id ?? null, phase: this.session.player.view.phase,
            ticks: this.session.player.combat.attackTicks, combo: this.session.player.combat.combo,
          },
          dummies: this.session.entities.filter((e) => e.kind === 'dummy').map((e) => {
            const d = e as TrainingDummy;
            return { id: d.id, x: d.body.x, y: d.body.y, vx: d.body.vx, hp: d.health.current, hits: d.hits };
          }),
          enemies: this.session.entities.filter((e) => e.kind === 'enemy').map((e) => {
            const n = e as Enemy;
            return {
              id: n.id, def: n.def.id, state: n.state, ticks: n.stateTicks, x: n.body.x, y: n.body.y, vx: n.body.vx, facing: n.facing,
              hp: n.health.current, hits: n.hits, anim: n.view.anim, phase: n.view.phase, phaseT: n.view.phaseT, opacity: n.view.opacity,
            };
          }),
          // objects in each scene layer: the E2E proves that rebuilding a room leaves nothing behind
          scene: Object.fromEntries(
            (['terrain', 'actors', 'fxNormal', 'fxWorld', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay'] as const).map((k) => [k, this.renderer.layers[k].children.length]),
          ),
          room: this.session.room.id,
          flags: this.session.flags.list(),
          gates: Object.fromEntries((this.session.room.gates ?? []).map((g) => [g.id, { open: this.session.gateOpen(g.id), alpha: this.roomView.gateAlpha(g.id) ?? null }])),
          exits: [...this.session.exitsReached],
          views: this.entityViews.count,
          vfx: this.effects?.system.stats ?? NO_EFFECTS,
          death: this.session.deathSnapshot, transition: this.session.transitionSnapshot, lang: this.translator.locale,
          device: this.input.device,
          // the player's resources (the HUD shows them; the tests read the numbers)
          magic: this.session.magic.current,
          card: this.session.loadout.equipped?.id ?? null,
          bottles: this.session.bottles.slots.map((b) => b.state),
          projectiles: this.session.entities.filter((e) => e.kind === 'projectile').map((e) => {
            const p = e as unknown as Projectile;
            return { id: p.id, x: p.x, y: p.y, facing: p.facing };
          }),
          respawnPoint: { ...this.session.respawnPoint },
          sprite: {
            set: ps.spriteSetId, frame: ps.frame, facing: ps.root.scale.x, visible: ps.root.visible,
            hand: anchor('hand_r'), grip: anchor('weapon_grip'), tip: anchor('weapon_tip'),
          },
          tick: this.session.now, fps: this.fps.fps,
          // `calls` keeps the field the 3D scenes used; `draws` is the same number under its real name
          calls: this.counter.median, triangles: 0,
          draws: this.counter.median, drawsMax: this.counter.max,
          camera: {
            x: this.camera.centre.x, y: this.camera.centre.y, viewHeight: this.camera.rig.pose.viewHeight,
            zone: this.camera.activeZone, limits: this.camera.rig.limits ? { ...this.camera.rig.limits } : null,
          },
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
