import { Color, Group } from 'three';
import SurfaceRenderer from '@/Renderer/Surface/SurfaceRenderer';
import ShooterRenderer from '@/Renderer/Shooters/ShooterRenderer';
import DashTrailRenderer from '@/Renderer/Shooters/DashTrailRenderer';
import PickupTextRenderer from '@/Renderer/Effects/PickupTextRenderer';
import ShockwaveRenderer from '@/Renderer/Effects/ShockwaveRenderer';
import ParticleBurstRenderer from '@/Renderer/Effects/ParticleBurstRenderer';
import ProjectileRendererManager from '@/Renderer/Surface/ProjectileRendererManager';
import EnemyRendererManager from '@/Renderer/Surface/EnemyRendererManager';

export default class LevelRenderer extends Group {
  static CAMERA_TO_SHOOTER_DISTANCE = 6;

  /** Debris colour per enemy type, so kills read as that enemy coming apart. */
  static DEBRIS_COLORS = {
    flipper: 0xff2266,
    tanker: 0xffcc00,
    spiker: 0x00ff88,
    pulsar: 0xff00ff,
    fuseball: 0x00ffff,
    mirror: 0xaaaaff,
    flipper_tanker: 0xffcc00,
  };

  level = null;
  camera;
  surfaceRenderer;
  shooterRenderer;
  dashTrailRenderer;
  pickupTextRenderer;
  shockwaveRenderer;
  particleBurstRenderer;
  juice = null;
  projectileRendererManager;
  enemyRendererManager;

  /**
   * @param {PerspectiveCamera} camera
   */
  constructor(camera) {
    super();

    this.camera = camera;
  }

  bindLevel(level) {
    this.level = level;

    this.surfaceRenderer = new SurfaceRenderer(
      this.level.surface,
      this.level.currentLevel,
    );
    this.shooterRenderer = new ShooterRenderer(
      this.level.shooter,
      this.level.surface,
    );
    this.enemyRendererManager = new EnemyRendererManager(
      this.level.surfaceObjectsManager,
      this.level.surface,
    );
    this.projectileRendererManager = new ProjectileRendererManager(
      this.level.projectileManager,
      this.level.surface,
    );

    this.dashTrailRenderer = new DashTrailRenderer(this.level.surface);

    // Reads shooterRenderer.position live at spawn time, so it must be
    // constructed after shooterRenderer above, not before.
    this.pickupTextRenderer = new PickupTextRenderer(this.shooterRenderer, this);
    this.shockwaveRenderer = new ShockwaveRenderer(this.level.surface, this);
    this.particleBurstRenderer = new ParticleBurstRenderer(this);

    // Positional effects are placed here rather than inside JuiceManager,
    // because only the renderer knows how to convert (laneId, zPosition) into
    // world coordinates for THIS surface.
    this._onJuiceSuperzapper = () => {
      if (!this.shockwaveRenderer) return;
      // Two rings: a fast bright leading edge and a slower wide trailing one,
      // which reads as a single thick wave rather than a thin hoop.
      this.shockwaveRenderer.spawn({
        fromZ: 0, toZ: 1.05, color: 0xffffff, durationMs: 520,
        scaleFrom: 0.7, scaleTo: 1.15,
      });
      this.shockwaveRenderer.spawn({
        fromZ: 0, toZ: 0.85, color: 0x66ccff, durationMs: 720,
        scaleFrom: 0.9, scaleTo: 1.35,
      });
      this.surfaceRenderer?.rippleFrom(0, 0.5);
    };

    this._onJuiceEnemyDeath = ({ detail }) => {
      if (!this.particleBurstRenderer || !this.level) return;
      const mid = this.level.surface.lanesMiddleCoords[detail.laneId];
      if (!mid) return;
      const worldPos = {
        x: mid.x,
        y: mid.y,
        z: detail.zPosition * this.level.surface.depth,
      };

      this.particleBurstRenderer.burst(
        worldPos,
        LevelRenderer.DEBRIS_COLORS[detail.type] ?? 0xffaa33,
      );

      // Score pop-up at the exact kill position. Deliberately smaller and
      // dimmer than a power-up label so a busy screen full of kills doesn't
      // drown out an actual pickup.
      if (this.pickupTextRenderer && detail.points) {
        this.pickupTextRenderer.spawnAt(
          worldPos,
          `+${detail.points}`,
          '#ffee88',
          0.62,
        );
      }
    };

    this._onJuicePlayerDeath = () => {
      if (!this.particleBurstRenderer || !this.shooterRenderer) return;
      this.particleBurstRenderer.burst(this.shooterRenderer.position, 0xffff66, 40);
      if (this.shockwaveRenderer) {
        this.shockwaveRenderer.spawn({
          fromZ: 0, toZ: 0.7, color: 0xff3333, durationMs: 800,
          scaleFrom: 0.6, scaleTo: 1.4,
        });
      }
    };

    this._onJuiceGrenade = ({ detail }) => {
      if (!this.surfaceRenderer) return;
      this.surfaceRenderer.rippleFrom(detail?.zPosition ?? 0.5, 0.4);
    };

    window.addEventListener('juice:grenade', this._onJuiceGrenade);
    window.addEventListener('juice:superzapper', this._onJuiceSuperzapper);
    window.addEventListener('juice:enemy-death', this._onJuiceEnemyDeath);
    window.addEventListener('juice:player-death', this._onJuicePlayerDeath);

    this.add(this.surfaceRenderer);
    this.add(this.dashTrailRenderer);
    this.add(this.shooterRenderer);
    this.add(this.enemyRendererManager);
    this.add(this.projectileRendererManager);

    this.position.setY(level.surface.zOffset);
  }

