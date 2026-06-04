import { Color, Group } from 'three';
import SurfaceRenderer from '@/Renderer/Surface/SurfaceRenderer';
import ShooterRenderer from '@/Renderer/Shooters/ShooterRenderer';
import ProjectileRendererManager from '@/Renderer/Surface/ProjectileRendererManager';
import EnemyRendererManager from '@/Renderer/Surface/EnemyRendererManager';

export default class LevelRenderer extends Group {
  // Removed legacy @readonly decorator
  static CAMERA_TO_SHOOTER_DISTANCE = 6;

  // Modern ES class fields replacing JSDoc @var comments
  level = null;
  camera;
  surfaceRenderer;
  shooterRenderer;
  projectileRendererManager;
  enemyRendererManager;

  /**
   * @param {PerspectiveCamera} camera
   */
  constructor (camera) {
    super();

    this.camera = camera;
  }

  bindLevel (level) {
    this.level = level;

    this.surfaceRenderer = new SurfaceRenderer(this.level.surface, this.level.currentLevel);
    this.shooterRenderer = new ShooterRenderer(this.level.shooter, this.level.surface);
    this.enemyRendererManager = new EnemyRendererManager(this.level.surfaceObjectsManager, this.level.surface);
    this.projectileRendererManager = new ProjectileRendererManager(this.level.projectileManager, this.level.surface);

    this.add(this.surfaceRenderer);
    this.add(this.shooterRenderer);
    this.add(this.enemyRendererManager);
    this.add(this.projectileRendererManager);

    this.position.setY(level.surface.zOffset);
  }

  releaseLevel () {
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

  followShooter () {
    let surfaceDepth = this.surfaceRenderer.surface.depth;
    let cameraZPosition = this.shooterRenderer.position.z;

    if (cameraZPosition >= surfaceDepth) {
      cameraZPosition += Math.pow(cameraZPosition - surfaceDepth, 2) * 0.05;
    }

    if (cameraZPosition < 0) {
      cameraZPosition *= 0.9;
    }

    this.camera.position.z = cameraZPosition - LevelRenderer.CAMERA_TO_SHOOTER_DISTANCE;
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, this.camera.position.z + 10);
  }

  // LevelRenderer.js -> replace your update() method

  update () {
    if (this.level !== null) {
      if (this.beatPulse === undefined) {
        this.beatPulse = 0.0;
        this.whiteColor = new Color(0xffffff); // The color it flashes to
      }
      
      // Smoothly decay the pulse back to 0
      this.beatPulse += (0.0 - this.beatPulse) * 0.10; 

      // --- CALCULATE CURRENT PALETTE TIER (0-7) ---
      // Level 1-32 = 0, 33-64 = 1, etc.
      const colorIndex = Math.floor((this.level.currentLevel - 1) / 32) % 8;
    
      if (this.surfaceRenderer) {
          this.surfaceRenderer.traverse((child) => {
              if (child.material && child.material.color) {
                  
                  // --- SET STATIC BASE COLORS ONCE ---
                  if (!child.material.userData.baseColor) {
                      child.material.userData.baseColor = new Color();
                      
                      // Map the 7 static colors to exactly match the Select Screen UI
                      const staticColors = [
                        0x0064ff, // 0: Blue
                        0xff0000, // 1: Red
                        0xffff00, // 2: Yellow
                        0x00ff00, // 3: Green
                        0xff8000, // 4: Orange
                        0xff00ff, // 5: Purple
                        0xffffff  // 6: White
                      ];
                      
                      if (colorIndex < 7) {
                          child.material.userData.baseColor.setHex(staticColors[colorIndex]);
                      }
                  }
                  
                  // --- RAINBOW MODE OVERRIDE ---
                  // If we are in the 8th tier, continuously shift the Hue!
                  if (colorIndex === 7) {
                      // Date.now() % 2000 creates a seamless 2-second loop from 0.0 to 1.0
                      child.material.userData.baseColor.setHSL((Date.now() % 2000) / 2000, 1.0, 0.5);
                  }
                  
                  // --- APPLY THE BEAT PULSE ---
                  // Blend between the base color and pure white based on the music beat!
                  child.material.color.copy(child.material.userData.baseColor).lerp(this.whiteColor, this.beatPulse);
              }
          });
      }
    
      this.surfaceRenderer.update();
      this.shooterRenderer.update();
      this.enemyRendererManager.update();
      this.projectileRendererManager.update();
      this.followShooter();
    }
  }
}