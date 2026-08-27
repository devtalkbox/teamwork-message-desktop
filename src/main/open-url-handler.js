import * as open from 'open'
import { config } from './config'

const isExternalUrl = url =>
  Boolean(
    url &&
    !url.startsWith(config.teamworkUrl) &&
    !url.startsWith(config.dashboardUrl) &&
    !url.startsWith(config.supportTicketUrl) &&
      !url.startsWith(config.googleOauth),
  )

const openUrlHandler = (event, url) => {
  if (isExternalUrl(url)) {
    event.preventDefault()
    return open(url)
  }
  return true
}

export { isExternalUrl, openUrlHandler }
