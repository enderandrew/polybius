import { GameMode } from '@/Object/Manager/ModeManager';
import ScreenAttractMode from '@/Object/Screen/ScreenAttractMode';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import MenuMode from '@/Object/Modes/MenuMode';

export default class AttractMode extends GameMode {
  enter(game) {
    game.releaseLevel();
    game.releaseScreen();
    if (game.powerUpHUD) {
      game.powerUpHUD.clear();
      game.powerUpHUD.hide();
    }

    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    game._inAttractMode = true;

    game.loadScreen(
      new ScreenAttractMode(game.screenContentManager, game.highScores, () =>
        game.modeManager.switchMode(new MenuMode()),
      ),
    );

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_GAME,
    );
  }

  update(game, _delta) {
    if (game.screenObject !== null) {
      game.screenObject.update();
    }
  }

  pollGamepads(game, gp) {
    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => game.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);

    if (justPressed(0) || justPressed(9) || justPressed(1) || justPressed(2)) {
      game.modeManager.switchMode(new MenuMode());
    }
  }

  exit(game) {
    game._inAttractMode = false;
    game._lastMenuActivity = Date.now();
    game.releaseScreen();
  }
}
