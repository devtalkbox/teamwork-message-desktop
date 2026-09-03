const fs = require('fs')
const path = require('path')

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
)
const expectedTag = `v${packageJson.version}`
const actualTag = process.env.GITHUB_REF_NAME

if (!actualTag) {
  throw new Error('GITHUB_REF_NAME is required for a release build')
}

if (actualTag !== expectedTag) {
  throw new Error(
    `Release tag ${actualTag} does not match package version ${packageJson.version}; expected ${expectedTag}`
  )
}

console.log(`Release tag ${actualTag} matches package version ${packageJson.version}`)
