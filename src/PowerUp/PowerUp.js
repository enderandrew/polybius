/**
 * PowerUp.js
 *
 * A live power-up collectible that exists in the game world.
 * Dropped by enemies, it crawls up the web toward the player rim.
 * On collection it applies its effect via PowerUpManager.
 *
 * Rendering uses a Three.js Sprite (always camera-facing) so the icon
 * is always readable regardless of web orientation.
 *
 * Integration note:
 *   - Instantiate from EnemyBase (or a drop manager) after enemy death.
 *   - Call update(delta) each game tick.
 *   - Add the .sprite to the Three.js scene.
 *   - Check .isCollected and .isExpired each tick for cleanup.
 *
 * Depends on:
 *   THREE           (global / import as needed)
 *   PowerUpRenderer (@/PowerUp/PowerUpRenderer)
 */

import * as THREE from 'three';
import { PowerUpRenderer } from '@/PowerUp/PowerUpRenderer';

export class PowerUp {

  /**
   * @param {object}  type        - A PowerUpType enum value
   * @param {number}  lane        - Web lane index where the power-up spawns
   * @param {number}  depth       - Starting Z depth along the web tube
   * @param {object}  webGeometry - Reference to the web/level geometry helper
   *                                (must expose lanePositionAt(lane, depth) → THREE.Vector3)
   */
  constructor (type, lane, depth, webGeometry) {
    this.type        = type;
    this.lane        = lane;
    this.depth       = depth;
    this.webGeometry = webGeometry;

    this.isCollected = false;
    this.isExpired   = false;

    // How fast the power-up crawls toward the player (units per second).
    // Slower than enemies so the player has to decide whether to collect.
    this.speed = 1.8;

    // Visual bob/pulse animation state
    this._bobTime    = Math.random() * Math.PI * 2;  // Random phase offset
    this._rotTime    = 0;
    this._baseScale  = 0.55;

    this._buildSprite();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Call once per game tick. delta is seconds since last frame. */
  update (delta) {
    if (this.isCollected || this.isExpired) return;

    // Advance toward player
    this.depth -= this.speed * delta;

    // If it reaches the rim without being collected, it vanishes
    if (this.depth <= 0) {
      this.isExpired = true;
      return;
    }

    // Animate
    this._bobTime  += delta * 2.8;
    this._rotTime  += delta * 1.4;

    const bob    = Math.sin(this._bobTime) * 0.05;
    const pulse  = 1.0 + Math.sin(this._bobTime * 1.5) * 0.08;

    // Reposition along the web
    const pos = this.webGeometry.lanePositionAt(this.lane, this.depth);
    if (pos) {
      this.sprite.position.copy(pos);
      this.sprite.position.y += bob;
    }

    this.sprite.material.rotation = this._rotTime * 0.5;
    this.sprite.scale.setScalar(this._baseScale * pulse);
  }

  /** Trigger collection VFX and mark as collected. */
  collect () {
    if (this.isCollected) return;
    this.isCollected = true;
    this._playCollectVFX();
  }

  /** Remove the sprite from the scene. Call when cleaning up. */
  dispose (scene) {
    scene.remove(this.sprite);
    this.sprite.material.map.dispose();
    this.sprite.material.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _buildSprite () {
    const canvas  = PowerUpRenderer.createCanvas(this.type);
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.SpriteMaterial({
      map:         texture,
      transparent: true,
      blending:    THREE.AdditiveBlending,   // Glows nicely against dark backgrounds
      depthWrite:  false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.setScalar(this._baseScale);
    this.sprite.renderOrder = 10;            // Draw above web geometry
  }

  _playCollectVFX () {
    // Quick scale-burst then fade on the sprite before it's removed.
    // Uses a simple timeout chain; replace with your existing VFX system if available.
    let elapsed  = 0;
    const burst  = 16;   // ms per frame
    const expand = () => {
      elapsed += burst;
      const t = elapsed / 300;
      if (t >= 1) {
        this.sprite.material.opacity = 0;
        return;
      }
      this.sprite.scale.setScalar(this._baseScale * (1 + t * 1.8));
      this.sprite.material.opacity = 1 - t;
      setTimeout(expand, burst);
    };
    setTimeout(expand, burst);
  }
}
