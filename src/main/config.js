import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const getPackagedMetadata = key => {
  try {
    const metadataPath = path.join(app.getAppPath(), 'package.json')
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'))[key]
  } catch (error) {
    return null
  }
}

const getBuildEnvironment = () => {
  // Environment overrides are a development convenience. A packaged app must
  // not be redirected to an arbitrary localhost page through its process
  // environment or command-line arguments.
  if (!app.isPackaged) {
    const cliValue = process.argv.find(value => value.startsWith('--environment='))
    if (cliValue) return cliValue.split('=')[1]
    if (process.env.TEAMWORK_ENV) return process.env.TEAMWORK_ENV
  }

  try {
    // electron-builder's extraMetadata persists the selected channel in the
    // packaged app, unlike a temporary shell environment variable.
    const buildEnvironment = getPackagedMetadata('buildEnvironment')
    if (buildEnvironment) return buildEnvironment
  } catch (error) {
    // Development builds can safely use the default below.
  }
  return app.isPackaged ? 'production' : 'development'
}

const environment = getBuildEnvironment()
// The release channel of this package: it decides which server the app talks
// to. It is baked in at build time (see the release:* scripts in package.json)
// and cannot be changed by whoever runs the app.
//
// `app` is the page the wrapper loads; the rest are external destinations
// opened from the app. A channel only declares what differs from production.
const environmentUrls = {
  development: {
    app: 'http://localhost:8080/#',
  },
  staging: {
    app: 'https://teamwork.staging.talkbox.net/m/',
    teamwork: 'https://teamwork.staging.talkbox.net/',
  },
  production: {
    app: 'https://teamwork.gtomato.com/',
    teamwork: 'https://teamwork.gtomato.com/',
    dashboard: 'https://web.dashboard.gtomato.com/',
    supportTicket: 'https://osticket.gtomato.com/',
  },
}

const productionUrls = environmentUrls.production
const channelUrls = environmentUrls[environment] || productionUrls

const config = {
  environment,
  // Development mode flag.
  // When set to `true`, the app loads the local development server
  // (developmentUrl) instead of the production site, and opens the
  // DevTools — useful for local development & debugging even in a
  // packaged build. Set to `false` for production builds.
  development: environment === 'development',
  developmentUrl: environmentUrls.development.app,
  appUrl: channelUrls.app || productionUrls.app,
  // Prefer stability over GPU acceleration. This avoids intermittent blank
  // windows caused by GPU-process crashes on some macOS/Electron versions.
  disableHardwareAcceleration: true,
  pageLoadRetries: 3,
  // Set through package metadata or TEAMWORK_UPDATE_FEED for signed releases.
  updateFeedUrl: process.env.TEAMWORK_UPDATE_FEED || getPackagedMetadata('updateFeedUrl'),
  // Force the web client to render its built-in username/password form
  // instead of selecting an SSO provider after the username step.
  forcePasswordLogin: true,
  teamworkUrl: channelUrls.teamwork || productionUrls.teamwork,
  // No staging host is known for these two yet, so a staging build still opens
  // the production dashboard / ticket site.
  dashboardUrl: channelUrls.dashboard || productionUrls.dashboard,
  supportTicketUrl: channelUrls.supportTicket || productionUrls.supportTicket,
  googleOauth: 'https://accounts.google.com/o/oauth2',
  githubDownload: 'https://github.com/devtalkbox/teamwork-message-desktop/releases',
}

export { config }
