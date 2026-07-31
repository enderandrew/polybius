import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import Surface from '@/Object/Surface/Surface';
import Angle from '@/utils/Angle';
import disposeObject3D from '@/utils/disposeObject3D';

export default class SurfaceRenderer extends Group {
  static WIREFRAME_LINE_WIDTH = 2;
  static ACTIVE_LANE_COLOR = 0xffff00;
  static DEFAULT_LANE_COLOR = [0x0000ff, 0xff0000, 0x00ff00];
  static SHORTED_LANE_COLOR = 0xffffff;
  static BURNING_LANE_COLOR = 0xff7a18;

  /** Subdivisions per lane line — the resolution of the ripple effect. */
  static RIPPLE_SEGMENTS = 12;

  type = 'Group';
  surface;
  level;
  connectorFrontDepth = 0;
  connectorBackDepth = 0;
  lanesLines = [];
  lanesConnectors = [];
  laneActiveMaterial;
  laneDefaultMaterial;
  laneShortedMaterial;
  laneBurningMaterial;

  /**
   * @constructor
   * @param {Surface} surface
   * @param {number} level
   */
  constructor(surface, level) {
    super();

    this.castShadow = false;

    this.level = level;
    this.setSurface(surface);
  }

  /**
   * @param {Surface} surface
   */
  setSurface(surface) {
    this.surface = surface;

    this.createLanes();
    this.update();
  }

  update() {
    let activeLaneId = this.surface.activeLaneId;

    //Normal lanes
    for (let i = 0; i < this.surface.lanesAmount; i++) {
      this.setLinesAppearance(i, this.laneDefaultMaterial);
      this.setConnectorsAppearance(i, this.laneDefaultMaterial);
    }

    //Active lane
    this.setConnectorsAppearance(activeLaneId, this.laneActiveMaterial);
    this.setLinesAppearance(activeLaneId, this.laneActiveMaterial);
    this.setLinesAppearance(activeLaneId + 1, this.laneActiveMaterial);

    //Shorted lanes
    let shortedLanesIds = this.surface.shortedLanes
      .map((shortedStrength, laneId) => (shortedStrength > 0 ? laneId : -1))
      .filter((laneId) => laneId !== -1);

    for (let i = 0; i < shortedLanesIds.length; i++) {
      let thisLaneId = shortedLanesIds[i];
      let prevShortedLaneId =
        i - 1 >= 0
          ? shortedLanesIds[i - 1]
          : shortedLanesIds[shortedLanesIds.length - 1];

      this.setConnectorsAppearance(thisLaneId, this.laneShortedMaterial, false);

      let hole = prevShortedLaneId + 1 === thisLaneId;
      this.setLinesAppearance(
        shortedLanesIds[i],
        this.laneShortedMaterial,
        !hole,
      );
      this.setLinesAppearance(
        shortedLanesIds[i] + 1,
        this.laneShortedMaterial,
        true,
      );
    }

    //Burning lanes (FIREWALL) — drawn last so they read clearly over the
    //default/active passes. Distinct colour from shorted lanes because the two
    //mean opposite things: white shorts hurt the player, orange burns hurt
    //enemies.
    for (let laneId = 0; laneId < this.surface.lanesAmount; laneId++) {
      if (!this.surface.isLaneBurning(laneId)) {
        continue;
      }

      this.setConnectorsAppearance(laneId, this.laneBurningMaterial, false);
      this.setLinesAppearance(laneId, this.laneBurningMaterial, true);
      this.setLinesAppearance(laneId + 1, this.laneBurningMaterial, true);
    }
  }

  /**
   * Start a bulge travelling down the tube from a given depth.
   *
   * @param {number} zNormalized 0 (rim) .. 1 (back)
   * @param {number} strength radial displacement scale
   */
  rippleFrom(zNormalized, strength = 0.35) {
    this._ripples ??= [];
    // Cap concurrent ripples; a grenade spam shouldn't turn the tube to soup.
    if (this._ripples.length >= 4) this._ripples.shift();
    this._ripples.push({
      z: zNormalized,
      strength,
      startedAt: performance.now(),
      durationMs: 700,
    });
  }

