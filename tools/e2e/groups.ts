/**
 * THE CI'S PARTITION OF THE END-TO-END SUITE (docs/PROMPT25-LOG.md): every scene of `registry.ts` belongs to exactly one group, and the CI (`.github/workflows/ci.yml`) runs every group against the production build. Until Prompt 25 only
 * twenty of the sixty-nine scenes were in the CI; the other forty-nine were run by hand before a release, and a scene that is run by hand fails unseen: `touch` was red for an unknown time, `player-art` was found red
 * only when somebody ran the whole suite, and `arrival` — one of the forty-nine — turned out to be red on the runner the first time it ran there. `tests/unit/tools/e2eGroups.test.ts` keeps this honest: a scene added to the
 * registry and not given to a group fails the unit tests, and so does a group the CI does not run.
 *
 * The groups are sized by what each takes on the CI runner (software GL, shared hardware: the same scene took between one and two times as long from one run to the next — `resilience` 244–492 s, `focus` 145–312 s), so that none
 * of them is the one the others wait for and the slowest run of the slowest group stays far from the job's limit. Measured on the runs of the CI (the sum of each group's scenes, at their fastest and at their slowest, in minutes;
 * a job adds about four for the checkout, the install, the browser and the build):
 *   play        9 scenes   5–10   the player's first way: a first game, the rooms, the pad, the light that follows the machine
 *   pause      5 scenes    8–16   the pause and its map, the loss of focus, the end of the adventure
 *   stability   4 scenes   5–11   a game that breaks, what it sends and keeps, whether it can be read, the sprites
 *   journey     1 scene    7–10   the whole adventure in one page, replayed bit for bit
 *   controls    9 scenes   8–15   touch, the phone classes, the HUD, the settings, the words, the text that fits
 *   saves       9 scenes   8–13   the saved games, the tabs, the checkpoints, the devtools, the sound
 *   art        17 scenes   10     what is drawn: the hero and the rooms in art, the light, the effects, the cost
 *   fights     15 scenes   8–9    what is fought: the guardians, the bottles, the bolt, the hazards, the arrival at a room
 * Run one with `npm run test:e2e -- --prod --group=<name>`.
 */
export const GROUPS: Readonly<Record<string, readonly string[]>> = {
  play: ['boot', 'movement', 'combat', 'room', 'rooms', 'world', 'gamepad', 'adaptive', 'lava'],
  pause: ['pause', 'pauseMap', 'focus', 'ending', 'finale'],
  stability: ['resilience', 'privacy', 'readable', 'sprites'],
  journey: ['fullrun'],
  controls: ['touch', 'touchEditor', 'mobile', 'vertical', 'hud', 'settings', 'language', 'accessibility', 'textFit'],
  saves: ['tabs', 'slots', 'save', 'pauseZone', 'interaction', 'devtools', 'checkpoint', 'audio', 'audio-cues'],
  art: [
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
    'vfx',
    'vfx-art',
    'lighting',
    'render',
    'camera',
    'fallbacks',
    'stress',
  ],
  fights: ['crouch', 'slime', 'r1', 'death', 'magic', 'bolt', 'bottles', 'bottle4', 'progression', 'transition', 'arrival', 'boss', 'boss-death', 'hazard', 'soak'],
};
