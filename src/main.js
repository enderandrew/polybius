import Game from '@/Object/Game';
import { PowerUpType } from '@/PowerUp/PowerUpType';

const game = new Game();

// Dev-only console access, e.g.:
//   window.game.powerUpManager.collect(window.PowerUpType.FIREWALL, window.game);
// import.meta.env.DEV is stripped by Vite in production builds.
if (import.meta.env.DEV) {
  window.game = game;
  window.PowerUpType = PowerUpType;
}

game.update();
