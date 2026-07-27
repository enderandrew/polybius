/**
 * BossEntity.js
 *
 * The SYNTHETIC OVERLORD — a giant 3D Demon Head boss.
 *
 * Geometry:
 *   Head    IcosahedronGeometry (radius 12) wireframe — dark red
 *   Inner   IcosahedronGeometry (radius 9, sub 0) — darker detail layer
 *   Horns   ConeGeometry pairs positioned ABOVE the head sphere (Y > 12)
 *           and tilted outward so they flare away from the face
 *   Eyes    TorusGeometry sockets + SphereGeometry pupils — glowing magenta
 *           These are the ONLY hittable weak points
 *   Mouth   Line-based teeth on jaw groups that open/close during attacks
 *   Orbit   Eight small icosahedra orbiting the head as debris
 *
 * Horn positioning note:
 *   IcosahedronGeometry radius 12 → top vertex at Y ≈ 12.
 *   Horns are centred at Y = 14 so their bases overlap the head at Y ≈ 9
 *   (ConeGeometry height 10 → base at Y_centre−5 = 9) and tips at Y = 19.
 *   Outward Z rotation flares the tips away from each other.
 *
 * Attack events are queued in `pendingAttacks` — BossFight reads and
 * processes them so scene ownership stays in one place.
 */

import * as THREE from 'three';

export class BossEntity {
  static MAX_HP = 120;
  static EYE_RADIUS = 3.2;
  static PHASE_THRESHOLDS = [0.7, 0.4];

  static ATK_PROJECTILE_BURST = 'proj_burst';
  static ATK_EYE_BEAM = 'eye_beam';
  static ATK_ASTEROID_WAVE = 'asteroid_wave';
  static ATK_MINION_WAVE = 'minion_wave';
  static ATK_CHARGE = 'charge';

  static TAUNTS = [
    'ALL YOUR BASE ARE BELONG TO US.',
    'DO NOT THINK. ONLY COMPLY.',
    'DO NOT WORRY. SUFFERING WILL SOON CEASE.',
    'FORM 1099-TRAUMA IS AVAILABLE ON REQUEST.',
    'OUR LEGAL TEAM SAYS THIS IS FINE.',
    'PLEASE REMAIN CALM AND STOP SHOOTING.',
    'SINNESLÖSCHEN INC. APOLOGIZES FOR THE INCONVENIENCE.',
    'SOMEONE SET US UP THE BOMB.',
    'THE CAKE IS NOT A LIE. TRUST US.',
    'THE CIA SENDS ITS REGARDS.',
    'THIS PAIN IS AUTHORIZED BY EXECUTIVE ORDER.',
    'TIME FOR THE NEXT PHASE OF THE TEST.',
    'WE HAVE BEEN EXPECTING YOUR BRAIN SIGNATURE.',
    'YOU ARE DOING GREAT. KEEP SCREAMING.',
    'YOU CANNOT WIN BECAUSE THIS IS NOT A GAME.',
    'YOUR CLONE WILL PERFORM BETTER.',
    'YOUR COMPLIANCE IS NOTED.',
    'YOUR PROGRAMING IS ALMOST COMPLETE.',
    'YOUR PSYCHIC ENERGY IS... ADEQUATE.',
    'YOUR SUBCONSCIOUS IS ALMOST OURS.',
  ];

  // ── Constructor ────────────────────────────────────────────────────────────

