import type { CameraRig } from '@/camera/CameraRig';
import type { Rect } from '@/core/math';
import type { DebugState } from '@/debug/DebugState';
import type { DrawCallCounter } from '@/debug/DrawCallCounter';
import type { FpsMeter } from '@/debug/FpsMeter';
import type { Enemy } from '@/enemies/Enemy';
import type { Guardian } from '@/enemies/Guardian';
import type { TrainingDummy } from '@/enemies/TrainingDummy';
import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import type { Projectile } from '@/gameplay/Projectile';
import type { Translator } from '@/i18n';
import { gainOf } from '@/audio/volume';
import type { AudioSystem } from './audio';
import type { effectiveKeys } from '@/input/remap';
import type { lackedClips } from '@/presentation/visualSource';
import type { InputManager } from '@/input/InputManager';
import { VirtualPad } from '@/input/sources/VirtualPad';
import type { TouchSource } from '@/input/sources/TouchSource';
import type { VisualMode } from '@/presentation/visualSource';
import type { AnchorId } from '@/presentation/vocabulary';
import type { PlayerVisualSwitch } from '@/render/PlayerVisual';
import type { CameraAdapter2D } from '@/render/CameraAdapter2D';
import type { EntityViews } from '@/render/EntityViews';
import type { Renderer2D } from '@/render/Renderer2D';
import type { RoomView2D } from '@/render/RoomView2D';
import type { SettingsStore } from '@/save/SettingsStore';
import type { HudModel } from '@/ui/hud/HudModel';
import type { HudView } from '@/ui/hud/HudView';
import type { TouchControls } from '@/ui/touch/TouchControls';
import type { Art } from './art';
import type { Game2D } from './Game2D';
import type { GameSaves } from './gameSaves';
import type { Effects } from './effects';

/**
 * `window.__troid`: what lets Playwright drive and inspect the game deterministically (dev builds and `?hooks=1`), and what no player ever needs.
 * It is a chunk of its own, fetched only when the hooks are asked for — so none of it travels in the cold start of a real player (docs/PROMPT6-LOG.md
 * S30, the bundle budget). Since Prompt 20 the game no longer builds the `HookHost` itself (forty-odd closures in the first download): `hostOf` below reads the game by name, here, and the game keeps only
 * the few methods the hooks need to call (`stepOnce`, `refreshPresented`, `whenArrived`, `settleCamera`). A module the game uses at run time and this chunk imports too is cut out into a chunk of its own,
 * so the few that are imported here are the ones the cold start did not carry as chunks of their own already (see the bundle bench).
 */
/** What the page says about the arrival at a room (see `HookHost.arrival`). */
export interface ArrivalState {
  blocking: boolean;
  room: string | null;
  stage: string;
  outcome: string | null;
  waited: number;
  /** Opacity of the loading indicator now (0: not on screen), and whether it has been on screen during the wait in progress. */
  indicator: number;
  indicatorShown: boolean;
  history: Array<{ room: string; waited: number; outcome: string | null; indicator: boolean }>;
  /** The room whose art is being brought in early because the hero walks toward the way into it. */
  aheadFor: string | null;
  /** What is arriving right now, measured on the transfers (`null`: nothing). */
  progress: { files: number; active: number; loaded: number; total: number; fraction: number | null } | null;
}

