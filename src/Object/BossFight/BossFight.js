/**
 * BossFight.js
 *
 * 3D free-roaming boss fight triggered at the end of every 32-level phase.
 * Mirrors BonusStage.js architecture: takes over the camera, updates every
 * tick, and calls onComplete(victory, score) when the fight ends.
 *
 * ── Combat loop ────────────────────────────────────────────────────────────
 *
 *   WASD / Arrow keys  — move player laterally (±X, ±Y)
 *   Space / Z          — fire toward the boss
 *   Eyes only          — the ONLY parts of the boss that take damage
 *   Body hits          — do nothing (no feedback so player learns quickly)
 *
 * ── Power-up tokens (boss-fight exclusive) ─────────────────────────────────
 *   HEALTH  +1 player HP (max 3)
 *   SHIELD  3 s invincibility
 *   MULTI   5-way spread for 10 s
 *   RAPID   Halved cooldown for 10 s
 *   POWER   Double damage for 12 s
 *
 * ── Chaos Emerald ──────────────────────────────────────────────────────────
 *   On victory a rotating emerald (colour varies by phase 1-7) floats toward
 *   the player.  Collection ends the fight.
 *
 * ── Dispose safety ─────────────────────────────────────────────────────────
 *   All Three.js objects owned by BossFight are tracked in lists or stored
 *   as properties.  dispose() cleans everything, including the shield mesh
 *   which is added directly to scene (not the internal group).
 */

import * as THREE from 'three';
import { BossEntity } from '@/Object/BossFight/BossEntity';
import objLoader from '@/utils/objLoader';

// ── PlayerProjectile ────────────────────────────────────────────────────────

class PlayerProjectile {
  static SPEED  = 42;
  static RADIUS = 0.45;

  constructor (scene, position, direction, damage = 1) {
    this.alive   = true;
    this.radius  = PlayerProjectile.RADIUS;
    this.damage  = damage;
    this._pos    = position.clone();
    this._vel    = direction.clone().normalize().multiplyScalar(PlayerProjectile.SPEED);

    const geo = new THREE.SphereGeometry(0.35, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this._pos);
    scene.add(this.mesh);
  }

  update (delta) {
    if (!this.alive) return;
    this._pos.addScaledVector(this._vel, delta);
    this.mesh.position.copy(this._pos);
    if (this._pos.z > 120 || this._pos.length() > 140) this.alive = false;
  }

  get position () { return this._pos; }

