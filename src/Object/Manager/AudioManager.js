import { Audio, AudioLoader } from 'three';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class AudioManager {
  // Removed legacy @readonly decorators
  static SOUND_ENEMY_DEATH = 'enemy_death';
  static SOUND_NEXT_LEVEL = 'next_level';
  static SOUND_PLAYER_DEATH = 'player_death';
  static SOUND_PLAYER_LANE_CHANGE = 'player_lane_change';
  static SOUND_PLAYER_SHOOT = 'player_shoot';
  static SOUND_ENEMY_SHOOT = 'enemy_shoot';
  static SOUND_1UP = '1up';
  static SOUND_ACHIEVEMENT = 'achievement';
  static SOUND_BIGFOOT = 'bigfoot';
  static SOUND_CRT = 'crt';
  static SOUND_KONAMI = 'konami';
  static SOUND_PAUSE = 'pause';
  static SOUND_SPOOKY = 'spooky';
  static SOUND_JUMP = 'jump';
  static SOUND_POWERUP = 'powerup';
  static SOUND_GAME = 'game';
  static SOUND_MENU_SELECT = 'menu_select';

  static SOUND_VOLUME = 0.4;

  // Modern ES class fields replacing JSDoc comments
  audioListener;
  audio = [];
  audioBuffer;

  constructor (audioListener) {
    this.audioListener = audioListener;
    this.audio.push(new Audio(this.audioListener));
  }

  playSound (soundName, volume = 1) {
    let availableAudio = this.audio.find(audio => !audio.isPlaying);

    if (availableAudio === undefined) {
      this.audio.push(new Audio(this.audioListener));
      availableAudio = this.audio[this.audio.length - 1];
    }

    const audioLoader = new AudioLoader();
    audioLoader.load(`sounds/${soundName}.ogg`, buffer => {
      availableAudio.setBuffer(buffer);
      availableAudio.setVolume(volume * AudioManager.SOUND_VOLUME);
      availableAudio.play();
    });
  }

  update () {
    let message = messageBroker.consume(MessageBroker.TOPIC_AUDIO);

    if (message === null) {
      return;
    }

    switch (message.message) {
      case MessageBroker.MESSAGE_ENEMY_DEATH:
        this.playSound(AudioManager.SOUND_ENEMY_DEATH);
        break;
      case MessageBroker.MESSAGE_PLAYER_DEATH:
        this.playSound(AudioManager.SOUND_PLAYER_DEATH);
        break;
      case MessageBroker.MESSAGE_PLAYER_CHANGED_LANE:
        this.playSound(AudioManager.SOUND_PLAYER_LANE_CHANGE);
        break;
      case MessageBroker.MESSAGE_NEXT_LEVEL:
        this.playSound(AudioManager.SOUND_NEXT_LEVEL);
        break;
      case MessageBroker.MESSAGE_PLAYER_SHOOT:
        this.playSound(AudioManager.SOUND_PLAYER_SHOOT, 0.8);
        break;
      case MessageBroker.MESSAGE_ENEMY_SHOOT:
        this.playSound(AudioManager.SOUND_ENEMY_SHOOT, 0.3);
        break;
      case MessageBroker.MESSAGE_MENU_CHANGE:
        this.playSound(AudioManager.SOUND_PLAYER_LANE_CHANGE);
        break;
      case MessageBroker.MESSAGE_MENU_SELECT:
        this.playSound(AudioManager.SOUND_PLAYER_SHOOT, 0.8);
        break;
      case MessageBroker.MESSAGE_1UP:
        this.playSound(AudioManager.SOUND_1UP, 0.8);
        break;
      case MessageBroker.MESSAGE_ACHIEVEMENT:
        this.playSound(AudioManager.SOUND_ACHIEVEMENT, 0.8);
        break;
      case MessageBroker.MESSAGE_BIGFOOT:
        this.playSound(AudioManager.SOUND_BIGFOOT, 0.8);
        break;
      case MessageBroker.MESSAGE_CRT:
        this.playSound(AudioManager.SOUND_CRT, 0.8);
        break;
      case MessageBroker.MESSAGE_GAME:
        this.playSound(AudioManager.SOUND_GAME, 0.8);
        break;
      case MessageBroker.MESSAGE_JUMP:
        this.playSound(AudioManager.SOUND_JUMP, 0.8);
        break;
      case MessageBroker.MESSAGE_KONAMI:
        this.playSound(AudioManager.SOUND_KONAMI, 0.8);
        break;
      case MessageBroker.MESSAGE_PAUSE:
        this.playSound(AudioManager.SOUND_PAUSE, 0.8);
        break;
      case MessageBroker.MESSAGE_POWERUP:
        this.playSound(AudioManager.SOUND_POWERUP, 0.8);
        break;
      case MessageBroker.MESSAGE_SPOOKY:
        this.playSound(AudioManager.SOUND_SPOOKY, 0.8);
        break;
    }
  }
}