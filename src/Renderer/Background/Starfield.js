import { Group, BufferGeometry, BufferAttribute, PointsMaterial, Points, MathUtils } from 'three';

export default class Starfield extends Group {
  numStars;
  size;
  speed;
  speedMultiplier = 1.0; 

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
      opacity: 0.8
    });

    this.points = new Points(geometry, material);
    this.add(this.points);
  }

  pulse(intensity) {
      this.speedMultiplier = intensity;
  }

  update(delta) {
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
  }
}