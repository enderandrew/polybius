import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import EnemyDemonHorn from '@/Object/Enemies/EnemyDemonHorn';
import Enemy from '@/Object/Enemies/Enemy'; 
import randomRange from '@/utils/randomRange';

export default class EnemyDemonHead extends EnemyFlipper {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game, Enemy.TYPE_FLIPPER);
  
    this.isDemonHead = true; 
    this.valueInPoints = 150;
    this.zSpeed = -randomRange(7, 10) * 0.001; 
  }

  die() {
    if (this.inState(EnemyFlipper.STATE_DEAD) || this.inState(EnemyFlipper.STATE_EXPLODING)) {
        return;
    }
    
    // RETALIATION MECHANIC: Spawn horns on adjacent lanes when destroyed!
    if (this.game && this.game.levelObject) {
      const manager = this.game.levelObject.surfaceObjectsManager;
      
      // Calculate adjacent lanes, natively handling tube wrap-around
      const leftLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId - 1);
      const rightLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId + 1);
      
      manager.addEnemy(new EnemyDemonHorn(this.surface, this.projectileManager, this.rewardCallback, leftLane, this.zPosition, this.game));
      manager.addEnemy(new EnemyDemonHorn(this.surface, this.projectileManager, this.rewardCallback, rightLane, this.zPosition, this.game));
    }

    // Call the parent die method to handle explosions and points
    super.die();
  }
}