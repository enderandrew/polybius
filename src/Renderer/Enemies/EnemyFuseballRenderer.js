import { BufferGeometry, Group, Line, MeshBasicMaterial, Vector3 } from 'three';
import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';

export default class EnemyFuseballRenderer extends EnemyRenderer {
  static ROTATION_SPEED = 0.02;

  constructor (enemyFuseball, surface) {
    super(enemyFuseball, surface, Enemy.TYPE_FUSEBALL);
  }

  // ── Model construction ─────────────────────────────────────────────────────
  // Override to append pre-built (hidden) variant effect groups after the
  // base model is created by the parent.  They're built once and toggled per
  // setObjectRef call, since this renderer is pooled and reused.

  loadModel () {
    super.loadModel();

    this._gravityOrbit   = this._buildGravityOrbit();
    this._supernovaRings = this._buildSupernovaRings();
    this._voidHalo       = this._buildVoidHalo();

    this._gravityOrbit.visible   = false;
    this._supernovaRings.visible = false;
    this._voidHalo.visible       = false;

    this.add(this._gravityOrbit);
    this.add(this._supernovaRings);
    this.add(this._voidHalo);
  }

  // ── Object assignment ──────────────────────────────────────────────────────

  setObjectRef (object) {
    // Handles type check, colour tinting (isGravity / isSupernova / isVoid),
    // and calls setVisualsToNormal() which resets modelGroup scale to 1,1,1.
    // We correct scale and toggle effects afterwards.
    super.setObjectRef(object);
    this._applyVariantVisuals();
  }

  // setVisualsToNormal is called by setObjectRef AND when explosion animations
  // finish.  Both paths must restore the correct variant scale.
  setVisualsToNormal () {
    super.setVisualsToNormal();
    this._applyVariantVisuals();
  }

