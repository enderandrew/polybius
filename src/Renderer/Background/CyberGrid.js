import { 
  Group, 
  GridHelper, 
  Color, 
  BufferGeometry, 
  LineSegments, 
  LineBasicMaterial, 
  Vector3 
} from 'three';

export default class CyberGrid extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  recognizers = [];

  constructor(size = 300, divisions = 60, speed = 15.0) {
    super();
    this.size = size;
    this.divisions = divisions;
    this.speed = speed;
    this.gridSize = size / divisions;

    const centerColor = new Color(0xff2222);
    const gridColor = new Color(0xaa0000);
    
    this.grid = new GridHelper(this.size, this.divisions, centerColor, gridColor);
    this.grid.position.y = -35;
    
    this.add(this.grid);
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    if (!this.grid) return;

    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    const distance = this.speed * this.speedMultiplier * delta;
    this.grid.position.z -= distance;

    if (this.grid.position.z < -this.gridSize) {
      this.grid.position.z += this.gridSize;
    }

    // Easter Egg Logic: 1% chance to spawn a Recognizer every second
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.01) {
        this._spawnRecognizer();
      }
    }

    // Move active Recognizers
    for (let i = this.recognizers.length - 1; i >= 0; i--) {
      const rec = this.recognizers[i];
      // Fly towards the player faster than the grid
      rec.position.z -= (this.speed * this.speedMultiplier * 2.5) * delta;
      
      // Cleanup when it flies past the camera
      if (rec.position.z < -20) {
        this.remove(rec);
        rec.geometry.dispose();
        rec.material.dispose();
        this.recognizers.splice(i, 1);
      }
    }
  }

  _spawnRecognizer() {
    const points = [];
    
    // Outer Arch
    points.push(new Vector3(-4, -5, 0), new Vector3(-2, 5, 0));
    points.push(new Vector3(-2, 5, 0), new Vector3(2, 5, 0));
    points.push(new Vector3(2, 5, 0), new Vector3(4, -5, 0));
    
    // Inner Arch
    points.push(new Vector3(-2, -5, 0), new Vector3(-1, 2, 0));
    points.push(new Vector3(-1, 2, 0), new Vector3(1, 2, 0));
    points.push(new Vector3(1, 2, 0), new Vector3(2, -5, 0));
    
    // Crossbars
    points.push(new Vector3(-3, 0, 0), new Vector3(3, 0, 0));
    points.push(new Vector3(-2.5, 2, 0), new Vector3(2.5, 2, 0));

    const geo = new BufferGeometry().setFromPoints(points);
    const mat = new LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const recognizer = new LineSegments(geo, mat);

    // Spawn far in the distance, hovering above the grid
    const startX = (Math.random() - 0.5) * 80;
    recognizer.position.set(startX, -15, 180);
    recognizer.scale.set(4, 4, 4);

    this.add(recognizer);
    this.recognizers.push(recognizer);
  }
}