  releaseLevel() {
    if (this.bgmManager) {
      this.bgmManager.stop();
    }
    if (this.dashTrailRenderer) {
      this.dashTrailRenderer.dispose();
      this.remove(this.dashTrailRenderer);
      this.dashTrailRenderer = undefined;
    }

    if (this.pickupTextRenderer) {
      this.pickupTextRenderer.dispose();
      this.pickupTextRenderer = undefined;
    }

    window.removeEventListener('juice:grenade', this._onJuiceGrenade);
    window.removeEventListener('juice:superzapper', this._onJuiceSuperzapper);
    window.removeEventListener('juice:enemy-death', this._onJuiceEnemyDeath);
    window.removeEventListener('juice:player-death', this._onJuicePlayerDeath);

    if (this.shockwaveRenderer) {
      this.shockwaveRenderer.dispose();
      this.shockwaveRenderer = undefined;
    }

    if (this.particleBurstRenderer) {
      this.particleBurstRenderer.dispose();
      this.particleBurstRenderer = undefined;
    }

    this.remove(this.surfaceRenderer);
    this.remove(this.shooterRenderer);
    this.remove(this.enemyRendererManager);
    this.remove(this.projectileRendererManager);

    this.level = null;
    this.surfaceRenderer = undefined;
    this.shooterRenderer = undefined;
    this.enemyRendererManager = undefined;
    this.projectileRendererManager = undefined;
  }

  followShooter() {
    let surfaceDepth = this.surfaceRenderer.surface.depth;
    let cameraZPosition = this.shooterRenderer.position.z;

    if (cameraZPosition >= surfaceDepth) {
      cameraZPosition += Math.pow(cameraZPosition - surfaceDepth, 2) * 0.05;
    }

    if (cameraZPosition < 0) {
      cameraZPosition *= 0.9;
    }

    this.camera.position.z =
      cameraZPosition - LevelRenderer.CAMERA_TO_SHOOTER_DISTANCE;

    // Screen shake is applied as a positional offset AFTER the follow logic
    // has settled the base position, and the lookAt target is offset by the
    // same amount. Shaking the position alone would swing the view direction
    // wildly (the camera would keep staring at a fixed point while jittering
    // around it); offsetting both keeps the shake a translation, not a swivel.
    const shakeX = this.juice ? this.juice.shakeX : 0;
    const shakeY = this.juice ? this.juice.shakeY : 0;

    this.camera.position.x = shakeX;
    this.camera.position.y = shakeY;

    this.camera.lookAt(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z + 10,
    );

    // Roll is applied after lookAt, which always resets rotation.z to 0.
    if (this.juice) {
      this.camera.rotation.z += this.juice.shakeRoll;
    }
  }

