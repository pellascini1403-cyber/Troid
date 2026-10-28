import type { Texture } from 'pixi.js';
import { SpriteAssetManager, type LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { createVfxAtlas, type VfxAtlas } from '@/assets/vfxAtlas';
import { CAMERA_2D } from '@/camera/camera2d';
import { resolveCameraView, type CameraView } from '@/camera/cameraZones';
import type { CameraTarget } from '@/camera/CameraRig';
import { ABILITIES, BOSSES, ENEMIES, inCore, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, ROOMS, SPRITE_SETS, START, UPGRADES, WORLD } from '@/content/core';
import { BOTTLE_DEFINITIONS, BOTTLES, CARDS, MAGIC } from '@/content/resources';
import { PLAYER_VISUAL } from '@/content/visuals';
import { SKILLS } from '@/content/skills';
import { DisposableStore } from '@/core/lifecycle';
import { DebugActions } from '@/debug/DebugActions';
import { DebugState } from '@/debug/DebugState';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { FpsMeter } from '@/debug/FpsMeter';
import { CATALOGS, chooseLocale, createTranslator, FALLBACK_LOCALE, SUPPORTED_LOCALES, type Translator } from '@/i18n';
import { Enemy } from '@/enemies/Enemy';
import type { Boss } from '@/enemies/boss/Boss';
import type { Guardian } from '@/enemies/Guardian';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import { TrainingDummy } from '@/enemies/TrainingDummy';
import { PlayStats } from '@/gameplay/PlayStats';
import { restoreFromProgress } from '@/gameplay/progress';
import type { Seal } from '@/gameplay/Seal';
import { GameSession } from '@/gameplay/GameSession';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import { describeError, log } from '@/core/log';
import { DEFAULT_TOUCH } from '@/input/gestures/TouchConfig';
import type { AudioCategory } from '@/presentation/audioMix';
import { DEFAULT_BINDINGS, type Bindings } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { applyKeyMap, effectiveKeys, type KeyMap } from '@/input/remap';
import { interactGlyph } from '@/input/glyphs';
import { attachGamepad, browserPads } from '@/input/sources/GamepadSource';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';
import { TouchSource } from '@/input/sources/TouchSource';
import { VirtualPad } from '@/input/sources/VirtualPad';
import type { ProgressData } from '@/save/ProgressData';
import type { ProgressStore } from '@/save/ProgressStore';
import type { Inspection } from '@/save/SafeStore';
import { SaveSlots } from '@/save/SaveSlots';
import { defaultsFor } from '@/save/SettingsData';
import { SettingsStore } from '@/save/SettingsStore';
import type { AccessibilitySettings, TouchSettings } from '@/save/SettingsData';
import type { LightFrame, LightHero } from '@/presentation/lighting';
import type { QualitySetting } from '@/presentation/viewport';
import { DEFAULT_GOVERNOR, QualityGovernor } from '@/presentation/qualityGovernor';
import { ARRIVAL, ArrivalGate, roomAhead, type ArrivalOutcome } from '@/presentation/arrival';
import { MEMORY_BUDGET_MIB, MIB } from '@/presentation/stressModel';
import { lackedClips } from '@/presentation/visualSource';
import { ActorSprite } from '@/render/ActorSprite';
import { PlayerVisualSwitch } from '@/render/PlayerVisual';
import { CameraAdapter2D } from '@/render/CameraAdapter2D';
import { DummyView, type DummyLike } from '@/render/DummyView';
import { EntityViews, type EntityView } from '@/render/EntityViews';
import type { BossLike } from '@/render/BossView';
import type { GuardianArt, GuardianLike } from '@/render/GuardianView';
import { LateView } from '@/render/LateView';
import { EnemyShotView, type EnemyShotLike } from '@/render/EnemyShotView';
import { SealView, type SealLike } from '@/render/SealView';
import { InteractableViews } from '@/render/InteractableViews';
import { ProceduralActor } from '@/render/ProceduralActor';
import { ProjectileView, type ProjectileLike } from '@/render/ProjectileView';
import { Renderer2D } from '@/render/Renderer2D';
import { RoomView2D } from '@/render/RoomView2D';
import type { RoomArtCoverage, RoomArtView } from '@/render/RoomArtView';
import { BossBarModel } from '@/ui/hud/BossBarModel';
import type { BossBarView } from '@/ui/hud/BossBarView';
import { HudModel } from '@/ui/hud/HudModel';
import type { SaveNoticeKind } from './gameSaves';
import type { Overlays } from './overlays';
import type { PauseMenu, PauseScreen } from '@/ui/settings/PauseMenu';
import { applySafeOverride, SafeArea } from '@/ui/safeArea';
import { TouchControls } from '@/ui/touch/TouchControls';
import type { Insets } from '@/ui/touch/layout';
import { listen } from './dom';
import { isDurable, openStorage } from './storage';
import type { CapacitorGlobal } from './nativeStorage';
import { browserPlatform, GameSaves } from './gameSaves';
import type { DevTools } from './devTools';
import { GameLoop } from './GameLoop';
import { CURTAIN_TIMEOUT_MS, curtainUp, liftCurtain, wantsCurtain, type CurtainReason } from './curtain';
import { TICK_RATE } from '@/core/time';
import { afterIdle } from './dom';
import type { Art } from './art';
import type { AudioSystem } from './audio';
import type { Effects } from './effects';

type BossViews = typeof import('./bossViews');
import { loadBeyond } from './beyond';
import { artIndexUrl, optionsFromQuery, type GameOptions } from './options';

/** How long after the first frame the page waits before it fetches the effects (it still waits for an idle moment after that). */
const EFFECTS_DELAY_MS = 2000;

/** The memory the art may take while a room beyond a way out is brought in early: what is resident plus what the early load would add stays under the library's resident budget. */
const PREFETCH_CEILING_BYTES = MEMORY_BUDGET_MIB.resident * MIB;

/** How one change of zone went, for the tests and the debug tools: the room, the milliseconds the world was held, how the wait ended and whether the loading indicator was ever shown. */
export interface ArrivalRecord {
  room: string;
  waited: number;
  outcome: ArrivalOutcome | null;
  indicator: boolean;
}

/** How many frames in a row may fail before the game gives up (two seconds of them at 60 a second). */
const FRAME_FAILURES_LIMIT = 120;
/** …and how many before it gives up on the effects alone, which are cosmetic and the one part of the drawing that is not Pixi's own: a third of a second of frames that fail, and the game goes on without them. */
const EFFECTS_FAILURES_LIMIT = 20;

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
  /** The art that dresses the room the hero is in (it arrives with the art library; the blockout draws what it does not cover). */
  private roomArt: RoomArtView | null = null;
  private roomArtCover: RoomArtCoverage | null = null;
  /** Which build of the room's look the art is dressing: a dressing that finds a newer build has nothing to cover any more. */
  private dressSerial = 0;
  /** The markers of the room's interactables (a floating card, a lever) and the DOM icon that floats over the one in reach. */
  private readonly interactableViews: InteractableViews;
  private readonly promptPoint = { x: 0, y: 0 };
  /** The keys in force: the defaults with what the player chose on top (S30). A remap replaces the object, and every reader asks for it again each time. */
  private bindings: Bindings = structuredClone(DEFAULT_BINDINGS);
  /** The protagonist: the placeholder, and the real art on top when the art library has it (docs/ART-PIPELINE-2D.md part D). */
  private readonly playerVisual: PlayerVisualSwitch;
  private readonly entityViews: EntityViews;
  /** The effects: a separate chunk, fetched when the page is idle (or at once under `?hooks=1`). `null` until it arrives: the game needs none of them. */
  private effects: Effects | null = null;
  private effectsRequest: Promise<void> | null = null;
  /** Set once the frames kept failing with the effects on (`frameFailed`): they are not made again in this session. */
  private effectsOff = false;
  /** The sound: a separate chunk, fetched when the page is idle (or at once under `?hooks=1`). `null` until it arrives: the game needs none of it. */
  private audio: AudioSystem | null = null;
  private audioRequest: Promise<void> | null = null;
  /** The boot curtain is up (docs/PROMPT8-LOG.md, phase J): the world waits, still, until the art of the first room is in — a cold start never shows the blockout on its way to the produced look. */
  private veiled = false;
  /** Builds the effects again with the budgets of the profile in force (set once their chunk has arrived). */
  private rebuildEffects: (() => void) | null = null;
  /** Auto quality that measures (docs/PROMPT20-LOG.md §7): watches how long the frames take and steps down to the low profile when the game cannot keep up. `null` where it is off (`?adaptive=0`, and `?hooks=1` without `?adaptive=1`). */
  private readonly governor: QualityGovernor | null;
  /** What the lights of the world read each frame (made once, filled in place: nothing is allocated while the game runs). */
  private readonly lightHero: LightHero = { x: 0, y: 0, dead: false, magic: 0 };
  private readonly lightFrame: LightFrame = { alpha: 1, hero: this.lightHero, bodies: [] };
  private readonly floorProbe = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** The light the art painted (docs/ART-PIPELINE-2D.md §M.14), once the art has started and its packs of light are in memory: the effects draw from this atlas instead of the game's own, which stays under it. */
  private vfxArt: { readonly atlas: VfxAtlas; dispose(): void } | null = null;
  /** The art that comes from files (docs/ART-PIPELINE-2D.md, part C): a separate chunk, fetched after the first frame and ONLY when there is an index to read. `null` otherwise. */
  private art: Art | null = null;
  private artRequest: Promise<void> | null = null;
  private readonly safeArea: SafeArea;
  private readonly touchSource: TouchSource;
  private readonly touchControls: TouchControls;
  /** The HUD (DOM): a pure model fed by the session's status snapshot, and the view that applies it. */
  private readonly hudModel = new HudModel();
  /** The boss's bar (S29): a model the simulation's events move and a DOM view that draws it. */
  private readonly bossBarModel = new BossBarModel();
  /** What is SEEN of a boss (its column and its bar): a separate chunk, fetched with the effects. `null` until it arrives: the fight needs none of it. */
  private bossViews: BossViews | null = null;
  private bossViewsRequest: Promise<BossViews> | null = null;
  private bossBar: BossBarView | null = null;
  /** The id of the boss that is fighting now (the bar follows its health), `null` when none is. */
  private bossId: string | null = null;
  private readonly hudStatus = createPlayerStatus();
  /** The abstract pad of the E2E (`__troid.pad`): while it exists it replaces the browser's pads. */
  private virtualPad: VirtualPad | null = null;
  readonly translator: Translator;
  /** A room was (re)built by the simulation (death respawn, debug reset): rebuild the scenery at the next frame. */
  private roomDirty = false;
  /**
   * THE ARRIVAL (docs/PROMPT13-LOG.md): under the black of a change of zone the simulation swaps the room in one step, but what is SEEN of it is made of files. The world is held — not one tick runs —
   * from the swap until the room's art is in memory and its view is on the stage, whole, and has been drawn a couple of times out of sight. The ticks that follow are the same ones whenever they come.
   */
  private readonly arrival: ArrivalGate;
  /** The black of a defeat and of a change of zone, the loading line, the icon over what can be interacted with, the pause button and the notice about the saved game: a chunk of their own, fetched with the other cosmetic parts. `null` until it arrives (the first frame needs none). */
  private overlays: Overlays | null = null;
  private overlaysRequest: Promise<void> | null = null;
  /** A notice raised before the overlays arrived (a game that was recovered, as the game begins): it is shown the moment they do. */
  private pendingNotice: { kind: SaveNoticeKind; slot: number } | null = null;
  /** The loading indicator was on screen during the wait that is going on. */
  private indicatorSeen = false;
  /** The room whose art is being brought in early because the hero walks toward the way into it. */
  private aheadFor: string | null = null;
  /** Whoever is waiting for the world to be let go (the test hooks' `step`). */
  private arrivalWaiters: Array<() => void> = [];
  /** How the last changes of zone went. */
  private readonly arrivals: ArrivalRecord[] = [];
  /** Scratch for the camera zone resolution (one object, rewritten every frame). */
  private readonly cameraView: CameraView = { bounds: { x0: 0, y0: 0, x1: 0, y1: 0 }, viewHeight: null, smoothTime: undefined, zone: null };
  /** Camera shakes triggered by impacts and the strength of the last one (the trauma itself decays in real time). */
  private shakes = { count: 0, last: 0 };
  /** What the player chose and the game saved (the language, the size and opacity of the touch controls): loaded before the game is built. */
  private readonly settings: SettingsStore;
  /** The saved games of the page (`null` in a playground, which saves nothing) and what is counted of the one being played. */
  private readonly saves: GameSaves | null;
  private readonly stats: PlayStats;
  /** The pause menu (its list, the settings, the controls, the saved games and the profile): a separate chunk, fetched the first time it is asked for. While it is open the world stands still. */
  private menu: PauseMenu | null = null;
  private menuRequest: Promise<void> | null = null;
  private menuOpen = false;
  /** The screen the menu opens on: the map, or the closing of the adventure when the hero has just walked out of the world. */
  private menuScreen: PauseScreen = 'main';
  /** The developer tools (panel, collision overlay, debug actions): a separate chunk, fetched the first time they are asked for. */
  private tools: DevTools | null = null;
  private toolsRequest: Promise<void> | null = null;
  private closed = false;

  /** Pixi's `Application.init` is asynchronous, hence the factory. */
  static async create(host: HTMLElement, query = new URLSearchParams(location.search)): Promise<Game2D> {
    const options = optionsFromQuery(query);
    const counter = new DrawCallCounter();
    if (options.hooks || import.meta.env.DEV) DrawCallCounter.install(counter);
    // what the player chose last time (the language, the volume, the quality, the keys, the touch controls): read before anything is drawn, so the
    // first frame is already right — the quality is the profile the renderer is built with
    const storage = await openStorage();
    // (a system that asks for less motion gets the camera that does not shake and the effects that do not flash, until the player chooses otherwise)
    const settings = new SettingsStore(storage, { warn: (message) => log.scope('save').warn(message), defaults: () => defaultsFor({ reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches }) });
    await settings.load();
    const renderer = await Renderer2D.create({ host, viewHeight: options.camera.viewHeight ?? CAMERA_2D.viewHeight ?? 13.5, quality: settings.value.quality });
    // Sprites load asynchronously (a placeholder atlas is drawn, final art would be fetched), so the game is built only
    // once the player's set is ready: `__troid.ready()` is true as soon as `create` resolves.
    const sprites = new SpriteAssetManager<Texture>(createPixiSpriteLoader({ procedural: PROCEDURAL_ATLASES }));
    const playerDef = SPRITE_SETS[PLAYER.spriteSetId];
    if (!playerDef) throw new Error(`player sprite set "${PLAYER.spriteSetId}" is not in the content registry`);
    const playerSet = await sprites.acquire(playerDef);
    // the saved games: the one being played is continued, or erased with `?new=1`. A playground (`?room=`) never reads or writes them
    const slots = options.room ? null : new SaveSlots(storage, { warn: (message) => log.scope('save').warn(message) });
    const progress = slots ? slots.store(settings.value.slot) : null;
    let found: Inspection<ProgressData> | null = null;
    if (progress) {
      if (options.newGame) {
        await progress.erase();
        // `?new=1` is a request to start over ONCE: it is taken out of the address, so that reloading the page (or coming back to it from the history) continues the game that was begun instead of erasing it again
        try {
          const url = new URL(location.href);
          url.searchParams.delete('new');
          history.replaceState(history.state, '', url);
        } catch {
          // a page that cannot change its own address (a sandboxed frame): the game starts over as asked and the address stays as it was
        }
      } else {
        found = await progress.inspect(); // what is there, looked at before `load` repairs it: the player is told if it was not whole
        await progress.load();
      }
    }
    // The rest of the world (the rooms past the Sanctum and what lives in them) comes after the first frame — but a game that BEGINS there (a saved one that rests in a shrine of the Mire, a playground asked for by the URL) cannot wait for it, and a page
    // under test (`?hooks=1`) has it from the start, so that no scene depends on the luck of a download.
    const beyond = (room: string | undefined): boolean => room !== undefined && !inCore(room);
    if (options.hooks || beyond(options.room) || (!options.room && (beyond(progress?.value?.at.room) || beyond(progress?.value?.checkpoint.room)))) await loadBeyond();
    return new Game2D(renderer, counter, options, sprites, playerSet, settings, progress, slots, found, isDurable(storage));
  }

  private constructor(
    private readonly renderer: Renderer2D,
    private readonly counter: DrawCallCounter,
    private readonly options: GameOptions,
    sprites: SpriteAssetManager<Texture>,
    playerSet: LoadedSpriteSet<Texture>,
    settings: SettingsStore,
    progress: ProgressStore | null,
    slots: SaveSlots | null,
    found: Inspection<ProgressData> | null,
    durable: boolean,
  ) {
    this.settings = settings;
    this.governor = options.adaptive ? new QualityGovernor() : null;
    this.arrival = new ArrivalGate({ maxWaitMs: options.arrivalWait ?? ARRIVAL.maxWaitMs, warmFrames: ARRIVAL.warmFrames });
    this.bindings = applyKeyMap(DEFAULT_BINDINGS, settings.value.keys);
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
      bosses: BOSSES,
      upgrades: UPGRADES,
      startRoom: saved?.startRoom ?? startRoom,
      ...(saved ? { startEntry: saved.startEntry, checkpoint: saved.checkpoint, flags: saved.flags, restore: saved.restore } : options.room ? {} : { startEntry: START.entry }),
      unlocked: saved ? [...saved.unlocked, ...options.unlock] : options.room ? options.unlock : [...START.unlocked, ...options.unlock],
    });
    // what the hero does is counted from the events the simulation raises; the time is the session's own clock on top of what the save already had
    this.stats = new PlayStats(saved?.stats);
    this.lifecycle.add(this.stats.attach(this.session.bus, this.session.room.id, { zoneOf: (id) => ROOMS[id]?.regionId ?? '', clock: () => this.session.now }));
    // what the hero learns is told, in the words of the device in use (the abilities they began with were given before anyone listened)
    this.lifecycle.add(this.session.bus.on('ability:unlocked', (e) => this.overlays?.ability.show(e.id, this.input.device, this.bindings)));
    this.saves = slots
      ? new GameSaves({ slots, settings, slot: settings.value.slot, stats: this.stats, durable, platform: browserPlatform(), notify: (n) => this.showNotice(n.kind, n.slot), warn: (message) => log.scope('save').warn(message) })
      : null;
    if (this.saves) {
      this.saves.attach(this.session, progress?.value?.savedAt ?? 0);
      this.lifecycle.add(() => this.saves?.dispose());
    }
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
    const saved0 = settings.value.touch;
    this.touchControls = new TouchControls(ui, this.touchSource, this.translator, {
      scale: saved0.scale,
      opacity: saved0.opacity,
      buttons: saved0.buttons,
      hudScale: settings.value.accessibility.hudScale,
    });
    this.lifecycle.add(() => this.touchControls.dispose());

    // the boss's bar (S29): it appears when the guardian wakes, follows its health, burns in the second phase, empties when it falls, and is gone
    // with the room (a defeat, a reload, a transition)
    this.lifecycle.add(() => this.bossBar?.dispose());
    const bus = this.session.bus;
    const on: typeof bus.on = (type, handler) => {
      const off = bus.on(type, handler);
      this.lifecycle.add(off);
      return off;
    };
    on('boss:started', (e) => {
      this.bossId = e.id;
      this.bossBarModel.start(e.nameKey, e.maxHealth > 0 ? e.health / e.maxHealth : 1);
      this.shake(0.3);
    });
    on('health:changed', (e) => {
      if (e.id === this.bossId) this.bossBarModel.hit(e.max > 0 ? e.current / e.max : 0);
    });
    on('boss:phase', () => {
      this.bossBarModel.phase();
      this.shake(0.4);
    });
    on('boss:strike', () => this.shake(0.1));
    on('boss:defeated', () => {
      this.bossBarModel.end();
      this.shake(0.6);
    });
    on('room:loaded', () => {
      this.bossId = null;
      this.bossBarModel.hide();
    });
    // the hero walked out of the world: the game is already saved as completed (the flag was set before this), the world is held and the pause menu opens on the closing of the adventure
    on('adventure:ended', () => this.openMenu('ending'));
    // a refused cast (not enough magic): the bar shakes; a refused drink (no bottle, or full life): the bottles do
    this.lifecycle.add(this.session.bus.on('skill:denied', () => this.hudModel.magicDenied()));
    this.lifecycle.add(this.session.bus.on('bottle:denied', () => this.hudModel.bottlesDenied()));
    // a desktop with a mouse and a keyboard never sees the touch layer; a touch screen (or ?touch=1) does, and so does the first touch
    this.touchControls.setVisible(options.touch || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches));
    // a screen that shows the touch controls from the start IS a touch device: the prompts speak touch until another device is used
    if (this.touchControls.isVisible) this.input.noteUse('touch');
    listen(this.lifecycle, window, 'pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.touchControls.isVisible) return;
      this.touchControls.setVisible(true);
      this.layoutUi(); // the bar of a boss gives way to the buttons that have just appeared
    }, { capture: true });

    // ---- views ----
    this.roomView = new RoomView2D(renderer.layers);
    this.lifecycle.add(() => this.roomView.destroy());
    this.interactableViews = new InteractableViews(renderer.layers);
    this.lifecycle.add(() => this.interactableViews.clear());
    this.playerVisual = new PlayerVisualSwitch(new ActorSprite(playerSet), (set, o) => new ActorSprite(set, o), options.visual, { zIndex: 10 });
    renderer.layers.actors.addChild(this.playerVisual.root);
    this.lifecycle.add(() => this.playerVisual.dispose());
    const vfxAtlas = createVfxAtlas();
    this.lifecycle.add(() => vfxAtlas.destroy());
    // What is SEEN of a boss is a chunk of its own (the first room has none): the page fetches it with the effects, or at once when a boss is
    // placed before that (a game saved at the shrine of R4 starts in front of one) — and the change of zone toward a boss's room waits for it. A failed fetch is asked for again by the next boss.
    const loadBossViews = (): Promise<BossViews> => this.requestBossViews();
    // one view per live entity, driven by the spawn / despawn events (the simulation never knows views exist)
    this.entityViews = new EntityViews(renderer.layers.actors, {
      dummy: (e) => ('view' in e && 'body' in e ? new DummyView(e as unknown as DummyLike) : null),
      // an enemy is drawn as its definition says: a procedural look today (the ink creatures); a sprite set when the art exists
      enemy: (e) => {
        const view = (e as Enemy).def.view;
        const look = 'proceduralId' in view ? PROCEDURAL_LOOKS[view.proceduralId] : undefined;
        if (!look) return null;
        const actor = new ProceduralActor(look, e as Enemy, { glow: vfxAtlas.frames.glow });
        // the art of the zone may already be in memory (an enemy that is placed after the room was dressed): it takes the parts at once
        const art = this.roomArtCover?.creatures.get(look.id);
        if (art) actor.dress(art);
        return actor;
      },
      // a skill's projectile (the Spirit Bolt) is light: it is drawn in the additive layer with the effects
      projectile: (e) => new ProjectileView(e as unknown as ProjectileLike, this.vfxArt?.atlas ?? vfxAtlas),
      // what an enemy throws: a bead of violet light, or a low wave along the floor
      enemyshot: (e) => new EnemyShotView(e as unknown as EnemyShotLike, this.vfxArt?.atlas ?? vfxAtlas),
      // the sigil of a seal (S28): violet light in front of the door it holds
      seal: (e) => new SealView(e as unknown as SealLike),
      // the boss (S29): an abstract column of ink with a violet crest, and the warnings of its attacks on the floor
      // (its code is a chunk of its own: a boss that wakes before it has arrived is drawn the moment it does)
      guardian: (e) => {
        const make = (m: BossViews) => (): EntityView => {
          const look = this.vfxArt?.atlas ?? vfxAtlas;
          const def = (e as Guardian | Boss).def;
          // the guardians of the engine (docs/PROMPT21-LOG.md) are drawn from the look their definition names; the Warden has its column
          const procedural = 'phases' in def ? PROCEDURAL_LOOKS[def.view.lookId] : undefined;
          if (procedural) return new m.BossView(e as unknown as BossLike, procedural, { glow: vfxAtlas.frames.glow, marks: look });
          const view = new m.GuardianView(e as unknown as GuardianLike, { glow: vfxAtlas.frames.glow, marks: look });
          // the art of the zone may already be in memory (a boss that wakes after the room was dressed): it takes the parts at once
          const art = this.roomArtCover?.guardians.get(def.view.lookId);
          if (art) view.dress(art);
          return view;
        };
        return this.bossViews ? make(this.bossViews)() : new LateView(loadBossViews().then(make));
      },
    }, renderer.layers.fxWorld);
    this.entityViews.attach(this.session.bus, this.session.entities); // the first room's enemies already exist
    this.lifecycle.add(() => this.entityViews.destroy());
    // impact → camera shake (real time: the camera keeps moving through the hit-stop)
    this.lifecycle.add(
      this.session.bus.on('combat:hit', (e) => {
        this.shake(e.shake);
        this.shakes.count++;
        this.shakes.last = e.shake;
      }),
    );
    // a blow turned away by a seal jolts the view a little (it is not a hit: nothing froze, nothing was hurt)
    this.lifecycle.add(this.session.bus.on('seal:rejected', (e) => this.shake(e.shake)));
    this.lifecycle.add(this.session.bus.on('enemy:blocked', (e) => this.shake(e.shake)));
    // the Ground Slam striking the ground shakes the view whether or not it hit anything
    this.lifecycle.add(this.session.bus.on('player:slammed', (e) => this.shake(e.shake)));
    // the loading indicator: it exists only for a change of zone whose art is taking its time

    // a room was built by the simulation: its view is made at the next frame — and, under the black of a change of zone, only once its art is in
    on('room:loaded', (e) => this.arrive(e.roomId));
    on('transition:cancelled', () => this.letGo());
    // The hero touched a way on to a room that has not arrived yet (the rest of the world is a chunk of its own, on its way since the first frame): the exit is armed again once the chunk is in, and the hero who still stands in its zone takes it
    on('exit:reached', (e) => {
      if (!e.to || ROOMS[e.to.room]) return;
      const wait = (triesLeft: number): void =>
        void loadBeyond().then(
          () => this.session.rearmExit(e.exitId),
          () => {
            if (triesLeft > 0 && !this.closed) window.setTimeout(() => wait(triesLeft - 1), 2000);
          },
        );
      wait(8);
    });
    // a door dissolves when the flag that opens it is set (the simulation already switched its collider off)
    this.lifecycle.add(this.session.bus.on('gate:changed', ({ gateId, open }) => this.roomView.setGateOpen(gateId, open)));
    // The effects (pooled, budgeted, event-driven, real time) are cosmetic and a tenth of the first download: the page fetches them once the
    // first frame is up and it has a moment, 2 s after it at the latest idle — or at once under `?hooks=1` (so a test never waits for them by luck) and behind the boot curtain (nothing is seen yet: the sooner they are in, the sooner it lifts).
    const body = this.session.player.body;
    const loadEffects = (): Promise<void> =>
      (this.effectsRequest ??= import('./effects').then(({ createEffects }) => {
        if (this.closed) return;
        // built from the profile in force NOW — and again whenever the player chooses another one (its budgets are those of the profile)
        const build = (): void => {
          if (this.effectsOff) return;
          this.effects?.dispose();
          this.effects = createEffects({
            renderer: renderer.app.renderer,
            layers: renderer.layers,
            atlas: this.vfxArt?.atlas ?? vfxAtlas,
            bus: this.session.bus,
            tier: renderer.qualityTier,
            playerPosition: () => ({ x: body.x, y: body.y }),
            projectileSkills: new Set(Object.keys(SKILLS)),
            // the hero carries light as long as their magic is high (and none once they are down)
            ambientLevel: () => (this.session.player.health.dead ? 0 : this.session.magic.fraction),
            light: options.light !== 'off',
            screen: { layer: renderer.layers.screen, rect: () => renderer.viewport, room: this.session.room.id },
          });
          this.effects.screen?.setCalm(this.settings.value.accessibility.reduceFlashes); // a rebuild (a new quality profile) keeps the player's choice
        };
        this.rebuildEffects = build;
        build();
      }));
    this.lifecycle.add(() => this.effects?.dispose());
    this.lifecycle.add(() => this.vfxArt?.dispose());
    // The sound (docs/PROMPT18-LOG.md): its code, its manifest and the files of the hero's sounds come in after the first frame as well; the first touch of the person lets the browser make it. Under `?hooks=1` the sound is
    // off unless `?audio=on` asks for it (the cues are still written down); a page with no sound files plays with none.
    const warn = (message: string): void => log.scope('audio').warn(message);
    const loadAudio = (): Promise<void> =>
      (this.audioRequest ??= import('./audio').then(async ({ createAudio }) => {
        if (this.closed) return;
        const audio = await createAudio({ session: this.session, projectileSkills: new Set(Object.keys(SKILLS)), volume: this.settings.value.volume, options, warn });
        if (this.closed) {
          audio.dispose();
          return;
        }
        this.audio = audio;
        if (this.menuOpen) audio.setPaused(true); // a menu that was opened before the sound arrived
      }).catch((err: unknown) => {
        this.audioRequest = null;
        warn(`not started: ${String(err)}`);
      }));
    this.lifecycle.add(() => this.audio?.dispose());
    // The art that comes from files: its code is fetched with the effects, once the first frame is up, and only when there is an index to read — a page with
    // no art never downloads it, asks for no file and can fail on none. The zone follows the hero: a room's art is fetched while the fade hides the change.
    const artUrl = artIndexUrl(options.art, __TROID_ART_INDEX__, document.baseURI);
    // A player's page waits behind the curtain for the art it can fetch; a test, a lab, a paused page or a game with no art waits for nothing (and its curtain, if there is one, goes at once)
    this.veiled = wantsCurtain({ present: curtainUp(), art: artUrl !== null, hooks: options.hooks, paused: options.paused });
    if (this.veiled) {
      const giveUp = window.setTimeout(() => this.unveil('timeout'), CURTAIN_TIMEOUT_MS);
      this.lifecycle.add(() => window.clearTimeout(giveUp));
    } else liftCurtain(options.hooks ? 'hooks' : 'no-art', true);
    this.lifecycle.add(() => liftCurtain('disposed', true));
    const startArt = (): void => {
      if (!artUrl || this.artRequest) return;
      this.artRequest = import('./art')
        .then(async ({ createArt, createRoomArt, createVfxArt }) => {
          if (this.closed) return;
          const art = createArt({ indexUrl: artUrl, drawnPxPerMetre: () => renderer.viewport.ppm * renderer.viewport.resolution, dev: import.meta.env.DEV || options.hooks });
          this.art = art;
          this.roomArt = createRoomArt(renderer.layers, art);
          await art.start();
          // the packs of light boot with the game: the effects draw with what the art painted of them as soon as it is in memory (or keep the game's own when it painted nothing, or the page asks for them: `?vfx=procedural`)
          if (options.vfx !== 'procedural' && !this.closed) {
            const made = createVfxArt(art, vfxAtlas);
            if (made) {
              this.vfxArt = made;
              this.rebuildEffects?.();
            }
          }
          await art.enterZone(this.session.room.id);
          await this.attachPlayerArt(art, options.hooks || import.meta.env.DEV);
          // the room was built before the art arrived: this is the first time there is anything to dress it with
          await this.dressRoom(this.dressSerial);
          // `art`: the first room is dressed — what the player sees when the curtain lifts is the produced look; `no-art`: the art had nothing for it (it starts as the blockout)
          this.unveil(this.roomArtCover ? 'art' : 'no-art');
        })
        .catch((err: unknown) => {
          log.scope('art').debug(`the art could not start: ${String(err)}`);
          this.unveil('art-failed');
        });
    };
    this.lifecycle.add(() => {
      this.roomArt?.destroy();
      this.art?.dispose();
    });
    // the art of the room the hero is leaving toward starts coming in the moment the way out is touched, while the old room fades: the zone follows the hero
    on('transition:started', (e) => this.prepareArrival(e.to.room));
    const loadCosmetics = (): void => {
      // the moment the game asks for its cosmetic parts: what it had fetched before is the code of its first frame (the bundle bench reads this mark)
      performance.mark('troid:cosmetics');
      void loadEffects();
      void loadAudio();
      loadBossViews().catch(() => undefined);
      loadBeyond().catch(() => undefined); // (a failure is tried again by the first way that leads there)
      void this.loadOverlays();
      startArt();
    };
    // behind the curtain nothing is seen, so the art does not wait for an idle moment: the sooner it is in, the sooner the curtain lifts
    if (options.hooks || this.veiled) loadCosmetics();
    else this.lifecycle.add(afterIdle(loadCosmetics, EFFECTS_DELAY_MS));
    this.buildRoomView();
    this.setupDebug();

    this.loop = new GameLoop({
      tick: () => this.tick(),
      frame: (alpha, dt) => this.render(alpha, dt),
      failed: (error, streak) => this.frameFailed(error, streak),
    });
    this.lifecycle.add(() => this.loop.stop());
    if (options.paused) {
      this.debug.set('paused', true);
      this.loop.paused = true;
    }
    // behind the curtain the world does not begin: not one tick runs until it lifts
    if (this.veiled) this.loop.paused = true;
    // A pause takes effect NOW, not at the end of the next frame: a frame that comes late (software GL, a texture upload, a busy page) would otherwise first run, with the loop still
    // unpaused, the ticks it was owed (up to five) — in the middle of whatever a test or a developer was doing with the simulation stopped.
    this.lifecycle.add(
      this.debug.changed.on('change', ({ key, value }) => {
        if (key === 'paused') this.loop.paused = value === true || this.menuOpen || this.veiled;
      }),
    );

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
        // a page that goes to the background (a call, another app, another tab) comes back waiting at the pause menu: nothing happened to the hero while it was away, and the player is
        // given a moment to find their fingers. (Behind the boot curtain nothing has begun: there is nothing to wait for.)
        if (!this.veiled) this.openMenu();
      } else {
        this.loop.start();
      }
    });
    // The window loses the focus (another window comes in front, the address bar, a notification): nobody is looking at the hero — it waits at the menu, like a page that went to the background (which lets go of every key and finger as it opens)
    listen(this.lifecycle, window, 'blur', () => {
      if (!this.veiled) this.openMenu();
    });
    // the pad in use is pulled out (or its battery dies): the source has already let go of everything it held; the game waits instead of leaving the hero standing in a fight
    listen(this.lifecycle, window, 'gamepaddisconnected', () => {
      if (this.input.device === 'gamepad' && !this.veiled) this.openMenu();
    });
    // inside a native shell (a chunk of its own, fetched only there): the Back button of an Android phone is the pause key, and the app going to the background is the pause
    const shell = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (shell) {
      void import('./nativeApp').then(
        (m) => {
          if (!this.closed) this.lifecycle.add(m.attachNativeApp(shell, { back: () => this.toggleMenu(), background: () => !this.veiled && this.openMenu() }));
        },
        () => undefined,
      );
    }
    this.renderer.resize();
    this.layoutUi();
    // a game that was recovered from its last good copy, one that could not be read, a browser that keeps nothing: the player hears it once, as the game begins
    if (this.saves && found) this.saves.announceStart(found);
    else if (this.saves && !durable) this.saves.announceStart({ state: 'empty' });
    if (options.hooks || import.meta.env.DEV) this.exposeTestHooks();
  }

  start(): void {
    this.loop.start();
  }

  /** Fetches what is SEEN of a boss (a chunk of its own) once, and mounts its bar. A failed fetch is forgotten, so that the next boss asks again. */
  private requestBossViews(): Promise<BossViews> {
    return (this.bossViewsRequest ??= import('./bossViews').then(
      (m) => {
        if (!this.closed) {
          this.bossViews = m;
          this.bossBar = new m.BossBarView(document.getElementById('ui') ?? document.body, this.translator);
          this.layoutUi();
        }
        return m;
      },
      (err: unknown) => {
        this.bossViewsRequest = null;
        log.scope('boss').warn(`the boss views could not be loaded: ${String(err)}`);
        throw err;
      },
    ));
  }

  /** The art of the first room is in (or there will be none, or the wait ran out): the world begins and the curtain lifts. Once. */
  private unveil(reason: CurtainReason): void {
    if (!this.veiled) return;
    this.veiled = false;
    liftCurtain(reason);
  }

  /**
   * The protagonist's real art, when the library has it: the visual shows it for every state it can stand for and keeps the placeholder for the rest, and
   * `?visual=placeholder` (or the hook) goes back at any time. No art, a missing pack or a broken set leave the placeholder as it is (the library says why).
   */
  private async attachPlayerArt(art: Art, dev: boolean): Promise<void> {
    const set = await art.acquire(PLAYER_VISUAL.art.pack, PLAYER_VISUAL.art.sprite);
    if (!set) return;
    if (this.closed) {
      art.release(set.def);
      return;
    }
    this.playerVisual.attachArt(set, () => art.release(set.def));
    const lacking = lackedClips(set.def, PLAYER_VISUAL.required);
    if (dev && lacking.length > 0) log.scope('visual').info(`the protagonist's art has no clip for ${lacking.join(', ')}: the placeholder draws those states`);
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
    if (this.menuOpen || this.veiled || this.arrival.blocking) return; // a paused game does not advance, whoever asks (the game loop, a test hook); nor does one that is still behind the curtain, or held at the black of a change of zone
    this.session.tick(frame);
  }

  /**
   * A tick or a frame threw (the loop skipped it and goes on): it is written down — the first of a run and every 60th, not one line a frame. When `EFFECTS_FAILURES_LIMIT` in a row have, the effects go first (nothing in the rules
   * depends on them, and a device that cannot draw one of their parts is the likeliest reason a frame fails every time); when `FRAME_FAILURES_LIMIT` have, there is nothing left to try: the game stops and says so.
   */
  private frameFailed(error: unknown, streak: number): void {
    if (streak % 60 === 1) log.scope('app').error(`a frame failed (${streak} in a row): ${describeError(error)}`);
    if (streak === EFFECTS_FAILURES_LIMIT && this.effects) this.giveUpEffects();
    if (streak < FRAME_FAILURES_LIMIT) return;
    this.loop.stop();
    void import('./crash').then((m) => m.showCrash());
  }

  /** The game goes on without its effects, as it does until they arrive — and does not make them again, whatever profile the player picks next. */
  private giveUpEffects(): void {
    log.scope('app').warn(`the effects are off for this session: ${EFFECTS_FAILURES_LIMIT} frames in a row failed with them on`);
    this.effectsOff = true;
    this.rebuildEffects = null;
    const effects = this.effects;
    this.effects = null; // (first: a frame that comes while it is taken apart must not find it half gone)
    try {
      effects?.dispose();
    } catch (error) {
      log.scope('app').warn(`the effects could not be taken apart cleanly: ${describeError(error)}`);
    }
  }

  /** Runs exactly one tick with the current input (debug "step" and E2E tests). */
  stepOnce(): void {
    this.tick();
  }

  /** Places the DOM interface (the touch controls today) for the window and its safe area. Called on start and on every resize. */
  private layoutUi(): void {
    const { width, height, insets } = this.uiFrame();
    this.touchControls.place(width, height, insets);
    const o = this.overlays;
    o?.hud.place(width, height, insets);
    o?.prompt.place(width, height, insets, this.touchControls.gestureScale);
    o?.pause.place(width, height, insets, this.touchControls.gestureScale, this.settings.value.accessibility.hudScale);
    o?.notice.place(width, height, insets, this.touchControls.gestureScale, this.settings.value.accessibility.hudScale);
    o?.ability.place(width, height, insets, this.touchControls.gestureScale, this.settings.value.accessibility.hudScale);
    // a touch screen held upright (taller than wide): the line that asks to turn it, under the HUD
    o?.rotate.place(o.hud.bottom, this.touchControls.gestureScale);
    o?.rotate.want(this.touchControls.isVisible && this.renderer.viewport.aspect < 1);
    this.placeBossBar(width, height, insets);
  }

  /** The window the interface is laid out in: its size and its safe area. */
  private uiFrame(): { width: number; height: number; insets: Insets } {
    const ui = document.getElementById('ui') ?? document.body;
    return { width: ui.clientWidth || window.innerWidth, height: ui.clientHeight || window.innerHeight, insets: this.safeArea.read() };
  }

  /** The boss's bar goes at the bottom centre and out of the way of the touch buttons while they are on screen (S31); there is nothing to avoid on a keyboard. */
  private placeBossBar(width: number, height: number, insets: Readonly<Insets>): void {
    this.bossBar?.place(width, height, insets, this.touchControls.isVisible ? this.touchControls.current : null);
  }

  /** The HUD and the contextual touch controls follow the simulation's status (read through one snapshot; nothing else is touched). */
  private updateHud(dt: number): void {
    const st = this.session.status(this.hudStatus);
    const shown = this.hudModel.update(st, dt); // the numbers are made every frame, whether or not the view has arrived: it shows the state of the moment it does
    this.overlays?.hud.update(shown);
    const bar = this.bossBarModel.update(dt);
    this.bossBar?.update(bar);
    this.touchControls.setChip(st.bottleUseful);
    // each button exists only when the hero can do what it does, and is faint while they cannot yet: the dash while it recharges, the magic while it recharges or there is not enough of it
    this.touchControls.setDash(st.dash.unlocked, st.dash.cooldown01 === 0);
    this.touchControls.setAbility(st.card.equipped, st.card.state === 'ready');
  }

  /** The interaction icon floats over its object: the world point goes through the camera, the DOM gets screen pixels. */
  private updatePrompt(): void {
    const n = this.hudStatus.interaction;
    if (n.active) this.renderer.worldToScreen(n.x, n.y, this.promptPoint);
    this.overlays?.prompt.update({
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
    // the art of the room that was is gone with it; the new room starts as the blockout and is dressed as soon as its art is in memory
    this.roomArt?.clear();
    this.roomArtCover = null;
    this.roomView.build(room, (gateId) => this.session.gateOpen(gateId));
    this.interactableViews.build(room.interactables ?? [], (id) => this.session.interaction.isAvailable(id), (id) => this.isCheckpoint(id));
    const serial = ++this.dressSerial;
    // A room whose art is all in memory — which is what a change of zone waits for — is dressed in this very call: the first frame it is drawn in is the whole picture, never the blockout on its way
    // to it. Otherwise (a reload by hand, a start-up, art that failed or did not come in time) it is the blockout until the art arrives, and dressed then.
    const cover = this.roomArt?.buildNow(room);
    if (cover) this.applyCover(cover);
    else if (cover === undefined) void this.dressRoom(serial);
    this.tools?.setRoom();
    this.camera.setRoom(room);
  }

  /**
   * The art of the room the hero is in, over the blockout: what the art covers, the blockout lets go of. A room whose art is not (yet) in memory stays as the blockout and
   * is dressed the moment it is; a build overtaken by a newer room does nothing.
   */
  private async dressRoom(serial: number): Promise<void> {
    const art = this.art;
    const view = this.roomArt;
    if (!art || !view || this.closed) return;
    const room = this.session.room;
    await art.enterZone(room.id);
    if (this.closed || serial !== this.dressSerial) return;
    const cover = await view.build(room);
    // the look of the room may have been built again while the art was arriving (the same room reloaded, or another one): this cover is not for the blockout that is there now
    if (!cover || this.closed || serial !== this.dressSerial) return;
    this.applyCover(cover);
  }

  /** The room's view is dressed with what the art covers: the blockout lets go of that, and the views of the entities that stand in the room take their parts. */
  private applyCover(cover: RoomArtCoverage): void {
    const view = this.roomArt;
    if (!view) return;
    this.roomArtCover = cover;
    this.roomView.cover(cover, (id) => view.door(id));
    this.interactableViews.cover(cover.interactables);
    // the seals are entities: each hangs the art's sigil on its own view (or keeps the blockout's shapes when the art has none)
    // (the art knows a seal by the id its room's data gives it, which is not the id the simulation gives its entity)
    this.entityViews.each('seal', (entity, view) => (view as unknown as SealView).dress(cover.seals.get((entity as Seal).def.id) ?? null));
    // an ordinary enemy is an entity too: its own view takes the parts of the art of its look (or keeps its shapes when the art has none for it)
    this.entityViews.each('enemy', (entity, view) => {
      const def = (entity as Enemy).def.view;
      if ('proceduralId' in def && view instanceof ProceduralActor) view.dress(cover.creatures.get(def.proceduralId) ?? null);
    });
    // the boss is an entity too: its own view takes the parts of the art (or keeps its shapes when the art has none for it). Its code may still be on the way (a `LateView`): it is dressed when it arrives
    this.entityViews.each('guardian', (entity, view) => {
      const inner = view instanceof LateView ? view.view : view;
      (inner as unknown as { dress(art: GuardianArt | null): void } | null)?.dress(cover.guardians.get((entity as Guardian | Boss).def.view.lookId) ?? null);
    });
    // a developer is told what the art got wrong (a strip too short for the camera); a player's console stays quiet
    if (import.meta.env.DEV) for (const n of cover.notes) log.scope('art').warn(n);
  }

  // -------------------------------------------------------------------------------------------------------- the arrival

  /**
   * A room was built by the simulation. Its art is asked for (the zone follows the hero, whatever brought them). Under a BLACK — a change of zone, a defeat that brings the hero back — the world is
   * held from here until the room can be shown whole; any other way in (a room loaded by hand) is a plain cut with nothing to hide it, and the room is dressed when its art comes, as it always was.
   */
  private arrive(roomId: string): void {
    this.roomDirty = true;
    if (!this.art) return;
    this.prepareArrival(roomId);
    if (!(this.session.transition.active || this.session.deathSnapshot.phase !== 'none')) return;
    this.arrival.close(roomId, performance.now());
    this.indicatorSeen = false;
    this.loop.paused = true; // (the ticks of this frame that are still to come are refused by `tick` too)
  }

  /**
   * Brings in what the room `roomId` needs to be SHOWN whole: its zone's packs (the ones of the zone left behind go when these are in), the scenes its packs have for it, and — if it has a boss — the code
   * that draws one. The state of it is the arrival's: it reports how it ended, and a failure is a way of ending, never a reason to wait.
   */
  private prepareArrival(roomId: string): void {
    const art = this.art;
    if (!art) return;
    const { serial, fresh } = this.arrival.prepare(roomId);
    if (!fresh) return;
    const needsBoss = this.bossViews === null && (ROOMS[roomId]?.bosses?.length ?? 0) > 0;
    void (async () => {
      let ok = true;
      try {
        await art.enterZone(roomId);
        await Promise.all([art.readScenes(roomId), needsBoss ? this.requestBossViews().then(() => undefined, () => undefined) : undefined]);
      } catch (err) {
        ok = false;
        log.scope('art').debug(`the art of "${roomId}" could not be prepared: ${String(err)}`);
      }
      if (!this.closed) this.arrival.settle(serial, ok);
    })();
  }

  /** The room's view may be made now: always, unless the world is held for a room whose art is still on its way (and the wait has not run out). */
  private arrivalAdmits(): boolean {
    if (!this.arrival.blocking) return true;
    return this.arrival.ready(performance.now()) !== null;
  }

  /** The transition was called off (the hero went down): nothing is waited for any more. */
  private letGo(): void {
    if (this.arrival.cancel()) this.releaseWaiters();
  }

  private releaseWaiters(): void {
    for (const resume of this.arrivalWaiters.splice(0)) resume();
  }

  /** Resolves when the world is not held at a change of zone (at once when it is not). The test hooks wait on it. */
  whenArrived(): Promise<void> {
    return this.arrival.blocking ? new Promise<void>((resolve) => this.arrivalWaiters.push(resolve)) : Promise.resolve();
  }

  /**
   * The hero walks toward a way out: the art of what lies beyond starts coming in NOW, quietly, so that the change of zone finds it in memory and shows no wait at all; if they turn away it is given back.
   * A connection the player asked to spare (Data Saver) or a device with little memory does not hold art ahead of time: the change of zone waits for it at the black instead.
   */
  private watchWayOut(): void {
    const art = this.art;
    if (!art || this.arrival.blocking || this.session.transition.active || this.veiled) return;
    const p = this.session.player;
    const next = roomAhead(this.session.room, p.body.x, p.body.vx, (flag) => this.session.flags.has(flag), (room) => room in ROOMS, this.aheadFor);
    if (next === this.aheadFor) return;
    this.aheadFor = next;
    if (next === null) {
      art.releaseAhead();
      return;
    }
    // a connection the player asked to spare, or a device that says it has little memory (a couple of GB or less): the art of the next room is not held ahead of time there
    const device = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (device.connection?.saveData === true || (device.deviceMemory !== undefined && device.deviceMemory <= 2)) return;
    void art.prefetch(next, PREFETCH_CEILING_BYTES).catch(() => undefined);
  }

  private render(alpha: number, realDt: number): void {
    this.fps.push(realDt);
    this.judgeQuality(realDt);
    // The view of a new room is made when the art it is dressed with is in — whole, in this very step. Under the black of a change of zone it waits for that (the world is held meanwhile);
    // its first frames are then drawn out of sight, so that what the GPU takes on the first draw is taken before anyone looks.
    if (this.roomDirty && this.arrivalAdmits()) {
      this.roomDirty = false;
      this.buildRoomView();
      this.camera.snap();
      this.effects?.system.clear();
      this.effects?.lighting?.field.clear();
      this.arrival.built();
    }
    this.watchWayOut();
    const p = this.session.player;
    // While paused (debug / E2E) show the exact simulated state, not an interpolation of stale ticks.
    const a = this.debug.get('paused') ? 1 : alpha;
    const v = p.view;
    const x = v.prevX + (v.x - v.prevX) * a;
    const y = v.prevY + (v.y - v.prevY) * a;
    // Animation time follows the simulation clock: frozen while paused or in a hit-stop, slowed by timeScale (stable E2E
    // and screenshots). Phase-driven attack frames freeze by themselves; this freezes the time-driven ones.
    const animDt = this.debug.get('paused') || this.session.frozen || this.menuOpen ? 0 : realDt * this.debug.get('timeScale');
    this.playerVisual.sync(v, a, animDt);
    this.entityViews.sync(a, animDt);
    // VFX run in real time: only the pause (the debug one, the menu) and the debug time scale affect them, never a hit-stop
    const vfxDt = this.debug.get('paused') || this.menuOpen ? 0 : realDt * this.debug.get('timeScale');
    this.effects?.director.update(vfxDt);
    this.effects?.system.update(vfxDt);
    this.updateLights(vfxDt, a, x, y);
    this.effects?.screen?.update(vfxDt);
    // the scenery lives in the world's time: while the menu is up it stands still, like everything else behind it
    const worldDt = this.menuOpen ? 0 : realDt;
    this.roomView.update(worldDt);
    // the scenery that answers the world reads its flags (never writes one)
    this.roomArt?.update(worldDt, (flag) => this.session.flags.has(flag));
    this.interactableViews.update(worldDt, (id) => this.session.interaction.isAvailable(id), (id) => this.isCheckpoint(id));
    this.overlays?.death.update(this.session.deathSnapshot);
    this.overlays?.transition.update(this.session.transitionSnapshot);
    this.updateArrivalIndicator(realDt);
    this.overlays?.notice.update(realDt);
    this.overlays?.ability.update(realDt, this.menuOpen);
    this.updateHud(worldDt);
    // the sound keeps GAME time (the simulation's own clock) and follows the hero
    this.audio?.update(this.session.now / TICK_RATE, p);

    // which limits hold now: the room's, or those of the camera zone the hero's feet are in (an arena; it eases, it never jumps)
    this.camera.setView(resolveCameraView(this.session.room, this.session.flags, p.body.x, p.body.y, this.cameraView));
    // The camera follows the INTERPOLATED position — exactly what is drawn — so camera and player never jitter apart.
    const target: CameraTarget = { x, y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
    this.camera.update(worldDt, target);
    this.updatePrompt(); // after the camera: the icon follows the object with THIS frame's transform

    this.loop.timeScale = this.debug.get('timeScale');
    this.loop.paused = this.debug.get('paused') || this.menuOpen || this.veiled || this.arrival.blocking;
    // the game is paused, so no tick samples the input: the menu watches for the pause key / button itself
    if (this.menuOpen) {
      const f = this.input.sample();
      if (f.pausePressed || this.menu?.pad(f, performance.now()) === 'back') this.menuBack();
    } else if (this.arrival.blocking || this.veiled) {
      // …and so does a world that is held (at the black of a change of zone, behind the boot curtain): no tick runs, so nobody would see the pause key — only that press is taken, the rest wait for the ticks
      const pressed = this.input.takePause();
      // behind the curtain it is taken and let go: a press made while the page was loading must not open the menu a moment after
      if (pressed && !this.veiled) this.openMenu();
    }
    this.session.godMode = this.debug.get('godMode');
    this.tools?.frame(performance.now());

    this.counter.beginFrame();
    this.renderer.render();
    this.counter.endFrame();
    this.finishArrivalFrame();
  }

  /**
   * `Auto` measures: when the frames of several seconds in a row are mostly slow, the game steps down to the low profile — once, for this session. It is the game's doing, not the player's choice: the setting stays `Auto`
   * and nothing is saved, so the next visit starts balanced again. It judges only frames that say something about the device (not with the menu up, the page hidden, or the world held at black while a room's art arrives).
   */
  private judgeQuality(realDt: number): void {
    const governor = this.governor;
    if (!governor || this.settings.value.quality !== 'auto' || this.renderer.qualityTier === 'low') return;
    const counts = !this.menuOpen && !this.veiled && !this.arrival.blocking && !document.hidden;
    if (!governor.frame(realDt * 1000, counts)) return;
    const { frames, slow, ms } = governor.summary;
    log.scope('quality').info(`Auto stepped down to Low: ${slow} of the last ${frames} frames (${ms} ms) took longer than ${DEFAULT_GOVERNOR.slowMs} ms`);
    this.renderer.setTier('low');
    this.rebuildEffects?.();
    this.layoutUi();
  }

  /** The loading indicator follows the wait: nothing until it has lasted a moment, then the real share of what is arriving (or a light that waits, when that cannot be measured). */
  private updateArrivalIndicator(realDt: number): void {
    const line = this.overlays?.arrival;
    if (!line) return; // the first seconds of a cold start: the line is not fetched yet, and nothing can be waiting for it
    const held = this.arrival.snapshot(performance.now());
    const waiting = held.blocking && held.stage === 'loading';
    line.update(realDt, { waiting, waited: held.waited, progress: waiting ? (this.art?.progress()?.fraction ?? null) : null });
    if (held.blocking && line.current.opacity > 0.05) this.indicatorSeen = true;
  }

  /** A frame was drawn: when it is the last of those the new room needed out of sight, the world goes on (and how it went is written down). */
  private finishArrivalFrame(): void {
    if (!this.arrival.blocking) return;
    const before = this.arrival.snapshot(performance.now());
    if (!this.arrival.rendered()) return;
    this.arrivals.push({ room: before.room ?? '', waited: Math.round(before.waited), outcome: before.outcome, indicator: this.indicatorSeen });
    if (this.arrivals.length > 24) this.arrivals.shift();
    this.loop.paused = this.debug.get('paused') || this.menuOpen || this.veiled;
    this.releaseWaiters();
  }

  /** The top of the highest floor under a point, a few metres down (`null`: none — a pit). The pool of light under the hero lies there, where they will land. */
  private floorBelow(x: number, y: number): number | null {
    const r = this.floorProbe;
    r.x0 = x - 0.25;
    r.x1 = x + 0.25;
    r.y0 = y - 6;
    r.y1 = y + 0.05;
    let best: number | null = null;
    for (const c of this.session.collision.query(r)) {
      const top = c.rect.y1;
      if (top <= y + 0.05 && (best === null || top > best)) best = top;
    }
    return best;
  }

  /** The light the energy casts on the world: the hero's (their magic makes it brighter), the bolts', the enemies' and the guardian's. It reads what the views read — the interpolated state — and draws behind the actors. */
  private updateLights(dt: number, alpha: number, x: number, y: number): void {
    const lighting = this.effects?.lighting;
    if (!lighting) return;
    const hero = this.lightHero;
    hero.x = x;
    hero.y = y;
    hero.dead = this.session.player.health.dead;
    hero.magic = this.session.magic.fraction;
    hero.ground = this.session.player.body.grounded ? y : this.floorBelow(x, y);
    const frame = this.lightFrame;
    frame.alpha = alpha;
    frame.bodies = this.session.entities;
    lighting.update(dt, frame);
  }

  /**
   * Fetches the loading line and the notice about the saved game (a chunk of their own, with the other cosmetic parts): placed at once, and a notice that was raised before they arrived is shown now.
   * A failed fetch is forgotten so that the next ask tries again; the game goes on without them.
   */
  private loadOverlays(): Promise<void> {
    this.overlaysRequest ??= import('./overlays').then(
      ({ createOverlays, disposeOverlays }) => {
        if (this.closed) return;
        const made = createOverlays(document.getElementById('ui') ?? document.body, this.translator, {
          // the HUD sits in the top-left; a finger on one of its bottle icons goes through the same single-owner touch source
          hudSink: {
            down: (id, slot, x, y, t) => this.touchSource.down(id, `bottle:${slot}`, x, y, t),
            up: (id) => this.touchSource.up(id),
          },
          hud: { size: this.settings.value.accessibility.hudScale, calm: this.settings.value.accessibility.reduceFlashes },
          // the interaction icon exists only over the object in reach, and a finger on it is the same single-owner touch source
          promptSink: {
            down: (id, x, y, t) => this.touchSource.down(id, 'interact', x, y, t),
            up: (id) => this.touchSource.up(id),
          },
          // the entry to the pause menu (it opens on the map): one small icon in the top right corner
          onPause: () => this.toggleMenu(),
        });
        this.lifecycle.add(() => disposeOverlays(made));
        this.overlays = made;
        made.pause.setHidden(this.menuOpen);
        made.hud.setPaused(this.menuOpen); // (the menu may have been opened before the HUD arrived)
        this.layoutUi();
        if (this.pendingNotice) {
          made.notice.show(this.pendingNotice.kind, this.pendingNotice.slot);
          this.pendingNotice = null;
        }
      },
      (err: unknown) => {
        this.overlaysRequest = null;
        log.scope('ui').warn(`the overlays could not be loaded: ${String(err)}`);
      },
    );
    return this.overlaysRequest;
  }

  /** What became of the saved game, said discreetly (or kept until the notice's chunk is in). */
  private showNotice(kind: SaveNoticeKind, slot: number): void {
    if (this.overlays) this.overlays.notice.show(kind, slot);
    else {
      this.pendingNotice = { kind, slot };
      void this.loadOverlays(); // a notice may be the first thing the player needs: do not wait for an idle moment
    }
  }

  // ----------------------------------------------------------------------------------------------------- settings

  /** Escape / P / Start / the pause button: opens the menu (and pauses the game), or goes back one step in it. */
  private toggleMenu(): void {
    if (this.menuOpen) this.menuBack();
    else this.openMenu();
  }

  /** The pause key inside the menu: out of a screen and back to its list; from the list, out of the menu and into the game. */
  private menuBack(): void {
    if (this.menu?.back()) return;
    this.closeMenu();
  }

  private openMenu(screen: PauseScreen = 'main'): void {
    if (this.menuOpen) return;
    this.menuOpen = true;
    this.menuScreen = screen;
    this.loop.paused = true;
    // nothing may stay pressed while the game waits: no finger, no key, no button keeps acting behind the menu
    this.input.releaseAll();
    this.touchControls.releaseAll();
    this.overlays?.pause.setHidden(true);
    this.overlays?.hud.setPaused(true);
    this.audio?.menu(true);
    this.loadMenu().then(
      () => {
        if (this.menuOpen) this.menu?.open(this.menuScreen);
      },
      // the menu could not be fetched (the page is offline, the file is gone): the game goes on rather than wait for a menu that is not coming; the next ask tries again
      () => this.closeMenu(),
    );
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menu?.close();
    this.overlays?.pause.setHidden(false);
    this.overlays?.hud.setPaused(false);
    this.audio?.menu(false);
    this.input.releaseAll();
  }

  /** Fetches the pause menu the first time it is asked for (a player's first load never carries it: its screens and its wiring are a chunk of their own). A failed fetch is forgotten, so that the next ask tries again (a browser may remember a failed module fetch until the page is reloaded: the game goes on without the menu rather than wait for it). */
  private loadMenu(): Promise<void> {
    this.menuRequest ??= import('./menu').then(
      ({ createPauseMenu }) => {
        if (this.closed) return;
        this.menu = createPauseMenu({
          parent: document.getElementById('ui') ?? document.body,
          translator: this.translator,
          settings: this.settings,
          session: this.session,
          stats: this.stats,
          saves: this.saves,
          bindings: () => this.bindings,
          touchAvailable: () => this.touchControls.isVisible,
          touchWindow: () => ({ ...this.uiFrame(), hudScale: this.settings.value.accessibility.hudScale }),
          touchPreview: () => (this.touchControls.isVisible ? { ...this.touchControls.size, layout: this.touchControls.current } : null),
          suspendTouch: (suspended) => this.touchControls.setSuspended(suspended),
          keyboardInUse: () => this.input.device === 'keyboard',
          change: {
            language: (language) => this.setLanguage(language),
            volume: (category, level) => this.setVolume(category, level),
            quality: (quality) => this.setQuality(quality),
            keys: (keys) => this.setKeys(keys),
            touch: (patch) => this.setTouch(patch),
            accessibility: (patch) => this.setAccessibility(patch),
          },
          resume: () => this.closeMenu(),
          sound: (kind) => this.audio?.ui(kind),
        });
      },
      (err: unknown) => {
        this.menuRequest = null;
        log.scope('ui').warn(`the pause menu could not be loaded: ${String(err)}`);
        throw err;
      },
    );
    return this.menuRequest;
  }

  /** The player chose a language: it is applied at once (the interface re-reads every text) and saved — a `?lang=` override is not. */
  private setLanguage(language: string): void {
    this.translator.setLocale(language);
    void this.settings.update({ language: this.translator.locale });
  }

  /** The player moved a slider or placed the buttons: the touch controls follow at once and the choice is saved. */
  private setTouch(patch: Partial<TouchSettings>): void {
    void this.settings.update({ touch: patch });
    const next = this.settings.value.touch; // repaired: what is applied is what is saved
    this.touchControls.setOpacity(next.opacity);
    this.touchControls.setScale(next.scale);
    this.touchControls.setButtons(next.buttons);
    this.layoutUi();
  }

  /**
   * An accessibility choice (docs/PROMPT14-LOG.md): applied at once and saved. Each one changes something the game really does — the HUD takes its size and its calm, the touch buttons make way for the HUD's
   * new size, the pulses at the edge of the screen are softened, and a camera that must not shake stops shaking, now and at the next blow.
   */
  private setAccessibility(patch: Partial<AccessibilitySettings>): void {
    void this.settings.update({ accessibility: patch });
    this.applyAccessibility(this.settings.value.accessibility); // repaired: what is applied is what is saved
  }

  private applyAccessibility(a: Readonly<AccessibilitySettings>): void {
    const hud = this.overlays?.hud;
    hud?.setCalm(a.reduceFlashes);
    hud?.setSize(a.hudScale);
    this.effects?.screen?.setCalm(a.reduceFlashes);
    if (a.reduceShake) this.camera.clearTrauma();
    this.touchControls.setHudScale(a.hudScale);
    this.layoutUi();
  }

  /** A blow, a guardian's step: the view is jolted by this much, unless the player asked for a camera that does not shake. */
  private shake(amount: number): void {
    if (!this.settings.value.accessibility.reduceShake) this.camera.addTrauma(amount);
  }

  /** A volume slider (the general one, the music's, the effects' or the ambience's): heard at once — the gain of its bus follows — and saved. */
  private setVolume(category: AudioCategory, level: number): void {
    void this.settings.update({ volume: { [category]: level } });
    this.audio?.setLevel(category, this.settings.value.volume[category]); // repaired: what is heard is what is saved (a sound that has not arrived yet starts from the settings)
  }

  /**
   * The quality profile (Auto / Low / High): the renderer takes the resolution ceiling of the profile and the effects are built again with its
   * budgets, at once. `auto` is the balanced profile, which steps down to the low one by itself if the game cannot keep up (`judgeQuality`).
   */
  private setQuality(quality: QualitySetting): void {
    void this.settings.update({ quality });
    this.renderer.setQuality(this.settings.value.quality);
    this.governor?.reset(); // (Auto chosen again measures afresh; another profile is not the governor's to judge)
    this.rebuildEffects?.();
    this.layoutUi();
  }

  /** The keys the player gave the main actions: in force at once (nothing stays pressed under the old ones) and saved. */
  private setKeys(keys: KeyMap): void {
    void this.settings.update({ keys });
    this.bindings = applyKeyMap(DEFAULT_BINDINGS, this.settings.value.keys);
    this.input.releaseAll();
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
            dummy: (x, y, facing) => void this.spawnDummy(x, y, { facing }),
            slime: (x, y, facing) => void this.spawnSlime(x, y, facing),
          },
        },
        document.getElementById('ui') ?? document.body,
      );
    });
    return this.toolsRequest;
  }

  /**
   * Tests read what is PRESENTED (sprite frame, overlay) right after stepping the simulation: bring those up to date
   * without waiting for the next animation frame. A room rebuilt by the simulation is applied here too. (The test hooks' door; the game itself does the same in `render`.)
   */
  refreshPresented(): void {
    if (this.roomDirty && this.arrivalAdmits()) {
      this.roomDirty = false;
      this.buildRoomView();
      this.camera.snap();
      this.effects?.system.clear();
      this.arrival.built();
    }
    this.playerVisual.sync(this.session.player.view, 1, 0);
    this.overlays?.death.update(this.session.deathSnapshot);
    this.overlays?.transition.update(this.session.transitionSnapshot);
    this.updateHud(0);
    this.updatePrompt();
  }

  /**
   * `window.__troid`: lets Playwright drive and inspect the game deterministically (dev builds / `?hooks=1`). It lives in a chunk of its own
   * (`testHooks.ts`) that is fetched when it is asked for — a player never downloads it — and it reads the game by name (`game['renderer']`: TypeScript lets a bracket reach a private member with its type), so
   * that none of the forty-odd closures it is made of weighs on the cold start.
   */
  private exposeTestHooks(): void {
    void import('./testHooks').then(({ createTestHooks }) => {
      if (this.closed) return;
      (window as unknown as { __troid?: unknown }).__troid = createTestHooks(this, { effectiveKeys, lackedClips, requiredClips: PLAYER_VISUAL.required });
    });
    this.lifecycle.add(() => {
      delete (window as unknown as { __troid?: unknown }).__troid;
    });
  }

  /** A training dummy that joins the world at the end of the next tick (the developer tools and the test hooks place them). Answers its id. */
  private spawnDummy(x: number, y: number, o: { facing?: 1 | -1; health?: number } = {}): string {
    return this.session.spawn(new TrainingDummy(this.session.ids.next('dummy'), { x, y, ...o })).id;
  }

  /** An Ink Slime that joins the world at the end of the next tick. Answers its id. */
  private spawnSlime(x: number, y: number, facing: 1 | -1): string {
    return this.session.spawn(new Enemy(this.session.ids.next('ink_slime'), ENEMIES.ink_slime as EnemyDefinition, { x, y, facing })).id;
  }

  /** Lets the camera run `seconds` of its own time at 60 Hz right now (the test hooks: a slow frame need not be waited for). */
  settleCamera(seconds: number): void {
    const p = this.session.player;
    const v = p.view;
    const target: CameraTarget = { x: v.x, y: v.y, vx: p.body.vx, vy: p.body.vy, facing: p.facing, grounded: p.body.grounded };
    for (let i = 0, n = Math.round(seconds * 60); i < n; i++) {
      this.camera.setView(resolveCameraView(this.session.room, this.session.flags, p.body.x, p.body.y, this.cameraView));
      this.camera.update(1 / 60, target);
    }
  }
}
