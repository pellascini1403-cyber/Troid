import { listen } from '@/app/dom';
import { onPress } from '@/app/press';
import type { ProfileData } from '@/app/profile';
import type { CreditSection } from '@/presentation/credits';
import { DisposableStore } from '@/core/lifecycle';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Translator } from '@/i18n/translator';
import { EMPTY_SCENE, type MapScene } from '@/world/worldMap';
import { MapView } from '../map/MapView';
import { mapIconSvg } from '../map/mapIcons';
import { ZOOM_STEP } from '../map/viewport';
import { EndingScreen } from './EndingScreen';
import { createMenuIcon, type MenuIconId } from './menuIcons';
import { formatClock } from './menuFormat';
import { ensureMenuStyle } from './menuStyle';
import { neighbour, PAD_SETTLE, PadStepper, sliderStep, type PadDirection, type PadReading } from './padNav';
import { ProfileScreen } from './ProfileScreen';
import { SavesScreen, type SavesHost } from './SavesScreen';
import { SettingsMenu, type SettingsMenuHost } from './SettingsMenu';

/** The screens of the pause menu: the map (`main`, the one it opens on), the five it can show in its place when they are chosen, and the closing of the adventure (`ending`), which the game opens it on when the hero walks out of the world. */
export type PauseScreen = 'main' | 'sound' | 'settings' | 'controls' | 'saves' | 'profile' | 'ending';

/** What the menu can ask the page to make heard: a press, a slider moving, a switch turned on or off, a game saved. Which sound each one is, is the page's. */
export type MenuSound = 'tap' | 'slider' | 'on' | 'off' | 'save';

/**
 * What the pause menu needs from the game. The screens it opens each have a host of their own (what they read and what they ask for); the menu adds the way back to its list, so none of them has to
 * know it exists.
 */
export interface PauseHost {
  settings: Omit<SettingsMenuHost, 'close'>;
  /** The saved games. `null` where nothing is saved (a playground: `?room=`): the menu offers neither the games nor the profile there. */
  saves: Omit<SavesHost, 'back'> | null;
  /** The data of the game being played, now: the summary above the map and the profile screen read it each time they are shown. */
  profile(): ProfileData;
  /** The map of the world as the player has discovered it, now (read each time the menu opens). Absent where the page has none: the map then says so. */
  map?(): MapScene;
  /** The closing of the adventure: the credits it rolls, and whether they roll by themselves. Absent where the page has none: the menu then opens on the map. */
  ending?: { credits: readonly CreditSection[]; rolls: boolean; /** The page's clock (`performance.now()` by default). */ now?: () => number };
  /** Closes the menu and lets the game go on. */
  resume(): void;
  /** Something has the screen over the menu (the editor of the touch buttons): asks it to give up. Answers whether there was one to give up. */
  interrupt?(): boolean;
  /** The menu is heard: a press of a button, a slider that moves, a switch that turns. Not given where the page makes no sound. */
  sound?(kind: MenuSound): void;
}

interface Entry {
  id: Exclude<PauseScreen, 'main'> | 'resume' | 'map';
  icon: MenuIconId;
  /** The translator key of its name. */
  label: string;
  /** Only where the game saves. */
  needsSaves?: boolean;
}

/** The column of options, in order: the way back into the game first, then the map (the view the menu opens on), then what can be changed or looked at. */
const ENTRIES: readonly Entry[] = [
  { id: 'resume', icon: 'resume', label: 'settings.resume' },
  { id: 'map', icon: 'map', label: 'pause.map' },
  { id: 'controls', icon: 'controls', label: 'pause.controls' },
  { id: 'sound', icon: 'sound', label: 'pause.sound' },
  { id: 'settings', icon: 'settings', label: 'pause.settings' },
  { id: 'saves', icon: 'saves', label: 'pause.saves', needsSaves: true },
  { id: 'profile', icon: 'profile', label: 'pause.profile', needsSaves: true },
];

