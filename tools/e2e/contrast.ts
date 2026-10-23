import type { Page } from 'playwright-core';

/**
 * A READABILITY AUDIT of the text a page shows, done in the browser with what the browser computed (docs/PROMPT20-LOG.md): for every element that holds text of its own, the colour it is drawn with — its `color` and every
 * `opacity` of it and of what holds it — against the background it is drawn on — every translucent layer from the page down to it, put one over the other — as the WCAG contrast ratio, with the limit a text of that size
 * must reach (4.5 : 1; 3 : 1 for large text: 24 px, or 18.66 px in bold). The page under a translucent panel is the game, whose colours the test cannot know: the panels of the menu are almost opaque, and the
 * audit takes the darkest and the lightest thing the game could show under them and asks for the limit to be reached on BOTH.
 */
export interface LowContrast {
  text: string;
  ratio: number;
  need: number;
  size: number;
  color: string;
  background: string;
  path: string;
}

/** The audit, as the plain JavaScript the page runs (a function handed to the browser would carry the helpers of the tool that compiled it). */
const AUDIT = `(rootSelector, floor) => {
  const parse = (css) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(css);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const root = document.querySelector(rootSelector);
  if (!root) return { checked: 0, failures: [] };
  const chain = (el) => { const out = []; for (let e = el; e; e = e.parentElement) out.unshift(e); return out; };
  const path = (el) => el.tagName.toLowerCase() + (el.dataset && el.dataset.testid ? '[' + el.dataset.testid + ']' : typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '');
  const hidden = (el) => chain(el).some((e) => { const s = getComputedStyle(e); return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || e.hidden; });
  const failures = [];
  let checked = 0;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el instanceof SVGElement && el.tagName !== 'text') continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    if (own.length === 0 || hidden(el)) continue;
    const style = getComputedStyle(el);
    const opacity = chain(el).reduce((o, e) => o * Number(getComputedStyle(e).opacity), 1);
    const [r, g, b, a] = parse(el instanceof SVGElement ? style.fill : style.color);
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700 || style.fontWeight === 'bold';
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const layers = chain(el).map((e) => parse(getComputedStyle(e).backgroundColor)).filter((c) => c[3] > 0);
    let low = null;
    for (const under of [[0, 0, 0], [255, 255, 255]]) {
      let bg = under;
      for (const layer of layers) bg = over(layer, bg);
      const fg = over([r, g, b, a * opacity], bg);
      const ra = ratio(fg, bg);
      if (!low || ra < low.ratio) low = { ratio: ra, bg };
    }
    checked++;
    if (low.ratio + floor < need) failures.push({ text: own.slice(0, 48), ratio: Math.round(low.ratio * 100) / 100, need, size, color: style.color, background: 'rgb(' + low.bg.map(Math.round).join(',') + ')', path: path(el) });
  }
  return { checked, failures };
}`;

export async function contrastAudit(page: Page, rootSelector: string, floor = 0): Promise<{ checked: number; failures: LowContrast[] }> {
  return (await page.evaluate(`(${AUDIT})(${JSON.stringify(rootSelector)}, ${floor})`)) as { checked: number; failures: LowContrast[] };
}
