import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET, type VfxBindings, type VfxDefinition, type VfxSpawn, type VfxTrigger } from '@/presentation/vfx';
import { checkVfxContract, FIRING_SCALE, triggerCost, VFX_CONTRACT, WORST_MOMENTS, type VfxCue } from '@/presentation/vfxContract';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/**
 * THE VISUAL CONTRACT OF THE EFFECTS (docs/ART-PIPELINE-2D.md, part H): what a final effect must keep while its LOOK is replaced — WHEN it starts (the simulation's
 * event), WHERE it is born, how long it may live, how much of the budget it may take, in which colours. Pure: no GPU.
 */
const TRIGGERS = Object.keys(VFX_BINDINGS) as VfxTrigger[];
const clone = <T,>(v: T): T => structuredClone(v);
/** Changes fields of one effect of a copy of the definitions. */
const patch = (defs: Record<string, VfxDefinition>, id: string, fields: Record<string, unknown>): void => void Object.assign(defs[id]!, fields);

describe('the contract covers every trigger the game has', () => {
  it('one entry per trigger, the same ones the effects are bound to', () => {
    expect(Object.keys(VFX_CONTRACT).sort()).toEqual([...TRIGGERS].sort());
  });

  it('the families are the effects a player knows: slash, impact, damage, dash, death, telegraph and the Spirit Bolt', () => {
    const families = new Set(Object.values(VFX_CONTRACT).map((c) => c.family));
    for (const f of ['slash', 'impact', 'damage', 'dash', 'death', 'telegraph', 'bolt'] as const) expect(families.has(f), f).toBe(true);
  });

  it('every ceiling is a real limit: positive times, whole counts, a palette to speak of', () => {
    for (const [name, c] of Object.entries(VFX_CONTRACT) as Array<[VfxTrigger, VfxCue]>) {
      expect(c.maxLife, name).toBeGreaterThan(0);
      expect(Number.isInteger(c.maxParticles) && c.maxParticles >= 0, name).toBe(true);
      expect(Number.isInteger(c.maxSprites) && c.maxSprites >= 0, name).toBe(true);
      expect(c.palettes.length, name).toBeGreaterThan(0);
      expect(c.events.length, name).toBeGreaterThan(0);
    }
  });
});

describe('the effects that ship keep the contract', () => {
  it('no issue at all', () => {
    expect(checkVfxContract(VFX, VFX_BINDINGS)).toEqual([]);
  });

  it('with room to spare: the ceilings are for replacements, the shipped effects sit under them', () => {
    for (const t of TRIGGERS) {
      const cost = triggerCost(VFX, VFX_BINDINGS, t);
      const c = VFX_CONTRACT[t];
      expect(cost.life, `${t} life`).toBeLessThanOrEqual(c.maxLife);
      expect(cost.particles, `${t} particles`).toBeLessThanOrEqual(c.maxParticles);
      expect(cost.sprites, `${t} sprites`).toBeLessThanOrEqual(c.maxSprites);
    }
    // the biggest moments of the game fit the smallest profile's budget at the CEILINGS, not just at today's numbers
    for (const [moment, triggers] of Object.entries(WORST_MOMENTS)) {
      expect(triggers.reduce((n, t) => n + VFX_CONTRACT[t].maxParticles, 0), moment).toBeLessThanOrEqual(PARTICLE_BUDGET.low);
      expect(triggers.reduce((n, t) => n + VFX_CONTRACT[t].maxSprites, 0), moment).toBeLessThanOrEqual(SPRITE_FX_BUDGET.low);
    }
  });

  it('the cost counts a firing at the biggest scale any firing uses (a blow that kills is ×1.3)', () => {
    const slash = triggerCost(VFX, VFX_BINDINGS, 'hitLanded');
    const raw = VFX_BINDINGS.hitLanded.reduce((n, id) => n + (VFX[id]!.kind === 'particles' ? (VFX[id] as { count: readonly [number, number] }).count[1] : 0), 0);
    expect(FIRING_SCALE).toBe(1.3);
    expect(slash.particles).toBeGreaterThan(raw);
    expect(slash.particles).toBeLessThanOrEqual(Math.ceil(raw * FIRING_SCALE) + VFX_BINDINGS.hitLanded.length);
  });
});

