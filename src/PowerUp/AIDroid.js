/**
 * AIDroid.js
 *
 * A.I. Droid companion power-up — floats above the player, auto-targets
 * enemies, and fires on their behalf.
 *
 * Styled as a parody Portal Companion Cube: wireframe cube with pink panel
 * borders, circles, and hearts on every face. Slowly rotates while bobbing.
 *
 * Integration:
 *   Created by Game.js when 'powerup:collected' fires for PowerUpType.AI_DROID.
 *   Call update(delta) each game tick.
 *   Call dispose() when the power-up expires or the level resets.
 *
 * Depends on:
 *   THREE
 *   Projectile   (@/Object/Projectiles/Projectile)
 */

import * as THREE from 'three';
import Projectile from '@/Object/Projectiles/Projectile';

export class AIDroid {

  // Tuning constants
  static CUBE_SIZE      = 0.32;   // World-unit size of the cube
  static FLOAT_HEIGHT   = 0.70;   // Units above the player's rim Y position
  static BOB_AMPLITUDE  = 0.07;   // Vertical bob peak (units)
  static BOB_SPEED      = 2.2;    // Bob frequency (rad/s)
  static SPIN_Y         = 1.1;    // Yaw speed (rad/s)
  static SPIN_X         = 0.28;   // Pitch speed (rad/s) — slight tumble
  static FIRE_RATE_S    = 0.65;   // Seconds between shots
  static SEARCH_RATE_S  = 0.12;   // Seconds between target scans when idle

