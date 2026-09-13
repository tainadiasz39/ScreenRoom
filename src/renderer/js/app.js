const socket = io();

let currentRoomId = null;
let currentRoomLink = null;

let localStream = null;
let microphoneStream = null;

let isBroadcaster = false;
let isWatching = false;

const peerConnections = new Map();

const rtcConfig = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    }
  ]
};


// ==================================================
// ELEMENTOS
// ==================================================

const homeScreen =
  document.getElementById('homeScreen');

const roomScreen =
  document.getElementById('roomScreen');

const joinScreen =
  document.getElementById('joinScreen');

const watchScreen =
  document.getElementById('watchScreen');


const createRoomButton =
  document.getElementById('createRoomButton');

const joinRoomButton =
  document.getElementById('joinRoomButton');

const joinBackButton =
  document.getElementById('joinBackButton');

const leaveRoomButton =
  document.getElementById('leaveRoomButton');


const startBroadcastButton =
  document.getElementById('startBroadcastButton');

const stopStreamButton =
  document.getElementById('stopStreamButton');

const micButton =
  document.getElementById('micButton');


const generateLinkButton =
  document.getElementById('generateLinkButton');

const copyLinkButton =
  document.getElementById('copyLinkButton');

const shareLinkArea =
  document.getElementById('shareLinkArea');

const streamLink =
  document.getElementById('streamLink');

const copyStatus =
  document.getElementById('copyStatus');

const roomCode =
  document.getElementById('roomCode');

const viewerCount =
  document.getElementById('viewerCount');


const localVideo =
  document.getElementById('localVideo');

const videoPlaceholder =
  document.getElementById('videoPlaceholder');


const streamUrlInput =
  document.getElementById('streamUrlInput');

const connectWatchButton =
  document.getElementById('connectWatchButton');

const watchError =
  document.getElementById('watchError');


const remoteVideo =
  document.getElementById('remoteVideo');

const watchVideoArea =
  document.getElementById('watchVideoArea');

const watchStreamId =
  document.getElementById('watchStreamId');

const remoteWaiting =
  document.getElementById('remoteWaiting');


const playPauseButton =
  document.getElementById('playPauseButton');

const muteButton =
  document.getElementById('muteButton');

const volumeSlider =
  document.getElementById('volumeSlider');

const fullscreenButton =
  document.getElementById('fullscreenButton');

const watchPlayer =
  document.getElementById('watchPlayer');


const sourceModal =
  document.getElementById('sourceModal');

const sourceList =
  document.getElementById('sourceList');

const closeSourceModal =
  document.getElementById('closeSourceModal');

const cancelSourceButton =
  document.getElementById('cancelSourceButton');


// ==================================================
// TROCAR TELA
// ==================================================

function showScreen(screen) {

  document
    .querySelectorAll('.screen')
    .forEach(item => {
      item.classList.remove('active');
    });

  screen.classList.add('active');
}


// ==================================================
// CRIAR SALA
// ==================================================

createRoomButton.addEventListener(
  'click',
  () => {

    createRoomButton.disabled = true;

    createRoomButton.innerHTML =
      '⏳ Criando sala...';

    isBroadcaster = true;

    socket.emit(
      'stream:create'
    );
  }
);


// ==================================================
// SALA CRIADA
// ==================================================

socket.on(
  'stream:created',
  data => {

    currentRoomId =
      data.id;

    currentRoomLink =
      `${window.location.origin}${data.link}`;

    roomCode.textContent =
      currentRoomId;

    streamLink.textContent =
      currentRoomLink;

    shareLinkArea.classList.add(
      'hidden'
    );

    generateLinkButton.classList.remove(
      'hidden'
    );

    viewerCount.textContent =
      '0';

    showScreen(
      roomScreen
    );

    createRoomButton.disabled =
      false;

    createRoomButton.innerHTML =
      '<span>＋</span> Criar sala';

    console.log(
      '[ScreenRoom] Sala criada:',
      currentRoomId
    );
  }
);


// ==================================================
// GERAR / MOSTRAR LINK
// ==================================================

