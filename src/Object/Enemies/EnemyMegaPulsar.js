import EnemyPulsar from '@/Object/Enemies/EnemyPulsar';

export default class EnemyMegaPulsar extends EnemyPulsar {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isMega = true;
    this.valueInPoints = 400;
    this.hitPoints = this.isStrong ? 3 : 2;
  }

  // Override the hook we just made!
  getShortedLanes() {
    const leftLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId - 1);
    const rightLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId + 1);
    return [leftLane, this.laneId, rightLane];
  }
}