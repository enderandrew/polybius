/**
 * PowerUpRenderer.js
 *
 * Draws power-up icons onto a Canvas2D context so they can be used
 * as Three.js CanvasTexture sprites in the game world.
 *
 * Each shape is drawn centred on (cx, cy) within a 128×128 canvas.
 * The glow is rendered as a soft radial shadow behind the vector shape.
 *
 * Integration note:
 *   import { PowerUpRenderer } from '@/PowerUp/PowerUpRenderer';
 *   const canvas  = PowerUpRenderer.createCanvas(powerUpType);
 *   const texture = new THREE.CanvasTexture(canvas);
 */

export class PowerUpRenderer {

  static CANVAS_SIZE = 128;

  /**
   * Creates a fully rendered offscreen canvas for the given power-up type.
   * @param {object} powerUpType  - One of the PowerUpType enum values
   * @param {number} [size=128]   - Canvas pixel dimensions (square)
   * @returns {HTMLCanvasElement}
   */
  static createCanvas (powerUpType, size = PowerUpRenderer.CANVAS_SIZE) {
    const canvas  = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx     = canvas.getContext('2d');
    const cx      = size / 2;
    const cy      = size / 2;
    const r       = size * 0.34;      // Main shape radius — leaves room for glow

    PowerUpRenderer._drawGlow(ctx, cx, cy, r, powerUpType.glowColor);
    PowerUpRenderer._drawShape(ctx, cx, cy, r, powerUpType);
    PowerUpRenderer._drawLabel(ctx, cx, cy, size, powerUpType);

    return canvas;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  static _drawGlow (ctx, cx, cy, r, glowColor) {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
    grad.addColorStop(0,   glowColor);
    grad.addColorStop(0.5, glowColor.replace(/[\d.]+\)$/, '0.2)'));
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  static _drawShape (ctx, cx, cy, r, type) {
    ctx.save();
    ctx.shadowColor = type.color;
    ctx.shadowBlur  = 14;

    switch (type.shape) {

      case 'diamond':
        PowerUpRenderer._diamond(ctx, cx, cy, r, type.color);
        break;

      case 'star':
        PowerUpRenderer._star(ctx, cx, cy, r, r * 0.45, 5, type.color);
        break;

      case 'fan':
        PowerUpRenderer._fan(ctx, cx, cy, r, type.color);
        break;

      case 'beam':
        PowerUpRenderer._beam(ctx, cx, cy, r, type.color);
        break;

      case 'circle':
        PowerUpRenderer._circle(ctx, cx, cy, r, type.color);
        break;

      case 'warp':
        PowerUpRenderer._warp(ctx, cx, cy, r, type.color);
        break;

      case 'heart':
        PowerUpRenderer._heart(ctx, cx, cy, r, type.color);
        break;

      default:
        PowerUpRenderer._diamond(ctx, cx, cy, r, type.color);
    }

    ctx.restore();
  }

  // --- Individual shape drawers ---

  /** Rotated square (diamond) with inner highlight */
  static _diamond (ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.moveTo(cx,     cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx,     cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Inner diamond highlight
    const ir = r * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx,      cy - ir);
    ctx.lineTo(cx + ir, cy);
    ctx.lineTo(cx,      cy + ir);
    ctx.lineTo(cx - ir, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  }

  /** N-pointed star */
  static _star (ctx, cx, cy, outerR, innerR, points, color) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const rad   = i % 2 === 0 ? outerR : innerR;
      const x     = cx + Math.cos(angle) * rad;
      const y     = cy + Math.sin(angle) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  /** Three-pronged fan — evokes a spread shot pattern */
  static _fan (ctx, cx, cy, r, color) {
    const prongs = 3;
    const spread = Math.PI * 0.28;   // Angle between prongs
    const baseAngle = -Math.PI / 2;  // Point upward
    ctx.fillStyle   = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    for (let i = 0; i < prongs; i++) {
      const angle = baseAngle + (i - 1) * spread;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle - 0.22, angle + 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Centre circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  /** Elongated hexagon — represents a laser beam */
  static _beam (ctx, cx, cy, r, color) {
    const hw = r * 0.32;   // Half-width (narrow)
    const hh = r * 0.90;   // Half-height (tall)
    const tip = r * 0.18;  // Hex tip offset
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy - hh + tip);
    ctx.lineTo(cx + hw, cy + hh - tip);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy + hh - tip);
    ctx.lineTo(cx - hw, cy - hh + tip);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Core bright stripe
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(cx - hw * 0.3, cy - hh * 0.7, hw * 0.6, hh * 1.4);
  }

  /** Simple circle with cross-hair accent */
  static _circle (ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Score +++ tick marks
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 2;
    const angles    = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    angles.forEach(a => {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
      ctx.lineTo(cx + Math.cos(a) * r * 0.8,  cy + Math.sin(a) * r * 0.8);
      ctx.stroke();
    });
  }

  /** Double-headed arrow in a circle — warp symbol */
  static _warp (ctx, cx, cy, r, color) {
    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3.5;
    ctx.stroke();
    // Two arrows pointing in opposite directions
    const arrowLen = r * 0.55;
    const headSize = r * 0.28;
    [[1, 0], [-1, 0]].forEach(([dx]) => {
      const ax = cx + dx * arrowLen;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ax, cy);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(ax,                      cy);
      ctx.lineTo(ax - dx * headSize,      cy - headSize * 0.55);
      ctx.lineTo(ax - dx * headSize,      cy + headSize * 0.55);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
    // Centre dot
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  /** Stylised pixel heart */
  static _heart (ctx, cx, cy, r, color) {
    const s = r * 0.9;
    ctx.save();
    ctx.translate(cx, cy + s * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.2);
    // Left lobe
    ctx.bezierCurveTo(-s * 0.1, -s * 0.8, -s * 1.0, -s * 0.7, -s * 0.9, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.8,  s * 0.4, -s * 0.3,  s * 0.7,  0,         s * 0.9);
    // Right lobe
    ctx.bezierCurveTo( s * 0.3,  s * 0.7,  s * 0.8,  s * 0.4,  s * 0.9, -s * 0.1);
    ctx.bezierCurveTo( s * 1.0, -s * 0.7,  s * 0.1, -s * 0.8,  0,        -s * 0.2);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(-s * 0.32, -s * 0.18, s * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();
  }

  /** Renders the label text centred below the shape's midpoint */
  static _drawLabel (ctx, cx, cy, size, type) {
    const lines    = type.label.split('\n');
    const fontSize = Math.round(size * 0.11);
    ctx.font         = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.shadowColor  = type.color;
    ctx.shadowBlur   = 6;

    const lineH     = fontSize * 1.3;
    const totalH    = lineH * lines.length;
    const startY    = cy + size * 0.34 + lineH * 0.5;

    lines.forEach((line, i) => {
      ctx.fillText(line.trim(), cx, startY + i * lineH - totalH / 2);
    });

    ctx.shadowBlur = 0;
  }
}
