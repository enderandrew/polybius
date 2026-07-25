import { BufferGeometry, Group, Line, MeshBasicMaterial, Vector2, Vector3 } from 'three';
import EnemyRenderer from '@/Renderer/Enemies/EnemyRenderer';
import EnemyPulsar from '@/Object/Enemies/EnemyPulsar';
import Enemy from '@/Object/Enemies/Enemy';

export default class EnemyPulsarRenderer extends EnemyRenderer {
  // Removed legacy @readonly decorators
  static NEUTRAL_COLOR = 0x00ffff;
  static PULSE_COLOR = 0xffffff;

  static BASE_Y_SCALE = 0.2;
  static PULSE_Y_SCALE = 0.8;

  // Modern ES class fields replacing JSDoc @var comments
  colorHelperPrevState = -1;

  /**
   * @param {EnemyPulsar} enemyPulsar
   * @param {Surface} surface
   */
  constructor (enemyPulsar, surface) {
    super(enemyPulsar, surface, Enemy.TYPE_PULSAR);
  }

  updateState () {
    if (
      (this.object.inState(EnemyPulsar.STATE_ROTATING_BEGIN) || this.object.inState(EnemyPulsar.STATE_ROTATING_END))
      && (this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CW) || this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CCW))
    ) {
      if (this.object.inState(EnemyPulsar.STATE_ROTATING_BEGIN)
        && this.object.prevState.equals(EnemyPulsar.STATE_ROTATING_END)
        && !this.rotatingStateCache.continuousRotationUpdate) {
        this.rotatingStateCache.continuousRotationUpdate = true;
        this.rotatingStateCache.valid = false;
      }

      if (this.object.inState(EnemyPulsar.STATE_ROTATING_END)) {
        this.rotatingStateCache.continuousRotationUpdate = false;
      }

      if (!this.isRotationStateCacheValid()) {
        this.calculateRotationStateCacheVariables(this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CCW) ? 1 : -1);
      }

      let rotationAxisLaneId = this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CW)
        ? this.rotatingStateCache.sourceLaneId
        : this.rotatingStateCache.targetLaneId;

      this.zRotationBase = this.surface.lanesCenterDirectionRadians[rotationAxisLaneId];
      this.positionBase = this.surface.lanesMiddleCoords[rotationAxisLaneId].clone();

      if (this.object.inState(EnemyPulsar.STATE_ROTATING_BEGIN)) {
        if (this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CW)) {
          this.zRotationOffset = this.rotatingStateCache.relativeHalfStep * this.object.stateProgressInTime();
        } else {
          this.zRotationOffset = this.rotatingStateCache.relativeHalfStep * (2 - this.object.stateProgressInTime());
        }
      } else {
        if (this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CW)) {
          this.zRotationOffset = this.rotatingStateCache.relativeHalfStep * (this.object.stateProgressInTime() + 1);
        } else {
          this.zRotationOffset = this.rotatingStateCache.relativeHalfStep * (1 - this.object.stateProgressInTime());
        }
      }

      let positionRotationXYOffset = new Vector2().subVectors(
        this.surface.lanesCoords[rotationAxisLaneId],
        this.surface.lanesMiddleCoords[rotationAxisLaneId]
      ).rotateAround(new Vector2(0, 0), this.zRotationOffset);

      this.positionBase = this.surface.lanesCoords[rotationAxisLaneId].clone().sub(positionRotationXYOffset);

    } else if (this.object.inState(EnemyPulsar.STATE_EXPLODING)) {
      this.explodeAnimation();

    } else if (this.object.inState(EnemyPulsar.STATE_DISAPPEARING)) {
      this.disappearingAnimation();

    } else {
      this.zRotationBase = this.surface.lanesCenterDirectionRadians[this.object.laneId];
      this.positionBase = this.surface.lanesMiddleCoords[this.object.laneId].clone();
      this.zRotationOffset = 0;

      this.invalidateRotationStateCache();
    }

    this.setScale();
    this.setMaterial();
  }

  setScale () {
  // noinspection JSUnresolvedVariable                  
    let scale = EnemyPulsarRenderer.BASE_Y_SCALE;

    if (this.object.inState(EnemyPulsar.STATE_WARNING)) {
      scale += this.object.stateProgressInTime() * EnemyPulsarRenderer.PULSE_Y_SCALE;
    }

    if (this.object.inState(EnemyPulsar.STATE_PULSATING)) {
      scale += (1 + Math.sin(this.object.stateProgressInTime() * Math.PI * 11.6)) * EnemyPulsarRenderer.PULSE_Y_SCALE;
    }

    if (this.object.isFlagSet(EnemyPulsar.FLAG_ROTATION_CCW)) {
      scale *= -1;
    }

  // noinspection JSUnresolvedVariable                  
    if (this.object.rendererHelperLaneChangesAmount % 2 === 1) {
      scale *= -1;
    }

    this.modelGroup.scale.setY(scale);
  }

  setMaterial () {
    if (this.colorHelperPrevState !== this.object.state.id) {
      let neutral = !this.object.inState(EnemyPulsar.STATE_WARNING)
        && !this.object.inState(EnemyPulsar.STATE_PULSATING);

      this.modelGroup.children[0].material = new MeshBasicMaterial({
        color: neutral ? EnemyPulsarRenderer.NEUTRAL_COLOR : EnemyPulsarRenderer.PULSE_COLOR
      });

      this.colorHelperPrevState = this.object.state.id;
    }
  }

  loadModel () {
    super.loadModel();

    this._chaosGlitch = this._buildChaosGlitch();
    this._chaosGlitch.visible = false;
    this.add(this._chaosGlitch);
  }

  setObjectRef (object) {
    super.setObjectRef(object);
    this._applyVariantVisuals();
  }

  setVisualsToNormal () {
    super.setVisualsToNormal();
    this._applyVariantVisuals();
  }

  _applyVariantVisuals () {
    if (!this.object) return;

    if (this._chaosGlitch) this._chaosGlitch.visible = !!this.object.isChaos;

    if (this.modelGroup) {
      if (this.object.isMega) {
        // Stretch it massively across the X-axis so it physically touches adjacent lanes!
        this.modelGroup.scale.set(2.2, 1.0, 1.0); 
      } else if (this.object.isInverse) {
        // Flip the model backward on the Z-axis, since it's flying in reverse
        this.modelGroup.scale.set(1.0, 1.0, -1.0); 
      } else {
        this.modelGroup.scale.setScalar(1.0);
      }
    }
  }

  rotate () {
    super.rotate();
    
    // Tumble the Chaos Pulsar's glitch aura randomly
    if (this._chaosGlitch && this._chaosGlitch.visible) {
      this._chaosGlitch.rotation.x += 0.08;
      this._chaosGlitch.rotation.y -= 0.05;
      this._chaosGlitch.rotation.z += 0.12;
      
      // Flash opacity rapidly to look "broken"
      const t = performance.now();
      this._chaosGlitch.children.forEach(child => {
         child.material.opacity = 0.2 + (Math.random() * 0.6);
      });
    }
  }

  _buildChaosGlitch () {
    const group = new Group();
    const radius = 0.4;
    // Creates a jagged, sharp diamond cage
    const pts = [
        new Vector3(0, radius, 0), new Vector3(radius, 0, 0),
        new Vector3(0, -radius, 0), new Vector3(-radius, 0, 0),
        new Vector3(0, radius, 0), new Vector3(0, 0, radius),
        new Vector3(0, -radius, 0), new Vector3(0, 0, -radius),
        new Vector3(0, radius, 0)
    ];
    const cage = new Line(
        new BufferGeometry().setFromPoints(pts),
        new MeshBasicMaterial({ color: 0xff00ff, transparent: true })
    );
    group.add(cage);
    return group;
  }
}