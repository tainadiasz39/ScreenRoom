/* Screen Room - cliente WebRTC + Socket.IO */

const socket = io();

const $ = (id) => document.getElementById(id);

const state = {
    me: null,
    room: null,
    peers: new Map(),
    localStream: null,
    profiles: new Map(),
    pendingCandidates: new Map()
};

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

const roomCss = document.createElement('style');

roomCss.textContent = `
#dashboard[hidden],
#roomView[hidden] {
    display: none !important;
}

body {
    height: 100vh;
    overflow: hidden;
}

#dashboard {
    height: 100vh;
    overflow: hidden;
}

.content {
    margin: 0 auto;
    overflow: auto;
}

.roomShell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    height: calc(100vh - 66px);
    padding-bottom: 65px;
    overflow: hidden;
}

.roomShell .streams {
    min-height: 0;
    padding: 18px;
    overflow: auto;
}

.chatPanel {
    background: #151b27;
    border-left: 1px solid #2b3445;
    padding: 16px;
    display: flex;
    flex-direction: column;
}

.chatPanel h3 {
    font-size: 12px;
    letter-spacing: 1px;
    color: #aeb8cf;
    margin: 3px 0 14px;
}

.messages {
    flex: 1;
    overflow: auto;
    min-height: 250px;
}

.muted {
    color: #9da8bb;
}

.message {
    background: #202838;
    border-radius: 8px;
    padding: 9px;
    margin: 0 0 9px;
    font-size: 13px;
    line-height: 1.35;
}

.message b {
    display: block;
    color: #cdd3ff;
}

.message span {
    display: block;
    color: #8f9bb4;
    font-size: 11px;
    margin-bottom: 4px;
}

#chatForm {
    display: flex;
    gap: 7px;
    border-top: 1px solid #2b3445;
    padding-top: 12px;
}

#chatInput {
    min-width: 0;
    flex: 1;
    margin: 0;
}

#chatForm button {
    padding: 8px 10px;
}

.shareHero {
    grid-column: 1 / -1;
    align-self: center;
    justify-self: center;
    text-align: center;
    width: min(460px, 90%);
    padding: 38px 30px;
    border: 1px solid #33415d;
    border-radius: 16px;
    background: linear-gradient(145deg, #1c263a, #141a28);
}

.shareHero i {
    display: block;
    font-style: normal;
    font-size: 48px;
    margin-bottom: 12px;
}

.shareHero h3 {
    margin: 0;
    font-size: 22px;
}

.shareHero p {
    color: #aeb8cf;
    margin: 10px 0 24px;
}

.shareHero button {
    font-size: 16px;
    padding: 12px 18px;
}

.participants {
    max-height: 150px;
    overflow: auto;
    border-bottom: 1px solid #2b3445;
    margin-bottom: 14px;
}

.participant {
    padding: 7px 0;
    font-size: 13px;
}

.participant small {
    display: block;
    color: #9da8bb;
    margin-left: 20px;
}

#toast {
    position: fixed;
    right: 18px;
    top: 18px;
    z-index: 20;
    max-width: 320px;
    background: #27345a;
    border: 1px solid #7181ff;
    border-radius: 9px;
    padding: 12px 15px;
    color: #fff;
    box-shadow: 0 10px 28px #0008;
}

footer select {
    margin-left: 6px;
    background: #111722;
    color: #fff;
    border: 1px solid #3a4357;
    border-radius: 6px;
    padding: 5px;
}

#sourceDialog {
    width: min(960px, 96vw);
    max-width: 96vw;
    padding: 0;
    border: 0;
    background: transparent;
}

#sourceDialog .picker {
    width: 100%;
    max-height: 88vh;
    padding: 24px;
}

#sourceDialog .sourceList {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    max-height: 62vh;
    overflow-y: auto;
    padding: 2px 4px 8px 2px;
}

#sourceDialog .source {
    border-radius: 10px;
    min-height: 190px;
}

#sourceDialog .source span {
    line-height: 1.45;
}

#sourceDialog .source small {
    font-weight: 400;
}

#sourceDialog .picker header p {
    margin: 7px 0 0;
    color: #aab4c7;
}

#confirmShareDialog {
    width: min(500px, 92vw);
    border: 1px solid #3a4660;
    border-radius: 14px;
    padding: 0;
    background: #151b27;
    color: #fff;
}

#confirmShareDialog .confirmBox {
    padding: 24px;
}

#confirmShareDialog h3 {
    margin-top: 0;
}

#confirmShareName {
    color: #aeb8cf;
    word-break: break-word;
    margin: 14px 0 20px;
}

.confirmButtons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.confirmButtons button {
    padding: 10px 16px;
}

.confirmCancel {
    background: #252d3d;
}

.confirmStart {
    background: #5367ff;
}

.watchButton {
    margin-top: 8px;
    padding: 8px 14px;
    cursor: pointer;
}

.stream video {
    width: 100%;
    max-height: 70vh;
    background: #05070b;
    border-radius: 10px;
}

.streamActions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.streamActions button {
    padding: 7px 12px;
}

@media (max-width: 800px) {
    body {
        overflow: auto;
    }

    .roomShell {
        grid-template-columns: 1fr;
        height: auto;
        min-height: calc(100vh - 66px);
    }

    .chatPanel {
        border-left: 0;
        border-top: 1px solid #2b3445;
        min-height: 230px;
    }

    .roomShell .streams {
        min-height: 400px;
    }
}
`;

