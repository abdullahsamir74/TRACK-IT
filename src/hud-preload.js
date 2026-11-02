const { contextBridge, ipcRenderer } = require("electron");

const invokeTracker = (methodName, ...args) =>
  ipcRenderer.invoke("service-invoke", "tracker", methodName, ...args);

contextBridge.exposeInMainWorld("hud", {
  // Generic tracker facade access
  invoke: (methodName, ...args) => invokeTracker(methodName, ...args),

  // HUD window lifecycle
  getState: () => ipcRenderer.invoke("hud-get-state"),
  close: () => ipcRenderer.send("hud-close"),
  setExpanded: (expanded) =>
    ipcRenderer.send("hud-set-expanded", Boolean(expanded)),

  // Live updates
  onTimerTick: (callback) => {
    ipcRenderer.removeAllListeners("timer-tick");
    ipcRenderer.on("timer-tick", (event, data) => callback(data));
  },
  onDataChanged: (callback) => {
    ipcRenderer.removeAllListeners("tracker-data-changed");
    ipcRenderer.on("tracker-data-changed", (event, data) => callback(data));
  },
  onTheme: (callback) => {
    ipcRenderer.removeAllListeners("hud-theme");
    ipcRenderer.on("hud-theme", (event, theme) => callback(theme));
  },
});
