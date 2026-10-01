/**
 * Builds live sliders for every numeric leaf of a plain object. Point it at `player.def.movement` and the movement feel can be
 * tuned while playing — on a phone too — with the controller reading the values every tick.
 * Returns the element; the caller owns where it goes and when it is removed.
 */
export function createTuningInspector(root: object, title: string, onChange?: () => void): HTMLElement {
  const wrap = document.createElement('details');
  wrap.style.cssText = 'margin:4px 0';
  const summary = document.createElement('summary');
  summary.textContent = title;
  summary.style.cssText = 'cursor:pointer;font-weight:700';
  wrap.appendChild(summary);

  const walk = (obj: Record<string, unknown>, path: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') wrap.appendChild(row(obj, key, value, [...path, key].join('.'), onChange));
      else if (value && typeof value === 'object') walk(value as Record<string, unknown>, [...path, key]);
    }
  };
  walk(root as Record<string, unknown>, []);
  return wrap;
}

function row(obj: Record<string, unknown>, key: string, initial: number, label: string, onChange?: () => void): HTMLElement {
  const line = document.createElement('label');
  line.style.cssText = 'display:grid;grid-template-columns:1fr 70px 52px;gap:6px;align-items:center;font-size:11px;margin:2px 0';
  const name = document.createElement('span');
  name.textContent = label;
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const slider = document.createElement('input');
  slider.type = 'range';
  const span = Math.max(Math.abs(initial) * 2, 1);
  slider.min = String(initial >= 0 ? 0 : -span);
  slider.max = String(initial >= 0 ? span : 0);
  slider.step = String(span / 200);
  slider.value = String(initial);
  const out = document.createElement('input');
  out.type = 'number';
  out.step = 'any';
  out.value = format(initial);
  out.style.cssText = 'width:52px;font-size:11px';
  const apply = (v: number) => {
    if (!Number.isFinite(v)) return;
    obj[key] = v;
    slider.value = String(v);
    out.value = format(v);
    onChange?.();
  };
  slider.addEventListener('input', () => apply(Number(slider.value)));
  out.addEventListener('change', () => apply(Number(out.value)));
  line.append(name, slider, out);
  return line;
}

function format(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
