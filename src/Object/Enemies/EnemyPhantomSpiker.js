/**
 * EnemyPhantomSpiker.js
 *
 * A Spiker variant whose spike trail is rendered at near-zero opacity,
 * giving the player almost no visual warning that a lane is blocked.
 * The Spiker itself is also partially transparent, hinting that something
 * is wrong without clearly showing what.
 *
 * The spike's isPhantom flag is propagated in SurfaceObjectsManager.createSpikes()
 * and consumed by EnemySpikeRenderer to control opacity.
 *
 * Gameplay horror: the player discovers a lane is spiked by dying on it.
 *
 * Introduced at level 20 — fills the gap between Pulsar (17) and the
 * Fuseball variants (21+), adds psychological pressure without adding
 * mechanical complexity.
 *
 * Extends: EnemySpiker
 * Flag:    this.isPhantom = true  (on Spiker and propagated to its Spike)
 */

import EnemySpiker from '@/Object/Enemies/EnemySpiker';

export default class EnemyPhantomSpiker extends EnemySpiker {

  constructor (surface, projectileManager, rewardCallback, laneId = 0, zPosition = 1, game) {
    super(surface, projectileManager, rewardCallback, laneId, zPosition, game);

    this.isPhantom     = true;
    this.valueInPoints = 200;  // Worth more than a normal Spiker (150)
    // No extra hitPoints — the horror is the invisible spike, not the Spiker's
    // own durability.  One shot kills it just like a normal Spiker.
  }
}
