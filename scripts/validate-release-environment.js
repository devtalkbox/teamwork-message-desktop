const requiredEnvironmentVariables = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
]

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  name => !process.env[name] || !process.env[name].trim(),
)

if (missingEnvironmentVariables.length > 0) {
  console.error(
    `::error title=Missing release credentials::Configure these GitHub Actions secrets in the environment selected by this workflow job (Settings > Environments): ${missingEnvironmentVariables.join(
      ', ',
    )}`,
  )
  process.exit(1)
}

console.log('All required signing and notarization credentials are configured')
