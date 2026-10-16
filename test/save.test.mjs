/**
 * Saving: that it exists, that it is reachable, and that nothing edits state
 * without scheduling a write.
 *
 * The bug behind this file: Prism *had* an autosave, Ctrl+S and two command
 * palette entries, and no Save button anywhere in the bar — so from the outside
 * it read as a tool that could not save at all. Underneath that, the handlers
 * for the fields people type in fastest (the URL, every query and header row,
 * request-level auth) went through `live()`, which repainted the preview and
 * never marked anything dirty. Typing an endpoint and closing the app lost it.
 *
 * The renderer is a browser module that cannot be imported here — it touches
 * `window` at load — so it is checked the way this project already checks
 * `app.js` elsewhere: by reading it. Text assertions are weak evidence in
 * general, and exactly the right strength for "this call is still on this
 * path", which is the whole of the regression.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serialise, comparable, matchesSaved, parse } from '../lib/workspace.js'
import { emptyCollection, emptyFlow, emptyRequest } from '../lib/collection.js'

// Normalised on the way in. These files are CRLF, and a slice that searched
// for '\n}\n' silently found nothing — so `indexOf` returned -1, `slice`
// treated it as "one from the end", and every "just this function" assertion
// was quietly reading the rest of the file instead.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const app = read('../renderer/app.js')
const html = read('../renderer/index.html')
const css = read('../renderer/styles.css')
const main = read('../main.cjs')
const preload = read('../preload.cjs')

/**
 * One top-level function, from its declaration to its closing brace.
 *
 * Scoped deliberately: an assertion that a call appears *somewhere in app.js*
 * proves almost nothing in a six-thousand-line file, and that is exactly the
 * failure mode the normalisation note above describes.
 */
function bodyOf(text, marker) {
  const at = text.indexOf(marker)
  assert.ok(at > 0, `${marker} is gone`)
  // The next line that is a brace at column zero ends a top-level function.
  const end = text.indexOf('\n}', at)
  assert.ok(end > at, `cannot find the end of ${marker}`)
  return text.slice(at, end)
}

/** One ipcMain handler, from its registration to the next one. */
function handlerOf(text, channel) {
  const at = text.indexOf(`ipcMain.handle('${channel}'`)
  assert.ok(at > 0, `${channel} is gone`)
  const next = text.indexOf('ipcMain.handle(', at + channel.length + 20)
  return text.slice(at, next < 0 ? text.length : next)
}

/* ------------------------------------------------------- nothing is lost */

test('live() schedules a save, so typing a URL is not lost on quit', () => {
  // The regression: `live` is the per-keystroke path for the URL field, every
  // query and header cell, and request-level auth. Without `touch()` none of
  // those edits marked the workspace dirty or started the autosave debounce.
  const body = bodyOf(app, 'function live(req)')
  assert.match(body, /touch\(\)/, 'live() must mark the workspace dirty, or fast-path edits are never saved')
})

test('every fast-path edit still goes through live()', () => {
  // If a handler stops calling live() it also stops saving, and the symptom is
  // silent. Counted rather than named: the point is that none of them is
  // mutating a request without a path to a save.
  const calls = app.match(/\blive\(req\)/g) ?? []
  assert.ok(calls.length >= 4, `expected the URL, key, value and auth handlers to call live(); found ${calls.length}`)
})

test('commit() marks the workspace dirty too', () => {
  const body = bodyOf(app, 'function commit(')
  assert.match(body, /touch\(\)/)
})

/* --------------------------------------------------- saving is reachable */

test('the bar has a save button and a save menu', () => {
  // The whole complaint. A verb reachable only by a shortcut and a palette is
  // a verb most people never find.
  assert.match(html, /id="saveBtn"/, 'no Save button in the bar')
  assert.match(html, /id="saveMenuBtn"/, 'no way into the save menu')
  assert.match(html, /id="saveLabel"/, 'the bar does not say which file is open')
  assert.match(app, /\$\('saveBtn'\)\.onclick/, 'the Save button is not wired up')
  assert.match(app, /\$\('saveMenuBtn'\)\.onclick/, 'the save menu is not wired up')
})

