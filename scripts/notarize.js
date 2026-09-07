require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const { notarize } = require('@electron/notarize')

const requiredCredentialNames = ['APPLE_API_KEY_ID', 'APPLE_API_ISSUER']

function validatePrivateKey(contents, sourceName) {
  const key = contents.toString('utf8').trim()
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----') || !key.endsWith('-----END PRIVATE KEY-----')) {
    throw new Error(`${sourceName} must contain the complete PKCS#8 .p8 private key`)
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

  const missingCredentials = requiredCredentialNames.filter(name => !process.env[name])
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

  const resolvedApiKey = resolveApiKey()

  try {
    const appName = context.packager.appInfo.productFilename
    const appPath = path.join(appOutDir, `${appName}.app`)
    console.log(`starting notarization for ${appPath}`)

    await notarize({
      appPath,
      appleApiKey: resolvedApiKey.apiKeyPath,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    })
    console.log(`notarization completed for ${appPath}`)
  } finally {
    resolvedApiKey.cleanup()
  }
}

exports.resolveApiKey = resolveApiKey
exports.decodeBase64PrivateKey = decodeBase64PrivateKey
