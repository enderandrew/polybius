import Enemy from '@/Object/Enemies/Enemy';
import State from '@/Object/State';

export default class EnemyDemonHorn extends Enemy {
  static STATE_FLYING = new State(100, 1, 'flying');
  static STATE_DEAD = new State(0, 1, 'dead');

  // Removed the 'type' parameter from constructor arguments
  constructor(
    surface,
    projectileManager,
    rewardCallback,
    laneId,
    zPosition,
    game,
  ) {
    super(
      surface,
      projectileManager,
      rewardCallback,
      laneId,
      zPosition,
      Enemy.TYPE_FLIPPER,
      game,
    );

    this.isDemonHorn = true; // Unmasking flag
    this.valueInPoints = 50;
    this.zSpeed = -0.01; // Slowed down from 0.018 to give the player a fair chance!
    this.setState(EnemyDemonHorn.STATE_FLYING);
  }

  updateState() {
    // Intentionally left empty. Collision logic moved to updateEntity for precise frame control.
  }

  updateEntity(delta = 1 / 60) {
    if (this.inState(EnemyDemonHorn.STATE_DEAD)) {
      this.alive = false;
    } else {
      // zSpeed was tuned per-frame at 60fps -> scale by delta to stay frame-rate independent.
      this.zPosition += this.zSpeed * 60 * delta;

      if (this.zPosition <= 0) {
        this.zPosition = 0;

        // If it reaches the rim in the player's lane, trigger the KILL flag!
        if (this.laneId === this.surface.activeLaneId) {
          this.setFlag(0x80); // Equivalent to EnemyFlipper.FLAG_REACHED_SHOOTER
        } else {
          // If it misses the player, it flies off screen and dies cleanly
          this.setState(EnemyDemonHorn.STATE_DEAD);
        }
      }
    }
  }

  disappear() {
    if (this.inState(EnemyDemonHorn.STATE_DEAD)) return;
    this.die();
  }

  die() {
    this.setState(EnemyDemonHorn.STATE_DEAD);
    super.die();
  }
}
