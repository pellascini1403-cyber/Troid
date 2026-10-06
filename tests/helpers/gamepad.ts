import type { PadProvider } from '@/input/sources/GamepadSource';
import { VirtualPad } from '@/input/sources/VirtualPad';

/** Standard-mapping button indices (docs/GAME-SPEC-2D.md §4.2). */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** The abstract gamepad of the tests: the same `VirtualPad` the browser E2E drives through a hook. */
export { VirtualPad as FakePad };

/** A provider over a mutable list of pads (hot-plug = editing the list). */
export function padList(...pads: Array<VirtualPad | null>): { provider: PadProvider; pads: Array<VirtualPad | null> } {
  const list = [...pads];
  return { provider: () => list, pads: list };
}
