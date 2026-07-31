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

export default class ScreenAuditor extends Canvas3d {
  static TEXT_COLOR = '#7ea8b4';
  static EMBER_COLOR = '#ff6a1a';

  /** Art is drawn below full brightness so it stays under the bloom cutoff. */
  static ART_BRIGHTNESS = 0.86;

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

    this._drawTextScrim();
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
    const x = (this.canvasResX - w) / 2;
    const y = (this.canvasResY - h) / 2;

    // Drawn below full brightness. Even with the bloom threshold raised, a
    // photographic still with blown highlights is a large area of near-white
    // feeding a wide-radius bloom; pulling the whole image down keeps it under
    // the cutoff instead of relying on the cutoff alone.
    this.context.globalAlpha = ScreenAuditor.ART_BRIGHTNESS;
    this.context.drawImage(this.image, x, y, w, h);
    this.context.globalAlpha = 1;
  }

  /**
   * Darken behind the text block so lines stay readable over bright art
   * without having to dim the art any further.
   */
  _drawTextScrim() {
    if (this.lines.length === 0) return;

    const height = 120 + this.lines.length * 52;
    const gradient = this.context.createLinearGradient(0, 60, 0, 60 + height);
    gradient.addColorStop(0, 'rgba(0,0,0,0.82)');
    gradient.addColorStop(0.75, 'rgba(0,0,0,0.72)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    this.context.fillStyle = gradient;
    this.context.fillRect(0, 60, this.canvasResX, height);
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

    // No shadowBlur on the body text. A glow here is a large area of bright
    // pixels, which is precisely what the bloom pass amplifies into an
    // unreadable smear. The ember keeps its glow; the text does not need one.
    this.context.fillStyle = ScreenAuditor.TEXT_COLOR;
    this.context.shadowBlur = 0;

    this.lines.forEach((line, i) => {
      if (line === '') return;
      this.context.fillText(line, startX, startY + i * lineHeight);
    });
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
      this.context.shadowBlur = 14;
      this.context.beginPath();
      this.context.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.shadowBlur = 0;
    this.context.globalAlpha = 1;
  }
}