test('the save menu offers the whole set of document actions', () => {
  const body = bodyOf(app, 'function saveMenu()')
  for (const label of ['Save as…', 'Open a workspace…', 'Show in folder', 'Discard changes and reload']) {
    assert.ok(body.includes(label), `the save menu no longer offers "${label}"`)
  }
})

test('Ctrl+S saves and Ctrl+Shift+S saves as', () => {
  // Ctrl+S used to be Save *As*, which prompts for a path every time — a
  // shortcut that behaves like an export is why saving felt absent.
  const at = app.indexOf("e.key.toLowerCase() === 's'")
  assert.ok(at > 0, 'the Ctrl+S binding is gone')
  const body = app.slice(at, at + 240)
  assert.match(body, /e\.shiftKey \? .*saveWorkspaceAs|if \(e\.shiftKey\) saveWorkspaceAs\(\)/s)
  assert.match(body, /saveWorkspace\(\)/)
})

test('the command palette lists saving, opening and reverting', () => {
  const palette = app.slice(app.indexOf('function openPalette('), app.indexOf('\n}', app.indexOf('function openPalette(')))
  for (const label of ['Save workspace', 'Save workspace as', 'Open a workspace', 'Discard changes and reload']) {
    assert.ok(palette.includes(`cmd('${label}'`) || palette.includes(`label: '${label}'`), `the palette no longer offers "${label}"`)
  }
})

/* ------------------------------------------------- save means write back */

