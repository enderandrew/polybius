import { GameMode } from '@/Object/Manager/ModeManager';
import { BossFight } from '@/Object/BossFight/BossFight';
import ScreenParodySurface from '@/Object/Screen/ScreenParodySurface';
import ScreenGameEnd from '@/Object/Screen/ScreenGameEnd';
import PlayMode from '@/Object/Modes/PlayMode';
import TransitionMode from '@/Object/Modes/TransitionMode';
import BonusMode from '@/Object/Modes/BonusMode';
import keyboardInput from '@/utils/KeyboardInput';
import Sequencer from '@/utils/Sequencer';

export default class BossMode extends GameMode {
  /**
   * @param {number} nextLevel - The level to proceed to after the boss fight
   * @param {number} phaseNumber - 1–7 (which Chaos Emerald)
   */
  constructor(nextLevel, phaseNumber) {
    super();
    this.nextLevel = nextLevel;
    this.phaseNumber = phaseNumber;
    this.bossFight = null;
    this.sequencer = new Sequencer();
  }

  enter(game) {
    game.releaseLevel();
    game.releaseScreen();
    if (game.powerUpHUD) game.powerUpHUD.hide();

    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    if (game.bgmManager) {
      game.bgmManager.playBoss();
    }

    const loopCount = Math.floor((game.level - 1) / 32) + 1;
    const emeraldCount = Math.min(7, loopCount);

    const parodyScreen = new ScreenParodySurface(
      game.screenContentManager,
      `CHAOS EMERALD ${emeraldCount} DETECTED. DEFEAT THE SYNTHETIC OVERLORD TO CLAIM IT.`,
    );
    game.loadScreen(parodyScreen);
    game.screenObject.position.z = 0.1;

    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(
        `Warning. Synthetic Overlord detected. Defeat it to claim Chaos Emerald ${emeraldCount}.`,
      );
      utt.rate = 0.85;
      utt.pitch = 0.9;
      window.speechSynthesis.speak(utt);
    } catch (error) {
      console.debug('[BossMode] Speech synthesis failed:', error);
    }

    // Initialize the BossFight instance after a brief intro sequence
    // --- REPLACED setTimeout ---
    this.sequencer.add(4500, () => {
      if (!game.modeManager || game.modeManager.currentMode !== this) return;
      game.releaseScreen();

      this.bossFight = new BossFight(
        game.scene,
        game.camera,
        loopCount,
        (victory, score) =>
          this._onBossFightComplete(game, victory, score, emeraldCount),
      );
    });
  }

  update(game, delta) {
    keyboardInput.dispatchActions();

    if (game.isPaused) {
      if (game.bgmManager) game.bgmManager.pause();
      return;
    }

    this.sequencer.update(delta);

    if (this.bossFight && this.bossFight.isActive) {
      this.bossFight.update(delta);
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

  _onBossFightComplete(game, victory, score, emeraldCount) {
    if (score > 0) {
      game.score += score;
      game.screenContentManager.setScore(game.score);
    }

    if (this.bossFight) {
      this.bossFight.dispose();
      this.bossFight = null;
    }

    if (this.nextLevel > 256) {
      game.camera.position.set(0, 0, -6);
      game.camera.lookAt(0, 0, 10);
      game.loadScreen(new ScreenGameEnd(game.screenContentManager));
      game.screenObject.position.z = 0.1;
      return; // Soft-lock as intended for the absolute end of the game
    }

    const loopCount = Math.floor((game.level - 1) / 32) + 1;
    const colors = [
      'BLUE',
      'RED',
      'YELLOW',
      'GREEN',
      'ORANGE',
      'PURPLE',
      'WHITE',
      'RAINBOW',
    ];
    const nextColor = colors[loopCount % 8];

    const msg = victory
      ? `CLEARED 32 SURFACES. COLLECTED CHAOS EMERALD ${emeraldCount}. STARTING ${nextColor} PHASE.`
      : `OVERLORD SURVIVED. CHAOS EMERALD ${emeraldCount} LOST. STARTING ${nextColor} PHASE ANYWAY.`;

    const summaryScreen = new ScreenParodySurface(
      game.screenContentManager,
      msg,
    );

    // Transition cleanly to the next level or bonus stage via TransitionMode
    const nextModeFactory = () => {
      if (game.powerUpManager.hasBonusStageEarned) {
        game.powerUpManager.resetBonusStageEarned();
        return new BonusMode(this.nextLevel);
      }
      return new PlayMode(this.nextLevel);
    };

    game.modeManager.switchMode(
      new TransitionMode(summaryScreen, 4500, nextModeFactory),
    );
  }

  exit(_game) {
    this.sequencer.clear();
    _game.isPlaying = false;
    if (_game.bgmManager) {
      _game.bgmManager.stop();
    }
    if (this.bossFight) {
      this.bossFight.dispose();
      this.bossFight = null;
    }
  }
}
