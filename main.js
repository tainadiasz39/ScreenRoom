const {
  app,
  BrowserWindow,
  session,
  desktopCapturer
} = require('electron');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,

    autoHideMenuBar: true,
    backgroundColor: '#1e1f22',

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  /*
   * ==========================================================
   * CAPTURA DE TELA
   * ==========================================================
   *
   * O navegador chama:
   *
   * navigator.mediaDevices.getDisplayMedia()
   *
   * O Electron intercepta o pedido aqui e entrega uma
   * fonte REAL obtida pelo desktopCapturer.
   *
   * No Windows:
   * audio: 'loopback'
   *
   * captura o áudio do sistema/jogo.
   */

  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        console.log('Pedido de captura recebido.');
        console.log('Vídeo solicitado:', request.videoRequested);
        console.log('Áudio solicitado:', request.audioRequested);

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: 320,
            height: 180
          }
        });

        if (!sources || sources.length === 0) {
          console.error('Nenhuma tela encontrada.');
          callback(null);
          return;
        }

        /*
         * Usa a primeira tela encontrada.
         * Depois podemos colocar um seletor para escolher
         * monitor/janela, se você quiser.
         */

        const screen = sources[0];

        console.log('Tela selecionada:', screen.name);
        console.log('ID da tela:', screen.id);

        const result = {
          video: screen
        };

        /*
         * Áudio do sistema somente quando o site pediu áudio.
         * No Windows, loopback captura o som que está saindo
         * pelo computador.
         */

        if (request.audioRequested) {
          result.audio = 'loopback';
          console.log('Áudio do sistema: LOOPBACK ativado.');
        }

        callback(result);

      } catch (error) {
        console.error('ERRO AO CAPTURAR TELA:', error);
        callback(null);
      }
    }
  );

  /*
   * Permissões de mídia.
   */

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      if (
        permission === 'media' ||
        permission === 'display-capture'
      ) {
        return true;
      }

      return true;
    }
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (
        permission === 'media' ||
        permission === 'display-capture'
      ) {
        callback(true);
        return;
      }

      callback(true);
    }
  );

  /*
   * Carrega o ScreenRoom online.
   */

  win.loadURL('https://screenroom-01n7.onrender.com');

  /*
   * DevTools somente se precisar diagnosticar.
   * Deixe comentado normalmente.
   */

  // win.webContents.openDevTools();
}


/*
 * ============================================================
 * OTIMIZAÇÕES
 * ============================================================
 */

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});


/*
 * ============================================================
 * FECHAR
 * ============================================================
 */

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
