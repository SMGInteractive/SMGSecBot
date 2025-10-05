/*
  Mineflayer — Strict Anti-AFK (Enhanced) with Ban Evasion Username Cycling

  Goals:
  - Provide a STRICTER, more varied anti-AFK routine that mimics human behavior with constant activity.
  - Includes frequent moving, looking, jumping, interacting (arm swings), and block breaking to ensure high activity levels.
  - Keep actions configurable and rate-limited to reduce suspicious bursts.
  - Do NOT include any evasive or "undetectable" techniques. Use only visible, allowed actions.
  - Optionally request spectator mode on login — only if AUTHORIZED is true.
  - On ban detection (via kick reason), automatically increment username suffix (e.g., SMGSecurity1, SMGSecurity2) and reconnect.
  - Automatically detect registration/login prompts in chat and respond with /register or /login using the provided PASSWORD.

  ⚠️ WARNING: Ban evasion may violate server rules or terms of service. Use responsibly and only on servers where you have permission.
  This modification is for educational purposes; ensure compliance with the server's policies.
  Block breaking is now included for stricter anti-AFK—ensure the server allows it and monitor to avoid griefing.

  Usage:
  - Install: npm i mineflayer vec3
  - Optional (recommended for tiny patrols): npm i mineflayer-pathfinder minecraft-data

  CONFIGURATION
  - AGGRESSIVENESS: 1 (low) — conservative, 2 (medium) — more activity, 3 (high) — frequent nudges and breaks
  - AUTHORIZED: set to true only if you have explicit server permission to request gamemode changes.
  - MAX_USERNAME_SUFFIX: Limit how many username variants to try before stopping (prevents infinite loops).
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
const BASE_USERNAME = 'SMGSecurity';
const VERSION = '1.21.8';
const PASSWORD = 'Securitybysmg007';
let currentSuffix = 0; // Starts at 0 (original username), increments on ban
const MAX_USERNAME_SUFFIX = 1000; // Safety limit: stop after 1000 attempts to avoid infinite cycling

// Safety flags
const AUTHORIZED = false; // set true ONLY if you are op/owner and have permission
const AGGRESSIVENESS = 2; // 1 = low, 2 = medium, 3 = high

// Function to get current username
function getCurrentUsername() {
  return currentSuffix === 0 ? BASE_USERNAME : `${BASE_USERNAME}${currentSuffix}`;
}

// Aggressiveness scaling helper (enhanced with breakInt for stricter anti-AFK)
const AGG_SCALE = {
  1: { 
    jumpInt: [20,40], lookInt:[8,20], walkInt:[25,50], sneakInt:[40,80], sprintInt:[50,100], 
    breakInt: [60,120], walkRadius:1.2 
  },
  2: { 
    jumpInt: [15,30], lookInt:[5,15], walkInt:[20,40], sneakInt:[30,60], sprintInt:[40,80], 
    breakInt: [30,60], walkRadius:2.5 
  },
  3: { 
    jumpInt: [10,25], lookInt:[3,12], walkInt:[15,30], sneakInt:[20,50], sprintInt:[25,60], 
    breakInt: [15,40], walkRadius:3.5 
  }
}[AGGRESSIVENESS || 2];

// Global rate limits and safeties (increased cap for stricter activity)
const MAX_ACTIONS_PER_MIN = 50; // Increased safety cap per minute for more frequent actions
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
  const username = getCurrentUsername();
  console.log(`⏳ Creating bot with username: ${username}…`);
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: username, version: VERSION });

  if (pathfinderAvailable) pathfinder(bot);

  bot.once('login', () => {
    console.log(`✅ [login] — connected as ${username}`);
    reconnectBackoff = 1000; // reset

    // Set up authentication listener for this connection
    let hasRegistered = false;
    let hasLoggedIn = false;
    const messageListener = (jsonMsg) => {
      const message = jsonMsg.toString().toLowerCase();
      console.log(`📨 Received chat: ${jsonMsg.toString()}`);

      // Check for registration prompt
      if (!hasRegistered && message.includes('register')) {
        try {
          bot.chat(`/register ${PASSWORD} ${PASSWORD}`); // Typically requires password twice for registration
          hasRegistered = true;
          console.log('ℹ️ [auth] Sent /register command.');
        } catch (e) {
          console.warn('⚠️ [auth] Failed to send /register:', e.message || e);
        }
      }

      // Check for login prompt (even if registered, in case server requires login after)
      if (!hasLoggedIn && message.includes('login')) {
        try {
          bot.chat(`/login ${PASSWORD}`);
          hasLoggedIn = true;
          console.log('ℹ️ [auth] Sent /login command.');
        } catch (e) {
          console.warn('⚠️ [auth] Failed to send /login:', e.message || e);
        }
      }

      // If both are done, remove listener after a short delay to avoid further checks
      if (hasRegistered || hasLoggedIn) {
        scheduleOnce(() => {
          bot.removeListener('message', messageListener);
          console.log('ℹ️ [auth] Authentication listener removed.');
        }, 5000); // Give time for any follow-up messages
      }
    };

    // Start listening for messages immediately after login
    bot.on('message', messageListener);

    // Optional: request spectator mode, but only when AUTHORIZED === true
    if (AUTHORIZED) {
      scheduleOnce(() => {
        try {
          bot.chat('/gamemode spectator');
          console.log('ℹ️ [gamemode] requested spectator mode (AUTHORIZED).');
        } catch (e) {
          console.warn('⚠️ [gamemode] failed to request spectator:', e.message || e);
        }
      }, 5000); // Delay slightly longer to allow auth to complete
    }

    // Delay starting loops slightly until world fully loads and auth is likely done
    scheduleOnce(() => startAntiAfkLoops(), 8000);
  });

  bot.on('spawn', () => console.log('✅ [spawn] in world'));
  
  bot.on('kicked', (reason) => {
    const reasonStr = reason.toString().toLowerCase();
    console.warn('⚠️ [kicked]', reason.toString());
    if (reasonStr.includes('ban') || reasonStr.includes('banned')) {
      currentSuffix++;
      if (currentSuffix > MAX_USERNAME_SUFFIX) {
        console.error(`❌ Max username attempts (${MAX_USERNAME_SUFFIX}) reached. Stopping bot.`);
        process.exit(1); // Exit to prevent infinite attempts
      }
      console.log(`🔄 Detected ban. Incrementing suffix to ${currentSuffix}. Next username: ${getCurrentUsername()}`);
    }
  });
  
  bot.on('error', (err) => console.error('❌ [error]', err));

  bot.on('end', () => {
    console.log(`🔁 [end] disconnected — reconnecting in ${Math.round(reconnectBackoff/1000)}s`);
    stopAntiAfkLoops();
    clearTrackedTimers();
    setTimeout(createBot, reconnectBackoff);
    reconnectBackoff = Math.min(reconnectBackoff * 1.9, 60000);
  });
}

// Action pool — composable behaviors that mimic a person (enhanced with block breaking for strict anti-AFK)
const Actions = {
  jump: (durMs = 480) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('jump', true);
      scheduleOnce(() => bot.setControlState('jump', false), durMs);
      console.log('🦘 [action] Jumped');
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
      console.log('👀 [action] Looked around');
    } catch(e){}
  },

  sneakToggle: (durMs=4200) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('sneak', true);
      scheduleOnce(() => bot.setControlState('sneak', false), durMs);
      console.log('🕵️ [action] Sneaking');
    } catch(e){}
  },

  sprintToggle: (durMs=6000) => {
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try {
      bot.setControlState('sprint', true);
      scheduleOnce(() => bot.setControlState('sprint', false), durMs);
      console.log('🏃 [action] Sprinting');
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
        console.log('🚶 [action] Nudged (pathfinder)');
        return;
      } catch(e){}
    }
    // fallback: quick directional press
    const dirIdx = randInt(0,3); // 0 forward,1 back,2 left,3 right
    const mapping = ['forward','back','left','right'];
    bot.setControlState(mapping[dirIdx], true);
    scheduleOnce(() => bot.setControlState(mapping[dirIdx], false), durMs);
    console.log('🚶 [action] Nudged (controls)');
  },

  subtleSwing: () => {
    // very low-impact: swing arm once (visual/interact). Do not place/break here.
    if (!bot || !bot.entity) return;
    if (!withinRate()) return;
    try { 
      bot.activateItem(false); 
      console.log('✋ [action] Swung arm (interact)');
    } catch(e){}
  },

  // New: Break a nearby block for strict anti-AFK (visible activity)
  breakBlock: () => {
    if (!bot || !bot.entity || !bot.blockAt) return;
    if (!withinRate()) return;
    try {
      // Look for a nearby breakable block (e.g., within 4 blocks, prefer common ones like dirt, stone)
      const mcData = require('minecraft-data')(bot.version);
      const blockTypes = ['dirt', 'stone', 'grass', 'sand', 'gravel']; // Safe, common blocks to break
      let targetBlock = null;
      for (let dist = 1; dist <= 4; dist++) {
        for (let dx = -dist; dx <= dist; dx++) {
          for (let dy = -dist; dy <= dist; dy++) {
            for (let dz = -dist; dz <= dist; dz++) {
              if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > dist) continue;
              const pos = bot.entity.position.offset(dx, dy, dz);
              const block = bot.blockAt(pos);
              if (block && block.name && blockTypes.includes(block.name) && block.position.distanceTo(bot.entity.position) <= 4) {
                targetBlock = block;
                break;
              }
            }
            if (targetBlock) break;
          }
          if (targetBlock) break;
        }
        if (targetBlock) break;
      }

      if (targetBlock) {
        // Look at the block
        const diff = targetBlock.position.minus(bot.entity.position);
        const yaw = Math.atan2(-diff.x, diff.z);
        const pitch = Math.atan2(diff.y, Math.sqrt(diff.x ** 2 + diff.z ** 2));
        bot.look(yaw, pitch, true);

        // Start digging (break) the block
        bot.dig(targetBlock, (err) => {
          if (err) {
            console.warn('⚠️ [action] Failed to break block:', err.message || err);
          } else {
            console.log(`⛏️ [action] Broke block: ${targetBlock.name} at ${targetBlock.position}`);
          }
        });
      } else {
        console.log('⚠️ [action] No suitable block found to break');
      }
    } catch(e) {
      console.warn('⚠️ [action] Error in breakBlock:', e.message || e);
    }
  }
};

// Build a sequence that looks human: look -> (jump?) -> smallNudge -> sneak -> look + occasional break/interact
function performHumanSequence() {
  if (!bot || !bot.entity) return;
  if (!withinRate()) return;
  // randomized sequence length (more frequent for strict anti-AFK)
  const seq = [];
  // always look
  seq.push(() => Actions.lookAround(40,10,800));
  // higher chance to jump
  if (Math.random() < 0.7) seq.push(() => Actions.jump(randInt(380,650)));
  // always nudge/move
  seq.push(() => Actions.smallNudge(undefined, randInt(800,1600)));
  // higher chance to sprint
  if (Math.random() < 0.5) seq.push(() => Actions.sprintToggle(randInt(1200,4200)));
  // frequent arm swing
  if (Math.random() < 0.6) seq.push(() => Actions.subtleSwing());
  // occasional block break (strict anti-AFK)
  if (Math.random() < 0.4) seq.push(() => Actions.breakBlock());

  // run sequence with small stagger
  let delay = 0;
  for (const fn of seq) {
    scheduleOnce(fn, delay);
    delay += randInt(150, 600); // Shorter stagger for more activity
  }
}

let activeLoops = [];
function startAntiAfkLoops() {
  clearTrackedTimers();
  activeLoops.forEach(clearInterval);
  activeLoops = [];
  actionCounter = 0; windowStart = Date.now();

  // Schedule periodic randomized events using AGG_SCALE (shorter intervals for strict anti-AFK)
  // Jump loop (more frequent)
  (function loopJump() {
    const next = randBetween(...AGG_SCALE.jumpInt) * 1000;
    scheduleOnce(() => { Actions.jump(randInt(420,700)); loopJump(); }, next);
  })();

  // Look loop (more frequent)
  (function loopLook() {
    const next = randBetween(...AGG_SCALE.lookInt) * 1000;
    scheduleOnce(() => { Actions.lookAround(45,12); loopLook(); }, next);
  })();

  // Walk nudge loop (more frequent)
  (function loopNudge() {
    const next = randBetween(...AGG_SCALE.walkInt) * 1000;
    scheduleOnce(() => { Actions.smallNudge(undefined, randInt(900,2200)); loopNudge(); }, next);
  })();

  // Sneak toggles (more frequent)
  (function loopSneak() {
    const next = randBetween(...AGG_SCALE.sneakInt) * 1000;
    scheduleOnce(() => { Actions.sneakToggle(randInt(2500,5200)); loopSneak(); }, next);
  })();

  // Sprint toggles (more frequent)
  (function loopSprint() {
    const next = randBetween(...AGG_SCALE.sprintInt) * 1000;
    scheduleOnce(() => { if (Math.random() < 0.7) Actions.sprintToggle(randInt(2000,5200)); loopSprint(); }, next);
  })();
