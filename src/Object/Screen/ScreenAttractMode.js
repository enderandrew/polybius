/**
 * ScreenAttractMode.js
 *
 * Attract mode cycle: 3 story pages → enemy gallery → high scores → repeat.
 *
 * ── Performance optimizations retained ───────────────────────────────────
 *
 * 1. STATIC PRE-RENDER: each page's unchanging content (titles, body text
 *    with shadowBlur glow, enemy icons, high score rows) is drawn ONCE per
 *    page into an offscreen canvas at construction. Every frame, that
 *    canvas is blitted with a single drawImage() call instead of
 *    re-running the expensive glow text draws. Only the flash text,
 *    bomb-pulse ring, page indicator, and glitches are drawn fresh
 *    each frame.
 *
 * 2. GPU-SAFE GLITCH: "tear" uses ctx.drawImage(canvas, ...) copying the
 *    canvas onto itself instead of getImageData/putImageData, which forces
 *    a synchronous GPU→CPU pixel readback stall.
 *
 */

import Canvas3d from '@/Object/Screen/Canvas3d';
import enemyAssets from '@/Assets/Enemies';

export default class ScreenAttractMode extends Canvas3d {
  static PAGES = [
    { id: 'story1', duration: 7000 },
    { id: 'story2', duration: 7000 },
    { id: 'story3', duration: 7000 },
    { id: 'enemies', duration: 9000 },
    { id: 'highscores', duration: 6000 },
  ];

  static ENEMY_GALLERY = [
    { level: 1, asset: 'flipper', color: '#ff4400', name: 'FLIPPER' },
    {
      level: 3,
      asset: 'flipperTanker',
      color: '#ffaa00',
      name: 'FLIPPER TANKER',
    },
    { level: 5, asset: 'spiker', color: '#00ff00', name: 'SPIKER' },
    {
      level: 7,
      asset: 'mutant_flipper',
      color: '#ff2222',
      name: 'MUTANT FLIPPER',
      filter: 'hue-rotate(180deg) saturate(1.5) brightness(1.1)',
    },
    { level: 9, asset: 'demon_head', color: '#ff6600', name: 'DEMON HEAD' },
    { level: 11, asset: 'fuseball', color: '#ff8800', name: 'FUSEBALL' },
    {
      level: 14,
      asset: 'stealth_flipper',
      color: '#aa44ff',
      name: 'STEALTH FLIPPER',
      opacity: 0.42,
      filter: 'hue-rotate(65deg) saturate(1.3) brightness(0.95)',
    },
    { level: 17, asset: 'pulsar', color: '#00ffff', name: 'PULSAR' },
    {
      level: 20,
      asset: 'fuseball',
      color: '#ff4400',
      name: 'GRAVITY FUSEBALL',
      filter: 'hue-rotate(-43deg) saturate(1.5) brightness(1.1)',
      effect: 'gravity-orbit',
    },
    {
      level: 23,
      asset: 'spiker',
      color: '#44ff88',
      name: 'PHANTOM SPIKER',
      opacity: 0.38,
    },
    {
      level: 26,
      asset: 'fuseball',
      color: '#88ddff',
      name: 'SUPERNOVA FUSEBALL',
      filter: 'hue-rotate(36deg) saturate(1.3) brightness(1.05)',
      effect: 'supernova-rings',
    },
    {
      level: 29,
      asset: 'pulsar',
      color: '#ff4488',
      name: 'MEGA PULSAR',
      filter: 'hue-rotate(-18deg) saturate(1.6) brightness(1.1)',
      effect: 'mega-brackets',
    },
    {
      level: 32,
      asset: 'fuseball',
      color: '#aa44ff',
      name: 'VOID FUSEBALL',
      filter: 'hue-rotate(79deg) saturate(1.4) brightness(0.9)',
      effect: 'void-halo',
    },
    {
      level: 35,
      asset: 'fuseballTanker',
      color: '#ff8800',
      name: 'FUSEBALL TANKER',
    },
    {
      level: 38,
      asset: 'pulsar',
      color: '#ff8844',
      name: 'INVERSE PULSAR',
      filter: 'hue-rotate(30deg) saturate(1.4) brightness(1.15)',
    },
    {
      level: 41,
      asset: 'pulsarTanker',
      color: '#00ffcc',
      name: 'PULSAR TANKER',
    },
    {
      level: 44,
      asset: 'spiker',
      color: '#ffaa00',
      name: 'HYDRA SPIKER',
      filter: 'hue-rotate(-29deg) saturate(1.6) brightness(1.15)',
      effect: 'hydra-fork',
    },
    {
      level: 48,
      asset: 'pulsar',
      color: '#ff44ff',
      name: 'CHAOS PULSAR',
      filter: 'hue-rotate(140deg) saturate(2.0) brightness(1.1)',
    },
    {
      level: 52,
      asset: 'spiker',
      color: '#88eeff',
      name: 'OVERDRIVE SPIKER',
      filter: 'hue-rotate(54deg) saturate(1.5) brightness(1.4)',
      effect: 'overdrive-streaks',
    },
    {
      level: 56,
      asset: 'flipperTanker',
      color: '#cc88ff',
      name: 'PHANTOM TANKER',
      opacity: 0.55,
      filter: 'hue-rotate(65deg) saturate(1.3) brightness(0.95)',
    },
    { level: 60, asset: 'mirror', color: '#dddddd', name: 'MIRROR' },
    {
      level: 64,
      asset: 'flipperTanker',
      color: '#ff6622',
      name: 'BOMB TANKER',
      filter: 'hue-rotate(-22deg) saturate(1.7) brightness(1.15)',
      effect: 'bomb-pulse',
    },
  ];

