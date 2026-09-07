import { app, ipcMain, Menu, Notification, powerMonitor, shell } from 'electron'
import electronDl from 'electron-dl'
import { createApplicationMenu } from './create-application-menu'
import { createMainWindow } from './create-main-window'
import { config } from './config'
import { checkForUpdates, initializeAutoUpdater } from './auto-updater'
import { isTrustedAppUrl } from './open-url-handler'
import {
  diagnosticsFile,
  markStableRun,
  recordGpuCrash,
  shouldUseSoftwareRendering,
  writeDiagnostic,
} from './stability'

const softwareRendering = config.disableHardwareAcceleration || shouldUseSoftwareRendering()
if (softwareRendering) {
  app.disableHardwareAcceleration()
  console.warn('[stability] Software rendering enabled')
}

// https://github.com/sindresorhus/electron-dl
electronDl({
  openFolderWhenDone: true,
})

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow
const chunkRecoveryAttempted = new WeakSet()
const postLoginRecoveryState = new WeakMap()
const runtimeErrorRateLimit = new WeakMap()
const notificationRateLimit = new WeakMap()
const singleInstanceLock = app.requestSingleInstanceLock()

const trustedIpc = handler => (event, ...args) => {
  const frameUrl = event.senderFrame && event.senderFrame.url
  const contentsUrl = !event.sender.isDestroyed() && event.sender.getURL()
  if (!isTrustedAppUrl(frameUrl) || !isTrustedAppUrl(contentsUrl)) {
    console.warn('[ipc] Blocked message from untrusted frame', frameUrl || contentsUrl || 'unknown')
    return
  }
  return handler(event, ...args)
}

const allowRate = (store, webContents, { limit, interval }) => {
  const now = Date.now()
  const state = store.get(webContents) || { startedAt: now, count: 0 }
  if (now - state.startedAt >= interval) {
    state.startedAt = now
    state.count = 0
  }
  state.count += 1
  store.set(webContents, state)
  return state.count <= limit
}

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

// close all window before user trigger quit
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close')
    mainWindow.close()
  }
})

// quit application when all windows are closed
app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = await createMainWindow()
  } else {
    mainWindow.show()
  }
})

// create main BrowserWindow when electron is ready
app.on('ready', async () => {
  try {
    mainWindow = await createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    powerMonitor.on('resume', () => {
      console.log('[power] System resumed; requesting connection health check')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-resume')
      }
    })
    powerMonitor.on('unlock-screen', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-resume')
      }
    })
    setTimeout(markStableRun, 120000)
    initializeAutoUpdater(config.updateFeedUrl)
  } catch (error) {
    console.error('[startup] Failed to create the main window', error)
    app.quit()
  }
})

app.on('child-process-gone', (event, details) => {
  console.error('[child-process-gone]', details.type, details.reason, details.exitCode)
  writeDiagnostic('child-process-gone', details)
  if (details.type === 'GPU' && details.reason !== 'clean-exit') recordGpuCrash(details)
})

// listen badge update from renderer
ipcMain.on('badge', trustedIpc((event, data) => {
  const count = Math.max(0, Math.min(9999, Number(data && data.count) || 0))
  if (app.dock) {
    if (count === 0) {
      app.dock.setBadge('')
    } else {
      app.dock.setBadge(`${count}`)
    }
  }
}))

