const config = {
  // Development mode flag.
  // When set to `true`, the app loads the local development server
  // (developmentUrl) instead of the production site, and opens the
  // DevTools — useful for local development & debugging even in a
  // packaged build. Set to `false` for production builds.
  development: true,
  developmentUrl: 'http://localhost:8080/#',
  // Prefer stability over GPU acceleration. This avoids intermittent blank
  // windows caused by GPU-process crashes on some macOS/Electron versions.
  disableHardwareAcceleration: true,
  pageLoadRetries: 3,
  // Force the web client to render its built-in username/password form
  // instead of selecting an SSO provider after the username step.
  forcePasswordLogin: true,
  teamworkUrl: 'https://teamwork.gtomato.com/',
  dashboardUrl: 'https://web.dashboard.gtomato.com/',
  supportTicketUrl: 'https://osticket.gtomato.com/',
  googleOauth: 'https://accounts.google.com/o/oauth2',
  githubDownload: 'https://github.com/gaplo917/teamwork-wrap-plus/releases',
}

export { config }