document.head.append(roomCss);

function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
}

function show(id) {
    const element = $(id);
    if (element) {
        element.hidden = false;
    }
}

function hide(id) {
    const element = $(id);
    if (element) {
        element.hidden = true;
    }
}

function setError(id, message = '') {
    const element = $(id);
    if (element) {
        element.textContent = message;
    }
}

function notify(message) {
    const toast = $('toast');

    if (!toast) {
        window.alert(message);
        return;
    }

    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
        toast.hidden = true;
    }, 4000);
}

function sendSignal(to, data) {
    socket.emit('signal', {
        to,
        data
    });
}

function getPeer(id) {
    return state.peers.get(id);
}

/* =========================
   LOGIN
========================= */

$('enter').onclick = () => {
    setError('profileError');

    socket.emit(
        'register',
        {
            username: $('username').value,
            displayName: $('displayName').value
        },
        (result) => {
            if (!result.ok) {
                setError('profileError', result.error);
                return;
            }

            state.me = {
                id: result.id,
                username: $('username').value.replace(/^@/, ''),
                displayName: $('displayName').value
            };

            $('meName').textContent = state.me.displayName;
            $('meUser').textContent = '@' + state.me.username;

            hide('profile');
            show('dashboard');

            renderPresence(result.users);
            renderRooms(result.rooms);
        }
    );
};

/* =========================
   SALAS
========================= */

$('newRoom').onclick = () => {
    setError('roomError');
    $('roomDialog').showModal();
};

$('createRoom').onclick = (event) => {
    event.preventDefault();

    setError('roomError');

    socket.emit(
        'create-room',
        {
            name: $('newRoomName').value,
            password: $('newRoomPassword').value,
            mode: $('newRoomMode').value
        },
        (result) => {
            if (!result.ok) {
                setError('roomError', result.error);
                return;
            }

            $('roomDialog').close();
            joinRoom(result.room);
        }
    );
};

$('back').onclick = () => leaveCurrentRoom();

/* =========================
   COMPARTILHAMENTO
========================= */

$('shareScreen').onclick = () => startShare();

$('stopShare').onclick = () => stopShare();

$('muteAudio').onclick = () => {
    const track = state.localStream?.getAudioTracks()[0];

    if (!track) {
        return;
    }

    track.enabled = !track.enabled;

    $('muteAudio').textContent = track.enabled
        ? '🔊 Áudio'
        : '🔇 Áudio silenciado';
};

$('pauseVideo').onclick = () => {
    const track = state.localStream?.getVideoTracks()[0];

    if (!track) {
        return;
    }

    track.enabled = !track.enabled;

    $('pauseVideo').textContent = track.enabled
        ? '⏸ Pausar tela'
        : '▶ Retomar tela';
};

$('quality').onchange = () => applyQuality();

$('closePicker').onclick = () => {
    const dialog = $('sourceDialog');

    if (dialog?.open) {
        dialog.close();
    }
};

/* =========================
   CHAT
========================= */

$('chatForm').onsubmit = (event) => {
    event.preventDefault();

    const input = $('chatInput');

    if (!state.room || !input.value.trim()) {
        return;
    }

    socket.emit('chat-message', {
        roomId: state.room.id,
        text: input.value
    });

    input.value = '';
};

