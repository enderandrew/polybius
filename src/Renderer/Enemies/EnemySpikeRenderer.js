import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import Enemy from '@/Object/Enemies/Enemy';
import { BufferGeometry, Line, MeshBasicMaterial, Vector3 } from 'three';

export default class EnemySpikeRenderer extends EnemyRenderer {
  static SPIKE_COLOR = 0x00ff00;

  /**
   * @param {EnemySpike} enemySpike
   * @param {Surface} surface
   */
  constructor(enemySpike, surface) {
    super(enemySpike, surface, Enemy.TYPE_SPIKE);
  }

  // ── Pool reuse ─────────────────────────────────────────────────────────────
  //
  // EnemyRendererManager reuses renderers from an availability pool when a new
  // spike of the same type is spawned.  setObjectRef is called with the new spike
  // object.  We must update the material opacity here, otherwise a phantom spike
  // renderer reused for a normal spike (or vice versa) would show the wrong
  // opacity for its lifetime.

  setObjectRef(object) {
    super.setObjectRef(object);
    this._applyPhantomOpacity();
  }

  // ── State update ───────────────────────────────────────────────────────────

  updateState() {
    if (this.object.shouldRerenderSpikeDueToSpikeLengthChange()) {
      this.updateModel();
    }

    this.positionBase.copy(this.surface.lanesMiddleCoords[this.object.laneId]);
    this.zRotationBase =
      this.surface.lanesCenterDirectionRadians[this.object.laneId];
  }

  updateModel() {
    this.children[0].geometry = new BufferGeometry().setFromPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 0, (1 - this.object.zPosition) * this.surface.depth),
    ]);
    // Geometry changed but material is the same object — opacity is preserved.
  }

  // ── Model construction ─────────────────────────────────────────────────────

  loadModel() {
    this.clear();
    this.geometry = [];
    this.materials = [];

    // Always create with transparent enabled.  Opacity is set by
    // _applyPhantomOpacity() so that pool reuse after setObjectRef
    // also applies the correct value.
    this.materials.push(
      new MeshBasicMaterial({
        color: EnemySpikeRenderer.SPIKE_COLOR,
        transparent: true,
        opacity: 1.0, // _applyPhantomOpacity corrects this after construction
      }),
    );

    this.geometry.push(
      new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        new Vector3(0, 0, (1 - this.object.zPosition) * this.surface.depth),
      ]),
    );

    this.add(new Line(this.geometry[0], this.materials[0]));

    // Apply correct opacity now that the material exists.
    // (The object reference is already set by the time loadModel is called
    // from SurfaceObjectWrapper's constructor.)
    this._applyPhantomOpacity();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _applyPhantomOpacity() {
    if (!this.materials || !this.materials[0]) return;

    const isPhantom = this.object && this.object.isPhantom;
    this.materials[0].opacity = isPhantom ? 0.08 : 1.0;
    this.materials[0].transparent = true; // Stays true — cheaper than toggling
  }
}