test('Save writes back to the open file instead of prompting again', () => {
  const body = bodyOf(app, 'async function saveWorkspace()')
  // Falls through to Save As only when there is no file yet.
  assert.match(body, /if \(!S\.filePath\) return saveWorkspaceAs\(\)/)
  assert.match(body, /workspace\.write\(\{ path: S\.filePath/)
})

test('Open remembers the path, so the next Save is a save', () => {
  const body = bodyOf(app, 'async function openWorkspace(')
  assert.match(body, /S\.filePath = chosen\.path/)
})

test('Save as remembers the path it was given', () => {
  const body = bodyOf(app, 'async function saveWorkspaceAs()')
  assert.match(body, /S\.filePath = out\.path/)
})

/* ------------------------------------------------------------- the state */

test('the save indicator distinguishes the file from the autosave', () => {
  // The old dot had two states and one of them lied: it read "everything
  // saved" over a file that was twenty edits behind, because it was tracking
  // the autosave.
  const body = bodyOf(app, 'function saveState()')
  for (const state of ['saving', 'unsaved', 'saved', 'pending', 'autosaved']) {
    assert.ok(body.includes(`'${state}'`), `saveState() no longer reports "${state}"`)
  }
})

test('every save state has a style', () => {
  // A state with no rule renders as the default, which is the one that means
  // "nothing to do" — the worst possible fallback for "unsaved".
  for (const state of ['saved', 'unsaved', 'saving', 'pending', 'autosaved']) {
    assert.match(css, new RegExp(`\\.save-state\\.is-${state}`), `no style for .save-state.is-${state}`)
  }
})

test('the file name is shown, not only tooltipped', () => {
  const body = bodyOf(app, 'function paintSaveState()')
  assert.match(body, /label\.textContent = S\.filePath \? fileLabel\(S\.filePath\) : 'Not saved to a file'/)
})

/* ----------------------------------------------------- unsaved work asks */

test('closing with unsaved file changes asks first', () => {
  const at = app.indexOf("$('winClose').onclick")
  const body = app.slice(at, at + 320)
  assert.match(body, /keepOrDiscard/, 'closing no longer checks for unsaved file changes')
})

test('the prompt only fires when a file is actually behind', () => {
  // An autosaved-only workspace is not at risk — it comes back on the next
  // start — and prompting there would train people to dismiss the dialog.
  const body = bodyOf(app, 'function keepOrDiscard(')
  assert.match(body, /if \(!S\.filePath \|\| !S\.fileDirty\) return Promise\.resolve\(true\)/)
})

test('dismissing the prompt cancels rather than continuing', () => {
  const body = bodyOf(app, 'function keepOrDiscard(')
  // Closing a dialog about losing work must mean "take me back".
  assert.match(body, /if \(!answered\) resolve\(false\)/)
})

/* --------------------------------------------------------- the boundary */

test('the main process only writes where the user pointed a dialog', () => {
  // Save has to write with no dialog, which means the renderer names a path.
  // The gate is what stops that being a way to overwrite any file on the disk.
  assert.match(main, /const chosenPaths = new Set\(\)/)
  const body = handlerOf(main, 'workspace:write')
  assert.match(body, /chosenPaths\.has\(target\)/, 'workspace:write must refuse a path the user never chose')
})

test('only a real dialog, or this process’s own record of one, widens that set', () => {
  // The rule, rather than a count: a path may enter `chosenPaths` when the
  // user drove a workspace dialog (workspace:open, workspace:saveAs) or when
  // the main process reads back the path it wrote down after one
  // (workspace:restore). The folder pair (workspace:openFolder,
  // workspace:saveAsFolder) are the same two dialogs for a workspace kept as a
  // folder. What must never widen it is anything taking a path
  // from the renderer -- or the generic file:open used by Import, which is how
  // an imported Postman collection came to be overwritten by Save.
  const allowed = ["ipcMain.handle('workspace:open'", "ipcMain.handle('workspace:saveAs'", "ipcMain.handle('workspace:restore'", "ipcMain.handle('workspace:saveAsFolder'", "ipcMain.handle('workspace:openFolder'"]
  const bounds = allowed
    .map((needle) => {
      const at = main.indexOf(needle)
      assert.ok(at > 0, `${needle} is gone`)
      // Each handler ends at the next top-level ipcMain.handle, which is where
      // its own `add` must sit if it has one.
      const next = main.indexOf('ipcMain.handle(', at + needle.length)
      return [at, next < 0 ? main.length : next]
    })
    .sort((a, b) => a[0] - b[0])

  let cursor = 0
  let accounted = 0
  for (const [start, end] of bounds) {
    const outside = main.slice(cursor, start)
    assert.doesNotMatch(
      outside,
      /chosenPaths\.add\(/,
      'a path is being recorded outside the dialog handlers allowed to do it'
    )
    accounted += (main.slice(start, end).match(/chosenPaths\.add\(/g) ?? []).length
    cursor = end
  }
  assert.doesNotMatch(main.slice(cursor), /chosenPaths\.add\(/, 'a path is recorded after the last allowed handler')

  const total = (main.match(/chosenPaths\.add\(/g) ?? []).length
  assert.equal(accounted, total, 'every recorded path must come from one of the three allowed handlers')
})

test('the remembered path is written by the main process, never taken from the page', () => {
  // The whole reason the pointer lives in main.cjs: a path the renderer could
  // supply would defeat the write gate on the next start.
  const at = main.indexOf('function rememberFile(')
  assert.ok(at > 0, 'rememberFile() is gone')
  // Called only from the two dialog handlers, so what is remembered is always
  // somewhere the user pointed a picker.
  const calls = [...main.matchAll(/rememberFile\(/g)].map((m) => m.index)
  assert.ok(calls.length >= 3, 'rememberFile should be defined and called from open and save-as')
  assert.doesNotMatch(preload, /remember/, 'the renderer must not be able to set the remembered path')
})

test('a remembered file that has been moved is not offered back', () => {
  const body = bodyOf(main, 'function lastFile(')
  assert.match(body, /existsSync\(path\)/, 'a deleted or moved file must not come back as the open document')
})

test('forgetting the autosave forgets which file it was', () => {
  assert.match(
    handlerOf(main, 'workspace:forget'),
    /sessionPath\(\)/,
    'the pointer must go with the autosave, or the next start names a deleted workspace'
  )
})

test('reveal and reread are gated the same way', () => {
  for (const channel of ['workspace:reveal', 'workspace:reread']) {
    const body = handlerOf(main, channel)
    assert.match(body, /chosenPaths\.has\(target\)/, `${channel} must be gated too`)
  }
})

test('the writes go through the atomic helper', () => {
  // A workspace half-written because the machine lost power is worse than one
  // a session out of date, and this is the file people commit.
  assert.match(handlerOf(main, 'workspace:write'), /writeAtomic\(/)
})

test('the preload exposes the new calls and nothing generic', () => {
  for (const name of ['write', 'reveal', 'reread']) {
    assert.match(preload, new RegExp(`${name}: \\(`), `workspace.${name} is not exposed`)
  }
  // The security model of this app is that every capability is named here.
  assert.doesNotMatch(preload, /ipcRenderer\.invoke\(channel/, 'the preload must not pass a channel through')
})

/* ------------------------------------------- is the file behind? (real logic) */

const someState = (url = '{{base_url}}/login') => ({
  collections: [emptyCollection('Shop', [emptyFlow('Auth', [emptyRequest({ name: 'Log in', url })])])],
  environments: [],
  envId: '',
  layout: new Map(),
  baselines: new Map(),
  history: []
})

test('a workspace matches the file it was just written to', () => {
  // The bug this exists for: `serialise` stamps a fresh `savedAt` every call,
  // so comparing the two documents as text *always* differed — and a workspace
  // restored moments after being saved came back flagged as unsaved.
  const state = someState()
  const written = JSON.stringify(serialise(state, { name: 'W' }), null, 2)
  assert.equal(matchesSaved(written, serialise(state, { name: 'W' })), true)
})

test('savedAt alone is never a difference', () => {
  const state = someState()
  const a = serialise(state, { name: 'W' })
  const b = { ...serialise(state, { name: 'W' }), savedAt: '1999-01-01T00:00:00.000Z' }
  assert.equal(comparable(a), comparable(b))
})

test('a run recorded after saving is not an unsaved edit', () => {
  // History is measurements. Telling somebody their file is out of date
  // because they pressed Send is a false alarm, and false alarms are how
  // people learn to ignore the true ones.
  //
  // One state, reused: `emptyRequest` mints a fresh id per call, so two
  // separately built fixtures differ by ids alone and prove nothing.
  const state = someState()
  const a = serialise(state, { name: 'W' })
  const b = serialise(
    { ...state, history: [{ requestId: 'r', name: 'Log in', method: 'GET', status: 200, ms: 12, at: 1, env: '', failed: 0 }] },
    { name: 'W' }
  )
  assert.equal(comparable(a), comparable(b))
})

test('a real edit is a difference', () => {
  const state = someState('{{base_url}}/login')
  const before = comparable(serialise(state, { name: 'W' }))
  state.collections[0].flows[0].requests[0].url = '{{base_url}}/login?edited=1'
  assert.notEqual(before, comparable(serialise(state, { name: 'W' })))
})

test('renaming the workspace is a difference', () => {
  const state = someState()
  assert.notEqual(comparable(serialise(state, { name: 'One' })), comparable(serialise(state, { name: 'Two' })))
})

test('key order is not a difference', () => {
  // So a future version that writes the same fields in another order does not
  // report every file as behind.
  const doc = serialise(someState(), { name: 'W' })
  const shuffled = Object.fromEntries(Object.entries(doc).reverse())
  assert.equal(comparable(doc), comparable(shuffled))
})

test('an unreadable file counts as different, not as a match', () => {
  // A file that cannot be read certainly does not hold your work.
  assert.equal(matchesSaved('{ not json', serialise(someState(), { name: 'W' })), false)
  assert.equal(matchesSaved('', serialise(someState(), { name: 'W' })), false)
})

test('comparable survives rubbish without throwing', () => {
  for (const junk of [null, undefined, 7, 'text', []]) assert.doesNotThrow(() => comparable(junk))
})

/* --------------------------------------------------- reopening last time */

test('restore brings back the file, not only its contents', () => {
  // The autosave always carried the *content*. What was missing was which file
  // that content belonged to, so a restart left the work on screen while the
  // app read "Not saved to a file" and Save asked for a location again.
  const body = bodyOf(app, 'async function restoreWorkspace()')
  assert.match(body, /S\.filePath = saved\.filePath/, 'the remembered file is not adopted on restore')
})

test('a file saved and closed cleanly opens as itself with no autosave', () => {
  const body = bodyOf(app, 'async function restoreWorkspace()')
  // `restore` returns the pointer even when there is no autosave text.
  assert.match(body, /if \(!saved\.text\?\.trim\(\)\)/)
  assert.match(body, /workspace\.reread\(saved\.filePath\)/)
})

test('the autosave can be forced, so a quick Ctrl+S cannot leave it stale', () => {
  // The way work went missing: the debounce fires three seconds after you stop
  // typing, and `dirty` is cleared by any successful write — including a file
  // save. Edit, Ctrl+S within three seconds, close: the file was right and the
  // app's own copy still held the state from before, which is what came back.
  const body = bodyOf(app, 'async function autosave(')
  assert.match(body, /force = false/, 'autosave can no longer be forced')
  assert.match(body, /!S\.dirty && !force/, 'a forced autosave must run even when nothing is marked dirty')
})

test('every file save forces the autosave, so the two cannot diverge', () => {
  for (const fn of ['async function saveWorkspace()', 'async function saveWorkspaceAs()']) {
    assert.match(
      bodyOf(app, fn),
      /await autosave\(\{ force: true \}\)/,
      `${fn} must keep the app's own copy in step with the file`
    )
  }
})

test('closing flushes the autosave deterministically', () => {
  // `beforeunload` fires while the renderer is being torn down and its IPC is
  // fire-and-forget, so the last seconds of typing were riding on a race.
  const at = app.indexOf("$('winClose').onclick")
  const body = app.slice(at, at + 700)
  assert.match(body, /clearTimeout\(saveTimer\)/)
  assert.match(body, /await autosave\(\{ force: true \}\)/)
})

test('the restore comparison ignores the volatile fields', () => {
  const body = bodyOf(app, 'async function restoreWorkspace()')
  assert.match(body, /matchesSaved\(onDisk\.text/, 'restore is back to comparing raw text, which can never match')
})

test('restoring is not itself a change', () => {
  // `adopt` runs `commit`, which marks the workspace dirty. Left set, every
  // start would rewrite an identical autosave.
  const body = bodyOf(app, 'async function boot()')
  assert.match(body, /if \(restored\) S\.dirty = false/)
})

/* ------------------------------------------------------- the bar on a laptop */

test('the window is sized against the screen, not a fixed guess', () => {
  // A hard 1560x980 with a 1120x700 minimum is larger than a 1366x768 laptop
  // at 150% scaling, whose work area is 1280x672 points — the minimum height
  // alone exceeded the desktop. That is what made the bar look crowded on a
  // laptop and roomy on a monitor.
  assert.match(main, /screen\.getPrimaryDisplay\(\)\.workAreaSize/, 'the window still ignores the screen size')
  const body = main.slice(main.indexOf('function createWindow()'), main.indexOf('webPreferences'))
  for (const field of ['width', 'height', 'minWidth', 'minHeight']) {
    assert.match(body, new RegExp(`${field}: fit\\(`), `${field} is not clamped to the work area`)
  }
})

test('screen is imported, or the sizing throws at startup', () => {
  assert.match(main, /require\('electron'\)/)
  const line = main.slice(0, main.indexOf("require('electron')"))
  assert.match(line, /screen/, 'screen is not destructured from electron')
})

test('the bar gives way in order of what each control is worth', () => {
  // The crumbs duplicate the tree selection and the workbench header, so they
  // go first; Run flow and the environment name never go.
  const at = css.indexOf('@media (max-width: 1400px)')
  assert.ok(at > 0, 'the first bar breakpoint is gone')
  assert.match(css.slice(at, at + 200), /\.crumbs\s*\{\s*display: none/)
})

test('Import and Export collapse to icons but keep a title', () => {
  assert.match(html, /class="pill compacts" id="importBtn"[^>]*title=/)
  assert.match(html, /class="pill compacts" id="exportBtn"[^>]*title=/)
  // The label has to be wrapped for the rule to have something to hide.
  assert.match(html, /<span>Import<\/span>/)
  assert.match(html, /<span>Export<\/span>/)
  assert.match(css, /\.bar-right \.pill\.compacts span:not\(\.save-state\):not\(\.save-name\)/)
})

test('the primary verb and the environment name are never hidden', () => {
  // Run flow is the reason the bar exists; the environment is safety-critical,
  // because the difference between staging and production must not be a colour.
  const bar = css.slice(css.indexOf('@media (max-width: 1400px)'))
  assert.doesNotMatch(bar, /#runFlowBtn[^}]*display: none/)
  assert.doesNotMatch(bar, /#envLabel[^}]*display: none/)
})

/* ------------------------------------------------- the unsaved-changes ask */

test('the confirm uses the compact ask shape, not the wide sheet', () => {
  // It was built on `sheet`, which is min(1040px) — a screen-wide panel for a
  // two-line question, with Cancel stranded a thousand pixels from the answer
  // it was an alternative to.
  const body = bodyOf(app, 'function keepOrDiscard(')
  assert.match(body, /class: 'ask'/, 'the confirm is not using the compact ask shape')
  assert.doesNotMatch(body, /sheet\(\{/, 'the confirm is back on the wide sheet')
})

test('no answer is labelled "Close" in a dialog about closing the app', () => {
  // The sheet template contributed its own "Close" button, which in a dialog
  // headed "Closing Prism will leave…" read as "yes, close it".
  const body = bodyOf(app, 'function keepOrDiscard(')
  assert.doesNotMatch(body, /text: 'Close'/)
  for (const label of ['Cancel', "Don't save", 'Save']) {
    assert.ok(body.includes(label), `the confirm no longer offers "${label}"`)
  }
})

test('the safe answer takes the focus', () => {
  assert.match(bodyOf(app, 'function keepOrDiscard('), /save\.focus\(\)/)
})

test('a cancelled file dialog is not read as saved', () => {
  const body = bodyOf(app, 'function keepOrDiscard(')
  assert.match(body, /const ok = await saveWorkspace\(\)/)
  assert.match(body, /resolve\(ok\)/)
})

test('the caution mark is amber, since nothing is being destroyed', () => {
  assert.match(css, /\.ask-mark\.is-hold/)
  assert.match(bodyOf(app, 'function keepOrDiscard('), /ask-mark is-hold/)
})

/* --------------------------------------------------------------- the icon */

test('the app sets a window icon', () => {
  assert.match(main, /function appIcon\(\)/, 'no runtime window icon — a dev run shows Electron’s own logo')
  assert.match(bodyOf(main, 'function createWindow()'), /\.\.\.\(icon \? \{ icon \} : \{\}\)/)
})

/* ------------------------------------------- what a save actually keeps */

const roundTrip = (state) => {
  const back = parse(JSON.stringify(serialise(state, { name: 'W' })))
  assert.equal(back.ok, true, back.error)
  return back.workspace
}

test('headers and auth set on a collection or a flow survive a save', () => {
  // These were never written, so a token set once on the collection -- the
  // whole point of inheritance -- was gone after the first save.
  const state = someState()
  const col = state.collections[0]
  col.headers = [{ id: 'r1', key: 'X-Api-Version', value: '2', on: true }]
  col.auth = { kind: 'bearer', token: '{{auth_token}}' }
  col.flows[0].headers = [{ id: 'r2', key: 'X-Tenant', value: 'acme', on: false }]
  col.flows[0].auth = { kind: 'basic', username: 'u', password: 'p' }

  const back = roundTrip(state).collections[0]
  assert.deepEqual(back.headers.map(({ key, value, on }) => ({ key, value, on })), [{ key: 'X-Api-Version', value: '2', on: true }])
  assert.deepEqual(back.auth, { kind: 'bearer', token: '{{auth_token}}' })
  assert.deepEqual(back.flows[0].headers.map(({ key, on }) => ({ key, on })), [{ key: 'X-Tenant', on: false }])
  assert.equal(back.flows[0].auth.kind, 'basic')
})

test('GraphQL variables survive a save', () => {
  const state = someState()
  state.collections[0].flows[0].requests[0].gqlVariables = '{ "id": 7 }'
  assert.equal(roundTrip(state).collections[0].flows[0].requests[0].gqlVariables, '{ "id": 7 }')
})

test('hand-placed nodes are remembered as hand-placed', () => {
  // Positions were saved but which ones were dragged was not, so the
  // auto-stacker re-flowed every column on the next start.
  const state = someState()
  const id = state.collections[0].flows[0].requests[0].id
  state.layout.set(id, { x: 400, y: 900 })
  state.moved = new Set([id, 'gone'])
  const back = roundTrip(state)
  assert.deepEqual([...back.moved], [id], 'only ids that still have a position are kept')
  assert.deepEqual(back.layout.get(id), { x: 400, y: 900 })
})

test('run history survives a save and comes back on open', () => {
  const state = someState()
  state.history = [{ requestId: 'r', name: 'Log in', method: 'POST', status: 200, ms: 12, at: 5, env: 'Dev', failed: 0 }]
  assert.equal(roundTrip(state).history.length, 1)
  assert.match(bodyOf(app, 'function adopt('), /S\.history = workspace\.history/, 'adopt() must not throw the saved history away')
})

test('a file re-serialises to the same fingerprint it was written with', () => {
  const state = someState()
  state.collections[0].auth = { kind: 'bearer', token: 'x' }
  const doc = serialise(state, { name: 'W' })
  const reread = parse(JSON.stringify(doc)).workspace
  assert.equal(comparable(serialise(reread, { name: reread.name })), comparable(doc))
})

/* ---------------------------------------- import never becomes the document */

test('Import reads a file without making it the open document', () => {
  const body = handlerOf(main, 'file:open')
  assert.doesNotMatch(body, /rememberFile\(|chosenPaths\.add\(/, 'an imported file must never become a Save target')
  assert.match(bodyOf(app, 'async function openWorkspace('), /workspace\.open\(\)/, 'Open must use the workspace-only dialog')
})

test('only a real workspace can be remembered or handed back', () => {
  assert.match(handlerOf(main, 'workspace:open'), /isWorkspaceText\(text\)/)
  assert.match(bodyOf(main, 'function lastFile('), /isWorkspaceText\(/, 'a remembered non-workspace from an older build must be dropped')
})

/* ----------------------------------------------- unsaved is derived, not kept */

test('unsaved state is compared, not flagged by hand', () => {
  const body = bodyOf(app, 'function syncState(')
  assert.match(body, /S\.fileDirty = Boolean\(S\.filePath\) && comparable\(doc\) !== written\.file/)
  assert.match(body, /S\.dirty = autoKey\(doc\) !== written\.auto/)
})

test('every field edit anywhere is noticed', () => {
  assert.match(bodyOf(app, 'function watchEdits('), /'input', 'change'/)
  assert.match(bodyOf(app, 'async function boot()'), /watchEdits\(\)/)
})

test('dragging a node and sending a request both schedule a save', () => {
  const drag = app.slice(app.indexOf('S.moved.add(req.id)'), app.indexOf('S.moved.add(req.id)') + 200)
  assert.match(drag, /touch\(\)/)
  assert.match(bodyOf(app, 'function remember('), /touch\(\)/)
})

test('an autosave records what it sent, not what is on screen when it returns', () => {
  const body = bodyOf(app, 'async function autosave(')
  assert.match(body, /written\.auto = autoKey\(doc\)/)
})

/* ------------------------------------------------- every route out is covered */

test('the OS close is held until the page has saved', () => {
  assert.match(main, /win\.on\('close', \(e\) => \{[\s\S]*?e\.preventDefault\(\)[\s\S]*?window:closeRequested/)
  assert.match(main, /ipcMain\.handle\('window:closeNow'/)
  assert.match(preload, /onCloseRequested: \(/)
  assert.match(app, /window\.prism\.window\.onCloseRequested\(/)
})

/* ------------------------------------------- an empty workspace stays empty */

test('an empty saved workspace restores as empty, not as a demo', () => {
  // Deleting the last collection, saving and reopening used to bring a demo
  // back in its place, because an empty workspace was read as "nothing saved".
  const body = bodyOf(app, 'async function restoreWorkspace()')
  assert.doesNotMatch(body, /countIn\(/, 'restore must not reject a workspace for having no requests')
  assert.doesNotMatch(app, /demoWorkspace|from '\.\/demo\.js'/, 'there is no demo to fall back to')
})

test('Prism takes in no recordings', () => {
  for (const marker of ['paintIntake', 'S.recorded', 'req.recorded', "'rebind-workspace'"]) {
    assert.ok(!app.includes(marker), `${marker} is still in the renderer`)
  }
  assert.doesNotMatch(html, /id="intake"/)
})
