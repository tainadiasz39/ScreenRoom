const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  ipcMain
} = require('electron');

const path = require('path');

let mainWindow = null;
let selectedSourceId = null;

const SERVER_URL = 'http://localhost:3000';

function setupDisplayCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        console.log('[ScreenRoom] Solicitação de captura recebida.');
        console.log('[ScreenRoom] Vídeo solicitado:', request.videoRequested);
        console.log('[ScreenRoom] Áudio solicitado:', request.audioRequested);

        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: {
            width: 320,
            height: 180
          },
          fetchWindowIcons: true
        });

        if (!sources.length) {
          console.error('[ScreenRoom] Nenhuma fonte encontrada.');
          callback(null);
          return;
        }

        let source = null;

        if (selectedSourceId) {
          source = sources.find(
            item => item.id === selectedSourceId
          );
        }

        if (!source) {
          source = sources.find(
            item => item.id.startsWith('screen:')
          );
        }

        if (!source) {
          source = sources[0];
        }

        console.log(
          '[ScreenRoom] Fonte selecionada:',
          source.name,
          source.id
        );

        /*
         * Windows:
         * captura o áudio do sistema junto com a tela.
         */
        if (
          process.platform === 'win32' &&
          request.audioRequested
        ) {
          console.log(
            '[ScreenRoom] Entregando vídeo + áudio do sistema.'
          );

          callback({
            video: source,
            audio: 'loopback'
          });

          return;
        }

        console.log(
          '[ScreenRoom] Entregando somente vídeo.'
        );

        callback({
          video: source
        });

      } catch (error) {
        console.error(
          '[ScreenRoom] Erro na captura:',
          error
        );

        callback(null);
      }
    }
  );

  console.log(
    '[ScreenRoom] Captura de tela configurada.'
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,

    minWidth: 980,
    minHeight: 640,

    backgroundColor: '#080d18',

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),

      contextIsolation: true,
      sandbox: true,

      backgroundThrottling: false
    }
  });

  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/*
 * Lista de telas/janelas disponíveis.
 */
ipcMain.handle(
  'screen-room:sources',
  async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],

      thumbnailSize: {
        width: 320,
        height: 180
      },

      fetchWindowIcons: true
    });

    return sources.map(source => ({
      id: source.id,

      name: source.name,

      kind: source.id.startsWith('screen:')
        ? 'screen'
        : 'window',

      thumbnail: source.thumbnail.toDataURL(),

      appIcon: source.appIcon
        ? source.appIcon.toDataURL()
        : null
    }));
  }
);

/*
 * Define qual tela/janela será compartilhada.
 */
ipcMain.handle(
  'screen-room:select-source',
  async (_event, sourceId) => {
    if (
      typeof sourceId !== 'string' ||
      !sourceId.trim()
    ) {
      selectedSourceId = null;

      return {
        success: false
      };
    }

    selectedSourceId = sourceId;

    console.log(
      '[ScreenRoom] Fonte escolhida:',
      selectedSourceId
    );

    return {
      success: true
    };
  }
);

/*
 * Inicialização do Electron.
 */
app.whenReady().then(() => {
  setupDisplayCapture();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/*
 * Fecha o aplicativo quando não houver mais janelas.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
