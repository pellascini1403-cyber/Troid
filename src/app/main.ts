import { Game } from './Game';

const host = document.getElementById('app');
if (!host) throw new Error('#app host element is missing from index.html');

const game = new Game(host);
game.start();

// Hot-reload friendliness: dispose the previous instance so GPU resources and listeners never stack up.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