  update(delta = 1 / 60) {
    this._lastDelta = delta;

    if (this.level !== null) {
      if (this.beatPulse === undefined) {
        this.beatPulse = 0.0;
        this.whiteColor = new Color(0xffffff); // The color it flashes to
        this._baseColor = new Color(); // Reusable color object to avoid allocations
      }

      // Smoothly decay the pulse back to 0
      this.beatPulse += (0.0 - this.beatPulse) * 0.1;

      // --- CALCULATE CURRENT PALETTE TIER (0-7) ---
      // Level 1-32 = 0, 33-64 = 1, etc.
      const colorIndex = Math.floor((this.level.currentLevel - 1) / 32) % 8;

      if (this.surfaceRenderer && this.surfaceRenderer.laneDefaultMaterial) {
        // Map the 7 static colors to exactly match the Select Screen UI
        const staticColors = [
          0x0064ff, // 0: Blue
          0xff0000, // 1: Red
          0xffff00, // 2: Yellow
          0x00ff00, // 3: Green
          0xff8000, // 4: Orange
          0xff00ff, // 5: Purple
          0xffffff, // 6: White
        ];

        // --- SET BASE COLOR OR RAINBOW MODE ---
        if (colorIndex === 7) {
          this._baseColor.setHSL((Date.now() % 2000) / 2000, 1.0, 0.5);
        } else {
          this._baseColor.setHex(staticColors[colorIndex]);
        }

        // --- DYNAMIC ACTIVE LANE COLOR ---
        if (!this._activeColor) this._activeColor = new Color();

        // Extract the HSL from the base color
        const hsl = { h: 0, s: 0, l: 0 };
        this._baseColor.getHSL(hsl);

        // Shift the hue by 0.5 (180 degrees) to get the exact opposite color
        this._activeColor.setHSL((hsl.h + 0.5) % 1.0, 1.0, 0.5);

        // Apply the complementary color to the active lane material, then
        // push it toward white as the combo builds — the lane the player
        // occupies visibly heats up with their streak, tying the ship to the
        // tube instead of the combo living only in the HUD.
        this.surfaceRenderer.laneActiveMaterial.color.copy(this._activeColor);
        if (this.juice && this.juice.combo > 0) {
          const heat = Math.min(0.6, this.juice.combo / 25);
          this.surfaceRenderer.laneActiveMaterial.color.lerp(
            this.whiteColor,
            heat + this.juice.comboFlash * 0.3,
          );
        }

        // --- APPLY TO DEFAULT MATERIAL ONLY ---
        this.surfaceRenderer.laneDefaultMaterial.color
          .copy(this._baseColor)
          .lerp(this.whiteColor, this.beatPulse);
      }

      this.surfaceRenderer.update();
      this.shooterRenderer.update();
      if (this.dashTrailRenderer) {
        this.dashTrailRenderer.update(this.shooterRenderer.object);
      }
      if (this.pickupTextRenderer) {
        this.pickupTextRenderer.update();
      }
      // Weapon recoil: nudge the ship model backwards along Z. Applied to the
      // ship rather than the camera because followShooter() derives the camera
      // FROM the ship position — recoiling the camera would be cancelled out.
      if (this.juice && this.shooterRenderer) {
        this.shooterRenderer.position.z =
          this.shooterRenderer.position.z + this.juice.recoil * 0.12;
      }

      if (this.surfaceRenderer) {
        this.surfaceRenderer.updateRipples();
      }

      if (this.shockwaveRenderer) {
        this.shockwaveRenderer.update();
      }
      if (this.particleBurstRenderer) {
        this.particleBurstRenderer.update(this._lastDelta ?? 1 / 60);
      }
      this.enemyRendererManager.update();
      this.projectileRendererManager.update();
      this.followShooter();
    }
  }
}