export interface HookHost {
  /** The game itself (a test may call what the page exposes of it, e.g. `isCheckpoint`). */
  readonly game: unknown;
  readonly session: GameSession;
  readonly input: InputManager;
  readonly debug: DebugState;
  readonly renderer: Renderer2D;
  readonly camera: CameraAdapter2D;
  readonly playerVisual: PlayerVisualSwitch;
  readonly roomView: RoomView2D;
  /** What the art covers of the room now (`null`: the blockout draws all of it). */
  roomArt(): { solids: ReadonlySet<string>; gates: ReadonlySet<string>; exits: ReadonlySet<string>; hazards: ReadonlySet<string>; interactables: ReadonlyMap<string, unknown>; seals: ReadonlyMap<string, unknown>; guardians: ReadonlyMap<string, unknown>; creatures: ReadonlyMap<string, unknown>; backdrop: ReadonlySet<string>; sprites: number; lacking: ReadonlyMap<string, readonly string[]>; notes: readonly string[] } | null;
  /** The pieces of the scenery that follow a flag of the world, and how shown each is now. */
  roomArtGates(): ReadonlyArray<{ piece: string; level: number }>;
  /** The arrival at a new room (docs/PROMPT13-LOG.md): whether the world is held, for which room and since when, how the loading indicator is, how the last changes of zone went, and what is arriving. */
  arrival(): ArrivalState;
  /** The world is held at the black of a change of zone right now. */
  arrivalHeld(): boolean;
  /** Resolves when the world is let go (at once when it is not held). */
  whenArrived(): Promise<void>;
  readonly entityViews: EntityViews;
  readonly touchControls: TouchControls;
  readonly touchSource: TouchSource;
  readonly hudModel: HudModel;
  /** The HUD's view, once the overlays' chunk has arrived (`null` before). */
  hud(): HudView | null;
  readonly translator: Translator;
  readonly settings: SettingsStore;
  /** The sound, once its chunk has arrived (`null` before). */
  audio(): AudioSystem | null;
  readonly fps: FpsMeter;
  readonly counter: DrawCallCounter;
  readonly shakes: { count: number; last: number };
  /** The effects, once their chunk has arrived. */
  effects(): Effects | null;
  /** What the sound was told, once the sound's chunk has arrived (`null` before). */
  /** Every cosmetic chunk (the effects, the looks of the boss) has arrived. */
  cosmeticsReady(): boolean;
  /** The art library, once its chunk has arrived (`null` for a page with no art, which never fetches it). */
  art(): Art | null;
  /** The clips the protagonist's art still lacks for the protagonist to be drawn entirely with it (all of them while there is no art). */
  visualLacks(): string[];
  menuOpen(): boolean;
  /** The saved games of the page (docs/PROMPT14-LOG.md): what the game saves with (`null` in a playground, which saves nothing) and what is counted of the one being played. */
  saves(): GameSaves | null;
  readonly stats: PlayStats;
  /** What the discreet line about the saved game is showing now. */
  notice(): { kind: string | null; slot: number; opacity: number; text: string };
  /** The abstract gamepad of the E2E, made on first use (`null` when there is none). */
  virtualPad(): VirtualPad | null;
  setVirtualPad(pad: VirtualPad | null): void;
  stepOnce(): void;
  refreshPresented(): void;
  /** A training dummy / an Ink Slime that joins the world at the end of the next tick (their ids come back). */
  spawnDummy(x: number, y: number, health: number): string;
  spawnSlime(x: number, y: number, facing: 1 | -1): string;
  /** Lets the camera run `seconds` of its own time at 60 Hz right now. */
  settleCamera(seconds: number): void;
  /** A jolt of the camera by `amount` (0 … 1), as a blow or a guardian's step gives it — unless the player asked for a camera that does not shake. */
  shake(amount: number): void;
  /** The main key of each action as the game has it now. */
  keys(): Record<string, string>;
}

const NO_EFFECTS = { particles: 0, sprites: 0, spawned: 0, dropped: 0, unplayed: 0, peakParticles: 0, poolCreated: 0 };

/** What the game hands the hooks that it runs itself: modules the cold start carries already, passed along rather than imported (a module imported by two chunks is cut out into a chunk of its own, and that one would travel with the game). */
export interface HookShared {
  effectiveKeys: typeof effectiveKeys;
  lackedClips: typeof lackedClips;
  /** The clips the protagonist must have to be drawn entirely with its art. */
  requiredClips: Parameters<typeof lackedClips>[1];
}

/**
 * The parts of the game the hooks read, reached BY NAME (`game['renderer']`: the members are private, and TypeScript lets a bracket reach them with their types) instead of handed over by the game — so none of this
 * object, some forty closures, travels in the cold start of a real player: only the page that asks for the hooks fetches them.
 */
