/**
 * PowerUpAnnouncer.js
 *
 * Speaks the name of whatever power-up was just collected, using the same
 * "retro computer" voice configuration as ScreenParodySurface's narration —
 * reused rather than duplicated by feel, not by import, since that method is
 * an instance method tied to a specific screen's canvas and isn't reusable
 * as-is. Consistent voice/pitch/rate keeps this reading as the same machine
 * talking throughout, not a separate unrelated system.
 *
 * ── Why cancel-and-restart rather than queueing ──────────────────────────────
 *
 * speechSynthesis queues utterances by default. Grabbing three power-ups in
 * two seconds would otherwise leave the announcer reading a backlog of
 * "Laser… Rapid Fire… Particle Blaster" for the next several seconds while the
 * player is already three pickups further into the level — stale information
 * arriving late is worse than no information. Cancelling before each new
 * utterance means only the MOST RECENT pickup is ever announced, matching the
 * floating text's "steal the oldest slot" behavior for the same reason.
 *
 * ── What's intentionally excluded ────────────────────────────────────────────
 *
 * Warp tokens are not announced — the three gold pips filling in on the HUD
 * are already immediate and unambiguous, so a spoken callout would be pure
 * noise on top of a signal that already works.
 */

import { getCachedVoices } from '@/utils/voiceCache';

export default class PowerUpAnnouncer {
  constructor() {
    this._onCollected = ({ detail: { type } }) => {
      this._speak(type.label.replace('\n', ' '));
    };
    this._onScore = ({ detail: { label } }) => this._speak(label);
    this._onExtraLife = () => this._speak('EXTRA LIFE');
    this._onWarp = () => this._speak('WARPING OUT');

    window.addEventListener('powerup:collected', this._onCollected);
    window.addEventListener('powerup:score', this._onScore);
    window.addEventListener('powerup:extralife', this._onExtraLife);
    window.addEventListener('powerup:warp', this._onWarp);
  }

  _speak(rawText) {
    if (!('speechSynthesis' in window)) return;

    // Strip anything that would read awkwardly (parens, punctuation) rather
    // than have the voice attempt to pronounce "SHIELD open-paren MAX".
    const text = rawText.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.4;
    utterance.rate = 1.3; // Faster than the parody narration — pickups need
    // to be over quickly, not lingered on, so the next one can't stack up.
    utterance.volume = 0.8;

    const voices = getCachedVoices();
    const roboticVoice = voices.find(
      (v) =>
        v.name.includes('Zira') ||
        v.name.includes('Google US English') ||
        v.name.includes('Microsoft'),
    );
    if (roboticVoice) utterance.voice = roboticVoice;

    window.speechSynthesis.speak(utterance);
  }

  dispose() {
    window.removeEventListener('powerup:collected', this._onCollected);
    window.removeEventListener('powerup:score', this._onScore);
    window.removeEventListener('powerup:extralife', this._onExtraLife);
    window.removeEventListener('powerup:warp', this._onWarp);
  }
}