/* =========================
   SOCKET
========================= */

socket.on('presence', renderPresence);

socket.on('rooms', renderRooms);

socket.on('chat-message', (message) => {
    addMessage(message);
});

socket.on('room-access-request', ({ room, user }) => {
    const accepted = window.confirm(
        `${user.displayName} (@${user.username}) quer entrar em “${room.name}”. Aceitar?`
    );

    socket.emit('answer-room-access', {
        roomId: room.id,
        userId: user.id,
        accepted
    });
});

socket.on('room-access-approved', ({ room }) => {
    notify(`Entrada aceita em “${room.name}”.`);

    socket.emit(
        'join-room',
        {
            roomId: room.id,
            password: ''
        },
        (result) => {
            if (result.ok) {
                enterRoom(result);
            } else {
                window.alert(result.error);
            }
        }
    );
});

socket.on('room-access-rejected', ({ room }) => {
    notify(`Seu pedido para “${room.name}” foi recusado.`);
});

socket.on('participant-joined', async (profile) => {
    state.profiles.set(profile.id, profile);

    updateMemberCount();

    notify(`${profile.displayName} entrou na sala.`);

    if (state.localStream) {
        try {
            await createOffer(profile.id);
        } catch (error) {
            console.warn(
                'Não foi possível iniciar conexão com novo participante:',
                error
            );
        }
    }
});

socket.on('participant-left', ({ id }) => {
    const profile = state.profiles.get(id);

    closePeer(id);

    updateMemberCount();

    if (profile) {
        notify(`${profile.displayName} saiu da sala.`);
    }
});

/* =========================
   WEBRTC SIGNALING
========================= */

socket.on('signal', async ({ from, data }) => {
    try {
        const pc = ensurePeer(from);

        if (data.type === 'offer') {
            await pc.setRemoteDescription(data);

            await flushPendingCandidates(from);

            const answer = await pc.createAnswer();

            await pc.setLocalDescription(answer);

            sendSignal(from, pc.localDescription);

            return;
        }

        if (data.type === 'answer') {
            await pc.setRemoteDescription(data);

            await flushPendingCandidates(from);

            return;
        }

        if (data.candidate) {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(data);
            } else {
                queueCandidate(from, data);
            }
        }
    } catch (error) {
        console.warn('WebRTC signal failed:', error);
    }
});

function queueCandidate(id, candidate) {
    if (!state.pendingCandidates.has(id)) {
        state.pendingCandidates.set(id, []);
    }

    state.pendingCandidates.get(id).push(candidate);
}

async function flushPendingCandidates(id) {
    const candidates = state.pendingCandidates.get(id);

    if (!candidates?.length) {
        return;
    }

    const pc = getPeer(id);

    if (!pc) {
        return;
    }

    for (const candidate of candidates) {
        try {
            await pc.addIceCandidate(candidate);
        } catch (error) {
            console.warn('ICE candidate failed:', error);
        }
    }

    state.pendingCandidates.delete(id);
}

/* =========================
   PRESENÇA
========================= */

function renderPresence(users) {
    $('onlineCount').textContent = users.length;

    $('online').innerHTML = users
        .map(
            (user) =>
                `<div class="person">
                    🟢 ${escapeHtml(user.displayName)}
                    <small>@${escapeHtml(user.username)}</small>
                </div>`
        )
        .join('');
}

/* =========================
   LISTA DE SALAS
========================= */

function renderRooms(rooms) {
    if (!state.me) {
        return;
    }

    $('roomsCount').textContent = rooms.length;

    $('roomList').innerHTML = rooms.length
        ? rooms
              .map(
                  (room) =>
                      `<article class="room">
                          <h3>${escapeHtml(room.name)}</h3>
                          <p>
                              ${
                                  room.locked
                                      ? '🔒 Senha necessária · '
                                      : 'Aberta · '
                              }
                              ${
                                  room.mode === 'multi'
                                      ? 'Vários transmissores'
                                      : 'Um transmissor'
                              }
                              <br>
                              ${room.count} participante(s)
                          </p>

                          <button
                              data-room="${room.id}"
                              data-locked="${room.locked}"
                          >
                              Entrar
                          </button>
                      </article>`
              )
              .join('')
        : '<div class="empty">Ainda não há salas. Crie a primeira.</div>';

    document.querySelectorAll('[data-room]').forEach((button) => {
        button.onclick = () => {
            const password =
                button.dataset.locked === 'true'
                    ? window.prompt('Senha da sala:')
                    : '';

            if (
                button.dataset.locked === 'true' &&
                password === null
            ) {
                return;
            }

            socket.emit(
                'join-room',
                {
                    roomId: button.dataset.room,
                    password
                },
                (result) => {
                    if (result.ok) {
                        enterRoom(result);
                        return;
                    }

                    if (
                        result.canRequest &&
                        window.confirm(
                            'Senha incorreta. Quer pedir autorização ao criador da sala?'
                        )
                    ) {
                        socket.emit('request-room-access', {
                            roomId: button.dataset.room
                        });

                        notify(
                            'Pedido enviado ao criador da sala.'
                        );
                    } else {
                        window.alert(result.error);
                    }
                }
            );
        };
    });
}

