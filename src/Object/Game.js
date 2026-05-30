import { AudioListener, Group, PerspectiveCamera, Scene, WebGLRenderer, Vector2 } from 'three';
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
import { PowerUpHUD } from '@/PowerUp/PowerUpHUD';

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

  constructor () {
    this.setState(Game.STATE_SELECT_SURFACE);
    this.setupRenderer();
    this.setupLogic();
    this.isPaused = false;
    this.prevGamepadState = {};
    this.prevGamepadAxis = 0;
  }

  handleState () {
    if (!this.screenStateUpdated) {
      this.releaseScreen();

      if (this.state.equals(Game.STATE_PLAY)) {
        this.releaseLevel();
        this.loadScreen(new ScreenPlay(this.screenContentManager));
        this.loadLevel(this.level);
        this.screenContentManager.setLevel(this.level);

      } else if (this.state.equals(Game.STATE_SELECT_SURFACE)) {
        this.releaseLevel();

        this.lives = 5;
        this.score = 0;

        this.populateScreenContentManager();
        this.loadScreen(new ScreenSelectSurface(this.screenContentManager));

      } else if (this.state.equals(Game.STATE_HIGH_SCORES)) {
        this.releaseLevel();
        this.loadScreen(new ScreenHighScores(this.screenContentManager));

      }

      this.saveGameState();
    }

    this.screenStateUpdated = true;
  }

  setState (state) {
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
    setTimeout(() => {
      this.isLoadingLevel = false;
      
      // This single line tells your game loop's handleState() to automatically 
      // destroy the parody screen, load the ScreenPlay UI, and instantiate the level!
      this.setState(Game.STATE_PLAY);
    }, 4000);
  }

  loadLevel (level) {
    let surfaceId = ((level - 1) % 16) + 1;
    //let surface = this.surfacesCollection.find(surface => surface.id === surfaceId);
    let surfaceData = surfaces.find(s => s.id === surfaceId);
    if (!surfaceData) throw new Error("Surface data not found!");
	
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
  }

  releaseLevel () {
    if (this.levelObject === null) {
      return;
    }

    this.isPaused = false;
    if (this.pauseOverlay) this.pauseOverlay.style.display = 'none';

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
    }

    this.screenObject = screen;
    this.screenGroup.add(this.screenObject);
  }

  releaseScreen () {
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
    console.log('STATE LOADED');
    this.highScores = new Array(8).fill({ name: 'EZY', score: 4096 });

    let highScores = localStorage.getItem(Game.HIGH_SCORES_STORAGE_KEY);
    if (highScores !== null) {
      highScores = JSON.parse(highScores);

      if (highScores.length === 8) {
        this.highScores = highScores;
      }
    }

    this.highestLevel = 1;
    let highestLevel = localStorage.getItem(Game.HIGHEST_LEVEL);
    if (highestLevel !== null) {
      this.highestLevel = parseInt(highestLevel);
    }
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

  setupRenderer (highQuality = true) {
    this.scene = new Scene();

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
    this.renderer.setPixelRatio(window.devicePixelRatio); 
    
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

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (highQuality) {
      // 4. Pass the interior dimensions to the post-processing effects
      this.composer.addPass(new UnrealBloomPass(
        new Vector2(width, height), 
        0.8,
        0.9,
        0
      ));
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
  }

  update () {
    //console.log("This shooter value:", this.shooter);
	requestAnimationFrame(this.update.bind(this));
  
    // Track delta time (seconds since last frame) for physics/movement
    const now = performance.now();
    const delta = this._lastTime ? (now - this._lastTime) / 1000 : 0;
    this._lastTime = now;
  
    this.handleState();

    if (!this.isLoadingLevel) {
        keyboardInput.dispatchActions();
        this.pollGamepads();
    }

    if (this.screenObject !== null) {
      this.screenObject.update();
    }

    if (this.isPaused) {
      // Keep rendering the screen so it doesn't go black, but skip updating the level
      this.composer.render();
      return; 
    }
  
    if (this.levelObject !== null && this.levelRenderer !== null) {
      this.levelObject.update();
      this.levelRenderer.update();
  
      // Power-up tick
      this.powerUpSpawner.update(delta);
      this.powerUpManager.update(delta);
  
      if (this.shooter && this.shooter.laneId !== undefined) {
        const collected = this.powerUpSpawner.checkPlayerCollision(
          this.shooter.laneId,
          0.1
        );

        if (collected) {
		  messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_POWERUP);
		  this.powerUpManager.collect(collected, this);
          this.screenContentManager.setScore(this.score);
        }
      }
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

    this.releaseLevel();
    this.startLevel(this.level + 1);
  }

  shooterKilledCallback () {
    this.lives--;

    this.screenContentManager.setLives(this.lives);

    if (this.lives === 0) {
      if (this.level > this.highestLevel) {
        this.highestLevel = this.level;
      }

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
  
  requestWarp () {
    this.levelWonCallback();
  }

  togglePause () {
    // Only allow pausing if we are actually in the play state
	messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PAUSE);
	if (!this.state.equals(Game.STATE_PLAY)) return;
    this.isPaused = !this.isPaused;
    if (this.pauseOverlay) {
      this.pauseOverlay.style.display = this.isPaused ? 'flex' : 'none';
    }
  }

  pollGamepads () {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0]; 
    
    if (!gp) return;

    const isPressed = (idx) => gp.buttons[idx] && gp.buttons[idx].pressed;
    const wasPressed = (idx) => this.prevGamepadState[idx];
    const justPressed = (idx) => isPressed(idx) && !wasPressed(idx);

    // Helper to send native keyboard events to the menu screens
    const sendKey = (code) => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code }));
      // Fire a keyup shortly after so the keyboard manager doesn't think it's permanently stuck!
      setTimeout(() => {
        document.dispatchEvent(new KeyboardEvent('keyup', { code }));
      }, 50); 
    };

    // Pause / Start Button (Index 9)
    if (justPressed(9)) {
        if (this.state.equals(Game.STATE_PLAY)) {
            this.togglePause();
        } else {
            // If in menu, "Start" will act like hitting Space/Enter to select a level
            sendKey('Space');
            sendKey('Enter');
        }
    }

    // Play State Controls
    if (this.state.equals(Game.STATE_PLAY)) {
        if (!this.isPaused && this.shooter) {
          if (justPressed(14) || (gp.axes[0] < -0.5 && this.prevGamepadAxis >= -0.5)) this.shooter.moveLeft();
          if (justPressed(15) || (gp.axes[0] > 0.5 && this.prevGamepadAxis <= 0.5)) this.shooter.moveRight();
          if (justPressed(12) || justPressed(1) || justPressed(3)) this.shooter.jump();
          if (justPressed(13) || justPressed(2)) this.shooter.fireSuperzapper();
          if (isPressed(0) || isPressed(7)) this.shooter.fire();
        }
    } 
    // Menu State Controls
    else {
        // Left D-Pad or Left Stick
        if (justPressed(14) || (gp.axes[0] < -0.5 && this.prevGamepadAxis >= -0.5)) sendKey('ArrowLeft');
        // Right D-Pad or Right Stick
        if (justPressed(15) || (gp.axes[0] > 0.5 && this.prevGamepadAxis <= 0.5)) sendKey('ArrowRight');
        // 'A' Button to Select Level
        if (justPressed(0)) {
            sendKey('Space');
            sendKey('Enter');
        }
    }

    for (let i = 0; i < gp.buttons.length; i++) {
      this.prevGamepadState[i] = isPressed(i);
    }
    this.prevGamepadAxis = gp.axes[0];
  }
}