/**
 * PowerUpHUD.js
 * 
 * Vanilla JS HUD — no Vue required.
 * Injects itself into the #screen element alongside the Three.js canvas.
 * Call new PowerUpHUD(powerUpManager) after the renderer is set up.
 */
export class PowerUpHUD {

  constructor (powerUpManager) {
    this.powerUpManager = powerUpManager;
    this.strips = new Map();   // type.id → { el, duration }
    this.flashTimer = null;

    this._buildDOM();
    this._bindEvents();
    this._tick();
  }

  _buildDOM () {
    const style = document.createElement('style');
    style.textContent = `
      #pu-hud {
        position: absolute;
        top: 48px;
        left: 12px;
        z-index: 500;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
        font-family: 'Courier New', monospace;
      }
      .pu-strip {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(0,0,0,0.75);
        border-radius: 3px;
        padding: 3px 8px 3px 6px;
        transition: opacity 0.2s;
      }
      .pu-strip__label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        min-width: 100px;
      }
      .pu-strip__track {
        width: 80px;
        height: 6px;
        background: rgba(255,255,255,0.12);
        border-radius: 3px;
        overflow: hidden;
      }
      .pu-strip__fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.1s linear;
      }
      .pu-strip__time {
        font-size: 10px;
        color: rgba(255,255,255,0.6);
        min-width: 32px;
        text-align: right;
      }
      #pu-flash {
        position: absolute;
        top: 8px;
        left: 12px;
        z-index: 501;
        background: rgba(0,0,0,0.85);
        border-radius: 3px;
        padding: 5px 14px;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s;
      }
    `;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'pu-hud';

    this.flash = document.createElement('div');
    this.flash.id = 'pu-flash';

    const screen = document.getElementById('screen');
    screen.appendChild(this.root);
    screen.appendChild(this.flash);
  }

  _bindEvents () {
    window.addEventListener('powerup:collected', ({ detail: { type, remaining } }) => {
      this._addStrip(type, remaining);
    });
    window.addEventListener('powerup:expired', ({ detail: { type } }) => {
      this._removeStrip(type.id);
      this._showFlash(`${type.label.replace('\n', ' ')} ENDED`, type.color);
    });
    window.addEventListener('powerup:score', ({ detail: { amount, label } }) => {
      this._showFlash(`${label.replace('\n', ' ')}  +${amount.toLocaleString()}`, '#aaffaa');
    });
    window.addEventListener('powerup:extralife', () => {
      this._showFlash('1UP  ♥  EXTRA LIFE!', '#00ff44');
    });
    window.addEventListener('powerup:warp', () => {
      this._showFlash('OUTTA HERE!  ►► WARPING...', '#ffffff');
    });
  }

  _addStrip (type, duration) {
    this._removeStrip(type.id);  // Remove existing if re-collected

    const strip = document.createElement('div');
    strip.className = 'pu-strip';
    strip.style.borderLeft = `2px solid ${type.color}`;
    strip.style.boxShadow = `0 0 8px ${type.color}44`;

    const label = document.createElement('span');
    label.className = 'pu-strip__label';
    label.textContent = type.label.replace('\n', ' ');
    label.style.color = type.color;
    label.style.textShadow = `0 0 6px ${type.color}`;

    const track = document.createElement('div');
    track.className = 'pu-strip__track';

    const fill = document.createElement('div');
    fill.className = 'pu-strip__fill';
    fill.style.background = type.color;
    fill.style.boxShadow = `0 0 6px ${type.color}`;
    fill.style.width = '100%';
    track.appendChild(fill);

    const time = document.createElement('span');
    time.className = 'pu-strip__time';
    time.textContent = duration.toFixed(1) + 's';

    strip.append(label, track, time);
    this.root.appendChild(strip);

    this.strips.set(type.id, { el: strip, fill, time, duration });
  }

  _removeStrip (typeId) {
    const entry = this.strips.get(typeId);
    if (!entry) return;
    entry.el.remove();
    this.strips.delete(typeId);
  }

  _showFlash (message, color) {
    clearTimeout(this.flashTimer);
    this.flash.textContent = message;
    this.flash.style.color = color;
    this.flash.style.border = `1px solid ${color}`;
    this.flash.style.boxShadow = `0 0 16px ${color}`;
    this.flash.style.textShadow = `0 0 8px ${color}`;
    this.flash.style.opacity = '1';
    this.flashTimer = setTimeout(() => {
      this.flash.style.opacity = '0';
    }, 2200);
  }

  _tick () {
    for (const [id, entry] of this.strips) {
      const remaining = this.powerUpManager.remainingSeconds(id);
      if (remaining <= 0) {
        this._removeStrip(id);
        continue;
      }
      const pct = (remaining / entry.duration) * 100;
      entry.fill.style.width = pct + '%';
      entry.time.textContent = remaining.toFixed(1) + 's';
    }
    requestAnimationFrame(this._tick.bind(this));
  }

  destroy () {
    this.root.remove();
    this.flash.remove();
  }
}