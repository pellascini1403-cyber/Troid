import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { SpriteAssetManager, type LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { createPixiSpriteLoader } from '@/assets/spriteLoader';
import { PLAYER, PROCEDURAL_ATLASES, SPRITE_SETS } from '@/content';
import { PLAYER_ATTACKS } from '@/content/attacks';
import { PLAYER_VISUAL } from '@/content/visuals';
import { DrawCallCounter } from '@/debug/DrawCallCounter';
import { SWORD_GRIP_TOLERANCE } from '@/presentation/validateSpriteSet';
import { resolveAnchor } from '@/presentation/anchors';
import { canvasRect, ClipTimeline, metresPerArtPixel, rectHeight, rectWidth, visibleRect, type MetreRect } from '@/presentation/labModel';
import { PALETTE } from '@/presentation/palette';
import { clipFrameNames, type ClipDefinition } from '@/presentation/SpriteSetDefinition';
import { lackedClips, standInFor } from '@/presentation/visualSource';
import { ANCHOR_IDS, ANIM_STATES, ONE_SHOT_STATES, type AnchorId, type AnimPhase, type AnimState } from '@/presentation/vocabulary';
import { Renderer2D } from '@/render/Renderer2D';
import type { Art } from '../art';
import { artIndexUrl } from '../options';

/**
 * THE PLAYER LAB (`?lab=player`, docs/ART-PIPELINE-2D.md part G): the protagonist's art, looked at without playing. A clip at a time, frame by frame, with the
 * anchors drawn on it, the sword where the art says it is, the picture's own bounds, and — kept apart from the picture on purpose — the collision body, the
 * hurtbox and the hitbox the game really uses, so that what the art does and does not touch can be SEEN. The placeholder and the real art side by side, or one
 * at a time.
 *
 *   ?art=<folder>        the folder with the art (the lab reads `<folder>/index.json`; without it, the one the build found, or none)
 *   ?pack=…&set=…        look at another sprite set of the art library instead of the protagonist's (an enemy's, for instance)
 *   ?look=both|placeholder|art · ?clip=attack1 · ?play=0     the state the lab opens in
 *
 * It is a chunk of its own (no player downloads it), it changes nothing of the game (it never writes a view state to a simulation: it draws what it is told),
 * and `window.__playerLab` lets the E2E drive it.
 */
type Look = 'placeholder' | 'art' | 'both';
const FLAGS = ['anchors', 'sword', 'bounds', 'body', 'hurtbox', 'hitbox', 'grid', 'height', 'repeat'] as const;
type Flag = (typeof FLAGS)[number];

const FLAG_LABEL: Record<Flag, string> = {
  anchors: 'anchors', sword: 'sword (grip → tip)', bounds: 'picture bounds', body: 'collision body', hurtbox: 'hurtbox', hitbox: 'hitbox (the attack)', grid: 'grid 0.5 m', height: 'height guide',
  repeat: 'repeat clips that play once (the game plays them once)',
};

/** Which attack of the game a clip belongs to (what its hitbox is). */
const ATTACK_OF: Partial<Record<AnimState, string>> = { attack: 'slash_1', attack1: 'slash_1', attack2: 'slash_2', attackAir: 'air_slash', attackCrouch: 'crouch_slash' };

const css = `
.pl-panel{position:absolute;top:0;right:0;bottom:0;width:300px;box-sizing:border-box;padding:10px 12px;overflow:auto;background:#0b1220ee;color:#acccd9;font:12px/1.35 monospace;border-left:1px solid #212548}
.pl-panel h1{margin:0 0 8px;font-size:14px;color:#f7faff}
.pl-panel h2{margin:10px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#82bcd8}
.pl-panel button,.pl-panel select{font:inherit;color:#f7faff;background:#212548;border:1px solid #4f5d8c;border-radius:3px;padding:3px 7px;margin:0 2px 3px 0;cursor:pointer}
.pl-panel button[aria-pressed="true"]{background:#4f5d8c;border-color:#7fdaf2}
.pl-panel button:disabled{opacity:.4;cursor:default}
.pl-panel label{display:block;margin:1px 0}
.pl-panel pre{margin:6px 0 0;white-space:pre-wrap;font:11px/1.35 monospace;color:#acccd9}
.pl-panel .bad{color:#f4343d}.pl-panel .ok{color:#7fdaf2}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { testid?: string } = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] => {
  const { testid, ...rest } = props as Record<string, unknown> & { testid?: string };
  const e = Object.assign(document.createElement(tag), rest);
  if (testid) e.setAttribute('data-testid', testid);
  e.append(...kids);
  return e;
};

interface Cell {
  look: 'placeholder' | 'art';
  set: LoadedSpriteSet<Texture> | null;
  box: Container; // mirrored by the facing: everything of the picture and its overlay
  sprite: Sprite;
  overlay: Graphics;
  caption: Text;
  timeline: ClipTimeline | null;
}

export interface CellInfo {
  set: string;
  hasClip: boolean;
  frame: string | null;
  index: number;
  count: number;
  fps: number;
  loops: boolean;
  /** The state whose clip is on screen: the one asked for, or the one that stands in for it in this set (`attack1` for `attack`). */
  clip: AnimState | null;
  phase: AnimPhase;
  artPxPerMeter: number;
  visualScale: number;
  /** The picture's own bounds in metres from the feet (+y up): the whole canvas, and the part that was kept after the trim. */
  canvas: MetreRect | null;
  visible: MetreRect | null;
  anchors: Partial<Record<AnchorId, { x: number; y: number; fallback: boolean }>>;
  /** Distance between the hand and the grip in this frame (m); the contract wants ≤ 0.04. */
  gripFromHand: number | null;
}

const num = (params: URLSearchParams, k: string, d: number): number => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);

export async function startPlayerLab(host: HTMLElement, params: URLSearchParams): Promise<void> {
  // ---------------------------------------------------------------------------------------------------------------- the sets
  const sprites = new SpriteAssetManager<Texture>(createPixiSpriteLoader({ procedural: PROCEDURAL_ATLASES }), { validate: false });
  const placeholderDef = SPRITE_SETS[PLAYER.spriteSetId];
  if (!placeholderDef) throw new Error(`player sprite set "${PLAYER.spriteSetId}" is not in the content registry`);
  const placeholder = await sprites.acquire(placeholderDef);

  const counter = new DrawCallCounter();
  DrawCallCounter.install(counter);
  const renderer = await Renderer2D.create({ host, viewHeight: 13.5 });
  host.style.position = 'relative';

  // the art, when there is any: the same library the game uses, asked for by name (a lab asks for what it wants to look at)
  const packId = params.get('pack') ?? PLAYER_VISUAL.art.pack;
  const setId = params.get('set') ?? PLAYER_VISUAL.art.sprite;
  let art: LoadedSpriteSet<Texture> | null = null;
  let artNote = 'no art: open the lab with ?art=<folder>, or put art in art/ and run npm run assets:pack';
  const indexUrl = artIndexUrl(params.get('art') ?? undefined, __TROID_ART_INDEX__, document.baseURI);
  let library: Art | null = null;
  if (indexUrl) {
    // a lab wants to know why something did not load: the library's own notes, kept for the panel
    const notes: string[] = [];
    const { createArt } = await import('../art');
    library = createArt({ indexUrl, drawnPxPerMetre: () => renderer.viewport.ppm * renderer.viewport.resolution, dev: false, note: (m) => void notes.push(m) });
    art = await library.acquire(packId, setId);
    artNote = art ? `art: ${art.def.id} (${art.def.atlas})` : `no art for ${packId}/${setId}: ${notes.join('; ') || 'see the pack in the index'}`;
  }

  // ---------------------------------------------------------------------------------------------------------------- the stage
  const root = renderer.layers.screen;
  root.addChild(new Graphics().rect(0, 0, 4096, 4096).fill(PALETTE.worldNight));
  const PANEL = 300;
  const world = new Container({ label: 'lab-world' });
  root.addChild(world);

  const cells: Record<'placeholder' | 'art', Cell> = {
    placeholder: makeCell('placeholder', placeholder),
    art: makeCell('art', art),
  };
  function makeCell(look: 'placeholder' | 'art', set: LoadedSpriteSet<Texture> | null): Cell {
    const box = new Container({ label: `lab-${look}` });
    const sprite = new Sprite();
    const overlay = new Graphics();
    const caption = new Text({ text: '', style: { fill: PALETTE.worldGlow, fontSize: 12, fontFamily: 'monospace' } });
    caption.anchor.set(0.5, 0);
    box.addChild(sprite, overlay);
    world.addChild(box, caption);
    return { look, set, box, sprite, overlay, caption, timeline: null };
  }

  // ---------------------------------------------------------------------------------------------------------------- state
  const initialLook = params.get('look');
  let look: Look = initialLook === 'placeholder' || initialLook === 'art' || initialLook === 'both' ? initialLook : art ? 'both' : 'placeholder';
  if (!art && look !== 'placeholder') look = 'placeholder';
  const flags: Record<Flag, boolean> = { anchors: true, sword: true, bounds: true, body: true, hurtbox: false, hitbox: false, grid: false, height: true, repeat: true };
  let clip: AnimState = (ANIM_STATES as readonly string[]).includes(params.get('clip') ?? '') ? (params.get('clip') as AnimState) : 'idle';
  let scale = num(params, 'scale', 1);
  let facing: 1 | -1 = 1;
  let playing = params.get('play') !== '0';
  let speed = 1;
  let S = 100; // pixels per metre of the stage

  /** The clip that draws `state` in a set — its own, or the stand-in the game would use (`attack1` for `attack`) — and which state that is. */
  const clipOf = (set: LoadedSpriteSet<Texture> | null, state: AnimState): ClipDefinition | null => {
    const s = set ? standInFor(set.def, state) : null;
    return set && s ? set.def.clips[s] ?? null : null;
  };
  const clipStateOf = (set: LoadedSpriteSet<Texture> | null, state: AnimState): AnimState | null => (set ? standInFor(set.def, state) : null);
  const rebuildTimelines = (): void => {
    for (const cell of Object.values(cells)) {
      const c = clipOf(cell.set, clip);
      cell.timeline = c ? new ClipTimeline(c.count, c.fps ?? 12, flags.repeat || (c.loop ?? !ONE_SHOT_STATES.has(clipStateOf(cell.set, clip) ?? clip))) : null;
      if (cell.timeline) {
        cell.timeline.playing = playing;
        cell.timeline.speed = speed;
      }
    }
  };
  const phaseOf = (c: ClipDefinition | null, index: number): AnimPhase => {
    if (!c?.phases) return 'none';
    const inRange = (r: readonly [number, number]): boolean => index >= r[0] && index <= r[1];
    return inRange(c.phases.startup) ? 'startup' : inRange(c.phases.active) ? 'active' : inRange(c.phases.recovery) ? 'recovery' : 'none';
  };

  const visibleLooks = (): Array<'placeholder' | 'art'> => (look === 'both' ? (art ? ['placeholder', 'art'] : ['placeholder']) : look === 'art' ? (art ? ['art'] : ['placeholder']) : ['placeholder']);

  // ---------------------------------------------------------------------------------------------------------------- drawing
  const line = (g: Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1): void => void g.moveTo(x0, -y0).lineTo(x1, -y1).stroke({ width: 1, color, alpha, pixelLine: true });
  const rect = (g: Graphics, r: MetreRect, color: number, alpha = 1, fill = 0): void => {
    g.rect(r.x0, -r.y1, rectWidth(r), rectHeight(r));
    if (fill > 0) g.fill({ color, alpha: fill });
    g.rect(r.x0, -r.y1, rectWidth(r), rectHeight(r)).stroke({ width: 1, color, alpha, pixelLine: true });
  };

  const info = (cell: Cell): CellInfo | null => {
    const set = cell.set;
    if (!set) return null;
    const c = clipOf(set, clip);
    const tl = cell.timeline;
    const names = c ? clipFrameNames(c) : [];
    const index = tl?.index ?? 0;
    const frame = names[index] ?? null;
    const tex = frame ? set.textures.get(frame) : undefined;
    const def = set.def;
    const anchors: CellInfo['anchors'] = {};
    for (const id of ANCHOR_IDS) {
      const a = resolveAnchor(def, set.meta, frame, id);
      anchors[id] = { x: a.x, y: a.y, fallback: a.fallback };
    }
    const hand = anchors.hand_r;
    const grip = anchors.weapon_grip;
    return {
      set: def.id,
      hasClip: c !== null,
      frame,
      index,
      count: names.length,
      fps: c?.fps ?? 12,
      loops: c ? (c.loop ?? !ONE_SHOT_STATES.has(clipStateOf(set, clip) ?? clip)) : false,
      clip: clipStateOf(set, clip),
      phase: phaseOf(c, index),
      artPxPerMeter: def.artPxPerMeter,
      visualScale: (def.visualScale ?? 1) * scale,
      canvas: tex ? canvasRect({ ...def, visualScale: (def.visualScale ?? 1) * scale }, tex.orig.width, tex.orig.height) : null,
      visible: tex ? visibleRect({ ...def, visualScale: (def.visualScale ?? 1) * scale }, { width: tex.orig.width, height: tex.orig.height }, tex.trim ? { x: tex.trim.x, y: tex.trim.y, width: tex.trim.width, height: tex.trim.height } : null) : null,
      anchors,
      gripFromHand: hand && grip && !hand.fallback && !grip.fallback ? Math.hypot(grip.x - hand.x, grip.y - hand.y) : null,
    };
  };

  const redraw = (): void => {
    const shown = visibleLooks();
    const n = shown.length;
    const width = host.clientWidth - PANEL;
    const height = host.clientHeight;
    S = Math.max(40, Math.min(width / (n * 2.6), height / 3.4)); // a figure of ×1.5 still fits
    world.scale.set(S);
    for (const cell of Object.values(cells)) {
      const on = shown.includes(cell.look);
      cell.box.visible = on;
      cell.caption.visible = on;
      if (!on) continue;
      const slot = shown.indexOf(cell.look);
      const cx = ((slot + 0.5) * width) / n;
      const baseY = height * 0.88;
      cell.box.position.set(cx / S, baseY / S);
      cell.box.scale.x = facing;
      cell.caption.position.set(cx / S, (baseY + 8) / S);
      cell.caption.scale.set(1 / S);
      const set = cell.set;
      const c = info(cell);
      const g = cell.overlay;
      g.clear();
      if (!set || !c || !c.hasClip) {
        cell.sprite.visible = false;
        cell.caption.text = !set ? `${cell.look}: not loaded` : `${cell.look}: no clip "${clip}"`;
        // the guides still tell where the feet and the body are
        if (flags.grid) for (let x = -1.5; x <= 1.5; x += 0.5) line(g, x, 0, x, 2.5, PALETTE.worldDeep, 0.8);
        line(g, -1.6, 0, 1.6, 0, PALETTE.worldSlate);
        if (flags.body) rect(g, { x0: -PLAYER.body.halfWidth, x1: PLAYER.body.halfWidth, y0: 0, y1: PLAYER.body.height }, PALETTE.energyMid, 0.9);
        continue;
      }
      cell.sprite.visible = true;
      const def = set.def;
      const names = clipFrameNames(clipOf(set, clip)!);
      const tex = set.textures.get(names[c.index]!);
      if (tex) cell.sprite.texture = tex;
      cell.sprite.anchor.set(def.pivot[0], def.pivot[1]);
      cell.sprite.scale.set(metresPerArtPixel({ ...def, visualScale: (def.visualScale ?? 1) * scale }));
      cell.sprite.position.set(0, 0);

      if (flags.grid) {
        for (let x = -1.5; x <= 1.5; x += 0.5) line(g, x, 0, x, 2.5, PALETTE.worldDeep, 0.8);
        for (let y = 0.5; y <= 2.5; y += 0.5) line(g, -1.5, y, 1.5, y, PALETTE.worldDeep, 0.8);
      }
      line(g, -1.6, 0, 1.6, 0, PALETTE.worldSlate);
      if (flags.height) {
        line(g, 1.2, def.height, 1.5, def.height, PALETTE.worldHaze);
        line(g, 1.2, PLAYER.body.height, 1.5, PLAYER.body.height, PALETTE.energyMid, 0.7);
      }
      if (flags.bounds && c.canvas && c.visible) {
        rect(g, c.canvas, PALETTE.worldSlate, 0.9);
        rect(g, c.visible, PALETTE.worldGlow, 0.9);
      }
      if (flags.body) rect(g, { x0: -PLAYER.body.halfWidth, x1: PLAYER.body.halfWidth, y0: 0, y1: PLAYER.body.height }, PALETTE.energyMid, 0.9);
      if (flags.hurtbox) rect(g, { x0: -PLAYER.body.hurtbox.halfWidth, x1: PLAYER.body.hurtbox.halfWidth, y0: 0, y1: PLAYER.body.hurtbox.height }, PALETTE.accentWarm, 0.9);
      const attack = PLAYER_ATTACKS[ATTACK_OF[clip] ?? ''];
      if (flags.hitbox && attack) {
        const h = attack.hitbox;
        const r: MetreRect = { x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h };
        rect(g, r, PALETTE.whiteHot, c.phase === 'active' ? 1 : 0.35, c.phase === 'active' ? 0.25 : 0);
      }
      if (flags.sword) {
        const grip = c.anchors.weapon_grip!;
        const tip = c.anchors.weapon_tip!;
        const hand = c.anchors.hand_r!;
        line(g, grip.x, grip.y, tip.x, tip.y, PALETTE.energyCore);
        const ok = c.gripFromHand !== null && c.gripFromHand <= SWORD_GRIP_TOLERANCE;
        g.circle(grip.x, -grip.y, 0.035).stroke({ width: 1, color: ok ? PALETTE.energyCore : PALETTE.accentWarm, pixelLine: true });
        g.circle(hand.x, -hand.y, 0.02).fill(PALETTE.accentWarm);
      }
      if (flags.anchors) {
        for (const id of ANCHOR_IDS) {
          const a = c.anchors[id]!;
          g.circle(a.x, -a.y, id === 'feet' ? 0.025 : 0.018).fill({ color: a.fallback ? PALETTE.worldMist : id === 'head' ? PALETTE.energyCore : id === 'hand_r' ? PALETTE.accentWarm : PALETTE.whiteHot, alpha: a.fallback ? 0.6 : 1 });
        }
      }
      g.circle(0, 0, 0.02).fill(PALETTE.whiteHot);
      cell.caption.text = `${cell.look} · ${c.frame ?? '—'} (${c.index + 1}/${c.count})${c.phase !== 'none' ? ` · ${c.phase}` : ''}`;
    }
    report();
  };

  // ---------------------------------------------------------------------------------------------------------------- the panel
  const style = el('style', { textContent: css });
  const panel = el('div', { className: 'pl-panel', testid: 'lab-panel' });
  const title = el('h1', { textContent: 'Player lab' });
  const lookButtons = new Map<Look, HTMLButtonElement>();
  const lookRow = el('div');
  for (const l of ['placeholder', 'art', 'both'] as const) {
    const b = el('button', { textContent: l, testid: `lab-look-${l}`, disabled: l !== 'placeholder' && !art });
    b.addEventListener('click', () => setLook(l));
    lookButtons.set(l, b);
    lookRow.append(b);
  }
  const clipSelect = el('select', { testid: 'lab-clip' });
  const clipStates: AnimState[] = [...new Set<AnimState>([...PLAYER_VISUAL.required, ...(ANIM_STATES as readonly AnimState[])])];
  for (const s of clipStates) clipSelect.append(el('option', { value: s, textContent: s }));
  clipSelect.value = clip;
  clipSelect.addEventListener('change', () => setClip(clipSelect.value as AnimState));
  const prev = el('button', { textContent: '◀', testid: 'lab-prev', title: 'previous frame (←)' });
  const playBtn = el('button', { textContent: '❚❚', testid: 'lab-play', title: 'play / pause (space)' });
  const next = el('button', { textContent: '▶', testid: 'lab-next', title: 'next frame (→)' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  const speedSelect = el('select', { testid: 'lab-speed' });
  for (const v of [0.25, 0.5, 1, 2]) speedSelect.append(el('option', { value: String(v), textContent: `${v}×` }));
  speedSelect.value = '1';
  speedSelect.addEventListener('change', () => {
    speed = Number(speedSelect.value);
    for (const c of Object.values(cells)) if (c.timeline) c.timeline.speed = speed;
  });
  const flip = el('button', { textContent: 'mirror', testid: 'lab-flip' });
  flip.addEventListener('click', () => {
    facing = (facing === 1 ? -1 : 1) as 1 | -1;
    flip.setAttribute('aria-pressed', String(facing === -1));
    redraw();
  });
  const flagBoxes = new Map<Flag, HTMLInputElement>();
  const flagsBox = el('div');
  for (const f of FLAGS) {
    const input = el('input', { type: 'checkbox', checked: flags[f], testid: `lab-flag-${f}` });
    input.addEventListener('change', () => setFlag(f, input.checked));
    flagBoxes.set(f, input);
    flagsBox.append(el('label', {}, input, ` ${FLAG_LABEL[f]}`));
  }
  const scaleInput = el('input', { type: 'range', min: '0.5', max: '1.5', step: '0.05', value: String(scale), testid: 'lab-scale' });
  const scaleOut = el('span', { textContent: `×${scale.toFixed(2)}`, testid: 'lab-scale-out' });
  scaleInput.addEventListener('input', () => setScale(Number(scaleInput.value)));
  const scaleReset = el('button', { textContent: 'reset', testid: 'lab-scale-reset' });
  scaleReset.addEventListener('click', () => setScale(1));
  const infoPre = el('pre', { testid: 'lab-info' });
  const lacksPre = el('pre', { testid: 'lab-lacks' });
  panel.append(
    title,
    el('h2', { textContent: 'look' }), lookRow,
    el('h2', { textContent: 'animation' }), clipSelect, el('div', {}, prev, playBtn, next, speedSelect, flip),
    el('h2', { textContent: 'show' }), flagsBox,
    el('h2', { textContent: 'scale (the picture only)' }), el('div', {}, scaleInput, ' ', scaleOut, ' ', scaleReset),
    el('h2', { textContent: 'frame' }), infoPre,
    el('h2', { textContent: 'still to be drawn' }), lacksPre,
  );
  host.append(style, panel);

  // ---------------------------------------------------------------------------------------------------------------- actions
  const setLook = (l: Look): void => {
    look = l === 'art' && !art ? 'placeholder' : l === 'both' && !art ? 'placeholder' : l;
    redraw();
  };
  const setClip = (s: AnimState): void => {
    clip = s;
    clipSelect.value = s;
    rebuildTimelines();
    redraw();
  };
  const syncPlayButton = (): void => {
    playBtn.textContent = playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-pressed', String(!playing));
  };
  const play = (): void => {
    playing = true;
    for (const c of Object.values(cells)) c.timeline?.play();
    syncPlayButton();
  };
  const pause = (): void => {
    playing = false;
    for (const c of Object.values(cells)) if (c.timeline) c.timeline.playing = false;
    syncPlayButton();
    redraw();
  };
  const step = (delta: number): void => {
    playing = false;
    for (const c of Object.values(cells)) c.timeline?.step(delta);
    syncPlayButton();
    redraw();
  };
  const seek = (i: number): void => {
    playing = false;
    for (const c of Object.values(cells)) c.timeline?.seek(i);
    syncPlayButton();
    redraw();
  };
  const setFlag = (f: Flag, on: boolean): void => {
    flags[f] = on;
    const box = flagBoxes.get(f);
    if (box) box.checked = on;
    if (f === 'repeat') {
      // the same clip, played the other way: where it stood is kept
      const where = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.timeline?.index ?? 0]));
      rebuildTimelines();
      for (const [k, c] of Object.entries(cells)) c.timeline?.seek(where[k] ?? 0);
      if (playing) for (const c of Object.values(cells)) c.timeline?.play();
    }
    redraw();
  };
  const setScale = (v: number): void => {
    scale = Math.min(1.5, Math.max(0.5, v));
    scaleInput.value = String(scale);
    scaleOut.textContent = `×${scale.toFixed(2)}`;
    redraw();
  };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') (e.preventDefault(), playing ? pause() : play());
    else if (e.code === 'ArrowRight') step(1);
    else if (e.code === 'ArrowLeft') step(-1);
  });

  // ---------------------------------------------------------------------------------------------------------------- readout
  const fmt = (n: number): string => n.toFixed(2);
  const rectText = (r: MetreRect | null): string => (r ? `${fmt(rectWidth(r))} × ${fmt(rectHeight(r))} m` : '—');
  const lacks = (): AnimState[] => (art ? lackedClips(art.def, PLAYER_VISUAL.required) : [...PLAYER_VISUAL.required]);
  const report = (): void => {
    const lines: string[] = [];
    for (const l of visibleLooks()) {
      const c = info(cells[l]);
      if (!c) continue;
      lines.push(`${l} · ${c.set}`);
      if (!c.hasClip) {
        lines.push(`  no clip "${clip}"${l === 'art' ? ' → the game draws the placeholder here' : ''}`);
        continue;
      }
      lines.push(`  ${c.clip === clip ? clip : `${clip} ← ${c.clip}`} · ${c.frame} (${c.index + 1}/${c.count}) · ${c.fps} fps · ${c.loops ? 'loop' : 'once'}${c.phase !== 'none' ? ` · ${c.phase}` : ''}`);
      lines.push(`  ${c.artPxPerMeter} px/m · picture ×${fmt(c.visualScale)} · canvas ${rectText(c.canvas)} · kept ${rectText(c.visible)}`);
      const a = c.anchors;
      const p = (id: AnchorId): string => `(${fmt(a[id]!.x)}, ${fmt(a[id]!.y)})${a[id]!.fallback ? '*' : ''}`;
      lines.push(`  hand_r ${p('hand_r')} · grip ${p('weapon_grip')} · tip ${p('weapon_tip')}`);
      if (c.gripFromHand !== null) lines.push(`  sword: grip is ${fmt(c.gripFromHand)} m from the hand ${c.gripFromHand <= SWORD_GRIP_TOLERANCE ? '✓' : '✗ (the contract wants ≤ 0.04)'}`);
      else lines.push('  sword: no per-frame anchors (* = proportional fallback)');
    }
    lines.push(`body ${fmt(PLAYER.body.halfWidth * 2)} × ${fmt(PLAYER.body.height)} m · hurtbox ${fmt(PLAYER.body.hurtbox.halfWidth * 2)} × ${fmt(PLAYER.body.hurtbox.height)} m — not touched by scale`);
    infoPre.textContent = lines.join('\n');
    const lack = lacks();
    lacksPre.textContent = art ? (lack.length === 0 ? 'nothing: the protagonist is drawn entirely with the art' : `${lack.length} of ${PLAYER_VISUAL.required.length}: ${lack.join(', ')}`) : `${PLAYER_VISUAL.required.length} of ${PLAYER_VISUAL.required.length}: all (${artNote})`;
    for (const [l, b] of lookButtons) b.setAttribute('aria-pressed', String(look === l));
  };

  // ---------------------------------------------------------------------------------------------------------------- loop
  rebuildTimelines();
  syncPlayButton();
  let last = performance.now();
  let lastIndexes = '';
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) for (const c of Object.values(cells)) c.timeline?.advance(dt);
    const indexes = Object.values(cells).map((c) => c.timeline?.index ?? -1).join(',');
    if (indexes !== lastIndexes) {
      lastIndexes = indexes;
      redraw();
    }
    counter.beginFrame();
    renderer.render();
    counter.endFrame();
    requestAnimationFrame(frame);
  };

  const snapshot = (): Record<string, unknown> => ({
    look, clip, playing, speed, scale, facing, flags: { ...flags },
    cells: { placeholder: info(cells.placeholder), art: info(cells.art) },
    art: { loaded: art !== null, id: art?.def.id ?? null, provides: art ? Object.keys(art.def.clips) : [], lacks: lacks(), note: artNote },
    body: { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height, hurtbox: { ...PLAYER.body.hurtbox } },
    draws: counter.median,
  });
  const hooks = { ready: true, state: snapshot, setLook, setClip, play, pause, step, seek, setFlag, setScale };
  (window as unknown as { __playerLab: typeof hooks }).__playerLab = hooks;
  // the E2E harness waits on / pauses the same `__troid` surface as the game
  (window as unknown as { __troid: unknown }).__troid = { ready: () => true, pause: () => undefined, resume: () => undefined, step: () => undefined, teleport: () => undefined, state: () => ({ draws: counter.median, drawsMax: counter.max, calls: counter.median, tick: 0 }) };

  window.addEventListener('resize', () => {
    renderer.resize();
    redraw();
  });
  renderer.resize();
  redraw();
  requestAnimationFrame(frame);
}
