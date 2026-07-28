import SurfaceObject from '@/Object/Surface/SurfaceObject';
import Projectile from '@/Object/Projectiles/Projectile';

export default class ShootingSurfaceObject extends SurfaceObject {
  /** @var {ProjectileManager} */
  projectileManager;

  /** @var {number} */
  projectileSource;

  /** @var {number} */
  lastShootTimestamp;
  /** @var {number} */
  shootTimeoutMs;

  /** @var {boolean} */
  canShoot = true;

  /**
   * @param {Surface} surface
   * @param {ProjectileManager} projectileManager
   * @param {number} laneId
   * @param {string} type
   */
  constructor(surface, projectileManager, laneId, type) {
    super(surface, laneId, type);

    this.projectileManager = projectileManager;
    this.projectileSource =
      type === SurfaceObject.TYPE_SHOOTER
        ? Projectile.SOURCE_SHOOTER
        : Projectile.SOURCE_ENEMY;
  }

  update(delta = 1 / 60) {
    if (!this.alive) {
      return;
    }

    if (this.canChangeState()) {
      this.updateState();
    }

    this.updateEntity(delta);
  }

  updateState() {
    throw new Error("Method 'updateState()' must be implemented.");
  }

  /**
   * @param {number} delta - seconds elapsed since the previous frame.
   *   Classes with per-frame z-movement (zPosition += zSpeed) must scale by
   *   `delta * 60` so speed stays frame-rate independent (constants were
   *   originally tuned assuming 60fps).
   */
  updateEntity(_delta) {
    throw new Error("Method 'updateEntity()' must be implemented.");
  }

  fire() {
    if (!this.canShoot) {
      return;
    }

    // this.now() is the enemy clock for enemies and wall time for the player,
    // so enemy fire cadence dilates automatically — no manual compensation.
    let now = this.now();

    // Apply power-up cooldown modifier for player shots only
    const cooldown =
      this.projectileSource === Projectile.SOURCE_SHOOTER &&
      this.game?.powerUpManager
        ? this.game.powerUpManager.getShotCooldown(this.shootTimeoutMs)
        : this.shootTimeoutMs;

    if (now - this.lastShootTimestamp < cooldown) {
      return;
    }

    this.lastShootTimestamp = now;

    // Determine damage for this shot
    const damage =
      this.projectileSource === Projectile.SOURCE_SHOOTER &&
      this.game?.powerUpManager
        ? this.game.powerUpManager.getBulletDamage(1)
        : 1;

    // Spread Gun
    if (
      this.projectileSource === Projectile.SOURCE_SHOOTER &&
      this.game?.powerUpManager?.hasSpreadGun
    ) {
      const angles = this.game.powerUpManager.getShotAngles();
      let fired = false;
      angles.forEach((angle) => {
        const targetLane = this._spreadLane(angle);
        if (
          this.projectileManager.fire(
            targetLane,
            this.projectileSource,
            this.zPosition,
            damage,
          )
        ) {
          fired = true;
        }
      });
      return fired;
    }

    return this.projectileManager.fire(
      this.laneId,
      this.projectileSource,
      this.zPosition,
      damage,
    );
  }

  // Helper — converts a spread angle offset into a neighbouring lane index
  _spreadLane(angleOffset) {
    if (angleOffset === 0) return this.laneId;
    const surface = this.projectileManager.surfaceObjectsManager.surface;
    const laneCount = surface.lanesAmount;
    const offset = angleOffset > 0 ? 1 : -1;
    return (this.laneId + offset + laneCount) % laneCount;
  }
}