function hostOf(game: Game2D, shared: HookShared): HookHost {
  return {
    game,
    session: game.session,
    input: game.input,
    debug: game.debug,
    renderer: game['renderer'],
    camera: game['camera'],
    playerVisual: game['playerVisual'],
    roomView: game['roomView'],
    roomArt: () => game['roomArtCover'],
    roomArtGates: () => game['roomArt']?.gated() ?? [],
    arrival: () => ({
      ...game['arrival'].snapshot(performance.now()),
      indicator: game['overlays']?.arrival.current.opacity ?? 0,
      indicatorShown: game['indicatorSeen'],
      history: game['arrivals'].map((a) => ({ ...a })),
      aheadFor: game['aheadFor'],
      progress: game['art']?.progress() ?? null,
    }),
    arrivalHeld: () => game['arrival'].blocking,
    whenArrived: () => game.whenArrived(),
    entityViews: game['entityViews'],
    touchControls: game['touchControls'],
    touchSource: game['touchSource'],
    hudModel: game['hudModel'],
    hud: () => game['overlays']?.hud ?? null,
    translator: game.translator,
    settings: game['settings'],
    audio: () => game['audio'],
    fps: game['fps'],
    counter: game['counter'],
    shakes: game['shakes'],
    effects: () => game['effects'],
    cosmeticsReady: () => game['effects'] !== null && game['bossViews'] !== null && game['overlays'] !== null && game['audio'] !== null,
    art: () => game['art'],
    visualLacks: () => {
      const set = game['playerVisual'].artSet;
      return set ? shared.lackedClips(set.def, shared.requiredClips) : [...shared.requiredClips];
    },
    menuOpen: () => game['menuOpen'],
    saves: () => game['saves'],
    stats: game['stats'],
    notice: () => {
      const n = game['overlays']?.notice;
      return { kind: n?.current.kind ?? null, slot: n?.current.slot ?? 0, opacity: n?.current.opacity ?? 0, text: n?.root.textContent ?? '' };
    },
    virtualPad: () => game['virtualPad'],
    setVirtualPad: (pad) => void (game['virtualPad'] = pad),
    stepOnce: () => game.stepOnce(),
    refreshPresented: () => game.refreshPresented(),
    spawnDummy: (x, y, health) => game['spawnDummy'](x, y, { health }),
    spawnSlime: (x, y, facing) => game['spawnSlime'](x, y, facing),
    settleCamera: (seconds) => game.settleCamera(seconds),
    keys: () => ({ ...shared.effectiveKeys(game['settings'].value.keys) }),
    shake: (amount) => game['shake'](amount),
  };
}

