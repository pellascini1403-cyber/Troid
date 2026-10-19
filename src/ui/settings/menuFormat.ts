/**
 * How the menu writes numbers it was given (docs/PROMPT14-LOG.md): pure, so they are tested without a screen. Neither is a word of the game: a clock is digits and colons, and a date is the
 * platform's own, in the language in force.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Simulation ticks (60 to the second) as a clock: `23:45`, or `1:23:45` from the first hour. Never negative, never fractional. */
export function formatClock(ticks: number): string {
  const total = Number.isFinite(ticks) ? Math.max(0, Math.floor(ticks / 60)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The moment a game was saved, as the platform writes a date and a time in `locale` (`''` when it is not known, or the engine cannot write it). */
export function formatSavedAt(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return '';
  }
}
