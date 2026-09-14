const {
  app,
  BrowserWindow,
  session,
  desktopCapturer
} = require("electron");

let mainWindow = null;

const SCREENROOM_URL =
  process.env.SCREENROOM_URL ||
  "https://screenroom-nsvt.onrender.com";


/*
============================================================
CRIA JANELA
============================================================
*/

function createWindow() {

  mainWindow = new BrowserWindow({

    width: 1440,
    height: 900,

    minWidth: 1000,
    minHeight: 650,

    backgroundColor: "#111214",

    autoHideMenuBar: true,

    webPreferences: {

      nodeIntegration: false,

      contextIsolation: true,

      backgroundThrottling: false

    }

  });


  /*
  ==========================================================
  CAPTURA DE TELA
  ==========================================================
  */

  session.defaultSession.setDisplayMediaRequestHandler(

    async (request, callback) => {

      try {

        console.log("");
        console.log("================================");
        console.log("SCREENROOM - PEDIDO DE CAPTURA");
        console.log("================================");

        console.log(
          "Video solicitado:",
          request.videoRequested
        );

        console.log(
          "Audio solicitado:",
          request.audioRequested
        );


        /*
        ------------------------------------------------------
        PEGA AS TELAS DISPONÍVEIS
        ------------------------------------------------------
        */

        const sources =
          await desktopCapturer.getSources({

            types: ["screen"],

            thumbnailSize: {
              width: 320,
              height: 180
            }

          });


        if (!sources || sources.length === 0) {

          console.error(
            "Nenhuma tela encontrada."
          );

          callback(null);

          return;
        }


        /*
        ------------------------------------------------------
        PRIMEIRA TELA
        ------------------------------------------------------
        */

        const selectedScreen =
          sources[0];


        console.log(
          "Tela escolhida:",
          selectedScreen.name
        );

        console.log(
          "ID:",
          selectedScreen.id
        );


        const result = {

          video: selectedScreen

        };


        /*
        ------------------------------------------------------
        AUDIO DO WINDOWS
        ------------------------------------------------------

        loopback = áudio que está saindo do computador.

        Isso permite capturar:
        - jogo
        - música
        - navegador
        - Discord
        - sons do Windows
        ------------------------------------------------------
        */

        if (request.audioRequested) {

          result.audio = "loopback";

          console.log(
            "ÁUDIO DO SISTEMA: ATIVADO"
          );

        } else {

          console.log(
            "ÁUDIO NÃO FOI SOLICITADO"
          );

        }


        callback(result);


      } catch (error) {

        console.error(
          "ERRO NA CAPTURA:",
          error
        );

        callback(null);

      }

    }

  );


  /*
  ==========================================================
  PERMISSÕES
  ==========================================================
  */

  session.defaultSession.setPermissionCheckHandler(

    (
      webContents,
      permission,
      requestingOrigin
    ) => {

      return true;

    }

  );


  session.defaultSession.setPermissionRequestHandler(

    (
      webContents,
      permission,
      callback
    ) => {

      callback(true);

    }

  );


  /*
  ==========================================================
  CARREGA O SERVIDOR RENDER
  ==========================================================
  */

  mainWindow.loadURL(
    SCREENROOM_URL
  );


  /*
  ==========================================================
  ERROS
  ==========================================================
  */

  mainWindow.webContents.on(
    "render-process-gone",
    (event, details) => {

      console.error(
        "Renderer encerrado:",
        details
      );

    }
  );

}


/*
============================================================
OTIMIZAÇÕES
============================================================
*/

app.commandLine.appendSwitch(
  "enable-gpu-rasterization"
);

app.commandLine.appendSwitch(
  "enable-zero-copy"
);

app.commandLine.appendSwitch(
  "ignore-gpu-blocklist"
);


/*
============================================================
INICIAR
============================================================
*/

app.whenReady().then(() => {

  createWindow();

});


/*
============================================================
FECHAR
============================================================
*/

app.on(
  "window-all-closed",
  () => {

    if (
      process.platform !== "darwin"
    ) {

      app.quit();

    }

  }
);

