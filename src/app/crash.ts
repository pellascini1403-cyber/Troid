import { cssHex, PALETTE } from '@/presentation/palette';

/**
 * THE PAGE WHEN THE GAME CANNOT GO ON (docs/PROMPT20-LOG.md): the loop skips a frame that throws and asks for the next, and when a hundred and twenty in a row have failed there is nothing left to try — a screen that
 * stood still with no word would be the worst of the endings. The game stops, and this says so in the player's language, with the one thing they can do: reload (the game saves as it is played, and the last saved point
 * is where it begins again). It is its own chunk: it is fetched only when it is needed, and it needs nothing of the game that has just failed — plain DOM, no translator, no menu.
 */
const TEXTS = {
  es: { title: 'Algo ha fallado', body: 'El juego se ha detenido por un error. Se guarda mientras juegas: recarga la página para seguir desde el último punto guardado.', reload: 'Recargar' },
  en: { title: 'Something went wrong', body: 'The game stopped because of an error. It saves as you play: reload the page to go on from the last saved point.', reload: 'Reload' },
} as const;

/** Shows the page over everything, once; answers the element (asking again gives the one that is there). */
export function showCrash(doc: Document = document, reload: () => void = () => doc.defaultView?.location.reload()): HTMLElement {
  const there = doc.querySelector<HTMLElement>('[data-testid="crash"]');
  if (there) return there;
  const text = TEXTS[/^es/i.test(doc.documentElement.lang) ? 'es' : 'en'];
  const white = cssHex(PALETTE.whiteHot);
  const glow = cssHex(PALETTE.energyGlow);
  const root = doc.createElement('div');
  root.dataset['testid'] = 'crash';
  root.dataset['uiBlock'] = '';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'crash-title');
  root.style.cssText = `position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:rgba(3,7,11,0.92);color:${white};font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;pointer-events:auto`;
  const card = doc.createElement('div');
  card.style.cssText = `max-width:420px;padding:20px 22px;border:1px solid ${glow}66;border-radius:8px;background:#0b1220;text-align:center`;
  const title = doc.createElement('h2');
  title.id = 'crash-title';
  title.textContent = text.title;
  title.style.cssText = 'margin:0 0 10px;font-size:1.2rem;font-weight:400;letter-spacing:0.04em';
  const body = doc.createElement('p');
  body.textContent = text.body;
  body.style.cssText = 'margin:0 0 16px;font-size:0.95rem;line-height:1.45;opacity:0.85';
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset['testid'] = 'crash-reload';
  button.textContent = text.reload;
  button.style.cssText = `min-height:44px;padding:0 22px;font:inherit;color:${white};background:#0b1220;border:1px solid ${glow};border-radius:6px;cursor:pointer`;
  button.addEventListener('click', reload);
  card.append(title, body, button);
  root.appendChild(card);
  doc.body.appendChild(root);
  button.focus();
  return root;
}
