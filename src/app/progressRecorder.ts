import type { GameSession } from '@/gameplay/GameSession';
import { captureProgress } from '@/gameplay/progress';
import type { ProgressStore } from '@/save/ProgressStore';

/**
 * Saves the progress when something that belongs to it changes (docs/PROMPT6-LOG.md S24): a flag, a card, an ability, a new bottle slot,
 * a room entered, a rest, a defeat that brought the hero back somewhere else (where a game saved now picks up). Changes come in bursts (taking a card sets a flag, equips it and teaches an ability in the same tick), so it
 * saves ONCE per burst, right after the tick that made them. The store skips a write that changes nothing and never lets a failed one
 * damage the last good copy, so calling it often is safe. Returns what stops it.
 */
export function attachProgressRecorder(session: GameSession, store: ProgressStore): () => void {
  let pending = false;
  let closed = false;
  const dirty = (): void => {
    if (pending || closed) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!closed) void store.save(captureProgress(session));
    });
  };
  const bus = session.bus;
  const off = [
    bus.on('flag:set', dirty),
    bus.on('flag:cleared', dirty),
    bus.on('card:changed', dirty),
    bus.on('ability:unlocked', dirty),
    bus.on('bottle:changed', (e) => e.type === 'added' && dirty()),
    bus.on('room:entered', dirty),
    bus.on('checkpoint:set', dirty),
    bus.on('death:respawned', dirty),
  ];
  return () => {
    closed = true;
    for (const f of off) f();
  };
}
