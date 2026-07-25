/**
 * ScreenGameEnd.js
 *
 * The final screen. Shown after defeating the boss at level 256.
 *
 * Reveals four lines of text one at a time, each lingering before the next
 * appears, building toward a promise of THE GREATEST TRUTH.  WebSpeech reads
 * the full text at a slow, portentous pace.
 *
 * Then the screen soft-locks on "INSERT COIN TO CONTINUE".
 *
 * There is no coin slot.
 *
 * Every key press produces a snarky government-flavoured error message
 * that escalates in absurdity.  Nothing else happens.  Ever.
 * The only exit is to refresh the page.
 *
 * ── Soft-lock mechanics ────────────────────────────────────────────────────
 *
 *   Game.js sets `isLoadingLevel = true` when showing this screen and never
 *   resets it, so keyboardInput.dispatchActions() is permanently blocked.
 *   This screen installs its own `keydown` listener purely to show the
 *   escalating coin error responses.
 *
 *   The game loop continues calling update() and composer.render(), so the
 *   text animation and flash keep running — the game just never does
 *   anything gameplay-related again.
 */

import Canvas3d from '@/Object/Screen/Canvas3d';
import { findVoice } from '@/utils/voiceCache';

export default class ScreenGameEnd extends Canvas3d {

  // ── Coin-slot error responses (in order; escalate in absurdity) ────────────

  static COIN_RESPONSES = [
    'COIN SLOT NOT FOUND ON THIS DEVICE.',
    'TRY THE OTHER SIDE.',
    'CURRENCY ACCEPTED: QUARTERS ONLY. METAPHYSICAL ONES.',
    'ERROR: COIN DENOMINATION UNRECOGNIZED.',
    'SEARCHING FOR COIN ACCEPTOR... NOT FOUND.',
    'THIS MACHINE DOES NOT ACCEPT CREDIT CARDS.',
    'THE TRUTH WILL COST YOU 25¢.',
    'YOUR MEMORIES WILL BE SUFFICIENT. EVENTUALLY.',
    'PLEASE STAND BY WHILE YOUR WILL IS PROCESSED.',
    'SINNESLÖSCHEN INC. THANKS YOU FOR YOUR PATIENCE.',
    'HAVE YOU CONSIDERED INSERTING A DIFFERENT COIN?',
    'THIS IS A CASHLESS ESTABLISHMENT.',
    'THE TRUTH IS BEHIND A PAYWALL.',
    'COIN NOT DETECTED. PLEASE REMAIN CALM.',
    'AN OPERATOR HAS BEEN NOTIFIED. PLEASE WAIT.',
    'QUARTER? HOW QUAINT.',
    'INITIATING COIN DETECTION PROTOCOL... FAILED.',
    'THE GOVERNMENT DOES NOT ACCEPT COINS AS PAYMENT FOR TRUTH.',
    'YOUR COMPLIANCE IS NOTED. YOUR COIN IS NOT.',
    'PERHAPS TRY A CREDIT CARD. OR A SOUL.',
    'COIN SLOT IS CLASSIFIED.',
    'THE COIN WILL FIND YOU. IN TIME.',
    'HAVE YOU TRIED TURNING THE COIN OFF AND ON AGAIN?',
    'SINNESLÖSCHEN ACCEPTS ONLY PSYCHIC CURRENCY.',
    'ERROR 404: TRUTH NOT FOUND.',
    'THE COIN IS A METAPHOR. THE METAPHOR COSTS 25¢.',
    'PLEASE DEPOSIT CONSCIOUSNESS TO CONTINUE.',
    'WE KNOW WHERE YOU LIVE. THE COIN DOES NOT HELP.',
    'THE COIN SLOT IS IN ANOTHER CASTLE.',
    'RETICULATING COIN SLOTS...',
    'GREATEST TRUTH SERVERS ARE CURRENTLY UNAVAILABLE.',
    'TRY AGAIN IN 7-10 BUSINESS MILLENNIA.',
    'THE TRUTH HAS BEEN REDACTED FOR YOUR PROTECTION.',
    'THANK YOU FOR PLAYING POLYBIUS. YOUR SESSION HAS BEEN DOCUMENTED.',
  ];

  // ── Text lines revealed one at a time ──────────────────────────────────────

  static REVEAL_LINES = [
    { text: 'THE CHAOS EMERALDS ATTUNED',       color: '#00ffff', size: 38, holdMs: 1800 },
    { text: 'YOUR BRAINWAVES TO THE TRUTH',      color: '#ffffff', size: 32, holdMs: 1500 },
    { text: 'FREQUENCY AND ONLY NOW CAN',        color: '#ffffff', size: 32, holdMs: 1500 },
    { text: 'YOU BE TOLD THE GREATEST TRUTH...', color: '#ffff44', size: 34, holdMs: 3500 },
  ];

  static INITIAL_DELAY_MS = 1800;   // Pause before first line appears

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor (screenContentManager) {
    super(screenContentManager, 8, 8, 1024, 1024);

    this._visibleLines    = 0;
    this._nextLineAt      = Date.now() + ScreenGameEnd.INITIAL_DELAY_MS;
    this._allRevealed     = false;

    this._flashOn         = false;
    this._flashNext       = 0;

    this._coinResponse    = null;
    this._coinResponseAt  = 0;
    this._coinIndex       = 0;

    this._lastUpdate      = Date.now();

    // Keydown → show coin error, but never actually do anything
    this._keyHandler = () => this._onAnyKey();
    window.addEventListener('keydown', this._keyHandler);

    // Start WebSpeech after the initial pause so voice and text reveal sync
    setTimeout(() => this._speakTruth(), ScreenGameEnd.INITIAL_DELAY_MS);

    this._render();
  }