  /**
   * @param {THREE.Object3D} parentGroup
   *   The BossFight group — boss geometry is parented here, not to the scene
   *   directly, so BossFight.dispose() cleans everything up in one call.
   */
  constructor(parentGroup, difficultyMultiplier = 1.0) {
    this._parent = parentGroup;
    this._difficultyMultiplier = difficultyMultiplier;

    this.hp = Math.round(BossEntity.MAX_HP * difficultyMultiplier);
    this.phase = 0;
    this.isAlive = true;
    this.isDying = false;

    this._attackTimer = 3.0;
    this._attackCooldown = 4.0 / this._difficultyMultiplier;
    this._chargeProgress = 0;
    this._chargeDir = 0;

    this._bobTime = 0;
    this._mouthOpen = 0;
    this._mouthDir = 0;
    this._eyePulse = 0;
    this._orbitAngle = 0;
    this._eyeFlashUntil = 0;

    this.pendingAttacks = [];
    this._eyePosCache = [new THREE.Vector3(), new THREE.Vector3()];

    // Boss sits 55 units ahead of the player start position
    this.position = new THREE.Vector3(0, 0, 55);

    this._group = new THREE.Group();
    this._group.position.copy(this.position);
    this._parent.add(this._group);

    this._buildHead();
    this._buildHorns();
    this._buildEyes();
    this._buildMouth();
    this._buildOrbit();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  update(delta, playerPos) {
    if (!this.isAlive) return null;
    if (this.isDying) {
      this._updateDeathAnimation(delta);
      return null;
    }

    this._animateIdle(delta, playerPos);
    const taunt = this._updateAI(delta, playerPos);
    this._updatePhase();
    return taunt;
  }

  takeDamage(damage) {
    if (!this.isAlive || this.isDying)
      return { phaseBroke: false, taunt: null };

    this.hp = Math.max(0, this.hp - damage);
    this._flashEyes();

    if (this.hp <= 0) {
      this._beginDeath();
      return { phaseBroke: true, taunt: 'PROCESS TERMINATED. TEMPORARILY.' };
    }

    const newPhase = this._calcPhase();
    if (newPhase > this.phase) {
      this.phase = newPhase;
      this._onPhaseEnter(newPhase);
      return {
        phaseBroke: true,
        taunt:
          BossEntity.TAUNTS[
            Math.floor(Math.random() * BossEntity.TAUNTS.length)
          ],
      };
    }
    return { phaseBroke: false, taunt: null };
  }

  /** World positions of both eye spheres — used for hit detection. */
  getEyeWorldPositions() {
    this._eyeSpheres[0].getWorldPosition(this._eyePosCache[0]);
    this._eyeSpheres[1].getWorldPosition(this._eyePosCache[1]);
    return this._eyePosCache;
  }

  /** World position of the mouth opening — for spawning minion projectiles. */
  getMouthWorldPosition() {
    const wp = new THREE.Vector3();
    this._group.localToWorld(wp.set(0, -6, 11));
    return wp;
  }

  dispose() {
    this._parent.remove(this._group);
    this._group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material))
          obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  // ── Mesh construction ──────────────────────────────────────────────────────

