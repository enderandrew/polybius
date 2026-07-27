import {
  Group,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  AdditiveBlending,
  MathUtils,
  Vector3,
  DoubleSide
} from 'three';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class SignalDegradation extends Group {
  speedMultiplier = 1.0;
  easterEggTimer = 0;
  glitches = [];
  ghosts = [];

  constructor(numGlitches = 20, size = 250) {
    super();
    this.size = size;

    // Create a pool of static noise/glitch bars in the background
    for (let i = 0; i < numGlitches; i++) {
      const width = 10 + Math.random() * 80;
      const height = 0.2 + Math.random() * 1.5;
      const geo = new PlaneGeometry(width, height);
      const mat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0, // Hidden until triggered
        side: DoubleSide,
        depthWrite: false,
      });

      const mesh = new Mesh(geo, mat);
      this._resetGlitch(mesh);
      this.add(mesh);
      this.glitches.push(mesh);
    }
  }

  pulse(intensity) {
    this.speedMultiplier = intensity;
    // On heavy audio beats, force a brief burst of noise flashes
    this.glitches.forEach((g) => {
      if (Math.random() < 0.3) {
        g.material.opacity = 0.15 + Math.random() * 0.25;
      }
    });
  }

  update(delta) {
    this.speedMultiplier += (1.0 - this.speedMultiplier) * delta * 6.0;

    // Randomly flash glitch strips for 1-2 frames
    for (let i = 0; i < this.glitches.length; i++) {
      const g = this.glitches[i];

      if (g.material.opacity > 0) {
        g.material.opacity -= delta * 4.0; // Rapid fade out
        if (g.material.opacity < 0) g.material.opacity = 0;
      } else if (Math.random() < 0.02) {
        // Random flash trigger
        this._resetGlitch(g);
        g.material.opacity = 0.1 + Math.random() * 0.3;
      }
    }

    // Easter Egg Logic: 1% chance every second to spawn a Ghost
    this.easterEggTimer += delta;
    if (this.easterEggTimer >= 1.0) {
      this.easterEggTimer -= 1.0;
      if (Math.random() < 0.01) {
        this._spawnGhost();
      }
    }

    // Update active Ghosts
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i];
      ghost.position.addScaledVector(ghost.userData.velocity, delta);

      // Floating / undulating bobbing motion
      ghost.position.y += Math.sin(performance.now() * 0.003 + ghost.userData.phase) * 0.1;

      // Clean up when it drifts far out of frame
      if (Math.abs(ghost.position.x) > 160 || Math.abs(ghost.position.y) > 100) {
        this.remove(ghost);
        ghost.material.map.dispose();
        ghost.geometry.dispose();
        ghost.material.dispose();
        this.ghosts.splice(i, 1);
      }
    }
  }

  _resetGlitch(mesh) {
    mesh.position.set(
      MathUtils.randFloatSpread(this.size),
      MathUtils.randFloatSpread(this.size * 0.6),
      20 + Math.random() * 100
    );
    // Random horizontal stretch
    const scaleX = 0.5 + Math.random() * 2.0;
    mesh.scale.set(scaleX, 1, 1);
  }

  _spawnGhost() {
    const tex = this._createGhostTexture();
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
      side: DoubleSide,
    });

    const geo = new PlaneGeometry(35, 45);
    const ghostMesh = new Mesh(geo, mat);

    const movingRight = Math.random() > 0.5;
    const startX = movingRight ? -140 : 140;
    const speed = movingRight ? 20 : -20;

    ghostMesh.position.set(startX, -10 + (Math.random() - 0.5) * 40, 80);
    ghostMesh.userData.velocity = new Vector3(speed, 5 + Math.random() * 5, 0);
    ghostMesh.userData.phase = Math.random() * Math.PI * 2;

    this.add(ghostMesh);
    this.ghosts.push(ghostMesh);

    // Audio cue trigger
    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_SPOOKY
    );
  }

  _createGhostTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 320);

    // Ethereal white vector glow
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillStyle = 'rgba(200, 220, 255, 0.25)';
    ctx.lineWidth = 4;

    // Classic Pac-Man / Arcade style sheet ghost with wavy bottom
    ctx.beginPath();
    ctx.moveTo(128, 30); // Rounded head top
    ctx.bezierCurveTo(50, 30, 40, 100, 40, 200); // Left side
    
    // Wavy bottom skirt
    ctx.lineTo(65, 270);
    ctx.lineTo(90, 240);
    ctx.lineTo(115, 270);
    ctx.lineTo(140, 240);
    ctx.lineTo(165, 270);
    ctx.lineTo(190, 240);
    ctx.lineTo(216, 270);

    ctx.bezierCurveTo(216, 100, 206, 30, 128, 30); // Right side
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Dark hollow eyes
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.ellipse(95, 110, 16, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(161, 110, 16, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    return new CanvasTexture(canvas);
  }
}