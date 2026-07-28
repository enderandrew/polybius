import {
  Group,
  Mesh,
  IcosahedronGeometry,
  OctahedronGeometry,
  TetrahedronGeometry,
  MeshBasicMaterial,
  PlaneGeometry,
  CanvasTexture,
  AdditiveBlending,
  LineSegments,
  LineBasicMaterial,
  MathUtils,
  Vector3,
  DoubleSide
} from 'three';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class FracturedMonoliths extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  monoliths = [];
  bigfoots = [];

  constructor(numMonoliths = 14, size = 250) {
    super();
    this.size = size;

    // Color palette: Deep Purples, Violets, and Magentas
    const colors = [0x8844ff, 0xaa00ff, 0x6600cc, 0xdd66ff, 0x9933cc];

    for (let i = 0; i < numMonoliths; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      let geo;
      const shapeType = Math.floor(Math.random() * 3);
      if (shapeType === 0) geo = new IcosahedronGeometry(8 + Math.random() * 12, 0);
      else if (shapeType === 1) geo = new OctahedronGeometry(10 + Math.random() * 15, 0);
      else geo = new TetrahedronGeometry(12 + Math.random() * 14, 0);

      const wireframe = new LineSegments(
        geo,
        new LineBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.35,
        })
      );

      const mat = new MeshBasicMaterial({
        color: 0x110022,
        transparent: true,
        opacity: 0.2,
        side: DoubleSide,
      });
      const mesh = new Mesh(geo, mat);
      mesh.add(wireframe);

      this._resetMonolith(mesh, true);
      this.add(mesh);
      this.monoliths.push(mesh);
    }
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    if (!this.monoliths.length) return;

    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    for (let i = 0; i < this.monoliths.length; i++) {
      const m = this.monoliths[i];
      m.rotation.x += m.userData.rotSpeed.x * delta;
      m.rotation.y += m.userData.rotSpeed.y * delta;
      m.rotation.z += m.userData.rotSpeed.z * delta;
    }

    // Easter Egg Logic: 1% chance every second to spawn Bigfoot
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.025) {
        this._spawnBigfoot();
      }
    }

    // Update active Bigfoot instances
    for (let i = this.bigfoots.length - 1; i >= 0; i--) {
      const bf = this.bigfoots[i];
      bf.position.addScaledVector(bf.userData.velocity, delta);

      // Give a subtle bob to simulate walking
      bf.position.y = -20 + Math.abs(Math.sin(this.elapsed * 8)) * 2;

      if (Math.abs(bf.position.x) > 160) {
        this.remove(bf);
        bf.material.map.dispose();
        bf.geometry.dispose();
        bf.material.dispose();
        this.bigfoots.splice(i, 1);
      }
    }
  }

  _resetMonolith(mesh, initialSpawn = false) {
    mesh.position.set(
      MathUtils.randFloatSpread(this.size),
      MathUtils.randFloatSpread(this.size * 0.6),
      initialSpawn ? (Math.random() * 160 - 20) : (140 + Math.random() * 40)
    );

    mesh.userData.rotSpeed = {
      x: (Math.random() - 0.5) * 0.2,
      y: (Math.random() - 0.5) * 0.2,
      z: (Math.random() - 0.5) * 0.2,
    };
  }

  _spawnBigfoot() {
    const movingRight = Math.random() > 0.5;
    const tex = this._createBigfootTexture(movingRight);
    
    const mat = new MeshBasicMaterial({ 
      map: tex, 
      transparent: true, 
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
      side: DoubleSide
    });

    const geo = new PlaneGeometry(30, 45);
    const bigfootMesh = new Mesh(geo, mat);

    const startX = movingRight ? -140 : 140;
    const speed = movingRight ? 45 : -45;

    bigfootMesh.position.set(startX, -20, 90);
    bigfootMesh.userData.velocity = new Vector3(speed, 0, 0);

    this.add(bigfootMesh);
    this.bigfoots.push(bigfootMesh);

    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_BIGFOOT
    );
  }

  _createBigfootTexture(facingRight) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 384);

    // Warm Brown & Amber/Gold Vector Glow
    ctx.shadowColor = 'rgba(255, 140, 0, 0.9)'; // Amber bloom
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.95)'; // Glowing golden edge
    ctx.fillStyle = 'rgba(110, 50, 10, 0.75)'; // Rich ape-brown fill
    ctx.lineWidth = 4;

    ctx.save();
    
    // Flip horizontally if running left
    if (!facingRight) {
      ctx.translate(256, 0);
      ctx.scale(-1, 1);
    }

    // Refined Patterson–Gimlin Bigfoot Contour
    ctx.beginPath();
    // Head / Sagittal Crest
    ctx.moveTo(110, 35);   // Pointed crest tip
    ctx.lineTo(135, 50);   // Back of skull
    ctx.lineTo(142, 80);   // Thick neck
    // Back / Hunch
    ctx.lineTo(165, 140);  // Massive hunched back
    ctx.lineTo(178, 200);  // Rear hip
    // Trailing Leg
    ctx.lineTo(205, 270);  // Rear thigh
    ctx.lineTo(225, 335);  // Rear calf / heel
    ctx.lineTo(245, 350);  // Extended rear foot
    ctx.lineTo(200, 350);  // Rear sole
    ctx.lineTo(180, 310);  // Back leg inner knee
    ctx.lineTo(145, 235);  // Inseam / Crotch
    // Leading Leg
    ctx.lineTo(125, 280);  // Front leg knee bend
    ctx.lineTo(95, 355);   // Front shin down to big foot
    ctx.lineTo(40, 355);   // Long flat front foot / toes
    ctx.lineTo(70, 310);   // Front ankle
    ctx.lineTo(100, 210);  // Waist / lower abdomen
    // Swinging Arm
    ctx.lineTo(80, 145);   // Chest line up to shoulder
    ctx.lineTo(45, 190);   // Reaching arm elbow
    ctx.lineTo(20, 235);   // Low swinging hand
    ctx.lineTo(38, 240);   // Hand thickness
    ctx.lineTo(68, 175);   // Inner arm back to torso
    ctx.lineTo(90, 115);   // Upper chest / clavicle
    // Face turned back toward camera
    ctx.lineTo(75, 90);    // Heavy brow / jawline
    ctx.lineTo(82, 60);    // Snout / face plane
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Internal detail lines to define muscles/limbs
    ctx.beginPath();
    // Shoulder to elbow line to separate front arm from torso
    ctx.moveTo(110, 100);
    ctx.lineTo(45, 190);
    // Back thigh separation line
    ctx.moveTo(145, 235);
    ctx.lineTo(205, 270);
    ctx.strokeStyle = 'rgba(255, 180, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    return new CanvasTexture(canvas);
  }
}