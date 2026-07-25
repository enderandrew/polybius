/**
 * BonusStage.js
 *
 * Superman 64 parody bonus stage — fly through procedurally placed green rings.
 * Triggered after collecting 3 Warp Tokens and completing a level.
 *
 * Rings are Three.js Torus objects placed along the Z axis with random
 * XY offsets and slight rotation tilts. The camera flies forward automatically;
 * the player steers laterally with A/D/W/S or arrow keys.
 *
 * Passing a ring scores increasing bonus points and speeds up slightly.
 * Missing a ring ends the stage immediately.
 *
 * Integration:
 * new BonusStage(scene, camera, onComplete)
 * Call update(delta) each game tick.
 * onComplete(totalScore, ringsCleared) is called when the stage ends.
 * Call dispose() to clean up Three.js resources.
 *
 * Depends on: THREE
 */

import * as THREE from 'three';
import objLoader from '@/utils/objLoader';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export class BonusStage {

  // ── Tuning ─────────────────────────────────────────────────────────────────

  static RING_COUNT          = 25;    // Total rings in the corridor
  static RING_SPACING        = 28;    // Z distance between rings
  static RING_RADIUS         = 2.2;   // Torus inner radius
  static RING_TUBE           = 0.10;  // Torus tube thickness
  static RING_SEGMENTS_TUBE  = 14;
  static RING_SEGMENTS_RADIAL= 52;

  static ASTEROID_RADIUS     = 0.9;   // Size of the center blocker
  static PROJECTILE_SPEED    = 80.0;  // Speed of the player's laser

  static INITIAL_SPEED       = 9.0;   // Forward units per second
  static SPEED_INCREMENT     = 0.75;  // Speed added after each ring
  static BASE_RING_SCORE     = 50;    // Points × ring number (50, 100, 150 …)

  static PLAYER_SPEED        = 7.0;   // Lateral movement units per second
  static PLAYER_BOUNDS       = 4.0;   // Max XY from center

  // How far ahead the camera starts before the first ring
  static CAMERA_START_Z      = -2;

  // Ring placement — max step from PREVIOUS ring's position per ring
  static OFFSET_MIN_STEP     = 0.3;   // Easy early rings stay nearly centred
  static OFFSET_MAX_STEP     = 2.4;   // Hard late rings can jump this far

  // Ring tilt — scales with difficulty
  static MAX_TILT_EARLY      = 0.0;
  static MAX_TILT_LATE       = 0.38;  // ~22 degrees

  // Star field
  static STAR_COUNT          = 900;
  static STAR_SPREAD         = 60;

  // Colours
  static COLOR_RING_DEFAULT  = 0x00dd00;
  static COLOR_RING_PASSED   = 0x44ff66;
  static COLOR_RING_MISSED   = 0xff2200;
  static COLOR_RING_GLOW     = 0x00ff44;
  static COLOR_RING_NEXT     = 0x88ffaa;  // Highlight for the immediately next ring

  // ── Constructor ────────────────────────────────────────────────────────────

  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Camera}  camera
   * @param {Function}      onComplete  - (totalScore: number, ringsCleared: number) => void
   * @param {number}        chaosEmeralds - Current 32-level loop iteration
   */
  constructor (scene, camera, onComplete, chaosEmeralds = 0) {
    this.scene      = scene;
    this.camera     = camera;
    this.onComplete = onComplete;
    this.chaosEmeralds = chaosEmeralds;

    // Player state
    this.playerX    = 0;
    this.playerY    = 0;
    this.speed      = BonusStage.INITIAL_SPEED;
    this.hasShield  = true;

    // Shooting state
    this.projectiles  = [];
    this.lastShotTime = 0;

    // Progress tracking
    this.distanceTravelled = 0;
    this.ringsCleared      = 0;
    this.totalScore        = 0;
    this.nextRingIndex     = 0;

    this.isActive = true;

    // Save camera state so Game.js can restore it after the stage
    this._camStartPos = this.camera.position.clone();
    this.camera.position.set(0, 0, BonusStage.CAMERA_START_Z);
    this.camera.lookAt(0, 0, BonusStage.CAMERA_START_Z + 20);

    // Input — BonusStage owns its own event listeners
    this._keysDown   = new Set();
    this._onKeyDown  = (e) => {
        this._keysDown.add(e.code);
        if (e.code === 'Space') this._fire();
    };
    this._onKeyUp    = (e) => this._keysDown.delete(e.code);
    
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // Scene root for all bonus stage geometry
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.impulseX = 0;
    this.impulseY = 0;
    this.boostTimer = 0;

    this._buildStars();
    this._buildRings();
    this._buildHUD();
    this._buildPlayerModel();
    this._startMusic();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call once per game tick. delta = seconds since last frame. */
  update (delta) {
    if (!this.isActive) return;

    this._handleInput(delta);
    this._advanceCamera(delta);
    this._animateProjectiles(delta);
    this._checkRingCollisions();
    this._animateRings(delta);
    this._updateHUD();
  }

  /** Remove all Three.js objects and DOM elements; restore camera. */
  dispose () {
    this.isActive = false;

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);

    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    if (this.hud) { this.hud.remove(); this.hud = null; }

    // Camera will be repositioned by Game.js / startLevel, but reset anyway
    this.camera.position.copy(this._camStartPos);
    this.camera.lookAt(0, 0, 10);
    if (this.bgm && this.bgm.isPlaying) this.bgm.stop(); 
    this.camera.remove(this.audioListener);
  }

  // ── Private — scene construction ───────────────────────────────────────────

  _buildStars () {
    const count = BonusStage.STAR_COUNT;
    const pos   = new Float32Array(count * 3);
    const totalZ = BonusStage.RING_COUNT * BonusStage.RING_SPACING;

    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * BonusStage.STAR_SPREAD;
      pos[i * 3 + 1] = (Math.random() - 0.5) * BonusStage.STAR_SPREAD;
      pos[i * 3 + 2] = Math.random() * (totalZ + 20);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.stars = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true })
    );
    this.group.add(this.stars);
  }

  _startMusic () {
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    this.bgm = new THREE.Audio(this.audioListener);
    
    new THREE.AudioLoader().load('./music/bgm-bonus.ogg', (buffer) => {
        this.bgm.setBuffer(buffer);
        this.bgm.setLoop(true);
        this.bgm.setVolume(0.6);
        if (this.isActive && !this.bgm.isPlaying) {
            this.bgm.play();
        }
    });
  }

  _buildPlayerModel () {
    this.playerGroup = new THREE.Group();
    this.group.add(this.playerGroup);

    // Add the Deflector Shield
    this.shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.5 })
    );
    this.playerGroup.add(this.shieldMesh);

    objLoader.load('./models/player.obj', (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                const wireframe = new THREE.LineSegments(
                    new THREE.WireframeGeometry(child.geometry),
                    new THREE.LineBasicMaterial({ color: 0xffff00 })
                );
                child.add(wireframe);

                child.material = new THREE.MeshBasicMaterial({
                    color: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1
                });

                child.scale.set(0.12, 0.12, 0.12);
                child.rotation.y = -Math.PI / 2; // Point forward down the Z-axis
                this.playerGroup.add(child);
            }
        });
    });
  }

  _buildRings () {
    this.rings = [];
    let prevX = 0, prevY = 0;

    const effects = ['BOOST', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

    for (let i = 0; i < BonusStage.RING_COUNT; i++) {
      const t = i / (BonusStage.RING_COUNT - 1);  
      const maxStep = BonusStage.OFFSET_MIN_STEP + t * (BonusStage.OFFSET_MAX_STEP - BonusStage.OFFSET_MIN_STEP);
      const maxTilt = BonusStage.MAX_TILT_EARLY  + t * (BonusStage.MAX_TILT_LATE  - BonusStage.MAX_TILT_EARLY);

      const dx = (Math.random() - 0.5) * 2 * maxStep;
      const dy = (Math.random() - 0.5) * 2 * maxStep;

      const bound = BonusStage.PLAYER_BOUNDS - BonusStage.RING_RADIUS * 0.3;
      const rx    = Math.max(-bound, Math.min(bound, prevX + dx));
      const ry    = Math.max(-bound, Math.min(bound, prevY + dy));
      const rz    = BonusStage.CAMERA_START_Z + (i + 1) * BonusStage.RING_SPACING;

      prevX = rx; prevY = ry;

      const tiltX = (Math.random() - 0.5) * 2 * maxTilt;
      const tiltY = (Math.random() - 0.5) * 2 * maxTilt;
      const tiltZ = (Math.random() - 0.5) * 2 * maxTilt * 0.5;

      const geo = new THREE.TorusGeometry(BonusStage.RING_RADIUS, BonusStage.RING_TUBE, BonusStage.RING_SEGMENTS_TUBE, BonusStage.RING_SEGMENTS_RADIAL);
      const mat = new THREE.MeshBasicMaterial({ color: BonusStage.COLOR_RING_DEFAULT });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rx, ry, rz);
      mesh.rotation.set(tiltX, tiltY, tiltZ);

      const glowGeo = new THREE.TorusGeometry(BonusStage.RING_RADIUS + 0.07, BonusStage.RING_TUBE * 2.2, BonusStage.RING_SEGMENTS_TUBE, BonusStage.RING_SEGMENTS_RADIAL);
      const glowMat = new THREE.MeshBasicMaterial({ color: BonusStage.COLOR_RING_GLOW, wireframe: true, transparent: true, opacity: 0.35 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(mesh.position);
      glow.rotation.copy(mesh.rotation);

      // --- Build the Asteroid Blocker ---
      const astGeo = new THREE.DodecahedronGeometry(BonusStage.ASTEROID_RADIUS, 0);
      const astMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true });
      const asteroid = new THREE.Mesh(astGeo, astMat);
      asteroid.position.copy(mesh.position);
      asteroid.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      this.group.add(asteroid);

      // --- Build the Symbols ---
      let effect = null;
      if (i >= 20) {
          effect = effects[Math.floor(Math.random() * effects.length)];
      } else if (i >= 10 && Math.random() < 0.5) {
          effect = effects[Math.floor(Math.random() * effects.length)];
      }

      let symbolWire = null;
      if (effect) {
          let symbolGeo, color = 0xffff00, rotZ = 0;
          
          if (effect === 'BOOST') {
              symbolGeo = new THREE.OctahedronGeometry(0.7, 0); // Speed Diamond
          } else {
              symbolGeo = new THREE.ConeGeometry(0.5, 1.2, 4);  // Shift Arrow
              if (effect === 'UP') { rotZ = 0; color = 0x00ffff; }
              if (effect === 'DOWN') { rotZ = Math.PI; color = 0x00ffff; }
              if (effect === 'LEFT') { rotZ = Math.PI/2; color = 0xff00ff; }
              if (effect === 'RIGHT') { rotZ = -Math.PI/2; color = 0xff00ff; }
          }

          symbolWire = new THREE.LineSegments(
              new THREE.WireframeGeometry(symbolGeo),
              new THREE.LineBasicMaterial({ color: color })
          );
          
          if (effect !== 'BOOST') {
              symbolWire.rotation.z = rotZ;
              symbolWire.position.y += Math.cos(rotZ) * 0.3; 
              symbolWire.position.x -= Math.sin(rotZ) * 0.3;
          }
          mesh.add(symbolWire);
      }

      this.group.add(mesh);
      this.group.add(glow);

      this.rings.push({ 
          mesh, glow, x: rx, y: ry, z: rz, 
          passed: false, checked: false, effect, symbolWire,
          asteroid, asteroidDestroyed: false
      });
    }
  }

  // ── Private — DOM HUD ──────────────────────────────────────────────────────

  _buildHUD () {
    this.hud = document.createElement('div');
    this.hud.style.cssText = [
      'position: absolute', 'top: 12px', 'right: 12px', 'z-index: 600',
      'font-family: "Courier New", monospace', 'font-size: 13px',
      'color: #00ff44', 'text-shadow: 0 0 8px #00ff44',
      'pointer-events: none', 'background: rgba(0,0,0,0.65)',
      'padding: 8px 16px', 'border: 1px solid #00ff44', 'border-radius: 3px',
      'letter-spacing: 0.1em',
    ].join('; ');

    this._hudRings  = document.createElement('div');
    this._hudScore  = document.createElement('div');
    this._hudSpeed  = document.createElement('div');
    this._hudChao   = document.createElement('div'); 

    this._hudSpeed.style.color  = '#88ffaa';
    this._hudSpeed.style.fontSize = '11px';
    this._hudSpeed.style.marginTop = '4px';
    
    // Give the emerald tracker a distinct gold/yellow color to stand out
    this._hudChao.style.color = '#ffff00';
    this._hudChao.style.textShadow = '0 0 8px #ffff00';
    this._hudChao.style.fontSize = '11px';
    this._hudChao.style.marginTop = '4px';

    this.hud.append(this._hudRings, this._hudScore, this._hudSpeed, this._hudChao);
    document.getElementById('screen').appendChild(this.hud);
    this._updateHUD();
  }

  _updateHUD () {
    if (!this.hud) return;
    this._hudRings.textContent = `RINGS: ${this.ringsCleared} / ${BonusStage.RING_COUNT}`;
    this._hudScore.textContent = `BONUS: +${this.totalScore.toLocaleString()}`;
    this._hudSpeed.textContent = `SPEED: ${this.speed.toFixed(1)}`;
    this._hudChao.textContent  = `CHAOS EMERALDS: ${this.chaosEmeralds}`; // <-- Display the count!
  }

  // ── Private — update ───────────────────────────────────────────────────────

  _fire () {
    if (!this.isActive) return;
    const now = performance.now() / 1000;
    if (now - this.lastShotTime < 0.2) return; // Fire rate limit
    this.lastShotTime = now;

    // Create a laser beam
    const geo = new THREE.BoxGeometry(0.15, 0.15, 2.0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const proj = new THREE.Mesh(geo, mat);
    
    // Fire from the ship's current position
    proj.position.set(this.playerX, this.playerY, this.camera.position.z + 5);
    this.group.add(proj);
    this.projectiles.push(proj);
	messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_PLAYER_SHOOT);
  }

  _animateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const proj = this.projectiles[i];
        proj.position.z += BonusStage.PROJECTILE_SPEED * delta;
        
        let hit = false;
        // Check collision with upcoming asteroids
        for (let r = this.nextRingIndex; r < this.rings.length; r++) {
            const ring = this.rings[r];
            if (ring.asteroidDestroyed) continue;
            
            // If projectile is crossing the asteroid's Z-plane
            if (Math.abs(proj.position.z - ring.z) < 1.5) {
                const dx = proj.position.x - ring.x;
                const dy = proj.position.y - ring.y;
                // Generous hitbox so it isn't frustrating
                if (Math.sqrt(dx*dx + dy*dy) < BonusStage.ASTEROID_RADIUS * 1.5) {
                    this._destroyAsteroid(ring);
                    hit = true;
                    break;
                }
            }
        }
        
        // Cleanup if hit or out of bounds
        if (hit || proj.position.z > this.camera.position.z + 150) {
            this.group.remove(proj);
            this.projectiles.splice(i, 1);
        }
    }
  }

  _destroyAsteroid(ring) {
    ring.asteroidDestroyed = true;
    ring.asteroid.visible = false;
    this.totalScore += 100; // Bonus points for clearing the path!
  }

  _handleInput (delta) {
    const spd = BonusStage.PLAYER_SPEED * delta;
    const b   = BonusStage.PLAYER_BOUNDS;

    if (this._keysDown.has('KeyA') || this._keysDown.has('ArrowLeft'))  this.playerX += spd;
    if (this._keysDown.has('KeyD') || this._keysDown.has('ArrowRight')) this.playerX -= spd;
    if (this._keysDown.has('KeyW') || this._keysDown.has('ArrowUp'))    this.playerY += spd;
    if (this._keysDown.has('KeyS') || this._keysDown.has('ArrowDown'))  this.playerY -= spd;

    // Apply hazard impulses
    if (this.impulseX !== 0) {
        const step = this.impulseX * delta * 12; // Snap violently
        this.playerX += step;
        this.impulseX -= step;
        if (Math.abs(this.impulseX) < 0.1) this.impulseX = 0;
    }
    if (this.impulseY !== 0) {
        const step = this.impulseY * delta * 12;
        this.playerY += step;
        this.impulseY -= step;
        if (Math.abs(this.impulseY) < 0.1) this.impulseY = 0;
    }

    this.playerX = Math.max(-b, Math.min(b, this.playerX));
    this.playerY = Math.max(-b, Math.min(b, this.playerY));
  }

  _advanceCamera (delta) {
    let currentSpeed = this.speed + (this.boostTimer > 0 ? 15 : 0);
    if (this.boostTimer > 0) this.boostTimer -= delta;

    this.distanceTravelled += currentSpeed * delta;
    const cz = BonusStage.CAMERA_START_Z + this.distanceTravelled;

    // Smoothly follow player X/Y to create dynamic camera lag
    this.camera.position.x += (this.playerX - this.camera.position.x) * 6 * delta;
    this.camera.position.y += (this.playerY - this.camera.position.y) * 6 * delta;
    this.camera.position.z = cz;

    this.camera.lookAt(this.camera.position.x, this.camera.position.y, cz + 20);

    // Position player model directly in front of camera, and apply banking!
    if (this.playerGroup) {
        this.playerGroup.position.set(this.playerX, this.playerY, cz + 5);
        
        let targetBank = 0;
        if (this._keysDown.has('KeyA') || this._keysDown.has('ArrowLeft')) targetBank = Math.PI / 4;
        if (this._keysDown.has('KeyD') || this._keysDown.has('ArrowRight')) targetBank = -Math.PI / 4;
        
        this.playerGroup.rotation.z += (targetBank - this.playerGroup.rotation.z) * 10 * delta;
    }
  }

  _checkRingCollisions () {
    const cz = this.camera.position.z;

    for (let i = this.nextRingIndex; i < this.rings.length; i++) {
      const ring = this.rings[i];
      if (ring.checked) continue;

      // Camera has reached or passed this ring's Z plane
      if (cz >= ring.z - 0.8) {
        ring.checked = true;

        const dx   = this.playerX - ring.x;
        const dy   = this.playerY - ring.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 1. Did we smash into the Asteroid?
        if (!ring.asteroidDestroyed && dist <= BonusStage.ASTEROID_RADIUS * 1.2) {
            if (this.hasShield) {
                // Consume shield, shatter asteroid, survive
                this.hasShield = false;
                if (this.shieldMesh) this.shieldMesh.visible = false;
                this._destroyAsteroid(ring);
                this.impulseY += 2; // Violent screen jolt!
            } else {
                // Instant death
                this._ringMissed(ring);
                return;
            }
        }

        // 2. Are we safely inside the Ring boundaries?
        if (dist <= BonusStage.RING_RADIUS * 0.9) {
          this._ringCleared(ring, i);
        } else {
          this._ringMissed(ring);
          return;
        }

        this.nextRingIndex = i + 1;
      } else {
        // Rings are ordered by Z so we can stop at the first unchecked one
        break;
      }
    }

    // All rings cleared — perfect run!
    if (this.nextRingIndex >= this.rings.length && this.isActive) {
      this._stageComplete();
    }
  }

  _animateRings (delta) {
    const now = performance.now() / 1000;
    const cz  = this.camera.position.z;

    this.rings.forEach((ring, i) => {
      if (ring.passed) return;

      // Slow spin around the forward axis
      ring.mesh.rotation.z += delta * 0.45;
      ring.glow.rotation.z  = ring.mesh.rotation.z;

      // Tumble the asteroid
      if (!ring.asteroidDestroyed) {
          ring.asteroid.rotation.x += delta * 1.2;
          ring.asteroid.rotation.y += delta * 0.8;
      }

      // Highlight the immediately next ring differently
      if (i === this.nextRingIndex) {
        ring.mesh.material.color.setHex(BonusStage.COLOR_RING_NEXT);
        // Pulse the glow as player approaches
        const dist = ring.z - cz;
        if (dist < BonusStage.RING_SPACING) {
          ring.glow.material.opacity = 0.25 + 0.35 * Math.sin(now * 5);
        }
      } else {
        ring.mesh.material.color.setHex(BonusStage.COLOR_RING_DEFAULT);
      }
    });
  }

  // ── Private — ring events ──────────────────────────────────────────────────

  _ringCleared (ring, index) {
    this.ringsCleared++;
    const points = BonusStage.BASE_RING_SCORE * this.ringsCleared;
    this.totalScore += points;
    this.speed      += BonusStage.SPEED_INCREMENT;

    // Flash white then fade to passed-green
    ring.passed = true;
    ring.mesh.material.color.setHex(0xffffff);
    ring.glow.material.opacity = 0.9;

    setTimeout(() => {
      if (ring.mesh.material) {
        ring.mesh.material.color.setHex(BonusStage.COLOR_RING_PASSED);
        ring.glow.material.opacity = 0.15;
      }
    }, 120);

    window.dispatchEvent(new CustomEvent('bonus:ring', {
      detail: { points, ringsCleared: this.ringsCleared }
    }));

    if (ring.effect) {
      if (ring.symbolWire) ring.symbolWire.visible = false; // Hide it on pickup!
      
      if (ring.effect === 'BOOST') {
        this.boostTimer = 1.0; 
      } else {
        const shiftAmt = 4.0; // The strength of the sudden throw
        if (ring.effect === 'UP') this.impulseY += shiftAmt;
        if (ring.effect === 'DOWN') this.impulseY -= shiftAmt;
        if (ring.effect === 'LEFT') this.impulseX -= shiftAmt;
        if (ring.effect === 'RIGHT') this.impulseX += shiftAmt;
      }
    }
  }

  _ringMissed (ring) {
    if (!this.isActive) return;
    this.isActive = false;

    ring.mesh.material.color.setHex(BonusStage.COLOR_RING_MISSED);
    ring.glow.material.color.setHex(0xff4400);
    ring.glow.material.opacity = 0.8;

    window.dispatchEvent(new CustomEvent('bonus:miss', {}));

    setTimeout(() => this.onComplete(this.totalScore, this.ringsCleared), 1400);
  }

  _stageComplete () {
    if (!this.isActive) return;
    this.isActive = false;

    window.dispatchEvent(new CustomEvent('bonus:complete', {
      detail: { totalScore: this.totalScore, ringsCleared: this.ringsCleared }
    }));

    setTimeout(() => this.onComplete(this.totalScore, this.ringsCleared), 900);
  }
}