import { Group } from 'three';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyFlipperRenderer from '@/Renderer/Enemies/EnemyFlipperRenderer';
import EnemySpikerRenderer from '@/Renderer/Enemies/EnemySpikerRenderer';
import EnemySpikeRenderer from '@/Renderer/Enemies/EnemySpikeRenderer';
import EnemyFlipperTankerRenderer from '@/Renderer/Enemies/EnemyFlipperTankerRenderer';
import EnemyFuseballRenderer from '@/Renderer/Enemies/EnemyFuseballRenderer';
import EnemyFuseballTankerRenderer from '@/Renderer/Enemies/EnemyFuseballTankerRenderer';
import EnemyPulsarRenderer from '@/Renderer/Enemies/EnemyPulsarRenderer';
import EnemyPulsarTankerRenderer from '@/Renderer/Enemies/EnemyPulsarTankerRenderer';

export default class EnemyRendererManager extends Group {
  /** @var {SurfaceObjectsManager} */
  surfaceObjectsManager;
  /** @var {Surface} */
  surface;

  /** @var {EnemyRenderer[]} */
  enemyRenderers = [];
  /** @var {number[][]} */
  enemyRenderersAvailabilityMap = [];

  /**
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   * @param {Surface} surface
   */
  constructor (surfaceObjectsManager, surface) {
    super();

    this.surfaceObjectsManager = surfaceObjectsManager;
    this.surface = surface;
  }

  update () {
    if (this.surfaceObjectsManager.rendererHelperNewObjectsIds.length !== 0) {
      this.surfaceObjectsManager.enemies
        .filter(enemy => this.surfaceObjectsManager.rendererHelperNewObjectsIds.includes(enemy.objectId))
        .forEach(enemy => {
          this.pushEnemy(enemy);
        });

      this.surfaceObjectsManager.spikes
        .filter(spike => this.surfaceObjectsManager.rendererHelperNewObjectsIds.includes(spike.objectId))
        .forEach(spike => {
          this.pushEnemy(spike);
        });

      this.surfaceObjectsManager.rendererHelperNewObjectsIds.length = 0;
    }

    this.enemyRenderers.forEach((enemyRenderer, index) => {
      if (enemyRenderer.object === null) {
        return;
      }

      if (!enemyRenderer.object.alive) {
        if (!(enemyRenderer.objectType in this.enemyRenderersAvailabilityMap)) {
          this.enemyRenderersAvailabilityMap[enemyRenderer.objectType] = [];
        }

        this.enemyRenderersAvailabilityMap[enemyRenderer.objectType].push(index);

        enemyRenderer.breakObjectRef();
      } else {
        enemyRenderer.update();
      }
    });
  }

  /**
   * @param {Enemy} enemy
   */
  pushEnemy (enemy) {
    const renderType = enemy.isMutant ? Enemy.TYPE_MUTANT_FLIPPER : (enemy.isStealth ? Enemy.TYPE_STEALTH_FLIPPER : enemy.type);

    if (renderType in this.enemyRenderersAvailabilityMap && this.enemyRenderersAvailabilityMap[renderType].length) {
      this.enemyRenderers[this.enemyRenderersAvailabilityMap[renderType].shift()].setObjectRef(enemy);
    } else {
      this.enemyRenderers.push(this.enemyRendererFactory(enemy));
      this.add(this.enemyRenderers[this.enemyRenderers.length - 1]);
    }
  }

  /**
   * @param {Enemy|EnemyFlipper|EnemySpiker|EnemySpike|EnemyFlipperTanker|EnemyPulsar} enemy
   */
  enemyRendererFactory (enemy) {
    const renderType = enemy.isMutant ? Enemy.TYPE_MUTANT_FLIPPER : (enemy.isStealth ? Enemy.TYPE_STEALTH_FLIPPER : enemy.type);
    
    switch (renderType) {
      case Enemy.TYPE_FLIPPER:
      case Enemy.TYPE_MUTANT_FLIPPER:
	  case Enemy.TYPE_STEALTH_FLIPPER:
        return new EnemyFlipperRenderer(enemy, this.surface, renderType);
      case Enemy.TYPE_SPIKER:
        return new EnemySpikerRenderer(enemy, this.surface);
      case Enemy.TYPE_SPIKE:
        return new EnemySpikeRenderer(enemy, this.surface);
      case Enemy.TYPE_FLIPPER_TANKER:
        return new EnemyFlipperTankerRenderer(enemy, this.surface);
      case Enemy.TYPE_FUSEBALL:
        return new EnemyFuseballRenderer(enemy, this.surface);
      case Enemy.TYPE_FUSEBALL_TANKER:
        return new EnemyFuseballTankerRenderer(enemy, this.surface);
      case Enemy.TYPE_PULSAR:
        return new EnemyPulsarRenderer(enemy, this.surface);
      case Enemy.TYPE_PULSAR_TANKER:
        return new EnemyPulsarTankerRenderer(enemy, this.surface);
      default:
        throw new Error(`Can't find constructor for enemy of type ${enemy.type}`);
    }
  }
}
