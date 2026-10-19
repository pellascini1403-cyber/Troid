import { Container, Rectangle, Sprite, Texture, type ImageSource } from 'pixi.js';
import type { Rect } from '@/core/math';
import type { ArtLibrary } from '@/assets/artLibrary';
import { HALF_VIEW, PARALLAX_FACTOR, readEnvLook, readEnvTags, slotKey, type EnvLook } from '@/presentation/environment';
import { cropFrame, planHazards, planInteractables, planSeals, planStrip, planTerrain, type Draw, type InteractablePlacement, type PieceInfo, type PieceLookup, type SealPlacement } from '@/presentation/roomPlan';
import { GUARDIAN_PARTS, bossParts } from '@/presentation/bossArt';
import { ENEMY_PARTS, enemyParts, type EnemyPartName } from '@/presentation/enemyArt';
import { SCENE_LAYERS, placementShown, type Placement, type RoomScene, type SceneLayer } from '@/presentation/roomScene';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { viewY } from '@/presentation/worldTransform';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GuardianArt, GuardianArtPart } from './GuardianView';
import type { InteractableArt } from './InteractableViews';
import type { CreatureArt, CreatureArtPart } from './ProceduralActor';
import type { Layers } from './layers';
import type { SealArt } from './SealView';

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
  /** The sigils of the wards the art draws, by seal id: the seal's own view hangs each one and feeds it what the simulation says. */
  seals: ReadonlyMap<string, SealArt>;
  /** The bosses the art draws, by the `lookId` of their definition: each guardian's own view takes the parts and moves them (and keeps drawing itself with its shapes when the art has no parts for it). */
  guardians: ReadonlyMap<string, GuardianArt>;
  /** The ink creatures the art draws, by the `proceduralId` of their definition: each enemy's own view takes the parts and moves them (and keeps drawing itself with its shapes when the art has no parts for it). */
  creatures: ReadonlyMap<string, CreatureArt>;
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
  /** When the piece is shown only while a flag says so, how much of it is shown now (0 … 1): the motion multiplies its alpha by it. */
  gate?: Gate;
}

/** A piece of a scene that answers the world: it is shown while its flags say so (`Placement.whenSet` / `whenClear`) and fades in and out as they change. Only ever READS the flags. */
interface Gate {
  sprite: Sprite;
  piece: string;
  whenSet: string | undefined;
  whenClear: string | undefined;
  baseAlpha: number;
  /** 0 … 1: how shown it is. It is put at its target the first time it is evaluated (a room that opens with the boss fallen does not fade its dead eye in). */
  level: number;
  settled: boolean;
}

/** Seconds a gated piece takes to appear and to go. */
const GATE_FADE_IN = 0.9;
const GATE_FADE_OUT = 0.6;

const LAYER_OF_BLOCKOUT: Readonly<Record<string, string>> = { backdropFar: 'far', backdropMid: 'mid', backdropNear: 'near', foreground: 'front' };
/** The camera shows at most this much above and below the room's camera range. */
const VIEW_MARGIN_Y = 10;
const FOREGROUND_FACTOR = PARALLAX_FACTOR.foreground;

const pad2 = (i: number): string => String(i).padStart(2, '0');