function joinRoom(room) {
    socket.emit(
        'join-room',
        {
            roomId: room.id,
            password: $('newRoomPassword').value
        },
        (result) => {
            if (result.ok) {
                enterRoom(result);
            } else {
                window.alert(result.error);
            }
        }
    );
}

/* =========================
   ENTRAR NA SALA
========================= */

async function enterRoom(result) {
    state.room = result.room;

    state.profiles.clear();

    hide('dashboard');
    show('roomView');

    $('roomName').textContent = result.room.name;

    $('roomMeta').textContent =
        result.room.mode === 'multi'
            ? 'Vários transmissores'
            : 'Um transmissor';

    if (result.room.locked) {
        $('roomMeta').textContent += ' · 🔒 Protegida';
    }

    $('messages').innerHTML =
        '<p class="muted">Boas-vindas à sala.</p>';

    $('streams').innerHTML = `
        <section class="shareHero">
            <i>🖥️</i>
            <h3>Pronto para compartilhar?</h3>
            <p>
                Escolha uma tela inteira, uma janela, um jogo ou o navegador.
            </p>
            <button id="heroShare">
                Compartilhar tela
            </button>
        </section>
    `;

    $('heroShare').onclick = () => startShare();

    for (const profile of result.members) {
        state.profiles.set(profile.id, profile);
    }

    for (const profile of result.members) {
        try {
            await createOffer(profile.id);
        } catch (error) {
            console.warn(
                'Falha ao criar oferta:',
                error
            );
        }
    }

    updateMemberCount();

    const recent = JSON.parse(
        localStorage.getItem('screen-room-recent') || '[]'
    ).filter((room) => room.id !== result.room.id);

    recent.unshift({
        id: result.room.id,
        name: result.room.name
    });

    localStorage.setItem(
        'screen-room-recent',
        JSON.stringify(recent.slice(0, 8))
    );
}

/* =========================
   PARTICIPANTES
========================= */

function updateMemberCount() {
    $('memberCount').textContent =
        `${state.profiles.size + 1} participante(s)`;

    if (!$('participants')) {
        return;
    }

    const profiles = [
        state.me,
        ...state.profiles.values()
    ];

    $('participants').innerHTML = profiles
        .map(
            (profile) =>
                `<div class="participant">
                    🟢 ${escapeHtml(profile.displayName)}

                    <small>
                        @${escapeHtml(profile.username)}
                        ${
                            profile.id === state.me?.id &&
                            state.localStream
                                ? ' · transmitindo'
                                : ''
                        }
                    </small>
                </div>`
        )
        .join('');
}

/* =========================
   CHAT
========================= */

function addMessage(message) {
    const p = document.createElement('p');

    p.className = 'message';

    p.innerHTML =
        `<b>${escapeHtml(message.displayName)}</b>` +
        `<span>@${escapeHtml(message.username)}</span>` +
        escapeHtml(message.text);

    $('messages').append(p);

    $('messages').scrollTop =
        $('messages').scrollHeight;
}

/* =========================
   PEER CONNECTION
========================= */

