/**
 * EnemyBombTanker.js
 *
 * A Tanker variant that does not release enemies when destroyed.
 * Instead it detonates, shorting all lanes within BLAST_RADIUS of its
 * current position for SHORT_DURATION_MS.
 *
 * ── Detonation trigger ───────────────────────────────────────────────────────
 *
 * Detonation fires from createEnemies(), which EnemyTanker calls in two places:
 *
 *   hitByProjectile()   → player shoots it → detonate
 *   updateEntity()      → reaches rim (zPosition <= 0) → detonate
 *
 * EnemyTanker.disappear() (called by removeEnemies() at level end) calls
 * super.die() directly and does NOT call createEnemies() — so the bomb
 * correctly fails to detonate on level cleanup.
 *
 * updateEntity() still runs during STATE_DISAPPEARING, so a guard in
 * createEnemies() prevents a rim-detonation after disappear() has been called.
 *
 * ── Short cleanup ────────────────────────────────────────────────────────────
 *
 * Lane shorts are reversed by setTimeout().  The closure captures a reference
 * to the specific Surface instance.  If the level releases before the timeout
 * fires, a new Surface is created for the next level — the timeout fires on the
 * orphaned old Surface, which is harmless and gets collected afterward.
 * Shorts are deduped (Set) so open-surface edge clamping doesn't double-count.
 *
 * ── Gameplay role ────────────────────────────────────────────────────────────
 *
 * The Bomb Tanker is a trap.  Shooting it early (mid-tube) is dangerous:
 * the short affects lanes close to your current position.  Letting it reach
 * the rim is also dangerous: 5 shorted lanes right where you are.  The player
 * must choose between two bad options — shoot early and dance around the shorts,
 * or hold fire and deal with the detonation at the rim.
 *
 * ── Spawn level ─────────────────────────────────────────────────────────────
 * Introduced at level 45 — after PulsarTanker (41), as a fundamentally
 * different tanker that rewards lane-control awareness over raw reflexes.
 * Chance scales 5%/level, capped at 35%.
 *
 * Tanker variant schedule:
 *   3   EnemyFlipperTanker   releases Flippers
 *   33  EnemyFuseballTanker  releases Fuseblls
 *   35  EnemyPhantomTanker   releases Stealth Flippers
 *   41  EnemyPulsarTanker    releases Pulsars
 *   45  EnemyBombTanker      detonates — no enemies   ← this class
 *
 * Extends: EnemyTanker
 * Flag:    this.isBomb = true
 * Type:    Enemy.TYPE_FLIPPER_TANKER (shares FlipperTanker renderer pool)
 */

import EnemyTanker from '@/Object/Enemies/EnemyTanker';
import Enemy from '@/Object/Enemies/Enemy';

export default class EnemyBombTanker extends EnemyTanker {

  // How many lanes on each side of the impact point are shorted.
  // 2 = own lane + 2 left + 2 right = up to 5 lanes total.
  static BLAST_RADIUS      = 2;

  // How long the shorted lanes stay shorted after detonation (ms).
  static SHORT_DURATION_MS = 3000;

  /**
   * @param {Surface}           surface
   * @param {ProjectileManager} projectileManager
   * @param {Function}          rewardCallback
   * @param {number}            laneId
   * @param {number}            zPosition
   * @param {Game}              game
   */
  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    // Pass null as enemySpawnFunction — EnemyTanker stores it but never calls
    // it directly; only createEnemies() uses it, and we override that entirely.
    super(surface, projectileManager, null, rewardCallback, Enemy.TYPE_FLIPPER_TANKER, laneId, zPosition, game);

    this.isBomb        = true;
    this.valueInPoints = 100;   // Less than normal Tanker — the danger IS the blast
    this.hitPoints     = this.isStrong ? 3 : 2;  // Tougher — gives the player less time
  }

  // ---------------------------------------------------------------------------
  // createEnemies override
  //
  // Called by EnemyTanker from both hitByProjectile() and the rim-reach path
  // in updateEntity().  Override does the detonation instead of releasing enemies.
  // ---------------------------------------------------------------------------
  createEnemies () {
    // Guard: don't detonate during level cleanup (disappear) or after death.
    // updateEntity() keeps running during STATE_DISAPPEARING so the zPosition <= 0
    // rim check could fire; this prevents a spurious detonation in that case.
    if (
      this.inState(EnemyTanker.STATE_DISAPPEARING) ||
      this.inState(EnemyTanker.STATE_DEAD)
    ) {
      return;
    }

    this._detonate();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _detonate () {
    const surface = this.surface;
    if (!surface) return;

    // Collect unique lane IDs within blast radius.
    // getActualLaneIdFromProjectedMovement() clamps on open surfaces — Set
    // deduplication prevents double-shorting a clamped lane.
    const lanesToShort = new Set();
    for (let offset = -EnemyBombTanker.BLAST_RADIUS; offset <= EnemyBombTanker.BLAST_RADIUS; offset++) {
      lanesToShort.add(
        surface.getActualLaneIdFromProjectedMovement(this.laneId + offset)
      );
    }

    // Short immediately
    lanesToShort.forEach(lane => surface.shortLane(lane));

    // Schedule cleanup.  Closure captures the specific Surface instance —
    // if the level releases before this fires, the old Surface is an orphan
    // and the unshort calls are harmless.
    const lanes = lanesToShort;  // Snapshot for closure
    setTimeout(() => {
      lanes.forEach(lane => surface.unshortLane(lane));
    }, EnemyBombTanker.SHORT_DURATION_MS);
  }
}
