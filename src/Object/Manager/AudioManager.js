import { Audio, AudioLoader } from 'three';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class AudioManager {
  static SOUND_1UP = '1up';
  static SOUND_ACHIEVEMENT = 'achievement';
  static SOUND_BIGFOOT = 'bigfoot';
  static SOUND_ENEMY_DEATH = 'enemy_death';
  static SOUND_ENEMY_SHOOT = 'enemy_shoot';
  static SOUND_GAME = 'game';
  static SOUND_GRENADE = 'grenade';
  static SOUND_GAME_OVER = 'game_over';
  static SOUND_JUMP = 'jump';
  static SOUND_KONAMI = 'Konami';
  static SOUND_LASER = 'laser';
  static SOUND_MENU_SELECT = 'menu_select';
  static SOUND_NEXT_LEVEL = 'next_level';
  static SOUND_MISSILE = 'missile';
  static SOUND_PAUSE = 'pause';
  static SOUND_PHANTOM = 'phantom';
  static SOUND_PLAYER_DEATH = 'player_death';
  static SOUND_PLAYER_LANE_CHANGE = 'player_lane_change';
  static SOUND_PLAYER_SHOOT = 'player_shoot';
  static SOUND_POWERUP = 'powerup';
  static SOUND_SHIELD = 'shield';
  static SOUND_SPOOKY = 'spooky';
  static SOUND_SYNTH_SURGE = 'synth';
  static SOUND_YES = 'yes';

  static SOUND_VOLUME = 0.4;

  audioListener;
  audio = [];
  audioBuffer;
  buffers = new Map();
  audioLoader = new AudioLoader();
  isLoaded = false;

  constructor(audioListener) {
    this.audioListener = audioListener;
    this.audio.push(new Audio(this.audioListener));
  }

  playSound(soundName, volume = 1) {
    //console.log(`[AudioManager] Attempting to play sound: ${soundName}`);

    if (
      this.audioListener.context &&
      this.audioListener.context.state === 'suspended'
    ) {
      //console.log('[AudioManager] Resuming suspended AudioContext');
      this.audioListener.context.resume();
    }

    const buffer = this.buffers.get(soundName);

    if (!buffer) {
      console.error(`[AudioManager] Buffer missing for: ${soundName}`);
      return;
    }

    //console.log(`[AudioManager] Buffer found. Finding available audio channel...`);

    let availableAudio = this.audio.find((audio) => !audio.isPlaying);
    if (!availableAudio) {
      //console.log(`[AudioManager] Audio pool full, spawning new channel.`);
      const newAudio = new Audio(this.audioListener);
      this.audio.push(newAudio);
      availableAudio = newAudio;
    }

    //console.log(`[AudioManager] Playing ${soundName} at volume ${volume}`);
    availableAudio.setBuffer(buffer);
    availableAudio.setVolume(volume * AudioManager.SOUND_VOLUME);
    availableAudio.play();
  }

  update() {
    if (!this.isLoaded) return;

    const seen = new Set();
    let msgObj;
    let n = 0;

    // Drain up to 8 messages from the queue per frame
    while (
      (msgObj = messageBroker.consume(MessageBroker.TOPIC_AUDIO)) !== null &&
      n++ < 8
    ) {
      //console.log(`[AudioManager] Consumed message from queue: ${msgObj.message}`);

      // Deduplicate
      if (seen.has(msgObj.message)) {
        //console.log(`[AudioManager] Dropping duplicate burst sound: ${msgObj.message}`);
        continue;
      }
      seen.add(msgObj.message);

      //console.log(`[AudioManager] Routing message to switch: ${msgObj.message}`);

      switch (msgObj.message) {
        case MessageBroker.MESSAGE_1UP:
          this.playSound(AudioManager.SOUND_1UP, 0.8);
          break;
        case MessageBroker.MESSAGE_ACHIEVEMENT:
          this.playSound(AudioManager.SOUND_ACHIEVEMENT, 0.8);
          break;
        case MessageBroker.MESSAGE_BIGFOOT:
          this.playSound(AudioManager.SOUND_BIGFOOT, 0.8);
          break;
        case MessageBroker.MESSAGE_ENEMY_DEATH:
          this.playSound(AudioManager.SOUND_ENEMY_DEATH);
          break;
        case MessageBroker.MESSAGE_ENEMY_SHOOT:
          this.playSound(AudioManager.SOUND_ENEMY_SHOOT, 0.3);
          break;
        case MessageBroker.MESSAGE_GAME:
          this.playSound(AudioManager.SOUND_GAME, 0.8);
          break;
        case MessageBroker.MESSAGE_GAME_OVER:
          this.playSound(AudioManager.SOUND_GAME_OVER, 0.8);
          break;
        case MessageBroker.MESSAGE_JUMP:
          this.playSound(AudioManager.SOUND_JUMP, 0.8);
          break;
        case MessageBroker.MESSAGE_KONAMI:
          this.playSound(AudioManager.SOUND_KONAMI, 0.8);
          break;
        case MessageBroker.MESSAGE_MENU_CHANGE:
          this.playSound(AudioManager.SOUND_PLAYER_LANE_CHANGE);
          break;
        case MessageBroker.MESSAGE_MENU_SELECT:
          this.playSound(AudioManager.SOUND_PLAYER_SHOOT, 0.8);
          break;
        case MessageBroker.MESSAGE_NEXT_LEVEL:
          this.playSound(AudioManager.SOUND_NEXT_LEVEL);
          break;
        case MessageBroker.MESSAGE_PAUSE:
          this.playSound(AudioManager.SOUND_PAUSE, 0.8);
          break;
        case MessageBroker.MESSAGE_PHANTOM:
          this.playSound(AudioManager.SOUND_PHANTOM, 0.8);
          break;
        case MessageBroker.MESSAGE_PLAYER_CHANGED_LANE:
          this.playSound(AudioManager.SOUND_PLAYER_LANE_CHANGE);
          break;
        case MessageBroker.MESSAGE_PLAYER_DEATH:
          this.playSound(AudioManager.SOUND_PLAYER_DEATH);
          break;
        case MessageBroker.MESSAGE_PLAYER_SHOOT:
          this.playSound(AudioManager.SOUND_PLAYER_SHOOT, 0.8);
          break;
        case MessageBroker.MESSAGE_PLAYER_SHOOT_GRENADE:
          this.playSound(AudioManager.SOUND_GRENADE, 0.8);
          break;
        case MessageBroker.MESSAGE_PLAYER_SHOOT_LASER:
          this.playSound(AudioManager.SOUND_LASER, 0.8);
          break;
        case MessageBroker.MESSAGE_PLAYER_SHOOT_MISSILE:
          this.playSound(AudioManager.SOUND_MISSILE, 0.8);
          break;
        case MessageBroker.MESSAGE_PLAYER_SUPERZAPPER_USED:
          this.playSound(AudioManager.SOUND_YES, 0.8);
          break;
        case MessageBroker.MESSAGE_POWERUP:
          this.playSound(AudioManager.SOUND_POWERUP);
          break;
        case MessageBroker.MESSAGE_SHIELD:
          this.playSound(AudioManager.SOUND_SHIELD, 0.8);
          break;
        case MessageBroker.MESSAGE_SPOOKY:
          this.playSound(AudioManager.SOUND_SPOOKY, 0.8);
          break;
        case MessageBroker.MESSAGE_SYNTH_SURGE:
          this.playSound(AudioManager.SOUND_SYNTH_SURGE, 0.8);
          break;
        case MessageBroker.MESSAGE_YES:
          this.playSound(AudioManager.SOUND_YES, 0.8);
          break;
        default:
          console.warn(
            `[AudioManager] Unhandled message in switch: ${msgObj.message}`,
          );
          break;
      }
    }
  }

  /**
   * Fetches and decodes all audio files once at boot.
   * @param {string[]} soundNames - Array of sound filenames (without .ogg)
   */
  async preload(soundNames) {
    await Promise.all(
      soundNames.map(
        (name) =>
          new Promise((resolve) => {
            this.audioLoader.load(
              `sounds/${name}.ogg`,
              (buffer) => {
                this.buffers.set(name, buffer);
                resolve();
              },
              undefined, // onProgress is not needed
              (err) => {
                console.warn(
                  `[AudioManager] Missing or failed sound: ${name}.ogg`,
                  err,
                );
                resolve(); // Resolve anyway so one missing file doesn't hang the whole game boot
              },
            );
          }),
      ),
    );

    this.isLoaded = true;
  }
}
