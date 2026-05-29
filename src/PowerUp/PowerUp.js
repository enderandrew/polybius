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
	//console.log("POWERUP: Constructed with geometry:", this.webGeometry);
    if (!this.webGeometry.coords && !this.webGeometry.lanesCoords) {
        console.error("CRITICAL: webGeometry passed to PowerUp is missing coordinate data!");
        console.log("Geometry Object:", this.webGeometry);
    }
	
    this.isCollected = false;
    this.isExpired   = false;

    // How fast the power-up crawls toward the player (units per second).
    // Slower than enemies so the player has to decide whether to collect.
    this.speed = 0.35;

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
    if (!this.webGeometry) {
        this.isExpired = true;
        return;
    }
    if (this.isExpired) return;

    if (this.isCollected) {
       this._rotTime += delta * 8.0; 
       this.sprite.material.rotation = this._rotTime * 0.5;
       return; 
    }

    this.depth -= this.speed * delta;

    if (this.depth <= 0) {
      this.isExpired = true;
      return;
    }

    this._bobTime  += delta * 2.8;
    this._rotTime  += delta * 1.4;

    const bob    = Math.sin(this._bobTime) * 0.05;
    const pulse  = 1.0 + Math.sin(this._bobTime * 1.5) * 0.08;

    const pos = this.webGeometry.lanePositionAt(this.lane, this.depth);
    
    if (pos) {
        this.sprite.position.copy(pos);
        this.sprite.position.y += bob;
        
        // Log the position once per second (roughly) to avoid console spam
        if (Math.random() < 0.02) {
             console.log(`POWERUP VISUAL: [${this.type.id}] Pos(x:${this.sprite.position.x.toFixed(2)}, y:${this.sprite.position.y.toFixed(2)}, z:${this.sprite.position.z.toFixed(2)}) | Scale: ${this.sprite.scale.x.toFixed(2)}`);
        }
    } else {
        console.warn(`POWERUP VISUAL: lanePositionAt returned null for lane ${this.lane}, depth ${this.depth}`);
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
    try {
        if (scene && this.sprite) {
            scene.remove(this.sprite);
        }
        if (this.sprite && this.sprite.material) {
            if (this.sprite.material.map && typeof this.sprite.material.map.dispose === 'function') {
                this.sprite.material.map.dispose();
            }
            if (typeof this.sprite.material.dispose === 'function') {
                this.sprite.material.dispose();
            }
        }
    } catch (e) {
        console.error("Safely caught dispose error:", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _buildSprite () {
    const canvas  = PowerUpRenderer.createCanvas(this.type);
	console.log(`POWERUP RENDER: Canvas created for ${this.type.id}. Size: ${canvas.width}x${canvas.height}`);
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.SpriteMaterial({
      map:         texture,
      transparent: true,
      blending:    THREE.AdditiveBlending,   // Glows nicely against dark backgrounds
      depthTest:   false,
	  depthWrite:  false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.setScalar(this._baseScale);
    this.sprite.renderOrder = 10;            // Draw above web geometry
	console.log(`POWERUP RENDER: Sprite built. Scale:`, this.sprite.scale, `Opacity:`, this.sprite.material.opacity);
  }

  _playCollectVFX () {
    let elapsed  = 0;
    const burst  = 16;
    const expand = () => {
      elapsed += burst;
      const t = elapsed / 300;
      if (t >= 1) {
        this.sprite.material.opacity = 0;
        this.isExpired = true; 
        return;
      }
      this.sprite.scale.setScalar(this._baseScale * (1 + t * 1.8));
      this.sprite.material.opacity = 1 - t;
      setTimeout(expand, burst);
    };
    setTimeout(expand, burst);
  }
}