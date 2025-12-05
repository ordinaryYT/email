import express from 'express';
import { Client } from 'discord.js';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve index.html for Render
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ==================== DISCORD ====================
const discordClient = new Client({ intents: [] });

discordClient.once('ready', () => {
  console.log(`Discord bot ready as ${discordClient.user.tag}`);
  startPolling();
});

discordClient.login(process.env.DISCORD_TOKEN);

// ==================== ACCOUNTS ====================
const accounts = [
  { name: "Inbox 1", email: process.env.EMAIL_1, password: process.env.PASSWORD_1, channel: process.env.CHANNEL_1 },
  { name: "Inbox 2", email: process.env.EMAIL_2, password: process.env.PASSWORD_2, channel: process.env.CHANNEL_2 },
  { name: "Inbox 3", email: process.env.EMAIL_3, password: process.env.PASSWORD_3, channel: process.env.CHANNEL_3 },
  { name: "Inbox 4", email: process.env.EMAIL_4, password: process.env.PASSWORD_4, channel: process.env.CHANNEL_4 },
].filter(acc => acc.email && acc.password && acc.channel);

// Store last seen UID per email
const lastUid = {};

// ==================== POLLING ====================
async function checkMail(account) {
  const imapConfig = {
    imap: {
      user: account.email,
      password: account.password,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false, servername: 'outlook.office365.com' },
      authTimeout: 30000,
    }
  };

  let connection;
  try {
    connection = await imaps.connect({ imap: imapConfig.imap });
    const box = await connection.openBox('INBOX', true); // readonly = false

    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: [''], struct: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      connection.end();
      return;
    }

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      if (lastUid[account.email] && uid <= lastUid[account.email]) continue;

      const part = msg.parts.find(p => p.which === '');
      const parsed = await simpleParser(part.body);

      const from = parsed.from?.text || 'Unknown';
      subject = parsed.subject || '(no subject)';
      preview = (parsed.text || parsed.html || '').replace(/\s+/g, ' ').trim().slice(0, 800);

      try {
        const channel = await discordClient.channels.fetch(account.channel);
        if (channel?.isTextBased()) {
          await channel.send({
            embeds: [{
              title: subject.length > 250 ? subject.slice(0, 247) + '...' : subject,
              description: preview || '_No content_',
              color: 0x0078D7,
              author: { name: from },
              footer: { text: `${account.name} • ${new Date().toLocaleString()}` },
              timestamp: new Date(),
            }]
          });
          console.log(`Sent: "${subject}" → ${account.name}`);
        }
      } catch (e) {
        console.error(`Discord error (${account.name}):`, e.message);
      }

      lastUid[account.email] = Math.max(lastUid[account.email] || 0, uid);
    }

  } catch (err) {
    console.error(`IMAP FAILED – ${account.name} (${account.email}):`, err.message);
  } finally {
    if (connection) connection.end();
  }
}

// ==================== START ====================
function startPolling() {
  if (accounts.length === 0) {
    console.error("No accounts configured! Check your .env");
    return;
  }

  accounts.forEach(acc => {
    console.log(`Started polling ${acc.email} → channel ${acc.channel}`);

    // First run immediately
    checkMail(acc);

    // Then every 60 seconds
    setInterval(() => checkMail(acc), 60_000);
  });
}
