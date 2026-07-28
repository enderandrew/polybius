/**
 * DashTrailRenderer.js
 *
 * Draws a fading afterimage along the lanes a Phase Dash crossed.
 *
 * Because the dash is an instant teleport rather than a movement over time,
 * there is no motion to motion-blur — the ship simply is somewhere else next
 * frame. Drawing the path it skipped is what communicates "you went through
 * there" and, importantly, shows the player exactly which lanes were damaged.
 *
 * ── Allocation ───────────────────────────────────────────────────────────────
 *
 * Geometry is allocated ONCE at construction, sized for the longest possible
 * dash, and rewritten in place per dash by editing the position buffer. Nothing
 * is created or thrown away while playing, so this can't contribute to the GPU
 * churn that the per-level renderers were already guilty of. dispose() releases
 * the single geometry/material pair.
 */

import {
  BufferGeometry,
  BufferAttribute,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three';
import Shooter from '@/Object/Shooters/Shooter';

export default class DashTrailRenderer extends Line {
  static COLOR = 0x00e5ff;

  /** Trail sits slightly proud of the rim so it isn't z-fought by the lanes. */
  static Z_LIFT = 0.02;

  constructor(surface) {
    // +1 because the path covers the origin lane plus every lane stepped into.
    const maxPoints = Shooter.PHASE_DASH_LANES + 2;

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(maxPoints * 3), 3),
    );
    geometry.setDrawRange(0, 0);

    const material = new LineBasicMaterial({
      color: DashTrailRenderer.COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    super(geometry, material);

    this.surface = surface;
    this.maxPoints = maxPoints;
    this._scratch = new Vector3();
    this.visible = false;
  }

  /**
   * @param {Shooter} shooter
   */
  update(shooter) {
    if (!shooter) {
      this.visible = false;
      return;
    }

    const remaining = shooter.dashTrailUntil - Date.now();
    const path = shooter.dashTrailPath;

    if (remaining <= 0 || !path || path.length === 0) {
      this.visible = false;
      this.geometry.setDrawRange(0, 0);
      return;
    }

    this._writePath(path);

    // Linear fade across the i-frame window, so the trail vanishing is also
    // the tell that the player is tangible again.
    const progress = remaining / Shooter.PHASE_DASH_IFRAME_MS;
    this.material.opacity = Math.max(0, Math.min(1, progress)) * 0.85;
    this.visible = true;
  }

  /**
   * @param {number[]} path
   */
  _writePath(path) {
    const positions = this.geometry.getAttribute('position');
    const depth = this.surface.depth;
    let written = 0;

    for (let i = 0; i < path.length && written < this.maxPoints; i++) {
      const mid = this.surface.lanesMiddleCoords[path[i]];
      if (!mid) continue;

      positions.setXYZ(written, mid.x, mid.y, DashTrailRenderer.Z_LIFT * depth);
      written++;
    }

    positions.needsUpdate = true;
    this.geometry.setDrawRange(0, written);
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
