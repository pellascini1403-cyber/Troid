import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { GuardianDefinition } from '@/enemies/GuardianDefinition';

/**
 * THE INK WARDEN (docs/PROMPT6-LOG.md S29; working name, a text KEY in the catalogs): the guardian of the Sanctum. Original and abstract — a tall
 * column of ink with a violet crest that floats over it, the colour of the sigil of R3's seal — and nothing else: no face, no limbs, no
 * silhouette that belongs to anyone's game. It has two attacks and one rule: every hurt it deals is announced.
 *
 *  - CHARGE: the column sinks and a violet lane marks the floor for 42 ticks (0.7 s); then it slides along the lane at 13 m/s (up to 8.2 m) with a
 *    LOW surge of ink in front of it (1.2 m high, 2.6 m long): jump it, or dash through it (the dash's i-frames), or stay out of the lane. It hurts
 *    for 2. Then it is stuck for 54 ticks (0.9 s): the opening.
 *  - RAIN: it raises the crest and three violet marks appear on the floor — where the hero stands and 3.4 m either side — for 40 ticks; then
 *    columns of ink erupt there for 12 ticks (1.7 m wide, 5 m tall). The marks do not follow: leave them. It hurts for 1 and throws the hero
 *    up. Then it is stuck for 46 ticks.
 *  - Enraged at half its health: every wind-up and recovery is 72 % as long and the rain has four marks.
 *  - The crest is the weak point (×2): it is reached by jumping.
 * Every number is DATA, retuned by playing.
 *
 * It has a file of its own (docs/PROMPT21-LOG.md): the first frame of the game fights with it and the slime and with nothing else — the creatures and the guardians after them come with `content/beyond`.
 */
export const WARDEN_CHARGE: AttackDefinition = {
  id: 'warden_charge',
  startup: 42, active: 38, recovery: 54,
  damage: 2,
  // the surge: from a hand's breadth behind the centre to 2.3 m in front, along the floor, 1.2 m high
  hitbox: { x: -0.3, y: 0, w: 2.6, h: 1.2 },
  knockback: { x: 7, y: 4.5 },
  stun: 18,
  hitStop: 8,
  shake: 0.32,
  moveControl: 0,
  anim: 'attack',
};

export const WARDEN_RAIN: AttackDefinition = {
  id: 'warden_rain',
  startup: 40, active: 12, recovery: 46,
  damage: 1,
  // nominal: the zones are built from the marks (`params.rain`); this is the box of one of them, for the debug overlay
  hitbox: { x: -0.85, y: 0, w: 1.7, h: 5 },
  knockback: { x: 3, y: 6.5 },
  stun: 16,
  hitStop: 6,
  shake: 0.22,
  moveControl: 0,
  anim: 'special',
};

export const INK_WARDEN: GuardianDefinition = {
  id: 'ink_warden',
  nameKey: 'enemy.warden.name',
  health: 36,
  body: { halfWidth: 0.8, height: 2.9 }, // a column 1.6 × 2.9 m
  hurtboxes: [
    // the crest floats above the column: the weak point, reached by jumping (a standing swing tops out at ≈ 1.7 m)
    { x: -0.55, y: 2.7, w: 1.1, h: 1.0, multiplier: 2, part: 'crest' },
    { x: -0.8, y: 0, w: 1.6, h: 2.7, multiplier: 1, part: 'body' },
  ],
  introTicks: 84,
  enrageAt: 0.5,
  enrageScale: 0.72,
  staggerTicks: 16,
  flashTicks: 6,
  deathTicks: 100,
  attacks: { charge: WARDEN_CHARGE, rain: WARDEN_RAIN },
  params: {
    charge: { speed: 13, ticks: 38 },
    rain: { offsets: [-3.4, 0, 3.4], enragedOffsets: [-5.2, -1.7, 1.7, 5.2], width: 1.7, height: 5 },
    farDistance: 7.5,
    repeatLimit: 2,
    friction: 40,
    gravity: 52,
  },
  view: { lookId: 'ink_warden' },
};
