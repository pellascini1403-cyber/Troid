import { TOUCH_BUTTONS } from '@/save/SettingsData';
import { createButtonArt, type ButtonArt } from './art';
import { touchFrame, type ButtonId, type TouchLayout } from './layout';

/** What the preview draws: the window the layout is for (px) and the layout as the game has it now. */
export interface TouchPreviewData {
  width: number;
  height: number;
  layout: TouchLayout;
}

/** The most room the preview takes in the menu, px. */
const ROOM = { w: 260, h: 150 } as const;

/**
 * A SMALL PICTURE OF THE SCREEN with the three buttons where the player has them (DOM, docs/PROMPT15-LOG.md): the same layout the game has, scaled down, with the artist's PNGs scaled down in proportion — so that the
 * settings show what the editor will change before it is opened, and what "restore" gives back. It also draws, faintly, what the buttons keep out of (the HUD, the pause button) and the movement zone. It takes no
 * input and holds no text: the screen reader gets the name the menu gives it.
 */
export class TouchPreview {
  readonly root: HTMLDivElement;
  private readonly zone: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly arts = new Map<ButtonId, { box: HTMLDivElement; art: ButtonArt }>();

  constructor(doc: Document) {
    const div = (className: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = className;
      return d;
    };
    this.root = div('tp-screen');
    this.root.dataset['testid'] = 'settings-touch-preview';
    this.root.setAttribute('role', 'img');
    this.zone = div('tp-zone');
    this.hud = div('tp-keep');
    this.pause = div('tp-keep tp-pause');
    this.root.append(this.zone, this.hud, this.pause);
    for (const id of TOUCH_BUTTONS) {
      const box = div('tp-button');
      box.dataset['testid'] = `settings-touch-preview-${id}`;
      const art = createButtonArt(doc, id);
      box.appendChild(art.root);
      this.arts.set(id, { box, art });
      this.root.appendChild(box);
    }
  }

  /** Draws the layout (or, for `null` — there is no touch layer — nothing). */
  update(data: TouchPreviewData | null): void {
    this.root.hidden = data === null;
    if (!data || data.width <= 0 || data.height <= 0) return;
    const { width, height, layout } = data;
    const k = Math.min(ROOM.w / width, ROOM.h / height);
    Object.assign(this.root.style, { width: `${width * k}px`, height: `${height * k}px` });
    const place = (box: HTMLElement, x0: number, y0: number, x1: number, y1: number): void => {
      Object.assign(box.style, { left: `${x0 * k}px`, top: `${y0 * k}px`, width: `${(x1 - x0) * k}px`, height: `${(y1 - y0) * k}px` });
    };
    place(this.zone, layout.zone.x, 0, layout.zone.x + layout.zone.w, height);
    const frame = touchFrame(width, height, layout.insets);
    place(this.hud, frame.hud.x0, frame.hud.y0, frame.hud.x1, frame.hud.y1);
    place(this.pause, frame.pause.x0, frame.pause.y0, frame.pause.x1, frame.pause.y1);
    for (const [id, { box, art }] of this.arts) {
      const d = layout[id];
      Object.assign(box.style, { left: `${d.cx * k}px`, top: `${d.cy * k}px` });
      art.size(d.visual * k);
      art.load();
    }
  }
}
