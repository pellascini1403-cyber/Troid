import { Container, Rectangle, Sprite, Texture, type ImageSource } from 'pixi.js';
import type { Rect } from '@/core/math';
import type { ArtLibrary } from '@/assets/artLibrary';
import { HALF_VIEW, PARALLAX_FACTOR, readEnvLook, readEnvTags, slotKey, type EnvLook } from '@/presentation/environment';
import { cropFrame, planHazards, planInteractables, planStrip, planTerrain, type Draw, type InteractablePlacement, type PieceInfo, type PieceLookup } from '@/presentation/roomPlan';
import { SCENE_LAYERS, type Placement, type SceneLayer } from '@/presentation/roomScene';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { viewY } from '@/presentation/worldTransform';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { InteractableArt } from './InteractableViews';
import type { Layers } from './layers';

type Art = ArtLibrary<ImageSource, Texture>;

/**
 * THE ROOM, DRESSED WITH ART (docs/ART-PIPELINE-2D.md, part M): the picture that replaces the blockout when the art for the room has been fetched. It draws two things from two
 * sources and nothing else: the room's OWN DATA — its solids, platforms and doors, as the pieces of the pack's materials, by the plan `presentation/roomPlan` makes — and
 * the pack's SCENE for the room — the arches, columns, roots, haze and light that stand in the layers behind and in front of the action.
 *
 * It is a skin. It never reads a collider and never writes one: it is built from the room's data and the art's size, so any art — more, less, none — leaves what the hero walks
 * on, hits and falls through exactly where the room put it. What it does not cover (a material the pack has no piece for, a layer its scene does not fill) stays drawn by the
 * blockout (`RoomView2D`): `build` says what it covers and the room view lets go of exactly that.
 */
export interface RoomArtCoverage {
  /** Ids of the solids (and doors) the art draws completely. */
  solids: ReadonlySet<string>;
  gates: ReadonlySet<string>;
  exits: ReadonlySet<string>;
  /** The zones that hurt (thorns) the art draws. */
  hazards: ReadonlySet<string>;
  /** The shrines, pickups and levers the art draws, each with the handle that follows what the simulation says of it. */
  interactables: ReadonlyMap<string, InteractableArt>;
  /** The blockout backdrops the scene replaces: `far`, `mid`, `near` and `front` (the foreground). */
  backdrop: ReadonlySet<string>;
  /** How many sprites it made. */
  sprites: number;
  /** What the room's data asks for that the pack does not have, `slot → solids`. */
  lacking: ReadonlyMap<string, readonly string[]>;
  /** Things worth telling a developer (a strip too short for the camera's range): the art is drawn anyway. */
  notes: readonly string[];
}

/** One piece of art of the pack, loaded: its pictures and how big one is in the world. */
interface Piece {
  set: { def: SpriteSetDefinition; textures: ReadonlyMap<string, Texture> };
  frames: Texture[];
  look: EnvLook;
  /** Metres per art pixel. */
  mpp: number;
  /** One cell, metres. */
  w: number;
  h: number;
  pivot: readonly [number, number];
}

interface Motion {
  sprite: Sprite;
  kind: 'sway' | 'pulse' | 'drift';
  phase: number;
  baseAlpha: number;
  baseX: number;
}

const LAYER_OF_BLOCKOUT: Readonly<Record<string, string>> = { backdropFar: 'far', backdropMid: 'mid', backdropNear: 'near', foreground: 'front' };
/** The camera shows at most this much above and below the room's camera range. */
const VIEW_MARGIN_Y = 10;
const FOREGROUND_FACTOR = PARALLAX_FACTOR.foreground;

const pad2 = (i: number): string => String(i).padStart(2, '0');

