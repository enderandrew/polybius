/**
 * EnemySpawner.js
 *
 * Central authority for all enemy spawning — both which base type appears and
 * which variant of that type is selected.
 *
 * ── Single source of truth: SPAWN_CONFIG ────────────────────────────────────
 *
 * Every enemy and every variant is declared here. Nothing about spawn
 * probability or unlock level lives in individual enemy files.
 *
 * Each top-level entry describes a base enemy type:
 *   type        Enemy.TYPE_* constant — used for rendering dispatch
 *   level       First level at which this type can appear
 *   weight      Relative draw weight in the outer type pool (≈ chanceOfSpawning)
 *   baseClass   The default class when no variant is selected
 *   variants[]  Ordered list of variant classes with their unlock/ramp data
 *
 * Each variant entry:
 *   Class         The enemy subclass to instantiate
 *   unlockLevel   First level this variant can appear (must be ≥ parent level)
 *   rampLevels    Levels after unlock over which weight rises from 0 → maxWeight
 *   maxWeight     Asymptotic weight relative to the base class weight (10)
 *
 * ── Variant probability model ────────────────────────────────────────────────
 *
 * The base class always has weight 10 in the variant pool.
 * Each variant's effective weight at level L:
 *
 *   variantWeight = maxWeight × clamp(0, (L − unlockLevel) / rampLevels, 1)
 *
 * Selection is a weighted draw over [base (10)] + [eligible variants].
 *
 * Example — Fuseball group at level 99:
 *   Base      10  →  34%
 *   Gravity    8  →  28%
 *   Supernova  6  →  21%
 *   Void       5  →  17%
 *
 * Variants only appear once rampLevels have passed, giving the player time to
 * learn the base type before variants start mixing in.
 *
 * ── Factory methods ──────────────────────────────────────────────────────────
 *
 * `_spawnEnemy(config, lane, zPosition)` selects the variant class and routes
 * to a type-specific factory.  Factories know the correct constructor signature
 * for each type family (some need a spawnFn callback, some have special args).
 *
 * Public spawn methods (spawnFlipper, spawnFuseball, spawnPulsar) are kept for
 * Tanker release callbacks and also go through variant selection — so at level 50
 * a FuseballTanker may release Gravity or Supernova variants naturally.
 */

import Enemy from '@/Object/Enemies/Enemy';
import EnemyFlipper           from '@/Object/Enemies/EnemyFlipper';
import EnemyMutantFlipper     from '@/Object/Enemies/EnemyMutantFlipper';
import EnemyStealthFlipper    from '@/Object/Enemies/EnemyStealthFlipper';
import EnemyDemonHead         from '@/Object/Enemies/EnemyDemonHead';
import EnemySpiker            from '@/Object/Enemies/EnemySpiker';
import EnemyPhantomSpiker     from '@/Object/Enemies/EnemyPhantomSpiker';
import EnemyHydraSpiker       from '@/Object/Enemies/EnemyHydraSpiker';
import EnemyOverdriveSpiker   from '@/Object/Enemies/EnemyOverdriveSpiker';
import EnemyFuseball          from '@/Object/Enemies/EnemyFuseball';
import EnemyGravityFuseball   from '@/Object/Enemies/EnemyGravityFuseball';
import EnemySupernovaFuseball from '@/Object/Enemies/EnemySupernovaFuseball';
import EnemyVoidFuseball      from '@/Object/Enemies/EnemyVoidFuseball';
import EnemyPulsar            from '@/Object/Enemies/EnemyPulsar';
import EnemyMegaPulsar        from '@/Object/Enemies/EnemyMegaPulsar';
import EnemyInversePulsar     from '@/Object/Enemies/EnemyInversePulsar';
import EnemyChaosPulsar       from '@/Object/Enemies/EnemyChaosPulsar';
import EnemyFlipperTanker     from '@/Object/Enemies/EnemyFlipperTanker';
import EnemyPhantomTanker     from '@/Object/Enemies/EnemyPhantomTanker';
import EnemyBombTanker        from '@/Object/Enemies/EnemyBombTanker';
import EnemyFuseballTanker    from '@/Object/Enemies/EnemyFuseballTanker';
import EnemyPulsarTanker      from '@/Object/Enemies/EnemyPulsarTanker';
import EnemyMirror            from '@/Object/Enemies/EnemyMirror';
import randomRange            from '@/utils/randomRange';

export default class EnemySpawner {

