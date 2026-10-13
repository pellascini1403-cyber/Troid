/**
 * THE ATMOSPHERE OF THE SCREEN (docs/PROMPT8-LOG.md, phase I): what is drawn over the whole picture, in pixels, once the world is in place — a vignette that closes the dark in from the corners (the dark places of
 * a metroidvania, a room that goes on beyond what can be seen), tinted with the hue of the room, and the edge pulses that tell the player something happened to them (a blow taken, a power gained, a place that
 * awakens, a guardian that changes). PURE: no Pixi, no document. `vfx/ScreenFx` draws it.
 *
 * What it must never do is cost the player a platform. The hero stands in the middle of the screen and the platforms they jump to are at the top and the bottom of it, so the vignette is a CONTRACT: the middle of
 * an edge is never darker than `maxEdge`, the corners never darker than `maxCorner`, and a pulse is never so strong that what is behind it cannot be read.
 */

/** The dark of a room: the hue it closes in with (a near-black of the room's own colour, never pure black) and how far it comes in. */
export interface Mood {
  tint: number;
  /** 0–1: the alpha of the dark at the corners of the screen. */
  strength: number;
}

export const ATMOSPHERE_CONTRACT = {
  /** The darkest the corners may be (alpha), at any mood, with the fight mood on top. */
  maxCorner: 0.72,
  /** The darkest the middle of a screen edge may be: the platform at the top of a jump is still there. */
  maxEdge: 0.34,
  /** The strongest an edge pulse may be (alpha at the corners at its peak). */
  maxPulse: 0.5,
  /** The longest a pulse may last (seconds). */
  maxPulseLife: 1.4,
  /** How long a mood takes to come over the screen when a room is entered or a fight begins (seconds). */
  moodSeconds: 0.9,
} as const;

/** The distance of a corner of the screen from its middle, in the units where the middle of an edge is 1. */
export const CORNER = Math.SQRT2;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How dark the vignette is at a distance `d` from the middle of the screen (1 = the middle of an edge, √2 = a corner), for a mood of the given `strength`: nothing in the middle third, a soft rise through
 * the edge, the full strength at the corner. The texture is made from this, and the contract is measured against it.
 */
export function vignetteAlpha(d: number, strength: number): number {
  return Math.pow(smoothstep(0.58, CORNER, d), 1.35) * strength;
}

/** The mood at the middle of an edge and at a corner, as the player sees them. */
export function vignetteExtremes(strength: number): { edge: number; corner: number } {
  return { edge: vignetteAlpha(1, strength), corner: vignetteAlpha(CORNER, strength) };
}

/** An edge pulse: the colour it comes in, how strong it is at its peak and how long it takes to go. */
export interface EdgePulse {
  tint: number;
  /** `normal`: a darkening/colouring over the picture (a blow taken); `add`: light (a power gained). */
  blend: 'normal' | 'add';
  peak: number;
  life: number;
}

/** The strength of a pulse `age` seconds after it began: a quick swell (a tenth of its life) and a soft fall. */
export function edgePulseLevel(p: Pick<EdgePulse, 'peak' | 'life'>, age: number): number {
  if (!(age >= 0) || age >= p.life) return 0;
  const t = age / p.life;
  if (t < 0.1) return p.peak * (t / 0.1);
  const k = (1 - t) / 0.9;
  return p.peak * k * k;
}

/** What the moods and pulses say against the contract; an empty answer means the screen keeps its readability. */
export function atmosphereIssues(moods: Readonly<Record<string, Mood>>, fight: Mood, pulses: Readonly<Record<string, EdgePulse>>): string[] {
  const out: string[] = [];
  const check = (name: string, m: Mood): void => {
    const { edge, corner } = vignetteExtremes(m.strength);
    if (!(m.strength >= 0 && m.strength <= 1)) out.push(`the mood of ${name} has a strength of ${m.strength}: between 0 and 1`);
    if (edge > ATMOSPHERE_CONTRACT.maxEdge) out.push(`the dark of ${name} reaches ${edge.toFixed(2)} at the middle of an edge: over ${ATMOSPHERE_CONTRACT.maxEdge} (a platform at the top of a jump would be lost)`);
    if (corner > ATMOSPHERE_CONTRACT.maxCorner) out.push(`the dark of ${name} reaches ${corner.toFixed(2)} at the corners: over ${ATMOSPHERE_CONTRACT.maxCorner}`);
    if ((m.tint & 0xff) > 0x30 || ((m.tint >> 8) & 0xff) > 0x30 || ((m.tint >> 16) & 0xff) > 0x30) out.push(`the tint of ${name} is not a dark one (0x${m.tint.toString(16).padStart(6, '0')}): the dark of a room is a near-black of its own hue`);
  };
  for (const [room, m] of Object.entries(moods)) check(`the room "${room}"`, m);
  check('a fight', fight);
  for (const [name, p] of Object.entries(pulses)) {
    if (!(p.peak > 0 && p.peak <= ATMOSPHERE_CONTRACT.maxPulse)) out.push(`the "${name}" pulse peaks at ${p.peak}: above 0 and up to ${ATMOSPHERE_CONTRACT.maxPulse}`);
    if (!(p.life > 0 && p.life <= ATMOSPHERE_CONTRACT.maxPulseLife)) out.push(`the "${name}" pulse lasts ${p.life} s: above 0 and up to ${ATMOSPHERE_CONTRACT.maxPulseLife} s`);
  }
  return out;
}
