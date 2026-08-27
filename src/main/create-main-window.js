import { BrowserWindow, Menu, MenuItem, app } from 'electron'
import fs from 'fs'
import * as open from 'open'
import path from 'path'
import buildEditorContextMenu from 'electron-editor-context-menu'

import { isExternalUrl, openUrlHandler } from './open-url-handler'
import { config } from './config'

const isDevelopment = process.env.NODE_ENV !== 'production'

// When config.development is `true`, load the local dev server instead of
// the production site (useful for local development / debugging).
const isDevConfig = config.development === true
const loadUrl = isDevConfig ? config.developmentUrl : config.teamworkUrl
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const loadWithRetry = async (window, url) => {
  const attempts = Math.max(1, config.pageLoadRetries || 1)
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await window.loadURL(url)
      return true
    } catch (error) {
      lastError = error
      console.error(`[page-load] Attempt ${attempt}/${attempts} failed`, error.message)
      if (attempt < attempts) await wait(attempt * 1000)
    }
  }

  const safeUrl = JSON.stringify(url).replace(/</g, '\\u003c')
  const errorPage = `<!doctype html><meta charset="utf-8"><title>Teamwork could not load</title>
    <style>body{margin:0;background:#202427;color:#eef2f5;font:15px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;height:100vh}.card{max-width:520px;padding:32px;text-align:center;background:#2b3035;border:1px solid #41484f;border-radius:14px;box-shadow:0 12px 35px #0005}h1{font-size:22px;margin:0 0 12px}p{color:#b8c1c8;line-height:1.55}button{margin-top:12px;padding:10px 22px;border:0;border-radius:8px;color:white;background:#168bd2;font-weight:600;cursor:pointer}</style>
    <div class="card"><h1>Unable to load Teamwork</h1><p>The web service is unavailable or still starting.<br>Please check the network or development server, then retry.</p><button onclick='location.href=${safeUrl}'>Retry</button></div>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`)
  console.error('[page-load] Showing recovery page after retries', lastError)
  return false
}

// brain-less copy https://stackoverflow.com/a/16684530/6763724
const getDirFilesRecursively = function(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach(function(file) {
    file = dir + '/' + file
    const stat = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      /* Recurse into a subdirectory */
      results = results.concat(getDirFilesRecursively(file))
    } else {
      /* Is a file */
      results.push(file)
    }
  })
  return results
}

export async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    backgroundColor: '#202427',
    webPreferences: {
      // security reason on running remote website
      nodeIntegration: false,
      // security reason on running remote website
      allowRunningInsecureContent: false,
      // security reason on running remote website
      enableRemoteModule: false,
      // Create a browser window with a sandboxed renderer.
      // With this option enabled, the renderer must communicate via IPC to the main process in order to access node APIs.
      // https://www.electronjs.org/docs/api/sandbox-option
      sandbox: true,
      contextIsolation: true,
      preload: path.join(app.getAppPath(), 'preload.js'),
    },
  })

  const isMac = process.platform === 'darwin'
  let rendererRecoveryAttempts = 0

  const revealWindow = () => {
    if (!window.isDestroyed() && !window.isVisible()) window.show()
  }
  window.once('ready-to-show', revealWindow)
  setTimeout(revealWindow, 8000)

  if (isDevelopment || isDevConfig) {
    window.webContents.openDevTools()
  }

  window.on('minimize', function(event) {
    if (isMac) {
      event.preventDefault()
      window.hide()
    }
  })

  let closeRequestedQuit = false
  window.on('close', event => {
    if (isMac && !closeRequestedQuit) {
      closeRequestedQuit = true
      event.preventDefault()
      app.quit()
    }
  })

  window.webContents.on('dom-ready', async () => {
    const injectDir = path.join(__dirname + '/inject')

    try {
      // create a placeholder
      await window.webContents.executeJavaScript(`window.injectedCode = { 'SVG': {}, 'CSS': {} };0`)

      const files = getDirFilesRecursively(injectDir).sort(file =>
        path.basename(file) === 'inject.js' ? 1 : -1,
      )
      for (const file of files) {
        const extName = path.extname(file)
        const filename = path.basename(file)
        const injectCode = fs.readFileSync(file, 'utf8')

        if (extName === '.css' || extName === '.svg') {
          // inject the css/svg into javascript variable
          await window.webContents.executeJavaScript(
            `window.injectedCode['${extName.substring(1).toUpperCase()}']['${filename.replace(
              extName,
              '',
            )}'] = \`${injectCode}\`;`,
          )
        } else if (extName === '.js') {
          // `;0` is useful, ref: https://github.com/electron/electron/issues/23722
          await window.webContents.executeJavaScript(`${injectCode};0`)
        }
      }
    } catch (error) {
      console.error('[injection] Failed without interrupting page load', error)
    }
  })

  window.webContents.on('did-finish-load', () => {
    rendererRecoveryAttempts = 0
    revealWindow()
  })

  window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error('[page-load] did-fail-load', errorCode, errorDescription, validatedURL)
    }
  })

  window.webContents.on('render-process-gone', (event, details) => {
    console.error('[renderer-gone]', details.reason, details.exitCode)
    if (window.isDestroyed() || details.reason === 'clean-exit' || rendererRecoveryAttempts >= 2) return

    rendererRecoveryAttempts += 1
    setTimeout(() => {
      if (!window.isDestroyed()) loadWithRetry(window, loadUrl)
    }, 750 * rendererRecoveryAttempts)
  })

  window.on('unresponsive', () => {
    console.error('[window] Renderer became unresponsive; reloading once')
    if (rendererRecoveryAttempts >= 2 || window.isDestroyed()) return
    rendererRecoveryAttempts += 1
    window.webContents.reloadIgnoringCache()
  })

  window.webContents.setWindowOpenHandler(details => {
    if (isExternalUrl(details.url)) {
      open(details.url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  window.webContents.on('will-navigate', openUrlHandler)

  window.webContents.on('will-redirect', openUrlHandler)

  window.webContents.on('context-menu', (event, params) => {
    const menu = new Menu()

    // Add each spelling suggestion
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion),
        }),
      )
    }

    // Allow users to add the misspelled word to the dictionary
    if (params.misspelledWord) {
      menu.append(
        new MenuItem({
          label: 'Add to dictionary',
          click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        }),
      )
    }

    menu.popup()
  })

  window.webContents.on('context-menu', (event, params) => {
    // Only show the context menu in text editors.
    if (!params.isEditable) return

    const menu = buildEditorContextMenu()

    // The 'contextmenu' event is emitted after 'selectionchange' has fired but possibly before the
    // visible selection has changed. Try to wait to show the menu until after that, otherwise the
    // visible selection will update after the menu dismisses and look weird.
    setTimeout(function() {
      menu.popup(window)
    }, 30)
  })

  const loaded = await loadWithRetry(window, loadUrl)

  if (loaded && config.forcePasswordLogin) {
    const loginInputs = await window.webContents.executeJavaScript(`
      new Promise(resolve => {
        const deadline = Date.now() + 10000
        const inspect = () => {
          const inputs = Array.from(document.querySelectorAll('input'))
            .filter(input => input.offsetWidth || input.offsetHeight || input.getClientRects().length)
            .map(input => ({ type: input.type, placeholder: input.placeholder }))
          if (inputs.length >= 2 || Date.now() >= deadline) {
            resolve(inputs)
          } else {
            setTimeout(inspect, 100)
          }
        }
        inspect()
      })
    `)
    console.log('[password-login] visible inputs:', JSON.stringify(loginInputs))
  }

  return window
}
