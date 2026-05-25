import ContentManager from '@/Helpers/ContentManager';

export default class ScreenContentManager extends ContentManager {
  // Removed legacy @readonly decorators
  static KEY_PLAYER_ID = 'player_id';
  static KEY_SCORE = 'score';
  static KEY_HIGHEST_SCORE = 'highest_score';
  static KEY_HIGH_SCORES = 'high_scores';
  static KEY_LIVES = 'lives';
  static KEY_LEVEL = 'level';
  static KEY_SELECT_OFFSET = 'select_offset';
  static KEY_SELECT_ACTIVE = 'select_active';
  static KEY_LEVELS = 'levels';
  static KEY_CREDITS = 'credits';
  static KEY_SUPERZAPPER_USED = 'superzapper_used';
  static KEY_RANK_POSITION = 'rank_position';
  static KEY_LEVEL_SELECTED_CALLBACK = 'level_selected_callback';
  static KEY_PUSH_HIGH_SCORE_CALLBACK = 'push_high_score_callback';
  static KEY_CLOSE_HIGH_SCORES_SCREEN_CALLBACK = 'close_high_scores_screen_callback';

  /**
   * @param {number} score
   */
  setScore (score) {
    this.set(ScreenContentManager.KEY_SCORE, score);
  }

  /**
   * @param {{name: string, score: number}[]} highScores
   */
  setHighScores (highScores) {
    this.set(ScreenContentManager.KEY_HIGH_SCORES, highScores);
    this.set(ScreenContentManager.KEY_HIGHEST_SCORE, highScores[0]);
  }

  /**
   * @param {number} credits
   */
  setCredits (credits) {
    this.set(ScreenContentManager.KEY_CREDITS, credits);
  }

  /**
   * @param {number} lives
   */
  setLives (lives) {
    this.set(ScreenContentManager.KEY_LIVES, lives);
  }

  /**
   * @param {number} level
   */
  setLevel (level) {
    this.set(ScreenContentManager.KEY_LEVEL, level);
  }

  /**
   * @param {boolean} superzapperUsed
   */
  setSuperzapperUsed (superzapperUsed) {
    this.set(ScreenContentManager.KEY_SUPERZAPPER_USED, superzapperUsed);
  }

  /**
   * @param {number} offset
   */
  setSelectOffset (offset) {
    this.set(ScreenContentManager.KEY_SELECT_OFFSET, offset);
  }

  /**
   * @param {number} active
   */
  setSelectActive (active) {
    this.set(ScreenContentManager.KEY_SELECT_ACTIVE, active);
  }

  /**
   * @param {{id: number, score: number}[]} levels
   */
  setSelectLevels (levels) {
    this.set(ScreenContentManager.KEY_LEVELS, levels);
  }

  /**
   * @param {function} levelSelectedCallback
   */
  setLevelSelectedCallback (levelSelectedCallback) {
    this.set(ScreenContentManager.KEY_LEVEL_SELECTED_CALLBACK, levelSelectedCallback);
  }

  /**
   * @param {function} closeHighScoresScreenCallback
   */
  setCloseHighScoresScreenCallback (closeHighScoresScreenCallback) {
    this.set(ScreenContentManager.KEY_CLOSE_HIGH_SCORES_SCREEN_CALLBACK, closeHighScoresScreenCallback);
  }

  /**
   * @param {function} pushHighScoreCallback
   */
  setPushHighScoreCallback (pushHighScoreCallback) {
    this.set(ScreenContentManager.KEY_PUSH_HIGH_SCORE_CALLBACK, pushHighScoreCallback);
  }
}