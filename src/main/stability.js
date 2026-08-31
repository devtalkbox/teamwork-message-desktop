import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const stateFile = () => path.join(app.getPath('userData'), 'stability-state.json')
const diagnosticsFile = () => path.join(app.getPath('userData'), 'diagnostics.log')
const maxDiagnosticsSize = 1024 * 1024

const redactDetails = details => {
  try {
    return JSON.parse(
      JSON.stringify(details, (key, value) => {
        if (/password|token|authorization|cookie/i.test(key)) return '[redacted]'
        if (typeof value === 'string' && /url$/i.test(key)) {
          try {
            const url = new URL(value)
            url.search = ''
            url.hash = ''
            return url.toString()
          } catch (error) {
            return value.slice(0, 1000)
          }
        }
        return value
      }),
    )
  } catch (error) {
    return { message: 'Unable to serialize diagnostic details' }
  }
}

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch (error) {
    return { gpuCrashes: 0 }
  }
}

const writeState = state => {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
    fs.writeFileSync(stateFile(), JSON.stringify(state))
  } catch (error) {
    console.error('[stability] Failed to persist state', error)
  }
}

const writeDiagnostic = (type, details) => {
  try {
    const file = diagnosticsFile()
    if (fs.existsSync(file) && fs.statSync(file).size >= maxDiagnosticsSize) {
      const previous = `${file}.1`
      if (fs.existsSync(previous)) fs.unlinkSync(previous)
      fs.renameSync(file, previous)
    }
    const entry = JSON.stringify({ at: new Date().toISOString(), type, details: redactDetails(details) })
    fs.appendFileSync(file, `${entry}\n`, { mode: 0o600 })
  } catch (error) {
    console.error('[diagnostics] Failed to write log', error)
  }
}

const shouldUseSoftwareRendering = () =>
  process.argv.includes('--disable-gpu') || readState().gpuCrashes >= 2

const recordGpuCrash = details => {
  const state = readState()
  state.gpuCrashes = (state.gpuCrashes || 0) + 1
  state.lastGpuCrashAt = Date.now()
  writeState(state)
  writeDiagnostic('gpu-process-gone', details)
}

const markStableRun = () => {
  const state = readState()
  if (state.gpuCrashes) writeState({ gpuCrashes: 0, lastStableAt: Date.now() })
}

export { diagnosticsFile, markStableRun, recordGpuCrash, shouldUseSoftwareRendering, writeDiagnostic }