function ensurePeer(id) {
    if (state.peers.has(id)) {
        const existing = state.peers.get(id);

        if (
            state.localStream &&
            existing.getSenders().length === 0
        ) {
            state.localStream
                .getTracks()
                .forEach((track) => {
                    existing.addTrack(
                        track,
                        state.localStream
                    );
                });
        }

        return existing;
    }

    const pc = new RTCPeerConnection(rtcConfig);

    state.peers.set(id, pc);

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            sendSignal(id, {
                candidate
            });
        }
    };

    pc.ontrack = (event) => {
        if (
            event.streams &&
            event.streams[0]
        ) {
            addRemoteStream(
                id,
                event.streams[0]
            );
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            notify('Conexão estabelecida.');
        }

        if (
            ['failed', 'closed'].includes(
                pc.connectionState
            )
        ) {
            closePeer(id);
        }
    };

    if (state.localStream) {
        state.localStream
            .getTracks()
            .forEach((track) => {
                pc.addTrack(
                    track,
                    state.localStream
                );
            });
    }

    return pc;
}

async function createOffer(id) {
    const pc = ensurePeer(id);

    if (pc.signalingState !== 'stable') {
        return;
    }

    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    sendSignal(id, pc.localDescription);
}

/* =========================
   STREAM REMOTO
========================= */

function addRemoteStream(id, stream) {
    const profile =
        state.profiles.get(id) || {
            displayName: 'Participante',
            username: ''
        };

    let video = document.querySelector(
        `[data-stream="${id}"] video`
    );

    if (!video) {
        const card =
            document.createElement('article');

        card.className = 'stream';
        card.dataset.stream = id;

        card.innerHTML = `
            <video
                autoplay
                playsinline
            ></video>

            <p>
                ${escapeHtml(profile.displayName)}
                <small>
                    @${escapeHtml(profile.username)}
                </small>
            </p>

            <div class="streamActions">
                <button class="watchButton">
                    👀 Assistir transmissão
                </button>
            </div>
        `;

        document
            .querySelectorAll(
                '.empty, .shareHero'
            )
            .forEach((element) =>
                element.remove()
            );

        $('streams').append(card);

        video = card.querySelector('video');

        const watchButton =
            card.querySelector(
                '.watchButton'
            );

        watchButton.onclick =
            async () => {
                try {
                    video.muted = false;

                    await video.play();

                    watchButton.textContent =
                        '▶ Transmissão reproduzindo';

                    watchButton.disabled =
                        true;
                } catch (error) {
                    console.warn(
                        'Não foi possível reproduzir:',
                        error
                    );

                    notify(
                        'Clique novamente em "Assistir transmissão".'
                    );
                }
            };
    }

    video.srcObject = stream;

    if (id === state.me?.id) {
        video.muted = true;
        video.controls = false;

        const button =
            video
                .closest('.stream')
                ?.querySelector(
                    '.watchButton'
                );

        if (button) {
            button.style.display =
                'none';
        }

        return;
    }

    /*
     * Começa mutado para evitar bloqueio
     * automático do navegador.
     */
    video.muted = true;

    video.play().catch(() => {
        /*
         * O usuário poderá clicar em
         * "Assistir transmissão".
         */
    });
}

/* =========================
   INICIAR TRANSMISSÃO
========================= */

