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

  GRENADE: {
    id: 'GRENADE',
    label: 'GRENADE\nLAUNCHER',
    color: '#ff6600', // Orange
    glowColor: 'rgba(255,102,0,0.6)',
    shape: 'bomb',
    duration: 15000,
    isWeapon: true,
    dropWeight: 5,
    description: 'Fires explosive charges that deal Area-of-Effect damage',
  },

  LASER: {
    id: 'LASER',
    label: 'LASER',
    color: '#ff00ff', // Magenta — visually distinct
    glowColor: 'rgba(255,0,255,0.6)',
    shape: 'beam', // Elongated hexagon
    duration: 18000,
    isWeapon: true,
    dropWeight: 5,
    description: 'Long beam, double damage — slow rate of fire',
  },

  MISSILE: {
    id: 'MISSILE',
    label: 'HOMING\nMISSILE',
    color: '#ff3333', // Red
    glowColor: 'rgba(255,51,51,0.6)',
    shape: 'missile',
    duration: 15000,
    isWeapon: true,
    dropWeight: 6,
    description: 'Fires a single homing missile that tracks the nearest enemy',
  },

  PARTICLE_BLASTER: {
    id: 'PARTICLE_BLASTER',
    label: 'PARTICLE\nBLASTER', // Two-line label rendered on the shape
    color: '#00ffff', // Cyan — distinct from enemy red/orange
    glowColor: 'rgba(0,255,255,0.6)',
    shape: 'diamond', // See PowerUpRenderer for shape definitions
    duration: 15000, // ms — how long the effect lasts (null = permanent until death)
    isWeapon: true,
    dropWeight: 8, // Relative probability weight for enemy drops
    description: 'Enhanced blaster — destroys enemies and clears spikes faster',
  },

  RAPID_FIRE: {
    id: 'RAPID_FIRE',
    label: 'RAPID\nFIRE',
    color: '#ffff00', // Yellow
    glowColor: 'rgba(255,255,0,0.6)',
    shape: 'star',
    duration: 12000,
    isWeapon: true,
    dropWeight: 10,
    description: 'Reduced shot cooldown — fire much faster',
  },

  SPREAD_GUN: {
    id: 'SPREAD_GUN',
    label: 'SPREAD\nGUN',
    color: '#ff8800', // Orange — warm but not enemy-red
    glowColor: 'rgba(255,136,0,0.6)',
    shape: 'fan', // Custom fan shape
    duration: 10000,
    isWeapon: true,
    dropWeight: 6,
    description: 'Fires a spread of shots like Contra — timed power-up',
  },

  SYNTH_SURGE: {
    id: 'SYNTH_SURGE',
    label: 'SYNTH\nSURGE',
    color: '#ff00ff', // Magenta
    glowColor: 'rgba(255,0,255,0.6)',
    shape: 'eq', // Equalizer bars
    duration: 12000,
    isWeapon: true,
    dropWeight: 3, // Powerful so a little rare
    description: 'Auto-fires to the rhythm of the music',
  },

  // --- HELPERS ---

  AI_DROID: {
    id: 'AI_DROID',
    label: 'A.I.\nDROID',
    color: '#ff88cc',
    glowColor: 'rgba(255,136,204,0.7)',
    shape: 'cube',
    duration: 25000,
    isWeapon: false,
    grantsAIDroid: true,
    dropWeight: 5,
    description: 'Companion cube droid that auto-targets enemies',
  },

  FIREWALL: {
    id: 'FIREWALL',
    label: 'FIRE\nWALL',
    color: '#ff7a18',
    glowColor: 'rgba(255,122,24,0.6)',
    shape: 'fan',
    duration: 12000,
    isWeapon: false,
    grantsFirewall: true,
    dropWeight: 6,
    description: 'Your flanks burn — enemies closing beside you are destroyed',
  },

  TIME_DILATION: {
    id: 'TIME_DILATION',
    label: 'TIME\nDILATION',
    color: '#b06bff',
    glowColor: 'rgba(176,107,255,0.6)',
    shape: 'hourglass',
    duration: 10000,
    isWeapon: false,
    grantsTimeDilation: true,
    dropWeight: 5,
    description: 'Enemies crawl while you move at full speed',
  },

  PHASE_DASH: {
    id: 'PHASE_DASH',
    label: 'PHASE\nDASH',
    color: '#00e5ff',
    glowColor: 'rgba(0,229,255,0.6)',
    shape: 'beam',
    duration: 18000,
    isWeapon: false,
    grantsPhaseDash: true,
    dropWeight: 7,
    description: 'Dash farther and faster, phasing through hazards on arrival',
  },

  PHANTOM: {
    id: 'PHANTOM',
    label: 'PHANTOM\nMODE',
    color: '#b266ff', // Ethereal purple
    glowColor: 'rgba(178,102,255,0.6)',
    shape: 'ghost',
    duration: 12000, // 12 seconds of invincibility
    isWeapon: false,
    dropWeight: 6,
    description: 'Become ethereal to pass through enemies and hazards',
  },

  SHIELD: {
    id: 'SHIELD',
    label: 'DEFLECTOR\nSHIELD',
    color: '#00ffff', // Cyan
    glowColor: 'rgba(0,255,255,0.6)',
    shape: 'octagon',
    duration: null, // Permanent until broken
    isWeapon: false,
    isShield: true, // Custom flag for the manager
    dropWeight: 5,
    description: 'Absorbs one fatal hit',
  },

  TIMER_EXTEND: {
    id: 'TIMER_EXTEND',
    label: 'TIMER\nMAX',
    color: '#00ffcc', // Bright Teal
    glowColor: 'rgba(0,255,204,0.6)',
    shape: 'hourglass',
    duration: null, // Instant effect
    isWeapon: false,
    refillsTimers: true, // Custom flag for the Manager
    dropWeight: 8,
    description: 'Refills all active power-up timers to their maximum',
  },

  // --- SCORE BONUSES ---

  OUTTA_HERE: {
    id: 'OUTTA_HERE',
    label: 'OUTTA\nHERE!',
    color: '#ffffff', // White — rare and special
    glowColor: 'rgba(255,255,255,0.9)',
    shape: 'warp', // Spinning double-arrow
    duration: null,
    isWeapon: false,
    scoreBonus: 3000,
    warpsToNext: true,
    dropWeight: 1, // Very rare
    description: '+5,000 points and warp to next stage',
  },

  WARP_TOKEN: {
    id: 'WARP_TOKEN',
    label: 'WARP\nTOKEN',
    color: '#ffd700',
    glowColor: 'rgba(255,215,0,0.7)',
    shape: 'token',
    duration: null,
    isWeapon: false,
    isWarpToken: true,
    dropWeight: 15,
    description: 'Collect 3 to unlock bonus stage',
  },

  ZAPPO_2000: {
    id: 'ZAPPO_2000',
    label: 'ZAPPO\n2000',
    color: '#aaffaa', // Soft green
    glowColor: 'rgba(170,255,170,0.6)',
    shape: 'circle',
    duration: null, // Instant effect — no timer
    isWeapon: false,
    scoreBonus: 2000,
    dropWeight: 12,
    description: '+2,000 point bonus',
  },

  // --- LIFE ---

  ONE_UP: {
    id: 'ONE_UP',
    label: '1UP',
    color: '#00ff44', // Bright green — classic 1UP colour
    glowColor: 'rgba(0,255,68,0.8)',
    shape: 'heart',
    duration: null,
    isWeapon: false,
    grantsLife: true,
    dropWeight: 2, // Rare but not ultra-rare
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
export function pickWeightedRandom(filterFn = null) {
  const pool = Object.values(PowerUpType).filter((t) =>
    filterFn ? filterFn(t) : true,
  );
  const totalWeight = pool.reduce((sum, t) => sum + t.dropWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const type of pool) {
    roll -= type.dropWeight;
    if (roll <= 0) return type;
  }
  return pool[pool.length - 1];
}
