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

    this._boundActivityHandler = (e) => {
      game._lastMenuActivity = Date.now();

      // Cycle difficulty UP (Hard -> Medium -> Easy)
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        game.difficulty = Math.max(0, game.difficulty - 1);
		game.screenContentManager.set('DIFFICULTY', game.difficulty);
        game.saveGameState();
        messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_MENU_CHANGE);
        if (game.screenObject) game.screenObject._dirty = true;
      }
      // Cycle difficulty DOWN (Easy -> Medium -> Hard)
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        game.difficulty = Math.min(2, game.difficulty + 1);
		game.screenContentManager.set('DIFFICULTY', game.difficulty);
        game.saveGameState();
        messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_MENU_CHANGE);
        if (game.screenObject) game.screenObject._dirty = true;
      }
    };
    window.addEventListener('keydown', this._boundActivityHandler);
  }

  update(game, _delta) {
    if (game.screenObject !== null) {
      game.screenObject.update();
    }

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

    const isUp = gp.axes[1] < -0.5;
    const wasUp = (game.prevGamepadAxisY || 0) < -0.5;
    const justUp = isUp && !wasUp;

    const isDown = gp.axes[1] > 0.5;
    const wasDown = (game.prevGamepadAxisY || 0) > 0.5;
    const justDown = isDown && !wasDown;

    if (
      justPressed(0) || justPressed(9) ||
      justPressed(14) || justPressed(15) || justPressed(12) || justPressed(13) ||
      justLeft || justRight || justUp || justDown
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