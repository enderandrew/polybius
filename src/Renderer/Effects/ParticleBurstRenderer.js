/**
 * ParticleBurstRenderer.js
 *
 * Short-lived point sprays thrown off when an enemy dies. Complements the
 * existing per-enemy vector explosion animation rather than replacing it —
 * the explosion sells the model coming apart, the particles sell the impact.
 *
 * ── One geometry, not one per burst ──────────────────────────────────────────
 *
 * A single Points object holds EVERY particle across all concurrent bursts.
 * Bursts claim a contiguous slice of the shared buffer. This means the whole
 * system is one draw call and one allocation regardless of how many enemies
 * die at once — which matters here specifically because the Superzapper kills
 * the entire screen simultaneously, the exact case where per-burst allocation
 * would spike hardest.
 *
 * Dead particles are collapsed to alpha 0 rather than removed, so the buffer
 * never resizes.
 */

import {
  BufferGeometry,
  BufferAttribute,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  Color,
} from 'three';

export default class ParticleBurstRenderer {
  static MAX_PARTICLES = 420;
  static PARTICLES_PER_BURST = 12;
  static LIFETIME_MS = 620;
  static SPEED = 1.9;

  constructor(parent) {
    this.parent = parent;
    this.max = ParticleBurstRenderer.MAX_PARTICLES;
    this.cursor = 0;

    this.positions = new Float32Array(this.max * 3);
    this.velocities = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.alphas = new Float32Array(this.max);
    this.spawnedAt = new Float64Array(this.max);
    this.alive = new Uint8Array(this.max);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('customColor', new BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('alpha', new BufferAttribute(this.alphas, 1));

    // Custom shader so each particle can carry its own colour AND alpha;
    // PointsMaterial supports neither per-vertex alpha nor per-vertex size.
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uSize: { value: 5.0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 customColor;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uSize;
        void main() {
          vColor = customColor;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (12.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.0) discard;
          // Round, soft-edged point instead of a hard square.
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = dot(d, d);
          if (r > 0.25) discard;
          float falloff = 1.0 - smoothstep(0.0, 0.25, r);
          gl_FragColor = vec4(vColor, vAlpha * falloff);
        }
      `,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false; // positions change every frame
    this.points.renderOrder = 997;
    this.parent.add(this.points);

    this._color = new Color();
  }

  /**
   * @param {{x:number,y:number,z:number}} origin
   * @param {number} colorHex
   * @param {number} [count]
   */
  burst(origin, colorHex = 0xffffff, count = ParticleBurstRenderer.PARTICLES_PER_BURST) {
    this._color.setHex(colorHex);
    const now = performance.now();

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      const i3 = i * 3;
      this.positions[i3] = origin.x;
      this.positions[i3 + 1] = origin.y;
      this.positions[i3 + 2] = origin.z;

      // Random direction on a sphere, biased slightly toward the player so
      // debris reads as coming AT you rather than spraying symmetrically.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = ParticleBurstRenderer.SPEED * (0.4 + Math.random() * 0.8);
      this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      this.velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      this.velocities[i3 + 2] = (Math.cos(phi) * speed) - speed * 0.35;

      this.colors[i3] = this._color.r;
      this.colors[i3 + 1] = this._color.g;
      this.colors[i3 + 2] = this._color.b;

      this.alphas[i] = 1;
      this.spawnedAt[i] = now;
      this.alive[i] = 1;
    }
  }

  /** @param {number} delta seconds */
  update(delta) {
    const now = performance.now();
    let anyAlive = false;

    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;

      const age = now - this.spawnedAt[i];
      if (age >= ParticleBurstRenderer.LIFETIME_MS) {
        this.alive[i] = 0;
        this.alphas[i] = 0;
        continue;
      }

      anyAlive = true;
      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * delta;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * delta;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * delta;

      // Drag, so particles decelerate instead of flying off linearly.
      const drag = 1 - Math.min(1, delta * 2.2);
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] *= drag;
      this.velocities[i3 + 2] *= drag;

      this.alphas[i] = 1 - age / ParticleBurstRenderer.LIFETIME_MS;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('alpha').needsUpdate = true;
    this.geometry.getAttribute('customColor').needsUpdate = true;
    this.points.visible = anyAlive;
  }

  dispose() {
    this.parent.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
