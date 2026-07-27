import { GameMode } from '@/Object/Manager/ModeManager';
import ScreenHighScores from '@/Object/Screen/ScreenHighScores';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class HighScoresMode extends GameMode {
  enter(game) {
    game.releaseLevel();
    if (game.powerUpHUD) game.powerUpHUD.hide();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_GAME_OVER,
    );

    game.loadScreen(new ScreenHighScores(game.screenContentManager));
  }

  update(game, _delta) {
    if (game.screenObject !== null) {
      game.screenObject.update();
    }
  }

  pollGamepads(game, gp) {
    const dispatchKey = (code, type) => {
      document.dispatchEvent(new KeyboardEvent(type, { code }));
    };

    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => game.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);
    const justReleased = (idx) => !isPressed(idx) && wasPressed(idx);

    // 'A' Button or 'Start' Button to dismiss/submit score
    if (justPressed(0) || justPressed(9)) {
      dispatchKey('Space', 'keydown');
      dispatchKey('Enter', 'keydown');
    }
    if (justReleased(0) || justReleased(9)) {
      dispatchKey('Space', 'keyup');
      dispatchKey('Enter', 'keyup');
    }
  }

  exit(game) {
    game.releaseScreen();
  }
}
