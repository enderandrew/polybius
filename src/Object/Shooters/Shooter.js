import SurfaceObject from '@/Object/Surface/SurfaceObject';
import ShootingSurfaceObject from '@/Object/Surface/ShootingSurfaceObject';
import State from '@/Object/State';
import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class Shooter extends ShootingSurfaceObject {
  // Removed legacy @readonly decorators
  static LANE_CHANGE_TIMEOUT_MS = 50;
  static SHOOT_TIMEOUT_MS = 80;
  static BURST_PENALTY_MS = 500;

  static TUBE_DESCENDING_LENGTH_MULTIPLIER = 2;
  static TUBE_APPROACHING_LENGTH_MULTIPLIER = 4;
  static COLLISION_RADIUS_FORWARD = 0;
  static COLLISION_RADIUS_BACKWARD = 0.08;

  static STATE_ALIVE = new State(1000, 1, 'alive');
  static STATE_EXPLODING = new State(1000, 1, 'exploding');
  static STATE_DISAPPEARING = new State(1000, 1, 'disappearing');
  static STATE_RENOVATING = new State(1000, 1, 'renovating');
  static STATE_APPROACHING_TUBE = new State(2000, 1, 'approaching_tube');
  static STATE_GOING_DOWN_THE_TUBE = new State(4000, 1, 'going_down_the_tube');
  static STATE_REACHED_TUBE_BOTTOM = new State(0, 1, 'reached_tube_bottom');
  static STATE_DEAD = new State(0, 1, 'dead');
  static STATE_JUMPING = new State(600, 1, 'jumping');
  static JUMP_HEIGHT = -0.3;   // Negative Z = above the rim

  static FLAG_ITS_ALREADY_TOO_LATE = 0x1;
  static FLAG_SUPERZAPPER_USED = 0x2;

  // Modern ES class fields replacing JSDoc @var comments
  penaltyTimestamp = 0;
  jumpTimestamp = 0;
  lastLaneChangeTimestamp;
  laneChangeTimeoutMs;
  surfaceObjectsManager;
  killedCallback;

  /**
   * @param {Surface} surface
   * @param {ProjectileManager} projectileManager
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   * @param {function} killedCallback
   * @param {number} laneId
   */
  constructor (
    surface,
    projectileManager,
    surfaceObjectsManager,
    killedCallback,
    laneId = 0
  ) {
    super(surface, projectileManager, laneId, SurfaceObject.TYPE_SHOOTER);

    this.surfaceObjectsManager = surfaceObjectsManager;
    this.killedCallback = killedCallback;

    this.zPosition = 0;

    this.shootTimeoutMs = Shooter.SHOOT_TIMEOUT_MS;
    this.laneChangeTimeoutMs = Shooter.LANE_CHANGE_TIMEOUT_MS;

    this.hittable = false;
    this.canShoot = false;

    this.surface.setActiveLane(laneId);
    this.setState(Shooter.STATE_APPROACHING_TUBE);
  }

  updateState () {
    if (this.inState(Shooter.STATE_RENOVATING)) {
      this.hittable = true;
      this.canShoot = true;

      this.setState(Shooter.STATE_ALIVE);

    } else if (this.inState(Shooter.STATE_EXPLODING)) {
      this.setState(Shooter.STATE_DEAD);
      this.killedCallback();

    } else if (this.inState(Shooter.STATE_DISAPPEARING)) {
      this.setState(Shooter.STATE_DEAD);

    } else if (this.inState(Shooter.STATE_DEAD)) {
      this.alive = false;

    } else if (this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
      this.setState(Shooter.STATE_REACHED_TUBE_BOTTOM);
      this.die();

    } else if (this.inState(Shooter.STATE_APPROACHING_TUBE)) {
      this.hittable = true;
      this.canShoot = true;
      this.setState(Shooter.STATE_ALIVE);

    } else if (this.inState(Shooter.STATE_JUMPING)) {
      this.setState(Shooter.STATE_ALIVE);
      this.zPosition = 0;
    }
  }

  updateEntity () {
    if (this.isFlagNotSet(Shooter.FLAG_ITS_ALREADY_TOO_LATE) && !this.inState(Shooter.STATE_JUMPING)) {
      this.handleShortedLanes();

      if (!this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
        this.handleCaptureByEnemy();
      } else {
        if (this.zPosition <= 1) {
          this.handleCollisionWithEnemy();
          this.handleCollisionWithSpike();
        }
      }
    }

    if (this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
      this.zPosition = this.stateProgressInTime() * Shooter.TUBE_DESCENDING_LENGTH_MULTIPLIER;
    } else if (this.inState(Shooter.STATE_APPROACHING_TUBE)) {
      this.zPosition = -1 * (1 - this.stateProgressInTime()) * Shooter.TUBE_APPROACHING_LENGTH_MULTIPLIER;
    } else if (this.inState(Shooter.STATE_ALIVE) || this.inState(Shooter.STATE_RENOVATING)) {
      this.zPosition = 0;
    } else if (this.inState(Shooter.STATE_JUMPING)) {
      // Sine arc: launches up, hangs at peak, comes back down
      const arc      = Math.sin(this.stateProgressInTime() * Math.PI);
      this.zPosition = Shooter.JUMP_HEIGHT * arc;
    }
  }

  handleShortedLanes () {
    if (this.surface.isLaneShorted(this.laneId)) {
      this.shockedByPulsar();
    }
  }

  handleCaptureByEnemy () {
    let enemiesMapRef = this.surfaceObjectsManager.enemiesMap[this.laneId];

    if (enemiesMapRef.length > 0) {
      enemiesMapRef.forEach(enemy => {
        if (enemy.type === Enemy.TYPE_FLIPPER && enemy.isFlagSet(EnemyFlipper.FLAG_REACHED_SHOOTER)) {
          this.capturedByFlipper();
        }

        if (enemy.type === Enemy.TYPE_FUSEBALL && enemy.isFlagSet(EnemyFuseball.FLAG_REACHED_SHOOTER)) {
          this.capturedByFuseball();
        }
      });
    }
  }

  handleCollisionWithEnemy () {
    let enemiesMapRef = this.surfaceObjectsManager.enemiesMap[this.laneId];

    let collision = enemiesMapRef.findIndex(object => (
        object.hittable
        && object.alive
        && object.zPosition >= this.zPosition - Shooter.COLLISION_RADIUS_BACKWARD
        && object.zPosition <= this.zPosition + Shooter.COLLISION_RADIUS_FORWARD
      )
    );

    if (collision >= 0) {
      enemiesMapRef[collision].hitByProjectile();
      this.hitByProjectile();
    }
  }

  handleCollisionWithSpike () {
    let spikesMapRef = this.surfaceObjectsManager.spikesMap[this.laneId];

    let collision = spikesMapRef.findIndex(object => (
        object.hittable
        && object.alive
        && object.zPosition <= this.zPosition + Shooter.COLLISION_RADIUS_FORWARD
      )
    );

    if (collision >= 0) {
      this.impaledOnSpike();
    }
  }

  /**
   * @param {number} desiredLane
   */
  moveToLane (desiredLane) {
    if (!this.inState(Shooter.STATE_ALIVE)
      && !this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)
      && !this.inState(Shooter.STATE_APPROACHING_TUBE)
    ) {
      return;
    }

    let now = Date.now();

    if (now - this.lastLaneChangeTimestamp < Shooter.LANE_CHANGE_TIMEOUT_MS) {
      return;
    }

    this.setLane(desiredLane);
    this.surface.setActiveLane(this.laneId);

    this.lastLaneChangeTimestamp = now;

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_CHANGED_LANE);
  }

  moveLeft () {
    this.moveToLane(this.laneId + 1);
  }

  moveRight () {
    this.moveToLane(this.laneId - 1);
  }

  fire () {
    if (
      !this.canShoot
      || this.zPosition > 1
      || (!this.inState(Shooter.STATE_ALIVE) && !this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE))
    ) {
      return;
    }

    let now = Date.now();

    if (now - this.penaltyTimestamp < Shooter.BURST_PENALTY_MS) {
      return;
    }

    if (super.fire() === false) {
      this.penaltyTimestamp = now;
    } else {
      messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_SHOOT);
    }
  }

  jump () {
    if (
      !this.game?.powerUpManager?.hasJump
      || !this.inState(Shooter.STATE_ALIVE)
      || !this.canShoot
    ) {
      return;
    }
    this.jumpTimestamp = Date.now();
    this.setState(Shooter.STATE_JUMPING);
  }

  hitByProjectile () {
    // console.log('BOOM! (projectile)');
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_DEATH);
  }

  capturedByFlipper () {
    // console.log('BAM! (flipper)');
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_DEATH);
  }

  capturedByFuseball () {
    // console.log('POW! (fuseball)');
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_DEATH);
  }

  impaledOnSpike () {
    // console.log('SPUT! (spike)');
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_DEATH);
  }

  shockedByPulsar () {
    // console.log('BZZZT! (pulsar)');
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_DEATH);
  }

  die () {
    this.setFlag(Shooter.FLAG_ITS_ALREADY_TOO_LATE);
    this.hittable = false;
    this.canShoot = false;
  }

  disappear () {
    if (this.inState(Shooter.STATE_EXPLODING) || this.inState(Shooter.STATE_DEAD)) {
      return;
    }

    this.setState(Shooter.STATE_DISAPPEARING);
    this.die();
  }

  fireSuperzapper () {
    if (
      this.canShoot
      && (this.inState(Shooter.STATE_ALIVE) || this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE))
      && this.isFlagNotSet(Shooter.FLAG_SUPERZAPPER_USED)
    ) {
      this.setFlag(Shooter.FLAG_SUPERZAPPER_USED);

      messageBroker.publish(MessageBroker.TOPIC_SCREEN, MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED);
      messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED);

      this.surfaceObjectsManager.handleSuperzapper();
    }
  }

  renovate () {
    this.setState(Shooter.STATE_RENOVATING);
    this.alive = true;

    let superzapperUsed = this.isFlagSet(Shooter.FLAG_SUPERZAPPER_USED);
    this.clearFlags();

    if (superzapperUsed) {
      this.setFlag(Shooter.FLAG_SUPERZAPPER_USED);
    }
  }
}