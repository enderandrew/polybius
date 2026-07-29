export default class BgmManager {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.currentTrack = 0;
    this.beatData = null;
    this.lastTime = 0;
    this.isPlaying = false;

    // Callbacks for the visual engine
    this.onBeat = () => {};
    this.onAccent = () => {};

    this._timeScale = 1;

    // Web Audio graph for the low-pass "muffled" effect. Built lazily on first
    // use because createMediaElementSource() can only be called ONCE per
    // element, and because constructing an AudioContext before any user
    // gesture trips browser autoplay policy.
    this._audioContext = null;
    this._sourceNode = null;
    this._filterNode = null;
    this._muffleTarget = 1; // 1 = clear, 0 = fully muffled
    this._muffleCurrent = 1;
  }

  /**
   * Lazily route the BGM element through a BiquadFilter so it can be muffled.
   * Safe to call repeatedly; only builds the graph once.
   */
  _ensureFilterGraph() {
    if (this._audioContext) return true;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;

    try {
      this._audioContext = new Ctx();
      this._sourceNode = this._audioContext.createMediaElementSource(this.audio);
      this._filterNode = this._audioContext.createBiquadFilter();
      this._filterNode.type = 'lowpass';
      this._filterNode.frequency.value = 22050; // wide open = inaudible effect
      this._sourceNode.connect(this._filterNode);
      this._filterNode.connect(this._audioContext.destination);
      return true;
    } catch (error) {
      // If routing fails the music still plays through the element directly;
      // muffling simply becomes a no-op rather than breaking audio entirely.
      console.debug('[BgmManager] Low-pass graph unavailable:', error);
      this._audioContext = null;
      return false;
    }
  }

  /**
   * @param {number} amount 0 = fully muffled (ringing ears), 1 = clear.
   */
  setMuffle(amount) {
    this._muffleTarget = Math.max(0, Math.min(1, amount));
    if (this._muffleTarget < 1) this._ensureFilterGraph();
  }

  /**
   * Called each frame to ease the filter back toward clarity, so a hit
   * muffles instantly then recovers rather than cutting back abruptly.
   * @param {number} delta
   */
  updateMuffle(delta) {
    if (!this._filterNode) return;

    // Muffle instantly, recover gradually — matches how a real concussive
    // hit feels rather than a symmetric fade.
    const rate = this._muffleTarget < this._muffleCurrent ? 25 : 1.8;
    this._muffleCurrent +=
      (this._muffleTarget - this._muffleCurrent) * Math.min(1, rate * delta);

    // Map 0..1 onto an exponential frequency curve; linear Hz sounds wrong
    // because pitch perception is logarithmic.
    const minHz = 320;
    const maxHz = 22050;
    const hz = minHz * Math.pow(maxHz / minHz, this._muffleCurrent);
    this._filterNode.frequency.value = hz;

    // Once fully recovered, stop nudging the parameter every frame.
    if (Math.abs(this._muffleCurrent - this._muffleTarget) < 0.005) {
      this._muffleCurrent = this._muffleTarget;
    }
  }

  /**
   * Momentary pitch/speed bend, layered on top of any TIME_DILATION scaling.
   * @param {number} multiplier
   */
  setPitchBend(multiplier) {
    this._pitchBend = multiplier;
    this._applyRate();
  }

  _applyRate() {
    const bend = this._pitchBend ?? 1;
    const rate = Math.max(0.25, Math.min(4, this._timeScale * bend));
    try {
      this.audio.playbackRate = rate;
    } catch {
      // Ignore: some browsers reject extreme rates mid-playback.
    }
  }

  /**
   * Slow the track (and therefore the beat callbacks) to match TIME_DILATION.
   *
   * Beat detection reads audio.currentTime, which advances at playbackRate, so
   * onBeat/onAccent — and every visual driven off them, like LevelRenderer's
   * lane pulse — dilate for free without any extra plumbing.
   *
   * Pitch preservation is deliberately disabled: letting the pitch sag with
   * the speed is the tape-slowdown effect that actually sells "time is
   * slowing", whereas the browser default keeps it sounding normal-but-slow.
   *
   * @param {number} scale
   */
  setTimeScale(scale) {
    // Browsers reject rates outside roughly 0.0625–16; clamp well inside that.
    const clamped = Math.max(0.25, Math.min(1, scale || 1));

    if (clamped === this._timeScale) {
      return;
    }

    this._timeScale = clamped;

    try {
      this.audio.preservesPitch = false;
      this.audio.mozPreservesPitch = false;
      this.audio.webkitPreservesPitch = false;
      this._applyRate();
    } catch (error) {
      console.debug('[BgmManager] playbackRate change failed:', error);
    }
  }

  playForLevel(level) {
    // Math logic: Level 1-16 = Track 1, 17-32 = Track 2, up to Track 7
    const trackNum = Math.min(7, Math.ceil(level / 16));

    // If we are already playing the correct track, do nothing
    if (this.currentTrack === trackNum && this.isPlaying) return;

    this.stop(); // Clear previous track data

    this.currentTrack = trackNum;
    this.audio.src = `./music/bgm-${trackNum}.ogg`;
    this.isPlaying = true;

    this.audio
      .play()
      .catch((err) => console.warn('BGM Play Prevented by Browser:', err));

    // Load the matching beat data
    fetch(`./music/bgm-${trackNum}.beats.json`)
      .then((res) => res.json())
      .then((data) => {
        this.beatData = data;
        this.lastTime = 0;
      })
      .catch((err) => console.warn('Could not load beats json', err));
  }

  playBoss() {
    if (this.currentTrack === 'boss' && this.isPlaying) return;

    this.stop();

    this.currentTrack = 'boss';
    this.audio.src = './music/bgm-boss.ogg';
    this.isPlaying = true;

    this.audio
      .play()
      .catch((err) => console.warn('BGM Play Prevented by Browser:', err));

    // Load the matching beat data
    fetch('./music/bgm-boss.beats.json')
      .then((res) => res.json())
      .then((data) => {
        this.beatData = data;
        this.lastTime = 0;
      })
      .catch((err) => console.warn('Could not load beats json', err));
  }

  pause() {
    if (this.isPlaying) this.audio.pause();
  }

  resume() {
    if (this.isPlaying) this.audio.play();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this._timeScale = 1;
    this.audio.playbackRate = 1;
    this.isPlaying = false;
    this.currentTrack = 0;
    this.beatData = null;
  }

  update() {
    if (!this.isPlaying || !this.beatData) return;

    const currentTime = this.audio.currentTime;

    // Detect looping or track scrubbing
    if (currentTime < this.lastTime) {
      this.lastTime = currentTime;
      return;
    }

    // Find if we crossed a timestamp this frame
    const nextAccent = this.beatData.accents.find(
      (t) => t > this.lastTime && t <= currentTime,
    );
    if (nextAccent) {
      this.onAccent();
    } else {
      // Only trigger a normal beat if it wasn't already a heavy accent
      const nextBeat = this.beatData.beats.find(
        (t) => t > this.lastTime && t <= currentTime,
      );
      if (nextBeat) this.onBeat();
    }

    this.lastTime = currentTime;
  }
}
