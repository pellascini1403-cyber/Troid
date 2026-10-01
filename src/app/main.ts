import { Game } from './Game';

const host = document.getElementById('app');
if (!host) throw new Error('#app host element is missing from index.html');

const params = new URLSearchParams(location.search);
const lab = params.get('lab');

if (lab === 'model') {
  // Dev tooling is code-split: it never loads (nor weighs) in a normal session.
  const { startModelLab } = await import('./labs/modelLab');
  await startModelLab(host, params);
} else if (lab === 'camera') {
  const { startCameraLab } = await import('./labs/cameraLab');
  await startCameraLab(host, params);
} else {
  const game = new Game(host);
  game.start();

  // Hot-reload friendliness: dispose the previous instance so GPU resources and listeners never stack up.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}
