import Projectile from '@/Object/Projectiles/Projectile';
import JuiceManager from '@/utils/JuiceManager';
import FIFOManager from '@/Object/Manager/FIFOManager';

export default class ProjectileManager extends FIFOManager {
  static MAX_AMOUNT_OF_SHOOTER_PROJECTILES = 48;
  static MAX_AMOUNT_OF_ENEMY_PROJECTILES = 32;

  surfaceObjectsManager;
  shooterProjectiles = [];
  enemyProjectiles = [];
  enemyProjectilesMap;
  rendererHelperNewProjectilesIds = [];

  /**
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   */
  constructor(surfaceObjectsManager) {
    super();

    this.surfaceObjectsManager = surfaceObjectsManager;
    this.enemyProjectilesMap = new Array(
      this.surfaceObjectsManager.surface.lanesAmount,
    )
      .fill(0)
      .map(() => []);
  }

  /**
   * @param {number} laneId
   * @param {number} source
   * @param {?number} zPosition
   */
  fire(laneId, source, zPosition = null, damage = 1, weaponOverride = null) {
    if (source === Projectile.SOURCE_SHOOTER) {
      if (
        this.shooterProjectiles.length >=
        ProjectileManager.MAX_AMOUNT_OF_SHOOTER_PROJECTILES
      ) {
        return false;
      }

      const projectile = new Projectile(
        this.surfaceObjectsManager.surface,
        laneId,
        source,
        zPosition,
        damage,
      );

      if (this.game && this.game.powerUpManager) {
        const powerUps = this.game.powerUpManager;

        // Damage multiplier for ALL weapon types. Routed through
        // getBulletDamage() so PowerUpManager stays the single source of truth
        // for damage scaling. This previously only applied the Particle Blaster
        // multiplier inline, which meant the Laser's 2x bonus defined in
        // getBulletDamage() never reached the projectile — Shooter.fire()
        // overrides ShootingSurfaceObject.fire() and passes a hardcoded
        // damage of 1, so the parent's getBulletDamage() call never runs.
        projectile.damage = powerUps.getBulletDamage(projectile.damage);

        // Determine exactly what weapon is being fired. Resolved by most
        // recent pickup rather than a fixed priority chain, so collecting a
        // weapon while another is active always has an immediate effect.
        const wType = weaponOverride ?? powerUps.getActiveWeaponType();

        // Apply the specific weapon logic
        let baseColor = 0xffff00;
        let lengthMult = 1.0;

        if (wType === 'LASER') {
          projectile.isLaser = true;
          projectile.zPosition = 0.5;
          projectile.zSpeed = 0;
          projectile.laserFrames = 6;
          projectile.killRadiusForward = 0.5;
          projectile.killRadiusBackward = 0.5;
          baseColor = 0x00ff00;
          lengthMult = powerUps.getBulletLengthMultiplier();
        } else if (wType === 'GRENADE') {
          projectile.isGrenade = true;
          projectile.zSpeed = Projectile.PROJECTILE_SPEED * 0.6;
          baseColor = 0xff6600;
        } else if (wType === 'MISSILE') {
          projectile.isMissile = true;
          baseColor = 0xff3333;
        } else {
          lengthMult = powerUps.getBulletLengthMultiplier();
        }

        // Visual override for Particle Blaster if using standard weapons
        if (
          powerUps.hasParticleBlaster &&
          (wType === 'NORMAL' || wType === 'MISSILE')
        ) {
          baseColor = 0xff8c00; // Orange
        }

        projectile.customColor = baseColor;
        projectile.lengthMult = lengthMult;
      }

      this.shooterProjectiles.push(projectile);
      this.rendererHelperNewProjectilesIds.push(projectile.objectId);
    } else {
      if (
        this.enemyProjectiles.length >=
        ProjectileManager.MAX_AMOUNT_OF_ENEMY_PROJECTILES
      ) {
        console.log('Too much enemy projectiles!');
        return false;
      }

      this.enemyProjectiles.push(
        new Projectile(
          this.surfaceObjectsManager.surface,
          laneId,
          source,
          zPosition,
        ),
      );
      this.rendererHelperNewProjectilesIds.push(
        this.enemyProjectiles[this.enemyProjectiles.length - 1].objectId,
      );
    }

    this.forceMapsUpdate = true;
    return true;
  }

