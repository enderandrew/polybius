/**
 * EnemySpikerRenderer.js
 *
 * Renders EnemySpiker, EnemyPhantomSpiker, EnemyHydraSpiker,
 * EnemyOverdriveSpiker, and EnemyDemonHorn.
 *
 * Variant visual summary:
 *
 *   Normal        baseline — green, normal scale
 *   Phantom       28% opacity (handled by EnemyRenderer.setObjectRef isPhantom branch)
 *   Hydra         1.3× scale, amber counter-spinning fork (V shape = bifurcation)
 *   Overdrive     0.8× scale, electric-blue trailing streak lines, rapid flash
 *   Demon Horn    same geometry/type, routed here by EnemyRendererManager
 *
 * Effects are pre-built in loadModel() and toggled per-object in
 * _applyVariantVisuals(), called from both setObjectRef() and
 * setVisualsToNormal() to handle pool reuse correctly.
 */

import { BufferGeometry, Group, Line, MeshBasicMaterial, Vector3 } from 'three';
import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import EnemySpiker from '@/Object/Enemies/EnemySpiker';

export default class EnemySpikerRenderer extends EnemyRenderer {
  static ROTATION_SPEED = 0.1;

  /**
   * @param {EnemySpiker} enemy
   * @param {Surface}     surface
   * @param {string}      [type=Enemy.TYPE_SPIKER]
   *   Passed by EnemyRendererManager; TYPE_DEMON_HORN also routes here.
   *   Accepting it fixes the type-check error that would otherwise fire in
   *   EnemyRenderer.setObjectRef() for Demon Horn enemies.
   */
  constructor(enemy, surface, type = Enemy.TYPE_SPIKER) {
    super(enemy, surface, type);
  }

  // ── Model construction ─────────────────────────────────────────────────────

  loadModel() {
    super.loadModel(); // modelGroup, shieldMesh, explosionGroup from EnemyRenderer

    // Pre-build variant effect groups — hidden until _applyVariantVisuals() runs.
    // Built once per renderer instance, toggled on setObjectRef for pool reuse.
    this._hydraForks = this._buildHydraForks();
    this._overdriveStreaks = this._buildOverdriveStreaks();

    this._hydraForks.visible = false;
    this._overdriveStreaks.visible = false;

    this.add(this._hydraForks);
    this.add(this._overdriveStreaks);
  }

  // ── Object assignment ──────────────────────────────────────────────────────

  setObjectRef(object) {
    super.setObjectRef(object);
    this._applyVariantVisuals();
  }

  // Called by EnemyRenderer after explosion animations complete.
  // Must re-apply variant scale — super resets modelGroup scale to 1,1,1.
  setVisualsToNormal() {
    super.setVisualsToNormal();
    this._applyVariantVisuals();
  }

