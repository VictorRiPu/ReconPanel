// Preload: expone únicamente lo imprescindible al renderer, de forma segura
// (contextIsolation activo). Por ahora solo la versión de Electron.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("reconpanel", {
  versions: process.versions.electron,
});