  // ── Spawn configuration ──────────────────────────────────────────────────
  //
  // THE authoritative source for when every enemy and variant appears.
  // Edit here; never scatter level checks into individual spawn methods.
  //
  // Variant weight distributions at level 99 (base always = 10):
  //
  //   Flipper family    Base 50%  Mutant 30%  Stealth 20%
  //   Spiker family     Base 45%  Phantom 23%  Hydra 18%  Overdrive 14%
  //   Fuseball family   Base 34%  Gravity 28%  Supernova 21%  Void 17%
  //   Pulsar family     Base 43%  Mega 26%  Inverse 17%  Chaos 13%
  //   Tanker family     Base 53%  Phantom 26%  Bomb 21%

  static SPAWN_CONFIG = [

    // ── Flippers ─────────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_FLIPPER,
      level:     1,
      weight:    1.0,
      baseClass: EnemyFlipper,
      variants: [
        { Class: EnemyMutantFlipper,  unlockLevel: 7,  rampLevels: 12, maxWeight: 6 },
        { Class: EnemyStealthFlipper, unlockLevel: 14, rampLevels: 12, maxWeight: 4 },
      ],
    },

    // ── Flipper Tankers ───────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_FLIPPER_TANKER,
      level:     3,
      weight:    0.5,
      baseClass: EnemyFlipperTanker,
      variants: [
        { Class: EnemyPhantomTanker, unlockLevel: 56, rampLevels: 15, maxWeight: 5 },
        { Class: EnemyBombTanker,    unlockLevel: 64, rampLevels: 15, maxWeight: 4 },
      ],
    },

    // ── Spikers ───────────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_SPIKER,
      level:     5,
      weight:    1.0,
      baseClass: EnemySpiker,
      variants: [
        { Class: EnemyPhantomSpiker,   unlockLevel: 23, rampLevels: 12, maxWeight: 5 },
        { Class: EnemyHydraSpiker,     unlockLevel: 44, rampLevels: 12, maxWeight: 4 },
        { Class: EnemyOverdriveSpiker, unlockLevel: 52, rampLevels: 12, maxWeight: 3 },
      ],
    },

    // ── Demon Heads ───────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_DEMON_HEAD,
      level:     9,
      weight:    0.6,
      baseClass: EnemyDemonHead,
      variants:  [],
    },

    // ── Fuseblls ──────────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_FUSEBALL,
      level:     11,
      weight:    0.8,
      baseClass: EnemyFuseball,
      variants: [
        { Class: EnemyGravityFuseball,   unlockLevel: 20, rampLevels: 12, maxWeight: 8 },
        { Class: EnemySupernovaFuseball, unlockLevel: 26, rampLevels: 12, maxWeight: 6 },
        { Class: EnemyVoidFuseball,      unlockLevel: 32, rampLevels: 12, maxWeight: 5 },
      ],
    },

    // ── Pulsars ───────────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_PULSAR,
      level:     17,
      weight:    0.8,
      baseClass: EnemyPulsar,
      variants: [
        { Class: EnemyMegaPulsar,    unlockLevel: 29, rampLevels: 12, maxWeight: 6 },
        { Class: EnemyInversePulsar, unlockLevel: 38, rampLevels: 12, maxWeight: 4 },
        { Class: EnemyChaosPulsar,   unlockLevel: 48, rampLevels: 12, maxWeight: 3 },
      ],
    },

    // ── Fuseball Tankers ──────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_FUSEBALL_TANKER,
      level:     35,
      weight:    0.5,
      baseClass: EnemyFuseballTanker,
      variants:  [],
    },

    // ── Pulsar Tankers ────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_PULSAR_TANKER,
      level:     41,
      weight:    0.5,
      baseClass: EnemyPulsarTanker,
      variants:  [],
    },

    // ── Mirror ────────────────────────────────────────────────────────────
    {
      type:      Enemy.TYPE_MIRROR,
      level:     60,
      weight:    0.4,
      baseClass: EnemyMirror,
      variants:  [],
    },

  ];

  // ── Density constants ────────────────────────────────────────────────────

  static MIN_ENEMIES = 4;
  static MAX_ENEMIES = 16;
  static MAX_LEVEL   = 99;

  // ── Constructor ──────────────────────────────────────────────────────────

  constructor (surfaceObjectsManager, projectileManager, rewardCallback, level, levelInitScore, targetScore, game) {
    this.surfaceObjectsManager = surfaceObjectsManager;
    this.projectileManager     = projectileManager;
    this.rewardCallback        = rewardCallback;
    this.currentLevel          = level;
    this.currentScore          = levelInitScore;
    this.targetScore           = targetScore;
    this.game                  = game;
  }

  // ── Score tracking ───────────────────────────────────────────────────────

  reachedScoreTarget () { return this.currentScore >= this.targetScore; }
  updateScore (score)   { this.currentScore = score; }

  // ── Main spawn tick ──────────────────────────────────────────────────────

  spawn () {
    if (this.currentScore >= this.targetScore) return;

    // Density gate — spawn chance drops as the field fills up
    const alive = this.surfaceObjectsManager.getAmountOfAliveEnemies();
    const maxAllowed = Math.ceil(
      (this.currentLevel / EnemySpawner.MAX_LEVEL)
      * (EnemySpawner.MAX_ENEMIES - EnemySpawner.MIN_ENEMIES)
      + EnemySpawner.MIN_ENEMIES - 1
    );
    const spawnChance = 1 - (alive / maxAllowed);
    if (spawnChance === 0 || Math.random() > spawnChance) return;

    // Draw a base type, then pick a variant within that type
    const eligible = EnemySpawner.SPAWN_CONFIG.filter(c => c.level <= this.currentLevel);
    const config   = this._drawConfig(eligible);
    const lane     = randomRange(0, 15);
    const enemy    = this._spawnEnemy(config, lane);

    this.currentScore += enemy.valueInPoints;
  }

  // ── Variant selection ─────────────────────────────────────────────────────
  //
  // Weighted draw over [base (weight 10)] + [eligible variants].
  // Returns the variant Class to use, or null to use config.baseClass.

  _selectVariantClass (config) {
    const BASE_WEIGHT = 10;

    const eligible = config.variants.filter(v => this.currentLevel >= v.unlockLevel);
    if (eligible.length === 0) return null;

    const weighted = eligible.map(v => ({
      Class:  v.Class,
      weight: v.maxWeight * Math.min(1, (this.currentLevel - v.unlockLevel) / v.rampLevels),
    }));

    const totalVariantWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    const totalWeight        = BASE_WEIGHT + totalVariantWeight;
    let   roll               = Math.random() * totalWeight;

    // Base wins if roll falls in the first BASE_WEIGHT slice
    if (roll < BASE_WEIGHT) return null;
    roll -= BASE_WEIGHT;

    for (const { Class, weight } of weighted) {
      if (roll < weight) return Class;
      roll -= weight;
    }
    return null;
  }

  // ── Type pool draw ────────────────────────────────────────────────────────
  //
  // Weighted random selection across eligible base types.

  _drawConfig (eligible) {
    const total = eligible.reduce((sum, c) => sum + c.weight, 0);
    let roll    = Math.random() * total;
    for (const config of eligible) {
      roll -= config.weight;
      if (roll <= 0) return config;
    }
    return eligible[eligible.length - 1];
  }

  // ── Enemy construction router ─────────────────────────────────────────────
  //
  // Picks the variant class then delegates to the type-specific factory.
  // Factories know the correct constructor shape for each family.

  _spawnEnemy (config, lane, zPosition = 1) {
    const VariantClass = this._selectVariantClass(config);

    switch (config.type) {
      case Enemy.TYPE_FLIPPER:
        return this._makeFlipperFamily(VariantClass, lane, zPosition);

      case Enemy.TYPE_FLIPPER_TANKER:
        return this._makeFlipperTankerFamily(VariantClass, lane, zPosition);

      case Enemy.TYPE_SPIKER:
        return this._makeSpikerFamily(VariantClass, lane, zPosition);

      case Enemy.TYPE_DEMON_HEAD:
        return this._makeDemonHeadFamily(lane, zPosition);

      case Enemy.TYPE_FUSEBALL:
        return this._makeFuseballFamily(VariantClass, lane, zPosition);

      case Enemy.TYPE_PULSAR:
        return this._makePulsarFamily(VariantClass, lane, zPosition);

      case Enemy.TYPE_FUSEBALL_TANKER:
        return this._makeFuseballTankerFamily(lane, zPosition);

      case Enemy.TYPE_PULSAR_TANKER:
        return this._makePulsarTankerFamily(lane, zPosition);

      case Enemy.TYPE_MIRROR:
        return this._makeMirrorFamily(lane, zPosition);

      default:
        throw new Error(`EnemySpawner: unknown type "${config.type}"`);
    }
  }

  // ── Type-specific factories ───────────────────────────────────────────────

  _makeFlipperFamily (VariantClass, lane, zPosition) {
    const S  = this.surfaceObjectsManager.surface;
    const PM = this.projectileManager;
    const RC = this.rewardCallback;
    const G  = this.game;

    // EnemyFlipper's own constructor takes an explicit `type` parameter
    // (defaulted to Enemy.TYPE_FLIPPER) positioned *before* `game`:
    //   (surface, projectileManager, rewardCallback, laneId, zPosition, type, game)
    // Its variant subclasses (MutantFlipper, StealthFlipper, DemonHead) don't
    // expose that slot — they hardcode the type internally and take:
    //   (surface, projectileManager, rewardCallback, laneId, zPosition, game)
    // Calling the base class with the 6-arg variant shape silently shifts
    // `game` into the `type` slot, corrupting `enemy.type`. Match each shape.
    const enemy = VariantClass
      ? this.surfaceObjectsManager.addEnemy(new VariantClass(S, PM, RC, lane, zPosition, G))
      : this.surfaceObjectsManager.addEnemy(new EnemyFlipper(S, PM, RC, lane, zPosition, Enemy.TYPE_FLIPPER, G));

    // Level 1: flippers cannot flip — ease the player in
    if (this.currentLevel === 1) enemy.cannotFlip();
    return enemy;
  }

  _makeFlipperTankerFamily (VariantClass, lane, zPosition) {
    const S  = this.surfaceObjectsManager.surface;
    const PM = this.projectileManager;
    const RC = this.rewardCallback;
    const G  = this.game;

    if (VariantClass === EnemyBombTanker) {
      // BombTanker has a different constructor — no spawn function needed.
      return this.surfaceObjectsManager.addEnemy(
        new EnemyBombTanker(S, PM, RC, lane, zPosition, G)
      );
    }

    // PhantomTanker always releases Stealth Flippers specifically.
    // Base FlipperTanker uses spawnFlipper (which goes through variant selection).
    const spawnFn = VariantClass === EnemyPhantomTanker
      ? this.spawnStealthFlipper.bind(this)
      : this.spawnFlipper.bind(this);

    return this.surfaceObjectsManager.addEnemy(
      new (VariantClass ?? EnemyFlipperTanker)(S, PM, spawnFn, RC, lane, zPosition, G)
    );
  }

  _makeSpikerFamily (VariantClass, lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new (VariantClass ?? EnemySpiker)(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  _makeDemonHeadFamily (lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemyDemonHead(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  _makeFuseballFamily (VariantClass, lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new (VariantClass ?? EnemyFuseball)(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  _makePulsarFamily (VariantClass, lane, zPosition) {
    const Class   = VariantClass ?? EnemyPulsar;
    // InversePulsar spawns AT the rim; all others spawn at the back of the tube.
    const actualZ = Class === EnemyInversePulsar ? 0.05 : zPosition;
    return this.surfaceObjectsManager.addEnemy(
      new Class(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, actualZ, this.game
      )
    );
  }

  _makeFuseballTankerFamily (lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemyFuseballTanker(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.spawnFuseball.bind(this),   // releases Fuseblls on death
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  _makePulsarTankerFamily (lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemyPulsarTanker(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.spawnPulsar.bind(this),     // releases Pulsars on death
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  _makeMirrorFamily (lane, zPosition) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemyMirror(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  // ── Public spawn callbacks ────────────────────────────────────────────────
  //
  // These are bound and passed to Tanker constructors as release callbacks.
  // They go through variant selection so a FuseballTanker releasing Fuseblls
  // at level 40 may naturally release Gravity or Supernova variants.

  /** Used by FlipperTanker as its release callback. */
  spawnFlipper (lane, zPosition = 1) {
    const config = EnemySpawner.SPAWN_CONFIG.find(c => c.type === Enemy.TYPE_FLIPPER);
    return this._makeFlipperFamily(this._selectVariantClass(config), lane, zPosition);
  }

  /**
   * Used by PhantomTanker as its release callback.
   * Always produces a Stealth Flipper — bypasses variant selection intentionally.
   */
  spawnStealthFlipper (lane, zPosition = 1) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemyStealthFlipper(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }

  /** Used by FuseballTanker as its release callback. */
  spawnFuseball (lane, zPosition = 1) {
    const config = EnemySpawner.SPAWN_CONFIG.find(c => c.type === Enemy.TYPE_FUSEBALL);
    return this._makeFuseballFamily(this._selectVariantClass(config), lane, zPosition);
  }

  /** Used by PulsarTanker as its release callback. */
  spawnPulsar (lane, zPosition = 1) {
    const config = EnemySpawner.SPAWN_CONFIG.find(c => c.type === Enemy.TYPE_PULSAR);
    return this._makePulsarFamily(this._selectVariantClass(config), lane, zPosition);
  }

  /**
   * Used by HydraSpiker when it dies and needs to spawn children.
   * Direct path — no variant selection, always produces a plain Spiker.
   */
  spawnSpiker (lane, zPosition = 1) {
    return this.surfaceObjectsManager.addEnemy(
      new EnemySpiker(
        this.surfaceObjectsManager.surface,
        this.projectileManager,
        this.rewardCallback,
        lane, zPosition, this.game
      )
    );
  }
}
