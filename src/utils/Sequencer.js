/**
 * A game-loop bound timer utility that prevents real-time desyncs.
 */
export default class Sequencer {
  constructor() {
    this.events = [];
  }

  /**
   * @param {number} delayMs - Delay in milliseconds (matches setTimeout)
   * @param {Function} callback - Function to execute
   */
  add(delayMs, callback) {
    this.events.push({
      targetTime: delayMs / 1000, // convert to seconds for delta comparison
      elapsed: 0,
      callback: callback,
    });
  }

  update(delta) {
    // Iterate backwards so we can safely splice items out while looping
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      event.elapsed += delta;

      if (event.elapsed >= event.targetTime) {
        // Remove the event BEFORE calling the callback to prevent
        // recursive loops if the callback adds new events
        this.events.splice(i, 1);
        event.callback();
      }
    }
  }

  clear() {
    this.events = [];
  }
}
