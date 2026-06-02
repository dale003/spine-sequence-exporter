import { app, BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let logFile = ''

const userDataDir = path.join(os.tmpdir(), 'SpineSequenceExporter-user-data')
app.setPath('userData', userDataDir)

function writeLog(message: string, error?: unknown) {
  const line = `[${new Date().toISOString()}] ${message}${error ? `\n${String(error instanceof Error ? error.stack || error.message : error)}` : ''}\n`
  try {
    if (!logFile) {
      const dir = path.join(app.getPath('userData'), 'logs')
      fs.mkdirSync(dir, { recursive: true })
      logFile = path.join(dir, 'startup.log')
    }
    fs.appendFileSync(logFile, line, 'utf8')
  } catch {
    try {
      const fallback = path.join(os.tmpdir(), 'SpineSequenceExporter-startup.log')
      fs.appendFileSync(fallback, line, 'utf8')
    } catch {
      // Logging must never prevent startup.
    }
  }
}

// Some Windows environments crash in GPU/sandbox startup path (0x80000003).
// These switches prioritize compatibility for distribution builds.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

function createWindow() {
  writeLog('Creating main window')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 680,
    title: 'Spine 序列帧导入工具',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    writeLog('Main window ready to show')
    mainWindow?.show()
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`Renderer process gone: ${details.reason}`)
    dialog.showErrorBox('程序窗口异常关闭', `渲染进程异常：${details.reason}\n日志位置：${logFile}`)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
    dialog.showErrorBox('程序加载失败', `${errorDescription} (${errorCode})\n日志位置：${logFile}`)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    writeLog(`Loading dev URL: ${process.env.VITE_DEV_SERVER_URL}`)
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    writeLog(`Loading file: ${indexPath}`)
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  writeLog(`App ready. Version=${app.getVersion()} Electron=${process.versions.electron} Chrome=${process.versions.chrome}`)
  createWindow()
}).catch((error) => {
  writeLog('App failed during startup', error)
  dialog.showErrorBox('程序启动失败', `${String(error)}\n日志位置：${logFile}`)
})

app.on('render-process-gone', (_event, _webContents, details) => {
  writeLog(`Render process gone: ${details.reason}`)
})

process.on('uncaughtException', (error) => {
  writeLog('Uncaught exception', error)
  dialog.showErrorBox('程序异常', `${error.message}\n日志位置：${logFile}`)
})

process.on('unhandledRejection', (reason) => {
  writeLog('Unhandled rejection', reason)
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
