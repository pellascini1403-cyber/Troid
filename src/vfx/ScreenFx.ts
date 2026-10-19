import { Container, Sprite, type Texture } from 'pixi.js';
import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { ATMOSPHERE_CONTRACT, edgePulseLevel, type EdgePulse, type Mood } from '@/presentation/atmosphere';

/** Where the game is drawn on the screen, in CSS pixels (the part of the window that is not a bar). */
export interface ScreenRect {
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

export interface ScreenFxOptions {
  bus: EventBus<GameEvents>;
  /** A white square whose alpha is the vignette (`vignetteTexture(vignetteAlpha…)`): stretched over the game it closes the dark in from the corners. */
  texture: Texture;
  /** Where the game is drawn NOW (read every frame: a resize, a rotation, a bar that appears). */
  rect: () => ScreenRect;
  /** The room the hero is in, the dark each room closes in with, the dark of a fight, and the pulses at the edge. */
  room: string;
  moodFor: (room: string) => Mood;
  fight: Mood;
  pulses: Readonly<Record<string, EdgePulse>>;
}

interface PulseNode {
  readonly sprite: Sprite;
  readonly pulse: EdgePulse;
  age: number;
  live: boolean;
}

const byte = (c: number, shift: number): number => (c >> shift) & 0xff;

/** What is left of an edge pulse when the player asked for fewer flashes: the blow, the power and the rest are still told, softly (the vignette of the room is not a flash and is not touched). */
export const CALM_PULSE = 0.35;

/**
 * THE ATMOSPHERE OF THE SCREEN, drawn (docs/PROMPT8-LOG.md, phase I; `presentation/atmosphere` is the contract): a vignette that closes the room's own night in from the corners, and the pulses at the edge of the
 * picture when something happens to the hero — a blow taken darkens it carmín for half a second, a power gained or a place that awakens floods it with light, a guardian that changes or falls tints it violet.
 * Four sprites of ONE white texture in the screen layer, under the letterbox bars: no filter, no render target, nothing allocated while the game runs. It listens to the simulation's events like the effects
 * do and the simulation never knows it exists.
 */
export class ScreenFx {
  readonly root = new Container({ label: 'screen-fx' });
  private readonly dark: Sprite;
  private readonly nodes = new Map<string, PulseNode>();
  private readonly off: Array<() => void> = [];
  private room: string;
  private fighting = false;
  /** The dark now (it eases toward the room's, or the fight's): its strength and its colour as three channels. */
  private strength = 0;
  private r = 0;
  private g = 0;
  private b = 0;
  private started = false;
  private calm = false;
  private last = { x: NaN, y: NaN, w: NaN, h: NaN };

  constructor(
    layer: Container,
    private readonly o: ScreenFxOptions,
  ) {
    this.room = o.room;
    this.dark = this.make(o.texture);
    this.dark.alpha = 0;
    for (const [name, pulse] of Object.entries(o.pulses)) {
      const sprite = this.make(o.texture);
      sprite.tint = pulse.tint;
      sprite.blendMode = pulse.blend;
      sprite.visible = false;
      this.nodes.set(name, { sprite, pulse, age: 0, live: false });
    }
    // under the bars (the letterbox is the first child of the layer) and above the world
    layer.addChildAt(this.root, 0);
    const { bus } = o;
    this.off.push(
      bus.on('player:hurt', () => this.pulse('hurt')),
      bus.on('ability:unlocked', () => this.pulse('power')),
      bus.on('checkpoint:set', () => this.pulse('rest')),
      bus.on('boss:started', () => void (this.fighting = true)),
      bus.on('boss:phase', () => this.pulse('guardian')),
      bus.on('boss:defeated', () => {
        this.fighting = false;
        this.pulse('fall');
      }),
      // a new room, or a hero who is back at the shrine: the dark of the place, not of a fight that is over
      bus.on('room:loaded', (e) => {
        this.room = e.roomId;
        this.fighting = false;
      }),
      bus.on('death:respawned', () => void (this.fighting = false)),
    );
  }

