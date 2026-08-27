const { ipcRenderer, contextBridge, webFrame } = require('electron')

webFrame.executeJavaScript(`
  Object.defineProperty(window, 'options', {
    configurable: true,
    get() {
      return window.__teamworkWrapperOptions
    },
    set(value) {
      if (value && value.settings && value.settings.feature) {
        value.settings.feature.requireCheckLoginMethod = false
      }
      window.__teamworkWrapperOptions = value
    },
  })
`)

const allowedChannels = [
  'application-settings',
  'badge',
  'reset-recommended-settings',
  'isDark',
  'isBorderless',
  'isBoldUsername',
  'isBubbleDisplayDate',
  'isPingFang',
  'isNotoSans',
  'isJFOpen',
  'isSubpixel',
  'download',
  'chunk-load-error',
]

const reportChunkLoadError = error => {
  const message = error && (error.message || String(error))
  if (message && (message.includes('ChunkLoadError') || message.includes('Loading chunk'))) {
    ipcRenderer.send('chunk-load-error', { message })
  }
}

window.addEventListener('error', event => reportChunkLoadError(event.error || event.message))
window.addEventListener('unhandledrejection', event => reportChunkLoadError(event.reason))

contextBridge.exposeInMainWorld('TWW', {
  ipc: {
    on: (key, cb) => {
      if (allowedChannels.indexOf(key) === -1) {
        throw new Error(`Not supported channel '${key}', please add this channel to allowed list`)
      }
      ipcRenderer.on(key, cb)
    },
    send: (key, obj) => {
      if (allowedChannels.indexOf(key) === -1) {
        throw new Error(`'Not supported channel '${key}', please add this channel to allowed list`)
      }
      ipcRenderer.send(key, obj)
    },
  },
})
