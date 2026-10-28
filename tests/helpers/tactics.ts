import { ENEMIES } from '@/content/enemies';
import type { Brawler, Foe, Tactic } from './brawler';

/**
 * HOW EACH CREATURE IS ANSWERED (docs/PROMPT22-LOG.md §4): one small policy for each, read from what the creature is doing (its state is the telegraph the picture draws) and from the numbers of its definition. They are the answers the content
 * itself names — «be out of the line, or over it», "get behind the shield", "close in or take the throw on the wall" — played with the inputs of a person. A creature that cannot be beaten by them, with the damage they cost, is a creature to retune.
 */

/** How far from the creature's centre its own blow reaches, on the side it faces (m): the hitbox, and the lunge it makes while it is active. */
export function reachOf(foe: Foe, attackId?: string): number {
  const def = foe.entity.def;
  const id = attackId ?? (def.ai.params as unknown as { attack?: string }).attack;
  const a = id ? def.attacks[id] : undefined;
  if (!a) return 1.5;
  const lunge = a.lunge ? (a.lunge.speed * a.lunge.ticks) / 60 : 0;
  return Math.max(Math.abs(a.hitbox.x), Math.abs(a.hitbox.x + a.hitbox.w)) + lunge;
}

const HERO = 0.35;
/** The spare metres kept from a blow. */
const SAFE = 0.45;

interface Bait {
  /** The states in which the creature is about to hit or hitting: be out of its reach. */
  danger: readonly string[];
  /** The states in which it cannot answer: close in and strike. */
  open: readonly string[];
  /** How far from the creature the hero waits while it makes up its mind. */
  standoff: number;
  /** How far its blow really reaches (m from its centre), when the definition does not say (a lunge the brain makes by itself). */
  reach?: number;
}

/** The pattern of most creatures that walk up to you: wait just outside the reach of the blow, step out of the way of it, and strike the moment it is spent. */
function baitAndPunish(f: Brawler, foe: Foe, cfg: Bait): void {
  const reach = cfg.reach ?? reachOf(foe);
  if (cfg.danger.includes(foe.state)) {
    // out of the way: away from it, unless it is a blow that cannot reach this far
    if (foe.gap < reach + HERO + SAFE) f.walk(-foe.side as -1 | 1);
    else f.face(foe.side);
    return;
  }
  if (cfg.open.includes(foe.state)) {
    if (!f.strike(foe)) {
      const want = f.strikeGap(foe) - 0.3;
      if (foe.gap > want) f.walk(foe.side);
      else f.face(foe.side);
    }
    return;
  }
  // it has not decided yet: be where it will have to come to
  if (foe.gap > cfg.standoff + 0.4) f.walk(foe.side, foe.gap > cfg.standoff + 2 ? 1 : 0.5);
  else f.face(foe.side);
}

const away = (foe: Foe): -1 | 1 => (foe.side === 1 ? -1 : 1);

/** Close in and strike; true when the sword was swung or is in reach. */
function engage(f: Brawler, foe: Foe, hold = 0.3): void {
  if (f.strike(foe)) return;
  if (foe.gap > f.strikeGap(foe) - hold) f.walk(foe.side);
  else f.face(foe.side);
}

