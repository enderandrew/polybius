// @ts-check

/**
 * @enum {number}
 */
export const TankerState = {
  IDLE: 0,
  SHOOTING: 1,
  EXPLODING: 2,
  DISAPPEARING: 3,
  DEAD: 4,
};

/**
 * @enum {number}
 */
export const TankerFlags = {
  NONE: 0,
  SHOOTS_FIRED: 1 << 0,
  ROTATION_DIR_CHOSEN: 1 << 1,
};

import Enemy from '@/Object/Enemies/Enemy';
import State from '@/Object/State';
import randomRange from '@/utils/randomRange';

export default class EnemyTanker extends Enemy {
  static STATE_IDLE = new State(100, 1, 'idle');
  static STATE_SHOOTING = new State(100, 0.1, 'shooting');
  static STATE_DISAPPEARING = new State(1000, 1, 'disappearing');
  static STATE_EXPLODING = new State(1000, 1, 'exploding');
  static STATE_DEAD = new State(0, 1, 'dead');

  static FLAG_SHOOTS_FIRED = 0x1;

  enemySpawnFunction;
  zSpeed;
  _hasReleasedEnemies = false;

  /**
   * @param {Surface} surface
   * @param {ProjectileManager} projectileManager
   * @param {function} enemySpawnFunction
   * @param {function} rewardCallback
   * @param {string} type
   * @param {number} laneId
   * @param {number} zPosition
   */
  constructor(
    surface,
    projectileManager,
    enemySpawnFunction,
    rewardCallback,
    type,
    laneId = 0,
    zPosition = 1,
    game,
  ) {
    super(
      surface,
      projectileManager,
      rewardCallback,
      laneId,
      zPosition,
      type,
      game,
    );
    this.enemySpawnFunction = enemySpawnFunction;
    this.firstLevel = 3;
    this.valueInPoints = 100;
    this.zSpeed = -randomRange(3, 6) * 0.001;
    this.setState(EnemyTanker.STATE_IDLE);
    this.game = game;
  }

  updateState() {
    if (this.inState(EnemyTanker.STATE_IDLE)) {
      this.setState(
        State.drawNextState(EnemyTanker.STATE_IDLE, EnemyTanker.STATE_SHOOTING),
      );
    } else if (this.inState(EnemyTanker.STATE_SHOOTING)) {
      this.setState(EnemyTanker.STATE_IDLE);
      this.unsetFlag(EnemyTanker.FLAG_SHOOTS_FIRED);
    } else if (this.inState(EnemyTanker.STATE_EXPLODING)) {
      this.setState(EnemyTanker.STATE_DEAD);
    } else if (this.inState(EnemyTanker.STATE_DISAPPEARING)) {
      this.setState(EnemyTanker.STATE_DEAD);
    }
  }

  updateEntity(delta = 1 / 60) {
    if (this.inState(EnemyTanker.STATE_DEAD)) {
      this.alive = false;
    }

    if (this.zPosition <= 0) {
      this.alive = false;
      this._releaseEnemiesOnce();
    }

    if (
      this.inState(EnemyTanker.STATE_SHOOTING) &&
      this.isFlagNotSet(EnemyTanker.FLAG_SHOOTS_FIRED)
    ) {
      this.setFlag(EnemyTanker.FLAG_SHOOTS_FIRED);
      this.fire();
    }

    if (
      !this.inState(EnemyTanker.STATE_EXPLODING) &&
      !this.inState(EnemyTanker.STATE_DISAPPEARING)
    ) {
      // zSpeed was tuned per-frame at 60fps -> scale by delta to stay frame-rate independent.
      this.zPosition += this.zSpeed * 60 * delta;
    }
  }

  /**
   * Tankers participate in the standard hitPoints damage model so that the
   * `isStrong` roll (Enemy) and the extra hitPoints set by variants such as
   * EnemyBombTanker actually mean something, and so damage power-ups scale
   * against them.
   *
   * Previously this took no `damage` argument and called die() unconditionally,
   * which made every tanker a one-hit kill regardless of hitPoints — the shield
   * mesh rendered for strong tankers absorbed nothing, and Particle Blaster /
   * Laser had no effect on them at all.
   *
   * @param {number} damage
   */
  hitByProjectile(damage = 1) {
    // Already dying — ignore further hits so the release can't double-fire.
    if (
      this.inState(EnemyTanker.STATE_EXPLODING) ||
      this.inState(EnemyTanker.STATE_DISAPPEARING) ||
      this.inState(EnemyTanker.STATE_DEAD)
    ) {
      return;
    }

    this.hitPoints -= damage;

    if (this.hitPoints > 0) {
      // Survived: the shield visually represents the absorbed hit, matching
      // Enemy.hitByProjectile().
      this.hasShield = false;
      return;
    }

    this.reward = true;
    this.die();
    this._releaseEnemiesOnce();
  }

  disappear() {
    if (
      this.inState(EnemyTanker.STATE_EXPLODING) ||
      this.inState(EnemyTanker.STATE_DEAD)
    ) {
      return;
    }

    this.setState(EnemyTanker.STATE_DISAPPEARING);
    super.die();
  }

  die() {
    if (this.inState(EnemyTanker.STATE_DEAD)) {
      return;
    }

    this.setState(EnemyTanker.STATE_EXPLODING);
    super.die();
  }

  createEnemies() {
    throw new Error("Method 'createEnemies()' must be implemented.");
  }

  _releaseEnemiesOnce() {
    if (this._hasReleasedEnemies) return;
    this._hasReleasedEnemies = true;

    // Defer the spawn to the start of the next update() tick to prevent mutating the collision arrays mid-loop.
    if (
      this.game &&
      this.game.levelObject &&
      this.game.levelObject.surfaceObjectsManager
    ) {
      this.game.levelObject.surfaceObjectsManager.queueSpawn(() => {
        this.createEnemies();
      });
    } else {
      // Fallback just in case
      this.createEnemies();
    }
  }
}
