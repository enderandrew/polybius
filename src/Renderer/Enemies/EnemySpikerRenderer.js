import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import EnemySpiker from '@/Object/Enemies/EnemySpiker';

export default class EnemySpikerRenderer extends EnemyRenderer {
  // Removed legacy @readonly decorator
  static ROTATION_SPEED = 0.1;

  /**
   * @param {EnemySpiker} enemySpiker
   * @param {Surface} surface
   */
  constructor (enemySpiker, surface) {
    super(enemySpiker, surface, Enemy.TYPE_SPIKER);
  }

  updateState () {
    this.positionBase = this.surface.lanesMiddleCoords[this.object.laneId].clone();
    this.zRotationBase = this.surface.lanesCenterDirectionRadians[this.object.laneId];

    if (this.object.inState(EnemySpiker.STATE_EXPLODING)) {
      this.explodeAnimation();

    } else if (this.object.inState(EnemySpiker.STATE_DISAPPEARING)) {
      this.disappearingAnimation();

    } else {
      this.zRotationOffset += EnemySpikerRenderer.ROTATION_SPEED;
    }
  }
}