import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import SurfaceObject from '@/Object/Surface/SurfaceObject';
import Enemy from '@/Object/Enemies/Enemy';
import randomRange from '@/utils/randomRange';

export default class EnemyMutantFlipper extends EnemyFlipper {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game, SurfaceObject.TYPE_FLIPPER);
    this.isMutant = true;
    
    // Move significantly faster than normal flippers
    this.zSpeed = -randomRange(9, 13) * 0.001; 
  }

  die() {
    // Ensure we don't trigger death logic twice
    if (this.inState(EnemyFlipper.STATE_DEAD)) return;

    // Proximity Scoring!
    // zPosition goes from 1 (back of tube) to 0 (player rim)
    if (this.zPosition <= 0.25) {
      this.valueInPoints = 750; // Danger close
    } else if (this.zPosition <= 0.6) {
      this.valueInPoints = 500; // Mid-tube
    } else {
      this.valueInPoints = 250; // Far away
    }

    // Call the parent die() which processes the valueInPoints
    super.die();
  }
}