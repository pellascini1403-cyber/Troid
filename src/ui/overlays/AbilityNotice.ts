import { actionGlyph, keyLabel } from '@/input/glyphs';
import type { Bindings } from '@/input/bindings';
import type { InputDevice } from '@/input/InputFrame';
import type { Translator } from '@/i18n/translator';
import { cssHex, PALETTE } from '@/presentation/palette';
import { touchFrame, type Insets } from '../touch/layout';
import { AbilityNoticeModel } from './abilityNoticeModel';

const STYLE_ID = 'troid-ability-style';
const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/**
 * What the page says of each thing the hero can be taught, as translator keys (literals: the catalogs are checked against them). An ability that is DONE has a name and a line for the keys and the pad (`how`, with the
 * names of the keys in it) and one for the fingers (`touch`); a relic works by itself, and says what it does (`what`).
 */
export const ABILITY_TEXT: Readonly<Record<string, { name: string; how?: string; touch?: string; what?: string }>> = {
  magic_attack: { name: 'abilityNotice.magic_attack.name', how: 'abilityNotice.magic_attack.how', touch: 'abilityNotice.magic_attack.touch' },
  air_dash: { name: 'abilityNotice.air_dash.name', how: 'abilityNotice.air_dash.how', touch: 'abilityNotice.air_dash.touch' },
  double_jump: { name: 'abilityNotice.double_jump.name', how: 'abilityNotice.double_jump.how', touch: 'abilityNotice.double_jump.touch' },
  wall_jump: { name: 'abilityNotice.wall_jump.name', how: 'abilityNotice.wall_jump.how', touch: 'abilityNotice.wall_jump.touch' },
  ground_slam: { name: 'abilityNotice.ground_slam.name', how: 'abilityNotice.ground_slam.how', touch: 'abilityNotice.ground_slam.touch' },
  relic_edge: { name: 'abilityNotice.relic_edge.name', what: 'abilityNotice.relic_edge.what' },
  relic_swift: { name: 'abilityNotice.relic_swift.name', what: 'abilityNotice.relic_swift.what' },
  relic_siphon: { name: 'abilityNotice.relic_siphon.name', what: 'abilityNotice.relic_siphon.what' },
  relic_ward: { name: 'abilityNotice.relic_ward.name', what: 'abilityNotice.relic_ward.what' },
  relic_pierce: { name: 'abilityNotice.relic_pierce.name', what: 'abilityNotice.relic_pierce.what' },
  relic_brew: { name: 'abilityNotice.relic_brew.name', what: 'abilityNotice.relic_brew.what' },
};

/** The words for the key or button of an action, for the device in use (nothing on a touch screen: there the line is the one for the fingers). */
function glyphs(device: InputDevice, bindings: Readonly<Bindings>): Record<string, string> {
  return {
    jump: actionGlyph(device, bindings, 'jump'),
    dash: actionGlyph(device, bindings, 'dash'),
    attack: actionGlyph(device, bindings, 'attack'),
    ability: actionGlyph(device, bindings, 'ability'),
    down: device === 'gamepad' ? '↓' : keyLabel(bindings.keyboard.down[0] ?? 'ArrowDown'),
  };
}

function css(): string {
  const core = cssHex(PALETTE.energyCore);
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  return `
.troid-ability { position:absolute; left:0; top:0; z-index:26; display:none; align-items:flex-start; gap:10px; width:max-content; max-width:min(380px, 62vw); padding:9px 16px 10px 12px; box-sizing:border-box; border-radius:3px; pointer-events:none; user-select:none; -webkit-user-select:none;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; background:linear-gradient(90deg, ${rgba(PALETTE.uiPanel, 0.0)}, ${rgba(PALETTE.uiPanel, 0.88)} 14%, ${rgba(PALETTE.uiPanel, 0.88)} 86%, ${rgba(PALETTE.uiPanel, 0.0)}); border-top:1px solid ${rgba(PALETTE.energyCore, 0.55)}; border-bottom:1px solid ${rgba(PALETTE.energyCore, 0.55)}; transform-origin:50% 0; }
.troid-ability[data-open="1"] { display:flex; }
.troid-ability .ability-mark { flex:none; width:9px; height:9px; margin-top:4px; transform:rotate(45deg); background:${glow}; box-shadow:0 0 10px ${core}; }
.troid-ability .ability-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
.troid-ability .ability-kicker { font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:${glow}; text-shadow:0 0 10px ${rgba(PALETTE.energyCore, 0.5)}; }
.troid-ability .ability-name { font-size:17px; letter-spacing:0.04em; font-weight:600; }
.troid-ability .ability-how { font-size:12.5px; line-height:1.35; opacity:0.92; }
`;
}

