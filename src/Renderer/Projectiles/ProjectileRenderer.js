import {
  BoxGeometry,
  ConeGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  WireframeGeometry,
} from 'three';
import SurfaceObjectWrapper from '@/Renderer/Surface/SurfaceObjectWrapper';
import Projectile from '@/Object/Projectiles/Projectile';

export default class ProjectileRenderer extends SurfaceObjectWrapper {
  static PROJECTILE_SIZE = 0.1;
  static PROJECTILE_SHOOTER_COLOR = 0xffff00;
  static PROJECTILE_ENEMY_COLOR = 0xff00ff;
  static ROTATION_SPEED = 0.1;

  /**
   * @param {Projectile} projectile
   * @param {Surface} surface
   */
  constructor(projectile, surface) {
    super(projectile, surface, Projectile.TYPE_PROJECTILE);
  }

  setObjectRef(object) {
    super.setObjectRef(object);

    // Rebuild the mesh when recycled so it doesn't get stuck as the wrong shape/color!
    this.loadModel();

    if (this.children.length) {
      this.children.forEach((child) => {
        if (child.material) {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      });

      if (this.object.isLaser) {
        // Stretch it exactly to the depth of the 3D tube!
        const stretch = this.surface.depth / ProjectileRenderer.PROJECTILE_SIZE;
        this.scale.set(1.5, 1.5, stretch);
      } else if (this.object.isMissile || this.object.isGrenade) {
        // Keeps 3D geometry aerodynamic and round
        this.scale.set(1, 1, 1);
      } else {
        // Normal bullet scaling
        const lengthMult = this.object.lengthMult || 1.0;
        const thickness = lengthMult > 1.0 ? 1.5 : 1.0;
        this.scale.set(thickness, thickness, lengthMult);
      }
    }
  }

  updateState() {
    if (!this.object || typeof this.object.inState !== 'function') {
      return;
    }
    this.positionBase.copy(this.surface.lanesMiddleCoords[this.object.laneId]);
    this.zRotationBase =
      this.surface.lanesCenterDirectionRadians[this.object.laneId];
  }

  explodeAnimation() {
    if (!this.object || !this.object.isGrenade) return;

    // Expand the sphere to visually match the blast radius (covers adjacent lanes)
    const scaleFactor = 1 + this.object.explosionProgress * 15;
    this.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Fade the blast out so it looks like a dissipating shockwave
    this.children.forEach((child) => {
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = 1.0 - this.object.explosionProgress;
      }
    });

    // Stop tumbling while exploding
    this.rotation.set(0, 0, 0);
  }

  move() {
    // Snap to the correct X/Y position of the current lane
    this.position.x = this.surface.lanesMiddleCoords[this.object.laneId].x;
    this.position.y = this.surface.lanesMiddleCoords[this.object.laneId].y;

    // Move forward/backward along the Z depth
    this.position.z = this.object.zPosition * this.surface.depth;
  }

  rotate() {
    // If it is an elongated laser beam OR a missile, stop the tumbling effect!
    if (
      this.object &&
      (this.object.lengthMult > 1.0 || this.object.isMissile)
    ) {
      this.rotation.set(0, 0, 0);
    } else {
      // Otherwise, tumble the standard boxes normally
      this.rotation.x += ProjectileRenderer.ROTATION_SPEED;
      this.rotation.y += ProjectileRenderer.ROTATION_SPEED;
    }
  }

  loadModel() {
    this.clear(); // Wipes previous geometry

    let geometry;

    if (this.object && this.object.isMissile) {
      // 4-sided pyramid (dart) pointing down the Z-axis
      geometry = new ConeGeometry(0.06, 0.35, 4);
      geometry.rotateX(-Math.PI / 2);
      geometry.rotateZ(Math.PI / 4); // Aligns the flat fins with the arcade lanes
    } else if (this.object && this.object.isGrenade) {
      geometry = new SphereGeometry(0.12, 6, 6); // A wireframe orb
    } else {
      // Standard box geometry
      geometry = new BoxGeometry(
        ProjectileRenderer.PROJECTILE_SIZE,
        ProjectileRenderer.PROJECTILE_SIZE,
        ProjectileRenderer.PROJECTILE_SIZE,
      );
    }

    let material = new MeshBasicMaterial({
      color: 0,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1,
    });

    this.add(new Mesh(geometry, material));

    const projectileWireframe = new LineSegments(
      new WireframeGeometry(geometry),
      new LineBasicMaterial({
        color: this.getMaterialColor(),
      }),
    );
    this.add(projectileWireframe);
  }

  getMaterialColor() {
    // Check if the customColor was applied from the PowerUpManager
    if (this.object && this.object.source === Projectile.SOURCE_SHOOTER) {
      return (
        this.object.customColor || ProjectileRenderer.PROJECTILE_SHOOTER_COLOR
      );
    }
    return ProjectileRenderer.PROJECTILE_ENEMY_COLOR;
  }
}
