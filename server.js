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
  const roomId = crypto.randomBytes(4).toString('hex');
  rooms.set(roomId, {
    id: roomId,
    hostId: null,
    viewers: new Set(),
    isStreaming: false
  });
  res.json({ roomId });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userName, isHost }) => {
    let room = rooms.get(roomId) || { id: roomId, hostId: null, viewers: new Set(), isStreaming: false };
    rooms.set(roomId, room);
    const name = userName || (isHost ? 'Host' : 'Espectador');
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = name;
    socket.isHost = isHost;

    if (isHost) {
      room.hostId = socket.id;
    } else {
      room.viewers.add(socket.id);
    }

    io.to(roomId).emit('room-update', {
      viewers: room.viewers.size + (room.hostId ? 1 : 0),
      isStreaming: room.isStreaming,
      hasHost: room.hostId !== null
    });

    // Se o host já estiver transmitindo, manda ele iniciar conexão com esse espectador
    if (room.isStreaming && room.hostId && !isHost) {
      io.to(room.hostId).emit('viewer-ready', socket.id);
    }
  });

  socket.on('host-status', ({ roomId, isStreaming }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = isStreaming;
      io.to(roomId).emit('room-update', {
        viewers: room.viewers.size + (room.hostId ? 1 : 0),
        isStreaming,
        hasHost: room.hostId !== null
      });
      if (isStreaming) {
        socket.to(roomId).emit('stream-started');
      }
    }
  });

  socket.on('request-stream', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.hostId && room.isStreaming) {
      io.to(room.hostId).emit('viewer-ready', socket.id);
    }
  });

  // Troca de Sinais WebRTC
  socket.on('offer', ({ to, offer }) => io.to(to).emit('offer', { from: socket.id, offer }));
  socket.on('answer', ({ to, answer }) => io.to(to).emit('answer', { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  // Chat
  socket.on('chat-msg', ({ roomId, text }) => {
    io.to(roomId).emit('chat-msg', { user: socket.userName || 'Anônimo', text });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost) {
      room.hostId = null;
      room.isStreaming = false;
      io.to(roomId).emit('host-disconnected');
    } else {
      room.viewers.delete(socket.id);
    }
    io.to(roomId).emit('room-update', {
      viewers: room.viewers.size + (room.hostId ? 1 : 0),
      isStreaming: room.isStreaming,
      hasHost: room.hostId !== null
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));
