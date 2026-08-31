console.debug('running injected script')
// this ipc is isolated and exposed by main/preload.js
const ipc = window.TWW.ipc
const injectedCode = window.injectedCode
const urls = {
  dashboard: 'https://web.dashboard.gtomato.com',
  roomBooking: 'https://web.dashboard.gtomato.com/room-booking/standalone',
  supportTicket: 'https://osticket.gtomato.com/open.php',
  githubDownload: 'https://github.com/gaplo917/teamwork-wrap-plus/releases',
}
/**
 * Injection happens in create-main-window.js
 * @type {{
 * isBoldUsername: string,
 * isBorderless: string,
 * isBubbleDisplayDate: string,
 * isJFOpen: string,
 * isNotoSans: string,
 * isPingFang: string,
 * isSubpixel: string,
 * darkModeFixes: string,
 * }} */
const injectedCss = injectedCode['CSS']

/**
 * Injection happens in create-main-window.js
 * @type {{
 * gt: string,
 * sunny: string,
 * moon: string,
 * roomBooking: string,
 * supportTicket: string
 * }} */
const injectedSvg = injectedCode['SVG']

const defaultSettings = {
  isDark: true,
  isBorderless: true,
  isBoldUsername: true,
  isBubbleDisplayDate: true,
  isPingFang: true,
  isNotoSans: false,
  isJFOpen: false,
  isSubpixel: false,
}

class Storage {
  constructor() {
    const self = this
    this.onChangeHandlers = new Map()
    this.settings = new Proxy(defaultSettings, {
      get(target, name, receiver) {
        console.debug(`Getting ${name}`)
        return (window.localStorage.getItem(name) || (target[name] ? '1' : '0')) === '1'
      },
      set(target, name, value, receiver) {
        const convertedValue = value ? '1' : '0'
        console.debug(`Settings ${name}=${convertedValue}`)

        // update localstorage
        window.localStorage.setItem(name, convertedValue)

        // send to main process
        ipc.send('application-settings', JSON.stringify(self.getApplicationSettings()))

        // trigger registered handlers
        const handlers = self.onChangeHandlers.get(name) || []
        handlers.forEach(it => it(value))
      },
    })

    // send the application settings to main process for rendering the application menu
    ipc.send('application-settings', JSON.stringify(self.getApplicationSettings()))
  }

  getApplicationSettings() {
    return this.settings
  }

  /**
   * Listen the storage changes
   * @param key string
   * @param handler   passing the changed value in first arguments
   */
  on(key, handler) {
    const handlers = this.onChangeHandlers.get(key)
    if (Array.isArray(handlers)) {
      // mutate reference
      handlers.push(handler)
    } else {
      this.onChangeHandlers.set(key, [handler])
    }
  }
}

/**
 *
 * @returns {(function(*, *=): void)|*}
 */
function createDebounce() {
  let scheduledToken = null
  return (fn, ms) => {
    clearTimeout(scheduledToken)
    if (fn && ms) {
      scheduledToken = setTimeout(() => {
        fn()
      }, ms)
    }
  }
}

const storage = new Storage()

function registerDarkModeHandling() {
  console.debug('registerDarkModeHandling')

  const updateUI = isDark => {
    document.documentElement.classList.toggle('dark', isDark)
    if (document.body) {
      document.body.classList.toggle('dark', isDark)
    }

    if (isDark) {
      // noinspection JSUnresolvedVariable
      DarkReader.enable(
        {
          brightness: 150,
          contrast: 105,
          sepia: 0,
          grayscale: 0,
        },
        {
          invert: [],
          css: injectedCss.darkModeFixes, // this variable is injected from main process
        },
      )
    } else {
      DarkReader.disable()
    }
  }

  updateUI(storage.settings.isDark)

  // add script to DOM
  storage.on('isDark', value => {
    updateUI(value)
  })

  ipc.on('isDark', () => {
    storage.settings.isDark = !storage.settings.isDark
  })
}

function registerBooleanStyleSheet(key, { css }) {
  console.debug('registerBooleanStyleSheet', key, css)

  const style = document.createElement('style')
  style.innerText = css.trim()

  const updateUI = bool => {
    if (bool) {
      document.head.appendChild(style)
    } else {
      style.remove()
    }
  }

  updateUI(storage.settings[key])

  storage.on(key, value => {
    updateUI(value)
  })

  ipc.on(key, () => {
    storage.settings[key] = !storage.settings[key]
  })
}