/** The pictures of the `idle` clip of a loaded sprite set, in order; `null` when the clip is not there or a frame is missing (a piece with a hole in it is not drawn). */
function idleFrames(set: { def: SpriteSetDefinition; textures: ReadonlyMap<string, Texture> }): Texture[] | null {
  const idle = set.def.clips['idle'];
  if (!idle) return null;
  const frames: Texture[] = [];
  for (let i = 0; i < idle.count; i++) {
    const t = set.textures.get(`${idle.frames}${pad2(i)}`);
    if (t) frames.push(t);
  }
  return frames.length === idle.count ? frames : null;
}

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
  private readonly gates: Gate[] = [];
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

  /**
   * Draws the room from the art the zone policy holds, once its scenes are read. Resolves with what it covers, or `null` when there is nothing to draw it with (no environment pack in
   * memory, or a newer `build` overtook this one). WHOLE or not at all: the room's own pieces and the scene's layers go onto the stage in the same step, so the room is never seen half-dressed
   * (the ground and a few props first, the rest a moment later).
   */
  async build(room: RoomDefinition): Promise<RoomArtCoverage | null> {
    // clearing overtakes any build still in flight (it resolves with `null` and draws nothing more): the build that follows is the only one that counts
    this.clear();
    const mine = ++this.serial;
    const packs = this.art.heldPacks('environment');
    if (packs.length === 0) return null;
    const scenes = await Promise.all(packs.map((p) => this.art.scene(p.pack.id, room.id).then((scene) => ({ pack: p.pack.id, scene }))));
    if (mine !== this.serial) return null;
    return this.compose(room, packs, scenes);
  }

  /**
   * The same drawing, in this very call: possible when every environment pack of the zone is in memory AND the scene it has for the room has been read —
   * which is what a change of zone waits for (`ArtLibrary.readScenes`). A room dressed this way is whole on the first frame it is drawn. `undefined` when something is not in memory yet (nothing is touched: use `build`),
   * `null` when the zone has no environment art at all.
   */
  buildNow(room: RoomDefinition): RoomArtCoverage | null | undefined {
    const packs = this.art.heldPacks('environment');
    if (packs.length === 0) return undefined;
    const scenes: Array<{ pack: string; scene: RoomScene | null }> = [];
    for (const p of packs) {
      const scene = this.art.sceneNow(p.pack.id, room.id);
      if (scene === undefined) return undefined;
      scenes.push({ pack: p.pack.id, scene });
    }
    this.clear();
    ++this.serial;
    return this.compose(room, packs, scenes);
  }

  /** Puts the whole picture of the room on the stage. Synchronous: there is no moment in which only part of it is there. */
  private compose(room: RoomDefinition, packs: ReturnType<Art['heldPacks']>, scenes: ReadonlyArray<{ pack: string; scene: RoomScene | null }>): RoomArtCoverage {
    // ---- the pieces: every sprite set of the packs in memory, by what its tags say it is
    const bySlot = new Map<string, Piece>();
    const byName = new Map<string, Piece>();
    for (const info of packs) {
      for (const sprite of info.pack.sprites) {
        const set = this.art.acquireLoaded(info.pack.id, sprite.id);
        if (!set) continue;
        this.taken.push(set.def);
        const frames = idleFrames(set);
        if (!frames) continue;
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

    // ---- the wards: the sigil of each seal (the seal is an entity: its own view hangs this picture on itself and moves it)
    const seals = new Map<string, SealArt>();
    const sigil = [...bySlot.entries()].find(([key]) => key.startsWith('seal::'))?.[1];
    const ward = planSeals(room.seals ?? [], info(sigil));
    if (sigil) {
      for (const p of ward.placements) {
        const art = new ArtSeal(sigil, p);
        this.roots.push(art.root);
        seals.set(p.id, art);
        sprites += art.sprites;
      }
    }
    for (const [slot, ids] of ward.lacking) lacking.set(slot, ids);

    // ---- the bosses: the parts of each guardian the zone holds art for (the guardian is an entity: its own view takes the parts and moves them). Every part, or none: a boss is never half-painted
    const guardians = new Map<string, GuardianArt>();
    for (const info of this.art.heldPacks('enemies')) {
      for (const [look, names] of bossParts(info.pack.sprites)) {
        if (GUARDIAN_PARTS.some((p) => !names.has(p))) continue;
        const got: Partial<Record<(typeof GUARDIAN_PARTS)[number], GuardianArtPart>> = {};
        for (const part of GUARDIAN_PARTS) {
          const set = this.art.acquireLoaded(info.pack.id, names.get(part)!);
          if (!set) break;
          this.taken.push(set.def);
          const frames = idleFrames(set);
          if (!frames) break;
          got[part] = { frames, mpp: (set.def.visualScale ?? 1) / set.def.artPxPerMeter, pivot: set.def.pivot };
        }
        if (GUARDIAN_PARTS.every((p) => got[p])) guardians.set(look, got as GuardianArt);
      }
    }

    // ---- the creatures: the parts of each ordinary enemy the zone holds art for (an enemy is an entity: its own view takes the parts and moves them). Every part, or none: a creature is never half-painted
    const creatures = new Map<string, CreatureArt>();
    for (const info of this.art.heldPacks('enemies')) {
      for (const [look, names] of enemyParts(info.pack.sprites)) {
        if (ENEMY_PARTS.some((p) => !names.has(p))) continue;
        const got: Partial<Record<EnemyPartName, CreatureArtPart>> = {};
        let eyesAt: readonly [number, number] | null = null;
        let sigilAt: readonly [number, number] | null = null;
        for (const part of ENEMY_PARTS) {
          const set = this.art.acquireLoaded(info.pack.id, names.get(part)!);
          if (!set) break;
          this.taken.push(set.def);
          const frames = idleFrames(set);
          if (!frames) break;
          const mpp = (set.def.visualScale ?? 1) / set.def.artPxPerMeter;
          got[part] = { frames, mpp, pivot: set.def.pivot };
          // the body says where its eyes (`head`) and its sigil (`vfx_origin`) stand
          if (part === 'body') {
            const k = set.def.visualScale ?? 1;
            const head = set.def.anchors?.head;
            const origin = set.def.anchors?.vfx_origin;
            if (head) eyesAt = [head[0] * k, head[1] * k];
            if (origin) sigilAt = [origin[0] * k, origin[1] * k];
          }
        }
        if (ENEMY_PARTS.every((p) => got[p]) && eyesAt && sigilAt) creatures.set(look, { ...(got as Record<EnemyPartName, CreatureArtPart>), eyesAt, sigilAt });
      }
    }

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

    // ---- the scenes: where the packs put their pieces behind and in front of the action
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
    return { solids: plan.dressed, gates: new Set(plan.gates.keys()), exits, hazards: hazards.dressed, interactables, seals, guardians, creatures, backdrop: covered, sprites, lacking, notes };
  }

  /**
   * The cosmetic motion of the pieces that have one, and the answer of the pieces that follow a flag of the world (real seconds: scenery does not wait for a hit-stop). `isSet` is how the view READS
   * the world's flags — it never writes one.
   */
  update(dt: number, isSet?: (flag: string) => boolean): void {
    if (isSet && this.gates.length > 0) this.follow(dt, isSet);
    if (this.motions.length === 0) return;
    this.time += dt;
    for (const m of this.motions) {
      const t = this.time + m.phase;
      if (m.kind === 'sway') m.sprite.rotation = Math.sin(t * 0.9) * 0.035;
      else if (m.kind === 'pulse') m.sprite.alpha = m.baseAlpha * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.6))) * (m.gate?.level ?? 1);
      else m.sprite.x = m.baseX + Math.sin(t * 0.25) * 0.8;
    }
  }

  /** The pieces that follow a flag, and how shown each is now (for the tests and the debug panel). */
  gated(): ReadonlyArray<{ piece: string; level: number }> {
    return this.gates.map((g) => ({ piece: g.piece, level: g.level }));
  }

  private follow(dt: number, isSet: (flag: string) => boolean): void {
    for (const g of this.gates) {
      const target = placementShown(g, isSet) ? 1 : 0;
      if (!g.settled) {
        g.level = target;
        g.settled = true;
      } else if (g.level !== target) {
        const step = dt / (target > g.level ? GATE_FADE_IN : GATE_FADE_OUT);
        g.level = target > g.level ? Math.min(target, g.level + step) : Math.max(target, g.level - step);
      }
      g.sprite.visible = g.level > 0.002;
      // a pulsing piece takes its alpha from its motion (which multiplies by the level); the others take it here
      if (!this.motions.some((m) => m.sprite === g.sprite && m.kind === 'pulse')) g.sprite.alpha = g.baseAlpha * g.level;
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
    this.gates.length = 0;
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
    // a piece that answers a flag starts hidden and is shown (or not) the first time the flags are read
    let gate: Gate | undefined;
    if (p.whenSet !== undefined || p.whenClear !== undefined) {
      gate = { sprite: s, piece: p.sprite, whenSet: p.whenSet, whenClear: p.whenClear, baseAlpha: p.alpha ?? 1, level: 0, settled: false };
      s.visible = false;
      s.alpha = 0;
      this.gates.push(gate);
    }
    if (p.motion) this.motions.push({ sprite: s, kind: p.motion, phase: (p.x * 1.7 + p.y * 0.9) % (Math.PI * 2), baseAlpha: p.alpha ?? 1, baseX: p.x, ...(gate ? { gate } : {}) });
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

/**
 * The sigil of a ward as the art draws it: the picture hanging (with its halo painted in) and, when the piece has a second frame, the FLASH of a blow that was turned away over it. It breathes,
 * flinches and swells the way the blockout's shapes do — the same numbers — and decides nothing.
 */
class ArtSeal implements SealArt {
  readonly root: Container;
  readonly sprites: number;
  private readonly body: Sprite;
  private readonly flash: Sprite | null;

  constructor(piece: Piece, place: SealPlacement) {
    this.root = new Container({ label: `art:seal:${place.id}` });
    this.body = new Sprite(piece.frames[0]!);
    this.flash = piece.frames.length > 1 ? new Sprite(piece.frames[1]!) : null;
    for (const s of this.flash ? [this.body, this.flash] : [this.body]) {
      s.anchor.set(piece.pivot[0], piece.pivot[1]);
      s.scale.set(piece.mpp);
      this.root.addChild(s);
    }
    if (this.flash) this.flash.alpha = 0;
    this.sprites = this.flash ? 2 : 1;
  }

  update(v: { readonly rejected: number; readonly opacity: number; readonly broken: boolean }, clock: number): void {
    if (this.root.destroyed) return;
    const breathe = 1 + 0.06 * Math.sin(clock * 3.2);
    const swell = v.broken ? 1 + (1 - v.opacity) * 0.8 : 1;
    // a blow that is turned away makes it flinch
    const k = breathe * swell * (1 - v.rejected * 0.12);
    this.root.scale.set(k);
    if (this.flash) this.flash.alpha = v.rejected * 0.9 * v.opacity;
  }
}

export type { SceneLayer };