/** A sub-rectangle of a texture, in the pixels of its ORIGINAL (untrimmed) frame — the clipped last cell of a repetition. `null` when nothing of it is visible. */
export function cropTexture(t: Texture, keep: { x0: number; y0: number; x1: number; y1: number }): Texture | null {
  const trim = t.trim ? { x: t.trim.x, y: t.trim.y, w: t.trim.width, h: t.trim.height } : null;
  const r = cropFrame({ x: t.frame.x, y: t.frame.y, w: t.frame.width, h: t.frame.height }, { w: t.orig.width, h: t.orig.height }, trim, keep);
  if (!r) return null;
  return new Texture({
    source: t.source,
    frame: new Rectangle(r.frame.x, r.frame.y, r.frame.w, r.frame.h),
    orig: new Rectangle(0, 0, r.orig.w, r.orig.h),
    trim: new Rectangle(r.trim.x, r.trim.y, r.trim.w, r.trim.h),
  });
}

export class RoomArtView {
  private readonly roots: Container[] = [];
  private readonly taken: SpriteSetDefinition[] = [];
  private readonly crops = new Map<string, Texture>();
  private readonly motions: Motion[] = [];
  private readonly doors = new Map<string, Container>();
  private serial = 0;
  private time = 0;

  constructor(
    private readonly layers: Layers,
    private readonly art: Art,
  ) {}

  /** The container of a door's art (the room view fades it with the gate), when the art draws that door. */
  door(gateId: string): Container | undefined {
    return this.doors.get(gateId);
  }

  /** Reads the scenes of a room ahead of time (the fade of a transition hides it), so that `build` finds them in memory. */
  async prepare(roomId: string): Promise<void> {
    await Promise.all(this.art.heldPacks('environment').map((p) => this.art.scene(p.pack.id, roomId)));
  }

