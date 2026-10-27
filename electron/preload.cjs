const { contextBridge, ipcRenderer } = require('electron');

// the only native feature the web app gets: DSC certificate listing and signing
contextBridge.exposeInMainWorld('dsc', {
  list: () => ipcRenderer.invoke('dsc:list'),
  sign: (thumbprint, data, pin) => ipcRenderer.invoke('dsc:sign', thumbprint, data, pin),
});
