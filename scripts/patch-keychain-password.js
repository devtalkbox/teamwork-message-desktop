// Backport https://github.com/electron-userland/electron-builder/pull/10101
// to the locked electron-builder 24 dependency, without changing packaging APIs.
const fs = require('fs')
const path = require('path')

function patchSource(source) {
  const replacements = [
    [
      'importCerts(keychainFile, certPaths, [cscKeyPassword, cscIKeyPassword].filter(it => it != null))',
      'importCerts(keychainFile, certPaths, [cscKeyPassword, cscIKeyPassword].filter(it => it != null), keychainPassword)',
    ],
    [
      'async function importCerts(keychainFile, paths, keyPasswords)',
      'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)',
    ],
    [
      '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]',
      '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]',
    ],
  ]
  if (replacements.every(([, fixed]) => source.includes(fixed))) return source
  if (!replacements.every(([original]) => source.split(original).length === 2)) {
    throw new Error('Unsupported app-builder-lib signing implementation; review the keychain backport before building')
  }
  return replacements.reduce((result, [original, fixed]) => result.replace(original, fixed), source)
}

if (require.main === module) {
  const builderDirectory = path.dirname(require.resolve('electron-builder/package.json'))
  const target = require.resolve('app-builder-lib/out/codeSign/macCodeSign.js', { paths: [builderDirectory] })
  const original = fs.readFileSync(target, 'utf8')
  const patched = patchSource(original)
  if (patched !== original) fs.writeFileSync(target, patched)
  console.log('Verified electron-builder keychain password fix')
}

module.exports = { patchSource }
