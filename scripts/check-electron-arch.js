/**
 * Ensure the installed Electron binary matches the host CPU architecture.
 *
 * `yarn dev` (electron-webpack dev) launches the local Electron binary from
 * node_modules. If the project is copied from an arm64 Mac to an Intel Mac
 * (or vice versa) the binary won't run ("Bad CPU type in executable").
 * This pre-dev hook re-downloads the correct binary via Electron's own
 * install script when a mismatch is detected.
 *
 * Run automatically before `yarn dev` via the `predev` npm/yarn script hook.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
const installJs = path.join(electronDir, 'install.js')

// Only relevant on macOS for this app; nothing to do elsewhere.
if (process.platform !== 'darwin' || !fs.existsSync(installJs)) {
  process.exit(0)
}

const distBinary = path.join(
  electronDir,
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
)

function detectInstalledArch() {
  if (!fs.existsSync(distBinary)) return null
  try {
    const out = execSync(`file -b "${distBinary}"`).toString()
    if (out.includes('arm64')) return 'arm64'
    if (out.includes('x86_64')) return 'x64'
    return null
  } catch (e) {
    return null
  }
}

const hostArch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch
const installedArch = detectInstalledArch()

if (installedArch && installedArch !== hostArch) {
  console.log(
    `[electron-arch] Installed Electron is ${installedArch} but this machine is ${hostArch}. ` +
      'Re-downloading the correct Electron binary…',
  )
  try {
    execSync(`node "${installJs}"`, { stdio: 'inherit', env: process.env })
    console.log(`[electron-arch] Electron binary updated to ${hostArch}.`)
  } catch (err) {
    console.error(
      '[electron-arch] Failed to re-download Electron. ' +
        'Make sure ELECTRON_MIRROR is set (e.g. https://npmmirror.com/mirrors/electron/) and try again.',
    )
    process.exit(1)
  }
}
