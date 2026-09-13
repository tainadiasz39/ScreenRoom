const {
  contextBridge,
  ipcRenderer
} = require('electron');

contextBridge.exposeInMainWorld(
  'screenRoom',
  {
    platform: process.platform,

    sources: () =>
      ipcRenderer.invoke(
        'screen-room:sources'
      ),

    selectSource: sourceId =>
      ipcRenderer.invoke(
        'screen-room:select-source',
        sourceId
      ),

    onWindowResized: callback => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      const listener = () => {
        try {
          callback();
        } catch (error) {
          console.error(
            '[ScreenRoom] Erro no callback de resize:',
            error
          );
        }
      };

      ipcRenderer.on(
        'screen-room:window-resized',
        listener
      );

      return () => {
        ipcRenderer.removeListener(
          'screen-room:window-resized',
          listener
        );
      };
    }
  }
);
