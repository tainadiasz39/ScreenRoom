const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Servidor PeerJS embutido no mesmo link do Render
const peerServer = ExpressPeerServer(server, {
  debug: false,
  path: '/'
});
app.use('/peerjs', peerServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

app.post('/api/create-room', (req, res) => {
  const roomId = crypto.randomBytes(4).toString('hex');
  rooms.set(roomId, {
    id: roomId,
    hostSocketId: null,
    hostPeerId: null,
    isStreaming: false,
    viewers: new Map()
  });
  res.json({ roomId });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, peerId, isHost }) => {
    let room = rooms.get(roomId) || { id: roomId, hostSocketId: null, hostPeerId: null, isStreaming: false, viewers: new Map() };
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.peerId = peerId;
    socket.isHost = isHost;

    if (isHost) {
      room.hostSocketId = socket.id;
      room.hostPeerId = peerId;
    } else {
      room.viewers.set(socket.id, peerId);
    }

    io.to(roomId).emit('room-update', {
      viewers: room.viewers.size + (room.hostSocketId ? 1 : 0),
      isStreaming: room.isStreaming,
      hostPeerId: room.hostPeerId
    });

    // Se o host já estiver transmitindo, conecta com o novo espectador
    if (room.isStreaming && room.hostSocketId && !isHost) {
      io.to(room.hostSocketId).emit('call-viewer', { viewerPeerId: peerId });
    }
  });

  socket.on('host-streaming-started', ({ roomId, hostPeerId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = true;
      room.hostPeerId = hostPeerId;
      io.to(roomId).emit('room-update', {
        viewers: room.viewers.size + (room.hostSocketId ? 1 : 0),
        isStreaming: true,
        hostPeerId: room.hostPeerId
      });
      // Manda o host ligar para cada espectador conectado
      for (const [sId, vPeerId] of room.viewers.entries()) {
        socket.emit('call-viewer', { viewerPeerId: vPeerId });
      }
    }
  });

  socket.on('host-streaming-stopped', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.isStreaming = false;
      io.to(roomId).emit('room-update', {
        viewers: room.viewers.size + (room.hostSocketId ? 1 : 0),
        isStreaming: false,
        hostPeerId: room.hostPeerId
      });
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost) {
      room.hostSocketId = null;
      room.hostPeerId = null;
      room.isStreaming = false;
      io.to(roomId).emit('host-disconnected');
    } else {
      room.viewers.delete(socket.id);
    }

    io.to(roomId).emit('room-update', {
      viewers: room.viewers.size + (room.hostSocketId ? 1 : 0),
      isStreaming: room.isStreaming,
      hostPeerId: room.hostPeerId
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🔥 Servidor ScreenRoom rodando na porta ' + PORT));
