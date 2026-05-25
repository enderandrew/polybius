import ObjectIdManager from '@/Helpers/UniqueIdFactory';
import State from '@/Object/State';

export default class SurfaceObject {
  // Removed legacy @readonly decorators
  static TYPE_SHOOTER = 'shooter';
  static TYPE_PULSAR = 'pulsar';
  static TYPE_SPIKER = 'spiker';
  static TYPE_SPIKE = 'spike';
  static TYPE_FLIPPER_TANKER = 'flipperTanker';
  static TYPE_FUSEBALL_TANKER = 'fuseballTanker';
  static TYPE_PULSAR_TANKER = 'pulsarTanker';
  static TYPE_FLIPPER = 'flipper';
  static TYPE_FUSEBALL = 'fuseball';
  static TYPE_PROJECTILE = 'projectile';

  // Modern ES class fields replacing JSDoc @var comments
  surface;
  objectId;
  laneId = 0;
  prevLaneId = -1;
  laneChangeMapsNeedUpdate = true;
  type;
  alive = true;
  hittable = true;
  canExplode = true;
  zPosition = 0;
  zSpeed = 0;
  state = new State(0);
  prevState = new State(0);
  lastStateChange;
  flags = 0;

  /**
   * @param {Surface} surface
   * @param {number} laneId
   * @param {string} type
   */
  constructor (surface, laneId, type) {
    this.surface = surface;
    this.laneId = this.surface.getActualLaneIdFromProjectedMovement(laneId);
    this.type = type;
    this.objectId = ObjectIdManager.getNewId();
  }

  update () {
    throw new Error('Method \'update()\' must be implemented.');
  }

  die () {
    throw new Error('Method \'die()\' must be implemented.');
  }

  hitByProjectile () {
    this.die();
  }

  disappear () {
    throw new Error('Method \'disappear()\' must be implemented.');
  }

  /**
   * @param {number} laneId
   */
  setLane (laneId) {
    this.prevLaneId = this.laneId;
    this.laneId = this.surface.getActualLaneIdFromProjectedMovement(laneId);
    this.laneChangeMapsNeedUpdate = true;
  }

  /**
   * @return {boolean}
   */
  shouldUpdateFIFOMaps () {
    if (!this.laneChangeMapsNeedUpdate) {
      return false;
    }

    this.laneChangeMapsNeedUpdate = false;
    return this.laneId !== this.prevLaneId;
  }

  /** @param {State} state */
  setState (state) {
    this.prevState = this.state;
    this.state = state;
    this.lastStateChange = Date.now();
  }

  /**
   * @return {number}
   */
  timeSinceLastStateChange () {
    return Date.now() - this.lastStateChange;
  }

  /**
   * @return {number} 0 - 100%
   */
  stateProgressInTime () {
    let timeSienceLastStateChange = this.timeSinceLastStateChange();

    if (timeSienceLastStateChange >= this.state.duration) {
      return 1;
    } else {
      return timeSienceLastStateChange / this.state.duration;
    }
  }

  /**
   * @return {boolean}
   */
  canChangeState () {
    return this.timeSinceLastStateChange() > this.state.duration;
  }

  /**
   * @param {State} state
   * @return {boolean}
   */
  inState (state) {
    return this.state.equals(state);
  }

  /**
   * @param {State} state
   * @return {boolean}
   */
  prevInState (state) {
    return this.prevState.equals(state);
  }

  /**
   * @param {number} flag
   */
  setFlag (flag) {
    this.flags |= flag;
  }

  /**
   * @param {number} flag
   */
  unsetFlag (flag) {
    this.flags &= ~flag;
  }

  clearFlags () {
    this.flags = 0;
  }

  /**
   * @param {number} flag
   * @return {boolean}
   */
  isFlagSet (flag) {
    return (this.flags & flag) > 0;
  }

  /**
   * @param {number} flag
   * @return {boolean}
   */
  isFlagNotSet (flag) {
    return !this.isFlagSet(flag);
  }
}