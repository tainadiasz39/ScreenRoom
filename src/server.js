const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const STREAM_DURATION = 12 * 60 * 60 * 1000;

const streams = new Map();

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, 'renderer')
  )
);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'screen-room'
  });
});

app.get('/watch/:streamId', (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'renderer',
      'index.html'
    )
  );
});

io.on('connection', socket => {

  console.log(
    `[ScreenRoom] Conectado: ${socket.id}`
  );


  // ================================
  // CRIAR TRANSMISSÃO
  // ================================

  socket.on('stream:create', () => {

    // Evita criar várias transmissões
    if (socket.data.streamId) {
      return;
    }

    const streamId =
      crypto
        .randomBytes(6)
        .toString('hex')
        .toUpperCase();

    const stream = {
      id: streamId,
      broadcaster: socket.id,
      createdAt: Date.now(),
      viewers: new Set()
    };

    streams.set(
      streamId,
      stream
    );

    socket.data.streamId =
      streamId;

    socket.data.isBroadcaster =
      true;

    socket.join(streamId);

    const link =
      `/watch/${streamId}`;

    socket.emit(
      'stream:created',
      {
        id: streamId,
        link
      }
    );

    console.log(
      `[ScreenRoom] Transmissão criada: ${streamId}`
    );
  });


  // ================================
  // ESPECTADOR ENTRA
  // ================================

  socket.on('stream:watch', data => {

    const streamId =
      typeof data?.streamId === 'string'
        ? data.streamId
            .trim()
            .toUpperCase()
        : '';

    if (!streamId) {

      socket.emit(
        'stream:error',
        {
          message:
            'Link de transmissão inválido.'
        }
      );

      return;
    }

    const stream =
      streams.get(streamId);

    if (!stream) {

      socket.emit(
        'stream:error',
        {
          message:
            'Essa transmissão não está mais disponível.'
        }
      );

      return;
    }

    if (
      stream.broadcaster ===
      socket.id
    ) {
      return;
    }

    stream.viewers.add(
      socket.id
    );

    socket.data.streamId =
      streamId;

    socket.data.isBroadcaster =
      false;

    socket.join(streamId);

    socket.emit(
      'stream:watching',
      {
        id: streamId
      }
    );

    io.to(
      stream.broadcaster
    ).emit(
      'stream:viewer-joined',
      {
        viewerId:
          socket.id,
        viewerCount:
          stream.viewers.size
      }
    );

    console.log(
      `[ScreenRoom] Espectador ${socket.id} entrou em ${streamId}`
    );
  });


  // ================================
  // WEBRTC OFFER
  // ================================

  socket.on(
    'webrtc:offer',
    data => {

      const targetId =
        typeof data?.targetId === 'string'
          ? data.targetId
          : '';

      if (!targetId) {
        return;
      }

      io.to(targetId).emit(
        'webrtc:offer',
        {
          senderId:
            socket.id,
          offer:
            data.offer
        }
      );
    }
  );


  // ================================
  // WEBRTC ANSWER
  // ================================

  socket.on(
    'webrtc:answer',
    data => {

      const targetId =
        typeof data?.targetId === 'string'
          ? data.targetId
          : '';

      if (!targetId) {
        return;
      }

      io.to(targetId).emit(
        'webrtc:answer',
        {
          senderId:
            socket.id,
          answer:
            data.answer
        }
      );
    }
  );


  // ================================
  // WEBRTC ICE
  // ================================

  socket.on(
    'webrtc:ice-candidate',
    data => {

      const targetId =
        typeof data?.targetId === 'string'
          ? data.targetId
          : '';

      if (!targetId) {
        return;
      }

      io.to(targetId).emit(
        'webrtc:ice-candidate',
        {
          senderId:
            socket.id,
          candidate:
            data.candidate
        }
      );
    }
  );


  // ================================
  // ENCERRAR
  // ================================

  socket.on(
    'stream:stop',
    () => {
      stopStream(socket);
    }
  );


  // ================================
  // DESCONECTOU
  // ================================

  socket.on(
    'disconnect',
    () => {

      console.log(
        `[ScreenRoom] Desconectado: ${socket.id}`
      );

      const streamId =
        socket.data?.streamId;

      if (!streamId) {
        return;
      }

      const stream =
        streams.get(streamId);

      if (!stream) {
        return;
      }


      // Se for o transmissor,
      // encerra a transmissão inteira.

      if (
        stream.broadcaster ===
        socket.id
      ) {

        io.to(streamId).emit(
          'stream:stopped'
        );

        streams.delete(
          streamId
        );

        console.log(
          `[ScreenRoom] Transmissão encerrada: ${streamId}`
        );

        return;
      }


      // Se for espectador,
      // apenas remove ele.

      stream.viewers.delete(
        socket.id
      );

      io.to(
        stream.broadcaster
      ).emit(
        'stream:viewer-left',
        {
          viewerId:
            socket.id,
          viewerCount:
            stream.viewers.size
        }
      );
    }
  );
});


// ================================
// FUNÇÃO PARA PARAR TRANSMISSÃO
// ================================

function stopStream(socket) {

  const streamId =
    socket.data?.streamId;

  if (!streamId) {
    return;
  }

  const stream =
    streams.get(streamId);

  if (!stream) {
    return;
  }

  if (
    stream.broadcaster !==
    socket.id
  ) {

    stream.viewers.delete(
      socket.id
    );

    return;
  }

  io.to(streamId).emit(
    'stream:stopped'
  );

  streams.delete(
    streamId
  );

  console.log(
    `[ScreenRoom] Transmissão encerrada: ${streamId}`
  );
}


// ================================
// LIMPEZA AUTOMÁTICA - 12 HORAS
// ================================

setInterval(
  () => {

    const now =
      Date.now();

    for (
      const [
        id,
        stream
      ] of streams
    ) {

      const broadcaster =
        io.sockets.sockets.get(
          stream.broadcaster
        );

      if (!broadcaster) {

        streams.delete(
          id
        );

        continue;
      }

      if (
        now -
          stream.createdAt >=
        STREAM_DURATION
      ) {

        io.to(id).emit(
          'stream:stopped'
        );

        streams.delete(
          id
        );

        console.log(
          `[ScreenRoom] Transmissão expirada: ${id}`
        );
      }
    }

  },
  60 * 1000
);


// ================================
// SERVIDOR
// ================================

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `[ScreenRoom] Servidor iniciado na porta ${PORT}`
    );

  }
);