generateLinkButton.addEventListener(
  'click',
  () => {

    if (!currentRoomLink) {
      return;
    }

    shareLinkArea.classList.remove(
      'hidden'
    );

    generateLinkButton.textContent =
      '🔗 Link gerado';

    generateLinkButton.disabled =
      true;

    console.log(
      '[ScreenRoom] Link:',
      currentRoomLink
    );
  }
);


// ==================================================
// COPIAR LINK
// ==================================================

copyLinkButton.addEventListener(
  'click',
  async () => {

    if (!currentRoomLink) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        currentRoomLink
      );

      copyStatus.textContent =
        '✓ Link copiado!';

      setTimeout(
        () => {
          copyStatus.textContent =
            '';
        },
        2500
      );

    } catch (error) {

      console.error(
        '[ScreenRoom] Erro ao copiar:',
        error
      );

      copyStatus.textContent =
        'Não foi possível copiar o link.';
    }
  }
);


// ==================================================
// TRANSMITIR TELA
// ==================================================

startBroadcastButton.addEventListener(
  'click',
  async () => {

    await openSourceSelector();
  }
);


// ==================================================
// SELETOR DE TELA
// ==================================================

async function openSourceSelector() {

  sourceList.innerHTML =
    '<div class="source-loading">Carregando telas...</div>';

  sourceModal.classList.remove(
    'hidden'
  );

  try {

    if (
      window.screenRoom &&
      typeof window.screenRoom.sources ===
        'function'
    ) {

      const sources =
        await window.screenRoom.sources();

      renderSources(
        sources
      );

      return;
    }

    renderBrowserSource();

  } catch (error) {

    console.error(
      '[ScreenRoom] Erro ao carregar fontes:',
      error
    );

    renderBrowserSource();
  }
}


function renderBrowserSource() {

  sourceList.innerHTML = `
    <button
      class="source-item"
      id="browserScreenOption"
    >

      <div class="source-icon">
        🖥️
      </div>

      <div class="source-info">

        <strong>
          Tela do computador
        </strong>

        <span>
          Selecionar tela
        </span>

      </div>

    </button>
  `;

  document
    .getElementById(
      'browserScreenOption'
    )
    .addEventListener(
      'click',
      async () => {

        closeSourceSelector();

        await startScreenCapture();
      }
    );
}


function renderSources(
  sources
) {

  if (
    !Array.isArray(sources) ||
    sources.length === 0
  ) {

    sourceList.innerHTML = `
      <div class="source-loading">
        Nenhuma tela ou janela encontrada.
      </div>
    `;

    return;
  }

  sourceList.innerHTML =
    '';

  sources.forEach(
    source => {

      const item =
        document.createElement(
          'button'
        );

      item.className =
        'source-item';

      item.innerHTML = `
        ${
          source.thumbnail
            ? `
              <img
                class="source-thumbnail"
                src="${source.thumbnail}"
                alt=""
              >
            `
            : `
              <div class="source-icon">
                🖥️
              </div>
            `
        }

        <div class="source-info">

          <strong>
            ${escapeHtml(
              source.name
            )}
          </strong>

          <span>
            ${
              source.kind ===
              'screen'
                ? 'Tela'
                : 'Janela'
            }
          </span>

        </div>
      `;

      item.addEventListener(
        'click',
        async () => {

          if (
            window.screenRoom &&
            typeof window.screenRoom.selectSource ===
              'function'
          ) {

            await window.screenRoom.selectSource(
              source.id
            );
          }

          closeSourceSelector();

          await startScreenCapture();
        }
      );

      sourceList.appendChild(
        item
      );
    }
  );
}


function closeSourceSelector() {

  sourceModal.classList.add(
    'hidden'
  );
}


closeSourceModal.addEventListener(
  'click',
  closeSourceSelector
);

cancelSourceButton.addEventListener(
  'click',
  closeSourceSelector
);


// ==================================================
// CAPTURAR TELA
// ==================================================