  constructor(screenContentManager, highScores, onExit) {
    // Reverted to 1024×1024 — see file header for why 512 broke on-screen scaling.
    super(screenContentManager, 8, 8, 1024, 1024);

    if (typeof onExit !== 'function') {
      console.error(
        'ScreenAttractMode: onExit callback missing. Check the constructor call site.',
      );
    }
    this._highScores = Array.isArray(highScores) ? highScores : [];
    this._onExit = typeof onExit === 'function' ? onExit : () => {};

    this._page = 0;
    this._pageStart = Date.now();
    this._glitches = [];
    this._flashOn = true;
    this._flashNext = Date.now() + 500;
    this._bombIconPos = null;

    this._keyHandler = (e) => {
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', this._keyHandler, true);
      if (this._onExit) this._onExit();
    };
    window.addEventListener('keydown', this._keyHandler, true);

    this._staticCache = {};
    this._prerenderStaticPages();

    this._redraw();
  }

  release() {
    window.removeEventListener('keydown', this._keyHandler, true);
  }

  update() {
    const now = Date.now();

    if (now - this._pageStart >= ScreenAttractMode.PAGES[this._page].duration) {
      this._page = (this._page + 1) % ScreenAttractMode.PAGES.length;
      this._pageStart = now;
      this._glitches = [];
    }

    if (now >= this._flashNext) {
      this._flashOn = !this._flashOn;
      this._flashNext = now + 500;
    }

    if (Math.random() < 0.1) this._spawnGlitch(now);
    this._glitches = this._glitches.filter((g) => now < g.end);

    this._redraw();
  }

  _spawnGlitch(now) {
    const types = ['hbar', 'vbar', 'block', 'tear'];
    const r = () => (Math.random() * 255) | 0;
    this._glitches.push({
      type: types[Math.floor(Math.random() * types.length)],
      x: (Math.random() * 1024) | 0,
      y: (Math.random() * 1024) | 0,
      w: (20 + Math.random() * 400) | 0,
      h: (1 + Math.random() * 5) | 0,
      color: `rgba(${r()},${r()},${r()},${0.35 + Math.random() * 0.55})`,
      end: now + 40 + Math.random() * 220,
    });
  }

