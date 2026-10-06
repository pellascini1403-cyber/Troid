import { GlParticleContainerPipe } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET } from '@/presentation/vfx';
import type { QualityTier } from '@/presentation/viewport';
import type { Layers } from '@/render/layers';
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
  dispose(): void;
}

export interface EffectsOptions {
  /** Pixi's renderer (the live one): the particle pipe is installed on it. */
  renderer: unknown;
  layers: Pick<Layers, 'fxWorld' | 'fxNormal'>;
  atlas: VfxAtlas;
  bus: EventBus<GameEvents>;
  tier: QualityTier;
  /** Where the player is NOW (the dash trail is laid along the path, whatever the frame rate). */
  playerPosition: () => { x: number; y: number };
  /** The ids of the skills that fly as projectiles: a hit by one of them is a bolt impact, not a sword hit. */
  projectileSkills: ReadonlySet<string>;
}

/**
 * Pixi builds the render pipes of a renderer WHEN IT IS CREATED, from the extensions that exist then. The particle pipe — what draws a
 * `ParticleContainer` — is in this chunk, which arrives later, so the renderer has none: the first particle would crash it. This adds
 * the WebGL one to the live renderer, the way `_addPipes` would have. (`pixi.js` is locked at 8.22.0; the E2E `vfx` and `combat`
 * scenarios draw particles through it, so a Pixi that changed this would be caught there.)
 */
function installParticlePipe(renderer: unknown): void {
  const r = renderer as { renderPipes: Record<string, unknown>; runners: { destroy: { add(item: unknown): void } } };
  if (r.renderPipes['particle']) return;
  const pipe = new GlParticleContainerPipe(r as never);
  r.renderPipes['particle'] = pipe;
  r.runners.destroy.add(pipe);
}

/** Pooled, budgeted, driven by simulation events and running in REAL time (a hit-stop does not freeze the sparks). */
export function createEffects(o: EffectsOptions): Effects {
  installParticlePipe(o.renderer);
  const system = new VfxSystem({ add: o.layers.fxWorld, normal: o.layers.fxNormal }, o.atlas, VFX, {
    particleBudget: PARTICLE_BUDGET[o.tier],
    spriteBudget: SPRITE_FX_BUDGET[o.tier],
  });
  system.prewarm();
  const director = new VfxDirector(o.bus, system, VFX_BINDINGS, VFX, o.playerPosition, o.projectileSkills);
  return {
    system,
    director,
    dispose: () => {
      director.dispose();
      system.destroy();
    },
  };
}
