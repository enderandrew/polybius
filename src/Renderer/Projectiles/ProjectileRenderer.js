import { BoxGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, WireframeGeometry } from 'three';
import SurfaceObjectWrapper from '@/Renderer/Surface/SurfaceObjectWrapper';
import Projectile from '@/Object/Projectiles/Projectile';

export default class ProjectileRenderer extends SurfaceObjectWrapper {
  // Removed legacy @readonly decorators
  static PROJECTILE_SIZE = 0.1;
  static PROJECTILE_SHOOTER_COLOR = 0xffff00;
  static PROJECTILE_ENEMY_COLOR = 0xff00ff;
  static ROTATION_SPEED = 0.1;

  /**
   * @param {Projectile} projectile
   * @param {Surface} surface
   */
  constructor (projectile, surface) {
    super(projectile, surface, Projectile.TYPE_PROJECTILE);
  }

  setObjectRef (object) {
    super.setObjectRef(object);

    if (this.children.length) {
      this.children[1].material = new LineBasicMaterial({
        color: this.getMaterialColor()
      });

      const lengthMult = this.object.lengthMult || 1.0;
      
      // If it's a laser, make the beam 50% thicker (1.5) as well as longer!
      const thickness = lengthMult > 1.0 ? 1.5 : 1.0;
      this.scale.set(thickness, thickness, lengthMult);
    }
  }

  updateState () {
    this.positionBase = this.surface.lanesMiddleCoords[this.object.laneId].clone();
    this.zRotationBase = this.surface.lanesCenterDirectionRadians[this.object.laneId];
  }

  move () {
    // Snap to the correct X/Y position of the current lane
    this.position.x = this.surface.lanesMiddleCoords[this.object.laneId].x;
    this.position.y = this.surface.lanesMiddleCoords[this.object.laneId].y;

    // Move forward/backward along the Z depth
    this.position.z = this.object.zPosition * this.surface.depth;
  }

  rotate () {
    // If it is an elongated laser beam, stop the tumbling effect!
    if (this.object && this.object.lengthMult > 1.0) {
       this.rotation.set(0, 0, 0); 
    } else {
       // Otherwise, tumble normally
       this.rotation.x += ProjectileRenderer.ROTATION_SPEED;
       this.rotation.y += ProjectileRenderer.ROTATION_SPEED;
    }
  }

  loadModel () {
    this.clear();
    let geometry = new BoxGeometry(
      ProjectileRenderer.PROJECTILE_SIZE,
      ProjectileRenderer.PROJECTILE_SIZE,
      ProjectileRenderer.PROJECTILE_SIZE
    );

    let material = new MeshBasicMaterial({
      color: 0,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1
    });

    this.add(new Mesh(geometry, material));

    const projectileWireframe = new LineSegments(
      new WireframeGeometry(geometry),
      new LineBasicMaterial({
        color: this.getMaterialColor()
      })
    );
    this.add(projectileWireframe);
  }

  getMaterialColor () {
    // Check if the customColor was applied from the PowerUpManager
    if (this.object && this.object.source === Projectile.SOURCE_SHOOTER) {
      return this.object.customColor || ProjectileRenderer.PROJECTILE_SHOOTER_COLOR;
    }
    return ProjectileRenderer.PROJECTILE_ENEMY_COLOR;
  }
}