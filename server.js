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
const socketRooms = new Map();

function listRooms() {
  return [...rooms.values()]
    .filter(room => room.hostId)
    .sort((a, b) => Number(b.streaming) - Number(a.streaming))
    .map(room => ({
      id: room.id,
      name: room.name,
      hostName: room.hostName,
      viewers: room.viewers.size,
      isStreaming: room.streaming
    }));
}

function updateRooms() {
  io.emit("rooms-updated", listRooms());
}

function roomStatus(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit("room-status", {
    roomName: room.name,
    viewers: room.viewers.size,
    isStreaming: room.streaming
  });
}

app.get("/health", (req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

io.on("connection", socket => {
  socket.emit("rooms-updated", listRooms());

  socket.on("create-room", ({ name, hostName } = {}) => {
    const roomId = crypto.randomBytes(8).toString("hex");

    const room = {
      id: roomId,
      name: String(name || "Sala ao vivo").trim().slice(0, 60) || "Sala ao vivo",
      hostName: String(hostName || "Host").trim().slice(0, 40) || "Host",
      hostId: socket.id,
      hostKey: crypto.randomBytes(16).toString("hex"),
      viewers: new Set(),
      pending: new Map(),
      streaming: false
    };

    rooms.set(roomId, room);
    socketRooms.set(socket.id, roomId);
    socket.join(roomId);

    socket.emit("room-created", {
      roomId,
      hostKey: room.hostKey
    });

    updateRooms();
    roomStatus(roomId);
  });

  socket.on("rejoin-host", ({ roomId, hostKey } = {}) => {
    const room = rooms.get(roomId);

    if (!room || room.hostKey !== hostKey) {
      socket.emit("host-unavailable");
      return;
    }

    if (room.hostId && room.hostId !== socket.id) {
      const oldHost = io.sockets.sockets.get(room.hostId);

      socketRooms.delete(room.hostId);

      if (oldHost) {
        oldHost.leave(roomId);
      }
    }

    room.hostId = socket.id;
    socketRooms.set(socket.id, roomId);
    socket.join(roomId);

    updateRooms();
    roomStatus(roomId);
  });

  socket.on("request-access", ({ roomId, viewerName } = {}) => {
    const room = rooms.get(roomId);

    if (!room || !room.hostId) {
      socket.emit("access-unavailable");
      return;
    }

    const name =
      String(viewerName || "Visitante").trim().slice(0, 40) ||
      "Visitante";

    socketRooms.set(socket.id, roomId);
    room.pending.set(socket.id, { name });

    io.to(room.hostId).emit("access-request", {
      viewerId: socket.id,
      viewerName: name
    });

    socket.emit("access-pending", {
      roomName: room.name
    });
  });

  socket.on("approve-access", ({ viewerId } = {}) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (
      !room ||
      room.hostId !== socket.id ||
      !room.pending.has(viewerId)
    ) {
      return;
    }

    room.pending.delete(viewerId);
    room.viewers.add(viewerId);

    const viewer = io.sockets.sockets.get(viewerId);

    if (viewer) {
      viewer.join(roomId);
    }

    io.to(viewerId).emit("access-approved", {
      roomName: room.name,
      isStreaming: room.streaming
    });

    updateRooms();
    roomStatus(roomId);
  });

  socket.on("reject-access", ({ viewerId } = {}) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (
      !room ||
      room.hostId !== socket.id ||
      !room.pending.has(viewerId)
    ) {
      return;
    }

    room.pending.delete(viewerId);
    socketRooms.delete(viewerId);

    io.to(viewerId).emit("access-rejected");
  });

  socket.on("host-live", () => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (!room || room.hostId !== socket.id) return;

    room.streaming = true;

    io.to(room.id).emit("stream-is-live");
    updateRooms();
    roomStatus(room.id);
  });

  socket.on("host-stop", () => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (!room || room.hostId !== socket.id) return;

    room.streaming = false;

    io.to(room.id).emit("stream-stopped");
    updateRooms();
    roomStatus(room.id);
  });

  socket.on("request-stream", () => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (
      !room ||
      !room.streaming ||
      !room.viewers.has(socket.id)
    ) {
      return;
    }

    io.to(room.hostId).emit("viewer-ready", {
      viewerId: socket.id
    });
  });

  socket.on("webrtc-offer", ({ to, offer } = {}) => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (
      room &&
      room.hostId === socket.id &&
      room.viewers.has(to)
    ) {
      io.to(to).emit("webrtc-offer", {
        from: socket.id,
        offer
      });
    }
  });

  socket.on("webrtc-answer", ({ to, answer } = {}) => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (
      room &&
      room.hostId === to &&
      room.viewers.has(socket.id)
    ) {
      io.to(to).emit("webrtc-answer", {
        from: socket.id,
        answer
      });
    }
  });

  socket.on("webrtc-ice", ({ to, candidate } = {}) => {
    const room = rooms.get(socketRooms.get(socket.id));

    if (!room || !candidate) return;

    const valid =
      (room.hostId === socket.id && room.viewers.has(to)) ||
      (room.hostId === to && room.viewers.has(socket.id));

    if (valid) {
      io.to(to).emit("webrtc-ice", {
        from: socket.id,
        candidate
      });
    }
  });

  socket.on("disconnect", () => {
    const roomId = socketRooms.get(socket.id);

    socketRooms.delete(socket.id);

    const room = rooms.get(roomId);

    if (!room) return;

    room.pending.delete(socket.id);
    room.viewers.delete(socket.id);

    if (room.hostId === socket.id) {
      room.hostId = null;
      room.streaming = false;

      io.to(room.id).emit("host-left");

      setTimeout(() => {
        const current = rooms.get(room.id);

        if (current && !current.hostId) {
          rooms.delete(room.id);
          updateRooms();
        }
      }, 15000);
    } else {
      roomStatus(room.id);
    }

    updateRooms();
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("ScreenRoom rodando na porta " + PORT);
});

