export class MessageBroker {
  // Removed legacy @readonly decorators. 
  // Standard ALL_CAPS naming convention designates these as static constants.
  static TOPIC_AUDIO = 'topic_audio';
  static TOPIC_SCREEN = 'topic_screen';

  static MESSAGE_PLAYER_DEATH = 'message_player_death';
  static MESSAGE_PLAYER_CHANGED_LANE = 'message_player_changed_lane';
  static MESSAGE_NEXT_LEVEL = 'message_next_level';
  static MESSAGE_PLAYER_SHOOT = 'message_player_shoot';
  static MESSAGE_PLAYER_SUPERZAPPER_USED = 'message_player_superzapper_used';
  static MESSAGE_ENEMY_SHOOT = 'message_enemy_shoot';
  static MESSAGE_ENEMY_DEATH = 'message_enemy_death';
  static MESSAGE_MENU_CHANGE = 'message_menu_change';
  static MESSAGE_MENU_SELECT = 'message_menu_select';
  static MESSAGE_1UP = '1up';
  static MESSAGE_ACHIEVEMENT = 'achievement';
  static MESSAGE_BIGFOOT = 'bigfoot';
  static MESSAGE_CRT = 'crt';
  static MESSAGE_GAME = 'game';
  static MESSAGE_JUMP = 'jump';
  static MESSAGE_KONAMI = 'Konami';
  static MESSAGE_PAUSE = 'pause';
  static MESSAGE_POWERUP = 'powerup';
  static MESSAGE_SPOOKY = 'spooky';

  // Initialized as a standard object rather than an array for proper key-value topic mapping
  messages = {};

  publish (topic, message, context = []) {
    if (!(topic in this.messages)) {
      this.messages[topic] = [];
    }

    this.messages[topic].push(new Message(topic, message, context));

    // console.log(`Published ${message} under ${topic}`);
  }

  consume (topic) {
    if (!(topic in this.messages)) {
      return null;
    }

    if (this.messages[topic].length === 0) {
      return null;
    }

    // console.log(`Consumed ${this.messages[topic][0].message} under ${topic}`);
    return this.messages[topic].shift();
  }
}

export class Message {
  // Modern ES class fields replacing JSDoc @var comments
  topic;
  message;
  context;

  constructor (topic, message, context = []) {
    this.topic = topic;
    this.message = message;
    this.context = context;
  }

  isTopic (topic) {
    return this.topic === topic;
  }

  isMessage (message) {
    return this.message === message;
  }
}

const messageBroker = new MessageBroker();
export default messageBroker;