import {
  Group,
  BufferGeometry,
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  Color,
  Vector3,
  DoubleSide,
  PlaneGeometry
} from 'three';

export default class SolarRibbons extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  ribbons = [];
  eyes = [];

  constructor(numRibbons = 12, pointsPerRibbon = 50, width = 350) {
    super();
    this.numRibbons = numRibbons;
    this.pointsPerRibbon = pointsPerRibbon;
    this.width = width;

    // Color palette: Deep Oranges, Golds, and Fiery Reds
    const ribbonHues = [0.05, 0.08, 0.1, 0.12, 0.15];

    for (let i = 0; i < numRibbons; i++) {
      const hue = ribbonHues[Math.floor(Math.random() * ribbonHues.length)];
      const color = new Color().setHSL(hue, 0.9, 0.5);

      const mat = new MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.10, // Dimmed down to avoid washing out gameplay
        side: DoubleSide,
        depthWrite: false,
      });

      const vertexCount = this.pointsPerRibbon * 2;
      const geo = new BufferGeometry();
      const positions = new Float32Array(vertexCount * 3);
      
      const indices = [];
      for (let j = 0; j < this.pointsPerRibbon - 1; j++) {
        const top1 = j * 2;
        const bot1 = j * 2 + 1;
        const top2 = (j + 1) * 2;
        const bot2 = (j + 1) * 2 + 1;

        indices.push(top1, bot1, top2);
        indices.push(bot1, bot2, top2);
      }

      geo.setAttribute('position', new BufferAttribute(positions, 3));
      geo.setIndex(indices);

      const mesh = new Mesh(geo, mat);
      
      // Split vertical positions: force them to occupy either the top or bottom third of the screen
      const isTop = Math.random() > 0.5;
      const baseY = isTop ? (25 + Math.random() * 25) : (-25 - Math.random() * 25);

      mesh.userData = {
        baseY: baseY,
        zPos: 50 + Math.random() * 100, 
        amplitude: 4 + Math.random() * 6, // Smaller wave motion so they stay framed at the edges
        frequency: 0.006 + Math.random() * 0.012,
        speed: 0.3 + Math.random() * 0.4, 
        ribbonWidth: 3.0 + Math.random() * 3.0, 
        phaseOffset: Math.random() * Math.PI * 2,
      };

      this.add(mesh);
      this.ribbons.push(mesh);
    }
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    if (!this.ribbons.length) return;

    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;
    const time = this.elapsed;

    for (let i = 0; i < this.ribbons.length; i++) {
      const ribbon = this.ribbons[i];
      const positions = ribbon.geometry.attributes.position.array;
      const { baseY, zPos, amplitude, frequency, speed, ribbonWidth, phaseOffset } = ribbon.userData;

      const currentSpeed = speed * this.speedMultiplier;

      for (let j = 0; j < this.pointsPerRibbon; j++) {
        const x = (j / (this.pointsPerRibbon - 1)) * this.width - (this.width / 2);
        
        const centerY = baseY + Math.sin(x * frequency + time * currentSpeed + phaseOffset) * amplitude;

        const topY = centerY + ribbonWidth / 2;
        const botY = centerY - ribbonWidth / 2;

        const topIdx = j * 2;
        const botIdx = j * 2 + 1;

        positions[topIdx * 3]     = x;
        positions[topIdx * 3 + 1] = topY;
        positions[topIdx * 3 + 2] = zPos;

        positions[botIdx * 3]     = x;
        positions[botIdx * 3 + 1] = botY;
        positions[botIdx * 3 + 2] = zPos;
      }

      ribbon.geometry.attributes.position.needsUpdate = true;
    }

    // Easter Egg Logic: 1% chance to spawn the All-Seeing Eye
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.05) {
        this._spawnAllSeeingEye();
      }
    }

    for (let i = this.eyes.length - 1; i >= 0; i--) {
      const eye = this.eyes[i];
      eye.position.addScaledVector(eye.userData.velocity, delta);
      
      eye.rotation.z = Math.sin(time * 0.5) * 0.1;

      if (eye.position.y > 100 || eye.position.x < -150 || eye.position.x > 150) {
        this.remove(eye);
        eye.material.map.dispose();
        eye.geometry.dispose();
        eye.material.dispose();
        this.eyes.splice(i, 1);
      }
    }
  }

  _spawnAllSeeingEye() {
    const tex = this._createEyeTexture();
    const mat = new MeshBasicMaterial({ 
      map: tex, 
      transparent: true, 
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.25,
      side: DoubleSide
    });
    
    const geo = new PlaneGeometry(60, 60);
    const eyeMesh = new Mesh(geo, mat);

    const startX = (Math.random() - 0.5) * 100;
    eyeMesh.position.set(startX, -60, 100);
    
    const dirX = (Math.random() - 0.5) * 10;
    const dirY = 10 + Math.random() * 15;
    eyeMesh.userData.velocity = new Vector3(dirX, dirY, 0);
    
    this.add(eyeMesh);
    this.eyes.push(eyeMesh);
  }

  _createEyeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 256);

    const centerX = 128;

    ctx.shadowColor = 'rgba(255, 150, 0, 1)';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(255, 200, 50, 0.9)';
    ctx.lineWidth = 6;

    // Draw the Pyramid (Triangle)
    ctx.beginPath();
    ctx.moveTo(centerX, 20);
    ctx.lineTo(228, 220);
    ctx.lineTo(28, 220);
    ctx.closePath();
    ctx.stroke();

    // Draw the Capstone split line
    ctx.beginPath();
    ctx.moveTo(80, 100);
    ctx.lineTo(176, 100);
    ctx.stroke();

    // Draw the Eye
    ctx.beginPath();
    ctx.ellipse(centerX, 160, 45, 25, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw the Pupil
    ctx.beginPath();
    ctx.arc(centerX, 160, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
    ctx.fill();

    return new CanvasTexture(canvas);
  }
}