/** What the legend of the map names, in order: the icon (or `hero`, drawn by the style sheet) and the translator key. */
const LEGEND = [
  { icon: 'hero', label: 'map.legendHero' },
  { icon: 'rest', label: 'map.legendRest' },
  { icon: 'seal', label: 'map.legendSeal' },
  { icon: 'boss', label: 'map.legendBoss' },
  { icon: 'lock', label: 'map.legendLocked' },
] as const;

/**
 * THE PAUSE MENU (DOM, docs/PROMPT14-LOG.md, docs/PROMPT19-LOG.md): what the game shows while it waits. Two panels side by side — the MAP of the world on the left, the main one, and the column of options on the
 * right (Continue, Map, Controls, Sound, Settings, Saved games, Profile) — and the map is what the menu opens on. Each option opens its screen in the main panel, in the place of the map (which keeps where the
 * player had it: it is hidden, not closed), the column stays where it is with the open one marked, and the way out of every screen — the button of the screen, the Map entry, Escape — is the way back to the map. The
 * game is already stopped when this opens (the loop runs no tick while the menu is up); the menu itself decides nothing, owns no data and no text: every word is a translator key and every choice is the host's.
 *
 * There is no "main menu" and no "quit" here on purpose: a web page has neither a title screen to go back to nor a process to end (the page IS the game; closing the tab is leaving it, and the game is saved
 * when the page is hidden). The screens are built the first time they are opened, so the menu costs nothing until it is used.
 *
 * Keyboard: Tab and Shift+Tab move through the controls of a screen; ↑ ↓ (and Home / End) move through the column; Enter or Space press. Escape — the game's pause key — goes back to the map from a screen, and resumes
 * from the map. The map itself moves with the arrows, + and −, and 0 (centre) once it has the focus.
 */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly title: HTMLElement;
  private readonly side: HTMLElement;
  private readonly entries = new Map<Entry['id'], HTMLButtonElement>();
  private readonly stage: HTMLElement;
  private readonly mapPanel: HTMLElement;
  private readonly map: MapView;
  private readonly head: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly legend: Array<{ label: HTMLElement; key: string }> = [];
  private readonly hint: HTMLElement;
  private readonly screens: { sound?: SettingsMenu; settings?: SettingsMenu; controls?: SettingsMenu; saves?: SavesScreen; profile?: ProfileScreen; ending?: EndingScreen } = {};
  private current: PauseScreen | null = null;
  /** The entry the player came from, so the focus returns to it. */
  private lastEntry: Entry['id'] = 'resume';
  private readonly stepper = new PadStepper();
  /** When the pad starts to be heard after the menu opened (`null`: it has not been looked at yet). */
  private padFrom: number | null = null;
  /** The entry of the column the pad last moved from. */
  private padEntry: Entry['id'] | null = null;

  constructor(
    parent: HTMLElement,
    private readonly translator: Translator,
    private readonly host: PauseHost,
  ) {
    // its words come with it: a player who never opens the menu never downloads them
    for (const [lang, entries] of Object.entries(MENU_CATALOGS)) translator.extend(lang, entries);
    const doc = parent.ownerDocument;
    ensureMenuStyle(doc);
    this.root = doc.createElement('div');
    this.root.className = 'troid-pausemenu';
    this.root.dataset['testid'] = 'pause-menu';
    this.root.dataset['uiBlock'] = '';
    this.root.dataset['open'] = '0';
    this.root.dataset['screen'] = 'main';
    const frame = doc.createElement('div');
    frame.className = 'pm-frame';
    frame.setAttribute('role', 'dialog');
    frame.setAttribute('aria-modal', 'true');

    // ---- the main panel: the map, with where the hero is above it and what its marks mean below it (the screens of the options are put in the same place)
    this.stage = doc.createElement('section');
    this.stage.className = 'pm-stage';
    this.stage.dataset['testid'] = 'pause-stage';
    this.mapPanel = doc.createElement('div');
    this.mapPanel.className = 'pm-map';
    this.mapPanel.dataset['testid'] = 'pause-map-panel';
    const where = doc.createElement('header');
    where.className = 'pm-where';
    where.dataset['testid'] = 'pause-where';
    this.head = doc.createElement('div');
    this.head.className = 'pm-where-head';
    this.zone = doc.createElement('div');
    this.zone.className = 'pm-zone';
    this.zone.dataset['testid'] = 'pause-zone';
    this.facts = doc.createElement('dl');
    where.append(this.head, this.zone, this.facts);
    const body = doc.createElement('div');
    body.className = 'pm-map-body';
    this.map = new MapView(body, translator);
    this.map.root.dataset['padStop'] = ''; // the pad reaches the map as one thing: its stick moves it
    const foot = doc.createElement('footer');
    foot.className = 'pm-map-foot';
    foot.dataset['testid'] = 'pause-map-legend';
    for (const item of LEGEND) {
      const wrap = doc.createElement('span');
      wrap.className = `map-key map-key-${item.icon}`;
      wrap.appendChild(item.icon === 'hero' ? doc.createElement('i') : mapIconSvg(doc, item.icon, 16));
      const label = doc.createElement('span');
      wrap.appendChild(label);
      foot.appendChild(wrap);
      this.legend.push({ label, key: item.label });
    }
    this.hint = doc.createElement('span');
    this.hint.className = 'map-hint';
    foot.appendChild(this.hint);
    this.mapPanel.append(where, body, foot);
    this.stage.appendChild(this.mapPanel);

    // ---- the column of options
    const side = doc.createElement('nav');
    this.side = side;
    side.className = 'pm-side';
    side.dataset['testid'] = 'pause-side';
    this.title = doc.createElement('h2');
    this.title.className = 'pm-title';
    this.title.dataset['testid'] = 'pause-title';
    side.appendChild(this.title);
    for (const e of ENTRIES) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pm-entry';
      b.dataset['id'] = e.id;
      b.dataset['testid'] = `pause-${e.id}`;
      if (e.id === 'resume') b.dataset['primary'] = '1';
      const icon = createMenuIcon(doc, e.icon, 22);
      icon.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span');
      b.append(icon, label);
      // a finger that lifts over an entry presses it: the browser makes no click of a tap that follows a drag or a pinch on the map (docs/PROMPT19-LOG.md §7)
      onPress(this.store, b, () => this.choose(e.id));
      this.entries.set(e.id, b);
      side.appendChild(b);
    }
    frame.append(this.stage, side);
    this.root.appendChild(frame);
    parent.appendChild(this.root);
    listen(this.store, side, 'keydown', (e) => this.onListKey(e));
    // the focus is drawn for the pad even where the browser would not (a mouse used a moment ago): until a finger or a mouse touches the menu again
    listen(this.store, this.root, 'pointerdown', () => delete this.root.dataset['pad']);
    // the sound of the whole menu, from its root: every screen is a child of it, so none of them has to know there is sound (the handlers of the controls run first — they bubble up to this — so a switch is read as it was left)
    listen(this.store, this.root, 'click', (e) => this.pressed(e));
    listen(this.store, this.root, 'input', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'range') this.host.sound?.('slider');
    });
    this.refreshTexts();
    this.store.add(translator.changed.subscribe(() => this.refreshTexts()));
  }

  get isOpen(): boolean {
    return this.root.dataset['open'] === '1';
  }

  /** The screen being shown (`null`: the menu is closed). `main` is the map. */
  get screen(): PauseScreen | null {
    return this.current;
  }

  /** The map of the menu (the tests and the E2E look at where it is seen from). */
  get mapView(): MapView {
    return this.map;
  }

  /** Shows the menu on the map, with the game as it is NOW and the map seen as it opens (everything discovered, or the hero's surroundings) — or, when the game asks, on the closing of the adventure. */
  open(screen: PauseScreen = 'main'): void {
    this.lastEntry = 'resume';
    this.padFrom = null;
    this.padEntry = null;
    this.stepper.reset();
    this.root.dataset['open'] = '1';
    this.show(screen, true);
  }

  /** Hides the menu and every screen of it. */
  close(): void {
    this.host.interrupt?.();
    this.map.cancelGestures();
    this.hideScreens();
    this.current = null;
    this.root.dataset['open'] = '0';
    delete this.root.dataset['pad'];
    (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur?.();
  }

  /**
   * One step back: from a screen to the map. From the map (or closed) it does nothing and answers false — the caller closes the menu then, which is resuming the game. The closing of the adventure
   * has no map to go back to: the key that leaves it goes straight back into the world.
   */
  back(): boolean {
    if (this.host.interrupt?.()) return true; // what has the screen over the menu gives way first
    if (this.current === null || this.current === 'main' || this.current === 'ending') return false;
    this.show('main');
    return true;
  }

  /**
   * Steps out of the way while something else has the screen (the editor of the touch buttons): nothing is closed and nothing is forgotten, so that when it is done the menu is where it was — and,
   * on the controls screen, shows what the editor kept.
   */
  setAside(aside: boolean): void {
    this.root.dataset['aside'] = aside ? '1' : '0';
    if (!aside && this.current === 'controls') this.screens.controls?.sync();
  }

  dispose(): void {
    this.store.dispose();
    this.map.dispose();
    for (const s of [this.screens.sound, this.screens.settings, this.screens.controls, this.screens.saves, this.screens.profile, this.screens.ending]) s?.dispose();
    this.root.remove();
  }

  /**
   * THE PAD IN THE MENU (docs/PROMPT20-LOG.md): the stick or the D-pad goes to the nearest control in a direction (the two panels and the rows of a screen are crossed as a console's menus are), A presses what has the
   * focus, B steps back, and on the map the stick moves it, A centres it on the hero and X and Y bring it closer and farther; on a slider left and right are its own. Answers `'back'` when the player asked to go back one
   * step — the page does it (a screen to the map, the map to the game), the same as for the pause key. It listens only while the last thing the player used was the pad, never in the first moments after the menu opens
   * (a press made for the game must not press the first thing here), and never presses the ways on of the closing of the adventure before they answer.
   */
  pad(f: PadReading, now: number): 'back' | null {
    if (f.device !== 'gamepad' || this.current === null || !this.isOpen) return null;
    this.padFrom ??= now + PAD_SETTLE;
    const dir = this.stepper.step(f.move.x, f.move.y, now); // (read even while it waits: a direction held as the menu opened is not a step when it starts to listen)
    if (now < this.padFrom) return null;
    if (this.root.dataset['aside'] === '1') return f.dashPressed ? 'back' : null; // the editor of the touch buttons has the screen: only the way out of it
    const at = this.padFocused();
    if (f.dashPressed) return this.padCancel(at);
    if (f.jumpPressed) this.padConfirm(at);
    if (this.current === 'main' && (f.attackPressed || f.abilityPressed)) {
      this.root.dataset['pad'] = '1';
      if (f.attackPressed) this.map.zoomBy(ZOOM_STEP);
      if (f.abilityPressed) this.map.zoomBy(1 / ZOOM_STEP);
    }
    if (dir) this.padStep(dir, at);
    return null;
  }

  /** What has the focus in the menu, if anything does (the player may have clicked on nothing, or the focus may have gone with a screen that closed). */
  private padFocused(): HTMLElement | null {
    const active = this.root.ownerDocument.activeElement;
    return active instanceof HTMLElement && this.root.contains(active) ? active : null;
  }

  /** The controls a pad can reach now: those of the screen being shown (the map is one) and the column. */
  private padControls(): HTMLElement[] {
    const surface = this.current === 'main' ? this.map.root : this.current ? this.screens[this.current]?.root : undefined;
    const found: HTMLElement[] = [];
    for (const scope of [surface, this.side]) {
      if (!scope || !reachable(scope, scope)) continue;
      if (scope === this.map.root) found.push(scope);
      else for (const el of scope.querySelectorAll<HTMLElement>('button, input[type="range"]')) if (reachable(el, scope)) found.push(el);
    }
    return found;
  }

  private padFocus(el: HTMLElement | undefined): void {
    if (!el) return;
    this.root.dataset['pad'] = '1';
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** The control the focus goes to when it is nowhere, or comes back to from the map: the entry of the column the pad was last on, else the one the player came from. */
  private padHome(): HTMLElement | undefined {
    return this.entries.get(this.visible(this.padEntry ?? this.lastEntry));
  }

  private padStep(dir: PadDirection, at: HTMLElement | null): void {
    const controls = this.padControls();
    if (at === null || !controls.includes(at)) return this.padFocus(this.padHome() ?? controls[0]);
    this.root.dataset['pad'] = '1';
    const id = at.closest('.pm-side') ? (at.dataset['id'] as Entry['id'] | undefined) : undefined;
    if (id) this.padEntry = id; // where it left the column from: B on the map comes back there
    if (at === this.map.root) return this.map.nudge(dir);
    if (at instanceof HTMLInputElement && at.type === 'range' && (dir === 'left' || dir === 'right')) {
      // a slider takes the sides as its own, and says it moved the way a hand on it would
      const value = sliderStep(Number(at.value), Number(at.min || 0), Number(at.max || 100), Number(at.step), dir);
      if (value !== null) {
        at.value = String(value);
        at.dispatchEvent(new Event('input', { bubbles: true }));
        at.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const from = at.getBoundingClientRect();
    const to = neighbour(from, controls.filter((c) => c !== at).map((c) => ({ item: c, box: c.getBoundingClientRect() })), dir);
    if (to) return this.padFocus(to);
    // nothing that way: a screen taller than its window scrolls
    if (dir === 'up' || dir === 'down') this.padScroll(dir === 'down' ? 1 : -1);
  }

  private padScroll(sign: 1 | -1): void {
    const screen = this.current === null || this.current === 'main' ? undefined : this.screens[this.current];
    const body = screen?.root.querySelector<HTMLElement>('.settings-body');
    if (!body || !screen) return;
    const dy = sign * Math.max(40, body.clientHeight * 0.6);
    if (screen instanceof EndingScreen) screen.scrollBy(dy);
    else body.scrollTop += dy;
  }

  private padConfirm(at: HTMLElement | null): void {
    const controls = this.padControls();
    if (at === null || !controls.includes(at)) return this.padFocus(this.padHome() ?? controls[0]);
    this.root.dataset['pad'] = '1';
    if (at === this.map.root) this.map.recentre();
    else if (at instanceof HTMLButtonElement) at.click();
  }

  private padCancel(at: HTMLElement | null): 'back' | null {
    this.root.dataset['pad'] = '1';
    // from the map the column is one step back: Escape on the keyboard leaves the map for the game, but a pad has the column to go to
    if (this.current === 'main' && at === this.map.root) {
      this.padFocus(this.padHome());
      return null;
    }
    // the closing of the adventure does not answer a button that was pressed for the game in its first instants
    if (this.current === 'ending' && !this.screens.ending?.armed) return null;
    return 'back';
  }

  // ----------------------------------------------------------------------------------------------- internals

  /** A press somewhere in the menu: a switch says which way it went, any other button taps. The way back into the game has the sound of the menu closing, which the page makes: it is not tapped as well. */
  private pressed(e: Event): void {
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (!button || button.disabled || button.dataset['id'] === 'resume') return;
    this.host.sound?.(button.getAttribute('role') === 'switch' ? (button.getAttribute('aria-checked') === 'true' ? 'on' : 'off') : 'tap');
  }

  private choose(id: Entry['id']): void {
    if (id === 'resume') {
      this.host.resume();
      return;
    }
    this.lastEntry = id;
    this.show(id === 'map' ? 'main' : id);
  }

  /**
   * Shows one screen in the main panel and hides the others (the map is hidden, not closed: it keeps the view the player gave it); the focus goes to the entry of the column the player came from. Coming back to
   * the map draws it again from the game as it is — `fresh` (the menu has just opened) also sets it to its opening view.
   */
  private show(screen: PauseScreen, fresh = false): void {
    this.hideScreens();
    this.current = screen;
    this.root.dataset['screen'] = screen;
    this.mapPanel.hidden = screen !== 'main';
    for (const [id, b] of this.entries) {
      if (id !== 'resume' && (id === 'map' ? screen === 'main' : id === screen)) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (screen === 'main') {
      this.refreshTexts();
      this.map.remeasure(); // it has a size now
      this.map.update(this.host.map?.() ?? EMPTY_SCENE, { recentre: fresh });
      this.entries.get(this.visible(this.lastEntry))?.focus({ preventScroll: true });
      return;
    }
    this.map.cancelGestures(); // the map is put away: a finger that is still on it is not a finger on the map any more
    const back = (): void => void this.show('main');
    if (screen === 'sound' || screen === 'settings' || screen === 'controls') {
      const menu = (this.screens[screen] ??= new SettingsMenu(this.stage, this.translator, { ...this.host.settings, close: back }, { screen }));
      menu.open();
    } else if (screen === 'saves') {
      const saves = this.host.saves;
      if (!saves) return this.show('main');
      const view = (this.screens.saves ??= new SavesScreen(this.stage, this.translator, { ...saves, back }));
      void view.open();
    } else if (screen === 'ending') {
      const ending = this.host.ending;
      if (!ending) return this.show('main');
      const saves = this.host.saves;
      const view = (this.screens.ending ??= new EndingScreen(this.stage, this.translator, {
        profile: () => this.host.profile(),
        credits: ending.credits,
        rolls: ending.rolls,
        ...(ending.now ? { now: ending.now } : {}),
        resume: () => this.host.resume(),
        saves: saves ? () => this.choose('saves') : null,
      }));
      view.open();
    } else {
      const profile = (this.screens.profile ??= new ProfileScreen(this.stage, this.translator, { profile: () => this.host.profile(), back }));
      profile.open();
    }
  }

  private hideScreens(): void {
    this.screens.sound?.close();
    this.screens.settings?.close();
    this.screens.controls?.close();
    this.screens.saves?.close();
    this.screens.profile?.close();
    this.screens.ending?.close();
  }

  /** The entry the focus can go to: the one asked for if the column has it, else the way back into the game. */
  private visible(id: Entry['id']): Entry['id'] {
    const b = this.entries.get(id);
    return b && !b.hidden ? id : 'resume';
  }

  private onListKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const shown = ENTRIES.filter((x) => !this.entries.get(x.id)?.hidden);
    const at = shown.findIndex((x) => this.entries.get(x.id) === this.root.ownerDocument.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % shown.length;
    else if (e.key === 'ArrowUp') next = at < 0 ? shown.length - 1 : (at - 1 + shown.length) % shown.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = shown.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = shown[next];
    if (target) this.entries.get(target.id)?.focus({ preventScroll: true });
  }

  /** Every word, from the translator (the language may have changed), and the summary above the map from the game as it is now. */
  private refreshTexts(): void {
    const t = this.translator;
    const doc = this.root.ownerDocument;
    this.title.textContent = t.t('settings.title');
    this.root.setAttribute('aria-label', t.t('settings.title'));
    this.root.firstElementChild?.setAttribute('aria-label', t.t('settings.title'));
    for (const e of ENTRIES) {
      const b = this.entries.get(e.id);
      if (!b) continue;
      b.hidden = e.needsSaves === true && this.host.saves === null;
      const label = b.lastElementChild;
      if (label) label.textContent = t.t(e.label);
    }
    for (const item of this.legend) item.label.textContent = t.t(item.key);
    this.hint.textContent = t.t('map.hint');
    const p = this.host.profile();
    this.head.textContent = t.t('pause.where');
    this.zone.textContent = p.zoneKey ? t.t(p.zoneKey) : '';
    const rows: Array<[string, string, string]> = [];
    if (p.slot !== null) {
      rows.push(['time', t.t('profile.time'), formatClock(p.ticks)]);
      rows.push(['slot', t.t('profile.slot'), String(p.slot)]);
    }
    this.facts.replaceChildren(
      ...rows.flatMap(([id, name, value]) => {
        const dt = doc.createElement('dt');
        dt.textContent = name;
        const dd = doc.createElement('dd');
        dd.dataset['testid'] = `pause-${id}`;
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }
}

/** Is a control on the screen, and one a hand can press: not disabled, and neither it nor anything between it and `within` is hidden. */
function reachable(el: HTMLElement, within: HTMLElement): boolean {
  if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false;
  const view = el.ownerDocument.defaultView;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden || view?.getComputedStyle(n).display === 'none') return false;
    if (n === within) break;
  }
  return true;
}
