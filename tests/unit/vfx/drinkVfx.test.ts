import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/**
 * The look of drinking a bottle (docs/GAME-SPEC-2D.md §11): a ring of light closes in on the hero during the channel and a flash
 * with a few motes rises when the life comes back. They are data in the hero's energy palette, raised by the director from the
 * simulation's events; an interrupted or refused drink shows no healing.
 */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }), new Set(Object.keys(SKILLS)));
  return { bus, calls, ids: () => calls.map((c) => c.id) };
}

describe('the drink effects are data', () => {
  it('both triggers are bound to effects that exist, in the hero\'s energy palette (no violet, no warm accent)', () => {
    for (const trigger of ['drinkStart', 'drinkHeal'] as const) {
      expect(VFX_BINDINGS[trigger].length, trigger).toBeGreaterThan(0);
      for (const id of VFX_BINDINGS[trigger]) {
        expect(VFX[id], `${trigger} → ${id}`).toBeDefined();
        expect(VFX[id]!.palette, id).toBe('energy');
      }
    }
  });

  it('the ring CLOSES IN (it shrinks) while the channel runs, and lasts about as long as it (0.4 s)', () => {
    const ring = VFX['drink_gather']!;
    expect(ring.kind).toBe('flash');
    if (ring.kind !== 'flash') return;
    expect(ring.shape).toBe('ring');
    expect(ring.size[1]).toBeLessThan(ring.size[0]);
    expect(ring.life).toBeCloseTo(0.4, 6);
  });

  it('the heal is light that rises: additive motes aimed up, over a white-hot flash', () => {
    const motes = VFX['drink_heal_motes']!;
    expect(motes.kind === 'particles' && motes.aim).toBe('up');
    expect(motes.kind === 'particles' && motes.blend).toBe('add');
    const flash = VFX['drink_heal_flash']!;
    expect(flash.kind === 'flash' && flash.role).toBe('hot');
  });
});

describe('the director raises them from simulation events', () => {
  it('the start of the channel closes a ring on the hero (at chest height)', () => {
    const { bus, calls, ids } = setup();
    bus.emit('bottle:drinkStarted', { slot: 0, x: 4, y: 1, ticks: 24 });
    expect(ids()).toEqual(VFX_BINDINGS.drinkStart);
    expect(calls[0]!.at).toMatchObject({ x: 4, y: 1.9 });
  });

  it('the end of the channel is the heal', () => {
    const { bus, calls, ids } = setup();
    bus.emit('bottle:drunk', { slot: 1, healed: 2, x: -3, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.drinkHeal);
    expect(calls[0]!.at).toMatchObject({ x: -3, y: 0.9 });
  });

  it('an interrupted or refused drink raises no healing effect', () => {
    const { bus, ids } = setup();
    bus.emit('bottle:interrupted', { slot: 0, reason: 'hit' });
    bus.emit('bottle:denied', { reason: 'full' });
    expect(ids()).toEqual([]);
  });
});
