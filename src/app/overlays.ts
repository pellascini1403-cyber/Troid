import { OVERLAY_CATALOGS } from '@/i18n/overlayCatalogs';
import type { Translator } from '@/i18n/translator';
import { AbilityNotice } from '@/ui/overlays/AbilityNotice';
import { ArrivalIndicator } from '@/ui/overlays/ArrivalIndicator';
import { HudView, type HudPointerSink } from '@/ui/hud/HudView';
import { DeathOverlay } from '@/ui/overlays/DeathOverlay';
import { RotateNotice } from '@/ui/overlays/RotateNotice';
import { SaveNotice } from '@/ui/overlays/SaveNotice';
import { TransitionOverlay } from '@/ui/overlays/TransitionOverlay';
import { InteractionPrompt } from '@/ui/prompt/InteractionPrompt';
import { PauseButton } from '@/ui/settings/PauseButton';

/**
 * The parts of the interface that are NOT needed by the first frame (docs/PROMPT14-LOG.md): the HUD, the black of a defeat and of a change of zone, the loading line under it, the icon over what can
 * be interacted with, the entry to the pause menu, the discreet line that says what became of the saved game and the one that says what the hero has just learned. None of them can matter before the game has been up for a moment — the boot curtain is
 * still lifting, the world is held, nothing can be reached yet — so they travel in a chunk of their own, fetched with the other cosmetic parts behind the curtain: the cold start (the budget: JS ≤ 200 KB gz)
 * carries none of their code.
 */
export interface Overlays {
  /** The HUD itself: its numbers are made every frame by the (pure, cold) `HudModel`, so the view can arrive after the first frame and show the state of that moment. */
  hud: HudView;
  death: DeathOverlay;
  transition: TransitionOverlay;
  arrival: ArrivalIndicator;
  prompt: InteractionPrompt;
  pause: PauseButton;
  notice: SaveNotice;
  /** What the hero has just learned, and how it is done with the device in use. */
  ability: AbilityNotice;
  /** The line that asks the player to turn the device (a touch screen held upright). */
  rotate: RotateNotice;
}

/** What the overlays need of the game: where a finger on a bottle icon or on the interaction icon goes, what the pause button does, and the accessibility choices the HUD is made with. */
export interface OverlayHost {
  hudSink: HudPointerSink;
  /** The size of the HUD (1 = as designed) and whether the white flashes of the interface are softened. */
  hud: { size: number; calm: boolean };
  promptSink: ConstructorParameters<typeof InteractionPrompt>[2];
  onPause(): void;
}

export function createOverlays(ui: HTMLElement, translator: Translator, host: OverlayHost): Overlays {
  // its words come with it: the first frame does not carry them
  for (const [lang, entries] of Object.entries(OVERLAY_CATALOGS)) translator.extend(lang, entries);
  const hud = new HudView(ui, translator, host.hudSink, { size: host.hud.size });
  hud.setCalm(host.hud.calm);
  return {
    hud,
    death: new DeathOverlay(ui, translator),
    transition: new TransitionOverlay(ui),
    arrival: new ArrivalIndicator(ui, translator),
    prompt: new InteractionPrompt(ui, translator, host.promptSink),
    pause: new PauseButton(ui, translator, host.onPause),
    notice: new SaveNotice(ui, translator),
    ability: new AbilityNotice(ui, translator),
    rotate: new RotateNotice(ui, translator),
  };
}

export function disposeOverlays(o: Overlays): void {
  for (const part of [o.hud, o.death, o.transition, o.arrival, o.prompt, o.pause, o.notice, o.ability, o.rotate]) part.dispose();
}
