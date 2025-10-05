/*
  Mineflayer — SMGSecurity Enhanced Anti-AFK Bot

  Features:
  - Anti-AFK: human-like random actions (move, jump, look, sneak, swing)
  - Reconnect system with exponential backoff
  - Auto-login/register using PASSWORD
  - Optional spectator mode (if AUTHORIZED = true)
  - Handles ban kicks by cycling usernames
  - Safe: uses only visible, allowed Mineflayer actions

  Node 20+ Compatible
*/

const mineflayer = require("mineflayer");
const Vec3 = require("vec3");

// Pathfinder (optional)
let pathfinderAvailable = false;
let pathfinder, Movements, goals;
try {
  pathfinder = require("mineflayer-pathfinder");
  Movements = pathfinder.Movements;
  goals = pathfinder.goals;
  pathfinderAvailable = true;
  console.log("ℹ️ Pathfinder loaded — patrols enabled");
} catch {
  console.log("⚠️ Pathfinder not available — patrols disabled");
}

// ===== Server Configuration =====
const HOST = "play.smgin.me";
const PORT = 11289;
const BASE_USERNAME = "SMGSecurity";
const VERSION = "1.21.8";
const PASSWORD = "Securitybysmg007";

// ===== Behavior Config =====
const AUTHORIZED = false; // if true, /gamemode spectator after login
const MAX_SUFFIX = 1000;
let suffix = 0;

const AGG_SCALE = {
  jump: [20, 40],
  look: [8, 20],
  walk: [25, 50],
  sneak: [40, 80],
  sprint: [50, 100],
  swing: [30, 60],
};

// ===== State =====
let bot = null;
let timers = new Set();
let reconnectDelay = 2000;

// ===== Helper Functions =====
function track(t) { timers.add(t); return t; }
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randBetween(min, max) { return Math.random() * (max - min) + min; }
function nextUsername() { return suffix === 0 ? BASE_USERNAME : `${BASE_USERNAME}${suffix}`; }

// ===== Bot Creation =====
function createBot() {
  const username = nextUsername();
  console.log(`🚀 Launching bot as ${username}`);

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username,
    version: VERSION,
  });

  if (pathfinderAvailable) pathfinder(bot);

  bot.once("login", () => {
    console.log(`✅ Logged in as ${username}`);
    reconnectDelay = 2000;
    handleChatAuth();
    if (AUTHORIZED) setTimeout(() => bot.chat("/gamemode spectator"), 5000);
    setTimeout(startAntiAfk, 7000);
  });

  bot.on("spawn", () => console.log("🌍 Spawned into the world"));

  bot.on("kicked", (reason) => {
    console.log(`⚠️ Kicked: ${reason}`);
    if (reason.toString().toLowerCase().includes("ban")) {
      suffix++;
      if (suffix > MAX_SUFFIX) process.exit(1);
      console.log(`🔁 Banned — next username: ${nextUsername()}`);
    }
  });

  bot.on("end", () => {
    console.log(`🔄 Disconnected — reconnecting in ${reconnectDelay / 1000}s`);
    clearTimers();
    setTimeout(createBot, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.8, 60000);
  });

  bot.on("error", (err) => console.error("❌ Bot error:", err));
}

// ===== Auth Handling =====
function handleChatAuth() {
  let registered = false;
  let loggedIn = false;

  const listener = (msg) => {
    const text = msg.toString().toLowerCase();
    if (!registered && text.includes("register")) {
      bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
      registered = true;
      console.log("🪪 Sent /register");
    }
    if (!loggedIn && text.includes("login")) {
      bot.chat(`/login ${PASSWORD}`);
      loggedIn = true;
      console.log("🔐 Sent /login");
    }
    if (registered || loggedIn) setTimeout(() => bot.removeListener("message", listener), 5000);
  };

  bot.on("message", listener);
}

// ===== Anti-AFK =====
function startAntiAfk() {
  console.log("🌀 Anti-AFK started");

  function loop(fn, [min, max]) {
    const next = randBetween(min, max) * 1000;
    track(setTimeout(() => { fn(); loop(fn, [min, max]); }, next));
  }

  const actions = {
    jump() {
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), randInt(200, 400));
      console.log("🦘 Jump");
    },
    look() {
      const yaw = bot.entity.yaw + randBetween(-Math.PI, Math.PI);
      const pitch = bot.entity.pitch + randBetween(-0.5, 0.5);
      bot.look(yaw, pitch, true);
      console.log("👀 Look");
    },
    move() {
      const dirs = ["forward", "back", "left", "right"];
      const d = dirs[randInt(0, 3)];
      bot.setControlState(d, true);
      setTimeout(() => bot.setControlState(d, false), randInt(800, 1500));
      console.log(`🚶 Move ${d}`);
    },
    sneak() {
      bot.setControlState("sneak", true);
      setTimeout(() => bot.setControlState("sneak", false), randInt(2000, 4000));
      console.log("🕵️ Sneak");
    },
    sprint() {
      bot.setControlState("sprint", true);
      setTimeout(() => bot.setControlState("sprint", false), randInt(2000, 4000));
      console.log("🏃 Sprint");
    },
    swing() {
      bot.activateItem();
      console.log("✋ Swing");
    },
  };

  loop(actions.jump, AGG_SCALE.jump);
  loop(actions.look, AGG_SCALE.look);
  loop(actions.move, AGG_SCALE.walk);
  loop(actions.sneak, AGG_SCALE.sneak);
  loop(actions.sprint, AGG_SCALE.sprint);
  loop(actions.swing, AGG_SCALE.swing);
}

// ===== Start Bot =====
createBot();
