import {
  AudioListener,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Vector2,
} from 'three';
import BgmManager from '@/Object/Manager/BgmManager';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass';
import Level from '@/Object/Level';
import LevelRenderer from '@/Renderer/LevelRenderer';
import Surface from '@/Object/Surface/Surface';
import ScreenSelectSurface from '@/Object/Screen/ScreenSelectSurface';
import ScreenContentManager from '@/Object/Screen/ScreenContentManager';
import surfaces from '@/Assets/Surfaces';
import levels from '@/Assets/Levels';
import AudioManager from '@/Object/Manager/AudioManager';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import ScreenParodySurface from '@/Object/Screen/ScreenParodySurface';
import { PowerUpManager } from '@/PowerUp/PowerUpManager';
import { PowerUpSpawner } from '@/PowerUp/PowerUpSpawner';
import { PowerUpType } from '@/PowerUp/PowerUpType';
import { PowerUpHUD } from '@/PowerUp/PowerUpHUD';
import { AIDroid } from '@/PowerUp/AIDroid';
import Starfield from '@/Renderer/Background/Starfield';
import ScreenAttractMode from '@/Object/Screen/ScreenAttractMode';
import { initVoiceCache } from '@/utils/voiceCache';
import { ModeManager } from '@/Object/Manager/ModeManager';
import MenuMode from '@/Object/Modes/MenuMode';
import TransitionMode from '@/Object/Modes/TransitionMode';
import PlayMode from '@/Object/Modes/PlayMode';
import HighScoresMode from '@/Object/Modes/HighScoresMode';
import BossMode from '@/Object/Modes/BossMode';
import BonusMode from '@/Object/Modes/BonusMode';

export default class Game {
  static BONUS_EVERY = 20000;

  static SAVE_DATA_KEY = 'polybius_save_data';
  static SAVE_VERSION = 1;

  static HIGH_SCORES_STORAGE_KEY = 'high_scores';
  static HIGHEST_LEVEL = 'highest_level';

  static FLAG_LOAD_NEXT_LEVEL = 0x1;

  flags;

  level = 1;
  highestLevel = 99;
  levelData;
  firstLevel = true;
  score = 0;
  highScores;
  lives = 5;
  credits = 1;

  scene;
  camera;
  renderer;
  composer;
  levelObject = null;
  levelRenderer = null;

  audioListener;
  audioManager;

  screenGroup;
  screenObject = null;
  screenContentManager;
  surfacesCollection;

  _lastMenuActivity = 0;
  _inAttractMode = false;

  constructor() {
    this.isWarping = false;
    this.bonusScoreOffset = 0;
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );
    const highQuality = !isMobile;
    this.setupRenderer(highQuality, isMobile);
    this.setupLogic();
    initVoiceCache();
    this.bootAudio();
    this.isPaused = false;
    this.aiDroid = null;
    this.prevGamepadState = {};
    this.prevGamepadAxis = 0;
    this.bgmManager = new BgmManager();
    this.gamepadButtonStates = {};
    this.modeManager = new ModeManager(this);
    this.modeManager.switchMode(new MenuMode());

    this.bgmManager.onBeat = () => {
      if (this.starfield) this.starfield.pulse(1.2); //1.5
      if (this.levelRenderer) this.levelRenderer.beatPulse = 0.15; // 40% flash
      this.beatGlow = 0.1;
      // Auto-fire straight down the lane!
      if (this.powerUpManager?.hasSynthSurge && this.shooter) {
        this.shooter.fireSynthSurge(false);
      }
    };

    this.bgmManager.onAccent = () => {
      if (this.starfield) this.starfield.pulse(2.0); //3.5
      if (this.levelRenderer) this.levelRenderer.beatPulse = 0.35; // 90% flash
      this.beatGlow = 0.3;
      // Auto-fire a massive 5-lane spread!
      if (this.powerUpManager?.hasSynthSurge && this.shooter) {
        this.shooter.fireSynthSurge(true);
      }
    };

