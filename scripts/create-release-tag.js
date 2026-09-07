const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectDirectory = path.join(__dirname, '..')
const packageJsonPath = path.join(projectDirectory, 'package.json')
const supportedReleaseTypes = new Set(['patch', 'minor', 'major'])

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Version must use the stable semantic version format X.Y.Z; received ${version}`)
  }

  return match.slice(1).map(Number)
}

function nextVersion(currentVersion, requestedVersion = 'patch') {
  if (/^\d+\.\d+\.\d+$/.test(requestedVersion)) {
    const currentParts = parseVersion(currentVersion)
    const requestedParts = parseVersion(requestedVersion)
    const isNewer = requestedParts.some((part, index) => {
      const previousPartsAreEqual = requestedParts
        .slice(0, index)
        .every((value, previousIndex) => value === currentParts[previousIndex])
      return previousPartsAreEqual && part > currentParts[index]
    })
    if (!isNewer) {
      throw new Error(`Explicit version ${requestedVersion} must be newer than ${currentVersion}`)
    }
    return requestedVersion
  }

  if (!supportedReleaseTypes.has(requestedVersion)) {
    throw new Error('Release type must be patch, minor, major, or an explicit X.Y.Z version')
  }

  const [major, minor, patch] = parseVersion(currentVersion)
  if (requestedVersion === 'major') {
    return `${major + 1}.0.0`
  }
  if (requestedVersion === 'minor') {
    return `${major}.${minor + 1}.0`
  }
  return `${major}.${minor}.${patch + 1}`
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: projectDirectory,
    encoding: 'utf8',
  }).trim()
}

function assertReleaseCanBeCreated(tag) {
  const branch = gitOutput(['branch', '--show-current'])
  if (!branch) {
    throw new Error('Cannot create a release tag from a detached HEAD')
  }
  if (branch !== 'main') {
    throw new Error(`Release tags must be created from main; current branch is ${branch}`)
  }

  if (gitOutput(['status', '--porcelain'])) {
    throw new Error('Commit or stash all working tree changes before creating a release tag')
  }

  const existingTag = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`], {
    cwd: projectDirectory,
    stdio: 'ignore',
  })
  if (existingTag.status === 0) {
    throw new Error(`Tag ${tag} already exists`)
  }
}

function createReleaseTag(requestedVersion = 'patch') {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const version = nextVersion(packageJson.version, requestedVersion)
  const tag = `v${version}`

  assertReleaseCanBeCreated(tag)

  execFileSync('yarn', ['version', '--new-version', version, '--message', 'chore(release): v%s'], {
    cwd: projectDirectory,
    stdio: 'inherit',
  })

  console.log(`Created release commit and tag ${tag}`)
  console.log('Push them with: git push origin HEAD --follow-tags')
}

if (require.main === module) {
  try {
    createReleaseTag(process.argv[2] || 'patch')
  } catch (error) {
    console.error(`Unable to create release tag: ${error.message}`)
    process.exit(1)
  }
}

module.exports = { nextVersion, parseVersion }
