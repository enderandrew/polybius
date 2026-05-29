import { BufferGeometry, Group, IcosahedronGeometry, Line, MeshBasicMaterial, Mesh, Vector2, Vector3, Box2, AdditiveBlending } from 'three';
import SurfaceObjectWrapper from '@/Renderer/Surface/SurfaceObjectWrapper';
import enemies from '@/Assets/Enemies';

export default class EnemyRenderer extends SurfaceObjectWrapper {
  // Removed legacy @readonly decorator
  static EXPLOSION_ROTATION_SPEED = 0.03;

  // Modern ES class fields replacing JSDoc @var comments
  geometry;
  materials;
  positionBase = new Vector2();
  positionOffset = new Vector2();
  zRotationBase = 0;
  zRotationOffset = 0;

  rotatingStateCache = {
    valid: false,
    continuousRotationUpdate: false,
    relativeHalfStep: 0,
    sourceLaneId: 0,
    targetLaneId: 0,
    rotationDirection: 0
  };

  constructor (enemy, surface, enemyType) {
    super(enemy, surface, enemyType);
    this.setLaneOffset();
  }

  setObjectRef (object) {
    if (object.type !== this.objectType) {
      throw new Error(`Can't associate ${object.type} with ${this.objectType} renderer`);
    }

    super.setObjectRef(object);
    
    if (this.modelGroup) {
        // Change the enemy's color to Red-Orange if they are strong
        const isStrong = this.object.isStrong;
        
        this.modelGroup.children.forEach(child => {
            if (isStrong) {
                child.material.color.setHex(0xff4400); 
            } else {
                // Safely revert to normal color using the data we stashed during loadModel()
                child.material.color.setHex(child.material.userData.originalColor);
            }
        });
    }
    
    this.setVisualsToNormal();
  }

  setVisualsToNormal () {
    // Only toggle visibility if the meshes have actually been loaded!
    if (this.explosionGroup && this.modelGroup) {
      this.explosionGroup.visible = false;
      this.modelGroup.visible = true;
	  this.modelGroup.scale.set(1, 1, 1);
    }
  }

  setVisualsToExplode () {
    if (this.explosionGroup && this.modelGroup) {
      this.explosionGroup.visible = true;
      this.modelGroup.visible = false;
    }
  }

  explodeAnimation () {
    this.setVisualsToExplode();
    this.zRotationOffset += EnemyRenderer.EXPLOSION_ROTATION_SPEED;

    let scale = Math.pow(this.object.stateProgressInTime() * 2 - 1, 4);
    let explosionScale = 1 - scale;
    this.explosionGroup.scale.set(explosionScale, explosionScale, explosionScale);

    if (this.object.stateProgressInTime() <= 0.5) {
      let modelScale = scale;
      this.modelGroup.scale.set(modelScale, modelScale, modelScale);
    } else {
      this.modelGroup.visible = false;
    }
  }

  disappearingAnimation () {
    let scale = Math.pow(this.object.stateProgressInTime() * 2 - 1, 4);

    if (this.object.stateProgressInTime() <= 0.5) {
      let modelScale = scale;
      this.modelGroup.scale.set(modelScale, modelScale, modelScale);
    } else {
      this.modelGroup.visible = false;
    }
  }

  move () {
    this.position.set(
      this.positionBase.x + this.positionOffset.x,
      this.positionBase.y + this.positionOffset.y,
      this.object.zPosition * this.surface.depth
    );
  }

  rotate () {
    this.rotation.z = this.zRotationBase + this.zRotationOffset;
    if (this.shieldMesh && this.object) {
        // Toggle visibility based on health state
        this.shieldMesh.visible = this.object.hasShield;
        
        if (this.shieldMesh.visible) {
            this.shieldMesh.rotation.x -= 0.05;
            this.shieldMesh.rotation.y += 0.02;
            this.shieldMesh.rotation.z -= 0.01;
        }
    }
  }