  /**
   * Draws the room from the art the zone policy holds. Resolves with what it covers, or `null` when there is nothing to draw it with (no environment pack in memory, or a
   * newer `build` overtook this one). The room's own pieces are drawn at once; the scene follows the moment its file is read.
   */
  async build(room: RoomDefinition): Promise<RoomArtCoverage | null> {
    // clearing overtakes any build still in flight (it resolves with `null` and draws nothing more): the build that follows is the only one that counts
    this.clear();
    const mine = ++this.serial;
    const packs = this.art.heldPacks('environment');
    if (packs.length === 0) return null;

    // ---- the pieces: every sprite set of the packs in memory, by what its tags say it is
    const bySlot = new Map<string, Piece>();
    const byName = new Map<string, Piece>();
    for (const info of packs) {
      for (const sprite of info.pack.sprites) {
        const set = this.art.acquireLoaded(info.pack.id, sprite.id);
        if (!set) continue;
        this.taken.push(set.def);
        const idle = set.def.clips['idle'];
        if (!idle) continue;
        const frames: Texture[] = [];
        for (let i = 0; i < idle.count; i++) {
          const t = set.textures.get(`${idle.frames}${pad2(i)}`);
          if (t) frames.push(t);
        }
        if (frames.length !== idle.count) continue;
        const mpp = (set.def.visualScale ?? 1) / set.def.artPxPerMeter;
        const first = frames[0]!;
        const look = readEnvLook(sprite.tags);
        const piece: Piece = { set, frames, look, mpp, w: first.orig.width * mpp, h: first.orig.height * mpp, pivot: set.def.pivot };
        byName.set(`${info.pack.id}/${sprite.id}`, piece);
        const { roles, subject, parts } = readEnvTags(sprite.tags);
        // an interactive's piece is its variant (a pickup's bottle, card or rune); the others are named by their part
        if (roles.length === 1 && roles[0] !== 'decor') bySlot.set(slotKey(roles[0]!, subject, roles[0] === 'interactive' ? (look.variant ?? '') : (parts[0] ?? '')), piece);
      }
    }
    const lookup: PieceLookup = (role, subject, part) => {
      const p = bySlot.get(slotKey(role, subject, part));
      return p ? ({ frames: p.frames.length, w: p.w, h: p.h, look: p.look } satisfies PieceInfo) : null;
    };

    // ---- the room's own data: ground, walls, platforms, doors
    const camera: Rect = room.camera?.bounds ?? room.bounds;
    const view: Rect = { x0: camera.x0 - HALF_VIEW, x1: camera.x1 + HALF_VIEW, y0: camera.y0 - VIEW_MARGIN_Y, y1: camera.y1 + VIEW_MARGIN_Y };
    const plan = planTerrain(room, lookup, view);
    const info = (p: Piece | undefined): PieceInfo | null => (p ? ({ frames: p.frames.length, w: p.w, h: p.h, look: p.look } satisfies PieceInfo) : null);
    let sprites = 0;
    const terrain = this.root(this.layers.terrain, 'art:terrain');
    for (const d of plan.draws) sprites += this.draw(terrain, d, bySlot);
    for (const [gateId, draws] of plan.gates) {
      const door = new Container({ label: `art:door:${gateId}` });
      for (const d of draws) sprites += this.draw(door, d, bySlot);
      this.layers.terrain.addChild(door);
      this.roots.push(door);
      this.doors.set(gateId, door);
    }

    // ---- the zones that hurt: a row of the art's cells along each (the zone is the room's data; the picture only says where)
    const lacking = new Map(plan.lacking);
    const hazards = planHazards(room.hazards ?? [], (kind) => info(bySlot.get(slotKey('hazard', kind, 'cell'))), view);
    if (hazards.draws.length > 0) {
      const root = this.root(this.layers.terrain, 'art:hazards');
      for (const d of hazards.draws) sprites += this.draw(root, d, bySlot);
    }
    for (const [slot, ids] of hazards.lacking) lacking.set(slot, ids);

    // ---- what can be used: the shrines, the pickups, the levers — each one a handle the views feed with what the simulation says
    const interactables = new Map<string, InteractableArt>();
    const items = planInteractables(room.interactables ?? [], (kind, variant) => info(bySlot.get(slotKey('interactive', kind, variant)) ?? bySlot.get(slotKey('interactive', kind, ''))));
    for (const p of items.placements) {
      const piece = bySlot.get(p.slot) ?? bySlot.get(slotKey('interactive', p.kind, ''));
      if (!piece) continue;
      const art = new ArtInteractable(piece, p);
      this.layers[p.layer].addChild(art.root);
      this.roots.push(art.root);
      interactables.set(p.id, art);
      sprites += art.sprites;
    }
    for (const [slot, ids] of items.lacking) lacking.set(slot, ids);

    // ---- the strips: the three seamless layers that scroll slower than the world (`backdrop` far, mid and near) — the base of the scenery, under the scene's own pieces
    const covered = new Set<string>();
    const notes: string[] = [];
    const subject = room.art?.backdrop ?? null;
    const viewHeight = Math.max(13.5, ...(room.camera?.zones ?? []).map((z) => z.viewHeight ?? 0));
    for (const [layer, part] of [['backdropFar', 'far'], ['backdropMid', 'mid'], ['backdropNear', 'near']] as const) {
      const strip = subject === null ? undefined : bySlot.get(slotKey('backdrop', subject, part));
      if (!strip) continue;
      const plan = planStrip(camera, PARALLAX_FACTOR[layer], strip.w, strip.h, viewHeight);
      if (!plan.coversView) notes.push(`the ${part} strip is ${strip.h.toFixed(1)} m tall and the camera of "${room.id}" needs ${plan.needed.toFixed(1)} m: the sky shows over it`);
      const root = this.root(this.layers[layer], `art:strip:${part}`);
      for (const x of plan.xs) {
        const sprite = this.sprite(strip, 0);
        sprite.anchor.set(strip.pivot[0], strip.pivot[1]);
        sprite.scale.set(strip.mpp);
        sprite.position.set(x, viewY(plan.bottom));
        root.addChild(sprite);
        sprites++;
      }
      covered.add(LAYER_OF_BLOCKOUT[layer]!);
    }

    // ---- the exits: the shaft of light over a way out (a piece with the role `light`)
    const exits = new Set<string>();
    const shaft = [...bySlot.entries()].find(([key]) => key.startsWith('light::'))?.[1];
    if (shaft) {
      const root = this.root(this.layers.lightOverlay, 'art:exits');
      for (const x of room.exits ?? []) {
        const s = this.sprite(shaft, 0);
        s.anchor.set(shaft.pivot[0], shaft.pivot[1]);
        s.scale.set(shaft.mpp);
        s.position.set((x.rect.x0 + x.rect.x1) / 2, viewY(x.rect.y0));
        root.addChild(s);
        sprites++;
        exits.add(x.id);
      }
    }

    // ---- the scenes: where the packs put their pieces behind and in front of the action (read now, drawn when they arrive)
    const scenes = await Promise.all(packs.map((p) => this.art.scene(p.pack.id, room.id).then((scene) => ({ pack: p.pack.id, scene }))));
    if (mine !== this.serial) return null;
    // a piece in front hangs from the top of the screen: its own top edge must stay above the highest view the camera can have, or it shows as a flat edge in the air
    const tallest = FOREGROUND_FACTOR * (camera.y1 - viewHeight / 2) + viewHeight / 2;
    for (const { pack, scene } of scenes) {
      if (!scene) continue;
      for (const layer of SCENE_LAYERS) {
        const list = scene.layers[layer];
        if (!list || list.length === 0) continue;
        const root = this.root(this.layers[layer], `art:scene:${layer}`);
        for (const p of list) {
          const piece = byName.get(`${pack}/${p.sprite}`);
          sprites += this.place(root, piece, p);
          if (layer === 'foreground' && piece && p.y + piece.h * (p.scale ?? 1) < tallest) {
            notes.push(`the foreground piece "${p.sprite}" at ${p.x} m ends ${(p.y + piece.h * (p.scale ?? 1)).toFixed(1)} m high and the camera of "${room.id}" can show up to ${tallest.toFixed(1)} m: its top edge can show`);
          }
        }
        const blockout = LAYER_OF_BLOCKOUT[layer];
        if (blockout) covered.add(blockout);
      }
    }
    return { solids: plan.dressed, gates: new Set(plan.gates.keys()), exits, hazards: hazards.dressed, interactables, backdrop: covered, sprites, lacking, notes };
  }

