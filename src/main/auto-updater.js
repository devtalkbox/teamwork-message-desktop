import { app, autoUpdater, dialog } from 'electron'

let initialized = false
let checking = false

const checkForUpdates = async ({ manual = false } = {}) => {
  if (!initialized || checking) {
    if (manual && !initialized) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Automatic updates are not configured for this build.',
        detail: 'A signed build and update feed URL are required.',
      })
    }
    return
  }
  checking = true
  try {
    autoUpdater.checkForUpdates()
  } catch (error) {
    checking = false
    if (manual) dialog.showErrorBox('Update check failed', error.message)
  }
}

const initializeAutoUpdater = updateFeedUrl => {
  if (!app.isPackaged || !updateFeedUrl) return
  autoUpdater.setFeedURL({ url: updateFeedUrl })
  initialized = true

  autoUpdater.on('update-not-available', () => {
    checking = false
  })
  autoUpdater.on('error', error => {
    checking = false
    console.error('[auto-update]', error)
  })
  autoUpdater.on('update-downloaded', async (event, releaseNotes, releaseName) => {
    checking = false
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart and Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `Teamwork ${releaseName || ''} is ready`,
      detail: String(releaseNotes || 'Restart the application to install the update.'),
    })
    if (result.response === 0) autoUpdater.quitAndInstall()
  })

  setTimeout(() => checkForUpdates(), 15000)
  setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000)
}

export { checkForUpdates, initializeAutoUpdater }