async function startShare() {
    setError('shareError');

    if (!state.room) {
        return;
    }

    if (
        state.room.mode === 'single' &&
        state.localStream
    ) {
        return;
    }

    try {
        /*
         * 1. Escolher tela ou janela.
         */
        const source =
            await pickSource();

        if (!source) {
            return;
        }

        /*
         * 2. Confirmar escolha.
         */
        const confirmed =
            await confirmSource(source);

        if (!confirmed) {
            notify(
                'Transmissão cancelada.'
            );
            return;
        }

        /*
         * 3. Avisar o servidor.
         */
        const allowed =
            await new Promise(
                (resolve) => {
                    socket.emit(
                        'start-stream',
                        {
                            roomId:
                                state.room.id
                        },
                        resolve
                    );
                }
            );

        if (!allowed?.ok) {
            setError(
                'shareError',
                allowed?.error ||
                    'Não foi possível iniciar a transmissão.'
            );

            return;
        }

        const video = {
            mandatory: {
                chromeMediaSource:
                    'desktop',

                chromeMediaSourceId:
                    source.id,

                maxWidth: 1280,
                maxHeight: 720,
                maxFrameRate: 20
            }
        };

        const audio = {
            mandatory: {
                chromeMediaSource:
                    'desktop'
            }
        };

        try {
            state.localStream =
                await navigator.mediaDevices.getUserMedia(
                    {
                        audio:
                            $('shareAudio')
                                .checked
                                ? audio
                                : false,

                        video
                    }
                );
        } catch (audioError) {
            if (
                !$('shareAudio').checked
            ) {
                throw audioError;
            }

            state.localStream =
                await navigator.mediaDevices.getUserMedia(
                    {
                        audio: false,
                        video
                    }
                );

            setError(
                'shareError',
                'Esta fonte não oferece áudio; a tela será compartilhada sem áudio.'
            );
        }

        const videoTrack =
            state.localStream
                .getVideoTracks()[0];

        if (videoTrack) {
            videoTrack.onended =
                stopShare;
        }

        /*
         * Mostrar nossa própria transmissão.
         */
        addRemoteStream(
            state.me.id,
            state.localStream
        );

        /*
         * Adicionar as tracks aos peers.
         */
        for (const [id, pc] of state.peers) {
            const existingTrackIds =
                new Set(
                    pc
                        .getSenders()
                        .map(
                            (sender) =>
                                sender.track?.id
                        )
                        .filter(Boolean)
                );

            for (
                const track of
                state.localStream.getTracks()
            ) {
                if (
                    !existingTrackIds.has(
                        track.id
                    )
                ) {
                    pc.addTrack(
                        track,
                        state.localStream
                    );
                }
            }

            await optimizeSender(pc);

            if (
                pc.signalingState ===
                'stable'
            ) {
                await createOffer(id);
            }
        }

        $('shareScreen').disabled =
            true;

        $('stopShare').disabled =
            false;

        $('muteAudio').disabled =
            !state.localStream
                .getAudioTracks()
                .length;

        $('pauseVideo').disabled =
            false;

        updateMemberCount();

        notify(
            'Sua tela está sendo transmitida.'
        );
    } catch (error) {
        console.warn(
            'Erro ao iniciar compartilhamento:',
            error
        );

        socket.emit(
            'stop-stream',
            {
                roomId: state.room.id
            }
        );

        setError(
            'shareError',
            error.name ===
                'NotAllowedError'
                ? 'Compartilhamento cancelado.'
                : error.message
        );
    }
}

/* =========================
   CONFIRMAÇÃO DA FONTE
========================= */

async function confirmSource(source) {
    const dialog =
        $('confirmShareDialog');

    const name =
        $('confirmShareName');

    if (!dialog || !name) {
        return window.confirm(
            `Você escolheu:\n\n${source.name}\n\nDeseja iniciar a transmissão?`
        );
    }

    name.textContent =
        `${
            source.kind === 'screen'
                ? '🖥️ Tela inteira'
                : '▣ Janela'
        }: ${source.name}`;

    return new Promise(
        (resolve) => {
            let finished = false;

            const confirmButton =
                $('confirmShare');

            const cancelButton =
                $('cancelShare');

            const cleanup = () => {
                confirmButton?.removeEventListener(
                    'click',
                    onConfirm
                );

                cancelButton?.removeEventListener(
                    'click',
                    onCancel
                );
            };

            const finish = (value) => {
                if (finished) {
                    return;
                }

                finished = true;

                cleanup();

                if (dialog.open) {
                    dialog.close();
                }

                resolve(value);
            };

            const onConfirm = () =>
                finish(true);

            const onCancel = () =>
                finish(false);

            confirmButton?.addEventListener(
                'click',
                onConfirm
            );

            cancelButton?.addEventListener(
                'click',
                onCancel
            );

            dialog.addEventListener(
                'cancel',
                () => finish(false),
                { once: true }
            );

            dialog.showModal();
        }
    );
}

/* =========================
   ESCOLHER TELA
========================= */

async function pickSource() {
    if (!window.screenRoom?.sources) {
        window.alert(
            'A seleção de tela está disponível somente no aplicativo para Windows.'
        );

        return null;
    }

    const sources =
        await window.screenRoom.sources();

    if (!sources.length) {
        window.alert(
            'Nenhuma tela ou janela disponível para compartilhar.'
        );

        return null;
    }

    const list =
        $('sourceList');

    list.innerHTML = sources
        .map(
            (source, index) =>
                `<button
                    class="source"
                    data-index="${index}"
                >
                    <img
                        src="${source.thumbnail}"
                        alt=""
                    >

                    <span>
                        ${
                            source.kind ===
                            'screen'
                                ? '🖥️ Tela inteira'
                                : '▣ Janela'
                        }

                        <br>

                        <small>
                            ${escapeHtml(
                                source.name
                            )}
                        </small>
                    </span>
                </button>`
        )
        .join('');

    return new Promise(
        (resolve) => {
            const dialog =
                $('sourceDialog');

            let selected = null;

            const finish = () => {
                resolve(selected);
            };

            dialog.addEventListener(
                'close',
                finish,
                {
                    once: true
                }
            );

            list
                .querySelectorAll(
                    '[data-index]'
                )
                .forEach(
                    (button) => {
                        button.onclick =
                            () => {
                                selected =
                                    sources[
                                        Number(
                                            button
                                                .dataset
                                                .index
                                        )
                                    ];

                                dialog.close();
                            };
                    }
                );

            dialog.showModal();
        }
    );
}

