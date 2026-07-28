import {
  Group,
  BufferGeometry,
  LineLoop,
  LineBasicMaterial,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  Vector3,
  DoubleSide
} from 'three';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class KaleidoscopicWormhole extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  rings = [];
  watchers = [];
  colorCycle = 0;

  constructor(numRings = 25, pointsPerRing = 8, maxRadius = 120) {
    super();
    this.numRings = numRings;
    this.maxRadius = maxRadius;

    // Build concentric geometric wireframe rings scaling inward/outward
    for (let i = 0; i < this.numRings; i++) {
      const radius = (i / this.numRings) * this.maxRadius;
      const geo = this._createPolygonGeometry(pointsPerRing, radius);

      const mat = new LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      });

      const ring = new LineLoop(geo, mat);
      
      // Stagger them along the Z-axis
      ring.position.z = -20 + (i / this.numRings) * 160;
      ring.userData = {
        baseRadius: radius,
        index: i,
        // Alternate rotation directions for a hypnotic kaleidoscope effect
        rotSpeed: (i % 2 === 0 ? 0.2 : -0.2) * (1 + i * 0.05),
      };

      this.add(ring);
      this.rings.push(ring);
    }
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
    // On heavy beats, violently cycle the color spectrum
    this.colorCycle += 0.2;
  }

  update(delta) {
    // Accumulate our own clock from the (possibly dilated) delta rather than
    // reading performance.now(), so TIME_DILATION slows background motion too.
    this.elapsed = (this.elapsed ?? 0) + delta;
    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;
    this.colorCycle += delta * 0.4; // Continuous rainbow shift

    const time = this.elapsed;

    // Update Rings
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const { rotSpeed, index } = ring.userData;

      // Rotate ring
      ring.rotation.z += rotSpeed * this.speedMultiplier * delta;

      // Pulse scale slightly on beats/music
      const scalePulse = 1.0 + Math.sin(time * 4 + index * 0.2) * 0.05 * this.speedMultiplier;
      ring.scale.set(scalePulse, scalePulse, 1.0);

      // Shift through the rainbow spectrum based on HSL
      const hue = (this.colorCycle + (index / this.rings.length)) % 1.0;
      ring.material.color.setHSL(hue, 0.9, 0.6);
    }

    // Easter Egg Logic: 1% chance every second to spawn the Three-Eyed Watcher
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.05) {
        this._spawnWatcher();
      }
    }

    // Update active Watchers
    for (let i = this.watchers.length - 1; i >= 0; i--) {
      const watcher = this.watchers[i];
      watcher.position.addScaledVector(watcher.userData.velocity, delta);

      // Hypnotic pulsing scale
      const s = 1.0 + Math.sin(time * 6) * 0.1;
      watcher.scale.set(s, s, s);

      if (Math.abs(watcher.position.x) > 160 || Math.abs(watcher.position.y) > 100) {
        this.remove(watcher);
        watcher.material.map.dispose();
        watcher.geometry.dispose();
        watcher.material.dispose();
        this.watchers.splice(i, 1);
      }
    }
  }

  _createPolygonGeometry(numPoints, radius) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      points.push(new Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
    }
    return new BufferGeometry().setFromPoints(points);
  }

  _spawnWatcher() {
    const tex = this._createWatcherTexture();
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
      side: DoubleSide,
    });

    const geo = new PlaneGeometry(40, 40);
    const watcherMesh = new Mesh(geo, mat);

    const movingRight = Math.random() > 0.5;
    const startX = movingRight ? -140 : 140;
    const speed = movingRight ? 30 : -30;

    watcherMesh.position.set(startX, (Math.random() - 0.5) * 40, 90);
    watcherMesh.userData.velocity = new Vector3(speed, 0, 0);

    this.add(watcherMesh);
    this.watchers.push(watcherMesh);

    // Audio cue trigger
    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_SPOOKY
    );

  }

_createWatcherTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 256);

    // Neon cyan/rainbow vector glow for the cosmic face
    ctx.shadowColor = 'rgba(0, 255, 255, 1)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(100, 255, 255, 0.95)';
    ctx.fillStyle = 'rgba(20, 40, 80, 0.6)';
    ctx.lineWidth = 5;

    // Draw humanoid head silhouette using Bezier curves
    ctx.beginPath();
    ctx.moveTo(128, 40); // Top center (crown)
    
    // Right side (forehead -> cheekbone -> chin)
    ctx.bezierCurveTo(175, 40, 195, 75, 190, 120);
    ctx.bezierCurveTo(185, 170, 155, 210, 128, 215);
    
    // Left side (chin -> cheekbone -> forehead)
    ctx.bezierCurveTo(101, 210, 71, 170, 66, 120);
    ctx.bezierCurveTo(61, 75, 81, 40, 128, 40);
    
    ctx.fill();
    ctx.stroke();

    // Subtle Vector Nose
    ctx.beginPath();
    ctx.moveTo(128, 115); // Start of bridge
    ctx.lineTo(128, 155); // Tip of nose
    ctx.lineTo(142, 165); // Right nostril flare
    
    ctx.moveTo(128, 155); // Back to tip
    ctx.lineTo(114, 165); // Left nostril flare
    
    // Tone down the nose thickness slightly to keep it subtle
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(100, 255, 255, 0.7)';
    ctx.stroke();

    // Reset styles for the eyes
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(100, 255, 255, 0.95)';

    // Helper function to draw glowing eyes
    const drawEye = (x, y) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.stroke();

      // Slit pupil
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 0, 100, 1)';
      ctx.fill();
    };

    // Left eye
    drawEye(92, 110);
    // Right eye
    drawEye(164, 110);
    // Third eye (centered on the forehead, slightly higher up to clear the nose)
    drawEye(128, 60);

    return new CanvasTexture(canvas);
  }
}