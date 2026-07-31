export default class FIFOManager {
  static GARBAGE_COLLECTION_TIMEOUT_MS = 200;

  lastGarbageCollectorExecutionTimestamp = 0;
  forceMapsUpdate = false;

  /**
   * @return {boolean}
   */
  shouldTriggerGarbageCollector() {
    let now = Date.now();

    if (
      now - this.lastGarbageCollectorExecutionTimestamp <
      FIFOManager.GARBAGE_COLLECTION_TIMEOUT_MS
    ) {
      return false;
    }

    this.lastGarbageCollectorExecutionTimestamp = now;
    return true;
  }

  /**
   * @param {Object[]} objects
   * @return {number}
   */
  static garbageCollector(objects) {
    if (objects.length === 0) {
      return 0;
    }

    let indexOfAliveObject = objects.findIndex((object) => object.alive);

    if (indexOfAliveObject === 0) {
      return 0;
    }

    if (indexOfAliveObject === -1) {
      let temp = objects.length;
      objects.length = 0;
      return temp;
    } else {
      objects.splice(0, indexOfAliveObject);
      return indexOfAliveObject;
    }
  }

  /**
   * @param {SurfaceObject[]} objects
   * @param {array} map
   * @param {boolean} forceUpdate
   * @return {boolean}
   */
  static updateMap(objects, map, forceUpdate) {
    // A plain loop, not objects.filter(...).length. shouldUpdateFIFOMaps()
    // has a required side effect — it clears laneChangeMapsNeedUpdate on the
    // object it's called on — so every object must actually be visited.
    // .filter() was already correct on that count (it never short-circuits),
    // but it also allocates a throwaway array every call purely to read its
    // .length, and this runs up to 4 times per frame. .some() would be the
    // obvious "just want a boolean" fix and would be WRONG here: it stops at
    // the first true, leaving every object after that one with its flag
    // still set, so a later frame could see a stale "needs update" that
    // should have already been cleared. This loop gets both properties at
    // once: no short-circuit, no allocation.
    let needsUpdate = forceUpdate;
    for (const object of objects) {
      if (object.shouldUpdateFIFOMaps()) {
        needsUpdate = true;
      }
    }

    if (!needsUpdate) {
      return false;
    }

    map.forEach((lane) => (lane.length = 0));
    objects.forEach((object) => {
      map[object.laneId].push(object);
    });

    return true;
  }
}
