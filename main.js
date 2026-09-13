const { app, BrowserWindow, session } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: "ScreenRoom",
    autoHideMenuBar: true,
    backgroundColor: "#1e1f22", // Cor escura estilo Discord
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Mantém 60 FPS mesmo em segundo plano
    }
  });

  // Habilitar captura de tela e áudio estilo Discord
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    // Permite captura de tela sem restrições
    callback({ video: request.videoRequested, audio: request.audioRequested });
  });

  // Carrega o seu servidor online
  win.loadURL('https://screenroom-01n7.onrender.com');
}

// Otimizações de desempenho para Streaming 60 FPS
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
