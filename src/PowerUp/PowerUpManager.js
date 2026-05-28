/**
 * PowerUpManager.js
 *
 * Central authority for all power-up game-logic.
 *
 * Responsibilities:
 *   - Track which timed weapon power-ups are currently active
 *   - Apply instant effects (score, warp, extra life)
 *   - Expose query methods the Player/Weapon systems poll each frame
 *   - Emit events so the HUD can react
 *
 * Integration note:
 *   Instantiate once and share via your game's service locator / event bus.
 *   Call update(delta) every tick.
 *   Call collect(powerUpType) when collision is confirmed.
 *
 *   The manager fires custom DOM events on `window` so other systems
 *   can react without tight coupling:
 *
 *     'powerup:collected'  → { detail: { type, remaining } }
 *     'powerup:expired'    → { detail: { type } }
 *     'powerup:score'      → { detail: { amount, label } }
 *     'powerup:extralife'  → (no detail)
 *     'powerup:warp'       → (no detail)
 */

import { PowerUpType } from '@/PowerUp/PowerUpType';

export class PowerUpManager {

  constructor () {
    // Map of PowerUpType.id → { type, expiresAt: DOMHighResTimeStamp | null }
    this._active = new Map();
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Call this when the player sprite overlaps a PowerUp collectible.
   * @param {object} powerUpType  - One of the PowerUpType enum values
   * @param {object} gameState    - Your game state object; must expose:
   *                                  .score (read/write number)
   *                                  .lives (read/write number)
   *                                  .requestWarp() (function)
   */
  collect (powerUpType, gameState) {
    const type = powerUpType;

    // --- Instant effects ---
    if (type.scoreBonus) {
      gameState.score += type.scoreBonus;
      this._emit('powerup:score', { amount: type.scoreBonus, label: type.label });
    }

    if (type.grantsLife) {
      gameState.lives += 1;
      this._emit('powerup:extralife', {});
    }

    if (type.warpsToNext) {
      this._emit('powerup:warp', {});
      // Small delay so the score flash renders before transition
      setTimeout(() => gameState.requestWarp(), 400);
    }

    // --- Timed weapon effects ---
    if (type.isWeapon && type.duration) {
      const expiresAt = performance.now() + type.duration;

      // Replace any existing instance of the same weapon power-up (resets timer)
      this._active.set(type.id, { type, expiresAt });

      this._emit('powerup:collected', {
        type,
        remaining: type.duration / 1000,
      });
    }
  }

  /**
   * Call once per game tick.
   * @param {number} delta  - Seconds since last frame (not used directly;
   *                          expiry uses wall-clock via performance.now())
   */
  update (_delta) {
    const now = performance.now();
    for (const [id, entry] of this._active) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this._active.delete(id);
        this._emit('powerup:expired', { type: entry.type });
      }
    }
  }

  /** Remove all active effects (call on player death or level reset). */
  reset () {
    this._active.clear();
  }

  // ---------------------------------------------------------------------------
  // Query methods — polled by Player / Weapon systems each frame
  // ---------------------------------------------------------------------------

  isActive (powerUpTypeId) {
    return this._active.has(powerUpTypeId);
  }

  /** Seconds remaining for a timed power-up, or 0 if not active. */
  remainingSeconds (powerUpTypeId) {
    const entry = this._active.get(powerUpTypeId);
    if (!entry || entry.expiresAt === null) return 0;
    return Math.max(0, (entry.expiresAt - performance.now()) / 1000);
  }

  // ---------------------------------------------------------------------------
  // Convenience booleans for weapon/fire systems
  // ---------------------------------------------------------------------------

  /** True while PARTICLE_LASER is active. */
  get hasParticleLaser () {
    return this.isActive(PowerUpType.PARTICLE_LASER.id);
  }

  /** True while RAPID_FIRE is active. */
  get hasRapidFire () {
    return this.isActive(PowerUpType.RAPID_FIRE.id);
  }

  /** True while SPREAD_GUN is active. */
  get hasSpreadGun () {
    return this.isActive(PowerUpType.SPREAD_GUN.id);
  }

  /** True while LASER is active. */
  get hasLaser () {
    return this.isActive(PowerUpType.LASER.id);
  }

  // ---------------------------------------------------------------------------
  // Weapon parameter overrides
  // Call these from your fire / bullet systems instead of using raw constants.
  // ---------------------------------------------------------------------------

  /**
   * Returns the shot cooldown in ms, modified by active power-ups.
   * @param {number} baseCooldown  - The default cooldown without power-ups (ms)
   */
  getShotCooldown (baseCooldown) {
    if (this.hasLaser)     return baseCooldown * 3.5;   // Laser: much slower
    if (this.hasRapidFire) return baseCooldown * 0.35;  // Rapid Fire: ~3× faster
    return baseCooldown;
  }

  /**
   * Returns the bullet damage multiplier.
   * @param {number} [baseDamage=1]
   */
  getBulletDamage (baseDamage = 1) {
    if (this.hasParticleLaser) return baseDamage * 2.5;
    if (this.hasLaser)         return baseDamage * 2.0;
    return baseDamage;
  }

  /**
   * Returns the spike-clearing speed multiplier.
   * PARTICLE_LASER makes the Superzapper-style spike digger much faster.
   */
  getSpikeDigMultiplier () {
    return this.hasParticleLaser ? 3.0 : 1.0;
  }

  /**
   * Returns an array of angle offsets (radians) for the shot spread.
   * Single shot → [0]. Spread gun → [-0.25, 0, 0.25].
   */
  getShotAngles () {
    if (this.hasSpreadGun) {
      return [-0.30, -0.15, 0, 0.15, 0.30];   // 5-way spread à la Contra
    }
    return [0];
  }

  /**
   * Returns the visual length multiplier for the bullet/laser beam.
   */
  getBulletLengthMultiplier () {
    return this.hasLaser ? 3.5 : 1.0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _emit (eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
