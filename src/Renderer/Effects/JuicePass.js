/**
 * JuicePass.js
 *
 * One full-screen shader combining chromatic aberration, vignette,
 * desaturation, scanline intensification and white flash.
 *
 * ── Why combined rather than four separate passes ────────────────────────────
 *
 * EffectComposer runs each pass as its own full-screen draw with its own
 * render-target ping-pong. Four separate passes = four full-screen reads and
 * writes per frame on top of bloom's existing multi-pass pyramid. Since all
 * five of these effects are cheap per-pixel maths on the same sampled texel,
 * folding them into a single shader costs one pass instead of four — a real
 * saving given the game already ships bloom + SMAA and targets mobile.
 *
 * All uniforms default to 0 (fully inert), so the pass is a no-op until
 * JuiceManager drives it.
 */

import { ShaderMaterial, Vector2 } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass';

const JuiceShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChromatic: { value: 0.0 },
    uVignette: { value: 0.0 },
    uDesaturate: { value: 0.0 },
    uFlash: { value: 0.0 },
    uScanline: { value: 0.0 },
    uGrain: { value: 0.0 },
    uInvert: { value: 0.0 },
    uTear: { value: 0.0 },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uChromatic;
    uniform float uVignette;
    uniform float uDesaturate;
    uniform float uFlash;
    uniform float uScanline;
    uniform float uGrain;
    uniform float uInvert;
    uniform float uTear;
    uniform vec2  uResolution;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // ── Digital tearing ───────────────────────────────────────────────────
      // Horizontal bands displaced sideways by a per-band random amount. Done
      // here rather than via three's GlitchPass because that would add a 5th
      // full-screen pass with its own noise texture, and because its glitches
      // fire on an internal random timer — this version is driven precisely by
      // the events that should cause it.
      if (uTear > 0.001) {
        float band = floor(uv.y * 24.0);
        float n = hash(vec2(band, floor(uTime * 20.0)));
        if (n > 1.0 - uTear * 0.55) {
          uv.x += (n - 0.5) * uTear * 0.18;
        }
      }

      vec2 centered = uv - 0.5;

      // ── Chromatic aberration ──────────────────────────────────────────────
      // Offset scales with distance from centre, so the middle of the screen
      // (where the player is looking) stays readable while the edges smear.
      float dist = length(centered);
      vec2 offset = centered * uChromatic * 0.012 * dist;

      vec4 color;
      if (uChromatic > 0.001) {
        color.r = texture2D(tDiffuse, uv + offset).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - offset).b;
        color.a = 1.0;
      } else {
        color = texture2D(tDiffuse, uv);
      }

      // ── Desaturation ──────────────────────────────────────────────────────
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(color.rgb, vec3(luma), uDesaturate);

      // ── Scanline intensification ──────────────────────────────────────────
      // Layered ON TOP of the existing CSS scanline overlay; this one is
      // gameplay-driven and only appears as sanity degrades.
      if (uScanline > 0.001) {
        float line = sin(uv.y * uResolution.y * 1.5 + uTime * 2.0);
        color.rgb *= 1.0 - uScanline * 0.12 * (0.5 + 0.5 * line);
      }

      // ── Film grain ────────────────────────────────────────────────────────
      // Folded into this shader rather than adding three's FilmPass, which
      // would be another full-screen pass duplicating the scanlines this pass
      // already draws.
      if (uGrain > 0.001) {
        float g = hash(uv * uResolution + uTime * 60.0);
        color.rgb += (g - 0.5) * uGrain * 0.18;
      }

      // ── Subliminal inversion ──────────────────────────────────────────────
      color.rgb = mix(color.rgb, vec3(1.0) - color.rgb, uInvert);

      // ── Vignette ──────────────────────────────────────────────────────────
      float vig = smoothstep(0.8, 0.25, dist);
      color.rgb *= mix(1.0, vig, uVignette);

      // ── Flash (additive, applied last so nothing dims it) ─────────────────
      color.rgb += vec3(uFlash);

      gl_FragColor = color;
    }
  `,
};

export default class JuicePass extends Pass {
  constructor(width = 1, height = 1) {
    super();

    this.material = new ShaderMaterial({
      uniforms: JuiceShader.uniforms,
      vertexShader: JuiceShader.vertexShader,
      fragmentShader: JuiceShader.fragmentShader,
    });

    this.material.uniforms.uResolution.value.set(width, height);
    this.fsQuad = new FullScreenQuad(this.material);
    this._elapsed = 0;
  }

  /**
   * @param {JuiceManager} juice
   * @param {number} delta
   */
  syncFrom(juice, delta) {
    this._elapsed += delta;
    const u = this.material.uniforms;
    u.uChromatic.value = juice.chromatic;
    u.uVignette.value = juice.vignette;
    u.uDesaturate.value = juice.desaturate;
    u.uFlash.value = juice.flash;
    // Scanlines ride the same sanity signal as desaturation.
    u.uScanline.value = 1 - juice.sanity;
    // A base level of grain always present (CRT noise floor), rising with
    // degradation so the picture visibly gets dirtier as sanity drains.
    u.uGrain.value = 0.12 + (1 - juice.sanity) * 0.5;
    u.uInvert.value = juice.invert;
    u.uTear.value = juice.tear;
    u.uTime.value = this._elapsed;
  }

  setSize(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer /* , deltaTime, maskActive */) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.fsQuad.render(renderer);
    }
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
