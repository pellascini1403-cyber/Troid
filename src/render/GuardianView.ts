import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { ActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';
import { GuardianMarks, type MarkShapes } from './GuardianMarks';

/** The part of the guardian the view reads (a structural type: the view never imports the entity class). */
export interface GuardianLike {
  readonly view: ActorViewState & {
    readonly attack: string | null;
    readonly marks: ReadonlyArray<{ readonly x: number; readonly w: number; readonly t01: number }>;
    readonly enraged: boolean;
    readonly awake: boolean;
  };
  readonly body: { readonly halfW: number; readonly height: number };
}

/** One picture of the boss as the art gives it: its frames, how big a pixel of it is in the world and where its pivot is. */
export interface GuardianArtPart {
  readonly frames: readonly Texture[];
  /** Metres per art pixel. */
  readonly mpp: number;
  readonly pivot: readonly [number, number];
}

/**
 * The boss as the art draws it, in PARTS (`presentation/bossArt`): the body (frame 0 the ink, frame 1 the same silhouette in white: the flash of a hit), the eye, the crest (dim, awake, enraged), a shard
 * (the view hangs two) and the pool the body stands in and melts into. The pose is still the simulation's state, read the same way: the art only gives the shapes their pictures.
 */
export interface GuardianArt {
  readonly body: GuardianArtPart;
  readonly eye: GuardianArtPart;
  readonly crest: GuardianArtPart;
  readonly shard: GuardianArtPart;
  readonly pool: GuardianArtPart;
}

/** What the art adds to the view while it is dressed: the sprites that stand where the shapes were. */
interface ArtNodes {
  art: GuardianArt;
  pool: Sprite;
  body: Sprite;
  flash: Sprite | null;
  eye: Sprite;
  crest: Sprite;
  shardL: Sprite;
  shardR: Sprite;
}

export interface GuardianViewOptions {
  /** The soft round light of the VFX atlas: the aura and the glow of the crest and the eye are tinted copies of it. */
  glow: Texture;
  /** The shapes of the light (the game's own atlas or the art's: the same ten): the warnings on the floor are painted with them (`GuardianMarks`). Without them they are drawn with geometry, as they always were. */
  marks?: MarkShapes;
}

const GLOW_PX = 96;
/** Where the crest floats above the feet at rest, and how far the telegraph of the rain lifts it. */
const CREST_Y = 3.25;
const CREST_LIFT = 0.55;
/** The most marks the telegraph can show at once (the rain's densest phase has four). */
const MAX_MARKS = 4;

/**
 * The Ink Warden (docs/PROMPT6-LOG.md S29), drawn from shapes: a tall column of ink with a violet rim and three rows of glyphs, a pale slit of an
 * eye, a CREST — a diamond of violet light — that floats over it, and two shards that hang at its sides. ORIGINAL and abstract on purpose: no face,
 * no limbs, nothing that belongs to anyone else's game, and nothing like the hero (a placeholder in black, white and cyan). Violet is the colour of
 * what is enemy to the hero (docs/GAME-SPEC-2D.md §3.4), and it is the colour of the TELEGRAPH: the warnings on the floor are drawn here, in
 * world space, because they are part of the boss's state, not of an effect.
 *
 * The shapes are drawn once; each frame only moves transforms and alphas. Back to front: the marks on the floor (additive), the aura (additive), the
 * body, the eye, the shards, the crest and its glow, the white hit flash (additive). `root` stays at the origin of the world (the marks are in world
 * coordinates); the actor container is placed at the feet and mirrored by the facing.
 */
export class GuardianView implements EntityView {
  readonly root = new Container({ label: 'guardian' });
  private readonly floor = new Graphics();
  private readonly actor = new Container({ label: 'guardian-actor' });
  private readonly aura = new Sprite();
  private readonly shape = new Container({ label: 'guardian-shape' });
  private readonly body = new Graphics();
  private readonly eye = new Graphics();
  private readonly eyeGlow = new Sprite();
  private readonly shardL = new Graphics();
  private readonly shardR = new Graphics();
  private readonly crest = new Container({ label: 'guardian-crest' });
  private readonly crestBody = new Graphics();
  private readonly crestGlow = new Sprite();
  private readonly flash = new Graphics();
  private time = 0;
  private nodes: ArtNodes | null = null;
  /** The warnings on the floor, painted from the shapes of the light (`null`: drawn with geometry). */
  private readonly marks: GuardianMarks | null;

  constructor(
    private readonly source: GuardianLike,
    options: GuardianViewOptions,
  ) {
    const h = source.body.height;

    // the aura: a violet halo behind the column
    this.aura.texture = options.glow;
    this.aura.anchor.set(0.5);
    this.aura.tint = PALETTE.violetCore;
    this.aura.blendMode = 'add';
    this.aura.position.set(0, -h * 0.55);
    this.aura.scale.set(5.2 / GLOW_PX);
    this.aura.alpha = 0;

    // the column: a tapering monolith, ink with a violet rim, a dim sheen on its upper left and three rows of glyphs
    const outline = [-0.8, 0, -0.85, 1.1, -0.7, 2.2, -0.45, 2.75, 0.45, 2.75, 0.7, 2.2, 0.85, 1.1, 0.8, 0].map((v, i) => (i % 2 === 1 ? -v : v));
    this.body.poly(outline).fill(PALETTE.enemyInk).stroke({ width: 0.07, color: PALETTE.violetCore, alpha: 0.9 });
    this.body.poly([-0.78, -0.2, -0.82, -1.1, -0.66, -2.1, -0.4, -2.55, -0.2, -2.55, -0.3, -1.4, -0.34, -0.2]).fill({ color: PALETTE.violetDeep, alpha: 0.55 });
    for (const [y, w] of [[0.7, 0.55], [1.2, 0.7], [1.7, 0.5]] as const) {
      this.body.rect(-w / 2, -y, w, 0.06).fill({ color: PALETTE.violetGlow, alpha: 0.5 });
      this.body.rect(-0.04, -y - 0.22, 0.08, 0.2).fill({ color: PALETTE.violetCore, alpha: 0.6 });
    }

    // the eye: a pale slit across the upper half of the column, with a glow
    this.eye.roundRect(-0.36, -2.18, 0.72, 0.1, 0.05).fill(PALETTE.whiteHot);
    this.eyeGlow.texture = options.glow;
    this.eyeGlow.anchor.set(0.5);
    this.eyeGlow.tint = PALETTE.violetGlow;
    this.eyeGlow.blendMode = 'add';
    this.eyeGlow.position.set(0, -2.13);
    this.eyeGlow.scale.set(1.6 / GLOW_PX);
    this.eyeGlow.alpha = 0;

    // the shards: two rhombi that hang at its sides and rise when it winds up
    const shard = (g: Graphics, side: 1 | -1): void => {
      g.poly([0, -0.32, 0.17, 0, 0, 0.32, -0.17, 0]).fill(PALETTE.enemyInk).stroke({ width: 0.05, color: PALETTE.violetCore, alpha: 0.9 });
      g.poly([0, -0.14, 0.06, 0, 0, 0.14, -0.06, 0]).fill({ color: PALETTE.violetGlow, alpha: 0.8 });
      g.position.set(side * 1.3, -1.45);
    };
    shard(this.shardL, -1);
    shard(this.shardR, 1);

    // the crest: a diamond of violet light with a white-hot heart, over the column
    this.crestBody.poly([0, -0.46, 0.3, 0, 0, 0.46, -0.3, 0]).fill({ color: PALETTE.violetCore, alpha: 0.9 }).stroke({ width: 0.05, color: PALETTE.violetGlow, alpha: 0.95 });
    this.crestBody.poly([0, -0.2, 0.12, 0, 0, 0.2, -0.12, 0]).fill({ color: PALETTE.whiteHot, alpha: 0.95 });
    this.crestGlow.texture = options.glow;
    this.crestGlow.anchor.set(0.5);
    this.crestGlow.tint = PALETTE.violetCore;
    this.crestGlow.blendMode = 'add';
    this.crestGlow.scale.set(2.2 / GLOW_PX);
    this.crest.addChild(this.crestGlow, this.crestBody);
    this.crest.position.set(0, -CREST_Y);

    // the hit flash: the silhouette again, additive white
    this.flash.poly(outline).fill(0xffffff);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    this.shape.addChild(this.body, this.eye, this.eyeGlow, this.flash);
    this.actor.addChild(this.aura, this.shape, this.shardL, this.shardR, this.crest);
    this.floor.blendMode = 'add';
    this.marks = options.marks ? new GuardianMarks(options.marks) : null;
    if (this.marks) this.root.addChild(this.marks.root);
    this.root.addChild(this.floor, this.actor);
  }

  /**
   * The art draws the boss from now on (or, with `null`, its shapes do again): its sprites take the place of the shapes, which are not drawn. The glows — the aura, the halo of the crest, the light of the
   * eye — stay what they are (soft light, shared with the effects). The pose, the marks on the floor and everything the simulation says are untouched: this changes what the boss LOOKS like, never what it does.
   */
  dress(art: GuardianArt | null): void {
    if (this.nodes) {
      for (const n of [this.nodes.pool, this.nodes.body, this.nodes.flash, this.nodes.eye, this.nodes.crest, this.nodes.shardL, this.nodes.shardR]) n?.destroy();
      this.nodes = null;
    }
    const shapes = art === null;
    for (const g of [this.body, this.eye, this.shardL, this.shardR, this.crestBody, this.flash]) g.visible = shapes;
    if (!art) return;
    const sprite = (part: GuardianArtPart, frame = 0): Sprite => {
      const s = new Sprite(part.frames[Math.min(frame, part.frames.length - 1)]!);
      s.anchor.set(part.pivot[0], part.pivot[1]);
      s.scale.set(part.mpp);
      return s;
    };
    const pool = sprite(art.pool);
    const body = sprite(art.body);
    const flash = art.body.frames.length > 1 ? sprite(art.body, 1) : null;
    if (flash) {
      flash.blendMode = 'add';
      flash.alpha = 0;
    }
    const eye = sprite(art.eye);
    eye.blendMode = 'add';
    // the eye sits where the hood is empty: 2.44 m over the feet (the same place the shapes put it)
    eye.position.set(0, -2.44);
    const crest = sprite(art.crest);
    crest.blendMode = 'add';
    const shardL = sprite(art.shard);
    const shardR = sprite(art.shard);
    this.actor.addChildAt(pool, 0);
    // under the shapes' own glows and in front of them: body, its flash, the eye
    this.shape.addChildAt(body, 0);
    if (flash) this.shape.addChild(flash);
    this.shape.addChild(eye);
    this.actor.addChild(shardL, shardR);
    this.crest.addChildAt(crest, 1);
    this.nodes = { art, pool, body, flash, eye, crest, shardL, shardR };
  }

  sync(alpha: number, dt: number): void {
    // the art was let go of (the zone changed under it): the shapes are the boss again
    if (this.nodes && this.nodes.art.body.frames[0]!.destroyed) this.dress(null);
    const v = this.source.view;
    this.time += dt;
    const t = this.time;
    const x = v.prevX + (v.x - v.prevX) * alpha;
    const y = v.prevY + (v.y - v.prevY) * alpha;
    const p = v.phaseT;

    // ---- the pose, from what the simulation says it is doing
    let sx = 1;
    let sy = 1;
    let lean = 0;
    let lift = 0; // how far the crest floats above its rest
    let raise = 0; // how far the shards rise (0 → 1)
    let crestGlow = v.awake ? 0.8 : 0.22;
    let eye = v.awake ? 0.9 : 0.12;
    let aura = v.awake ? 0.22 : 0.04;
    let shake = 0;
    switch (v.anim) {
      case 'alert': // waking: it rises, the crest ignites
        sy = 0.93 + 0.07 * p;
        crestGlow = 0.22 + 0.78 * p;
        eye = 0.12 + 0.88 * p;
        aura = 0.05 + 0.5 * p;
        raise = 0.7 * p;
        break;
      case 'telegraph':
        crestGlow = 1;
        eye = 1;
        aura = 0.4 + 0.55 * p;
        if (v.attack === 'charge') {
          sy = 1 - 0.1 * p; // it sinks and leans back before the slide
          sx = 1 + 0.05 * p;
          lean = -0.1 * p;
          raise = 0.35;
        } else {
          lift = CREST_LIFT * p; // the crest rises to call the ink
          raise = p;
        }
        break;
      case 'attack':
        crestGlow = 1;
        eye = 1;
        aura = 0.95;
        if (v.attack === 'charge') {
          sx = 1.18;
          sy = 0.97;
          lean = 0.2;
          raise = 0.2;
        } else {
          lift = CREST_LIFT * (1 - Math.min(1, p * 2.5)); // the crest comes down as the ink erupts
          raise = 1 - Math.min(1, p * 2);
          shake = Math.sin(t * 90) * 0.04;
        }
        break;
      case 'hurt':
        shake = Math.sin(p * Math.PI * 6) * 0.07 * (1 - p);
        sy = 0.97;
        crestGlow = 0.6;
        break;
      case 'death':
        sy = Math.max(0.05, 1 - 0.95 * p * p);
        sx = 1 + 0.25 * p;
        crestGlow = 1 - p;
        eye = 1 - p;
        aura = 0.9 * (1 - p);
        lift = -0.4 * p;
        break;
      default: // idle / recovering: slumped and dull — the opening
        if (v.phase === 'recovery') {
          sy = 0.95;
          crestGlow = 0.55;
          eye = 0.5;
          aura = 0.14;
        }
        break;
    }
    // the second phase burns hotter and breathes faster
    const pulse = 1 + (v.enraged ? 0.12 : 0.05) * Math.sin(t * (v.enraged ? 7 : 3.4));
    if (v.enraged && v.anim !== 'death') {
      aura = Math.min(1, aura + 0.2);
      crestGlow = Math.min(1, crestGlow + 0.15);
    }

    this.actor.position.set(x, viewY(y));
    this.actor.scale.x = v.facing;
    this.shape.scale.set(sx, sy);
    this.shape.skew.x = -lean;
    this.shape.position.x = shake;
    this.actor.alpha = v.opacity;
    this.aura.alpha = aura;
    this.aura.scale.set((5.2 / GLOW_PX) * pulse);
    const n = this.nodes;
    this.eye.alpha = Math.min(1, 0.3 + eye * 0.7);
    // the painted eye carries its own halo: the shared glow only adds to it
    this.eyeGlow.alpha = Math.max(0, eye - 0.3) * (n ? 0.55 : 1);
    this.crest.position.set(shake, -(CREST_Y * sy + lift + Math.sin(t * 2.2) * 0.07));
    this.crestBody.alpha = 0.55 + crestGlow * 0.45;
    this.crestGlow.alpha = crestGlow * 0.9;
    this.crestGlow.scale.set((2.2 / GLOW_PX) * pulse);
    this.crest.rotation = Math.sin(t * 1.3) * 0.05;
    const bob = Math.sin(t * 2.6) * 0.06;
    this.shardL.position.set(-1.3 * sx, -1.45 * sy - raise * 0.9 + bob);
    this.shardR.position.set(1.3 * sx, -1.45 * sy - raise * 0.9 - bob);
    this.shardL.rotation = -0.2 * raise;
    this.shardR.rotation = 0.2 * raise;
    this.flash.alpha = v.flash * v.opacity;
    if (n) {
      // the art's parts stand where the shapes stand, and take the same numbers
      n.eye.alpha = Math.min(1, eye * 1.05);
      n.crest.texture = n.art.crest.frames[Math.min(n.art.crest.frames.length - 1, v.enraged ? 2 : v.awake ? 1 : 0)]!;
      n.crest.alpha = 0.55 + crestGlow * 0.45;
      n.shardL.position.copyFrom(this.shardL.position);
      n.shardR.position.copyFrom(this.shardR.position);
      n.shardL.rotation = this.shardL.rotation;
      n.shardR.rotation = this.shardR.rotation;
      n.shardL.alpha = n.shardR.alpha = v.awake ? 1 : 0.55;
      if (n.flash) n.flash.alpha = v.flash * v.opacity;
      // the pool it lies in while it sleeps, thinner while it fights, and the one it melts into when it falls
      const dying = v.anim === 'death';
      n.pool.alpha = dying ? 0.55 + 0.45 * p : v.awake ? 0.5 : 0.85;
      n.pool.scale.x = n.art.pool.mpp * (dying ? 0.9 + 0.5 * p : v.awake ? 0.9 : 0.75);
    }

    this.drawMarks(y);
  }

  /** How many sprites of the painted warnings are lit now (0 when none is shown, or when they are drawn with geometry): what the E2E reads. */
  get paintedMarks(): number {
    return this.marks ? this.marks.lit : 0;
  }

  /** The warnings on the floor, in world space: a lane for the charge, a disc and a rising column for each strike of the rain. */
  private drawMarks(floorY: number): void {
    const g = this.floor;
    g.clear();
    const marks = this.source.view.marks;
    // painted from the shapes of the light, when it has them: the same marks, drawn with sprites
    if (this.marks) {
      this.marks.update(marks, this.source.view.attack, this.source.view.facing, viewY(floorY), this.time);
      return;
    }
    if (marks.length === 0) return;
    const v = this.source.view;
    const y = viewY(floorY);
    const flicker = 0.88 + 0.12 * Math.sin(this.time * 28);
    for (let i = 0; i < marks.length && i < MAX_MARKS; i++) {
      const m = marks[i]!;
      const k = m.t01;
      if (v.attack === 'charge') {
        // the lane: a band along the floor with chevrons that point the way it will slide
        g.rect(m.x - m.w / 2, y - 0.36, m.w, 0.36).fill({ color: PALETTE.violetCore, alpha: (0.1 + 0.32 * k) * flicker });
        g.rect(m.x - m.w / 2, y - 0.04, m.w, 0.06).fill({ color: PALETTE.violetGlow, alpha: 0.35 + 0.5 * k });
        const dir = v.facing;
        for (let c = 0.8; c < m.w - 0.4; c += 1.3) {
          const cx = m.x - dir * (m.w / 2) + dir * c;
          g.poly([cx - dir * 0.28, y - 0.3, cx + dir * 0.1, y - 0.18, cx - dir * 0.28, y - 0.06]).fill({ color: PALETTE.violetGlow, alpha: (0.15 + 0.5 * k) * flicker });
        }
      } else {
        // a disc on the floor that fills as the strike nears, and the column of ink that is about to rise from it
        g.ellipse(m.x, y - 0.03, m.w / 2, 0.2).fill({ color: PALETTE.violetCore, alpha: (0.1 + 0.4 * k) * flicker });
        g.ellipse(m.x, y - 0.03, m.w / 2, 0.2).stroke({ width: 0.06, color: PALETTE.violetGlow, alpha: 0.4 + 0.55 * k });
        g.ellipse(m.x, y - 0.03, (m.w / 2) * (1 - k), 0.2 * (1 - k)).stroke({ width: 0.04, color: PALETTE.whiteHot, alpha: 0.7 * k }); // closes in as it nears
        g.rect(m.x - m.w / 2, y - 4.6 * k, m.w, 4.6 * k).fill({ color: PALETTE.violetCore, alpha: 0.05 + 0.1 * k });
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
