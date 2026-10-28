import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AmbientScatter } from '@/audio/ambience';
import { AudioDirector } from '@/audio/AudioDirector';
import { Conductor, FADE } from '@/audio/conductor';
import { LoopChannel } from '@/audio/loops';
import { parseIndex } from '@/audio/manifest';
import { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import { makeRig } from './audioRig';

/**
 * THE GAME'S OWN AUDIO, RUN THROUGH THE ENGINE (docs/PROMPT18-LOG.md): the real manifest (`public/audio/index.json`), the real table of places and the real conductor, over a fake Web Audio and a fake network that
 * serves the sizes the files really have — a walk from R1 to the end of R4 and the fight with the Warden, played as the events the simulation raises. What it proves is that the content and the engine agree: every piece
 * the places name is in the manifest, the music goes where it should and is never twice, what is held in memory is what the hero is near, and the memory stays within a budget a phone can carry.
 */
export const INDEX = parseIndex(JSON.parse(readFileSync(resolve(__dirname, '../../public/audio/index.json'), 'utf8')));
export const MIB = 1024 * 1024;

/** The rig of the game's audio. With `bus` it listens to THAT bus — the one of a running simulation — instead of one the test raises the events on by hand. */
export async function game(opts: { bus?: EventBus<GameEvents>; room?: string } = {}) {
  if (!INDEX) throw new Error('the manifest of the game could not be read');
  const rig = makeRig({ index: INDEX });
  const bus = opts.bus ?? new EventBus<GameEvents>();
  if (!opts.bus) {
    bus.onError = (e) => {
      throw e;
    };
  }
  const music = new LoopChannel({ engine: rig.engine, loader: rig.loader, index: INDEX, levels: rig.levels, bus: 'music' });
  const ambience = new LoopChannel({ engine: rig.engine, loader: rig.loader, index: INDEX, levels: rig.levels, bus: 'ambience' });
  const scatter = new AmbientScatter(rig.engine, () => 0.5);
  const conductor = new Conductor({ engine: rig.engine, music, ambience, scatter, bus, room: opts.room ?? 'r1_gate', hasTrack: (id) => Boolean(INDEX.tracks[id]), loader: rig.loader });
  const plays: string[] = [];
  const play = rig.engine.play.bind(rig.engine);
  rig.engine.play = (r) => {
    const ok = play(r);
    if (ok) plays.push(r.id);
    return ok;
  };
  new AudioDirector(bus, conductor, { now: () => 0 });
  rig.start();
  await rig.loader.retain('core');
  await rig.settle();
  const run = (seconds: number, frame: { life?: number } = {}): void => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) {
      rig.ctx.advance(0.05);
      conductor.update(0.05, { x: 10, y: 0, ...frame });
    }
  };
  const go = async (room: string): Promise<void> => {
    bus.emit('room:loaded', { roomId: room, entryId: 'west' });
    await rig.settle();
    run(FADE.zone + FADE.bed + 1);
  };
  const loops = () => rig.ctx.sources.filter((s) => s.loop && !s.ended && s.startedAt !== null && s.stoppedAt === null);
  return { rig, bus, music, ambience, conductor, plays, run, go, loops };
}
