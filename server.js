import express from 'express';
import { Client } from 'discord.js';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Keep Render alive
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});

// ==================== CONFIG ====================
const discordToken = process.env.DISCORD_TOKEN;

const accounts = [
  {
    name: "Account 1",
    channelId: process.env.CHANNEL_1,
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID_1,
    clientSecret: process.env.CLIENT_SECRET_1,
    userEmail: process.env.EMAIL_1
  },
  {
    name: "Account 2",
    channelId: process.env.CHANNEL_2,
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID_2,
    clientSecret: process.env.CLIENT_SECRET_2,
    userEmail: process.env.EMAIL_2
  },
  {
    name: "Account 3",
    channelId: process.env.CHANNEL_3,
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID_3,
    clientSecret: process.env.CLIENT_SECRET_3,
    userEmail: process.env.EMAIL_3
  },
  {
    name: "Account 4",
    channelId: process.env.CHANNEL_4,
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID_4,
    clientSecret: process.env.CLIENT_SECRET_4,
    userEmail: process.env.EMAIL_4
  }
];

// ==================== DISCORD BOT ====================
const discordClient = new Client({ intents: [] });

discordClient.once('ready', () => {
  console.log(`Discord bot logged in as ${discordClient.user.tag}`);
  startAllPolling();
});

discordClient.login(discordToken);

// ==================== GRAPH HELPERS
async function getGraphClient(account) {
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${account.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: account.clientId,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: account.clientSecret,
      grant_type: 'client_credentials'
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token for ${account.name}');

  const client = GraphClient.init({
    authProvider: (done) => done(null, tokenData.access_token)
  });

  return client;
}

// Store last processed message ID per account (in memory – fine for Render since it restarts are rare)
const lastMessageIds = {};

// Poll each inbox every 60 seconds
async function pollInbox(account) {
  try {
    const client = await getGraphClient(account);

    const res = await client
      .api(`/users/${account.userEmail}/mailFolders/Inbox/messages`)
      .top(10)
      .orderby('receivedDateTime desc')
      .select('id,subject,from,receivedDateTime,bodyPreview,isRead')
      .get();

    const messages = res.value || [];

    let newestId = lastMessageIds[account.userEmail];

    for (const msg of messages.reverse()) {  // oldest first
      if (newestId && msg.id === newestId) break; // already processed

      // Skip if already read (optional – remove if you want all)
      // if (msg.isRead) continue;

      const sender = msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown';
      const subject = msg.subject || '(no subject)';
      const preview = msg.bodyPreview?.slice(0, 300) || '';
      const time = new Date(msg.receivedDateTime).toLocaleString();

      const channel = await discordClient.channels.fetch(account.channelId);
      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [{
            title: subject,
            description: preview || '_No preview_',
            color: 0x0078d7,
            author: { name: sender, icon_url: 'https://i.imgur.com/outlook-icon.png' },
            footer: { text: `${account.name} • ${time}` },
            timestamp: new Date()
          }]
        });
      }
    }

    // Update last processed
    if (messages.length > 0) {
      lastMessageIds[account.userEmail] = messages[messages.length - 1].id;
    }
  } catch (err) {
    console.error(`Error polling ${account.name}:`, err.message);
  }
}

function startAllPolling() {
  accounts.forEach(account => {
    if (!account.channelId) {
      console.warn(`No channel ID set for ${account.name}`);
      return;
    }

    // Initial poll immediately
    pollInbox(account);

    // Then every 60 seconds
    setInterval(() => pollInbox(account), 60_000);
    console.log(`Started polling ${account.name} → Discord channel ${account.channelId}`);
  });
}
