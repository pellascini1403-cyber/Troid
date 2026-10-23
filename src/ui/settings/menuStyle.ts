import { cssHex, PALETTE } from '@/presentation/palette';
import { mapCss } from '../map/mapStyle';

const STYLE_ID = 'troid-menu-style';
export const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/**
 * The look of the whole pause menu — its list of entries, the settings and controls panels, the saved games and the profile — in one place, built from the palette tokens (never from literal
 * colours): black, white and the cyan of the energy, with the violet kept for what is a warning. Every screen of the menu calls `ensureMenuStyle` and the first one writes the sheet.
 */
function menuCss(): string {
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  const core = cssHex(PALETTE.energyCore);
  const violet = cssHex(PALETTE.violetGlow);
  const rim = rgba(PALETTE.energyCore, 0.45);
  const panel = rgba(PALETTE.uiPanel, 0.94);
  return `

.troid-settings { position:absolute; inset:0; z-index:45; display:none; pointer-events:auto; align-items:center; justify-content:center; background:${rgba(PALETTE.worldVoid, 0.78)}; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-settings[data-open="1"] { display:flex; }
.troid-settings .settings-panel { width:min(460px, 92vw); max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; padding:18px 20px 20px; border-radius:10px; border:1px solid ${rim}; background:${panel}; box-shadow:0 0 28px ${rgba(PALETTE.energyGlow, 0.25)}; }
.troid-settings .settings-title { flex:none; font-size:1.35rem; font-weight:300; letter-spacing:0.14em; text-align:center; margin:0 0 14px; text-shadow:0 0 14px ${core}88; }
.troid-settings .settings-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; margin:0 -8px; padding:2px 8px; overscroll-behavior:contain; scroll-padding:8px 0 28px; }
/* a screen that does not fit scrolls, and says so: while there is more below (\`ScrollHint\` sets data-more) its last lines fade out; a screen that fits, or one scrolled to its end, shows its last line plainly */
.troid-settings .settings-body[data-more="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 26px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 26px), transparent); }
.troid-settings .settings-section { margin:0 0 14px; }
.troid-settings .settings-label { font-size:0.8rem; letter-spacing:0.08em; opacity:0.75; margin:0 0 6px; }
.troid-settings .settings-note { font-size:0.74rem; line-height:1.35; opacity:0.62; margin:6px 0 0; }
.troid-settings .settings-note[data-tone="warn"] { color:${violet}; opacity:0.95; }
.troid-settings .settings-row { display:flex; gap:8px; }
.troid-settings .settings-button, .troid-touch-editor .settings-button { flex:1; min-height:44px; box-sizing:border-box; font:inherit; font-size:1rem; color:${white}; background:${rgba(PALETTE.uiPanel, 0.9)}; border:1px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:8px; cursor:pointer; padding:0 12px; }
.troid-settings .settings-button[aria-pressed="true"], .troid-touch-editor .settings-button[aria-pressed="true"] { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.5)}; color:${glow}; }
.troid-settings .settings-button:focus-visible, .troid-settings .settings-range:focus-visible, .troid-touch-editor .settings-button:focus-visible, .troid-touch-editor .settings-range:focus-visible { outline:2px solid ${glow}; outline-offset:2px; }
.troid-settings .settings-slider { display:grid; grid-template-columns:7.5rem 1fr 2.6rem; align-items:center; gap:10px; min-height:44px; }
.troid-settings .settings-slider output { font-size:0.82rem; opacity:0.75; text-align:right; font-variant-numeric:tabular-nums; }
.troid-settings .settings-range, .troid-touch-editor .settings-range { width:100%; accent-color:${core}; }
.troid-settings .settings-keys { display:grid; grid-template-columns:1fr auto; gap:6px 10px; align-items:center; }
.troid-settings .settings-keys .settings-keyname { font-size:0.95rem; }
.troid-settings .settings-key { min-width:7.5rem; flex:none; font-variant-numeric:tabular-nums; }
.troid-settings .settings-key[data-listening="1"] { border-color:${violet}; color:${violet}; box-shadow:0 0 10px ${rgba(PALETTE.violetCore, 0.55)}; }
.troid-settings .settings-small { min-height:36px; font-size:0.85rem; margin-top:8px; }
.troid-settings .settings-resume { flex:none; width:100%; margin-top:10px; }
@media (max-height:430px) { .troid-settings .settings-panel { max-height:96vh; padding:10px 16px 12px; } .troid-settings .settings-title { font-size:1.1rem; margin-bottom:6px; } .troid-settings .settings-resume { margin-top:6px; min-height:40px; } }
.troid-settings .settings-toggle { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; }
.troid-settings .settings-switch { flex:none; min-width:6.5rem; }
.troid-settings .settings-switch[aria-checked="true"] { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.5)}; color:${glow}; }
.troid-settings .settings-reference-block { margin:0 0 12px; }
.troid-settings .settings-reference-rows { display:grid; grid-template-columns:1fr auto; gap:5px 12px; align-items:center; }
.troid-settings .settings-inputs { display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; }
.troid-settings kbd { font:inherit; font-size:0.78rem; padding:1px 7px; min-width:1.4rem; text-align:center; border:1px solid ${rgba(PALETTE.energyCore, 0.4)}; border-radius:4px; background:${rgba(PALETTE.worldVoid, 0.7)}; color:${glow}; }
.troid-settings .settings-touchline { display:flex; flex-direction:column; gap:1px; padding:5px 0; border-bottom:1px solid ${rgba(PALETTE.energyCore, 0.12)}; font-size:0.85rem; }
.troid-settings .settings-touchline span { opacity:0.7; font-size:0.78rem; line-height:1.35; }

/* ---- the pause menu: the map in the main panel, the column of options at its side ---- */
.troid-pausemenu { position:absolute; inset:0; z-index:44; display:none; pointer-events:auto; align-items:center; justify-content:center; box-sizing:border-box; padding:var(--safe-top-px, env(safe-area-inset-top, 0px)) var(--safe-right-px, env(safe-area-inset-right, 0px)) var(--safe-bottom-px, env(safe-area-inset-bottom, 0px)) var(--safe-left-px, env(safe-area-inset-left, 0px)); background:radial-gradient(ellipse at 50% 38%, ${rgba(PALETTE.worldVoid, 0.7)}, ${rgba(PALETTE.worldVoid, 0.92)}); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-pausemenu[data-open="1"] { display:flex; }
.troid-pausemenu .pm-frame { display:grid; grid-template-columns:minmax(0, 1fr) clamp(200px, 25vw, 270px); gap:18px; width:min(1120px, 96%); height:min(660px, 92%); box-sizing:border-box; padding:18px 20px 20px; overflow:hidden; border:1px solid ${rim}; border-radius:6px; background:linear-gradient(180deg, ${rgba(PALETTE.uiPanel, 0.96)}, ${rgba(PALETTE.worldVoid, 0.97)}); box-shadow:0 0 34px ${rgba(PALETTE.energyGlow, 0.2)}, inset 0 1px 0 ${rgba(PALETTE.whiteHot, 0.1)}; }
/* the main panel: the map, or the screen of the option that was chosen in its place */
.troid-pausemenu .pm-stage { position:relative; min-width:0; min-height:0; display:flex; flex-direction:column; }
.troid-pausemenu .pm-map { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:10px; }
.troid-pausemenu .pm-map[hidden] { display:none; }
.troid-pausemenu .pm-where { flex:none; display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 22px; }
.troid-pausemenu .pm-where-head { flex:0 0 100%; font-size:0.68rem; letter-spacing:0.18em; text-transform:uppercase; opacity:0.55; }
.troid-pausemenu .pm-zone { font-size:1.2rem; font-weight:300; letter-spacing:0.05em; line-height:1.25; text-shadow:0 0 12px ${core}88; margin-right:auto; }
.troid-pausemenu .pm-where dl { margin:0; display:flex; flex-wrap:wrap; gap:0 18px; }
.troid-pausemenu .pm-where dl > * { display:inline; }
.troid-pausemenu .pm-where dt { display:inline; font-size:0.68rem; letter-spacing:0.18em; text-transform:uppercase; opacity:0.55; margin-right:6px; }
.troid-pausemenu .pm-where dd { display:inline; margin:0 12px 0 0; font-size:0.98rem; font-variant-numeric:tabular-nums; }
.troid-pausemenu .pm-map-body { position:relative; flex:1 1 auto; min-height:0; overflow:hidden; border:1px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:4px; background:${rgba(PALETTE.worldVoid, 0.6)}; box-shadow:inset 0 0 24px ${rgba(PALETTE.worldVoid, 0.8)}; }
.troid-pausemenu .pm-map-foot { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:4px 18px; font-size:0.76rem; letter-spacing:0.04em; opacity:0.85; }
.troid-pausemenu .map-hint { margin-left:auto; opacity:0.6; }
/* the screens of the options are put in the main panel: they fill it instead of floating over the screen */
.troid-pausemenu .pm-stage > .troid-settings { position:absolute; inset:0; z-index:auto; align-items:stretch; justify-content:stretch; background:transparent; }
.troid-pausemenu .pm-stage > .troid-settings .settings-panel { width:100%; max-height:none; height:100%; box-shadow:none; border-radius:4px; background:${rgba(PALETTE.worldVoid, 0.5)}; }
/* the column of options */
.troid-pausemenu .pm-side { min-width:0; min-height:0; display:flex; flex-direction:column; gap:7px; overflow-y:auto; overscroll-behavior:contain; padding:2px 2px 2px 0; }
.troid-pausemenu .pm-title { flex:none; font-size:1.25rem; font-weight:300; letter-spacing:0.34em; text-transform:uppercase; margin:0 0 6px; padding-bottom:10px; background:linear-gradient(90deg, ${core}, transparent) bottom/100% 1px no-repeat; text-shadow:0 0 14px ${core}88; }
.troid-pausemenu .pm-entry { position:relative; flex:none; display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:10px; min-height:46px; box-sizing:border-box; padding:0 14px 0 12px; font:inherit; font-size:1rem; letter-spacing:0.04em; text-align:left; color:${white}; cursor:pointer; background:${rgba(PALETTE.uiPanel, 0.62)}; border:1px solid ${rgba(PALETTE.energyCore, 0.18)}; border-left:3px solid ${rgba(PALETTE.energyCore, 0.25)}; border-radius:3px; }
.troid-pausemenu .pm-entry > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.troid-pausemenu .pm-entry svg { color:${core}; }
.troid-pausemenu .pm-entry:hover, .troid-pausemenu .pm-entry:focus-visible { outline:none; background:${rgba(PALETTE.energyCore, 0.12)}; border-left-color:${glow}; box-shadow:0 0 14px ${rgba(PALETTE.energyGlow, 0.22)}; text-shadow:0 0 10px ${core}99; }
.troid-pausemenu .pm-entry[data-primary="1"] { border-color:${rgba(PALETTE.energyCore, 0.5)}; border-left-color:${glow}; background:${rgba(PALETTE.energyCore, 0.1)}; }
.troid-pausemenu .pm-entry[aria-current="page"] { border-color:${rgba(PALETTE.energyCore, 0.55)}; border-left-color:${glow}; background:${rgba(PALETTE.energyCore, 0.16)}; text-shadow:0 0 10px ${core}99; }
.troid-pausemenu .pm-entry::after { content:""; width:7px; height:7px; border-top:1.6px solid ${rgba(PALETTE.energyCore, 0.6)}; border-right:1.6px solid ${rgba(PALETTE.energyCore, 0.6)}; transform:rotate(45deg); }
.troid-pausemenu .pm-entry[data-primary="1"]::after, .troid-pausemenu .pm-entry[aria-current="page"]::after { display:none; }
.troid-pausemenu .pm-entry[hidden] { display:none; }
/* a phone held upright: the map on top, the options under it in two columns */
@media (max-width:700px) {
  .troid-pausemenu .pm-frame { grid-template-columns:minmax(0, 1fr); grid-template-rows:minmax(0, 1fr) auto; gap:10px; width:100%; height:100%; padding:12px 12px 14px; border-radius:0; border-left:0; border-right:0; }
  .troid-pausemenu .pm-side { display:grid; grid-template-columns:1fr 1fr; gap:6px; overflow:visible; padding:0; }
  .troid-pausemenu .pm-title { display:none; }
  .troid-pausemenu .pm-entry { min-height:44px; padding:0 10px 0 9px; gap:8px; grid-template-columns:22px 1fr; line-height:1.1; }
  .troid-pausemenu .pm-entry > span { white-space:normal; overflow-wrap:anywhere; }
  .troid-pausemenu .pm-entry::after { display:none; }
  .troid-pausemenu .pm-entry[data-id="resume"] { grid-column:1 / -1; }
  .troid-pausemenu .pm-zone { font-size:1.05rem; }
  .troid-pausemenu .map-hint { display:none; }
}
/* a phone held sideways, or a window that is not tall: the options go two to a row, still a finger tall each (44 px), and the legend of the map goes (its marks have names for a screen reader) */
@media (max-height:430px) {
  .troid-pausemenu .pm-frame { grid-template-columns:minmax(0, 1fr) 252px; gap:12px; height:96%; padding:10px 12px 12px; }
  .troid-pausemenu .pm-title { grid-column:1 / -1; font-size:1rem; margin-bottom:0; padding-bottom:6px; letter-spacing:0.28em; }
  .troid-pausemenu .pm-side { display:grid; grid-template-columns:1fr 1fr; grid-auto-rows:min-content; align-content:start; gap:6px; }
  .troid-pausemenu .pm-entry { min-height:44px; font-size:0.88rem; line-height:1.1; padding:0 8px 0 8px; gap:7px; grid-template-columns:20px 1fr; }
  .troid-pausemenu .pm-entry > span { white-space:normal; overflow-wrap:anywhere; }
  .troid-pausemenu .pm-entry::after { display:none; }
  .troid-pausemenu .pm-entry[data-id="resume"] { grid-column:1 / -1; }
  .troid-pausemenu .pm-map-foot { display:none; }
  .troid-pausemenu .pm-zone { font-size:1rem; }
  .troid-pausemenu .pm-where-head { display:none; }
}
${mapCss()}

/* ---- the saved games ---- */
.troid-settings .saves-list { display:flex; flex-direction:column; gap:10px; }
.troid-settings .saves-card { position:relative; box-sizing:border-box; padding:11px 12px; border:1px solid ${rgba(PALETTE.energyCore, 0.2)}; border-left:3px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:4px; background:${rgba(PALETTE.worldVoid, 0.5)}; }
.troid-settings .saves-card[data-active="1"] { border-color:${rgba(PALETTE.energyCore, 0.55)}; border-left-color:${glow}; box-shadow:0 0 14px ${rgba(PALETTE.energyGlow, 0.16)}; }
.troid-settings .saves-card[data-state="damaged"] { border-left-color:${violet}; }
.troid-settings .saves-head { display:flex; align-items:center; gap:8px; justify-content:space-between; }
.troid-settings .saves-head b { font-weight:500; letter-spacing:0.06em; }
.troid-settings .saves-chip { font-size:0.68rem; letter-spacing:0.14em; text-transform:uppercase; padding:1px 8px; border:1px solid ${rgba(PALETTE.energyCore, 0.55)}; border-radius:10px; color:${glow}; }
.troid-settings .saves-info { margin:6px 0 8px; font-size:0.84rem; line-height:1.45; opacity:0.82; font-variant-numeric:tabular-nums; }
.troid-settings .saves-info[data-tone="warn"] { color:${violet}; opacity:1; }
.troid-settings .saves-actions, .troid-settings .saves-more, .troid-settings .saves-confirm-buttons { display:flex; flex-wrap:wrap; gap:7px; }
.troid-settings .saves-actions .settings-button, .troid-settings .saves-more .settings-button, .troid-settings .saves-confirm-buttons .settings-button { flex:1 1 auto; min-width:7.2rem; min-height:40px; font-size:0.9rem; }
.troid-settings .saves-more { margin-top:7px; }
.troid-settings .saves-more[hidden], .troid-settings .saves-confirm[hidden], .troid-settings .saves-actions[hidden] { display:none; }
.troid-settings .saves-confirm { margin-top:8px; padding:9px 10px; border:1px solid ${rgba(PALETTE.violetCore, 0.6)}; border-radius:4px; background:${rgba(PALETTE.violetDeep, 0.35)}; }
.troid-settings .saves-confirm p { margin:0 0 8px; font-size:0.88rem; line-height:1.4; }
.troid-settings .saves-status { flex:none; margin:0 0 8px; font-size:0.86rem; color:${glow}; }
.troid-settings .saves-status:empty { margin:0; }
.troid-settings .saves-status[data-tone="warn"] { color:${violet}; }
.troid-settings .saves-foot { margin-top:14px; }
.troid-settings .saves-foot .settings-button { margin-top:8px; }

/* ---- the touch buttons: a small picture of the screen in the settings, and the editor that has the screen over the game ---- */
.troid-settings .tp-screen { position:relative; margin:4px auto 10px; box-sizing:border-box; overflow:hidden; user-select:none; -webkit-user-select:none; border:1px solid ${rim}; border-radius:4px; background:linear-gradient(180deg, ${rgba(PALETTE.worldVoid, 0.96)}, ${rgba(PALETTE.uiPanel, 0.9)}); }
.troid-settings .tp-screen[hidden] { display:none; }
.troid-settings .tp-zone { position:absolute; box-sizing:border-box; border:1px dashed ${rgba(PALETTE.energyCore, 0.4)}; background:${rgba(PALETTE.energyCore, 0.06)}; }
.troid-settings .tp-keep { position:absolute; box-sizing:border-box; border:1px dashed ${rgba(PALETTE.violetCore, 0.45)}; background:${rgba(PALETTE.violetCore, 0.1)}; border-radius:2px; }
.troid-settings .tp-pause { border-radius:50%; }
.troid-settings .tp-button { position:absolute; transform:translate(-50%, -50%); pointer-events:none; }
.troid-settings .settings-touch-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.troid-settings .settings-touch-actions .settings-button { flex:1 1 auto; min-height:40px; }
.troid-pausemenu[data-aside="1"] { display:none; }
.troid-touch-editor { position:absolute; inset:0; z-index:46; display:none; pointer-events:auto; touch-action:none; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-touch-editor[data-open="1"] { display:block; }
.troid-touch-editor .te-scrim { position:absolute; inset:0; background:${rgba(PALETTE.worldVoid, 0.4)}; }
.troid-touch-editor .te-zone { position:absolute; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border:1px dashed ${rgba(PALETTE.energyCore, 0.55)}; background:${rgba(PALETTE.energyCore, 0.07)}; pointer-events:none; }
.troid-touch-editor .te-zone-label { font-size:0.74rem; letter-spacing:0.16em; text-transform:uppercase; opacity:0.6; text-align:center; padding:0 8px; }
.troid-touch-editor .te-keep { position:absolute; box-sizing:border-box; border:1px dashed ${rgba(PALETTE.violetCore, 0.6)}; border-radius:4px; background:repeating-linear-gradient(135deg, ${rgba(PALETTE.violetCore, 0.2)} 0 6px, transparent 6px 12px); pointer-events:none; }
.troid-touch-editor .te-button { position:absolute; display:flex; align-items:center; justify-content:center; box-sizing:border-box; border-radius:50%; touch-action:none; cursor:grab; outline:none; -webkit-tap-highlight-color:transparent; }
.troid-touch-editor .te-button[data-selected="1"] { box-shadow:0 0 0 2px ${rgba(PALETTE.energyCore, 0.95)}, 0 0 18px ${rgba(PALETTE.energyGlow, 0.45)}; }
.troid-touch-editor .te-button:focus-visible { box-shadow:0 0 0 3px ${white}; }
.troid-touch-editor .te-button[data-dragging="1"] { cursor:grabbing; }
.troid-touch-editor .te-panel { position:absolute; display:flex; flex-direction:column; gap:5px; box-sizing:border-box; padding:9px 12px 10px; border:1px solid ${rim}; border-radius:6px; background:${panel}; box-shadow:0 0 24px ${rgba(PALETTE.worldVoid, 0.7)}; }
.troid-touch-editor .te-title { margin:0; font-size:0.95rem; font-weight:300; letter-spacing:0.2em; text-transform:uppercase; text-shadow:0 0 12px ${core}88; }
.troid-touch-editor .te-hint { margin:0; font-size:0.8rem; line-height:1.35; opacity:0.75; }
.troid-touch-editor .te-reserved { font-size:0.72rem; opacity:0.55; }
.troid-touch-editor .te-size { display:grid; grid-template-columns:auto 1fr 3.2em; align-items:center; gap:8px; font-size:0.85rem; min-height:34px; }
.troid-touch-editor .te-size output { text-align:right; font-variant-numeric:tabular-nums; }
.troid-touch-editor .te-actions { display:flex; flex-wrap:wrap; gap:6px; }
.troid-touch-editor .te-actions .settings-button { flex:1 1 auto; min-height:38px; font-size:0.86rem; padding:0 10px; }
.troid-touch-editor .te-save { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.4)}; }
@media (max-height:430px) { .troid-touch-editor .te-panel { gap:3px; padding:6px 10px 8px; } .troid-touch-editor .te-reserved { display:none; } .troid-touch-editor .te-actions .settings-button { min-height:34px; } }

/* ---- the profile ---- */
.troid-settings .profile-grid { display:grid; grid-template-columns:1fr auto; gap:9px 16px; align-items:baseline; margin:0 0 12px; }
.troid-settings .profile-grid dt { font-size:0.8rem; letter-spacing:0.08em; opacity:0.7; }
.troid-settings .profile-grid dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; }
.troid-settings .profile-list { display:block; text-align:right; line-height:1.5; }
`;
}

/** Writes the menu's stylesheet into the document, once. */
export function ensureMenuStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.appendChild(doc.createTextNode(menuCss()));
  doc.head.appendChild(style);
}