/**
 * The line that tells the player what they have just learned (DOM, docs/PROMPT22-LOG.md §6): a small mark, "new ability" (or "new relic"), its name, and one line on how it is done with the keys, the buttons or the fingers they are using
 * now — worded from the bindings in force, so a remapped key is already in it. It never takes a touch, has `role="status"` so a screen reader says it politely, and every word comes from the translator.
 */
export class AbilityNotice {
  readonly root: HTMLDivElement;
  private readonly kicker: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly how: HTMLDivElement;
  private readonly model = new AbilityNoticeModel();
  private last = { id: '', opacity: -1, open: false };
  /** How the line is worded: the device and the keys in use when the hero learned it, kept so the language can change under it. */
  private told: { device: InputDevice; bindings: Readonly<Bindings> } | null = null;
  private readonly off: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
  ) {
    const doc = parent.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.appendChild(doc.createTextNode(css()));
      doc.head.appendChild(style);
    }
    this.root = doc.createElement('div');
    this.root.className = 'troid-ability';
    this.root.dataset['testid'] = 'ability-notice';
    this.root.dataset['open'] = '0';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    const mark = doc.createElement('span');
    mark.className = 'ability-mark';
    mark.setAttribute('aria-hidden', 'true');
    const body = doc.createElement('div');
    body.className = 'ability-body';
    this.kicker = doc.createElement('div');
    this.kicker.className = 'ability-kicker';
    this.name = doc.createElement('div');
    this.name.className = 'ability-name';
    this.name.dataset['testid'] = 'ability-notice-name';
    this.how = doc.createElement('div');
    this.how.className = 'ability-how';
    this.how.dataset['testid'] = 'ability-notice-how';
    body.append(this.kicker, this.name, this.how);
    this.root.append(mark, body);
    parent.appendChild(this.root);
    this.off.push(this.translator.changed.subscribe(() => this.write()));
  }

  /** The notice now (the tests read it). */
  get current(): Readonly<{ id: string | null; opacity: number }> {
    return this.model.state;
  }

  /**
   * The centre of the free space at the top: between the HUD and the pause button, under the first line of the screen. Where that is too narrow for it (a small window), it goes under the HUD, in the middle of the safe area.
   */
  place(width: number, height: number, insets: Insets, scale = 1, hudScale = 1): void {
    const frame = touchFrame(width, height, insets, hudScale);
    const room = frame.pause.x0 - frame.hud.x1;
    const wide = room >= 300 * scale;
    const cx = wide ? (frame.hud.x1 + frame.pause.x0) / 2 : (insets.left + width - insets.right) / 2;
    const top = wide ? insets.top + 12 * scale : frame.hud.y1 + 2;
    this.root.style.transform = `translate(${Math.round(cx)}px, ${Math.round(top)}px) translateX(-50%) scale(${scale})`;
  }

  /** The hero has learned `id`: it is told, in the words of the device in use (an ability the page has no words for is not told). */
  show(id: string, device: InputDevice, bindings: Readonly<Bindings>): void {
    if (!ABILITY_TEXT[id]) return;
    this.model.show(id);
    this.told = { device, bindings };
    this.update(0, false);
  }

  /** Once per frame, in real seconds; `paused` while the menu is up (the notice waits, out of sight). */
  update(dt: number, paused: boolean): void {
    const s = this.model.update(dt, paused);
    const open = s.id !== null && s.opacity > 0 && !paused;
    if (open !== this.last.open) {
      this.root.dataset['open'] = open ? '1' : '0';
      this.last.open = open;
    }
    if (s.id === null) {
      this.last.id = '';
      this.last.opacity = 0;
      return;
    }
    if (s.id !== this.last.id) {
      this.last.id = s.id;
      this.write();
    }
    const o = Math.round(s.opacity * 50) / 50;
    if (o !== this.last.opacity) {
      this.root.style.opacity = String(o);
      this.last.opacity = o;
    }
  }

  dispose(): void {
    for (const f of this.off.splice(0)) f();
    this.root.remove();
  }

  /** The words of the one being told, in the language in force. */
  private write(): void {
    const told = this.told;
    const id = this.model.state.id;
    if (!told || id === null) return;
    const text = ABILITY_TEXT[id];
    if (!text) return;
    const t = this.translator;
    this.kicker.textContent = t.t(id.startsWith('relic_') ? 'abilityNotice.relic' : 'abilityNotice.title');
    this.name.textContent = t.t(text.name);
    const line = text.what ?? (told.device === 'touch' ? text.touch : text.how);
    this.how.textContent = line ? t.t(line, glyphs(told.device, told.bindings)) : '';
    this.root.dataset['ability'] = id;
  }
}
