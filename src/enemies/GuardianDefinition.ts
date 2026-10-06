import type { AttackDefinition } from '@/combat/AttackDefinition';

/** One vulnerable region of the guardian, in its body's frame facing right (`x` = near edge from the centre, `y` = bottom above the feet). */
export interface GuardianHurtbox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Damage multiplier for a blow that lands here: the weak point (the crest) takes more. */
  multiplier: number;
  /** Forwarded in the events (`crest`, `body`). */
  part: string;
}

/**
 * A boss, as DATA (docs/PROMPT6-LOG.md S29): the numbers a designer retunes by playing, in metres, seconds and SIMULATION TICKS. The behaviour
 * that reads them is `Guardian`, one finite-state machine (`dormant → intro → choose → telegraph → attack → recover → (hurt) → choose…`, `dead`).
 * Every hurt it deals is the hitbox of one of its two attacks, and every attack is announced by a telegraph the hero can read and answer.
 */
export interface GuardianDefinition {
  id: string;
  /** Text KEY of the display name (`enemy.warden.name`): never the text itself. */
  nameKey: string;
  health: number;
  /** Collision body, feet-centred. */
  body: { halfWidth: number; height: number };
  /** Vulnerable regions, WEAK POINTS FIRST (a blow lands on the first one it overlaps). */
  hurtboxes: readonly GuardianHurtbox[];
  /** Ticks of the waking beat between the hero stepping into the arena and the first attack: it cannot be hurt, and the doors close. */
  introTicks: number;
  /** Fraction of its health at or below which it is ENRAGED: every wind-up and recovery is scaled by `enrageScale`, and the rain is denser. */
  enrageAt: number;
  enrageScale: number;
  /** Ticks a blow taken while recovering staggers it (once per recovery: no stun-lock). */
  staggerTicks: number;
  /** Ticks the white hit flash lasts. */
  flashTicks: number;
  /** Ticks from the killing blow until the body is gone. */
  deathTicks: number;
  /** Its two attacks. `charge`: a low surge along the floor (the hitbox is the surge). `rain`: ink erupts at the marked spots (the zones are built from `params.rain`). */
  attacks: { charge: AttackDefinition; rain: AttackDefinition };
  params: {
    charge: {
      /** m/s of the slide and the most ticks it lasts (it also stops at a wall). */
      speed: number;
      ticks: number;
    };
    rain: {
      /** Horizontal offsets (m) from where the hero stood when it began, one zone each; `enragedOffsets` once enraged. */
      offsets: readonly number[];
      enragedOffsets: readonly number[];
      /** Width and height (m) of each zone of ink. */
      width: number;
      height: number;
    };
    /** Beyond this horizontal distance (m) the charge is the likelier choice; within it, the rain. */
    farDistance: number;
    /** The same attack is chosen at most this many times in a row. */
    repeatLimit: number;
    /** m/s²: how fast its slide bleeds off on the ground, and its gravity. */
    friction: number;
    gravity: number;
  };
  /** What draws it (a procedural look today); gameplay never reads this. */
  view: { lookId: string };
}
