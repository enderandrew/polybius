import { GameMode } from '@/Object/Manager/ModeManager';
import keyboardInput from '@/utils/KeyboardInput';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import ScreenPlay from '@/Object/Screen/ScreenPlay';
import Sequencer from '@/utils/Sequencer';

export default class PlayMode extends GameMode {
  constructor(levelId) {
    super();
    this.levelId = levelId;
    this.sequencer = new Sequencer();
  }

  enter(game) {
    game.isPlaying = true;
    game.isLoadingLevel = false;
    game.loadScreen(new ScreenPlay(game.screenContentManager));
    game.loadLevel(this.levelId);
    if (game.powerUpHUD) game.powerUpHUD.show();
    // Re-enable the global HTML HUD for score, lives, and superzapper text
    //console.log('[DEBUG HUD] Entering PlayMode.');
    //console.log('[DEBUG HUD] screenContentManager exists?', !!game.screenContentManager);
    const hudElement = document.getElementById('hud');
    //console.log('[DEBUG HUD] HTML #hud element found?', !!hudElement, hudElement ? hudElement.style.display : 'N/A');
    if (hudElement) {
      hudElement.style.display = 'block';
    }

    // Start the level music immediately upon entering play mode
    if (game.bgmManager) {
      game.bgmManager.playForLevel(this.levelId);
    }
  }

  update(game, delta) {
    // Dispatch active play input
    keyboardInput.dispatchActions();

    // Ensure music keeps playing during active play, but stops if paused
    if (game.isPaused) {
      if (game.bgmManager) game.bgmManager.pause();
      return;
    }

    this.sequencer.update(delta);
    if (
      game.screenContentManager &&
      typeof game.screenContentManager.update === 'function'
    ) {
      game.screenContentManager.update(delta);
    }

    // Update level and renderers
    if (game.levelObject !== null && game.levelRenderer !== null) {
      game.levelObject.update(delta);

      // The level tick can end the game (last life lost), which tears the level
      // down. Re-check before touching anything that teardown nulls out.
      if (game.levelObject === null || game.levelRenderer === null) {
        return;
      }

      game.levelRenderer.update();

      // Power-up subsystem ticks
      game.powerUpSpawner.update(delta);
      game.powerUpManager.update(delta);
      if (game.aiDroid) game.aiDroid.update(delta);

      // Shooter & Power-up collision logic
      if (game.shooter && game.shooter.laneId !== undefined) {
        const hitDepth = Math.max(0.1, game.shooter.zPosition);
        const collected = game.powerUpSpawner.checkPlayerCollision(
          game.shooter.laneId,
          hitDepth,
        );

        if (collected) {
          const isNativeWarping = game.shooter.zPosition > 0.25;

          if (isNativeWarping) {
            messageBroker.publish(
              MessageBroker.TOPIC_AUDIO,
              MessageBroker.MESSAGE_YES,
            );

            game.bonusOverlay.classList.add('is-active');

            game.bonusOverlay.classList.add('is-active');

            this.sequencer.clear();
            this.sequencer.add(2000, () => {
              if (game.bonusOverlay) {
                game.bonusOverlay.classList.remove('is-active');
              }
            });

            const bonusType = game._getRandomBonusPowerUp(collected);
            if (bonusType) {
              game.powerUpManager.collect(bonusType, game);
            }
          } else {
            if (collected.id === 'ONE_UP' || collected.id === 'EXTRA_LIFE') {
              messageBroker.publish(
                MessageBroker.TOPIC_AUDIO,
                MessageBroker.MESSAGE_1UP,
              );
            } else if (collected.id === 'PHANTOM') {
              messageBroker.publish(
                MessageBroker.TOPIC_AUDIO,
                MessageBroker.MESSAGE_PHANTOM,
              );
            } else if (collected.id === 'SHIELD') {
              messageBroker.publish(
                MessageBroker.TOPIC_AUDIO,
                MessageBroker.MESSAGE_SHIELD,
              );
            } else if (collected.id === 'SYNTH_SURGE') {
              messageBroker.publish(
                MessageBroker.TOPIC_AUDIO,
                MessageBroker.MESSAGE_SYNTH_SURGE,
              );
            } else {
              messageBroker.publish(
                MessageBroker.TOPIC_AUDIO,
                MessageBroker.MESSAGE_POWERUP,
              );
            }
          }

          game.powerUpManager.collect(collected, game);
          game.screenContentManager.setScore(game.score);
        }
      }
    }
  }

  pollGamepads(game, gp) {
    if (game.isPaused || !game.shooter) return;

    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => game.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);

    const isLeft = gp.axes[0] < -0.5;
    const wasLeft = game.prevGamepadAxis < -0.5;
    const justLeft = isLeft && !wasLeft;

    const isRight = gp.axes[0] > 0.5;
    const wasRight = game.prevGamepadAxis > 0.5;
    const justRight = isRight && !wasRight;

    // Lane lock — L2 (6) / R2 (7). Held, so polled rather than edge-detected.
    // This is the main reason lock exists on pad: analog stick drift near the
    // 0.5 deadzone nudges the player between lanes unintentionally.
    game.shooter.laneLockGamepad = isPressed(6) || isPressed(7);

    // Dash — L1 (4) / R1 (5). Edge-detected so holding won't repeat-dash.
    if (justPressed(4)) game.shooter.dashLeft();
    if (justPressed(5)) game.shooter.dashRight();

    if (justPressed(14) || justLeft) game.shooter.moveLeft();
    if (justPressed(15) || justRight) game.shooter.moveRight();
    if (justPressed(12) || justPressed(1) || justPressed(3))
      game.shooter.jump();
    if (justPressed(13) || justPressed(2)) game.shooter.fireSuperzapper();

    // Fire is now A (0) only. R2 previously doubled as fire, but it is the
    // lane-lock trigger now — holding position to line up a shot would
    // otherwise have also been holding the fire button.
    if (isPressed(0)) game.shooter.fire();
  }

  exit(game) {
    this.sequencer.clear();
    game.isPlaying = false;
    if (game.bgmManager) {
      game.bgmManager.stop();
    }
    game.releaseLevel();
    // Hide the HTML HUD when exiting gameplay (e.g. going back to menu)
    const hudElement = document.getElementById('hud');
    if (hudElement) {
      hudElement.style.display = 'none';
    }
    if (game.powerUpHUD) game.powerUpHUD.hide();
  }
}