  /**
   * Rewrite lane vertex positions from their rest pose plus any active
   * ripples. Rest positions are recomputed rather than stored so this stays
   * correct if the surface is ever rebuilt.
   */
  updateRipples() {
    if (!this._ripples || this._ripples.length === 0) {
      if (this._rippleDirty) {
        this._writeLaneVertices(null);
        this._rippleDirty = false;
      }
      return;
    }

    const now = performance.now();
    this._ripples = this._ripples.filter(
      (r) => now - r.startedAt < r.durationMs,
    );

    this._writeLaneVertices(now);
    this._rippleDirty = true;
  }

  _writeLaneVertices(now) {
    const depth = this.surface.depth;

    for (let i = 0; i < this.lanesLines.length; i++) {
      const line = this.lanesLines[i];
      const coord = this.surface.lanesCoords[i];
      if (!coord) continue;

      const positions = line.geometry.getAttribute('position');

      for (let seg = 0; seg <= SurfaceRenderer.RIPPLE_SEGMENTS; seg++) {
        const t = seg / SurfaceRenderer.RIPPLE_SEGMENTS;
        let scale = 1;

        if (now !== null && this._ripples) {
          for (const r of this._ripples) {
            const progress = (now - r.startedAt) / r.durationMs;
            // The ripple's centre travels outward from its origin over time.
            const centre = r.z + progress * 0.9;
            const distance = Math.abs(t - centre);
            // Narrow gaussian-ish falloff, fading as the ripple ages.
            const falloff = Math.exp(-(distance * distance) / 0.004);
            scale += falloff * r.strength * (1 - progress);
          }
        }

        positions.setXYZ(seg, coord.x * scale, coord.y * scale, t * depth);
      }

      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  createLanes() {
    this.clear();

    this.connectorBackDepth = this.surface.depth;

    this.lanes = [];
    this.lanesLines = [];
    this.lanesConnectors = [];

    let surfaceColor = Math.floor(this.level / 16) % 3;

    this.laneDefaultMaterial = new LineBasicMaterial({
      color: SurfaceRenderer.DEFAULT_LANE_COLOR[surfaceColor],
    });
    this.laneActiveMaterial = new LineBasicMaterial({
      color: SurfaceRenderer.ACTIVE_LANE_COLOR,
    });
    this.laneShortedMaterial = new LineBasicMaterial({
      color: SurfaceRenderer.SHORTED_LANE_COLOR,
    });
    this.laneBurningMaterial = new LineBasicMaterial({
      color: SurfaceRenderer.BURNING_LANE_COLOR,
    });

    for (let i = 0; i < this.getAmountOfLanes(); i++) {
      let current = this.surface.lanesCoords[i];

      // Lane lines are subdivided into RIPPLE_SEGMENTS spans rather than a
      // single 2-vertex line. A 2-vertex line has no interior points, so a
      // travelling bulge would be geometrically impossible to express — there
      // is literally nothing between the endpoints to displace. The extra
      // vertices cost almost nothing (16 lanes x 13 verts) and are what make
      // rippleFrom() possible at all.
      let linePoints = [];
      for (let seg = 0; seg <= SurfaceRenderer.RIPPLE_SEGMENTS; seg++) {
        const t = seg / SurfaceRenderer.RIPPLE_SEGMENTS;
        linePoints.push(
          new Vector3(current.x, current.y, t * this.surface.depth),
        );
      }

      this.lanesLines.push(
        new Line(
          new BufferGeometry().setFromPoints(linePoints),
          this.laneDefaultMaterial,
        ),
      );
    }

    for (let i = 0; i < this.getAmountOfLanes(false); i++) {
      let current = this.surface.lanesCoords[i];
      let next = this.surface.lanesCoords[(i + 1) % Surface.LINES_AMOUNT];

      //Create connectors
      let connectorFrontPoints = [
        new Vector3(current.x, current.y, this.connectorFrontDepth),
        new Vector3(next.x, next.y, this.connectorFrontDepth),
      ];

      let connectorBackPoints = [
        new Vector3(current.x, current.y, this.connectorBackDepth),
        new Vector3(next.x, next.y, this.connectorBackDepth),
      ];

      this.lanesConnectors.push(
        new Line(
          new BufferGeometry().setFromPoints(connectorFrontPoints),
          this.laneDefaultMaterial,
        ),
        new Line(
          new BufferGeometry().setFromPoints(connectorBackPoints),
          this.laneDefaultMaterial,
        ),
      );
    }

    this.lanesLines.forEach((line) => this.add(line));
    this.lanesConnectors.forEach((connector) => this.add(connector));
    // this.createCenterIndicators();
  }

  createCenterIndicators() {
    const material = new MeshBasicMaterial({
      color: 0x00ff00,
    });

    this.surface.lanesMiddleCoords.forEach((center, i) => {
      let angle = this.surface.lanesCoords[i].clone();
      let axis = center.clone();

      angle.rotateAround(axis, Angle.toRadians(-90));

      let geometry = new BufferGeometry().setFromPoints([
        new Vector3(axis.x, axis.y, 0),
        new Vector3(angle.x, angle.y, 0),
      ]);

      this.add(new Line(geometry, material));
    });
  }

  /**
   * @param {number} connectorId
   * @param {LineBasicMaterial} material
   * @param {boolean} visible
   */
  setConnectorsAppearance(connectorId, material, visible = true) {
    connectorId %= this.surface.lanesAmount;

    this.lanesConnectors[connectorId * 2].material = material;
    this.lanesConnectors[connectorId * 2 + 1].material = material;

    this.lanesConnectors[connectorId * 2].visible = visible;
    this.lanesConnectors[connectorId * 2 + 1].visible = visible;
  }

  /**
   * @param {number} lineId
   * @param {LineBasicMaterial} material
   * @param {boolean} visible
   */
  setLinesAppearance(lineId, material, visible = true) {
    // Open surfaces have an extra boundary line (lanesAmount + 1),
    // so we don't want to wrap around using modulo.
    const maxIndex = this.lanesLines.length - 1;

    if (this.surface.isOpen) {
      if (lineId < 0 || lineId > maxIndex) return;
    } else {
      lineId =
        ((lineId % this.surface.lanesAmount) + this.surface.lanesAmount) %
        this.surface.lanesAmount;
    }

    if (this.lanesLines[lineId]) {
      this.lanesLines[lineId].material = material;
      this.lanesLines[lineId].visible = visible;
    }
  }

  /**
   * @return {boolean}
   */
  getAmountOfLanes(includeOpen = true) {
    return (
      this.surface.lanesAmount + (includeOpen && this.surface.isOpen ? 1 : 0)
    );
  }

  /**
   * SurfaceRenderer had no disposal path at all before this fix — measured at
   * 48 orphaned geometries per level (272 vertices) across a 10-level sample,
   * projecting to over 12,000 across a full 256-level run.
   *
   * The traversal catches every Line's geometry and whichever material it
   * currently has assigned. That is NOT sufficient on its own:
   * laneActiveMaterial / laneShortedMaterial / laneBurningMaterial are swapped
   * onto lines at runtime by setLinesAppearance(), so at the moment a level
   * ends there may be zero lines currently wearing the shorted or burning
   * material (nothing happened to be shorted right then) — a pure traversal
   * would silently skip disposing them. They're disposed explicitly here so
   * that possibility can't leak one either way.
   */
  dispose() {
    disposeObject3D(this);

    this.laneDefaultMaterial?.dispose();
    this.laneActiveMaterial?.dispose();
    this.laneShortedMaterial?.dispose();
    this.laneBurningMaterial?.dispose();

    this.clear();
  }
}
