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

  /** Dark stroke behind the text, so it stays readable over bright art. */
  static TEXT_OUTLINE_COLOR = 'rgba(2, 4, 6, 0.92)';
  static TEXT_OUTLINE_WIDTH = 6;

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

    // -Infinity, not 0: guarantees the first update() call always draws
    // regardless of what performance.now() returns. Relying on "now will be
    // large at construction time" held in practice but wasn't actually
    // guaranteed, and getting it wrong means the scene opens on a blank
    // canvas for one throttle interval.
    this._lastRedrawAt = -Infinity;

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

  /**
   * Minimum time between redraws. The only thing that genuinely animates on
   * this screen is the ember's slow sine flicker (see _drawEmber) — nothing
   * else in draw() changes frame to frame. Redrawing at 60fps for that meant
   * uploading the full 1024x768 canvas texture (3 MB) to the GPU 60 times a
   * second, continuously, for the entire scene: ~180 MB/s sustained, ~2.5 GB
   * transferred over the longest single scene. ~15 Hz is well above what a
   * slow flicker needs and cuts that by 75%.
   */
  static REDRAW_INTERVAL_MS = 66;

  update() {
    const now = performance.now();
    if (now - this._lastRedrawAt < ScreenAuditor.REDRAW_INTERVAL_MS) {
      return;
    }
    this._lastRedrawAt = now;

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

    // Extra padding below the last line, and the fade doesn't reach zero
    // until past that padding — the previous version faded out exactly at the
    // block's own edge, which under-covered the last line whenever it sat
    // over something bright (the arcade screen behind "OR THE REST OF THEIR
    // LIFE" in the subject-12 scene).
    const height = 120 + this.lines.length * 52 + 40;
    const gradient = this.context.createLinearGradient(0, 60, 0, 60 + height);
    gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
    gradient.addColorStop(0.85, 'rgba(0,0,0,0.78)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    this.context.fillStyle = gradient;
    this.context.fillRect(0, 60, this.canvasResX, height);
  }

  /** Largest and smallest sizes auto-fit will choose between. */
  static MAX_FONT_PX = 34;
  static MIN_FONT_PX = 20;

  /**
   * Finds the largest font size (between MIN and MAX) at which every line
   * fits within the available width.
   *
   * Computed fresh on every call rather than cached once: measureText() is
   * only accurate once the VectorBattle font has actually loaded, and this
   * screen's update() deliberately redraws every frame regardless of
   * fontReady (for the ember flicker and fades). Recomputing live means an
   * early frame that measures against the browser's fallback font
   * self-corrects the moment the real font swaps in, rather than locking in a
   * wrong size from the race.
   *
   * @param {number} maxWidth
   * @return {number}
   */
  _fitFontSize(maxWidth) {
    for (
      let size = ScreenAuditor.MAX_FONT_PX;
      size >= ScreenAuditor.MIN_FONT_PX;
      size -= 1
    ) {
      this.setFontSizePx(size);
      const widest = this.lines.reduce(
        (max, line) =>
          line === '' ? max : Math.max(max, this.context.measureText(line).width),
        0,
      );
      if (widest <= maxWidth) return size;
    }
    return ScreenAuditor.MIN_FONT_PX;
  }

  _drawLines() {
    if (this.lines.length === 0) return;

    this.context.textAlign = 'left';
    this.context.textBaseline = 'alphabetic';
    this.context.lineJoin = 'round';

    // Left-offset and high, not centred — the parody screen centres, so this
    // reads as a different system immediately.
    const startX = 90;
    const startY = 180;
    const rightMargin = 40;
    const maxWidth = this.canvasResX - startX - rightMargin;

    // "thank you for your continued participation" at the old fixed 34px ran
    // 203px past the canvas edge — several scenes were being clipped outright
    // rather than just looking cramped. Auto-fit per scene so short lines
    // ("OBEY") stay large and only genuinely long ones shrink.
    const fontSize = this._fitFontSize(maxWidth);
    this.setFontSizePx(fontSize);
    const lineHeight = Math.round(fontSize * 1.53); // matches the original 52/34 ratio

    // No shadowBlur on the body text. A glow here is a large area of bright
    // pixels, which is precisely what the bloom pass amplifies into an
    // unreadable smear. The ember keeps its glow; the text does not need one.
    this.context.shadowBlur = 0;

    this.lines.forEach((line, i) => {
      if (line === '') return;
      const y = startY + i * lineHeight;

      // Dark outline drawn BEFORE the fill. The gradient scrim only helps
      // where it's opaque; over bright art (an arcade screen's own glow, a
      // window, a highlight) it can fade below full coverage and the text
      // gets lost — this line from the arcade cabinet scene is where that
      // showed up. A stroke works regardless of what's behind it, and being
      // dark rather than bright it adds no bloom the way a glow would.

      this.context.lineWidth = ScreenAuditor.TEXT_OUTLINE_WIDTH;
      this.context.strokeStyle = ScreenAuditor.TEXT_OUTLINE_COLOR;
      this.context.strokeText(line, startX, y);

      this.context.fillStyle = ScreenAuditor.TEXT_COLOR;
      this.context.fillText(line, startX, y);
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
