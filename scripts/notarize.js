require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPrivateKey } = require('crypto')

function authentication() {
  const type = (process.env.APPLE_API_KEY_TYPE || 'team').trim()
  if (!['team', 'individual'].includes(type)) throw new Error('APPLE_API_KEY_TYPE must be team or individual')
  const appleApiKeyId = (process.env.APPLE_API_KEY_ID || '').trim()
  const issuer = (process.env.APPLE_API_ISSUER || '').trim()
  if (!/^[A-Z0-9]{10}$/.test(appleApiKeyId)) throw new Error('APPLE_API_KEY_ID must be the 10-character Key ID')
  if (type === 'team' && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(issuer)) {
    throw new Error('Team keys require APPLE_API_ISSUER as an Issuer UUID, not a Team ID')
  }
  return { appleApiKeyId, ...(type === 'team' ? { appleApiIssuer: issuer } : {}) }
}

function validatePrivateKey(contents, sourceName) {
  const key = contents.toString('utf8').trim()
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----') || !key.endsWith('-----END PRIVATE KEY-----')) {
    throw new Error(`${sourceName} must contain the complete PKCS#8 .p8 private key`)
  }
  try {
    const parsed = createPrivateKey(key)
    if (parsed.asymmetricKeyType !== 'ec' || parsed.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error()
  } catch (_) {
    throw new Error(`${sourceName} must be a valid App Store Connect P-256 private key`)
  }
  return `${key}\n`
}

function decodeBase64PrivateKey(encodedKey) {
  const normalized = encodedKey.replace(/\s/g, '')
  if (normalized.length === 0 || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('APPLE_API_KEY is not valid Base64')
  }

  return validatePrivateKey(Buffer.from(normalized, 'base64'), 'Decoded APPLE_API_KEY')
}

function resolveApiKey() {
  const configuredPath = process.env.APPLE_API_KEY_PATH
  const encodedKey = process.env.APPLE_API_KEY

  if (configuredPath && encodedKey) {
    throw new Error('Set only one of APPLE_API_KEY_PATH or APPLE_API_KEY, not both')
  }

  if (configuredPath) {
    const apiKeyPath = path.resolve(configuredPath)
    const stat = fs.statSync(apiKeyPath)
    if (!stat.isFile()) {
      throw new Error('APPLE_API_KEY_PATH must point to a .p8 file')
    }
    validatePrivateKey(fs.readFileSync(apiKeyPath), 'APPLE_API_KEY_PATH')
    return { apiKeyPath, cleanup: () => {} }
  }

  if (!encodedKey) {
    return null
  }

  const privateKey = decodeBase64PrivateKey(encodedKey)
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-notarize-'))
  const safeKeyId = (process.env.APPLE_API_KEY_ID || 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '')
  const apiKeyPath = path.join(tempDirectory, `AuthKey_${safeKeyId}.p8`)

  try {
    fs.writeFileSync(apiKeyPath, privateKey, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    fs.rmSync(tempDirectory, { recursive: true, force: true })
    throw error
  }

  return {
    apiKeyPath,
    cleanup: () => fs.rmSync(tempDirectory, { recursive: true, force: true }),
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const missingCredentials = ['APPLE_API_KEY_ID'].filter(name => !process.env[name])
  if (!process.env.APPLE_API_KEY && !process.env.APPLE_API_KEY_PATH) {
    missingCredentials.push('APPLE_API_KEY or APPLE_API_KEY_PATH')
  }
  if (missingCredentials.length > 0) {
    if (process.env.REQUIRE_NOTARIZATION === 'true') {
      throw new Error(`Missing notarization credentials: ${missingCredentials.join(', ')}`)
    }
    console.log(`skipping notarization: missing ${missingCredentials.join(', ')}`)
    return
  }

  const credentials = authentication()
  const resolvedApiKey = resolveApiKey()

  try {
    const appName = context.packager.appInfo.productFilename
    const appPath = path.join(appOutDir, `${appName}.app`)
    console.log(`starting notarization for ${appPath}`)

    const { notarize } = await import('@electron/notarize')
    await notarize({
      appPath,
      appleApiKey: resolvedApiKey.apiKeyPath,
      ...credentials,
    })
    console.log(`notarization completed for ${appPath}`)
  } finally {
    resolvedApiKey.cleanup()
  }
}

exports.resolveApiKey = resolveApiKey
exports.authentication = authentication
exports.decodeBase64PrivateKey = decodeBase64PrivateKey
