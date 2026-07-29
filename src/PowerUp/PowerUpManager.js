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
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export class PowerUpManager {
  /** Enemy delta multiplier while TIME_DILATION is active. */
  static TIME_DILATION_SCALE = 0.45;

  /**
   * Power-ups that compete for the PRIMARY weapon slot. Order here is
   * irrelevant — the winner is whichever was collected last.
   *
   * MISSILE is deliberately absent: Shooter.fire() already treats it as a
   * secondary that fires alongside the primary, so it stacks by design and
   * must not be made to compete.
   */
  static PRIMARY_WEAPON_IDS = ['GRENADE', 'LASER'];

  constructor() {
    // Map of PowerUpType.id → { type, remaining: DOMHighResTimeStamp | null }
    this._active = new Map();
    // Monotonic counter so we can tell which weapon was picked up most
    // recently — see getPrimaryWeaponType().
    this._collectSeq = 0;
    this.warpTokenCount = 0;
    this.bonusStageEarned = false;
    this.shieldActive = false;
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
  collect(powerUpType, gameState) {
    const type = powerUpType;

    // --- Instant effects ---
    if (type.scoreBonus) {
      gameState.score += type.scoreBonus;
      if (gameState.bonusScoreOffset !== undefined) {
        gameState.bonusScoreOffset += type.scoreBonus;
      }
      this._emit('powerup:score', {
        amount: type.scoreBonus,
        label: type.label,
      });
    }

    if (type.refillsTimers) {
      let refilled = false;
      for (const [, entry] of this._active) {
        if (entry.type.duration) {
          // Reset the timer back to maximum! The HUD will automatically snap back to 100%.
          entry.remaining = entry.type.duration / 1000;
          refilled = true;
        }
      }

      // Grant a small score bonus, and trigger the HUD flash text!
      const score = refilled ? 1000 : 250;
      gameState.score += score;
      if (gameState.bonusScoreOffset !== undefined)
        gameState.bonusScoreOffset += score;

      const label = refilled ? 'TIMERS MAXED' : 'TIMER (EMPTY)';
      this._emit('powerup:score', { amount: score, label: label });
    }

    if (type.isShield) {
      if (!this.shieldActive) {
        this.shieldActive = true;
        this._emit('powerup:score', { amount: 250, label: 'SHIELD UP' });
      } else {
        // If they pick up a second shield while already shielded!
        gameState.score += 1000;
        if (gameState.bonusScoreOffset !== undefined)
          gameState.bonusScoreOffset += 1000;
        this._emit('powerup:score', { amount: 1000, label: 'SHIELD (MAX)' });
      }
    }

    if (type.isWarpToken) {
      this.warpTokenCount++;
      this._emit('warptoken:collected', { count: this.warpTokenCount });
      if (this.warpTokenCount >= 3) {
        this.warpTokenCount = 0;
        this.bonusStageEarned = true;
        this._emit('warptoken:ready', {});
      }
    }

    if (type.grantsLife) {
      gameState.lives += 1;
      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_1UP,
      );
      this._emit('powerup:extralife', {});
    }

    if (type.warpsToNext) {
      this._emit('powerup:warp', {});
      // Small delay so the score flash renders before transition
      setTimeout(() => gameState.requestWarp(), 400);
    }

    // --- Timed weapon effects ---
    if (type.duration) {
      const remaining = type.duration / 1000;
      this._active.set(type.id, {
        type,
        remaining,
        seq: ++this._collectSeq,
      });
      this._emit('powerup:collected', { type, remaining });
    }
  }

  /**
   * Call once per game tick.
   * @param {number} delta  - Seconds since last frame (not used directly;
   *                          expiry uses wall-clock via performance.now())
   */
  update(delta) {
    for (const [id, entry] of this._active) {
      if (entry.remaining !== null && entry.remaining !== undefined) {
        // Subtract elapsed frame time
        entry.remaining -= delta;

        if (entry.remaining <= 0) {
          this._active.delete(id);
          this._emit('powerup:expired', { type: entry.type });
        }
      }
    }
  }

  /** Remove all active effects (call on player death or level reset). */
  reset() {
    this._active.clear();
    this.shieldActive = false;
  }

  // ---------------------------------------------------------------------------
  // Query methods — polled by Player / Weapon systems each frame
  // ---------------------------------------------------------------------------

  isActive(powerUpTypeId) {
    return this._active.has(powerUpTypeId);
  }

  /** Seconds remaining for a timed power-up, or 0 if not active. */
  remainingSeconds(powerUpTypeId) {
    const entry = this._active.get(powerUpTypeId);
    if (!entry || entry.remaining === null || entry.remaining === undefined)
      return 0;
    return Math.max(0, entry.remaining);
  }

  // ---------------------------------------------------------------------------
  // Convenience booleans for weapon/fire systems
  // ---------------------------------------------------------------------------

  get hasGrenade() {
    return this.isActive(PowerUpType.GRENADE.id);
  }

  get hasLaser() {
    return this.isActive(PowerUpType.LASER.id);
  }

  get hasMissile() {
    return this.isActive(PowerUpType.MISSILE.id);
  }

  get hasParticleBlaster() {
    return this.isActive(PowerUpType.PARTICLE_BLASTER.id);
  }

  get hasRapidFire() {
    return this.isActive(PowerUpType.RAPID_FIRE.id);
  }

  get hasSpreadGun() {
    return this.isActive(PowerUpType.SPREAD_GUN.id);
  }

  get hasSynthSurge() {
    return this.isActive(PowerUpType.SYNTH_SURGE.id);
  }

  // ---------------------------------------------------------------------------
  // Weapon parameter overrides
  // Call these from your fire / bullet systems instead of using raw constants.
  // ---------------------------------------------------------------------------

  /**
   * Returns the shot cooldown in ms, modified by active power-ups.
   * @param {number} baseCooldown  - The default cooldown without power-ups (ms)
   */
  /**
   * The primary weapon actually being fired.
   *
   * A single projectile can only BE one thing, so GRENADE and LASER compete.
   * Resolving that by fixed priority (grenade always beating laser) meant
   * collecting a Laser while a Grenade was still running did nothing at all —
   * it sat in _active, showed on the HUD, and never fired a shot. Resolving by
   * most-recently-collected instead means every pickup takes effect
   * immediately, nothing is ever removed, and if the newer one expires while
   * the older is still running the older transparently takes back over.
   *
   * PARTICLE_BLASTER, RAPID_FIRE, SPREAD_GUN and SYNTH_SURGE are all absent
   * from this contest by design — they modify whatever is equipped.
   *
   * @return {'GRENADE'|'LASER'|'NORMAL'}
   */
  getPrimaryWeaponType() {
    let winner = null;
    let winningSeq = -1;

    for (const id of PowerUpManager.PRIMARY_WEAPON_IDS) {
      const entry = this._active.get(id);
      if (entry && entry.seq > winningSeq) {
        winningSeq = entry.seq;
        winner = id;
      }
    }

    return winner ?? 'NORMAL';
  }

  /**
   * Weapon to use when a caller fires without naming one explicitly — the
   * beat-synced Synth Surge volley and the AI Droid. Shooter.fire() does NOT
   * use this; it passes the primary explicitly and fires missiles separately.
   *
   * @return {'GRENADE'|'LASER'|'MISSILE'|'NORMAL'}
   */
  getActiveWeaponType() {
    const primary = this.getPrimaryWeaponType();
    if (primary !== 'NORMAL') return primary;
    return this.hasMissile ? 'MISSILE' : 'NORMAL';
  }

  getShotCooldown(baseMs) {
    let cooldown = baseMs;

    switch (this.getPrimaryWeaponType()) {
      case 'LASER':
        cooldown = 1000.0;
        break;
      case 'GRENADE':
        cooldown = 500.0;
        break;
      default:
        break;
    }

    // Applied as a multiplier rather than an alternative. Previously this was
    // an early return AFTER the laser/grenade checks, so Rapid Fire was
    // completely inert whenever either was active.
    if (this.hasRapidFire) {
      cooldown *= 0.35;
    }

    return cooldown;
  }

  /**
   * Returns the bullet damage multiplier.
   * @param {number} [baseDamage=1]
   */
  getBulletDamage(baseDamage = 1) {
    let damage = baseDamage;

    // Multiplied rather than exclusive, so Particle Blaster genuinely buffs
    // the equipped weapon instead of replacing its bonus.
    if (this.hasParticleBlaster) {
      damage *= 2.5;
    }

    // Only when the Laser is the weapon actually firing.
    if (this.getPrimaryWeaponType() === 'LASER') {
      damage *= 2.0;
    }

    return damage;
  }

  /**
   * Returns the spike-clearing speed multiplier.
   * PARTICLE_BLASTER makes the Superzapper-style spike digger much faster.
   */
  getSpikeDigMultiplier() {
    return this.hasParticleBlaster ? 3.0 : 1.0;
  }

  /**
   * Returns an array of angle offsets (radians) for the shot spread.
   * Single shot → [0]. Spread gun → [-0.25, 0, 0.25].
   */
  getShotAngles() {
    if (this.hasSpreadGun) {
      return [-0.3, -0.15, 0, 0.15, 0.3]; // 5-way spread à la Contra
    }
    return [0];
  }

  /**
   * Returns the visual length multiplier for the bullet/laser beam.
   */
  getBulletLengthMultiplier() {
    // Only stretch when the Laser is what is actually being fired.
    if (this.getPrimaryWeaponType() === 'LASER') return 175.0;
    if (this.hasParticleBlaster) return 1.5;
    return 1.0;
  }

  getBulletColor(defaultColor) {
    // Colour follows the weapon that fires, so the player can see which of
    // several stacked weapons is currently live.
    switch (this.getActiveWeaponType()) {
      case 'LASER':
        return 0x00ff00; // Bright Green Railgun
      case 'MISSILE':
        return 0xff3333;
      case 'GRENADE':
        return 0xff6600;
      default:
        break;
    }

    if (this.hasParticleBlaster) return 0xff8c00;
    return defaultColor;
  }

  get hasAIDroid() {
    return this.isActive(PowerUpType.AI_DROID.id);
  }

  get hasPhaseDash() {
    return this.isActive(PowerUpType.PHASE_DASH.id);
  }

  get hasFirewall() {
    return this.isActive(PowerUpType.FIREWALL.id);
  }

  get hasTimeDilation() {
    return this.isActive(PowerUpType.TIME_DILATION.id);
  }

  /**
   * Multiplier applied to the delta driving enemies, spikes and enemy
   * projectiles. The player, player projectiles and all input stay at 1.0.
   *
   * IMPORTANT: this only scales delta-driven motion. Enemy state machines
   * (Flipper rotation, Pulsar pulse timing) run on Date.now() via
   * SurfaceObject.stateProgressInTime(), so those are NOT slowed. Enemy fire
   * rate is compensated separately in ShootingSurfaceObject.fire(). Making
   * state timing scale too would require replacing the wall clock with a
   * scalable game clock across SurfaceObject.
   *
   * @return {number}
   */
  getEnemyTimeScale() {
    return this.hasTimeDilation ? PowerUpManager.TIME_DILATION_SCALE : 1;
  }

  get hasPhantom() {
    return this.isActive(PowerUpType.PHANTOM.id);
  }

  get hasShield() {
    return this.shieldActive;
  }

  consumeShield() {
    this.shieldActive = false;
    this._emit('powerup:score', { amount: 0, label: 'SHIELD BROKEN' });
  }

  get hasBonusStageEarned() {
    return this.bonusStageEarned;
  }

  resetBonusStageEarned() {
    this.bonusStageEarned = false;
  }

  consumeWarpTokens() {
    this.warpTokenCount = 0;
    this.bonusStageEarned = false;
    this._emit('warptoken:collected', { count: 0 }); // Tells the HUD to dim the gold tokens
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _emit(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
