/**
 * EnemyMirror.js
 *
 * Crawls up the tube and stops near the rim. Normal player shots are reflected
 * back as enemy projectiles. During the brief STATE_REFLECTING window after
 * each reflection, the Mirror is vulnerable — shoot it then to destroy it.
 *
 * ── Core mechanic ────────────────────────────────────────────────────────────
 *
 *   1. Mirror approaches the rim and parks at STOPPING_HEIGHT (z = 0.30).
 *   2. Player shoots it → reflected SOURCE_ENEMY projectile launches from
 *      Mirror's lane heading back toward the player.
 *   3. Mirror enters STATE_REFLECTING (400ms) — now hittable.
 *   4. Player dodges the reflected shot, then shoots Mirror during the 400ms
 *      window to destroy it.
 *   5. If no shot lands during the window, Mirror returns to STATE_IDLE.
 *
 * ── Why STATE_REFLECTING, not hitPoints ──────────────────────────────────────
 *
 * The normal hitPoints / hitByProjectile damage model can't express
 * "immune outside a timed window." hitByProjectile() is overridden entirely:
 * outside STATE_REFLECTING it triggers the reflect; inside STATE_REFLECTING
 * it triggers death. hitPoints is not used.
 *
 * ── Reflected projectile ─────────────────────────────────────────────────────
 *
 * The reflected shot is a standard SOURCE_ENEMY projectile spawned at the
 * Mirror's current zPosition. It follows the normal enemy projectile path —
 * detected by ProjectileManager against the player's lane. Player shots can
 * also destroy the reflected projectile (buying more time to hit the Mirror).
 *
 * ── Spawn level ──────────────────────────────────────────────────────────────
 * Introduced at level 56 per the planned schedule.
 *
 * Extends: Enemy
 * Type:    Enemy.TYPE_MIRROR ('mirror')
 * Flag:    isMirror = true
 */

import Enemy from '@/Object/Enemies/Enemy';
import SurfaceObject from '@/Object/Surface/SurfaceObject';
import State from '@/Object/State';
import randomRange from '@/utils/randomRange';
import Projectile from '@/Object/Projectiles/Projectile';

export default class EnemyMirror extends Enemy {

  // ── Timing constants ──────────────────────────────────────────────────────

  /** z-depth at which the Mirror stops and parks (0 = rim, 1 = back of tube). */
  static STOPPING_HEIGHT = 0.30;

  /** Duration the Mirror remains vulnerable after reflecting a shot (ms). */
  static REFLECTING_DURATION_MS = 400;

  // ── States ────────────────────────────────────────────────────────────────

  // STATE_IDLE serves double duty: approaching (before FLAG_REACHED_RIM) and
  // parked (after). Duration 0 means canChangeState() is always true, but
  // updateState() doesn't auto-transition out of IDLE — it's event-driven.
  static STATE_IDLE         = new State(0,                          1, 'idle');
  static STATE_REFLECTING   = new State(EnemyMirror.REFLECTING_DURATION_MS, 1, 'reflecting');
  static STATE_DISAPPEARING = new State(1000,                       1, 'disappearing');
  static STATE_EXPLODING    = new State(1000,                       1, 'exploding');
  static STATE_DEAD         = new State(0,                          1, 'dead');

  // ── Flags ─────────────────────────────────────────────────────────────────

  static FLAG_REACHED_RIM = 0x1;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, SurfaceObject.TYPE_MIRROR, game);

    this.isMirror      = true;
    this.valueInPoints = 250;

    // Mirror doesn't use the standard hitPoints system — vulnerability is
    // entirely state-gated. Explicitly zero out the shield to avoid the
    // icosahedron shield mesh being shown on the hex model.
    this.isStrong  = false;
    this.hitPoints = 99;   // Never decremented via normal path
    this.hasShield = false;

    // Mirror never fires on its own — only reflects via hitByProjectile().
    this.canShoot = false;

    this.zSpeed = -randomRange(3, 5) * 0.001;   // Slow, deliberate approach

    this.setState(EnemyMirror.STATE_IDLE);
  }

  // ── State machine ─────────────────────────────────────────────────────────

  updateState () {
    if (this.inState(EnemyMirror.STATE_REFLECTING)) {
      // Vulnerability window expired — return to immune IDLE
      this.setState(EnemyMirror.STATE_IDLE);

    } else if (this.inState(EnemyMirror.STATE_EXPLODING)) {
      this.setState(EnemyMirror.STATE_DEAD);

    } else if (this.inState(EnemyMirror.STATE_DISAPPEARING)) {
      this.setState(EnemyMirror.STATE_DEAD);
    }
    // STATE_IDLE: no automatic transition (event-driven only)
  }

  updateEntity () {
    if (this.inState(EnemyMirror.STATE_DEAD)) {
      this.alive = false;
      return;
    }

    // Advance toward rim until STOPPING_HEIGHT is reached
    if (
      this.isFlagNotSet(EnemyMirror.FLAG_REACHED_RIM) &&
      !this.inState(EnemyMirror.STATE_EXPLODING)
    ) {
      this.zPosition += this.zSpeed;

      if (this.zPosition <= EnemyMirror.STOPPING_HEIGHT) {
        this.zPosition = EnemyMirror.STOPPING_HEIGHT;
        this.setFlag(EnemyMirror.FLAG_REACHED_RIM);
        // Stays in STATE_IDLE — now parked
      }
    }
  }

  // ── Collision override ────────────────────────────────────────────────────

  /**
   * Core mechanic.  Standard hitPoints path is bypassed entirely.
   *
   *   Outside STATE_REFLECTING → reflect the shot back, enter vulnerable window.
   *   Inside  STATE_REFLECTING → take the hit and die.
   */
  hitByProjectile (damage = 1) {  // eslint-disable-line no-unused-vars
    if (
      this.inState(EnemyMirror.STATE_EXPLODING) ||
      this.inState(EnemyMirror.STATE_DEAD)       ||
      this.inState(EnemyMirror.STATE_DISAPPEARING)
    ) {
      return;
    }

    if (this.inState(EnemyMirror.STATE_REFLECTING)) {
      // Shot landed during the vulnerability window — Mirror dies.
      this.reward = true;
      this.die();
      return;
    }

    // Any other state (IDLE while approaching or parked): reflect.
    this._reflectShot();
    this.setState(EnemyMirror.STATE_REFLECTING);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  die () {
    if (
      this.inState(EnemyMirror.STATE_DEAD) ||
      this.inState(EnemyMirror.STATE_EXPLODING)
    ) return;

    this.setState(EnemyMirror.STATE_EXPLODING);
    super.die();   // Enemy.die() — reward, power-up drop
  }

  disappear () {
    if (
      this.inState(EnemyMirror.STATE_EXPLODING) ||
      this.inState(EnemyMirror.STATE_DEAD)
    ) return;

    this.setState(EnemyMirror.STATE_DISAPPEARING);
    super.die();   // Enemy.die() with reward = false → no reward, no drop
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Fire a SOURCE_ENEMY projectile from the Mirror's current lane and z,
   * heading toward the player (decreasing z).
   *
   * The reflected projectile obeys all standard rules:
   *   • Tracked in ProjectileManager.enemyProjectiles
   *   • Detected against the player's lane each tick
   *   • Can be shot down by the player (buying reaction time)
   */
  _reflectShot () {
      this.projectileManager.fire(
          this.laneId,
          Projectile.SOURCE_ENEMY,
          this.zPosition
      );
  }
}
