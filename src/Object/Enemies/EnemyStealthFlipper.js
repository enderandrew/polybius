import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import Enemy from '@/Object/Enemies/Enemy';

export default class EnemyStealthFlipper extends EnemyFlipper {
  constructor(surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    // Disguise it as a normal flipper for the core engine!
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game, Enemy.TYPE_FLIPPER);

    this.valueInPoints = 250;
    this.isStealth = true; // Flag for the Renderer

    // Cloaking Mechanics
    this.opacity = 1.0;
    this.cloakTimer = 0;
    this.cloakState = 'visible'; // visible -> fading_out -> cloaked -> fading_in
  }

  updateEntity() {
    super.updateEntity();

    // Ensure we don't try to cloak a dead or exploding enemy
    if (this.inState(EnemyFlipper.STATE_DEAD) || this.inState(EnemyFlipper.STATE_EXPLODING)) {
        this.opacity = 1.0;
        return;
    }

    if (this.cloakState === 'visible') {
        // Roughly 1% chance per frame to start cloaking (~ every 1.5 seconds)
        if (Math.random() < 0.01) {
            this.cloakState = 'fading_out';
        }
    } else if (this.cloakState === 'fading_out') {
        this.opacity -= 0.05; // Fade out quickly
        if (this.opacity <= 0) {
            this.opacity = 0;
            this.cloakState = 'cloaked';
            this.cloakTimer = 120; // Stay invisible for ~2 seconds (assuming 60fps)
        }
    } else if (this.cloakState === 'cloaked') {
        this.cloakTimer--;
        if (this.cloakTimer <= 0) {
            this.cloakState = 'fading_in';
        }
    } else if (this.cloakState === 'fading_in') {
        this.opacity += 0.05;
        if (this.opacity >= 1) {
            this.opacity = 1;
            this.cloakState = 'visible';
        }
    }
  }
}