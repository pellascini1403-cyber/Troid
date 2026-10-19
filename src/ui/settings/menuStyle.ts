import { cssHex, PALETTE } from '@/presentation/palette';

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
.troid-settings .settings-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; margin:0 -8px; padding:2px 8px; overscroll-behavior:contain; }
.troid-settings .settings-section { margin:0 0 14px; }
.troid-settings .settings-label { font-size:0.8rem; letter-spacing:0.08em; opacity:0.75; margin:0 0 6px; }
.troid-settings .settings-note { font-size:0.74rem; line-height:1.35; opacity:0.62; margin:6px 0 0; }
.troid-settings .settings-note[data-tone="warn"] { color:${violet}; opacity:0.95; }
.troid-settings .settings-row { display:flex; gap:8px; }
.troid-settings .settings-button { flex:1; min-height:44px; box-sizing:border-box; font:inherit; font-size:1rem; color:${white}; background:${rgba(PALETTE.uiPanel, 0.9)}; border:1px solid ${rgba(PALETTE.energyCore, 0.3)}; border-radius:8px; cursor:pointer; padding:0 12px; }
.troid-settings .settings-button[aria-pressed="true"] { border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.5)}; color:${glow}; }
.troid-settings .settings-button:focus-visible, .troid-settings .settings-range:focus-visible { outline:2px solid ${glow}; outline-offset:2px; }
.troid-settings .settings-slider { display:grid; grid-template-columns:7.5rem 1fr 2.6rem; align-items:center; gap:10px; min-height:44px; }
.troid-settings .settings-slider output { font-size:0.82rem; opacity:0.75; text-align:right; font-variant-numeric:tabular-nums; }
.troid-settings .settings-range { width:100%; accent-color:${core}; }
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

/* ---- the list of the pause menu ---- */
.troid-pausemenu { position:absolute; inset:0; z-index:44; display:none; pointer-events:auto; align-items:center; justify-content:center; background:radial-gradient(ellipse at 50% 38%, ${rgba(PALETTE.worldVoid, 0.7)}, ${rgba(PALETTE.worldVoid, 0.92)}); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:${white}; user-select:none; -webkit-user-select:none; }
.troid-pausemenu[data-open="1"] { display:flex; }
.troid-pausemenu .pm-frame { display:flex; gap:22px; align-items:stretch; width:min(640px, 94vw); max-height:92vh; overflow:auto; box-sizing:border-box; padding:20px 22px 22px; border:1px solid ${rim}; border-radius:6px; background:linear-gradient(180deg, ${rgba(PALETTE.uiPanel, 0.96)}, ${rgba(PALETTE.worldVoid, 0.97)}); box-shadow:0 0 34px ${rgba(PALETTE.energyGlow, 0.2)}, inset 0 1px 0 ${rgba(PALETTE.whiteHot, 0.1)}; }
.troid-pausemenu .pm-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:7px; }
.troid-pausemenu .pm-title { font-size:1.25rem; font-weight:300; letter-spacing:0.34em; text-transform:uppercase; margin:0 0 6px; padding-bottom:10px; background:linear-gradient(90deg, ${core}, transparent) bottom/100% 1px no-repeat; text-shadow:0 0 14px ${core}88; }
.troid-pausemenu .pm-entry { position:relative; display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:10px; min-height:48px; box-sizing:border-box; padding:0 14px 0 12px; font:inherit; font-size:1rem; letter-spacing:0.04em; text-align:left; color:${white}; cursor:pointer; background:${rgba(PALETTE.uiPanel, 0.62)}; border:1px solid ${rgba(PALETTE.energyCore, 0.18)}; border-left:3px solid ${rgba(PALETTE.energyCore, 0.25)}; border-radius:3px; }
.troid-pausemenu .pm-entry svg { color:${core}; }
.troid-pausemenu .pm-entry:hover, .troid-pausemenu .pm-entry:focus-visible { outline:none; background:${rgba(PALETTE.energyCore, 0.12)}; border-left-color:${glow}; box-shadow:0 0 14px ${rgba(PALETTE.energyGlow, 0.22)}; text-shadow:0 0 10px ${core}99; }
.troid-pausemenu .pm-entry[data-primary="1"] { border-color:${rgba(PALETTE.energyCore, 0.5)}; border-left-color:${glow}; background:${rgba(PALETTE.energyCore, 0.1)}; }
.troid-pausemenu .pm-entry::after { content:""; width:7px; height:7px; border-top:1.6px solid ${rgba(PALETTE.energyCore, 0.6)}; border-right:1.6px solid ${rgba(PALETTE.energyCore, 0.6)}; transform:rotate(45deg); }
.troid-pausemenu .pm-entry[data-primary="1"]::after { display:none; }
.troid-pausemenu .pm-where { flex:0 0 190px; display:flex; flex-direction:column; gap:12px; padding:14px 14px; box-sizing:border-box; border:1px solid ${rgba(PALETTE.energyCore, 0.2)}; border-radius:4px; background:${rgba(PALETTE.worldVoid, 0.55)}; align-self:center; }
.troid-pausemenu .pm-entry[hidden] { display:none; }
.troid-pausemenu .pm-where-head { font-size:0.68rem; letter-spacing:0.18em; text-transform:uppercase; opacity:0.55; margin-bottom:-8px; }
.troid-pausemenu .pm-zone { font-size:1.12rem; font-weight:300; letter-spacing:0.05em; line-height:1.25; text-shadow:0 0 12px ${core}88; }
.troid-pausemenu .pm-where dl { margin:0; display:flex; flex-direction:column; gap:10px; }
/* a screen of the menu replaces the list (it is not drawn over it) and lets the menu's own backdrop dim the world */
.troid-pausemenu[data-screen]:not([data-screen="main"]) .pm-frame { display:none; }
.troid-pausemenu > .troid-settings { background:transparent; }
.troid-pausemenu .pm-where dt { font-size:0.68rem; letter-spacing:0.18em; text-transform:uppercase; opacity:0.55; }
.troid-pausemenu .pm-where dd { margin:2px 0 0; font-size:0.98rem; font-variant-numeric:tabular-nums; }
@media (max-width:620px), (max-height:430px) { .troid-pausemenu .pm-frame { flex-direction:column; gap:10px; padding:14px 16px 16px; } .troid-pausemenu .pm-where { flex:none; align-self:stretch; flex-direction:row; flex-wrap:wrap; align-items:baseline; gap:4px 14px; padding:8px 12px; } .troid-pausemenu .pm-where-head { margin-bottom:0; } .troid-pausemenu .pm-where dl { flex-direction:row; flex-wrap:wrap; gap:6px 18px; } .troid-pausemenu .pm-entry { min-height:44px; } }
@media (max-height:430px) { .troid-pausemenu .pm-main { display:grid; grid-template-columns:1fr 1fr; } .troid-pausemenu .pm-title { grid-column:1 / -1; } .troid-pausemenu .pm-entry[data-id="resume"] { grid-column:1 / -1; } }

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
