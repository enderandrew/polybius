/**
 * EnemyMirrorRenderer.js
 *
 * Renders EnemyMirror as a silver hexagonal mirror.
 *
 * Geometry is loaded from the 'mirror' entry in Enemies.js (pointy-top hex
 * with 6 gradient spokes — no loadModel() override needed).
 *
 * ── Visual states ─────────────────────────────────────────────────────────
 *
 *   STATE_IDLE approaching  Slow rotation, full silver/white colors.
 *   STATE_IDLE parked       Same, but no z movement (handled by entity).
 *   STATE_REFLECTING        Brief bright-white flash (0–20% of window),
 *                           then fast opacity strobe showing vulnerability.
 *                           Colors restore to silver on exit.
 *   STATE_EXPLODING         Standard explodeAnimation().
 *   STATE_DISAPPEARING      Standard disappearingAnimation().
 *
 * ── Color restore ─────────────────────────────────────────────────────────
 *
 * During STATE_REFLECTING, material colors are overridden to white.
 * Each frame outside that state, colors are restored from
 * child.material.userData.originalColor (set by EnemyRenderer.loadModel()).
 * This handles pool reuse correctly — a renderer reassigned from Mirror to
 * another enemy gets its colors reset via setObjectRef() → setVisualsToNormal().
 */

import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import EnemyMirror from '@/Object/Enemies/EnemyMirror';

export default class EnemyMirrorRenderer extends EnemyRenderer {
  static ROTATION_SPEED = 0.018; // Slower than Spiker — deliberate, menacing

  constructor(enemy, surface) {
    super(enemy, surface, Enemy.TYPE_MIRROR);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  updateState() {
    if (!this.object || typeof this.object.inState !== 'function') {
      return;
    }

    const mirror = this.object;

    this.positionBase.copy(this.surface.lanesMiddleCoords[mirror.laneId]);
    this.zRotationBase =
      this.surface.lanesCenterDirectionRadians[mirror.laneId];

    if (mirror.inState(EnemyMirror.STATE_EXPLODING)) {
      this.explodeAnimation();
    } else if (mirror.inState(EnemyMirror.STATE_DISAPPEARING)) {
      this.disappearingAnimation();
    } else {
      this.zRotationOffset += EnemyMirrorRenderer.ROTATION_SPEED;
      this._animateMirror();
    }
  }

  _animateMirror() {
    if (!this.modelGroup) return;

    const mirror = this.object;
    const t = performance.now();
    const children = this.modelGroup.children;

    if (mirror.inState(EnemyMirror.STATE_REFLECTING)) {
      const progress = mirror.stateProgressInTime(); // 0 → 1 over 400ms

      if (progress < 0.2) {
        // ── Initial impact flash (0–80ms) ──────────────────────────────────
        // Bright white burst that rapidly fades — the "hit" moment.
        const intensity = 1 - progress / 0.2;
        children.forEach((child) => {
          if (!child.material) return;
          child.material.color.setRGB(1, 1, 1);
          child.material.opacity = 0.5 + 0.5 * intensity;
        });
      } else {
        // ── Vulnerability strobe (80–400ms) ─────────────────────────────────
        // Fast, irregular pulse — signals "shoot me NOW."
        const strobe = Math.abs(Math.sin(t / 70));
        children.forEach((child) => {
          if (!child.material) return;
          child.material.color.setRGB(
            0.7 + 0.3 * strobe,
            0.7 + 0.3 * strobe,
            0.7 + 0.3 * strobe,
          );
          child.material.opacity = 0.45 + 0.55 * strobe;
        });
      }
    } else {
      // ── Normal idle / approaching ────────────────────────────────────────
      // Restore original silver/white colors every frame.
      // This also handles recovery after the REFLECTING window expires without
      // a relying on a one-shot "reset" call.
      children.forEach((child) => {
        if (!child.material) return;
        if (child.material.userData.originalColor !== undefined) {
          child.material.color.setHex(child.material.userData.originalColor);
        }
        child.material.opacity = 1.0;
      });
    }
  }
}