function registerBadgeHandling() {
  console.debug('registerBadgeHandling')

  let lastTitle = ''

  function updateBadge() {
    const title = window.document.title

    if (lastTitle !== title) {
      lastTitle = title
      const matches = window.document.title.match(/\d+/)
      const count = matches === null ? 0 : matches.join('')

      ipc.send('badge', { count })

      console.log('Updated badge...', count)
    }
  }

  class NotificationWrapper extends window.Notification {
    constructor(title, options) {
      super(title, options)
      // wait next frame to update
      requestAnimationFrame(() => updateBadge())
    }
  }

  window.Notification = NotificationWrapper

  const titleNode = document.querySelector('title')
  if (!titleNode) return
  new MutationObserver(function () {
    // any changes to title will update the badge
    updateBadge()
  }).observe(titleNode, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
}

function registerResetRecommendedSettings() {
  ipc.on('reset-recommended-settings', () => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      storage.settings[key] = value
    }
  })
}

function registerDownloadLatestVersion() {
  ipc.on('download', () => {
    window.open(urls.githubDownload)
  })
}

function registerFontHandling() {
  registerBooleanStyleSheet('isPingFang', {
    css: injectedCss.isPingFang,
  })

  // handle isNotoSans
  registerBooleanStyleSheet('isNotoSans', {
    css: injectedCss.isNotoSans,
  })

  registerBooleanStyleSheet('isJFOpen', {
    css: injectedCss.isJFOpen,
  })

  storage.on('isPingFang', value => {
    if (value) {
      storage.settings.isNotoSans = false
      storage.settings.isJFOpen = false
    }
  })

  storage.on('isNotoSans', value => {
    if (value) {
      storage.settings.isPingFang = false
      storage.settings.isJFOpen = false
    }
  })

  storage.on('isJFOpen', value => {
    if (value) {
      storage.settings.isPingFang = false
      storage.settings.isNotoSans = false
    }
  })
}

/**
 * Emit CustomEvent('onRootMutate', { detail: MutationRecord[] }) when there is a change in root element
 */
const registerRootNodeMutationObserver = () => {
  // Select the node that will be observed for mutations
  // Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true }

  // Create an observer instance linked to the callback function
  let queuedMutations = []
  let scheduled = false
  const observer = new MutationObserver(function (mutationsList) {
    queuedMutations.push(...mutationsList)
    if (scheduled) return

    scheduled = true
    requestAnimationFrame(() => {
      const batch = queuedMutations
      queuedMutations = []
      scheduled = false
      window.dispatchEvent(
        new CustomEvent('onRootMutate', {
          bubbles: true,
          detail: batch,
        }),
      )
    })
  })

  const observeRoot = () => {
    const targetNode = document.getElementById('root')
    if (!targetNode) return false
    observer.observe(targetNode, config)
    return true
  }

  if (!observeRoot()) {
    const rootWaiter = new MutationObserver(() => {
      if (observeRoot()) rootWaiter.disconnect()
    })
    rootWaiter.observe(document.documentElement, { childList: true, subtree: true })
  }
}

function registerFunctionalButtons() {
  window.addEventListener(
    'onRootMutate',
    ({ detail: mutationsList }) => {
      for (let mutation of mutationsList) {
        if (
          mutation.type === 'childList' &&
          mutation.removedNodes.length === 1 &&
          mutation.removedNodes[0]?.className === 'SimpleSplashView'
        ) {
          const addButton = ({ id, onClick, icon, adjacentClass = '.action.task' }) => {
            const adjacentElement = mutation.target?.querySelector(adjacentClass)

            if (adjacentElement && !document.getElementById(id)) {
              adjacentElement.insertAdjacentHTML(
                'beforebegin',
                `<div class="action task"><div id="${id}" class="icon" style="fill:#fff">${icon}</div></div>`,
              )
              // require to get it in runtime when the dom tree has changed
              document.getElementById(id)?.addEventListener('click', onClick)
            }
          }

          addButton({
            id: 'dark-toggle',
            adjacentClass: '.action.more',
            onClick: evt => {
              if (storage.settings.isDark) {
                storage.settings.isDark = false
                storage.settings.isBorderless = false
                evt.target.outerHTML = injectedSvg.moon
              } else {
                storage.settings.isDark = true
                storage.settings.isBorderless = true
                evt.target.outerHTML = injectedSvg.sunny
              }
            },
            icon: storage.settings.isDark ? injectedSvg.sunny : injectedSvg.moon,
          })

          // os ticket button
          addButton({
            id: 'os-ticket',
            onClick: () => {
              window.open(urls.supportTicket, null, 'width=1440,height=900')
            },
            icon: injectedSvg.supportTicket,
          })

          // room booking button
          addButton({
            id: 'room-booking',
            onClick: () => {
              window.open(
                `${urls.roomBooking}?appKey=${window.options.client.appKey}&appToken=${window.options.client.token}`,
                null,
                'width=1440,height=900',
              )
            },
            icon: injectedSvg.roomBooking,
          })

          // dashboard button
          addButton({
            id: 'dashboard',
            onClick: () => {
              window.open(
                `${urls.dashboard}/?appKey=${window.options.client.appKey}&appToken=${window.options.client.token}`,
                null,
                'width=1440,height=900',
              )
            },
            icon: injectedSvg.gt,
          })
        }
      }
    },
    { passive: true },
  )
}

