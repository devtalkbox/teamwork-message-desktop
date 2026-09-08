const { spawnSync } = require('child_process')
const { authentication, resolveApiKey } = require('./notarize')

function check() {
  const credentials = authentication()
  const key = resolveApiKey()
  if (!key) throw new Error('Missing APPLE_API_KEY or APPLE_API_KEY_PATH')
  try {
    const args = ['notarytool', 'history', '--key', key.apiKeyPath, '--key-id', credentials.appleApiKeyId, '--output-format', 'json']
    if (credentials.appleApiIssuer) args.push('--issuer', credentials.appleApiIssuer)
    const result = spawnSync('xcrun', args, { encoding: 'utf8', timeout: 120000 })
    if (result.status !== 0) {
      const unauthorized = /401|Unauthenticated|Unauthorized/i.test(`${result.stdout || ''}${result.stderr || ''}`)
      throw new Error(unauthorized
        ? 'Apple returned 401. Check that the .p8 and Key ID belong to the same active App Store Connect key. For team keys use its Issuer UUID; for individual keys set APPLE_API_KEY_TYPE=individual and use Xcode 26+. Check the key permissions in App Store Connect.'
        : 'Apple credential preflight failed or timed out. Check runner Xcode/notarytool and Apple network availability. No application was submitted.')
    }
    console.log('Apple accepted the notarization credentials')
  } finally {
    key.cleanup()
  }
}

try { check() } catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
