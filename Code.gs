function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('WordSprint')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

var CATEGORIES = [
  "Animals", "Countries", "Fruits", "Sports", "Movies",
  "Colors", "Occupations", "Cities", "School Subjects", "Vegetables",
  "Board Games", "Drinks", "Superheroes", "Musical Instruments", "Car Brands",
  "Video Games", "Body Parts", "Cartoon Characters", "Girl's name" , "Boy's name", "School subjects" , "States" , "Luxury Brands" , "Tech Brands" , "Beauty Brands" , "Hand Tools" , "Food" , "Morning Routine" , "Chat Responses" , "Solar Systems" , "Shoe Brands" , "Cleaning Tools" , "Clothing Brands" , "Things You can kick" , "Foods You Eat Raw" , "Something you keep hidden" , "Things That Have Buttons" , "Kpop Girl's Group" , "Kpop Boy's Group" , "Music Genre" , "Kpop Song" , "Music's Tittles" , "Food Flavours" , "Fast Food Chains" , "Periodic Table of Elements" , "Languages" , "Vehicles" , "In This Rooms" , "Smelly & Stinky Stuff" , "Somethings Yellow" , "At Beach" , "Universities" , "Something Cold" , "Something Hot" , "Something Blue" , "Something Green" , "Something Red" , "Reason's To Celebrate" , "Heavy Objects" , "Celebrities" , "5 letter words" , "Seasons" , "Malaysia Celebration" , "Tv Channels" , "Store's Name" , "Things that are sweet" , "Funny Phrase" , "Iconic Phrases" , "Fruits" , "Why your Homeworks is not done" , "Excuses for Skipping School" , "Things at Pasar Malam" , "Things at School" , "Things Mum Says" , "Things Siblings Says" , "Excuses for Being Late" , "Something use to communicate" ,"Famous Athletes", "Dance Styles"
];

function _props() {
  return PropertiesService.getScriptProperties();
}
function _roomKey(code) {
  return 'room_' + code;
}
function _readRoom(code) {
  var raw = _props().getProperty(_roomKey(code));
  return raw ? JSON.parse(raw) : null;
}
function _writeRoom(code, state) {
  _props().setProperty(_roomKey(code), JSON.stringify(state));
}
function _randomCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}
function _nextCategory(state) {
  var category;
  if (typeof state.categoryIndex !== 'number') {
    // First round: pick a random starting point in the list
    var startIdx = Math.floor(Math.random() * CATEGORIES.length);
    category = CATEGORIES[startIdx];
    state.categoryIndex = (startIdx + 1) % CATEGORIES.length;
  } else {
    // Later rounds: follow the array order from where we left off
    category = CATEGORIES[state.categoryIndex % CATEGORIES.length];
    state.categoryIndex = (state.categoryIndex + 1) % CATEGORIES.length;
  }
  return category;
}

function _beginRound(state) {
  state.started = true;
  state.roundActive = true;
  state.category = _nextCategory(state);
  state.usedLetters = [];
  state.playerActive = state.playerActive.map(function () { return true; });
  state.currentPlayerIndex = 0;
  state.timerEndTimestamp = Date.now() + 10000;
  state.winner = null;
  state.lastAction = { type: 'newRound', ts: Date.now() };
}

/** Create a new room. Creator becomes Player 1 (index 0). */
function createRoom(maxPlayers) {
  maxPlayers = Math.max(2, Math.min(12, parseInt(maxPlayers, 10) || 2));
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var code;
    do {
      code = _randomCode();
    } while (_props().getProperty(_roomKey(code)));

    var state = {
      code: code,
      maxPlayers: maxPlayers,
      joinedCount: 1,
      playerNames: ['Player 1'],
      playerActive: [true],
      started: false,
      roundActive: false,
      category: '',
      categoryIndex: null,
      usedLetters: [],
      currentPlayerIndex: -1,
      timerEndTimestamp: 0,
      version: 1,
      lastAction: { type: 'created', ts: Date.now() },
      winner: null
    };
    _writeRoom(code, state);
    return { success: true, code: code, playerIndex: 0, state: state };
  } finally {
    lock.releaseLock();
  }
}

