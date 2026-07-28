import SurfaceObject from '@/Object/Surface/SurfaceObject';
import ShootingSurfaceObject from '@/Object/Surface/ShootingSurfaceObject';
import State from '@/Object/State';
import EnemyFlipper from '@/Object/Enemies/EnemyFlipper';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class Shooter extends ShootingSurfaceObject {
  static LANE_CHANGE_TIMEOUT_MS = 50;
  static SHOOT_TIMEOUT_MS = 80;
  static BURST_PENALTY_MS = 500;

  static TUBE_DESCENDING_LENGTH_MULTIPLIER = 2;
  static TUBE_APPROACHING_LENGTH_MULTIPLIER = 4;
  static COLLISION_RADIUS_FORWARD = 0;
  static COLLISION_RADIUS_BACKWARD = 0.08;

  static STATE_ALIVE = new State(1000, 1, 'alive');
  static STATE_EXPLODING = new State(1000, 1, 'exploding');
  static STATE_DISAPPEARING = new State(1000, 1, 'disappearing');
  static STATE_RENOVATING = new State(1000, 1, 'renovating');
  static STATE_APPROACHING_TUBE = new State(2000, 1, 'approaching_tube');
  static STATE_GOING_DOWN_THE_TUBE = new State(4000, 1, 'going_down_the_tube');
  static STATE_REACHED_TUBE_BOTTOM = new State(0, 1, 'reached_tube_bottom');
  static STATE_DEAD = new State(0, 1, 'dead');
  static STATE_JUMPING = new State(600, 1, 'jumping');
  static JUMP_HEIGHT = -0.3; // Negative Z = above the rim

  // Jump grants full hazard immunity for the whole of STATE_JUMPING (see the
  // STATE_JUMPING guard in updateEntity). Without a cooldown longer than that
  // 600ms window the player could re-jump the frame it ends and stay
  // effectively invulnerable forever, so this must stay > STATE_JUMPING's
  // duration to leave a real window of exposure on the ground.
  static JUMP_COOLDOWN_MS = 1400;

  // Dash teleports this many lanes at once. Because it is atomic, the player
  // never occupies the lanes in between — which is what lets a dash cross a
  // Pulsar-shorted band that walking across would be fatal. The destination
  // lane is still evaluated normally.
  static DASH_LANES = 3;
  static DASH_COOLDOWN_MS = 600;

  // Phase Dash power-up overrides. The i-frame window MUST stay shorter than
  // the cooldown, or spamming dash would chain the windows together into
  // permanent invulnerability — the same trap the jump cooldown exists to
  // avoid. The gap between them is the player's exposed time.
  static PHASE_DASH_LANES = 5;
  static PHASE_DASH_COOLDOWN_MS = 400;
  static PHASE_DASH_IFRAME_MS = 220;

  // Damage dealt to enemies the dash passes through, and how close to the rim
  // they must be to be hit. The depth limit keeps this a melee-range punish
  // rather than a lane-clearing wipe: at 5 lanes every 400ms an unrestricted
  // version would out-damage every weapon in the game.
  static PHASE_DASH_DAMAGE = 1;
  static PHASE_DASH_HIT_DEPTH = 0.3;

  static FLAG_ITS_ALREADY_TOO_LATE = 0x1;
  static FLAG_SUPERZAPPER_USED = 0x2;

  penaltyTimestamp = 0;
  jumpTimestamp = 0;
  dashTimestamp = 0;

  /** Wall-clock ms until which Phase Dash i-frames are active. */
  phaseUntil = 0;

  /** Lanes crossed by the most recent Phase Dash, for the trail renderer. */
  dashTrailPath = [];
  /** Wall-clock ms until which the dash trail should render. */
  dashTrailUntil = 0;

  // Lane lock is held from two independent sources that are polled at
  // different points in the frame; tracking them separately avoids one input
  // device clearing the other's state depending on ordering.
  laneLockKeyboard = false;
  laneLockGamepad = false;
  lastLaneChangeTimestamp;
  laneChangeTimeoutMs;
  surfaceObjectsManager;
  killedCallback;

  /**
   * @param {Surface} surface
   * @param {ProjectileManager} projectileManager
   * @param {SurfaceObjectsManager} surfaceObjectsManager
   * @param {function} killedCallback
   * @param {number} laneId
   */
  constructor(
    surface,
    projectileManager,
    surfaceObjectsManager,
    killedCallback,
    laneId = 0,
  ) {
    super(surface, projectileManager, laneId, SurfaceObject.TYPE_SHOOTER);

    this.surfaceObjectsManager = surfaceObjectsManager;
    this.killedCallback = killedCallback;

    this.zPosition = 0;

    this.shootTimeoutMs = Shooter.SHOOT_TIMEOUT_MS;
    this.laneChangeTimeoutMs = Shooter.LANE_CHANGE_TIMEOUT_MS;

    this.hittable = false;
    this.canShoot = false;

    this.surface.setActiveLane(laneId);
    this.setState(Shooter.STATE_APPROACHING_TUBE);
  }

  updateState() {
    if (this.inState(Shooter.STATE_RENOVATING)) {
      this.hittable = true;
      this.canShoot = true;

      this.setState(Shooter.STATE_ALIVE);
    } else if (this.inState(Shooter.STATE_EXPLODING)) {
      this.setState(Shooter.STATE_DEAD);
      this.killedCallback();
    } else if (this.inState(Shooter.STATE_DISAPPEARING)) {
      this.setState(Shooter.STATE_DEAD);
    } else if (this.inState(Shooter.STATE_DEAD)) {
      this.alive = false;
    } else if (this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
      this.setState(Shooter.STATE_REACHED_TUBE_BOTTOM);
      this.die();
    } else if (this.inState(Shooter.STATE_APPROACHING_TUBE)) {
      this.hittable = true;
      this.canShoot = true;
      this.setState(Shooter.STATE_ALIVE);
    } else if (this.inState(Shooter.STATE_JUMPING)) {
      this.setState(Shooter.STATE_ALIVE);
      this.zPosition = 0;
    }
  }

  updateEntity() {
    if (
      this.inState(Shooter.STATE_ALIVE) ||
      this.inState(Shooter.STATE_APPROACHING_TUBE)
    ) {
      if (!this.isShieldInvincible) {
        const gameRef =
          this.game || (this.projectileManager && this.projectileManager.game);
        // Recomputed every frame, so when the phase window lapses hittability
        // restores itself on the next tick — no timer to leak or cancel.
        this.hittable =
          !gameRef?.powerUpManager?.hasPhantom && !this.isPhasing;
      }
    }
    if (
      this.isFlagNotSet(Shooter.FLAG_ITS_ALREADY_TOO_LATE) &&
      !this.inState(Shooter.STATE_JUMPING) &&
      !this.isPhasing
    ) {
      this.handleShortedLanes();

      if (!this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
        this.handleCaptureByEnemy();
      } else {
        if (this.zPosition <= 1) {
          this.handleCollisionWithEnemy();
          this.handleCollisionWithSpike();
        }
      }
    }

    if (this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) {
      this.zPosition =
        this.stateProgressInTime() * Shooter.TUBE_DESCENDING_LENGTH_MULTIPLIER;
    } else if (this.inState(Shooter.STATE_APPROACHING_TUBE)) {
      this.zPosition =
        -1 *
        (1 - this.stateProgressInTime()) *
        Shooter.TUBE_APPROACHING_LENGTH_MULTIPLIER;
    } else if (
      this.inState(Shooter.STATE_ALIVE) ||
      this.inState(Shooter.STATE_RENOVATING)
    ) {
      this.zPosition = 0;
    } else if (this.inState(Shooter.STATE_JUMPING)) {
      // Sine arc: launches up, hangs at peak, comes back down
      const arc = Math.sin(this.stateProgressInTime() * Math.PI);
      this.zPosition = Shooter.JUMP_HEIGHT * arc;
    }
  }

  handleShortedLanes() {
    if (!this.hittable) return;
    if (this.surface.isLaneShorted(this.laneId)) {
      this.shockedByPulsar();
    }
  }

  handleCaptureByEnemy() {
    if (!this.hittable) return;
    let enemiesMapRef = this.surfaceObjectsManager.enemiesMap[this.laneId];

    if (enemiesMapRef.length > 0) {
      enemiesMapRef.forEach((enemy) => {
        if (
          enemy.type === Enemy.TYPE_FLIPPER &&
          enemy.isFlagSet(EnemyFlipper.FLAG_REACHED_SHOOTER)
        ) {
          this.capturedByFlipper();
        }

        if (
          enemy.type === Enemy.TYPE_FUSEBALL &&
          enemy.isFlagSet(EnemyFuseball.FLAG_REACHED_SHOOTER)
        ) {
          this.capturedByFuseball();
        }
      });
    }
  }

  handleCollisionWithEnemy() {
    if (!this.hittable) return;
    let enemiesMapRef = this.surfaceObjectsManager.enemiesMap[this.laneId];

    let collision = enemiesMapRef.findIndex(
      (object) =>
        object.hittable &&
        object.alive &&
        object.zPosition >=
          this.zPosition - Shooter.COLLISION_RADIUS_BACKWARD &&
        object.zPosition <= this.zPosition + Shooter.COLLISION_RADIUS_FORWARD,
    );

    if (collision >= 0) {
      enemiesMapRef[collision].hitByProjectile();
      this.hitByProjectile();
    }
  }

  handleCollisionWithSpike() {
    if (!this.hittable) return;
    let spikesMapRef = this.surfaceObjectsManager.spikesMap[this.laneId];

    let collision = spikesMapRef.findIndex(
      (object) =>
        object.hittable &&
        object.alive &&
        object.zPosition <= this.zPosition + Shooter.COLLISION_RADIUS_FORWARD,
    );

    if (collision >= 0) {
      this.impaledOnSpike();
    }
  }

  /**
   * @param {number} desiredLane
   */
  moveToLane(desiredLane) {
    if (
      !this.inState(Shooter.STATE_ALIVE) &&
      !this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE) &&
      !this.inState(Shooter.STATE_APPROACHING_TUBE)
    ) {
      return;
    }

    // Lane lock is the whole point of the input — it must suppress movement
    // silently, with no lane-change sound, so holding it feels inert.
    if (this.isLaneLocked) {
      return;
    }

    let now = Date.now();

    if (now - this.lastLaneChangeTimestamp < Shooter.LANE_CHANGE_TIMEOUT_MS) {
      return;
    }

    this.setLane(desiredLane);
    this.surface.setActiveLane(this.laneId);

    this.lastLaneChangeTimestamp = now;

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_CHANGED_LANE,
    );
  }

  moveLeft() {
    this.moveToLane(this.laneId + 1);
  }

  moveRight() {
    this.moveToLane(this.laneId - 1);
  }

  fire() {
    if (
      !this.canShoot ||
      this.zPosition > 1 ||
      (!this.inState(Shooter.STATE_ALIVE) &&
        !this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE) &&
        !this.inState(Shooter.STATE_JUMPING))
    ) {
      return;
    }

    const powerUps = this.game?.powerUpManager;
    let now = Date.now();
    let cooldownMs = powerUps
      ? powerUps.getShotCooldown(this.shootTimeoutMs)
      : this.shootTimeoutMs;

    if (this.lastFiredTimestamp && now - this.lastFiredTimestamp < cooldownMs)
      return;
    if (now - this.penaltyTimestamp < Shooter.BURST_PENALTY_MS) return;

    let firedAny = false;

    // --- DETERMINE PRIMARY WEAPON ---
    let primaryWeapon = 'NORMAL';
    if (powerUps && powerUps.hasGrenade) primaryWeapon = 'GRENADE';
    else if (powerUps && powerUps.hasLaser) primaryWeapon = 'LASER';

    let primaryLanes = [this.laneId];

    // Spread Gun Synergy
    if (powerUps && powerUps.hasSpreadGun) {
      if (primaryWeapon === 'GRENADE') {
        // Spread + Grenade = exactly 2 grenades overlapping AoE from the sides
        primaryLanes = [-1, 1]
          .map((offset) => this.surface.getTargetLaneId(this.laneId, offset))
          .filter((lane) => lane !== null);
      } else {
        // Spread + Laser/Normal = 3 projectiles (Left, Center, Right)
        primaryLanes = [-1, 0, 1]
          .map((offset) => this.surface.getTargetLaneId(this.laneId, offset))
          .filter((lane) => lane !== null);
      }
    }

    // Fire Primary
    primaryLanes.forEach((lane) => {
      // '1' is Projectile.SOURCE_SHOOTER
      if (
        this.projectileManager.fire(lane, 1, this.zPosition, 1, primaryWeapon)
      ) {
        firedAny = true;
      }
    });

    // --- DETERMINE SECONDARY WEAPON (MISSILE) ---
    let missileFired = false;
    if (powerUps && powerUps.hasMissile) {
      // Limit to 2 if Rapid Fire is active, otherwise 1
      const maxMissiles = powerUps.hasRapidFire ? 2 : 1;
      const activeMissiles = this.projectileManager.shooterProjectiles.filter(
        (p) => p.isMissile && p.alive,
      );

      if (activeMissiles.length < maxMissiles) {
        // Spread + Missile Synergy
        let missileLanes = [this.laneId];
        if (powerUps.hasSpreadGun) {
          // Shoot missiles out of the left/right wingmen lanes!
          missileLanes = [-1, 1]
            .map((offset) => this.surface.getTargetLaneId(this.laneId, offset))
            .filter((lane) => lane !== null);
        }

        let capacity = maxMissiles - activeMissiles.length;
        for (let i = 0; i < Math.min(missileLanes.length, capacity); i++) {
          if (
            this.projectileManager.fire(
              missileLanes[i],
              1,
              this.zPosition,
              1,
              'MISSILE',
            )
          ) {
            firedAny = true;
            missileFired = true;
          }
        }
      }
    }

    // --- HANDLE AUDIO & PENALTIES ---
    if (!firedAny) {
      this.penaltyTimestamp = now;
    } else {
      this.lastFiredTimestamp = now;

      // Audio Prioritization
      if (primaryWeapon === 'LASER') {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_LASER,
        );
      } else if (primaryWeapon === 'GRENADE') {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_GRENADE,
        );
      } else if (missileFired && primaryWeapon === 'NORMAL') {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_MISSILE,
        );
      } else {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT,
        );
      }
    }
  }

  jump() {
    // Deliberately NOT gated on isLaneLocked: lock governs lateral movement.
    // Jump is vertical and is the player's dodge, so holding lock to steady
    // your aim must never cost you the ability to evade.
    if (!this.inState(Shooter.STATE_ALIVE) || !this.canShoot) {
      return;
    }

    // jumpTimestamp was previously written here and never read anywhere —
    // the cooldown it implies is now actually enforced.
    if (Date.now() - this.jumpTimestamp < Shooter.JUMP_COOLDOWN_MS) {
      return;
    }

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_JUMP,
    );
    this.jumpTimestamp = Date.now();
    this.setState(Shooter.STATE_JUMPING);
  }

  /** True while either input source is holding lane lock. */
  get isLaneLocked() {
    return this.laneLockKeyboard || this.laneLockGamepad;
  }

  /** Fraction of the jump cooldown elapsed, 0..1. For HUD / renderer use. */
  get jumpCooldownProgress() {
    const elapsed = Date.now() - this.jumpTimestamp;
    return Math.min(1, elapsed / Shooter.JUMP_COOLDOWN_MS);
  }

  /** Fraction of the dash cooldown elapsed, 0..1. For HUD / renderer use. */
  get dashCooldownProgress() {
    const elapsed = Date.now() - this.dashTimestamp;
    return Math.min(1, elapsed / Shooter.DASH_COOLDOWN_MS);
  }

  /**
   * Resolves the active PowerUpManager. Shooter is constructed before `game`
   * is attached in some paths, and ProjectileManager carries a `game` ref too,
   * so both are checked — this mirrors the fallback already used in
   * updateEntity() and _checkAndConsumeShield().
   *
   * @return {?PowerUpManager}
   */
  get powerUps() {
    const gameRef =
      this.game || (this.projectileManager && this.projectileManager.game);
    return gameRef?.powerUpManager ?? null;
  }

  /** True during the brief intangible window after a Phase Dash. */
  get isPhasing() {
    return Date.now() < this.phaseUntil;
  }

  /** Lanes covered by a single dash, upgraded by Phase Dash. */
  get dashLaneCount() {
    return this.powerUps?.hasPhaseDash
      ? Shooter.PHASE_DASH_LANES
      : Shooter.DASH_LANES;
  }

  /** Dash recharge time, shortened by Phase Dash. */
  get dashCooldownMs() {
    return this.powerUps?.hasPhaseDash
      ? Shooter.PHASE_DASH_COOLDOWN_MS
      : Shooter.DASH_COOLDOWN_MS;
  }

  dashLeft() {
    this.dash(this.dashLaneCount);
  }

  dashRight() {
    this.dash(-this.dashLaneCount);
  }

  /**
   * Atomic multi-lane hop. Unlike repeated moveToLane() calls this never places
   * the shooter in the intervening lanes, so hazards that are evaluated from
   * `laneId` each frame (shorted lanes, lane-local enemy checks) are skipped
   * over rather than crossed. The landing lane is NOT exempt.
   *
   * @param {number} offset - signed lane delta, matching moveLeft/moveRight's
   *   convention where left is +1.
   */
  dash(offset) {
    if (
      !this.inState(Shooter.STATE_ALIVE) &&
      !this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)
    ) {
      return;
    }

    if (this.isLaneLocked) {
      return;
    }

    const now = Date.now();
    if (now - this.dashTimestamp < this.dashCooldownMs) {
      return;
    }

    let targetLane = this.surface.getTargetLaneId(this.laneId, offset);

    // Open surfaces return null past the edge. Clamp toward the edge instead of
    // dropping the input — a dash the player committed to should always do
    // something, even if it travels less than the full distance.
    if (targetLane === null) {
      targetLane = this._clampDashTarget(offset);
    }

    if (targetLane === null || targetLane === this.laneId) {
      return;
    }

    const startLane = this.laneId;

    this.setLane(targetLane);
    this.surface.setActiveLane(this.laneId);

    this.dashTimestamp = now;
    // Dashing also consumes the normal lane-change budget so a dash can't be
    // immediately followed by a free single step.
    this.lastLaneChangeTimestamp = now;

    // Phase Dash: arrive intangible for a moment, so the destination lane's
    // hazards can be dashed *into* and not just over, and carve through
    // anything close to the rim on the way.
    if (this.powerUps?.hasPhaseDash) {
      this.phaseUntil = now + Shooter.PHASE_DASH_IFRAME_MS;
      this._damageDashPath(startLane, offset);
      this.dashTrailPath = this._dashPathLanes(startLane, offset);
      this.dashTrailUntil = this.phaseUntil;
    }

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_DASH,
    );
  }

  /**
   * Every lane the dash crosses, including the destination.
   *
   * @param {number} fromLane
   * @param {number} offset
   * @return {number[]}
   */
  _dashPathLanes(fromLane, offset) {
    const direction = Math.sign(offset);
    const steps = Math.abs(offset);
    const lanes = [];

    for (let step = 1; step <= steps; step++) {
      const laneId = this.surface.getTargetLaneId(fromLane, step * direction);
      if (laneId !== null && !lanes.includes(laneId)) {
        lanes.push(laneId);
      }
    }

    return lanes;
  }

  /**
   * Damage rim-adjacent enemies in every lane the dash crossed. Uses
   * hitByProjectile so it respects hitPoints — strong enemies and tankers
   * survive a single pass rather than being deleted.
   *
   * @param {number} fromLane
   * @param {number} offset
   */
  _damageDashPath(fromLane, offset) {
    const lanes = this._dashPathLanes(fromLane, offset);
    if (lanes.length === 0) {
      return;
    }

    const enemies = this.surfaceObjectsManager.enemies;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];

      if (!enemy.alive || !enemy.hittable) continue;
      if (enemy.zPosition > Shooter.PHASE_DASH_HIT_DEPTH) continue;
      if (!lanes.includes(enemy.laneId)) continue;

      enemy.hitByProjectile(Shooter.PHASE_DASH_DAMAGE);
    }
  }

  /**
   * Walks the dash distance down until it lands on a valid lane. Only ever
   * called for open surfaces, where getTargetLaneId() returns null off-edge.
   *
   * @param {number} offset
   * @return {?number}
   */
  _clampDashTarget(offset) {
    const direction = Math.sign(offset);

    for (let distance = Math.abs(offset) - 1; distance > 0; distance--) {
      const candidate = this.surface.getTargetLaneId(
        this.laneId,
        distance * direction,
      );

      if (candidate !== null) {
        return candidate;
      }
    }

    return null;
  }

  hitByProjectile() {
    // console.log('BOOM! (projectile)');
    if (this._checkAndConsumeShield()) return;
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_DEATH,
    );
  }

  capturedByFlipper() {
    // console.log('BAM! (flipper)');
    if (this._checkAndConsumeShield()) return;
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_DEATH,
    );
  }

  capturedByFuseball() {
    // console.log('POW! (fuseball)');
    if (this._checkAndConsumeShield()) return;
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_DEATH,
    );
  }

  impaledOnSpike() {
    // console.log('SPUT! (spike)');
    if (this._checkAndConsumeShield()) return;
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_DEATH,
    );
  }

  shockedByPulsar() {
    // console.log('BZZZT! (pulsar)');
    if (this._checkAndConsumeShield()) return;
    this.setState(Shooter.STATE_EXPLODING);
    this.die();

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PLAYER_DEATH,
    );
  }

  die() {
    this.setFlag(Shooter.FLAG_ITS_ALREADY_TOO_LATE);
    this.hittable = false;
    this.canShoot = false;
  }

  disappear() {
    if (this.shieldTimeout) {
      clearTimeout(this.shieldTimeout);
      this.shieldTimeout = null;
    }
    if (
      this.inState(Shooter.STATE_EXPLODING) ||
      this.inState(Shooter.STATE_DEAD)
    ) {
      return;
    }

    this.setState(Shooter.STATE_DISAPPEARING);
    this.die();
  }

  fireSuperzapper() {
    if (
      this.canShoot &&
      (this.inState(Shooter.STATE_ALIVE) ||
        this.inState(Shooter.STATE_GOING_DOWN_THE_TUBE)) &&
      this.isFlagNotSet(Shooter.FLAG_SUPERZAPPER_USED)
    ) {
      this.setFlag(Shooter.FLAG_SUPERZAPPER_USED);

      messageBroker.publish(
        MessageBroker.TOPIC_SCREEN,
        MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED,
      );
      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED,
      );

      this.surfaceObjectsManager.handleSuperzapper();
    }
  }

  renovate() {
    this.setState(Shooter.STATE_RENOVATING);
    this.alive = true;

    let superzapperUsed = this.isFlagSet(Shooter.FLAG_SUPERZAPPER_USED);
    this.clearFlags();

    if (superzapperUsed) {
      this.setFlag(Shooter.FLAG_SUPERZAPPER_USED);
    }
  }

  fireSynthSurge(isAccent) {
    if (
      !this.canShoot ||
      this.zPosition > 1 ||
      !this.inState(Shooter.STATE_ALIVE)
    ) {
      return;
    }

    // Determine the lanes to fire on
    let lanesToFire = [this.laneId];

    if (isAccent) {
      // On an Accent/Chorus beat, fire a massive 5-lane spread wrapped around the cylinder!
      lanesToFire = [-2, -1, 0, 1, 2]
        .map((offset) => this.surface.getTargetLaneId(this.laneId, offset))
        .filter((lane) => lane !== null);
    }

    let fired = false;
    lanesToFire.forEach((lane) => {
      // '1' is the native constant for Projectile.SOURCE_SHOOTER
      // We use the Manager directly to bypass single-lane firing restrictions
      if (this.projectileManager.fire(lane, 1, this.zPosition, 1)) {
        fired = true;
      }
    });

    if (fired) {
      // Play the weapon sound (using the exact same logic as your spacebar)
      const powerUps = this.game?.powerUpManager;
      if (powerUps && powerUps.hasMissile) {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_MISSILE,
        );
      } else if (powerUps && powerUps.hasLaser) {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_LASER,
        );
      } else if (powerUps && powerUps.hasGrenade) {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT_GRENADE,
        );
      } else {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_PLAYER_SHOOT,
        );
      }
    }
  }

  _checkAndConsumeShield() {
    const gameRef =
      this.game || (this.projectileManager && this.projectileManager.game);
    const powerUps = gameRef?.powerUpManager;

    if (powerUps && powerUps.hasShield) {
      powerUps.consumeShield();

      // Grant 1.5s of invincibility so they can escape the hazard they hit!
      this.hittable = false;
      this.isShieldInvincible = true;

      if (this.shieldTimeout) {
        clearTimeout(this.shieldTimeout);
      }

      this.shieldTimeout = setTimeout(() => {
        this.hittable = true;
        this.isShieldInvincible = false;
        this.shieldTimeout = null;
      }, 1500);

      return true; // The player survives!
    }
    return false; // No shield, proceed to death.
  }
}
