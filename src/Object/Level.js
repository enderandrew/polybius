import Shooter from '@/Object/Shooters/Shooter';
import SurfaceObjectsManager from '@/Object/Manager/SurfaceObjectsManager';
import ProjectileManager from '@/Object/Manager/ProjectileManager';

import keyboardInput from '@/utils/KeyboardInput';
import EnemySpawner from '@/Object/Enemies/EnemySpawner';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class Level {
  /** @var {Surface} */
  surface;
  /** @var {Shooter} */
  shooter;
  /** @var {SurfaceObjectsManager} */
  surfaceObjectsManager;
  /** @var {ProjectileManager} */
  projectileManager;
  /** @var {EnemySpawner} */
  enemySpawner;

  /** @var {number} */
  currentLevel;
  /** @var {number} */
  levelInitScore;
  /** @var {number} */
  targetScore;

  /** @var {function} */
  rewardCallback;
  /** @var {function} */
  levelWonCallback;
  /** @var {function} */
  shooterKilledCallback;
  /** @var {function} */
  getCurrentScore;

  /**
   * @param {Surface} surface
   * @param {number} currentLevel
   * @param {number} levelInitScore
   * @param {number} targetScore
   * @param {function} rewardCallback
   * @param {function} levelWonCallback
   * @param {function} shooterKilledCallback
   * @param {function} getCurrentScore
   */
  constructor (
    surface,
    currentLevel,
    levelInitScore,
    targetScore,
    rewardCallback,
    levelWonCallback,
    shooterKilledCallback,
    getCurrentScore,
	game
  ) {
    this.surface = surface;

    this.currentLevel = currentLevel;
    this.levelInitScore = levelInitScore;
    this.targetScore = targetScore;

    this.rewardCallback = rewardCallback;
    this.levelWonCallback = levelWonCallback;
    this.shooterKilledCallback = shooterKilledCallback;
    this.getCurrentScore = getCurrentScore;
	this.game = game;

    this.surfaceObjectsManager = new SurfaceObjectsManager(surface);
    this.projectileManager = new ProjectileManager(this.surfaceObjectsManager);
	this.projectileManager.game = this.game;
    this.enemySpawner = new EnemySpawner(
      this.surfaceObjectsManager,
      this.projectileManager,
      this.rewardCallback,
      this.currentLevel,
      this.levelInitScore,
      this.targetScore,
	  this.game
    );

    this.shooter = new Shooter(
      surface,
      this.projectileManager,
      this.surfaceObjectsManager,
      this.shooterKilled.bind(this),
      7
    );
	this.shooter.game = this.game;

    this.surfaceObjectsManager.addShooter(this.shooter);
  }

  release () {
    this.surfaceObjectsManager.removeEnemies();
    this.surfaceObjectsManager.removeShooters();
    this.surfaceObjectsManager.removeSpikes();
    this.surfaceObjectsManager = undefined;

    this.projectileManager.removeProjectiles();
    this.projectileManager = undefined;

    this.surface = undefined;
    this.shooter = undefined;

    this.unregisterKeys();
  }

  registerKeys () {
    keyboardInput.register('KeyA', () => { this.shooter.moveLeft(); });
    keyboardInput.register('KeyD', () => { this.shooter.moveRight(); });
    keyboardInput.register('KeyW', () => { this.shooter.jump(); });
    keyboardInput.register('Space', () => { this.shooter.fire(); });
    keyboardInput.register('KeyE', () => { this.shooter.fireSuperzapper(); });
    keyboardInput.register('End', () => { this.shooter.setState(Shooter.STATE_GOING_DOWN_THE_TUBE); });
  }

  unregisterKeys () {
    keyboardInput.unregister('KeyA');
    keyboardInput.unregister('KeyD');
	keyboardInput.unregister('KeyW');
    keyboardInput.unregister('Space');
    keyboardInput.unregister('KeyE');
    keyboardInput.unregister('End');
  }

  update () {
    this.projectileManager.update();
    this.surfaceObjectsManager.update();
    this.enemySpawner.updateScore(this.getCurrentScore());

    if (this.shooter.inState(Shooter.STATE_ALIVE)) {
      this.enemySpawner.spawn();
    }

    if (this.enemySpawner.reachedScoreTarget()
      && this.surfaceObjectsManager.getAmountOfAliveEnemies() <= 3
      && !this.shooter.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)
      && !this.shooter.inState(Shooter.STATE_REACHED_TUBE_BOTTOM)
    ) {
      this.shooter.setState(Shooter.STATE_GOING_DOWN_THE_TUBE);
      messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_NEXT_LEVEL);
    }

    if (this.shooter.inState(Shooter.STATE_REACHED_TUBE_BOTTOM)) {
      this.levelWonCallback();
    }
  }

  shooterKilled () {
    this.surfaceObjectsManager.removeEnemies();

    if (this.shooterKilledCallback()) {
      this.shooter.renovate();
    }
  }
}
