const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  runBacktest: (payload) => ipcRenderer.invoke("run-backtest", payload),
  stockInsight: (payload) => ipcRenderer.invoke("stock-insight", payload)
});
