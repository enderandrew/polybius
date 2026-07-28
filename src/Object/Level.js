import Shooter from '@/Object/Shooters/Shooter';
import SurfaceObjectsManager from '@/Object/Manager/SurfaceObjectsManager';
import ProjectileManager from '@/Object/Manager/ProjectileManager';
import keyboardInput from '@/utils/KeyboardInput';
import Firewall from '@/PowerUp/Firewall';
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
  /** @var {boolean} True once release() has torn this level down. */
  released = false;

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
  constructor(
    surface,
    currentLevel,
    levelInitScore,
    targetScore,
    rewardCallback,
    levelWonCallback,
    shooterKilledCallback,
    getCurrentScore,
    game,
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
    this.firewall = new Firewall(this.surface, this.surfaceObjectsManager);

    this.enemySpawner = new EnemySpawner(
      this.surfaceObjectsManager,
      this.projectileManager,
      this.rewardCallback,
      this.currentLevel,
      this.levelInitScore,
      this.targetScore,
      this.game,
    );

    this.shooter = new Shooter(
      surface,
      this.projectileManager,
      this.surfaceObjectsManager,
      this.shooterKilled.bind(this),
      7,
    );
    this.shooter.game = this.game;

    this.surfaceObjectsManager.addShooter(this.shooter);
  }

  release() {
    this.released = true;

    // Counter-based ignites must be released or they would leak onto the
    // Surface; extinguishAllLanes() is a belt-and-braces reset.
    this.firewall.clear();
    this.surface.extinguishAllLanes();

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

  registerKeys() {
    // Continuous (held) — movement repeats while the key is down.
    keyboardInput.register('KeyA', () => {
      this.shooter.moveLeft();
    });
    keyboardInput.register('KeyD', () => {
      this.shooter.moveRight();
    });
    keyboardInput.register('Space', () => {
      this.shooter.fire();
    });

    // Discrete (one per press) — holding must not repeat these.
    keyboardInput.registerPress('KeyW', () => {
      this.shooter.jump();
    });
    keyboardInput.registerPress('KeyF', () => {
      this.shooter.fireSuperzapper();
    });
    keyboardInput.registerPress('End', () => {
      this.shooter.setState(Shooter.STATE_GOING_DOWN_THE_TUBE);
    });

    // Dash — Q/E on the left hand mirrors A/D. Note KeyE is the superzapper,
    // so dash-right uses KeyR to avoid the collision.
    keyboardInput.registerPress('KeyQ', () => {
      this.shooter.dashLeft();
    });
    keyboardInput.registerPress('KeyE', () => {
      this.shooter.dashRight();
    });

    // Player 1 - Arrows
    keyboardInput.register('ArrowLeft', () => {
      this.shooter.moveLeft();
    });
    keyboardInput.register('ArrowRight', () => {
      this.shooter.moveRight();
    });
    keyboardInput.registerPress('ArrowUp', () => {
      this.shooter.jump();
    });
    keyboardInput.registerPress('ArrowDown', () => {
      this.shooter.fireSuperzapper();
    });

    // Lane lock — polled each frame in update(), not dispatched.
    keyboardInput.track('ShiftLeft');
    keyboardInput.track('ShiftRight');

    // Global Pause
    keyboardInput.registerPress('Escape', () => {
      this.game.togglePause();
    });
  }

  unregisterKeys() {
    keyboardInput.unregister('KeyA');
    keyboardInput.unregister('KeyD');
    keyboardInput.unregister('KeyW');
    keyboardInput.unregister('Space');
    keyboardInput.unregister('KeyE');
    keyboardInput.unregister('KeyQ');
    keyboardInput.unregister('KeyF');
    keyboardInput.unregister('End');
    keyboardInput.unregister('ArrowLeft');
    keyboardInput.unregister('ArrowRight');
    keyboardInput.unregister('ArrowUp');
    keyboardInput.unregister('ArrowDown');
    keyboardInput.unregister('ShiftLeft');
    keyboardInput.unregister('ShiftRight');
    keyboardInput.unregister('Escape');
  }

  update(delta = 1 / 60) {
    // release() nulls out shooter/managers. Callbacks fired from deeper in this
    // traversal (a death on the last life, for example) can trigger a teardown
    // before the stack unwinds back to here, so bail rather than dereference
    // fields that no longer exist.
    if (this.released) {
      return;
    }

    // Lane lock is a held modifier rather than a dispatched action, so it is
    // polled. The gamepad sets its own flag in PlayMode.pollGamepads().
    this.shooter.laneLockKeyboard =
      keyboardInput.isDown('ShiftLeft') || keyboardInput.isDown('ShiftRight');

    // TIME_DILATION slows enemies only; the player keeps the real delta.
    const powerUps = this.game?.powerUpManager ?? null;
    const enemyDelta = delta * (powerUps ? powerUps.getEnemyTimeScale() : 1);

    this.projectileManager.update(delta, enemyDelta);
    this.surfaceObjectsManager.update(delta, enemyDelta);

    if (this.released) {
      return;
    }

    // Runs after entities have moved so kills reflect this frame's positions.
    this.firewall.update(powerUps, this.shooter);

    this.enemySpawner.updateScore(this.getCurrentScore());

    if (this.shooter.inState(Shooter.STATE_ALIVE)) {
      this.enemySpawner.spawn();
    }

    if (
      this.shooter.inState(Shooter.STATE_ALIVE) &&
      this.enemySpawner.reachedScoreTarget() &&
      this.surfaceObjectsManager.getAmountOfAliveEnemies() <= 3 &&
      !this.shooter.inState(Shooter.STATE_GOING_DOWN_THE_TUBE) &&
      !this.shooter.inState(Shooter.STATE_REACHED_TUBE_BOTTOM)
    ) {
      this.shooter.setState(Shooter.STATE_GOING_DOWN_THE_TUBE);
      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_NEXT_LEVEL,
      );
    }

    if (this.shooter.inState(Shooter.STATE_REACHED_TUBE_BOTTOM)) {
      this.levelWonCallback();
    }
  }

  shooterKilled() {
    this.surfaceObjectsManager.removeEnemies();

    if (this.shooterKilledCallback()) {
      this.shooter.renovate();
    }
  }
}
