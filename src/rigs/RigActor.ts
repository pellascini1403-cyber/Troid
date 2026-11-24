import { Container, Sprite } from 'pixi.js';
import { clamp01, damp } from '@/core/math';
import type { EntityView } from '@/render/EntityViews';
import type { ActorViewState } from '@/presentation/actorViewState';
import { viewY } from '@/presentation/worldTransform';
import type { RigAssets } from './kit/assets';
import { Kit } from './kit/kit';
import { createRigFrame, type RigBody, type RigDef, type RigFrame } from './types';

/** What a rig reads of an entity: the view state every actor has, and — for the bosses — the few extra fields that say what the weak point and the attack are doing. */
export interface RigSource {
  readonly view: ActorViewState & {
    readonly attack?: string | null;
    readonly exposed?: boolean;
    readonly attackId?: string | null;
    readonly hpFrac?: number;
    readonly enraged?: boolean;
    readonly awake?: boolean;
  };
}

/** Simulation ticks per second: the speed of a creature is the distance it moved in the last tick times this. */
const TICKS = 60;

/**
 * A creature drawn as an articulated rig (docs/PROMPT24-LOG.md): the view of every species that has its own anatomy, behind the same `EntityView` as every other entity. It reads the entity's view state (the logical animation,
 * how far through it, the speed) and turns it into the feelings a species animates from (`RigFrame`: the warning building, the blow, the hit, the death); the species' `update` poses its parts. It decides nothing and
 * allocates nothing per frame.
 *
 * Back to front: contact shadow · halo (additive) · the creature (its parts, in centimetres, scaled to metres here and mirrored by the facing).
 */
export class RigActor implements EntityView {
  readonly root = new Container({ label: 'rig' });
  private readonly stage = new Container({ label: 'rig-body' });
  private readonly aura: Sprite | null;
  private readonly shadow: Sprite | null;
  private readonly body: RigBody;
  private readonly kit: Kit;
  private readonly frame: RigFrame;
  private time = 0;
  private lastAnim = '';
  private lastSerial = -1;
  private since = 0;
  private heat = 0;
  private hurt = 0;
  private vx = 0;
  private vy = 0;

  constructor(
    private readonly def: RigDef,
    private readonly source: RigSource,
    assets: RigAssets,
    /** A number in [0, 1) of this one creature (`seedOf(entity.id)`). */
    seed = 0,
  ) {
    this.frame = createRigFrame(seed);
    this.kit = new Kit(assets, def.id, seed);
    this.body = def.build(this.kit);
    this.stage.scale.set(0.01);
    this.stage.addChild(this.body.root);
    if (def.shadow) {
      const s = new Sprite(assets.glow);
      s.anchor.set(0.5);
      s.tint = 0x000000;
      s.width = def.shadow / 100;
      s.height = (def.shadow / 100) * 0.2;
      s.alpha = 0.6;
      this.shadow = s;
      this.root.addChild(s);
    } else this.shadow = null;
    if (def.aura) {
      const a = new Sprite(assets.glow);
      a.anchor.set(0.5);
      a.tint = def.aura.color;
      a.blendMode = 'add';
      a.position.set(def.aura.at[0] / 100, -def.aura.at[1] / 100);
      a.alpha = 0;
      this.aura = a;
      this.root.addChild(a);
    } else this.aura = null;
    this.root.addChild(this.stage);
  }

  /** The art of the zone does not apply to a rig: it is drawn by code. (The call exists because the game offers every creature view its zone's art.) */
  dress(_art: unknown): void {}

  /** `alpha` ∈ [0, 1): interpolation between ticks. `dt`: animation seconds (frozen by pause and hit-stop). */
  sync(alpha: number, dt: number): void {
    const src = this.source.view;
    const f = this.frame;
    this.root.visible = src.visible;
    if (!src.visible) return;
    this.time += dt;
    const x = src.prevX + (src.x - src.prevX) * alpha;
    const y = src.prevY + (src.y - src.prevY) * alpha;
    this.root.position.set(x, viewY(y));
    this.root.scale.x = src.facing;

    // the state it is in, and for how long
    if (src.anim !== this.lastAnim || src.animSerial !== this.lastSerial) {
      if (src.anim === 'hurt') this.hurt = 1;
      this.lastAnim = src.anim;
      this.lastSerial = src.animSerial;
      this.since = 0;
    }
    this.since += dt;

    // speed along the way it faces, smoothed (the last tick's move is a staircase)
    const vxNow = (src.x - src.prevX) * TICKS * src.facing;
    const vyNow = (src.y - src.prevY) * TICKS;
    this.vx = dt > 0 ? damp(this.vx, vxNow, 14, dt) : this.vx;
    this.vy = dt > 0 ? damp(this.vy, vyNow, 14, dt) : this.vy;

    // the warning builds through the telegraph, is held while it strikes, and eases off after
    const target = src.anim === 'telegraph' ? src.phaseT : src.anim === 'attack' ? 1 : src.anim === 'alert' ? 0.35 * (1 - src.phaseT) : src.anim === 'phaseTransition' ? 0.8 : 0;
    this.heat = target >= this.heat ? target : dt > 0 ? damp(this.heat, target, 5, dt) : this.heat;
    this.hurt = Math.max(0, this.hurt - dt * 3.2);

    f.t = this.time + this.frame.seed * 31.7;
    f.dt = dt;
    f.anim = src.anim;
    f.phase = src.phase;
    f.p = src.phaseT;
    f.since = this.since;
    f.vx = this.vx;
    f.vy = this.vy;
    f.heat = this.heat;
    f.strike = src.anim === 'attack' ? Math.sin(clamp01(src.phaseT) * Math.PI) : 0;
    f.hurt = this.hurt;
    f.dying = src.anim === 'death' ? src.phaseT : 0;
    f.open = src.phase === 'recovery';
    f.flash = src.flash;
    f.opacity = src.opacity;
    f.hpFrac = src.hpFrac ?? 1;
    f.attackKey = src.attackId ?? null;
    f.enraged = src.enraged ?? false;
    f.exposed = src.exposed ?? f.open;
    f.awake = src.awake ?? true;

    this.body.update(f);

    // the white-hot flash of a hit, on every part that can flash
    const flash = src.flash * (src.anim === 'death' ? 0.6 : 1);
    for (const p of this.kit.flashables) p.setFlash(flash);

    const fade = this.def.ownsDeath && src.anim === 'death' ? 1 - clamp01((src.phaseT - 0.88) / 0.12) : src.opacity;
    this.stage.alpha = fade;
    if (this.shadow) this.shadow.alpha = 0.6 * fade * (1 - f.dying * 0.5);
    if (this.aura && this.def.aura) {
      const base = this.def.aura.base ?? 0;
      this.aura.alpha = clamp01(base + 0.9 * f.heat + 0.5 * this.hurt) * fade;
      this.aura.width = this.aura.height = (this.def.aura.size / 100) * (1 + 0.7 * f.heat);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
