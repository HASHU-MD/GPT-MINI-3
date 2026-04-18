const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------
const BOT_NAME_FANCY = 'HASHU-MD'; 

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🤍','💗','🪼','🙈','🎀','🔥','🧸','🫧','🌟','🔮','👀','✨'],
  PREFIX: '.',
  MAX_RETRIES: 2, 
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/JVWi4igUydXIOpOznNekSw',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/qg5i86.jpeg',
  NEWSLETTER_JID: '120363424614849000@g.us',
  WORK_TYPE: 'public',
  OWNER_NUMBER: '94741336839',
  BOT_NAME: 'HASHU-MD',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: 'Hashu',
  BOT_FOOTER: 'POWERED BY HASHU-MD',
  IMAGE_PATH: 'https://files.catbox.moe/qg5i86.jpeg'
};

// ---------------- MONGO SETUP ----------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://podi_zoro:king@cluster0.nig7k0u.mongodb.net/';
const MONGO_DB = 'podi_zoro';
let sessionsCol, configsCol, adminsCol;

async function initMongo() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB);
  sessionsCol = db.collection('sessions');
  configsCol = db.collection('configs');
  adminsCol = db.collection('admins');
}

// ---------------- HELPERS ----------------
const activeSockets = new Map();

async function loadUserConfig(number) {
    const doc = await configsCol.findOne({ number: number.replace(/[^0-9]/g, '') });
    return doc ? doc.config : {};
}

// ---------------- MAIN HANDLER ----------------
async function setupCommandHandlers(socket, botNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const type = getContentType(msg.message);
    const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : '';
    
    if (!body.startsWith(config.PREFIX)) return;

    const args = body.trim().split(/ +/).slice(1);
    const command = body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase();
    const userCfg = await loadUserConfig(botNumber);
    const bName = userCfg.botName || config.BOT_NAME;

    // --- Commands Start ---
    switch (command) {
      case 'ping':
        const start = Date.now();
        await socket.sendMessage(from, { text: '🚀 Processing...' });
        await socket.sendMessage(from, { text: `✅ *Pong!* Speed: ${Date.now() - start}ms` });
        break;

      case 'ts': // TikTok fix
      case 'tiktok':
        if (!args[0]) return socket.sendMessage(from, { text: 'Link එකක් හෝ නමක් දෙන්න.' });
        try {
          const res = await axios.post("https://tikwm.com/api/feed/search", new URLSearchParams({ keywords: args.join(' '), count: '1' }));
          const video = res.data.data.videos[0];
          await socket.sendMessage(from, { video: { url: video.play }, caption: `🎬 ${video.title}\n\n${config.BOT_FOOTER}` });
        } catch (e) { socket.sendMessage(from, { text: 'Error fetching TikTok.' }); }
        break;

      case 'google':
        if (!args[0]) return socket.sendMessage(from, { text: 'සෙවිය යුතු දේ ඇතුළත් කරන්න.' });
        const gSearch = args.join(' ');
        await socket.sendMessage(from, { text: `🔍 Google Searching: ${gSearch}...` });
        const gUrl = `https://www.google.com/search?q=${encodeURIComponent(gSearch)}`;
        await socket.sendMessage(from, { text: `🔗 මෙන්න ප්‍රතිඵල: ${gUrl}` });
        break;

      case 'news':
        try {
          const newsRes = await axios.get('https://api-site-gamma.vercel.app/news/hiru'); // Example API
          const latest = newsRes.data.result;
          await socket.sendMessage(from, { image: { url: latest.image }, caption: `📰 *${latest.title}*\n\n${latest.description}\n\n${config.BOT_FOOTER}` });
        } catch (e) { socket.sendMessage(from, { text: 'පුවත් ලබාගැනීමේ දෝෂයකි.' }); }
        break;

      case 'tagall':
        if (!isGroup) return;
        const meta = await socket.groupMetadata(from);
        let txt = `📢 *Attention Everyone*\n\n`;
        const mems = meta.participants.map(v => v.id);
        mems.forEach(m => txt += `@${m.split('@')[0]} `);
        await socket.sendMessage(from, { text: txt, mentions: mems });
        break;

      case 'alive':
        await socket.sendMessage(from, { 
          image: { url: config.IMAGE_PATH }, 
          caption: `👋 Hello! I am ${bName}\n\nStatus: Online 🟢\nVersion: ${config.BOT_VERSION}` 
        });
        break;

      case 'setting':
      case 'settings':
        let setMsg = `⚙️ *${bName} Settings*\n\n`;
        setMsg += `Prefix: ${config.PREFIX}\n`;
        setMsg += `Work Type: ${config.WORK_TYPE}\n`;
        setMsg += `Auto Status: ${config.AUTO_VIEW_STATUS}`;
        await socket.sendMessage(from, { text: setMsg });
        break;
        
      case 'restart':
        await socket.sendMessage(from, { text: '🔄 Restarting bot...' });
        process.exit();
        break;
    }
  });
}

// ---------------- STARTUP ----------------
async function start() {
  await initMongo();
  // මෙහිදී ඔබගේ session loading logic එක ඇතුළත් කරන්න (original file එකේ පරිදි)
}

start();

module.exports = router;
