import { CanvasParticleContainerPipe, GlParticleContainerPipe, RendererType, type Container } from 'pixi.js';
import { vignetteTexture } from '@/assets/proceduralTextures';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { EDGE_PULSES, FIGHT_MOOD, moodFor } from '@/content/atmosphere';
import { LIGHT_PULSES, LIGHT_RECIPES, LIGHT_STRENGTH } from '@/content/lights';
import { AMBIENT, VFX, VFX_BINDINGS } from '@/content/vfx';
import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { vignetteAlpha } from '@/presentation/atmosphere';
import { collectLights, lightCapacity, LightBook, pulseCapacity, type LightFrame } from '@/presentation/lighting';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET, type VfxSpawn, type VfxTrigger } from '@/presentation/vfx';
import { viewY } from '@/presentation/worldTransform';
import type { QualityTier } from '@/presentation/viewport';
import type { Layers } from '@/render/layers';
import { LightField } from '@/vfx/LightField';
import { ScreenFx, type ScreenRect } from '@/vfx/ScreenFx';
import { VfxDirector } from '@/vfx/VfxDirector';
import { VfxSystem } from '@/vfx/VfxSystem';

/**
 * The effects of the game — sparks, slashes, the warning of an enemy's attack — as ONE module that is loaded AFTER the first frame
 * (docs/PROMPT6-LOG.md, the bundle budget): they are cosmetic, nothing in the first minute of R1 needs them, and with Pixi's particle
 * container they are a tenth of what the game downloads to start. `Game2D` fetches this module when the page is idle and then
 * feeds it exactly as it always fed them; until it arrives the game simply has no effects, which no rule of the game depends on.
 */
export interface Effects {
  readonly system: VfxSystem;
  readonly director: VfxDirector;
  /** The light of the world (docs/PROMPT8-LOG.md, phase I): soft pools of energy behind the actors. `null` when the page asked for none (`?light=off`). */
  readonly lighting: Lighting | null;
  /** The atmosphere of the screen: the vignette of the room and the pulses at the edge when something happens to the hero. `null` without it (`?light=off`, or a tool that gives no screen). */
  readonly screen: ScreenFx | null;
  /** What the quality profile it was built with allows: live particles and live sprite effects (the E2E reads it; the game does not need it). */
  readonly budgets: { readonly particles: number; readonly sprites: number };
  /** Where the shapes the effects are drawn from come from (`art`: painted; `procedural`: the game's own) and the sequences the art gave (the E2E reads it). */
  readonly look: { readonly origin: VfxAtlas['origin']; readonly sequences: readonly string[] };
  dispose(): void;
}

/** The lights of the world as the game drives them: `update` reads what the views read (the frame), decides which lights there are and draws them; `advance` lets them ease for a while without asking again (a paused lab, a test). */
export interface Lighting {
  readonly field: LightField;
  update(dt: number, frame: LightFrame): void;
  advance(dt: number): void;
  /** The light a moment leaves where it happened (what the trigger that just fired is bound to in `LIGHT_PULSES`). */
  pulse(trigger: VfxTrigger, spawn: VfxSpawn): void;
}

export interface EffectsOptions {
  /** Pixi's renderer (the live one): the particle pipe is installed on it. */
  renderer: unknown;
  layers: Pick<Layers, 'fxWorld' | 'fxNormal' | 'fxBack'>;
  atlas: VfxAtlas;
  bus: EventBus<GameEvents>;
  tier: QualityTier;
  /** Where the player is NOW (the dash trail is laid along the path, whatever the frame rate). */
  playerPosition: () => { x: number; y: number };
  /** The ids of the skills that fly as projectiles: a hit by one of them is a bolt impact, not a sword hit. */
  projectileSkills: ReadonlySet<string>;
  /** 0–1: how much light the hero carries now (their magic): the director lets a mote go as often as it is high. None: the hero carries none. */
  ambientLevel?: () => number;
  /** `false`: no lights of the world and no atmosphere on the screen (`?light=off`: to compare, and to see what the game was). Default: with them. */
  light?: boolean;
  /** The screen layer, where the game is drawn on it and the room the hero is in: with them the screen has its atmosphere. */
  screen?: { layer: Container; rect: () => ScreenRect; room: string };
}

