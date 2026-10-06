import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/**
 * What the Ink Warden looks like when it acts (docs/PROMPT6-LOG.md S29): it wakes with a ring and a swell of motes from its crest, each strike
 * erupts where it lands, it burns hotter at half its health and it falls with a great ring. All of it is the enemy's violet — the hero's cyan is
 * theirs alone — and all of it is data, raised by the director from the boss's own events.
 */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }), new Set(Object.keys(SKILLS)));
  return { bus, calls, ids: () => calls.map((c) => c.id) };
}

const TRIGGERS = ['bossWake', 'bossStrike', 'bossPhase', 'bossDefeated'] as const;

describe('the boss effects are data', () => {
  it('every trigger is bound to effects that exist, and every one of them is in the enemy\'s colour (violet), never the hero\'s', () => {
    for (const t of TRIGGERS) {
      expect(VFX_BINDINGS[t].length, t).toBeGreaterThan(0);
      for (const id of VFX_BINDINGS[t]) {
        expect(VFX[id], `${t} → ${id}`).toBeDefined();
        expect(VFX[id]!.palette, `${t} → ${id}`).toBe('enemy');
      }
    }
  });

  it('the wake, the second phase and the fall are rings that SWEEP OUT (they grow), and the fall is the biggest and the slowest of them', () => {
    const ring = (id: string) => {
      const d = VFX[id]!;
      expect(d.kind, id).toBe('flash');
      if (d.kind !== 'flash') throw new Error(id);
      expect(d.shape, id).toBe('ring');
      expect(d.size[1], `${id} grows`).toBeGreaterThan(d.size[0]);
      return d;
    };
    const wake = ring('boss_wake_ring');
    const phase = ring('boss_phase_ring');
    const defeat = ring('boss_defeat_ring');
    expect(defeat.size[1]).toBeGreaterThan(wake.size[1]);
    expect(defeat.size[1]).toBeGreaterThan(phase.size[1]);
    expect(defeat.life).toBeGreaterThan(wake.life);
    expect(defeat.life).toBeGreaterThan(phase.life);
    expect(defeat.priority, 'the fall survives a full screen: it outranks every other moment of the fight').toBeGreaterThanOrEqual(
      Math.max(wake.priority, phase.priority, VFX['boss_strike_burst']!.priority, VFX['boss_strike_flash']!.priority),
    );
  });

  it('a strike is a short column of ink going UP and a flash that is gone in a blink: strikes come in fours and must not smear the floor', () => {
    const burst = VFX['boss_strike_burst']!;
    expect(burst.kind === 'particles' && burst.aim).toBe('up');
    expect(burst.kind === 'particles' && burst.life[1]).toBeLessThanOrEqual(0.5);
    const flash = VFX['boss_strike_flash']!;
    expect(flash.kind === 'flash' && flash.life).toBeLessThanOrEqual(0.2);
  });

  it('the swell of motes at the wake rises (it comes from the crest, up in the dark) and the fall reuses the ink burst of any death', () => {
    const motes = VFX['boss_wake_motes']!;
    expect(motes.kind === 'particles' && motes.aim).toBe('up');
    expect(VFX_BINDINGS.bossDefeated).toContain('death_motes');
    expect(VFX_BINDINGS.bossPhase).toContain('boss_wake_motes');
  });
});

describe('the director raises them from the boss\'s events', () => {
  it('waking: the ring and the motes open at the crest — 3.2 m over its feet', () => {
    const { bus, calls, ids } = setup();
    bus.emit('boss:started', { id: 'warden', defId: 'ink_warden', nameKey: 'enemy.warden.name', health: 24, maxHealth: 24, x: 58, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.bossWake);
    expect(calls[0]!.at).toMatchObject({ x: 58, y: 3.2 });
  });

  it('a strike erupts where it lands — at the floor of the strike, pushing UP', () => {
    const { bus, calls, ids } = setup();
    bus.emit('boss:strike', { id: 'warden', defId: 'ink_warden', attack: 'rain', x: 41.7, y: 0, w: 1.7 });
    expect(ids()).toEqual(VFX_BINDINGS.bossStrike);
    expect(calls[0]!.at).toMatchObject({ x: 41.7, y: 0.2, dirX: 0, dirY: 1 });
  });

  it('the second phase: a ring at the crest, and the same swell of motes', () => {
    const { bus, calls, ids } = setup();
    bus.emit('boss:phase', { id: 'warden', defId: 'ink_warden', phase: 2, x: 52, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.bossPhase);
    expect(calls[0]!.at).toMatchObject({ x: 52, y: 3.2 });
  });

  it('the fall: the great ring at the middle of the column (1.5 m), and the ink burst of a death comes from its `actor:died` on top, not from here', () => {
    const { bus, calls, ids } = setup();
    bus.emit('boss:defeated', { id: 'warden', defId: 'ink_warden', x: 49, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.bossDefeated);
    expect(calls[0]!.at).toMatchObject({ x: 49, y: 1.5 });
    bus.emit('actor:died', { id: 'warden', team: 'enemy', x: 49, y: 1.4 });
    expect(ids()).toEqual([...VFX_BINDINGS.bossDefeated, ...VFX_BINDINGS.enemyDied]);
  });

  it('nothing else raises them: a seal turning a blow away, or a pickup, plays its own effects, not the boss\'s', () => {
    const { bus, ids } = setup();
    bus.emit('seal:rejected', { id: 'seal_1', attackId: 'player_slash', x: 61.7, y: 1.1, direction: 1, shake: 0.1 });
    bus.emit('interaction:performed', { id: 'reward_air_dash', kind: 'pickup', x: 84, y: 1.2 } as never);
    const boss = new Set(TRIGGERS.flatMap((t) => VFX_BINDINGS[t]));
    expect(ids().filter((id) => boss.has(id) && id !== 'death_motes')).toEqual([]);
  });
});
