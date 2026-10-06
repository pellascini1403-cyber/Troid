import { Container, Graphics } from 'pixi.js';
import { clamp01 } from '@/core/math';
import { MATERIAL_FILL, PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { buildBackdrop } from './backdrops';
import type { Layers } from './layers';

/** Seconds a door takes to dissolve when its flag is set. */
const GATE_FADE_SECONDS = 0.6;

interface GateView {
  readonly graphics: Graphics;
  /** 1 = closed and fully drawn, 0 = open and gone. */
  alpha: number;
  target: 0 | 1;
}

/**
 * Blockout of a room: flat, readable rectangles with a lit top edge, a provisional parallax backdrop and a light shaft over
 * each way out. It is a PLACEHOLDER look (never the final art): collision geometry comes from `RoomDefinition.solids`; final
 * scenery will come from `RoomArtDefinition`.
 *
 * A gate is one of the room's solids drawn on its own, so it can dissolve when the flag that opens it is set: the view only
 * follows `gate:changed`, it never decides anything (the collider is switched off by the simulation).
 */
export class RoomView2D {
  private terrain: Graphics | null = null;
  private readonly gates = new Map<string, GateView>();
  private readonly extras: Container[] = [];

  constructor(private readonly layers: Layers) {}

  /** Builds the room's look. `isOpen` says which gates start open (a beaten guardian stays beaten across a reload). */
  build(room: RoomDefinition, isOpen: (gateId: string) => boolean = () => false): void {
    this.clear();
    const gateSolids = new Map((room.gates ?? []).map((g) => [g.solid, g.id]));

    const g = new Graphics();
    const solids = room.solids.filter((s) => !gateSolids.has(s.id));
    for (const s of solids) {
      const { x0, y0, x1, y1 } = s.rect;
      const fill = MATERIAL_FILL[s.material ?? 'stone'] ?? PALETTE.worldDusk;
      g.rect(x0, viewY(y1), x1 - x0, y1 - y0).fill({ color: fill, alpha: s.kind === 'oneway' ? 0.95 : 1 });
    }
    // lit top edges: the cue that tells the player where they can stand
    for (const s of solids) {
      const { x0, y1, x1 } = s.rect;
      g.rect(x0, viewY(y1), x1 - x0, 0.12).fill({ color: PALETTE.worldHaze, alpha: s.kind === 'oneway' ? 0.9 : 0.55 });
    }
    g.label = `room:${room.id}`;
    this.layers.terrain.addChild(g);
    this.terrain = g;

    for (const gate of room.gates ?? []) {
      const solid = room.solids.find((s) => s.id === gate.solid);
      if (!solid) continue;
      const view = solid.material === 'seal' ? drawSealDoor(solid.rect) : drawDoor(solid.rect);
      view.label = `gate:${gate.id}`;
      const open = isOpen(gate.id);
      view.alpha = open ? 0 : 1;
      view.visible = !open;
      this.layers.terrain.addChild(view);
      this.gates.set(gate.id, { graphics: view, alpha: open ? 0 : 1, target: open ? 0 : 1 });
    }

    // the zones that hurt: spikes, drawn with the terrain (they never change, so there is nothing to update)
    for (const h of room.hazards ?? []) {
      const spikes = drawSpikes(h.rect);
      spikes.label = `hazard:${h.id}`;
      this.layers.terrain.addChild(spikes);
      this.extras.push(spikes);
    }

    for (const x of room.exits ?? []) {
      const shaft = drawExitShaft(x.rect);
      shaft.label = `exit:${x.id}`;
      this.layers.lightOverlay.addChild(shaft);
      this.extras.push(shaft);
    }

    if (room.art) {
      for (const layer of buildBackdrop(room.art.backdrop, this.layers, { bounds: room.bounds, seed: room.art.seed ?? 1 })) this.extras.push(layer);
    }
  }

  /** A gate opened or closed: the door dissolves or comes back over `GATE_FADE_SECONDS` (see `update`). */
  setGateOpen(gateId: string, open: boolean): void {
    const g = this.gates.get(gateId);
    if (!g) return;
    g.target = open ? 0 : 1;
    g.graphics.visible = true;
  }

  /** How drawn a gate is: 1 closed, 0 gone (E2E and debug). */
  gateAlpha(gateId: string): number | undefined {
    return this.gates.get(gateId)?.alpha;
  }

  /** Once per rendered frame, in REAL seconds (scenery changes do not wait for a hit-stop). */
  update(dt: number): void {
    for (const g of this.gates.values()) {
      if (g.alpha === g.target) continue;
      const step = dt / GATE_FADE_SECONDS;
      g.alpha = g.target > g.alpha ? Math.min(g.target, g.alpha + step) : Math.max(g.target, g.alpha - step);
      g.graphics.alpha = clamp01(g.alpha);
      if (g.alpha === 0) g.graphics.visible = false;
    }
  }

  clear(): void {
    this.terrain?.destroy();
    this.terrain = null;
    for (const g of this.gates.values()) g.graphics.destroy();
    this.gates.clear();
    for (const e of this.extras.splice(0)) e.destroy();
  }

  destroy(): void {
    this.clear();
  }
}

/**
 * The door of a gate: a stone slab with a violet SEAL down its middle — the ink that binds it to its guardian (docs/GAME-SPEC-2D.md
 * §3.4: violet belongs to the enemies). It dissolves when the guardian is gone.
 */
function drawDoor(r: { x0: number; y0: number; x1: number; y1: number }): Graphics {
  const g = new Graphics();
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  g.rect(r.x0, viewY(r.y1), w, h).fill(MATERIAL_FILL.gate ?? PALETTE.worldMist);
  g.rect(r.x0, viewY(r.y1), w, 0.12).fill({ color: PALETTE.worldHaze, alpha: 0.55 });
  // the seal: a vertical band with glyph ticks, in the enemy's violet
  const cx = r.x0 + w / 2;
  g.rect(cx - 0.09, viewY(r.y1 - 0.6), 0.18, h - 0.6).fill({ color: PALETTE.violetCore, alpha: 0.75 });
  for (let y = 1.2; y < h - 1; y += 1.5) g.rect(cx - 0.4, viewY(y), 0.8, 0.1).fill({ color: PALETTE.violetGlow, alpha: 0.6 });
  g.rect(cx - 0.3, viewY(r.y1 - 0.6), 0.6, h - 0.6).fill({ color: PALETTE.violetCore, alpha: 0.12 });
  return g;
}

/**
 * The door a SEAL holds (docs/PROMPT6-LOG.md S28): not stone but a curtain of violet ink from the floor up — a dark body, bright edges, rungs
 * of glyphs and drips that run down from the top. It dissolves when the ward is broken, like any door. PLACEHOLDER: flat shapes, deterministic.
 */
function drawSealDoor(r: { x0: number; y0: number; x1: number; y1: number }): Graphics {
  const g = new Graphics();
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  g.rect(r.x0, viewY(r.y1), w, h).fill({ color: PALETTE.violetDeep, alpha: 0.9 });
  g.rect(r.x0 + w * 0.25, viewY(r.y1), w * 0.5, h).fill({ color: PALETTE.enemyInk, alpha: 0.45 });
  g.rect(r.x0, viewY(r.y1), 0.1, h).fill({ color: PALETTE.violetCore, alpha: 0.85 });
  g.rect(r.x1 - 0.1, viewY(r.y1), 0.1, h).fill({ color: PALETTE.violetCore, alpha: 0.85 });
  for (let y = 0.7; y < h - 0.4; y += 1.15) g.rect(r.x0 + 0.18, viewY(y), w - 0.36, 0.07).fill({ color: PALETTE.violetGlow, alpha: 0.4 });
  // ink that runs down from the top: tapering drips of fixed, different lengths
  for (const [f, len] of [[0.2, 1.6], [0.5, 2.6], [0.78, 1.1]] as const) {
    const x = r.x0 + w * f;
    g.poly([x - 0.07, viewY(r.y1), x + 0.07, viewY(r.y1), x, viewY(r.y1 - len)]).fill({ color: PALETTE.violetCore, alpha: 0.7 });
  }
  return g;
}

/** A soft column of pale light over a way out: stacked translucent bands, brightest at the floor, additive. */
function drawExitShaft(r: { x0: number; y0: number; x1: number; y1: number }): Graphics {
  const g = new Graphics();
  const h = r.y1 - r.y0 + 6;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // each band covers from the floor up to a lower and lower height, so the light fades toward the top
    const bandH = h * (1 - t * 0.9);
    g.rect(r.x0, viewY(r.y0 + bandH), r.x1 - r.x0, bandH).fill({ color: PALETTE.energyGlow, alpha: 0.035 });
  }
  g.rect(r.x0, viewY(r.y0 + h * 0.8), 0.07, h * 0.8).fill({ color: PALETTE.whiteHot, alpha: 0.35 });
  g.rect(r.x1 - 0.07, viewY(r.y0 + h * 0.8), 0.07, h * 0.8).fill({ color: PALETTE.whiteHot, alpha: 0.35 });
  g.blendMode = 'add';
  return g;
}

/**
 * Spikes: a row of dark thorns with a lit tip and a faint violet haze at their foot — the colour of what hurts (docs/GAME-SPEC-2D.md §3.4).
 * A PLACEHOLDER shape from the zone's rectangle: about 0.45 m per thorn, as tall as the zone.
 */
function drawSpikes(r: { x0: number; y0: number; x1: number; y1: number }): Graphics {
  const g = new Graphics();
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const n = Math.max(1, Math.round(w / 0.45));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = r.x0 + i * sw;
    g.poly([x0, viewY(r.y0), x0 + sw / 2, viewY(r.y1), x0 + sw, viewY(r.y0)]).fill({ color: PALETTE.enemyInk });
    g.poly([x0 + sw * 0.34, viewY(r.y0 + h * 0.6), x0 + sw / 2, viewY(r.y1), x0 + sw * 0.66, viewY(r.y0 + h * 0.6)]).fill({ color: PALETTE.violetGlow, alpha: 0.85 });
  }
  g.rect(r.x0, viewY(r.y0 + 0.14), w, 0.14).fill({ color: PALETTE.violetCore, alpha: 0.35 });
  return g;
}