  setLaneOffset (offset = 0.5) {
    let laneCoords = this.surface.lanesCoords[this.object.laneId].clone();
    let laneCenterCoords = this.surface.lanesMiddleCoords[this.object.laneId].clone();

    let scalar = (offset - 0.5) * 2;
    laneCenterCoords.sub(laneCoords).multiplyScalar(scalar);

    this.positionOffset = laneCenterCoords;
  }

  calculateRotationStateCacheVariables (rotationDirection) {
    this.rotatingStateCache.rotationDirection = rotationDirection;

    this.rotatingStateCache.sourceLaneId = this.object.laneId;
    this.rotatingStateCache.targetLaneId = this.surface.getActualLaneIdFromProjectedMovement(
      this.object.laneId + this.rotatingStateCache.rotationDirection
    );

    let currentLaneRotation = this.surface.lanesCenterDirectionRadians[this.rotatingStateCache.sourceLaneId];
    let targetLaneRotation = this.surface.lanesCenterDirectionRadians[this.rotatingStateCache.targetLaneId];
    let targetRealRotation = (targetLaneRotation + Math.PI) % (Math.PI * 2);

    let relativeStep;
    if (this.rotatingStateCache.rotationDirection === 1) {
      if (currentLaneRotation > targetRealRotation) {
        relativeStep = currentLaneRotation - targetRealRotation;
      } else {
        relativeStep = currentLaneRotation + (Math.PI * 2 - targetRealRotation);
      }
    } else {
      if (currentLaneRotation > targetRealRotation) {
        relativeStep = (Math.PI * 2 - currentLaneRotation) + targetRealRotation;
      } else {
        relativeStep = targetRealRotation - currentLaneRotation;
      }
    }

    this.rotatingStateCache.relativeHalfStep = relativeStep / 2;
    this.rotatingStateCache.valid = true;
  }

  invalidateRotationStateCache () {
    this.rotatingStateCache.valid = false;
  }

  isRotationStateCacheValid () {
    return this.rotatingStateCache.valid;
  }

  loadModel () {
    this.modelGroup = new Group();

    let enemyDataset = enemies.find(enemy => enemy.name === this.object.type);
    if (enemyDataset === undefined) {
      throw new Error('Unknown object: ' + this.object.type);
    }

    let flatCoords = [].concat(...enemyDataset.coords);
    let vectorPoints = flatCoords.map(p => new Vector2(p.x, p.y));

    let boundingBox = new Box2().setFromPoints(vectorPoints);
    let center = new Vector2();
    boundingBox.getCenter(center);
    
    // Calculate the size of the enemy to properly scale the shield
    let size = new Vector2();
    boundingBox.getSize(size);
    let shieldRadius = Math.max(size.x, size.y) * 0.75; // 75% larger than the widest dimension

    enemyDataset.coords.forEach((xyArray, i) => {
      let originalColor = Array.isArray(enemyDataset.color) ? enemyDataset.color[i] : enemyDataset.color;
      let material = new MeshBasicMaterial({
          color: originalColor,
        }
      );
      // Save the original color so we can reset it when the enemy is pooled
      material.userData.originalColor = originalColor; 

      let geometry = new BufferGeometry().setFromPoints(
        xyArray
          .map(xyArray => new Vector2(xyArray.x, xyArray.y))
          .map(vector2 => vector2.sub(center))
          .map(vector2 => new Vector3(vector2.x, vector2.y, 0))
      );

      this.modelGroup.add(new Line(geometry, material));
    });

    // Create the dynamically sized, glowing shield
    const shieldGeo = new IcosahedronGeometry(shieldRadius, 0); 
    const shieldMat = new MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15,                 // Softer transparency
        blending: AdditiveBlending,    // Creates a glowing "energy" effect
        depthWrite: false              // Prevents weird clipping with the enemy lines
    });
    
    this.shieldMesh = new Mesh(shieldGeo, shieldMat);
    
    this.add(this.modelGroup);
    this.add(this.shieldMesh);
  }
}