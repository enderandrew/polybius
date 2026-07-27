export class ModeManager {
  constructor(game) {
    this.game = game;
    this.currentMode = null;
  }

  switchMode(newMode) {
    // Safely tear down the old mode
    if (this.currentMode && typeof this.currentMode.exit === 'function') {
      this.currentMode.exit(this.game);
    }

    this.currentMode = newMode;

    // Boot up the new mode
    if (this.currentMode && typeof this.currentMode.enter === 'function') {
      this.currentMode.enter(this.game);
    }
  }

  update(delta) {
    if (this.currentMode && typeof this.currentMode.update === 'function') {
      this.currentMode.update(this.game, delta);
    }
  }

  pollGamepads(game, gp) {
    if (
      this.currentMode &&
      typeof this.currentMode.pollGamepads === 'function'
    ) {
      this.currentMode.pollGamepads(game, gp);
    }
  }
}

/**
 * Base interface for all Game Modes.
 * Extend this class to create PlayMode, MenuMode, BossMode, etc.
 */
export class GameMode {
  enter(_game) {}
  update(_game, _delta) {}
  exit(_game) {}
  pollGamepads(_game, _gamepad) {}
}
