import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import Store from 'electron-store'
import { runPipeline, estimateTokens } from './pipeline.js'

if (process.env.LENS_USER_DATA) app.setPath('userData', process.env.LENS_USER_DATA)
const store = new Store()
const sessionFiles = new Map()   // id → { id, name, type, buffer, addedAt }

// ── Confirmation gate ─────────────────────────────────────────────────────────
// The pipeline pauses after emitting the token estimate and waits for the
// renderer to send analysis:confirm or analysis:cancel.

let pendingConfirmation = null

function waitForConfirmation() {
  // Cancel any in-flight confirmation from a previous run
  pendingConfirmation?.reject(new Error('superseded'))
  return new Promise((resolve, reject) => {
    pendingConfirmation = { resolve, reject }
  })
}

// ── Ticker CSV ────────────────────────────────────────────────────────────────

function parseTickers(filePath) {
  const text = readFileSync(filePath, 'utf-8')
  return text.trim().split('\n')
    .slice(1)
    .filter(line => line && !line.startsWith('File Creation Time'))
    .map(line => {
      const parts = line.split('|')
      return { symbol: parts[0]?.trim(), name: parts[1]?.trim() }
    })
    .filter(t => t.symbol && t.name)
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#141414',
    icon: join(app.getAppPath(), 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  let tickers = []
  try {
    tickers = parseTickers(join(app.getAppPath(), 'resources/nasdaqlisted.txt'))
  } catch (e) {
    console.error('Failed to load ticker file:', e.message)
  }

  // Tickers
  ipcMain.handle('tickers:get', () => tickers)

  // Sources
  ipcMain.handle('sources:get', () => ({
    urls: store.get('sources', []),
    files: Array.from(sessionFiles.values()).map(({ buffer, ...meta }) => meta)
  }))

  ipcMain.handle('sources:add', (_, { type, value, name, buffer }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const addedAt = new Date().toISOString()
    if (type === 'url') {
      const entry = { id, type: 'url', value, addedAt }
      store.set('sources', [...store.get('sources', []), entry])
      return entry
    }
    if (type === 'file') {
      const entry = { id, type: 'file', name, addedAt }
      sessionFiles.set(id, { ...entry, buffer })
      return entry
    }
  })

  ipcMain.handle('sources:remove', (_, { id }) => {
    const urls = store.get('sources', [])
    const filtered = urls.filter(s => s.id !== id)
    if (filtered.length !== urls.length) {
      store.set('sources', filtered)
      return true
    }
    return sessionFiles.delete(id)
  })

  // Settings
  ipcMain.handle('settings:get', () => ({
    apiKey: store.get('apiKey', ''),
    knowledgeHorizon: store.get('knowledgeHorizon', null)
  }))

  ipcMain.handle('settings:set', (_, { apiKey, knowledgeHorizon }) => {
    if (apiKey !== undefined) store.set('apiKey', apiKey)
    if (knowledgeHorizon !== undefined) store.set('knowledgeHorizon', knowledgeHorizon)
  })

  // Analysis
  ipcMain.handle('analysis:start', (event, { ticker }) => {
    runPipeline(event.sender, ticker, { store, sessionFiles, waitForConfirmation })
    return { started: true }
  })

  ipcMain.on('analysis:confirm', () => {
    pendingConfirmation?.resolve()
    pendingConfirmation = null
  })

  ipcMain.on('analysis:cancel', () => {
    pendingConfirmation?.reject(new Error('User cancelled'))
    pendingConfirmation = null
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
