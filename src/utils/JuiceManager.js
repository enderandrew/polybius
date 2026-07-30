/**
 * JuiceManager.js
 *
 * Single owner of all "game feel" state: screen shake, hit-stop, combo,
 * camera FOV kick, chromatic aberration, vignette, desaturation, and — most
 * importantly — the BLOOM BUDGET.
 *
 * ── Why one class instead of effects wired up individually ───────────────────
 *
 * Bloom was already driven by beatGlow. Adding combo, superzapper, damage and
 * low-sanity as further independent additions to bloomPass.strength would clip
 * into a white smear the moment two fired together, and each new effect would
 * need to know about all the others to avoid it. Routing every contribution
 * through requestBloom() lets a single hard ceiling apply, and lets effects
 * that would otherwise fight for the same channel be deliberately pushed to
 * different channels (shake, chromatic, background pulse) instead.
 *
 * ── Shake: trauma model ──────────────────────────────────────────────────────
 *
 * Stores `trauma` (0..1) and shakes by trauma SQUARED. Squaring means small
 * hits stay subtle and big hits feel violent without separate tuning per
 * event, and the decay reads as a smooth settle rather than a linear cut-off.
 * Standard approach (Squirrel Eiserloh's "Math for Game Programmers").
 *
 * ── Reduce motion ────────────────────────────────────────────────────────────
 *
 * The CRT shell already layers scanlines and barrel curvature; shake on top of
 * that is genuinely nauseating for some players. reduceMotion suppresses
 * shake, FOV kick and screen-space wobble while LEAVING colour/bloom/flash
 * effects intact, so the game still reads as reactive without moving the frame.
 */

