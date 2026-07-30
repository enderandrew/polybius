/**
 * ScreenAuditor.js
 *
 * Renders one hidden meta-narrative scene. Deliberately the tonal inverse of
 * ScreenParodySurface: lowercase, left-aligned, no exclamation marks, no
 * centred punchline, and large amounts of deliberate empty space.
 *
 * ── Why it looks "wrong" on purpose ──────────────────────────────────────────
 *
 * The parody screen centres bright text and shouts. Everything here is offset,
 * dim, and monospaced. The player should register that this is not the same
 * system talking before they've read a word.
 *
 * ── Art ──────────────────────────────────────────────────────────────────────
 *
 * Optional per-scene image drawn UNDER the text. Loads async; if it hasn't
 * arrived (or 404s because the art isn't drawn yet) the scene still runs with
 * text only, so the arc is playable before any art exists.
 */

import Canvas3d from '@/Object/Screen/Canvas3d';
import AuditorProgress from '@/utils/AuditorProgress';
import { POLYBIUS_SQUARE } from '@/Assets/AuditorScenes';

export default class ScreenAuditor extends Canvas3d {
  static TEXT_COLOR = '#7ea8b4';
  static EMBER_COLOR = '#ff6a1a';
  static CIPHER_COLOR = '#00ff44';

  /**
   * @param {ScreenContentManager} screenContentManager
   * @param {object} scene       an entry from AuditorScenes
   * @param {Object<string,string>} tokens
   */
  constructor(screenContentManager, scene, tokens) {
    super(screenContentManager);

    this.scene = scene;
    this.tokens = tokens;
    this.startedAt = performance.now();
    this.image = null;

    this.lines = (scene.lines ?? []).map((line) =>
      AuditorProgress.resolve(line, tokens),
    );

    if (scene.art) {
      // Fire and forget. A missing image must never block the scene.
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this._dirty = true;
      };
      img.onerror = () => {
        console.debug(`[Auditor] art not found: ${scene.art}`);
      };
      img.src = scene.art;
    }

    this._dirty = true;
  }

  /** @return {number} 0..1 through the scene's hold. */
  progress() {
    return Math.min(
      1,
      (performance.now() - this.startedAt) / this.scene.holdMs,
    );
  }

  update() {
    // Redraw continuously: the ember flickers and several scenes fade in.
    this.draw();
    this.queueTextureUpdate();
  }

  draw() {
    this.clearCanvas();

    this.context.fillStyle = 'rgba(0, 0, 0, 1)';
    this.context.fillRect(0, 0, this.canvasResX, this.canvasResY);

    if (this.image) {
      this._drawArt();
    }

    if (this.scene.special === 'cipher-grid') {
      this._drawCipherGrid();
    }

    this._drawLines();
    this._drawEmber();
  }

  _drawArt() {
    // Contain-fit, centred — art is authored 1:1 but this keeps any aspect
    // mismatch from stretching the Auditor, whose proportions are the point.
    const scale = Math.min(
      this.canvasResX / this.image.width,
      this.canvasResY / this.image.height,
    );
    const w = this.image.width * scale;
    const h = this.image.height * scale;

    this.context.globalAlpha = 1;
    this.context.drawImage(
      this.image,
      (this.canvasResX - w) / 2,
      (this.canvasResY - h) / 2,
      w,
      h,
    );
  }

  _drawLines() {
    if (this.lines.length === 0) return;

    this.setFontSizePx(34);
    this.context.textAlign = 'left';
    this.context.textBaseline = 'alphabetic';

    // Left-offset and high, not centred — the parody screen centres, so this
    // reads as a different system immediately.
    const startX = 90;
    const startY = 180;
    const lineHeight = 52;

    this.context.fillStyle = ScreenAuditor.TEXT_COLOR;
    this.context.shadowColor = ScreenAuditor.TEXT_COLOR;
    this.context.shadowBlur = 6;

    this.lines.forEach((line, i) => {
      if (line === '') return;
      this.context.fillText(line, startX, startY + i * lineHeight);
    });

    this.context.shadowBlur = 0;
  }

  _drawCipherGrid() {
    const square = POLYBIUS_SQUARE;
    const cell = 84;
    const gridW = cell * 5;
    const originX = (this.canvasResX - gridW) / 2;
    const originY = 420;

    this.context.strokeStyle = ScreenAuditor.CIPHER_COLOR;
    this.context.globalAlpha = 0.65;
    this.context.lineWidth = 2;

    for (let i = 0; i <= 5; i++) {
      this.context.beginPath();
      this.context.moveTo(originX, originY + i * cell);
      this.context.lineTo(originX + gridW, originY + i * cell);
      this.context.stroke();

      this.context.beginPath();
      this.context.moveTo(originX + i * cell, originY);
      this.context.lineTo(originX + i * cell, originY + gridW);
      this.context.stroke();
    }

    this.context.globalAlpha = 1;
    this.setFontSizePx(44);
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillStyle = ScreenAuditor.CIPHER_COLOR;

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        this.context.fillText(
          square[r][c],
          originX + c * cell + cell / 2,
          originY + r * cell + cell / 2,
        );
      }
    }

    this.context.textAlign = 'left';
    this.context.textBaseline = 'alphabetic';
  }

  /**
   * The single warm point. Present in every scene — the Auditor is always
   * there, even when he isn't rendered.
   */
  _drawEmber() {
    const special = this.scene.special;
    const positions = [];

    if (special === 'ember-corner') {
      positions.push({ x: this.canvasResX - 120, y: this.canvasResY - 120 });
    } else if (special === 'ember-corner-double') {
      positions.push({ x: this.canvasResX - 120, y: this.canvasResY - 120 });
      positions.push({ x: this.canvasResX - 190, y: this.canvasResY - 96 });
    } else if (!this.scene.art) {
      // Text-only scenes with no explicit placement still get one.
      positions.push({ x: this.canvasResX - 120, y: this.canvasResY - 120 });
    }

    if (positions.length === 0) return;

    // Slow irregular flicker — a cigarette breathing, not a blinking cursor.
    const t = performance.now() * 0.0011;
    const flicker = 0.72 + Math.sin(t) * 0.12 + Math.sin(t * 2.7) * 0.08;

    for (const pos of positions) {
      this.context.globalAlpha = flicker;
      this.context.fillStyle = ScreenAuditor.EMBER_COLOR;
      this.context.shadowColor = ScreenAuditor.EMBER_COLOR;
      this.context.shadowBlur = 26;
      this.context.beginPath();
      this.context.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.shadowBlur = 0;
    this.context.globalAlpha = 1;
  }
}
