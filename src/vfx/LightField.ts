import { Container, Sprite } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { pulseLevel, type LightBook, type LightKind, type LightPulse, type LightSource } from '@/presentation/lighting';
import { resolveColor } from '@/presentation/vfx';

/** How fast a light comes up and goes down (per second, exponential): a bolt that leaves the hand lights the room within a tenth of a second, and a hero who falls fades out in a third. */
const RISE = 11;
const FALL = 6;
/** Below this a light is out: its sprite is hidden and its place is free. */
const OUT = 0.004;

/** One pooled light: the sprite, who it belongs to now, and how bright it is (it eases toward what it is asked). */
interface Slot {
  readonly sprite: Sprite;
  key: string | null;
  kind: LightKind;
  /** The strength it eases toward (0 once nothing asks for it any more: it fades out and then frees the slot). */
  target: number;
  level: number;
  seen: boolean;
}

/** One pooled pulse: the light a moment leaves, alive from its birth to the end of its life. */
interface PulseSlot {
  readonly sprite: Sprite;
  pulse: LightPulse | null;
  age: number;
}

export interface LightStats {
  /** Lights that are on now (any brightness above out), the pulses included. */
  lit: number;
  /** The most the profile draws at once of the lights that follow something (the pulses have their own). */
  capacity: number;
  /** Pulses alive now, and the most the profile lets be. */
  pulses: number;
  pulseCapacity: number;
  /** The sum of the strengths of the lights that are on (a measure of how much light the scene carries). */
  total: number;
  /** What is on, brightest first (the E2E and the lab read it; the game does not). */
  lights: ReadonlyArray<{ key: string; kind: LightKind | 'pulse'; level: number; x: number; y: number }>;
}

/**
 * THE LIGHTS OF THE WORLD, drawn (docs/PROMPT8-LOG.md, phase I; `presentation/lighting` says which there are and how strong). A handful of pooled sprites of the soft `glow` of the VFX atlas, tinted by the
 * palette slot, ADDITIVE and in the layer behind the actors: each one brightens the scenery where the energy is and leaves whoever stands in front of it a dark silhouette. They ease in and out (a source
 * that appears or goes never pops), they are made once and then only moved and tinted (nothing is allocated while the game runs), and there are never more than the quality profile allows: at most a dozen sprites
 * of the same texture and blend, which the renderer draws in one batch with the rest of the light behind the actors.
 *
 * Two kinds of light share the field. The lights that FOLLOW something (the hero, a bolt in flight, the guardian) are asked for every frame and ease toward what they are asked; the PULSES (`pulse`) are the
 * light a moment leaves where it happened — a blow, a bolt let go, a place that awakens — and run their own life.
 */
export class LightField {
  readonly root = new Container({ label: 'light-field' });
  private readonly slots: Slot[] = [];
  private readonly pulses: PulseSlot[] = [];
  private readonly byKey = new Map<string, Slot>();
  private readonly texW: number;
  private readonly texH: number;

  constructor(
    layer: Container,
    private readonly atlas: Pick<VfxAtlas, 'frames' | 'widthPx' | 'heightPx'>,
    readonly capacity: number,
    readonly pulseCapacity = 0,
  ) {
    this.texW = atlas.widthPx.glow;
    this.texH = atlas.heightPx.glow;
    for (let i = 0; i < capacity; i++) this.slots.push({ sprite: this.makeSprite(), key: null, kind: 'foe', target: 0, level: 0, seen: false });
    for (let i = 0; i < pulseCapacity; i++) this.pulses.push({ sprite: this.makeSprite(), pulse: null, age: 0 });
    layer.addChild(this.root);
  }

  /**
   * Draws this frame's lights. `dt` is real time (a hit-stop does not freeze them): they ease toward what they are asked. With `dt` = 0 — only a tool pauses the effects (a test, a lab: the player's menu does not) —
   * no time passes to ease in, so they are AT what they are asked at once: a paused picture is what the light is, not a light on its way to it.
   */
  update(dt: number, book: LightBook): void {
    for (const s of this.slots) s.seen = false;
    // the lights that already have a place keep it…
    for (let i = 0; i < book.count; i++) {
      const slot = this.byKey.get(book.sources[i]!.key);
      if (slot) slot.seen = true;
    }
    // …and the new ones take a free one, or the dimmest of those nobody asks for any more
    for (let i = 0; i < book.count; i++) {
      const src = book.sources[i]!;
      let slot: Slot | null | undefined = this.byKey.get(src.key);
      if (!slot) {
        slot = this.take();
        if (!slot) continue;
        slot.key = src.key;
        slot.level = 0;
        this.byKey.set(src.key, slot);
        slot.seen = true;
      }
      this.aim(slot, src);
    }
    for (const s of this.slots) {
      if (s.key === null) continue;
      if (!s.seen) s.target = 0;
      s.level = dt > 0 ? s.level + (s.target - s.level) * (1 - Math.exp(-(s.target > s.level ? RISE : FALL) * dt)) : s.target;
      this.paint(s);
      if (!s.seen && s.level < OUT) this.release(s);
    }
    if (dt > 0) this.runPulses(dt);
  }