  dispose (scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── EnemyProjectile ────────────────────────────────────────────────────────

class EnemyProjectile {
  static RADIUS = 0.8;

  constructor (scene, origin, playerPos, speed = 9) {
    this.alive  = true;
    this.radius = EnemyProjectile.RADIUS;
    this._pos   = origin.clone();
    const dir   = new THREE.Vector3().subVectors(playerPos, origin).normalize();
    this._vel   = dir.multiplyScalar(speed);

    const geo = new THREE.IcosahedronGeometry(0.6, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3300, wireframe: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this._pos);
    scene.add(this.mesh);
  }

  update (delta) {
    if (!this.alive) return;
    this._pos.addScaledVector(this._vel, delta);
    this.mesh.position.copy(this._pos);
    this.mesh.rotation.x += delta;
    this.mesh.rotation.y += delta * 0.7;
    if (this._pos.z < -20) this.alive = false;
  }

  get position () { return this._pos; }

  dispose (scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── EyeBeam ────────────────────────────────────────────────────────────────

class EyeBeam {
  constructor (scene, leftPos, rightPos, sweepTime, playerPos) {
    this.alive      = true;
    this._timer     = sweepTime;
    this._maxTime   = sweepTime;
    this._scene     = scene;

    // Target is captured once, NOT re-read from playerPos every frame.
    // This makes the beam dodgeable — its endpoint is fixed once it locks on.
    this._lockedTarget = null;
    this._lockProgress = 0.6;   // Beam locks its target at 60% through the sweep

    const mat = new THREE.LineBasicMaterial({
      color: 0xff0044, linewidth: 2, transparent: true, opacity: 0.9,
    });

    this._leftOrigin  = leftPos.clone();
    this._rightOrigin = rightPos.clone();
    this._leftBeam    = this._makeLine(leftPos,  mat);
    this._rightBeam   = this._makeLine(rightPos, mat);
    this._mat         = mat;
  }

  _makeLine (origin, mat) {
    const end  = origin.clone().add(new THREE.Vector3(0, 0, 60));
    const geo  = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geo, mat);
    this._scene.add(line);
    return line;
  }

  update (delta, playerPos) {
    if (!this.alive) return;
    this._timer -= delta;

    const t = 1 - (this._timer / this._maxTime);

    // Lock the target once, at _lockProgress through the sweep.
    // Before the lock: beam tracks the player (telegraphing where it's going).
    // After the lock: target is FIXED — player can dodge the final position.
    if (!this._lockedTarget && t >= this._lockProgress) {
      this._lockedTarget = playerPos.clone();
    }

    const trackingTarget = this._lockedTarget ?? playerPos;
    const end = new THREE.Vector3().lerpVectors(
      this._leftOrigin.clone().add(new THREE.Vector3(0, 0, 60)),
      trackingTarget,
      Math.min(1, t * 1.4)
    );

    [this._leftBeam, this._rightBeam].forEach((line, i) => {
      const origin = i === 0 ? this._leftOrigin : this._rightOrigin;
      const pos    = line.geometry.attributes.position;
      pos.setXYZ(0, origin.x, origin.y, origin.z);
      pos.setXYZ(1, end.x, end.y, end.z);
      pos.needsUpdate = true;
    });

    this._mat.opacity = 0.6 + 0.4 * Math.abs(Math.sin(this._timer * 8));
    if (this._timer <= 0) this.alive = false;
  }

  /**
   * Hit check now uses the LOCKED target, not the player's live position.
   * If the player has moved away from where the beam locked, no hit —
   * this is what makes the attack dodgeable.
   */
  hitsPlayer (playerPos, radius = 1.6) {
    if (!this.alive || !this._lockedTarget) return false;
    const t = 1 - (this._timer / this._maxTime);
    if (t < 0.92) return false;   // Only the very end of the sweep is lethal
    return this._lockedTarget.distanceTo(playerPos) < radius;
  }

  dispose (scene) {
    [this._leftBeam, this._rightBeam].forEach(l => {
      scene.remove(l);
      l.geometry.dispose();
    });
    this._mat.dispose();
  }
}

// ── Asteroid ────────────────────────────────────────────────────────────────

class Asteroid {
  static TYPES    = ['HEALTH', 'SHIELD', 'MULTI', 'RAPID', 'POWER'];
  static DROP_PCT = 0.30;

  constructor (scene, position, velocity, radius = 2.5, isGolden = false) {
    this.alive    = true;
    this.radius   = radius;
    this.isGolden = isGolden;
    this._pos     = position.clone();
    this._vel     = velocity.clone();
    this._rotAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
    this._rotSpd  = 0.4 + Math.random() * 0.8;

    const geo = new THREE.IcosahedronGeometry(radius, 0);
    const mat = new THREE.MeshBasicMaterial({ color: isGolden ? 0xffcc00 : 0x556677, wireframe: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this._pos);
    scene.add(this.mesh);

    if (isGolden) {
      const gGeo = new THREE.TorusGeometry(radius * 1.3, 0.2, 6, 18);
      const gMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.55 });
      this._glow = new THREE.Mesh(gGeo, gMat);
      this._glow.position.copy(this._pos);
      scene.add(this._glow);
    }
  }

  update (delta) {
    if (!this.alive) return;
    this._pos.addScaledVector(this._vel, delta);
    this.mesh.position.copy(this._pos);
    this.mesh.rotateOnAxis(this._rotAxis, this._rotSpd * delta);
    if (this._glow) {
      this._glow.position.copy(this._pos);
      this._glow.rotation.z += delta * 0.6;
    }
    if (this._pos.z < -30 || this._pos.z > 120) this.alive = false;
  }

  get position () { return this._pos; }

  break () {
    this.alive = false;
    if (this.isGolden) return Asteroid.TYPES[Math.floor(Math.random() * Asteroid.TYPES.length)];
    return Math.random() < Asteroid.DROP_PCT
      ? Asteroid.TYPES[Math.floor(Math.random() * Asteroid.TYPES.length)]
      : null;
  }

  dispose (scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this._glow) {
      scene.remove(this._glow);
      this._glow.geometry.dispose();
      this._glow.material.dispose();
    }
  }
}

// ── Minion ──────────────────────────────────────────────────────────────────

class Minion {
  static SHOOT_INTERVAL = 3.5;
  static RADIUS         = 1.2;

  constructor (scene, origin, difficulty = 1.0) {
    this.alive       = true;
    this.hp          = 2;
    this.radius      = Minion.RADIUS;
    this._difficulty = difficulty;
    this._flashUntil = 0;   // ADD
    this._shootTimer = (Minion.SHOOT_INTERVAL / difficulty) * Math.random();
    this._pos        = origin.clone().add(
      new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, 0)
    );

