const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { execFile } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const pythonCommand = process.platform === "win32" ? "python" : "python3";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

function runBridgeCommand(args) {
  return new Promise((resolve, reject) => {
    execFile(
      pythonCommand,
      [path.join(rootDir, "desktop_bridge.py"), ...args],
      { cwd: rootDir, maxBuffer: 1024 * 1024 * 25 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim() || "{}"));
        } catch (parseError) {
          reject(new Error(`Could not parse Python response: ${parseError.message}`));
        }
      }
    );
  });
}

ipcMain.handle("run-backtest", async (_event, payload) => {
  const start = payload?.start || "2021-01-01";
  const end = payload?.end || "2024-12-31";
  const initialCash = String(payload?.initialCash || 100000);
  return runBridgeCommand(["backtest", "--start", start, "--end", end, "--initial-cash", initialCash]);
});

ipcMain.handle("stock-insight", async (_event, payload) => {
  const ticker = (payload?.ticker || "").toUpperCase().trim();
  if (!ticker) {
    throw new Error("Ticker is required.");
  }
  return runBridgeCommand(["stock-insight", "--ticker", ticker, "--sources-file", "sources.txt"]);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
