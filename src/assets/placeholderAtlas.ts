import { PLACEHOLDER_LOOK, type BuiltPlaceholder, type PlaceholderFrame } from '@/presentation/placeholder';
import { createCanvas } from './proceduralTextures';

const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function drawFrame(ctx: CanvasRenderingContext2D, f: PlaceholderFrame, ppm: number, pivot: readonly [number, number]): void {
  const { body, hand, blade } = f.pose;
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
  // From here on the unit is the METRE, +x forward, +y up, origin on the feet centre.
  ctx.translate(f.x + pivot[0] * f.w, f.y + pivot[1] * f.h);
  ctx.scale(ppm, -ppm);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // body
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(-body.lean);
  const g = ctx.createLinearGradient(0, 0, 0, body.h);
  g.addColorStop(0, css(PLACEHOLDER_LOOK.body));
  g.addColorStop(1, css(PLACEHOLDER_LOOK.bodyLit));
  ctx.beginPath();
  ctx.roundRect(-body.w / 2, 0, body.w, body.h, Math.min(0.22, body.w / 2));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.04;
  ctx.strokeStyle = css(PLACEHOLDER_LOOK.outline);
  ctx.stroke();
  // facing notch (front, upper part)
  ctx.fillStyle = css(PLACEHOLDER_LOOK.notch);
  ctx.fillRect(body.w / 2 - 0.22, Math.max(0.2, body.h - 0.44), 0.18, 0.1);
  ctx.restore();

  // blade: dark under-stroke for readability, then the pale line
  const tipX = hand[0] + blade.length * Math.cos(blade.angle);
  const tipY = hand[1] + blade.length * Math.sin(blade.angle);
  ctx.beginPath();
  ctx.moveTo(hand[0], hand[1]);
  ctx.lineTo(tipX, tipY);
  ctx.lineWidth = 0.11;
  ctx.strokeStyle = css(PLACEHOLDER_LOOK.outline);
  ctx.stroke();
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = css(PLACEHOLDER_LOOK.blade);
  ctx.stroke();

  // hand marker = the sword grip
  ctx.beginPath();
  ctx.arc(hand[0], hand[1], 0.075, 0, Math.PI * 2);
  ctx.fillStyle = css(PLACEHOLDER_LOOK.hand);
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = css(PLACEHOLDER_LOOK.outline);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a procedural placeholder atlas with a 2D canvas (docs/GAME-SPEC-2D.md §2). VIEW layer: the pose tables, the
 * anchors and the (deliberately neutral) look are pure (`presentation/placeholder.ts`); this only turns them into
 * pixels.
 */
export function drawPlaceholderAtlas(built: BuiltPlaceholder): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(built.atlas.width, built.atlas.height);
  for (const f of built.frames) drawFrame(ctx, f, built.spec.artPxPerMeter, built.spec.pivot);
  return canvas;
}
