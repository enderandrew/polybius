/**
 * EnemyHydraSpiker.js
 *
 * A Spiker variant that spawns two regular Spikers in adjacent lanes when
 * killed. Children inherit the Hydra's current zPosition, so killing one
 * deep in the tube is relatively safe — but killing it near the rim spawns
 * two Spikers almost on top of the player.
 *
 * This creates a genuine decision: shoot early and get two fast-advancing
 * children, or wait until you have a clean sweep but risk the Hydra reaching
 * the rim while you clear other lanes.
 *
 * ── Death path safety ───────────────────────────────────────────────────────
 *
 * EnemySpiker.disappear() (called by removeEnemies() at level end) calls
 * super.die() = Enemy.die() directly — it bypasses EnemyHydraSpiker.die()
 * entirely, so children are NOT spawned on level cleanup. The _hasSplit guard
 * covers the rare case where die() is invoked more than once mid-combat.
 *
 * ── Spawn children safely ───────────────────────────────────────────────────
 *
 * Children are spawned via game.levelObject.enemySpawner.spawnSpiker() rather
 * than directly via new EnemySpiker(), so they go through the normal spawn
 * path (including mutant/phantom rolls if the level is high enough), benefit
 * from existing SurfaceObjectsManager guards (no duplicate spike per lane),
 * and are registered with the renderer manager automatically.
 *
 * Introduced at level 28 — fills the gap between Supernova Fuseball (27) and
 * Void Fuseball (32). Probability scales 6%/level, capped at 35%.
 *
 * Level curve for Spikers:
 *   4   EnemySpiker
 *   20  EnemyPhantomSpiker   (invisible spike)
 *   28  EnemyHydraSpiker     (splits on death)  ← this class
 *
 * Extends: EnemySpiker
 * Flag:    this.isHydra = true
 */

import EnemySpiker from '@/Object/Enemies/EnemySpiker';

export default class EnemyHydraSpiker extends EnemySpiker {

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isHydra       = true;
    this.valueInPoints = 250;   // Worth more than standard Spiker (150)
    this.hitPoints     = this.isStrong ? 3 : 2;  // Tougher — gives time to react

    this._hasSplit = false;
  }

  // ---------------------------------------------------------------------------
  // die() override
  //
  // Spawn children before delegating to the normal Spiker death path.
  // The children are spawned at this enemy's current zPosition so
  // proximity-to-rim matters: early kills = safer children, late kills = panic.
  // ---------------------------------------------------------------------------
  die () {
    // EnemySpiker.die() guards STATE_DEAD already; guard EXPLODING too so
    // that if die() is somehow invoked twice we don't re-enter the split logic.
    if (
      this.inState(EnemySpiker.STATE_DEAD) ||
      this.inState(EnemySpiker.STATE_EXPLODING)
    ) {
      super.die();
      return;
    }

    if (!this._hasSplit) {
      this._hasSplit = true;
      this._spawnChildren();
    }

    // Normal Spiker death: setState(EXPLODING) + process reward
    super.die();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _spawnChildren () {
    if (!this.game?.levelObject) return;
  
    const mgr       = this.game.levelObject.surfaceObjectsManager;
    const spawner   = this.game.levelObject.enemySpawner;
    const leftLane  = this.surface.getActualLaneIdFromProjectedMovement(this.laneId - 1);
    const rightLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId + 1);
    const zPos      = this.zPosition;   // Capture now — 'this' may be garbage collected before the queue drains
  
    if (leftLane !== this.laneId) {
      mgr.queueSpawn(() => spawner.spawnSpiker(leftLane, zPos));
    }
    if (rightLane !== this.laneId && rightLane !== leftLane) {
      mgr.queueSpawn(() => spawner.spawnSpiker(rightLane, zPos));
    }
  }
}
