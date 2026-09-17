const fs = require('fs')
const path = require('path')

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
)

const channel = process.env.RELEASE_CHANNEL || 'production'
const releaseTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME

if (!releaseTag) {
  throw new Error('RELEASE_TAG (or GITHUB_REF_NAME) is required for a release build')
}

if (channel !== 'staging' && channel !== 'production') {
  throw new Error(`Unknown release channel ${channel}; expected staging or production`)
}

// A staging release previews the same version as the production release, and is
// told apart by a -staging.<n> suffix so the tag, the GitHub release and the
// artifact names can never collide with the production ones.
const stagingSuffix = /-staging\.(\d+)$/
const isStagingTag = stagingSuffix.test(releaseTag)

if (channel === 'staging' && !isStagingTag) {
  throw new Error(
    `Staging releases must use a -staging.<n> tag (for example v${packageJson.version}-staging.1); received ${releaseTag}`
  )
}

if (channel === 'production' && isStagingTag) {
  throw new Error(`Tag ${releaseTag} is a staging tag, but the release channel is production`)
}

const versionPart = isStagingTag ? releaseTag.replace(stagingSuffix, '') : releaseTag
const expectedTag = `v${packageJson.version}`

if (versionPart !== expectedTag) {
  throw new Error(
    `Release tag ${releaseTag} does not match package version ${packageJson.version}; expected ${expectedTag}`
  )
}

console.log(
  `Release tag ${releaseTag} matches package version ${packageJson.version} (${channel})`
)