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
    viewers: new Set(),
    isStreaming: false
  });
  res.json({ roomId });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, isHost }) => {
    let room = rooms.get(roomId);
    if (!room) {
      room = { id: roomId, hostId: null, viewers: new Set(), isStreaming: false };
      rooms.set(roomId, room);
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = isHost;

    if (isHost) {
      room.hostId = socket.id;
    } else {
      room.viewers.add(socket.id);
    }

    io.to(roomId).emit('room-status', {
      viewers: room.viewers.size + (room.hostId ? 1 : 0),
      isStreaming: room.isStreaming,
      hasHost: room.hostId !== null
    });
  });

  socket.on('host-live', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = true;
      socket.to(roomId).emit('stream-is-live');
      io.to(roomId).emit('room-status', {
        viewers: room.viewers.size + 1,
        isStreaming: true,
        hasHost: true
      });
    }
  });

  socket.on('host-stop', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = false;
      socket.to(roomId).emit('stream-stopped');
      io.to(roomId).emit('room-status', {
        viewers: room.viewers.size + 1,
        isStreaming: false,
        hasHost: true
      });
    }
  });

  socket.on('request-stream', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.hostId && room.isStreaming) {
      io.to(room.hostId).emit('viewer-ready', { viewerId: socket.id });
    }
  });

  socket.on('webrtc-offer', ({ to, offer }) => io.to(to).emit('webrtc-offer', { from: socket.id, offer }));
  socket.on('webrtc-answer', ({ to, answer }) => io.to(to).emit('webrtc-answer', { from: socket.id, answer }));
  socket.on('webrtc-ice', ({ to, candidate }) => io.to(to).emit('webrtc-ice', { from: socket.id, candidate }));

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost) {
      room.hostId = null;
      room.isStreaming = false;
      io.to(roomId).emit('host-left');
    } else {
      room.viewers.delete(socket.id);
    }

    io.to(roomId).emit('room-status', {
      viewers: room.viewers.size + (room.hostId ? 1 : 0),
      isStreaming: room.isStreaming,
      hasHost: room.hostId !== null
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('ScreenRoom rodando na porta ' + PORT));
