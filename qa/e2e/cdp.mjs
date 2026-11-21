// A small browser driver over the Chrome DevTools Protocol, for the installed Microsoft Edge.
// Same idea as Playwright (which can't be installed on this network), without any package.
// Each `newPage()` opens in its own browser context: separate localStorage and cookies, so
// several people (operator, supervisor, manager) can be signed in at once.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p))

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ port = 9340, headless = true } = {}) {
  if (!EDGE) throw new Error('Microsoft Edge not found')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mpcr-e2e-'))
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank']
  if (headless) args.unshift('--headless=new')
  const proc = spawn(EDGE, args, { stdio: 'ignore' })
  let url
  for (let i = 0; i < 80 && !url; i++) {
    await sleep(250)
    try {
      url = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
  }
  if (!url) throw new Error('Edge did not start')
  const ws = new WebSocket(url)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  return new Browser(proc, ws, profile)
}

class Browser {
  constructor(proc, ws, profile) {
    this.proc = proc
    this.ws = ws
    this.profile = profile
    this.id = 0
    this.waiting = new Map()
    this.sessions = new Map()
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.waiting.has(msg.id)) {
        this.waiting.get(msg.id)(msg)
        this.waiting.delete(msg.id)
      } else if (msg.sessionId && this.sessions.has(msg.sessionId)) this.sessions.get(msg.sessionId).onEvent(msg)
    }
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const n = ++this.id
      this.waiting.set(n, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)))
      this.ws.send(JSON.stringify({ id: n, method, params, ...(sessionId && { sessionId }) }))
    })
  }

  // `block`: URL patterns the page may not load (e.g. a host the network firewall drops).
  async newPage({ width = 1920, height = 1080, downloads, block } = {}) {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true })
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(this, sessionId, targetId, browserContextId)
    this.sessions.set(sessionId, page)
    await page.send('Runtime.enable')
    await page.send('Page.enable')
    await page.send('Network.enable')
    await page.viewport(width, height)
    if (block?.length) await page.send('Network.setBlockedURLs', { urls: block })
    if (downloads) await this.send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId, downloadPath: downloads })
    return page
  }

  async close() {
    try {
      await this.send('Browser.close')
    } catch {
      /* already gone */
    }
    this.proc.kill()
    try {
      fs.rmSync(this.profile, { recursive: true, force: true })
    } catch {
      /* Edge still holds files for a moment */
    }
  }
}

class Page {
  constructor(browser, sessionId, targetId, contextId) {
    Object.assign(this, { browser, sessionId, targetId, contextId })
    this.errors = [] // console errors and uncaught exceptions
    this.failed = [] // HTTP 5xx and network failures
    this.dialogs = [] // alert / confirm / prompt that opened (e.g. from injected script)
    this.requests = new Map()
  }

  send(method, params) {
    return this.browser.send(method, params, this.sessionId)
  }

  onEvent({ method, params }) {
    if (method === 'Runtime.exceptionThrown') this.errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text)
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') this.errors.push(params.args.map((a) => a.value ?? a.description).join(' '))
    if (method === 'Network.requestWillBeSent') this.requests.set(params.requestId, params.request.url)
    if (method === 'Network.responseReceived' && params.response.status >= 500) this.failed.push(`${params.response.status} ${params.response.url}`)
    if (method === 'Network.loadingFailed' && !params.canceled) this.failed.push(`${params.errorText} ${this.requests.get(params.requestId) ?? ''}`)
    if (method === 'Page.javascriptDialogOpening') {
      this.dialogs.push(params.message)
      this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
    }
  }

  async viewport(width, height) {
    this.size = { width, height }
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await this.waitFor('document.readyState === "complete"', 15000)
  }

  async reload() {
    await this.send('Page.reload')
    await sleep(300)
    await this.waitFor('document.readyState === "complete"', 15000)
  }

  // Runs JavaScript in the page; returns the value (promises are awaited).
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`In page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }

  async waitFor(expression, timeout = 8000, what = expression) {
    const end = Date.now() + timeout
    let last
    while (Date.now() < end) {
      try {
        // A DOM element can't be sent back by value: count it as "found".
        last = await this.eval(`(() => { const v = (${expression}); return v instanceof Node ? true : v })()`)
        if (last) return last
      } catch (e) {
        last = e.message
      }
      await sleep(150)
    }
    throw new Error(`Timed out waiting for: ${what}`)
  }

  // Clicks the first element matching the selector (and, if given, containing the text).
  async click(selector, text) {
    const ok = await this.eval(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((e) => ${text == null ? 'true' : `e.textContent.includes(${JSON.stringify(text)})`} && !e.disabled)
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      el.click()
      return true
    })()`)
    if (!ok) throw new Error(`Nothing to click: ${selector}${text ? ` with "${text}"` : ''}`)
  }

  // Types into an input like a keyboard: the field is emptied (with a React-visible input event),
  // then the text is inserted as real keyboard input.
  async type(selector, text) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.focus()
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (!ok) throw new Error(`No field: ${selector}`)
    if (text) await this.send('Input.insertText', { text: String(text) })
  }

  async press(key) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key })
  }

  text(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`)
  }

  count(selector) {
    return this.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
  }

  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return file
  }

  offline(on) {
    return this.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  }

  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {})
    this.browser.sessions.delete(this.sessionId)
  }
}
