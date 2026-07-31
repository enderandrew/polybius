import Canvas3d from '@/Object/Screen/Canvas3d';
import ScreenContentManager from '@/Object/Screen/ScreenContentManager';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class ScreenPlay extends Canvas3d {
  /** Sanity points lost per second. 0.02 * 60fps = 1.2, matching the old per-frame rate exactly. */
  static SANITY_DRAIN_PER_SEC = 1.2;

  score = 0;
  targetScore = 0;
  scoreRisingSpeed = 10;
  displaySuperzapperHint = true;

  // Polybius Parody: Sanity Meter mechanic
  sanityLevel = 100;

  lastGlitchTimestamp = 0;
  isGlitchingScore = false;
  isGlitchingHint = false;

  /**
   * Fractional sanity owed since the last whole-point deduction. Needed
   * because delta-based drain rarely lands on an exact integer per frame —
   * accumulating the remainder is what keeps the rate accurate over time
   * instead of rounding error slowly drifting it.
   */
  _sanityDrainAccumulator = 0;

  constructor(
    screenContentManager,
    width = 8,
    height = 8,
    canvasResX = 1024,
    canvasResY = 1024,
  ) {
    super(screenContentManager, width, height, canvasResX, canvasResY);
    this.score = this.screenContentManager.get(ScreenContentManager.KEY_SCORE);
  }

  /**
   * Randomly replace characters with gaps, simulating dropped glyphs on a
   * failing display. Only ever called when `active` is true.
   *
   * @param {string} text
   * @param {boolean} active
   * @return {string}
   */
  _corruptText(text, active) {
    if (!active) return text;
    let out = '';
    for (const ch of text) {
      out += Math.random() > 0.9 ? ' ' : ch;
    }
    return out;
  }

  update(delta = 1 / 60) {
    this.targetScore = this.screenContentManager.get(
      ScreenContentManager.KEY_SCORE,
    );

    // Track score changes
    if (this.score !== this.targetScore) {
      this.score += this.scoreRisingSpeed;

      if (this.score > this.targetScore) {
        this.score = this.targetScore;
      }
      this._dirty = true;
    }

    // The failing-HUD jitter only reads as motion if we redraw continuously.
    if (this.screenContentManager.get(ScreenContentManager.KEY_LIVES) === 1) {
      this._dirty = true;
    }

    // Gradually drain sanity.
    //
    // This used to be `Math.random() > 0.98` evaluated once per FRAME — a 2%
    // chance per frame, not per second, so sanity (and everything that reads
    // it: JuicePass scanlines/grain, the CRT brt-low class, and the Auditor
    // scene trigger's chance-to-fire) drained up to 4x faster on a 240Hz
    // display than a 60Hz one. SANITY_DRAIN_PER_SEC = 1.2 reproduces the old
    // 60fps rate exactly (0.02 * 60 = 1.2), so this is a pure bugfix, not a
    // pacing change, on the display the game was tuned against.
    if (this.sanityLevel > 0) {
      this._sanityDrainAccumulator += ScreenPlay.SANITY_DRAIN_PER_SEC * delta;

      if (this._sanityDrainAccumulator >= 1) {
        const whole = Math.floor(this._sanityDrainAccumulator);
        this.sanityLevel = Math.max(0, this.sanityLevel - whole);
        this._sanityDrainAccumulator -= whole;
      }
    }

    // --- GLITCH TIMER LOGIC ---
    const isLosingSanity = this.sanityLevel < 50;
    if (isLosingSanity) {
      const now = Date.now();
      // Only recalculate glitches every 100ms (10 times a second)
      if (now - this.lastGlitchTimestamp > 100) {
        this.lastGlitchTimestamp = now;

        // Cache the visual state to be used by draw()
        this.isGlitchingScore = Math.random() > 0.8;
        this.isGlitchingHint = Math.random() > 0.9;

        this._dirty = true; // Force redraw to show the flicker
      }
    } else if (this.isGlitchingScore || this.isGlitchingHint) {
      // Clean up glitches immediately if sanity is restored
      this.isGlitchingScore = false;
      this.isGlitchingHint = false;
      this._dirty = true;
    }

    this.messageBrokerScreenTopicConsumer();
    super.update();
  }

  messageBrokerScreenTopicConsumer() {
    let message = messageBroker.consume(MessageBroker.TOPIC_SCREEN);

    if (message === null) {
      return;
    }

    if (message.isMessage(MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED)) {
      this.displaySuperzapperHint = false;
      this._dirty = true;
    }
  }

  draw() {
    this.clearCanvas();

    // Determine if graphics should alter based on player status
    const isLosingSanity = this.sanityLevel < 50;
    if (isLosingSanity) {
      const now = Date.now();
      // Only recalculate glitches every 100ms (10 times a second)
      if (now - this.lastGlitchTimestamp > 100) {
        this.lastGlitchTimestamp = now;

        // Cache the visual state to be used by draw()
        this.isGlitchingScore = Math.random() > 0.8;
        this.isGlitchingHint = Math.random() > 0.9;

        this._dirty = true; // Force redraw to show the flicker
      }
    } else if (this.isGlitchingScore || this.isGlitchingHint) {
      // Clean up glitches immediately if sanity is restored
      this.isGlitchingScore = false;
      this.isGlitchingHint = false;
      this._dirty = true;
    }
    const scoreColor = this.isGlitchingScore
      ? Canvas3d.COLOR_RED
      : Canvas3d.COLOR_BLUE;

    this.setFontSizePx(60);
    // On the last life the HUD reads as a failing system: the score jitters
    // and occasionally drops characters. Driven off lives rather than sanity
    // so it's a distinct, unmistakable "you are about to die" signal.
    const critical =
      this.screenContentManager.get(ScreenContentManager.KEY_LIVES) === 1;
    const jitterX = critical ? (Math.random() - 0.5) * 6 : 0;
    const jitterY = critical ? (Math.random() - 0.5) * 4 : 0;

    this.drawText(
      this._corruptText(this.alignNumberToRight(this.score), critical),
      50 + jitterX,
      120 + jitterY,
      scoreColor,
    );

    for (
      let i = 0;
      i < this.screenContentManager.get(ScreenContentManager.KEY_LIVES);
      i++
    ) {
      this.drawLiveIcon(50 + i * 62, 150);
    }

    this.setFontSizePx(25);

    if (this.displaySuperzapperHint) {
      if (
        this.screenContentManager.get(
          ScreenContentManager.KEY_SUPERZAPPER_USED,
        ) === false
      ) {
        // Use the cached glitch state for the subliminal hint
        const hintText = this.isGlitchingHint
          ? 'OBEY'
          : 'Press F to use SuperZapper';

        this.drawText(hintText, 240, 1000, Canvas3d.COLOR_BLUE);
      }
    }

    this.drawText(
      this.alignNumberToRight(
        this.screenContentManager.get(ScreenContentManager.KEY_HIGHEST_SCORE)
          .score,
      ),
      400,
      90,
      Canvas3d.COLOR_BLUE,
    );
    this.drawText(
      this.screenContentManager.get(ScreenContentManager.KEY_HIGHEST_SCORE)
        .name,
      580,
      90,
      Canvas3d.COLOR_BLUE,
    );

    this.drawText('LEVEL', 400, 140, Canvas3d.COLOR_GREEN);
    this.drawText(
      this.alignNumberToRight(
        this.screenContentManager.get(ScreenContentManager.KEY_LEVEL),
      ),
      505,
      140,
      Canvas3d.COLOR_GREEN,
    );
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param scale
   */
  drawLiveIcon(x, y, scale = 1) {
    let unit = 3 * scale;
    this.context.strokeStyle = Canvas3d.COLOR_RED;

    this.context.beginPath();
    this.context.moveTo(x, y + 3 * unit);
    this.context.lineTo(x + 5 * unit, y + 6 * unit);
    this.context.lineTo(x + 5 * unit, y + 3.5 * unit);
    this.context.lineTo(x + 10 * unit, y + 3.5 * unit);
    this.context.lineTo(x + 10 * unit, y + 6 * unit);
    this.context.lineTo(x + 15 * unit, y + 3 * unit);
    this.context.lineTo(x + 7.5 * unit, y);
    this.context.lineTo(x, y + 3 * unit);
    this.context.stroke();
  }
}
