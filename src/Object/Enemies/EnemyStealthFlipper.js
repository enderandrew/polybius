import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import JuiceManager from '@/utils/JuiceManager';
import Enemy from '@/Object/Enemies/Enemy';

export default class EnemyStealthFlipper extends EnemyFlipper {
  constructor(
    surface,
    projectileManager,
    rewardCallback,
    laneId = 0,
    zPosition = 1,
    game,
  ) {
    // Disguise it as a normal flipper for the core engine!
    super(
      surface,
      projectileManager,
      rewardCallback,
      laneId,
      zPosition,
      Enemy.TYPE_FLIPPER,
      game,
    );

    this.valueInPoints = 250;
    this.isStealth = true; // Flag for the Renderer

    // Cloaking Mechanics
    this.opacity = 1.0;
    this.cloakTimer = 0;
    this.cloakState = 'visible'; // visible -> fading_out -> cloaked -> fading_in
  }

  updateEntity(delta = 1 / 60) {
    super.updateEntity(delta);

    // Ensure we don't try to cloak a dead or exploding enemy
    if (
      this.inState(EnemyFlipper.STATE_DEAD) ||
      this.inState(EnemyFlipper.STATE_EXPLODING)
    ) {
      this.opacity = 1.0;
      return;
    }

    // The constants below were tuned per-frame at 60fps; scaling each by
    // `60 * delta` keeps cloak timing frame-rate independent.
    if (this.cloakState === 'visible') {
      // Roughly 1% chance per frame to start cloaking (~ every 1.5 seconds)
      if (Math.random() < 0.01 * 60 * delta) {
        this.cloakState = 'fading_out';
      }
    } else if (this.cloakState === 'fading_out') {
      this.opacity -= 0.05 * 60 * delta; // Fade out quickly
      if (this.opacity <= 0) {
        this.opacity = 0;
        this.cloakState = 'cloaked';
        this.cloakTimer = 120; // Stay invisible for ~2 seconds (frame-equivalent budget)
      }
    } else if (this.cloakState === 'cloaked') {
      this.cloakTimer -= 60 * delta;
      if (this.cloakTimer <= 0) {
        this.cloakState = 'fading_in';
        // De-cloaking is this enemy's tell — tear the screen as it reappears,
        // so the glitch itself IS the warning.
        JuiceManager.emit('phantom-attack');
      }
    } else if (this.cloakState === 'fading_in') {
      this.opacity += 0.05 * 60 * delta;
      if (this.opacity >= 1) {
        this.opacity = 1;
        this.cloakState = 'visible';
      }
    }
  }
}