describe('the contract has teeth: a replacement that breaks it is told which rule, and where', () => {
  const messages = (defs: Record<string, VfxDefinition>, bindings: VfxBindings = VFX_BINDINGS, contract = VFX_CONTRACT): string[] => checkVfxContract(defs, bindings, contract).map((i) => i.message);

  it('an effect that lives too long', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    patch(defs, 'slash_arc', { life: 1.2 });
    expect(messages(defs).some((m) => /"slash" lives 1\.2 s, over its 0\.25 s ceiling/.test(m))).toBe(true);
  });

  it('too many particles for one firing', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    patch(defs, 'impact_sparks', { count: [60, 90] });
    expect(messages(defs).some((m) => /"hitLanded" makes \d+ particles/.test(m))).toBe(true);
  });

  it('too many sprite effects: a slash drawn with six layers', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    patch(defs, 'slash_arc', { layers: Array.from({ length: 6 }, () => ({ role: 'core', scale: 1, alpha: 1 })) });
    expect(messages(defs).some((m) => /"slash" makes 6 sprite effects, over its 4 ceiling/.test(m))).toBe(true);
  });

  it('colours the trigger may not use: the warning of an enemy is violet, the hero\'s energy cyan', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    patch(defs, 'telegraph_ring', { palette: 'energy' });
    patch(defs, 'hurt_flash', { palette: 'accent' });
    const m = messages(defs);
    expect(m.some((x) => /"telegraph_ring" uses the "energy" colours, which "enemyTelegraph" may not \(enemy\)/.test(x))).toBe(true);
    expect(m.some((x) => /"hurt_flash" uses the "accent" colours/.test(x))).toBe(true);
  });

  it('a trigger with nothing bound to it, and one bound to an effect that does not exist', () => {
    const none = { ...VFX_BINDINGS, dashStart: [] } as VfxBindings;
    expect(messages(VFX, none)).toContain('trigger "dashStart" has no effect bound to it');
    const lost = { ...VFX_BINDINGS, playerHurt: ['hurt_shards', 'no_such_effect'] } as VfxBindings;
    expect(messages(VFX, lost)).toContain('trigger "playerHurt" is bound to "no_such_effect", which is not defined');
  });

  it('a definition with numbers that are not numbers is stopped before it reaches the screen', () => {
    const defs = clone(VFX) as Record<string, VfxDefinition>;
    patch(defs, 'impact_sparks', { life: [0.5, 0.1] });
    patch(defs, 'impact_flash', { alpha: [1, 4] });
    patch(defs, 'impact_ring', { size: [Number.NaN, 1] });
    const m = messages(defs);
    expect(m.some((x) => /"impact_sparks": life \[0\.5,0\.1\] must be an ordered pair/.test(x))).toBe(true);
    expect(m.some((x) => /"impact_flash": alpha \[1,4\] must stay within 0–1/.test(x))).toBe(true);
    expect(m.some((x) => /"impact_ring": size .* must be two numbers above 0/.test(x))).toBe(true);
  });

  it('a contract whose ceilings do not fit the budgets they share is itself refused', () => {
    const greedy = { ...VFX_CONTRACT, hitLanded: { ...VFX_CONTRACT.hitLanded, maxParticles: 90 }, enemyDied: { ...VFX_CONTRACT.enemyDied, maxSprites: 9 } } as Record<VfxTrigger, VfxCue>;
    const m = messages(VFX, VFX_BINDINGS, greedy);
    expect(m.some((x) => /ceiling of "hitLanded" \(90 particles\) is over a third of the low profile's budget/.test(x))).toBe(true);
    expect(m.some((x) => /ceiling of "enemyDied" \(9 sprites\) is over a sixth/.test(x))).toBe(true);
  });

  it('a moment that overflows the smallest budget on its own at the ceilings', () => {
    const fat = Object.fromEntries(TRIGGERS.map((t) => [t, { ...VFX_CONTRACT[t], maxParticles: 49 }])) as Record<VfxTrigger, VfxCue>;
    expect(messages(VFX, VFX_BINDINGS, fat).some((x) => /a blow that kills, taken while hurt and dashing: 245 particles at the ceilings, over the low profile's 150/.test(x))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------- WHEN and WHERE

/** A plausible payload of each event, at `(x, y)` — one place for what the simulation says. */
const PAYLOAD: Record<string, (x: number, y: number, over?: Record<string, unknown>) => unknown> = {
  'player:attackActive': (x, y, o) => ({ attackId: 'slash_1', x, y, facing: 1, air: false, combo: 0, rect: { x0: x + 0.2, y0: y + 0.3, x1: x + 1.6, y1: y + 1.4 }, ...o }),
  'combat:hit': (x, y, o) => ({ attackId: 'slash_1', attackerId: 'p', targetId: 'e', targetTeam: 'enemy', damage: 1, x, y, direction: 1, killed: false, hitStop: 4, shake: 0.1, ...o }),
  'player:hurt': (x, y) => ({ x, y, damage: 1, direction: 1 }),
  'player:dashed': (x, y) => ({ x, y, facing: 1, air: false }),
  'player:dashEnded': (x, y) => ({ x, y }),
  'actor:died': (x, y, o) => ({ id: 'e', team: 'enemy', x, y, ...o }),
  'enemy:telegraph': (x, y) => ({ id: 'e', defId: 'ink_slime', x, y, facing: 1, ticks: 20 }),
  'player:died': (x, y) => ({ x, y }),
  'skill:cast': (x, y) => ({ skillId: 'spirit_bolt', x, y, facing: 1, cost: 30 }),
  'projectile:ended': (x, y) => ({ id: 'b', skillId: 'spirit_bolt', x, y, facing: 1, reason: 'wall' }),
  'bottle:drinkStarted': (x, y) => ({ slot: 0, x, y, ticks: 24 }),
  'bottle:drunk': (x, y) => ({ slot: 0, healed: 2, x, y }),
  'checkpoint:set': (x, y) => ({ room: 'r1_gate', entry: 'start', x, y }),
  'interaction:performed': (x, y) => ({ id: 'card', kind: 'pickup', verbKey: 'interact.pickUp', x, y }),
  'seal:rejected': (x, y) => ({ id: 's', attackId: 'slash_1', x, y, direction: 1, shake: 0.1 }),
  'boss:started': (x, y) => ({ id: 'b', defId: 'ink_warden', nameKey: 'k', health: 20, maxHealth: 20, x, y }),
  'boss:strike': (x, y) => ({ id: 'b', defId: 'ink_warden', attack: 'warden_rain', x, y, w: 1.7 }),
  'boss:phase': (x, y) => ({ id: 'b', defId: 'ink_warden', phase: 2, x, y }),
  'boss:defeated': (x, y) => ({ id: 'b', defId: 'ink_warden', x, y }),
};

/** How to raise each trigger: the event, a payload override that tells it from its siblings, and the way a skill's hit is told from a sword's. */
const RECIPE: Record<VfxTrigger, { event: string; over?: Record<string, unknown> }> = {
  slash: { event: 'player:attackActive' },
  slashFinisher: { event: 'player:attackActive', over: { combo: 1, attackId: 'slash_2' } },
  hitLanded: { event: 'combat:hit' },
  playerHurt: { event: 'player:hurt' },
  dashStart: { event: 'player:dashed' },
  dashDust: { event: 'player:dashed' },
  dashTrail: { event: 'player:dashed' },
  enemyDied: { event: 'actor:died' },
  enemyTelegraph: { event: 'enemy:telegraph' },
  playerDied: { event: 'player:died' },
  boltCast: { event: 'skill:cast' },
  boltImpact: { event: 'combat:hit', over: { attackId: 'spirit_bolt' } },
  boltEnd: { event: 'projectile:ended' },
  drinkStart: { event: 'bottle:drinkStarted' },
  drinkHeal: { event: 'bottle:drunk' },
  pickup: { event: 'interaction:performed' },
  sealRejected: { event: 'seal:rejected' },
  bossWake: { event: 'boss:started' },
  bossStrike: { event: 'boss:strike' },
  bossPhase: { event: 'boss:phase' },
  bossDefeated: { event: 'boss:defeated' },
};

function rig() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  const player = { x: 0, y: 0 };
  const director = new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ ...player }), new Set(['spirit_bolt']));
  const emit = (event: string, x: number, y: number, over?: Record<string, unknown>): void => (bus.emit as (e: string, p: unknown) => void)(event, PAYLOAD[event]!(x, y, over));
  return { bus, calls, player, director, emit };
}

describe('WHEN and WHERE: each trigger is raised by the events the contract names, and is born where it says', () => {
  it('the recipes cover every trigger and use only events the contract names for it', () => {
    expect(Object.keys(RECIPE).sort()).toEqual([...TRIGGERS].sort());
    for (const t of TRIGGERS) expect(VFX_CONTRACT[t].events, t).toContain(RECIPE[t].event);
  });

  for (const trigger of Object.keys(RECIPE) as VfxTrigger[]) {
    it(`${trigger}: its own event starts exactly its effects, ${VFX_CONTRACT[trigger].originY} m above the point the event gives`, () => {
      const { calls, emit, player, director } = rig();
      const r = RECIPE[trigger];
      emit(r.event, 10, 2, r.over);
      if (trigger === 'dashTrail') {
        player.x = 10 + 3;
        player.y = 2;
        director.update();
      }
      const mine = calls.filter((c) => VFX_BINDINGS[trigger].includes(c.id));
      const wanted = trigger === 'dashTrail' ? VFX_BINDINGS.dashTrail.length * 6 : VFX_BINDINGS[trigger].length;
      // a dash trail lays one puff of each effect per 0.45 m of the path (6 for 3 m, whatever the frame rate)
      expect(mine.length, `${trigger} effects started`).toBe(wanted);
      for (const c of mine) expect(c.at.y, `${c.id} y`).toBeCloseTo(2 + VFX_CONTRACT[trigger].originY, 9);
      // …and nothing else is started by that event that belongs to ANOTHER family (siblings of the same event excepted)
      const others = calls.filter((c) => !VFX_BINDINGS[trigger].includes(c.id)).map((c) => c.id);
      const siblings = TRIGGERS.filter((t) => t !== trigger && VFX_CONTRACT[t].events.includes(r.event)).flatMap((t) => VFX_BINDINGS[t]);
      for (const id of others) expect(siblings, `${id} is raised by ${r.event} for no reason the contract states`).toContain(id);
    });
  }

  it('the director listens to the events of the contract and to no other', () => {
    const named = new Set(Object.values(VFX_CONTRACT).flatMap((c) => c.events));
    // the catalogue is `GameEvents` and the `CombatEvents` it extends
    const source = ['gameplay/events.ts', 'combat/CombatSystem.ts'].map((f) => readFileSync(resolve(__dirname, '../../../src', f), 'utf8')).join('\n');
    const catalogue = [...source.matchAll(/'([a-z]+:[A-Za-z]+)':/g)].map((m) => m[1]!);
    expect(catalogue.length).toBeGreaterThan(40);
    const { bus } = rig();
    const listened = catalogue.filter((e) => bus.listenerCount(e as keyof GameEvents) > 0);
    expect([...new Set(listened)].sort()).toEqual([...named].sort());
  });

  it('a hit on the hero raises nothing of the impact family (player:hurt owns that moment), and a skill\'s hit is its own impact, not a sword\'s', () => {
    const { calls, emit } = rig();
    emit('combat:hit', 5, 1, { targetTeam: 'player' });
    expect(calls).toEqual([]);
    emit('combat:hit', 5, 1, { attackId: 'spirit_bolt' });
    expect(calls.map((c) => c.id)).toEqual(VFX_BINDINGS.boltImpact);
  });

  it('the finisher is its own effect and the opener is not raised with it', () => {
    const { calls, emit } = rig();
    emit('player:attackActive', 0, 0);
    emit('player:attackActive', 0, 0, { combo: 1 });
    expect(calls.map((c) => c.id)).toEqual([...VFX_BINDINGS.slash, ...VFX_BINDINGS.slashFinisher]);
  });
});
