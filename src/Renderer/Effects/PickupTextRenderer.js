/**
 * PickupTextRenderer.js
 *
 * Spawns a small billboarded text sprite at the shooter's position whenever a
 * power-up is collected, which rises and fades out over ~1.1s.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The corner-of-screen HUD strip (PowerUpHUD) is easy to miss during active
 * play — the player is looking at the tube, not the corner. Text that appears
 * right where the pickup happened, in the player's direct line of sight, is
 * much harder to miss. This complements PowerUpHUD rather than replacing it.
 *
 * ── Why a pool, not spawn-and-destroy ────────────────────────────────────────
 *
 * A fresh CanvasTexture + Sprite per pickup would repeat the exact GPU-texture
 * churn documented as a problem elsewhere in this codebase (Canvas3d screens
 * leaking VRAM on every transition). Pickups are infrequent compared to, say,
 * projectiles, but "infrequent" during a long session still adds up if nothing
 * is ever reused. A fixed pool of N canvases, redrawn in place, allocates once
 * and never again for the life of the level.
 *
 * ── Why world-space Sprites, not a DOM overlay ───────────────────────────────
 *
 * A Sprite billboards to the camera automatically and lives at a real (x, y, z)
 * in the tube, so it convincingly reads as "at the pickup," including receding
 * correctly with depth. A DOM overlay would need its own screen-space
 * projection math to track a moving 3D point and would break the "floats in
 * the tube" read the effect is going for.
 *
 * ── Listener lifecycle ───────────────────────────────────────────────────────
 *
 * Self-binds to the same window CustomEvents PowerUpHUD already listens to
 * (powerup:collected / powerup:score / powerup:extralife / powerup:warp) —
 * PowerUpManager doesn't need to know this class exists. dispose() removes the
 * listener; LevelRenderer calls it from releaseLevel() alongside everything
 * else, so nothing survives a level change.
 */

import { Sprite, SpriteMaterial, CanvasTexture, Vector3 } from 'three';

export default class PickupTextRenderer {
  static POOL_SIZE = 5;
  static CANVAS_WIDTH = 256;
  static CANVAS_HEIGHT = 64;
  static LIFETIME_MS = 1100;
  static RISE_DISTANCE = 0.9; // world units travelled over LIFETIME_MS
  static SPRITE_WORLD_WIDTH = 1.3;

  /**
   * @param {ShooterRenderer} shooterRenderer - read live at spawn time so the
   *   text always appears at the ship's CURRENT position, not a stale one.
   * @param {import('three').Object3D} parent - added as children of this.
   */
  constructor(shooterRenderer, parent) {
    this.shooterRenderer = shooterRenderer;
    this.parent = parent;
    this.slots = [];

    for (let i = 0; i < PickupTextRenderer.POOL_SIZE; i++) {
      this.slots.push(this._createSlot());
    }

    this._onCollected = ({ detail: { type } }) => {
      this._spawn(type.label.replace('\n', ' '), type.color ?? '#ffffff');
    };
    this._onScore = ({ detail: { label } }) => {
      this._spawn(label, '#aaffaa');
    };
    this._onExtraLife = () => this._spawn('EXTRA LIFE', '#00ff44');
    this._onWarp = () => this._spawn('WARPING OUT', '#ffffff');

    window.addEventListener('powerup:collected', this._onCollected);
    window.addEventListener('powerup:score', this._onScore);
    window.addEventListener('powerup:extralife', this._onExtraLife);
    window.addEventListener('powerup:warp', this._onWarp);
  }

  _createSlot() {
    const canvas = document.createElement('canvas');
    canvas.width = PickupTextRenderer.CANVAS_WIDTH;
    canvas.height = PickupTextRenderer.CANVAS_HEIGHT;
    const context = canvas.getContext('2d');

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const sprite = new Sprite(material);
    const aspect = PickupTextRenderer.CANVAS_WIDTH / PickupTextRenderer.CANVAS_HEIGHT;
    sprite.scale.set(
      PickupTextRenderer.SPRITE_WORLD_WIDTH,
      PickupTextRenderer.SPRITE_WORLD_WIDTH / aspect,
      1,
    );
    sprite.visible = false;
    sprite.renderOrder = 999; // draw on top of tube geometry

    this.parent.add(sprite);

    return {
      canvas,
      context,
      texture,
      material,
      sprite,
      active: false,
      startedAt: 0,
      startPos: new Vector3(),
    };
  }

  /**
   * Spawn at an explicit world position rather than at the ship — used for
   * score pop-ups, which must appear where the ENEMY died, not where the
   * player happens to be standing.
   *
   * @param {{x:number,y:number,z:number}} position
   * @param {string} text
   * @param {string} color
   * @param {number} [scale] multiplier on the default sprite size
   */
  spawnAt(position, text, color, scale = 1) {
    this._spawn(text, color, position, scale);
  }

  /**
   * @param {string} text
   * @param {string} color - CSS color string.
   * @param {?object} position - world position; defaults to the ship.
   * @param {number} [scale]
   */
  _spawn(text, color, position = null, scale = 1) {
    const origin = position ?? this.shooterRenderer?.position;
    if (!origin) return;

    // All slots busy: steal the one that has been running longest rather than
    // silently dropping the new pickup — a rapid multi-pickup should always
    // show the latest one, never nothing.
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((oldest, s) =>
        s.startedAt < oldest.startedAt ? s : oldest,
      );
    }

    const { context, canvas } = slot;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `bold 30px "VectorBattle", monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    // Second pass sharpens the glyph core inside the glow.
    context.shadowBlur = 0;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    slot.texture.needsUpdate = true;

    const aspect =
      PickupTextRenderer.CANVAS_WIDTH / PickupTextRenderer.CANVAS_HEIGHT;
    slot.sprite.scale.set(
      PickupTextRenderer.SPRITE_WORLD_WIDTH * scale,
      (PickupTextRenderer.SPRITE_WORLD_WIDTH * scale) / aspect,
      1,
    );

    slot.startPos.copy(origin);
    slot.startedAt = performance.now();
    slot.active = true;
    slot.sprite.visible = true;
    slot.sprite.position.copy(slot.startPos);
    slot.material.opacity = 1;
  }

  update() {
    const now = performance.now();

    for (const slot of this.slots) {
      if (!slot.active) continue;

      const elapsed = now - slot.startedAt;
      const progress = Math.min(1, elapsed / PickupTextRenderer.LIFETIME_MS);

      // Ease-out rise: fast at first, settling — reads as "popping up" rather
      // than a constant-velocity drift.
      const eased = 1 - Math.pow(1 - progress, 2);
      slot.sprite.position.y =
        slot.startPos.y + eased * PickupTextRenderer.RISE_DISTANCE;

      // Hold fully opaque briefly, then fade — keeps short pickups legible
      // instead of starting to vanish the instant they appear.
      const fadeStart = 0.35;
      slot.material.opacity =
        progress < fadeStart
          ? 1
          : 1 - (progress - fadeStart) / (1 - fadeStart);

      if (progress >= 1) {
        slot.active = false;
        slot.sprite.visible = false;
      }
    }
  }

  dispose() {
    window.removeEventListener('powerup:collected', this._onCollected);
    window.removeEventListener('powerup:score', this._onScore);
    window.removeEventListener('powerup:extralife', this._onExtraLife);
    window.removeEventListener('powerup:warp', this._onWarp);

    for (const slot of this.slots) {
      this.parent.remove(slot.sprite);
      slot.texture.dispose();
      slot.material.dispose();
    }
    this.slots = [];
  }
}
