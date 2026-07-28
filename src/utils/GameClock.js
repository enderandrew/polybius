/**
 * GameClock.js
 *
 * A manually-advanced clock used for enemy-side timing, so that state machines
 * (Flipper rotation, Pulsar pulse, Fuseball transitions, enemy fire cadence)
 * can be slowed by TIME_DILATION the same way delta-driven movement already is.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * SurfaceObject timings originally read Date.now() directly. Scaling the frame
 * delta therefore only slowed motion computed as `zPosition += zSpeed * delta`
 * — everything expressed as "how far through the current State am I" kept
 * running at wall-clock speed. In practice that is most of what the player
 * actually sees an enemy do, which is why dilation didn't read as dilation.
 *
 * ── Two useful properties ────────────────────────────────────────────────────
 *
 * 1. It only advances when advance() is called, i.e. from Level.update(). While
 *    the game is paused Level.update() doesn't run, so enemy time genuinely
 *    stops. Previously a 10-second pause let Date.now() run on, and every
 *    enemy state completed instantly on resume.
 *
 * 2. It starts from Date.now() rather than 0, so its magnitudes match the wall
 *    clock. If an object ever mixes sources the result is slightly wrong rather
 *    than catastrophically wrong.
 *
 * The player deliberately does NOT use this clock — Shooter keeps real time, so
 * input, jump arcs and dash cooldowns are never affected by dilation.
 */
class GameClock {
  constructor() {
    this._now = Date.now();
  }

  /**
   * @param {number} deltaSeconds - already scaled by the caller.
   */
  advance(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      return;
    }
    this._now += deltaSeconds * 1000;
  }

  /** @return {number} milliseconds, comparable to Date.now() in magnitude. */
  now() {
    return this._now;
  }

  /**
   * Re-anchor to wall time. Called on level load so a long spell in menus
   * doesn't leave the clock arbitrarily far behind.
   */
  reset() {
    this._now = Date.now();
  }
}

const enemyClock = new GameClock();
export default enemyClock;
export { GameClock };
