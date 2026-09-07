import { app, screen } from 'electron'
import fs from 'fs'
import path from 'path'

const statePath = () => path.join(app.getPath('userData'), 'window-state.json')

const intersects = (bounds, area) =>
  bounds.x < area.x + area.width &&
  bounds.x + bounds.width > area.x &&
  bounds.y < area.y + area.height &&
  bounds.y + bounds.height > area.y

const loadWindowState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    const visible = screen.getAllDisplays().some(display => intersects(state.bounds, display.workArea))
    return visible ? state : null
  } catch (error) {
    return null
  }
}

const attachWindowState = window => {
  let timer
  const save = () => {
    if (window.isDestroyed()) return
    const state = {
      bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(),
      maximized: window.isMaximized(),
    }
    try {
      fs.writeFileSync(statePath(), JSON.stringify(state))
    } catch (error) {
      console.error('[window-state] Failed to save state', error)
    }
  }
  const scheduleSave = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 250)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', save)
}

export { attachWindowState, loadWindowState }