  _applyVariantVisuals() {
    if (!this.object) return;

    // Toggle effect groups — only one flag can be set at a time
    if (this._hydraForks) this._hydraForks.visible = !!this.object.isHydra;
    if (this._overdriveStreaks)
      this._overdriveStreaks.visible = !!this.object.isOverdrive;

    // Scale communicates the variant's "feel" at a glance
    if (this.modelGroup) {
      const s = this.object.isHydra
        ? 1.3 // Larger — boss presence
        : this.object.isOverdrive
          ? 0.8 // Smaller — dart-like, fast
          : 1.0;
      this.modelGroup.scale.setScalar(s);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  updateState() {
    if (!this.object || typeof this.object.inState !== 'function') {
      return;
    }
    this.positionBase.copy(this.surface.lanesMiddleCoords[this.object.laneId]);
    this.zRotationBase =
      this.surface.lanesCenterDirectionRadians[this.object.laneId];

    if (this.object.inState(EnemySpiker.STATE_EXPLODING)) {
      this._hideEffects();
      this.explodeAnimation();
    } else if (this.object.inState(EnemySpiker.STATE_DISAPPEARING)) {
      this._hideEffects();
      this.disappearingAnimation();
    } else {
      this.zRotationOffset += EnemySpikerRenderer.ROTATION_SPEED;
      this._animateVariantEffects();
    }
  }

  _animateVariantEffects() {
    const t = performance.now();

    // ── Hydra: amber fork counter-rotates, slow pulse ─────────────────────
    if (this._hydraForks && this._hydraForks.visible) {
      this._hydraForks.rotation.z -= 0.018;
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(t / 700));
      this._hydraForks.children.forEach((line) => {
        if (line.material) line.material.opacity = pulse;
      });
    }

    // ── Overdrive: streaks flash rapidly, suggesting kinetic blur ─────────
    if (this._overdriveStreaks && this._overdriveStreaks.visible) {
      // Fast irregular flash — not perfectly periodic so it feels kinetic
      const flash =
        0.25 + 0.75 * Math.abs(Math.sin(t / 90 + Math.sin(t / 40) * 0.8));
      this._overdriveStreaks.children.forEach((line) => {
        if (line.material) line.material.opacity = flash;
      });
    }
  }

  _hideEffects() {
    if (this._hydraForks) this._hydraForks.visible = false;
    if (this._overdriveStreaks) this._overdriveStreaks.visible = false;
  }

  // ── Effect geometry builders ───────────────────────────────────────────────

  /**
   * Hydra: amber V-fork extending above the model centre.
   * The bifurcating shape communicates "this splits" without explanation.
   * Counter-rotation in _animateVariantEffects() makes the prongs feel alive.
   *
   *     \   /   ← prong tips
   *      \ /
   *       |     ← stem
   *       ·     ← model origin
   */
  _buildHydraForks() {
    const group = new Group();
    const color = 0xffaa00; // Amber — warm, distinct from green Spiker
    const stemBase = 0.08;
    const stemTip = 0.22;
    const forkX = 0.36;
    const forkY = 0.52;

    // Central stem
    group.add(
      this._makeLine(
        new Vector3(0, stemBase, 0),
        new Vector3(0, stemTip, 0),
        color,
      ),
    );
    // Left prong
    group.add(
      this._makeLine(
        new Vector3(0, stemTip, 0),
        new Vector3(-forkX, forkY, 0),
        color,
      ),
    );
    // Right prong
    group.add(
      this._makeLine(
        new Vector3(0, stemTip, 0),
        new Vector3(forkX, forkY, 0),
        color,
      ),
    );

    return group;
  }

  /**
   * Overdrive: three short streak lines fanning behind the model along +Z.
   *
   * Since the renderer's position.z is set by move() to the enemy's depth
   * in the tube, positive local Z = deeper into tube = visually "behind" the
   * Spiker as it races toward the player.  The slight XY spread makes the
   * streaks look like a motion-blur fan rather than a single line.
   *
   *   · ← model origin (rim side)
   *   |\ \
   *   |  \ \   ← three streaks fanning back into the tube
   */
  _buildOverdriveStreaks() {
    const group = new Group();
    const color = 0x88eeff; // Electric cyan — kinetic, fast-feeling

    const streakConfigs = [
      { x: 0.0, y: 0.0, zNear: 0.12, zFar: 0.42 }, // Centre
      { x: 0.14, y: 0.08, zNear: 0.08, zFar: 0.32 }, // Right
      { x: -0.12, y: 0.06, zNear: 0.1, zFar: 0.36 }, // Left
    ];

    streakConfigs.forEach(({ x, y, zNear, zFar }) => {
      group.add(
        this._makeLine(
          new Vector3(x * 0.4, y * 0.4, zNear), // Bright end near model
          new Vector3(x, y, zFar), // Fading end deeper into tube
          color,
        ),
      );
    });

    return group;
  }

  // ── Shared geometry helper ─────────────────────────────────────────────────

  _makeLine(from, to, color) {
    return new Line(
      new BufferGeometry().setFromPoints([from, to]),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    );
  }
}
