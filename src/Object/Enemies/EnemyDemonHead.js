import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import EnemyDemonHorn from '@/Object/Enemies/EnemyDemonHorn';
import Enemy from '@/Object/Enemies/Enemy'; 
import randomRange from '@/utils/randomRange';

export default class EnemyDemonHead extends EnemyFlipper {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, Enemy.TYPE_FLIPPER, game);
  
    this.isDemonHead = true;
	this.firstLevel = 9;
    this.valueInPoints = 150;
    this.zSpeed = -randomRange(7, 10) * 0.001; 
  }

  die () {
    if (this.inState(EnemyFlipper.STATE_DEAD) || this.inState(EnemyFlipper.STATE_EXPLODING)) {
      return;
    }
  
    if (this.game?.levelObject) {
      const mgr  = this.game.levelObject.surfaceObjectsManager;
      const zPos = this.zPosition;
  
      const leftLane  = this.surface.getActualLaneIdFromProjectedMovement(this.laneId - 1);
      const rightLane = this.surface.getActualLaneIdFromProjectedMovement(this.laneId + 1);
  
      mgr.queueSpawn(() => mgr.addEnemy(new EnemyDemonHorn(
        this.surface, this.projectileManager, this.rewardCallback, leftLane, zPos, this.game
      )));
      mgr.queueSpawn(() => mgr.addEnemy(new EnemyDemonHorn(
        this.surface, this.projectileManager, this.rewardCallback, rightLane, zPos, this.game
      )));
    }
  
    super.die();
  }
}