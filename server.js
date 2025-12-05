import express from "express";
import { Client } from "discord.js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// --- DISCORD BOT ---
const bot = new Client({ intents: [] });

const CHANNEL_MAP = {
  1: process.env.CHANNEL_1,
  2: process.env.CHANNEL_2,
  3: process.env.CHANNEL_3,
  4: process.env.CHANNEL_4
};

bot.once("ready", () => {
  console.log("Discord bot online:", bot.user.tag);
});

bot.login(process.env.DISCORD_TOKEN);

// --- MAIN INBOUND EMAIL ENDPOINT ---
app.post("/inbound-email", async (req, res) => {
  try {
    const inbox = req.query.inbox;
    const channelId = CHANNEL_MAP[inbox];

    if (!channelId) {
      return res.status(400).send("Invalid inbox number");
    }

    const channel = await bot.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      return res.status(400).send("Invalid channel");
    }

    const { from, subject, text, html } = req.body;
    const content = text || html || "(no content)";

    await channel.send({
      embeds: [
        {
          title: subject || "(no subject)",
          description: content.slice(0, 1800),
          color: 0x0078d7,
          author: {
            name: from?.address || from?.name || "Unknown"
          },
          footer: {
            text: `Inbox ${inbox}`
          },
          timestamp: new Date()
        }
      ]
    });

    res.send("OK");
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Failed");
  }
});

app.listen(PORT, () => console.log("Server running on port", PORT));
