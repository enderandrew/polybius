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
