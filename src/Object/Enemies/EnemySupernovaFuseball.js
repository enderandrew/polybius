/**
 * EnemySupernovaFuseball.js
 *
 * A Fuseball variant that explodes into two regular Fuseblls when destroyed.
 * The player must decide whether to shoot it mid-tube (spawning two enemies
 * that are already partially advanced) or to let it reach the rim and deal
 * with it there.
 *
 * Movement behaviour is identical to EnemyFuseball — it wanders the tube
 * randomly and gradually works toward the rim. The only gameplay difference
 * is the death mechanic.
 *
 * Rendering: Larger scale (1.25×) with three independently spinning orbital
 * rings on different axes, pulsing to suggest unstable energy. Set via the
 * isSupernova flag read by EnemyFuseballRenderer.
 *
 * Introduced at level 27 — appears alongside Gravity Fuseblls in the gap
 * between Pulsar (17) and Fuseball Tanker (33).
 *
 * Level summary after both variants:
 *   11  Fuseball
 *   21  Gravity Fuseball   (relentless pursuer)
 *   27  Supernova Fuseball (punishes careless shots)
 *   33  Fuseball Tanker
 *
 * Extends: EnemyFuseball
 * Flag:    this.isSupernova = true
 */

import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';

export default class EnemySupernovaFuseball extends EnemyFuseball {

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isSupernova   = true;
    this.valueInPoints = 400;    // Worth more — killing it is risky
    this.hitPoints     = this.isStrong ? 3 : 2;  // Survives one extra hit before splitting

    // Guard against double-split (die() can be called more than once
    // via the exploding → dead state machine path).
    this._hasSplit = false;
  }

  // ---------------------------------------------------------------------------
  // On death: spawn two regular Fuseblls in adjacent lanes.
  //
  // The children start at this enemy's current zPosition, so killing a
  // Supernova deep in the tube spawns two Fuseblls that are already
  // well advanced — dangerous if the player wasn't ready for it.
  // Killing it at the rim spawns two Fuseblls that immediately begin
  // rim-level behaviour.
  //
  // Children are plain EnemyFuseball instances so the split does not chain.
  // EnemyFuseball is already imported (via extends) — no circular dependency.
  // ---------------------------------------------------------------------------
  die () {
    // Guard: EnemyFuseball.die() → STATE_EXPLODING → updateState() → STATE_DEAD
    // calls die() again on transition.  Only split on the first call.
    if (this._hasSplit || this.inState(EnemyFuseball.STATE_DEAD)) {
      super.die();
      return;
    }

    this._hasSplit = true;

    if (this.game?.levelObject) {
      const mgr = this.game.levelObject.surfaceObjectsManager;
      const pm  = this.game.levelObject.projectileManager;

      // Adjacent lanes, wrapping around the tube correctly.
      const leftLane  = this.surface.getActualLaneIdFromProjectedMovement(this.laneId - 1);
      const rightLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId + 1);

      [leftLane, rightLane].forEach(lane => {
        mgr.addEnemy(new EnemyFuseball(
          this.surface,
          pm,
          this.rewardCallback,
          lane,
          this.zPosition,
          this.game
        ));
      });
    }

    super.die();
  }
}