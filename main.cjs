/**
 * Prism — main process.
 *
 * Three jobs and no more: own the window, send HTTP requests the renderer is
 * not allowed to send itself, and read or write files the user picks.
 *
 * The renderer runs sandboxed with no Node access, so every capability it has
 * is one of the handlers below. That is the whole security model: if it is not
 * in this file, the page cannot do it.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, screen, shell, safeStorage } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, readdirSync, statSync } = require('node:fs')
// Electron already exports a `net`; this is the socket one.
const sockets = require('node:net')
const tls = require('node:tls')
const { join, extname, basename } = require('node:path')
const { pathToFileURL } = require('node:url')
const http = require('node:http')
const https = require('node:https')

// The whole app directory, not just renderer/: the page imports ../lib/*,
// which resolves above the HTML and would otherwise 404 with no error the
// renderer can report.
const ROOT = __dirname

/**
 * Served over a real origin rather than file://.
 *
 * ES modules are blocked over file:// by the same-origin rules, and the whole
 * renderer is written as modules. A custom scheme also gives the page a stable
 * origin, so storage behaves.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'prism', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

/** @type {BrowserWindow | null} */
let win = null

/**
 * The cookie jar, and where the workspace lives.
 *
 * lib/ is ESM and this file is CommonJS, so the jar is pulled in with a
 * dynamic import once at startup rather than at the top.
 */
let jar = null
const jarReady = import('./lib/cookies.js').then((m) => {
  jar = new m.Jar()
})

/**
 * The app icon, for the window frame and the taskbar.
 *
 * electron-builder stamps build/icon.ico into the packaged executable, which
 * covers the installed app on Windows -- but a BrowserWindow needs a real file,
 * and on Linux the window manager reads the window icon rather than the binary.
 * So nothing set an icon at runtime and a dev run showed Electron's own logo.
 *
 * Both locations are tried because build/ is a build resource that does not
 * ship inside the app bundle: packaged, the file sits beside it in resources.
 */
function appIcon() {
  const candidates = [join(process.resourcesPath || '', 'icon.png'), join(__dirname, 'build', 'icon.png')]
  return candidates.find((file) => existsSync(file))
}

