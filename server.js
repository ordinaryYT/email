import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));

// ------------------ DISCORD BOT ------------------

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

bot.once("ready", () => {
  console.log(`Discord bot logged in as ${bot.user.tag}`);
});

bot.login(process.env.DISCORD_TOKEN);

// Map inbox numbers → Discord channel IDs
const channelMap = {
  "1": process.env.CHANNEL_1,
  "2": process.env.CHANNEL_2,
  "3": process.env.CHANNEL_3,
  "4": process.env.CHANNEL_4
};

// ------------------ DELIVERHOOK ENDPOINT ------------------

// Example: POST /inbound-email/1
app.post("/inbound-email/:id", async (req, res) => {
  const inboxID = req.params.id;
  const channelID = channelMap[inboxID];

  if (!channelID) {
    return res.status(400).send("Invalid inbox ID");
  }

  const email = req.body;

  // Extract fields safely
  const from = email.from?.text || email.from || "Unknown Sender";
  const subject = email.subject || "(no subject)";
  const body =
    email.text ||
    email.html ||
    email.body ||
    "(no content)";

  try {
    const channel = await bot.channels.fetch(channelID);

    if (!channel || !channel.isTextBased()) {
      return res.status(500).send("Invalid Discord channel");
    }

    // Send embed to Discord
    await channel.send({
      embeds: [
        {
          title: subject,
          description: body.slice(0, 1900),
          color: 0x0078d7,
          author: { name: from },
          footer: { text: `Inbox ${inboxID} • Delivered by Deliverhook` },
          timestamp: new Date()
        }
      ]
    });

    console.log(`Delivered email → Inbox ${inboxID} → Discord channel ${channelID}`);

    return res.send("OK");
  } catch (err) {
    console.error("Discord send error:", err);
    return res.status(500).send("Discord error");
  }
});

// ------------------ ROOT PAGE ------------------

app.get("/", (req, res) => {
  res.send("Outlook → Deliverhook → Discord bot is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
