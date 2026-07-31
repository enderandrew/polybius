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
import PowerUpAnnouncer from '@/utils/PowerUpAnnouncer';
import JuiceManager from '@/utils/JuiceManager';
import JuicePass from '@/Renderer/Effects/JuicePass';
import AuditorProgress from '@/utils/AuditorProgress';
import AUDITOR_SCENES from '@/Assets/AuditorScenes';
import ScreenAuditor from '@/Object/Screen/ScreenAuditor';
import AuditorMode from '@/Object/Modes/AuditorMode';
import { AIDroid } from '@/PowerUp/AIDroid';
import Starfield from '@/Renderer/Background/Starfield';
import CyberGrid from '@/Renderer/Background/CyberGrid';
import DataCascades from '@/Renderer/Background/DataCascades';
import EtherealNebula from '@/Renderer/Background/EtherealNebula';
import ScreenAttractMode from '@/Object/Screen/ScreenAttractMode';
import SolarRibbons from '@/Renderer/Background/SolarRibbons';
import FracturedMonoliths from '@/Renderer/Background/FracturedMonoliths';
import SignalDegradation from '@/Renderer/Background/SignalDegradation';
import KaleidoscopicWormhole from '@/Renderer/Background/KaleidoscopicWormhole';
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

  static DIFFICULTY_EASY = 0;
  static DIFFICULTY_MEDIUM = 1;
  static DIFFICULTY_HARD = 2;

  difficulty = Game.DIFFICULTY_MEDIUM;

  flags;

  level = 1;
  highestLevel = 99;
  levelData;
  firstLevel = true;
  score = 0;
  highScores;
  static FORESHADOW_CHANCE = 0.05;

  /**
   * Bloom overrides while an Auditor scene is on screen.
   *
   * The pass is constructed with threshold 0, meaning EVERY pixel blooms —
   * correct for a wireframe tube, ruinous for a full-frame photographic still,
   * which washes to solid white. Raising the cutoff limits the glow to genuine
   * highlights (the ember, phosphor text).
   */
  static AUDITOR_BLOOM_STRENGTH = 0.18;
  static AUDITOR_BLOOM_THRESHOLD = 0.72;

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
      if (this.currentBackground) this.currentBackground.pulse(1.2);
      if (this.levelRenderer) this.levelRenderer.beatPulse = 0.15; // 40% flash
      this.beatGlow = 0.1;
      // Auto-fire straight down the lane!
      if (this.powerUpManager?.hasSynthSurge && this.shooter) {
        this.shooter.fireSynthSurge(false);
      }
    };

    this.bgmManager.onAccent = () => {
      if (this.currentBackground) this.currentBackground.pulse(2.0);
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
      'cigarette',
      'crt',
	  'dash',
      'enemy_death',
      'enemy_shoot',
      'game',
      'game_over',
      'grenade',
      'jump',
      'knob',
      'Konami',
      'laser',
      'lightning',
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
      'thug',
      'thud',
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

    if (firstLevel) {
      const startingLevelData = this._findLevelData(levelId);
      if (startingLevelData?.selectable && startingLevelData.scoreBonus > 0) {
        // Apply the multiplier to the initial warp-in bonus
        this.score += Math.round(startingLevelData.scoreBonus * this.getScoreMultiplier());
      }
    }

    this.screenContentManager.setLevel(this.level);
    this.screenContentManager.setScore(this.score);

    // ── Hidden arc check ──────────────────────────────────────────────────
    // Replaces the parody screen entirely when it fires. The parody narrator
    // is suppressed, not layered — the absence of the joke is the signal.
    const auditorScene = this._checkAuditorTrigger();
    if (auditorScene) {
      const tokens = this.auditorProgress.buildTokens({
        highestLevel: this.highestLevel,
      });
      const auditorScreen = new ScreenAuditor(
        this.screenContentManager,
        auditorScene,
        tokens,
      );

      this.auditorProgress.recordSceneSeen(AUDITOR_SCENES.length);

      // The final scene appears to wipe progress. `finished` survives, which
      // is what keeps the attract-mode ember there forever afterward.
      if (auditorScene.special === 'wait-for-input') {
        this.auditorProgress.performFakeReset();
      }

      this.modeManager.switchMode(
        new AuditorMode(
          auditorScreen,
          auditorScene,
          () => new PlayMode(this.level),
        ),
      );
      return;
    }

    const parodyScreen = new ScreenParodySurface(this.screenContentManager);

    this._maybeForeshadow();

    this.modeManager.switchMode(
      new TransitionMode(parodyScreen, 4000, () => new PlayMode(this.level)),
    );
  }

  /**
   * Levels.js is exported either as a bare array or wrapped in a
   * `levelsCollection` property depending on how it was built; support both.
   *
   * @param {number} levelId
   * @returns {{id: number, selectable: boolean, scoreBonus: number, targetScore: number}|undefined}
   */
  _findLevelData(levelId) {
    return (
      levels.levelsCollection?.find((levelData) => levelData.id === levelId) ||
      levels.find((levelData) => levelData.id === levelId)
    );
  }

  loadLevel(level) {
    this._updateBackgroundRenderer(level);
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

    this.levelData = this._findLevelData(level);

    if (this.levelData === undefined) {
      throw new Error(`Can't find level with id === ${level} !`);
    }

    // The score bonus for a starting level is credited in startLevel(), so the
    // player's score already includes it here — compare against the full
    // target rather than a target discounted by the not-yet-awarded bonus.
    let targetScore = this.levelData.targetScore;

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
    // releaseScreen() already calls screenObject.release(); calling it here too
    // disposed every texture/geometry/material twice.
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
            if (saveData.version === 1) {
              if (Array.isArray(saveData.highScores) && saveData.highScores.length === 8) {
                this.highScores = saveData.highScores;
              }
              if (typeof saveData.highestLevel === 'number') {
                this.highestLevel = saveData.highestLevel;
              }
              // Add this line to pull difficulty:
              if (typeof saveData.difficulty === 'number') {
                this.difficulty = saveData.difficulty;
              }
            }
          } catch {
            console.warn('[Game] Corrupted versioned save data. Reverting to defaults.');
          }
        } else {
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
      difficulty: this.difficulty, // Add to save payload
    };

    localStorage.setItem(Game.SAVE_DATA_KEY, JSON.stringify(saveData));
  }

  populateScreenContentManager() {
    this.screenContentManager.set('DIFFICULTY', this.difficulty);
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
    this.currentBackgroundPhase = 0;
    this.currentBackground = null;

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
      // Remember the authored values; Auditor scenes temporarily override them.
      this.baseBloomThreshold = this.bloomPass.threshold;

      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new SMAAPass(width, height));
    }

    // Added last so flash/vignette/chromatic apply to the FINAL composited
    // image, including bloom — a flash that bloom then re-blooms would blow
    // out completely, and a vignette applied before bloom would just get
    // bloomed back into brightness at the edges.
    this.juicePass = new JuicePass(width, height);
    this.composer.addPass(this.juicePass);

    this.levelRenderer = new LevelRenderer(this.camera);
    this.scene.add(this.levelRenderer);

    this.screenGroup = new Group();
    this.screenGroup.rotation.y = Math.PI;
    this.scene.add(this.screenGroup);
    this.powerUpManager = new PowerUpManager();
    this.powerUpSpawner = new PowerUpSpawner(this.scene, null);
    this.powerUpSpawner.scene = this.scene;
    this.powerUpHUD = new PowerUpHUD(this.powerUpManager);
    this.powerUpAnnouncer = new PowerUpAnnouncer();
    this.auditorProgress = new AuditorProgress();

    // Persist accumulated playtime periodically and on unload, so scene 3's
    // "total time on file" survives a browser crash rather than only a clean
    // exit.
    setInterval(() => this.auditorProgress.flush(), 30000);
    window.addEventListener('beforeunload', () =>
      this.auditorProgress.flush(),
    );

    this.juice = new JuiceManager();
    this.juice.reduceMotion = this.loadReduceMotionPreference();
    this.levelRenderer.juice = this.juice;

    // All 8 background renderers implement pulse(intensity) but it was only
    // ever called from the music beat. Driving it from gameplay too makes the
    // environment react to PLAY, not just to the soundtrack.
    window.addEventListener('juice:superzapper', () => {
      this.currentBackground?.pulse(2.5);
    });
    window.addEventListener('juice:player-death', () => {
      this.currentBackground?.pulse(3.0);
    });
    window.addEventListener('juice:combo-milestone', ({ detail }) => {
      this.currentBackground?.pulse(1.2 + Math.min(1.2, detail.combo / 20));
    });
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
        if (this.juicePass) {
          this.juicePass.setSize(w, h);
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

    // ── Hit-stop ─────────────────────────────────────────────────────────
    // Juice decays in REAL time (a slowed world shouldn't shake for longer),
    // so it is updated before delta is zeroed for the frozen frames.
    let gameplayDelta = delta;
    if (this.juice) {
      this.juice.difficultyScale = this.getJuiceDifficultyScale();
      const frozenMs = this.juice.update(delta);
      if (frozenMs > 0) {
        // Freeze the simulation but keep rendering, so the frame the player is
        // staring at during the freeze is still the impact frame.
        gameplayDelta = 0;
      }
    }

    try {
      // Delegate active operational logic entirely to the ModeManager
      this.modeManager.update(gameplayDelta);
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

    // ── Bloom budget ─────────────────────────────────────────────────────
    // The beat is now just ANOTHER request rather than writing strength
    // directly, so it shares one clamped budget with combo, superzapper and
    // damage instead of stacking on top of them into a white smear.
    if (this.juice) {
      this.juice.requestBloom(this.beatGlow);
    }

    if (this.bloomPass) {
      // Guarded: a non-finite value assigned to either uniform propagates as
      // NaN through the bloom composite and blanks the whole frame to black,
      // with no console error and nothing for the linter to catch.
      const safe = (value, fallback) =>
        Number.isFinite(value) ? value : fallback;

      if (this.auditorSceneActive) {
        this.bloomPass.strength = safe(Game.AUDITOR_BLOOM_STRENGTH, 0.18);
        this.bloomPass.threshold = safe(Game.AUDITOR_BLOOM_THRESHOLD, 0.72);
      } else {
        const boost = this.juice ? this.juice.bloomBoost : this.beatGlow;
        this.bloomPass.strength = safe(this.baseBloom + boost, 0.8);
        this.bloomPass.threshold = safe(this.baseBloomThreshold, 0);
      }
    }

    this.updateReactiveState();

    // Handle global background elements
    if (this.currentBackground) {
      // The background is the "outside world", so it dilates with the enemies
      // while the player stays at full speed. Its renderers accumulate their
      // own clock from this delta, so oscillations slow too, not just motion.
      const backgroundScale = this.powerUpManager
        ? this.powerUpManager.getEnemyTimeScale()
        : 1;
      this.currentBackground.update(delta * backgroundScale);
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

    if (this.juicePass && this.juice) {
      this.juicePass.syncFrom(this.juice, delta);
    }

    this.composer.render();
  }

  /**
   * Harsher juice on higher difficulty — the same events shake and glitch
   * more. Free thematic reinforcement now that difficulty modes exist.
   * @return {number}
   */
  getJuiceDifficultyScale() {
    if (this.difficulty === Game.DIFFICULTY_EASY) return 0.7;
    if (this.difficulty === Game.DIFFICULTY_HARD) return 1.3;
    return 1.0;
  }

  /**
   * Per-frame environment reactions that aren't impulse-driven: vignette from
   * low lives, desaturation from Time Dilation, FOV kick, CRT shell classes,
   * and the sanity link.
   *
   */
  updateReactiveState() {
    if (!this.juice) return;

    // ── Sanity link ────────────────────────────────────────────────────────
    // ScreenPlay already drains a sanityLevel and glitches its own HUD text
    // with it, but nothing else consumed that signal. Feeding it to the juice
    // layer makes the whole IMAGE degrade as the machine "gets to you" —
    // which is rather the point of a game called Polybius.
    if (this.screenObject && this.screenObject.sanityLevel !== undefined) {
      this.juice.sanity = Math.max(0, Math.min(1, this.screenObject.sanityLevel / 100));
    } else {
      this.juice.sanity = 1;
    }

    // ── Low-life vignette ─────────────────────────────────────────────────
    let vignette = 0;
    if (this.modeManager?.currentMode?.constructor?.name === 'PlayMode') {
      if (this.lives === 1) {
        // Pulsing rather than static, so it reads as an alarm not a filter.
        vignette = 0.35 + Math.sin(performance.now() * 0.006) * 0.12;
      } else if (this.lives === 2) {
        vignette = 0.15;
      }
    }
    this.juice.setVignette(vignette);

    // ── Time Dilation visual signature ────────────────────────────────────
    // Audio, motion and backgrounds all slow, but the IMAGE was unchanged,
    // so the power-up had no visual tell at all. A cold desaturation makes it
    // instantly readable.
    if (this.powerUpManager?.hasTimeDilation) {
      this.juice.setDesaturateFloor(0.4);
    }

    // ── Camera FOV kick ───────────────────────────────────────────────────
    if (this.camera) {
      const targetFov = this.baseFov ?? (this.baseFov = this.camera.fov);
      // Warp widens the FOV dramatically (75 -> ~110) on top of any impulse
      // kick, producing the tunnel-stretch as the player dives down the tube.
      const warpFov = this.juice.reduceMotion ? 0 : this.juice.warp * 35;
      const desired = targetFov + this.juice.fovKick + warpFov;
      if (Math.abs(this.camera.fov - desired) > 0.01) {
        this.camera.fov = desired;
        this.camera.updateProjectionMatrix();
      }
    }

    // ── Audio: muffle + pitch bend ────────────────────────────────────────
    if (this.bgmManager) {
      // Ringing-ears muffle: on the last life, or briefly after any hit
      // (trauma is a good proxy — it spikes on exactly the events that should
      // muffle and decays on its own).
      let muffle = 1;
      if (this.modeManager?.currentMode?.constructor?.name === 'PlayMode') {
        if (this.lives === 1) muffle = 0.55;
        muffle = Math.min(muffle, 1 - Math.min(0.8, this.juice.trauma));
      }
      this.bgmManager.setMuffle(muffle);
      this.bgmManager.updateMuffle(1 / 60);

      // Pitch sags during hit-stop so the audio distorts with the visual.
      this.bgmManager.setPitchBend(
        this.juice.hitStopRemainingMs > 0 ? 0.82 : 1,
      );
    }

    // ── Warp: FOV stretch + starfield speed lines ─────────────────────────
    // Driven off the shooter descending the tube at level end.
    const descending =
      this.shooter &&
      this.levelObject &&
      this.shooter.inState?.(this.shooter.constructor.STATE_GOING_DOWN_THE_TUBE);
    this.juice.setWarp(descending ? 1 : 0);

    if (this.currentBackground && this.juice.warp > 0.001) {
      // Starfield and friends already expose pulse(); reuse it to stretch the
      // stars into lines rather than adding a parallel speed system.
      this.currentBackground.pulse(1 + this.juice.warp * 2.5);
    }

    // ── CRT shell reactions ───────────────────────────────────────────────
    // crt.css already defines con-high / brt-low and they were only reachable
    // by clicking the physical knobs. Driving them from gameplay is free juice
    // with no new rendering code.
    this._updateCrtClasses();
  }

  _updateCrtClasses() {
    const screen = document.getElementById('screen');
    if (!screen) return;

    const wantContrast = this.juice.flash > 0.15;
    if (wantContrast !== this._crtContrastOn) {
      this._crtContrastOn = wantContrast;
      screen.classList.toggle('con-high', wantContrast);
    }

    const wantDim = this.juice.sanity < 0.35;
    if (wantDim !== this._crtDimOn) {
      this._crtDimOn = wantDim;
      screen.classList.toggle('brt-low', wantDim);
    }
  }

  /** @return {boolean} */
  loadReduceMotionPreference() {
    try {
      const stored = localStorage.getItem('polybius_reduce_motion');
      if (stored !== null) return stored === 'true';
    } catch {
      // localStorage can throw in private browsing; fall through to the OS hint.
    }
    // Respect the OS-level accessibility setting when we have no explicit choice.
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    );
  }

  /** @param {boolean} value */
  setReduceMotion(value) {
    if (this.juice) this.juice.reduceMotion = value;
    try {
      localStorage.setItem('polybius_reduce_motion', String(value));
    } catch {
      // Non-fatal — the setting just won't persist.
    }
  }

  rewardCallback(reward) {
    // Apply difficulty AND combo multipliers to all incoming points
    const comboMultiplier = this.juice ? this.juice.getComboMultiplier() : 1;
    const modifiedReward = Math.round(
      reward * this.getScoreMultiplier() * comboMultiplier,
    );
    this.score += modifiedReward;

    if (
      this.lives < this.getMaxLives() &&
      Math.floor(this.score / Game.BONUS_EVERY) !==
        Math.floor((this.score - modifiedReward) / Game.BONUS_EVERY)
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

  /** Words flashed for a single frame on major beats. */
  static SUBLIMINAL_WORDS = ['OBEY', 'SLEEP', 'CONSUME', 'SUBMIT', 'STAY'];

  /**
   * @return {?object} the scene to show, or null for a normal parody screen.
   */
  /**
   * Rare, deniable hints that something else is present, layered under the
   * ordinary joke screens.
   *
   * Two INDEPENDENT rolls, not one: a player who notices the sound and a
   * player who notices the glitch shouldn't be the same player, and the two
   * co-occurring occasionally (0.25% of transitions) should feel like a
   * coincidence rather than a scripted beat.
   *
   * Deliberately NOT gated on arc progress. Foreshadowing that only starts
   * after scene 1 isn't foreshadowing. Before the reveal these read as a
   * failing cabinet; afterwards the player knows exactly what the sound is,
   * which makes the same 5% land completely differently. Same trigger, two
   * meanings, no extra content.
   */
  _maybeForeshadow() {
    // Quiet enough to be mistaken for room tone under the narration. The
    // Auditor scenes play the same cue at 0.9 — the volume gap is what keeps
    // this ambient and those declarative.
    if (Math.random() < Game.FORESHADOW_CHANCE) {
      messageBroker.publish(
        MessageBroker.TOPIC_AUDIO,
        MessageBroker.MESSAGE_CIGARETTE_QUIET,
      );
    }

    if (Math.random() < Game.FORESHADOW_CHANCE) {
      JuiceManager.emit('foreshadow');
    }
  }

  /**
   * Completing the hidden arc permanently raises the life cap. Deliberately
   * unannounced — the player simply has six icons one day. It also makes the
   * ordinary ending reachable for someone who has put in the hours, since
   * surfaces 241-256 plus the boss on five lives is the hardest ask in the
   * game.
   *
   * @return {number}
   */
  getMaxLives() {
    return this.auditorProgress?.finished ? 6 : 5;
  }

  _checkAuditorTrigger() {
    if (!this.auditorProgress) return null;

    // Never on the very first level of a run — the player needs the parody
    // established as the norm before it can be broken.
    if (this.firstLevel) return null;

    const sanity =
      this.screenObject && this.screenObject.sanityLevel !== undefined
        ? this.screenObject.sanityLevel / 100
        : 1;

    if (!this.auditorProgress.shouldTrigger(sanity, AUDITOR_SCENES.length)) {
      return null;
    }

    const id = this.auditorProgress.nextSceneId(AUDITOR_SCENES.length);
    return AUDITOR_SCENES.find((scene) => scene.id === id) ?? null;
  }

  _fireSubliminal() {
    JuiceManager.emit('subliminal', { invert: 0.9 });

    if (this.levelRenderer?.pickupTextRenderer && this.shooter) {
      const word =
        Game.SUBLIMINAL_WORDS[
          Math.floor(Math.random() * Game.SUBLIMINAL_WORDS.length)
        ];
      // Drawn at very low contrast and large scale — meant to register
      // peripherally rather than be read.
      this.levelRenderer.pickupTextRenderer.spawnAt(
        this.levelRenderer.shooterRenderer.position,
        word,
        'rgba(255,255,255,0.06)',
        3.2,
      );
    }
  }

  levelWonCallback() {
    this._fireSubliminal();
    if (this.firstLevel && this.levelData.selectable) {
      // The score bonus itself was already credited in startLevel(); only the
      // one-off extra life for a large starting bonus is granted here.
      if (
        this.levelData.scoreBonus >= Game.BONUS_EVERY &&
        this.lives < this.getMaxLives()
      ) {
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
    // Hand-maintained list, so a type removed from PowerUpType would silently
    // become `undefined` here and throw on the .id access below. The filter
    // tolerates that rather than crashing the warp bonus.
    const allTypes = [
      PowerUpType.AI_DROID,
      PowerUpType.FIREWALL,
      PowerUpType.GRENADE,
      PowerUpType.ONE_UP,
      PowerUpType.LASER,
      PowerUpType.MISSILE,
      PowerUpType.PARTICLE_BLASTER,
      PowerUpType.PHANTOM,
      PowerUpType.PHASE_DASH,
      PowerUpType.RAPID_FIRE,
      PowerUpType.SHIELD,
      PowerUpType.SPREAD_GUN,
      PowerUpType.SYNTH_SURGE,
      PowerUpType.TIME_DILATION,
      PowerUpType.TIMER_EXTEND,
    ].filter(Boolean);

    // Filter out the one they just picked up
    const available = allTypes.filter((t) => t.id !== excludeType?.id);

    if (available.length === 0) {
      return null;
    }

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

      // NEW: Send Up/Down synthetic keys for the menu!
      const isUp = gp.axes[1] < -0.5;
      const wasUp = (this.prevGamepadAxisY || 0) < -0.5;
      if (justPressed(12) || (isUp && !wasUp)) dispatchKey('ArrowUp', 'keydown');
      if (!isUp && wasUp) dispatchKey('ArrowUp', 'keyup');

      const isDown = gp.axes[1] > 0.5;
      const wasDown = (this.prevGamepadAxisY || 0) > 0.5;
      if (justPressed(13) || (isDown && !wasDown)) dispatchKey('ArrowDown', 'keydown');
      if (!isDown && wasDown) dispatchKey('ArrowDown', 'keyup');
    }

    for (let i = 0; i < gp.buttons.length; i++) {
      this.prevGamepadState[i] = isPressed(i);
    }
    this.prevGamepadAxis = gp.axes[0];
    this.prevGamepadAxisY = gp.axes[1]; // Track the Y axis globally
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

  _updateBackgroundRenderer(level) {
    // Phases are exactly 32 levels each
    const phase = Math.floor((level - 1) / 32) + 1;
    
    // If we are already in the correct phase background, do nothing
    if (this.currentBackgroundPhase === phase) return;
    this.currentBackgroundPhase = phase;

    // Clean up the old background
    if (this.currentBackground) {
      this.scene.remove(this.currentBackground);
      this.currentBackground.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this.currentBackground = null;
    }

    // Mount the new background
    switch (phase) {
      case 2:
        this.currentBackground = new CyberGrid();
        break;
      case 3:
        this.currentBackground = new DataCascades();
        break;
      case 4:
        this.currentBackground = new EtherealNebula();
        break;
      case 5:
        this.currentBackground = new SolarRibbons();
        break;
      case 6:
        this.currentBackground = new FracturedMonoliths();
        break;
      case 7:
        this.currentBackground = new SignalDegradation();
        break;
      case 8:
        this.currentBackground = new KaleidoscopicWormhole();
        break;
      default:
        this.currentBackground = new Starfield();
        break;
    }

    this.scene.add(this.currentBackground);
  }

  getScoreMultiplier() {
    if (this.difficulty === Game.DIFFICULTY_EASY) return 1.5; // Beat levels faster
    if (this.difficulty === Game.DIFFICULTY_HARD) return 0.75; // Grind longer
    return 1.0;
  }

  getDropMultiplier() {
    if (this.difficulty === Game.DIFFICULTY_EASY) return 1.5; // More power-ups
    if (this.difficulty === Game.DIFFICULTY_HARD) return 0.5; // Far fewer drops
    return 1.0;
  }
}