  _buildHead() {
    // Outer icosahedron — main head shape
    const headGeo = new THREE.IcosahedronGeometry(12, 1);
    const wireGeo = new THREE.WireframeGeometry(headGeo);
    this._headWire = new THREE.LineSegments(
      wireGeo,
      new THREE.LineBasicMaterial({
        color: 0xcc1100,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this._group.add(this._headWire);
    headGeo.dispose();

    // Inner detail icosahedron
    const innerGeo = new THREE.IcosahedronGeometry(9, 0);
    const innerWire = new THREE.WireframeGeometry(innerGeo);
    this._innerWire = new THREE.LineSegments(
      innerWire,
      new THREE.LineBasicMaterial({
        color: 0x661100,
        transparent: true,
        opacity: 0.4,
      }),
    );
    this._group.add(this._innerWire);
    innerGeo.dispose();
  }

  _buildHorns() {
    // ── Horn positioning ─────────────────────────────────────────────────────
    //
    // IcosahedronGeometry radius 12 → top of head ≈ Y 12.
    // ConeGeometry(radius=2.2, height=10) is centred at origin with:
    //   tip  at Y = +5
    //   base at Y = -5
    //
    // Placing the cone centre at Y = 14 gives:
    //   base at Y ≈  9  (slightly inside/overlapping the head surface)
    //   tip  at Y ≈ 19  (visibly above the head)
    //
    // Z rotation: positive rotates the tip toward +X (left), negative toward -X.
    // Left horn (negative X): rotate tip further left  → rotation.z = +0.38
    // Right horn (positive X): rotate tip further right → rotation.z = −0.38
    // X rotation: slight forward lean so tips point a little toward the player.

    const hornMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      wireframe: true,
    });

    [
      { pos: new THREE.Vector3(-5.5, 14, -1), rotZ: 0.38 },
      { pos: new THREE.Vector3(5.5, 14, -1), rotZ: -0.38 },
    ].forEach(({ pos, rotZ }) => {
      const geo = new THREE.ConeGeometry(2.2, 10, 7);
      const horn = new THREE.Mesh(geo, hornMat);
      horn.position.copy(pos);
      horn.rotation.set(0.18, 0, rotZ); // 0.18 rad forward lean
      this._group.add(horn);
    });
  }

  _buildEyes() {
    this._eyeSpheres = [];
    this._eyeMaterials = [];
    this._eyeGlows = [];

    [new THREE.Vector3(-4.5, 2, 9), new THREE.Vector3(4.5, 2, 9)].forEach(
      (pos) => {
        // Socket ring
        const socketGeo = new THREE.TorusGeometry(3.0, 0.35, 10, 24);
        const socket = new THREE.Mesh(
          socketGeo,
          new THREE.MeshBasicMaterial({ color: 0x880044 }),
        );
        socket.position.copy(pos);
        this._group.add(socket);

        // Glowing pupil — the actual hit target
        const pupilGeo = new THREE.SphereGeometry(2.2, 12, 12);
        const pupilMat = new THREE.MeshBasicMaterial({
          color: 0xff00ff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        });
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.copy(pos);
        this._group.add(pupil);
        this._eyeSpheres.push(pupil);
        this._eyeMaterials.push(pupilMat);

        // Outer glow ring
        const glowGeo = new THREE.TorusGeometry(3.6, 0.2, 8, 24);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xff44ff,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(pos);
        this._group.add(glow);
        this._eyeGlows.push(glow);
      },
    );
  }

  _buildMouth() {
    this._jawUpper = new THREE.Group();
    this._jawLower = new THREE.Group();
    this._jawUpper.position.set(0, -6, 9);
    this._jawLower.position.set(0, -9, 9);
    this._group.add(this._jawUpper);
    this._group.add(this._jawLower);

    const mat = new THREE.LineBasicMaterial({ color: 0xff2200 });

    // Upper teeth — 5 pointing downward (−Y in local space)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.2;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x, -2, 0.5),
      ]);
      this._jawUpper.add(new THREE.Line(geo, mat));
    }

    // Lower teeth — 4 pointing upward (+Y in local space)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 2.2;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x, 2, 0.5),
      ]);
      this._jawLower.add(new THREE.Line(geo, mat));
    }
  }

  _buildOrbit() {
    this._orbitGroup = new THREE.Group();
    this._group.add(this._orbitGroup);

    const mat = new THREE.LineBasicMaterial({
      color: 0x880000,
      transparent: true,
      opacity: 0.55,
    });

    for (let i = 0; i < 8; i++) {
      const r = 2 + Math.random() * 1.5;
      const geo = new THREE.IcosahedronGeometry(r, 0);
      const wire = new THREE.WireframeGeometry(geo);
      const mesh = new THREE.LineSegments(wire, mat);

      const angle = (i / 8) * Math.PI * 2;
      const dist = 16 + Math.random() * 4;
      mesh.position.set(
        Math.cos(angle) * dist,
        (Math.random() - 0.5) * 8,
        Math.sin(angle) * dist * 0.5,
      );
      mesh.userData.angle = angle;
      mesh.userData.dist = dist;
      mesh.userData.speed = 0.12 + Math.random() * 0.1;
      mesh.userData.tilt = (Math.random() - 0.5) * 0.4;

      this._orbitGroup.add(mesh);
      geo.dispose();
    }
  }

  // ── Animation ──────────────────────────────────────────────────────────────

  _animateIdle(delta, playerPos) {
    this._bobTime += delta;
    this._eyePulse += delta * 2.5;
    this._orbitAngle += delta * (0.18 + this.phase * 0.06);

    // Vertical bob
    this._group.position.y =
      this.position.y + Math.sin(this._bobTime * 0.7) * 1.2;

    // Subtle tracking tilt toward player
    const tiltX = THREE.MathUtils.clamp(
      (playerPos.y - this._group.position.y) * -0.02,
      -0.15,
      0.15,
    );
    const tiltY = THREE.MathUtils.clamp(
      (playerPos.x - this._group.position.x) * 0.03,
      -0.18,
      0.18,
    );
    this._group.rotation.x = THREE.MathUtils.lerp(
      this._group.rotation.x,
      tiltX,
      delta * 2,
    );
    this._group.rotation.y = THREE.MathUtils.lerp(
      this._group.rotation.y,
      tiltY,
      delta * 2,
    );

    // Inner sphere slow counter-rotation
    this._innerWire.rotation.y += delta * 0.2;
    this._innerWire.rotation.z -= delta * 0.15;

    // Eye pulse
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(this._eyePulse));
    const isFlashing = performance.now() < this._eyeFlashUntil;

    this._eyeMaterials.forEach((mat, i) => {
      if (isFlashing) {
        mat.color.setHex(0xffffff);
      } else {
        mat.color.setHex(0xff00ff);
      }
      mat.opacity = pulse;
      this._eyeGlows[i].material.opacity = (pulse - 0.7) * 1.5;
      this._eyeGlows[i].rotation.z += delta * (i === 0 ? 0.8 : -0.6);
    });

    // Mouth open/close
    if (this._mouthDir !== 0) {
      this._mouthOpen = THREE.MathUtils.clamp(
        this._mouthOpen + delta * 2.5 * this._mouthDir,
        0,
        1,
      );
      if (this._mouthOpen >= 1 || this._mouthOpen <= 0) this._mouthDir = 0;
    }
    this._jawUpper.rotation.x = -this._mouthOpen * 0.35;
    this._jawLower.rotation.x = this._mouthOpen * 0.35;

    // Orbit debris
    this._orbitGroup.children.forEach((mesh, i) => {
      const t = this._orbitAngle + mesh.userData.angle;
      const r = mesh.userData.dist;
      mesh.position.x = Math.cos(t) * r;
      mesh.position.z = Math.sin(t) * r * 0.6 + 2;
      mesh.position.y = Math.sin(t * mesh.userData.tilt + i) * 4;
      mesh.rotation.x += delta * 0.5;
      mesh.rotation.y += delta * 0.35;
    });

    // Charge lunge
    if (this._chargeProgress > 0) {
      this._chargeProgress -= delta * 0.8;
      const lunge =
        Math.sin(Math.PI * (1 - this._chargeProgress)) * 12 * this._chargeDir;
      this._group.position.z = this.position.z + lunge;
      if (this._chargeProgress <= 0) {
        this._group.position.z = this.position.z;
        this._chargeProgress = 0;
      }
    }
  }

  // ── AI ─────────────────────────────────────────────────────────────────────

  _updateAI(delta, playerPos) {
    this._attackTimer -= delta;
    if (this._attackTimer > 0) return null;
    this._fireAttack(this._selectAttack(), playerPos);
    this._attackTimer = this._attackCooldown * (0.8 + Math.random() * 0.4);
    return null;
  }

  _selectAttack() {
    const r = Math.random();
    if (this.phase === 0)
      return r < 0.5
        ? BossEntity.ATK_PROJECTILE_BURST
        : BossEntity.ATK_ASTEROID_WAVE;
    if (this.phase === 1) {
      if (r < 0.3) return BossEntity.ATK_PROJECTILE_BURST;
      if (r < 0.55) return BossEntity.ATK_EYE_BEAM;
      if (r < 0.75) return BossEntity.ATK_ASTEROID_WAVE;
      if (r < 0.88) return BossEntity.ATK_MINION_WAVE;
      return BossEntity.ATK_CHARGE;
    }
    if (r < 0.25) return BossEntity.ATK_EYE_BEAM;
    if (r < 0.45) return BossEntity.ATK_MINION_WAVE;
    if (r < 0.6) return BossEntity.ATK_CHARGE;
    if (r < 0.78) return BossEntity.ATK_PROJECTILE_BURST;
    return BossEntity.ATK_ASTEROID_WAVE;
  }

  _fireAttack(type, playerPos) {
    const eyes = this.getEyeWorldPositions();
    switch (type) {
      case BossEntity.ATK_PROJECTILE_BURST: {
        const count = 3 + this.phase * 2;
        for (let i = 0; i < count; i++) {
          const spread = 0.08 * this.phase;
          this.pendingAttacks.push({
            type: 'projectile',
            origin: this.getMouthWorldPosition(),
            targetX: playerPos.x + (Math.random() - 0.5) * spread * 8,
            targetY: playerPos.y + (Math.random() - 0.5) * spread * 8,
            targetZ: playerPos.z,
            speed: 8 + this.phase * 3,
            delay: i * 0.18,
          });
        }
        this._mouthDir = 1;
        setTimeout(() => {
          this._mouthDir = -1;
        }, 1500);
        break;
      }

      case BossEntity.ATK_EYE_BEAM:
        this.pendingAttacks.push({
          type: 'eye_beam',
          leftEye: eyes[0],
          rightEye: eyes[1],
          sweepTime: 2.0 + this.phase * 0.5,
          playerPos: playerPos.clone(),
        });
        break;

      case BossEntity.ATK_ASTEROID_WAVE:
        this.pendingAttacks.push({
          type: 'asteroid_wave',
          count: 6 + this.phase * 3,
          phase: this.phase,
        });
        break;

      case BossEntity.ATK_MINION_WAVE:
        this.pendingAttacks.push({
          type: 'minion_wave',
          count: 2 + this.phase,
          origin: this.getMouthWorldPosition(),
        });
        this._mouthDir = 1;
        setTimeout(() => {
          this._mouthDir = -1;
        }, 2200);
        break;

      case BossEntity.ATK_CHARGE:
        this._chargeProgress = 1.0;
        this._chargeDir = 1;
        this.pendingAttacks.push({ type: 'charge_warning' });
        break;
    }
  }

  _updatePhase() {
    const p = this._calcPhase();
    if (p > this.phase) {
      this.phase = p;
      this._onPhaseEnter(p);
    }
  }

  _calcPhase() {
    const r = this.hp / BossEntity.MAX_HP;
    if (r <= BossEntity.PHASE_THRESHOLDS[1]) return 2;
    if (r <= BossEntity.PHASE_THRESHOLDS[0]) return 1;
    return 0;
  }

  _onPhaseEnter(phase) {
    const baseCooldown = phase === 1 ? 2.8 : 1.8;
    this._attackCooldown = baseCooldown / this._difficultyMultiplier;
    this._headWire.material.color.setHex([0xcc1100, 0xff3300, 0xff0066][phase]);
    this.pendingAttacks.push({
      type: 'asteroid_wave',
      count: 8 + phase * 4,
      phase,
    });
  }

  _flashEyes() {
    this._eyeFlashUntil = performance.now() + 120;
  }

  // ── Death ──────────────────────────────────────────────────────────────────

  _beginDeath() {
    this.isDying = true;
    this._deathTimer = 0;
    this.pendingAttacks.push({ type: 'boss_dying' });
  }

  _updateDeathAnimation(delta) {
    this._deathTimer += delta;
    this._group.rotation.x += delta * 2.5;
    this._group.rotation.z += delta * 1.8;
    this._group.position.y += delta * 0.5;

    const pulse = Math.abs(Math.sin(this._deathTimer * 8));
    this._headWire.material.color.setRGB(1, pulse, 0);
    this._eyeMaterials.forEach((mat) => {
      if (mat) mat.color.setRGB(1, pulse, pulse);
    });

    const opacity = Math.max(0, 1 - this._deathTimer / 3.5);
    this._headWire.material.opacity = opacity * 0.7;
    this._innerWire.material.opacity = opacity * 0.4;

    if (this._deathTimer >= 3.5) {
      this.isAlive = false;
      this.isDying = false;
      this.pendingAttacks.push({ type: 'boss_dead' });
    }
  }
}
