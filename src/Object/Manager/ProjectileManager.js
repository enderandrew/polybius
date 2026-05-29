import Projectile from '@/Object/Projectiles/Projectile';
import FIFOManager from '@/Object/Manager/FIFOManager';

export default class ProjectileManager extends FIFOManager {
  // Removed legacy @readonly decorators
  static MAX_AMOUNT_OF_SHOOTER_PROJECTILES = 6;
  static MAX_AMOUNT_OF_ENEMY_PROJECTILES = 32;

  // Modern ES class fields replacing JSDoc @var comments
  surfaceObjectsManager;
  shooterProjectiles = [];
  enemyProjectiles = [];
  enemyProjectilesMap;
  rendererHelperNewProjectilesIds = [];

  /**
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   */
  constructor (surfaceObjectsManager) {
    super();

    this.surfaceObjectsManager = surfaceObjectsManager;
    this.enemyProjectilesMap = new Array(this.surfaceObjectsManager.surface.lanesAmount).fill(0).map(() => []);
  }

  /**
   * @param {number} laneId
   * @param {number} source
   * @param {?number} zPosition
   */
  fire (laneId, source, zPosition = null, damage = 1) {
    if (source === Projectile.SOURCE_SHOOTER) {
      if (this.shooterProjectiles.length >= ProjectileManager.MAX_AMOUNT_OF_SHOOTER_PROJECTILES) {
        console.log('Too much shooter projectiles!');
        return false;
      }

      // Create the projectile object
      const projectile = new Projectile(this.surfaceObjectsManager.surface, laneId, source, zPosition, damage);

      if (this.game && this.game.powerUpManager) {
          projectile.customColor = this.game.powerUpManager.getBulletColor(0xffff00);
          projectile.lengthMult = this.game.powerUpManager.getBulletLengthMultiplier();
		  if (this.game.powerUpManager.hasLaser) {
             projectile.killRadiusForward = 0.20;
             projectile.killRadiusBackward = 0.20;
         }
      }

      // Push it to the arrays
      this.shooterProjectiles.push(projectile);
      this.rendererHelperNewProjectilesIds.push(projectile.objectId);

    } else {
      if (this.enemyProjectiles.length >= ProjectileManager.MAX_AMOUNT_OF_ENEMY_PROJECTILES) {
        console.log('Too much enemy projectiles!');
        return false;
      }

      this.enemyProjectiles.push(new Projectile(this.surfaceObjectsManager.surface, laneId, source, zPosition));
      this.rendererHelperNewProjectilesIds.push(this.enemyProjectiles[this.enemyProjectiles.length - 1].objectId);
    }

    this.forceMapsUpdate = true;
    return true;
  }

  update () {
    this.shooterProjectiles.forEach(projectile => {
      projectile.update();
      projectile.detectCollision(this.surfaceObjectsManager.enemiesMap[projectile.laneId]);
      projectile.detectCollision(this.surfaceObjectsManager.spikesMap[projectile.laneId]);
      projectile.detectCollision(this.enemyProjectilesMap[projectile.laneId]);
    });

    this.enemyProjectiles.forEach(projectile => {
      projectile.update();
      projectile.detectCollision(this.surfaceObjectsManager.shootersMap[projectile.laneId]);
    });

    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  runGarbageCollector () {
    if (this.shouldTriggerGarbageCollector()) {
      FIFOManager.garbageCollector(this.shooterProjectiles);
      const collectedEnemyProjectiles = FIFOManager.garbageCollector(this.enemyProjectiles);

      if (collectedEnemyProjectiles) {
        this.forceMapsUpdate = true;
      }
      // if (collectedShooterProjectiles) console.log(`Collected ${collectedShooterProjectiles} shooter projectiles.`);
      // if (collectedEnemyProjectiles) console.log(`Collected ${collectedEnemyProjectiles} enemy projectiles`);
	  }
  }

  updateObjectsMap () {
    FIFOManager.updateMap(this.enemyProjectiles, this.enemyProjectilesMap, this.forceMapsUpdate);

    this.forceMapsUpdate = false;
  }

  removeProjectiles () {
    this.shooterProjectiles.forEach(projectile => { projectile.disappear(); });
    this.enemyProjectiles.forEach(projectile => { projectile.disappear(); });

    this.runGarbageCollector();
    this.updateObjectsMap();
  }
}