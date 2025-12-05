import express from 'express';
import { Client } from 'discord.js';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// ====================== CONFIG ======================
const discordClient = new Client({ intents: [] });

const accounts = [
  {
    name: "Inbox 1",
    channelId: process.env.CHANNEL_1,
    email: process.env.EMAIL_1,
    password: process.env.PASSWORD_1,
  },
  {
    name: "Inbox 2",
    channelId: process.env.CHANNEL_2,
    email: process.env.EMAIL_2,
    password: process.env.PASSWORD_2,
  },
  {
    name: "Inbox 3",
    channelId: process.env.CHANNEL_3,
    email: process.env.EMAIL_3,
    password: process.env.PASSWORD_3,
  },
  {
    name: "Inbox 4",
    channelId: process.env.CHANNEL_4,
    email: process.env.EMAIL_4,
    password: process.env.PASSWORD_4,
  },
];

// Store the last seen UID for each account (prevents duplicates)
const lastSeenUid = {};

// ====================== DISCORD READY ======================
discordClient.once('ready', () => {
  console.log(`Discord bot online as ${discordClient.user.tag}`);
  startPollingAllAccounts();
});

discordClient.login(process.env.DISCORD_TOKEN);

// ====================== POLLING FUNCTION ======================
async function checkMailbox(account) {
  const config = {
    imap: {
      user: account.email,
      password: account.password,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { servername: 'outlook.office365.com' }
    }
  };

  let connection;
  try {
    connection = await imaps.connect({ imap: config.imap });
    await connection.openBox('INBOX');

    // Search for unseen messages OR all messages newer than last seen UID
    const since = lastSeenUid[account.email] || '1';
    const searchCriteria = ['UNSEEN', ['UID', `${since}:*`]];
    const fetchOptions = { bodies: [''], struct: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      connection.end();
      return;
    }

    // Process messages from oldest to newest
    for (const message of messages) {
      const uid = message.attributes.uid;
      const part = message.parts.find(p => p.which === '');
      const rawEmail = part.body;

      const parsed = await simpleParser(rawEmail);

      const sender = parsed.from?.text || 'Unknown Sender';
      const subject = parsed.subject || '(no subject)';
      const body = parsed.text || parsed.html || '(no body)';
      const preview = body.replace(/\s+/g, ' ').trim().slice(0, 500);
      const time = parsed.date ? parsed.date.toLocaleString() : new Date().toLocaleString();

      // Send to Discord
      try {
        const channel = await discordClient.channels.fetch(account.channelId);
        if (channel?.isTextBased()) {
          await channel.send({
            embeds: [{
              title: subject.length > 250 ? subject.slice(0, 247) + '...' : subject,
              description: preview || '_Empty email_',
              color: 0x0078D7,
              author: { name: sender },
              footer: { text: `${account.name} • ${time}` },
              timestamp: new Date(),
            }]
          });
          console.log(`Sent email from ${sender} to ${account.name}`);
        }
      } catch (err) {
        console.error(`Failed to send to Discord (${account.name}):`, err.message);
      }

      // Update last seen UID
      if (uid > (lastSeenUid[account.email] || 0)) {
        lastSeenUid[account.email] = uid;
      }
    }

  } catch (err) {
    console.error(`IMAP Error – ${account.name} (${account.email}):`, err.message);
  } finally {
    if (connection) connection.end();
  }
}

// ====================== START POLLING ======================
function startPollingAllAccounts() {
  accounts.forEach(account => {
    if (!account.channelId || !account.email || !account.password) {
      console.warn(`Skipping ${account.name} – missing config`);
      return;
    }

    // First check immediately
    checkMailbox(account);

    // Then every 60 seconds
    setInterval(() => checkMailbox(account), 60_000);

    console.log(`Polling started → ${account.email} → Discord #${account.channelId}`);
  });
}
