/**
 * AuditorMode.js
 *
 * Drives one Auditor scene end to end: mounts the screen, cuts the music,
 * plays the cigarette sound, fires the per-scene audio cues, then hands off to
 * whatever mode would normally have followed.
 *
 * ── Why this isn't just TransitionMode with a different screen ───────────────
 *
 * These scenes need audio choreography TransitionMode has no concept of: a
 * cigarette sound that must complete, an optional sub-bass thud at a specific
 * offset, optional degraded speech, a BGM cut, and — for the final scene — a
 * hold that waits for input rather than a fixed duration.
 *
 * ── The parody narrator is suppressed entirely ───────────────────────────────
 *
 * No joke message, no narration. The absence of the voice that has been
 * shouting at the player for hundreds of levels is what signals that something
 * else is talking.
 */

import { GameMode } from '@/Object/Manager/ModeManager';
import Sequencer from '@/utils/Sequencer';
import keyboardInput from '@/utils/KeyboardInput';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';
import JuiceManager from '@/utils/JuiceManager';

export default class AuditorMode extends GameMode {
  /**
   * @param {ScreenAuditor} screenObject
   * @param {object} scene
   * @param {Function} nextModeFactory
   */
  constructor(screenObject, scene, nextModeFactory) {
    super();
    this.screenObject = screenObject;
    this.scene = scene;
    this.nextModeFactory = nextModeFactory;
    this.sequencer = new Sequencer();
    this.waitingForInput = false;
    this._advanced = false;
  }

  enter(game) {
    game.releaseLevel();
    if (game.powerUpHUD) game.powerUpHUD.hide();

    game.camera.position.set(0, 0, -6);
    game.camera.lookAt(0, 0, 10);

    if (this.scene.bgmCut && game.bgmManager) {
      game.bgmManager.stop();
    }

    game.loadScreen(this.screenObject);
    if (game.screenObject) {
      game.screenObject.position.z = 0.1;
    }

    // The cigarette plays on EVERY scene, including the ones where he isn't
    // drawn. He is always present; this is the evidence.
    messageBroker.publish(
      MessageBroker.TOPIC_AUDIO,
      MessageBroker.MESSAGE_CIGARETTE,
    );

    // A single hard chromatic/tear hit on arrival sells the cut as a break in
    // the signal rather than a normal screen change.
    JuiceManager.emit('auditor-cut');

    if (this.scene.thud) {
      this.sequencer.add(this.scene.thudAtMs, () => {
        messageBroker.publish(
          MessageBroker.TOPIC_AUDIO,
          MessageBroker.MESSAGE_THUG,
        );
      });
    }

    if (this.scene.speech) {
      this.sequencer.add(600, () => this._speak(this.scene.speech));
    }

    if (this.scene.special === 'bgm-stab') {
      // Music slams back in mid-bar, wrong and too loud, then cuts again.
      this.sequencer.add(this.scene.holdMs - 900, () => {
        if (game.bgmManager) {
          game.bgmManager.play?.();
          game.bgmManager.audio.volume = 1;
        }
      });
      this.sequencer.add(this.scene.holdMs - 400, () => {
        if (game.bgmManager) game.bgmManager.stop();
      });
    }

    if (this.scene.special === 'wait-for-input') {
      // The ending waits. holdMs is only the floor before input is accepted.
      this.sequencer.add(this.scene.holdMs, () => {
        this.waitingForInput = true;
        this._bindAnyKey(game);
      });
    } else {
      this.sequencer.add(this.scene.holdMs, () => this._advance(game));
    }
  }

  update(game, delta) {
    keyboardInput.dispatchActions();

    if (this.screenObject && typeof this.screenObject.update === 'function') {
      this.screenObject.update();
    }

    if (this.scene.special === 'rising-tone') {
      // A tone that climbs slightly and never resolves.
      JuiceManager.emit('auditor-tone', { progress: this.screenObject.progress() });
    }

    if (game.isPaused) return;
    this.sequencer.update(delta);
  }

  _speak(speech) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speech.text);
      utterance.pitch = speech.pitch;
      utterance.rate = speech.rate;
      utterance.volume = speech.volume;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.debug('[Auditor] speech failed:', error);
    }
  }

  _bindAnyKey(game) {
    this._keyHandler = () => this._advance(game);
    window.addEventListener('keydown', this._keyHandler, { once: true });
  }

  _advance(game) {
    if (this._advanced) return;
    this._advanced = true;

    if (game.modeManager && game.modeManager.currentMode === this) {
      game.modeManager.switchMode(this.nextModeFactory());
    }
  }

  exit(game) {
    this.sequencer.clear();

    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Non-fatal.
    }

    game.releaseScreen();
  }
}
