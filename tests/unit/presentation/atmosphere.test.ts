import { describe, expect, it } from 'vitest';
import { DEFAULT_MOOD, EDGE_PULSES, FIGHT_MOOD, moodFor, ROOM_MOODS } from '@/content/atmosphere';
import { ROOMS, WORLD } from '@/content';
import {
  ATMOSPHERE_CONTRACT,
  atmosphereIssues,
  CORNER,
  edgePulseLevel,
  vignetteAlpha,
  vignetteExtremes,
  type EdgePulse,
} from '@/presentation/atmosphere';

/**
 * THE ATMOSPHERE OF THE SCREEN (docs/PROMPT8-LOG.md, phase I): the vignette each room closes in with and the pulses at the edge of the picture. The contract is measured against the DATA the game ships, so a mood
 * made too dark — a platform at the top of a jump lost in it — fails here.
 */
describe('the vignette', () => {
  it('is clear in the middle of the screen, rises through the edge and is darkest at the corners', () => {
    expect(vignetteAlpha(0, 1)).toBe(0);
    expect(vignetteAlpha(0.5, 1)).toBe(0); // the middle third is never touched: that is where the hero and the fight are
    expect(vignetteAlpha(CORNER, 1)).toBeCloseTo(1, 9);
    let last = -1;
    for (let d = 0; d <= CORNER + 0.01; d += 0.05) {
      const a = vignetteAlpha(d, 1);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a).toBeLessThanOrEqual(1);
      last = a;
    }
  });

  it('is as strong as its mood says, no more: half the strength is half the dark', () => {
    for (const d of [0.8, 1, 1.2, CORNER]) expect(vignetteAlpha(d, 0.5)).toBeCloseTo(vignetteAlpha(d, 1) * 0.5, 9);
  });

  it('keeps the middle of an edge much lighter than a corner (the platforms a jump reaches are at the top and the bottom)', () => {
    const { edge, corner } = vignetteExtremes(0.6);
    expect(edge).toBeLessThan(corner * 0.5);
    expect(edge).toBeLessThan(ATMOSPHERE_CONTRACT.maxEdge);
  });
});

describe('the moods the game ships', () => {
  it('keep the contract: no room, and no fight, closes in so far that the screen is lost', () => {
    expect(atmosphereIssues(ROOM_MOODS, FIGHT_MOOD, EDGE_PULSES)).toEqual([]);
    expect(atmosphereIssues({ default: DEFAULT_MOOD }, FIGHT_MOOD, {})).toEqual([]);
  });

  it('have a mood for every room of the game, and none for a room that is not', () => {
    // (the playgrounds of the tools are rooms too, but the world is the sixty-four the hero walks through)
    for (const id of WORLD.rooms) expect(ROOM_MOODS[id], id).toBeDefined();
    for (const id of Object.keys(ROOM_MOODS)) expect(Object.keys(ROOMS), id).toContain(id);
    expect(moodFor('r4_sanctum')).toBe(ROOM_MOODS['r4_sanctum']);
    expect(moodFor('a_room_that_comes_later')).toBe(DEFAULT_MOOD);
  });

  it('the sanctum is the darkest of the rooms, and the fight is darker still, in the violet of the guardian', () => {
    const strengths = Object.values(ROOM_MOODS).map((m) => m.strength);
    expect(ROOM_MOODS['r4_sanctum']!.strength).toBe(Math.max(...strengths));
    expect(FIGHT_MOOD.strength).toBeGreaterThan(ROOM_MOODS['r4_sanctum']!.strength);
    const b = FIGHT_MOOD.tint & 0xff;
    const r = (FIGHT_MOOD.tint >> 16) & 0xff;
    const g = (FIGHT_MOOD.tint >> 8) & 0xff;
    expect(b).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(g); // violet: red and blue over green
  });

  it('every dark is a near-black of its own hue, never a grey frame and never pure black', () => {
    for (const m of [...Object.values(ROOM_MOODS), DEFAULT_MOOD, FIGHT_MOOD]) {
      const channels = [(m.tint >> 16) & 0xff, (m.tint >> 8) & 0xff, m.tint & 0xff];
      expect(Math.max(...channels)).toBeLessThanOrEqual(0x30);
      expect(Math.max(...channels)).toBeGreaterThan(0x03);
    }
  });

  it('say what is wrong with one that breaks the contract', () => {
    expect(atmosphereIssues({ r1_gate: { tint: 0x020a12, strength: 1 } }, FIGHT_MOOD, {}).join('\n')).toMatch(/corners/);
    expect(atmosphereIssues({ r1_gate: { tint: 0x808080, strength: 0.3 } }, FIGHT_MOOD, {}).join('\n')).toMatch(/not a dark one/);
    expect(atmosphereIssues({}, { tint: 0x020a12, strength: 0.9 }, {}).join('\n')).toMatch(/fight/);
    expect(atmosphereIssues({}, FIGHT_MOOD, { x: { tint: 0xff0000, blend: 'normal', peak: 0.9, life: 1 } }).join('\n')).toMatch(/peaks at 0.9/);
    expect(atmosphereIssues({}, FIGHT_MOOD, { x: { tint: 0xff0000, blend: 'normal', peak: 0.3, life: 9 } }).join('\n')).toMatch(/lasts 9 s/);
  });
});

describe('the pulses at the edge', () => {
  const p: EdgePulse = { tint: 0xffffff, blend: 'add', peak: 0.4, life: 1 };

  it('swell in a tenth of their life, peak and fall softly to nothing', () => {
    expect(edgePulseLevel(p, 0)).toBe(0);
    expect(edgePulseLevel(p, 0.05)).toBeCloseTo(0.2, 9);
    expect(edgePulseLevel(p, 0.1)).toBeCloseTo(0.4, 9);
    expect(edgePulseLevel(p, 0.5)).toBeLessThan(0.4);
    expect(edgePulseLevel(p, 0.5)).toBeGreaterThan(0);
    expect(edgePulseLevel(p, 1)).toBe(0);
    expect(edgePulseLevel(p, 3)).toBe(0);
    expect(edgePulseLevel(p, -1)).toBe(0);
  });

  it('a blow taken is the only one that darkens the picture, in a muted carmín; the rest are light', () => {
    expect(EDGE_PULSES.hurt.blend).toBe('normal');
    const r = (EDGE_PULSES.hurt.tint >> 16) & 0xff;
    expect(r).toBeGreaterThan(((EDGE_PULSES.hurt.tint >> 8) & 0xff) * 3);
    for (const [name, pulse] of Object.entries(EDGE_PULSES)) if (name !== 'hurt') expect(pulse.blend, name).toBe('add');
    // the guardian\'s are violet; the hero\'s are the cyan of their own energy
    expect(EDGE_PULSES.guardian.tint & 0xff).toBeGreaterThan(0xc0);
  });

  it('are short enough that the player is never kept from reading the screen', () => {
    for (const [name, pulse] of Object.entries(EDGE_PULSES)) {
      expect(pulse.life, name).toBeLessThanOrEqual(ATMOSPHERE_CONTRACT.maxPulseLife);
      expect(pulse.peak, name).toBeLessThanOrEqual(ATMOSPHERE_CONTRACT.maxPulse);
    }
  });
});
