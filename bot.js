/*
  Mineflayer — Strict Anti-AFK (Enhanced)

  Goals:
  - Provide a stronger, more varied anti-AFK routine that mimics human behavior.
  - Keep actions configurable and rate-limited to reduce suspicious bursts.
  - Do NOT include any evasive or "undetectable" techniques. Use only visible, allowed actions.
  - Optionally request spectator mode on login — only if AUTHORIZED is true.

  Usage:
  - Install: npm i mineflayer vec3
  - Optional (recommended for tiny patrols): npm i mineflayer-pathfinder minecraft-data

  CONFIGURATION
  - AGGRESSIVENESS: 1 (low) — conservative, 2 (medium) — more activity, 3 (high) — frequent nudges
  - AUTHORIZED: set to true only if you have explicit server permission to request gamemode changes.
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
  console.log('⚠️ pathfinder not available — patrols disabled (optional dependency)');
}

// Connection / account details
const HOST = 'play.smgin.me';
const PORT = 11289;
const USERNAME = 'SMGSecurity';
const VERSION = '1.21.8';
const PASSWORD = 'Securitybysmg007';

// Safety flags
const AUTHORIZED = false; // set true ONLY if you are op/owner and have permission
const AGGRESSIVENESS = 2; // 1 = low, 2 = medium, 3 = high

// Aggressiveness scaling helper
const AGG_SCALE = {
  1: { jumpInt: [30,50], lookInt:[12,30], walkInt:[45,90], sneakInt:[60,120], sprintInt:[80,160], walkRadius:1.2 },
  2: { jumpInt: [20,40], lookInt:[8,24], walkInt:[30,70], sneakInt:[40,90], sprintInt:[50,110], walkRadius:2.5 },
  3: { jumpInt: [12,28], lookInt:[6,18], walkInt:[18,50], sneakInt:[30,70], sprintInt:[30,80], walkRadius:3.5 }
}[AGGRESSIVENESS || 2];

// Global rate limits and safeties
const MAX_ACTIONS_PER_MIN = 30; // safety cap per minute
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
function scheduleRepeat(fn, ms) { return trackTimer(setInterval(fn, ms)); }

// Core createBot
function createBot() {
  console.log('⏳ Creating bot…');
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION });

  if (pathfinderAvailable) pathfinder(bot);

  bot.once('login', () => {
    console.log('✅ [login] — connected');
    reconnectBackoff = 1000; // reset

    // Optional: request spectator mode, but only when AUTHORIZED === true
    if (AUTHORIZED) {
      scheduleOnce(() => {
        try {
          bot.chat('/gamemode spectator');
          console.log('ℹ️ [gamemode] requested spectator mode (AUTHORIZED).');
        } catch (e) {
          console.warn('⚠️ [gamemode] failed to request spectator:', e.message || e);
        }
      }, 2500);
    }

    // Delay starting loops slightly until world fully loads
    scheduleOnce(() => startAntiAfkLoops(), 3500);
  });

  bot.on('spawn', () => console.log('✅ [spawn] in world'));
  bot.on('kicked', (reason) => console.warn('⚠️ [kicked]', reason.toString()));
  bot.on('error', (err) => console.error('❌ [error]', err));

  bot.on('end', () => {
    console.log(`🔁 [end] disconnected — reconnecting in ${Math.round(reconnectBackoff/1000)}s`);
    stopAntiAfkLoops();
    clearTrackedTimers();
    setTimeout(createBot, reconnectBackoff);
    reconnectBackoff = Math.min(reconnectBackoff * 1.9, 60000);
  });
}

// Action pool — composable behaviors that mimic a person
const Actions = {
  jump: (durMs = 480) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('jump', true);
      scheduleOnce(() => bot.setControlState('jump', false), durMs);
    } catch(e){}
  },

  lookAround: (yawDeg=50, pitchDeg=12, durationMs=700) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      const yawDelta = (randBetween(-1,1) * yawDeg) * (Math.PI/180);
      const pitchDelta = (randBetween(-0.4,0.4) * pitchDeg) * (Math.PI/180);
      const targetYaw = bot.entity.yaw + yawDelta;
      const targetPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, bot.entity.pitch + pitchDelta));
      bot.look(targetYaw, targetPitch, true);
      // small subtle follow-up jitter
      scheduleOnce(() => { if (bot && bot.entity) bot.look(targetYaw + 0.01, targetPitch, false); }, durationMs);
    } catch(e){}
  },

  sneakToggle: (durMs=4200) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('sneak', true);
      scheduleOnce(() => bot.setControlState('sneak', false), durMs);
    } catch(e){}
  },

  sprintToggle: (durMs=6000) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('sprint', true);
      scheduleOnce(() => bot.setControlState('sprint', false), durMs);
    } catch(e){}
  },

  smallNudge: (radius = AGG_SCALE.walkRadius, durMs = 1200) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    // prefer pathfinder for realistic tiny walk; fallback to controlState nudges
    const origin = bot.entity.position.clone();
    const angle = Math.random() * Math.PI * 2;
    const r = randBetween(0.3, radius);
    const target = origin.offset(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    if (pathfinderAvailable && bot.pathfinder) {
      try {
        const mcData = require('minecraft-data')(bot.version);
        const mov = new Movements(bot, mcData);
        bot.pathfinder.setMovements(mov);
        const goal = new goals.GoalNear(target.x, target.y, target.z, 0.9);
        bot.pathfinder.setGoal(goal, false);
        // cancel if it runs too long
        scheduleOnce(() => { try { bot.pathfinder.setGoal(null); } catch(e){} }, durMs + 900);
        return;
      } catch(e){}
    }
    // fallback: quick directional press
    const dirIdx = randInt(0,3); // 0 forward,1 back,2 left,3 right
    const mapping = ['forward','back','left','right'];
    bot.setControlState(mapping[dirIdx], true);
    scheduleOnce(() => bot.setControlState(mapping[dirIdx], false), durMs);
  },

  subtleSwing: () => {
    // very low-impact: swing arm once (visual). Do not place/break.
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try { bot.activateItem(false); } catch(e){}
  }
};

// Build a sequence that looks human: look -> (jump?) -> smallNudge -> sneak -> look
function performHumanSequence() {
  if (!bot || !bot.entity) return;
  if (!withinRate()) return;
  // randomized sequence length
  const seq = [];
  // always look
  seq.push(() => Actions.lookAround(40,10,800));
  // sometimes jump
  if (Math.random() < 0.5) seq.push(() => Actions.jump(randInt(380,650)));
  // sometimes nudge
  if (Math.random() < 0.75) seq.push(() => Actions.smallNudge(undefined, randInt(800,1600)));
  // small chance to sprint briefly
  if (Math.random() < 0.25) seq.push(() => Actions.sprintToggle(randInt(1200,4200)));
  // subtle arm swing occasionally
  if (Math.random() < 0.35) seq.push(() => Actions.subtleSwing());

  // run sequence with small stagger
  let delay = 0;
  for (const fn of seq) {
    scheduleOnce(fn, delay);
    delay += randInt(250, 900);
  }
}

let activeLoops = [];
function startAntiAfkLoops() {
  clearTrackedTimers();
  activeLoops.forEach(clearInterval);
  activeLoops = [];
  actionCounter = 0; windowStart = Date.now();

  // Schedule periodic randomized events using AGG_SCALE
  // Jump loop
  (function loopJump() {
    const next = randBetween(...AGG_SCALE.jumpInt) * 1000;
    scheduleOnce(() => { Actions.jump(randInt(420,700)); loopJump(); }, next);
  })();

  // Look loop
  (function loopLook() {
    const next = randBetween(...AGG_SCALE.lookInt) * 1000;
    scheduleOnce(() => { Actions.lookAround(45,12); loopLook(); }, next);
  })();

  // Walk nudge loop
  (function loopNudge() {
    const next = randBetween(...AGG_SCALE.walkInt) * 1000;
    scheduleOnce(() => { Actions.smallNudge(undefined, randInt(900,2200)); loopNudge(); }, next);
  })();

  // Sneak toggles
  (function loopSneak() {
    const next = randBetween(...AGG_SCALE.sneakInt) * 1000;
    scheduleOnce(() => { Actions.sneakToggle(randInt(2500,5200)); loopSneak(); }, next);
  })();

  // Sprint toggles (less frequent)
  (function loopSprint() {
    const next = randBetween(...AGG_SCALE.sprintInt) * 1000;
    scheduleOnce(() => { if (Math.random() < 0.5) Actions.sprintToggle(randInt(2000,5200)); loopSprint(); }, next);
  })();

  // Human sequences occasionally
  (function loopSequence() {
    const next = randBetween(18, 45) * 1000; // 18-45s by default
    scheduleOnce(() => { performHumanSequence(); loopSequence(); }, next);
  })();

  // Keep-alive micro adjustments every 25s (very small look nudges only)
  const keepAlive = scheduleRepeat(() => {
    if (!bot || bot._client.destroyed) return;
    try { if (withinRate()) bot.look(bot.entity.yaw + 0.005, bot.entity.pitch, false); } catch(e){}
  }, 25000);
  activeLoops.push(keepAlive);
}

function stopAntiAfkLoops() { clearTrackedTimers(); activeLoops.forEach(clearInterval); activeLoops = []; }

// Start bot
createBot();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 SIGINT — shutting down');
  try { if (bot && bot.quit) bot.quit('SIGINT'); } catch(e){}
  stopAntiAfkLoops();
  clearTrackedTimers();
  setTimeout(() => process.exit(0), 400);
});

process.on('uncaughtException', (err) => console.error('uncaughtException', err));
process.on('unhandledRejection', (r) => console.warn('unhandledRejection', r));