/**
 * Handled two scenarios
 * 1. update side bar chat box when editing draft
 * 2. update side bar chat box when scrolling in a virtual list
 */
function registerDraftHandling() {
  const displayNameIdMap = new Map()
  let currentChatBoxId = null
  let currentUpdateEditAreaDraftDebounce = null

  const sanitizeDraftHtml = value => {
    const template = document.createElement('template')
    template.innerHTML = String(value || '').slice(0, 100000)
    const allowedTags = new Set(['A', 'B', 'BR', 'CODE', 'DIV', 'EM', 'I', 'P', 'S', 'SPAN', 'STRONG', 'U'])

    template.content
      .querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta')
      .forEach(element => element.remove())

    Array.from(template.content.querySelectorAll('*')).forEach(element => {
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(...element.childNodes)
        return
      }

      Array.from(element.attributes).forEach(attribute => {
        const keepSafeLink =
          element.tagName === 'A' &&
          attribute.name === 'href' &&
          (() => {
            try {
              return ['http:', 'https:'].includes(new URL(attribute.value, window.location.href).protocol)
            } catch (error) {
              return false
            }
        })()
        if (!keepSafeLink) element.removeAttribute(attribute.name)
      })
      if (element.tagName === 'A' && element.hasAttribute('href')) element.setAttribute('rel', 'noreferrer')
    })

    return template.innerHTML
  }

  const chatBoxKey = () => {
    const displayName = document.querySelector('#root .NavigationBar .Avatar .displayName')?.textContent?.trim()
    if (!displayName) return null
    const isGroup = document.querySelector('#root .NavigationBar .Avatar .title')?.textContent?.indexOf('people') >= 0
    return isGroup ? displayNameIdMap.get('g' + displayName) : displayNameIdMap.get('u' + displayName)
  }
  const updateChatBoxDebounce = createDebounce()

  function updateChatBoxDOM({ chatBox, draft, inputMode }) {
    const draftEl = chatBox?.querySelector('.who > .draft')
    const draftTextEl = chatBox?.querySelector('.what > .draft')
    const textEl = chatBox?.querySelector('.what > .text, .what > .nonText')
    const memberEl = chatBox?.querySelector('.who > .member')

    if (draft === '' || draft === undefined || draft === null) {
      if (!inputMode) {
        // not input mode, don't need to modify the DOM, i.e. scrolling on the chatbox list
        return
      }

      // the draft is empty, rollback the html
      if (draftEl) {
        // remove if there is a redundant element
        draftEl.parentElement.remove()
      }

      if (draftTextEl) {
        draftTextEl.parentElement.remove()
      }

      if (memberEl) {
        // set the member element back to visible
        memberEl.style.display = 'initial'
      }

      if (textEl) {
        textEl.style.display = 'initial'
      }
    } else {
      const safeDraft = sanitizeDraftHtml(draft)
      // has draft
      // set the member element to none first
      if (memberEl) {
        memberEl.style.display = 'none'
      }

      if (textEl) {
        textEl.style.display = 'none'
      }

      if (draftTextEl) {
        draftTextEl.innerHTML = safeDraft
      } else {
        chatBox
          ?.querySelector('.subject')
          ?.insertAdjacentHTML(
            'afterend',
            `<div class="what"><span class="draft"><span>${safeDraft}</span></span></div>`,
          )
      }

      if (draftEl) {
        draftEl.textContent = 'Draft:'
      } else {
        chatBox
          ?.querySelector('.subject')
          ?.insertAdjacentHTML(
            'afterend',
            '<div class="who"><span class="draft"><span>Draft:</span></span></div>',
          )
      }
    }
  }

  window.addEventListener(
    'onRootMutate',
    ({ detail: mutationsList }) => {
      for (let mutation of mutationsList) {
        if (
          mutation.type === 'childList' &&
          mutation.addedNodes.length === 0 &&
          mutation.target &&
          mutation.target.className === 'ChatView' &&
          mutation.nextSibling &&
          mutation.nextSibling.className === 'InputBox'
        ) {
          const editArea = mutation.target.querySelector('.Editable')
          const cbKey = chatBoxKey()
          if (currentChatBoxId === cbKey) {
            // early return when we are in the same ui
            // to trigger this behaviour, selecting a member name from @xxx
            editArea?.dispatchEvent(new Event('input'))
          } else {
            currentChatBoxId = cbKey

            // clean up previous debounce
            currentUpdateEditAreaDraftDebounce?.()

            currentUpdateEditAreaDraftDebounce = createDebounce()

            if (editArea) {
              // register to write draft the localStorage
              editArea.addEventListener(
                'input',
                event => {
                  // event handling code for sane browsers
                  const value = event.target.innerHTML

                  currentUpdateEditAreaDraftDebounce(() => {
                    if (!cbKey) return
                    const safeValue = sanitizeDraftHtml(value)
                    window.localStorage.setItem(cbKey, safeValue)

                    const chatBox = document.querySelector(`.item[data-conversation-id="${cbKey}"]`)

                    updateChatBoxDOM({ chatBox, draft: safeValue, inputMode: true })
                  }, 100)
                },
                { passive: true },
              )

              const restoredDraft = cbKey ? window.localStorage.getItem(cbKey) : null

              if (restoredDraft && editArea.innerHTML !== restoredDraft) {
                // restore the draft
                const safeRestoredDraft = sanitizeDraftHtml(restoredDraft)
                editArea.innerHTML = safeRestoredDraft
                if (safeRestoredDraft !== restoredDraft) window.localStorage.setItem(cbKey, safeRestoredDraft)
              }
            }
          }
        }
        if (
          mutation.target?.className === 'ReactVirtualized__Grid__innerScrollContainer' ||
          mutation.target?.className === 'ReactVirtualized__Grid ReactVirtualized__List'
        ) {
          // handle virtual list scrolling will flush the html without draft
          updateChatBoxDebounce(() => {
            document.querySelectorAll('.ReactVirtualized__List .item').forEach((chatBox, index, parent) => {
              const cbKey = parent[index].getAttribute('data-conversation-id')
              const savedDraft = window.localStorage.getItem(cbKey)
              if (savedDraft === null || savedDraft === undefined || savedDraft === '') {
                // no draft do nothing
              }

              // just schedule the UI change for next frame to keep the application smooth
              requestAnimationFrame(() => {
                updateChatBoxDOM({ chatBox, draft: savedDraft, inputMode: false })
              })
            })
          }, 8)
        }
      }
    },
    { passive: true },
  )

  // get the intercepted response and build up the data we need for draft notes handling
  window.addEventListener(
    'onXHRResponse',
    ({ detail: { method, url, responseText, data } }) => {
      if (!responseText) return
      const isDraftEndpoint =
        url.endsWith('api/group') || url.endsWith('api/user') || url.endsWith('api/message/sendMsg')
      if (!isDraftEndpoint) return

      let responseJson
      try {
        responseJson = JSON.parse(responseText)
      } catch (error) {
        console.warn('Unable to parse Teamwork API response', url, error)
        return
      }

      if (url.endsWith('api/group')) {
        if (responseJson?.data && Array.isArray(responseJson.data)) {
          responseJson.data.forEach(group => {
            displayNameIdMap.set('g' + group.name, 'g' + group.groupId)
          })
        }
      } else if (url.endsWith('api/user')) {
        if (responseJson?.data && Array.isArray(responseJson.data)) {
          responseJson.data
            .filter(user => user.deleted !== true)
            .forEach(user => {
              displayNameIdMap.set('u' + user.displayName, 'u' + user.tbId)
            })
        }
      } else if (url.endsWith('api/message/sendMsg')) {
        document.getElementsByClassName('Editable')[0]?.dispatchEvent(new Event('input'))
      }
    },
    { passive: true },
  )
}

