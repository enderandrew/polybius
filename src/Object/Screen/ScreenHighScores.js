import Canvas3d from '@/Object/Screen/Canvas3d';
import keyboardInput from '@/utils/KeyboardInput';
import ScreenContentManager from '@/Object/Screen/ScreenContentManager';
import messageBroker, { MessageBroker } from '@/Helpers/MessageBroker';

export default class ScreenHighScores extends Canvas3d {
  // Cleaned up for modern ES class fields (no JSDoc variable comments needed)
  playerName = ['A', 'A', 'A'];
  place = 8;
  score = 0;
  highScores = [];
  currentStep = 0;
  
  // Parody timing variable
  glitchTimer = 0;

  constructor (screenContentManager, width = 8, height = 8, canvasResX = 1024, canvasResY = 1024) {
    super(screenContentManager, width, height, canvasResX, canvasResY);

    this.highScores = [...this.screenContentManager.get(ScreenContentManager.KEY_HIGH_SCORES)];
    this.score = this.screenContentManager.get(ScreenContentManager.KEY_SCORE);

    this.place = this.highScores.findIndex(row => row.score <= this.score);
    if (this.place >= 0) {
      this.highScores.splice(this.place, 0, { name: 'AAA', score: this.score });
      this.highScores.pop();
    } else {
      this.currentStep = 3;
    }

    this.registerKeys();
  }

  release () {
    this.unregisterKeys();
  }

  registerKeys () {
    keyboardInput.register('KeyA', () => { this.prevChar(); });
    keyboardInput.register('KeyD', () => { this.nextChar(); });
    keyboardInput.register('Space', () => { this.step(); });
  }

  unregisterKeys () {
    keyboardInput.unregister('KeyA');
    keyboardInput.unregister('KeyD');
    keyboardInput.unregister('Space');
  }

  nextChar () {
    if (this.currentStep >= 3 || !this.keyInputDelay()) return;

    let char = this.playerName[this.currentStep].charCodeAt(0);
    if (char < 90) char++;

    this.playerName[this.currentStep] = String.fromCharCode(char);
    this.highScores[this.place].name = this.playerName.join('');
    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_MENU_CHANGE);
  }

  prevChar () {
    if (this.currentStep >= 3 || !this.keyInputDelay()) return;

    let char = this.playerName[this.currentStep].charCodeAt(0);
    if (char > 65) char--;

    this.playerName[this.currentStep] = String.fromCharCode(char);
    this.highScores[this.place].name = this.playerName.join('');
    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_MENU_CHANGE);
  }

  step () {
    if (!this.keyInputDelay()) return;

    if (this.currentStep >= 3) {
      this.screenContentManager.get(ScreenContentManager.KEY_PUSH_HIGH_SCORE_CALLBACK)(
        this.score,
        this.playerName.join('')
      );
      this.screenContentManager.get(ScreenContentManager.KEY_CLOSE_HIGH_SCORES_SCREEN_CALLBACK)();
    }

    this.currentStep++;
    messageBroker.publish(MessageBroker.TOPIC_AUDIO, MessageBroker.MESSAGE_MENU_SELECT);
  }

  draw () {
    this.clearCanvas();
    this.glitchTimer++;

    this.setFontSizePx(30);
    this.drawText(this.alignNumberToRight(this.score), 372, 90, Canvas3d.COLOR_BLUE);
    this.drawText(this.playerName.join(''), 548, 90, Canvas3d.COLOR_BLUE);
    this.drawText('game over', 423, 140, Canvas3d.COLOR_BLUE);

    for (let i = 0; i < this.highScores.length; i++) {
      // Polybius Parody: Occasionally replace random high score names with government agency initials
      let displayName = this.highScores[i].name;
      let displayColor = Canvas3d.COLOR_GREEN;

      if (Math.random() > 0.995) {
        const spookyNames = ['FBI', 'CIA', 'MKU', 'NSA', 'NWO', '???'];
        displayName = spookyNames[Math.floor(Math.random() * spookyNames.length)];
        displayColor = Canvas3d.COLOR_RED; // Flash red when glitched
      }

      this.drawText(this.alignNumberToRight(this.highScores[i].score), 550, 340 + (i * 50), displayColor);
      this.drawText(displayName, 400, 340 + (i * 50), displayColor);
      this.drawText(this.alignNumberToRight(i + 1), 200, 340 + (i * 50), displayColor);
    }

    // Polybius Parody: The fictional company from the urban legend replacing the old copyright
    this.context.textAlign = 'center';
	this.drawText('© 1981 SINNESLÖSCHEN INC.', 512, 950, Canvas3d.COLOR_RED);
	this.context.textAlign = 'left';
    
    // Parody subliminal flash replacing normal text for 1 frame every ~60 frames
    if (this.glitchTimer % 60 === 0) {
      this.drawText('DATA TRANSMITTED', 325, 1000, Canvas3d.COLOR_WHITE);
    } else {
      this.drawText('Bonus every 20000', 325, 1000, Canvas3d.COLOR_CYAN);
    }

    this.drawText('Use A and D change', 310, 800, Canvas3d.COLOR_CYAN);
    this.drawText('Press fire to confirm', 274, 850, Canvas3d.COLOR_YELLOW);

    this.setFontSizePx(60);
    
    // Slight jitter effect on the main title text
    let titleOffset = Math.random() > 0.95 ? (Math.random() * 4 - 2) : 0;
    this.drawText('HIGH SCORES', 260 + titleOffset, 260, Canvas3d.COLOR_YELLOW);
  }
}