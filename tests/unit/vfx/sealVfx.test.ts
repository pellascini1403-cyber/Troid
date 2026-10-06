import { describe, expect, it } from 'vitest';
import { SKILLS } from '@/content/skills';
import { VFX, VFX_BINDINGS } from '@/content/vfx';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { VfxSpawn } from '@/presentation/vfx';
import { VfxDirector } from '@/vfx/VfxDirector';
import type { VfxSystem } from '@/vfx/VfxSystem';

/**
 * What a seal looks like when it answers (docs/PROMPT6-LOG.md S28): a blow it turns away snaps a violet ring open where it landed and
 * springs sparks back the way the blow came from — the ward is of the enemy's colour — and when it breaks it falls like any guardian: the
 * ink burst of a death, raised by the very event the session uses to set its flag. Data, raised by the director from events.
 */
function setup() {
  const calls: Array<{ id: string; at: VfxSpawn }> = [];
  const system = { spawn: (id: string, at: VfxSpawn) => (calls.push({ id, at }), true) } as unknown as VfxSystem;
  const bus = new EventBus<GameEvents>();
  new VfxDirector(bus, system, VFX_BINDINGS, VFX, () => ({ x: 0, y: 0 }), new Set(Object.keys(SKILLS)));
  return { bus, calls, ids: () => calls.map((c) => c.id) };
}

describe('the rejection effects are data', () => {
  it('the trigger is bound to effects that exist, in the colour of what is enemy to the hero (violet) — and a ring that opens', () => {
    expect(VFX_BINDINGS.sealRejected.length).toBeGreaterThan(0);
    for (const id of VFX_BINDINGS.sealRejected) {
      expect(VFX[id], id).toBeDefined();
      expect(VFX[id]!.palette, id).toBe('enemy');
    }
    const ring = VFX['seal_reject_ring']!;
    expect(ring.kind === 'flash' && ring.shape).toBe('ring');
    expect(ring.kind === 'flash' && ring.size[1]).toBeGreaterThan(ring.kind === 'flash' ? ring.size[0] : 0);
  });

  it('the sparks spring BACK (against the way the blow went) and are short-lived: a refusal, not a hit', () => {
    const sparks = VFX['seal_reject_sparks']!;
    expect(sparks.kind === 'particles' && sparks.aim).toBe('back');
    expect(sparks.kind === 'particles' && sparks.life[1]).toBeLessThan(0.5);
  });
});

describe('the director raises them from the seal\'s events', () => {
  it('a blow turned away raises the rejection where it landed, facing the way the blow was going', () => {
    const { bus, calls, ids } = setup();
    bus.emit('seal:rejected', { id: 'seal_1', attackId: 'player_slash', x: 61.7, y: 1.1, direction: 1, shake: 0.1 });
    expect(ids()).toEqual(VFX_BINDINGS.sealRejected);
    expect(calls[0]!.at).toMatchObject({ x: 61.7, y: 1.1, facing: 1, dirX: 1 });
  });

  it('the fall of a seal is the ink burst of a death (its `actor:died` is a neutral one), and a seal that rejects does not die', () => {
    const { bus, ids } = setup();
    bus.emit('actor:died', { id: 'seal_1', team: 'neutral', x: 63, y: 1.8 });
    expect(ids()).toEqual(VFX_BINDINGS.enemyDied);
  });
});
