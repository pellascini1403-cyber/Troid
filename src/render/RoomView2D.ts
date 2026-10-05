import { Graphics } from 'pixi.js';
import { MATERIAL_FILL, PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { Layers } from './layers';

/**
 * Blockout of a room: flat, readable rectangles with a lit top edge. It is a PLACEHOLDER look (never the final
 * art): collision geometry comes from `RoomDefinition.solids`; final scenery will come from `RoomArtDefinition`.
 */
export class RoomView2D {
  private terrain: Graphics | null = null;

  constructor(private readonly layers: Layers) {}

  build(room: RoomDefinition): void {
    this.clear();
    const g = new Graphics();
    for (const s of room.solids) {
      const { x0, y0, x1, y1 } = s.rect;
      const fill = MATERIAL_FILL[s.material ?? 'stone'] ?? PALETTE.worldDusk;
      g.rect(x0, viewY(y1), x1 - x0, y1 - y0).fill({ color: fill, alpha: s.kind === 'oneway' ? 0.95 : 1 });
    }
    // lit top edges: the cue that tells the player where they can stand
    for (const s of room.solids) {
      const { x0, y1, x1 } = s.rect;
      g.rect(x0, viewY(y1), x1 - x0, 0.12).fill({ color: PALETTE.worldHaze, alpha: s.kind === 'oneway' ? 0.9 : 0.55 });
    }
    g.label = `room:${room.id}`;
    this.layers.terrain.addChild(g);
    this.terrain = g;
  }

  clear(): void {
    this.terrain?.destroy();
    this.terrain = null;
  }

  destroy(): void {
    this.clear();
  }
}
