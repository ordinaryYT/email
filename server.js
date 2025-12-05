import express from "express";
import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();
const app = express();
app.use(express.json({ limit: "10mb" }));

// ---------- DISCORD BOT ----------
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

bot.once("ready", () => {
  console.log(`Bot logged in as ${bot.user.tag}`);
});

bot.login(process.env.DISCORD_TOKEN);

// Map inbox → channel
const inboxMap = {
  "inbox1": process.env.CHANNEL_1,
  "inbox2": process.env.CHANNEL_2,
  "inbox3": process.env.CHANNEL_3,
  "inbox4": process.env.CHANNEL_4,
};

// ---------- INCOMING EMAIL ENDPOINT ----------
app.post("/inbound/:box", async (req, res) => {
  const inboxName = req.params.box; // inbox1, inbox2, etc.
  const channelId = inboxMap[inboxName];

  if (!channelId) return res.status(400).send("Invalid inbox");

  try {
    const channel = await bot.channels.fetch(channelId);

    const from = req.body.from?.text || req.body.from || "Unknown sender";
    const subject = req.body.subject || "(no subject)";
    const text = req.body.text || req.body.html || "(no content)";

    await channel.send({
      embeds: [{
        title: subject,
        description: text.slice(0, 1900),
        color: 0x0078D7,
        author: { name: from },
        footer: { text: `Inbox: ${inboxName}` },
        timestamp: new Date()
      }]
    });

    console.log(`Delivered → ${inboxName}`);
    res.send("OK");

  } catch (err) {
    console.error(err);
    res.status(500).send("Discord send failed");
  }
});

// ---------- ROOT ----------
app.get("/", (req, res) => {
  res.send("Email to Discord bridge is running!");
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
