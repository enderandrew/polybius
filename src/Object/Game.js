import { AudioListener, Group, PerspectiveCamera, Scene, WebGLRenderer, Vector2 } from 'three';
import BgmManager from '@/Object/Manager/BgmManager';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass';
import Level from '@/Object/Level';
import LevelRenderer from '@/Renderer/LevelRenderer';
import Surface from '@/Object/Surface/Surface';
import State from '@/Object/State';
import ScreenPlay from '@/Object/Screen/ScreenPlay';
import ScreenSelectSurface from '@/Object/Screen/ScreenSelectSurface';
import ScreenHighScores from '@/Object/Screen/ScreenHighScores';
import ScreenContentManager from '@/Object/Screen/ScreenContentManager';
import keyboardInput from '@/utils/KeyboardInput';
import surfaces from '@/Assets/Surfaces';
import levels from '@/Assets/Levels';
import AudioManager from '@/Object/Manager/AudioManager';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import ScreenParodySurface from '@/Object/Screen/ScreenParodySurface';
import { PowerUpManager } from '@/PowerUp/PowerUpManager';
import { PowerUpSpawner  } from '@/PowerUp/PowerUpSpawner';
import { PowerUpType } from '@/PowerUp/PowerUpType';
import { PowerUpHUD } from '@/PowerUp/PowerUpHUD';
import { AIDroid } from '@/PowerUp/AIDroid';
import Starfield from '@/Renderer/Background/Starfield';
import { BonusStage } from '@/Object/BonusStage/BonusStage';
import ScreenAttractMode from '@/Object/Screen/ScreenAttractMode';
import ScreenGameEnd from '@/Object/Screen/ScreenGameEnd';
import { BossFight } from '@/Object/BossFight/BossFight';
import { initVoiceCache } from '@/utils/voiceCache';

export default class Game {
  // Removed legacy @readonly decorators
  static BONUS_EVERY = 20000;

  static HIGH_SCORES_STORAGE_KEY = 'high_scores';
  static HIGHEST_LEVEL = 'highest_level';

  static STATE_SELECT_SURFACE = new State(0, 0, 'select_surface');
  static STATE_PLAY = new State(0, 0, 'play');
  static STATE_HIGH_SCORES = new State(0, 0, 'high_scores');

  static FLAG_LOAD_NEXT_LEVEL = 0x1;

  // Modern ES class fields replacing JSDoc comments
  state;
  prevState;
  screenStateUpdated = false;
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
  _inAttractMode    = false;
  
  bossFight = null;
  _bossFightNextLevel = null;

  constructor () {
    this.isWarping = false;
    this.bonusScoreOffset = 0;
    this.setState(Game.STATE_SELECT_SURFACE);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

    window.addEventListener('keydown', (e) => {
      if (e.code === 'End' && this.state.equals(Game.STATE_PLAY) && !this.isLoadingLevel) {
        
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
    }, true);
  }

  async bootAudio () {
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
      'yes'
    ];

    try {
        await this.audioManager.preload(allSoundEffects);
        console.log('[Game] All audio pre-decoded and ready!');
    } catch (error) {
        console.warn('[Game] Audio preloading encountered an error:', error);
    }
  }

  handleState () {
    if (!this.screenStateUpdated) {
      this.releaseScreen();

      if (this.state.equals(Game.STATE_PLAY)) {
        this.releaseLevel();
        this.loadScreen(new ScreenPlay(this.screenContentManager));
        this.loadLevel(this.level);
        this.screenContentManager.setLevel(this.level);

        if (this.powerUpHUD) this.powerUpHUD.show();

      } else if (this.state.equals(Game.STATE_SELECT_SURFACE)) {
        this.releaseLevel();

        this.lives = 5;
        this.score = 0;
        this.bonusScoreOffset = 0;

        if (this.powerUpHUD) {
            this.powerUpHUD.clear();
            this.powerUpHUD.hide();
        }
        this.powerUpManager.consumeWarpTokens();
        this.powerUpManager.reset();
        this.populateScreenContentManager();
        this.loadScreen(new ScreenSelectSurface(this.screenContentManager));
		this._lastMenuActivity = Date.now();
        this._inAttractMode    = false;
        messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_GAME);

      } else if (this.state.equals(Game.STATE_HIGH_SCORES)) {
        this.releaseLevel();
        if (this.powerUpHUD) this.powerUpHUD.hide();
        messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_GAME_OVER);
        this.loadScreen(new ScreenHighScores(this.screenContentManager));
      }

