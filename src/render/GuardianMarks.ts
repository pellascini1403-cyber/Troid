import { Container, Sprite } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { PALETTE } from '@/presentation/palette';

/** One warning of the boss on the floor, as its state gives it: where, how wide, and how near the blow is (0 → 1). */
export interface BossMark {
  readonly x: number;
  readonly w: number;
  readonly t01: number;
}

/** The shapes of the light the warnings are made of: the game's own or the art's, the same ten either way. */
export type MarkShapes = Pick<VfxAtlas, 'frames' | 'widthPx' | 'heightPx'>;

/** How flat the sigils lie on the floor (the camera looks across it, not down on it). */
const FLAT = 0.24;
/** How tall the column of light over a mark of the rain grows, at the moment of the blow. */
const COLUMN_HEIGHT = 4.6;
/** Chevrons of the lane of a charge: as many as fit, never more than this. */
const MAX_CHEVRONS = 8;
/** The most marks at once (the rain's densest phase has four). */
const MAX_MARKS = 4;
/** The share of a streak's picture that is visible capsule (the rest is soft light round it): what the thickness of a band is measured against. */
const STREAK_BODY = 0.44;

/** The sprites of one mark. The warning of the rain uses the first five, the lane of the charge the rest. */
interface MarkNode {
  flat: Container;
  rune: Sprite;
  ring: Sprite;
  closing: Sprite;
  disc: Sprite;
  column: Sprite;
  band: Sprite;
  line: Sprite;
  chevrons: Sprite[];
}

/**
 * THE WARNINGS OF THE BOSS, painted (docs/PROMPT8-LOG.md, phase H): what the guardian's attacks show on the floor before they land, in the violet of what is enemy to the hero — made of the shapes of the light (the
 * rune, the ring, the soft glow, the streak and the chevron) instead of drawn with geometry each frame. The WARNING of the rain is a sigil that lies on the floor and turns, a ring that closes on it, a white-hot ring
 * that closes faster and a column of light that rises as the blow nears; the LANE of the charge is a band of light with a bright line along it, brightest where the guardian will end, and chevrons that point the
 * way it will slide.
 *
 * The numbers are the guardian's state (`view.marks`: where, how wide and how near the blow is); this only draws them, so it changes what the warnings LOOK like and never when they appear or where they are
 * (the simulation decides both, and the player's reading of them is the whole fight). The sprites are made the first time a mark is shown and then only moved, tinted and faded: nothing is allocated in a fight.
 */
export class GuardianMarks {
  readonly root = new Container({ label: 'guardian-marks' });
  private readonly nodes: MarkNode[] = [];

  constructor(private readonly shapes: MarkShapes) {}

  /** Draws the marks of this frame (`floorY` is the floor of the guardian in VIEW space). Marks that are gone are hidden. */
  update(marks: readonly BossMark[], attack: string | null, facing: 1 | -1, floorY: number, time: number): void {
    const flicker = 0.88 + 0.12 * Math.sin(time * 28);
    const shown = Math.min(marks.length, MAX_MARKS);
    for (let i = 0; i < shown; i++) {
      const node = this.node(i);
      node.flat.parent!.visible = true;
      if (attack === 'charge') this.lane(node, marks[i]!, facing, floorY, flicker);
      else this.sigil(node, marks[i]!, floorY, flicker, time, i);
    }
    for (let i = shown; i < this.nodes.length; i++) this.nodes[i]!.flat.parent!.visible = false;
  }

