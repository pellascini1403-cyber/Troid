import { cssHex, PALETTE } from '@/presentation/palette';

const rgba = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/**
 * The look of the map (docs/PROMPT19-LOG.md), from the palette tokens of the rest of the interface and nothing else: the black of the void, the cyan of the energy for what is known and open, the violet for what is
 * shut, guarded or warded. It is written into the menu's style sheet (the map lives in the menu's chunk), not into a sheet of its own.
 */
export function mapCss(): string {
  const glow = cssHex(PALETTE.energyGlow);
  const white = cssHex(PALETTE.whiteHot);
  const core = cssHex(PALETTE.energyCore);
  const violet = cssHex(PALETTE.violetCore);
  const violetGlow = cssHex(PALETTE.violetGlow);
  return `
/* ---- the map ---- */
.map-view { position:relative; width:100%; height:100%; min-height:0; overflow:hidden; box-sizing:border-box; touch-action:none; cursor:grab; user-select:none; -webkit-user-select:none; outline:none; background:radial-gradient(ellipse at 50% 45%, ${rgba(PALETTE.worldNight, 0.9)}, ${rgba(PALETTE.worldVoid, 0.96)}); }
.map-view[data-dragging="1"] { cursor:grabbing; }
.map-view:focus-visible { outline:2px solid ${glow}; outline-offset:-3px; }
.map-surface { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:hidden; }
.map-room-body { fill:${rgba(PALETTE.uiPanel, 0.9)}; stroke:${rgba(PALETTE.energyCore, 0.5)}; stroke-width:1.4px; vector-effect:non-scaling-stroke; }
.map-room[data-current="1"] .map-room-body { fill:${rgba(PALETTE.energyCore, 0.09)}; stroke:${glow}; stroke-width:2.2px; }
.map-terrain { fill:${rgba(PALETTE.energyMid, 0.5)}; }
.map-oneway { fill:${rgba(PALETTE.energyMid, 0.85)}; }
.map-gate { fill:${rgba(PALETTE.violetCore, 0.6)}; stroke:${violetGlow}; stroke-width:1px; vector-effect:non-scaling-stroke; }
.map-arena { fill:${rgba(PALETTE.violetCore, 0.08)}; stroke:${rgba(PALETTE.violetCore, 0.75)}; stroke-width:1.2px; stroke-dasharray:6 5; vector-effect:non-scaling-stroke; }
.map-arena[data-done="1"] { fill:transparent; stroke:${rgba(PALETTE.energyCore, 0.3)}; }
.map-link { stroke:${rgba(PALETTE.energyCore, 0.9)}; stroke-width:2.4px; vector-effect:non-scaling-stroke; }
.map-link[data-locked="1"] { stroke:${violet}; stroke-dasharray:7 5; }
.map-stub { stroke:${rgba(PALETTE.energyCore, 0.65)}; stroke-width:2.2px; stroke-dasharray:3 4; vector-effect:non-scaling-stroke; }
.map-stub[data-state="locked"] { stroke:${rgba(PALETTE.violetCore, 0.85)}; }
.map-name { fill:${white}; font:600 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; letter-spacing:0.05em; paint-order:stroke; stroke:${rgba(PALETTE.worldVoid, 0.9)}; stroke-width:3px; pointer-events:none; }
.map-region { fill:${rgba(PALETTE.energyCore, 0.78)}; font:500 10.5px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; letter-spacing:0.22em; text-transform:uppercase; paint-order:stroke; stroke:${rgba(PALETTE.worldVoid, 0.9)}; stroke-width:3px; pointer-events:none; }
.map-door { color:${core}; }
.map-door[data-state="locked"] { color:${violet}; }
.map-door-dot { fill:${core}; }
.map-door-ring { fill:${rgba(PALETTE.worldVoid, 0.92)}; stroke:${core}; stroke-width:1.7px; }
.map-poi { color:${glow}; }
.map-poi-seal, .map-poi-boss { color:${violet}; }
.map-poi[data-done="1"] { opacity:0.45; }
.map-poi-halo { fill:${rgba(PALETTE.energyGlow, 0.18)}; stroke:${glow}; stroke-width:1.4px; }
.map-hero-ring { fill:${rgba(PALETTE.energyGlow, 0.2)}; stroke:${glow}; stroke-width:1.8px; }
.map-hero-dot { fill:${white}; }
.map-tools { position:absolute; right:10px; bottom:10px; display:flex; flex-direction:column; gap:6px; z-index:2; }
.map-tool { width:44px; height:44px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; padding:0; font:inherit; color:${white}; cursor:pointer; background:${rgba(PALETTE.uiPanel, 0.92)}; border:1px solid ${rgba(PALETTE.energyCore, 0.35)}; border-radius:8px; touch-action:manipulation; }
.map-tool:hover:not(:disabled), .map-tool:focus-visible { outline:none; border-color:${glow}; box-shadow:0 0 10px ${rgba(PALETTE.energyGlow, 0.4)}; }
.map-tool:disabled { opacity:0.35; cursor:default; }
.map-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; margin:0; padding:0 24px; text-align:center; font-size:0.95rem; opacity:0.7; }
.map-empty[hidden] { display:none; }
.map-sr { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
.map-key { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.map-key svg { flex:none; }
.map-key-rest { color:${glow}; } .map-key-boss, .map-key-seal, .map-key-lock { color:${violet}; } .map-key-hero { color:${white}; }
.map-key-hero i { display:block; width:12px; height:12px; box-sizing:border-box; border-radius:50%; border:1.6px solid ${glow}; background:radial-gradient(circle, ${white} 0 30%, ${rgba(PALETTE.energyGlow, 0.2)} 31%); }
`;
}
