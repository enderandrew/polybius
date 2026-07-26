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
import EnemyMirrorRenderer from '@/Renderer/Enemies/EnemyMirrorRenderer';

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
      const newIds = this.surfaceObjectsManager.rendererHelperNewObjectsIds;
      if (newIds.length > 0) {
        for (let i = 0; i < this.surfaceObjectsManager.enemies.length; i++) {
          const enemy = this.surfaceObjectsManager.enemies[i];
          if (newIds.includes(enemy.objectId)) {
            this.pushEnemy(enemy);
          }
        }
        
        for (let i = 0; i < this.surfaceObjectsManager.spikes.length; i++) {
          const spike = this.surfaceObjectsManager.spikes[i];
          if (newIds.includes(spike.objectId)) {
            this.pushEnemy(spike);
          }
        }
      }

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
    let renderType = enemy.type;
    if (enemy.isMutant) renderType = Enemy.TYPE_MUTANT_FLIPPER;
    else if (enemy.isStealth) renderType = Enemy.TYPE_STEALTH_FLIPPER;
    else if (enemy.isDemonHead) renderType = Enemy.TYPE_DEMON_HEAD;
    else if (enemy.isDemonHorn) renderType = Enemy.TYPE_DEMON_HORN;

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
    let renderType = enemy.type;
    if (enemy.isMutant) renderType = Enemy.TYPE_MUTANT_FLIPPER;
    else if (enemy.isStealth) renderType = Enemy.TYPE_STEALTH_FLIPPER;
    else if (enemy.isDemonHead) renderType = Enemy.TYPE_DEMON_HEAD;
    else if (enemy.isDemonHorn) renderType = Enemy.TYPE_DEMON_HORN;
    
    switch (renderType) {
      case Enemy.TYPE_FLIPPER:
      case Enemy.TYPE_MUTANT_FLIPPER:
      case Enemy.TYPE_STEALTH_FLIPPER:
      case Enemy.TYPE_DEMON_HEAD: 
        return new EnemyFlipperRenderer(enemy, this.surface, renderType);
      case Enemy.TYPE_SPIKER:
      case Enemy.TYPE_DEMON_HORN:
        return new EnemySpikerRenderer(enemy, this.surface, renderType);
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
      case Enemy.TYPE_MIRROR:
        return new EnemyMirrorRenderer(enemy, this.surface);
      default:
        throw new Error(`Can't find constructor for enemy of type ${enemy.type}`);
    }
  }

  /**
   * Safely disposes of all pooled and active renderers when the level ends.
   */
  dispose () {
    // Trigger the custom dispose on every renderer we created
    this.enemyRenderers.forEach(renderer => {
      if (typeof renderer.dispose === 'function') {
        renderer.dispose();
      }
    });

    // Clear our tracking arrays
    this.enemyRenderers = [];
    this.enemyRenderersAvailabilityMap = [];

    // Remove all children from this Three.js Group
    this.clear();
  }
}
