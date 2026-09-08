const { spawnSync } = require('child_process')
const { authentication, resolveApiKey } = require('./notarize')

function check(run = spawnSync) {
  const credentials = authentication()
  const mode = credentials.appleApiIssuer ? 'team' : 'individual'
  console.log(`Authentication mode: ${mode}; issuer argument: ${credentials.appleApiIssuer ? 'included' : 'omitted'}`)
  const xcode = run('xcodebuild', ['-version'], { encoding: 'utf8', timeout: 15000 })
  const version = /Xcode\s+(\d+(?:\.\d+)*)/.exec(xcode.stdout || '')
  if (xcode.status !== 0 || !version) throw new Error('Cannot determine selected Xcode version on the runner')
  console.log(`Selected Xcode: ${version[1]}`)
  if (mode === 'individual' && Number(version[1].split('.')[0]) < 26) {
    throw new Error('Individual API keys require Xcode 26+. Select a supported Xcode on the GitHub runner before retrying.')
  }
  const key = resolveApiKey()
  if (!key) throw new Error('Missing APPLE_API_KEY or APPLE_API_KEY_PATH')
  try {
    const args = ['notarytool', 'history', '--key', key.apiKeyPath, '--key-id', credentials.appleApiKeyId, '--output-format', 'json']
    if (credentials.appleApiIssuer) args.push('--issuer', credentials.appleApiIssuer)
    const result = run('xcrun', args, { encoding: 'utf8', timeout: 120000 })
    if (result.status !== 0) {
      if (result.error) throw new Error(`Unable to run Apple authentication request: ${result.error.code || 'process error'}`)
      const unauthorized = /401|Unauthenticated|Unauthorized/i.test(`${result.stdout || ''}${result.stderr || ''}`)
      throw new Error(unauthorized
        ? `Apple rejected ${mode} authentication (HTTP 401) with Xcode ${version[1]}. Local key parsing passed. This response does not distinguish a mismatched Key ID, revoked key, incorrect issuer (team only), or account permissions. Have the key owner validate the same credentials; changing build versions cannot repair them.`
        : 'Apple credential preflight failed or timed out. Check runner Xcode/notarytool and Apple network availability. No application was submitted.')
    }
    console.log('Apple accepted the notarization credentials')
  } finally {
    key.cleanup()
  }
}

if (require.main === module) {
  try { check() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { check }