  // Centralise all variant-driven visual state so it's applied consistently
  // from both setObjectRef and setVisualsToNormal.
  _applyVariantVisuals () {
    if (!this.object) return;

    if (this._gravityOrbit)   this._gravityOrbit.visible   = !!this.object.isGravity;
    if (this._supernovaRings) this._supernovaRings.visible = !!this.object.isSupernova;
    if (this._voidHalo)       this._voidHalo.visible       = !!this.object.isVoid;

    if (this.modelGroup) {
      const s = this.object.isSupernova ? 1.25
              : this.object.isGravity   ? 0.85
              : 1.0;
      this.modelGroup.scale.setScalar(s);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  updateState () {
    const fuseball = this.object;

    this.positionBase  = this.surface.lanesMiddleCoords[fuseball.laneId].clone();
    this.zRotationBase = 0;

    if (
      fuseball.inState(EnemyFuseball.STATE_SWITCHING_LANE) ||
      fuseball.inState(EnemyFuseball.STATE_EXPLODING)
    ) {
      if (fuseball.isFlagSet(EnemyFuseball.FLAG_SWITCHING_LANE_CCW)) {
        this.setLaneOffset(1 - fuseball.lastLaneSwitchingProgress);
      } else {
        this.setLaneOffset(fuseball.lastLaneSwitchingProgress);
      }
    } else {
      this.setLaneOffset(0);
    }

    if (fuseball.inState(EnemyFuseball.STATE_EXPLODING)) {
      this.explodeAnimation();

    } else if (fuseball.inState(EnemyFuseball.STATE_DISAPPEARING)) {
      this.disappearingAnimation();

    } else {
      this.zRotationOffset += EnemyFuseballRenderer.ROTATION_SPEED;
      this._animateVariantEffects();
    }
  }

  // Animate whichever variant effect is active this frame.
  // Only one variant flag can be true at a time, so at most one branch runs.
  _animateVariantEffects () {
    const t = performance.now();

    // ── Gravity: 4 orange arcs orbit counter-clockwise ────────────────────
    if (this._gravityOrbit && this._gravityOrbit.visible) {
      this._gravityOrbit.rotation.z -= 0.024;
    }

    // ── Supernova: 3 rings on different axes, whole group pulses ──────────
    if (this._supernovaRings && this._supernovaRings.visible) {
      const [r0, r1, r2] = this._supernovaRings.children;
      if (r0) r0.rotation.z += 0.020;
      if (r1) r1.rotation.x += 0.015;
      if (r2) r2.rotation.y += 0.018;
      this._supernovaRings.scale.setScalar(1.0 + 0.13 * Math.sin(t / 500));
    }

    // ── Void: dashed violet halo + opacity-driven phase strobe ───────────
    if (this._voidHalo && this._voidHalo.visible) {
      if (this.object.isPhasing) {
        // Rapid counter-clockwise spin, halo expands, model strobes
        this._voidHalo.rotation.z -= 0.07;
        this._voidHalo.scale.setScalar(1.25 + 0.08 * Math.sin(t / 60));
        this._voidHalo.children.forEach(seg => {
          if (seg.material) seg.material.opacity = 0.7 + 0.3 * Math.abs(Math.sin(t / 80));
        });
        // Strobe the model — rapid flicker between near-invisible and half-visible
        if (this.modelGroup) {
          const flicker = 0.08 + 0.55 * Math.abs(Math.sin(t / 75));
          this.modelGroup.children.forEach(child => {
            if (child.material) child.material.opacity = flicker;
          });
        }
      } else {
        // Slow drift, halo at normal scale, model at reduced baseline opacity
        this._voidHalo.rotation.z -= 0.016;
        this._voidHalo.scale.setScalar(1.0);
        this._voidHalo.children.forEach(seg => {
          if (seg.material) seg.material.opacity = 0.35 + 0.1 * Math.sin(t / 900);
        });
        if (this.modelGroup) {
          this.modelGroup.children.forEach(child => {
            if (child.material) child.material.opacity = 0.75;
          });
        }
      }
    }
  }

  // ── Effect geometry builders ───────────────────────────────────────────────

  // Gravity: 4 short curved arcs arranged in a ring, each oriented tangent
  // to the orbit — suggests material being pulled inward.
  _buildGravityOrbit () {
    const group      = new Group();
    const orbitRadius = 0.50;
    const arcSpan    = Math.PI * 0.65;

    for (let i = 0; i < 4; i++) {
      const baseAngle = (i / 4) * Math.PI * 2;
      const pts       = [];
      for (let j = 0; j <= 10; j++) {
        const a = (j / 10) * arcSpan - arcSpan / 2;
        pts.push(new Vector3(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0));
      }
      const arc = new Line(
        new BufferGeometry().setFromPoints(pts),
        new MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.8 })
      );
      arc.position.set(
        Math.cos(baseAngle) * orbitRadius,
        Math.sin(baseAngle) * orbitRadius,
        0
      );
      arc.rotation.z = baseAngle + Math.PI / 2;
      group.add(arc);
    }
    return group;
  }

  // Supernova: 3 rings on orthogonal-ish axes that each spin independently.
  // Gyroscope / atomic-model look — unstable contained energy.
  _buildSupernovaRings () {
    const group  = new Group();
    const radius = 0.60;
    const configs = [
      { color: 0x88ddff, rx: 0,           ry: 0,           rz: 0 },
      { color: 0x88ddff, rx: Math.PI / 2, ry: 0,           rz: 0 },
      { color: 0x88ddff, rx: 0,           ry: Math.PI / 3, rz: 0 },
    ];
    configs.forEach(({ color, rx, ry, rz }) => {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        pts.push(new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      }
      const ring = new Line(
        new BufferGeometry().setFromPoints(pts),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      ring.rotation.set(rx, ry, rz);
      group.add(ring);
    });
    return group;
  }

  // Void: 6 short dashed arcs arranged in a loose hexagonal ring.
  // Distinct from Gravity's solid arcs (shorter, dashed, different count)
  // and from Supernova's continuous rings (broken, not orbital spheres).
  _buildVoidHalo () {
    const group      = new Group();
    const orbitRadius = 0.58;
    const dashCount  = 6;
    const dashSpan   = Math.PI * 0.30;   // Arc length of each dash in radians

    for (let i = 0; i < dashCount; i++) {
      const centerAngle = (i / dashCount) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const a = centerAngle + (j / 8) * dashSpan - dashSpan / 2;
        pts.push(new Vector3(Math.cos(a) * orbitRadius, Math.sin(a) * orbitRadius, 0));
      }
      const dash = new Line(
        new BufferGeometry().setFromPoints(pts),
        new MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.35 })
      );
      group.add(dash);
    }
    return group;
  }
}