import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class JuiceManager {
  // ── Bloom budget ──────────────────────────────────────────────────────────
  /** Never let total bloom exceed this above base, regardless of stacking. */
  static BLOOM_CEILING = 0.55;

  // ── Shake ─────────────────────────────────────────────────────────────────
  static MAX_SHAKE_OFFSET = 0.55; // world units at trauma == 1
  static MAX_SHAKE_ROLL = 0.05; // radians at trauma == 1
  static TRAUMA_DECAY_PER_SEC = 1.4;

  // ── Hit-stop ──────────────────────────────────────────────────────────────
  static MAX_HITSTOP_MS = 140;

  // ── Combo ─────────────────────────────────────────────────────────────────
  static COMBO_WINDOW_MS = 1500;
  static COMBO_MILESTONE = 5;

  // ── FOV ───────────────────────────────────────────────────────────────────
  static FOV_KICK_DECAY_PER_SEC = 4.0;

  constructor() {
    this.trauma = 0;
    this.hitStopRemainingMs = 0;
    this.fovKick = 0;

    this.combo = 0;
    this._lastKillAt = 0;
    this.comboFlash = 0;

    /** 0..1, mirrors ScreenPlay's sanity drain. 1 = fine, 0 = fully degraded. */
    this.sanity = 1;

    /** Set by Game each frame from difficulty; scales shake + glitch harshness. */
    this.difficultyScale = 1;

    this.reduceMotion = false;

    // Per-frame accumulators, cleared every update()
    this._bloomRequests = 0;
    this._chromaticRequests = 0;
    this._flashRequests = 0;

    // Smoothed outputs the renderer reads
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeRoll = 0;
    this.bloomBoost = 0;
    this.chromatic = 0;
    this.vignette = 0;
    this.desaturate = 0;
    this.flash = 0;
    this.invert = 0;
    this.tear = 0;

    /** Z-axis recoil offset for the ship model; spring-damped in update(). */
    this.recoil = 0;
    this._recoilVelocity = 0;

    /** 0..1 warp intensity — drives FOV stretch and starfield speed. */
    this.warp = 0;
    this._warpTarget = 0;

    this._tearRequests = 0;
    this._invertRequests = 0;

    this._bindEvents();
  }

  // ── Public request API ────────────────────────────────────────────────────

  /**
   * @param {number} amount 0..1 — added to trauma, clamped.
   */
  addTrauma(amount) {
    if (this.reduceMotion) return;
    this.trauma = Math.min(1, this.trauma + amount * this.difficultyScale);
  }

  /** @param {number} ms */
  addHitStop(ms) {
    this.hitStopRemainingMs = Math.min(
      JuiceManager.MAX_HITSTOP_MS,
      this.hitStopRemainingMs + ms,
    );
  }

  /**
   * All bloom contributions funnel through here so the ceiling can be applied
   * once, in one place, no matter how many effects fire on the same frame.
   * @param {number} amount
   */
  requestBloom(amount) {
    this._bloomRequests += amount;
  }

  /** @param {number} amount */
  requestChromatic(amount) {
    this._chromaticRequests += amount;
  }

  /** @param {number} amount 0..1 digital tearing */
  requestTear(amount) {
    this._tearRequests = Math.max(this._tearRequests, amount);
  }

  /** @param {number} amount 0..1 full-screen colour inversion */
  requestInvert(amount) {
    this._invertRequests = Math.max(this._invertRequests, amount);
  }

  /** Kick the ship backwards; spring returns it. @param {number} amount */
  addRecoil(amount) {
    if (this.reduceMotion) return;
    this._recoilVelocity += amount;
  }

  /** @param {number} target 0..1 — held until cleared. */
  setWarp(target) {
    this._warpTarget = Math.max(0, Math.min(1, target));
  }

  /** @param {number} amount 0..1 full-screen white flash */
  requestFlash(amount) {
    this._flashRequests = Math.max(this._flashRequests, amount);
  }

  /** @param {number} degrees */
  addFovKick(degrees) {
    if (this.reduceMotion) return;
    this.fovKick += degrees;
  }

  registerKill() {
    const now = Date.now();
    if (now - this._lastKillAt <= JuiceManager.COMBO_WINDOW_MS) {
      this.combo++;
    } else {
      this.combo = 1;
    }
    this._lastKillAt = now;

    if (this.combo > 0 && this.combo % JuiceManager.COMBO_MILESTONE === 0) {
      this.comboFlash = 1;
      this.addTrauma(0.12);
      this.requestBloom(0.12);
      window.dispatchEvent(
        new CustomEvent('juice:combo-milestone', { detail: { combo: this.combo } }),
      );
    }
  }

  /** Combo multiplies score; grows slowly so it never dwarfs difficulty scaling. */
  getComboMultiplier() {
    return 1 + Math.min(1.0, Math.floor(this.combo / JuiceManager.COMBO_MILESTONE) * 0.1);
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  /**
   * @param {number} delta - REAL seconds; juice decays in wall time so it is
   *   unaffected by TIME_DILATION (a slowed world shouldn't shake longer).
   * @return {number} milliseconds of hit-stop to consume this frame.
   */
  update(delta) {
    // Trauma decay + shake sampling
    this.trauma = Math.max(
      0,
      this.trauma - JuiceManager.TRAUMA_DECAY_PER_SEC * delta,
    );

    if (this.reduceMotion || this.trauma <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeRoll = 0;
    } else {
      // Squared: small hits subtle, big hits violent, smooth settle.
      const magnitude = this.trauma * this.trauma;
      this.shakeX = (Math.random() * 2 - 1) * magnitude * JuiceManager.MAX_SHAKE_OFFSET;
      this.shakeY = (Math.random() * 2 - 1) * magnitude * JuiceManager.MAX_SHAKE_OFFSET;
      this.shakeRoll = (Math.random() * 2 - 1) * magnitude * JuiceManager.MAX_SHAKE_ROLL;
    }

    // Combo expiry
    if (this.combo > 0 && Date.now() - this._lastKillAt > JuiceManager.COMBO_WINDOW_MS) {
      this.combo = 0;
    }
    this.comboFlash = Math.max(0, this.comboFlash - delta * 2.5);

    // FOV kick decay
    this.fovKick +=
      (0 - this.fovKick) * Math.min(1, JuiceManager.FOV_KICK_DECAY_PER_SEC * delta);
    if (Math.abs(this.fovKick) < 0.01) this.fovKick = 0;

    // ── Bloom budget: sum all requests, then clamp ONCE ──────────────────────
    // Sustained sources (combo) contribute less per-unit than impulses so a
    // long combo can't sit permanently at the ceiling and flatten the beat.
    const comboBloom = Math.min(0.15, (this.combo / 40) * 0.15);
    this.bloomBoost = Math.min(
      JuiceManager.BLOOM_CEILING,
      this._bloomRequests + comboBloom,
    );
    this._bloomRequests = 0;

    // ── Chromatic aberration: impulses + sanity degradation ─────────────────
    const sanityChromatic = (1 - this.sanity) * 0.5;
    this.chromatic = Math.min(
      1,
      this._chromaticRequests + sanityChromatic * this.difficultyScale,
    );
    this._chromaticRequests = 0;

    // ── Flash decays fast; it's an impulse, not a state ────────────────────
    this.flash = Math.max(0, Math.max(this.flash - delta * 4.5, this._flashRequests));
    this._flashRequests = 0;

    // ── Tearing and inversion: sharp impulses, decay faster than flash ─────
    this.tear = Math.max(0, Math.max(this.tear - delta * 5.0, this._tearRequests));
    this._tearRequests = 0;

    // Inversion decays fastest of all — a subliminal frame should be gone
    // almost before it registers consciously.
    this.invert = Math.max(0, Math.max(this.invert - delta * 12.0, this._invertRequests));
    this._invertRequests = 0;

    // ── Recoil spring ──────────────────────────────────────────────────────
    // Critically-damped-ish spring: strong restoring force, heavy damping, so
    // it snaps back without oscillating into a wobble.
    const RECOIL_STIFFNESS = 260;
    const RECOIL_DAMPING = 22;
    this._recoilVelocity += -RECOIL_STIFFNESS * this.recoil * delta;
    this._recoilVelocity -= this._recoilVelocity * Math.min(1, RECOIL_DAMPING * delta);
    this.recoil += this._recoilVelocity * delta;
    if (Math.abs(this.recoil) < 0.0005 && Math.abs(this._recoilVelocity) < 0.005) {
      this.recoil = 0;
      this._recoilVelocity = 0;
    }

    // ── Warp easing ────────────────────────────────────────────────────────
    // Asymmetric: ramps in fast (the lurch), eases out slowly (the rubber-band
    // release) rather than snapping back.
    const warpRate = this._warpTarget > this.warp ? 4.5 : 1.6;
    this.warp += (this._warpTarget - this.warp) * Math.min(1, warpRate * delta);
    if (Math.abs(this.warp - this._warpTarget) < 0.002) this.warp = this._warpTarget;

    // ── Sanity also desaturates and darkens the edges ───────────────────────
    this.desaturate = Math.max(this.desaturate * 0.9, (1 - this.sanity) * 0.35);

    // Hit-stop consumption
    let consumed = 0;
    if (this.hitStopRemainingMs > 0) {
      consumed = Math.min(this.hitStopRemainingMs, delta * 1000);
      this.hitStopRemainingMs -= consumed;
    }
    return consumed;
  }

  /**
   * Vignette is driven by external state (lives, dilation) rather than
   * requests, so Game sets it explicitly each frame.
   *
   * @param {number} amount 0..1
   */
  setVignette(amount) {
    this.vignette = Math.max(0, Math.min(1, amount));
  }

  /** @param {number} amount 0..1 */
  setDesaturateFloor(amount) {
    this.desaturate = Math.max(this.desaturate, amount);
  }

  reset() {
    this.trauma = 0;
    this.hitStopRemainingMs = 0;
    this.fovKick = 0;
    this.combo = 0;
    this.comboFlash = 0;
    this.flash = 0;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _bindEvents() {
    // MessageBroker is publish-only with a per-topic queue that AudioManager
    // drains, so subscribing to it here would race the audio consumer for the
    // same messages. Juice therefore listens to window CustomEvents, which are
    // broadcast (every listener sees every event) — the same channel
    // PowerUpHUD and PickupTextRenderer already use.
    this._onSuperzapper = () => {
      this.requestFlash(0.85);
      this.requestBloom(0.35);
      this.requestChromatic(0.5);
      this.addTrauma(0.75);
      this.addHitStop(90);
      this.addFovKick(6);
      this.requestTear(0.6);
      // Subliminal inverted frame on the biggest moment in the game.
      this.requestInvert(0.85);
    };
    this._onPlayerDeath = () => {
      this.requestFlash(0.5);
      this.addTrauma(0.9);
      this.addHitStop(120);
      this.requestChromatic(0.7);
      this.combo = 0;
    };
    this._onEnemyDeath = () => {
      this.registerKill();
      this.addTrauma(0.035);
    };
    this._onGrenade = () => {
      this.addTrauma(0.28);
      this.requestBloom(0.12);
      this.addHitStop(35);
    };
    this._onDash = () => {
      this.addFovKick(-4);
      this.addTrauma(0.06);
    };
    this._onPlayerHit = () => {
      // Violent channel separation for a moment — the "took a hit" tell.
      this.addTrauma(0.4);
      this.requestChromatic(0.9);
      this.requestTear(0.7);
      this.addHitStop(60);
      this.combo = 0;
    };
    this._onShieldBreak = () => {
      this.requestTear(1.0);
      this.requestChromatic(1.0);
      this.addTrauma(0.5);
      this.requestFlash(0.3);
      this.addHitStop(70);
    };
    this._onPhantomAttack = () => {
      this.requestTear(0.85);
      this.requestChromatic(0.6);
      this.addTrauma(0.25);
    };
    this._onSubliminal = ({ detail }) => {
      // A single inverted frame plus a barely-visible word.
      this.requestInvert(detail?.invert ?? 0.9);
    };
    this._onFire = () => this.addRecoil(-1.6);
    this._onAuditorCut = () => {
      // A hard signal break on arrival, so the scene reads as an interruption
      // rather than a normal screen transition. No shake — he is never
      // announced by violence.
      this.requestTear(1.0);
      this.requestChromatic(0.8);
      this.requestInvert(0.5);
    };
    this._onAuditorTone = ({ detail }) => {
      // Slow chromatic climb across the scene that never resolves.
      this.requestChromatic(0.15 + (detail?.progress ?? 0) * 0.45);
    };

    window.addEventListener('juice:superzapper', this._onSuperzapper);
    window.addEventListener('juice:player-death', this._onPlayerDeath);
    window.addEventListener('juice:enemy-death', this._onEnemyDeath);
    window.addEventListener('juice:grenade', this._onGrenade);
    window.addEventListener('juice:dash', this._onDash);
    window.addEventListener('juice:player-hit', this._onPlayerHit);
    window.addEventListener('juice:shield-break', this._onShieldBreak);
    window.addEventListener('juice:phantom-attack', this._onPhantomAttack);
    window.addEventListener('juice:subliminal', this._onSubliminal);
    window.addEventListener('juice:fire', this._onFire);
    window.addEventListener('juice:auditor-cut', this._onAuditorCut);
    window.addEventListener('juice:auditor-tone', this._onAuditorTone);
  }

  dispose() {
    window.removeEventListener('juice:superzapper', this._onSuperzapper);
    window.removeEventListener('juice:player-death', this._onPlayerDeath);
    window.removeEventListener('juice:enemy-death', this._onEnemyDeath);
    window.removeEventListener('juice:grenade', this._onGrenade);
    window.removeEventListener('juice:dash', this._onDash);
    window.removeEventListener('juice:player-hit', this._onPlayerHit);
    window.removeEventListener('juice:shield-break', this._onShieldBreak);
    window.removeEventListener('juice:phantom-attack', this._onPhantomAttack);
    window.removeEventListener('juice:subliminal', this._onSubliminal);
    window.removeEventListener('juice:fire', this._onFire);
    window.removeEventListener('juice:auditor-cut', this._onAuditorCut);
    window.removeEventListener('juice:auditor-tone', this._onAuditorTone);
  }

  /** Convenience so callers don't all import CustomEvent boilerplate. */
  static emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`juice:${name}`, { detail }));
  }
}

export { messageBroker, MessageBroker };
