/**
 * PowerUpSpawner.js
 *
 * Decides whether a dying enemy drops a power-up, picks the type,
 * instantiates the PowerUp entity, and adds it to the scene.
 *
 * Drop rates are tuned to feel rewarding but not trivial:
 *   - Normal enemies: ~18 % chance of any drop
 *   - Elite/large enemies: ~40 % chance
 *   - Bosses: guaranteed drop, restricted to weapon power-ups
 *
 * Integration note:
 *   Call PowerUpSpawner.tryDrop(enemy, scene, webGeometry) from your
 *   enemy-death handler. Returns the new PowerUp instance or null.
 *
 * Depends on:
 *   PowerUpType     (@/PowerUp/PowerUpType)
 *   PowerUp         (@/PowerUp/PowerUp)
 *   pickWeightedRandom (re-exported from PowerUpType)
 */

import { PowerUpType, pickWeightedRandom } from '@/PowerUp/PowerUpType';
import { PowerUp } from '@/PowerUp/PowerUp';

// Base drop chance per enemy tier (0–1)
const DROP_CHANCE = {
  normal: 0.18,
  elite:  0.40,
  boss:   1.00,
};

export class PowerUpSpawner {

  /**
   * @param {object} scene       - THREE.Scene — sprite is added here
   * @param {object} webGeometry - Web geometry helper (see PowerUp.js)
   * @param {object} [options]
   * @param {number} [options.dropChanceNormal]  Override normal drop rate
   * @param {number} [options.dropChanceElite]   Override elite drop rate
   */
  constructor (scene, webGeometry, options = {}) {
    this._scene       = scene;
    this._webGeometry = webGeometry;
    this._dropChance  = {
      normal: options.dropChanceNormal ?? DROP_CHANCE.normal,
      elite:  options.dropChanceElite  ?? DROP_CHANCE.elite,
      boss:   DROP_CHANCE.boss,
    };

    // All live PowerUp instances currently in the world
    this._activePowerUps = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Attempt to spawn a drop from a dying enemy.
   *
   * @param {object} enemy          - Dying enemy; must expose:
   *                                    .lane   (number)
   *                                    .depth  (number)
   *                                    .tier   ('normal' | 'elite' | 'boss')
   * @returns {PowerUp|null}
   */
  tryDrop (enemy) {
    const tier   = enemy.tier ?? 'normal';
    const chance = this._dropChance[tier] ?? this._dropChance.normal;

    if (Math.random() > chance) return null;

    // Bosses only drop weapon power-ups (more interesting)
    const filterFn = tier === 'boss'
      ? (t) => t.isWeapon
      : null;

    const type    = pickWeightedRandom(filterFn);
    const powerUp = new PowerUp(type, enemy.lane, enemy.depth, this._webGeometry);

    this._scene.add(powerUp.sprite);
    this._activePowerUps.push(powerUp);

    return powerUp;
  }

  /**
   * Update all live power-ups.  Call every game tick.
   * @param {number} delta  - Seconds since last frame
   */
  update (delta) {
    if (!this._webGeometry) return;
	for (let i = this._activePowerUps.length - 1; i >= 0; i--) {
      const pu = this._activePowerUps[i];
      pu.update(delta);

      if (pu.isCollected || pu.isExpired) {
        pu.dispose(this._scene);
        this._activePowerUps.splice(i, 1);
      }
    }
  }

  /**
   * Check all active power-ups against the player's current lane and rim position.
   * Returns the first collected power-up type, or null.
   *
   * Call from your collision/player-update loop:
   *
   *   const collected = spawner.checkPlayerCollision(player.lane, player.depth);
   *   if (collected) powerUpManager.collect(collected, gameState);
   *
   * @param {number} playerLane   - Player's current lane index
   * @param {number} rimDepth     - Depth threshold at which collection triggers
   *                                (usually 0.5–1.5 units from the rim)
   * @returns {object|null}  PowerUpType value, or null
   */
  checkPlayerCollision (playerLane, rimDepth = 1.2) {
    for (const pu of this._activePowerUps) {
      if (pu.isCollected || pu.isExpired) continue;
      if (pu.lane === playerLane && pu.depth <= rimDepth) {
        pu.collect();
        return pu.type;
      }
    }
    return null;
  }

  /** Remove and dispose all power-ups (call on level reset / player death). */
  clearAll () {
    for (const pu of this._activePowerUps) {
      pu.dispose(this._scene);
    }
    this._activePowerUps = [];
  }

  /** Read-only count of live power-ups (useful for debug HUD). */
  get count () {
    return this._activePowerUps.length;
  }
  
  set webGeometry (value) {
    this._webGeometry = value;
  }
  
  get webGeometry () {
    return this._webGeometry;
  }
}