    const geo = new THREE.OctahedronGeometry(1.2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2200, wireframe: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this._pos);
    scene.add(this.mesh);
  }

  /** Returns true if the minion wants to fire this frame. */
  update (delta, playerPos) {
    if (!this.alive) return false;
  
    const dir = new THREE.Vector3().subVectors(playerPos, this._pos).normalize();
    this._pos.addScaledVector(dir, 4.5 * this._difficulty * delta);
    this.mesh.position.copy(this._pos);
    this.mesh.rotation.y += delta * 2;
    this.mesh.rotation.x += delta * 1.5;
  
    // Flash-on-hit — timestamp checked here instead of a setTimeout callback.
    // Dies naturally if the minion is disposed before the flash would end.
    this.mesh.material.color.setHex(
      performance.now() < this._flashUntil ? 0xffffff : 0xff2200
    );
  
    this._shootTimer -= delta;
    if (this._shootTimer <= 0) {
      this._shootTimer = Minion.SHOOT_INTERVAL / this._difficulty;
      return true;
    }
    return false;
  }

  get position () { return this._pos; }

  hit () {
    this.hp--;
    this._flashUntil = performance.now() + 80;
    if (this.hp <= 0) this.alive = false;
  }

  dispose (scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── PowerToken ──────────────────────────────────────────────────────────────

class PowerToken {
  static COLLECT_RADIUS = 2.5;
  static COLORS = { HEALTH: 0x00ff44, SHIELD: 0x00ccff, MULTI: 0xff8800, RAPID: 0xffff00, POWER: 0xff00ff };

  constructor (scene, position, type) {
    this.alive   = true;
    this.type    = type;
    this._pos    = position.clone();
    this._bob    = Math.random() * Math.PI * 2;

    const geo = new THREE.OctahedronGeometry(0.9, 0);
    const mat = new THREE.MeshBasicMaterial({ color: PowerToken.COLORS[type] ?? 0xffffff, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this._pos);
    scene.add(this.mesh);
  }

  /** Returns true when collected. */
  update (delta, playerPos) {
    if (!this.alive) return false;
    this._bob += delta * 3;
  
    const toPlayer  = new THREE.Vector3().subVectors(playerPos, this._pos);
    const dist      = toPlayer.length();
    const pullSpeed = THREE.MathUtils.clamp(14 - dist * 0.15, 5, 14);
    if (dist > 0.001) {
      this._pos.addScaledVector(toPlayer.normalize(), pullSpeed * delta);
    }
  
    this.mesh.position.copy(this._pos);
    this.mesh.position.y += Math.sin(this._bob) * 0.3;
    this.mesh.rotation.y += delta * 2;
  
    if (dist < PowerToken.COLLECT_RADIUS) { this.alive = false; return true; }
    return false;
  }

  get position () { return this._pos; }

  dispose (scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── ChaosEmerald ────────────────────────────────────────────────────────────

class ChaosEmerald {
  static COLORS = [0xff2222, 0x4444ff, 0xffee00, 0x00ee44, 0xaa00ff, 0x00ffee, 0xffffff];

  constructor (scene, position, phaseNumber) {
    this.collected = false;
    this._pos  = position.clone();
    this._bob  = 0;
    const color = ChaosEmerald.COLORS[(phaseNumber - 1) % 7];

    const geo  = new THREE.OctahedronGeometry(2.0, 0);
    const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    this._mesh = new THREE.Mesh(geo, mat);

    const wireGeo = new THREE.WireframeGeometry(geo);
    this._mesh.add(new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    ));

    this._mesh.position.copy(this._pos);
    scene.add(this._mesh);
  }

  /** Returns true when collected. */
  update (delta, playerPos) {
    if (this.collected) return false;
    this._bob += delta;
    const dir = new THREE.Vector3().subVectors(playerPos, this._pos).normalize();
    this._pos.addScaledVector(dir, 10 * delta);
    this._mesh.position.copy(this._pos);
    this._mesh.position.y += Math.sin(this._bob * 2) * 0.4;
    this._mesh.rotation.y += delta * 1.8;
    this._mesh.rotation.x += delta * 0.6;
    if (this._pos.distanceTo(playerPos) < 3.5) { this.collected = true; return true; }
    return false;
  }

  dispose (scene) {
    scene.remove(this._mesh);
    this._mesh.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}

// ── BossFight ───────────────────────────────────────────────────────────────

export class BossFight {

  static PLAYER_SPEED    = 8.5;
  static PLAYER_MAX_HP   = 3;
  static SHOOT_COOLDOWN  = 0.25;
  static HIT_INVINCIBLE  = 1.2;
  static STAR_COUNT      = 700;
  static MAX_ASTEROIDS   = 24;
  static PHASE_DIFFICULTY_BASE = 1.25;
  static PHASE_DIFFICULTY_STEP = 0.18;
  static SHIP_MODEL_SCALE = 0.5; 

  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Camera}  camera
   * @param {number}        phaseNumber  1–7 (which Chaos Emerald)
   * @param {Function}      onComplete   (victory: boolean, score: number) => void
   */
  constructor (scene, camera, phaseNumber, onComplete) {
    this.scene       = scene;
    this.camera      = camera;
    this.phaseNumber = phaseNumber;
    this.onComplete  = onComplete;

    this.isActive = true;
    this._score   = 0;

    this._difficulty = BossFight.PHASE_DIFFICULTY_BASE
  + (this.phaseNumber - 1) * BossFight.PHASE_DIFFICULTY_STEP;

    // Player
    this._px         = 0;
    this._py         = 0;
    this._pz         = -2;
    this._playerHP   = BossFight.PLAYER_MAX_HP;
    this._invincible = 0;
    this._shootTimer = 0;

    // Power-up timers
    this._shield    = 0;
    this._multiShot = 0;
    this._rapidFire = 0;
    this._powerBoost = 0;

    // Entity lists
    this._playerProj = [];
    this._enemyProj  = [];
    this._eyeBeams   = [];
    this._asteroids  = [];
    this._minions    = [];
    this._tokens     = [];
    this._emerald    = null;

    // Delayed action queue
    this._delays = [];

    // Input
    this._keys      = new Set();
    this._onKeyDown = e => this._keys.add(e.code);
    this._onKeyUp   = e => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // Save camera state
    this._camPos = this.camera.position.clone();
    this._camRot = this.camera.rotation.clone();

    // Scene group (stars + boss live here)
    this._group = new THREE.Group();
    this.scene.add(this._group);

    this._buildStars();
    this.boss = new BossEntity(this._group, this._difficulty);

    // Shield visual — owned directly by scene, tracked for disposal
    this._buildShieldVisual();
	
	this._buildPlayerShip();

    this._buildHUD();

    // Intro
    this._introTimer  = 2.5;
    this._introActive = true;
    this.camera.position.set(0, 0, -40);
    this.camera.lookAt(0, 0, 55);
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  update (delta) {
    if (!this.isActive) return;

    if (this._introActive) { this._updateIntro(delta); return; }

    this._handleInput(delta);
    this._tickTimers(delta);
    this._updateCamera();
	this._updateShip(delta);

    const playerPos = new THREE.Vector3(this._px, this._py, this._pz);
    const taunt     = this.boss.update(delta, playerPos);
    if (taunt) this._showTaunt(taunt);

    this._processPendingAttacks(delta, playerPos);
    this._tickEntities(delta, playerPos);
    this._checkCollisions(playerPos);
    if (this._emerald) {
      if (this._emerald.update(delta, playerPos)) {
        this._emerald.dispose(this.scene);
        this._emerald = null;
        this._showTaunt('CHAOS EMERALD ACQUIRED. SINNESLÖSCHEN IS DISPLEASED.');
        setTimeout(() => this._end(true), 2500);
      }
    }

    this._updateHUD();
  }

  dispose () {
    this.isActive = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);

    // Boss (inside this._group)
    this.boss.dispose();

    // World-space entities (added directly to scene)
    [...this._playerProj, ...this._enemyProj, ...this._asteroids,
      ...this._minions,   ...this._tokens,     ...this._eyeBeams]
      .forEach(e => e.dispose(this.scene));

    if (this._emerald) { this._emerald.dispose(this.scene); this._emerald = null; }

    // Shield mesh is scene-direct — dispose explicitly
    if (this._shieldMesh) {
      this.scene.remove(this._shieldMesh);
      this._shieldMesh.geometry.dispose();
      this._shieldMesh.material.dispose();
      this._shieldMesh = null;
    }
	
    if (this._shipGroup) {
      this.scene.remove(this._shipGroup);
      this._shipGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this._shipGroup = null;
    }

    // Group (stars)
    this.scene.remove(this._group);
    this._group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });

    if (this._hud) { this._hud.remove(); this._hud = null; }

    this.camera.position.copy(this._camPos);
    this.camera.rotation.copy(this._camRot);
  }

  // ── Intro ──────────────────────────────────────────────────────────────────

  _updateIntro (delta) {
    this._introTimer -= delta;
    const t = 1 - Math.max(0, this._introTimer / 2.5);
    this.camera.position.set(0, 0, THREE.MathUtils.lerp(-40, this._pz, Math.min(1, t * 1.3)));
    this.camera.lookAt(0, 0, 55);
    if (this._introTimer <= 0) this._introActive = false;
  }

  // ── Input & shooting ───────────────────────────────────────────────────────

  _handleInput (delta) {
    const spd = BossFight.PLAYER_SPEED * delta;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft'))  this._px += spd;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) this._px -= spd;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp'))    this._py += spd;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown'))  this._py -= spd;
    this._px = THREE.MathUtils.clamp(this._px, -10, 10);
    this._py = THREE.MathUtils.clamp(this._py,  -7,  7);
    if (this._shootTimer <= 0 && (this._keys.has('Space') || this._keys.has('KeyZ'))) {
      this._fire();
    }
  }