/**
 * The particle pipe that goes with a kind of renderer (docs/PROMPT20-LOG.md §6): each draws a `ParticleContainer` its own way — the WebGL one asks the GPU's shader system for its program, which a canvas renderer does not have
 * (the first blow of a game on a page with no WebGL threw on every frame until the page said the game had failed). `Renderer2D` creates no other kind of renderer than these two (it does not let Pixi fall back to WebGPU,
 * which the game has never run on); anything else is a Pixi that changed under us, and says so.
 */
export function particlePipeFor(type: number): new (renderer: never) => unknown {
  if (type === RendererType.WEBGL) return GlParticleContainerPipe;
  if (type === RendererType.CANVAS) return CanvasParticleContainerPipe;
  throw new Error(`no particle pipe is known for a renderer of type ${type}`);
}

/**
 * Pixi builds the render pipes of a renderer WHEN IT IS CREATED, from the extensions that exist then. The particle pipe — what draws a
 * `ParticleContainer` — is in this chunk, which arrives later, so the renderer has none: the first particle would crash it. This adds
 * the one of its kind to the live renderer, the way `_addPipes` would have. (`pixi.js` is locked at 8.22.0; the E2E `vfx` and `combat`
 * scenarios draw particles through it, and `resilience` does it again on a page with no WebGL, so a Pixi that changed this would be caught there.)
 */
function installParticlePipe(renderer: unknown): void {
  const r = renderer as { type: number; renderPipes: Record<string, unknown>; runners: { destroy: { add(item: unknown): void } } };
  if (r.renderPipes['particle']) return;
  const Pipe = particlePipeFor(r.type);
  const pipe = new Pipe(r as never);
  r.renderPipes['particle'] = pipe;
  r.runners.destroy.add(pipe);
}

/** Pooled, budgeted, driven by simulation events and running in REAL time (a hit-stop does not freeze the sparks). */
export function createEffects(o: EffectsOptions): Effects {
  installParticlePipe(o.renderer);
  const budgets = { particles: PARTICLE_BUDGET[o.tier], sprites: SPRITE_FX_BUDGET[o.tier] };
  const system = new VfxSystem({ add: o.layers.fxWorld, normal: o.layers.fxNormal, back: o.layers.fxBack }, o.atlas, VFX, {
    particleBudget: budgets.particles,
    spriteBudget: budgets.sprites,
  });
  system.prewarm();
  const lighting = o.light === false ? null : createLighting(o.layers.fxBack, o.atlas, o.tier);
  const screen =
    o.light === false || !o.screen
      ? null
      : new ScreenFx(o.screen.layer, {
          bus: o.bus,
          texture: vignetteTexture((d) => vignetteAlpha(d, 1)),
          rect: o.screen.rect,
          room: o.screen.room,
          moodFor,
          fight: FIGHT_MOOD,
          pulses: EDGE_PULSES,
        });
  const director = new VfxDirector(
    o.bus, system, VFX_BINDINGS, VFX, o.playerPosition, o.projectileSkills, o.ambientLevel ? { ...AMBIENT, level: o.ambientLevel } : null,
    lighting ? (trigger, spawn) => lighting.pulse(trigger, spawn) : null,
  );
  return {
    system,
    director,
    lighting,
    screen,
    budgets,
    look: { origin: o.atlas.origin, sequences: Object.keys(o.atlas.sequences) },
    dispose: () => {
      director.dispose();
      lighting?.field.destroy();
      screen?.dispose();
      system.destroy();
    },
  };
}

/** The light of the world: a field of pooled sprites in the layer behind the actors, and the book the frame fills for it. */
function createLighting(layer: Layers['fxBack'], atlas: VfxAtlas, tier: QualityTier): Lighting {
  const capacity = lightCapacity(tier);
  const field = new LightField(layer, atlas, capacity, pulseCapacity(tier));
  const book = new LightBook(capacity);
  return {
    field,
    update(dt, frame) {
      book.begin();
      collectLights(frame, LIGHT_RECIPES, LIGHT_STRENGTH, book);
      book.end();
      field.update(dt, book);
    },
    advance(dt) {
      field.update(dt, book);
    },
    pulse(trigger, spawn) {
      const list = LIGHT_PULSES[trigger];
      if (!list) return;
      for (const p of list) {
        const [ox, oy] = p.offset ?? [0, 0];
        field.pulse(p, spawn.x + ox * spawn.facing, viewY(spawn.y + oy));
      }
    },
  };
}