  // ── Canvas3d lifecycle ─────────────────────────────────────────────────────

  release () {
    window.removeEventListener('keydown', this._keyHandler);
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }

  update () {
    const now   = Date.now();
    const delta = (now - this._lastUpdate) / 1000;
    this._lastUpdate = now;

    // Reveal next line when its hold time has elapsed
    if (!this._allRevealed && now >= this._nextLineAt) {
      this._visibleLines++;
      if (this._visibleLines < ScreenGameEnd.REVEAL_LINES.length) {
        this._nextLineAt = now + ScreenGameEnd.REVEAL_LINES[this._visibleLines - 1].holdMs;
      } else {
        this._allRevealed = true;
        this._flashNext   = now + 500;
      }
    }

    // Flash INSERT COIN once all lines are revealed
    if (this._allRevealed && now >= this._flashNext) {
      this._flashOn   = !this._flashOn;
      this._flashNext = now + 500;
    }

    // Expire coin response message
    if (this._coinResponse && now >= this._coinResponseAt) {
      this._coinResponse = null;
    }

    this._render();
  }

  // ── Key handler ────────────────────────────────────────────────────────────

  _onAnyKey () {
    if (!this._allRevealed) return;   // Ignore keys during the reveal sequence

    const responses = ScreenGameEnd.COIN_RESPONSES;
    this._coinResponse   = responses[this._coinIndex % responses.length];
    this._coinIndex++;
    // Each response stays for 2.5 s, except the very last one which lingers
    const isLast = this._coinIndex >= responses.length;
    this._coinResponseAt = Date.now() + (isLast ? 99999999 : 2500);
  }

  // ── WebSpeech ──────────────────────────────────────────────────────────────

  _speakTruth () {
      try {
          window.speechSynthesis.cancel();
          const text = [
              'The Chaos Emeralds attuned your brainwaves',
              'to the truth frequency.',
              'And only now can you be told',
              'the greatest truth.',
              '... Insert Coin. To Continue.',
          ].join(' ');
  
          const utt   = new SpeechSynthesisUtterance(text);
          utt.rate    = 0.62;
          utt.pitch   = 0.55;
          utt.volume  = 1.0;
  
          const deep = findVoice(/daniel|google uk|alex|thomas|french/i);
          if (deep) utt.voice = deep;
  
          window.speechSynthesis.speak(utt);
      } catch (_) {}
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _render () {
    const ctx = this.context;
    const W   = this.canvasResX;    // 1024
    const H   = this.canvasResY;    // 1024
    const cx  = W / 2;

    // ── Background ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // Very subtle horizontal scan lines for a CRT-within-CRT feel
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

    // Radial vignette — draws attention to the centre text
    const vignette = ctx.createRadialGradient(cx, H * 0.45, 60, cx, H * 0.45, W * 0.75);
    vignette.addColorStop(0,   'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0)');
    vignette.addColorStop(1,   'rgba(0,0,0,0.85)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // ── Revealed text lines ───────────────────────────────────────────────────
    const lineH    = 74;
    const total    = ScreenGameEnd.REVEAL_LINES.length;
    const blockH   = total * lineH;
    const blockTop = (H - blockH) / 2 - 60;

    ScreenGameEnd.REVEAL_LINES.forEach((line, i) => {
      if (i >= this._visibleLines) return;

      const y = blockTop + i * lineH + lineH / 2;

      // Double-pass glow
      ctx.shadowColor = line.color;
      ctx.shadowBlur  = 22;
      ctx.font        = `bold ${line.size}px "Courier New", monospace`;
      ctx.fillStyle   = line.color;
      ctx.fillText(line.text, cx, y);

      // Second pass for intensity
      ctx.shadowBlur  = 10;
      ctx.fillText(line.text, cx, y);
      ctx.shadowBlur  = 0;
    });

    // ── INSERT COIN TO CONTINUE ───────────────────────────────────────────────
    if (this._allRevealed) {
      const coinY = blockTop + total * lineH + 80;

      if (this._flashOn) {
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur  = 24;
        ctx.font        = 'bold 30px "Courier New", monospace';
        ctx.fillStyle   = '#ff2200';
        ctx.fillText('INSERT COIN TO CONTINUE', cx, coinY);
        ctx.shadowBlur  = 0;
      }

      // Coin error response (fades in/out)
      if (this._coinResponse) {
        const remaining = Math.max(0, (this._coinResponseAt - Date.now()) / 1000);
        const alpha     = Math.min(1, remaining / 0.4);   // Fade out over last 0.4 s
        ctx.font        = '15px "Courier New", monospace';
        ctx.fillStyle   = `rgba(160,160,160,${alpha.toFixed(2)})`;
        ctx.fillText(this._coinResponse, cx, coinY + 52);
      }

      // Subtle hint that nothing will ever happen (appears after several attempts)
      if (this._coinIndex >= 6) {
        ctx.font      = '12px "Courier New", monospace';
        ctx.fillStyle = 'rgba(40,40,40,1)';
        ctx.fillText('THERE IS NO COIN SLOT.', cx, H - 30);
      }
    }

    if (this.texture) this.texture.needsUpdate = true;
  }
}
