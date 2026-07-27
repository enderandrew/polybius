/**
 * KeyboardInput
 *
 * Two kinds of binding:
 *
 *   register(key, action)      Fires `action` EVERY FRAME while the key is held.
 *                              Use for continuous input (movement). Callers are
 *                              responsible for their own rate limiting.
 *
 *   registerPress(key, action) Fires `action` ONCE per physical press (rising
 *                              edge). Use for discrete input (dash, jump) where
 *                              holding the key must not repeat the action.
 *
 *   track(key)                 Records up/down state only, with no callback.
 *                              Query it with isDown(). Use for modifier-style
 *                              input (lane lock) that is polled rather than
 *                              dispatched.
 *
 * A key may only have one binding at a time — register/registerPress/track all
 * replace any existing binding for that key.
 */
class KeyboardInput {
  /**
   * @var {{key: string, keyDown: boolean, justPressed: boolean,
   *        action: ?function, onPress: ?function}[]}
   */
  keyToFunctionMap = [];

  constructor() {
    document.onkeydown = (event) => {
      const element = this._find(event.code);
      if (element === undefined) {
        return;
      }

      // Rising edge only — browser key auto-repeat fires onkeydown repeatedly
      // while a key is held, which would otherwise look like many presses.
      if (!element.keyDown) {
        element.justPressed = true;
      }

      element.keyDown = true;
    };

    document.onkeyup = (event) => {
      const element = this._find(event.code);
      if (element === undefined) {
        return;
      }

      // Deliberately does NOT clear justPressed: a tap short enough to start
      // and end between two frames must still dispatch. dispatchActions()
      // consumes the flag instead.
      element.keyDown = false;
    };
  }

  _find(key) {
    return this.keyToFunctionMap.find((keyMap) => keyMap.key === key);
  }

  dispatchActions() {
    for (const keyMap of this.keyToFunctionMap) {
      if (keyMap.justPressed && keyMap.onPress) {
        keyMap.onPress();
      }

      if (keyMap.keyDown && keyMap.action) {
        keyMap.action();
      }

      keyMap.justPressed = false;
    }
  }

  /**
   * True while the key is physically held. For polled/modifier input.
   * @param {string} key
   * @return {boolean}
   */
  isDown(key) {
    const element = this._find(key);
    return element !== undefined && element.keyDown;
  }

  /**
   * Continuous binding — fires every frame while held.
   * @param {string} key
   * @param {function} action
   */
  register(key, action) {
    this.unregister(key);

    this.keyToFunctionMap.push({
      key: key,
      keyDown: false,
      justPressed: false,
      action: action,
      onPress: null,
    });
  }

  /**
   * Discrete binding — fires once per press, ignoring auto-repeat.
   * @param {string} key
   * @param {function} action
   */
  registerPress(key, action) {
    this.unregister(key);

    this.keyToFunctionMap.push({
      key: key,
      keyDown: false,
      justPressed: false,
      action: null,
      onPress: action,
    });
  }

  /**
   * State-only binding for isDown() polling; dispatches nothing.
   * @param {string} key
   */
  track(key) {
    this.unregister(key);

    this.keyToFunctionMap.push({
      key: key,
      keyDown: false,
      justPressed: false,
      action: null,
      onPress: null,
    });
  }

  /**
   * @param {string} key
   */
  unregister(key) {
    const index = this.keyToFunctionMap.findIndex(
      (keyMap) => keyMap.key === key,
    );

    if (index >= 0) {
      this.keyToFunctionMap.splice(index, 1);
    }
  }

  purge() {
    this.keyToFunctionMap = [];
  }
}

const keyboardInput = new KeyboardInput();
export default keyboardInput;