/**
 * Emit CustomEvent('onXHRResponse', { detail: { url: string, method: string, responseText: string } }) when there is XHR
 * Emit CustomEvent('onXHRSend', { detail: string }) when there is XHR
 */
function registerXHRInterceptor() {
  const rawOpen = XMLHttpRequest.prototype.open
  const rawSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url) {
    this._method = method
    this._url = url
    rawOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function (data) {
    this._data = data
    window.dispatchEvent(
      new CustomEvent('onXHRSend', {
        detail: { data, url: this.url },
      }),
    )

    this.addEventListener(
      'loadend',
      () => {
        if (this.responseType !== '' && this.responseType !== 'text') return

        window.dispatchEvent(
          new CustomEvent('onXHRResponse', {
            detail: {
              url: this._url,
              method: this._method,
              data: this._data,
              responseText: this.responseText,
            },
          }),
        )
      },
      { once: true },
    )

    rawSend.apply(this, arguments)
  }
}

function registerWebSocketInterceptor() {
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(target, args) {
      console.log('Proxying WebSocket connection', ...args)
      const ws = new target(...args)

      // Configurable hooks
      ws.hooks = {
        beforeSend: () => null,
        beforeReceive: () => null,
      }

      // Intercept send
      ws.send = new Proxy(ws.send, {
        apply(target, thisArg, args) {
          if (ws.hooks.beforeSend(args) === false) {
            return
          }
          return target.apply(thisArg, args)
        },
      })

      // Intercept events
      ws.addEventListener = new Proxy(ws.addEventListener, {
        apply(target, thisArg, args) {
          if (args[0] === 'message' && ws.hooks.beforeReceive(args) === false) {
            return
          }
          return target.apply(thisArg, args)
        },
      })

      Object.defineProperty(ws, 'onmessage', {
        set(func) {
          const onmessage = function onMessageProxy(event) {
            if (ws.hooks.beforeReceive(event) === false) {
              return
            }
            func.call(this, event)
          }
          return ws.addEventListener.apply(this, ['message', onmessage, false])
        },
      })

      // Save reference
      window._websockets = window._websockets || []
      window._websockets.push(ws)
      window.dispatchEvent(new Event('onWebsocketCreated'))

      return ws
    },
  })

  window.addEventListener('onWebsocketCreated', () => {
    window._websockets[0].hooks = {
      // Just log the outgoing request
      beforeSend: data => window.dispatchEvent(new CustomEvent('onWebSocketSend', { detail: data })),
      // Return false to prevent the on message callback from being invoked
      beforeReceive: data => window.dispatchEvent(new CustomEvent('onWebSocketReceive', { detail: data })),
    }
  })
}

