import { Group, GridHelper, Color } from 'three';

export default class CyberGrid extends Group {
  speedMultiplier = 1.0;

  constructor(size = 300, divisions = 60, speed = 15.0) {
    super();
    this.size = size;
    this.divisions = divisions;
    this.speed = speed;
    this.gridSize = size / divisions;

    // Dark red grid with a brighter red center line
    const centerColor = new Color(0xff2222);
    const gridColor = new Color(0xaa0000);
    
    // GridHelper draws in the XZ plane by default
    this.grid = new GridHelper(this.size, this.divisions, centerColor, gridColor);
    
    // Push the grid down well below the playable tube area
    this.grid.position.y = -35;
    
    this.add(this.grid);
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    if (!this.grid) return;

    // Smoothly decay the multiplier back to 1.0 (normal speed)
    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    // Move the grid in the negative Z direction to simulate forward flight
    const distance = this.speed * this.speedMultiplier * delta;
    this.grid.position.z -= distance;

    // Snap back exactly one grid square to create an infinite treadmill effect
    if (this.grid.position.z < -this.gridSize) {
      this.grid.position.z += this.gridSize;
    }
  }
}