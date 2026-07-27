export class ModeManager {
  constructor(game) {
    this.game = game;
    this.currentMode = null;

    /**
     * A mode switch requested while update()/enter()/exit() is on the stack.
     * Applied once the stack unwinds — see switchMode().
     */
    this._pendingMode = null;

    /** Re-entrancy depth: > 0 while a mode callback is executing. */
    this._depth = 0;
  }

  /**
   * Request a transition to `newMode`.
   *
   * Transitions requested from *inside* a mode callback are deferred until the
   * callback returns. This matters because tearing a mode down runs exit(),
   * which releases the level — and the interrupted call is still holding
   * references to those released objects.
   *
   * The concrete case: the player's last life ends deep inside
   *   Level.update() -> surfaceObjectsManager.update() -> shooter.update()
   *     -> Shooter.updateState() -> killedCallback() -> Game.shooterKilledCallback()
   * Switching synchronously there would run PlayMode.exit() -> releaseLevel()
   * -> Level.release(), which sets `shooter`, `surfaceObjectsManager` and
   * `projectileManager` to undefined. When the stack unwound, Level.update()
   * would resume at `this.shooter.inState(...)` and throw on undefined.
   *
   * Deferring restores the semantics the pre-refactor Game.setState() had: it
   * only flagged the transition, and handleState() applied it later in the
   * frame, safely outside the update traversal.
   */
  switchMode(newMode) {
    if (this._depth > 0) {
      this._pendingMode = newMode;
      return;
    }

    this._applySwitch(newMode);
    this._drainPendingModes();
  }

  update(delta) {
    this._depth++;
    try {
      if (this.currentMode && typeof this.currentMode.update === 'function') {
        this.currentMode.update(this.game, delta);
      }
    } finally {
      this._depth--;
    }

    this._drainPendingModes();
  }

  pollGamepads(game, gp) {
    this._depth++;
    try {
      if (
        this.currentMode &&
        typeof this.currentMode.pollGamepads === 'function'
      ) {
        this.currentMode.pollGamepads(game, gp);
      }
    } finally {
      this._depth--;
    }

    this._drainPendingModes();
  }

  /** Runs exit() on the old mode and enter() on the new one. */
  _applySwitch(newMode) {
    this._depth++;
    try {
      if (this.currentMode && typeof this.currentMode.exit === 'function') {
        this.currentMode.exit(this.game);
      }

      this.currentMode = newMode;

      if (this.currentMode && typeof this.currentMode.enter === 'function') {
        this.currentMode.enter(this.game);
      }
    } finally {
      this._depth--;
    }
  }

  /**
   * Apply any transition that was deferred. Loops because enter()/exit() may
   * legitimately request a further switch (e.g. TransitionMode chaining into
   * the mode it wraps), with a cap so a mode pair that ping-pongs can't hang
   * the frame.
   */
  _drainPendingModes() {
    if (this._depth > 0) {
      return;
    }

    let guard = 0;
    while (this._pendingMode !== null) {
      if (++guard > 8) {
        console.error(
          '[ModeManager] Mode switch did not settle after 8 transitions; ' +
            'dropping pending mode to avoid an infinite loop.',
          this._pendingMode,
        );
        this._pendingMode = null;
        break;
      }

      const next = this._pendingMode;
      this._pendingMode = null;
      this._applySwitch(next);
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