function createWindow() {
  const icon = appIcon()

  /**
   * Sized against the screen rather than a fixed guess.
   *
   * A hard 1560x980 with a 1120x700 minimum is bigger than a real laptop. A
   * 1366x768 panel at 150% scaling reports a work area of 1280x672 points — so
   * the window opened wider *and* taller than the whole desktop, and the
   * minimum height alone exceeded it. That is what made the top bar look
   * crowded on a laptop and roomy on a monitor: the bar was fine, the window
   * was larger than the space it had.
   *
   * The minimums are clamped too. A minimum a display cannot satisfy is not a
   * minimum, it is a window the user cannot make fit.
   */
  const area = screen.getPrimaryDisplay().workAreaSize
  // A couple of points of inset. Fractional scaling rounds DIP sizes up, so
  // asking for exactly the work area produced a window one or two pixels
  // wider than the desktop -- and it reads better not flush to the edges.
  const fit = (want, available) => Math.max(480, Math.min(want, available - 16))

  win = new BrowserWindow({
    width: fit(1560, area.width),
    height: fit(980, area.height),
    minWidth: fit(1120, area.width),
    minHeight: fit(700, area.height),
    show: false,
    frame: false,
    backgroundColor: '#08090C',
    ...(icon ? { icon } : {}),
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      // Scheduled runs keep their times while the window is minimised.
      backgroundThrottling: false,
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.loadURL('prism://app/renderer/index.html')

  if (process.argv.includes('--devtools')) win.webContents.openDevTools({ mode: 'detach' })

  const push = () => win?.webContents.send('window:state', { maximized: win?.isMaximized() ?? false })
  win.on('maximize', push)
  win.on('unmaximize', push)

  /**
   * Every way of closing goes through the page first.
   *
   * Only the in-app close button used to flush the autosave and ask about the
   * open file. Alt+F4, the taskbar, Cmd+Q and a system shutdown all went
   * straight past it, and the last few seconds of edits -- plus any unsaved
   * file changes -- went with them. So the close is held, the page is asked,
   * and it answers with `window:closeNow` once it has saved or been told not
   * to. A page that has crashed or never started cannot answer, and must not
   * be able to keep the window open.
   */
  closing = false
  win.on('close', (e) => {
    if (closing || !win || !pageReady || win.webContents.isCrashed()) return
    e.preventDefault()
    win.webContents.send('window:closeRequested')
  })
  win.webContents.on('render-process-gone', () => {
    pageReady = false
  })
  win.webContents.on('did-start-loading', () => {
    pageReady = false
  })
  win.on('closed', () => {
    win = null
  })
}

/** Set once the page has said it can answer a close; cleared on reload. */
let pageReady = false
/** Set once the page has finished with a close, so the next one goes through. */
let closing = false

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

/**
 * Where the working state is kept between sessions.
 *
 * One file, written atomically — a workspace half-written because the machine
 * lost power is worse than one a session out of date, so the new copy is
 * written beside the old and moved over it only once it is complete.
 */
const stateDir = () => join(app.getPath('userData'), 'state')
const autosavePath = () => join(stateDir(), 'workspace.json')

/**
 * Which file the last session was editing.
 *
 * Kept beside the autosave rather than inside it: the autosave is written in
 * the same format as a user's own `.prism.json`, and a machine-local absolute
 * path has no business in a file people commit and send to each other.
 *
 * Kept in the *main* process rather than in the renderer's storage for a
 * second reason. `workspace:write` only accepts paths the user pointed a
 * dialog at, which is what stops the page naming its own — and that set is
 * session-scoped, so a remembered path would be refused on the next start. A
 * path this process wrote down itself, after a real dialog, is one it can
 * vouch for; a path handed over by the renderer is not.
 */
const sessionPath = () => join(stateDir(), 'session.json')

function rememberFile(path) {
  try {
    writeAtomic(sessionPath(), JSON.stringify({ filePath: String(path ?? ''), at: Date.now() }, null, 2))
  } catch {
    /* the pointer is a convenience; losing it costs one Save As */
  }
}

/** The remembered file, if it is still on disk. */
function lastFile() {
  try {
    if (!existsSync(sessionPath())) return ''
    const held = JSON.parse(readFileSync(sessionPath(), 'utf8'))
    const path = String(held?.filePath ?? '')
    // A file that has been moved or deleted is not a file to offer back -- and
    // neither is one that is not a workspace. Older builds remembered imported
    // collections and datasets here, and handing one back made Save overwrite it.
    if (!path || !existsSync(path)) return ''
    // A workspace kept as a folder is remembered by its folder.
    if (statSync(path).isDirectory()) return existsSync(join(path, 'prism.workspace.json')) ? path : ''
    return isWorkspaceText(readFileSync(path, 'utf8')) ? path : ''
  } catch {
    return ''
  }
}

function writeAtomic(path, text) {
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.writing`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, path)
}

/**
 * One Prism at a time.
 *
 * A second launch used to start a rival copy that fought the first for the
 * same cache and the same autosave file -- the cache half of that is the
 * "Unable to move the cache: Access is denied" noise in the terminal. Now a
 * second launch hands over to the first: its window comes forward, or one is
 * opened if it has none, and the newcomer quits.
 */
const primary = app.requestSingleInstanceLock()
if (!primary) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return
    if (!win) {
      createWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

app.whenReady().then(() => {
  if (!primary) return
  protocol.handle('prism', (request) => {
    const path = new URL(request.url).pathname
    // Resolved inside the renderer directory and checked afterwards, so a
    // crafted `..` cannot walk out of it.
    const file = join(ROOT, decodeURIComponent(path))
    if (!file.startsWith(ROOT)) return new Response('Denied', { status: 403 })
    try {
      return new Response(readFileSync(file), {
        headers: {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          // Read from disk every time. Without this Chromium caches the
          // modules and a reload quietly serves the previous build — which
          // looks exactly like a change that did not work.
          'cache-control': 'no-store',
          // The script worker's own policy: its code and the app's modules,
          // the eval that runs a script, and nothing else — no network at
          // all, and no code from anywhere outside the app.
          ...(file.endsWith('script-worker.js') ? { 'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-eval'" } : {})
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  // The application menu, without View > Zoom. Electron's default binds
  // Ctrl+=, Ctrl+- and Ctrl+0 to zooming the *whole interface*, so those keys
  // never reached the plane and scaled the sidebar and inspector instead.
  // The Edit menu stays: on macOS it is what makes Cmd+C and Cmd+V work.
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' }
    ])
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ------------------------------------------------------------------ window */

ipcMain.handle('window:minimize', () => win?.minimize())
ipcMain.handle('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
ipcMain.handle('window:close', () => win?.close())
ipcMain.handle('window:ready', () => {
  pageReady = true
})
ipcMain.handle('window:closeNow', () => {
  closing = true
  win?.close()
})
ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false)

/* -------------------------------------------------------------------- files */

/**
 * Files the user has chosen in this session, by hand, through a dialog.
 *
 * This is what makes `workspace:write` safe. Save has to be able to write back
 * to the open file without asking every time -- that is the whole difference
 * between Save and Save As -- but a renderer naming its own path would be a way
 * to overwrite anything on the machine. So the main process only writes where
 * the *user* has already pointed a file dialog, and the renderer supplies a
 * path it was handed rather than one it composed.
 *
 * Session-scoped on purpose: it is cleared when the app closes, so a stale path
 * from a previous run cannot be written to without the user choosing it again.
 */
const chosenPaths = new Set()

/**
 * Reads a file for Import, or for a dataset. Never makes it the open document.
 *
 * This handler used to record every file it opened as the workspace being
 * edited. Import a Postman collection, restart, and Prism came back believing
 * that collection was the open file, announced it had unsaved changes, and
 * Ctrl+S overwrote it with a Prism workspace. Only `workspace:open` may do
 * that now, and only for a file that is a workspace.
 */
ipcMain.handle('file:open', async (_e, filters) => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Open',
    properties: ['openFile'],
    filters: filters ?? [{ name: 'Collections', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  // Read as text and handed over as text: parsing is the renderer's problem,
  // and a malformed file should surface as a readable error there rather than
  // as an exception in the process that owns the window.
  try {
    return { path, name: basename(path), text: readFileSync(path, 'utf8') }
  } catch (err) {
    return { error: `Cannot read ${basename(path)} — ${err.message}` }
  }
})

ipcMain.handle('file:save', async (_e, { name, text, filters }) => {
  if (!win) return null
  const res = await dialog.showSaveDialog(win, { title: 'Export', defaultPath: name, filters })
  if (res.canceled || !res.filePath) return null
  try {
    writeFileSync(res.filePath, text, 'utf8')
  } catch (err) {
    return { error: err.message }
  }
  return res.filePath
})

/**
 * Writing a response body out.
 *
 * Bytes, not text: a PDF or a zip that came back from an export endpoint is
 * exactly the thing worth saving, and re-encoding it as UTF-8 on the way would
 * quietly corrupt it.
 */
ipcMain.handle('file:saveBytes', async (_e, { name, base64: data, filters }) => {
  const chosen = await dialog.showSaveDialog(win, { defaultPath: name, filters: filters ?? [{ name: 'All files', extensions: ['*'] }] })
  if (chosen.canceled || !chosen.filePath) return null
  try {
    writeFileSync(chosen.filePath, Buffer.from(String(data ?? ''), 'base64'))
    return chosen.filePath
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('shell:open', (_e, url) => {
  // Only ever a documentation link the page already displays.
  if (/^https?:\/\//i.test(String(url))) return shell.openExternal(String(url))
  return null
})

/* ---------------------------------------------------------------- workspace */

ipcMain.handle('workspace:autosave', (_e, text) => {
  try {
    writeAtomic(autosavePath(), String(text))
    return { ok: true }
  } catch (err) {
    // Saving is best-effort. A full disk must not take the window down, and
    // the renderer shows what happened rather than failing silently.
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('workspace:restore', () => {
  try {
    const path = autosavePath()
    // The remembered file is handed back even when there is no autosave: a
    // workspace saved and then closed cleanly should still open as itself.
    const filePath = lastFile()
    // Vouched for here, so Save writes back to it without asking again. This
    // process recorded it after a real dialog, which is what the gate is for.
    if (filePath) chosenPaths.add(filePath)
    if (!existsSync(path)) return filePath ? { path: null, text: '', filePath } : null
    return { path, text: readFileSync(path, 'utf8'), filePath }
  } catch {
    return null
  }
})

// Deleted, not blanked. Settings offers this as "Forget", and leaving a
// zero-byte file behind would have the row still reporting a saved workspace.
/* ----------------------------------------------------------------- backups */

/**
 * Automatic backups, kept in their own folder beside the autosave.
 *
 * Only files this code named can be touched: every call that takes a name
 * checks it against the one pattern backups are written under, so a crafted
 * name cannot reach outside the folder. The newest thirty are kept.
 */
const backupDir = () => join(app.getPath('userData'), 'backups')
const BACKUP_NAME = /^[\w-]+\.prism-backup\.json$/
const BACKUPS_KEPT = 30

function backupNames() {
  if (!existsSync(backupDir())) return []
  return readdirSync(backupDir())
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
}

ipcMain.handle('backup:keep', (_e, { name, text, fingerprint, skipIfSame }) => {
  if (!BACKUP_NAME.test(String(name))) return { ok: false, error: 'That is not a backup name.' }
  try {
    mkdirSync(backupDir(), { recursive: true })
    const names = backupNames()
    // Nothing changed since the last one: an hourly backup of an untouched
    // workspace would only push a useful older one out of the thirty.
    const latest = names[names.length - 1]
    if (skipIfSame && fingerprint && latest) {
      try {
        if (JSON.parse(readFileSync(join(backupDir(), latest), 'utf8')).fingerprint === fingerprint) return { ok: true, skipped: true }
      } catch {
        /* an unreadable latest is no reason not to write a new one */
      }
    }
    writeAtomic(join(backupDir(), name), String(text))
    for (const old of backupNames().reverse().slice(BACKUPS_KEPT)) rmSync(join(backupDir(), old), { force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('backup:list', () => {
  const out = []
  for (const name of backupNames().reverse()) {
    try {
      const path = join(backupDir(), name)
      const doc = JSON.parse(readFileSync(path, 'utf8'))
      out.push({ id: name, createdAt: doc.createdAt ?? '', reason: doc.reason ?? '', summary: doc.summary ?? null, bytes: statSync(path).size })
    } catch {
      // A damaged file is listed as such rather than hidden: it is still
      // something on disk the user may want to delete.
      out.push({ id: name, createdAt: '', reason: '', summary: null, bytes: 0, damaged: true })
    }
  }
  return out
})

ipcMain.handle('backup:read', (_e, name) => {
  if (!BACKUP_NAME.test(String(name))) return { error: 'That is not a backup name.' }
  try {
    return { name, text: readFileSync(join(backupDir(), name), 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('backup:remove', (_e, name) => {
  if (!BACKUP_NAME.test(String(name))) return false
  try {
    rmSync(join(backupDir(), name), { force: true })
    return true
  } catch {
    return false
  }
})

/* ------------------------------------------------------------ mock server

   Answers in the API's place, on this machine only: bound to 127.0.0.1, so
   nothing else on the network can reach it. What to answer is decided by
   lib/mock.js from routes the window sends; this is only the socket. */

let mock = null
const mockLib = import('./lib/mock.js')

function cleanRoutes(routes) {
  return (Array.isArray(routes) ? routes : []).slice(0, 2000).map((r) => ({
    ...r,
    status: Number.isInteger(r?.status) && r.status >= 100 && r.status <= 599 ? r.status : 500,
    headers: Object.fromEntries(Object.entries(r?.headers ?? {}).filter(([k, v]) => /^[\w!#$%&'*+.^`|~-]+$/.test(k) && !/[\r\n]/.test(String(v)))),
    body: String(r?.body ?? '')
  }))
}

