/**
 * THE GAME'S OWN AUDIO, RUN THROUGH THE ENGINE (docs/PROMPT18-LOG.md): the real manifest (`public/audio/index.json`), the real table of places and the real conductor, over a fake Web Audio and a fake network that serves the sizes the files really
 * have (`tests/helpers/audioGame.ts`) — a walk from R1 to the end of R4 and the fight with the Warden, played as the events the simulation raises. What it proves is that the content and the engine agree: every piece the places name is in the
 * manifest, the music goes where it should and is never twice, what is held in memory is what the hero is near, and the memory stays within a budget a phone can carry. The whole world — the sixty-four rooms, the seven fights, the moves of the
 * hero as the simulation really makes them — is `worldAudio.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { FADE } from '@/audio/conductor';
import type { GameEvents } from '@/gameplay/events';
import { ZONES } from '@/audio/zoneAudio';
import { AUDIO_CUES } from '@/presentation/audioCues';
import { game, INDEX, MIB } from '../../helpers/audioGame';

describe('the game\'s audio through the engine', () => {
  it('reads: the manifest of the game is one, with the four pieces, the four beds and the core sounds', () => {
    expect(INDEX).not.toBeNull();
    for (const id of ['ruins', 'chamber', 'sanctum', 'warden', 'bed.ruins', 'bed.roots', 'bed.chamber', 'bed.sanctum']) expect(INDEX?.tracks[id], id).toBeDefined();
    expect(INDEX?.sounds['hero.slash.1']?.group).toBe('core');
  });

  it('plays the right piece and the right bed in each place of the first slice', async () => {
    const g = await game();
    await g.go('r1_gate');
    expect([g.music.stats().current, g.ambience.stats().current]).toEqual(['ruins', 'bed.ruins']);
    await g.go('r2_hall');
    expect([g.music.stats().current, g.ambience.stats().current]).toEqual(['ruins', 'bed.roots']);
    await g.go('r3_chamber');
    expect([g.music.stats().current, g.ambience.stats().current]).toEqual(['chamber', 'bed.chamber']);
    await g.go('r4_sanctum');
    expect([g.music.stats().current, g.ambience.stats().current]).toEqual(['sanctum', 'bed.sanctum']);
  });

  it('never has more than one copy of anything: a piece, a layer, a bed — whatever the order of the rooms', async () => {
    const g = await game();
    for (const room of ['r1_gate', 'r2_hall', 'r1_gate', 'r3_chamber', 'r2_hall', 'r3_chamber', 'r4_sanctum', 'r3_chamber']) {
      g.bus.emit('room:loaded', { roomId: room, entryId: 'west' });
      await g.rig.settle();
      g.run(1.2);
      const copies = new Map<string, number>();
      for (const s of g.loops()) {
        const id = Object.keys(INDEX?.sounds ?? {}).find((k) => (g.rig.loader.get(k)[0] as unknown) === (s.buffer as unknown)) ?? '?';
        copies.set(id, (copies.get(id) ?? 0) + 1);
      }
      for (const [id, n] of copies) expect(n, `${n} copies of ${id} in ${room}`).toBeLessThanOrEqual(1);
    }
  });

  it('carries the fight with the Warden: its piece comes in at the wake, deepens when it turns, and gives way to the calm after its fall, with the victory between', async () => {
    const g = await game();
    await g.go('r4_sanctum');
    expect(g.rig.loader.has('boss.wake'), 'the boss\'s sounds are in once the hero is in the sanctum').toBe(true);
    g.bus.emit('boss:started', { id: 'w', defId: 'ink_warden', nameKey: 'boss.warden', health: 30, maxHealth: 30, x: 58, y: 0 });
    await g.rig.settle();
    g.run(2);
    expect(g.music.stats().current).toBe('warden');
    expect(g.music.stats().layers['drive']).toBeCloseTo(0.45, 6);
    g.bus.emit('boss:phase', { id: 'w', defId: 'ink_warden', phase: 2, x: 50, y: 0 });
    expect(g.music.stats().layers['drive']).toBe(1);
    g.bus.emit('boss:defeated', { id: 'w', defId: 'ink_warden', x: 50, y: 0 });
    g.run(0.3);
    expect(g.plays).toContain('boss.death');
    g.run(2.5);
    await g.rig.settle();
    g.run(FADE.bossOut + 1);
    expect(g.plays).toContain('stinger.victory');
    expect(g.music.stats().current).toBe('sanctum');
  });

  it('holds only what the hero is near: the music of the places behind them is let go, and the whole stays within what a phone can carry', async () => {
    const g = await game();
    const peak = { bytes: 0 };
    for (const room of ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']) {
      await g.go(room);
      g.rig.timers.fire(); // the grace periods of what nobody holds any more run out
      peak.bytes = Math.max(peak.bytes, g.rig.loader.bytes);
    }
    const groups = g.rig.loader.stats().groups;
    expect(groups['music.sanctum']?.state).toBe('ready');
    expect(groups['music.ruins']?.state, 'the piece of the ruins is gone from memory').toBe('idle');
    expect(groups['music.chamber']?.state).toBe('idle');
    expect(groups['amb.ruins']?.state).toBe('idle');
    expect(groups['amb.sanctum']?.state).toBe('ready');
    expect(g.rig.loader.bytes / MIB, 'what is in memory at the sanctum, in MiB').toBeLessThan(52);
    expect(peak.bytes / MIB, 'the most it ever was at the end of a change of room, in MiB').toBeLessThan(55);
  });

  it('keeps the hero\'s sounds always there, and fetches the boss\'s only for the sanctum', async () => {
    const g = await game();
    expect(g.rig.loader.isReady('core')).toBe(true);
    expect(g.rig.loader.isReady('boss')).toBe(false);
    await g.go('r2_hall');
    expect(g.rig.loader.isReady('boss')).toBe(false);
    await g.go('r4_sanctum');
    expect(g.rig.loader.isReady('boss')).toBe(true);
    await g.go('r3_chamber');
    g.rig.timers.fire();
    expect(g.rig.loader.isReady('boss')).toBe(false);
  });

  it('plays a sound for the moments of a journey — steps by the floor, the blows, the hurt, the bottle, the world — and none of them is lost as unknown', async () => {
    const g = await game();
    await g.go('r2_hall');
    const emit = g.bus.emit.bind(g.bus) as (type: keyof GameEvents, payload: unknown) => void;
    emit('player:stepped', { x: 10, y: 0, speed: 8.5, crouch: false });
    emit('player:jumped', { x: 10, y: 0, air: false });
    emit('player:landed', { x: 10, y: 0, impact: 16 });
    emit('player:dashed', { x: 10, y: 0, facing: 1, air: false });
    emit('player:attackActive', { attackId: 'slash_1', x: 10, y: 1, facing: 1, air: false, combo: 0, rect: { x0: 0, y0: 0, x1: 1, y1: 1 } });
    emit('combat:hit', { attackerId: 'p', targetId: 'e', attackId: 'slash_1', targetTeam: 'enemy', damage: 1, x: 12, y: 1, direction: 1, killed: false, hitStop: 2, shake: 0 });
    emit('player:hurt', { x: 10, y: 0, damage: 2, direction: 1 });
    emit('bottle:drinkStarted', { slot: 0, x: 10, y: 0, ticks: 24 });
    emit('bottle:drunk', { slot: 0, healed: 2, x: 10, y: 0 });
    emit('interaction:performed', { id: 'bottle_fourth', kind: 'pickup', verbKey: 'x', x: 11, y: 1 });
    emit('gate:changed', { roomId: 'r2_hall', gateId: 'g', open: true });
    emit('hazard:hit', { roomId: 'r2_hall', hazardId: 'h', kind: 'spikes', damage: 1, x: 40, y: -2 });
    emit('enemy:alerted', { id: 's', defId: 'ink_slime', x: 20, y: 0 });
    emit('enemy:telegraph', { id: 's', defId: 'ink_slime', x: 20, y: 0, facing: -1, ticks: 24, attack: 'slime_lunge' });
    emit('enemy:struck', { id: 's', defId: 'ink_slime', x: 20, y: 0, facing: -1, attack: 'slime_lunge' });
    emit('actor:died', { id: 's', team: 'enemy', x: 20, y: 0 });
    g.run(0.2);
    for (const id of ['hero.step.earth', 'hero.jump', 'hero.land.heavy', 'hero.dash.ground', 'hero.slash.1', 'hit.light', 'hero.hurt.heavy', 'bottle.start', 'bottle.drunk', 'interact.pickup', 'gate.open', 'hazard.spikes', 'slime.alert', 'slime.telegraph', 'slime.lunge', 'slime.death']) {
      expect(g.plays, id).toContain(id);
    }
    expect(g.rig.engine.stats().dropped.unknown).toBe(0);
  });

  it('answers every kind of cue without a sound of the manifest missing: none is dropped as unknown', async () => {
    const g = await game();
    await g.go('r4_sanctum');
    const variants = ['', 'slash_1', 'ground', 'air', 'open', 'pickup', 'activate', 'warden_rain', 'warden_charge', 'slime_lunge', 'crouch', 'range', 'wall', 'ink_slime'];
    for (const cue of AUDIO_CUES) {
      for (const v of variants) {
        for (const intensity of [0.2, 0.55, 1]) g.conductor.cue({ cue, tick: 0, x: 10, y: 0, intensity, variant: v });
        g.run(0.1);
        g.rig.ctx.advance(10); // past every cooldown
      }
    }
    expect(g.rig.engine.stats().dropped.unknown).toBe(0);
  });

  it('lets each place be heard as it is: its small sounds are played — from its own list, and from the group the place holds — and no other place\'s', async () => {
    const g = await game();
    for (const room of ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']) {
      await g.go(room);
      g.plays.length = 0;
      g.run(90);
      const heard = new Set(g.plays.filter((id) => id.startsWith('amb.')));
      const own = new Set(ZONES[room]?.scatter.map((x) => x.id));
      expect(heard.size, `${room} is heard`).toBeGreaterThan(0);
      for (const id of heard) expect(own.has(id), `${id} belongs to ${room}`).toBe(true);
    }
    expect(g.rig.engine.stats().dropped.notLoaded, 'nothing the places play was missing from memory').toBe(0);
  });

  it('gives the hero a heart of their own when their life is low, and the sound it needs exists', async () => {
    const g = await game();
    await g.go('r1_gate');
    g.run(3, { life: 0.1 });
    expect(g.plays).toContain('hero.heartbeat');
    expect(INDEX?.sounds['hero.heartbeat']?.bus).toBe('sfx');
  });
});
