const { app, BrowserWindow, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// Persist user data in %APPDATA%/Free GST Billing/data
const dataDir = isDev
  ? path.join(__dirname, '..', 'data')
  : path.join(app.getPath('userData'), 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server start timed out'));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

function startBackendServer() {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    DIST_PATH: path.join(__dirname, '..', 'dist'),
    PORT: '47371'
  };

  // Use utilityProcess if available (Electron 22+), fallback to fork
  if (utilityProcess && typeof utilityProcess.fork === 'function') {
    serverProcess = utilityProcess.fork(serverPath, [], { env });
  } else {
    serverProcess = fork(serverPath, [], { env });
  }

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend server exited with code ${code}`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    title: 'Free GST Billing Software',
    icon: path.join(__dirname, '..', 'release-templates', '_system-scripts', 'app-icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const appUrl = 'http://127.0.0.1:47371';

  waitForServer(appUrl)
    .then(() => {
      mainWindow.loadURL(appUrl);
    })
    .catch((err) => {
      console.error('Failed to load backend:', err);
    });

  // Open external links (e.g. documentation, help) in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startBackendServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (e) {
      // ignore
    }
  }
});