function mockSettings(state, { routes, latency, cors }) {
  if (routes !== undefined) state.routes = cleanRoutes(routes)
  if (latency !== undefined) state.latency = Math.max(0, Math.min(30000, Number(latency) || 0))
  if (cors !== undefined) state.cors = cors !== false
}

function stopMock() {
  return new Promise((resolve) => {
    if (!mock) return resolve({ ok: true })
    const { server } = mock
    mock = null
    server.close(() => resolve({ ok: true }))
    server.closeAllConnections?.()
  })
}

/* ------------------------------------------- WebSocket and Server-Sent Events

   A live connection the window drives: opened here, where Node can set
   headers and reach any host, and every frame sent back as it happens. */

const streams = new Map()
const sseLib = import('./lib/sse.js')
const streamEmit = (id, type, extra = {}) => win?.webContents.send('stream:event', { id, type, at: Date.now(), ...extra })
const cleanHeaders = (headers) => Object.fromEntries(Object.entries(headers ?? {}).filter(([k, v]) => /^[\w!#$%&'*+.^`|~-]+$/.test(k) && !/[\r\n]/.test(String(v))).map(([k, v]) => [k, String(v)]))

ipcMain.handle('stream:open', async (_e, { id, kind, url, headers, protocols, verifyTls } = {}) => {
  const key = String(id ?? '')
  if (!key) return { ok: false, error: 'No connection id' }
  streams.get(key)?.close()
  let u
  try {
    u = new URL(String(url ?? ''))
  } catch {
    return { ok: false, error: 'That is not a full address — it needs ws://, wss://, http:// or https://' }
  }
  if (kind === 'ws') {
    if (u.protocol === 'http:') u.protocol = 'ws:'
    if (u.protocol === 'https:') u.protocol = 'wss:'
    if (!/^wss?:$/.test(u.protocol)) return { ok: false, error: 'A WebSocket address starts with ws:// or wss://' }
    let ws
    try {
      ws = new WebSocket(u.href, { headers: cleanHeaders(headers), protocols: (Array.isArray(protocols) ? protocols : []).map(String).filter(Boolean) })
    } catch (err) {
      return { ok: false, error: err.message }
    }
    streams.set(key, { close: (code = 1000) => ws.close(code), send: (data) => ws.send(data) })
    ws.onopen = () => streamEmit(key, 'open', { url: u.href, protocol: ws.protocol })
    ws.onmessage = (ev) => streamEmit(key, 'message', { data: typeof ev.data === 'string' ? ev.data : `[binary, ${ev.data?.byteLength ?? ev.data?.size ?? 0} bytes]` })
    ws.onerror = (ev) => streamEmit(key, 'error', { data: ev?.message || ev?.error?.message || 'The connection failed' })
    ws.onclose = (ev) => {
      streams.delete(key)
      streamEmit(key, 'close', { code: ev.code, reason: ev.reason })
    }
    return { ok: true, url: u.href }
  }
  if (kind === 'sse') {
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'An event stream address starts with http:// or https://' }
    const lib = await sseLib
    const mod = u.protocol === 'https:' ? https : http
    let closed = false
    const finish = (extra) => {
      if (closed) return
      closed = true
      streams.delete(key)
      streamEmit(key, 'close', extra)
    }
    const req = mod.request(u, { method: 'GET', headers: { accept: 'text/event-stream', 'cache-control': 'no-cache', ...cleanHeaders(headers) }, rejectUnauthorized: verifyTls !== false }, (res) => {
      streamEmit(key, 'open', { url: u.href, status: res.statusCode, type: String(res.headers['content-type'] ?? '') })
      res.setEncoding('utf8')
      if ((res.statusCode ?? 0) >= 400) {
        let text = ''
        res.on('data', (c) => (text = (text + c).slice(0, 4000)))
        res.on('end', () => {
          streamEmit(key, 'error', { data: `${res.statusCode} ${res.statusMessage ?? ''} ${text}`.trim() })
          finish({ code: res.statusCode })
        })
        return
      }
      const parser = lib.sseParser((ev) => streamEmit(key, 'message', { event: ev.event, data: ev.data, lastId: ev.id }))
      res.on('data', (c) => parser.feed(c))
      res.on('end', () => {
        parser.end()
        finish({ reason: 'The server ended the stream' })
      })
    })
    req.on('error', (err) => {
      if (!closed) streamEmit(key, 'error', { data: err.message })
      finish({})
    })
    req.end()
    streams.set(key, {
      close: () => {
        req.destroy()
        finish({ reason: 'Closed by you' })
      }
    })
    return { ok: true, url: u.href }
  }
  return { ok: false, error: 'Unknown kind of connection' }
})

/* --------------------------------------------------------- AI assistant

   The key is kept by the operating system's encrypted store and used here;
   the window can set it, clear it and ask whether there is one, never read
   it back. The question itself is built — and shown — by the window. */

const aiLib = import('./lib/ai.js')
const aiKeyPath = () => join(app.getPath('userData'), 'ai-key.bin')

ipcMain.handle('ai:hasKey', () => existsSync(aiKeyPath()))
ipcMain.handle('ai:setKey', (_e, key) => {
  const text = String(key ?? '').trim()
  if (!text) return { ok: false, error: 'No key' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'This system offers no encrypted store, so the key is not kept' }
  try {
    writeFileSync(aiKeyPath(), safeStorage.encryptString(text))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('ai:clearKey', () => {
  rmSync(aiKeyPath(), { force: true })
  return { ok: true }
})
ipcMain.handle('ai:ask', async (_e, { provider, model, baseUrl, system, prompt } = {}) => {
  const lib = await aiLib
  let key = ''
  if (lib.PROVIDERS[provider]?.needsKey && existsSync(aiKeyPath())) {
    try {
      key = safeStorage.decryptString(readFileSync(aiKeyPath()))
    } catch {
      return { ok: false, error: 'The saved key could not be read — add it again' }
    }
  }
  let request
  try {
    request = lib.providerRequest({ provider, model, baseUrl, key, system: String(system ?? ''), prompt: String(prompt ?? '') })
  } catch (err) {
    return { ok: false, error: err.message }
  }
  try {
    const res = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(120000) })
    let json = {}
    try {
      json = await res.json()
    } catch {
      /* not JSON: said below */
    }
    return lib.readReply(provider, res.status, json)
  } catch (err) {
    return { ok: false, error: provider === 'ollama' ? `Ollama is not answering at ${request.url} — is it running?` : err.message }
  }
})

/* ------------------------------------------------------------------ gRPC */

const grpcLib = import('./lib/grpc.js')
ipcMain.handle('grpc:describe', async (_e, { proto, name } = {}) => (await grpcLib).describeProto(String(proto ?? ''), String(name ?? 'request.proto')))
ipcMain.handle('grpc:call', async (_e, payload = {}) => {
  try {
    return await (await grpcLib).callGrpc(payload)
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('stream:send', (_e, { id, data } = {}) => {
  const s = streams.get(String(id ?? ''))
  if (!s?.send) return { ok: false, error: 'Not connected' }
  try {
    s.send(String(data ?? ''))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('stream:close', (_e, id) => {
  streams.get(String(id ?? ''))?.close()
  return { ok: true }
})

app.on('before-quit', () => {
  for (const s of streams.values()) s.close()
})

ipcMain.handle('mock:start', async (_e, options = {}) => {
  const lib = await mockLib
  await stopMock()
  const port = Number(options.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: 'Choose a port between 1024 and 65535.' }
  const state = { routes: [], latency: 0, cors: true }
  mockSettings(state, options)
  const server = http.createServer((req, res) => {
    const started = Date.now()
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 10 * 1024 * 1024) req.destroy()
    })
    req.on('end', () => {
      const out = lib.answer(state.routes, { method: req.method, url: req.url, cors: state.cors, origin: req.headers.origin })
      setTimeout(() => {
        try {
          res.writeHead(out.status, out.headers)
          res.end(out.body)
        } catch (err) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end(`Prism mock could not answer: ${err.message}`)
        }
        win?.webContents.send('mock:hit', {
          at: started,
          method: req.method,
          path: req.url,
          status: out.status,
          route: out.route ? `${out.route.method} ${out.route.path}` : '',
          name: out.route?.name ?? '',
          source: out.route?.source ?? 'none',
          ms: Date.now() - started
        })
      }, state.latency)
    })
  })
  return new Promise((resolve) => {
    server.once('error', (err) => resolve({ ok: false, error: err.code === 'EADDRINUSE' ? `Port ${port} is already in use — choose another.` : err.message }))
    server.listen(port, '127.0.0.1', () => {
      mock = { server, port, state }
      resolve({ ok: true, port })
    })
  })
})

ipcMain.handle('mock:update', (_e, options = {}) => {
  if (!mock) return { ok: false }
  mockSettings(mock.state, options)
  return { ok: true }
})

ipcMain.handle('mock:stop', () => stopMock())
ipcMain.handle('mock:status', () => (mock ? { running: true, port: mock.port } : { running: false }))
app.on('before-quit', () => void stopMock())

ipcMain.handle('backup:reveal', () => {
  mkdirSync(backupDir(), { recursive: true })
  return shell.openPath(backupDir())
})

ipcMain.handle('workspace:forget', () => {
  try {
    if (existsSync(autosavePath())) rmSync(autosavePath())
    // The pointer goes with it. Left behind, the next start would announce a
    // file for a workspace that had just been deleted.
    if (existsSync(sessionPath())) rmSync(sessionPath())
    return true
  } catch {
    return false
  }
})

/**
 * Opens a saved workspace as the document being edited.
 *
 * The file is checked here before it is remembered, so only a genuine Prism
 * workspace can ever become the target of a dialog-free Save.
 */
ipcMain.handle('workspace:open', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Open workspace',
    properties: ['openFile'],
    filters: [
      { name: 'Prism workspace', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    return { error: `Cannot read ${basename(path)} — ${err.message}` }
  }
  // Handed back unremembered, so the page can explain and offer Import.
  if (!isWorkspaceText(text)) return { path, name: basename(path), text, workspace: false }
  chosenPaths.add(path)
  rememberFile(path)
  return { path, name: basename(path), text, workspace: true }
})

/* ------------------------------------------------- a workspace as a folder

   lib/folder.js says which files a workspace is; this reads and writes them.
   Only files that format owns are ever written or removed, so a README, a
   .git folder or anything else beside them is left alone. */

const folderIo = import('./lib/folder-io.js')
const isFolder = (path) => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
const folderText = async (dir) => (await folderIo).folderText(dir)
const writeFolder = async (dir, text) => (await folderIo).writeFolder(dir, text)

ipcMain.handle('workspace:saveAsFolder', async (_e, { name, text }) => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose where to keep the workspace folder',
    buttonLabel: 'Save here',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return null
  let dir = res.filePaths[0]
  // An empty folder, or one that already holds this format, is used as it is;
  // anywhere else gets a folder of its own, named after the workspace.
  const entries = readdirSync(dir)
  if (entries.length && !entries.includes('prism.workspace.json')) {
    dir = join(dir, String(name || 'workspace').replace(/[^\w.-]+/g, '-') || 'workspace')
    if (existsSync(dir) && readdirSync(dir).length && !existsSync(join(dir, 'prism.workspace.json'))) {
      return { error: `${basename(dir)} already exists and is not a Prism workspace folder — choose an empty folder.` }
    }
  }
  try {
    mkdirSync(dir, { recursive: true })
    await writeFolder(dir, text)
  } catch (err) {
    return { error: err.message }
  }
  chosenPaths.add(dir)
  rememberFile(dir)
  return { path: dir }
})

ipcMain.handle('workspace:openFolder', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, { title: 'Open a workspace folder', properties: ['openDirectory'] })
  if (res.canceled || !res.filePaths[0]) return null
  const dir = res.filePaths[0]
  if (!existsSync(join(dir, 'prism.workspace.json'))) return { error: `${basename(dir)} is not a Prism workspace folder — it has no prism.workspace.json.` }
  try {
    const text = await folderText(dir)
    chosenPaths.add(dir)
    rememberFile(dir)
    return { path: dir, name: basename(dir), text, workspace: true }
  } catch (err) {
    return { error: `Cannot read ${basename(dir)} — ${err.message}` }
  }
})

/** Whether some text is a Prism workspace, without trusting anything else in it. */
function isWorkspaceText(text) {
  try {
    return JSON.parse(String(text))?.prism === 'prism.workspace'
  } catch {
    return false
  }
}

ipcMain.handle('workspace:saveAs', async (_e, { name, text }) => {
  if (!win) return null
  const res = await dialog.showSaveDialog(win, {
    title: 'Save workspace',
    defaultPath: join(app.getPath('documents'), `${name || 'workspace'}.prism.json`),
    filters: [{ name: 'Prism workspace', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return null
  try {
    writeAtomic(res.filePath, String(text))
  } catch (err) {
    return { error: err.message }
  }
  chosenPaths.add(res.filePath)
  rememberFile(res.filePath)
  return { path: res.filePath }
})

/**
 * Writes the workspace back to the file it came from, with no dialog.
 *
 * The other half of Save As, and the reason Save can be a one-key action. Only
 * a path the user has already chosen this session is accepted -- see
 * `chosenPaths` -- so this cannot be pointed at an arbitrary file.
 *
 * Atomic, like the autosave: the file people are about to commit is the worst
 * possible thing to leave half-written.
 */
ipcMain.handle('workspace:write', async (_e, { path, text }) => {
  const target = String(path ?? '')
  if (!chosenPaths.has(target)) {
    return { error: 'That file was not opened or saved in this session — use Save as instead.' }
  }
  try {
    if (isFolder(target)) await writeFolder(target, text)
    else writeAtomic(target, String(text))
    return { ok: true, path: target }
  } catch (err) {
    return { error: err.message }
  }
})

/** Shows a saved workspace in the OS file browser. */
ipcMain.handle('workspace:reveal', (_e, path) => {
  const target = String(path ?? '')
  if (!chosenPaths.has(target) || !existsSync(target)) return false
  if (isFolder(target)) shell.openPath(target)
  else shell.showItemInFolder(target)
  return true
})

/**
 * Re-reads a file the user already has open, for Revert.
 *
 * Same gate as writing: only somewhere they pointed a dialog.
 */
ipcMain.handle('workspace:reread', async (_e, path) => {
  const target = String(path ?? '')
  if (!chosenPaths.has(target)) return null
  try {
    return { path: target, name: basename(target), text: isFolder(target) ? await folderText(target) : readFileSync(target, 'utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

/* ------------------------------------------------------------------ cookies */

ipcMain.handle('cookies:list', async () => {
  await jarReady
  return jar.all()
})

ipcMain.handle('cookies:clear', async () => {
  await jarReady
  return jar.clear()
})

ipcMain.handle('cookies:remove', async (_e, { name, domain, path }) => {
  await jarReady
  return jar.remove(name, domain, path)
})

/* -------------------------------------------------------------- proxy & TLS */

/**
 * A tunnel through an HTTP proxy.
 *
 * Node has no proxy support of its own, and the usual answer — swap in a
 * third-party agent — would mean giving up the socket events the waterfall is
 * built from. So the tunnel is opened by hand: CONNECT for https, which is
 * what a proxy expects for a connection it must not read, and an absolute-URL
 * request for plain http, which is what a proxy expects for one it may.
 */
function proxyTunnel(proxy, target) {
  return new Promise((resolve, reject) => {
    let via
    try {
      via = new URL(proxy)
    } catch {
      reject(new Error(`${proxy} is not a proxy URL Prism can read.`))
      return
    }

    const headers = { Host: `${target.hostname}:${port(target)}` }
    if (via.username) {
      const pair = `${decodeURIComponent(via.username)}:${decodeURIComponent(via.password || '')}`
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(pair).toString('base64')}`
    }

    const call = http.request({
      host: via.hostname,
      port: Number(via.port) || 8080,
      method: 'CONNECT',
      path: `${target.hostname}:${port(target)}`,
      headers
    })

    call.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        // The proxy's own refusal, said plainly: a 407 here is a password
        // problem and nothing to do with the server being tested.
        reject(new Error(`The proxy refused the tunnel with ${res.statusCode} ${res.statusMessage || ''}`.trim()))
        return
      }
      resolve(socket)
    })
    call.on('error', (err) => reject(new Error(`Cannot reach the proxy: ${err.message}`)))
    call.end()
  })
}

const port = (url) => Number(url.port) || (url.protocol === 'https:' ? 443 : 80)

/**
 * A client certificate, read from disk at send time.
 *
 * Read each time rather than cached: a certificate that has been rotated
 * should take effect on the next send, not the next restart. The passphrase
 * is passed through and never written anywhere.
 */
function clientIdentity(spec) {
  const out = {}
  const load = (path) => {
    if (!path) return undefined
    try {
      return readFileSync(path)
    } catch (err) {
      throw new Error(`Cannot read ${path} — ${err.message}`)
    }
  }

  if (spec.pfxPath) out.pfx = load(spec.pfxPath)
  if (spec.certPath) out.cert = load(spec.certPath)
  if (spec.keyPath) out.key = load(spec.keyPath)
  if (spec.caPath) out.ca = load(spec.caPath)
  if (spec.passphrase) out.passphrase = spec.passphrase
  return out
}

/* --------------------------------------------------------------------- http */


/**
 * One request, with the phase timings the waterfall draws.
 *
 * Node's own socket events are the only honest source for these: anything
 * measured in the renderer would be one number with a guess split across it.
 * `lookup`, `connect` and `secureConnect` fire in order on the socket, and the
 * gap between the last of them and the first byte of the response is the wait.
 */
function request(spec, redirectsLeft) {
  const maxBody = Math.max(1, Math.min(64, Number(spec.maxBodyMb) || 4)) * 1024 * 1024
  const hops = redirectsLeft === undefined ? (spec.followRedirects === false ? 0 : 5) : redirectsLeft

  return new Promise((resolve) => {
    let url
    try {
      url = new URL(spec.url)
    } catch {
      resolve({ error: `That is not a URL Prism can send to: ${spec.url}` })
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      resolve({ error: `Only http and https are supported, not ${url.protocol}` })
      return
    }

    const t = { start: Date.now(), dns: 0, tcp: 0, tls: 0, sent: 0, first: 0, end: 0 }
    const mark = () => Date.now() - t.start
    const driver = url.protocol === 'https:' ? https : http

    // The jar rides along unless the request already sets a cookie by hand,
    // in which case the hand-written one wins — it was written deliberately.
    const headers = { ...(spec.headers || {}) }
    if (spec.useCookies !== false && jar) {
      const has = Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')
      const line = jar.header(url.toString())
      if (!has && line) headers.Cookie = line
    }

    let identity
    try {
      identity = clientIdentity(spec)
    } catch (err) {
      resolve({ error: err.message })
      return
    }

    const options = {
      method: spec.method || 'GET',
      headers,
      timeout: spec.timeoutMs || 30000,
      // Off only for a development server with a self-signed certificate,
      // and the setting that turns it off says what that costs.
      rejectUnauthorized: spec.verifyTls !== false,
      ...identity
    }

    // Through a proxy, the socket is opened first and handed to the request.
    // For plain http that is the proxy's own socket with an absolute URL;
    // for https it is the far end of a CONNECT tunnel, so TLS is negotiated
    // with the real server and the proxy never sees inside.
    if (spec.proxy && url.protocol === 'http:') {
      options.host = null
      options.socketPath = undefined
      options.createConnection = () => {
        const via = new URL(spec.proxy)
        return sockets.connect({ host: via.hostname, port: Number(via.port) || 8080 })
      }
      options.path = url.toString()
    }
    if (spec.proxy && url.protocol === 'https:') {
      options.createConnection = (opts, done) => {
        const socket = new sockets.Socket()
        proxyTunnel(spec.proxy, url)
          .then((tunnel) => {
            const secure = tls.connect({ socket: tunnel, servername: url.hostname, rejectUnauthorized: spec.verifyTls !== false, ...identity })
            secure.on('secureConnect', () => {
              /* the timing hooks below see this too */
            })
            done(null, secure)
          })
          .catch((err) => done(err))
        return socket
      }
    }

    const req = driver.request(
      url,
      options,
      (res) => {
        t.first = mark()

        // A redirect is followed by re-sending. The phase timings then belong
        // to the request that actually answered, which is the honest reading;
        // the hop count is what stops a loop.
        const to = res.headers.location
        if (hops > 0 && to && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume()
          let next = null
          try {
            next = new URL(to, url).toString()
          } catch {
            next = null
          }
          if (next) {
            // 303, and 301/302 on a POST, become a GET with no body — what
            // every client does and what servers expect.
            const drop = res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && spec.method === 'POST')
            const hop = { ...spec, url: next, method: drop ? 'GET' : spec.method, body: drop ? undefined : spec.body }
            request(hop, hops - 1).then((out) =>
              resolve({ ...out, redirects: (out.redirects ?? 0) + 1, redirectedFrom: spec.url })
            )
            return
          }
        }

        const chunks = []
        let bytes = 0
        let truncated = false
        res.on('data', (chunk) => {
          bytes += chunk.length
          if (bytes <= maxBody) chunks.push(chunk)
          else truncated = true
        })
        res.on('end', () => {
          t.end = mark()
          const kept = spec.useCookies !== false && jar ? jar.store(res.headers, url.toString()) : 0
          resolve({
            cookiesStored: kept,
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: flatten(res.headers),
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
            bytes,
            secure: url.protocol === 'https:',
            sentHeaders: headers,
            timing: {
              dns: t.dns,
              tcp: t.tcp,
              tls: t.tls,
              sent: t.sent,
              first: t.first,
              end: t.end,
              total: t.end
            }
          })
        })
      }
    )

    req.on('socket', (socket) => {
      socket.once('lookup', () => {
        t.dns = mark()
      })
      socket.once('connect', () => {
        t.tcp = mark()
      })
      socket.once('secureConnect', () => {
        t.tls = mark()
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ error: `No response within ${spec.timeoutMs || 30000}ms.` })
    })
    req.on('error', (err) => resolve({ error: err.message }))

    if (spec.body) req.write(spec.body)
    t.sent = mark()
    req.end()
  })
}

function flatten(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  }
  return out
}

ipcMain.handle('http:send', (_e, spec) => request(spec))

// Kept so the renderer never sees an unhandled rejection as a blank window.
process.on('uncaughtException', (err) => {
  console.error('[prism] uncaught:', err)
})
