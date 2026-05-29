import { Vector2, Vector3, Box2 } from 'three';

export default class Surface {
  // Removed legacy @readonly decorator for Vite compatibility
  static LINES_AMOUNT = 16;

  // Modern ES class fields replacing JSDoc @var
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
  zOffset;

  constructor (id, name, isOpen, lanesCoords, zOffset = 0) {
    this.id = id;
    this.name = name;
    this.isOpen = isOpen;
    this.rawLanesCoords = lanesCoords;
	
	if (!this.rawLanesCoords || !this.rawLanesCoords.length) {
        console.error("Surface constructor received empty coords for:", name);
    }
	
    this.zOffset = zOffset;
    this.lanesAmount = lanesCoords.length - (isOpen ? 1 : 0);
    this.activeLaneId = 0;
    this.depth = 20;

    this.shortedLanes = new Array(this.lanesAmount).fill(0);

    this.calculateCenteredLanesCoords(); 
    this.calculateLanesCenterCoords();
    this.calculateLanesCenterDirection();
}

  /**
   * Returns the 3D world position for a given lane and depth.
   * Mirrors the positioning logic used by SurfaceObjectWrapper.
   * @param {number} laneId
   * @param {number} depth  - 0 (rim) to 1 (back of tube)
   * @returns {THREE.Vector3|null}
   */
  lanePositionAt (laneId, depth) {
    if (laneId < 0 || laneId >= this.lanesAmount) return null;
    const mid = this.lanesMiddleCoords[laneId];

    if (!mid) {
        console.error(`SURFACE ERROR: laneId ${laneId} is out of bounds or missing!`, 
                      { laneId, lanesAmount: this.lanesAmount, length: this.lanesMiddleCoords.length });
        return null;
    }
    
    return new Vector3(mid.x, mid.y, depth * this.depth);
}

  calculateCenteredLanesCoords () {
    // Replaced BoundingBox2 with native Three.js Box2
    let box = new Box2().setFromPoints(this.rawLanesCoords);
    let center = new Vector2();
    box.getCenter(center);

    // .clone() ensures we don't accidentally mutate the original raw coordinates
    this.lanesCoords = this.rawLanesCoords.map(vector2 => vector2.clone().sub(center));
  }

  calculateLanesCenterCoords () {
    this.lanesMiddleCoords = [];

	if (!this.lanesCoords || this.lanesCoords.length === 0) {
        console.error("Surface: Cannot calculate center coords, lanesCoords is empty!");
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

  calculateLanesCenterDirection () {
    this.lanesCenterDirectionRadians = [];

    this.lanesMiddleCoords.forEach((center, i) => {
      let angleVector = this.lanesCoords[i].clone();
      let axis = center.clone();

      angleVector.sub(axis).normalize();

      this.lanesCenterDirectionRadians.push(angleVector.angle());
    });
  }

  getActualLaneIdFromProjectedMovement (projectedLaneId) {
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

  getShortestPathDirection (fromLaneId, toLaneId) {
    if (fromLaneId === toLaneId) {
      return 0;
    }

    if (this.isOpen) {
      return (toLaneId - fromLaneId) > 0 ? 1 : -1;
    } else {
      let isDiffPositive = (toLaneId - fromLaneId) > 0;
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

  setActiveLane (desiredActiveLane) {
    this.activeLaneId = this.getActualLaneIdFromProjectedMovement(desiredActiveLane);
  }

  shortLane (laneId) {
    this.shortedLanes[laneId]++;
  }

  unshortLane (laneId) {
    this.shortedLanes[laneId]--;
  }

  isLaneShorted (laneId) {
    return this.shortedLanes[laneId] > 0;
  }

  static fromDataset (dataset) {
    return dataset.map(data =>
      new Surface(
        data.id,
        data.name,
        data.isOpen,
        data.coords.map(coords =>
          new Vector2(coords.x, coords.y)
        ),
        data.zOffset
      )
    );
  }
}