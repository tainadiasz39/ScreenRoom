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

function publicRoom(room) {
  return {
    id: room.id,
    roomName: room.roomName,
    hostName: room.hostName,
    viewerCount: room.authorizedViewers.size,
    isStreaming: room.streaming,
    hasHost: !!room.hostId
  };
}

function broadcastLobby() {
  const list = [];
  for (const room of rooms.values()) list.push(publicRoom(room));
  io.emit("lobby-update", list);
}

function broadcastRoomStatus(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room-status", {
    roomName: room.roomName,
    hostName: room.hostName,
    viewers: room.authorizedViewers.size,
    isStreaming: room.streaming,
    hasHost: !!room.hostId
  });
}

app.get("/health", (req, res) => {
  res.json({ ok: true, rooms: rooms.size, time: new Date().toISOString() });
});

app.get("/api/rooms", (req, res) => {
  const list = [];
  for (const room of rooms.values()) list.push(publicRoom(room));
  res.json(list);
});

app.post("/api/create-room", (req, res) => {
  const roomName = String(req.body.roomName || "").trim();
  const hostName = String(req.body.hostName || "").trim();

  if (!roomName || !hostName) {
    return res.status(400).json({ ok: false, error: "Preencha nome e sala." });
  }

  let roomId;
  do {
    roomId = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(roomId));

  const hostKey = crypto.randomBytes(24).toString("hex");

  rooms.set(roomId, {
    id: roomId,
    roomName,
    hostName,
    hostKey,
    hostId: null,
    pendingViewers: new Map(),
    authorizedViewers: new Set(),
    viewerNames: new Map(),
    streaming: false,
    createdAt: Date.now(),
    graceTimeout: null
  });

  broadcastLobby();

  // Importante: devolve hostKey para o frontend salvar e entrar como dono
  res.json({ ok: true, roomId, hostKey, roomName, hostName });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

io.on("connection", (socket) => {
  console.log("Conectado:", socket.id);

  socket.on("get-lobby", () => {
    const list = [];
    for (const room of rooms.values()) list.push(publicRoom(room));
    socket.emit("lobby-update", list);
  });

  // HOST entra / reconecta com a chave secreta
  socket.on("join-host", ({ roomId, hostKey }) => {
    roomId = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("join-error", "Sala nao existe mais.");
      return;
    }

    if (!hostKey || room.hostKey !== hostKey) {
      socket.emit("join-error", "Voce nao e o dono desta sala.");
      return;
    }

    if (room.graceTimeout) {
      clearTimeout(room.graceTimeout);
      room.graceTimeout = null;
      console.log("Host recuperou a sala:", roomId);
    }

    // Se havia socket antigo do host, só substitui (F5 / reconexão)
    room.hostId = socket.id;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = true;
    socket.nickname = room.hostName;

    socket.emit("host-ready", {
      roomId: room.id,
      roomName: room.roomName,
      hostName: room.hostName,
      isStreaming: room.streaming,
      viewers: room.authorizedViewers.size
    });

    // Reenvia pedidos pendentes
    for (const [viewerId, nickname] of room.pendingViewers.entries()) {
      socket.emit("entry-requested", { viewerId, nickname });
    }

    broadcastRoomStatus(roomId);
    broadcastLobby();
  });

  // VIEWER pede para entrar
  socket.on("request-entry", ({ roomId, nickname }) => {
    roomId = String(roomId || "").trim().toUpperCase();
    nickname = String(nickname || "").trim() || "Anonimo";

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("join-error", "Sala indisponivel.");
      return;
    }

    // Se essa pessoa tem a hostKey no client, o client nao deveria chamar isso.
    // Mesmo assim, bloqueamos confusao basica.
    socket.roomId = roomId;
    socket.isHost = false;
    socket.nickname = nickname;

    room.pendingViewers.set(socket.id, nickname);
    room.viewerNames.set(socket.id, nickname);

    if (room.hostId) {
      io.to(room.hostId).emit("entry-requested", {
        viewerId: socket.id,
        nickname
      });
    }

    socket.emit("waiting-approval", {
      roomName: room.roomName,
      hostName: room.hostName
    });
  });

  socket.on("decide-entry", ({ viewerId, approved }) => {
    if (!socket.isHost || !socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    const nickname = room.pendingViewers.get(viewerId) || "Anonimo";
    room.pendingViewers.delete(viewerId);

    if (approved) {
      room.authorizedViewers.add(viewerId);
      const viewerSocket = io.sockets.sockets.get(viewerId);
      if (viewerSocket) {
        viewerSocket.join(room.id);
        viewerSocket.emit("entry-approved", {
          roomId: room.id,
          roomName: room.roomName,
          hostName: room.hostName,
          isStreaming: room.streaming
        });
      }
      io.to(room.id).emit("chat-system", {
        text: nickname + " entrou na sala."
      });
      broadcastRoomStatus(room.id);
      broadcastLobby();
    } else {
      io.to(viewerId).emit("entry-rejected");
      room.viewerNames.delete(viewerId);
    }
  });

  socket.on("host-live", () => {
    if (!socket.isHost || !socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    room.streaming = true;
    socket.to(room.id).emit("stream-is-live");
    broadcastRoomStatus(room.id);
    broadcastLobby();
  });

  socket.on("host-stop", () => {
    if (!socket.isHost || !socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    room.streaming = false;
    socket.to(room.id).emit("stream-stopped");
    broadcastRoomStatus(room.id);
    broadcastLobby();
  });

  socket.on("request-stream", () => {
    if (!socket.roomId || socket.isHost) return;
    const room = rooms.get(socket.roomId);
    if (!room || !room.streaming || !room.hostId) return;
    if (!room.authorizedViewers.has(socket.id)) return;
    io.to(room.hostId).emit("viewer-ready", { viewerId: socket.id });
  });

  socket.on("chat-message", ({ text }) => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    text = String(text || "").trim();
    if (!text) return;
    if (text.length > 300) text = text.slice(0, 300);

    // host sempre pode; viewer so se autorizado
    if (!socket.isHost && !room.authorizedViewers.has(socket.id)) return;

    io.to(room.id).emit("chat-message", {
      from: socket.nickname || (socket.isHost ? room.hostName : "Anonimo"),
      text,
      isHost: !!socket.isHost,
      at: Date.now()
    });
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    if (!to) return;
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    if (!to) return;
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice", ({ to, candidate }) => {
    if (!to) return;
    io.to(to).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost && room.hostId === socket.id) {
      console.log("Host saiu, grace 20s:", roomId);
      room.hostId = null;
      room.streaming = false;
      io.to(roomId).emit("host-left");
      broadcastRoomStatus(roomId);
      broadcastLobby();

      room.graceTimeout = setTimeout(() => {
        const current = rooms.get(roomId);
        if (!current) return;
        if (current.hostId) return; // host voltou
        io.to(roomId).emit("room-expired");
        rooms.delete(roomId);
        broadcastLobby();
        console.log("Sala expirada:", roomId);
      }, 20000);
      return;
    }

    room.pendingViewers.delete(socket.id);
    const wasAuth = room.authorizedViewers.delete(socket.id);
    const nick = room.viewerNames.get(socket.id);
    room.viewerNames.delete(socket.id);

    if (room.hostId) {
      io.to(room.hostId).emit("viewer-disconnected", { viewerId: socket.id });
    }

    if (wasAuth && nick) {
      io.to(roomId).emit("chat-system", { text: nick + " saiu da sala." });
    }

    broadcastRoomStatus(roomId);
    broadcastLobby();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("ScreenRoom na porta " + PORT);
});