async function startScreenCapture() {

  try {

    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );
    }


    localStream =
      await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: {
            ideal: 30,
            max: 60
          }
        },
        audio: true
      });


    localVideo.srcObject =
      localStream;

    videoPlaceholder.classList.add(
      'hidden'
    );


    const videoTrack =
      localStream.getVideoTracks()[0];


    if (videoTrack) {

      videoTrack.addEventListener(
        'ended',
        () => {

          stopBroadcast();

        }
      );
    }


    console.log(
      '[ScreenRoom] Transmissão iniciada.'
    );


    startBroadcastButton.textContent =
      '🟢 Transmitindo tela';

    startBroadcastButton.disabled =
      true;


    if (currentRoomLink) {

      shareLinkArea.classList.remove(
        'hidden'
      );

      generateLinkButton.textContent =
        '🔗 Link disponível';

      generateLinkButton.disabled =
        true;
    }

  } catch (error) {

    console.error(
      '[ScreenRoom] Erro ao capturar tela:',
      error
    );

    if (
      error.name !==
      'NotAllowedError'
    ) {

      alert(
        'Não foi possível iniciar a transmissão.'
      );
    }
  }
}


// ==================================================
// ESPECTADOR ENTROU
// ==================================================

socket.on(
  'stream:viewer-joined',
  async data => {

    if (!isBroadcaster) {
      return;
    }

    const viewerId =
      data?.viewerId;

    if (!viewerId) {
      return;
    }


    if (
      typeof data.viewerCount ===
      'number'
    ) {

      viewerCount.textContent =
        data.viewerCount;
    }


    await createBroadcasterConnection(
      viewerId
    );
  }
);


// ==================================================
// ESPECTADOR SAIU
// ==================================================

socket.on(
  'stream:viewer-left',
  data => {

    if (
      typeof data?.viewerCount ===
      'number'
    ) {

      viewerCount.textContent =
        data.viewerCount;
    }


    if (data?.viewerId) {

      closePeer(
        data.viewerId
      );
    }
  }
);


// ==================================================
// CRIAR CONEXÃO DO TRANSMISSOR
// ==================================================

async function createBroadcasterConnection(
  viewerId
) {

  if (!localStream) {
    return;
  }


  closePeer(
    viewerId
  );


  const peer =
    new RTCPeerConnection(
      rtcConfig
    );


  peerConnections.set(
    viewerId,
    peer
  );


  localStream
    .getTracks()
    .forEach(
      track => {

        peer.addTrack(
          track,
          localStream
        );

      }
    );


  peer.onicecandidate =
    event => {

      if (
        event.candidate
      ) {

        socket.emit(
          'webrtc:ice-candidate',
          {
            targetId:
              viewerId,

            candidate:
              event.candidate
          }
        );
      }
    };


  peer.onconnectionstatechange =
    () => {

      console.log(
        '[ScreenRoom] Espectador:',
        viewerId,
        peer.connectionState
      );


      if (
        peer.connectionState ===
          'failed' ||
        peer.connectionState ===
          'closed'
      ) {

        closePeer(
          viewerId
        );
      }
    };


  try {

    const offer =
      await peer.createOffer();


    await peer.setLocalDescription(
      offer
    );


    socket.emit(
      'webrtc:offer',
      {
        targetId:
          viewerId,

        offer:
          peer.localDescription
      }
    );

  } catch (error) {

    console.error(
      '[ScreenRoom] Erro ao criar offer:',
      error
    );
  }
}


// ==================================================
// RECEBER OFFER
// ==================================================

