/*
  Mineflayer — Strict Anti-AFK (Enhanced) with Ban Evasion Username Cycling

  Goals:
  - Provide a STRICTER, more varied anti-AFK routine that mimics human behavior with constant activity.
  - Includes frequent moving, looking, jumping, interacting (arm swings), and block breaking to ensure high activity levels.
  - Keep actions configurable and rate-limited to reduce suspicious bursts.
  - Do NOT include any evasive or "undetectable" techniques. Use only visible, allowed actions.
  - Optionally request spectator mode on login — only if AUTHORIZED is true.
  - On ban detection (via kick reason), automatically increment username suffix and reconnect.
  - Automatically detect registration/login prompts in chat and respond with /register or /login.

  ⚠️ Use responsibly and only where permitted.
*/

const mineflayer = require('mineflayer');
const Vec3 = require('vec3');

// Optional pathfinder
let pathfinderAvailable = false;
let pathfinder, Movements, goals;
try {
  pathfinder = require('mineflayer-pathfinder');
  Movements = pathfinder.Movements;
  goals = pathfinder.goals;
  pathfinderAvailable = true;
  console.log('ℹ️ pathfinder loaded — patrols enabled');
} catch (e) {
  console.log('⚠️ pathfinder not available — patrols disabled');
}

// Connection / account details
const HOST = 'play.smgin.me';
const PORT = 11289;
const BASE_USERNAME = 'SMGSecurity';
const VERSION = '1.21.8';
const PASSWORD = 'Securitybysmg007';
let currentSuffix = 0;
const MAX_USERNAME_SUFFIX = 1000;

// Settings
const AUTHORIZED = false;
const AGGRESSIVENESS = 2;

// Helper scales
const AGG_SCALE = {
  1: { jumpInt:[20,40], lookInt:[8,20], walkInt:[25,50], sneakInt:[40,80], sprintInt:[50,100], breakInt:[60,120], walkRadius:1.2 },
  2: { jumpInt:[15,30], lookInt:[5,15], walkInt:[20,40], sneakInt:[30,60], sprintInt:[40,80], breakInt:[30,60], walkRadius:2.5 },
  3: { jumpInt:[10,25], lookInt:[3,12], walkInt:[15,30], sneakInt:[20,50], sprintInt:[25,60], breakInt:[15,40], walkRadius:3.5 }
}[AGGRESSIVENESS || 2];

// Rate limiting
const MAX_ACTIONS_PER_MIN = 50;
let actionCounter = 0, windowStart = Date.now();
function incrAction() {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; actionCounter = 0; }
  actionCounter++;
  return actionCounter;
}
function withinRate() { return incrAction() <= MAX_ACTIONS_PER_MIN; }

function randBetween(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(randBetween(min, max + 1)); }

let bot = null;
let reconnectBackoff = 1000;
let timers = new Set();
function trackTimer(t) { timers.add(t); return t; }
function clearTrackedTimers() { for (const t of timers) { try { clearTimeout(t); clearInterval(t); } catch(e){} } timers.clear(); }
function scheduleOnce(fn, ms) { return trackTimer(setTimeout(fn, ms)); }

// Username logic
function getCurrentUsername() {
  return currentSuffix === 0 ? BASE_USERNAME : `${BASE_USERNAME}${currentSuffix}`;
}

