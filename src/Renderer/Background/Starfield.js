import { Group, BufferGeometry, BufferAttribute, PointsMaterial, Points, MathUtils } from 'three';

export default class Starfield extends Group {
  constructor(numStars = 2500, size = 150, speed = 15.0) {
    super();
    this.numStars = numStars;
    this.size = size;
    this.speed = speed;

    const geometry = new BufferGeometry();
    const positions = new Float32Array(this.numStars * 3);

    // Scatter stars randomly inside a large cube
    for (let i = 0; i < this.numStars; i++) {
      positions[i * 3] = MathUtils.randFloatSpread(this.size);     // X
      positions[i * 3 + 1] = MathUtils.randFloatSpread(this.size); // Y
      positions[i * 3 + 2] = MathUtils.randFloatSpread(this.size); // Z
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    // Simple, bright white squares - true to 80s arcade limitations
    const material = new PointsMaterial({
      color: 0xffffff,
      size: 0.15, 
      transparent: true,
      opacity: 0.8
    });

    this.points = new Points(geometry, material);
    this.add(this.points);
  }

  update(delta) {
    if (!this.points) return;

    // Grab the raw coordinate array from the GPU memory buffer
    const positions = this.points.geometry.attributes.position.array;
    const distance = this.speed * delta;

    for (let i = 0; i < this.numStars; i++) {
      // Move the stars towards the camera (negative Z direction)
      positions[i * 3 + 2] -= distance;

      // FIX: Check if the star has flown past the NEGATIVE boundary
      if (positions[i * 3 + 2] < -this.size / 2) {
        
        // Wrap it back to the deep background (POSITIVE boundary)
        positions[i * 3 + 2] += this.size;
        
        // Randomize the X and Y so the pattern doesn't become recognizable
        positions[i * 3] = MathUtils.randFloatSpread(this.size);
        positions[i * 3 + 1] = MathUtils.randFloatSpread(this.size);
      }
    }

    // You MUST tell Three.js that the buffer has changed, or it won't render the movement
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}