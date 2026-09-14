const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");


const app = express();

const server =
  http.createServer(app);


const io =
  new Server(server, {

    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },

    transports: [
      "websocket",
      "polling"
    ]

  });


app.use(
  express.json()
);


app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/*
============================================================
SALAS
============================================================
*/

const rooms = new Map();


/*
============================================================
HEALTH CHECK
============================================================
*/

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      service: "ScreenRoom",

      rooms: rooms.size,

      time: new Date().toISOString()

    });

  }
);


/*
============================================================
PÁGINA INICIAL
============================================================
*/

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/*
============================================================
SALA
============================================================
*/

app.get(
  "/room/:id",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "room.html"
      )
    );

  }
);


/*
============================================================
CRIAR SALA
============================================================
*/

app.post(
  "/api/create-room",
  (req, res) => {

    let roomId;

    do {

      roomId =
        crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase();

    } while (
      rooms.has(roomId)
    );


    rooms.set(
      roomId,
      {

        id: roomId,

        hostId: null,

        viewers: new Set(),

        streaming: false,

        createdAt: Date.now()

      }
    );


    res.json({

      ok: true,

      roomId

    });

  }
);


/*
============================================================
STATUS DA SALA
============================================================
*/

function sendRoomStatus(
  roomId
) {

  const room =
    rooms.get(roomId);

  if (!room) return;


  io.to(roomId).emit(
    "room-status",
    {

      viewers:
        room.viewers.size +
        (
          room.hostId
            ? 1
            : 0
        ),

      isStreaming:
        room.streaming,

      hasHost:
        room.hostId !== null

    }
  );

}


/*
============================================================
CONEXÃO
============================================================
*/

io.on(
  "connection",
  (socket) => {

    console.log(
      "Conectado:",
      socket.id
    );


    /*
    ========================================================
    ENTRAR
    ========================================================
    */

    socket.on(
      "join-room",
      ({
        roomId,
        isHost
      }) => {

        if (
          typeof roomId !== "string"
        ) {

          return;

        }


        roomId =
          roomId
            .trim()
            .toUpperCase();


        let room =
          rooms.get(roomId);


        /*
        ----------------------------------------------------
        SE NÃO EXISTE
        ----------------------------------------------------
        */

        if (!room) {

          room = {

            id: roomId,

            hostId: null,

            viewers: new Set(),

            streaming: false,

            createdAt: Date.now()

          };


          rooms.set(
            roomId,
            room
          );

        }


        socket.join(roomId);

        socket.roomId =
          roomId;


        socket.isHost =
          Boolean(isHost);


        /*
        ----------------------------------------------------
        HOST
        ----------------------------------------------------
        */

        if (
          socket.isHost
        ) {

          /*
          Se já existe outro host,
          não substitui silenciosamente.
          */

          if (
            room.hostId &&
            room.hostId !== socket.id
          ) {

            socket.emit(
              "host-denied"
            );

            return;

          }


          room.hostId =
            socket.id;

        }


        /*
        ----------------------------------------------------
        VIEWER
        ----------------------------------------------------
        */

        else {

          room.viewers.add(
            socket.id
          );

        }


        socket.emit(
          "joined-room",
          {

            roomId,

            isHost:
              socket.isHost,

            isStreaming:
              room.streaming

          }
        );


        sendRoomStatus(
          roomId
        );


        /*
        ----------------------------------------------------
        SE JÁ ESTÁ AO VIVO
        ----------------------------------------------------
        */

        if (
          !socket.isHost &&
          room.streaming
        ) {

          socket.emit(
            "stream-is-live"
          );

        }

      }
    );


    /*
    ========================================================
    HOST INICIOU
    ========================================================
    */

    socket.on(
      "host-live",
      ({ roomId }) => {

        const room =
          rooms.get(roomId);

        if (!room) return;

        if (
          room.hostId !== socket.id
        ) return;


        room.streaming =
          true;


        socket.to(roomId).emit(
          "stream-is-live"
        );


        sendRoomStatus(
          roomId
        );

      }
    );


    /*
    ========================================================
    HOST PAROU
    ========================================================
    */

    socket.on(
      "host-stop",
      ({ roomId }) => {

        const room =
          rooms.get(roomId);

        if (!room) return;

        if (
          room.hostId !== socket.id
        ) return;


        room.streaming =
          false;


        socket.to(roomId).emit(
          "stream-stopped"
        );


        sendRoomStatus(
          roomId
        );

      }
    );


    /*
    ========================================================
    VIEWER PEDE STREAM
    ========================================================
    */

    socket.on(
      "request-stream",
      ({ roomId }) => {

        const room =
          rooms.get(roomId);

        if (!room) return;


        if (
          !room.hostId
        ) return;


        if (
          !room.streaming
        ) return;


        io.to(room.hostId).emit(
          "viewer-ready",
          {

            viewerId:
              socket.id

          }
        );

      }
    );


    /*
    ========================================================
    OFFER
    ========================================================
    */

    socket.on(
      "webrtc-offer",
      ({
        to,
        offer
      }) => {

        if (!to) return;

        io.to(to).emit(
          "webrtc-offer",
          {

            from:
              socket.id,

            offer

          }
        );

      }
    );


    /*
    ========================================================
    ANSWER
    ========================================================
    */

    socket.on(
      "webrtc-answer",
      ({
        to,
        answer
      }) => {

        if (!to) return;

        io.to(to).emit(
          "webrtc-answer",
          {

            from:
              socket.id,

            answer

          }
        );

      }
    );


    /*
    ========================================================
    ICE
    ========================================================
    */

    socket.on(
      "webrtc-ice",
      ({
        to,
        candidate
      }) => {

        if (!to) return;

        io.to(to).emit(
          "webrtc-ice",
          {

            from:
              socket.id,

            candidate

          }
        );

      }
    );


    /*
    ========================================================
    DESCONEXÃO
    ========================================================
    */

    socket.on(
      "disconnect",
      () => {

        console.log(
          "Desconectado:",
          socket.id
        );


        const roomId =
          socket.roomId;

        if (!roomId) return;


        const room =
          rooms.get(roomId);

        if (!room) return;


        if (
          socket.isHost
        ) {

          room.hostId =
            null;

          room.streaming =
            false;


          io.to(roomId).emit(
            "host-left"
          );

        } else {

          room.viewers.delete(
            socket.id
          );

        }


        sendRoomStatus(
          roomId
        );


        /*
        ----------------------------------------------------
        APAGA SALA VAZIA
        ----------------------------------------------------
        */

        if (
          room.viewers.size === 0 &&
          !room.hostId
        ) {

          rooms.delete(
            roomId
          );

        }

      }
    );

  }
);


/*
============================================================
LIMPEZA DE SALAS ANTIGAS
============================================================

Não existe armazenamento de vídeo.
As salas ficam somente na memória.
============================================================
*/

setInterval(
  () => {

    const now =
      Date.now();


    for (
      const [roomId, room]
      of rooms
    ) {

      /*
      12 horas
      */

      if (
        now -
        room.createdAt >
        12 * 60 * 60 * 1000
      ) {

        io.to(roomId).emit(
          "room-expired"
        );


        rooms.delete(
          roomId
        );

      }

    }

  },
  10 * 60 * 1000
);


/*
============================================================
PORTA RENDER
============================================================
*/

const PORT =
  process.env.PORT ||
  3000;


server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "ScreenRoom rodando na porta " +
      PORT
    );

  }
);
