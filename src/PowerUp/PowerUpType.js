/**
 * PowerUpType.js
 * 
 * Defines all available power-up types, their display properties,
 * game effect metadata, and drop configuration.
 * 
 * Integration note: Import this wherever power-up types need to be
 * referenced (spawning, collision, HUD, etc.)
 */

export const PowerUpType = Object.freeze({

  // --- WEAPON UPGRADES ---

  PARTICLE_BLASTER: {
    id:          'PARTICLE_BLASTER',
    label:       'PARTICLE\nBLASTER',   // Two-line label rendered on the shape
    color:       '#00ffff',           // Cyan — distinct from enemy red/orange
    glowColor:   'rgba(0,255,255,0.6)',
    shape:       'diamond',           // See PowerUpRenderer for shape definitions
    duration:    15000,               // ms — how long the effect lasts (null = permanent until death)
    isWeapon:    true,
    dropWeight:  8,                   // Relative probability weight for enemy drops
    description: 'Enhanced blaster — destroys enemies and clears spikes faster',
  },

  RAPID_FIRE: {
    id:          'RAPID_FIRE',
    label:       'RAPID\nFIRE',
    color:       '#ffff00',           // Yellow
    glowColor:   'rgba(255,255,0,0.6)',
    shape:       'star',
    duration:    12000,
    isWeapon:    true,
    dropWeight:  10,
    description: 'Reduced shot cooldown — fire much faster',
  },

  SPREAD_GUN: {
    id:          'SPREAD_GUN',
    label:       'SPREAD\nGUN',
    color:       '#ff8800',           // Orange — warm but not enemy-red
    glowColor:   'rgba(255,136,0,0.6)',
    shape:       'fan',               // Custom fan shape
    duration:    10000,
    isWeapon:    true,
    dropWeight:  6,
    description: 'Fires a spread of shots like Contra — timed power-up',
  },

  LASER: {
    id:          'LASER',
    label:       'LASER',
    color:       '#ff00ff',           // Magenta — visually distinct
    glowColor:   'rgba(255,0,255,0.6)',
    shape:       'beam',              // Elongated hexagon
    duration:    18000,
    isWeapon:    true,
    dropWeight:  5,
    description: 'Long beam, double damage — slow rate of fire',
  },
  
  // --- HELPERS ---

  JUMP: {
    id:          'JUMP',
    label:       'JUMP',
    color:       '#88ffff',
    glowColor:   'rgba(136,255,255,0.6)',
    shape:       'star',
    duration:    20000,
    isWeapon:    false,
    grantsJump:  true,
    dropWeight:  10,
    description: 'Press W to jump over enemies',
  },
  
  AI_DROID: {
    id:           'AI_DROID',
    label:        'A.I.\nDROID',
    color:        '#ff88cc',
    glowColor:    'rgba(255,136,204,0.7)',
    shape:        'cube',
    duration:     25000,
    isWeapon:     false,
    grantsAIDroid: true,
    //dropWeight:   3,
	dropWeight:   99,
    description:  'Companion cube droid that auto-targets enemies',
  },

  // --- SCORE BONUSES ---

  ZAPPO_2000: {
    id:          'ZAPPO_2000',
    label:       'ZAPPO\n2000',
    color:       '#aaffaa',           // Soft green
    glowColor:   'rgba(170,255,170,0.6)',
    shape:       'circle',
    duration:    null,                // Instant effect — no timer
    isWeapon:    false,
    scoreBonus:  2000,
    dropWeight:  12,
    description: '+2,000 point bonus',
  },

  OUTTA_HERE: {
    id:          'OUTTA_HERE',
    label:       'OUTTA\nHERE!',
    color:       '#ffffff',           // White — rare and special
    glowColor:   'rgba(255,255,255,0.9)',
    shape:       'warp',              // Spinning double-arrow
    duration:    null,
    isWeapon:    false,
    scoreBonus:  5000,
    warpsToNext: true,
    dropWeight:  1,                   // Very rare
    description: '+5,000 points and warp to next stage',
  },

  // --- LIFE ---

  ONE_UP: {
    id:          'ONE_UP',
    label:       '1UP',
    color:       '#00ff44',           // Bright green — classic 1UP colour
    glowColor:   'rgba(0,255,68,0.8)',
    shape:       'heart',
    duration:    null,
    isWeapon:    false,
    grantsLife:  true,
    dropWeight:  2,                   // Rare but not ultra-rare
    description: 'Extra life',
  },

});

/**
 * Weighted random pick for enemy drops.
 * Pass an optional filter function to restrict eligible types.
 * 
 * Example — exclude instant bonuses from mid-level drops:
 *   pickWeightedRandom(type => type.isWeapon)
 */
export function pickWeightedRandom (filterFn = null) {
  const pool = Object.values(PowerUpType).filter(t => filterFn ? filterFn(t) : true);
  const totalWeight = pool.reduce((sum, t) => sum + t.dropWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const type of pool) {
    roll -= type.dropWeight;
    if (roll <= 0) return type;
  }
  return pool[pool.length - 1];
}
