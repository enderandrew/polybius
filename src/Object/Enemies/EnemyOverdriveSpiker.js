/**
 * EnemyOverdriveSpiker.js
 *
 * A Spiker variant that moves at 3× normal speed and turns back at 0.55 depth
 * instead of the normal 0.1 (near-rim). The short spike it leaves is dangerous
 * precisely because the player barely registered the Spiker's presence before
 * it was already gone.
 *
 * ── Turnaround override ─────────────────────────────────────────────────────
 *
 * EnemySpiker.updateEntity() checks the turnaround condition as:
 *   this.zPosition <= EnemySpiker.TURNAROUND_HEIGHT   (the class static)
 *
 * A plain instance property cannot shadow a static reference, so updateEntity()
 * must be overridden with that one reference changed to this.turnaroundHeight.
 * The rest of the method is identical to the parent.
 *
 * ── Why 0.55 ────────────────────────────────────────────────────────────────
 *
 * Normal Spiker reaches zPosition 0.1 — almost at the player's rim —
 * before turning back.  At 0.55 the Overdrive turns around halfway down the
 * tube.  With zSpeed 0.018 vs the normal ~0.004-0.006, the full round trip
 * takes roughly the same wall-clock time as a normal Spiker's approach only.
 * The resulting spike covers the inner half of the tube: short but real.
 *
 * ── Spawn level ─────────────────────────────────────────────────────────────
 * Introduced at level 30, between Hydra Spiker (28) and Void Fuseball (32).
 * Chance scales 6%/level, capped at 35%.
 *
 * Spiker variant schedule:
 *   4   EnemySpiker
 *   20  EnemyPhantomSpiker   invisible spike
 *   28  EnemyHydraSpiker     splits on death
 *   30  EnemyOverdriveSpiker fast, short spike   ← this class
 *
 * Extends: EnemySpiker
 * Flag:    this.isOverdrive = true
 */

import EnemySpiker from '@/Object/Enemies/EnemySpiker';

export default class EnemyOverdriveSpiker extends EnemySpiker {

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isOverdrive      = true;
    this.valueInPoints    = 200;
    this.zSpeed           = -0.018;   // 3× average normal speed (~0.004–0.006)
    this.turnaroundHeight = 0.55;     // Turns back halfway instead of near-rim
  }

  // ---------------------------------------------------------------------------
  // updateEntity — identical to EnemySpiker.updateEntity() except the
  // turnaround condition uses this.turnaroundHeight (instance) rather than
  // EnemySpiker.TURNAROUND_HEIGHT (static 0.1).
  // ---------------------------------------------------------------------------
  updateEntity () {
    if (this.inState(EnemySpiker.STATE_DEAD)) {
      this.alive = false;
    }

    // ── Turnaround: instance property replaces static ───────────────────────
    if (this.zPosition <= this.turnaroundHeight && this.isFlagNotSet(EnemySpiker.FLAG_REACHED_TOP)) {
      this.setFlag(EnemySpiker.FLAG_REACHED_TOP);
      this.zPosition = this.turnaroundHeight;
    }

    // ── Back at the spawn edge — despawn ────────────────────────────────────
    if (this.zPosition >= 1 && this.isFlagSet(EnemySpiker.FLAG_REACHED_TOP)) {
      this.alive = false;
    }

    // ── Shoot on the way down (same as parent) ───────────────────────────────
    if (this.inState(EnemySpiker.STATE_SHOOTING) && this.isFlagNotSet(EnemySpiker.FLAG_SHOOTS_FIRED)) {
      this.setFlag(EnemySpiker.FLAG_SHOOTS_FIRED);
      this.fire();
    }

    // ── Z movement ───────────────────────────────────────────────────────────
    if (!this.inState(EnemySpiker.STATE_EXPLODING)) {
      if (this.isFlagNotSet(EnemySpiker.FLAG_REACHED_TOP)) {
        this.zPosition += this.zSpeed;   // Inward (negative zSpeed)
      } else {
        this.zPosition -= this.zSpeed;   // Back out (subtracting negative = positive)
      }
    }
  }
}
