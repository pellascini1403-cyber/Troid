/**
 * THE MIX THE PLAYER CONTROLS (docs/PROMPT18-LOG.md): four volumes — the general one and one for each kind of sound the game makes — as DATA, shared by the settings (which save them), the menu (which shows them) and the
 * engine (which plays at them). PURE: no sound is made here.
 *
 * The categories are what a player thinks in: the MUSIC, the EFFECTS (what the hero and the enemies do, the interface), the AMBIENCE (the place itself: its wind, its water, its echoes) and the GENERAL volume over all of
 * them. A category at zero is SILENT — nothing of it is played, loaded or kept going behind — and a general volume at zero silences everything.
 */
export const AUDIO_CATEGORIES = ['master', 'music', 'sfx', 'ambience'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

/** The level of each one, 0 (silence) … 1, as a player sees it (a slider); the amplitude is the square of it (`gainOf`). */
export type AudioLevels = Record<AudioCategory, number>;

/** Where the sliders start: the music sits under the effects (which carry the information of a fight) and the ambience under both. */
export const DEFAULT_AUDIO_LEVELS: Readonly<AudioLevels> = { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8 };

export const AUDIO_LEVEL_LIMITS = { min: 0, max: 1 } as const;