  _applyGlitches(ctx, W, H) {
    this._glitches.forEach(({ type, x, y, w, h, color }) => {
      switch (type) {
        case 'hbar':
          ctx.fillStyle = color;
          ctx.fillRect(0, y, W, h);
          break;

        case 'vbar':
          ctx.fillStyle = color;
          ctx.fillRect(x, 0, Math.max(1, h * 0.5), H);
          break;

        case 'block':
          ctx.fillStyle = color;
          ctx.fillRect(x, y, w * 0.22, h * 9);
          break;

        case 'tear': {
          // GPU-safe self-copy — avoids getImageData()/putImageData(),
          // which forces a synchronous GPU→CPU pixel readback stall.
          const stripH = Math.min(h + 2, 6);
          const shift = Math.floor((Math.random() - 0.5) * 24);
          ctx.drawImage(ctx.canvas, 0, y, W, stripH, shift, y, W, stripH);
          break;
        }
      }
    });
  }

  _redraw() {
    const ctx = this.context;
    const W = this.canvasResX; // 1024
    const H = this.canvasResY; // 1024
    const pageId = ScreenAttractMode.PAGES[this._page].id;

    const staticCanvas = this._staticCache[pageId];
    if (staticCanvas) {
      ctx.drawImage(staticCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }

    if (pageId === 'story3') this._drawStory3Dynamic(ctx);
    if (pageId === 'enemies') this._drawEnemiesDynamic(ctx);

    this._drawPageIndicatorDynamic(ctx, W, H);
    this._applyGlitches(ctx, W, H);

    if (this.texture) this.texture.needsUpdate = true;
  }

  _prerenderStaticPages() {
    ScreenAttractMode.PAGES.forEach(({ id }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.textBaseline = 'alphabetic';

      switch (id) {
        case 'story1':
          this._drawStory1Static(ctx);
          break;
        case 'story2':
          this._drawStory2Static(ctx);
          break;
        case 'story3':
          this._drawStory3Static(ctx);
          break;
        case 'enemies':
          this._drawEnemiesStatic(ctx);
          break;
        case 'highscores':
          this._drawHighScoresStatic(ctx);
          break;
      }

      this._staticCache[id] = canvas;
    });
  }

  _t(ctx, text, cx, y, color, size, bold = true) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y);
  }

  _rule(ctx, cx, y, halfW, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx + halfW, y);
    ctx.stroke();
  }

  _drawPageIndicatorDynamic(ctx, W, H) {
    const total = ScreenAttractMode.PAGES.length;
    const dotR = 7;
    const gap = 20;
    const totalW = total * (dotR * 2 + gap) - gap;
    const startX = W / 2 - totalW / 2 + dotR;

    for (let i = 0; i < total; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * (dotR * 2 + gap), H - 46, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i === this._page ? '#ffffff' : '#2a2a2a';
      ctx.fill();
    }

    if (this._flashOn) {
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS ANY KEY TO EXIT', W / 2, H - 18);
    }
  }

  _drawStory1Static(ctx) {
    const cx = 512;
    let y = 140;

    this._t(
      ctx,
      'OPERATION: SYNAPSE SNAP',
      cx,
      y,
      'rgba(0, 220, 255, 0.85)',
      48,
    );
    y += 18;
    this._rule(ctx, cx, y, 440, 'rgba(0, 220, 255, 0.4)');
    y += 64;

    this._t(
      ctx,
      'IN 1981, THE GOVERNMENT DEPLOYED AN ARCADE GAME.',
      cx,
      y,
      'rgba(230, 230, 230, 0.8)',
      26,
    );
    y += 50;
    this._t(
      ctx,
      'THEY SAID IT WAS JUST FOR ENTERTAINMENT.',
      cx,
      y,
      'rgba(230, 230, 230, 0.8)',
      26,
    );
    y += 84;

    this._t(ctx, 'THEY LIED.', cx, y, 'rgba(255, 40, 40, 0.8)', 64);
    y += 100;

    this._t(
      ctx,
      'IT WAS A NEURAL CALIBRATION TOOL.',
      cx,
      y,
      'rgba(50, 255, 120, 0.8)',
      28,
    );
    y += 48;
    this._t(
      ctx,
      'DESIGNED TO HARVEST PSYCHIC ENERGY.',
      cx,
      y,
      'rgba(50, 255, 120, 0.8)',
      28,
    );
    y += 48;
    this._t(
      ctx,
      'BUT IF YOU TAKE THE RISK....',
      cx,
      y,
      'rgba(50, 255, 120, 0.8)',
      28,
    );
    y += 48;
    this._t(
      ctx,
      'A GREAT TRUTH WILL BE REVEALED',
      cx,
      y,
      'rgba(50, 255, 120, 0.9)',
      28,
    );
    y += 48;
    this._t(
      ctx,
      'WILL YOU HEED THE CALL?',
      cx,
      y,
      'rgba(50, 255, 120, 0.9)',
      28,
    );
  }

  _drawStory2Static(ctx) {
    const cx = 512;
    let y = 140;

    this._t(ctx, 'YOUR MISSION:', cx, y, 'rgba(0, 220, 255, 0.85)', 48);
    y += 18;
    this._rule(ctx, cx, y, 440, 'rgba(0, 220, 255, 0.4)');
    y += 64;

    this._t(
      ctx,
      'INFILTRATE THE MAINFRAME.',
      cx,
      y,
      'rgba(230, 230, 230, 0.8)',
      26,
    );
    y += 50;
    this._t(ctx, 'HACK THE GIBSON.', cx, y, 'rgba(230, 230, 230, 0.8)', 26);
    y += 50;
    this._t(
      ctx,
      'DESCEND THROUGH 256 SECTORS OF GEOMETRIC MADNESS.',
      cx,
      y,
      'rgba(230, 230, 230, 0.8)',
      26,
    );
    y += 84;

    this._t(
      ctx,
      'RECOVER THE 7 CLASSIFIED "CHAOS EMERALDS".',
      cx,
      y,
      'rgba(255, 230, 50, 0.8)',
      32,
    );
    y += 70;

    this._t(
      ctx,
      '(DO NOT ASK WHY THE CIA WANTS THEM.)',
      cx,
      y,
      'rgba(150, 150, 150, 0.7)',
      20,
      false,
    );
    y += 48;
    this._t(
      ctx,
      '(MAYBE THE WANT TO GO SUPER-SAIYAN.)',
      cx,
      y,
      'rgba(255, 215, 0, 0.7)',
      20,
      false,
    );
  }

  _drawStory3Static(ctx) {
    const cx = 512;
    let y = 140;

    this._t(
      ctx,
      'THE SIMULATION HAS 8 PHASES.',
      cx,
      y,
      'rgba(0, 220, 255, 0.8)',
      48,
    );
    y += 18;
    this._rule(ctx, cx, y, 440, 'rgba(0, 220, 255, 0.4)');
    y += 64;

    this._t(
      ctx,
      'COLLECT THE EMERALDS.',
      cx,
      y,
      'rgba(230, 230, 230, 0.7)',
      26,
    );
    y += 50;
    this._t(ctx, 'DEFEAT THE PULSARS.', cx, y, 'rgba(230, 230, 230, 0.7)', 26);
    y += 50;
    this._t(
      ctx,
      'REACH THE RAINBOW PHASE TO WAKE UP.',
      cx,
      y,
      'rgba(230, 230, 230, 0.7)',
      26,
    );

    this._story3FlashY = y + 100;
  }

  _drawStory3Dynamic(ctx) {
    if (!this._flashOn) return;
    const cx = 512;
    ctx.shadowColor = 'rgba(255, 40, 40, 0.5)';
    ctx.shadowBlur = 16;
    this._t(
      ctx,
      'INSERT COIN TO SUBMIT YOUR WILL.',
      cx,
      this._story3FlashY,
      'rgba(255, 40, 40, 0.75)',
      38,
    );
    ctx.shadowBlur = 0;
  }

  _drawEnemiesStatic(ctx) {
    const cx = 512;
    this._t(ctx, '— THREAT DATABASE —', cx, 52, '#ff4400', 34);
    this._rule(ctx, cx, 64, 340, '#ff4400');

    const gallery = ScreenAttractMode.ENEMY_GALLERY;
    const COLS = 2;
    const ICON_S = 44;
    const CELL_W = 1024 / COLS;
    const CELL_H = Math.floor((1024 - 130) / Math.ceil(gallery.length / COLS));
    const START_Y = 72;

    gallery.forEach((entry, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const cellX = col * CELL_W;
      const cellY = START_Y + row * CELL_H;
      const iconCX = cellX + 28 + ICON_S / 2;
      const iconCY = cellY + CELL_H / 2 - 4;

      const asset = enemyAssets.find((e) => e.name === entry.asset);
      if (asset) {
        if (entry.filter || entry.opacity !== undefined) {
          // Pre-render filtered/transparent icons once to an offscreen canvas
          const cachedIconCanvas = this._prerenderEnemyIcon(
            asset,
            ICON_S,
            entry.filter,
            entry.opacity,
          );
          ctx.drawImage(
            cachedIconCanvas,
            iconCX - ICON_S / 2,
            iconCY - ICON_S / 2,
          );
        } else {
          // Draw standard unfiltered icons directly
          ctx.save();
          this._drawEnemyIcon(ctx, asset, iconCX, iconCY, ICON_S);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const px = iconCX + Math.cos(a) * ICON_S * 0.4;
          const py = iconCY + Math.sin(a) * ICON_S * 0.4;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      if (entry.effect && entry.effect !== 'bomb-pulse') {
        this._drawEffect(ctx, entry.effect, iconCX, iconCY, ICON_S * 0.55);
      }
      if (entry.effect === 'bomb-pulse') {
        this._bombIconPos = { x: iconCX, y: iconCY, r: ICON_S * 0.55 };
      }

      const textX = cellX + 28 + ICON_S + 14;
      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.max(14, Math.min(17, CELL_H * 0.28))}px "Courier New", monospace`;
      ctx.fillStyle = entry.color;
      ctx.fillText(entry.name, textX, cellY + CELL_H * 0.42);

      ctx.font = '12px "Courier New", monospace';
      ctx.fillStyle = '#444444';
      ctx.fillText(`LEVEL ${entry.level}`, textX, cellY + CELL_H * 0.65);
    });

    ctx.textAlign = 'center';
  }

  _prerenderEnemyIcon(asset, size, filter, opacity) {
    const pad = 4;
    const dim = size + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const offCtx = canvas.getContext('2d');

    offCtx.save();
    if (filter) offCtx.filter = filter;
    if (opacity !== undefined) offCtx.globalAlpha = opacity;

    this._drawEnemyIcon(offCtx, asset, dim / 2, dim / 2, size);
    offCtx.restore();

    return canvas;
  }

  _drawEnemiesDynamic(ctx) {
    if (!this._bombIconPos) return;
    const { x, y, r } = this._bombIconPos;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 350));
    ctx.strokeStyle = `rgba(255, 80, 0, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.1 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawEnemyIcon(ctx, asset, cx, cy, size) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    asset.coords.forEach((group) =>
      group.forEach(({ x, y }) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }),
    );

    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const scale = (size * 0.85) / Math.max(bw, bh);
    const ox = -(minX + bw / 2) * scale;
    const oy = -(minY + bh / 2) * scale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 1.3;

    asset.coords.forEach((group, i) => {
      const raw = Array.isArray(asset.color) ? asset.color[i] : asset.color;
      if (raw !== undefined) {
        const n =
          typeof raw === 'number'
            ? raw
            : parseInt(String(raw).replace('#', ''), 16);
        ctx.strokeStyle = `rgb(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff})`;
      }
      ctx.beginPath();
      group.forEach(({ x, y }, j) => {
        const px = x * scale + ox;
        const py = -(y * scale + oy);
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    ctx.restore();
  }

  _drawEffect(ctx, effect, cx, cy, r) {
    switch (effect) {
      case 'gravity-orbit': {
        ctx.strokeStyle = 'rgba(255, 119, 34, 0.85)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          const base = (i / 4) * Math.PI * 2;
          const px = cx + Math.cos(base) * r * 1.25;
          const py = cy + Math.sin(base) * r * 1.25;
          ctx.beginPath();
          ctx.arc(px, py, r * 0.16, base - 0.55, base + 0.55);
          ctx.stroke();
        }
        break;
      }
      case 'supernova-rings': {
        ctx.strokeStyle = 'rgba(136, 221, 255, 0.65)';
        ctx.lineWidth = 1;
        [0, Math.PI / 2, Math.PI / 3].forEach((rot) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.3, r * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
        break;
      }
      case 'void-halo': {
        ctx.strokeStyle = 'rgba(170, 68, 255, 0.65)';
        ctx.lineWidth = 1.2;
        const dashSpan = Math.PI * 0.28;
        for (let i = 0; i < 6; i++) {
          const center = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            r * 1.25,
            center - dashSpan / 2,
            center + dashSpan / 2,
          );
          ctx.stroke();
        }
        break;
      }
      case 'mega-brackets': {
        ctx.strokeStyle = 'rgba(255, 68, 136, 0.75)';
        ctx.lineWidth = 1.5;
        const h = r * 0.9,
          armW = r * 0.35,
          pad = r * 1.4;
        [
          [-1, pad],
          [1, -pad],
        ].forEach(([dir, xOff]) => {
          ctx.beginPath();
          ctx.moveTo(cx + xOff + dir * armW, cy - h);
          ctx.lineTo(cx + xOff, cy - h);
          ctx.lineTo(cx + xOff, cy + h);
          ctx.lineTo(cx + xOff + dir * armW, cy + h);
          ctx.stroke();
        });
        break;
      }
      case 'hydra-fork': {
        ctx.strokeStyle = 'rgba(255, 170, 0, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.5);
        ctx.lineTo(cx, cy - r * 0.85);
        ctx.moveTo(cx, cy - r * 0.85);
        ctx.lineTo(cx - r * 0.6, cy - r * 1.3);
        ctx.moveTo(cx, cy - r * 0.85);
        ctx.lineTo(cx + r * 0.6, cy - r * 1.3);
        ctx.stroke();
        break;
      }
      case 'overdrive-streaks': {
        ctx.strokeStyle = 'rgba(136, 238, 255, 0.80)';
        ctx.lineWidth = 1.2;
        [Math.PI * 0.55, Math.PI * 0.75, Math.PI * 0.95].forEach((a) => {
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35);
          ctx.lineTo(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4);
          ctx.stroke();
        });
        break;
      }
    }
  }

  _drawHighScoresStatic(ctx) {
    const cx = 512;
    const scores = this._highScores;

    this._t(ctx, '— HALL OF COMPLIANCE —', cx, 52, '#ffff00', 36);
    this._rule(ctx, cx, 64, 330, '#ffff00');

    if (scores.length === 0) {
      this._t(ctx, 'NO RECORDS FOUND.', cx, 360, '#444444', 24, false);
      this._t(
        ctx,
        'THE SIMULATION IS WATCHING.',
        cx,
        400,
        '#444444',
        20,
        false,
      );
    } else {
      scores.slice(0, 8).forEach((entry, i) => {
        const y = 102 + i * 88;
        const gold = i === 0;
        const color = gold ? '#ffff00' : i < 3 ? '#cccccc' : '#555555';
        const size = gold ? 30 : 24;

        ctx.font = `bold ${size}px "Courier New", monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}.`, cx - 310, y);
        ctx.fillText(entry.name ?? '---', cx - 256, y);
        ctx.textAlign = 'right';
        ctx.fillText((entry.score ?? 0).toLocaleString(), cx + 310, y);

        if (i < scores.length - 1) this._rule(ctx, cx, y + 10, 300, '#181818');
      });
    }

    ctx.textAlign = 'center';
    this._t(
      ctx,
      'ALL SCORES ARE FORWARDED TO A FACILITY IN UTAH.',
      cx,
      848,
      '#2a2a2a',
      14,
      false,
    );
    this._t(ctx, 'FOR YOUR PROTECTION.', cx, 872, '#2a2a2a', 14, false);
  }
}
