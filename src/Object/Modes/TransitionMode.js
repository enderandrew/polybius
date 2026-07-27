import { GameMode } from '@/Object/Manager/ModeManager';
import Sequencer from '@/utils/Sequencer'; // <-- Import the new utility
import keyboardInput from '@/utils/KeyboardInput';

export default class TransitionMode extends GameMode {
  /**
   * @param {Object} screenObject - The 3D Canvas screen to display (e.g., ScreenParodySurface)
   * @param {number} durationMs - How long the transition lasts in milliseconds
   * @param {Function} nextModeFactory - A function that returns the instantiated next mode
   */
  constructor(screenObject, durationMs, nextModeFactory) {
    super();
    this.screenObject = screenObject;
    this.durationMs = durationMs;
    this.nextModeFactory = nextModeFactory;
    this.sequencer = new Sequencer(); // <-- Initialize the sequencer
  }

  enter(game) {
    game.releaseLevel();
    if (game.powerUpHUD) game.powerUpHUD.hide();

    // Center the camera for the 2D screen overlay
    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    // Mount the requested transition screen
    game.loadScreen(this.screenObject);
    if (game.screenObject) {
      game.screenObject.position.z = 0.1;
    }

    // --- REPLACED setTimeout ---
    // Queue the mode switch to happen after durationMs elapses in game-time
    this.sequencer.add(this.durationMs, () => {
      if (!game.modeManager || game.modeManager.currentMode !== this) return;
      game.modeManager.switchMode(this.nextModeFactory());
    });
  }

  update(game, delta) {
    // Process input in case the user has a global hotkey (like toggling fullscreen)
    keyboardInput.dispatchActions();

    // Allow the screen manager to tick if it has animated text or glitches
    if (
      game.screenContentManager &&
      typeof game.screenContentManager.update === 'function'
    ) {
      game.screenContentManager.update(delta);
    }

    if (game.isPaused) {
      return;
    }

    // --- TICK THE SEQUENCER ---
    this.sequencer.update(delta);
  }

  exit(game) {
    // --- CLEANUP TIMERS ---
    this.sequencer.clear();

    // Ensure the screen is dumped before the next mode boots
    game.releaseScreen();
  }
}
