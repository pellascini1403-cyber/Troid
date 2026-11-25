import type { Page } from 'playwright-core';

/**
 * DOES THE TEXT FIT (docs/PROMPT25-LOG.md): the other half of «can it be read» (`contrast.ts`). A string that is long in one language and short in the other, on a screen as small as a phone's, is cut off: by a box that hides
 * what overflows it, by an ellipsis, or by the edge of the window. `contrastAudit` cannot see that — the part that is drawn reads well — so this looks at the geometry the browser laid out, text by text.
 *
 * A text is flagged when
 *  - its box holds more than it shows (`scrollWidth` / `scrollHeight` beyond `clientWidth` / `clientHeight`) and its `overflow` hides the rest (`hidden`, `clip`) — an ellipsis included: «Resume the…» is a cut text;
 *  - or the line of text itself reaches past the nearest ancestor that clips it, or past the window.
 * A box that scrolls on purpose (`overflow: auto | scroll`) is not a fault: what it holds is reached by scrolling.
 */
export interface Cut {
  /** Where it is: the tags, ids and classes up to the root. */
  path: string;
  text: string;
  /** What the box shows against what it holds, or by how many px the text passes its clip. */
  why: string;
}

export interface FitReport {
  checked: number;
  failures: Cut[];
}

export async function fitAudit(page: Page, root: string): Promise<FitReport> {
  return (await page.evaluate(`((rootSel) => {
    const base = document.querySelector(rootSel);
    const out = { checked: 0, failures: [] };
    if (!base) return out;
    const label = (el) => { const parts = []; for (let n = el; n && n !== base.parentElement; n = n.parentElement) parts.unshift(n.tagName.toLowerCase() + (n.dataset && n.dataset.testid ? '[' + n.dataset.testid + ']' : n.id ? '#' + n.id : n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/)[0] : '')); return parts.slice(-4).join(' > '); };
    const hides = (v) => v === 'hidden' || v === 'clip';
    const clipAncestor = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const s = getComputedStyle(n); if (hides(s.overflowX) || hides(s.overflowY) || s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowY === 'auto' || s.overflowY === 'scroll') return n; } return null; };
    const W = window.innerWidth, H = window.innerHeight;
    for (const el of [base, ...base.querySelectorAll('*')]) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent || '').trim());
      if (own.length === 0) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || el.closest('[hidden]') || parseFloat(s.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      out.checked++;
      const text = own.map((n) => n.textContent.trim()).join(' ').slice(0, 60);
      const why = [];
      if (hides(s.overflowX) && el.scrollWidth > el.clientWidth + 1) why.push('shows ' + el.clientWidth + 'px of ' + el.scrollWidth + 'px wide');
      if (hides(s.overflowY) && el.scrollHeight > el.clientHeight + 1) why.push('shows ' + el.clientHeight + 'px of ' + el.scrollHeight + 'px high');
      // the line itself against what clips it and against the window
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const clip = clipAncestor(el);
      if (clip) {
        const c = clip.getBoundingClientRect();
        const sc = getComputedStyle(clip);
        if (hides(sc.overflowX) && (r.right > c.right + 1.5 || r.left < c.left - 1.5)) why.push('passes its clip by ' + Math.round(Math.max(r.right - c.right, c.left - r.left)) + 'px');
        if (hides(sc.overflowY) && (r.bottom > c.bottom + 1.5 || r.top < c.top - 1.5)) why.push('passes its clip by ' + Math.round(Math.max(r.bottom - c.bottom, c.top - r.top)) + 'px (vertically)');
      }
      if (r.width > 0 && (r.right > W + 1.5 || r.left < -1.5 || r.bottom > H + 1.5 || r.top < -1.5) && !clip) why.push('is outside the window');
      if (why.length > 0) out.failures.push({ path: label(el), text, why: why.join('; ') });
    }
    return out;
  })(${JSON.stringify(root)})`)) as FitReport;
}

export const describeCut = (c: Cut): string => `"${c.text}" (${c.path}): ${c.why}`;
