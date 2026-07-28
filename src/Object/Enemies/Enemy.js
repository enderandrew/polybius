import ShootingSurfaceObject from '@/Object/Surface/ShootingSurfaceObject';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import enemyClock from '@/utils/GameClock';

export default class Enemy extends ShootingSurfaceObject {
  static SHOOT_TIMEOUT_MS = 100;

  firstLevel;
  valueInPoints;
  rewardCallback;
  reward = false;

  /**
   * @param {Surface} surface
   * @param {ProjectileManager} projectileManager
   * @param {function} rewardCallback
   * @param {number} laneId
   * @param {number} zPosition
   * @param {string} type
   */
  constructor(
    surface,
    projectileManager,
    rewardCallback,
    laneId,
    zPosition,
    type,
    game,
  ) {
    super(surface, projectileManager, laneId, type, game);
    this.zPosition = zPosition;
    this.rewardCallback = rewardCallback;
    this.shootTimeoutMs = Enemy.SHOOT_TIMEOUT_MS;
    this.game = game;
    this.isStrong = Math.random() < 0.1;
    this.hitPoints = this.isStrong ? 2 : 1;
    this.hasShield = this.isStrong;

    if (this.constructor === Enemy) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    //console.log("Enemy spawned with game:", this.game);
  }

  /**
   * Enemies run on the dilatable clock, so every State duration — Flipper
   * rotation, Pulsar pulse, explosion timing, fire cadence — slows with
   * TIME_DILATION rather than only their z-movement.
   *
   * @return {number}
   */
  now() {
    return enemyClock.now();
  }

  hitByProjectile(damage = 1) {
    this.hitPoints -= damage;
    if (this.hitPoints <= 0) {
      this.alive = false;
      this.reward = true;
      this.die();
    } else {
      this.hasShield = false;
    }
  }

  fire() {
    if (super.fire()) {
      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_ENEMY_SHOOT,
      );
    }
  }

  die() {
    //console.log("DEBUG: Current Enemy Instance:", this);
    //console.log("DEBUG: Enemy's 'game' reference:", this.game);
    this.hittable = false;
    this.canShoot = false;
    this.clearFlags();

    if (this.reward === true) {
      this.reward = false;
      this.rewardCallback(this.valueInPoints);

      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_ENEMY_DEATH,
      );

      // Power-up drop — runs for any enemy that grants a reward
      if (this.game && this.game.powerUpSpawner) {
        this.game.powerUpSpawner.tryDrop(this);
      }
    }
  }
}