  /** The cosmetic motion of the pieces that have one (real seconds: scenery does not wait for a hit-stop). */
  update(dt: number): void {
    if (this.motions.length === 0) return;
    this.time += dt;
    for (const m of this.motions) {
      const t = this.time + m.phase;
      if (m.kind === 'sway') m.sprite.rotation = Math.sin(t * 0.9) * 0.035;
      else if (m.kind === 'pulse') m.sprite.alpha = m.baseAlpha * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.6)));
      else m.sprite.x = m.baseX + Math.sin(t * 0.25) * 0.8;
    }
  }

  /** Frees everything it drew and gives back every set it counted. A build that was still waiting for a scene is overtaken: it draws nothing more. */
  clear(): void {
    this.serial++;
    for (const r of this.roots.splice(0)) r.destroy({ children: true });
    for (const t of this.crops.values()) t.destroy(false);
    this.crops.clear();
    for (const def of this.taken.splice(0)) this.art.release(def);
    this.motions.length = 0;
    this.doors.clear();
  }

  destroy(): void {
    this.clear();
  }

  // ------------------------------------------------------------------------------------------------------- drawing

  private root(parent: Container, label: string): Container {
    const c = new Container({ label });
    parent.addChild(c);
    this.roots.push(c);
    return c;
  }

  private sprite(piece: Piece, frame: number): Sprite {
    return new Sprite(piece.frames[Math.min(piece.frames.length - 1, Math.max(0, frame))]!);
  }

  /** One rectangle of one cell of a piece of the room's data. */
  private draw(parent: Container, d: Draw, bySlot: ReadonlyMap<string, Piece>): number {
    const piece = bySlot.get(d.slot);
    if (!piece) return 0;
    const tex = piece.frames[d.frame] ?? piece.frames[0]!;
    let use: Texture | null = tex;
    // the clipped last cell of a repetition shows part of the frame, never a scaled one
    if (d.u0 > 0 || d.u1 < 1 || d.v0 > 0 || d.v1 < 1) {
      const ow = tex.orig.width;
      const oh = tex.orig.height;
      const keep = { x0: Math.round(d.u0 * ow), y0: Math.round(d.v0 * oh), x1: Math.round(d.u1 * ow), y1: Math.round(d.v1 * oh) };
      const key = `${tex.uid}|${keep.x0},${keep.y0},${keep.x1},${keep.y1}`;
      use = this.crops.get(key) ?? cropTexture(tex, keep);
      if (!use) return 0;
      this.crops.set(key, use);
    }
    const s = new Sprite(use);
    if (d.fit === 'stretch') {
      // a soft light: fitted to its rectangle, and added to what is behind it
      s.width = d.w;
      s.height = d.h;
      if (piece.look.blend === 'add') s.blendMode = 'add';
    } else s.scale.set(piece.mpp);
    s.position.set(d.x, viewY(d.top));
    parent.addChild(s);
    return 1;
  }

  /** One placement of a scene: the piece stands where the scene says, at its pivot. */
  private place(root: Container, piece: Piece | undefined, p: Placement): number {
    if (!piece) return 0;
    const s = this.sprite(piece, p.frame ?? 0);
    const k = piece.mpp * (p.scale ?? 1);
    s.anchor.set(piece.pivot[0], piece.pivot[1]);
    if (p.w !== undefined && p.h !== undefined) {
      // a soft piece fitted to the size the scene says (a veil along a stretch of ground)
      const kx = p.w / s.texture.orig.width;
      s.scale.set(p.flip ? -kx : kx, p.h / s.texture.orig.height);
    } else s.scale.set(p.flip ? -k : k, k);
    s.position.set(p.x, viewY(p.y));
    if (p.alpha !== undefined) s.alpha = p.alpha;
    if (p.tint !== undefined) s.tint = p.tint;
    if (piece.look.blend === 'add') s.blendMode = 'add';
    root.addChild(s);
    if (p.motion) this.motions.push({ sprite: s, kind: p.motion, phase: (p.x * 1.7 + p.y * 0.9) % (Math.PI * 2), baseAlpha: p.alpha ?? 1, baseX: p.x });
    return 1;
  }
}

