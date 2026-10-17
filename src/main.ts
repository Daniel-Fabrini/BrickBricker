import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import './styles/main.css';
import { App } from './app/App';

async function boot(): Promise<void> {
  const gameRoot = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  if (!gameRoot || !uiRoot) throw new Error('Missing root elements');
  const app = new App(gameRoot, uiRoot);
  await app.start();
}

boot().catch((err: unknown) => {
  console.error('[boot] failed', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.textContent = 'Something went wrong while starting the game. Please restart the app.';
    boot.classList.add('error');
  }
});
