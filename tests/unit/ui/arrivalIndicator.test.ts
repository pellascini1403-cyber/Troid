// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ARRIVAL } from '@/presentation/arrival';
import { CATALOGS } from '@/i18n/catalogs';
import { createTranslator } from '@/i18n/translator';
import { createIndicatorState, INDICATOR, stepIndicator, type ArrivalIndicatorInput } from '@/ui/overlays/arrivalIndicatorModel';
import { ArrivalIndicator } from '@/ui/overlays/ArrivalIndicator';

/**
 * THE LOADING INDICATOR (docs/PROMPT13-LOG.md): no screen of loading for a change of zone that is ready at once; after a moment, a hairline of light under the black; the real share of what is
 * arriving when it can be measured, and a light that waits when it cannot. The model is a pure function of the arrival; the view only applies it.
 */
const waiting = (waited: number, progress: number | null = null): ArrivalIndicatorInput => ({ waiting: true, waited, progress });
const idle: ArrivalIndicatorInput = { waiting: false, waited: 0, progress: null };
const frame = 1 / 60;

describe('the model: when it shows', () => {
  it('shows nothing for a wait that is shorter than the grace — a change of zone that is ready at once has no loading screen', () => {
    const s = createIndicatorState();
    for (let t = 0; t < ARRIVAL.graceMs; t += 16) stepIndicator(s, waiting(t), frame);
    expect(s.opacity).toBe(0);
  });

  it('comes in after the grace, over a fraction of a second, and goes when the wait is over', () => {
    const s = createIndicatorState();
    stepIndicator(s, waiting(ARRIVAL.graceMs), frame);
    expect(s.opacity).toBeGreaterThan(0);
    expect(s.opacity).toBeLessThan(0.2);
    for (let i = 0; i < Math.ceil(INDICATOR.fadeIn * 60) + 1; i++) stepIndicator(s, waiting(ARRIVAL.graceMs + 100), frame);
    expect(s.opacity).toBe(1);
    for (let i = 0; i < Math.ceil(INDICATOR.fadeOut * 60) + 1; i++) stepIndicator(s, idle, frame);
    expect(s.opacity).toBe(0);
  });

  it('a wait that ends just after the grace leaves only a faint flicker, never the whole indicator at once', () => {
    const s = createIndicatorState();
    stepIndicator(s, waiting(ARRIVAL.graceMs + 10), frame);
    stepIndicator(s, waiting(ARRIVAL.graceMs + 26), frame);
    expect(s.opacity).toBeLessThan(0.25);
  });

  it('resets between waits: the next one starts from nothing', () => {
    const s = createIndicatorState();
    for (let i = 0; i < 90; i++) stepIndicator(s, waiting(1000, 0.6), frame);
    for (let i = 0; i < 30; i++) stepIndicator(s, idle, frame);
    expect(s).toMatchObject({ opacity: 0, fill: null, percent: null, peak: 0 });
  });
});