      this.saveGameState();
    }

    this.screenStateUpdated = true;
  }

  setState (state) {
    if (this.levelStartTimeout) {
      clearTimeout(this.levelStartTimeout);
      this.levelStartTimeout = null;
    }
    this.prevState = this.state;
    this.state = state;
    this.screenStateUpdated = false;
  }

  startLevel (levelId, firstLevel = false) {
    // Prevent double-triggering! If we are already loading, ignore input.
    if (this.isLoadingLevel) return;
    this.isLoadingLevel = true;

    this.firstLevel = firstLevel;
    this.level = levelId;
    this.screenContentManager.setLevel(this.level);
    if (this.powerUpHUD) this.powerUpHUD.hide();

    // Clear out whatever screen is currently active (Menu or previous Play UI)
    this.releaseScreen();
    
    // Clear out the previous level geometry if we are between levels
    this.releaseLevel();

    // Reset the camera back to the world origin! Without this, the camera is left stranded at the end of the previous level.  
    this.camera.position.set(0, 0, -6);
    this.camera.lookAt(0, 0, 10);

    // Load the Parody Screen using your native screen manager
    this.loadScreen(new ScreenParodySurface(this.screenContentManager));
    
    // Nudge it slightly closer to the camera to prevent Z-fighting
    this.screenObject.position.z = 0.1;

    // Wait 3 seconds, then trigger the native play state
    if (this.levelStartTimeout) {
        clearTimeout(this.levelStartTimeout);
    }

    this.levelStartTimeout = setTimeout(() => {
      this.setState(Game.STATE_PLAY);
	  this.isLoadingLevel = false;
      this.levelStartTimeout = null;
    }, 4000);
  }

  loadLevel (level) {
    let surfaceId = ((level - 1) % 32) + 1;
    let surfaceData = surfaces.find(s => s.id === surfaceId);
    if (!surfaceData) {
      console.warn(`[Game] Can't find surface level with id === ${surfaceId}! Returning to menu.`);
      this.setState(Game.STATE_SELECT_SURFACE);
      return; // Stop execution here
    }
  
    const vectorCoords = surfaceData.coords.map(c => new Vector2(c.x, c.y));

    let surface = new Surface(
      surfaceData.id,
      surfaceData.name,
      surfaceData.isOpen,
      vectorCoords,
      surfaceData.zOffset
    );

    if (surface === undefined) {
      this.setState(Game.STATE_SELECT_SURFACE);
      throw new Error(`Can't find surface level with id === ${surfaceId} !`);
    }

    this.levelData = levels.find(levelData => levelData.id === level);

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
      this
    );

    console.log("GAME: Level loaded. New Surface:", surface);
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

  releaseLevel () {
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
    if (this.pauseOverlay) this.pauseOverlay.style.display = 'none';
    if (this.bonusOverlay) this.bonusOverlay.style.display = 'none';

    this._disposeAIDroid();
    this.powerUpSpawner.webGeometry = null;
    this.powerUpSpawner.clearAll();    
    this.levelObject.release();
    this.levelObject = null;
    this.shooter = null;
    this.levelRenderer.releaseLevel();
  }

  loadScreen (screen) {
    if (this.screenObject !== null) {
      this.screenObject.release();
    this.releaseScreen();
    }

    this.releaseScreen();
    this.screenObject = screen;
    this.screenGroup.add(this.screenObject);
  }

  releaseScreen () {
    if (this.screenObject === null) return;
    if (this.bonusOverlayTimeout) {
      clearTimeout(this.bonusOverlayTimeout);
      this.bonusOverlayTimeout = null;
    }
    this.screenObject.release();
    this.screenGroup.remove(this.screenObject);
    this.screenObject = null;
  }

  setupLogic () {
    this.screenContentManager = new ScreenContentManager();

    this.loadGameState();
    this.populateScreenContentManager();

    this.surfacesCollection = Surface.fromDataset(surfaces);
  }

  loadGameState () {
    this.highScores = [
        { name: 'NWO', score: 524288 },
        { name: 'MKU', score: 262144 },
        { name: 'CIA', score: 131072 },
        { name: 'NSA', score: 65536 },
        { name: 'FBI', score: 32768 },
        { name: 'UFO', score: 16384 },
        { name: 'BIG', score: 8192 },
        { name: 'FOT', score: 4096 }
    ];

    const storedScores = localStorage.getItem(Game.HIGH_SCORES_STORAGE_KEY);
    if (storedScores !== null) {
      try {
        const parsedScores = JSON.parse(storedScores);
        
        // Ensure it is actually an array and has exactly 8 records
        if (Array.isArray(parsedScores) && parsedScores.length === 8) {
          this.highScores = parsedScores;
        } else {
          console.warn('[Game] Invalid high score structure. Reverting to defaults.');
        }
      } catch {
        console.warn('[Game] Corrupted high scores in localStorage. Reverting to defaults.');
      }
    }

    this.highestLevel = 1;
    const storedLevel = localStorage.getItem(Game.HIGHEST_LEVEL);
    if (storedLevel !== null) {
      const parsedLevel = parseInt(storedLevel, 10);
      
      if (!isNaN(parsedLevel)) {
        this.highestLevel = parsedLevel;
      }
    }
    
    this.highestLevel = Math.min(this.highestLevel, 256);
  }

  saveGameState () {
    console.log('STATE SAVED');
    localStorage.setItem(Game.HIGH_SCORES_STORAGE_KEY, JSON.stringify(this.highScores));
    localStorage.setItem(Game.HIGHEST_LEVEL, this.highestLevel.toString());
  }

  populateScreenContentManager () {
    this.screenContentManager.setLives(this.lives);
    this.screenContentManager.setLevel(this.level);
    this.screenContentManager.setScore(this.score);
    this.screenContentManager.setCredits(this.credits);
    this.screenContentManager.setHighScores(this.highScores);
    this.screenContentManager.setSuperzapperUsed(false);
    this.screenContentManager.setSelectActive(0);
    this.screenContentManager.setSelectOffset(0);
    this.screenContentManager.setSelectLevels(
      levels.filter(level => level.selectable && level.id <= this.highestLevel)
    );

    this.screenContentManager.setLevelSelectedCallback(this.startLevel.bind(this));
    this.screenContentManager.setPushHighScoreCallback(this.pushScoreToHighScores.bind(this));
    this.screenContentManager.setCloseHighScoresScreenCallback(() => { this.setState(Game.STATE_SELECT_SURFACE); });
  }

  setupRenderer (highQuality = true, isMobile = false) {
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
    this.pauseOverlay.style.position = 'absolute';
    this.pauseOverlay.style.top = '0';
    this.pauseOverlay.style.left = '0';
    this.pauseOverlay.style.width = '100%';
    this.pauseOverlay.style.height = '100%';
    this.pauseOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)'; // Dims the screen
    this.pauseOverlay.style.display = 'none'; // Hidden by default
    this.pauseOverlay.style.justifyContent = 'center';
    this.pauseOverlay.style.alignItems = 'center';
    this.pauseOverlay.style.color = '#00ffff'; 
    this.pauseOverlay.style.fontFamily = '"Courier New", Courier, monospace';
    this.pauseOverlay.style.fontSize = '5rem';
    this.pauseOverlay.style.fontWeight = 'bold';
    this.pauseOverlay.style.textShadow = '0 0 20px #00ffff';
    this.pauseOverlay.style.letterSpacing = '10px';
    this.pauseOverlay.style.zIndex = '1000';
    this.pauseOverlay.style.pointerEvents = 'none'; // Prevents blocking clicks
    this.pauseOverlay.innerHTML = 'PAUSE';

    displayContainer.appendChild(this.pauseOverlay);

    this.bonusOverlay = document.createElement('div');
    this.bonusOverlay.style.position = 'absolute';
    this.bonusOverlay.style.top = '40%';
    this.bonusOverlay.style.width = '100%';
    this.bonusOverlay.style.textAlign = 'center';
    this.bonusOverlay.style.color = '#ffff00';
    this.bonusOverlay.style.fontFamily = '"Courier New", Courier, monospace';
    this.bonusOverlay.style.fontSize = '4rem';
    this.bonusOverlay.style.fontWeight = 'bold';
    this.bonusOverlay.style.textShadow = '0 0 15px #ffff00';
    this.bonusOverlay.style.zIndex = '1000';
    this.bonusOverlay.style.pointerEvents = 'none';
    this.bonusOverlay.style.display = 'none';
    this.bonusOverlay.innerHTML = 'YES<br/><span style="font-size: 2rem">BONUS POWERUP!</span>';

    displayContainer.appendChild(this.bonusOverlay);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (highQuality) {
      // Pass the interior dimensions to the post-processing effects
      this.bloomPass = new UnrealBloomPass(
        new Vector2(width, height), 
        0.8,  // Base strength
        0.9,
        0
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
      if (this.state?.equals(Game.STATE_SELECT_SURFACE) && !this._inAttractMode) {
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

  update () {
    //console.log("This shooter value:", this.shooter);
    requestAnimationFrame(this.update.bind(this));
    
    const now = performance.now();
    // Clamp to 100ms (10fps floor) — prevents huge jumps when the tab was
    // backgrounded and requestAnimationFrame paused for seconds/minutes.
    const delta = this._lastTime ? Math.min(0.1, (now - this._lastTime) / 1000) : 0;
    this._lastTime = now;

    if (this.beatGlow === undefined) {
        this.beatGlow = 0.0;
        // Save whatever you originally set your bloom pass strength to (e.g., 1.5)
        // Adjust 'this.bloomPass' to whatever variable name you used for your UnrealBloomPass
        this.baseBloom = this.bloomPass ? this.bloomPass.strength : 0.5; 
    }
  
    this.beatGlow += (0.0 - this.beatGlow) * 0.10;

    if (this.levelRenderer) {
      const pulseScale = 1.0 + (this.beatGlow * 0.1); 
      this.levelRenderer.scale.set(pulseScale, pulseScale, 1.0);
    }

    //if (this.camera) {
    //  this.camera.fov = 75 - (this.beatGlow * 2.5);
    //  this.camera.updateProjectionMatrix();
    //}

    if (this.bloomPass) {
        this.bloomPass.strength = (this.baseBloom + this.beatGlow);
    }
  
    this.handleState();

    if (!this.isLoadingLevel) {
        keyboardInput.dispatchActions();
        this.pollGamepads();
    }

    if (this.state.equals(Game.STATE_PLAY) && !this.isLoadingLevel && !this.bonusStage) {
        this.bgmManager.playForLevel(this.level);
    } else {
        this.bgmManager.stop();
    }

    this.bgmManager.update();

    if (this.screenObject !== null) {
      this.screenObject.update();
    }

    if (this.starfield) {
        this.starfield.update(delta);
    }

    if (this.isPaused) {
      // Keep rendering the screen so it doesn't go black, but skip updating the level
      this.composer.render();
      return; 
    }
  
    if (this.bossFight) {
      this.bossFight.update(delta);
    } else if (this.bonusStage) {
      this.bonusStage.update(delta);
    } else if (this.levelObject !== null && this.levelRenderer !== null) {
      this.levelObject.update(delta);
      this.levelRenderer.update();

      // Power-up tick
      this.powerUpSpawner.update(delta);
      this.powerUpManager.update(delta);
      if (this.aiDroid) this.aiDroid.update(delta);
  
      if (this.shooter && this.shooter.laneId !== undefined) {
        // DYNAMIC DEPTH: Uses 0.1 at the rim, but perfectly tracks the ship down the tube!
        const hitDepth = Math.max(0.1, this.shooter.zPosition);
        
        const collected = this.powerUpSpawner.checkPlayerCollision(this.shooter.laneId, hitDepth);

        if (collected) {
          // Because normal play is Z=0 and jumping is Z=0.22, anything beyond 0.25 is a warp!
          const isNativeWarping = this.shooter.zPosition > 0.25;
          
          if (isNativeWarping) {
              // Play the YES sound!
              messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_YES);
              
              // Flash the overlay
              this.bonusOverlay.style.display = 'block';
			  
			  
              if (this.bonusOverlayTimeout) {
                  clearTimeout(this.bonusOverlayTimeout);
              }
	          
              this.bonusOverlayTimeout = setTimeout(() => {
                if (this.bonusOverlay) {
                  if(this.bonusOverlay) this.bonusOverlay.style.display = 'none';
                }
                this.bonusOverlayTimeout = null;
              }, 2000);
              
              // Grant the random bonus
              const bonusType = this._getRandomBonusPowerUp(collected);
              if (bonusType) {
                  this.powerUpManager.collect(bonusType, this);
              }
          } else {
              // Normal audio logic
              if (collected.id === 'ONE_UP' || collected.id === 'EXTRA_LIFE') {
                  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_1UP);
              } else if (collected.id === 'PHANTOM') {
                  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PHANTOM);
              } else if (collected.id === 'SHIELD') {
                  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_SHIELD);
              } else if (collected.id === 'SYNTH_SURGE') {
                  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_SYNTH_SURGE);
              } else {
                  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_POWERUP);
              }
          }

          this.powerUpManager.collect(collected, this);
          this.screenContentManager.setScore(this.score);
        }
      }
    }
  
    if (
      this.state?.equals(Game.STATE_SELECT_SURFACE) &&
      !this._inAttractMode &&
      Date.now() - this._lastMenuActivity > 8000
    ) {
      this._startAttractMode();
    }
	this.audioManager.update();
    this.composer.render();
  }

  rewardCallback (reward) {
    this.score += reward;

    if (
      this.lives < 5
      && Math.floor(this.score / Game.BONUS_EVERY) !== Math.floor((this.score - reward) / Game.BONUS_EVERY)
    ) {
      this.lives++;
      this.screenContentManager.set(ScreenContentManager.KEY_LIVES, this.lives);
    }

    this.screenContentManager.setScore(this.score);
  }

  requestWarp () {
    // Treat an instant warp exactly like beating the level natively
    this.levelWonCallback();
  }

  levelWonCallback () {
    if (this.firstLevel && this.levelData.selectable) {
      this.score += this.levelData.scoreBonus;
      this.screenContentManager.setScore(this.score);

      if (this.levelData.scoreBonus >= Game.BONUS_EVERY && this.lives < 5) {
        this.lives++;
        this.screenContentManager.set(ScreenContentManager.KEY_LIVES, this.lives);
      }
    }

    this.firstLevel = false;
    const nextLevel       = this.level + 1;
    const isBossLevel     = this.level % 32 === 0;
    this.releaseLevel();

    if (isBossLevel) {
        this._startBossFightSequence(nextLevel);
    } else if (this.powerUpManager.hasBonusStageEarned) {
        this.powerUpManager.resetBonusStageEarned();
        this._startBonusStageSequence(nextLevel);
    } else {
        this.startLevel(nextLevel);
    }
  }

  shooterKilledCallback () {
    this.lives--;
    this.isWarping = false; 
    if (this.bonusOverlay) this.bonusOverlay.style.display = 'none';

    this.screenContentManager.setLives(this.lives);

    if (this.lives === 0) {
      if (this.level > this.highestLevel) {
        this.highestLevel = this.level;
      }

      this.powerUpManager.consumeWarpTokens();
      this.powerUpManager.reset();
      if (this.powerUpHUD) this.powerUpHUD.clear();

      this.setState(Game.STATE_HIGH_SCORES);
      return false;
    }

    return true;
  }

  pushScoreToHighScores (score, name) {
    let index = this.highScores.findIndex(row => row.score <= score);

    if (index < 0) {
      return;
    }

    this.highScores.splice(index, 0, { name: name, score: score });
    this.highScores.pop();
  }

  getCurrentScore () {
    return this.score;
  }

  togglePause () {
    // Only allow pausing if we are actually in the play state
  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PAUSE);
  if (!this.state.equals(Game.STATE_PLAY)) return;
    this.isPaused = !this.isPaused;
    if (this.pauseOverlay) {
      this.pauseOverlay.style.display = this.isPaused ? 'flex' : 'none';
    }
    if (this.isPaused) {
        this.bgmManager.pause();
    } else {
        this.bgmManager.resume();
    }
  }
  
  _spawnAIDroid () {
    this._disposeAIDroid();  // Clear any existing one first
    if (!this.shooter || !this.levelObject) {
      console.warn('AI Droid: no active shooter/level — skipping spawn.');
      return;
    }
    this.aiDroid = new AIDroid(
      this.scene,
      this.levelObject.surface,
      this.levelObject.surfaceObjectsManager,
      this.levelObject.projectileManager,
      this.shooter
    );
  }
  
  _disposeAIDroid () {
    if (this.aiDroid) {
      this.aiDroid.dispose();
      this.aiDroid = null;
    }
  }

  _startBonusStageSequence (nextLevel) {
    this._bonusStageNextLevel = nextLevel;
    this.isLoadingLevel = true;

    if (this.powerUpHUD) this.powerUpHUD.hide();
    this.powerUpManager.consumeWarpTokens();

    this.camera.position.set(0, 0, -6);
    this.camera.lookAt(0, 0, 10);
  
    // Show parody message
    const msg = 'SUPERMAN 64? FLY THROUGH RINGS.';
    this.loadScreen(new ScreenParodySurface(this.screenContentManager, msg));
    this.screenObject.position.z = 0.1;
  
    // Read it aloud
    try {
      window.speechSynthesis.cancel();
      const utt   = new SpeechSynthesisUtterance('Superman 64? Fly through rings.');
      utt.rate    = 0.85;
      utt.pitch   = 0.9;
      window.speechSynthesis.speak(utt);
    } catch (error) { console.debug('[Game] Speech synthesis failed in bonus stage sequence:', error); }
  
    const emeralds = Math.min(7, Math.floor((this.level - 1) / 32));

    setTimeout(() => {
      this.releaseScreen();
      this.bonusStage    = new BonusStage(
        this.scene,
        this.camera,
        this._onBonusStageEnd.bind(this),
        emeralds 
      );
      this.isLoadingLevel = false;
    }, 3500);
  }
  
  _onBonusStageEnd (totalScore, ringsCleared) {
    if (totalScore > 0) {
      this.score += totalScore;
      this.bonusScoreOffset += totalScore;
      this.screenContentManager.setScore(this.score);
    }
    if (ringsCleared >= BonusStage.RING_COUNT) {
      this.lives++;
      this.screenContentManager.set(ScreenContentManager.KEY_LIVES, this.lives);
      messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_1UP);
    }
    if (this.bonusStage) { this.bonusStage.dispose(); this.bonusStage = null; }
  
    this.camera.position.set(0, 0, -6);
    this.camera.lookAt(0, 0, 10);
  
    const msg = ringsCleared === 0
      ? 'EVEN SUPERMAN COULD FLY THROUGH RINGS. JUST SAYING.'
      : ringsCleared >= BonusStage.RING_COUNT
        ? 'PERFECT RUN. SINNESLÖSCHEN IS PLEASED.'
        : `${ringsCleared} RINGS. ADEQUATE. THE GOVERNMENT EXPECTED MORE.`;
  
    this.loadScreen(new ScreenParodySurface(this.screenContentManager, msg));
    this.screenObject.position.z = 0.1;
    this.isLoadingLevel = true;
  
    setTimeout(() => {
      this.isLoadingLevel  = false;
      this.startLevel(this._bonusStageNextLevel);
    }, 2500);
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
      PowerUpType.TIMER_EXTEND
    ];
    
    // Filter out the one they just picked up
    const available = allTypes.filter(t => t.id !== excludeType.id);
    
    // Pick a random one from the remaining pool
    return available[Math.floor(Math.random() * available.length)];
  }

  pollGamepads () {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0]; 
    
    if (!gp) return;

    // Edge-detection helpers for buttons
    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => this.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);
    const justReleased = (idx) => !isPressed(idx) && wasPressed(idx); // The falling edge!

    // Edge-detection helpers for the thumbstick
    const isLeft = gp.axes[0] < -0.5;
    const wasLeft = this.prevGamepadAxis < -0.5;
    const justLeft = isLeft && !wasLeft;
    const releasedLeft = !isLeft && wasLeft;

    const isRight = gp.axes[0] > 0.5;
    const wasRight = this.prevGamepadAxis > 0.5;
    const justRight = isRight && !wasRight;
    const releasedRight = !isRight && wasRight;

    // Helper to send native keyboard events instantly without timeouts
    const dispatchKey = (code, type) => {
      document.dispatchEvent(new KeyboardEvent(type, { code }));
    };

    // Pause Button (Index 9)
    if (justPressed(9)) {
        if (this.state.equals(Game.STATE_PLAY)) {
            this.togglePause();
        }
    }

    // Play State Controls
    if (this.state.equals(Game.STATE_PLAY)) {
        if (!this.isPaused && this.shooter) {
          if (justPressed(14) || justLeft) this.shooter.moveLeft();
          if (justPressed(15) || justRight) this.shooter.moveRight();
          if (justPressed(12) || justPressed(1) || justPressed(3)) this.shooter.jump();
          if (justPressed(13) || justPressed(2)) this.shooter.fireSuperzapper();
          
          // Continuous fire uses isPressed (triggers every frame held)
          if (isPressed(0) || isPressed(7)) this.shooter.fire();
        }
    } 
    // Menu State Controls
    else {
        // 'A' Button or 'Start' Button to Select Level
        if (justPressed(0) || justPressed(9)) {
            dispatchKey('Space', 'keydown');
            dispatchKey('Enter', 'keydown');
        }
        if (justReleased(0) || justReleased(9)) {
            dispatchKey('Space', 'keyup');
            dispatchKey('Enter', 'keyup');
        }

        // Left D-Pad or Left Stick
        if (justPressed(14) || justLeft) dispatchKey('ArrowLeft', 'keydown');
        if (justReleased(14) || releasedLeft) dispatchKey('ArrowLeft', 'keyup');

        // Right D-Pad or Right Stick
        if (justPressed(15) || justRight) dispatchKey('ArrowRight', 'keydown');
        if (justReleased(15) || releasedRight) dispatchKey('ArrowRight', 'keyup');
    }

    // Update state history for the next frame
    for (let i = 0; i < gp.buttons.length; i++) {
      this.prevGamepadState[i] = isPressed(i);
    }
    this.prevGamepadAxis = gp.axes[0];
  }

  _startAttractMode () {
      this._inAttractMode = true;
      this.loadScreen(new ScreenAttractMode(
          this.screenContentManager,
          this.highScores,
          () => this._endAttractMode()
      ));
  }
  
  _endAttractMode () {
    this._inAttractMode    = false;
    this._lastMenuActivity = Date.now();
    this.populateScreenContentManager();
    this.loadScreen(new ScreenSelectSurface(this.screenContentManager));
  }

  _startBossFightSequence (nextLevel) {
      this._bossFightNextLevel = nextLevel;
      // Snapshot bonus stage state before the fight starts
      this._bossFightHasBonus  = this.powerUpManager.hasBonusStageEarned;
      this.isLoadingLevel      = true;
      if (this.powerUpHUD) this.powerUpHUD.hide();
  
      this.camera.position.set(0, 0, -6);
      this.camera.lookAt(0, 0, 10);
  
      const loopCount   = Math.floor(this.level / 32);
      const emeraldCount = Math.min(7, loopCount);
      const colors      = ['BLUE', 'RED', 'YELLOW', 'GREEN', 'ORANGE', 'PURPLE', 'WHITE', 'RAINBOW'];
      const nextColor   = colors[loopCount % 8];
  
      this.loadScreen(new ScreenParodySurface(
          this.screenContentManager,
          `CHAOS EMERALD ${emeraldCount} DETECTED. DEFEAT THE SYNTHETIC OVERLORD TO CLAIM IT.`
      ));
      this.screenObject.position.z = 0.1;
  
      try {
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(
              `Warning. Synthetic Overlord detected. Defeat it to claim Chaos Emerald ${emeraldCount}.`
          );
          utt.rate = 0.85; utt.pitch = 0.9;
          window.speechSynthesis.speak(utt);
      } catch (error) { console.debug('[Game] Speech synthesis failed in boss fight sequence:', error); }
  
      setTimeout(() => {
          this.releaseScreen();
          this.bossFight = new BossFight(
              this.scene, this.camera,
              loopCount,
              (victory, score) => this._onBossFightComplete(victory, score, emeraldCount, nextColor)
          );
          this.isLoadingLevel = false;
      }, 4500);
  }
  
  _onBossFightComplete (victory, score, emeraldCount, nextColor) {
      if (this._bossFightNextLevel > 256) {
          if (score > 0) {
              this.score += score;
              this.screenContentManager.setScore(this.score);
          }
          if (this.bossFight) { this.bossFight.dispose(); this.bossFight = null; }
          if (this.powerUpHUD) this.powerUpHUD.hide();
	  
          this.camera.position.set(0, 0, -6);
          this.camera.lookAt(0, 0, 10);
	  
          this.loadScreen(new ScreenGameEnd(this.screenContentManager));
          this.screenObject.position.z = 0.1;
          this.isLoadingLevel = true;  // Never reset — soft-lock
          return;
      }
      if (score > 0) {
          this.score += score;
          this.screenContentManager.setScore(this.score);
      }
      if (this.bossFight) { this.bossFight.dispose(); this.bossFight = null; }
  
      this.camera.position.set(0, 0, -6);
      this.camera.lookAt(0, 0, 10);
  
      const msg = victory
          ? `CLEARED 32 SURFACES. COLLECTED CHAOS EMERALD ${emeraldCount}. STARTING ${nextColor} PHASE.`
          : `OVERLORD SURVIVED. CHAOS EMERALD ${emeraldCount} LOST. STARTING ${nextColor} PHASE ANYWAY.`;
  
      this.loadScreen(new ScreenParodySurface(this.screenContentManager, msg));
      this.screenObject.position.z = 0.1;
  
      try {
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(
              victory
                  ? `Cleared 32 surfaces. Collected Chaos Emerald ${emeraldCount}. Starting ${nextColor} Phase.`
                  : `Overlord survived. Starting ${nextColor} Phase.`
          );
          utt.rate = 0.85; utt.pitch = 0.9;
          window.speechSynthesis.speak(utt);
      } catch (error) { console.debug('[Game] Speech synthesis failed in boss complete sequence:', error); }
  
      setTimeout(() => {
          this.releaseScreen();
          if (this._bossFightHasBonus) {
              this.powerUpManager.resetBonusStageEarned();
              this._startBonusStageSequence(this._bossFightNextLevel);
          } else {
              this.isLoadingLevel = false;
              this.startLevel(this._bossFightNextLevel);
          }
      }, 4500);
  }
}