import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

// Discord Bot
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// Mapping inbox to channel
const inboxToChannel = {
  inbox1: process.env.CHANNEL_1,
  inbox2: process.env.CHANNEL_2,
  inbox3: process.env.CHANNEL_3,
  inbox4: process.env.CHANNEL_4,
};

// Deliverhook → Discord Endpoint
app.post("/inbound-email/:inbox", async (req, res) => {
  const inbox = req.params.inbox;
  const channelId = inboxToChannel[inbox];

  if (!channelId) return res.status(400).send("Unknown inbox");

  const { from, subject, text, html } = req.body;
  const content = text || html || "(no content)";

  try {
    const channel = await client.channels.fetch(channelId);

    await channel.send({
      embeds: [{
        title: subject || "(no subject)",
        description: content.slice(0, 1900),
        color: 0x0078D7,
        author: { name: from?.text || from?.address || "Unknown Sender" },
        timestamp: new Date()
      }]
    });

    console.log(`Delivered email → ${inbox}`);
    res.send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Discord error");
  }
});

// Home page
app.get("/", (req, res) => {
  res.send("Outlook → Deliverhook → Discord Bot is running!");
});

app.listen(PORT, () => console.log("Server running on port " + PORT));
