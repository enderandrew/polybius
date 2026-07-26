import * as THREE from 'three';
import { Mesh, PlaneGeometry, MeshBasicMaterial, DoubleSide } from 'three';
import randomRange from '@/utils/randomRange';

const fontLoadPromise = new FontFace('VectorBattle', 'url(VectorBattle.ttf)').load().then(font => {
    document.fonts.add(font);
}).catch(err => console.warn('VectorBattle font failed to load:', err));

export default class Canvas3d extends Mesh {
  // Modern ES static fields (no @readonly decorators needed)
  static KEY_INPUT_DELAY = 200;

  static COLOR_RED = 'rgba(255, 0, 0, 1)';
  static COLOR_BLUE = 'rgb(20,20,255)';
  static COLOR_GREEN = 'rgb(13,194,13)';
  static COLOR_WHITE = 'rgb(255,255,255)';
  static COLOR_YELLOW = 'rgb(255,255,0)';
  static COLOR_CYAN = 'rgb(100,255,200)';

  // Modern ES class fields
  context;
  texture;
  fontName = 'VectorBattle';
  vectorBattleFont;
  fontReady = false;
  canvasResX;
  canvasResY;
  screenContentManager;
  lastKeyInputTimestamp = 0;
  debug = false;
  _dirty = true;

  /**
   * @param {ScreenContentManager} screenContentManager
   * @param {number} width
   * @param {number} height
   * @param {number} canvasResX
   * @param {number} canvasResY
   */
  constructor (screenContentManager, width = 8, height = 6, canvasResX = 1024, canvasResY = 768) {
    const contextRef = document.createElement('canvas').getContext('2d');
    
    // Use the dynamic variables for a 4:3 aspect ratio instead of hardcoding 1024
    contextRef.canvas.width = canvasResX;
    contextRef.canvas.height = canvasResY;

    const texture = new THREE.CanvasTexture(contextRef.canvas);
    texture.minFilter = THREE.LinearFilter; // Kept to ensure smooth text rendering

    super(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({
        map: texture,
        side: DoubleSide,
        transparent: true,
      })
    );

    this.context = contextRef;
    this.texture = texture;
    this.canvasResX = canvasResX;
    this.canvasResY = canvasResY;

    this.setLineWidth();
    this.setFontSizePx(60);

    // Wait for the hoisted global font promise to resolve
    fontLoadPromise.then(() => {
      this.fontReady = true;
      this.queueTextureUpdate(); // Force a draw once the font is actually ready
    });

    this.screenContentManager = screenContentManager;
  }

  release () {
    // Dispose of Three.js GPU resources
    if (this.texture) this.texture.dispose();
    if (this.geometry) this.geometry.dispose();
    
    if (this.material) {
      if (Array.isArray(this.material)) {
        this.material.forEach(m => m.dispose());
      } else {
        this.material.dispose();
      }
    }

    // Free the 2D canvas CPU backing store by zeroing dimensions
    if (this.context && this.context.canvas) {
      this.context.canvas.width = 0;
      this.context.canvas.height = 0;
    }
  }

  keyInputDelay () {
    let now = Date.now();

    if (now - this.lastKeyInputTimestamp < Canvas3d.KEY_INPUT_DELAY) {
      return false;
    }

    this.lastKeyInputTimestamp = now;
    return true;
  }

  clearCanvas () {
    this.context.clearRect(0, 0, this.canvasResX, this.canvasResY);
  }

  /**
   * @param {number} width
   */
  setLineWidth (width = 2) {
    this.context.lineWidth = width;
  }

  /**
   * @param {number} size
   */
  setFontSizePx (size) {
    this.context.font = `${size}px ${this.fontName}`;
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} spacing
   */
  drawText (text, x, y, color, spacing = 2) {
    if (typeof text === 'number') {
      text = text.toString();
    }

    if (spacing > 0 && spacing < 3) {
      text = text.split('').join(String.fromCharCode(8200 + spacing));
    }

    if (this.debug) {
      this.setLineWidth(1);
      let textMetrics = this.context.measureText(text);
      let offset = 8;

      this.drawRect(
        x - offset, y + offset,
        textMetrics.width + offset * 2, -textMetrics.actualBoundingBoxAscent - offset * 2,
        Canvas3d.COLOR_WHITE
      );

      this.drawLine(
        x + textMetrics.width / 2, y - textMetrics.actualBoundingBoxAscent / 2 - 50,
        x + textMetrics.width / 2, y + 50,
        Canvas3d.COLOR_WHITE
      );

      this.setLineWidth();
    }

    this.context.strokeStyle = color;
    this.context.strokeText(text, x, y);
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} x2
   * @param {number} y2
   * @param {string} color
   */
  drawLine (x, y, x2, y2, color) {
    this.context.strokeStyle = color;
    this.context.beginPath();
    this.context.moveTo(x, y);
    this.context.lineTo(x2, y2);
    this.context.stroke();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color
   */
  drawRect (x, y, w, h, color) {
    this.context.strokeStyle = color;
    this.context.strokeRect(x, y, w, h);
  }

  displayCanvasBorder () {
    this.drawRect(1, 1, this.canvasResX - 2, this.canvasResY - 2, Canvas3d.COLOR_RED);
  }

  update () {
    if (!this.fontReady || !this._dirty) {
      return;
    }

    this._dirty = false;
    this.draw();

    if (this.debug) {
      this.displayCanvasBorder();
    }

    this.queueTextureUpdate();
  }

  draw () {
    this.clearCanvas();

    let color = `rgb(${randomRange(0, 256)}, ${randomRange(0, 256)}, ${randomRange(0, 256)})`;
    this.drawText('POLYBIUS', randomRange(256, 500), randomRange(500, 600), color);
  }

  queueTextureUpdate () {
    this.material.map.needsUpdate = true;
  }

  alignNumberToRight (number, size = 6) {
    return number.toString().padStart(size, this.debug ? '_' : ' ');
  }
}