import { Menu } from 'electron'

export function createApplicationMenu({ themeItems, downloadItems, supportItems = [] }) {
  const template = []

  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' })
  }

  template.push(
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Theme',
      submenu: [...themeItems],
    },
    {
      label: 'Download',
      submenu: [...downloadItems],
    },
    {
      label: 'Help',
      submenu: [...supportItems],
    },
  )

  return Menu.buildFromTemplate(template)
}