ipcMain.on('application-settings', trustedIpc((event, data) => {
  let submitted
  try {
    submitted = typeof data === 'string' ? JSON.parse(data) : data
  } catch (error) {
    console.warn('[ipc] Ignoring invalid application settings payload')
    return
  }

  const settingKeys = [
    'isDark',
    'isBorderless',
    'isBoldUsername',
    'isBubbleDisplayDate',
    'isPingFang',
    'isNotoSans',
    'isJFOpen',
    'isSubpixel',
  ]
  const settings = Object.fromEntries(settingKeys.map(key => [key, Boolean(submitted && submitted[key])]))
  const toggleAction = bool => (bool ? '🟢' : '🔴')
  const createToggleItem = (key, label) => {
    return {
      label: `${toggleAction(settings[key])} ${label}`,
      click: () => {
        mainWindow.webContents.send(key, {})
      },
    }
  }

  const isMac = process.platform === 'darwin'

  const menu = createApplicationMenu({
    themeItems: [
      createToggleItem('isDark', 'Dark Mode'),
      createToggleItem('isBorderless', 'Border-less Mode'),
      createToggleItem('isBoldUsername', 'Bold Username'),
      createToggleItem('isBubbleDisplayDate', 'Bubble Display Date'),
      ...(isMac ? [createToggleItem('isPingFang', 'Ping Fang HK Font')] : []),
      createToggleItem('isNotoSans', 'Noto Sans HK Font'),
      createToggleItem('isJFOpen', 'JF Open Huninn Font'),
      createToggleItem('isSubpixel', 'Subpixel Antialiased Font Rendering'),
      {
        label: 'Reset to Recommended Settings',
        click: () => {
          mainWindow.webContents.send('reset-recommended-settings', {})
        },
      },
    ],
    downloadItems: [
      {
        label: 'Download latest version',
        click: () => {
          mainWindow.webContents.send('download', {})
        },
      },
    ],
    supportItems: [
      {
        label: 'Check for Updates',
        click: () => checkForUpdates({ manual: true }),
      },
      {
        label: 'Show Diagnostic Log',
        click: () => shell.showItemInFolder(diagnosticsFile()),
      },
    ],
  })

  Menu.setApplicationMenu(menu)
}))

ipcMain.on('chunk-load-error', trustedIpc(async event => {
  const webContents = event.sender
  if (webContents.isDestroyed() || chunkRecoveryAttempted.has(webContents)) return

  chunkRecoveryAttempted.add(webContents)
  console.warn('[chunk-recovery] Clearing stale web caches and reloading once')

  try {
    await webContents.session.clearCache()
    await webContents.session.clearStorageData({
      storages: ['serviceworkers', 'cachestorage'],
    })

    if (!webContents.isDestroyed()) {
      webContents.reloadIgnoringCache()
    }
  } catch (error) {
    console.error('[chunk-recovery] Failed to clear stale web caches', error)
  }
}))

ipcMain.on('post-login-blank-screen', trustedIpc(event => {
  const webContents = event.sender
  if (webContents.isDestroyed()) return

  const now = Date.now()
  const state = postLoginRecoveryState.get(webContents) || { attempts: 0, lastAttemptAt: 0 }
  // Do not reload repeatedly while the legacy application is still settling,
  // but allow a later login/navigation in the same renderer to recover too.
  if (now - state.lastAttemptAt < 30000 || state.attempts >= 3) return

  state.attempts += 1
  state.lastAttemptAt = now
  postLoginRecoveryState.set(webContents, state)
  console.warn(`[post-login-recovery] Workspace stayed blank; recovery ${state.attempts}/3`)
  writeDiagnostic('post-login-blank-screen', {
    url: webContents.getURL(),
    attempt: state.attempts,
  })
  webContents.reloadIgnoringCache()
}))

ipcMain.on('workspace-ready', trustedIpc(event => {
  const webContents = event.sender
  if (!webContents.isDestroyed()) postLoginRecoveryState.delete(webContents)
}))

ipcMain.on('page-runtime-error', trustedIpc((event, details) => {
  if (!allowRate(runtimeErrorRateLimit, event.sender, { limit: 10, interval: 60000 })) return
  const safeDetails = {
    message: String((details && details.message) || 'Unknown renderer error').slice(0, 1000),
    stack: String((details && details.stack) || '').slice(0, 4000),
    url: String((details && details.url) || '').slice(0, 1000),
  }
  console.error('[page-runtime-error]', safeDetails.message)
  writeDiagnostic('page-runtime-error', safeDetails)
}))

ipcMain.on('native-notification', trustedIpc((event, payload) => {
  if (!Notification.isSupported() || !payload || typeof payload !== 'object') return
  if (!allowRate(notificationRateLimit, event.sender, { limit: 8, interval: 10000 })) return
  const title = String(payload.title || 'Teamwork').slice(0, 100)
  const body = String(payload.body || 'New message').slice(0, 240)
  const notification = new Notification({ title, body })

  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('notification-clicked', {
      conversationId: payload.conversationId,
    })
  })
  notification.on('failed', error => console.error('[notification] Failed', error))
  notification.show()
}))