/**
 * One interactable drawn by the art: its resting picture and, when the piece has a second frame, the LIT one over it. It follows what the views tell it every frame and
 * decides nothing — a floating pickup bobs and is gone once taken, a shrine pulses while it is the checkpoint, a lever dims once spent — the same behaviour as the blockout's mark.
 */
class ArtInteractable implements InteractableArt {
  readonly root: Container;
  readonly sprites: number;
  private readonly lit: Sprite | null;
  private readonly baseY: number;

  constructor(
    piece: Piece,
    private readonly place: InteractablePlacement,
  ) {
    this.root = new Container({ label: `art:interactable:${place.id}` });
    const rest = new Sprite(piece.frames[0]!);
    this.lit = piece.frames.length > 1 ? new Sprite(piece.frames[1]!) : null;
    for (const s of this.lit ? [rest, this.lit] : [rest]) {
      s.anchor.set(piece.pivot[0], piece.pivot[1]);
      s.scale.set(piece.mpp);
      this.root.addChild(s);
    }
    if (this.lit) this.lit.alpha = 0;
    if (piece.look.blend === 'add') for (const s of this.root.children) (s as Sprite).blendMode = 'add';
    this.baseY = viewY(place.y);
    this.root.position.set(place.x, this.baseY);
    this.sprites = this.lit ? 2 : 1;
  }

  update(time: number, available: boolean, lit: boolean, phase: number): void {
    const p = this.place;
    if (p.floats) {
      this.root.visible = available;
      this.root.y = this.baseY + Math.sin(time * 2.2 + phase) * 0.06;
      this.root.alpha = 0.88 + 0.12 * Math.sin(time * 3.1 + phase);
    } else if (p.kind !== 'rest') this.root.alpha = available ? 1 : 0.35;
    if (this.lit) this.lit.alpha = lit ? 0.85 + 0.15 * Math.sin(time * 2.4 + phase) : 0;
  }
}

export type { SceneLayer };
