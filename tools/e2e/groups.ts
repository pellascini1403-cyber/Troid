/**
 * THE CI'S PARTITION OF THE END-TO-END SUITE (docs/PROMPT25-LOG.md): every scene of `registry.ts` belongs to exactly one group, and the CI (`.github/workflows/ci.yml`) runs every group against the production build. Until Prompt 25 only
 * twenty of the sixty-nine scenes were in the CI; the other forty-nine were run by hand before a release, and a scene that is run by hand fails unseen: `touch` was red for an unknown time, and `player-art` was found red
 * only when somebody ran the whole suite. `tests/unit/tools/e2eGroups.test.ts` keeps this honest: a scene added to the registry and not given to a group fails the unit tests, and so does a group the CI does not run.
 *
 * The groups are sized by what each takes on the CI runner (software GL, ~1.3 times slower than a developer's machine), so that none of them is the one the others wait for:
 *   play       ~25 min   the player's whole way: a first game, the rooms, the pause and its map, the pad, the end of the adventure
 *   stability  ~3 min    a game that breaks, what it sends and keeps, whether it can be read
 *   journey    ~9 min    the whole adventure in one page, replayed bit for bit
 *   interface  ~15 min   controls and screens: touch, the phone classes, the HUD, the settings, the saves, the sound
 *   world      ~14 min   what is drawn and fought: art, light, effects, the guardians, the hazards
 * Run one with `npm run test:e2e -- --prod --group=<name>`.
 */
export const GROUPS: Readonly<Record<string, readonly string[]>> = {
  play: ['boot', 'movement', 'combat', 'room', 'rooms', 'world', 'pause', 'pauseMap', 'gamepad', 'focus', 'ending', 'finale', 'adaptive', 'lava'],
  stability: ['resilience', 'privacy', 'readable', 'sprites'],
  journey: ['fullrun'],
  interface: ['touch', 'touchEditor', 'mobile', 'vertical', 'hud', 'settings', 'language', 'accessibility', 'textFit', 'tabs', 'slots', 'save', 'pauseZone', 'interaction', 'devtools', 'checkpoint', 'audio', 'audio-cues'],
  world: [
    'assets',
    'player-art',
    'player-anim',
    'player-lab',
    'player-r1',
    'environment',
    'art-performance',
    'cost',
    'room-art',
    'world-art',
    'crouch',
    'slime',
    'r1',
    'death',
    'render',
    'camera',
    'vfx',
    'vfx-art',
    'lighting',
    'fallbacks',
    'stress',
    'magic',
    'bolt',
    'bottles',
    'bottle4',
    'progression',
    'transition',
    'arrival',
    'boss',
    'boss-death',
    'hazard',
    'soak',
  ],
};
