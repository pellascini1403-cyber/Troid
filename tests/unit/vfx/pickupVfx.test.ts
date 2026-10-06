import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/**
 * The look of taking something up (docs/PROMPT6-LOG.md S27): the light of the object opens where it floated — a ring, a flash and a
 * handful of motes that rise — in the hero's energy palette. Data, raised by the director from the interaction event; only a PICKUP
 * does it (a lever, a door and a shrine have looks of their own).
 */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }), new Set(Object.keys(SKILLS)));
  return { bus, calls, ids: () => calls.map((c) => c.id) };
}
const notice = (kind: 'pickup' | 'activate' | 'open' | 'rest') => ({ id: 'thing', kind, verbKey: 'interact.pickUp', x: 49.5, y: 6 });

describe('the pickup effects are data', () => {
  it('the trigger is bound to effects that exist, in the hero\'s energy palette (no violet: nothing here is an enemy)', () => {
    expect(VFX_BINDINGS.pickup.length).toBeGreaterThan(0);
    for (const id of VFX_BINDINGS.pickup) {
      expect(VFX[id], id).toBeDefined();
      expect(VFX[id]!.palette, id).toBe('energy');
    }
  });

  it('light that rises over a flash, and a ring that OPENS (it grows)', () => {
    const motes = VFX['pickup_motes']!;
    expect(motes.kind === 'particles' && motes.aim).toBe('up');
    expect(motes.kind === 'particles' && motes.blend).toBe('add');
    const ring = VFX['pickup_ring']!;
    expect(ring.kind).toBe('flash');
    if (ring.kind !== 'flash') return;
    expect(ring.shape).toBe('ring');
    expect(ring.size[1]).toBeGreaterThan(ring.size[0]);
    const flash = VFX['pickup_flash']!;
    expect(flash.kind === 'flash' && flash.role).toBe('hot');
  });
});

describe('the director raises it from the interaction event', () => {
  it('taking a pickup opens its light where the object floated (0.35 m under the icon: 0.85 m over its feet)', () => {
    const { bus, calls, ids } = setup();
    bus.emit('interaction:performed', notice('pickup'));
    expect(ids()).toEqual(VFX_BINDINGS.pickup);
    expect(calls[0]!.at).toMatchObject({ x: 49.5, y: 5.65 });
  });

  it('a lever, a door and a shrine do not: each has a look of its own', () => {
    const { bus, ids } = setup();
    for (const kind of ['activate', 'open'] as const) bus.emit('interaction:performed', notice(kind));
    expect(ids()).toEqual([]);
  });

  it('a shrine shows the rest as the warm light of a drink, not as a pickup', () => {
    const { bus, ids } = setup();
    bus.emit('interaction:performed', notice('rest'));
    bus.emit('checkpoint:set', { room: 'r2_hall', entry: 'rest', x: 12.8, y: 0 });
    expect(ids()).toEqual(VFX_BINDINGS.drinkHeal);
  });
});
