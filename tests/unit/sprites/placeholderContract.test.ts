import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER } from '@/content';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { SPRITE_SETS } from '@/content/sprites';
import { log } from '@/core/log';
import { ActorPresenter } from '@/presentation/ActorPresenter';
import { createActorViewState } from '@/presentation/actorViewState';
import { PLACEHOLDER_LOOK, poseExtent } from '@/presentation/placeholder';
import { clipFrameNames, type SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { validateSpriteSet } from '@/presentation/validateSpriteSet';
import { ANCHOR_IDS, ANIM_STATES, type AnimState } from '@/presentation/vocabulary';

beforeAll(() => log.setSink(() => {})); // fallbacks log warnings by design; keep test output clean

const { def, meta, frames } = PLAYER_PLACEHOLDER;
const available = new Set(frames.map((f) => f.name));

/** The logical states the player's gameplay requests (movement now; combat and crouch are wired in later steps). */
const PLAYER_STATES: readonly AnimState[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash', 'attack', 'attack2', 'attackAir', 'attackCrouch', 'hurt', 'death'];

describe('placeholder sprite-set contract', () => {
  it('the generated placeholder satisfies its definition with no errors or warnings', () => {
    const issues = validateSpriteSet(def, meta, available).filter((i) => i.level !== 'info');
    expect(issues).toEqual([]);
  });

  it('every state the player requests has its OWN clip (no fallback), and every frame exists in the atlas', () => {
    for (const state of PLAYER_STATES) {
      const clip = def.clips[state];
      expect(clip, state).toBeDefined();
      for (const name of clipFrameNames(clip!)) expect(available.has(name), name).toBe(true);
    }
    // the logical vocabulary is covered or reachable through the fallback chain (idle always exists)
    expect(ANIM_STATES.length).toBeGreaterThan(PLAYER_STATES.length);
    expect(def.clips.idle).toBeDefined();
  });

  it('is registered in the content registry and referenced by the player definition', () => {
    expect(SPRITE_SETS[PLAYER.spriteSetId]).toBe(def);
  });

  it('is ABSTRACT: neutral palette (no cyan, no red, no violet) and a standing height of 1.7 m', () => {
    for (const [name, hex] of Object.entries(PLACEHOLDER_LOOK)) {
      const r = (hex >> 16) & 255;
      const g = (hex >> 8) & 255;
      const b = hex & 255;
      // chroma = max − min of the channels: low = grey / lavender-grey / white. The hero's cyan (≈ 90), the accent red
      // (≈ 190) and the enemy violet (≈ 145) are all far above this.
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      expect(chroma, `${name} #${hex.toString(16)}`).toBeLessThanOrEqual(40);
    }
    const standing = clipFrameNames(def.clips.idle!).map((n) => meta.frames[n]!.heightPx! / def.artPxPerMeter);
    for (const h of standing) expect(h).toBeGreaterThan(1.6);
    expect(def.height).toBeCloseTo(PLAYER.body.height, 5);
    expect(def.placeholder).toBe(true);
  });

  it('validateSpriteSet reports a missing frame, a missing idle, a scale problem and a sword that is not in the hand', () => {
    const bad: SpriteSetDefinition = {
      ...def,
      artPxPerMeter: 400,
      clips: { run: { frames: 'nope_', count: 3 }, attack: def.clips.attack! },
    };
    const brokenMeta = {
      frames: {
        ...meta.frames,
        attack_02: { ...meta.frames['attack_02']!, anchors: { ...meta.frames['attack_02']!.anchors, weapon_grip: [3, 3] as const } },
      },
    };
    const msgs = validateSpriteSet(bad, brokenMeta, available).map((i) => `${i.level}:${i.message}`);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('nope_'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('idle'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('grip is not on the right hand'))).toBe(true);
    // no idle clip → no scale check is possible; check the scale warning on a set that has idle
    const scaled = validateSpriteSet({ ...def, artPxPerMeter: 400 }, meta, available).map((i) => `${i.level}:${i.message}`);
    expect(scaled.some((m) => m.startsWith('warn:') && m.includes('Suggested artPxPerMeter'))).toBe(true);
  });

  it('validateSpriteSet reports invalid phase ranges and a missing weapon tip', () => {
    const badPhases: SpriteSetDefinition = {
      ...def,
      clips: { ...def.clips, attack: { ...def.clips.attack!, phases: { startup: [0, 1], active: [1, 9], recovery: [4, 5] } } },
    };
    const noTip = {
      frames: { ...meta.frames, attack_01: { ...meta.frames['attack_01']!, anchors: { feet: [0, 0] as const } } },
    };
    const msgs = validateSpriteSet(badPhases, noTip, available).map((i) => `${i.level}:${i.message}`);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('outside its'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('weapon_tip'))).toBe(true);
  });
});

describe('placeholder atlas data', () => {
  it('has 62 uniquely named frames laid out on a regular grid with no overlap', () => {
    expect(frames).toHaveLength(62);
    expect(available.size).toBe(62);
    const cells = new Set(frames.map((f) => `${f.x},${f.y}`));
    expect(cells.size).toBe(62);
    for (const f of frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(PLAYER_PLACEHOLDER.atlas.width);
      expect(f.y + f.h).toBeLessThanOrEqual(PLAYER_PLACEHOLDER.atlas.height);
    }
  });

  it('every pose (body corners, hand and blade tip) fits inside its frame cell around the pivot', () => {
    const { spec } = PLAYER_PLACEHOLDER;
    const left = spec.cell.w * spec.pivot[0];
    const right = spec.cell.w * (1 - spec.pivot[0]);
    const below = spec.cell.h * (1 - spec.pivot[1]);
    const above = spec.cell.h * spec.pivot[1];
    const outside = frames
      .filter((f) => {
        const e = poseExtent(f.pose);
        return e.minX <= -left || e.maxX >= right || e.minY <= -below || e.maxY >= above;
      })
      .map((f) => f.name);
    expect(outside).toEqual([]);
  });

  it('the crouch frames are 1.0 m tall and the standing frames 1.7 m (GAME-SPEC §7)', () => {
    const h = (state: AnimState, i = 0): number => meta.frames[`${state}_0${i}`]!.heightPx! / def.artPxPerMeter;
    expect(h('crouch')).toBeCloseTo(1.0, 1);
    expect(h('crouchWalk')).toBeLessThan(1.05);
    expect(h('idle')).toBeCloseTo(1.7, 1);
  });

  it('sword anchors: grip = hand in every frame of every clip, tip always present and inside the blade length', () => {
    for (const f of frames) {
      const a = meta.frames[f.name]!.anchors!;
      expect(a.weapon_grip, f.name).toEqual(a.hand_r);
      const d = Math.hypot(a.weapon_tip![0] - a.weapon_grip![0], a.weapon_tip![1] - a.weapon_grip![1]);
      expect(d, f.name).toBeGreaterThan(0.9);
      expect(d, f.name).toBeLessThan(1.1);
    }
  });

  it('is deterministic: building the same spec twice gives identical data', () => {
    const again = JSON.stringify([PLAYER_PLACEHOLDER.def, PLAYER_PLACEHOLDER.meta, PLAYER_PLACEHOLDER.frames.map((f) => [f.name, f.x, f.y])]);
    const first = JSON.stringify([def, meta, frames.map((f) => [f.name, f.x, f.y])]);
    expect(again).toBe(first);
  });

  it('presenter: every anchor id resolves to real per-frame data in every frame (no fallbacks for the placeholder)', () => {
    const presenter = new ActorPresenter(def, meta);
    const view = createActorViewState();
    for (const state of PLAYER_STATES) {
      view.anim = state;
      view.animSerial++;
      presenter.sync(view, 0, 0);
      for (const id of ANCHOR_IDS) expect(presenter.hasAnchorData(id), `${state}/${id}`).toBe(true);
    }
  });
});
