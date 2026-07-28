import { Vector2, Vector3, Box2 } from 'three';

export default class Surface {
  static LINES_AMOUNT = 16;

  id;
  name;
  isOpen;
  lanesAmount;
  activeLaneId;
  depth;
  rawLanesCoords;
  lanesCoords;
  lanesMiddleCoords;
  lanesCenterDirectionRadians;
  shortedLanes;
  burningLanes;
  zOffset;

  constructor(id, name, isOpen, lanesCoords, zOffset = 0) {
    this.id = id;
    this.name = name;
    this.isOpen = isOpen;
    this.rawLanesCoords = lanesCoords;

    if (!this.rawLanesCoords || !this.rawLanesCoords.length) {
      console.error('Surface constructor received empty coords for:', name);
    }

    this.zOffset = zOffset;
    this.lanesAmount = lanesCoords.length - (isOpen ? 1 : 0);
    this.activeLaneId = 0;
    this.depth = 20;

    this.shortedLanes = new Array(this.lanesAmount).fill(0);

    // Firewall burns are tracked on their own channel rather than reusing
    // shortedLanes, because a Pulsar short is lethal to the PLAYER while a
    // Firewall burn is lethal to ENEMIES. Sharing one array would mean the
    // player's own Firewall electrocuted them.
    this.burningLanes = new Array(this.lanesAmount).fill(0);

    this.calculateCenteredLanesCoords();
    this.calculateLanesCenterCoords();
    this.calculateLanesCenterDirection();
  }

  /**
   * Returns the 3D world position for a given lane and depth.
   * Mirrors the positioning logic used by SurfaceObjectWrapper.
   * @param {number} laneId
   * @param {number} depth  - 0 (rim) to 1 (back of tube)
   * @param {THREE.Vector3} [targetVector] - Optional reusable vector to prevent allocation
   * @returns {THREE.Vector3|null}
   */
  lanePositionAt(laneId, depth, targetVector = new Vector3()) {
    if (laneId < 0 || laneId >= this.lanesAmount) return null;
    const mid = this.lanesMiddleCoords[laneId];

    if (!mid) {
      console.error(
        `SURFACE ERROR: laneId ${laneId} is out of bounds or missing!`,
        {
          laneId,
          lanesAmount: this.lanesAmount,
          length: this.lanesMiddleCoords.length,
        },
      );
      return null;
    }

    // Mutate the target vector instead of returning a new one
    return targetVector.set(mid.x, mid.y, depth * this.depth);
  }

  calculateCenteredLanesCoords() {
    let box = new Box2().setFromPoints(this.rawLanesCoords);
    let center = new Vector2();
    box.getCenter(center);

    // .clone() ensures we don't accidentally mutate the original raw coordinates
    this.lanesCoords = this.rawLanesCoords.map((vector2) =>
      vector2.clone().sub(center),
    );
  }

  calculateLanesCenterCoords() {
    this.lanesMiddleCoords = [];

    if (!this.lanesCoords || this.lanesCoords.length === 0) {
      console.error(
        'Surface: Cannot calculate center coords, lanesCoords is empty!',
      );
      return;
    }

    for (let i = 0; i < this.lanesAmount; i++) {
      let p1 = this.lanesCoords[i];
      let p2 = this.lanesCoords[(i + 1) % this.lanesCoords.length];

      // The center between two points is simply their average (midpoint).
      // This entirely removes the need to construct a BoundingBox just to find a center.
      let center = new Vector2().addVectors(p1, p2).multiplyScalar(0.5);
      this.lanesMiddleCoords.push(center);
    }
  }

  calculateLanesCenterDirection() {
    this.lanesCenterDirectionRadians = [];

    this.lanesMiddleCoords.forEach((center, i) => {
      let angleVector = this.lanesCoords[i].clone();
      let axis = center.clone();

      angleVector.sub(axis).normalize();

      this.lanesCenterDirectionRadians.push(angleVector.angle());
    });
  }

  getActualLaneIdFromProjectedMovement(projectedLaneId) {
    if (this.isOpen) {
      if (projectedLaneId < 0) {
        return 0;
      } else if (projectedLaneId >= this.lanesAmount) {
        return this.lanesAmount - 1;
      }
      return projectedLaneId;
    } else {
      projectedLaneId %= this.lanesAmount;

      if (projectedLaneId < 0) {
        projectedLaneId += this.lanesAmount;
      }

      return projectedLaneId;
    }
  }

  getShortestPathDirection(fromLaneId, toLaneId) {
    if (fromLaneId === toLaneId) {
      return 0;
    }

    if (this.isOpen) {
      return toLaneId - fromLaneId > 0 ? 1 : -1;
    } else {
      let isDiffPositive = toLaneId - fromLaneId > 0;
      let cwDistance, ccwDistance;

      if (isDiffPositive) {
        cwDistance = Math.abs(toLaneId - fromLaneId);
        ccwDistance = Math.abs(toLaneId - fromLaneId - this.lanesAmount);
      } else {
        cwDistance = Math.abs(toLaneId - fromLaneId + this.lanesAmount);
        ccwDistance = Math.abs(toLaneId - fromLaneId);
      }

      let isCwShortest = cwDistance <= ccwDistance;
      return isCwShortest ? 1 : -1;
    }
  }

  setActiveLane(desiredActiveLane) {
    this.activeLaneId =
      this.getActualLaneIdFromProjectedMovement(desiredActiveLane);
  }

  shortLane(laneId) {
    this.shortedLanes[laneId]++;
  }

  unshortLane(laneId) {
    this.shortedLanes[laneId]--;
  }

  isLaneShorted(laneId) {
    return this.shortedLanes[laneId] > 0;
  }

  /**
   * Counter-based like shortLane() so overlapping Firewall sources compose
   * correctly and each ignite is matched by exactly one extinguish.
   * @param {number} laneId
   */
  igniteLane(laneId) {
    if (laneId < 0 || laneId >= this.lanesAmount) return;
    this.burningLanes[laneId]++;
  }

  /** @param {number} laneId */
  extinguishLane(laneId) {
    if (laneId < 0 || laneId >= this.lanesAmount) return;
    if (this.burningLanes[laneId] > 0) this.burningLanes[laneId]--;
  }

  /** @param {number} laneId @return {boolean} */
  isLaneBurning(laneId) {
    return this.burningLanes[laneId] > 0;
  }

  /** Hard reset — used on level teardown so nothing survives into a new level. */
  extinguishAllLanes() {
    this.burningLanes.fill(0);
  }

  static fromDataset(dataset) {
    return dataset.map(
      (data) =>
        new Surface(
          data.id,
          data.name,
          data.isOpen,
          data.coords.map((coords) => new Vector2(coords.x, coords.y)),
          data.zOffset,
        ),
    );
  }

  /**
   * Calculates a target lane ID for projectiles and targeting.
   * Unlike movement functions, this does NOT clamp.
   * It returns null for out-of-bounds lanes on open surfaces.
   */
  getTargetLaneId(baseLaneId, offset) {
    const targetLane = baseLaneId + offset;

    if (this.isOpen) {
      // Strict boundary check: If it's off the edge, it goes into the void.
      if (targetLane < 0 || targetLane >= this.lanesAmount) {
        return null;
      }
      return targetLane;
    }

    // Closed surfaces wrap normally using standard modulo math
    const n = this.lanesAmount;
    return ((targetLane % n) + n) % n;
  }
}
