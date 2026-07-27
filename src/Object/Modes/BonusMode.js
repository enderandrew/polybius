import { GameMode } from '@/Object/Manager/ModeManager';
import { BonusStage } from '@/Object/BonusStage/BonusStage';
import ScreenContentManager from '@/Object/Screen/ScreenContentManager';
import ScreenParodySurface from '@/Object/Screen/ScreenParodySurface';
import keyboardInput from '@/utils/KeyboardInput';
import Sequencer from '@/utils/Sequencer';

export default class BonusMode extends GameMode {
  constructor(nextLevel, emeralds) {
    super();
    this.nextLevel = nextLevel;
    this.emeralds = emeralds;
    this.phase = 'intro';
    this.sequencer = new Sequencer();
  }

  enter(game) {
    game.releaseLevel();
    if (game.powerUpHUD) game.powerUpHUD.hide();
    game.powerUpManager.consumeWarpTokens();

    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    const msg = 'SUPERMAN 64? FLY THROUGH RINGS.';
    game.loadScreen(new ScreenParodySurface(game.screenContentManager, msg));
    if (game.screenObject) game.screenObject.position.z = 0.1;

    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(
        'Superman 64? Fly through rings.',
      );
      utt.rate = 0.85;
      utt.pitch = 0.9;
      window.speechSynthesis.speak(utt);
    } catch (error) {
      console.debug(
        '[Game] Speech synthesis failed in bonus stage sequence:',
        error,
      );
    }

    // --- REPLACED setTimeout ---
    this.sequencer.add(3500, () => {
      if (!game.modeManager || game.modeManager.currentMode !== this) return;
      game.releaseScreen();
      game.bonusStage = new BonusStage(
        game.scene,
        game.camera,
        (totalScore, ringsCleared) =>
          this.onBonusEnd(game, totalScore, ringsCleared),
        this.emeralds,
      );
      this.phase = 'play';
    });
  }

  update(game, delta) {
    keyboardInput.dispatchActions();
    if (game.isPaused) {
      return;
    }
    this.sequencer.update(delta);

    if (
      this.phase === 'play' &&
      game.bonusStage &&
      typeof game.bonusStage.update === 'function'
    ) {
      game.bonusStage.update(delta);
    }
  }

  pollGamepads(game, gp) {
    if (game.isPaused) return;

    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => game.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);
    const justReleased = (idx) => !isPressed(idx) && wasPressed(idx);

    // X-Axis (Left / Right)
    const isLeft = gp.axes[0] < -0.5;
    const wasLeft = game.prevGamepadAxis < -0.5;
    const justLeft = isLeft && !wasLeft;

    const isRight = gp.axes[0] > 0.5;
    const wasRight = game.prevGamepadAxis > 0.5;
    const justRight = isRight && !wasRight;

    // Y-Axis (Up / Down)
    const isUp = gp.axes[1] < -0.5;
    const wasUp = (game.prevGamepadAxisY || 0) < -0.5;
    const justUp = isUp && !wasUp;

    const isDown = gp.axes[1] > 0.5;
    const wasDown = (game.prevGamepadAxisY || 0) > 0.5;
    const justDown = isDown && !wasDown;

    const dispatchKey = (code, type, keyName) => {
      window.dispatchEvent(
        new KeyboardEvent(type, {
          code: code,
          key: keyName,
          bubbles: true,
        }),
      );
    };

    // D-Pad / Stick Left
    if (justPressed(14) || justLeft)
      dispatchKey('ArrowLeft', 'keydown', 'ArrowLeft');
    if (justReleased(14) || (!isLeft && wasLeft))
      dispatchKey('ArrowLeft', 'keyup', 'ArrowLeft');

    // D-Pad / Stick Right
    if (justPressed(15) || justRight)
      dispatchKey('ArrowRight', 'keydown', 'ArrowRight');
    if (justReleased(15) || (!isRight && wasRight))
      dispatchKey('ArrowRight', 'keyup', 'ArrowRight');

    // D-Pad / Stick Up (Button 12)
    if (justPressed(12) || justUp) dispatchKey('ArrowUp', 'keydown', 'ArrowUp');
    if (justReleased(12) || (!isUp && wasUp))
      dispatchKey('ArrowUp', 'keyup', 'ArrowUp');

    // D-Pad / Stick Down (Button 13)
    if (justPressed(13) || justDown)
      dispatchKey('ArrowDown', 'keydown', 'ArrowDown');
    if (justReleased(13) || (!isDown && wasDown))
      dispatchKey('ArrowDown', 'keyup', 'ArrowDown');

    // Fire (Button 0 = A, Button 7 = R2)
    if (justPressed(0) || justPressed(7)) dispatchKey('Space', 'keydown', ' ');
    if (justReleased(0) || justReleased(7)) dispatchKey('Space', 'keyup', ' ');

    // Store the Y-axis state for the next frame
    game.prevGamepadAxisY = gp.axes[1];
  }

  onBonusEnd(game, totalScore, ringsCleared) {
    this.phase = 'outro';

    if (totalScore > 0) {
      game.score += totalScore;
      game.bonusScoreOffset += totalScore;
      game.screenContentManager.setScore(game.score);
    }

    if (ringsCleared >= BonusStage.RING_COUNT) {
      game.lives++;
      game.screenContentManager.set(ScreenContentManager.KEY_LIVES, game.lives);
      if (window.messageBroker) {
        window.messageBroker.publish('TOPIC_AUDIO', 'MESSAGE_1UP'); // Adjust to your actual constant paths
      }
    }

    if (game.bonusStage) {
      game.bonusStage.dispose();
      game.bonusStage = null;
    }

    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    const msg =
      ringsCleared === 0
        ? 'EVEN SUPERMAN COULD FLY THROUGH RINGS. JUST SAYING.'
        : ringsCleared >= BonusStage.RING_COUNT
          ? 'PERFECT RUN. SINNESLÖSCHEN IS PLEASED.'
          : `${ringsCleared} RINGS. ADEQUATE. THE GOVERNMENT EXPECTED MORE.`;

    game.loadScreen(new ScreenParodySurface(game.screenContentManager, msg));
    if (game.screenObject) game.screenObject.position.z = 0.1;

    this.sequencer.add(2500, () => {
      game.releaseScreen();
      game.startLevel(this.nextLevel);
    });
  }

  exit(game) {
    this.sequencer.clear();

    if (game.bonusStage) {
      game.bonusStage.dispose();
      game.bonusStage = null;
    }
  }
}
