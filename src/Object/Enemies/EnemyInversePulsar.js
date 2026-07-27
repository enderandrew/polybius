import EnemyPulsar from '@/Object/Enemies/EnemyPulsar';

export default class EnemyInversePulsar extends EnemyPulsar {
  constructor(
    surface,
    projectileManager,
    rewardCallback,
    laneId = 0,
    zPosition = 0.05,
    game,
  ) {
    // Note: We spawn it at zPosition = 0.05 (near the rim) instead of 1.0!
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isInverse = true;
    this.valueInPoints = 450;
    this.hitPoints = this.isStrong ? 3 : 2;

    // Force it to move positive Z (into the tube) instead of negative Z
    this.zSpeed = Math.abs(this.zSpeed || 0.015);
  }

  updateEntity() {
    super.updateEntity();

    // Since it moves backwards, it dies when it reaches the deep end of the tube (1.0)
    // Normal enemies die at 0.0.
    if (
      this.zPosition >= 1.0 &&
      !this.inState(EnemyPulsar.STATE_DEAD) &&
      !this.inState(EnemyPulsar.STATE_EXPLODING)
    ) {
      this.die();
    }
  }
}
