# Introduction

Simple Electron wrapper for https://teamwork.gtomato.com/.

Also bring in some interesting UI enhancements.

### Enhancement

- [x] Dark Mode
- [x] Native Badges
- [x] ~~Emoji Keyboard~~ (removed — the web version ships its own emoji picker)
- [x] Border-less Setting
- [x] Bold Username Setting
- [x] Bubble Display Date Setting
- [x] Ping Fang HK Font Setting
- [x] Noto Sans HK Font Setting
- [x] JF Open Huninn Font setting
- [x] Subpixel Antialiased Font Rendering Setting
- [] Secure Local Lock
- [x] Draft Note Handling
- [x] Add useful shortcuts

### Catch up with Chrome Web Features

- [x] Open Link to external URL
- [x] Native Chrome Spell Check
- [x] Simulate Chrome Right click handling
- [x] Auto save downloaded file to ~/Download folder without prompting dialog

### Security

This project has spent extra efforts on achieving with the following electron settings that
mitigated the risk of malicious code injection when `teamwork.gtomato.com` is compromised

```js
new BrowserWindow({
  width: 1024,
  height: 1024,
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
    preload: path.join(app.getAppPath(), '../main/preload.js'),
  },
})
```

### Development Mode

The app normally loads the production site `https://teamwork.gtomato.com/`.

For local development, flip the `development` flag in `src/main/config.js`
to `true`. The window will then load `http://localhost:8080/#` (your local
front-end dev server) and auto-open DevTools — this also works in a packaged
build, which is handy for debugging against a local server:

```js
const config = {
  development: true, // set to false for production builds
  developmentUrl: 'http://localhost:8080/#',
  teamworkUrl: 'https://teamwork.gtomato.com/',
}
```

> Remember to set `development` back to `false` before distributing.

# Getting Started

> A bare minimum project structure to get started developing with [`electron-webpack`](https://github.com/electron-userland/electron-webpack).

```bash
# Install dependencies (Node 22.12+)
yarn install

# run application in development mode
yarn dev

# build an unsigned .app (no developer certificate needed)
yarn dist:dir-nosign
```

### Node.js & network notes

- Electron 44 requires Node.js 22.12 or newer when installing dependencies.
- The build toolchain uses webpack 4. Under Node 17+ (OpenSSL 3) it requires
  `NODE_OPTIONS=--openssl-legacy-provider`, which is already baked into the
  `dev` / `compile` scripts — no manual export needed.
- If GitHub is unreachable (e.g. in China), export these mirrors before
  installing or running anything that downloads Electron binaries:

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
yarn install
```

### Cross-architecture development (Apple Silicon ⇄ Intel)

`yarn dev` launches the Electron binary inside `node_modules`, which must
match your CPU architecture. If you copy the project (including
`node_modules`) from an Apple Silicon Mac to an Intel Mac, `yarn dev` would
otherwise fail. The `predev` hook (`scripts/check-electron-arch.js`) detects
the mismatch and automatically re-downloads the correct binary:

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
yarn dev
```

# Code Signing

Public macOS builds are signed with a Developer ID Application certificate
and notarized through Apple's `notarytool` service via `@electron/notarize`.
Unsigned local builds still skip notarization, while the production release
workflow sets `REQUIRE_NOTARIZATION=true` and fails if any credential is
missing.

See [docs/RELEASING.md](docs/RELEASING.md) for certificate setup, GitHub
Secrets, version tags, verification, and publishing a draft GitHub Release.

# Packaging & Distribution

### DMG vs PKG

- **DMG** is a drag-to-`/Applications` disk image — it does **not**
  auto-install. Users must drag `Teamwork Wrap+.app` onto the `Applications`
  shortcut inside the DMG, otherwise the app won't show up in Launchpad /
  Applications and they will keep launching it from the mounted image.
- **PKG** installs the app into `/Applications` automatically, so it appears
  in Launchpad / Applications right after installation.

Build unsigned packages (no developer certificate needed):

```bash
# Intel
npx electron-builder build --mac dmg  --x64   -c.mac.identity=null
npx electron-builder build --mac pkg  --x64   -c.mac.identity=null

# Apple Silicon
npx electron-builder build --mac dmg  --arm64 -c.mac.identity=null
npx electron-builder build --mac pkg  --arm64 -c.mac.identity=null
```

> Unsigned packages are blocked by Gatekeeper on other machines: right-click →
> Open the first time (or allow them under System Settings → Privacy &
> Security). For public distribution you still need a developer certificate
> and notarization.
