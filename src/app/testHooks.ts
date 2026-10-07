import type { CameraRig } from '@/camera/CameraRig';
import type { Rect } from '@/core/math';
import type { DebugState } from '@/debug/DebugState';
import type { DrawCallCounter } from '@/debug/DrawCallCounter';
import type { FpsMeter } from '@/debug/FpsMeter';
import type { Enemy } from '@/enemies/Enemy';
import type { Guardian } from '@/enemies/Guardian';
import type { TrainingDummy } from '@/enemies/TrainingDummy';
import type { GameSession } from '@/gameplay/GameSession';
import type { Projectile } from '@/gameplay/Projectile';
import type { Translator } from '@/i18n';
import type { CueLog } from '@/audio/AudioDirector';
import type { MasterVolume } from '@/audio/volume';
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
import type { Effects } from './effects';

/**
 * `window.__troid`: what lets Playwright drive and inspect the game deterministically (dev builds and `?hooks=1`), and what no player ever needs.
 * It is a chunk of its own, fetched only when the hooks are asked for — so none of it travels in the cold start of a real player (docs/PROMPT6-LOG.md
 * S30, the bundle budget) — and it reaches the game only through `HookHost`: the handful of things the game hands over, never its internals. It
 * imports NO module the game itself uses at run time (everything of that kind is handed over by the host, or is a type): a module shared between two
 * chunks is cut out into a chunk of its own, and that one would travel with the game.
 */
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
  readonly entityViews: EntityViews;
  readonly touchControls: TouchControls;
  readonly touchSource: TouchSource;
  readonly hudModel: HudModel;
  readonly hud: HudView;
  readonly translator: Translator;
  readonly settings: SettingsStore;
  readonly volume: MasterVolume;
  readonly fps: FpsMeter;
  readonly counter: DrawCallCounter;
  readonly shakes: { count: number; last: number };
  /** The effects, once their chunk has arrived. */
  effects(): Effects | null;
  /** What the sound of a later version would be told, once the effects' chunk has arrived (`null` before). */
  cueLog(): CueLog | null;
  /** Every cosmetic chunk (the effects, the looks of the boss) has arrived. */
  cosmeticsReady(): boolean;
  /** The art library, once its chunk has arrived (`null` for a page with no art, which never fetches it). */
  art(): Art | null;
  /** The clips the protagonist's art still lacks for the protagonist to be drawn entirely with it (all of them while there is no art). */
  visualLacks(): string[];
  menuOpen(): boolean;
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
  /** The main key of each action as the game has it now. */
  keys(): Record<string, string>;
}

const NO_EFFECTS = { particles: 0, sprites: 0, spawned: 0, dropped: 0, peakParticles: 0, poolCreated: 0 };

export function createTestHooks(h: HookHost) {
  const { session } = h;
  return {
    game: h.game,
    session,
    input: h.input,
    /** The 2D view is ready as soon as `Game2D.create` resolved (the sprite sets are loaded before it is built). */
    ready: () => true,
    /** Every cosmetic chunk has arrived (they load after the first frame): a test that looks at them waits for this. */
    effectsReady: () => h.cosmeticsReady(),
    /** Freezes real-time simulation so tests can advance it tick by tick. */
    pause: () => h.debug.set('paused', true),
    resume: () => h.debug.set('paused', false),
    step: (n = 1) => {
      for (let i = 0; i < n; i++) h.stepOnce();
      h.refreshPresented();
    },
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
    /** Test hook: what the touch layer sees right now (fingers owned, the movement gesture, the layout in px). */
    touch: () => ({
      visible: h.touchControls.isVisible,
      active: h.touchSource.active,
      gesture: h.touchSource.gesture,
      layout: h.touchControls.current,
    }),
    /** Test hook (S41): forgets the cues written down so far (a test looks at what ONE thing raises). */
    clearCues: () => void h.cueLog()?.clear(),
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
    hud: () => ({ state: h.hudModel.state, layout: h.hud.current }),
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
    state: () => {
      const b = session.player.body;
      const vp = h.renderer.viewport;
      const ps = h.playerVisual;
      const anchor = (id: AnchorId): { x: number; y: number } => ps.anchorWorld(id);
      const effects = h.effects();
      const rig: CameraRig = h.camera.rig;
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
          (['terrain', 'actors', 'fxNormal', 'fxWorld', 'backdropFar', 'backdropMid', 'backdropNear', 'foreground', 'lightOverlay'] as const).map((k) => [k, h.renderer.layers[k].children.length]),
        ),
        room: session.room.id,
        flags: session.flags.list(),
        gates: Object.fromEntries((session.room.gates ?? []).map((g) => [g.id, { open: session.gateOpen(g.id), alpha: h.roomView.gateAlpha(g.id) ?? null }])),
        exits: [...session.exitsReached],
        views: h.entityViews.count,
        vfx: effects?.system.stats ?? NO_EFFECTS,
        death: session.deathSnapshot, transition: session.transitionSnapshot, lang: h.translator.locale,
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
        // the settings in force (S30): the volume the sound of a later version will read, the profile and what it costs, the main key of each action
        volume: { level: h.volume.level, gain: h.volume.gain },
        quality: {
          setting: h.settings.value.quality,
          tier: h.renderer.qualityTier,
          resolution: vp.resolution,
          particleBudget: effects?.budgets.particles ?? null,
          spriteBudget: effects?.budgets.sprites ?? null,
        },
        keys: h.keys(),
        menuOpen: h.menuOpen(),
        // the cues of the sound to come (S41): how many of each, and the last ones — what an audio engine would have been told
        cues: h.cueLog()?.snapshot() ?? null,
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