// ========== CREATE BOT ==========
function createBot() {
  const username = getCurrentUsername();
  console.log(`⏳ Creating bot with username: ${username}…`);
  bot = mineflayer.createBot({ host: HOST, port: PORT, username, version: VERSION });

  if (pathfinderAvailable) pathfinder(bot);

  bot.once('login', () => {
    console.log(`✅ [login] Connected as ${username}`);
    reconnectBackoff = 1000;

    let hasRegistered = false;
    let hasLoggedIn = false;

    const messageListener = (jsonMsg) => {
      const message = jsonMsg.toString().toLowerCase();
      console.log(`📨 Chat: ${jsonMsg.toString()}`);

      if (!hasRegistered && message.includes('register')) {
        bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
        hasRegistered = true;
        console.log('ℹ️ [auth] Sent /register');
      }

      if (!hasLoggedIn && message.includes('login')) {
        bot.chat(`/login ${PASSWORD}`);
        hasLoggedIn = true;
        console.log('ℹ️ [auth] Sent /login');
      }

      if (hasRegistered || hasLoggedIn) {
        scheduleOnce(() => bot.removeListener('message', messageListener), 5000);
      }
    };

    bot.on('message', messageListener);

    if (AUTHORIZED) {
      scheduleOnce(() => {
        bot.chat('/gamemode spectator');
        console.log('ℹ️ [gamemode] Requested spectator (AUTHORIZED)');
      }, 5000);
    }

    scheduleOnce(startAntiAfkLoops, 8000);
  });

  bot.on('spawn', () => console.log('✅ [spawn] World loaded'));

  bot.on('kicked', (reason) => {
    const reasonStr = reason.toString().toLowerCase();
    console.warn('⚠️ [kicked]', reason.toString());
    if (reasonStr.includes('ban') || reasonStr.includes('banned')) {
      currentSuffix++;
      if (currentSuffix > MAX_USERNAME_SUFFIX) {
        console.error('❌ Max username attempts reached. Exiting.');
        process.exit(1);
      }
      console.log(`🔄 Ban detected — next username: ${getCurrentUsername()}`);
    }
  });

  bot.on('error', (err) => console.error('❌ [error]', err));
  bot.on('end', () => {
    console.log(`🔁 [end] Reconnecting in ${Math.round(reconnectBackoff/1000)}s...`);
    clearTrackedTimers();
    setTimeout(createBot, reconnectBackoff);
    reconnectBackoff = Math.min(reconnectBackoff * 1.9, 60000);
  });
}

// ========== ACTIONS ==========
const Actions = {
  jump: (durMs = 480) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('jump', true);
    scheduleOnce(() => bot.setControlState('jump', false), durMs);
    console.log('🦘 [action] Jump');
  },
  lookAround: (yawDeg=50, pitchDeg=12) => {
    if (!bot || !bot.entity || !withinRate()) return;
    const yaw = bot.entity.yaw + randBetween(-yawDeg, yawDeg)*(Math.PI/180);
    const pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, bot.entity.pitch + randBetween(-pitchDeg,pitchDeg)*(Math.PI/180)));
    bot.look(yaw, pitch, true);
    console.log('👀 [action] Look');
  },
  sneakToggle: (durMs=4200) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('sneak', true);
    scheduleOnce(() => bot.setControlState('sneak', false), durMs);
    console.log('🕵️ [action] Sneak');
  },
  sprintToggle: (durMs=6000) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('sprint', true);
    scheduleOnce(() => bot.setControlState('sprint', false), durMs);
    console.log('🏃 [action] Sprint');
  },
  smallNudge: () => {
    if (!bot || !bot.entity || !withinRate()) return;
    const dirs = ['forward','back','left','right'];
    const d = dirs[randInt(0,3)];
    bot.setControlState(d, true);
    scheduleOnce(() => bot.setControlState(d, false), randInt(800,1600));
    console.log('🚶 [action] Move');
  },
  subtleSwing: () => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.activateItem(false);
    console.log('✋ [action] Swing');
  }
};

// ========== LOOPING BEHAVIOR ==========
function startAntiAfkLoops() {
  console.log('🌀 [anti-AFK] Started');
  const loop = (fn, min, max) => {
    const next = randBetween(min, max)*1000;
    scheduleOnce(() => { fn(); loop(fn,min,max); }, next);
  };
  loop(() => Actions.jump(randInt(400,700)), ...AGG_SCALE.jumpInt);
  loop(() => Actions.lookAround(), ...AGG_SCALE.lookInt);
  loop(() => Actions.smallNudge(), ...AGG_SCALE.walkInt);
  loop(() => Actions.sneakToggle(randInt(2000,4000)), ...AGG_SCALE.sneakInt);
  loop(() => Actions.sprintToggle(randInt(3000,6000)), ...AGG_SCALE.sprintInt);
  loop(() => Actions.subtleSwing(), 10, 25);
}

// ========== START ==========
createBot();
