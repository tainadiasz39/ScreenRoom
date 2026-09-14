const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function createRoomObject(roomId) {
  return {
    id: roomId,
    hostId: null,
    hostName: "Host",
    viewers: new Set(),
    pending: new Map(),
    streaming: false,
    createdAt: Date.now()
  };
}

function publicRooms() {
  return Array.from(rooms.values())
    .filter(room => room.hostId)
    .map(room => ({
      id: room.id,
      hostName: room.hostName || "Host",
      viewers: room.viewers.size,
      streaming: room.streaming
    }));
}

function broadcastRooms() {
  io.emit("public-rooms", publicRooms());
}

function sendRoomStatus(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit("room-status", {
    viewers: room.viewers.size + (room.hostId ? 1 : 0),
    isStreaming: room.streaming,
    hasHost: Boolean(room.hostId)
  });
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ScreenRoom",
    rooms: rooms.size,
    time: new Date().toISOString()
  });
});

app.get("/api/rooms", (req, res) => {
  res.json({ ok: true, rooms: publicRooms() });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

app.post("/api/create-room", (req, res) => {
  let roomId;
  do {
    roomId = crypto.randomBytes(4).toString("hex").toUpperCase();
  } while (rooms.has(roomId));

  rooms.set(roomId, createRoomObject(roomId));

  res.json({ ok: true, roomId });
});

io.on("connection", socket => {
  console.log("Conectado:", socket.id);

  socket.on("join-room", ({ roomId, isHost, name } = {}) => {
    if (typeof roomId !== "string") return;

    roomId = roomId.trim().toUpperCase();
    if (!roomId) return;

    let room = rooms.get(roomId);
    if (!room) {
      room = createRoomObject(roomId);
      rooms.set(roomId, room);
    }

    socket.roomId = roomId;
    socket.isHost = Boolean(isHost);

    if (socket.isHost) {
      if (room.hostId && room.hostId !== socket.id) {
        socket.emit("host-denied");
        return;
      }

      room.hostId = socket.id;
      room.hostName = String(name || "Host").trim().slice(0, 40) || "Host";
      socket.viewerName = room.hostName;
      socket.join(roomId);

      socket.emit("joined-room", {
        roomId,
        isHost: true,
        isStreaming: room.streaming
      });

      socket.emit("pending-list", Array.from(room.pending.entries()).map(([viewerId, data]) => ({
        viewerId,
        name: data.name
      })));

      sendRoomStatus(roomId);
      broadcastRooms();
      return;
    }

    const viewerName = String(name || "Visitante").trim().slice(0, 40) || "Visitante";
    socket.viewerName = viewerName;

    if (room.hostId === socket.id || room.viewers.has(socket.id)) return;

    room.pending.set(socket.id, {
      name: viewerName,
      createdAt: Date.now()
    });

    socket.emit("join-pending", { roomId, name: viewerName });

    if (room.hostId) {
      io.to(room.hostId).emit("join-request", {
        viewerId: socket.id,
        name: viewerName
      });
    } else {
      room.pending.delete(socket.id);
      socket.emit("join-denied", {
        reason: "A sala ainda não possui host."
      });
    }
  });

  socket.on("approve-viewer", ({ roomId, viewerId } = {}) => {
    roomId = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    const request = room.pending.get(viewerId);
    if (!request) return;

    const viewerSocket = io.sockets.sockets.get(viewerId);
    room.pending.delete(viewerId);

    if (!viewerSocket) {
      sendRoomStatus(room.id);
      broadcastRooms();
      return;
    }

    room.viewers.add(viewerId);
    viewerSocket.roomId = room.id;
    viewerSocket.isHost = false;
    viewerSocket.viewerName = request.name;
    viewerSocket.join(room.id);

    viewerSocket.emit("join-approved", {
      roomId: room.id,
      name: request.name,
      isStreaming: room.streaming
    });

    if (room.streaming) viewerSocket.emit("stream-is-live");

    sendRoomStatus(room.id);
    broadcastRooms();
  });

  socket.on("deny-viewer", ({ roomId, viewerId } = {}) => {
    roomId = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.pending.delete(viewerId);

    const viewerSocket = io.sockets.sockets.get(viewerId);
    if (viewerSocket) {
      viewerSocket.emit("join-denied", {
        reason: "O host recusou seu pedido para entrar."
      });
    }

    sendRoomStatus(room.id);
    broadcastRooms();
  });

  socket.on("host-live", ({ roomId } = {}) => {
    const room = rooms.get(String(roomId || "").trim().toUpperCase());
    if (!room || room.hostId !== socket.id) return;

    room.streaming = true;
    socket.to(room.id).emit("stream-is-live");
    sendRoomStatus(room.id);
    broadcastRooms();
  });

  socket.on("host-stop", ({ roomId } = {}) => {
    const room = rooms.get(String(roomId || "").trim().toUpperCase());
    if (!room || room.hostId !== socket.id) return;

    room.streaming = false;
    socket.to(room.id).emit("stream-stopped");
    sendRoomStatus(room.id);
    broadcastRooms();
  });

  socket.on("request-stream", ({ roomId } = {}) => {
    const room = rooms.get(String(roomId || "").trim().toUpperCase());
    if (!room || !room.hostId || !room.streaming) return;
    if (!room.viewers.has(socket.id)) return;

    io.to(room.hostId).emit("viewer-ready", {
      viewerId: socket.id
    });
  });

  socket.on("chat-message", ({ message } = {}) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.hostId !== socket.id && !room.viewers.has(socket.id)) return;

    const text = String(message || "").trim().slice(0, 500);
    if (!text) return;

    const sender = room.hostId === socket.id
      ? (room.hostName || "Host")
      : (socket.viewerName || "Visitante");

    io.to(room.id).emit("chat-message", {
      sender,
      message: text,
      isHost: room.hostId === socket.id
    });
  });

  socket.on("webrtc-offer", ({ to, offer } = {}) => {
    if (!to || !offer) return;
    io.to(to).emit("webrtc-offer", {
      from: socket.id,
      offer
    });
  });

  socket.on("webrtc-answer", ({ to, answer } = {}) => {
    if (!to || !answer) return;
    io.to(to).emit("webrtc-answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("webrtc-ice", ({ to, candidate } = {}) => {
    if (!to || !candidate) return;
    io.to(to).emit("webrtc-ice", {
      from: socket.id,
      candidate
    });
  });

  socket.on("disconnect", () => {
    console.log("Desconectado:", socket.id);

    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost && room.hostId === socket.id) {
      room.hostId = null;
      room.streaming = false;
      io.to(roomId).emit("host-left");

      for (const viewerId of room.pending.keys()) {
        const pendingSocket = io.sockets.sockets.get(viewerId);
        if (pendingSocket) {
          pendingSocket.emit("join-denied", {
            reason: "O host saiu da sala."
          });
        }
      }
      room.pending.clear();
    } else {
      room.viewers.delete(socket.id);
      room.pending.delete(socket.id);
    }

    sendRoomStatus(roomId);
    broadcastRooms();

    if (room.viewers.size === 0 && room.pending.size === 0 && !room.hostId) {
      rooms.delete(roomId);
      broadcastRooms();
    }
  });
});

setInterval(() => {
  const now = Date.now();

  for (const [roomId, room] of rooms) {
    if (now - room.createdAt > 12 * 60 * 60 * 1000) {
      io.to(roomId).emit("room-expired");
      rooms.delete(roomId);
    }
  }

  broadcastRooms();
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("ScreenRoom rodando na porta " + PORT);
});