  /** How many sprites are lit now. */
  get lit(): number {
    let n = 0;
    for (const node of this.nodes) {
      if (!node.flat.parent!.visible) continue;
      for (const s of [node.rune, node.ring, node.closing, node.disc, node.column, node.band, node.line, ...node.chevrons]) if (s.visible) n++;
    }
    return n;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.nodes.length = 0;
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------ the rain

  /** A mark of the rain: a sigil that lies on the floor and turns, a ring that closes on it, a column of light that rises as the blow nears. */
  private sigil(n: MarkNode, m: BossMark, floorY: number, flicker: number, time: number, i: number): void {
    const k = m.t01;
    this.hideAll(n);
    n.flat.parent!.position.set(m.x, floorY - 0.03);
    n.flat.scale.y = FLAT;
    this.place(n.rune, 'rune', Math.max(1.6, m.w * 1.5), (0.1 + 0.62 * k) * flicker, PALETTE.violetCore, time * 0.9 + i * 1.7);
    this.place(n.ring, 'ring', m.w * (1.9 - 1.2 * k), 0.25 + 0.6 * k, PALETTE.violetGlow, 0);
    this.place(n.closing, 'ring', m.w * (1.3 * (1 - k) + 0.25), 0.8 * k, PALETTE.whiteHot, 0);
    this.place(n.disc, 'glow', m.w * 1.35, 0.08 + 0.32 * k, PALETTE.violetCore, 0);
    // the column: the streak stood on its end (its bright end on the floor, its tail up), as thick as the blow is wide
    const c = n.column;
    c.visible = true;
    c.tint = PALETTE.violetCore;
    c.alpha = 0.05 + 0.2 * k;
    c.rotation = Math.PI / 2;
    c.position.set(0, 0);
    c.scale.set((COLUMN_HEIGHT * k) / this.shapes.widthPx.streak, (m.w * 0.8) / (STREAK_BODY * this.shapes.heightPx.streak));
    // (it hangs off the mark's holder, not off the flattened sigils: it stands up from the floor point)
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------ the charge

  /** The lane of a charge: a band of light along the floor with a bright line along it and chevrons that point the way it will slide. */
  private lane(n: MarkNode, m: BossMark, facing: 1 | -1, floorY: number, flicker: number): void {
    const k = m.t01;
    this.hideAll(n);
    n.flat.parent!.position.set(0, 0);
    n.flat.scale.y = 1;
    this.stretch(n.band, 'glow', m.w * 1.15, 0.7, (0.16 + 0.4 * k) * flicker, PALETTE.violetCore, m.x, floorY - 0.24, 1);
    // the line along the floor: its bright end is where the guardian will end
    this.stretch(n.line, 'streak', m.w, 0.2, 0.45 + 0.5 * k, PALETTE.violetGlow, m.x, floorY - 0.05, facing);
    let at = 0;
    for (let c = 0.8; c < m.w - 0.4 && at < MAX_CHEVRONS; c += 1.3, at++) {
      const chevron = n.chevrons[at]!;
      const cx = m.x - facing * (m.w / 2) + facing * c;
      this.stretch(chevron, 'chevron', 1.1, 1.1 * (this.shapes.heightPx.chevron / this.shapes.widthPx.chevron), (0.28 + 0.65 * k) * flicker, PALETTE.violetGlow, cx, floorY - 0.32, facing);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------ the sprites

  /** The sprites of the `i`-th mark, made the first time it is needed. */
  private node(i: number): MarkNode {
    while (this.nodes.length <= i) {
      const holder = new Container({ label: `mark${this.nodes.length}` });
      const flat = new Container({ label: 'flat' });
      const make = (shape: 'rune' | 'ring' | 'glow' | 'streak' | 'chevron'): Sprite => {
        const s = new Sprite(this.shapes.frames[shape]);
        s.anchor.set(shape === 'streak' ? 1 : 0.5, 0.5);
        s.blendMode = 'add';
        s.visible = false;
        return s;
      };
      const rune = make('rune');
      const ring = make('ring');
      const closing = make('ring');
      const disc = make('glow');
      flat.addChild(disc, rune, ring, closing);
      const column = make('streak');
      const band = make('glow');
      const line = make('streak');
      line.anchor.set(0.5, 0.5);
      const chevrons = Array.from({ length: MAX_CHEVRONS }, () => make('chevron'));
      holder.addChild(flat, column, band, line, ...chevrons);
      this.root.addChild(holder);
      this.nodes.push({ flat, rune, ring, closing, disc, column, band, line, chevrons });
    }
    return this.nodes[i]!;
  }

  private hideAll(n: MarkNode): void {
    for (const s of [n.rune, n.ring, n.closing, n.disc, n.column, n.band, n.line, ...n.chevrons]) s.visible = false;
  }

  /** A shape on the flattened floor of the node, `width` metres across, lit `alpha`, turned `rotation`. */
  private place(s: Sprite, shape: 'rune' | 'ring' | 'glow', width: number, alpha: number, tint: number, rotation: number): void {
    const k = width / this.shapes.widthPx[shape];
    s.visible = true;
    s.scale.set(k);
    s.alpha = alpha;
    s.tint = tint;
    s.rotation = rotation;
  }

  /** A shape put at a world point of the view, `width` × `height` metres, mirrored by `side`. */
  private stretch(s: Sprite, shape: 'glow' | 'streak' | 'chevron', width: number, height: number, alpha: number, tint: number, x: number, y: number, side: 1 | -1): void {
    const body = shape === 'streak' ? STREAK_BODY : 1;
    s.visible = true;
    s.position.set(x, y);
    s.scale.set((side * width) / this.shapes.widthPx[shape], height / (body * this.shapes.heightPx[shape]));
    s.alpha = alpha;
    s.tint = tint;
    s.rotation = 0;
  }
}