  /**
   * @param {THREE.Scene}           scene
   * @param {Surface}               surface
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   * @param {ProjectileManager}     projectileManager
   * @param {Shooter}               shooter
   */
  constructor (scene, surface, surfaceObjectsManager, projectileManager, shooter) {
    this.scene                 = scene;
    this.surface               = surface;
    this.surfaceObjectsManager = surfaceObjectsManager;
    this.projectileManager     = projectileManager;
    this.shooter               = shooter;

    this.isAlive        = true;
    this._fireCooldown  = 0;
    this._bobTime       = Math.random() * Math.PI * 2;  // Random phase offset

    this._buildMesh();
    this.scene.add(this.group);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Call once per game tick. delta is elapsed seconds since last frame. */
  update (delta) {
    if (!this.isAlive) return;

    // Animate
    this._bobTime       += delta * AIDroid.BOB_SPEED;
    this.group.rotation.y += delta * AIDroid.SPIN_Y;
    this.group.rotation.x += delta * AIDroid.SPIN_X;

    // Follow player along the rim
    if (this.shooter && this.surface) {
      const rimZ = Math.max(0, this.shooter.zPosition);
      const pos  = this.surface.lanePositionAt(this.shooter.laneId, rimZ);
      if (pos) {
        const bob = Math.sin(this._bobTime) * AIDroid.BOB_AMPLITUDE;
        this.group.position.set(
          pos.x,
          pos.y + AIDroid.FLOAT_HEIGHT + bob,
          pos.z
        );
      }
    }

    // Auto-fire tick
    this._fireCooldown -= delta;
    if (this._fireCooldown <= 0) {
      this._tryFire();
    }
  }

  /** Remove from scene and free GPU resources. */
  dispose () {
    this.isAlive = false;
    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material)  obj.material.dispose();
    });
  }

  // ---------------------------------------------------------------------------
  // Private — mesh construction
  // ---------------------------------------------------------------------------

  _buildMesh () {
    this.group = new THREE.Group();
    this.group.renderOrder = 20;

    const s = AIDroid.CUBE_SIZE;

    // ── Outer wireframe cube ──────────────────────────────────────────────────
    const boxGeo  = new THREE.BoxGeometry(s, s, s);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);
    this.group.add(new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    ));
    boxGeo.dispose();

    // ── Face decorations — panel border + circle + heart ─────────────────────
    // Each face is a small Group positioned at the face centre, oriented outward.
    const hs = s / 2;
    const faceConfigs = [
      { pos: [0,  0,  hs], euler: [0, 0, 0] },                          // Front
      { pos: [0,  0, -hs], euler: [0, Math.PI, 0] },                     // Back
      { pos: [ hs, 0,  0], euler: [0,  Math.PI / 2, 0] },                // Right
      { pos: [-hs, 0,  0], euler: [0, -Math.PI / 2, 0] },                // Left
      { pos: [0,  hs,  0], euler: [-Math.PI / 2, 0, 0] },                // Top
      { pos: [0, -hs,  0], euler: [ Math.PI / 2, 0, 0] },                // Bottom
    ];

    faceConfigs.forEach(({ pos, euler }) => {
      const face = new THREE.Group();
      face.position.set(...pos);
      face.rotation.set(...euler);

      face.add(this._panelBorder(s));
      face.add(this._circle(s * 0.20, 0xff88cc));
      face.add(this._heart(s * 0.095, 0xff44aa));

      this.group.add(face);
    });
  }

  /**
   * Inset square panel border — the classic Companion Cube edge detail.
   * @param {number} faceSize - Full size of the face
   */
  _panelBorder (faceSize) {
    const inset = faceSize * 0.28;
    const h     = faceSize * 0.5 - inset;
    const z     = 0.001;  // Float fractionally in front of the face to avoid z-fighting
    const pts   = [
      new THREE.Vector3(-h, -h, z),
      new THREE.Vector3( h, -h, z),
      new THREE.Vector3( h,  h, z),
      new THREE.Vector3(-h,  h, z),
      new THREE.Vector3(-h, -h, z),
    ];
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xff88cc })
    );
  }

  /** Circle approximated as a line loop. */
  _circle (radius, color) {
    const segs = 16;
    const pts  = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(a) * radius,
        Math.sin(a) * radius,
        0.002
      ));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color })
    );
  }

  /**
   * Heart shape using the standard parametric heart curve.
   * x(t) = 16 sin³(t)
   * y(t) = 13cos(t) − 5cos(2t) − 2cos(3t) − cos(4t)
   */
  _heart (scale, color) {
    const steps = 32;
    const pts   = [];
    for (let i = 0; i <= steps; i++) {
      const t  = (i / steps) * Math.PI * 2;
      const hx =  scale * 16 * Math.pow(Math.sin(t), 3) / 16;
      const hy = -scale * (
        13 * Math.cos(t)
         - 5 * Math.cos(2 * t)
         - 2 * Math.cos(3 * t)
             - Math.cos(4 * t)
      ) / 16;
      pts.push(new THREE.Vector3(hx, hy, 0.003));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color })
    );
  }

  // ---------------------------------------------------------------------------
  // Private — auto-targeting
  // ---------------------------------------------------------------------------

  _tryFire () {
    if (!this.surfaceObjectsManager || !this.projectileManager) {
      this._fireCooldown = AIDroid.SEARCH_RATE_S;
      return;
    }

    const enemies = this.surfaceObjectsManager.enemies;
    let   bestEnemy = null;
    let   bestScore = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive || !enemy.hittable) continue;

      // Score: prioritise close-to-rim enemies; lightly prefer same/adjacent lane
      const laneDist = Math.abs(enemy.laneId - this.shooter.laneId);
      const score    = enemy.zPosition + laneDist * 0.25;

      if (score < bestScore) {
        bestScore  = score;
        bestEnemy  = enemy;
      }
    }

    if (bestEnemy) {
      // Fire from the rim in the enemy's lane — acts like a precision telekinetic shot
      this.projectileManager.fire(
        bestEnemy.laneId,
        Projectile.SOURCE_SHOOTER,
        0,
        1   // Standard damage; inherit Particle Blaster if your ProjectileManager checks it
      );
      this._fireCooldown = AIDroid.FIRE_RATE_S;
    } else {
      // No targets — check again soon rather than waiting a full fire cycle
      this._fireCooldown = AIDroid.SEARCH_RATE_S;
    }
  }
}
