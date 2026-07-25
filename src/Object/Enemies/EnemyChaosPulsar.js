import EnemyPulsar from '@/Object/Enemies/EnemyPulsar';

export default class EnemyChaosPulsar extends EnemyPulsar {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isChaos = true;
    this.valueInPoints = 500;
    this.hitPoints = this.isStrong ? 3 : 2;
    this._chaosLanes = [];
  }

  getShortedLanes() {
    // Generate new random lanes once per pulse phase
    if (this._chaosLanes.length === 0) {
      let l1 = Math.floor(Math.random() * this.surface.lanesAmount);
      let l2 = Math.floor(Math.random() * this.surface.lanesAmount);
      while (l1 === l2) l2 = Math.floor(Math.random() * this.surface.lanesAmount);
      
      this._chaosLanes = [l1, l2];
    }
    return this._chaosLanes;
  }

  updateEntity() {
    super.updateEntity();
    
    // Clear the cached random lanes when the pulsar stops shorting
    // (Assuming you use this.isShorted, FLAG_SHORTING, or STATE_PULSING in the base class)
    if (this.inState && !this.inState(EnemyPulsar.STATE_PULSATING)) {
        this._chaosLanes = [];
    }
  }
}