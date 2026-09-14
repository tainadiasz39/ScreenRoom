const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

app.post('/api/create-room', (req, res) => {
  const roomId = crypto.randomBytes(4).toString('hex').toUpperCase();
  rooms.set(roomId, {
    id: roomId,
    hostId: null,
    hostName: 'Streamer',
    viewers: new Map(),
    voiceUsers: new Map(),
    isStreaming: false,
    hasAudio: false,
    chatHistory: []
  });
  res.json({ roomId });
});

io.on('connection', (socket) => {
  socket.on('join-discord-room', ({ roomId, isHost, userName }) => {
    let room = rooms.get(roomId);
    if (!room) {
      room = { id: roomId, hostId: null, hostName: 'Streamer', viewers: new Map(), voiceUsers: new Map(), isStreaming: false, hasAudio: false, chatHistory: [] };
      rooms.set(roomId, room);
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = isHost;
    socket.userName = userName || (isHost ? 'Streamer' : 'Amigo_' + Math.floor(Math.random() * 900 + 100));

    if (isHost) {
      room.hostId = socket.id;
      room.hostName = socket.userName;
    } else {
      room.viewers.set(socket.id, { name: socket.userName, inVoice: false });
    }

    io.to(roomId).emit('discord-state', getRoomState(room));
    socket.emit('chat-history', room.chatHistory.slice(-50));
  });

  // Entrada e Saída do Canal de Voz
  socket.on('voice-join', ({ roomId, muted, deafened }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const existing = Array.from(room.voiceUsers.keys());
    room.voiceUsers.set(socket.id, {
      name: socket.userName,
      muted: muted || false,
      deafened: deafened || false,
      isSpeaking: false
    });

    socket.emit('voice-peers-list', { existingPeers: existing });
    socket.to(roomId).emit('user-entered-voice', { userId: socket.id, name: socket.userName });
    io.to(roomId).emit('discord-state', getRoomState(room));
  });

  socket.on('voice-leave', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.voiceUsers.delete(socket.id);
    socket.to(roomId).emit('user-left-voice', { userId: socket.id });
    io.to(roomId).emit('discord-state', getRoomState(room));
  });

  socket.on('voice-toggle-state', ({ roomId, muted, deafened }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const u = room.voiceUsers.get(socket.id);
    if (u) {
      u.muted = muted;
      u.deafened = deafened;
      io.to(roomId).emit('discord-state', getRoomState(room));
    }
  });

  socket.on('voice-speaking', ({ roomId, isSpeaking }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const u = room.voiceUsers.get(socket.id);
    if (u) {
      u.isSpeaking = isSpeaking;
      io.to(roomId).emit('user-speaking-change', { userId: socket.id, isSpeaking });
    }
  });

  // WebRTC da Call de Voz
  socket.on('v-offer', ({ to, offer }) => io.to(to).emit('v-offer', { from: socket.id, offer }));
  socket.on('v-answer', ({ to, answer }) => io.to(to).emit('v-answer', { from: socket.id, answer }));
  socket.on('v-ice', ({ to, candidate }) => io.to(to).emit('v-ice', { from: socket.id, candidate }));

  // ================= TRANSMISSÃO DE TELA (GO LIVE) =================
  socket.on('host-go-live', ({ roomId, hasAudio }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = true;
      room.hasAudio = hasAudio || false;
      io.to(roomId).emit('stream-started', { hasAudio: room.hasAudio });
      io.to(roomId).emit('discord-state', getRoomState(room));
    }
  });

  socket.on('host-end-live', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = false;
      room.hasAudio = false;
      io.to(roomId).emit('stream-ended');
      io.to(roomId).emit('discord-state', getRoomState(room));
    }
  });

  socket.on('request-stream', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.hostId && room.isStreaming) {
      io.to(room.hostId).emit('viewer-ready-for-stream', { viewerId: socket.id });
    }
  });

  // WebRTC da Transmissão de Tela
  socket.on('s-offer', ({ to, offer }) => io.to(to).emit('s-offer', { from: socket.id, offer }));
  socket.on('s-answer', ({ to, answer }) => io.to(to).emit('s-answer', { from: socket.id, answer }));
  socket.on('s-ice', ({ to, candidate }) => io.to(to).emit('s-ice', { from: socket.id, candidate }));

  // Chat
  socket.on('send-chat', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = {
      id: Date.now(),
      user: socket.userName || 'Membro',
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      avatarColor: socket.isHost ? '#5865f2' : '#23a55a'
    };
    room.chatHistory.push(msg);
    if (room.chatHistory.length > 100) room.chatHistory.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  socket.on('ping-check', (cb) => { cb(Date.now()); });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.voiceUsers.has(socket.id)) {
      room.voiceUsers.delete(socket.id);
      socket.to(roomId).emit('user-left-voice', { userId: socket.id });
    }

    if (socket.isHost) {
      room.hostId = null;
      room.isStreaming = false;
      room.hasAudio = false;
      io.to(roomId).emit('stream-ended');
      io.to(roomId).emit('host-left');
    } else {
      room.viewers.delete(socket.id);
    }

    io.to(roomId).emit('discord-state', getRoomState(room));
  });
});

function getRoomState(room) {
  return {
    roomId: room.id,
    isStreaming: room.isStreaming,
    hasAudio: room.hasAudio,
    hostId: room.hostId,
    hostName: room.hostName,
    voiceUsers: Array.from(room.voiceUsers.entries()).map(([id, u]) => ({ id, ...u })),
    allUsers: [
      ...(room.hostId ? [{ id: room.hostId, name: room.hostName, isHost: true }] : []),
      ...Array.from(room.viewers.entries()).map(([id, v]) => ({ id, name: v.name, isHost: false }))
    ]
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🎮 Discord ScreenRoom rodando na porta ' + PORT));