    window.addEventListener(
      'keydown',
      (e) => {
        //console.log(`[Game] Keydown intercepted globally: ${e.code}. Current mode type:`, this.modeManager?.currentMode?.constructor.name);

        if (
          e.code === 'End' &&
          this.modeManager?.currentMode instanceof PlayMode &&
          !this.isLoadingLevel
        ) {
          // Prevent your old 'End' key logic from running!
          e.stopImmediatePropagation();
          e.preventDefault();

          console.log('[DEBUG] Hijacking End key: Forcing Bonus Stage!');

          // 1. Max out tokens and flag the bonus stage as earned
          this.powerUpManager.warpTokenCount = 3;
          this.powerUpManager.bonusStageEarned = true;

          // 2. Trigger the PowerUpHUD to flash "BONUS READY" in gold
          window.dispatchEvent(new CustomEvent('warptoken:ready'));

          // 3. Trigger the normal warp-out sequence down the tube
          this.levelWonCallback();
        }

        if (
          this.modeManager?.currentMode instanceof MenuMode &&
          !this._inAttractMode
        ) {
          this._lastMenuActivity = Date.now();
          if (this.screenObject) {
            this.screenObject._dirty = true;
          }
        }
      },
      true,
    );
  }

  async bootAudio() {
    const allSoundEffects = [
      '1up',
      'achievement',
      'bigfoot',
      'crt',
      'enemy_death',
      'enemy_shoot',
      'game',
      'game_over',
      'grenade',
      'jump',
      'knob',
      'Konami',
      'laser',
      'menu_select',
      'missile',
      'next_level',
      'pause',
      'phantom',
      'player_death',
      'player_lane_change',
      'player_shoot',
      'powerup',
      'shield',
      'spooky',
      'synth',
      'yes',
    ];

    try {
      await this.audioManager.preload(allSoundEffects);
      console.log('[Game] All audio pre-decoded and ready!');
    } catch (error) {
      console.warn('[Game] Audio preloading encountered an error:', error);
    }
  }

  startLevel(levelId, firstLevel = false) {
    this.firstLevel = firstLevel;
    this.level = levelId;
    this.screenContentManager.setLevel(this.level);

    const parodyScreen = new ScreenParodySurface(this.screenContentManager);

    this.modeManager.switchMode(
      new TransitionMode(parodyScreen, 4000, () => new PlayMode(this.level)),
    );
  }

  loadLevel(level) {
    let surfaceId = ((level - 1) % 32) + 1;
    let surfaceData = surfaces.find((s) => s.id === surfaceId);
    if (!surfaceData) {
      console.warn(
        `[Game] Can't find surface level with id === ${surfaceId}! Returning to menu.`,
      );
      this.modeManager.switchMode(new MenuMode());
      return;
    }

    const vectorCoords = surfaceData.coords.map((c) => new Vector2(c.x, c.y));

    let surface = new Surface(
      surfaceData.id,
      surfaceData.name,
      surfaceData.isOpen,
      vectorCoords,
      surfaceData.zOffset,
    );

    if (surface === undefined) {
      this.modeManager.switchMode(new MenuMode());
      throw new Error(`Can't find surface level with id === ${surfaceId} !`);
    }

    this.levelData =
      levels.levelsCollection?.find((levelData) => levelData.id === level) ||
      levels.find((levelData) => levelData.id === level);

    if (this.levelData === undefined) {
      throw new Error(`Can't find level with id === ${level} !`);
    }

    let targetScore = this.firstLevel
      ? this.levelData.targetScore - this.levelData.scoreBonus
      : this.levelData.targetScore;

    targetScore += this.bonusScoreOffset;

    this.levelObject = new Level(
      surface,
      this.level,
      this.score,
      targetScore,
      this.rewardCallback.bind(this),
      this.levelWonCallback.bind(this),
      this.shooterKilledCallback.bind(this),
      this.getCurrentScore.bind(this),
      this,
    );

    //console.log("GAME: Level loaded. New Surface:", surface);
    this.powerUpSpawner.webGeometry = surface;
    //console.log("GAME: Spawner webGeometry updated to:", this.powerUpSpawner.webGeometry);
    this.levelObject.registerKeys();
    this.levelRenderer.bindLevel(this.levelObject);
    this.populateScreenContentManager();
    this.shooter = this.levelObject.shooter;
    if (this.powerUpManager.hasAIDroid) {
      this._spawnAIDroid();
    }
  }

  releaseLevel() {
    if (this.bgmManager) {
      this.bgmManager.stop();
    }
    if (this.bonusStage) {
      this.bonusStage.dispose();
      this.bonusStage = null;
    }
    if (this.bossFight) {
      this.bossFight.dispose();
      this.bossFight = null;
    }
    if (this.levelObject === null) {
      return;
    }

    this.isPaused = false;
    this.isWarping = false;
    if (this.pauseOverlay) this.pauseOverlay.classList.remove('is-active');
    if (this.bonusOverlay) this.bonusOverlay.classList.remove('is-active');

    this._disposeAIDroid();
    this.powerUpSpawner.webGeometry = null;
    this.powerUpSpawner.clearAll();
    this.levelObject.release();
    this.levelObject = null;
    this.shooter = null;
    this.levelRenderer.releaseLevel();
  }

  loadScreen(screen) {
    if (this.screenObject !== null) {
      this.screenObject.release();
      this.releaseScreen();
    }

    this.releaseScreen();
    this.screenObject = screen;
    this.screenGroup.add(this.screenObject);
  }

  releaseScreen() {
    if (this.screenObject === null) return;
    if (this.bonusOverlayTimeout) {
      clearTimeout(this.bonusOverlayTimeout);
      this.bonusOverlayTimeout = null;
    }
    this.screenObject.release();
    this.screenGroup.remove(this.screenObject);
    this.screenObject = null;
  }

  setupLogic() {
    this.screenContentManager = new ScreenContentManager();

    this.loadGameState();
    this.populateScreenContentManager();

    this.surfacesCollection = Surface.fromDataset(surfaces);
  }

  loadGameState() {
    // 1. Establish defaults
    this.highScores = [
      { name: 'NWO', score: 524288 },
      { name: 'MKU', score: 262144 },
      { name: 'CIA', score: 131072 },
      { name: 'NSA', score: 65536 },
      { name: 'FBI', score: 32768 },
      { name: 'UFO', score: 16384 },
      { name: 'BIG', score: 8192 },
      { name: 'FOT', score: 4096 },
    ];
    this.highestLevel = 1;

    // 2. Try loading the versioned save data
    const storedSave = localStorage.getItem(Game.SAVE_DATA_KEY);

    if (storedSave !== null) {
      try {
        const saveData = JSON.parse(storedSave);

        // Version 1 parsing logic
        if (saveData.version === 1) {
          if (
            Array.isArray(saveData.highScores) &&
            saveData.highScores.length === 8
          ) {
            this.highScores = saveData.highScores;
          }
          if (typeof saveData.highestLevel === 'number') {
            this.highestLevel = saveData.highestLevel;
          }
        }
        // Future: else if (saveData.version === 2) { ... handle v1 to v2 migration ... }
      } catch {
        console.warn(
          '[Game] Corrupted versioned save data. Reverting to defaults.',
        );
      }
    } else {
      // 3. Fallback: No versioned save found. Attempt to migrate legacy data.
      this._migrateLegacySaveData();
    }

    this.highestLevel = Math.min(this.highestLevel, 256);
  }

  _migrateLegacySaveData() {
    let requiresSave = false;

    // Recover legacy high scores
    const storedScores = localStorage.getItem(Game.HIGH_SCORES_STORAGE_KEY);
    if (storedScores !== null) {
      try {
        const parsedScores = JSON.parse(storedScores);
        if (Array.isArray(parsedScores) && parsedScores.length === 8) {
          this.highScores = parsedScores;
          requiresSave = true;
        }
      } catch {
        /* Ignore parsing errors */
      }
    }

    // Recover legacy highest level
    const storedLevel = localStorage.getItem(Game.HIGHEST_LEVEL);
    if (storedLevel !== null) {
      const parsedLevel = parseInt(storedLevel, 10);
      if (!isNaN(parsedLevel)) {
        this.highestLevel = parsedLevel;
        requiresSave = true;
      }
    }

    // If we found old data, package it into the new v1 format immediately
    if (requiresSave) {
      console.log('[Game] Legacy save data migrated to version 1.');
      this.saveGameState();

      // Optional: Clean up the old keys so this migration only runs once
      localStorage.removeItem(Game.HIGH_SCORES_STORAGE_KEY);
      localStorage.removeItem(Game.HIGHEST_LEVEL);
    }
  }

  saveGameState() {
    console.log('[Game] STATE SAVED (v' + Game.SAVE_VERSION + ')');

    const saveData = {
      version: Game.SAVE_VERSION,
      highScores: this.highScores,
      highestLevel: this.highestLevel,
    };

    localStorage.setItem(Game.SAVE_DATA_KEY, JSON.stringify(saveData));
  }

  populateScreenContentManager() {
    this.screenContentManager.setLives(this.lives);
    this.screenContentManager.setLevel(this.level);
    this.screenContentManager.setScore(this.score);
    this.screenContentManager.setCredits(this.credits);
    this.screenContentManager.setHighScores(this.highScores);
    this.screenContentManager.setSuperzapperUsed(false);
    this.screenContentManager.setSelectActive(0);
    this.screenContentManager.setSelectOffset(0);
    this.screenContentManager.setSelectLevels(
      levels.filter(
        (level) => level.selectable && level.id <= this.highestLevel,
      ),
    );

    this.screenContentManager.setLevelSelectedCallback(
      this.startLevel.bind(this),
    );
    this.screenContentManager.setPushHighScoreCallback(
      this.pushScoreToHighScores.bind(this),
    );
    this.screenContentManager.setCloseHighScoresScreenCallback(() => {
      this.modeManager.switchMode(new MenuMode());
    });
  }

  setupRenderer(highQuality = true, isMobile = false) {
    this.scene = new Scene();
    this.starfield = new Starfield();
    this.scene.add(this.starfield);

    // Get the actual pixel dimensions of the CRT screen interior
    const screenElement = document.getElementById('screen');
    const width = screenElement.clientWidth;
    const height = screenElement.clientHeight;

    // Pass the interior dimensions to the Camera
    this.camera = new PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, -6);
    this.camera.lookAt(0, 0, 10);

    this.audioListener = new AudioListener();
    this.camera.add(this.audioListener);

    this.audioManager = new AudioManager(this.audioListener);

    this.renderer = new WebGLRenderer({ antialias: true });
    const maxDpr = isMobile ? 2 : 3;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));

    // Size the Canvas to the bezel, not the whole browser window!
    this.renderer.setSize(width, height);

    // Prevent weird scrollbars from inline canvas rendering
    this.renderer.domElement.style.display = 'block';

    document.getElementById('display').appendChild(this.renderer.domElement);

    const displayContainer = document.getElementById('display');
    displayContainer.style.position = 'relative'; // Ensure absolute children stay inside

    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'pause-overlay';
    this.pauseOverlay.innerHTML = 'PAUSE';
    displayContainer.appendChild(this.pauseOverlay);

    this.bonusOverlay = document.createElement('div');
    this.bonusOverlay.className = 'bonus-overlay';
    this.bonusOverlay.innerHTML =
      'YES<br/><span class="bonus-overlay-text">BONUS POWERUP!</span>';
    displayContainer.appendChild(this.bonusOverlay);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (highQuality) {
      // Pass the interior dimensions to the post-processing effects
      this.bloomPass = new UnrealBloomPass(
        new Vector2(width, height),
        0.8, // Base strength
        0.9,
        0,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new SMAAPass(width, height));
    }

    this.levelRenderer = new LevelRenderer(this.camera);
    this.scene.add(this.levelRenderer);

    this.screenGroup = new Group();
    this.screenGroup.rotation.y = Math.PI;
    this.scene.add(this.screenGroup);
    this.powerUpManager = new PowerUpManager();
    this.powerUpSpawner = new PowerUpSpawner(this.scene, null);
    this.powerUpSpawner.scene = this.scene;
    this.powerUpHUD = new PowerUpHUD(this.powerUpManager);
    window.addEventListener('powerup:collected', ({ detail: { type } }) => {
      if (type.id === 'AI_DROID' && this.levelObject) {
        this._spawnAIDroid();
      }
    });
    window.addEventListener('powerup:expired', ({ detail: { type } }) => {
      if (type.id === 'AI_DROID') {
        this._disposeAIDroid();
      }
    });
    window.addEventListener('keydown', () => {
      //console.log(`[Game] Keydown intercepted globally: ${e.code}. Current mode type:`, this.modeManager?.currentMode?.constructor.name);

      if (
        this.state?.equals(Game.STATE_SELECT_SURFACE) &&
        !this._inAttractMode
      ) {
        this._lastMenuActivity = Date.now();
        if (this.screenObject) {
          this.screenObject._dirty = true;
        }
      }
    });

    let resizeTimeout;
    const onResize = () => {
      // Debounce to prevent heavy GPU reallocation while actively dragging the window
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Find your main container. Check your index.html to ensure 'screen' is the correct ID.
        const el = document.getElementById('screen');
        if (!el) return;

        const w = el.clientWidth;
        const h = el.clientHeight;

        // 1. Update the Camera's aspect ratio so the geometry doesn't stretch
        if (this.camera) {
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
        }

        // 2. Update the main WebGL Renderer
        if (this.renderer) {
          this.renderer.setSize(w, h);
        }

        // 3. Update the Post-Processing Composer and Passes
        if (this.composer) {
          this.composer.setSize(w, h);
        }
        if (this.bloomPass) {
          this.bloomPass.setSize(w, h);
        }
      }, 150); // 150ms delay is usually the sweet spot for smooth debouncing
    };

    // Attach the listener to the window
    window.addEventListener('resize', onResize);
  }

  update() {
    requestAnimationFrame(this.update.bind(this));

    const now = performance.now();
    const delta = this._lastTime
      ? Math.min(0.1, (now - this._lastTime) / 1000)
      : 0;
    this._lastTime = now;

    try {
      // Delegate active operational logic entirely to the ModeManager
      this.modeManager.update(delta);
    } catch (err) {
      console.error('[CRITICAL ERROR CAUGHT IN UPDATE]:', err);
      throw err;
    }

    if (this.beatGlow === undefined) {
      this.beatGlow = 0.0;
      this.baseBloom = this.bloomPass ? this.bloomPass.strength : 0.5;
    }

    this.beatGlow += (0.0 - this.beatGlow) * 0.1;

    if (this.levelRenderer) {
      const pulseScale = 1.0 + this.beatGlow * 0.1;
      this.levelRenderer.scale.set(pulseScale, pulseScale, 1.0);
    }

    if (this.bloomPass) {
      this.bloomPass.strength = this.baseBloom + this.beatGlow;
    }

    // Handle global background elements
    if (this.starfield) {
      this.starfield.update(delta);
    }

    if (this.screenObject !== null) {
      this.screenObject.update();
    }

    // Poll global inputs / gamepads
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepads[0]) this.pollGamepads();

    // Audio & rendering pipeline
    this.bgmManager.update();
    this.audioManager.update();
    this.composer.render();
  }

  rewardCallback(reward) {
    this.score += reward;

    if (
      this.lives < 5 &&
      Math.floor(this.score / Game.BONUS_EVERY) !==
        Math.floor((this.score - reward) / Game.BONUS_EVERY)
    ) {
      this.lives++;
      this.screenContentManager.set(ScreenContentManager.KEY_LIVES, this.lives);
    }

    this.screenContentManager.setScore(this.score);
  }

  requestWarp() {
    // Treat an instant warp exactly like beating the level natively
    this.levelWonCallback();
  }

  levelWonCallback() {
    if (this.firstLevel && this.levelData.selectable) {
      this.score += this.levelData.scoreBonus;
      this.screenContentManager.setScore(this.score);

      if (this.levelData.scoreBonus >= Game.BONUS_EVERY && this.lives < 5) {
        this.lives++;
        this.screenContentManager.set(
          ScreenContentManager.KEY_LIVES,
          this.lives,
        );
      }
    }

    this.firstLevel = false;
    const nextLevel = this.level + 1;
    const isBossLevel = this.level % 32 === 0;
    this.releaseLevel();

    if (isBossLevel) {
      this.modeManager.switchMode(
        new BossMode(
          nextLevel,
          Math.floor(this.level / 32),
          Math.min(7, Math.floor((this.level - 1) / 32)),
          'BLUE',
        ),
      );
    } else if (this.powerUpManager.hasBonusStageEarned) {
      this.powerUpManager.resetBonusStageEarned();
      this.modeManager.switchMode(
        new BonusMode(
          nextLevel,
          Math.min(7, Math.floor((this.level - 1) / 32)),
        ),
      );
    } else {
      this.startLevel(nextLevel);
    }
  }

  shooterKilledCallback() {
    this.lives--;
    this.isWarping = false;
    if (this.bonusOverlay) this.bonusOverlay.classList.remove('is-active');

    this.screenContentManager.setLives(this.lives);

    if (this.lives === 0) {
      if (this.level > this.highestLevel) {
        this.highestLevel = this.level;
      }

      this.powerUpManager.consumeWarpTokens();
      this.powerUpManager.reset();
      if (this.powerUpHUD) this.powerUpHUD.clear();

      this.modeManager.switchMode(new HighScoresMode());
      return false;
    }

    return true;
  }

  pushScoreToHighScores(score, name) {
    let index = this.highScores.findIndex((row) => row.score <= score);

    if (index < 0) {
      return;
    }

    this.highScores.splice(index, 0, { name: name, score: score });
    this.highScores.pop();
  }

  getCurrentScore() {
    return this.score;
  }

  togglePause() {
    // Prevent rapid-fire toggling from held down keys
    const now = Date.now();
    if (now - (this._lastPauseTime || 0) < 250) return;
    this._lastPauseTime = now;

    // Only allow pausing in active gameplay modes
    const currentMode = this.modeManager.currentMode;
    const isGameplayMode =
      currentMode instanceof PlayMode ||
      currentMode instanceof BossMode ||
      currentMode instanceof BonusMode;

    if (!isGameplayMode) return;

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_PAUSE,
    );
    this.isPaused = !this.isPaused;

    if (this.pauseOverlay) {
      this.pauseOverlay.classList.toggle('is-active', this.isPaused);
    }

    if (this.bgmManager) {
      if (this.isPaused) {
        this.bgmManager.pause();
      } else {
        this.bgmManager.resume();
      }
    }
  }

  _spawnAIDroid() {
    this._disposeAIDroid(); // Clear any existing one first
    if (!this.shooter || !this.levelObject) {
      console.warn('AI Droid: no active shooter/level — skipping spawn.');
      return;
    }
    this.aiDroid = new AIDroid(
      this.scene,
      this.levelObject.surface,
      this.levelObject.surfaceObjectsManager,
      this.levelObject.projectileManager,
      this.shooter,
    );
  }

  _disposeAIDroid() {
    if (this.aiDroid) {
      this.aiDroid.dispose();
      this.aiDroid = null;
    }
  }

  _getRandomBonusPowerUp(excludeType) {
    const allTypes = [
      PowerUpType.AI_DROID,
      PowerUpType.GRENADE,
      PowerUpType.JUMP,
      PowerUpType.LASER,
      PowerUpType.ONE_UP,
      PowerUpType.LASER,
      PowerUpType.MISSILE,
      PowerUpType.PARTICLE_BLASTER,
      PowerUpType.PHANTOM,
      PowerUpType.RAPID_FIRE,
      PowerUpType.SHIELD,
      PowerUpType.SPREAD_GUN,
      PowerUpType.SYNTH_SURGE,
      PowerUpType.TIMER_EXTEND,
    ];

    // Filter out the one they just picked up
    const available = allTypes.filter((t) => t.id !== excludeType.id);

    // Pick a random one from the remaining pool
    return available[Math.floor(Math.random() * available.length)];
  }

  pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];

    if (!gp) return;

    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => this.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);
    const justReleased = (idx) => !isPressed(idx) && wasPressed(idx);

    // X-Axis (Left / Right)
    const isLeft = gp.axes[0] < -0.5;
    const wasLeft = this.prevGamepadAxis < -0.5;
    const justLeft = isLeft && !wasLeft;

    const isRight = gp.axes[0] > 0.5;
    const wasRight = this.prevGamepadAxis > 0.5;
    const justRight = isRight && !wasRight;

    const dispatchKey = (code, type, keyName) => {
      //console.log(`[DEBUG Gamepad] Dispatching synthetic ${type}: ${code}`);
      window.dispatchEvent(
        new KeyboardEvent(type, {
          code: code,
          key: keyName,
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    // 1. GLOBAL: Pause button (Index 9 / Start) works in PlayMode and BossMode
    if (
      justPressed(9) &&
      (this.modeManager.currentMode instanceof PlayMode ||
        this.modeManager.currentMode instanceof BossMode ||
        this.modeManager.currentMode instanceof BonusMode)
    ) {
      this.togglePause();
    }

    // 2. PASSIVE: Delegate custom flight/combat polling ONLY to gameplay modes
    if (
      this.modeManager.currentMode instanceof PlayMode ||
      this.modeManager.currentMode instanceof BossMode ||
      this.modeManager.currentMode instanceof BonusMode
    ) {
      this.modeManager.currentMode.pollGamepads(this, gp);
    }
    // 3. GLOBAL FALLBACK: For Menu, HighScores, Attract, and Transition modes
    else {
      if (justPressed(0) || justPressed(9)) {
        dispatchKey('Space', 'keydown');
        dispatchKey('Enter', 'keydown');
      }
      if (justReleased(0) || justReleased(9)) {
        dispatchKey('Space', 'keyup');
        dispatchKey('Enter', 'keyup');
      }

      if (justPressed(14) || justLeft) dispatchKey('ArrowLeft', 'keydown');
      if (!isLeft && wasLeft) dispatchKey('ArrowLeft', 'keyup');

      if (justPressed(15) || justRight) dispatchKey('ArrowRight', 'keydown');
      if (!isRight && wasRight) dispatchKey('ArrowRight', 'keyup');
    }

    for (let i = 0; i < gp.buttons.length; i++) {
      this.prevGamepadState[i] = isPressed(i);
    }
    this.prevGamepadAxis = gp.axes[0];
  }

  _startAttractMode() {
    this._inAttractMode = true;
    this.loadScreen(
      new ScreenAttractMode(this.screenContentManager, this.highScores, () =>
        this._endAttractMode(),
      ),
    );
  }

  _endAttractMode() {
    this._inAttractMode = false;
    this._lastMenuActivity = Date.now();
    this.populateScreenContentManager();
    this.loadScreen(new ScreenSelectSurface(this.screenContentManager));
  }
}