/** Join an existing room by code. */
function joinRoom(code) {
  code = String(code).trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var state = _readRoom(code);
    if (!state) return { success: false, error: 'Room not found.' };
    if (state.joinedCount >= state.maxPlayers) return { success: false, error: 'Room is full.' };
    if (state.started) return { success: false, error: 'Game already started.' };

    var playerIndex = state.joinedCount;
    state.playerNames.push('Player ' + (playerIndex + 1));
    state.playerActive.push(true);
    state.joinedCount++;

    if (state.joinedCount === state.maxPlayers) {
      _beginRound(state);
    }
    state.version++;
    _writeRoom(code, state);
    return { success: true, playerIndex: playerIndex, state: state };
  } finally {
    lock.releaseLock();
  }
}

/** Poll this to get the latest room state. */
function getState(code) {
  var state = _readRoom(String(code).trim());
  if (!state) return { success: false, error: 'Room not found.' };
  return { success: true, state: state };
}

/** A player presses a letter (also passes the turn). */
function pressLetter(code, playerIndex, letter) {
  code = String(code).trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var state = _readRoom(code);
    if (!state || !state.started || !state.roundActive) {
      return { success: false, error: 'Round not active.', state: state };
    }
    if (state.currentPlayerIndex !== playerIndex) {
      return { success: false, error: 'Not your turn.', state: state };
    }
    if (state.usedLetters.indexOf(letter) !== -1) {
      return { success: false, error: 'Letter already used.', state: state };
    }

    state.usedLetters.push(letter);

    var activeIdx = [];
    state.playerActive.forEach(function (a, i) { if (a) activeIdx.push(i); });
    if (activeIdx.length <= 1) {
      state.roundActive = false;
      state.winner = activeIdx.length === 1 ? state.playerNames[activeIdx[0]] : 'No one';
    } else {
      var idx = state.currentPlayerIndex;
      do {
        idx = (idx + 1) % state.playerActive.length;
      } while (!state.playerActive[idx]);
      state.currentPlayerIndex = idx;
      state.timerEndTimestamp = Date.now() + 10000;
    }

    state.version++;
    state.lastAction = { type: 'letter', letter: letter, ts: Date.now() };
    _writeRoom(code, state);
    return { success: true, state: state };
  } finally {
    lock.releaseLock();
  }
}

/** Called by a client when its local countdown hits 0, to report a timeout. Safe if called by multiple devices. */
function checkTimeout(code, playerIndex, timerEndTimestamp) {
  code = String(code).trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var state = _readRoom(code);
    if (!state || !state.started || !state.roundActive) return { success: true, state: state };
    if (state.currentPlayerIndex !== playerIndex || state.timerEndTimestamp !== timerEndTimestamp) {
      return { success: true, state: state }; // already handled / stale request
    }
    if (Date.now() < state.timerEndTimestamp) {
      return { success: true, state: state };
    }

    state.playerActive[playerIndex] = false;
    var activeIdx = [];
    state.playerActive.forEach(function (a, i) { if (a) activeIdx.push(i); });
    if (activeIdx.length <= 1) {
      state.roundActive = false;
      state.winner = activeIdx.length === 1 ? state.playerNames[activeIdx[0]] : 'No one';
    } else {
      var idx = playerIndex;
      do {
        idx = (idx + 1) % state.playerActive.length;
      } while (!state.playerActive[idx]);
      state.currentPlayerIndex = idx;
      state.timerEndTimestamp = Date.now() + 10000;
    }
    state.version++;
    state.lastAction = { type: 'eliminate', player: playerIndex, ts: Date.now() };
    _writeRoom(code, state);
    return { success: true, state: state };
  } finally {
    lock.releaseLock();
  }
}

/** Any player can trigger the next round once the current one has ended. */
function startNewRound(code) {
  code = String(code).trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var state = _readRoom(code);
    if (!state) return { success: false, error: 'Room not found.' };
    _beginRound(state);
    state.version++;
    _writeRoom(code, state);
    return { success: true, state: state };
  } finally {
    lock.releaseLock();
  }
}
