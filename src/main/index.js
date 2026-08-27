import { app, ipcMain, Menu } from 'electron'
import electronDl from 'electron-dl'
import { createApplicationMenu } from './create-application-menu'
import { createMainWindow } from './create-main-window'
import { config } from './config'

if (config.disableHardwareAcceleration) {
  app.disableHardwareAcceleration()
}

// https://github.com/sindresorhus/electron-dl
electronDl({
  openFolderWhenDone: true,
})

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow
const chunkRecoveryAttempted = new WeakSet()

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
  } catch (error) {
    console.error('[startup] Failed to create the main window', error)
    app.quit()
  }
})

app.on('child-process-gone', (event, details) => {
  console.error('[child-process-gone]', details.type, details.reason, details.exitCode)
})

// listen badge update from renderer
ipcMain.on('badge', (event, data) => {
  const { count } = data
  if (app.dock) {
    if (count === 0) {
      app.dock.setBadge('')
    } else {
      app.dock.setBadge(`${count}`)
    }
  }
})

ipcMain.on('application-settings', (event, data) => {
  const settings = JSON.parse(data)
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
  })

  Menu.setApplicationMenu(menu)
})

ipcMain.on('chunk-load-error', async event => {
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
})
