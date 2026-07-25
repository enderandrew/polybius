/**
 * EnemyPhantomTanker.js
 *
 * A Flipper Tanker variant that releases EnemyStealthFlipper enemies instead
 * of normal EnemyFlippers when destroyed or when it reaches the rim.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * EnemyFlipperTanker.createEnemies() calls this.enemySpawnFunction() to create
 * the enemies it releases. It is completely agnostic about what type of enemy
 * the function returns — it only needs the returned object to have the flipper
 * state/flag API (STATE_ROTATING_BEGIN, FLAG_ROTATION_DIR_CHOSEN, etc.).
 *
 * Since EnemyStealthFlipper extends EnemyFlipper extends the same base, the
 * full Flipper API is available. Passing spawnStealthFlipper.bind(spawner) as
 * the spawn function is the only change needed — no createEnemies() override.
 *
 * ── Visual identity ─────────────────────────────────────────────────────────
 *
 * The isPhantom flag triggers a purple-grey tint and 55% opacity in
 * EnemyRenderer.setObjectRef(), making the tanker visibly abnormal without
 * being unshootable. The horror comes from what pops out, not from hiding
 * the tanker itself.
 *
 * Opacity is 0.55 (not the Spiker's 0.28) because the Tanker is a larger,
 * slower target that the player needs to be able to see and aim at —
 * the surprise is the invisible enemies it RELEASES, not the tanker itself.
 *
 * ── Spawn level ─────────────────────────────────────────────────────────────
 * Introduced at level 35 — between Fuseball Tanker (33) and Pulsar Tanker (41).
 * Chance scales 5%/level, capped at 40%.
 *
 * Tanker variant schedule:
 *   3   EnemyFlipperTanker    releases normal Flippers
 *   33  EnemyFuseballTanker   releases Fuseblls
 *   35  EnemyPhantomTanker    releases Stealth Flippers   ← this class
 *   41  EnemyPulsarTanker     releases Pulsars
 *
 * Extends:    EnemyFlipperTanker
 * Flag:       this.isPhantom = true
 * Type:       Enemy.TYPE_FLIPPER_TANKER (shares renderer pool with FlipperTanker)
 */

import EnemyFlipperTanker from '@/Object/Enemies/EnemyFlipperTanker';

export default class EnemyPhantomTanker extends EnemyFlipperTanker {

  /**
   * @param {Surface}           surface
   * @param {ProjectileManager} projectileManager
   * @param {Function}          spawnStealthFlipper  — bound to EnemySpawner
   * @param {Function}          rewardCallback
   * @param {number}            laneId
   * @param {number}            zPosition
   * @param {Game}              game
   */
  constructor (surface, projectileManager, spawnStealthFlipper, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, spawnStealthFlipper, rewardCallback, laneId, zPosition, game);

    this.isPhantom     = true;
    this.valueInPoints = 150;   // Same as normal Flipper Tanker — the extra danger
                                // comes from the Stealth Flippers, not extra points
  }

  // No createEnemies() override needed.
  // EnemyFlipperTanker.createEnemies() calls this.enemySpawnFunction() which
  // is the spawnStealthFlipper function passed in — Stealth Flippers emerge
  // automatically through the existing Tanker release logic.
}
