import {
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  Line,
  MeshBasicMaterial,
  Mesh,
  Vector2,
  Vector3,
  Box2,
  AdditiveBlending,
} from 'three';
import SurfaceObjectWrapper from '@/Renderer/Surface/SurfaceObjectWrapper';
import enemies from '@/Assets/Enemies';
import Enemy from '@/Object/Enemies/Enemy';

const scratchVector = new Vector2();

const sharedGeometries = new Map();

export default class EnemyRenderer extends SurfaceObjectWrapper {
  static EXPLOSION_ROTATION_SPEED = 0.03;

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
    rotationDirection: 0,
  };

  constructor(enemy, surface, enemyType) {
    super(enemy, surface, enemyType);
    this.setLaneOffset();
  }

  setObjectRef(object) {
    let expectedType = object.type;
    if (object.isMutant) expectedType = 'mutant_flipper';
    if (object.isStealth) expectedType = 'stealth_flipper';
    if (object.isDemonHead) expectedType = 'demon_head';
    if (object.isDemonHorn) expectedType = 'demon_horn';

    if (expectedType !== this.objectType) {
      throw new Error(
        `Can't associate ${expectedType} with ${this.objectType} renderer`,
      );
    }

    super.setObjectRef(object);

    // --- GUARD: Only reset if the object is being recycled from the pool! ---
    // During the initial super() call, class fields are not initialized yet.
    if (this.positionOffset) {
      this.positionOffset.set(0, 0);
      this.zRotationOffset = 0;
      this.invalidateRotationStateCache();

      if (this.modelGroup) {
        this.modelGroup.scale.set(1, 1, 1);
        this.modelGroup.rotation.set(0, 0, 0);
      }

      // Recalculate lane offset for the new object's lane!
      this.setLaneOffset();
    }

    if (this.modelGroup) {
      const isStrong = this.object.isStrong;

      this.modelGroup.children.forEach((child) => {
        if (child.material) child.material.opacity = 1.0;

        // Always reset to the stored original first
        child.material.color.setHex(child.material.userData.originalColor);

        if (this.object.isGravity) {
          child.material.color.offsetHSL(-0.12, 0.25, 0.08); // Orange-red
        } else if (this.object.isSupernova) {
          child.material.color.offsetHSL(0.1, 0.15, 0.05); // Slight blue shift
        } else if (this.object.isVoid) {
          child.material.color.offsetHSL(0.22, 0.2, -0.08); // Purple, slightly darker
        } else if (this.object.isMega) {
          child.material.color.setHex(0xffff00); // Bright Yellow
        } else if (this.object.isInverse) {
          child.material.color.setHex(0x00ffff); // Cyan
        } else if (this.object.isChaos) {
          child.material.color.setHex(0xff00ff); // Magenta
        } else if (this.object.isPhantom) {
          // Tanker: more visible — the horror is what it releases, not the tanker itself
          // Spiker: near-invisible — finding the spike by dying is the horror
          const opacity =
            this.object.type === Enemy.TYPE_FLIPPER_TANKER ? 0.55 : 0.28;
          child.material.opacity = opacity;
          child.material.color.offsetHSL(0.18, 0.15, -0.05); // Purple-grey
        } else if (this.object.isBomb) {
          child.material.color.offsetHSL(-0.06, 0.35, 0.08); // Deep orange-red
        } else if (this.object.isHydra) {
          child.material.color.offsetHSL(-0.08, 0.3, 0.1); // Amber
        } else if (this.object.isOverdrive) {
          child.material.color.offsetHSL(0.15, 0.25, 0.18); // Electric blue-white
        } else if (isStrong) {
          child.material.color.offsetHSL(0.5, 0, 0);
        }
      });
    }
    this.setVisualsToNormal();
  }

  setVisualsToNormal() {
    // Only toggle visibility if the meshes have actually been loaded!
    if (this.explosionGroup && this.modelGroup) {
      this.explosionGroup.visible = false;
      this.modelGroup.visible = true;
      this.modelGroup.scale.set(1, 1, 1);
    }
  }

  setVisualsToExplode() {
    if (this.explosionGroup && this.modelGroup) {
      this.explosionGroup.visible = true;
      this.modelGroup.visible = false;
    }
  }

  explodeAnimation() {
    this.setVisualsToExplode();
    this.zRotationOffset += EnemyRenderer.EXPLOSION_ROTATION_SPEED;

    let scale = Math.pow(this.object.stateProgressInTime() * 2 - 1, 4);
    let explosionScale = 1 - scale;
    this.explosionGroup.scale.set(
      explosionScale,
      explosionScale,
      explosionScale,
    );

    if (this.object.stateProgressInTime() <= 0.5) {
      let modelScale = scale;
      this.modelGroup.scale.set(modelScale, modelScale, modelScale);
    } else {
      this.modelGroup.visible = false;
    }
  }

  disappearingAnimation() {
    let scale = Math.pow(this.object.stateProgressInTime() * 2 - 1, 4);

    if (this.object.stateProgressInTime() <= 0.5) {
      let modelScale = scale;
      this.modelGroup.scale.set(modelScale, modelScale, modelScale);
    } else {
      this.modelGroup.visible = false;
    }
  }

  move() {
    this.position.set(
      this.positionBase.x + this.positionOffset.x,
      this.positionBase.y + this.positionOffset.y,
      this.object.zPosition * this.surface.depth,
    );
  }

  rotate() {
    this.rotation.z = this.zRotationBase + this.zRotationOffset;

    if (this.object.isStealth && this.modelGroup) {
      this.modelGroup.children.forEach((child) => {
        if (child.material) child.material.opacity = this.object.opacity;
      });
    }

    // Bomb Tanker pulses with warning urgency while alive
    if (this.object.isBomb && this.modelGroup) {
      const pulse = 0.65 + 0.35 * Math.abs(Math.sin(performance.now() / 350));
      this.modelGroup.children.forEach((child) => {
        if (child.material) child.material.opacity = pulse;
      });
    }

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

  setLaneOffset(offset = 0.5) {
    const laneCoords = this.surface.lanesCoords[this.object.laneId];
    const laneCenterCoords = this.surface.lanesMiddleCoords[this.object.laneId];
    const scalar = (offset - 0.5) * 2;

    // Calculate delta offset across the lane width
    scratchVector
      .subVectors(laneCenterCoords, laneCoords)
      .multiplyScalar(scalar);

    // Copy ONLY the scalar offset delta, NOT the absolute lane position!
    this.positionOffset.copy(scratchVector);
  }

  calculateRotationStateCacheVariables(rotationDirection) {
    this.rotatingStateCache.rotationDirection = rotationDirection;

    this.rotatingStateCache.sourceLaneId = this.object.laneId;
    this.rotatingStateCache.targetLaneId =
      this.surface.getActualLaneIdFromProjectedMovement(
        this.object.laneId + this.rotatingStateCache.rotationDirection,
      );

    let currentLaneRotation =
      this.surface.lanesCenterDirectionRadians[
        this.rotatingStateCache.sourceLaneId
      ];
    let targetLaneRotation =
      this.surface.lanesCenterDirectionRadians[
        this.rotatingStateCache.targetLaneId
      ];
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
        relativeStep = Math.PI * 2 - currentLaneRotation + targetRealRotation;
      } else {
        relativeStep = targetRealRotation - currentLaneRotation;
      }
    }

    this.rotatingStateCache.relativeHalfStep = relativeStep / 2;
    this.rotatingStateCache.valid = true;
  }

  invalidateRotationStateCache() {
    this.rotatingStateCache.valid = false;
  }

  isRotationStateCacheValid() {
    return this.rotatingStateCache.valid;
  }

  loadModel() {
    this.modelGroup = new Group();

    let lookupType = this.object.type;
    if (this.object.isMutant) lookupType = 'mutant_flipper';
    if (this.object.isStealth) lookupType = 'stealth_flipper';
    if (this.object.isDemonHead) lookupType = 'demon_head';
    if (this.object.isDemonHorn) lookupType = 'demon_horn';

    if (!sharedGeometries.has(lookupType)) {
      let enemyDataset = enemies.find((enemy) => enemy.name === lookupType);

      if (enemyDataset === undefined) {
        throw new Error('Unknown object: ' + lookupType);
      }

      let flatCoords = [].concat(...enemyDataset.coords);
      let vectorPoints = flatCoords.map((p) => new Vector2(p.x, p.y));

      let boundingBox = new Box2().setFromPoints(vectorPoints);
      let center = new Vector2();
      boundingBox.getCenter(center);

      let size = new Vector2();
      boundingBox.getSize(size);
      let shieldRadius = Math.max(size.x, size.y) * 0.75;

      const flipY = lookupType === 'demon_head' || lookupType === 'demon_horn';

      // Map out the BufferGeometries for the lines
      const lineGeometries = enemyDataset.coords.map((xyArray) => {
        return new BufferGeometry().setFromPoints(
          xyArray
            .map((p) => new Vector2(p.x, p.y))
            .map((v) => v.sub(center))
            .map((v) => new Vector3(v.x, flipY ? -v.y : v.y, 0)),
        );
      });

      // Map out the original colors so instances know what material to build
      const colors = enemyDataset.coords.map((_, i) =>
        Array.isArray(enemyDataset.color)
          ? enemyDataset.color[i]
          : enemyDataset.color,
      );

      const shieldGeometry = new IcosahedronGeometry(shieldRadius, 0);

      // Save the computed geometries to the cache
      sharedGeometries.set(lookupType, {
        lineGeometries,
        shieldGeometry,
        colors,
      });
    }

    // Fetch the shared data from the cache
    const cachedData = sharedGeometries.get(lookupType);

    // Construct the meshes using shared geometry and instance-specific materials
    cachedData.lineGeometries.forEach((geometry, i) => {
      let originalColor = cachedData.colors[i];
      let material = new MeshBasicMaterial({
        color: originalColor,
        transparent: true,
        opacity: 1.0,
      });
      material.userData.originalColor = originalColor;

      this.modelGroup.add(new Line(geometry, material));
    });

    const shieldMat = new MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    this.shieldMesh = new Mesh(cachedData.shieldGeometry, shieldMat);

    this.add(this.modelGroup);
    this.add(this.shieldMesh);
  }

  /**
   * Safely disposes of instance-specific GPU resources (materials).
   * Geometries are preserved because they are globally cached.
   */
  // dispose() is inherited from SurfaceObjectWrapper. The previous override
  // here only disposed materials, never geometry — every enemy renderer
  // (flipper, fuseball, pulsar, spiker, all three tanker variants) was
  // leaking a BufferGeometry per instance. Fixed once, at the shared base,
  // rather than here.
}
