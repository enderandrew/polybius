import {
  Group,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points,
  MathUtils,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Vector3
} from 'three';

export default class Starfield extends Group {
  numStars;
  size;
  speed;
  speedMultiplier = 1.0;
  
  ufoCheckTimer = 0;
  ufos = [];

  constructor(numStars = 2500, size = 150, speed = 15.0) {
    super();
    this.numStars = numStars;
    this.size = size;
    this.speed = speed;

    const geometry = new BufferGeometry();
    const positions = new Float32Array(this.numStars * 3);

    for (let i = 0; i < this.numStars; i++) {
      positions[i * 3] = MathUtils.randFloatSpread(this.size);
      positions[i * 3 + 1] = MathUtils.randFloatSpread(this.size);
      positions[i * 3 + 2] = MathUtils.randFloatSpread(this.size);
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
    });

    this.points = new Points(geometry, material);
    this.add(this.points);
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    if (!this.points) return;

    // Smoothly decay the multiplier back to 1.0 (normal speed)
    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    const positions = this.points.geometry.attributes.position.array;
    const distance = this.speed * this.speedMultiplier * delta;

    for (let i = 0; i < this.numStars; i++) {
      positions[i * 3 + 2] -= distance;

      if (positions[i * 3 + 2] < -this.size / 2) {
        positions[i * 3 + 2] += this.size;
        positions[i * 3] = MathUtils.randFloatSpread(this.size);
        positions[i * 3 + 1] = MathUtils.randFloatSpread(this.size);
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;

    // UFO Easter Egg Logic
    this.ufoCheckTimer += delta;
    if (this.ufoCheckTimer >= 1.0) {
      this.ufoCheckTimer -= 1.0;
      // 1% chance every second
      if (Math.random() < 0.01) {
        this._spawnUFO();
      }
    }

    // Update active UFOs
    for (let i = this.ufos.length - 1; i >= 0; i--) {
      const ufo = this.ufos[i];
      ufo.position.addScaledVector(ufo.userData.velocity, delta);
      
      // Give it a classic saucer spin
      ufo.rotation.y += delta * 3.0;

      // Clean up if it travels too far beyond the screen bounds
      if (Math.abs(ufo.position.x) > this.size || Math.abs(ufo.position.y) > this.size) {
        this.remove(ufo);
        ufo.geometry.dispose();
        ufo.material.dispose();
        this.ufos.splice(i, 1);
      }
    }
  }

  _spawnUFO() {
    // A simple retro flying saucer using a flattened wireframe sphere
    const geo = new SphereGeometry(1.5, 12, 8);
    const mat = new MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    const ufo = new Mesh(geo, mat);
    ufo.scale.set(1, 0.3, 1); // Flatten it into a saucer shape

    // Pick a random edge: 0 = Left, 1 = Right, 2 = Top, 3 = Bottom
    const edge = Math.floor(Math.random() * 4);
    const halfSize = this.size / 2;
    const spawnZ = -40 - Math.random() * 20; // Ensure it renders behind gameplay elements

    let startX = 0, startY = 0;
    let destX = 0, destY = 0;

    if (edge === 0) {
      startX = -halfSize;
      startY = MathUtils.randFloatSpread(halfSize);
      destX = halfSize;
      destY = MathUtils.randFloatSpread(halfSize);
    } else if (edge === 1) {
      startX = halfSize;
      startY = MathUtils.randFloatSpread(halfSize);
      destX = -halfSize;
      destY = MathUtils.randFloatSpread(halfSize);
    } else if (edge === 2) {
      startX = MathUtils.randFloatSpread(halfSize);
      startY = halfSize;
      destX = MathUtils.randFloatSpread(halfSize);
      destY = -halfSize;
    } else {
      startX = MathUtils.randFloatSpread(halfSize);
      startY = -halfSize;
      destX = MathUtils.randFloatSpread(halfSize);
      destY = halfSize;
    }

    ufo.position.set(startX, startY, spawnZ);

    // Give it a snappy travel speed
    const ufoSpeed = 30.0 + Math.random() * 20.0;
    const direction = new Vector3(destX - startX, destY - startY, 0).normalize();
    ufo.userData.velocity = direction.multiplyScalar(ufoSpeed);

    // Apply a slight tilt for 3D depth
    ufo.rotation.x = Math.PI * 0.1;

    this.add(ufo);
    this.ufos.push(ufo);
  }
}