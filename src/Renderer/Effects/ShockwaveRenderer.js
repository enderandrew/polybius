/**
 * ShockwaveRenderer.js
 *
 * Expanding rings that travel up the tube. Used for the Superzapper (a ring
 * that sweeps the whole surface from the rim outward) and grenade blasts.
 *
 * ── Why the Superzapper needed this ──────────────────────────────────────────
 *
 * SurfaceObjectsManager.handleSuperzapper() previously just called die() on
 * every enemy. Each enemy played its own death animation, but there was no
 * event tying them together — the screen simply emptied. For a once-per-life
 * panic button that is the single most dramatic input in the game, that's a
 * missed moment. The ring gives the kill a visible cause travelling outward
 * from the player.
 *
 * ── Geometry ─────────────────────────────────────────────────────────────────
 *
 * The ring is built from the surface's own lane midpoints rather than a
 * generic circle, so it hugs whatever silhouette the surface actually has —
 * a star-shaped surface gets a star-shaped shockwave. Vertex positions are
 * rewritten in place each frame from a fixed, pre-allocated buffer; nothing
 * is allocated after construction.
 */

import {
  BufferGeometry,
  BufferAttribute,
  LineLoop,
  Line,
  LineBasicMaterial,
} from 'three';

export default class ShockwaveRenderer {
  static POOL_SIZE = 3;
  static DEFAULT_DURATION_MS = 620;

  /**
   * @param {Surface} surface
   * @param {import('three').Object3D} parent
   */
  constructor(surface, parent) {
    this.surface = surface;
    this.parent = parent;
    this.slots = [];

    const points = surface.lanesMiddleCoords ?? [];
    this.pointCount = points.length;

    for (let i = 0; i < ShockwaveRenderer.POOL_SIZE; i++) {
      this.slots.push(this._createSlot());
    }
  }

  _createSlot() {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(Math.max(1, this.pointCount) * 3), 3),
    );

    const material = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    // Closed surfaces get a LineLoop so the ring joins; open surfaces would
    // otherwise draw a bogus segment bridging the gap.
    const line = this.surface.isOpen
      ? new Line(geometry, material)
      : new LineLoop(geometry, material);

    line.visible = false;
    line.renderOrder = 998;
    this.parent.add(line);

    return {
      geometry,
      material,
      line,
      active: false,
      startedAt: 0,
      durationMs: ShockwaveRenderer.DEFAULT_DURATION_MS,
      fromZ: 0,
      toZ: 1,
      scaleFrom: 1,
      scaleTo: 1,
    };
  }

  /**
   * @param {object} opts
   * @param {number} opts.fromZ  normalized tube depth to start at (0 = rim)
   * @param {number} opts.toZ    normalized tube depth to end at
   * @param {number} [opts.color]
   * @param {number} [opts.durationMs]
   * @param {number} [opts.scaleFrom]
   * @param {number} [opts.scaleTo]
   */
  spawn({
    fromZ = 0,
    toZ = 1,
    color = 0xffffff,
    durationMs = ShockwaveRenderer.DEFAULT_DURATION_MS,
    scaleFrom = 0.85,
    scaleTo = 1.25,
  } = {}) {
    if (this.pointCount === 0) return;

    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((oldest, s) =>
        s.startedAt < oldest.startedAt ? s : oldest,
      );
    }

    slot.material.color.setHex(color);
    slot.material.opacity = 1;
    slot.active = true;
    slot.startedAt = performance.now();
    slot.durationMs = durationMs;
    slot.fromZ = fromZ;
    slot.toZ = toZ;
    slot.scaleFrom = scaleFrom;
    slot.scaleTo = scaleTo;
    slot.line.visible = true;
  }

  update() {
    if (this.pointCount === 0) return;

    const now = performance.now();
    const mids = this.surface.lanesMiddleCoords;
    const depth = this.surface.depth;

    for (const slot of this.slots) {
      if (!slot.active) continue;

      const progress = Math.min(1, (now - slot.startedAt) / slot.durationMs);

      // Ease-out: bursts fast then decelerates, which reads as a release of
      // energy rather than a constant sweep.
      const eased = 1 - Math.pow(1 - progress, 3);

      const z = (slot.fromZ + (slot.toZ - slot.fromZ) * eased) * depth;
      const scale = slot.scaleFrom + (slot.scaleTo - slot.scaleFrom) * eased;

      const positions = slot.geometry.getAttribute('position');
      for (let i = 0; i < this.pointCount; i++) {
        const p = mids[i];
        positions.setXYZ(i, p.x * scale, p.y * scale, z);
      }
      positions.needsUpdate = true;
      slot.geometry.computeBoundingSphere();

      slot.material.opacity = 1 - progress;

      if (progress >= 1) {
        slot.active = false;
        slot.line.visible = false;
      }
    }
  }

  dispose() {
    for (const slot of this.slots) {
      this.parent.remove(slot.line);
      slot.geometry.dispose();
      slot.material.dispose();
    }
    this.slots = [];
  }
}
