require('dotenv').config()
const path = require('path')
const { notarize } = require('@electron/notarize')

const requiredCredentialNames = [
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
]

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context
    if (electronPlatformName !== 'darwin') {
        return
    }

    const missingCredentials = requiredCredentialNames.filter(name => !process.env[name])
    if (missingCredentials.length > 0) {
        if (process.env.REQUIRE_NOTARIZATION === 'true') {
            throw new Error(`Missing notarization credentials: ${missingCredentials.join(', ')}`)
        }
        console.log(`skipping notarization: missing ${missingCredentials.join(', ')}`)
        return
    }

    const appName = context.packager.appInfo.productFilename
    const appPath = path.join(appOutDir, `${appName}.app`)
    console.log(`starting notarization for ${appPath}`)

    await notarize({
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    })

    console.log(`notarization completed for ${appPath}`)
}
