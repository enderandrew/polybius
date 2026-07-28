/**
 * Firewall.js
 *
 * Drives the FIREWALL power-up: while active, the two lanes flanking the
 * player burn. Enemies that come within FIREWALL_KILL_DEPTH of the rim in a
 * burning lane are destroyed and score normally.
 *
 * ── Why the flanks and not the player's own lane ─────────────────────────────
 *
 * Burning the lane the player already shoots down would trivialise the head-on
 * threat. Burning the neighbours instead protects against the sideways
 * approach — Flippers rotating in, Fuseballs crawling the rim — while leaving
 * the player's own lane to be handled with the gun. It also gives lane-lock a
 * clear use (plant yourself with both flanks covered) and gives dash a cost
 * (dashing relocates your protection).
 *
 * ── Why a depth limit ────────────────────────────────────────────────────────
 *
 * Without one this would clear two entire lanes from the back of the tube
 * regardless of distance, which is close to a permanent double Superzapper.
 * Limiting kills to the rim-adjacent band makes it a close-range defensive
 * tool rather than area denial.
 *
 * ── Ownership ────────────────────────────────────────────────────────────────
 *
 * Ignites are counter-based on Surface (igniteLane/extinguishLane), so this
 * class must extinguish exactly what it lit. `_litLanes` is the record of
 * that; clear() releases them and is called from Level.release().
 */

import { PowerUpType } from '@/PowerUp/PowerUpType';

export default class Firewall {
  /** Enemies closer to the rim than this (0 = rim, 1 = back) burn. */
  static KILL_DEPTH = 0.35;

  /** Lane offsets from the player that ignite. */
  static LANE_OFFSETS = [-1, 1];

  constructor(surface, surfaceObjectsManager) {
    this.surface = surface;
    this.surfaceObjectsManager = surfaceObjectsManager;

    /** @var {Set<number>} lanes this controller currently has lit */
    this._litLanes = new Set();
  }

  /**
   * @param {?PowerUpManager} powerUps
   * @param {Shooter} shooter
   */
  update(powerUps, shooter) {
    const active = !!powerUps?.hasFirewall && shooter !== undefined;

    if (!active) {
      this.clear();
      return;
    }

    this._syncLanes(shooter.laneId);
    this._burnEnemies();
  }

  /**
   * Move the burning band to follow the player, igniting/extinguishing only
   * the difference so the Surface counters stay balanced.
   *
   * @param {number} playerLaneId
   */
  _syncLanes(playerLaneId) {
    const desired = new Set();

    for (const offset of Firewall.LANE_OFFSETS) {
      const laneId = this.surface.getTargetLaneId(playerLaneId, offset);
      // getTargetLaneId returns null past the edge of an open surface, which
      // simply means that flank has no lane to burn.
      if (laneId !== null) {
        desired.add(laneId);
      }
    }

    for (const laneId of this._litLanes) {
      if (!desired.has(laneId)) {
        this.surface.extinguishLane(laneId);
        this._litLanes.delete(laneId);
      }
    }

    for (const laneId of desired) {
      if (!this._litLanes.has(laneId)) {
        this.surface.igniteLane(laneId);
        this._litLanes.add(laneId);
      }
    }
  }

  _burnEnemies() {
    const enemies = this.surfaceObjectsManager.enemies;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];

      if (!enemy.alive || !enemy.hittable) {
        continue;
      }

      if (enemy.zPosition > Firewall.KILL_DEPTH) {
        continue;
      }

      if (!this._litLanes.has(enemy.laneId)) {
        continue;
      }

      // reward = true so the player scores the kill, matching Superzapper.
      enemy.reward = true;
      enemy.die();
    }
  }

  /** Release every lane this controller lit. Safe to call repeatedly. */
  clear() {
    if (this._litLanes.size === 0) {
      return;
    }

    for (const laneId of this._litLanes) {
      this.surface.extinguishLane(laneId);
    }

    this._litLanes.clear();
  }

  /** @return {boolean} */
  get isActive() {
    return this._litLanes.size > 0;
  }

  /** @return {object} */
  static get powerUpType() {
    return PowerUpType.FIREWALL;
  }
}