socket.on(
  'webrtc:offer',
  async data => {

    if (isBroadcaster) {
      return;
    }


    const senderId =
      data?.senderId;

    const offer =
      data?.offer;


    if (
      !senderId ||
      !offer
    ) {
      return;
    }


    try {

      closePeer(
        senderId
      );


      const peer =
        new RTCPeerConnection(
          rtcConfig
        );


      peerConnections.set(
        senderId,
        peer
      );


      peer.ontrack =
        event => {

          if (
            event.streams &&
            event.streams[0]
          ) {

            remoteVideo.srcObject =
              event.streams[0];


            remoteWaiting.classList.add(
              'hidden'
            );


            watchVideoArea.classList.remove(
              'hidden'
            );


            isWatching =
              true;


            remoteVideo
              .play()
              .then(
                () => {
                  updatePlayerButtons();
                }
              )
              .catch(
                () => {
                  updatePlayerButtons();
                }
              );
          }
        };


      peer.onicecandidate =
        event => {

          if (
            event.candidate
          ) {

            socket.emit(
              'webrtc:ice-candidate',
              {
                targetId:
                  senderId,

                candidate:
                  event.candidate
              }
            );
          }
        };


      peer.onconnectionstatechange =
        () => {

          console.log(
            '[ScreenRoom] Espectador:',
            peer.connectionState
          );


          if (
            peer.connectionState ===
            'failed'
          ) {

            remoteWaiting.classList.remove(
              'hidden'
            );

            remoteWaiting.textContent =
              'A conexão falhou.';
          }
        };


      await peer.setRemoteDescription(
        new RTCSessionDescription(
          offer
        )
      );


      const answer =
        await peer.createAnswer();


      await peer.setLocalDescription(
        answer
      );


      socket.emit(
        'webrtc:answer',
        {
          targetId:
            senderId,

          answer:
            peer.localDescription
        }
      );

    } catch (error) {

      console.error(
        '[ScreenRoom] Erro no offer:',
        error
      );

      watchError.textContent =
        'Erro ao conectar à transmissão.';
    }
  }
);


// ==================================================
// RECEBER ANSWER
// ==================================================

socket.on(
  'webrtc:answer',
  async data => {

    if (!isBroadcaster) {
      return;
    }


    const senderId =
      data?.senderId;

    const answer =
      data?.answer;


    if (
      !senderId ||
      !answer
    ) {
      return;
    }


    const peer =
      peerConnections.get(
        senderId
      );


    if (!peer) {
      return;
    }


    try {

      await peer.setRemoteDescription(
        new RTCSessionDescription(
          answer
        )
      );

    } catch (error) {

      console.error(
        '[ScreenRoom] Erro no answer:',
        error
      );
    }
  }
);


// ==================================================
// ICE
// ==================================================

socket.on(
  'webrtc:ice-candidate',
  async data => {

    const senderId =
      data?.senderId;

    const candidate =
      data?.candidate;


    if (
      !senderId ||
      !candidate
    ) {
      return;
    }


    const peer =
      peerConnections.get(
        senderId
      );


    if (!peer) {
      return;
    }


    try {

      await peer.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );

    } catch (error) {

      console.error(
        '[ScreenRoom] Erro ICE:',
        error
      );
    }
  }
);


// ==================================================
// ENTRAR EM SALA
// ==================================================

joinRoomButton.addEventListener(
  'click',
  () => {

    showScreen(
      joinScreen
    );

    streamUrlInput.focus();
  }
);


joinBackButton.addEventListener(
  'click',
  () => {

    showScreen(
      homeScreen
    );
  }
);


connectWatchButton.addEventListener(
  'click',
  connectToStream
);


streamUrlInput.addEventListener(
  'keydown',
  event => {

    if (
      event.key ===
      'Enter'
    ) {

      connectToStream();
    }
  }
);


// ==================================================
// CONECTAR ESPECTADOR
// ==================================================

function connectToStream() {

  watchError.textContent =
    '';


  const value =
    streamUrlInput.value.trim();


  if (!value) {

    watchError.textContent =
      'Cole o link da sala.';

    return;
  }


  let streamId =
    '';


  try {

    const url =
      new URL(
        value,
        window.location.origin
      );


    const parts =
      url.pathname
        .split('/')
        .filter(Boolean);


    const watchIndex =
      parts.indexOf(
        'watch'
      );


    if (
      watchIndex !== -1 &&
      parts[
        watchIndex + 1
      ]
    ) {

      streamId =
        parts[
          watchIndex + 1
        ];
    }

  } catch (_) {

    streamId =
      value;
  }


  streamId =
    streamId
      .trim()
      .toUpperCase();


  if (!streamId) {

    watchError.textContent =
      'Link inválido.';

    return;
  }


  showScreen(
    watchScreen
  );


  watchStreamId.textContent =
    `SALA ${streamId}`;


  remoteWaiting.classList.remove(
    'hidden'
  );


  remoteWaiting.textContent =
    'Conectando à transmissão...';


  watchVideoArea.classList.remove(
    'hidden'
  );


  socket.emit(
    'stream:watch',
    {
      streamId
    }
  );


  console.log(
    '[ScreenRoom] Entrando na sala:',
    streamId
  );
}


