const host = document.getElementById('app');
if (!host) throw new Error('#app host element is missing from index.html');

const params = new URLSearchParams(location.search);
const lab = params.get('lab');

if (lab === 'sprites') {
  // Dev tooling is code-split: it never loads (nor weighs) in a normal session.
  // Sprite-set contact sheet + live actor (docs/MIGRATION-2D.md S3).
  const { startSpriteLab } = await import('./labs/spriteLab');
  await startSpriteLab(host, params);
} else if (lab === 'stress') {
  // Render-budget benchmark (docs/MIGRATION-2D.md S1): 800+ animated sprites, parallax layers, a filter, particles.
  const { startStressLab } = await import('./labs/stressLab');
  await startStressLab(host, params);
} else {
  const { Game2D } = await import('./Game2D');
  const game = await Game2D.create(host, params);
  game.start();

  // Hot-reload friendliness: dispose the previous instance so GPU resources and listeners never stack up.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}
