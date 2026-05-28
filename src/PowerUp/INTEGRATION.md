# Power-Up System — Integration Guide

## File structure

Copy the four source files into your project:

```
src/
  PowerUp/
    PowerUpType.js        ← Enum of all 7 types + weighted random picker
    PowerUpRenderer.js    ← Draws each icon onto an offscreen Canvas2D
    PowerUp.js            ← In-world collectible entity (THREE.Sprite)
    PowerUpSpawner.js     ← Manages drops, world updates, collision
    PowerUpManager.js     ← Applies effects, tracks timers, exposes weapon queries
    PowerUpHUD.vue        ← Vue component — countdown bars + flash banners
```

---

## 1. Boot: create the singletons

In your main game file (e.g. `Game.js` or `App.vue`):

```js
import { PowerUpManager } from '@/PowerUp/PowerUpManager';
import { PowerUpSpawner  } from '@/PowerUp/PowerUpSpawner';

// After scene + webGeometry are ready:
this.powerUpManager = new PowerUpManager();
this.powerUpSpawner = new PowerUpSpawner(this.scene, this.webGeometry);
```

---

## 2. Mount the HUD

In your root Vue component template, inside the game frame:

```vue
<template>
  <div id="game-frame">
    <canvas id="display" />
    <PowerUpHUD :power-up-manager="powerUpManager" />
  </div>
</template>

<script>
import PowerUpHUD from '@/PowerUp/PowerUpHUD.vue';
export default {
  components: { PowerUpHUD },
  data() { return { powerUpManager: null }; },
  mounted() { this.powerUpManager = this.$game.powerUpManager; },
};
</script>
```

---

## 3. Game tick — update spawner + manager

In your main `requestAnimationFrame` loop:

```js
tick(delta) {
  this.powerUpSpawner.update(delta);
  this.powerUpManager.update(delta);

  // Collision check — call once per frame
  const collected = this.powerUpSpawner.checkPlayerCollision(
    this.player.lane,
    1.2           // collection radius in depth units
  );
  if (collected) {
    this.powerUpManager.collect(collected, this.gameState);
  }
}
```

---

## 4. Enemy death → drop

In your enemy-death handler (e.g. `EnemyBase.onDeath()`):

```js
onDeath() {
  // ... existing death logic ...
  this.game.powerUpSpawner.tryDrop(this);
  //  ↑  enemy must expose .lane, .depth, .tier ('normal'|'elite'|'boss')
}
```

---

## 5. Weapon system — query the manager each shot

In your `PlayerWeapon.js` or equivalent, replace hardcoded constants:

```js
fire() {
  const mgr = this.game.powerUpManager;

  // Shot cooldown
  if (this.cooldownRemaining > 0) return;
  this.cooldownRemaining = mgr.getShotCooldown(BASE_COOLDOWN_MS);

  // Angle spread (1 shot normally, 5 with Spread Gun)
  const angles = mgr.getShotAngles();
  angles.forEach(angleOffset => {
    const bullet = this.spawnBullet(angleOffset);
    bullet.damage         = mgr.getBulletDamage(BASE_DAMAGE);
    bullet.lengthMultiplier = mgr.getBulletLengthMultiplier();
  });
}
```

---

## 6. Spike clearing — query Particle Laser multiplier

In your Superzapper / spike-dig logic:

```js
const digRate = BASE_DIG_RATE * this.game.powerUpManager.getSpikeDigMultiplier();
```

---

## 7. gameState contract

`PowerUpManager.collect()` expects your `gameState` object to have:

```js
{
  score:         Number,   // read/write
  lives:         Number,   // read/write
  requestWarp:   Function, // called to advance to next level
}
```

Adapt to your existing state shape as needed.

---

## 8. Events reference

Listen on `window` from any system without tight coupling:

| Event                | detail                        | Fires when                          |
|----------------------|-------------------------------|-------------------------------------|
| `powerup:collected`  | `{ type, remaining }`         | Timed weapon picked up              |
| `powerup:expired`    | `{ type }`                    | Timed weapon runs out               |
| `powerup:score`      | `{ amount, label }`           | Zappo 2000 or Outta Here collected  |
| `powerup:extralife`  | —                             | 1UP collected                       |
| `powerup:warp`       | —                             | Outta Here warp triggered           |

---

## 9. webGeometry contract

`PowerUp` calls `this.webGeometry.lanePositionAt(lane, depth)` which must return a
`THREE.Vector3` (or `null` if the position is off the web). This maps to however
your existing web/tube geometry tracks lane positions — adapt the method name as
needed.

---

## 10. Tuning drop rates

Edit the `dropWeight` values in `PowerUpType.js` freely — higher = more common.
Edit `DROP_CHANCE` constants in `PowerUpSpawner.js` for overall drop frequency per
enemy tier. The defaults are:

| Tier    | Chance |
|---------|--------|
| Normal  | 18 %   |
| Elite   | 40 %   |
| Boss    | 100 %  |
