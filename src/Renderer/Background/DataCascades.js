import {
  Group,
  BufferGeometry,
  BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  DoubleSide
} from 'three';

export default class DataCascades extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  matrixDrops = [];

  constructor(numStreaks = 800, size = 250, speed = 40.0) {
    super();
    this.numStreaks = numStreaks;
    this.size = size;
    this.speed = speed;

    const geometry = new BufferGeometry();
    const positions = new Float32Array(this.numStreaks * 2 * 3);

    for (let i = 0; i < this.numStreaks; i++) {
      const x = MathUtils.randFloatSpread(this.size);
      const y = MathUtils.randFloatSpread(this.size);
      
      // FIXED: Pushed to positive Z so it renders in front of the camera
      const z = 40 + Math.random() * 150; 
      const length = 2.0 + Math.random() * 8.0;

      positions[i * 6]     = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;

      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y - length;
      positions[i * 6 + 5] = z;
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    const material = new LineBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.4,
    });

    this.lines = new LineSegments(geometry, material);
    // Prevent Three.js from accidentally culling the lines as they wrap around
    this.lines.frustumCulled = false; 
    this.add(this.lines);
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    if (!this.lines) return;

    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    const positions = this.lines.geometry.attributes.position.array;
    const distance = this.speed * this.speedMultiplier * delta;

    for (let i = 0; i < this.numStreaks; i++) {
      positions[i * 6 + 1] -= distance;
      positions[i * 6 + 4] -= distance;

      if (positions[i * 6 + 1] < -this.size / 2) {
        const length = positions[i * 6 + 1] - positions[i * 6 + 4]; 
        
        positions[i * 6 + 1] += this.size;
        positions[i * 6 + 4] = positions[i * 6 + 1] - length;
        
        const x = MathUtils.randFloatSpread(this.size);
        const z = 40 + Math.random() * 150; // FIXED Z-WRAP
        
        positions[i * 6]     = x;
        positions[i * 6 + 2] = z;
        positions[i * 6 + 3] = x;
        positions[i * 6 + 5] = z;
      }
    }

    this.lines.geometry.attributes.position.needsUpdate = true;

    // Easter Egg Logic: 1% chance to drop Matrix Code
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.01) {
        this._spawnMatrixDrop();
      }
    }

    // Update Matrix Drops
    for (let i = this.matrixDrops.length - 1; i >= 0; i--) {
      const drop = this.matrixDrops[i];
      // Fall slightly faster than the background lines
      drop.position.y -= (this.speed * this.speedMultiplier * 1.5) * delta;
      
      if (drop.position.y < -this.size / 2) {
        this.remove(drop);
        drop.material.map.dispose();
        drop.geometry.dispose();
        drop.material.dispose();
        this.matrixDrops.splice(i, 1);
      }
    }
  }

  _spawnMatrixDrop() {
    const tex = this._createMatrixTexture();
    const mat = new MeshBasicMaterial({ 
      map: tex, 
      transparent: true, 
      blending: AdditiveBlending,
      depthWrite: false,
	  side: DoubleSide,
    });
    
    // Create a tall, thin plane for the text column
    const geo = new PlaneGeometry(3, 24);
    const drop = new Mesh(geo, mat);

    const x = MathUtils.randFloatSpread(this.size * 0.8);
    const z = 30 + Math.random() * 80; // Keep it close enough to be readable

    drop.position.set(x, this.size / 2, z);
    
    this.add(drop);
    this.matrixDrops.push(drop);
  }

  _createMatrixTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%^&*';
    const numChars = 12;
    const stepY = canvas.height / numChars;

    for (let i = 0; i < numChars; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      
      // The bottom character is the bright white "head" of the trail
      if (i === numChars - 1) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ff44';
        ctx.shadowBlur = 10;
      } else {
        // Fade the tail out towards the top
        const opacity = Math.pow(i / (numChars - 1), 1.5);
        ctx.fillStyle = `rgba(0, 255, 68, ${opacity})`;
        ctx.shadowBlur = 0;
      }
      
      ctx.fillText(char, canvas.width / 2, (i + 1) * stepY - 10);
    }

    const texture = new CanvasTexture(canvas);
    return texture;
  }
}