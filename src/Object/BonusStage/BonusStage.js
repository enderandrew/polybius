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
 *   new BonusStage(scene, camera, onComplete)
 *   Call update(delta) each game tick.
 *   onComplete(totalScore, ringsCleared) is called when the stage ends.
 *   Call dispose() to clean up Three.js resources.
 *
 * Depends on: THREE
 */

import * as THREE from 'three';

export class BonusStage {

  // ── Tuning ─────────────────────────────────────────────────────────────────

  static RING_COUNT          = 25;    // Total rings in the corridor
  static RING_SPACING        = 28;    // Z distance between rings
  static RING_RADIUS         = 2.2;   // Torus inner radius
  static RING_TUBE           = 0.10;  // Torus tube thickness
  static RING_SEGMENTS_TUBE  = 14;
  static RING_SEGMENTS_RADIAL= 52;

  static INITIAL_SPEED       = 9.0;   // Forward units per second
  static SPEED_INCREMENT     = 0.75;  // Speed added after each ring
  static BASE_RING_SCORE     = 50;   // Points × ring number (500, 1000, 1500 …)

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
   */
  constructor (scene, camera, onComplete) {
    this.scene      = scene;
    this.camera     = camera;
    this.onComplete = onComplete;

    // Player state
    this.playerX    = 0;
    this.playerY    = 0;
    this.speed      = BonusStage.INITIAL_SPEED;

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
    this._onKeyDown  = (e) => this._keysDown.add(e.code);
    this._onKeyUp    = (e) => this._keysDown.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // Scene root for all bonus stage geometry
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._buildStars();
    this._buildRings();
    this._buildHUD();
    this._buildReticle();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call once per game tick. delta = seconds since last frame. */
  update (delta) {
    if (!this.isActive) return;

    this._handleInput(delta);
    this._advanceCamera(delta);
    this._checkRingCollisions();
    this._animateRings(delta);
    this._updateReticle();
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

  _buildRings () {
    this.rings = [];
    let prevX = 0;
    let prevY = 0;

    for (let i = 0; i < BonusStage.RING_COUNT; i++) {
      const t          = i / (BonusStage.RING_COUNT - 1);  // 0 → 1 over the run
      const maxStep    = BonusStage.OFFSET_MIN_STEP + t * (BonusStage.OFFSET_MAX_STEP - BonusStage.OFFSET_MIN_STEP);
      const maxTilt    = BonusStage.MAX_TILT_EARLY  + t * (BonusStage.MAX_TILT_LATE  - BonusStage.MAX_TILT_EARLY);

      // Incremental placement: each ring steps from the previous one
      const dx = (Math.random() - 0.5) * 2 * maxStep;
      const dy = (Math.random() - 0.5) * 2 * maxStep;

      // Clamp so the ring is always within reachable player bounds
      const bound = BonusStage.PLAYER_BOUNDS - BonusStage.RING_RADIUS * 0.3;
      const rx    = Math.max(-bound, Math.min(bound, prevX + dx));
      const ry    = Math.max(-bound, Math.min(bound, prevY + dy));
      const rz    = BonusStage.CAMERA_START_Z + (i + 1) * BonusStage.RING_SPACING;

      prevX = rx;
      prevY = ry;

      // Tilt — rings tilt on X and Y (perpendicular to travel axis)
      // Z tilt adds a "barrel roll" feel for very late rings
      const tiltX = (Math.random() - 0.5) * 2 * maxTilt;
      const tiltY = (Math.random() - 0.5) * 2 * maxTilt;
      const tiltZ = (Math.random() - 0.5) * 2 * maxTilt * 0.5;

      // Solid ring mesh
      const geo     = new THREE.TorusGeometry(
        BonusStage.RING_RADIUS,
        BonusStage.RING_TUBE,
        BonusStage.RING_SEGMENTS_TUBE,
        BonusStage.RING_SEGMENTS_RADIAL
      );
      const mat = new THREE.MeshBasicMaterial({ color: BonusStage.COLOR_RING_DEFAULT });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rx, ry, rz);
      mesh.rotation.set(tiltX, tiltY, tiltZ);

      // Outer glow ring (wireframe, slightly larger)
      const glowGeo  = new THREE.TorusGeometry(
        BonusStage.RING_RADIUS + 0.07,
        BonusStage.RING_TUBE * 2.2,
        BonusStage.RING_SEGMENTS_TUBE,
        BonusStage.RING_SEGMENTS_RADIAL
      );
      const glowMat = new THREE.MeshBasicMaterial({
        color:       BonusStage.COLOR_RING_GLOW,
        wireframe:   true,
        transparent: true,
        opacity:     0.35,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(mesh.position);
      glow.rotation.copy(mesh.rotation);

      this.group.add(mesh);
      this.group.add(glow);

      this.rings.push({ mesh, glow, x: rx, y: ry, z: rz, passed: false, checked: false });
    }
  }

  /** Thin crosshair reticle showing where the player is aiming. */
  _buildReticle () {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
    const r   = 0.18;
    const pts = [
      new THREE.Vector3(-r, 0, 0), new THREE.Vector3(r, 0, 0),
      new THREE.Vector3(0, -r, 0), new THREE.Vector3(0, r, 0),
    ];
    // Two separate lines (LineSegments needs paired verts)
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.reticle = new THREE.LineSegments(geo, mat);
    this.reticle.renderOrder = 30;
    this.group.add(this.reticle);
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
    this._hudSpeed.style.color  = '#88ffaa';
    this._hudSpeed.style.fontSize = '11px';
    this._hudSpeed.style.marginTop = '4px';

    this.hud.append(this._hudRings, this._hudScore, this._hudSpeed);
    document.getElementById('screen').appendChild(this.hud);
    this._updateHUD();
  }

  _updateHUD () {
    if (!this.hud) return;
    this._hudRings.textContent = `RINGS: ${this.ringsCleared} / ${BonusStage.RING_COUNT}`;
    this._hudScore.textContent = `BONUS: +${this.totalScore.toLocaleString()}`;
    this._hudSpeed.textContent = `SPEED: ${this.speed.toFixed(1)}`;
  }

  // ── Private — update ───────────────────────────────────────────────────────

  _handleInput (delta) {
    const spd = BonusStage.PLAYER_SPEED * delta;
    const b   = BonusStage.PLAYER_BOUNDS;

    if (this._keysDown.has('KeyA') || this._keysDown.has('ArrowLeft'))  this.playerX = Math.max(-b, this.playerX - spd);
    if (this._keysDown.has('KeyD') || this._keysDown.has('ArrowRight')) this.playerX = Math.min( b, this.playerX + spd);
    if (this._keysDown.has('KeyW') || this._keysDown.has('ArrowUp'))    this.playerY = Math.min( b, this.playerY + spd);
    if (this._keysDown.has('KeyS') || this._keysDown.has('ArrowDown'))  this.playerY = Math.max(-b, this.playerY - spd);
  }

  _advanceCamera (delta) {
    this.distanceTravelled += this.speed * delta;

    const cz = BonusStage.CAMERA_START_Z + this.distanceTravelled;

    this.camera.position.set(this.playerX, this.playerY, cz);

    // Look slightly ahead — bias toward next ring to create "pulling" sensation
    const next = this.rings[this.nextRingIndex];
    if (next) {
      const lookX = next.x * 0.25 + this.playerX * 0.75;
      const lookY = next.y * 0.25 + this.playerY * 0.75;
      this.camera.lookAt(lookX, lookY, cz + 18);
    } else {
      this.camera.lookAt(this.playerX, this.playerY, cz + 18);
    }

    // Keep reticle in front of camera
    this.reticle.position.set(this.playerX, this.playerY, cz + 5);
  }

  _updateReticle () {
    // Pulse opacity
    const t = performance.now() / 1000;
    this.reticle.material.opacity = 0.4 + 0.25 * Math.sin(t * 3);
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