  /** The light a moment leaves, at a point of VIEW space (metres, +y down), born now: it takes a free place, or the one of the pulse that has least life left. */
  pulse(p: LightPulse, x: number, y: number): void {
    let slot: PulseSlot | null = null;
    let left = Infinity;
    for (const s of this.pulses) {
      if (s.pulse === null) {
        slot = s;
        break;
      }
      const remaining = s.pulse.life - s.age;
      if (remaining < left) {
        left = remaining;
        slot = s;
      }
    }
    if (!slot) return;
    slot.pulse = p;
    slot.age = 0;
    const sp = slot.sprite;
    sp.position.set(x, y);
    sp.scale.set((2 * p.radius) / this.texW, (2 * p.radius) / this.texH);
    sp.tint = resolveColor(p.slot, 'core');
    sp.alpha = 0;
    sp.visible = false;
  }

  /** Every light at its strength at once (a room that has just been built, a lab, a test: nothing to fade in from). */
  settle(): void {
    for (const s of this.slots) {
      if (s.key === null) continue;
      s.level = s.target;
      this.paint(s);
      if (!s.seen && s.level < OUT) this.release(s);
    }
  }

  /** Puts every light out (a room is being left). */
  clear(): void {
    for (const s of this.slots) if (s.key !== null) this.release(s);
    for (const s of this.pulses) this.endPulse(s);
  }

  get stats(): LightStats {
    const lights: Array<{ key: string; kind: LightKind | 'pulse'; level: number; x: number; y: number }> = this.slots
      .filter((s) => s.key !== null && s.level >= OUT)
      .map((s) => ({ key: s.key!, kind: s.kind, level: s.level, x: s.sprite.x, y: s.sprite.y }));
    let pulses = 0;
    for (const s of this.pulses) {
      if (s.pulse === null) continue;
      pulses++;
      const level = pulseLevel(s.pulse, s.age);
      if (level >= OUT) lights.push({ key: 'pulse', kind: 'pulse', level, x: s.sprite.x, y: s.sprite.y });
    }
    lights.sort((a, b) => b.level - a.level);
    return { lit: lights.length, capacity: this.capacity, pulses, pulseCapacity: this.pulseCapacity, total: lights.reduce((n, l) => n + l.level, 0), lights };
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.slots.length = 0;
    this.pulses.length = 0;
    this.byKey.clear();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------ internals

  private makeSprite(): Sprite {
    const sprite = new Sprite(this.atlas.frames.glow);
    sprite.anchor.set(0.5, 0.5);
    sprite.blendMode = 'add';
    sprite.visible = false;
    this.root.addChild(sprite);
    return sprite;
  }

  private take(): Slot | null {
    let best: Slot | null = null;
    for (const s of this.slots) {
      if (s.key === null) return s;
      if (!s.seen && (best === null || s.level < best.level)) best = s;
    }
    if (best) {
      this.byKey.delete(best.key!);
      best.key = null;
    }
    return best;
  }

  private release(s: Slot): void {
    if (s.key !== null) this.byKey.delete(s.key);
    s.key = null;
    s.level = 0;
    s.target = 0;
    s.sprite.visible = false;
  }

  private aim(s: Slot, src: LightSource): void {
    s.kind = src.kind;
    s.target = src.intensity;
    const sp = s.sprite;
    sp.position.set(src.x, src.y);
    sp.scale.set((2 * src.radius) / this.texW, ((2 * src.radius) / this.texH) * src.squash);
    sp.tint = resolveColor(src.slot, 'core');
  }

  private paint(s: Slot): void {
    s.sprite.alpha = s.level;
    s.sprite.visible = s.level >= OUT;
  }

  private runPulses(dt: number): void {
    for (const s of this.pulses) {
      const p = s.pulse;
      if (p === null) continue;
      s.age += dt;
      if (s.age >= p.life) {
        this.endPulse(s);
        continue;
      }
      const level = pulseLevel(p, s.age);
      s.sprite.alpha = level;
      s.sprite.visible = level >= OUT;
    }
  }

  private endPulse(s: PulseSlot): void {
    s.pulse = null;
    s.age = 0;
    s.sprite.visible = false;
  }
}
