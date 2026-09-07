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

const allowedSendChannels = [
  'application-settings',
  'badge',
  'chunk-load-error',
  'post-login-blank-screen',
  'workspace-ready',
  'page-runtime-error',
  'native-notification',
]

const allowedReceiveChannels = [
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
  'notification-clicked',
]

const reportChunkLoadError = error => {
  const message = error && (error.message || String(error))
  if (message && (message.includes('ChunkLoadError') || message.includes('Loading chunk'))) {
    ipcRenderer.send('chunk-load-error', { message })
  }
}

window.addEventListener('error', event => reportChunkLoadError(event.error || event.message))
window.addEventListener('unhandledrejection', event => reportChunkLoadError(event.reason))

const serializeRuntimeError = value => {
  const message = value && (value.message || String(value))
  const stack = value && value.stack
  return {
    message: String(message || 'Unknown renderer error').slice(0, 1000),
    stack: stack ? String(stack).slice(0, 4000) : '',
    url: window.location.href,
  }
}

window.addEventListener('error', event => {
  ipcRenderer.send('page-runtime-error', serializeRuntimeError(event.error || event.message))
})
window.addEventListener('unhandledrejection', event => {
  ipcRenderer.send('page-runtime-error', serializeRuntimeError(event.reason))
})

ipcRenderer.on('system-resume', () => {
  window.dispatchEvent(new Event('teamwork-system-resume'))
})

contextBridge.exposeInMainWorld('TWW', {
  ipc: {
    on: (key, cb) => {
      if (allowedReceiveChannels.indexOf(key) === -1 || typeof cb !== 'function') {
        throw new Error(`Not supported channel '${key}', please add this channel to allowed list`)
      }
      const listener = (_event, ...args) => cb(...args)
      ipcRenderer.on(key, listener)
      return () => ipcRenderer.removeListener(key, listener)
    },
    send: (key, obj) => {
      if (allowedSendChannels.indexOf(key) === -1) {
        throw new Error(`'Not supported channel '${key}', please add this channel to allowed list`)
      }
      ipcRenderer.send(key, obj)
    },
  },
})