// ==================================================
// CONFIRMAÇÃO DE ENTRADA
// ==================================================

socket.on(
  'stream:watching',
  data => {

    currentRoomId =
      data.id;

    isWatching =
      true;

    console.log(
      '[ScreenRoom] Assistindo:',
      currentRoomId
    );
  }
);


// ==================================================
// ERRO DA SALA
// ==================================================

socket.on(
  'stream:error',
  data => {

    watchError.textContent =
      data?.message ||
      'Não foi possível entrar na sala.';


    showScreen(
      joinScreen
    );
  }
);


// ==================================================
// TRANSMISSÃO ENCERRADA
// ==================================================

socket.on(
  'stream:stopped',
  () => {

    closeAllPeers();


    if (remoteVideo) {

      remoteVideo.srcObject =
        null;
    }


    if (isBroadcaster) {

      stopLocalTracks();

      isBroadcaster =
        false;

      currentRoomId =
        null;

      currentRoomLink =
        null;

      roomCode.textContent =
        '';


      showScreen(
        homeScreen
      );

      return;
    }


    isWatching =
      false;


    remoteWaiting.classList.remove(
      'hidden'
    );

    remoteWaiting.textContent =
      'A transmissão foi encerrada.';


    watchError.textContent =
      'A transmissão foi encerrada.';


    showScreen(
      joinScreen
    );
  }
);


// ==================================================
// MICROFONE
// ==================================================

micButton.addEventListener(
  'click',
  async () => {

    try {

      // Já existe microfone
      if (microphoneStream) {

        const tracks =
          microphoneStream.getAudioTracks();


        const currentlyEnabled =
          tracks.some(
            track =>
              track.enabled
          );


        tracks.forEach(
          track => {

            track.enabled =
              !currentlyEnabled;
          }
        );


        micButton.textContent =
          currentlyEnabled
            ? '🔇 Microfone desligado'
            : '🎤 Microfone ligado';


        return;
      }


      microphoneStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });


      const audioTrack =
        microphoneStream.getAudioTracks()[0];


      if (!audioTrack) {
        return;
      }


      // Se já existem conexões,
      // adiciona o microfone e renegocia.

      for (
        const [
          viewerId,
          peer
        ] of peerConnections
      ) {

        const sender =
          peer
            .getSenders()
            .find(
              item =>
                item.track &&
                item.track.kind ===
                  'audio'
            );


        if (sender) {

          await sender.replaceTrack(
            audioTrack
          );

        } else {

          peer.addTrack(
            audioTrack,
            microphoneStream
          );


          try {

            const offer =
              await peer.createOffer();


            await peer.setLocalDescription(
              offer
            );


            socket.emit(
              'webrtc:offer',
              {
                targetId:
                  viewerId,

                offer:
                  peer.localDescription
              }
            );

          } catch (error) {

            console.error(
              '[ScreenRoom] Erro ao adicionar microfone:',
              error
            );
          }
        }
      }


      micButton.textContent =
        '🎤 Microfone ligado';

    } catch (error) {

      console.error(
        '[ScreenRoom] Microfone:',
        error
      );


      alert(
        'Não foi possível acessar o microfone.'
      );
    }
  }
);


// ==================================================
// PARAR TRANSMISSÃO
// ==================================================

stopStreamButton.addEventListener(
  'click',
  () => {

    stopBroadcast();
  }
);


function stopBroadcast() {

  if (!isBroadcaster) {
    return;
  }


  socket.emit(
    'stream:stop'
  );


  stopLocalTracks();


  closeAllPeers();


  isBroadcaster =
    false;

  isWatching =
    false;


  currentRoomId =
    null;

  currentRoomLink =
    null;


  localVideo.srcObject =
    null;


  videoPlaceholder.classList.remove(
    'hidden'
  );


  startBroadcastButton.disabled =
    false;

  startBroadcastButton.textContent =
    '🖥️ Transmitir tela';


  generateLinkButton.disabled =
    false;

  generateLinkButton.textContent =
    '🔗 Gerar link';


  shareLinkArea.classList.add(
    'hidden'
  );


  viewerCount.textContent =
    '0';


  showScreen(
    homeScreen
  );
}


