import { BufferGeometry, Group, Line, MeshBasicMaterial, Vector2, Vector3, Box2 } from 'three';
import enemies from '@/Assets/Enemies';
import explosions from '@/Assets/Explosions';

export default class SurfaceObjectWrapper extends Group {
  // Modern ES class fields replacing JSDoc @var comments
  object;
  surface;
  modelGroup;
  explosionGroup;
  objectType = null;

  constructor (object, surface, objectType) {
    super();

    this.surface = surface;
    this.objectType = objectType;
    this.setObjectRef(object);

    this.clear();
    this.loadModel();

    if (this.object.canExplode) {
      this.loadExplosion();
      this.setVisualsToNormal();
    }

    this.position.set(
      this.surface.lanesMiddleCoords[this.object.laneId].x,
      this.surface.lanesMiddleCoords[this.object.laneId].y,
      this.object.zPosition * this.surface.depth
    );

    this.rotation.z = this.surface.lanesCenterDirectionRadians[this.object.laneId];
  }

  update () {
    if (this.object === null) {
      return;
    }

    if (this.object.isDead) {
      this.disappearingAnimation();
      return;
    }

    if (this.object.isExploding) {
      this.explodeAnimation();
      return;
    }

    this.move();
    this.rotate();
    this.updateState();
  }

  setObjectRef (object) {
    this.object = object;
  }

  setVisualsToNormal () {
    throw new Error('Method \'setVisualsToNormal()\' must be implemented.');
  }

  disappearingAnimation () {
    throw new Error('Method \'disappearingAnimation()\' must be implemented.');
  }

  explodeAnimation () {
    throw new Error('Method \'explodeAnimation()\' must be implemented.');
  }

  setVisualsToExplode () {
    throw new Error('Method \'setVisualsToExplode()\' must be implemented.');
  }

  updateState () {
    throw new Error('Method \'updateState()\' must be implemented.');
  }

  move () {
    throw new Error('Method \'move()\' must be implemented.');
  }

  rotate () {
    throw new Error('Method \'rotate()\' must be implemented.');
  }

  loadModel () {
    throw new Error('Method \'loadModel()\' must be implemented.');
  }

  loadExplosion () {
    this.explosionGroup = new Group();
    this.explosionGroup.visible = false;

    let isEnemy = enemies.find(enemy => enemy.name === this.object.type) !== undefined;

    let explosionDataset = explosions.find(explosion => explosion.name === (isEnemy ? 'enemy' : 'player'));
    if (explosionDataset === undefined) {
      throw new Error('Unknown explosion: ' + this.object.type);
    }

    // 1. Flatten the raw coordinate objects
    let flatCoords = [].concat(...explosionDataset.coords);
    
    // 2. Convert raw points into Three.js Vector2 instances so Box2 can parse them
    let vectorPoints = flatCoords.map(p => new Vector2(p.x, p.y));

    // 3. Replaced BoundingBox2 with native Three.js Box2 and zero-allocation target vector extraction
    let boundingBox = new Box2().setFromPoints(vectorPoints);
    let center = new Vector2();
    boundingBox.getCenter(center);

    explosionDataset.coords.forEach((xyArray, i) => {
      let material = new MeshBasicMaterial({
          color: Array.isArray(explosionDataset.color) ? explosionDataset.color[i] : explosionDataset.color,
        }
      );

      let geometry = new BufferGeometry().setFromPoints(
        xyArray
          .map(xyArray => new Vector2(xyArray.x, xyArray.y))
          .map(vector2 => vector2.sub(center)) // Subtracted against the natively extracted center
          .map(vector2 => new Vector3(vector2.x, vector2.y, 0))
      );

      this.explosionGroup.add(new Line(geometry, material));
    });

    this.add(this.explosionGroup);
  }
}