  _fire () {
    const cooldown = this._rapidFire > 0 ? BossFight.SHOOT_COOLDOWN * 0.45 : BossFight.SHOOT_COOLDOWN;
    this._shootTimer = cooldown;
    const damage = this._powerBoost > 0 ? 2 : 1;
    const origin = new THREE.Vector3(this._px, this._py, this._pz + 1);
    const angles = this._multiShot > 0 ? [-0.12, -0.06, 0, 0.06, 0.12] : [0];
    angles.forEach(a => {
      const dir = new THREE.Vector3(a, 0, 1).normalize();
      this._playerProj.push(new PlayerProjectile(this.scene, origin, dir, damage));
    });
  }

  // ── Timers ─────────────────────────────────────────────────────────────────

  _tickTimers (delta) {
    this._shootTimer  = Math.max(0, this._shootTimer  - delta);
    this._invincible  = Math.max(0, this._invincible  - delta);
    this._shield      = Math.max(0, this._shield      - delta);
    this._multiShot   = Math.max(0, this._multiShot   - delta);
    this._rapidFire   = Math.max(0, this._rapidFire   - delta);
    this._powerBoost  = Math.max(0, this._powerBoost  - delta);
    if (this._shieldMesh) this._shieldMesh.visible = this._shield > 0;

    this._delays = this._delays.filter(d => {
      d.timer -= delta;
      if (d.timer <= 0) { d.fn(); return false; }
      return true;
    });
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  _updateCamera () {
    this.camera.position.set(this._px, this._py, this._pz);
    this.camera.lookAt(
      this.boss.position.x * 0.15 + this._px * 0.85,
      this.boss.position.y * 0.15 + this._py * 0.85,
      this.boss.position.z
    );
  }

  // ── Boss attack processing ─────────────────────────────────────────────────

  _processPendingAttacks (delta, playerPos) {
    const attacks = [...this.boss.pendingAttacks];
    this.boss.pendingAttacks.length = 0;

    attacks.forEach(atk => {
      switch (atk.type) {
        case 'projectile':
          if (atk.delay > 0) {
            this._delays.push({ timer: atk.delay, fn: () => this._spawnEnemyProjectile(atk, playerPos) });
          } else {
            this._spawnEnemyProjectile(atk, playerPos);
          }
          break;

        case 'eye_beam':
          this._eyeBeams.push(new EyeBeam(this.scene, atk.leftEye, atk.rightEye, atk.sweepTime, playerPos));
          break;

        case 'asteroid_wave':
          this._spawnAsteroidWave(atk.count, atk.phase ?? 0);
          break;

        case 'minion_wave':
          for (let i = 0; i < atk.count; i++) {
            this._delays.push({ timer: i * 0.35, fn: () => this._minions.push(new Minion(this.scene, atk.origin)) });
          }
          break;

        case 'charge_warning':
          this._showTaunt('BRACE YOURSELF. — SINNESLÖSCHEN INC.');
          break;

        case 'boss_dying':
          this._showTaunt('PROCESS ERROR. PROCESS ERROR. PR—');
          break;

        case 'boss_dead':
          this._emerald = new ChaosEmerald(this.scene, new THREE.Vector3(0, 0, 35), this.phaseNumber);
          this._showTaunt('CHAOS EMERALD DETECTED. APPROACH.');
          break;
      }
    });
  }

  _spawnEnemyProjectile (atk, playerPos) {
    const target = new THREE.Vector3(atk.targetX, atk.targetY, atk.targetZ);
    this._enemyProj.push(new EnemyProjectile(this.scene, atk.origin, target, atk.speed ?? 9));
  }

  _spawnAsteroidWave (count, phase) {
    if (this._asteroids.length >= BossFight.MAX_ASTEROIDS) return;
  
    const scaledCount = Math.round(count * (0.7 + this._difficulty * 0.3));
    const goldenCount  = Math.ceil(scaledCount * 0.25);
  
    for (let i = 0; i < scaledCount && this._asteroids.length < BossFight.MAX_ASTEROIDS; i++) {
      const angle  = (i / scaledCount) * Math.PI * 2 + Math.random() * 0.3;
      const spread = 20 + phase * 5;
      const pos = new THREE.Vector3(
        Math.cos(angle) * spread + this.boss.position.x,
        (Math.random() - 0.5) * 12,
        30 + Math.random() * 20
      );
      const vel = new THREE.Vector3(
        Math.cos(angle + Math.PI) * (3 + Math.random() * 3) * this._difficulty,
        (Math.random() - 0.5) * 2,
        -(3 + Math.random() * 4) * this._difficulty
      );
      this._asteroids.push(new Asteroid(this.scene, pos, vel, 1.8 + Math.random() * 2.2, i < goldenCount));
    }
  }

  // ── Entity ticks ────────────────────────────────────────────────────────────

  _tickEntities (delta, playerPos) {
    // Player projectiles
    this._playerProj.forEach(p => p.update(delta));
    this._playerProj = this._playerProj.filter(p => { if (!p.alive) { p.dispose(this.scene); return false; } return true; });

    // Enemy projectiles
    this._enemyProj.forEach(p => p.update(delta));
    this._enemyProj = this._enemyProj.filter(p => { if (!p.alive) { p.dispose(this.scene); return false; } return true; });

    // Eye beams
    this._eyeBeams.forEach(b => b.update(delta, playerPos));
    this._eyeBeams = this._eyeBeams.filter(b => { if (!b.alive) { b.dispose(this.scene); return false; } return true; });

    // Asteroids
    this._asteroids.forEach(a => a.update(delta));
    this._asteroids = this._asteroids.filter(a => { if (!a.alive) { a.dispose(this.scene); return false; } return true; });

    // Minions
    this._minions.forEach(m => {
      if (m.update(delta, playerPos)) {
        this._enemyProj.push(new EnemyProjectile(this.scene, m.position.clone(), playerPos, 7));
      }
    });
    this._minions = this._minions.filter(m => { if (!m.alive) { m.dispose(this.scene); return false; } return true; });

    // Power tokens
    this._tokens.forEach(t => { if (t.update(delta, playerPos)) this._applyPowerUp(t.type); });
    this._tokens = this._tokens.filter(t => { if (!t.alive) { t.dispose(this.scene); return false; } return true; });
  }

  // ── Collisions ─────────────────────────────────────────────────────────────

  _checkCollisions (playerPos) {
    const eyePositions = this.boss.getEyeWorldPositions();

    this._playerProj.forEach(proj => {
      if (!proj.alive) return;
      // vs eyes
      eyePositions.forEach(ep => {
        if (proj.position.distanceTo(ep) < BossEntity.EYE_RADIUS + proj.radius) {
          proj.alive = false;
          this._score += 50;
          const { taunt } = this.boss.takeDamage(proj.damage * 10);
          if (taunt) this._showTaunt(taunt);
        }
      });
      // vs asteroids
      if (!proj.alive) return;
      this._asteroids.forEach(ast => {
        if (!ast.alive) return;
        if (proj.position.distanceTo(ast.position) < ast.radius + proj.radius) {
          proj.alive = false;
          this._score += ast.isGolden ? 100 : 50;
          const drop = ast.break();
          if (drop) this._tokens.push(new PowerToken(this.scene, ast.position.clone(), drop));
        }
      });
      // vs minions
      if (!proj.alive) return;
      this._minions.forEach(m => {
        if (!m.alive) return;
        if (proj.position.distanceTo(m.position) < m.radius + proj.radius) {
          proj.alive = false; this._score += 150; m.hit();
        }
      });
    });

    if (this._invincible > 0 || this._shield > 0) return;

    // Enemy projectiles vs player
    this._enemyProj.forEach(proj => {
      if (proj.alive && proj.position.distanceTo(playerPos) < 1.2 + proj.radius) {
        proj.alive = false; this._hitPlayer();
      }
    });

    // Eye beams vs player
    this._eyeBeams.forEach(b => { if (b.hitsPlayer(playerPos)) this._hitPlayer(); });

    // Minion contact
    this._minions.forEach(m => {
      if (m.alive && m.position.distanceTo(playerPos) < 1.2 + m.radius) {
        m.alive = false; this._hitPlayer();
      }
    });
  }

  _hitPlayer () {
    if (this._invincible > 0 || this._shield > 0) return;
    this._playerHP--;
    this._invincible = BossFight.HIT_INVINCIBLE;
    this._showTaunt('NEURAL DISRUPTION DETECTED. PLEASE CONTINUE.');
    if (this._playerHP <= 0) this._end(false);
  }

  // ── Power-ups ──────────────────────────────────────────────────────────────

  _applyPowerUp (type) {
    const labels = { HEALTH: '+ HEALTH', SHIELD: 'SHIELD ONLINE', MULTI: 'MULTI-SHOT', RAPID: 'RAPID FIRE', POWER: 'DAMAGE BOOST' };
    switch (type) {
      case 'HEALTH': this._playerHP = Math.min(BossFight.PLAYER_MAX_HP, this._playerHP + 1); break;
      case 'SHIELD': this._shield    = 3.0;  break;
      case 'MULTI':  this._multiShot = 10.0; break;
      case 'RAPID':  this._rapidFire = 10.0; break;
      case 'POWER':  this._powerBoost = 12.0; break;
    }
    this._showTaunt(labels[type] ?? type);
  }

  // ── End ─────────────────────────────────────────────────────────────────────

  _end (victory) {
    if (!this.isActive) return;
    this.isActive = false;
    setTimeout(() => { if (this.onComplete) this.onComplete(victory, this._score); }, victory ? 500 : 1500);
  }

  // ── Stars ──────────────────────────────────────────────────────────────────

  _buildStars () {
    const n = BossFight.STAR_COUNT, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3]   = (Math.random()-0.5) * 180;
      pos[i*3+1] = (Math.random()-0.5) * 120;
      pos[i*3+2] = Math.random() * 160 - 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true })));
  }

  // ── Shield visual ──────────────────────────────────────────────────────────

  _buildShieldVisual () {
    const geo = new THREE.IcosahedronGeometry(2.5, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff, wireframe: true, transparent: true, opacity: 0.45 });
    this._shieldMesh         = new THREE.Mesh(geo, mat);
    this._shieldMesh.visible = false;
    this.scene.add(this._shieldMesh);   // World-space — tracked separately in dispose()
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD () {
    this._hud = document.createElement('div');
    this._hud.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:600;pointer-events:none;font-family:"Courier New",monospace';

    // Boss HP bar
    const bossRow = document.createElement('div');
    bossRow.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:center;padding:10px 0 4px';
    this._bossLabel = document.createElement('span');
    this._bossLabel.style.cssText = 'color:#ff2200;font-size:13px;letter-spacing:0.1em;text-shadow:0 0 8px #ff2200;white-space:nowrap';
    this._bossLabel.textContent = 'SYNTHETIC OVERLORD';
    const bossBarWrap = document.createElement('div');
    bossBarWrap.style.cssText = 'width:300px;height:10px;background:#1a0000;border:1px solid #ff2200;border-radius:2px;overflow:hidden;flex-shrink:0';
    this._bossBar = document.createElement('div');
    this._bossBar.style.cssText = 'height:100%;background:#ff2200;box-shadow:0 0 6px #ff2200;transition:width 0.2s';
    bossBarWrap.appendChild(this._bossBar);
    bossRow.append(this._bossLabel, bossBarWrap);

    // Player info row
    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0 16px 6px';
    this._hpDisplay    = document.createElement('div');
    this._hpDisplay.style.cssText = 'color:#00ff44;font-size:18px;text-shadow:0 0 8px #00ff44';
    this._scoreDisplay = document.createElement('div');
    this._scoreDisplay.style.cssText = 'color:#ffffff;font-size:13px;letter-spacing:0.1em';
    this._puDisplay    = document.createElement('div');
    this._puDisplay.style.cssText = 'color:#ffaa00;font-size:12px;letter-spacing:0.08em;text-align:right;text-shadow:0 0 6px #ffaa00';
    infoRow.append(this._hpDisplay, this._scoreDisplay, this._puDisplay);

    // Taunt overlay
    this._tauntEl = document.createElement('div');
    this._tauntEl.style.cssText = [
      'position:absolute','top:58px','left:50%','transform:translateX(-50%)',
      'color:#ff2200','font-size:14px','letter-spacing:0.12em','text-align:center',
      'text-shadow:0 0 10px #ff2200','opacity:0','transition:opacity 0.3s',
      'pointer-events:none','white-space:nowrap',
    ].join(';');

    this._hud.append(bossRow, infoRow, this._tauntEl);
    document.getElementById('screen')?.appendChild(this._hud);
  }

  _updateHUD () {
    if (!this._hud) return;
    this._bossBar.style.width = Math.max(0, this.boss.hp / BossEntity.MAX_HP * 100) + '%';

    const full  = '♥'.repeat(this._playerHP);
    const empty = '♡'.repeat(Math.max(0, BossFight.PLAYER_MAX_HP - this._playerHP));
    this._hpDisplay.textContent = full + empty;

    this._scoreDisplay.textContent = `SCORE: ${this._score.toLocaleString()}`;

    const active = [];
    if (this._shield    > 0) active.push('SHIELD');
    if (this._multiShot > 0) active.push('MULTI');
    if (this._rapidFire > 0) active.push('RAPID');
    if (this._powerBoost > 0) active.push('POWER');
    this._puDisplay.textContent = active.join('  ');
  }

  _showTaunt (text) {
    if (!this._tauntEl) return;
    this._tauntEl.textContent = text;
    this._tauntEl.style.opacity = '1';
    clearTimeout(this._tauntTimeout);
    this._tauntTimeout = setTimeout(() => { if (this._tauntEl) this._tauntEl.style.opacity = '0'; }, 2800);
  }

  /**
   * Player ship indicator — parented to the camera so it always renders in a
   * fixed screen position, like a cockpit reticle. This solves the "where am I
   * aiming / what's about to hit me" visibility problem: the ship banks with
   * strafe input and points toward the boss, giving the player a clear frame
   * of reference they didn't have with a bare camera.
   */
  _buildPlayerShip () {
    this._shipGroup       = new THREE.Group();
    this._shipLocalOffset = new THREE.Vector3(0, -1.4, -2.2);
    this._shipRoll        = 0;
    this._shipPitch       = 0;
    this._shipWireframeMats = [];   // Populated once the OBJ loads — used to tint on shield pickup
  
    const engineGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const engineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, blending: THREE.AdditiveBlending });
    this._shipEngine = new THREE.Mesh(engineGeo, engineMat);
    this._shipEngine.position.set(0, -0.05, 0.4);
    this._shipGroup.add(this._shipEngine);
  
    objLoader.load(
      './models/player.obj',
      (object) => {
        object.traverse((child) => {
          if (!child.isMesh) return;
  
          const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(child.geometry),
            new THREE.LineBasicMaterial({ color: 0xffff00 })
          );
          child.add(wireframe);
          this._shipWireframeMats.push(wireframe.material);
  
          child.material = new THREE.MeshBasicMaterial({
            color: 0,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 1,
          });
  
          child.scale.set(BossFight.SHIP_MODEL_SCALE, BossFight.SHIP_MODEL_SCALE, BossFight.SHIP_MODEL_SCALE);
          child.rotation.y = -Math.PI / 2;
          child.position.z = -1.0;
  
          this._shipGroup.add(child);
        });
      },
      null,
      err => console.warn('BossFight: player.obj failed to load', err)
    );
  
    this.scene.add(this._shipGroup);
  }

  /**
   * Banks the ship with lateral movement and pulses the engine glow.
   * Because the ship is camera-parented, we don't move its position based on
   * _px/_py directly — instead we bank/tilt it to sell the sense of motion,
   * using the frame-to-frame change in player position as the movement signal.
   */
  _updateShip (delta) {
    if (!this._shipGroup) return;
  
    const worldPos = this._shipLocalOffset.clone()
      .applyQuaternion(this.camera.quaternion)
      .add(this.camera.position);
  
    this._shipGroup.position.copy(worldPos);
    this._shipGroup.quaternion.copy(this.camera.quaternion);
  
    const dx = this._px - (this._lastShipX ?? this._px);
    const dy = this._py - (this._lastShipY ?? this._py);
    this._lastShipX = this._px;
    this._lastShipY = this._py;
  
    const targetRoll  = THREE.MathUtils.clamp(-dx * 8, -0.5, 0.5);
    const targetPitch = THREE.MathUtils.clamp( dy * 6, -0.35, 0.35);
    this._shipRoll  = THREE.MathUtils.lerp(this._shipRoll,  targetRoll,  delta * 6);
    this._shipPitch = THREE.MathUtils.lerp(this._shipPitch, targetPitch, delta * 6);
  
    this._shipGroup.rotateZ(this._shipRoll);
    this._shipGroup.rotateX(this._shipPitch);
  
    // Engine pulse
    if (this._shipEngine) {
      this._shipEngine.material.opacity = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 150));
    }
  
    // Flicker on hit
    this._shipGroup.visible = this._invincible <= 0 || Math.floor(performance.now() / 80) % 2 === 0;
  
    const shipColor = this._shield > 0 ? 0xffff00 : 0xffff00;
    this._shipWireframeMats.forEach(mat => mat.color.setHex(shipColor));
  
    if (this._shieldMesh) {
      this._shieldMesh.position.copy(worldPos);
      this._shieldMesh.rotation.x += 0.04;
      this._shieldMesh.rotation.y += 0.03;
    }
  }
}