describe('the model: what it shows', () => {
  it('with no way to measure, no number: a light travels along the line instead, and it keeps moving', () => {
    const s = createIndicatorState();
    for (let i = 0; i < 60; i++) stepIndicator(s, waiting(1000, null), frame);
    expect(s.fill).toBeNull();
    expect(s.percent).toBeNull();
    const a = s.sweep;
    stepIndicator(s, waiting(1100, null), 0.2);
    expect(s.sweep).not.toBe(a);
  });

  it('with reduced motion the light stands still', () => {
    const s = createIndicatorState();
    for (let i = 0; i < 60; i++) stepIndicator(s, waiting(1000, null), frame, true);
    const a = s.sweep;
    stepIndicator(s, waiting(1100, null), 0.2, true);
    expect(s.sweep).toBe(a);
  });

  it('with a measure, the line fills toward the REAL share and the number says it — it never goes back, and never says 100 while it is still waiting', () => {
    const s = createIndicatorState();
    const seen: number[] = [];
    for (const p of [0.1, 0.35, 0.2 /* a transfer that began late lowers the share */, 0.6, 1]) {
      for (let i = 0; i < 40; i++) stepIndicator(s, waiting(1000, p), frame);
      seen.push(s.percent!);
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen[1]!).toBeGreaterThanOrEqual(34);
    expect(seen[2]!, 'the share that fell back did not pull the line back').toBeGreaterThanOrEqual(seen[1]!);
    expect(s.percent).toBe(99);
    expect(s.fill!).toBeLessThanOrEqual(1);
  });

  it('keeps the last measure when a later moment cannot be measured (it does not fall back to waiting without a number)', () => {
    const s = createIndicatorState();
    for (let i = 0; i < 60; i++) stepIndicator(s, waiting(1000, 0.5), frame);
    const f = s.fill;
    stepIndicator(s, waiting(1100, null), frame);
    expect(s.fill).toBe(f);
  });

  it('survives a frame with no time in it, and a frame that took a long time', () => {
    const s = createIndicatorState();
    expect(() => stepIndicator(s, waiting(1000, 0.5), 0)).not.toThrow();
    expect(() => stepIndicator(s, waiting(1000, 0.5), 5)).not.toThrow();
    expect(s.fill!).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('the view (DOM)', () => {
  const make = (lang = 'es') => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const translator = createTranslator(CATALOGS, lang);
    const view = new ArrivalIndicator(host, translator);
    return { host, translator, view };
  };
  const run = (view: ArrivalIndicator, input: ArrivalIndicatorInput, frames: number): void => {
    for (let i = 0; i < frames; i++) view.update(frame, input);
  };

  it('does not exist for a change that is ready at once: hidden, never shown, and it touches nothing', () => {
    const { view } = make();
    run(view, waiting(100), 10);
    expect(view.root.style.display).toBe('none');
    expect(view.everShown).toBe(false);
  });

  it('after the grace it shows the word of the language while it cannot measure, and a role that says what it is', () => {
    const { view } = make('es');
    run(view, waiting(1000), 30);
    expect(view.root.style.display).toBe('flex');
    expect(view.everShown).toBe(true);
    expect(view.root.getAttribute('role')).toBe('progressbar');
    expect(view.root.getAttribute('aria-label')).toBe(CATALOGS['es']!['arrival.loading']);
    expect(view.root.getAttribute('aria-valuenow')).toBeNull();
    expect(view.root.querySelector('[data-testid=arrival-label]')!.textContent).toBe(CATALOGS['es']!['arrival.loading']);
  });

  it('with a measure it writes the real share the way the language writes a percentage, and the progress bar says it', () => {
    const { view } = make('en');
    run(view, waiting(1000, 0.42), 120);
    const label = view.root.querySelector('[data-testid=arrival-label]')!.textContent;
    expect(label).toMatch(/^4[0-2]\s?%$/);
    expect(Number(view.root.getAttribute('aria-valuenow'))).toBe(view.current.percent);
    expect(view.root.getAttribute('pointer-events') ?? view.root.style.pointerEvents).toBe('none');
  });

  it('is above the defeat screen (40) and never takes a press', () => {
    const { view } = make();
    expect(Number(view.root.style.zIndex)).toBeGreaterThan(40);
    expect(view.root.style.pointerEvents).toBe('none');
  });

  it('follows the language when it changes, and goes when the wait is over', () => {
    const { view, translator } = make('es');
    run(view, waiting(1000), 30);
    translator.setLocale('en');
    expect(view.root.getAttribute('aria-label')).toBe(CATALOGS['en']!['arrival.loading']);
    run(view, idle, 30);
    expect(view.root.style.display).toBe('none');
  });

  it('leaves nothing behind when it is disposed', () => {
    const { host, view } = make();
    view.dispose();
    expect(host.children.length).toBe(0);
  });
});
