/*
  Mineflayer — Ultra-Active Anti-AFK With Entity Interaction

  Install:
    npm i mineflayer vec3

  Notes:
  - Every action and delay is randomized for realism.
  - Actions engage (walk, look, sneak, arm swing, etc) plus entity interaction: looks at, approaches, swings at, and right-clicks random entities/mobs/players.
  - Works on any server where these actions are visible to anti-AFK and legit for normal players.
*/

const mineflayer = require('mineflayer');
const Vec3 = require('vec3');

const HOST = 'play.smgin.me';
const PORT = 11289;
const USERNAME = 'SMGSecurity';
const VERSION = '1.21.8';
const PASSWORD = 'Securitybysmg007';

// Very lively rate—tune to your needs (lower if the server is less strict)
const MAX_ACTIONS_PER_MIN = 28;
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
let timers = new Set();
function trackTimer(t) { timers.add(t); return t; }
function clearTrackedTimers() { for (const t of timers) { try { clearTimeout(t); clearInterval(t); } catch(e){} } timers.clear(); }

function scheduleOnce(fn, ms) { return trackTimer(setTimeout(fn, ms)); }

function createBot() {
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION });

  bot.once('login', () => {
    bot.chat(`/login ${PASSWORD}`);
    scheduleOnce(() => startAntiAfkLoops(), 4000);
  });

  bot.on('end', () => {
    stopAntiAfkLoops();
    clearTrackedTimers();
    setTimeout(createBot, 8000);
  });
}

// ------------ ACTIONS ------------
const Actions = {
  jump: (durMs = 320) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('jump', true);
    scheduleOnce(() => bot.setControlState('jump', false), durMs);
  },
  lookAround: () => {
    if (!bot || !bot.entity || !withinRate()) return;
    const yawDelta = (randBetween(-1,1) * 110) * (Math.PI/180);
    const pitchDelta = (randBetween(-0.7,0.7) * 35) * (Math.PI/180);
    const targetYaw = bot.entity.yaw + yawDelta;
    const targetPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, bot.entity.pitch + pitchDelta));
    bot.look(targetYaw, targetPitch, true);
  },
  sneakToggle: (durMs=randInt(900,2400)) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('sneak', true);
    scheduleOnce(() => bot.setControlState('sneak', false), durMs);
  },
  smallNudge: (radius = 2.2, durMs = randInt(600,1700)) => {
    if (!bot || !bot.entity || !withinRate()) return;
    const dirIdx = randInt(0,3); // 0 forward,1 back,2 left,3 right
    const mapping = ['forward','back','left','right'];
    bot.setControlState(mapping[dirIdx], true);
    scheduleOnce(() => bot.setControlState(mapping[dirIdx], false), durMs);
  },
  sprintToggle: (durMs=randInt(1200,3500)) => {
    if (!bot || !bot.entity || !withinRate()) return;
    bot.setControlState('sprint', true);
    scheduleOnce(() => bot.setControlState('sprint', false), durMs);
  },
  changeHeldItem: () => {
    if (!bot || !bot.inventory || !withinRate()) return;
    const items = bot.inventory.items().filter(item => item.slot >= 36 && item.slot <= 44);
    if(items.length === 0) return;
    const slot = items[randInt(0, items.length - 1)].slot;
    bot.setQuickBarSlot(slot - 36);  // Hotbar slots are 0-8
  },
  openInventory: () => {
    if (!bot || !withinRate()) return;
    bot.openInventory(bot.inventory);
    scheduleOnce(() => { try{ bot.closeWindow(bot.currentWindow); }catch(e){} }, randInt(900,1800));
  },
  swingArm: () => {
    if (!bot || !withinRate()) return;
    bot.swingArm('right');
  },
  // --------- Entity/Player Interactions --------
  lookAtEntity: () => {
    if (!bot || !bot.player || !withinRate()) return;
    const entities = Object.values(bot.entities)
      .filter(e => (e.type === 'player' || e.type === 'mob') && e.username !== USERNAME);
    if (!entities.length) return;
    const entity = entities[randInt(0, entities.length - 1)];
    if (entity.position) bot.lookAt(entity.position, true);
  },
  approachEntity: () => {
    if (!bot || !bot.player || !withinRate()) return;
    const entities = Object.values(bot.entities)
      .filter(e => (e.type === 'player' || e.type === 'mob') && e.username !== USERNAME);
    if (!entities.length) return;
    const entity = entities[randInt(0, entities.length - 1)];
    if (!entity.position || !bot.entity) return;
    bot.setControlState('forward', true);
    scheduleOnce(() => bot.setControlState('forward', false), randInt(700,1600));
  },
  swingAtEntity: () => {
    if (!bot || !bot.player || !withinRate()) return;
    const entities = Object.values(bot.entities)
      .filter(e => (e.type === 'player' || e.type === 'mob') && e.username !== USERNAME);
    if (!entities.length) return;
    const entity = entities[randInt(0, entities.length - 1)];
    if (entity && bot.attack) bot.attack(entity);
  },
  interactWithEntity: () => {
    if (!bot || !bot.player || !withinRate()) return;
    const entities = Object.values(bot.entities)
      .filter(e => (e.type === 'player' || e.type === 'mob') && e.username !== USERNAME);
    if (!entities.length) return;
    const entity = entities[randInt(0, entities.length - 1)];
    if (entity && bot.activateEntity) bot.activateEntity(entity);
  }
};

// ------------ Human-like RANDOM sequence ------------
function performHumanSequence() {
  if (!bot || !bot.entity) return;
  if (!withinRate()) return;
  // Mix all legal actions and entity interactions
  const pool = [
    () => Actions.lookAround(),
    () => Actions.jump(randInt(320,480)),
    () => Actions.smallNudge(2.5, randInt(700,1700)),
    () => Actions.sneakToggle(randInt(900,2200)),
    () => Actions.sprintToggle(randInt(1500,2600)),
    () => Actions.changeHeldItem(),
    () => Actions.openInventory(),
    () => Actions.swingArm(),
    () => Actions.lookAtEntity(),
    () => Actions.approachEntity(),
    () => Actions.swingAtEntity(),
    () => Actions.interactWithEntity()
  ];
  let delay = 0;
  for (let i = 0; i < randInt(2,4); ++i) {
    const fn = pool[randInt(0, pool.length - 1)];
    scheduleOnce(fn, delay);
    delay += randInt(400, 1200);
  }
}

// ------------ Master Loop ------------
function startAntiAfkLoops() {
  clearTrackedTimers();
  actionCounter = 0; windowStart = Date.now();
  (function loop() {
    performHumanSequence();
    scheduleOnce(loop, randBetween(6,16) * 1000); // 6–16s per sequence
  })();
}

function stopAntiAfkLoops() { clearTrackedTimers(); }
createBot();

process.on('SIGINT', () => {
  try { if (bot && bot.quit) bot.quit('SIGINT'); } catch(e){}
  stopAntiAfkLoops();
  clearTrackedTimers();
  setTimeout(() => process.exit(0), 400);
});