  /** Once per rendered frame (`dt` seconds of the effects' own time: 0 while the game is paused, and then the screen holds). */
  update(dt: number): void {
    this.fit();
    const target = this.fighting ? this.o.fight : this.o.moodFor(this.room);
    if (!this.started) {
      // the first mood fades in (the effects arrive a moment after the first frame): it comes over the picture, it does not appear on it
      this.started = true;
      this.r = byte(target.tint, 16);
      this.g = byte(target.tint, 8);
      this.b = byte(target.tint, 0);
    }
    // with no time passing (only a tool pauses the effects, never the player's menu) the screen is AT its dark: a paused picture is what the dark is, not a dark on its way to it
    const k = dt > 0 ? 1 - Math.exp(-dt / (ATMOSPHERE_CONTRACT.moodSeconds / 3)) : 1;
    this.strength += (target.strength - this.strength) * k;
    this.r += (byte(target.tint, 16) - this.r) * k;
    this.g += (byte(target.tint, 8) - this.g) * k;
    this.b += (byte(target.tint, 0) - this.b) * k;
    this.dark.tint = (Math.round(this.r) << 16) | (Math.round(this.g) << 8) | Math.round(this.b);
    this.dark.alpha = this.strength;
    this.dark.visible = this.strength > 0.004;
    for (const n of this.nodes.values()) {
      if (!n.live) continue;
      if (dt > 0) n.age += dt;
      const level = edgePulseLevel(n.pulse, n.age) * (this.calm ? CALM_PULSE : 1);
      n.sprite.alpha = level;
      n.sprite.visible = level > 0.004;
      if (n.age >= n.pulse.life) n.live = false;
    }
  }

  /** "Fewer flashes" (the accessibility setting): the pulses at the edge of the screen are softened. */
  setCalm(calm: boolean): void {
    this.calm = calm;
  }

  /** How dark the screen is now at its corners, and whether its pulses are softened (the E2E reads it). */
  get state(): { room: string; fighting: boolean; strength: number; pulses: string[]; calm: boolean } {
    return { room: this.room, fighting: this.fighting, strength: this.strength, pulses: [...this.nodes].filter(([, n]) => n.live).map(([name]) => name), calm: this.calm };
  }

  /** Lets the screen finish its easing at once (a lab, a test: nothing to fade in from). */
  settle(): void {
    const target = this.fighting ? this.o.fight : this.o.moodFor(this.room);
    this.strength = target.strength;
    this.r = byte(target.tint, 16);
    this.g = byte(target.tint, 8);
    this.b = byte(target.tint, 0);
    this.started = true;
    this.update(0);
  }

  /** Stops listening and takes the vignette off the screen, with the texture it was given (it is the screen's own). */
  dispose(): void {
    for (const off of this.off.splice(0)) off();
    this.root.destroy({ children: true });
    this.o.texture.destroy(true);
    this.nodes.clear();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------ internals

  private pulse(name: string): void {
    const n = this.nodes.get(name);
    if (!n) return;
    n.age = 0;
    n.live = true;
  }

  private make(texture: Texture): Sprite {
    const s = new Sprite(texture);
    this.root.addChild(s);
    return s;
  }

  /** Spreads the sprites over the part of the window the game is drawn in (only when it changed). */
  private fit(): void {
    const r = this.o.rect();
    const l = this.last;
    if (r.contentX === l.x && r.contentY === l.y && r.contentWidth === l.w && r.contentHeight === l.h) return;
    l.x = r.contentX;
    l.y = r.contentY;
    l.w = r.contentWidth;
    l.h = r.contentHeight;
    for (const s of this.root.children as Sprite[]) {
      s.position.set(r.contentX, r.contentY);
      s.width = r.contentWidth;
      s.height = r.contentHeight;
    }
  }
}