function registerAutoScroll() {
  const registeredScrollViews = new WeakSet()
  window.addEventListener(
    'onRootMutate',
    ({ detail: mutationsList }) => {
      for (let mutation of mutationsList) {
        if (
          mutation.type === 'childList' &&
          mutation.addedNodes.length === 0 &&
          mutation.target &&
          mutation.target.className === 'ChatView'
        ) {
          const scrollView = document.querySelector('.scrollView')
          if (!scrollView) continue
          scrollView.style['overflow-anchor'] = 'auto'
          scrollView.style['overflow-y'] = 'scroll'

          if (!registeredScrollViews.has(scrollView)) {
            registeredScrollViews.add(scrollView)
            scrollView.addEventListener(
              'scroll',
              e => {
                if (e.target.scrollTop < 150) {
                  e.target.querySelector('.previousButton')?.click()
                }
              },
              { passive: true },
            )
          }
        }
      }
    },
    { passive: true },
  )
}

/**
 * The legacy web client can occasionally finish a first-time login without
 * mounting its workspace. Credentials have already been persisted at that
 * point, so the same manual refresh that recovers the app can be performed
 * safely. Only report a continuously empty root after the password form has
 * actually disappeared; the main process limits recovery to once per window.
 */
function registerPostLoginBlankScreenRecovery() {
  let sawPasswordForm = Boolean(document.querySelector('input[type="password"]'))
  let transitionStartedAt = 0
  let blankChecks = 0
  let reported = false
  let workspaceReadyReported = false
  let workspaceReadySince = 0

  const workspaceSelectors = [
    '.RecentMessageView',
    '.TopBar',
    '.ConversationView .NavigationBar',
    '.ConversationView .MessageView',
  ]

  const check = () => {
    if (document.hidden) return
    if (reported) return

    const passwordVisible = Array.from(document.querySelectorAll('input[type="password"]')).some(
      input => input.offsetWidth || input.offsetHeight || input.getClientRects().length,
    )
    if (passwordVisible) {
      sawPasswordForm = true
      transitionStartedAt = 0
      blankChecks = 0
      reported = false
      workspaceReadyReported = false
      workspaceReadySince = 0
      return
    }

    if (!sawPasswordForm) return
    if (!transitionStartedAt) transitionStartedAt = Date.now()

    const workspaceReady = workspaceSelectors.some(selector => document.querySelector(selector))
    if (workspaceReady) {
      // Keep the watchdog armed. The legacy client can mount the workspace
      // briefly and then lose it when a later async initializer fails.
      transitionStartedAt = 0
      blankChecks = 0
      reported = false
      if (!workspaceReadySince) workspaceReadySince = Date.now()
      if (!workspaceReadyReported && Date.now() - workspaceReadySince >= 30000) {
        workspaceReadyReported = true
        ipc.send('workspace-ready', {})
      }
      return
    }

    workspaceReadySince = 0
    if (!transitionStartedAt) transitionStartedAt = Date.now()
    blankChecks += 1

    // Allow normal first-login initialization plenty of time. Requiring four
    // consecutive empty checks avoids reacting to brief React route changes.
    if (Date.now() - transitionStartedAt >= 12000 && blankChecks >= 4) {
      reported = true
      console.warn('[post-login-recovery] Reporting an empty workspace after login')
      ipc.send('post-login-blank-screen', { elapsed: Date.now() - transitionStartedAt })
    }
  }

  setInterval(check, 1000)
}

