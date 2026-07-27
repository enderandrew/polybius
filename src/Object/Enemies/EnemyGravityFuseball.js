/**
 * EnemyGravityFuseball.js
 *
 * A Fuseball variant that strips out all random behaviour.
 * Normal Fuseblls wander the tube and only gradually work toward the rim;
 * this one immediately sets zTarget = 0 (the rim) and always switches lanes
 * toward the player's active lane.
 *
 * The result is a relentless pursuer: after one brief movement phase it
 * arrives at the rim and then marches toward the player one lane at a time
 * until it reaches them.
 *
 * Introduced at level 21 — fills the gap between Pulsar (17) and
 * Fuseball Tanker (33) where the difficulty curve otherwise plateaus.
 *
 * Rendering: Same geometry as a normal Fuseball but tinted orange-red
 * via the isGravity flag in EnemyRenderer.setObjectRef().
 *
 * Extends: EnemyFuseball
 * Flag:    this.isGravity = true
 */

import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';

export default class EnemyGravityFuseball extends EnemyFuseball {
  constructor(
    surface,
    projectileManager,
    rewardCallback,
    laneId = 0,
    zPosition = 1,
    game,
  ) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isGravity = true;
    this.valueInPoints = 300; // Worth more than a normal Fuseball (250)
    this.hitPoints = this.isStrong ? 3 : 2; // Takes more hits — it earns the extra HP
  }

  // ---------------------------------------------------------------------------
  // Override updateEntity entirely.
  //
  // The parent's updateEntity contains two sources of randomness that we remove:
  //   1. Random zTarget (we always choose 0 — the rim)
  //   2. Random lane-switch direction (we always move toward activeLaneId)
  //
  // The flag protocol (FLAG_IMMUNE, FLAG_SWITCHING_DIR_CHOSEN, FLAG_SET_LANE_CW,
  // FLAG_LANE_CHANGED, FLAG_REACHED_TOP, FLAG_REACHED_SHOOTER, etc.) is preserved
  // exactly so that updateState() — which we do NOT override — keeps working
  // correctly. In particular:
  //   • FLAG_REACHED_TOP triggers the "rim patrol" branch in updateState(), which
  //     keeps the enemy in STATE_SWITCHING_LANE until FLAG_REACHED_SHOOTER is set.
  //   • FLAG_SET_LANE_CW is intentionally set by updateState() at the END of a
  //     CW switch (same as parent), while FLAG_SET_LANE_CCW is set immediately
  //     here (same asymmetry as the parent).
  // ---------------------------------------------------------------------------
  updateEntity() {
    // ── Death ─────────────────────────────────────────────────────────────────
    if (this.inState(EnemyFuseball.STATE_DEAD)) {
      this.alive = false;
      return;
    }

    // ── Immunity: only immune during lane-switch transitions ──────────────────
    if (!this.inState(EnemyFuseball.STATE_EXPLODING)) {
      this.hittable = !this.isFlagSet(EnemyFuseball.FLAG_IMMUNE);
    }

    // ── Lane-switch direction: ALWAYS toward the player ───────────────────────
    if (
      this.inState(EnemyFuseball.STATE_SWITCHING_LANE) &&
      this.isFlagNotSet(EnemyFuseball.FLAG_SWITCHING_DIR_CHOSEN)
    ) {
      this.setFlag(EnemyFuseball.FLAG_SWITCHING_DIR_CHOSEN);

      const dir = this.surface.getShortestPathDirection(
        this.laneId,
        this.surface.activeLaneId,
      );

      if (dir === 0) {
        // Already in the player's lane — FLAG_REACHED_SHOOTER triggers
        // the "at player" path in updateState.
        this.setFlag(EnemyFuseball.FLAG_REACHED_SHOOTER);
      } else if (dir === 1) {
        // CW toward player.
        // FLAG_SET_LANE_CW is deliberately NOT set here — updateState()
        // sets it at the end of this switch cycle (mirrors parent behaviour,
        // which defers the CW lane change to the end of the animation).
        this.setFlag(EnemyFuseball.FLAG_SWITCHING_LANE_CW);
        this.unsetFlag(EnemyFuseball.FLAG_REACHED_SHOOTER);
      } else {
        // CCW toward player.
        // FLAG_SET_LANE_CCW is set immediately so the lane changes at the
        // START of the switch animation (same as parent).
        this.setFlag(EnemyFuseball.FLAG_SWITCHING_LANE_CCW);
        this.setFlag(EnemyFuseball.FLAG_SET_LANE_CCW);
        this.unsetFlag(EnemyFuseball.FLAG_REACHED_SHOOTER);
      }
    }

    // ── Lane-change counter (used by updateState for state bookkeeping) ───────
    if (
      this.inState(EnemyFuseball.STATE_SWITCHING_LANE) &&
      this.isFlagNotSet(EnemyFuseball.FLAG_LANE_CHANGED)
    ) {
      this.setFlag(EnemyFuseball.FLAG_LANE_CHANGED);
      this.laneChanges++;
    }

    // ── Apply the queued lane change ──────────────────────────────────────────
    if (
      this.isFlagSet(EnemyFuseball.FLAG_SET_LANE_CW) ||
      this.isFlagSet(EnemyFuseball.FLAG_SET_LANE_CCW)
    ) {
      const direction = this.isFlagSet(EnemyFuseball.FLAG_SET_LANE_CW) ? 1 : -1;
      this.setLane(this.laneId + direction);
      this.unsetFlag(EnemyFuseball.FLAG_SET_LANE_CW);
      this.unsetFlag(EnemyFuseball.FLAG_SET_LANE_CCW);
    }

    // ── Z movement: ALWAYS target the rim ────────────────────────────────────
    //
    // Normal Fuseblls choose a random zTarget in [MIN_Z, MAX_Z] and only aim
    // for 0 probabilistically after enough lane changes.  We skip all of that
    // and unconditionally choose zTarget = 0.
    //
    // Consequence: after the very first MOVING phase the Fuseball reaches z = 0,
    // FLAG_REACHED_TOP is set, and from then on it spends all its time switching
    // lanes along the rim toward the player (via the SWITCHING_LANE loop in
    // updateState).
    if (
      this.inState(EnemyFuseball.STATE_MOVING_ALONG_LINE) &&
      this.isFlagNotSet(EnemyFuseball.FLAG_MOVING_TARGET_CHOSEN)
    ) {
      this.setFlag(EnemyFuseball.FLAG_MOVING_TARGET_CHOSEN);
      this.zBase = this.zPosition;
      this.zTarget = 0;
    }

    // ── Position updates (identical to parent) ────────────────────────────────
    if (this.inState(EnemyFuseball.STATE_SWITCHING_LANE)) {
      this.zPosition = this.zTarget;
      this.lastLaneSwitchingProgress = this.stateProgressInTime();

      // Reaching z = 0 locks the enemy into the rim-patrol loop.
      if (this.zPosition === 0) {
        this.setFlag(EnemyFuseball.FLAG_REACHED_TOP);
      }
    }

    if (this.inState(EnemyFuseball.STATE_MOVING_ALONG_LINE)) {
      this.zPosition =
        this.zBase + (this.zTarget - this.zBase) * this.stateProgressInTime();
    }
  }
}
