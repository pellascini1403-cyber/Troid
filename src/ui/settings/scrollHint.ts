/**
 * Tells the stylesheet whether there is MORE to scroll to below what is seen (`data-more="1"` on the element; `menuStyle` fades the last lines out while it is true). The screens of the menu scroll in the
 * middle — a phone held sideways is 390 px tall — and a heading cut at the bottom edge with nothing under it does not say that there is a way down. The fade is shown only while it is true: a screen that fits
 * shows none, and one scrolled to its end shows its last line plainly.
 *
 * It looks again when the element is scrolled, when the window changes size (a turn of the phone), when the element changes size (the screen was hidden and is shown; the interface grew) and when what is inside
 * it changes (a question that opens in a card, a language that makes the words longer), and whenever a screen asks (`update`).
 */
export class ScrollHint {
  private readonly stops: Array<() => void> = [];

  constructor(private readonly el: HTMLElement) {
    el.dataset['more'] = '0';
    const look = (): void => this.update();
    el.addEventListener('scroll', look, { passive: true });
    this.stops.push(() => el.removeEventListener('scroll', look));
    const win = el.ownerDocument.defaultView;
    if (!win) return;
    win.addEventListener('resize', look);
    this.stops.push(() => win.removeEventListener('resize', look));
    if (typeof win.MutationObserver === 'function') {
      const content = new win.MutationObserver(look);
      content.observe(el, { childList: true, subtree: true, characterData: true });
      this.stops.push(() => content.disconnect());
    }
    if (typeof win.ResizeObserver === 'function') {
      const size = new win.ResizeObserver(look);
      size.observe(el);
      this.stops.push(() => size.disconnect());
    }
  }

  /** Looks now: is there anything below what is seen? (A pixel of rounding is not "more".) */
  update(): void {
    const el = this.el;
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > 1 ? '1' : '0';
    if (el.dataset['more'] !== more) el.dataset['more'] = more;
  }

  dispose(): void {
    for (const stop of this.stops.splice(0)) stop();
  }
}
