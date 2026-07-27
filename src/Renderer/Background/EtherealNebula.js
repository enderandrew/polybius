import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  MathUtils,
  DoubleSide,
  Color
} from 'three';

export default class EtherealNebula extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  clouds = [];
  aliens = [];

  constructor(numClouds = 50, size = 200, speed = 12.0) {
    super();
    this.size = size;
    this.speed = speed;

    // Use a single grayscale texture for all clouds
    const cloudTex = this._createCloudTexture();
    const geo = new PlaneGeometry(80, 80);

    // Color palette: Greens, Teals, Blues, and Deep Purples
    const nebulaHues = [0.35, 0.45, 0.55, 0.65, 0.75]; 

    for (let i = 0; i < numClouds; i++) {
      const hue = nebulaHues[Math.floor(Math.random() * nebulaHues.length)];
      const cloudColor = new Color().setHSL(hue, 0.7, 0.5);

      const mat = new MeshBasicMaterial({
        map: cloudTex,
        color: cloudColor, // Tint the grayscale texture
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        // Drastically reduced opacity to prevent bloom washout
        opacity: 0.03 + Math.random() * 0.04, 
        side: DoubleSide,
      });

      const cloud = new Mesh(geo, mat);
      
      // Randomize scale slightly so clouds aren't uniformly sized
      const scale = 0.8 + Math.random() * 0.6;
      cloud.scale.set(scale, scale, scale);

      this._resetCloud(cloud, true);
      this.add(cloud);
      this.clouds.push(cloud);
    }
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    if (!this.clouds.length) return;

    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    const distance = this.speed * this.speedMultiplier * delta;

    // Update Nebula Clouds
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      cloud.position.z -= distance;
      cloud.rotation.z += cloud.userData.rotSpeed * delta;

      if (cloud.position.z < -15) {
        this._resetCloud(cloud, false);
      }
    }

    // Easter Egg Logic: 1% chance to spawn an Alien face
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.01) {
        this._spawnAlien();
      }
    }

    // Update active Aliens
    for (let i = this.aliens.length - 1; i >= 0; i--) {
      const alien = this.aliens[i];
      alien.position.z -= distance * 1.5; 
      alien.rotation.z = Math.sin(performance.now() * 0.001) * 0.05;

      if (alien.position.z < -10) {
        this.remove(alien);
        alien.material.map.dispose();
        alien.geometry.dispose();
        alien.material.dispose();
        this.aliens.splice(i, 1);
      }
    }
  }

  _resetCloud(cloud, initialSpawn = false) {
    cloud.position.x = MathUtils.randFloatSpread(this.size);
    cloud.position.y = MathUtils.randFloatSpread(this.size * 0.8);
    
    cloud.position.z = initialSpawn 
      ? -10 + Math.random() * 160 
      : 140 + Math.random() * 20;

    cloud.rotation.z = Math.random() * Math.PI * 2;
    cloud.userData.rotSpeed = (Math.random() - 0.5) * 0.2; // Slowed the churn slightly
  }

  _createCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const center = canvas.width / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    
    // Soft white/grayscale gradient to allow THREE.Color tinting
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(200, 200, 200, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return new CanvasTexture(canvas);
  }

  _spawnAlien() {
    const tex = this._createAlienTexture();
    const mat = new MeshBasicMaterial({ 
      map: tex, 
      transparent: true, 
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.15, // Lowered alien opacity slightly to match the softer fog
      side: DoubleSide,
    });
    
    const geo = new PlaneGeometry(45, 45);
    const alien = new Mesh(geo, mat);

    const x = MathUtils.randFloatSpread(80);
    const y = MathUtils.randFloatSpread(50);
    alien.position.set(x, y, 150);
    
    this.add(alien);
    this.aliens.push(alien);
  }

  _createAlienTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(20, 255, 100, 0.8)';
    ctx.shadowColor = 'rgba(20, 255, 100, 1)';
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.ellipse(128, 110, 70, 90, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 0; 

    ctx.beginPath();
    ctx.ellipse(90, 125, 20, 35, -Math.PI / 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(166, 125, 20, 35, Math.PI / 5, 0, Math.PI * 2);
    ctx.fill();

    return new CanvasTexture(canvas);
  }
}