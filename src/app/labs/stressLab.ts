import { ColorMatrixFilter, Particle, ParticleContainer, Rectangle, Sprite, Texture } from 'pixi.js';
// The renderer starts WITHOUT Pixi's filter system (the game draws no filters, docs/PROMPT5-LOG.md S12): this lab does.
import 'pixi.js/filters';
import { canvasTexture, createCanvas, softGlowTexture, sparkTexture } from '@/assets/proceduralTextures';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import { Renderer2D } from '@/render/Renderer2D';

/**
 * Render-budget benchmark inside the real renderer (`?view=2d&lab=stress`), reproducing the audit's benchmark
 * (docs/AUDIT-2026-10.md §4: 800 animated sprites from ONE atlas) and adding what the real game will have:
 * parallax layers, one filter and an additive particle container. The criterion is ≤ 60 draw calls per frame.
 *
 *   ?n=800 sprites · ?particles=240 · ?filter=0 to drop the filter
 */
const FRAMES = 16;
const FRAME_PX = 64;

function makeAtlas(): { frames: Texture[] } {
  const { canvas, ctx } = createCanvas(FRAME_PX * 4, FRAME_PX * 4);
  for (let i = 0; i < FRAMES; i++) {
    const x = (i % 4) * FRAME_PX;
    const y = Math.floor(i / 4) * FRAME_PX;
    ctx.fillStyle = `hsl(${190 + i * 6},70%,${45 + (i % 4) * 5}%)`;
    ctx.beginPath();
    ctx.arc(x + 32, y + 32, 10 + (i % 4) * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 28, y + 6, 8, 8);
  }
  const base = Texture.from(canvas);
  const frames = Array.from({ length: FRAMES }, (_, i) => new Texture({ source: base.source, frame: new Rectangle((i % 4) * FRAME_PX, Math.floor(i / 4) * FRAME_PX, FRAME_PX, FRAME_PX) }));
  return { frames };
}

/** Large soft shapes standing in for scenery layers (one texture per layer, like real parallax art). */
function silhouetteTexture(seed: number, color: number): Texture {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    let s = seed;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    for (let i = 0; i < 14; i++) {
      const bw = 40 + rnd() * 120;
      const bh = 40 + rnd() * (h - 60);
      ctx.fillRect(rnd() * (w - bw), h - bh, bw, bh);
    }
  });
}

export async function startStressLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  const num = (k: string, d: number): number => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);
  const N = num('n', 800);
  const P = num('particles', 240);
  const useFilter = params.get('filter') !== '0';

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const r = await Renderer2D.create({ host, viewHeight: 13.5 });
  const L = r.layers;
  const WORLD_W = 80;

  // ---- four parallax layers, one texture each ----
  const layerDefs: Array<[typeof L.backdropFar, number, number]> = [
    [L.backdropFar, 11, PALETTE.worldNight],
    [L.backdropMid, 23, PALETTE.worldDeep],
    [L.backdropNear, 37, PALETTE.worldDusk],
    [L.foreground, 51, PALETTE.worldVoid],
  ];
  for (const [layer, seed, color] of layerDefs) {
    const tex = silhouetteTexture(seed, color);
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0, 1);
      s.scale.set(0.03);
      s.position.set(-20 + i * (WORLD_W / 3), viewY(-3));
      layer.addChild(s);
    }
  }

  // ---- 800 animated sprites from ONE atlas (the audit benchmark) ----
  const atlas = makeAtlas();
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const actors = Array.from({ length: N }, () => {
    const spr = new Sprite(atlas.frames[0]);
    spr.anchor.set(0.5);
    spr.scale.set(0.012);
    L.actors.addChild(spr);
    return { spr, x: rnd() * WORLD_W - 10, y: rnd() * 11 - 2, vx: (rnd() - 0.5) * 0.08, vy: (rnd() - 0.5) * 0.05, f: Math.floor(rnd() * FRAMES) };
  });

  // ---- additive particles in a ParticleContainer (one draw call) ----
  const sparkTex = sparkTexture(32);
  const pc = new ParticleContainer({ texture: sparkTex, dynamicProperties: { position: true, rotation: true, color: true } });
  pc.blendMode = 'add';
  L.fxWorld.addChild(pc);
  const parts = Array.from({ length: P }, () => {
    const p = new Particle({ texture: sparkTex, x: 0, y: 0, scaleX: 0.02, scaleY: 0.02, anchorX: 0.5, anchorY: 0.5, tint: PALETTE.energyCore, alpha: 0.9 });
    pc.addParticle(p);
    return { p, x: rnd() * WORLD_W - 10, y: rnd() * 10 - 2, vy: 0.01 + rnd() * 0.03 };
  });

  // ---- one filter on the light overlay (a few glows) ----
  const glow = softGlowTexture(128);
  for (let i = 0; i < 8; i++) {
    const g = new Sprite(glow);
    g.anchor.set(0.5);
    g.tint = PALETTE.energyGlow;
    g.alpha = 0.5;
    g.scale.set(0.06);
    g.position.set(i * 9, viewY(4));
    L.lightOverlay.addChild(g);
  }
  if (useFilter) {
    const f = new ColorMatrixFilter();
    f.saturate(1.15, true);
    L.lightOverlay.filters = [f];
  }

  let t = 0;
  const frame = (): void => {
    t++;
    for (const a of actors) {
      a.x += a.vx;
      a.y += a.vy;
      if (a.x < -10 || a.x > WORLD_W - 10) a.vx = -a.vx;
      if (a.y < -2 || a.y > 9) a.vy = -a.vy;
      if (t % 4 === 0) a.f = (a.f + 1) % FRAMES;
      a.spr.position.set(a.x, viewY(a.y));
      a.spr.texture = atlas.frames[a.f] as Texture;
    }
    for (const q of parts) {
      q.y += q.vy;
      if (q.y > 9) q.y = -2;
      q.p.x = q.x;
      q.p.y = viewY(q.y);
      q.p.rotation += 0.05;
    }
    // sweep the camera to exercise parallax
    const cx = 25 + Math.sin(t / 120) * 22;
    r.applyCamera({ x: cx, y: 3 }, { x: 0, y: 0, rollRad: 0 }, 13.5);
    counter.beginFrame();
    r.render();
    counter.endFrame();
    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', () => r.resize());
  const hooks = {
    ready: () => true,
    pause: () => undefined,
    resume: () => undefined,
    step: () => undefined,
    teleport: () => undefined,
    state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, sprites: N, particles: P, filter: useFilter, tick: t }),
  };
  (window as unknown as { __troid: typeof hooks }).__troid = hooks;
  r.resize();
  requestAnimationFrame(frame);
}
