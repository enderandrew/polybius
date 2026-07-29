import FIFOManager from '@/Object/Manager/FIFOManager';
import JuiceManager from '@/utils/JuiceManager';
import Enemy from '@/Object/Enemies/Enemy';
import EnemySpike from '@/Object/Enemies/EnemySpike';

export default class SurfaceObjectsManager extends FIFOManager {
  /** {Surface} */
  surface;

  /** {Shooter[]} */
  shooters = [];
  /** {Enemy[]} */
  enemies = [];
  /** {Spike[]} */
  spikes = [];

  /** {array} */
  shootersMap;
  /** {array} */
  enemiesMap;
  /** {array} */
  spikesMap;

  /** @var {number[]} */
  rendererHelperNewObjectsIds = [];

  /**
   * @param {Surface} surface
   */
  constructor(surface) {
    super();

    this.surface = surface;
    this.shootersMap = new Array(this.surface.lanesAmount)
      .fill(0)
      .map(() => []);
    this.enemiesMap = new Array(this.surface.lanesAmount).fill(0).map(() => []);
    this.spikesMap = new Array(this.surface.lanesAmount).fill(0).map(() => []);
  }

  addShooter(shooter) {
    this.shooters.push(shooter);
    this.rendererHelperNewObjectsIds.push(
      this.shooters[this.shooters.length - 1].objectId,
    );
  }

  addEnemy(enemy) {
    this.enemies.push(enemy);
    this.rendererHelperNewObjectsIds.push(
      this.enemies[this.enemies.length - 1].objectId,
    );

    this.createSpikes(enemy);

    return enemy;
  }

  addSpike(spike) {
    this.spikes.push(spike);
    this.rendererHelperNewObjectsIds.push(
      this.spikes[this.spikes.length - 1].objectId,
    );
  }

  createSpikes(enemy) {
    if (enemy.type === Enemy.TYPE_SPIKER) {
      if (
        this.spikesMap[enemy.laneId].length === 0 ||
        this.spikesMap[enemy.laneId].length ===
          this.spikesMap[enemy.laneId].filter((spike) => !spike.alive).length
      ) {
        const spike = new EnemySpike(
          enemy.surface,
          enemy.projectileManager,
          enemy.rewardCallback,
          enemy.laneId,
        );
        if (enemy.isPhantom) spike.isPhantom = true; // Propagate to the spike it creates
        this.addSpike(spike);
      }
    }
  }

  _pendingSpawns = [];

  /**
   * Queue a spawn to happen safely at the start of the next update tick.
   * @param {Function} factoryFn  () => EnemyInstance — called during drain
   */
  queueSpawn(factoryFn) {
    this._pendingSpawns.push(factoryFn);
  }

  _drainPendingSpawns() {
    if (this._pendingSpawns.length === 0) return;
    const queue = this._pendingSpawns;
    this._pendingSpawns = [];
    queue.forEach((factoryFn) => {
      try {
        factoryFn();
      } catch (e) {
        console.error('SurfaceObjectsManager: queued spawn failed', e);
      }
    });
  }

  /**
   * @param {number} delta      - real frame delta; drives the player.
   * @param {number} enemyDelta - possibly slowed delta (TIME_DILATION);
   *                              drives enemies and spikes. Defaults to delta
   *                              so existing callers are unaffected.
   */
  update(delta = 1 / 60, enemyDelta = delta) {
    this._drainPendingSpawns();

    this.shooters.forEach((shooter) => shooter.update(delta));
    this.enemies.forEach((enemy) => enemy.update(enemyDelta));

    for (let i = 0; i < this.spikes.length; i++) {
      const spike = this.spikes[i];
      const enemiesInLane = this.enemiesMap[spike.laneId];
      const validSpikers = [];
      for (let j = 0; j < enemiesInLane.length; j++) {
        const enemy = enemiesInLane[j];
        if (enemy.type === Enemy.TYPE_SPIKER) {
          validSpikers.push(enemy);
        }
      }

      spike.extendToLowestSpiker(validSpikers);
      spike.update(enemyDelta);
    }

    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  runGarbageCollector() {
    if (this.shouldTriggerGarbageCollector()) {
      const collectedEnemies = FIFOManager.garbageCollector(this.enemies);
      if (collectedEnemies) {
        this.forceMapsUpdate = true;
      }

      // if (collectedEnemies) console.log(`Collected ${collectedEnemies} enemies`);

      const collectedSpikes = FIFOManager.garbageCollector(this.spikes);
      if (collectedSpikes) {
        this.forceMapsUpdate = true;
      }

      // if (collectedSpikes) console.log(`Collected ${collectedSpikes} spikes`);
    }
  }

  updateObjectsMap() {
    FIFOManager.updateMap(
      this.shooters,
      this.shootersMap,
      this.forceMapsUpdate,
    );
    FIFOManager.updateMap(this.enemies, this.enemiesMap, this.forceMapsUpdate);
    FIFOManager.updateMap(this.spikes, this.spikesMap, this.forceMapsUpdate);

    this.forceMapsUpdate = false;
  }

  handleSuperzapper() {
    // Fire the juice event BEFORE the kills so the flash/shake lands on the
    // same frame the enemies vanish, rather than one frame late.
    JuiceManager.emit('superzapper');

    this.enemies.forEach((enemy) => {
      enemy.reward = true;
      enemy.die();
    });
  }

  removeEnemies() {
    this.enemies.forEach((enemy) => {
      enemy.disappear();
    });
    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  removeSpikes() {
    this.spikes.forEach((enemy) => {
      enemy.disappear();
    });
    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  removeShooters() {
    this.shooters.forEach((shooter) => {
      shooter.disappear();
    });
    this.runGarbageCollector();
    this.updateObjectsMap();
  }

  purgePlayField() {
    this.removeEnemies();
    this.removeSpikes();
    this.removeShooters();
  }

  getAmountOfAliveEnemies() {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].alive) count++;
    }
    return count;
  }
}
