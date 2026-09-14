const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getSources: () => ipcRenderer.invoke("get-sources"),
  setSource: (sourceId) => ipcRenderer.invoke("set-source", sourceId)
});