/* =========================
   QUALIDADE
========================= */

async function applyQuality() {
    for (
        const pc of state.peers.values()
    ) {
        await optimizeSender(pc);
    }
}

async function optimizeSender(pc) {
    for (
        const sender of pc.getSenders()
    ) {
        if (
            sender.track?.kind !==
            'video'
        ) {
            continue;
        }

        try {
            const parameters =
                sender.getParameters();

            parameters.encodings =
                parameters.encodings?.length
                    ? parameters.encodings
                    : [{}];

            const quality =
                $('quality').value;

            parameters.encodings[0]
                .maxBitrate =
                quality === 'economy'
                    ? 500000
                    : quality === 'high'
                        ? 3000000
                        : 1500000;

            parameters.encodings[0]
                .maxFramerate =
                quality === 'economy'
                    ? 15
                    : quality === 'high'
                        ? 30
                        : 20;

            await sender.setParameters(
                parameters
            );
        } catch (_) {
            /*
             * O navegador usará valores
             * adaptativos.
             */
        }
    }
}

/* =========================
   PARAR TRANSMISSÃO
========================= */

function stopShare() {
    if (!state.localStream) {
        return;
    }

    state.localStream
        .getTracks()
        .forEach((track) =>
            track.stop()
        );

    state.localStream = null;

    if (state.room) {
        socket.emit(
            'stop-stream',
            {
                roomId:
                    state.room.id
            }
        );
    }

    const local =
        document.querySelector(
            `[data-stream="${state.me.id}"]`
        );

    if (local) {
        local.remove();
    }

    /*
     * Remove as tracks e renegocia.
     */
    for (
        const [id, pc] of state.peers
    ) {
        pc
            .getSenders()
            .filter(
                (sender) =>
                    sender.track
            )
            .forEach(
                (sender) => {
                    try {
                        pc.removeTrack(
                            sender
                        );
                    } catch (_) {
                        /*
                         * Sender já removido.
                         */
                    }
                }
            );

        if (
            pc.signalingState ===
            'stable'
        ) {
            createOffer(id).catch(
                (error) => {
                    console.warn(
                        'Falha ao renegociar parada da transmissão:',
                        error
                    );
                }
            );
        }
    }

    $('shareScreen').disabled =
        false;

    $('stopShare').disabled =
        true;

    $('muteAudio').disabled =
        true;

    $('pauseVideo').disabled =
        true;

    $('muteAudio').textContent =
        '🔊 Áudio';

    $('pauseVideo').textContent =
        '⏸ Pausar tela';

    updateMemberCount();

    notify(
        'Transmissão encerrada.'
    );
}

/* =========================
   FECHAR PEER
========================= */

function closePeer(id) {
    const pc =
        state.peers.get(id);

    if (pc) {
        try {
            pc.close();
        } catch (_) {
            /*
             * Já estava fechado.
             */
        }
    }

    state.peers.delete(id);

    state.pendingCandidates.delete(
        id
    );

    state.profiles.delete(id);

    document
        .querySelector(
            `[data-stream="${id}"]`
        )
        ?.remove();
}

/* =========================
   SAIR DA SALA
========================= */

function leaveCurrentRoom() {
    stopShare();

    if (state.room) {
        socket.emit(
            'leave-room',
            {
                roomId:
                    state.room.id
            }
        );
    }

    for (
        const id of [
            ...state.peers.keys()
        ]
    ) {
        closePeer(id);
    }

    state.room = null;

    state.profiles.clear();

    hide('roomView');

    show('dashboard');
}

window.addEventListener(
    'beforeunload',
    () => {
        if (state.room) {
            socket.emit(
                'leave-room',
                {
                    roomId:
                        state.room.id
                }
            );
        }
    }
);
