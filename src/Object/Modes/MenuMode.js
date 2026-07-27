import { GameMode } from '@/Object/Manager/ModeManager';
import ScreenSelectSurface from '@/Object/Screen/ScreenSelectSurface';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class MenuMode extends GameMode {
  enter(game) {
    game.releaseLevel();

    game.lives = 5;
    game.score = 0;
    game.bonusScoreOffset = 0;

    if (game.powerUpHUD) {
      game.powerUpHUD.clear();
      game.powerUpHUD.hide();
    }

    game.powerUpManager.consumeWarpTokens();
    game.powerUpManager.reset();
    game.populateScreenContentManager();

    game.loadScreen(new ScreenSelectSurface(game.screenContentManager));
    game._lastMenuActivity = Date.now();
    game._inAttractMode = false;

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_GAME,
    );

    // Reset activity timer on any physical input
    this._boundActivityHandler = () => {
      game._lastMenuActivity = Date.now();
    };
    window.addEventListener('keydown', this._boundActivityHandler);
  }

  update(game, _delta) {
    if (game.screenObject !== null) {
      game.screenObject.update();
    }

    // Trigger Attract Mode after 6 seconds of absolute inactivity
    if (!game._inAttractMode && Date.now() - game._lastMenuActivity > 6000) {
      game._startAttractMode();
    }
  }

  pollGamepads(game, gp) {
    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => game.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);

    const isLeft = gp.axes[0] < -0.5;
    const wasLeft = game.prevGamepadAxis < -0.5;
    const justLeft = isLeft && !wasLeft;

    const isRight = gp.axes[0] > 0.5;
    const wasRight = game.prevGamepadAxis > 0.5;
    const justRight = isRight && !wasRight;

    // Reset activity timer when gamepad is used
    if (
      justPressed(0) ||
      justPressed(9) ||
      justPressed(14) ||
      justPressed(15) ||
      justLeft ||
      justRight
    ) {
      game._lastMenuActivity = Date.now();
    }
  }

  exit(game) {
    if (this._boundActivityHandler) {
      window.removeEventListener('keydown', this._boundActivityHandler);
    }
    game.releaseScreen();
  }
}
