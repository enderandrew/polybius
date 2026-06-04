/**
 * EnemyVoidFuseball.js
 *
 * A Fuseball that intermittently phases out during its movement state,
 * becoming invulnerable and flickering — making it genuinely hard to
 * land a shot against.
 *
 * Normal Fuseblls are already immune during lane switches (FLAG_IMMUNE is
 * set by the parent's updateState). This variant adds a second immunity
 * window that fires randomly while the enemy is moving along a line,
 * where the player would normally have a clear shot.
 *
 * Phase behaviour:
 *   • Checks every ~150ms whether to enter a phase (4% chance per check).
 *   • Each phase lasts 400–1200ms.
 *   • A 1500–3500ms cooldown follows before the next check begins.
 *   • Phasing is suppressed during lane switches (already immune) and
 *     during explosion/death transitions.
 *   • `isPhasing` is a public boolean read by EnemyFuseballRenderer to
 *     drive the strobe + void-halo visual effects.
 *
 * Rendering: The model runs at 75% baseline opacity (spectral feel).
 *   During a phase it strobes rapidly. A ring of six dashed violet arcs
 *   orbits counter-clockwise — distinct from both Gravity's solid orange
 *   arcs and Supernova's gyroscope rings.
 *
 * Introduced at level 32 — the last Fuseball variant, arriving just before
 * Fuseball Tanker (33) as a difficulty peak.
 *
 * Level curve:
 *   11  Fuseball             random wanderer
 *   21  Gravity Fuseball     relentless pursuer
 *   27  Supernova Fuseball   punishes careless shots
 *   32  Void Fuseball        timing-based challenge      ← this class
 *   33  Fuseball Tanker
 *
 * Extends: EnemyFuseball
 * Flag:    this.isVoid = true
 */

import EnemyFuseball from '@/Object/Enemies/EnemyFuseball';

export default class EnemyVoidFuseball extends EnemyFuseball {

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isVoid        = true;
    this.valueInPoints = 350;

    // Extra HP because the player gets fewer clean shot windows.
    this.hitPoints = this.isStrong ? 3 : 2;

    // Phase state — public, polled by EnemyFuseballRenderer each frame.
    this.isPhasing = false;

    // Wall-clock timing: don't phase within the first 2 seconds of spawning.
    this._nextPhaseCheck = performance.now() + 2000;
    this._phaseEndsAt    = 0;
  }

  // ---------------------------------------------------------------------------
  // updateEntity override
  //
  // The parent's updateEntity() handles all normal Fuseball logic, including
  // setting this.hittable = !FLAG_IMMUNE every frame.  Our code runs AFTER
  // super so we can override hittable when phasing without fighting the parent.
  // ---------------------------------------------------------------------------
  updateEntity () {
    super.updateEntity();

    // Don't phase during the exploding/dead transitions — let the explosion
    // visual play cleanly.
    if (
      this.inState(EnemyFuseball.STATE_EXPLODING) ||
      this.inState(EnemyFuseball.STATE_DEAD)
    ) {
      this.isPhasing = false;
      return;
    }

    const now = performance.now();

    if (this.inState(EnemyFuseball.STATE_MOVING_ALONG_LINE)) {

      // ── Try to trigger a new phase ─────────────────────────────────────────
      if (!this.isPhasing && now >= this._nextPhaseCheck) {
        if (Math.random() < 0.04) {
          // Enter phase: 400–1200ms duration
          this.isPhasing     = true;
          this._phaseEndsAt  = now + 400 + Math.random() * 800;
          // Next check: cooldown of 1500–3500ms after phase ends
          this._nextPhaseCheck = this._phaseEndsAt + 1500 + Math.random() * 2000;
        } else {
          // Didn't trigger — poll again in 150ms
          this._nextPhaseCheck = now + 150;
        }
      }

      // ── End the phase when the timer expires ───────────────────────────────
      if (this.isPhasing && now >= this._phaseEndsAt) {
        this.isPhasing = false;
      }

    } else {
      // During lane switches or any other state, clear any active phase.
      // (The lane-switch immunity from FLAG_IMMUNE still applies independently.)
      this.isPhasing = false;
    }

    // ── Phase immunity overrides the hittable value set by super ─────────────
    if (this.isPhasing) {
      this.hittable = false;
    }
  }
}
