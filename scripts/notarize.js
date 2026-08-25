require('dotenv').config();
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    // Skip notarization when no Apple ID credentials are configured
    // (e.g. local unsigned builds with -c.mac.identity=null)
    if (!process.env.APPLEID || !process.env.APPLEIDPASS) {
        console.log('skipping notarization: APPLEID / APPLEIDPASS not set');
        return;
    }
    console.log('starting to notarizing')

    const appName = context.packager.appInfo.productFilename;

    return await notarize({
        appBundleId: 'com.gaplotech.teamwork-wrapper',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLEID,
        appleIdPassword: process.env.APPLEIDPASS,
    });
};
