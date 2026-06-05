import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Tickers
  getTickers: () => ipcRenderer.invoke('tickers:get'),

  // Sources
  getSources: () => ipcRenderer.invoke('sources:get'),
  addSource: (data) => ipcRenderer.invoke('sources:add', data),
  removeSource: (id) => ipcRenderer.invoke('sources:remove', { id }),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (data) => ipcRenderer.invoke('settings:set', data),

  // Analysis — invoke
  startAnalysis: (ticker) => ipcRenderer.invoke('analysis:start', { ticker }),
  confirmAnalysis: () => ipcRenderer.send('analysis:confirm'),
  cancelAnalysis: () => ipcRenderer.send('analysis:cancel'),

  // Analysis — push events from main → renderer
  onAnalysisStatus: (cb) => ipcRenderer.on('analysis:status', (_, d) => cb(d)),
  onAnalysisTokenEstimate: (cb) => ipcRenderer.on('analysis:token-estimate', (_, d) => cb(d)),
  onAnalysisResult: (cb) => ipcRenderer.on('analysis:result', (_, d) => cb(d)),
  onAnalysisError: (cb) => ipcRenderer.on('analysis:error', (_, d) => cb(d)),

  // Remove all analysis listeners (call on unmount / new analysis)
  offAnalysis: () => {
    for (const ch of ['analysis:status', 'analysis:token-estimate', 'analysis:result', 'analysis:error']) {
      ipcRenderer.removeAllListeners(ch)
    }
  }
})