  /**
   * @param {number} delta      - real frame delta; drives player projectiles.
   * @param {number} enemyDelta - possibly slowed delta (TIME_DILATION).
   */
  update(delta = 1 / 60, enemyDelta = delta) {
    // Tuned as "0.15 per frame" at 60fps -> baked into a per-second rate here.
    const steeringSpeed = 0.15 * 60 * delta;

    this.shooterProjectiles.forEach((projectile) => {
      if (projectile.isGrenade && projectile.needsAoECheck) {
        projectile.needsAoECheck = false;
        JuiceManager.emit('grenade');

        // Wipe Enemies in blast radius
        this.surfaceObjectsManager.enemies.forEach((enemy) => {
          if (enemy.alive && enemy.hittable) {
            const laneCount = this.surfaceObjectsManager.surface.lanesAmount;
            let diff = Math.abs(enemy.laneId - projectile.laneId);
            if (diff > laneCount / 2) diff = laneCount - diff;
            let zDiff = Math.abs(enemy.zPosition - projectile.zPosition);

            // diff <= 2 hits 5 whole lanes (the center, plus 2 on each side)
            // zDiff <= 0.45 hits almost half the depth of the entire tube!
            if (diff <= 2 && zDiff <= 0.45) {
              enemy.hitByProjectile(projectile.damage);
            }
          }
        });

        // Wipe Spikes in blast radius
        this.surfaceObjectsManager.spikes.forEach((spike) => {
          if (spike.alive && spike.hittable) {
            const laneCount = this.surfaceObjectsManager.surface.lanesAmount;
            let diff = Math.abs(spike.laneId - projectile.laneId);
            if (diff > laneCount / 2) diff = laneCount - diff;
            let zDiff = Math.abs(spike.zPosition - projectile.zPosition);

            if (diff <= 2 && zDiff <= 0.45) {
              spike.hitByProjectile(projectile.damage);
            }
          }
        });
      }

      if (projectile.isMissile && projectile.alive) {
        // Dynamically read the true lane count of the current surface!
        const laneCount = this.surfaceObjectsManager.surface.lanesAmount;

        if (projectile.exactLane === undefined) {
          projectile.exactLane = projectile.laneId;
        }

        let nearestTarget = null;
        let minZ = Infinity;

        this.surfaceObjectsManager.enemies.forEach((enemy) => {
          if (enemy.alive && enemy.zPosition > projectile.zPosition) {
            let dist = enemy.zPosition - projectile.zPosition;
            if (dist < minZ) {
              minZ = dist;
              nearestTarget = enemy;
            }
          }
        });

        if (nearestTarget) {
          let diff = nearestTarget.laneId - projectile.exactLane;

          // Use laneCount instead of hardcoded 8s and 16s!
          if (diff > laneCount / 2) diff -= laneCount;
          if (diff < -laneCount / 2) diff += laneCount;

          projectile.exactLane += diff * steeringSpeed;

          if (projectile.exactLane < 0) projectile.exactLane += laneCount;
          if (projectile.exactLane >= laneCount)
            projectile.exactLane -= laneCount;

          projectile.laneId = Math.round(projectile.exactLane) % laneCount;
        }
      }

      // Now the core engine can safely look up the X/Y coordinates!
      projectile.update(delta);

      // We still use the safe lane for grid collisions
      const safeLane = projectile.laneId;

      projectile.detectCollision(
        this.surfaceObjectsManager.enemiesMap[safeLane],
      );
      projectile.detectCollision(
        this.surfaceObjectsManager.spikesMap[safeLane],
      );
      projectile.detectCollision(this.enemyProjectilesMap[safeLane]);
    });

    this.enemyProjectiles.forEach((projectile) => {
      projectile.update(enemyDelta);
      projectile.detectCollision(
        this.surfaceObjectsManager.shootersMap[projectile.laneId],
      );
    });

    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  runGarbageCollector() {
    if (this.shouldTriggerGarbageCollector()) {
      FIFOManager.garbageCollector(this.shooterProjectiles);
      const collectedEnemyProjectiles = FIFOManager.garbageCollector(
        this.enemyProjectiles,
      );

      if (collectedEnemyProjectiles) {
        this.forceMapsUpdate = true;
      }
      // if (collectedShooterProjectiles) console.log(`Collected ${collectedShooterProjectiles} shooter projectiles.`);
      // if (collectedEnemyProjectiles) console.log(`Collected ${collectedEnemyProjectiles} enemy projectiles`);
    }
  }

  updateObjectsMap() {
    FIFOManager.updateMap(
      this.enemyProjectiles,
      this.enemyProjectilesMap,
      this.forceMapsUpdate,
    );

    this.forceMapsUpdate = false;
  }

  removeProjectiles() {
    this.shooterProjectiles.forEach((projectile) => {
      projectile.disappear();
    });
    this.enemyProjectiles.forEach((projectile) => {
      projectile.disappear();
    });

    this.runGarbageCollector();
    this.updateObjectsMap();
  }
}