/**
 * A desktop app is expected to keep the session between launches. The legacy
 * login page defaults "Remember me" to off, which makes an otherwise valid
 * login disappear as soon as Electron exits. Select that option whenever the
 * password form is shown and use a real click so React receives the change.
 */
function registerPersistentLogin() {
  const ensureRememberMe = () => {
    const passwordInput = document.querySelector('input[type="password"]')
    if (!passwordInput) return

    const loginContainer = passwordInput.closest('.LoginView, form') || document
    const checkboxes = Array.from(loginContainer.querySelectorAll('input[type="checkbox"]'))
    const rememberCheckbox =
      checkboxes.find(checkbox => /remember/i.test(checkbox.parentElement?.textContent || '')) ||
      checkboxes[0]

    if (rememberCheckbox && !rememberCheckbox.checked) {
      rememberCheckbox.click()
      console.log('[persistent-login] Remember me enabled')
    }
  }

  ensureRememberMe()
  const observer = new MutationObserver(ensureRememberMe)
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

// register XHR intercept the dispatch CustomEvent for post-processing
registerXHRInterceptor()

//// register websocket interceptor
// registerWebSocketInterceptor()

// register DOM change listener
registerRootNodeMutationObserver()

// add draft handling
registerDraftHandling()

// add new functional buttons to menu bar
registerFunctionalButtons()

// handle dark mode
registerDarkModeHandling()

// handle font
registerFontHandling()

// handle isSubpixel
registerBooleanStyleSheet('isSubpixel', {
  css: injectedCss.isSubpixel,
})

// handle isBorderless
registerBooleanStyleSheet('isBorderless', {
  css: injectedCss.isBorderless,
})

// handle isBoldUsername
registerBooleanStyleSheet('isBoldUsername', {
  css: injectedCss.isBoldUsername,
})

// handle isBubbleDisplayDate
registerBooleanStyleSheet('isBubbleDisplayDate', {
  css: injectedCss.isBubbleDisplayDate,
})

// handle docking badge
registerBadgeHandling()

// handle recommended settings
registerResetRecommendedSettings()

// handle download latest version
registerDownloadLatestVersion()

registerAutoScroll()

registerPersistentLogin()

registerPostLoginBlankScreenRecovery()