export const TACTICS: Record<string, Tactic> = {
  // a lunge it announces for 24 ticks, 1.5 m long: wait at 3 m, step back from the lunge, strike while it recovers (36 ticks)
  ink_slime: (f, foe) => baitAndPunish(f, foe, { danger: ['telegraph', 'attack'], open: ['recover', 'hurt'], standoff: 3.2 }),
  // the piece it breaks into: the same, quicker
  crystal_shard: (f, foe) => baitAndPunish(f, foe, { danger: ['telegraph', 'attack'], open: ['recover', 'hurt'], standoff: 2.6 }),

  // a charge along the floor that cannot turn: go over it, and strike it where it stops
  bramble_crawler: (f, foe) => {
    if (foe.state === 'rush') {
      // coming at the hero along the floor: over it as it arrives; going away: leave it
      const toward = foe.facing === -foe.side;
      if (toward && foe.gap < 3 && f.me.grounded) f.jump(26);
      else if (!toward) f.walk(foe.side, 0.5);
      return;
    }
    if (foe.state === 'windup' || foe.state === 'alert') return f.face(foe.side);
    if (foe.state === 'dazed' || foe.state === 'recover' || foe.state === 'hurt') return engage(f, foe);
    // idle, patrol: be at the distance where it notices and winds up
    if (foe.gap > 7) f.walk(foe.side);
    else if (foe.gap < 4.5) f.walk(away(foe), 0.6);
    else f.face(foe.side);
  },

  // it leaps to where the hero WAS when the crouch ended and shakes the floor there: run from the place, then strike while it recovers
  mire_toad: (f, foe) => {
    switch (foe.state) {
      case 'leap':
      case 'land':
        return f.walk(away(foe));
      case 'crouch':
        return engage(f, foe);
      case 'recover':
      case 'hurt':
        return engage(f, foe);
      default:
        if (foe.gap > 5.5) f.walk(foe.side);
        else f.face(foe.side);
    }
  },

  // a shield to the front while it walks and watches: strike it while the weapon is down (after the smash) or from behind
  stoneback: (f, foe) => {
    const inFront = (f.me.x - foe.x) * foe.facing > -0.2;
    switch (foe.state) {
      case 'windup':
      case 'smash':
        // the smash falls in front of it: out of reach, or behind it
        if (inFront && foe.gap < 2.4 + 0.5) return f.walk(away(foe));
        return f.face(foe.side);
      case 'recover':
      case 'hurt':
        return engage(f, foe);
      default:
        if (!inFront) return engage(f, foe); // behind it: the shield does not turn in time
        if (foe.gap > 3.4) f.walk(foe.side, foe.gap > 5 ? 1 : 0.5);
        else f.face(foe.side);
    }
  },

  // armoured shut; its cloud fills 2.5 m around it for 44 ticks; then it stays open: stay out of the cloud, strike when it thins
  glow_spore: (f, foe) => {
    switch (foe.state) {
      case 'bloom':
      case 'burst':
        return foe.gap < 2.5 + 0.35 + 0.5 ? f.walk(away(foe)) : f.face(foe.side);
      case 'open':
      case 'hurt':
        return engage(f, foe);
      default:
        // wait where it will bloom at the hero and the cloud will not reach
        if (foe.gap > 4.2) f.walk(foe.side, 0.6);
        else if (foe.gap < 3.6) f.walk(away(foe), 0.5);
        else f.face(foe.side);
    }
  },

  // it keeps its distance and throws: over the throw, and close in
  ink_spitter: (f, foe) => {
    if (f.dodgeShots()) return;
    engage(f, foe);
  },

  // it dives, turning: dash through it as it arrives, strike it when it hovers
  cave_bat: (f, foe) => {
    const me = f.me;
    const dist = Math.hypot(foe.x - me.x, foe.y + foe.h / 2 - (me.y + 0.9));
    if (foe.state === 'swoop') {
      if (dist < 2.8 && f.dashReady) return f.dash(foe.side);
      return f.face(foe.side);
    }
    if (foe.state === 'hover' || foe.state === 'hurt') return engage(f, foe, 0);
    if (foe.state === 'wake') return f.face(foe.side);
    // perched or climbing: wait under it, within the range where it wakes
    if (foe.gap > 5) f.walk(foe.side, 0.6);
    else f.face(foe.side);
  },

  // it floats to the hero and goes off: put it out first (two blows), or run from the blast
  lantern_wisp: (f, foe) => {
    if (foe.state === 'fuse' || foe.state === 'blast') return foe.gap < 2.1 + 0.35 + 0.5 ? f.walk(away(foe)) : f.face(foe.side);
    if (f.strike(foe)) return;
    if (foe.gap > 3.4) f.walk(foe.side, 0.6);
    else f.face(foe.side);
  },

  // a stationary bell that rings waves along the floor: over them, and strike it
  bell_toller: (f, foe) => {
    if (f.dodgeShots()) return;
    engage(f, foe);
  },

  // a stone when curled and rolling: over the roll, strike it uncurled; mind the pieces it breaks into
  shardling: (f, foe) => {
    if (foe.state === 'roll') {
      const toward = foe.facing === -foe.side;
      if (toward && foe.gap < 3.2 && f.me.grounded) f.jump(26);
      else if (!toward && foe.gap < 3) f.walk(foe.side, 0.4);
      return;
    }
    if (foe.state === 'curl') return foe.gap < 1.5 ? f.walk(away(foe)) : f.face(foe.side);
    if (foe.state === 'recover' || foe.state === 'hurt') return engage(f, foe);
    if (foe.gap > 5.5) f.walk(foe.side);
    else f.face(foe.side);
  },

  // it follows from above and drops on the hero: step out of the line, strike it when it is stuck in the floor
  piston_drone: (f, foe) => {
    const out = 0.65 + 0.35 + 0.5;
    switch (foe.state) {
      case 'lock':
      case 'drop':
        // (it falls at the spot it locked on: leave the line)
        return foe.gap < out ? f.walk(foe.dx >= 0 ? -1 : 1) : f.face(foe.side);
      case 'stuck':
        return engage(f, foe);
      case 'rise':
        return;
      default:
        return; // it is tracking: stand and let it come over
    }
  },

  // a puddle that springs when the hero is within 1.7 m: step back from the bite, strike it as it hangs open
  floor_leech: (f, foe) => baitAndPunish(f, foe, { danger: ['rise', 'bite'], open: ['exposed', 'hurt'], standoff: 1.1, reach: 1.6 }),

  // it makes creatures, never more than two: reach it
  ink_weaver: (f, foe) => engage(f, foe),

  // it vanishes and returns behind the hero: keep out of the cut, strike it while it is spent
  veil_shade: (f, foe) => baitAndPunish(f, foe, { danger: ['appear', 'slash'], open: ['recover', 'hurt'], standoff: 4.5 }),
};

/** No reading of the creature at all: walk up and swing. What a hero who does not look at the telegraph does. */
export const NAIVE: Tactic = (f, foe) => engage(f, foe);

export const FALLBACK: Tactic = (f, foe) => {
  // no policy of its own: walk up and strike, and step back from whatever it winds up
  baitAndPunish(f, foe, { danger: ['telegraph', 'windup', 'attack', 'smash', 'aim', 'toll', 'swing', 'bite', 'rise', 'slash'], open: ['recover', 'hurt', 'dazed', 'exposed'], standoff: 3 });
};

export { ENEMIES };
