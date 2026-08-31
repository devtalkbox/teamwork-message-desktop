import { shell } from 'electron'
import { config } from './config'

const parseUrl = value => {
  try {
    return new URL(value)
  } catch (error) {
    return null
  }
}

const appOrigin = parseUrl(config.appUrl)?.origin

const isTrustedAppUrl = value => {
  const url = parseUrl(value)
  return Boolean(url && appOrigin && url.origin === appOrigin)
}

const isSafeExternalUrl = value => {
  const url = parseUrl(value)
  if (!url) return false
  if (url.protocol === 'https:') return true
  return config.development && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
}

const openExternalUrl = value => {
  if (!isSafeExternalUrl(value)) {
    console.warn('[external-url] Blocked unsafe URL', value)
    return false
  }
  shell.openExternal(value).catch(error => console.error('[external-url] Failed to open URL', error))
  return true
}

const openUrlHandler = (event, url) => {
  if (isTrustedAppUrl(url)) return true
  event.preventDefault()
  return openExternalUrl(url)
}

export { isSafeExternalUrl, isTrustedAppUrl, openExternalUrl, openUrlHandler }
