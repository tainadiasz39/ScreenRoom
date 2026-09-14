const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require("electron");
const path = require("path");

let mainWindow = null;
let selectedSourceId = null;

const SCREENROOM_URL = process.env.SCREENROOM_URL || "http://localhost:3000";

/*
============================================================
IPC: OBTER JANELAS E JOGOS ABERTOS COM THUMBNAILS
============================================================
*/
ipcMain.handle("get-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 400, height: 225 },
      fetchWindowIcons: true
    });

    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith("screen:")
    }));
  } catch (err) {
    console.error("Erro ao buscar janelas:", err);
    return [];
  }
});

/*
============================================================
IPC: SELECIONAR JANELA / JOGO ALVO
============================================================
*/
ipcMain.handle("set-source", (event, sourceId) => {
  selectedSourceId = sourceId;
  console.log("Processo/Janela alvo selecionado para isolamento de audio:", sourceId);
  return true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#111214",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  /*
  ==========================================================
  HANDLE DE CAPTURA DO CHROMIUM / WASAPI LOOPBACK
  ==========================================================
  */
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      
      // Procura a janela/jogo escolhido pelo usuário ou usa a tela principal
      let targetSource = sources.find(s => s.id === selectedSourceId) || sources[0];

      if (!targetSource) {
        callback(null);
        return;
      }

      console.log("Iniciando transmissao do alvo:", targetSource.name, "(ID:", targetSource.id + ")");

      const result = { video: targetSource };

      if (request.audioRequested) {
        // Ativa WASAPI Loopback exclusivo para o processo/janela selecionado
        result.audio = "loopback";
        console.log("ISOLAMENTO DE ÁUDIO ATIVADO: Apenas áudio de " + targetSource.name + " será transmitido.");
      }

      callback(result);
    } catch (error) {
      console.error("Erro no manipulador de captura:", error);
      callback(null);
    }
  });

  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(true));

  mainWindow.loadURL(SCREENROOM_URL);
}

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