export function createTestHooks(game: Game2D, shared: HookShared) {
  const h = hostOf(game, shared);
  const { session } = h;
  return {
    game: h.game,
    session,
    input: h.input,
    /** The saved games of the page: `stop()` of what it saves with is "the game is not running any more" — the way a scenario damages the storage without the page writing over it on its way out. */
    saves: () => h.saves(),
    /** The 2D view is ready as soon as `Game2D.create` resolved (the sprite sets are loaded before it is built). */
    ready: () => true,
    /** Every cosmetic chunk has arrived (they load after the first frame): a test that looks at them waits for this. */
    effectsReady: () => h.cosmeticsReady(),
    /** Freezes real-time simulation so tests can advance it tick by tick. */
    pause: () => h.debug.set('paused', true),
    resume: () => h.debug.set('paused', false),
    /**
     * Runs `n` ticks. A tick is refused while the world is held at the black of a change of zone (its room's art is on its way), exactly as a player's game refuses it: the steps that are left wait
     * for the world to be let go — so this returns a promise only when that happened, and a test that `await`s it (`evaluate` does) sees the same ticks whenever they come.
     */
    step: (n = 1): void | Promise<void> => {
      const run = (left: number): void | Promise<void> => {
        for (let i = left; i > 0; i--) {
          if (h.arrivalHeld()) return h.whenArrived().then(() => run(i));
          h.stepOnce();
        }
        h.refreshPresented();
      };
      return run(n);
    },
    /** The arrival at the room the hero is in (see `HookHost.arrival`). */
    arrival: () => h.arrival(),
    /** Test hook: a training dummy at `(x, y)` (the entity joins the world at the end of the next tick). */
    spawnDummy: (x: number, y = 0, health = 5) => h.spawnDummy(x, y, health),
    /** Test hook: an Ink Slime at `(x, y)` looking at `facing` (joins the world at the end of the next tick). */
    spawnSlime: (x: number, y = 0, facing: 1 | -1 = -1) => h.spawnSlime(x, y, facing),
    /** Test hook: an enemy hitbox over the player's torso, resolved by the next tick (1 damage, standard knockback). */
    strikePlayer: (facing: 1 | -1 = 1) => {
      const b = session.player.body;
      session.combat.submit({
        ownerId: 'e2e_enemy', team: 'enemy', rect: { x0: b.x - 0.5, x1: b.x + 0.5, y0: b.y + 0.2, y1: b.y + 1.2 }, attackId: 'e2e_strike',
        damage: 1, knockback: { x: 5.5, y: 4 }, stun: 14, hitStop: 6, shake: 0.2, facing, alreadyHit: new Set(),
      });
    },
    /** Test hook: what the touch layer sees right now (fingers owned, the movement gesture, the layout in px) and what the settings hold of it (the size, the opacity and the places the player put the buttons). */
    touch: () => ({
      visible: h.touchControls.isVisible,
      active: h.touchSource.active,
      gesture: h.touchSource.gesture,
      layout: h.touchControls.current,
      settings: h.settings.value.touch,
    }),
    /** Test hook (S41): forgets the cues written down so far (a test looks at what ONE thing raises). */
    clearCues: () => void h.audio()?.cueLog?.clear(),
    /**
     * Test hooks of the sound (docs/PROMPT18-LOG.md): what it is doing (`audio()` is the engine's, the channels', the conductor's and the loader's numbers, `null` while the sound is not on), what is going out of the speakers
     * right now (`audioMeter()`: rms and peak, linear), a sound of the manifest played by its id (`playSound`: whether it started), and a volume set as a slider would set it (`setLevel`).
     */
    audio: () => h.audio()?.snapshot() ?? null,
    audioMeter: () => h.audio()?.meter() ?? null,
    playSound: (id: string, request: { at?: { x: number; y: number }; gainDb?: number; variant?: number } = {}) => h.audio()?.play({ id, ...request }) ?? false,
    audioWarm: (groups: string[]) => h.audio()?.warm(groups) ?? Promise.resolve(),
    setLevel: (category: 'master' | 'music' | 'sfx' | 'ambience', level: number) => void h.audio()?.setLevel(category, level),
    /**
     * Test hook (S35): asks the art library for a sprite set by name and keeps it until `artRelease` — what a lab or a lazy pack does. Answers with a summary of what
     * came (`null` when it cannot be had): the set itself never leaves the page.
     */
    artAcquire: async (packId: string, spriteId: string) => {
      const set = await h.art()?.acquire(packId, spriteId);
      return set ? { id: set.def.id, atlas: set.def.atlas, artPxPerMeter: set.def.artPxPerMeter, frames: set.textures.size, clips: Object.keys(set.def.clips) } : null;
    },
    artRelease: (setId: string) => void h.art()?.release({ id: setId }),
    /** Test hook (S36): which look draws the protagonist — `auto`, `placeholder` (the way back) or `art`. Takes effect on the next frame. */
    setVisualMode: (mode: VisualMode) => {
      h.playerVisual.setMode(mode);
      h.refreshPresented();
    },
    /** Test hook: where a point of the world is on screen (CSS px), with the camera of the last frame. */
    worldToScreen: (x: number, y: number) => h.renderer.worldToScreen(x, y),
    /** Test hook: the HUD as the model computed it and as laid out (px). */
    hud: () => ({ state: h.hudModel.state, layout: h.hud()?.current ?? null }),
    /** Test hook: the abstract gamepad, in the Gamepad API's own terms (+y of the stick is DOWN); `pressed` = held button indices. */
    pad: {
      set: (x: number, y: number, pressed: number[] = []) => {
        let pad = h.virtualPad();
        if (!pad) {
          pad = new VirtualPad();
          h.setVirtualPad(pad);
        }
        pad.connected = true;
        pad.neutral().stick(x, y);
        for (const i of pressed) pad.press(i);
      },
      disconnect: () => void h.virtualPad()?.disconnect(),
      remove: () => h.setVirtualPad(null),
    },
    revive: () => {
      session.player.revive();
      session.rescuePlayer();
      h.refreshPresented();
    },
    teleport: (x: number, y: number) => {
      session.player.respawn(x, y, session.player.facing);
      session.collision.probeGround(session.player.body);
      h.camera.snap();
      h.refreshPresented();
    },
    /** Lets the camera run `seconds` of its own time at 60 Hz right now: a test need not wait on slow software-GL frames to see where it settles. */
    settleCamera: (seconds = 4) => h.settleCamera(seconds),
    /** Test hook: what a blow does to the camera (it answers to "no camera shake" like the real thing). */
    shake: (amount: number) => h.shake(amount),
    /**
     * Lets the protagonist's ANIMATION clock run `seconds` right now. It stands still while the game is paused (stable screenshots), so a test that follows a clip over time —
     * the frames of a walk, of a fall, of a blow — advances it by hand, a tick (1/60 s) at a time, next to `step`: what it sees is what a player sees over the same seconds.
     */
    advanceAnimation: (seconds: number) => {
      if (!(seconds > 0)) return;
      h.playerVisual.sync(session.player.view, 1, seconds);
    },
    /** Lets the effects run `seconds` of their own (real) time right now — they stand still while the game is paused, so a test photographs a moment of one without waiting on the clock of a slow frame. */
    advanceEffects: (seconds: number) => {
      const e = h.effects();
      if (!e || !(seconds > 0)) return;
      e.director.update(seconds);
      e.system.update(seconds);
      e.lighting?.advance(seconds);
      e.screen?.update(seconds);
    },
    state: () => {
      const b = session.player.body;
      const vp = h.renderer.viewport;
      const ps = h.playerVisual;
      const anchor = (id: AnchorId): { x: number; y: number } => ps.anchorWorld(id);
      const effects = h.effects();
      const rig: CameraRig = h.camera.rig;
      const levels = h.audio()?.levels() ?? h.settings.value.volume; // (the sound's, or the settings' while it has not arrived)
      return {
        x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded,
        anim: session.player.view.anim, state: session.player.controller.state,
        crouched: session.player.controller.crouched, bodyHeight: b.height,
        health: session.player.health.current, maxHealth: session.player.health.max,
        hitStop: session.hitStopLeft, now: session.now, trauma: rig.currentTrauma, shakes: { ...h.shakes },
        invulnerable: session.player.invulnerable, blink: session.player.view.blink, flash: session.player.view.flash,
        combat: {
          attack: session.player.combat.attack?.id ?? null, phase: session.player.view.phase,
          ticks: session.player.combat.attackTicks, combo: session.player.combat.combo,
        },
        dummies: session.entities.filter((e) => e.kind === 'dummy').map((e) => {
          const d = e as TrainingDummy;
          return { id: d.id, x: d.body.x, y: d.body.y, vx: d.body.vx, hp: d.health.current, hits: d.hits };
        }),
        enemies: session.entities.filter((e) => e.kind === 'enemy').map((e) => {
          const n = e as Enemy;
          return {
            id: n.id, def: n.def.id, state: n.state, ticks: n.stateTicks, x: n.body.x, y: n.body.y, vx: n.body.vx, facing: n.facing,
            hp: n.health.current, hits: n.hits, anim: n.view.anim, phase: n.view.phase, phaseT: n.view.phaseT, opacity: n.view.opacity,
          };
        }),
        // the boss, when the room has one that stands (S29): what the fight tests read
        boss: (() => {
          const g = session.entities.find((e) => e.kind === 'guardian') as Guardian | undefined;
          if (!g) return null;
          return {
            id: g.id, def: g.def.id, state: g.state, ticks: g.stateTicks, x: g.body.x, y: g.body.y, facing: g.facing, hp: g.health.current, maxHp: g.health.max,
            attack: g.attackKind, enraged: g.enraged, marks: g.telegraphMarks.map((m) => ({ x: m.x, w: m.w, t01: m.t01 })), opacity: g.view.opacity,
          };
        })(),
        // where the parallax layers sit now and the pivot of the world they follow (S42): the environment contract says `layer = (1 − factor) × pivot`
        parallax: {
          pivot: { x: h.renderer.layers.world.pivot.x, y: h.renderer.layers.world.pivot.y },
          layers: Object.fromEntries((['backdropFar', 'backdropMid', 'backdropNear', 'foreground'] as const).map((k) => [k, { x: h.renderer.layers[k].position.x, y: h.renderer.layers[k].position.y }])),
        },
        // objects in each scene layer: the E2E proves that rebuilding a room leaves nothing behind
        scene: Object.fromEntries(
          (['terrain', 'fxBack', 'actors', 'fxNormal', 'fxWorld', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay'] as const).map((k) => [k, h.renderer.layers[k].children.length]),
        ),
        // what the art draws of the room (S45): the solids and doors it covers, the sprites it made, what the blockout still draws
        roomArt: (() => {
          const c = h.roomArt();
          return c
            ? {
                solids: [...c.solids], gates: [...c.gates], exits: [...c.exits], hazards: [...c.hazards], interactables: [...c.interactables.keys()], seals: [...c.seals.keys()], guardians: [...c.guardians.keys()], creatures: [...c.creatures.keys()], backdrop: [...c.backdrop],
                sprites: c.sprites, lacking: Object.fromEntries(c.lacking), notes: [...c.notes],
              }
            : null;
        })(),
        roomArtGates: h.roomArtGates(),
        room: session.room.id,
        flags: session.flags.list(),
        gates: Object.fromEntries((session.room.gates ?? []).map((g) => [g.id, { open: session.gateOpen(g.id), alpha: h.roomView.gateAlpha(g.id) ?? null }])),
        exits: [...session.exitsReached],
        views: h.entityViews.count,
        vfx: effects?.system.stats ?? NO_EFFECTS,
        // where the light of the effects comes from (phase H): the shapes (`art`: painted, `procedural`: the game's own) and the sequences the art gave
        vfxLook: effects?.look ?? null,
        // the light the energy casts on the world (phase I): how many lights are on, how much light in all, and which (`null`: none — `?light=off`, or the effects have not arrived)
        lights: effects?.lighting?.field.stats ?? null,
        // the atmosphere of the screen (phase I): the room's dark, whether the fight's is on and which pulses are at the edge (`null`: none)
        screen: effects?.screen?.state ?? null,
        // what the views of the bolt and of the boss draw with (the art's, or their shapes): `null` when there is none of them now
        looks: (() => {
          let bolt: boolean | null = null;
          h.entityViews.each('projectile', (_e, view) => void (bolt = (view as unknown as { isPainted?: boolean }).isPainted === true));
          let marks: number | null = null;
          h.entityViews.each('guardian', (_e, view) => {
            const inner = (view as unknown as { view?: unknown }).view ?? view;
            marks = (inner as { paintedMarks?: number }).paintedMarks ?? 0;
          });
          return { bolt, marks };
        })(),
        death: session.deathSnapshot, transition: session.transitionSnapshot, arrival: h.arrival(), lang: h.translator.locale,
        device: h.input.device,
        // the player's resources (the HUD shows them; the tests read the numbers)
        magic: session.magic.current,
        card: session.loadout.equipped?.id ?? null,
        bottles: session.bottles.slots.map((s) => s.state),
        projectiles: session.entities.filter((e) => e.kind === 'projectile').map((e) => {
          const p = e as unknown as Projectile;
          return { id: p.id, x: p.x, y: p.y, facing: p.facing };
        }),
        respawnPoint: { ...session.respawnPoint },
        // the settings in force (S30): the volumes the sound plays at (the general one is `level`, `gain`; the four with their gains are `levels`, `gains`), the profile and what it costs, the main key of each action
        volume: {
          level: levels.master,
          gain: gainOf(levels.master),
          levels: { ...levels },
          gains: { master: gainOf(levels.master), music: gainOf(levels.music), sfx: gainOf(levels.sfx), ambience: gainOf(levels.ambience) },
        },
        quality: {
          setting: h.settings.value.quality,
          tier: h.renderer.qualityTier,
          resolution: vp.resolution,
          particleBudget: effects?.budgets.particles ?? null,
          spriteBudget: effects?.budgets.sprites ?? null,
        },
        keys: h.keys(),
        menuOpen: h.menuOpen(),
        // the saved games (docs/PROMPT14-LOG.md): the one being played, what is counted of it, and what the page is telling the player about it
        slot: h.saves()?.slot ?? null,
        stats: h.stats.snapshot(session.now),
        notice: h.notice(),
        // the cues of the sound (S41): how many of each, and the last ones — what the audio engine was told
        cues: h.audio()?.cueLog?.snapshot() ?? null,
        // the sound itself (docs/PROMPT18-LOG.md): the engine, the music, the ambience, the conductor, the loader (`null` while it has not arrived or the page makes no sound)
        audio: h.audio()?.snapshot() ?? null,
        art: h.art()?.snapshot() ?? null,
        sprite: {
          set: ps.spriteSetId, frame: ps.frame, facing: ps.facing, visible: ps.visible,
          hand: anchor('hand_r'), grip: anchor('weapon_grip'), tip: anchor('weapon_tip'),
        },
        // the FOUR boxes of the hero (docs/ART-PIPELINE-2D.md §A.7 and part G.3), in world metres: what is SEEN (the picture on screen, whichever look draws it), what
        // COLLIDES (the body that moves through the world), what is HURT (the hurtbox, which loses the head when crouched) and what HITS (the blow's hitbox of the last tick, or
        // null). The first is the picture's; the other three are the simulation's and no look changes them
        boxes: (() => {
          const p = session.player;
          const copy = (r: Rect): Rect => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
          // the hero's BLOW: what a Spirit Bolt in flight submits each tick belongs to the bolt, not to the hero's body
          const attack = p.combat.attack?.id;
          const blow = attack ? session.combat.activeHitboxes.find((hb) => hb.ownerId === p.id && hb.attackId === attack) : undefined;
          return {
            visual: copy(ps.bounds()),
            body: { x0: b.x - b.halfW, y0: b.y, x1: b.x + b.halfW, y1: b.y + b.height },
            hurtbox: copy(p.hurtbox()),
            hitbox: blow ? copy(blow.rect) : null,
          };
        })(),
        // which look draws the protagonist (docs/ART-PIPELINE-2D.md part D): the mode, the look on screen, and what the art has
        visual: {
          mode: ps.mode, shows: ps.shows, art: ps.artSet?.def.id ?? null,
          provides: ps.artSet ? Object.keys(ps.artSet.def.clips) : [],
          lacks: h.visualLacks(),
        },
        tick: session.now, fps: h.fps.fps,
        // `calls` keeps the field the 3D scenes used; `draws` is the same number under its real name
        calls: h.counter.median, triangles: 0,
        draws: h.counter.median, drawsMax: h.counter.max,
        camera: {
          x: h.camera.centre.x, y: h.camera.centre.y, viewHeight: rig.pose.viewHeight,
          zone: h.camera.activeZone, limits: rig.limits ? { ...rig.limits } : null,
        },
        view: { contentWidth: vp.contentWidth, contentHeight: vp.contentHeight, ppm: vp.ppm, resolution: vp.resolution, visibleWidth: vp.visibleWidth, barX: vp.barX, barY: vp.barY, rotateDevice: vp.rotateDevice },
        canvas: { cssWidth: h.renderer.app.canvas.clientWidth, cssHeight: h.renderer.app.canvas.clientHeight, width: h.renderer.app.canvas.width, height: h.renderer.app.canvas.height },
      };
    },
  };
}

export type TestHooks = ReturnType<typeof createTestHooks>;
