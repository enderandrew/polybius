/**
 * AuditorProgress.js
 *
 * Tracks how far through the hidden arc the player is, plus the playtime and
 * session data the scenes quote back at them.
 *
 * ── Obfuscation ──────────────────────────────────────────────────────────────
 *
 * Stored under an innocuous key with a base64+offset encoding. This is NOT
 * security — anyone determined will read it in thirty seconds. It exists so a
 * casual devtools poke while debugging something unrelated doesn't spoil
 * twelve scenes at once, and so the key name doesn't advertise itself in a
 * localStorage listing.
 *
 * ── Trigger probability ──────────────────────────────────────────────────────
 *
 * Base 1%, which is the intended rarity: save keys stop at surface 241, so
 * players replay long stretches, and the arc is designed to unfold across many
 * runs rather than one. On top of that base, sanity contributes — ScreenPlay
 * already drains sanityLevel over a session, so a long unbroken sitting raises
 * the odds. That's the legend encoding itself into the mechanic: compulsive
 * play is what makes the machine show you more.
 */

const STORAGE_KEY = 'polybius_cfg_b';
const OFFSET = 17;

export default class AuditorProgress {
  /** Chance per level-clear with a fresh mind. */
  static BASE_CHANCE = 0.01;
  /** Additional chance at fully drained sanity. */
  static SANITY_BONUS = 0.05;

  constructor() {
    this.seenCount = 0;
    this.sessionCount = 0;
    this.totalPlaytimeMs = 0;
    this.finished = false;

    this.sessionStartedAt = Date.now();
    this._load();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // First ever boot: this counts as session 1.
        this.sessionCount = 1;
        this._save();
        return;
      }

      const json = atob(raw)
        .split('')
        .map((c) => String.fromCharCode(c.charCodeAt(0) - OFFSET))
        .join('');
      const data = JSON.parse(json);

      this.seenCount = Number(data.s) || 0;
      this.sessionCount = (Number(data.n) || 0) + 1;
      this.totalPlaytimeMs = Number(data.t) || 0;
      this.finished = !!data.f;
      this._save();
    } catch {
      // Corrupt or unreadable — start over rather than breaking the boot.
      this.seenCount = 0;
      this.sessionCount = 1;
      this.totalPlaytimeMs = 0;
      this.finished = false;
    }
  }

  _save() {
    try {
      const json = JSON.stringify({
        s: this.seenCount,
        n: this.sessionCount,
        t: Math.round(this.totalPlaytimeMs + this.sessionElapsedMs()),
        f: this.finished,
      });
      const encoded = btoa(
        json
          .split('')
          .map((c) => String.fromCharCode(c.charCodeAt(0) + OFFSET))
          .join(''),
      );
      localStorage.setItem(STORAGE_KEY, encoded);
    } catch {
      // Non-fatal: the arc just won't persist across reloads.
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** @return {number} */
  sessionElapsedMs() {
    return Date.now() - this.sessionStartedAt;
  }

  /** @return {number} 1-based id of the scene that comes next, or 0 if done. */
  nextSceneId(totalScenes) {
    if (this.seenCount >= totalScenes) return 0;
    return this.seenCount + 1;
  }

  /**
   * @param {number} sanity 0..1 from ScreenPlay
   * @param {number} totalScenes
   * @return {boolean}
   */
  shouldTrigger(sanity, totalScenes) {
    if (this.nextSceneId(totalScenes) === 0) return false;

    const drained = 1 - Math.max(0, Math.min(1, sanity));
    const chance =
      AuditorProgress.BASE_CHANCE + drained * AuditorProgress.SANITY_BONUS;

    return Math.random() < chance;
  }

  /** Called once a scene has actually been shown. */
  recordSceneSeen(totalScenes) {
    this.seenCount = Math.min(totalScenes, this.seenCount + 1);
    if (this.seenCount >= totalScenes) this.finished = true;
    this._save();
  }

  /**
   * Scene 12 appears to wipe the counter. It doesn't wipe `finished`, so the
   * attract-mode ember persists forever afterward.
   */
  performFakeReset() {
    this.seenCount = 0;
    this.finished = true;
    this._save();
  }

  /** Persist accumulated playtime; called periodically and on unload. */
  flush() {
    this.totalPlaytimeMs += this.sessionElapsedMs();
    this.sessionStartedAt = Date.now();
    this._save();
  }

  // ── Token values for scene text ───────────────────────────────────────────

  /**
   * @param {object} gameState { highestLevel }
   * @return {Object<string,string>}
   */
  buildTokens(gameState = {}) {
    const now = new Date();
    const hours = now.getHours();

    let timeOfDay = 'night';
    if (hours >= 5 && hours < 12) timeOfDay = 'morning';
    else if (hours >= 12 && hours < 17) timeOfDay = 'afternoon';
    else if (hours >= 17 && hours < 22) timeOfDay = 'evening';

    let timezone = 'unknown';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
    } catch {
      // Some locked-down environments throw; the token just reads "unknown".
    }

    return {
      sessionElapsed: AuditorProgress.formatDuration(this.sessionElapsedMs()),
      totalPlaytime: AuditorProgress.formatDuration(
        this.totalPlaytimeMs + this.sessionElapsedMs(),
      ),
      localTime: `${String(hours).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}`,
      timeOfDay,
      timezone,
      sessionCount: String(this.sessionCount),
      // Always three more than the player has actually played. The gap is the
      // horror; it must stay consistent so a suspicious player can verify it.
      phantomCount: String(this.sessionCount + 3),
      highestLevel: String(gameState.highestLevel ?? 1),
    };
  }

  /** @param {number} ms @return {string} */
  static formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  /**
   * @param {string} line
   * @param {Object<string,string>} tokens
   * @return {string}
   */
  static resolve(line, tokens) {
    return line.replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match,
    );
  }
}
