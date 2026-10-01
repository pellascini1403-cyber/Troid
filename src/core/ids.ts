/**
 * Per-session entity id generator. Deliberately NOT a module-level counter: two sessions (tests, a
 * restarted game) must never share or leak ids.
 */
export class IdGenerator {
  private n = 0;

  next(prefix = 'e'): string {
    return `${prefix}${++this.n}`;
  }

  get count(): number {
    return this.n;
  }
}