function stopLocalTracks() {

  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

    localStream =
      null;
  }


  if (microphoneStream) {

    microphoneStream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

    microphoneStream =
      null;
  }
}


// ==================================================
// SAIR DA SALA
// ==================================================

leaveRoomButton.addEventListener(
  'click',
  () => {

    if (isBroadcaster) {

      const confirmLeave =
        window.confirm(
          'Deseja encerrar a sala?'
        );


      if (!confirmLeave) {
        return;
      }


      socket.emit(
        'stream:stop'
      );

      stopLocalTracks();

      closeAllPeers();

      isBroadcaster =
        false;

    } else {

      closeAllPeers();
    }


    currentRoomId =
      null;

    currentRoomLink =
      null;


    showScreen(
      homeScreen
    );
  }
);


// ==================================================
// PLAYER - PLAY / PAUSE
// ==================================================

playPauseButton.addEventListener(
  'click',
  async () => {

    if (!remoteVideo.srcObject) {
      return;
    }


    try {

      if (
        remoteVideo.paused
      ) {

        await remoteVideo.play();

      } else {

        remoteVideo.pause();
      }

      updatePlayerButtons();

    } catch (error) {

      console.error(
        '[ScreenRoom] Player:',
        error
      );
    }
  }
);


// ==================================================
// PLAYER - MUTE
// ==================================================

muteButton.addEventListener(
  'click',
  () => {

    remoteVideo.muted =
      !remoteVideo.muted;

    updatePlayerButtons();
  }
);


// ==================================================
// PLAYER - VOLUME
// ==================================================

volumeSlider.addEventListener(
  'input',
  () => {

    const volume =
      Number(
        volumeSlider.value
      );


    remoteVideo.volume =
      volume;


    if (
      volume === 0
    ) {

      remoteVideo.muted =
        true;

    } else {

      remoteVideo.muted =
        false;
    }


    updatePlayerButtons();
  }
);


// ==================================================
// PLAYER - TELA CHEIA
// ==================================================

fullscreenButton.addEventListener(
  'click',
  async () => {

    try {

      if (
        document.fullscreenElement
      ) {

        await document.exitFullscreen();

        return;
      }


      if (
        watchPlayer.requestFullscreen
      ) {

        await watchPlayer.requestFullscreen();

      } else if (
        remoteVideo.webkitEnterFullscreen
      ) {

        remoteVideo.webkitEnterFullscreen();
      }

    } catch (error) {

      console.error(
        '[ScreenRoom] Tela cheia:',
        error
      );
    }
  }
);


// ==================================================
// ATUALIZAR BOTÕES DO PLAYER
// ==================================================

function updatePlayerButtons() {

  playPauseButton.textContent =
    remoteVideo.paused
      ? '▶'
      : '⏸';


  muteButton.textContent =
    remoteVideo.muted ||
    remoteVideo.volume === 0
      ? '🔇'
      : '🔊';
}


remoteVideo.addEventListener(
  'play',
  updatePlayerButtons
);

remoteVideo.addEventListener(
  'pause',
  updatePlayerButtons
);


// ==================================================
// PEERS
// ==================================================

function closePeer(
  id
) {

  const peer =
    peerConnections.get(
      id
    );


  if (peer) {

    try {
      peer.close();
    } catch (_) {}
  }


  peerConnections.delete(
    id
  );
}


function closeAllPeers() {

  peerConnections.forEach(
    peer => {

      try {
        peer.close();
      } catch (_) {}

    }
  );


  peerConnections.clear();
}


// ==================================================
// ESCAPE HTML
// ==================================================

function escapeHtml(
  value
) {

  return String(
    value ?? ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );
}


// ==================================================
// SOCKET
// ==================================================

socket.on(
  'connect',
  () => {

    console.log(
      '[ScreenRoom] Conectado:',
      socket.id
    );
  }
);


socket.on(
  'disconnect',
  () => {

    console.log(
      '[ScreenRoom] Socket desconectado.'
    );
  }
);
