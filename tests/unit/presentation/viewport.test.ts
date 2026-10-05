import { describe, expect, it } from 'vitest';
import { computeViewport, MAX_ASPECT, MIN_ASPECT, RESOLUTION_CAP } from '@/presentation/viewport';

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
