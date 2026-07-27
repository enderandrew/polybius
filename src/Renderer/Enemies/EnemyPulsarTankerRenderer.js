import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyTanker from '@/Object/Enemies/EnemyTanker';

export default class EnemyPulsarTankerRenderer extends EnemyRenderer {
  /**
   * @param {EnemyFlipperTanker} enemyFlipperTanker
   * @param {Surface} surface
   */
  constructor(enemyFlipperTanker, surface) {
    super(enemyFlipperTanker, surface, Enemy.TYPE_PULSAR_TANKER);
  }

  updateState() {
    if (!this.object || typeof this.object.inState !== 'function') {
      return;
    }
    this.positionBase.copy(this.surface.lanesMiddleCoords[this.object.laneId]);
    this.zRotationBase =
      this.surface.lanesCenterDirectionRadians[this.object.laneId];

    if (this.object.inState(EnemyTanker.STATE_EXPLODING)) {
      this.explodeAnimation();
    } else if (this.object.inState(EnemyTanker.STATE_DISAPPEARING)) {
      this.disappearingAnimation();
    }
  }
}
