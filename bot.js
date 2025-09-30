
const mineflayer = require("mineflayer");

const HOST = "play.smgin.me";
const PORT = 11289;
const USERNAME = "SMGSecurity";
const VERSION = "1.21.8"; // or "auto"
const PASSWORD = "Securitybysmg007";

function createBot() {
  console.log("⏳ Creating bot…");

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
  });

  bot.on("error", (err) => {
    console.error("❌ [error]", err);
  });

  bot.on("kicked", (reason) => {
    console.warn("⚠️ [kicked]", reason.toString());
  });

  bot.on("end", () => {
    console.log("🔁 [end] disconnected — retrying in 5s");
    setTimeout(createBot, 5000);
  });

  bot.once("login", () => {
    console.log("✅ [login] successful — in game world.");

    setTimeout(() => {
      console.log("🫥 Sending /login command");
      bot.chat(`/login ${PASSWORD}`);
    }, 3000);

    setTimeout(() => {
      console.log("🫥 Sending /vanish command");
      bot.chat("/vanish");
    }, 6000);
  });

  bot.on("spawn", () => {
    console.log("✅ [spawn] bot is alive in the world");

    // Anti-AFK: jump every 30 seconds
    setInterval(() => {
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), 500);
    }, 30000);
  });
}

createBot();

