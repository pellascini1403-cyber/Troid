import { describe, expect, it } from 'vitest';
import { computeViewport, MAX_ASPECT, MIN_ASPECT, QUALITY_SETTINGS, RESOLUTION_CAP, tierFor } from '@/presentation/viewport';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET } from '@/presentation/vfx';

const base = { dpr: 1, resolutionCap: 2, viewHeight: 13.5 };
const vp = (cssWidth: number, cssHeight: number, extra: Partial<typeof base> = {}) => computeViewport({ cssWidth, cssHeight, ...base, ...extra });

describe('viewport: visible height is fixed, width varies within 4:3 – 21:9', () => {
  it('the game area always shows exactly viewHeight metres, whatever the canvas size', () => {
    for (const [w, h] of [[844, 390], [1920, 1080], [1194, 834], [3440, 1440], [667, 375], [1024, 768]] as const) {
      const v = vp(w, h);
      expect(v.contentHeight * (1 / v.ppm)).toBeCloseTo(13.5, 9);
    }
  });

  it('visible width follows the aspect ratio (phone vs tablet vs desktop)', () => {
    expect(vp(844, 390).visibleWidth).toBeCloseTo(13.5 * (844 / 390), 6); // 29.2 m
    expect(vp(1920, 1080).visibleWidth).toBeCloseTo(24, 6);
    expect(vp(1194, 834).visibleWidth).toBeCloseTo(13.5 * (1194 / 834), 6); // iPad ≈ 19.3 m
  });

  it('ultra-wide screens are pillarboxed to 21:9 and centred (rooms never reveal more than designed)', () => {
    const v = vp(3440, 1440);
    expect(v.aspect).toBeGreaterThan(MAX_ASPECT);
    expect(v.contentAspect).toBeCloseTo(MAX_ASPECT, 9);
    expect(v.contentWidth).toBeCloseTo(1440 * MAX_ASPECT, 6);
    expect(v.barX).toBeCloseTo((3440 - 3360) / 2, 6);
    expect(v.barY).toBe(0);
    expect(v.visibleWidth).toBeCloseTo(13.5 * MAX_ASPECT, 6); // 31.5 m
    expect(v.rotateDevice).toBe(false);
  });

  it('screens narrower than 4:3 are letterboxed and ask the player to rotate the device', () => {
    const v = vp(390, 844); // portrait phone
    expect(v.contentAspect).toBeCloseTo(MIN_ASPECT, 9);
    expect(v.contentHeight).toBeCloseTo(390 / MIN_ASPECT, 6);
    expect(v.barY).toBeGreaterThan(0);
    expect(v.barX).toBe(0);
    expect(v.rotateDevice).toBe(true);
    expect(vp(1024, 768).rotateDevice).toBe(false); // exactly 4:3 is fine
  });

  it('screens inside the range use all of the host (no bars)', () => {
    const v = vp(1920, 1080);
    expect(v.barX).toBe(0);
    expect(v.barY).toBe(0);
    expect(v.contentWidth).toBe(1920);
    expect(v.contentHeight).toBe(1080);
  });
});

describe('viewport: render resolution', () => {
  it('is min(devicePixelRatio, tier cap) and never below 0.5', () => {
    expect(vp(844, 390, { dpr: 3, resolutionCap: RESOLUTION_CAP.medium }).resolution).toBe(1.75);
    expect(vp(844, 390, { dpr: 2, resolutionCap: RESOLUTION_CAP.high }).resolution).toBe(2);
    expect(vp(844, 390, { dpr: 1, resolutionCap: RESOLUTION_CAP.high }).resolution).toBe(1);
    expect(vp(844, 390, { dpr: 0.2, resolutionCap: 2 }).resolution).toBe(0.5);
  });

  it('survives a zero-sized host (hidden element) without NaN', () => {
    const v = vp(0, 0);
    expect(Number.isFinite(v.ppm)).toBe(true);
    expect(Number.isFinite(v.visibleWidth)).toBe(true);
  });
});

describe('the quality a player chooses (docs/PROMPT6-LOG.md S30)', () => {
  it('three choices: auto, low and high — nothing else', () => {
    expect([...QUALITY_SETTINGS]).toEqual(['auto', 'low', 'high']);
  });

  it('low and high are the two ends of the profiles the game has; auto is the balanced one it always had — it measures nothing', () => {
    expect(tierFor('low')).toBe('low');
    expect(tierFor('high')).toBe('high');
    expect(tierFor('auto')).toBe('medium');
  });

  it('each profile costs what it should: the render resolution and the effect budgets only go up from low to high', () => {
    const order = ['low', 'medium', 'high'] as const;
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1]!;
      const b = order[i]!;
      expect(RESOLUTION_CAP[b], `${b} resolution`).toBeGreaterThan(RESOLUTION_CAP[a]);
      expect(PARTICLE_BUDGET[b], `${b} particles`).toBeGreaterThan(PARTICLE_BUDGET[a]);
      expect(SPRITE_FX_BUDGET[b], `${b} sprite effects`).toBeGreaterThan(SPRITE_FX_BUDGET[a]);
    }
  });

  it('the choice changes how sharp the picture is on a dense screen, and only there: a screen of density 1 is the same in every profile', () => {
    const at = (setting: (typeof QUALITY_SETTINGS)[number], dpr: number) => vp(844, 390, { dpr, resolutionCap: RESOLUTION_CAP[tierFor(setting)] }).resolution;
    expect(at('low', 3)).toBe(1.25);
    expect(at('auto', 3)).toBe(1.75);
    expect(at('high', 3)).toBe(2);
    for (const s of QUALITY_SETTINGS) expect(at(s, 1), s).toBe(1);
  });
});

