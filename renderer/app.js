/**
 * Prism — the workspace.
 *
 * THE IDEA
 *
 * A request is rarely interesting on its own. What people test is a sequence —
 * log in, take the token, fetch the profile, take the id, place an order — and
 * what breaks is usually the join between two steps rather than either step.
 * So the middle of the screen is a plane with the requests on it and the
 * variables drawn travelling between them.
 *
 * WHY A NODE IS NOT AN EDITOR
 *
 * The node used to open into the whole request form, which made it a different
 * size at every zoom and unreadable at half of them. A node is now a *label*:
 * what it calls, what it needs, what it gives, and how it went last time.
 * Everything editable lives in the workbench on the right. You read the graph
 * on the plane and you change things in one fixed place.
 *
 * THREE LEVELS
 *
 * Collection → flow → request, which is what a Postman file and an OpenAPI
 * document both actually are. Flattening that lost where a flow came from and
 * made a re-export produce a file shaped differently from the one opened.
 */
import {
  readCollection,
  emptyRequest,
  emptyFlow,
  emptyCollection,
  row,
  uid,
  shortPath,
  countRequests
} from '../lib/collection.js'
import { compile, buildUrl, variablesUsed, interpolate } from '../lib/request.js'
import { runAll, emptyAssertion, SUBJECTS, OPERATORS, OP_LABEL, suggestFor, jsonPath } from '../lib/assert.js'
import { analyse, bytes as fmtBytes } from '../lib/insights.js'
import { tree, diff, diffSummary } from '../lib/schema.js'
import { TARGETS, GROUPS, WHOLE_FLOW, generate, slug } from '../lib/codegen.js'
import { SETTINGS, GROUPS as SET_GROUPS, load as loadSettings, save as saveSettings, themeAttribute } from '../lib/settings.js'
import { serialise, parse as parseWorkspace, countIn, missingSecrets, matchesSaved, comparable } from '../lib/workspace.js'
import { plan, describe as describePlan, outOfOrder } from '../lib/plan.js'
import { fromCurl } from '../lib/curl.js'
import { lines as jsonLines, suggestName, capturable } from '../lib/jsonlines.js'
import { effectiveHeaders, effectiveAuth, withInherited, inheritedFor, anyInherited } from '../lib/inherit.js'
import { label as gqlLabel, errorsIn, looksGraphQL, INTROSPECTION, readSchema, stubFor } from '../lib/graphql.js'
import { GRANTS, SECRET_FIELDS, emptyOauth, tokenRequest, readToken, stale, nextStep, missingFields, refreshWith, remaining } from '../lib/oauth.js'
import { summarise, flaky as flakyRuns, spark, headline, repeatVerdict } from '../lib/trend.js'
import { readDataset, scopeFor, labelFor, unusedColumns } from '../lib/dataset.js'
import { parseDotEnv, audit as auditEnv, looksSecret, copyName, freeName, renameKey, compare as compareEnvs } from '../lib/env.js'
import { DYNAMIC, DYNAMIC_HELP } from '../lib/request.js'

/* ============================================================== plumbing */

const $ = (id) => document.getElementById(id)

const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') n.className = v
    else if (k === 'text') n.textContent = v
    else if (k === 'html') n.innerHTML = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid)
  return n
}

const ico = (d, size = 13, w = 2) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const I = {
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12 5.5 5.5L20 7"/>',
  dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/>',
  unlock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  bin: '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/>',
  pencil: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  up: '<path d="M12 14V4"/><path d="m8 8 4-4 4 4"/><path d="M4 20h16"/>',
  import: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M4 20h16"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  snow: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  // A floppy disk, still the only glyph everyone reads as "save".
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  revert: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function toast(kind, text) {
  const n = el('div', { class: `toast ${kind}` }, [el('i'), el('span', { text })])
  $('notes').append(n)
  setTimeout(() => {
    n.style.opacity = '0'
    setTimeout(() => n.remove(), 200)
  }, 3200)
}

/* ================================================================= state */

const S = {
  collections: [],
  environments: [],
  envId: '',
  pickedId: '',
  layout: new Map(),
  /** Nodes the user has dragged. Auto-stacking leaves these alone. */
  moved: new Set(),
  results: new Map(),
  previous: new Map(),
  busy: new Set(),
  history: [],
  editTab: 'params',
  respTab: 'brief',
  view: { x: 90, y: 70, z: 1 },
  split: 55,
  /** 'split' | 'request' | 'response' — which half has the panel. */
  pane: 'split',
  prefs: {},
  /** requestId -> a response deliberately frozen as the known-good shape. */
  baselines: new Map(),
  /** What the tree is filtered to. */
  filter: '',
  /** What the response body is searched for. */
  find: '',
  /** Set once anything changes, cleared once the autosave lands. */
  dirty: false,
  savedName: 'Workspace',
  /**
   * The file this workspace is being edited as, if any.
   *
   * What turns Save from "always ask me where" into an actual save. Set by Open
   * and by Save as; empty for a workspace that has only ever lived in the
   * autosave, where Save has to ask once.
   */
  filePath: '',
  /** Set while a write is in flight, so the state chip can say so. */
  saving: false,
  /** True once what is on screen differs from the file on disk. */
  fileDirty: false
}

const allFlows = () => S.collections.flatMap((c) => c.flows)
const allRequests = () => allFlows().flatMap((f) => f.requests)
const findRequest = (id) => allRequests().find((r) => r.id === id) ?? null
const flowOf = (id) => allFlows().find((f) => f.requests.some((r) => r.id === id)) ?? null
const collectionOf = (id) => S.collections.find((c) => c.flows.some((f) => f.requests.some((r) => r.id === id))) ?? null
const current = () => findRequest(S.pickedId)
const environment = () => S.environments.find((e) => e.id === S.envId) ?? null
const envValues = () => environment()?.values ?? {}

function commit(what = 'all') {
  touch()
  if (what === 'all' || what === 'tree') paintTree()
  if (what === 'all' || what === 'plane') paintPlane()
  if (what === 'all' || what === 'bench') paintBench()
  if (what === 'all') paintBar()
  drawBeams()
  // A sheet that edits the workspace -- a collection's auth and headers --
  // is not part of any of the above, and used to sit there showing the old
  // state: pick Bearer, and no token field appeared until it was reopened.
  sheetRepaint?.()
}

/** Set while a sheet that shows editable workspace state is open. */
let sheetRepaint = null

/* ================================================================= theme */

/**
 * Puts the chosen theme on the root element.
 *
 * Three states, not two. 'system' deliberately sets *no* attribute, which
 * leaves the `prefers-color-scheme` block in charge and lets the app follow
 * the machine while it is open. An explicit choice stamps the attribute and
 * wins over the system in both directions.
 */
function applyTheme() {
  const attr = themeAttribute(S.prefs.theme)
  if (attr) document.documentElement.setAttribute('data-theme', attr)
  else document.documentElement.removeAttribute('data-theme')
}

function setPref(id, value) {
  S.prefs[id] = value
  saveSettings(safeStorage(), S.prefs)
}

/** localStorage throws outright in some contexts rather than returning null. */
function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/* ============================================================ persistence

   Everything used to vanish when Prism closed: import a collection, spend
   twenty minutes wiring a chain, close the window, and it was gone. That
   undermined every other feature — History could not show a trend and Diff
   could only ever compare within one session.

   The working state is written to the app's own directory on a debounce, and
   restored on the next start. Save and Open write a file people can commit. */

let saveTimer = 0
let checkTimer = 0
let booting = true

/**
 * Fingerprints of what was last written, one per destination.
 *
 * Whether something is unsaved is *derived* by comparing what is on screen
 * against these, never tracked by hand. Tracking by hand is what broke Save:
 * every handler had to remember to call touch(), dozens did not (assertion
 * fields, capture paths, dragging a node), and the ones that did fired on
 * Open and Revert too, so a file was flagged unsaved the moment it opened.
 */
const written = { auto: '', file: '' }

/** The autosave's fingerprint: everything it stores except the timestamp. */
const autoKey = (doc) => JSON.stringify({ ...doc, savedAt: '' })

/** Marks the workspace possibly changed; the comparison decides whether it is. */
function touch() {
  if (booting) return
  clearTimeout(checkTimer)
  // Debounced lightly: a comparison per keystroke is wasted work, and a
  // close in the meantime runs syncState() itself before deciding anything.
  checkTimer = setTimeout(syncState, 150)
}

/**
 * Works out what is unsaved, repaints the indicator, and schedules the autosave.
 *
 * `fileDirty` is "the file on disk is behind the screen" -- so editing a value
 * and typing it back clears it, which no flag-based scheme could.
 */
function syncState() {
  clearTimeout(checkTimer)
  const doc = serialise(S, { name: S.savedName })
  S.dirty = autoKey(doc) !== written.auto
  S.fileDirty = Boolean(S.filePath) && comparable(doc) !== written.file
  paintSaveState()
  clearTimeout(saveTimer)
  if (S.dirty && S.prefs.autosave !== false) saveTimer = setTimeout(autosave, 1200)
}

/** Records that the open file now holds exactly what is on screen. */
function markFileWritten(doc = serialise(S, { name: S.savedName })) {
  written.file = comparable(doc)
  S.fileDirty = false
}

/**
 * Catches every edit, however it was made.
 *
 * Any field anywhere in the app that changes counts, so a panel added later
 * cannot forget to report its edits the way the assertion and capture fields
 * did. The comparison then throws away anything that was not a real change,
 * like typing in a search box.
 */
function watchEdits() {
  for (const kind of ['input', 'change']) document.addEventListener(kind, touch, true)
}

/**
 * Writes the working state to the app's own directory.
 *
 * `force` exists because of a real way to lose work. The debounce fires three
 * seconds after you stop typing, and `dirty` is cleared by *any* successful
 * write — including an explicit Save to a file. So: edit, press Ctrl+S within
 * three seconds, close. The file has the edit; `dirty` is false, so the
 * pending autosave declines to run and the app's own copy is left holding the
 * state from before. On the next start that older copy is what came back, and
 * the work looked lost even though the file was correct.
 *
 * Keeping the two in step is the fix, so every file save forces one of these.
 */
async function autosave({ force = false } = {}) {
  if ((!S.dirty && !force) || S.prefs.autosave === false) return
  clearTimeout(saveTimer)
  // The fingerprint is taken from the document actually sent, not from the
  // state after the write returns. Clearing a flag on return was how an edit
  // made *during* the write was marked saved and then never written.
  const doc = serialise(S, { name: S.savedName })
  const out = await window.prism.workspace.autosave(JSON.stringify(doc, null, 2))
  if (out?.ok) {
    written.auto = autoKey(doc)
    syncState()
  } else if (out?.error) {
    toast('bad', `Could not save: ${out.error}`)
  }
}

/** Just the file name, which is the part anyone recognises. */
const fileLabel = (path) => String(path).replace(/\\/g, '/').split('/').pop() || String(path)

/**
 * Which of five states the workspace is in.
 *
 * Named rather than derived inline in three places, because the distinction
 * that matters is between "kept in the app" and "written to your file", and
 * every caller has to make the same one.
 */
function saveState() {
  if (S.saving) return 'saving'
  if (S.filePath) return S.fileDirty ? 'unsaved' : 'saved'
  // With "Remember my work" off nothing is kept for it, so claiming it is
  // about to be would be a lie that costs somebody their work.
  if (S.prefs.autosave === false) return S.dirty ? 'unsaved' : 'autosaved'
  return S.dirty ? 'pending' : 'autosaved'
}

/**
 * The save control: what state the workspace is in, and the way to act on it.
 *
 * This used to be a six-pixel unlabelled dot with a tooltip, next to a bar
 * offering Import, Export and Run and no Save at all. Saving existed the whole
 * time — an autosave, Ctrl+S, two command-palette entries — and none of it was
 * visible, which from the outside is indistinguishable from not existing. So
 * the state is spelled out in words, beside a button that does the thing.
 */
function paintSaveState() {
  const state = saveState()
  const dot = $('saveState')
  const btn = $('saveBtn')
  const label = $('saveLabel')

  if (dot) {
    dot.className = `save-state is-${state}`
    dot.title = {
      saved: `Saved to ${S.filePath}`,
      unsaved: S.filePath ? `Unsaved changes — ${S.filePath}` : 'Not kept — “Remember my work” is off. Save to a file to keep it.',
      saving: 'Saving…',
      pending: 'Kept in the app; saving shortly. Save to a file to keep a copy you can commit.',
      autosaved: 'Kept in the app between sessions. Save to a file to keep a copy you can commit.'
    }[state]
  }

  const status = $('statusSave')
  if (status) {
    const words = {
      saved: `Saved · ${S.filePath ? fileLabel(S.filePath) : ''}`,
      unsaved: S.filePath ? `Unsaved changes · ${fileLabel(S.filePath)}` : 'Not kept — Remember my work is off',
      saving: 'Saving…',
      pending: 'Saving to the app…',
      autosaved: 'Kept in the app · not saved to a file'
    }[state]
    const mark = el('i', { class: 'status-dot' })
    mark.classList.add(`is-${state}`)
    status.replaceChildren(mark, el('span', { text: words }))
    status.title = dot?.title ?? ''
  }

  if (label) {
    label.textContent = S.filePath ? fileLabel(S.filePath) : 'Not saved to a file'
    label.classList.toggle('muted', !S.filePath)
    label.title = S.filePath || 'This workspace lives in the app’s own storage. Save it to a file to keep or share it.'
  }

  if (btn) {
    btn.classList.toggle('dirty', state === 'unsaved' || state === 'pending')
    btn.disabled = state === 'saving'
    btn.title = S.filePath
      ? S.fileDirty
        ? `Save changes to ${fileLabel(S.filePath)} (Ctrl+S)`
        : `No changes since the last save — ${fileLabel(S.filePath)} (Ctrl+S)`
      : 'Save this workspace to a file (Ctrl+S)'
  }
}

/** Puts a parsed workspace on screen, replacing whatever is there. */
function adopt(workspace, note) {
  S.collections = workspace.collections
  S.environments = workspace.environments
  S.envId = workspace.envId
  S.layout = workspace.layout
  // Hand-placed nodes stay where they were put. Left as the previous
  // workspace's set, the auto-stacker re-flowed every column on open.
  S.moved = new Set(workspace.moved ?? [])
  S.baselines = workspace.baselines
  S.savedName = workspace.name
  S.results.clear()
  S.previous.clear()
  // The run history is saved with the workspace and has to come back with
  // it; emptying it here is what made History and every trend start blank.
  S.history = workspace.history ?? []
  S.pickedId = allRequests()[0]?.id ?? ''
  commit()
  setTimeout(focusFlow, 30)

  const gone = missingSecrets(workspace)
  if (gone.length) {
    // Said out loud rather than left to fail at send time: the values were
    // withheld on purpose and only the person opening the file can restore
    // them.
    toast('bad', `${gone.length === 1 ? 'A secret needs' : `${gone.length} secrets need`} refilling: ${gone.slice(0, 3).join(', ')}`)
  }
  if (note) toast('ok', note)
}

/**
 * What was open last time, back on screen — and back as the same document.
 *
 * Two things come back, and only one of them used to. The autosave carries the
 * *content*, including edits made after the last explicit save. The remembered
 * path carries which file that content belongs to, and without it a restart
 * left the work on screen but the app reading "Not saved to a file": Save
 * asked for a location again, and the file you had been editing all week was
 * no longer the file you were editing.
 *
 * Preference order when both exist: the autosave wins as the *content*,
 * because it is never older than the file and may hold work the file has not
 * got. The file is then compared against it to decide whether anything is
 * outstanding, so the indicator is honest from the first paint rather than
 * claiming "saved" over a workspace that is three edits ahead.
 */
async function restoreWorkspace() {
  const saved = await window.prism.workspace.restore()
  if (!saved) return false

  // A file remembered with no autosave beside it: saved, closed cleanly, and
  // opened again. Read the file itself.
  if (!saved.text?.trim()) {
    if (!saved.filePath) return false
    const back = await window.prism.workspace.reread(saved.filePath)
    if (!back?.text) return false
    const fromFile = parseWorkspace(back.text, back.name)
    if (!fromFile.ok) return false
    adopt(fromFile.workspace)
    S.filePath = saved.filePath
    markFileWritten()
    S.dirty = false
    return true
  }

  const result = parseWorkspace(saved.text, 'the saved workspace')
  if (!result.ok) {
    toast('bad', result.error)
    return false
  }
  adopt(result.workspace)

  if (saved.filePath) {
    S.filePath = saved.filePath
    // Compared rather than assumed, on the authored content only. A straight
    // text comparison can never match: `serialise` stamps a fresh `savedAt`
    // every call, so a workspace restored moments after being saved came back
    // flagged as having unsaved changes.
    const onDisk = await window.prism.workspace.reread(saved.filePath)
    const current = serialise(S, { name: S.savedName })
    if (onDisk?.text && matchesSaved(onDisk.text, current)) markFileWritten(current)
    else written.file = fileKey(onDisk?.text)
    S.fileDirty = comparable(current) !== written.file
    if (S.fileDirty) {
      toast('hold', `${fileLabel(saved.filePath)} has unsaved changes from last time — Ctrl+S writes them`)
    }
  }
  return true
}

/**
 * The fingerprint of a file's content, read the way Prism would hold it.
 *
 * Re-serialised rather than taken raw, so a file written by an older build --
 * missing a field this one writes, or with keys in another order -- is not
 * reported as different from the identical workspace on screen.
 */
function fileKey(text) {
  const result = parseWorkspace(text ?? '')
  if (!result.ok) return ''
  return comparable(serialise(result.workspace, { name: result.workspace.name }))
}

async function openWorkspace() {
  if (!(await keepOrDiscard('Opening another workspace'))) return
  const chosen = await window.prism.workspace.open()
  if (!chosen) return
  if (chosen.error) {
    toast('bad', chosen.error)
    return
  }
  const result = parseWorkspace(chosen.text, chosen.name)
  if (!result.ok) {
    toast('bad', result.error)
    return
  }
  adopt(result.workspace, `Opened ${result.workspace.name} — ${countIn(result.workspace)} requests`)
  // Remembered, so Save writes back here rather than asking again. The main
  // process only vouches for a path it has checked is a workspace.
  S.filePath = chosen.path ?? ''
  markFileWritten(serialise(result.workspace, { name: result.workspace.name }))
  // The opened workspace replaces the autosave too, or the next start would
  // bring back whatever was open before it.
  await autosave({ force: true })
  syncState()
}

/** The workspace as it would be written. */
const workspaceText = () => JSON.stringify(serialise(S, { name: S.savedName }), null, 2)

/**
 * Save, in the sense every other application means it.
 *
 * Writes back to the open file when there is one, and asks only the first
 * time. It used to ask every single time, which is what made a one-key Save
 * behave like an export — and, together with there being no button anywhere,
 * why the tool read as having no save at all.
 */
async function saveWorkspace() {
  if (!S.filePath) return saveWorkspaceAs()
  if (S.saving) return false
  S.saving = true
  paintSaveState()
  // The document is fixed before the write, so an edit made while the write
  // is in flight is still reported as unsaved afterwards.
  const doc = serialise(S, { name: S.savedName })
  let out
  try {
    out = await window.prism.workspace.write({ path: S.filePath, text: JSON.stringify(doc, null, 2) })
  } catch (err) {
    out = { error: String(err?.message ?? err) }
  }
  S.saving = false
  if (out?.ok) {
    markFileWritten(doc)
    // Forced, so the app's own copy cannot be left older than the file it was
    // just written to. See the note on `autosave`.
    await autosave({ force: true })
    syncState()
    toast('ok', `Saved ${fileLabel(S.filePath)}`)
    return true
  }
  paintSaveState()
  // A file that has moved, or gone read-only, must not silently do nothing.
  toast('bad', out?.error ? `Could not save: ${out.error}` : 'Could not save that file')
  return false
}

async function saveWorkspaceAs() {
  if (S.saving) return false
  S.saving = true
  paintSaveState()
  const doc = serialise(S, { name: S.savedName })
  let out
  try {
    out = await window.prism.workspace.saveAs({ name: slug(S.savedName), text: JSON.stringify(doc, null, 2) })
  } catch (err) {
    out = { error: String(err?.message ?? err) }
  }
  S.saving = false
  if (out?.error) {
    paintSaveState()
    toast('bad', `Could not save: ${out.error}`)
    return false
  }
  if (!out?.path) {
    paintSaveState()
    return false
  }
  S.filePath = out.path
  markFileWritten(doc)
  await autosave({ force: true })
  syncState()
  toast('ok', `Saved to ${out.path}`)
  return true
}

/** Throws away what is on screen and re-reads the file on disk. */
async function revertWorkspace() {
  if (!S.filePath) return
  const yes = await ask({
    title: `Discard changes to ${fileLabel(S.filePath)}?`,
    blurb: 'Everything since the last save will be lost, and the file on disk reloaded in its place.',
    note: 'This cannot be undone.',
    danger: 'Discard and reload'
  })
  if (!yes) return
  const back = await window.prism.workspace.reread(S.filePath)
  if (!back?.text) {
    toast('bad', back?.error ? `Could not read that file: ${back.error}` : 'That file is no longer readable')
    return
  }
  const result = parseWorkspace(back.text, back.name)
  if (!result.ok) {
    toast('bad', result.error)
    return
  }
  const path = S.filePath
  adopt(result.workspace, `Reloaded ${fileLabel(path)}`)
  S.filePath = path
  markFileWritten()
  // The discarded edits are discarded from the app's own copy as well, or
  // they would come back on the next start.
  await autosave({ force: true })
  syncState()
}

/**
 * Asks before an action that would leave unsaved file changes behind.
 *
 * Three answers, because there are three real intentions: save first, carry on
 * regardless, or go back. Only asked when there is a file *and* it is behind —
 * a workspace that has only ever been autosaved is not at risk, since it comes
 * back on the next start, and prompting there would be noise.
 *
 * @returns {Promise<boolean>} whether the caller should proceed
 */
function keepOrDiscard(what) {
  // Decided on the current content, not on a debounced flag that may not
  // have caught up with the last keystroke.
  if (!booting) syncState()
  if (!S.filePath || !S.fileDirty) return Promise.resolve(true)
  return new Promise((resolve) => {
    let answered = false
    const settle = (value) => {
      answered = true
      onSheetClose = null
      closeSheet()
      resolve(value)
    }

    const veil = $('veil')
    veil.replaceChildren()
    veil.hidden = false
    sheetUp = true
    // Dismissing means "take me back" — the safe reading of a dialog about
    // losing work — and it has to hold for Escape and the backdrop too.
    onSheetClose = () => {
      if (!answered) resolve(false)
    }

    const body = el('div', { class: 'ask-body' }, [
      el('div', { class: 'ask-head' }, [
        // Amber, not red: nothing is being destroyed, and the autosave means
        // the work itself survives either way. Only the file is behind.
        el('span', { class: 'ask-mark is-hold', html: ico(I.alert, 17, 1.8) }),
        el('div', {}, [
          el('h2', { text: 'Save changes first?' }),
          el('p', { text: `${what} will leave the changes since your last save behind.` })
        ])
      ]),
      subjectGroup(I.save, fileLabel(S.filePath), S.filePath),
      el('p', { class: 'ask-aside', text: 'Your work is kept in the app either way and comes back next time. Only this file would be out of date.' })
    ])

    const cancel = el('button', { class: 'btn plain', type: 'button', text: 'Cancel', onclick: () => settle(false) })
    const save = el('button', { class: 'btn go', type: 'button', text: 'Save', onclick: async () => {
      // Resolved with the save's own result: a cancelled file dialog must not
      // be read as "saved, carry on".
      answered = true
      onSheetClose = null
      const ok = await saveWorkspace()
      closeSheet()
      resolve(ok)
    } })

    body.append(
      el('div', { class: 'ask-acts' }, [
        cancel,
        el('span', { class: 'ask-acts-gap' }),
        el('button', { class: 'btn bad', type: 'button', text: "Don't save", onclick: () => settle(true) }),
        save
      ])
    )

    veil.append(el('div', { class: 'ask' }, [body]))
    veil.onpointerdown = (e) => {
      if (e.target === veil) closeSheet()
    }
    // Save takes the focus: it is the answer that loses nothing.
    save.focus()
  })
}

/** Opens the folder holding the saved file. */
async function revealWorkspace() {
  if (!S.filePath) return
  const shown = await window.prism.workspace.reveal(S.filePath)
  if (!shown) toast('bad', 'That file is no longer where it was saved')
}

/**
 * The workspace switcher's menu: naming it, the document actions, and the
 * pages that are about the workspace as a whole.
 */
function workspaceMenu() {
  return [
    { icon: I.home, label: 'Overview', run: () => openOverview() },
    { icon: I.pencil, label: 'Rename workspace…', run: () => renameWorkspace() },
    { sep: true },
    ...saveMenu(),
    { sep: true },
    { icon: I.import, label: 'Import…', run: () => doImport() },
    { icon: I.up, label: 'Export…', run: () => openExport() }
  ]
}

/** The workspace's own name, which is what a saved file is called by default. */
async function renameWorkspace() {
  const name = await promptText({ title: 'Rename workspace', value: S.savedName || 'Workspace', action: 'Rename' })
  if (!name) return
  S.savedName = name
  commit()
  toast('ok', `Workspace renamed to ${name}`)
}

/** The Save button's menu — everything a document needs, in one place. */
function saveMenu() {
  return [
    {
      icon: I.save,
      label: S.filePath ? `Save ${fileLabel(S.filePath)}` : 'Save to a file…',
      keys: 'Ctrl+S',
      disabled: Boolean(S.filePath) && !S.fileDirty,
      run: () => void saveWorkspace()
    },
    { icon: I.copy, label: 'Save as…', keys: 'Ctrl+Shift+S', run: () => void saveWorkspaceAs() },
    { sep: true },
    { icon: I.folder, label: 'Open a workspace…', keys: 'Ctrl+O', run: () => void openWorkspace() },
    { icon: I.eye, label: 'Show in folder', disabled: !S.filePath, run: () => void revealWorkspace() },
    {
      icon: I.revert,
      label: 'Discard changes and reload',
      disabled: !S.filePath || !S.fileDirty,
      danger: true,
      run: () => void revertWorkspace()
    }
  ]
}

/* =================================================================== bar */

function paintBar() {
  const req = current()
  const flow = req ? flowOf(req.id) : null
  const col = req ? collectionOf(req.id) : S.collections[0]
  const crumbs = $('crumbs')
  crumbs.replaceChildren()
  ;[col?.name, flow?.name].filter(Boolean).forEach((bit, i) => {
    if (i) crumbs.append(el('i', { text: '/' }))
    crumbs.append(el('span', { text: bit }))
  })

  $('wsName').textContent = S.savedName || 'Workspace'

  const env = environment()
  $('envLabel').textContent = env ? env.name : 'No environment'
  $('envDot').className = `env-dot${env ? ' on' : ''}${env && /prod|live|release/i.test(env.name) ? ' risky' : ''}`
  $('runFlowBtn').disabled = !allFlows().some((f) => f.requests.length)
  $('exportBtn').disabled = !allRequests().length
  paintStatus()
}

/** The status line: how much is here, and which environment it runs against. */
function paintStatus() {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
  const counts = $('statusCounts')
  if (counts) {
    counts.textContent = `${n(S.collections.length, 'collection')} · ${n(allFlows().length, 'flow')} · ${n(allRequests().length, 'request')}`
  }
  const env = environment()
  const where = $('statusEnv')
  if (where) {
    where.replaceChildren(el('i', { class: `status-dot${env ? ' is-saved' : ''}` }), el('span', { text: env ? env.name : 'No environment' }))
  }
}

/**
 * Shows or folds the collections sidebar. Remembered per machine, since it is
 * a preference about the screen rather than part of the work.
 */
function setTreeShown(shown) {
  $('stage').classList.toggle('tree-off', !shown)
  paintRail()
  try {
    window.localStorage.setItem('prism.treeOff', shown ? '0' : '1')
  } catch {
    /* a preference that cannot be stored is still applied for this session */
  }
  // The plane changes width with the grid, and the wires are drawn against
  // its box, so they are redrawn once the column has finished moving.
  setTimeout(drawBeams, 240)
}

/* ================================================================== tree */

/* --------------------------------------------------------------- the tree

   Every row is the same shape: twist, glyph, name, count, one actions button.
   The actions button is always in the layout and only becomes visible on
   hover, so nothing moves when the pointer crosses a row — a menu that shifts
   the thing you were aiming at is a menu you misclick. */

/** The row currently being renamed in place, if any. */
let renaming = ''

function paintTree() {
  const host = $('treeBody')
  host.replaceChildren()

  if (!S.collections.length) {
    host.append(
      el('p', { class: 'tree-nothing', html: 'No collections yet.<br />Import a Postman collection or an OpenAPI document, or start a blank request.' })
    )
    return
  }

  const q = S.filter.trim().toLowerCase()
  const hit = (req) =>
    !q || `${req.name} ${req.method} ${req.url}`.toLowerCase().includes(q)
  let shown = 0

  for (const col of S.collections) {
    const flows = el('div', { class: 'kids' })

    for (const flow of col.flows) {
      // A filter that leaves empty flows and collections behind is a filter
      // that has not really filtered anything.
      const matching = flow.requests.filter(hit)
      if (q && !matching.length && !flow.name.toLowerCase().includes(q)) continue
      const reqs = el('div', { class: 'kids' })
      for (const req of q ? matching : flow.requests) {
        shown += 1
        const res = S.results.get(req.id)
        const state = S.busy.has(req.id) ? 'busy' : res ? (res.failed ? 'fail' : 'pass') : ''
        reqs.append(
          treeRow({
            cls: `req-row${req.id === S.pickedId ? ' on' : ''}`,
            title: req.url || req.name,
            lead: el('span', { class: `verb ${req.method.toLowerCase()}`, text: req.method }),
            id: req.id,
            name: req.name || 'Untitled',
            onOpen: () => pick(req.id),
            onRename: (next) => {
              req.name = next
              commit()
            },
            trail: el('span', { class: `state ${state}` }),
            menu: () => requestMenu(req)
          })
        )
      }

      flows.append(
        el('div', { class: `flow${flow.open === false && !q ? ' shut' : ''}` }, [
          treeRow({
            cls: 'flow-row',
            twist: () => {
              flow.open = flow.open === false
              paintTree()
            },
            open: flow.open !== false,
            glyph: I.flow,
            id: flow.id,
            name: flow.name,
            count: flow.requests.length,
            onOpen: () => {
              flow.open = flow.open === false
              paintTree()
            },
            onRename: (next) => {
              flow.name = next
              commit()
            },
            menu: () => flowMenu(col, flow)
          }),
          reqs
        ])
      )
    }

    if (q && !flows.children.length && !col.name.toLowerCase().includes(q)) continue
    host.append(
      el('div', { class: `col${col.open === false && !q ? ' shut' : ''}` }, [
        treeRow({
          cls: 'col-row',
          twist: () => {
            col.open = col.open === false
            paintTree()
          },
          open: col.open !== false,
          glyph: I.folder,
          id: col.id,
          name: col.name,
          tag: col.source && col.source !== 'canvas' ? sourceTag(col.source) : '',
          onOpen: () => {
            col.open = col.open === false
            paintTree()
          },
          onRename: (next) => {
            col.name = next
            commit()
          },
          menu: () => collectionMenu(col)
        }),
        flows
      ])
    )
  }

  if (q && !shown) {
    host.append(el('p', { class: 'tree-nothing', text: `Nothing matches “${S.filter}”.` }))
  }
}

/**
 * One row of the tree.
 *
 * The name is a button until you rename it, at which point the same box
 * becomes an input in place — no dialog, because renaming is a thing people do
 * to six items in a row and a dialog each time is six dismissals.
 */
function treeRow({ cls, title, twist, open, glyph, lead, id, name, count, tag, trail, onOpen, onRename, menu }) {
  const row = el('div', { class: cls, title })

  if (twist) {
    row.append(
      el('button', {
        class: 'twist',
        type: 'button',
        'aria-label': open ? `Collapse ${name}` : `Expand ${name}`,
        html: ico(I.down, 11, 2.4),
        onclick: (e) => {
          e.stopPropagation()
          twist()
        }
      })
    )
  }
  if (glyph) row.append(el('span', { class: 'row-glyph', html: ico(glyph, 13, 1.8) }))
  if (lead) row.append(lead)

  if (renaming === id) {
    const input = el('input', {
      class: 'row-rename',
      value: name,
      'aria-label': 'Name',
      onkeydown: (e) => {
        if (e.key === 'Enter') e.target.blur()
        if (e.key === 'Escape') {
          renaming = ''
          paintTree()
        }
      },
      onblur: (e) => {
        const next = e.target.value.trim()
        renaming = ''
        if (next && next !== name) onRename(next)
        else paintTree()
      }
    })
    row.append(input)
    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  } else {
    row.append(el('button', { class: 'row-name', type: 'button', text: name, onclick: onOpen }))
    if (count !== undefined) row.append(el('span', { class: 'count', text: String(count) }))
    if (tag) row.append(el('span', { class: 'tag', text: tag }))
    if (trail) row.append(trail)
  }

  const more = el('button', {
    class: 'row-more',
    type: 'button',
    title: 'Actions',
    'aria-label': `Actions for ${name}`,
    'aria-haspopup': 'menu',
    html: ico('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', 13, 1.6),
    onclick: (e) => {
      e.stopPropagation()
      openMenu(e.currentTarget, menu())
    }
  })
  row.append(more)

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    openMenu(more, menu())
  })
  return row
}

function startRename(id) {
  renaming = id
  paintTree()
}

/* ------------------------------------------------------------- the menus */

function collectionMenu(col) {
  const requests = col.flows.flatMap((f) => f.requests)
  return [
    { label: 'Rename', keys: 'F2', icon: I.pencil, run: () => startRename(col.id) },
    { label: 'New flow', icon: I.plus, run: () => addFlow(col) },
    { label: 'Auth and headers', icon: I.lock, run: () => openLevel(col, 'collection') },
    { label: 'Duplicate', icon: I.copy, run: () => duplicateCollection(col) },
    { sep: true },
    { label: 'Run every flow', icon: I.play, disabled: !requests.length, run: () => runCollection(col) },
    { label: 'Export collection', icon: I.up, disabled: !requests.length, run: () => openExport(collectionAsFlow(col), null) },
    { sep: true },
    { label: 'Collapse all flows', icon: I.down, run: () => {
      for (const f of col.flows) f.open = false
      paintTree()
    } },
    { sep: true },
    { label: 'Delete collection', icon: I.bin, danger: true, run: () => askDeleteCollection(col) }
  ]
}

function flowMenu(col, flow) {
  return [
    { label: 'Rename', keys: 'F2', icon: I.pencil, run: () => startRename(flow.id) },
    { label: 'Auth and headers', icon: I.lock, run: () => openLevel(flow, 'flow') },
    { label: 'New request', icon: I.plus, run: () => addRequest(flow) },
    { label: 'Duplicate', icon: I.copy, run: () => duplicateFlow(col, flow) },
    { sep: true },
    { label: 'Run flow', icon: I.play, disabled: !flow.requests.length, run: () => runFlow(flow) },
    { label: 'Export flow', icon: I.up, disabled: !flow.requests.length, run: () => openExport(flow, null) },
    { sep: true },
    { label: 'Delete flow', icon: I.bin, danger: true, run: () => askDeleteFlow(col, flow) }
  ]
}

function requestMenu(req) {
  const flow = flowOf(req.id)
  return [
    { label: 'Rename', keys: 'F2', icon: I.pencil, run: () => startRename(req.id) },
    { label: 'Open', icon: I.eye, run: () => pick(req.id) },
    { label: 'Duplicate', icon: I.copy, run: () => duplicateRequest(flow, req) },
    { sep: true },
    { label: 'Send', keys: 'Ctrl ↵', icon: I.play, run: () => send(req) },
    { label: 'Export request', icon: I.up, run: () => openExport(flow, req) },
    { label: 'Run it ten times', sub: 'looking for a flake', icon: I.play, run: () => repeatRequest(req, 10) },
    { label: S.baselines.has(req.id) ? 'Re-freeze baseline' : 'Freeze as baseline', icon: I.snow, disabled: !S.results.has(req.id), run: () => freezeBaseline(req) },
    { label: 'Copy as cURL', icon: I.copy, run: () => {
      navigator.clipboard.writeText(generate('curl', { request: asSent(req), flow, environment: environment() }))
      toast('ok', 'cURL copied')
    } },
    { sep: true },
    { label: 'Delete request', icon: I.bin, danger: true, run: () => askDeleteRequest(req) }
  ]
}

/* ------------------------------------------------------------ duplicating */

/** A deep copy with fresh ids, so the two do not share rows or assertions. */
function copyRequest(req) {
  const clone = structuredClone(req)
  clone.id = uid('req')
  for (const key of ['query', 'pathParams', 'headers']) {
    clone[key] = (clone[key] ?? []).map((r) => ({ ...r, id: uid('row') }))
  }
  clone.assertions = (clone.assertions ?? []).map((a) => ({ ...a, id: uid('as') }))
  clone.captures = (clone.captures ?? []).map((c) => ({ ...c, id: uid('cap') }))
  return clone
}

function duplicateRequest(flow, req) {
  if (!flow) return
  const clone = copyRequest(req)
  clone.name = `${req.name} copy`
  flow.requests.splice(flow.requests.indexOf(req) + 1, 0, clone)
  S.pickedId = clone.id
  commit()
  toast('ok', `Duplicated ${req.name}`)
}

/**
 * What a collection or a flow hands down, copied deep. Without it a duplicate
 * looked identical and sent every request without the inherited token.
 */
const levelCopy = (level) => ({
  ...(level.headers ? { headers: structuredClone(level.headers) } : {}),
  ...(level.auth ? { auth: structuredClone(level.auth) } : {}),
  ...(level.description ? { description: level.description } : {})
})

function duplicateFlow(col, flow) {
  const clone = Object.assign(emptyFlow(`${flow.name} copy`, flow.requests.map(copyRequest)), levelCopy(flow))
  col.flows.splice(col.flows.indexOf(flow) + 1, 0, clone)
  commit()
  toast('ok', `Duplicated ${flow.name}`)
}

function duplicateCollection(col) {
  const clone = Object.assign(
    emptyCollection(
      `${col.name} copy`,
      col.flows.map((f) => Object.assign(emptyFlow(f.name, f.requests.map(copyRequest)), levelCopy(f))),
      col.source
    ),
    levelCopy(col)
  )
  S.collections.splice(S.collections.indexOf(col) + 1, 0, clone)
  commit()
  toast('ok', `Duplicated ${col.name}`)
}

/* --------------------------------------------------------- the popup menu */

function openMenu(anchor, items) {
  closeMenu()
  const box = anchor.getBoundingClientRect()
  const menu = el('div', { class: 'menu', role: 'menu' })

  for (const item of items) {
    if (item.sep) {
      menu.append(el('div', { class: 'menu-sep' }))
      continue
    }
    menu.append(
      el('button', {
        class: `menu-item${item.danger ? ' danger' : ''}`,
        type: 'button',
        role: 'menuitem',
        disabled: item.disabled === true,
        onclick: () => {
          closeMenu()
          item.run()
        }
      }, [
        el('span', { class: 'menu-icon', html: ico(item.icon, 13, 1.8) }),
        el('span', { class: 'menu-label', text: item.label }),
        item.keys ? el('span', { class: 'menu-keys', text: item.keys }) : null
      ])
    )
  }

  document.body.append(menu)
  // Placed after measuring, and flipped up or left when it would fall off.
  const w = menu.offsetWidth
  const h = menu.offsetHeight
  const left = Math.min(box.left, window.innerWidth - w - 10)
  const top = box.bottom + h + 10 > window.innerHeight ? box.top - h - 4 : box.bottom + 4
  menu.style.left = `${Math.max(8, left)}px`
  menu.style.top = `${Math.max(8, top)}px`

  // Closing on any pointerdown removed the menu before the click could land
  // on the item, so every entry did nothing at all. Only a press *outside*
  // dismisses it.
  setTimeout(() => {
    window.addEventListener('pointerdown', menuAway, true)
    window.addEventListener('keydown', menuKey)
  }, 0)
  menu.querySelector('.menu-item:not([disabled])')?.focus()
}

function menuAway(e) {
  if (!e.target.closest?.('.menu')) closeMenu()
}

function menuKey(e) {
  if (e.key === 'Escape') closeMenu()
}

function closeMenu() {
  document.querySelector('.menu')?.remove()
  window.removeEventListener('pointerdown', menuAway, true)
  window.removeEventListener('keydown', menuKey)
}

const sourceTag = (s) => ({ postman: 'postman', openapi: 'openapi', har: 'har' })[s] ?? s

/* ------------------------------------------------------- add and delete */

function addFlow(col) {
  const flow = emptyFlow(`Flow ${col.flows.length + 1}`)
  col.flows.push(flow)
  commit()
  toast('ok', `Added ${flow.name}`)
}

function addRequest(flow) {
  const req = emptyRequest({ name: 'New request', url: '{{base_url}}/' })
  flow.requests.push(req)
  S.pickedId = req.id
  commit()
  // Brought into view where it landed, rather than reframing everything.
  setTimeout(() => reveal(req.id), 20)
}

function newCollection() {
  const col = emptyCollection(`Collection ${S.collections.length + 1}`, [emptyFlow('Flow 1')])
  S.collections.push(col)
  commit()
}

/**
 * Deleting.
 *
 * Always confirmed, and always specific about what goes with it — deleting a
 * flow takes its requests, and a count is the difference between a decision
 * and a surprise. None of it is undoable, so the dialog is the safety net.
 */
function askDeleteRequest(req) {
  const goes = []
  const n = (req.assertions ?? []).length
  const c = (req.captures ?? []).filter((x) => x.name).length
  if (n) goes.push(`${n} assertion${n === 1 ? '' : 's'}`)
  if (c) goes.push(`${c} captured value${c === 1 ? '' : 's'}`)
  if (S.results.has(req.id)) goes.push('its last result and any history')

  askDelete({
    kind: 'request',
    subject: subjectCard(req),
    goes,
    breaks: dependants([req]),
    danger: 'Delete request',
    onYes: () => {
      const flow = flowOf(req.id)
      if (!flow) return
      flow.requests = flow.requests.filter((r) => r.id !== req.id)
      forget(req.id)
      if (S.pickedId === req.id) S.pickedId = allRequests()[0]?.id ?? ''
      commit()
      toast('ok', `Deleted ${req.name || 'the request'}`)
    }
  })
}

function askDeleteFlow(col, flow) {
  const n = flow.requests.length
  const goes = n
    ? [
        `${n} request${n === 1 ? '' : 's'}: ${flow.requests
          .slice(0, 4)
          .map((r) => r.name)
          .join(', ')}${n > 4 ? `, and ${n - 4} more` : ''}`
      ]
    : []

  askDelete({
    kind: 'flow',
    subject: subjectGroup(I.flow, flow.name, `in ${col.name}`),
    goes,
    breaks: dependants(flow.requests),
    danger: n ? `Delete flow and ${n} request${n === 1 ? '' : 's'}` : 'Delete flow',
    onYes: () => {
      for (const r of flow.requests) forget(r.id)
      col.flows = col.flows.filter((f) => f.id !== flow.id)
      if (!findRequest(S.pickedId)) S.pickedId = allRequests()[0]?.id ?? ''
      commit()
      toast('ok', `Deleted ${flow.name}`)
    }
  })
}

function askDeleteCollection(col) {
  const requests = col.flows.flatMap((f) => f.requests)
  const goes = []
  if (col.flows.length) goes.push(`${col.flows.length} flow${col.flows.length === 1 ? '' : 's'}: ${col.flows.map((f) => f.name).join(', ')}`)
  if (requests.length) goes.push(`${requests.length} request${requests.length === 1 ? '' : 's'}`)
  goes.push('The file you imported it from is untouched')

  askDelete({
    kind: 'collection',
    subject: subjectGroup(I.folder, col.name, col.source && col.source !== 'canvas' ? `imported from ${sourceTag(col.source)}` : 'made here'),
    goes,
    breaks: dependants(requests),
    danger: 'Delete collection',
    onYes: () => {
      for (const r of requests) forget(r.id)
      S.collections = S.collections.filter((c) => c.id !== col.id)
      if (!findRequest(S.pickedId)) S.pickedId = allRequests()[0]?.id ?? ''
      commit()
      toast('ok', `Deleted ${col.name}`)
    }
  })
}

/** Everything held against a request id, so nothing is left behind. */
function forget(id) {
  // The baseline too: it is saved with the workspace, and one for a request
  // that no longer exists stayed in every file written afterwards.
  S.baselines.delete(id)
  S.layout.delete(id)
  S.moved.delete(id)
  S.results.delete(id)
  S.previous.delete(id)
  S.busy.delete(id)
  S.history = S.history.filter((h) => h.requestId !== id)
}

/* ================================================================= plane */

/** Space is a modifier for panning, read by both the plane and each node. */
let spaceHeld = false

const NODE_W = 300
/** Where the connection handles sit, from the top of a node: level with its header. */
const HANDLE_Y = 26
const COL_GAP = 390
// Generous: a node with four ports is a good deal taller than one with none,
// and nodes that overlap on first open make the graph look broken.
const ROW_GAP = 208

function place() {
  let column = 0
  for (const flow of allFlows()) {
    flow.requests.forEach((req, i) => {
      // Room above the first node for the flow's lane header.
      if (!S.layout.has(req.id)) S.layout.set(req.id, { x: 40 + column * COL_GAP, y: 96 + i * ROW_GAP })
    })
    if (flow.requests.length) column += 1
  }
}

function tidy() {
  if (!allRequests().length) return
  S.layout.clear()
  S.moved.clear()
  place()
  commit('plane')
  setTimeout(fit, 20)
}

function paintPlane() {
  place()
  const host = $('nodes')
  host.replaceChildren()
  applyView()
  const list = allRequests()
  $('planeEmpty').hidden = list.length > 0
  paintViewControls(list.length > 0)
  for (const req of list) host.append(nodeFor(req))
  restack()
}

/**
 * Zoom, Fit and Tidy only mean something when there is something on the
 * plane, so the toolbar is only there when there is. An empty plane shows the
 * ways in and nothing else.
 */
function paintViewControls(any) {
  document.querySelector('.plane-tools').hidden = !any
  $('plane').classList.toggle('vacant', !any)
}

/**
 * Even gaps, measured rather than assumed.
 *
 * A node with four ports is half as tall again as one with none, so any fixed
 * row height either wastes space or overlaps. This reads the heights the
 * browser actually produced and re-stacks each column with a constant gap
 * between the boxes — skipping anything the user has dragged, because a node
 * someone placed by hand must stay where they put it.
 */
function restack() {
  const GAP = 34
  for (const flow of allFlows()) {
    let y = null
    for (const req of flow.requests) {
      const at = S.layout.get(req.id)
      const node = document.querySelector(`.node[data-id="${req.id}"]`)
      if (!at || !node) continue
      if (S.moved.has(req.id)) {
        y = null
        continue
      }
      if (y !== null) {
        at.y = y
        node.style.top = `${y}px`
      }
      y = at.y + node.offsetHeight + GAP
    }
  }
  paintLanes()
  drawBeams()
}

/**
 * A lane behind each flow's nodes: its name, its size, how its last run
 * went, and a way to run it.
 *
 * The flows were only ever implied by which column a node happened to be in;
 * with nodes dragged around, nothing on the plane said which belonged to which.
 * Drawn from where the nodes actually are, so it follows a drag.
 */
function paintLanes() {
  const host = $('nodes')
  for (const old of host.querySelectorAll('.lane')) old.remove()
  const pad = 16
  const head = 44
  for (const flow of allFlows()) {
    let box = null
    for (const req of flow.requests) {
      const at = S.layout.get(req.id)
      const node = host.querySelector(`.node[data-id="${req.id}"]`)
      if (!at || !node) continue
      const r = { x1: at.x, y1: at.y, x2: at.x + NODE_W, y2: at.y + node.offsetHeight }
      box = box ? { x1: Math.min(box.x1, r.x1), y1: Math.min(box.y1, r.y1), x2: Math.max(box.x2, r.x2), y2: Math.max(box.y2, r.y2) } : r
    }
    if (!box) continue
    const ran = flow.requests.map((r) => S.results.get(r.id)).filter(Boolean)
    const failing = ran.filter((r) => r.error || r.failed).length
    const state = flow.requests.some((r) => S.busy.has(r.id)) ? 'busy' : !ran.length ? 'idle' : failing ? 'fail' : 'pass'
    const lane = el(
      'div',
      {
        class: 'lane',
        'data-state': state,
        style: `left:${box.x1 - pad}px;top:${box.y1 - head}px;width:${box.x2 - box.x1 + pad * 2}px;height:${box.y2 - box.y1 + head + pad}px`
      },
      [
        el('div', { class: 'lane-head' }, [
          el('span', { class: 'lane-dot' }),
          el('b', { class: 'lane-name', text: flow.name || 'Untitled flow' }),
          el('span', { class: 'lane-count', text: String(flow.requests.length) }),
          el('span', { class: 'lane-gap' }),
          ran.length
            ? el('span', { class: 'lane-state', text: state === 'busy' ? 'Running…' : failing ? `${failing} failing` : `${ran.length}/${flow.requests.length} passed` })
            : null,
          el('button', {
            class: 'lane-run',
            type: 'button',
            title: `Run ${flow.name}`,
            html: `${ico(I.play, 9)}<span>Run</span>`,
            onclick: (e) => {
              e.stopPropagation()
              runFlow(flow)
            }
          })
        ])
      ]
    )
    host.prepend(lane)
  }
}

/**
 * A map of the whole plane in the corner, with the part on screen outlined.
 * Click or drag in it to go somewhere.
 */
function paintMinimap() {
  const box = $('minimap')
  if (!box) return
  const list = allRequests().filter((r) => S.layout.has(r.id))
  box.hidden = list.length < 2 || pageOpen !== ''
  if (box.hidden) return

  const plane = $('plane').getBoundingClientRect()
  const { x, y, z } = S.view
  const view = { x1: -x / z, y1: -y / z, x2: (plane.width - x) / z, y2: (plane.height - y) / z }
  let w = { ...view }
  const rects = []
  for (const req of list) {
    const at = S.layout.get(req.id)
    const node = document.querySelector(`.node[data-id="${req.id}"]`)
    const h = node ? node.offsetHeight : 140
    rects.push({ req, x: at.x, y: at.y, h })
    w = { x1: Math.min(w.x1, at.x), y1: Math.min(w.y1, at.y - 44), x2: Math.max(w.x2, at.x + NODE_W), y2: Math.max(w.y2, at.y + h) }
  }

  const W = 184
  const H = 116
  const inset = 8
  const scale = Math.min((W - inset * 2) / (w.x2 - w.x1), (H - inset * 2) / (w.y2 - w.y1))
  const ox = inset + (W - inset * 2 - (w.x2 - w.x1) * scale) / 2 - w.x1 * scale
  const oy = inset + (H - inset * 2 - (w.y2 - w.y1) * scale) / 2 - w.y1 * scale
  box._map = { scale, ox, oy }

  const shapes = rects
    .map(({ req, x: rx, y: ry, h }) => {
      const res = S.results.get(req.id)
      const tone = !res ? 'idle' : res.error || res.failed ? 'fail' : 'pass'
      const on = req.id === S.pickedId ? ' on' : ''
      return `<rect class="mm-node ${tone}${on}" x="${(ox + rx * scale).toFixed(1)}" y="${(oy + ry * scale).toFixed(1)}" width="${(NODE_W * scale).toFixed(1)}" height="${Math.max(3, h * scale).toFixed(1)}" rx="2"/>`
    })
    .join('')
  const vp = `<rect class="mm-view" x="${(ox + view.x1 * scale).toFixed(1)}" y="${(oy + view.y1 * scale).toFixed(1)}" width="${((view.x2 - view.x1) * scale).toFixed(1)}" height="${((view.y2 - view.y1) * scale).toFixed(1)}" rx="4"/>`
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${shapes}${vp}</svg>`
}

/** Centres the plane on the point of the minimap under the pointer. */
function wireMinimap() {
  const box = $('minimap')
  if (!box) return
  const goTo = (e) => {
    const map = box._map
    if (!map) return
    const r = box.getBoundingClientRect()
    const wx = (e.clientX - r.left - map.ox) / map.scale
    const wy = (e.clientY - r.top - map.oy) / map.scale
    const plane = $('plane').getBoundingClientRect()
    S.view.x = plane.width / 2 - wx * S.view.z
    S.view.y = plane.height / 2 - wy * S.view.z
    applyView()
  }
  box.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    goTo(e)
    const move = (ev) => goTo(ev)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

/**
 * One node.
 *
 * Fixed width, four bands: what it is, where it goes, what it trades, how it
 * went. Nothing on it can be edited, which is exactly what lets it stay the
 * same size and stay readable when the plane is zoomed out.
 */
function nodeFor(req) {
  const at = S.layout.get(req.id)
  const res = S.results.get(req.id)
  const verb = req.method.toLowerCase()
  const known = envValues()
  const needs = variablesUsed(req)
  const gives = (req.captures ?? []).filter((c) => c.name).map((c) => c.name)
  const n = (req.assertions ?? []).length

  // The outcome, as one word the whole card can be tinted by.
  const outcome = S.busy.has(req.id) ? 'busy' : !res ? 'idle' : res.error || res.failed ? 'fail' : res.status >= 400 ? 'warn' : 'pass'

  const node = el('div', {
    class: `node${req.id === S.pickedId ? ' on' : ''}${S.busy.has(req.id) ? ' busy' : ''}`,
    style: `left:${at.x}px;top:${at.y}px`,
    'data-id': req.id,
    'data-outcome': outcome,
    tabindex: '0',
    role: 'button',
    'aria-label': `${req.method} ${req.name}`
  })

  // Connection handles on the card's edges, where the wires attach: in on
  // the left when it needs something, out on the right when it gives.
  if (needs.length) node.append(el('span', { class: 'handle in' }))
  if (gives.length) node.append(el('span', { class: 'handle out' }))

  /* header — what it is, and how it went */
  let status
  if (S.busy.has(req.id)) status = el('span', { class: 'node-status busy', html: '<i></i>Running' })
  else if (res) status = el('span', { class: `node-status ${outcome}`, html: `<i></i>${res.error ? 'Error' : esc(String(res.status))}` })
  else status = el('span', { class: 'node-status idle', html: '<i></i>Not run' })

  node.append(
    el('div', { class: 'node-top' }, [
      el('span', { class: `verb ${verb}`, text: req.method }),
      el('span', { class: 'node-name', text: req.name || 'Untitled' }),
      status,
      el('button', {
        class: 'node-more',
        type: 'button',
        title: 'Actions',
        'aria-label': `Actions for ${req.name}`,
        html: ico(I.dots, 13, 2),
        onclick: (e) => {
          e.stopPropagation()
          if (S.pickedId !== req.id) pick(req.id)
          openMenu(pointAnchor(e.clientX, e.clientY), requestMenu(req))
        }
      })
    ])
  )
  node.append(el('span', { class: 'node-path', html: pathLabel(req.url) }))

  /* ports — what it needs on the left, what it gives on the right, on the
     same sides the wires arrive and leave from. */
  if ((needs.length || gives.length) && S.prefs.showPorts !== false) {
    const inCol = el('div', { class: 'port-col' }, [el('span', { class: 'port-head', text: needs.length ? 'Needs' : '' })])
    for (const name of needs.slice(0, 4)) {
      const from = allRequests().find((r) => (r.captures ?? []).some((c) => c.name === name))
      const met = Boolean(from) || Object.prototype.hasOwnProperty.call(known, name)
      inCol.append(
        el('span', {
          class: `port needs${met ? '' : ' unmet'}`,
          title: from ? `captured by ${from.name}` : met ? 'set in the environment' : 'nothing provides this',
          html: `<span class="port-dot"></span>${esc(name)}`
        })
      )
    }
    if (needs.length > 4) inCol.append(el('span', { class: 'port more', text: `+${needs.length - 4} more` }))

    const outCol = el('div', { class: 'port-col out' }, [el('span', { class: 'port-head', text: gives.length ? 'Gives' : '' })])
    for (const name of gives.slice(0, 4)) {
      outCol.append(el('span', { class: 'port gives', html: `${esc(name)}<span class="port-dot"></span>` }))
    }
    if (gives.length > 4) outCol.append(el('span', { class: 'port more', text: `+${gives.length - 4} more` }))

    node.append(el('div', { class: 'ports' }, [inCol, outCol]))
  }

  /* footer — what goes out, and how long it took */
  const foot = el('div', { class: 'node-foot' })
  foot.append(specStrip(req))
  foot.append(el('span', { class: 'spacer' }))
  if (res && !res.error) foot.append(el('span', { class: 'node-ms', text: `${res.timing?.total ?? 0} ms` }))
  if (n) {
    const failed = res?.failed ?? 0
    foot.append(
      el('span', {
        class: `checks${res ? (failed ? ' fail' : ' pass') : ''}`,
        title: res ? `${n - failed} of ${n} assertions passed` : `${n} assertion${n === 1 ? '' : 's'}`,
        html: `${ico(res && failed ? I.x : I.check, 10, 2.6)}${res ? `${n - failed}/${n}` : n}`
      })
    )
  }
  foot.append(
    el('button', {
      class: 'node-run',
      type: 'button',
      title: 'Send this request',
      'aria-label': `Send ${req.name}`,
      html: ico(I.play, 10),
      onclick: (e) => {
        e.stopPropagation()
        send(req)
      }
    })
  )
  node.append(foot)

  node.addEventListener('pointerdown', (e) => drag(e, req, node))
  node.addEventListener('click', (e) => {
    if (node.dataset.moved) {
      delete node.dataset.moved
      return
    }
    if (e.target.closest('button')) return
    // Picking redraws the plane, so the node under the second click of a
    // double-click is a new element and a `dblclick` never arrives. The click
    // count does: two means open it for editing.
    if (e.detail >= 2) {
      if (S.pickedId !== req.id) pick(req.id)
      $('urlInput')?.focus()
      $('urlInput')?.select()
      return
    }
    pick(req.id)
  })
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(req.id)
    }
  })
  return node
}

/**
 * What the request is made of, at a glance.
 *
 * The name and the path say which endpoint. This says what will actually go
 * out — how it authenticates, whether it carries a body, how many parameters
 * and headers ride along — which is the difference between recognising a node
 * and understanding it. Anything that is zero or none is left out rather than
 * shown as an empty count; a row of noughts is noise.
 */
function specStrip(req) {
  const strip = el('div', { class: 'spec' })
  const chip = (kind, text, title) => strip.append(el('span', { class: `sc ${kind}`, title, text }))

  const auth = req.auth?.kind ?? 'none'
  if (auth !== 'none') chip('auth', AUTH_SHORT[auth] ?? auth, `Authenticates with ${auth}`)
  else chip('open', 'no auth', 'Sends no credential')

  if (req.bodyKind && req.bodyKind !== 'none') {
    const size = (req.body ?? '').length
    chip('body', req.bodyKind, `${req.bodyKind} body, ${size} characters`)
  }

  // Parameter and header counts used to ride here too, and crowded the
  // footer until none of it was readable; the inspector's tabs carry them.
  const q = (req.query ?? []).filter((r) => r.on !== false && r.key).length
  const pp = (req.pathParams ?? []).filter((r) => r.on !== false && r.key).length
  const h = (req.headers ?? []).filter((r) => r.on !== false && r.key).length
  strip.title = `${q} query · ${pp} path · ${h} header${h === 1 ? '' : 's'}`

  // The host only when it is a literal. When it comes from {{base_url}} the
  // environment decides, and printing the variable twice helps nobody.
  const host = literalHost(req.url)
  if (host) chip('host', host, `Sent to ${host}`)

  return strip
}

const AUTH_SHORT = { bearer: 'bearer', basic: 'basic', apiKey: 'api key', oauth2: 'oauth2', jwt: 'jwt', custom: 'custom' }

function literalHost(url) {
  const text = String(url ?? '')
  if (!text || text.startsWith('{{')) return ''
  try {
    return new URL(text).host
  } catch {
    return ''
  }
}

const markVars = (t) => esc(t).replace(/\{\{[\w.-]+\}\}/g, (m) => `<span class="node-var">${m}</span>`)

/**
 * The endpoint, written so the path is what you read.
 *
 * A leading `{{base_url}}` is the same on every node in a collection, so it is
 * kept — dropping it would be a lie about what gets sent — but dimmed, and the
 * path after it takes the emphasis and the space.
 */
function pathLabel(url) {
  const text = String(url ?? '')
  if (!text) return '—'
  const m = /^(\{\{[\w.-]+\}\})(.*)$/.exec(text)
  if (m) return `<span class="node-base">${esc(m[1])}</span>${markVars(m[2])}`
  return markVars(text)
}

function tone(status) {
  if (!status || status >= 500) return 'bad'
  if (status >= 400) return 'warn'
  if (status >= 300) return 'info'
  return 'ok'
}

function word(status) {
  if (!status) return 'no response'
  if (status >= 500) return 'server error'
  if (status >= 400) return 'client error'
  if (status >= 300) return 'redirect'
  return 'ok'
}

/* ------------------------------------------------------------------ beams */

/**
 * A beam exists where one request captures a value that another one uses.
 *
 * Derived, never stored: you make the connection by capturing a value and
 * spending it, which is the same act as making the test work, so there is no
 * separate wiring step to fall out of step with reality.
 */
function beams() {
  const out = []
  const list = allRequests()
  for (const from of list) {
    for (const cap of from.captures ?? []) {
      if (!cap.name) continue
      for (const to of list) {
        if (to.id !== from.id && variablesUsed(to).includes(cap.name)) out.push({ from: from.id, to: to.id, name: cap.name })
      }
    }
  }
  return out
}

function drawBeams() {
  const host = $('beams')
  if (!host) return
  host.replaceChildren()

  const { x, y, z } = S.view
  const box = (id) => {
    const at = S.layout.get(id)
    if (!at) return null
    const n = document.querySelector(`.node[data-id="${id}"]`)
    return { x: at.x * z + x, y: at.y * z + y, w: NODE_W * z, h: (n ? n.offsetHeight : 96) * z }
  }

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  defs.innerHTML = `
    <linearGradient id="beamgrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--magenta)"/><stop offset="0.55" stop-color="var(--indigo)"/><stop offset="1" stop-color="var(--cyan)"/>
    </linearGradient>
    <marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" fill="var(--cyan)"/>
    </marker>`
  host.append(defs)

  /** Label boxes already drawn this pass, so the next one can avoid them. */
  const placed = []
  for (const beam of beams()) {
    const a = box(beam.from)
    const b = box(beam.to)
    if (!a || !b) continue

    // From the giver's out-handle to the taker's in-handle: both sit on the
    // card edge level with the header, so every wire attaches somewhere
    // visible rather than at an arbitrary point on a border.
    const x1 = a.x + a.w + 5 * z
    const y1 = a.y + HANDLE_Y * z
    const x2 = b.x - 5 * z
    const y2 = b.y + HANDLE_Y * z
    const bend = Math.max(44, Math.abs(x2 - x1) * 0.45)

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'url(#beamgrad)')
    path.setAttribute('stroke-width', '1.5')
    path.setAttribute('stroke-opacity', '0.8')
    path.setAttribute('marker-end', 'url(#tip)')
    host.append(path)

    if (z > 0.55 && S.prefs.beamLabels !== false) {
      // Three quarters of the way along rather than the middle. One request
      // often feeds four others, and every label at the midpoint piles up on
      // top of the source; near the target they spread out with the arrows.
      //
      // Two beams into the same node still land on the same spot, which is
      // what printed "auth_token" over "user_id". So each label claims its
      // box, a label that would overlap one already placed steps down a line,
      // and one with nowhere to go is left off rather than drawn illegibly.
      const size = 9.5 * Math.max(0.85, z)
      const w = beam.name.length * size * 0.62
      // Kept in the gap between the two nodes: further along, it slid under
      // the target's edge and read as "efault_addr".
      // A label wider than the gap is skipped rather than drawn half under a
      // node; zooming in gives it room and it comes back.
      if (x2 > x1 && x2 - x1 - 16 < w) continue
      const x = x2 > x1 ? Math.max(x1 + 6 + w / 2, Math.min(x1 + (x2 - x1) * 0.72, x2 - 10 - w / 2)) : x1 + (x2 - x1) * 0.72
      let y = y1 + (y2 - y1) * 0.86 - 6
      const hits = (yy) => placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.y - yy) < size + 2)
      let tries = 0
      while (hits(y) && tries < 4) {
        y += size + 3
        tries += 1
      }
      if (hits(y)) continue
      placed.push({ x, y, w })
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      t.setAttribute('x', String(x))
      t.setAttribute('y', String(y))
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('class', 'beam-label')
      t.setAttribute('font-size', String(size))
      t.textContent = beam.name
      host.append(t)
    }
  }
}

/* ---------------------------------------------------- pan, zoom and drag */

function drag(e, req, node) {
  // A node's handler runs before the plane's, so anything that means "pan"
  // has to be handed back rather than swallowed — otherwise space-drag and
  // middle-drag do nothing at all when they start on top of a node.
  if (spaceHeld || e.button === 1) return
  if (e.button !== 0 || e.target.closest('button')) return
  e.stopPropagation()
  const at = S.layout.get(req.id)
  const from = { x: e.clientX, y: e.clientY }
  const origin = { ...at }
  let moved = false
  node.classList.add('grabbed')

  const move = (ev) => {
    const dx = (ev.clientX - from.x) / S.view.z
    const dy = (ev.clientY - from.y) / S.view.z
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
    at.x = Math.round(origin.x + dx)
    at.y = Math.round(origin.y + dy)
    node.style.left = `${at.x}px`
    node.style.top = `${at.y}px`
    paintLanes()
    drawBeams()
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    node.classList.remove('grabbed')
    if (moved) {
      node.dataset.moved = '1'
      S.moved.add(req.id)
      // An arrangement is work, and it is saved with the workspace.
      touch()
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/**
 * Panning and zooming.
 *
 * WHY SCROLL PANS AND DOES NOT ZOOM
 *
 * On a trackpad, a two-finger drag is how you move around a surface — it is
 * the same gesture as scrolling a page, and every canvas tool people already
 * use treats it that way. Binding it to zoom means the only way to pan is to
 * find empty background and drag it, and on a plane covered in nodes there
 * often is none. That reads as "I cannot pan".
 *
 * So: scroll pans. Zoom is ctrl or cmd with the wheel, which is also exactly
 * what a trackpad pinch arrives as. And because a mouse has no second finger,
 * the middle button and space both pan from anywhere — including from on top
 * of a node, where a left-drag moves the node instead.
 */
function wirePlane() {
  const plane = $('plane')

  /** One pan gesture, wherever it started from. */
  const beginPan = (e) => {
    const from = { x: e.clientX, y: e.clientY }
    const origin = { ...S.view }
    plane.classList.add('dragging')
    const move = (ev) => {
      S.view.x = origin.x + (ev.clientX - from.x)
      S.view.y = origin.y + (ev.clientY - from.y)
      applyView()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      plane.classList.remove('dragging')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  plane.addEventListener('pointerdown', (e) => {
    // An empty plane has nothing to move to; the welcome cards stay put.
    if (!allRequests().length) return
    // Middle button, or space held: pans from anywhere, over a node included.
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault()
      beginPan(e)
      return
    }
    if (e.button !== 0) return
    if (e.target.closest('.node, .plane-tools, .legend, .minimap, .lane-run')) return
    beginPan(e)
  })

  // Chromium scrolls on middle-click without this.
  plane.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault()
  })

  plane.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (!allRequests().length) return

      const r = plane.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top

      // A trackpad pinch arrives as a wheel event with ctrlKey set, and
      // ctrl-wheel means zoom everywhere. A pinch sends many small deltas, so
      // the step follows the delta and the gesture tracks the fingers.
      if (e.ctrlKey || e.metaKey) {
        const factor = isMouseWheel(e) ? (e.deltaY > 0 ? 1 / 1.12 : 1.12) : Math.exp(-e.deltaY * 0.01)
        zoomAt(px, py, S.view.z * factor)
        return
      }

      // A mouse wheel zooms around the pointer, as it does on every node
      // canvas -- scrolling it used to slide the whole graph down the screen.
      // Shift still pans sideways, and the setting puts panning back for
      // anyone who prefers it.
      if (isMouseWheel(e) && !e.shiftKey && S.prefs.wheel !== 'pan') {
        const notches = Math.max(1, Math.round(Math.abs(e.wheelDeltaY || e.deltaY) / 120))
        zoomAt(px, py, S.view.z * (e.deltaY > 0 ? 1 / 1.12 : 1.12) ** notches)
        return
      }

      // A trackpad's two-finger scroll moves the plane, which is what the
      // gesture means on any surface. Shift swaps the axis for a wheel that
      // only has one.
      const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY]
      S.view.x -= dx
      S.view.y -= dy
      applyView()
    },
    { passive: false }
  )

  // Ctrl with the wheel anywhere else would zoom the whole interface.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault()
    },
    { passive: false }
  )

  // Right-click: the request's own menu on a node, the plane's on empty space.
  plane.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.plane-tools')) return
    e.preventDefault()
    const at = pointAnchor(e.clientX, e.clientY)
    const node = e.target.closest('.node')
    const req = node ? findRequest(node.dataset.id) : null
    if (req) {
      if (S.pickedId !== req.id) pick(req.id)
      openMenu(at, requestMenu(req))
      return
    }
    const r = plane.getBoundingClientRect()
    openMenu(at, planeMenu(e.clientX - r.left, e.clientY - r.top))
  })

  // Double-click on empty plane frames everything, as the Fit button does.
  // (A double-click on a node is handled by the node: see nodeFor.)
  plane.addEventListener('dblclick', (e) => {
    if (e.target.closest('.node, .plane-tools')) return
    fit()
  })

  // Space is a modifier here, not a button press, so it must not scroll the
  // page or activate whatever happens to be focused.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceHeld && !isTyping(e.target) && !sheetUp) {
      spaceHeld = true
      plane.classList.add('ready')
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false
      plane.classList.remove('ready')
    }
  })
  window.addEventListener('blur', () => {
    spaceHeld = false
    plane.classList.remove('ready')
  })

  // Around the middle of the plane, not its corner: zooming from 0,0 threw
  // whatever you were looking at off the screen.
  $('zoomIn').onclick = () => zoomBy(1.2)
  $('zoomOut').onclick = () => zoomBy(1 / 1.2)
  $('zoomPct').onclick = () => zoomTo(1)
  $('zoomPct').title = 'Reset to 100% (Ctrl 0)'
  $('zoomFit').onclick = fit
  $('zoomFit').title = 'Fit everything on screen (Shift 1)'
  $('tidyBtn').onclick = tidy
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5

/**
 * Whether a wheel event came from a mouse wheel rather than a trackpad.
 *
 * A wheel moves in whole notches on one axis: Chromium reports each notch as
 * 120 in the legacy `wheelDeltaY`, or in lines rather than pixels. A trackpad
 * sends a stream of small pixel deltas, usually on both axes at once.
 */
function isMouseWheel(e) {
  if (e.deltaMode !== 0) return true
  if (e.deltaX !== 0) return false
  if (e.wheelDeltaY) return e.wheelDeltaY % 120 === 0
  return Math.abs(e.deltaY) >= 100
}

/** Zooms so the point under (px, py) on the plane stays where it is. */
function zoomAt(px, py, next) {
  // Every zoom comes through here — wheel, keys, menu, buttons — so an empty
  // plane is refused once, in one place.
  if (!allRequests().length) return
  const z = clamp(next, ZOOM_MIN, ZOOM_MAX)
  S.view.x = px - ((px - S.view.x) / S.view.z) * z
  S.view.y = py - ((py - S.view.y) / S.view.z) * z
  S.view.z = z
  applyView()
}

/** Zooms around the centre of the plane, for buttons and keys. */
function zoomBy(factor) {
  const r = $('plane').getBoundingClientRect()
  zoomAt(r.width / 2, r.height / 2, S.view.z * factor)
}

function zoomTo(z) {
  const r = $('plane').getBoundingClientRect()
  zoomAt(r.width / 2, r.height / 2, z)
}

/** Something openMenu can position against: a point rather than a button. */
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }) })

/** The flow new requests go into: the picked request's, or the first one. */
const workingFlow = () => (S.pickedId ? flowOf(S.pickedId) : null) ?? allFlows()[0] ?? null

/** Right-click on empty plane. */
function planeMenu(px, py) {
  const flow = workingFlow()
  const any = allRequests().length > 0
  return [
    {
      icon: I.plus,
      label: flow ? `New request in ${flow.name}` : 'New request',
      keys: 'Ctrl+N',
      disabled: !flow,
      run: () => {
        addRequest(flow)
        // Placed where the click was, rather than at the bottom of a column.
        const at = S.layout.get(S.pickedId)
        if (at) {
          at.x = Math.round((px - S.view.x) / S.view.z)
          at.y = Math.round((py - S.view.y) / S.view.z)
          S.moved.add(S.pickedId)
          commit('plane')
        }
      }
    },
    { icon: I.play, label: flow ? `Run ${flow.name}` : 'Run flow', disabled: !flow?.requests.length, run: () => runFlow(flow) },
    // The view entries only exist when there is something to view.
    ...(any
      ? [
          { sep: true },
          { icon: I.plus, label: 'Zoom in', keys: 'Ctrl+=', run: () => zoomAt(px, py, S.view.z * 1.2) },
          { icon: I.x, label: 'Zoom out', keys: 'Ctrl+-', run: () => zoomAt(px, py, S.view.z / 1.2) },
          { icon: I.eye, label: 'Zoom to 100%', keys: 'Ctrl+0', run: () => zoomTo(1) },
          { icon: I.eye, label: 'Fit everything', keys: 'Shift+1', run: fit },
          { icon: I.revert, label: 'Tidy the layout', run: tidy }
        ]
      : [])
  ]
}

/**
 * The plane's keyboard: the shortcuts every canvas tool has.
 *
 * Only when nothing is being typed into and no sheet is open, so Delete in a
 * header field deletes a character, not the request.
 *
 * @returns {boolean} whether the key was handled
 */
function planeKey(e) {
  if (sheetUp || pageOpen || isTyping(e.target) || document.querySelector('.menu')) return false
  const mod = e.ctrlKey || e.metaKey
  const req = current()
  const key = e.key
  // Arrows and Delete belong to whatever has focus; they act on the graph
  // only when that is the graph, the tree, or nothing in particular.
  const onGraph = e.target === document.body || Boolean(e.target.closest?.('.plane, .tree, .rail'))

  if (mod && (key === '=' || key === '+')) zoomBy(1.2)
  else if (mod && (key === '-' || key === '_')) zoomBy(1 / 1.2)
  else if (mod && key === '0') zoomTo(1)
  else if (!mod && e.shiftKey && (key === '!' || e.code === 'Digit1')) fit()
  else if (mod && key.toLowerCase() === 'd' && req) duplicateRequest(flowOf(req.id), req)
  else if (mod && key.toLowerCase() === 'n' && !e.shiftKey) {
    const flow = workingFlow()
    if (!flow) return false
    addRequest(flow)
  } else if (!mod && onGraph && (key === 'Delete' || key === 'Backspace') && req) askDeleteRequest(req)
  else if (!mod && onGraph && !e.altKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
    // Steps through the requests in the order the tree lists them, and
    // brings the one picked into view if it is off the screen.
    const list = allRequests()
    if (!list.length) return false
    const at = list.findIndex((r) => r.id === S.pickedId)
    const next = list[clamp(at + (key === 'ArrowDown' ? 1 : -1), 0, list.length - 1)] ?? list[0]
    pick(next.id)
    reveal(next.id)
  } else return false

  e.preventDefault()
  return true
}

/** Pans just enough to bring a node fully into view. */
function reveal(id) {
  const at = S.layout.get(id)
  const node = document.querySelector(`.node[data-id="${id}"]`)
  if (!at || !node) return
  const r = $('plane').getBoundingClientRect()
  const { z } = S.view
  const pad = 40
  const left = at.x * z + S.view.x
  const top = at.y * z + S.view.y
  const w = NODE_W * z
  const h = node.offsetHeight * z
  if (left < pad) S.view.x += pad - left
  else if (left + w > r.width - pad) S.view.x -= left + w - (r.width - pad)
  if (top < pad) S.view.y += pad - top
  else if (top + h > r.height - pad - 60) S.view.y -= top + h - (r.height - pad - 60)
  applyView()
}

/** True while the caret is in something the user is writing into. */
function isTyping(node) {
  const tag = node?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node?.isContentEditable === true
}

function applyView() {
  const { x, y, z } = S.view
  $('nodes').style.transform = `translate(${x}px, ${y}px) scale(${z})`
  $('planeDots').style.backgroundPosition = `${x}px ${y}px`
  $('planeDots').style.backgroundSize = `${24 * z}px ${24 * z}px`
  $('zoomPct').textContent = `${Math.round(z * 100)}%`
  drawBeams()
  paintMinimap()
}

/** Frames everything on the plane. */
function fit() {
  frame(allRequests(), { most: 1.1 })
}

/**
 * Frames the flow being worked on, at a size its nodes can be read at.
 *
 * Fitting everything is honest but, beside the sidebar and the inspector,
 * three flows come out at under half size: tiny text on first open. The
 * flow you are in, readable, with its neighbours at the edges, is the better
 * first view; Fit and the minimap are there for the whole picture.
 */
function focusFlow() {
  const flow = (S.pickedId ? flowOf(S.pickedId) : null) ?? allFlows().find((f) => f.requests.length)
  if (!flow?.requests.length) return fit()
  frame(flow.requests, { least: 0.72, most: 1 })
}

/** Fits a set of requests in the plane, between two zoom levels. */
function frame(list, { least = ZOOM_MIN, most = 1.1 } = {}) {
  list = list.filter((req) => S.layout.has(req.id))
  if (!list.length) return
  const r = $('plane').getBoundingClientRect()
  if (!r.width || !r.height) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const req of list) {
    const at = S.layout.get(req.id)
    const n = document.querySelector(`.node[data-id="${req.id}"]`)
    const h = n ? n.offsetHeight : 140
    minX = Math.min(minX, at.x - 16)
    // The lane header sits above the first node of each flow.
    minY = Math.min(minY, at.y - 48)
    maxX = Math.max(maxX, at.x + NODE_W + 16)
    maxY = Math.max(maxY, at.y + h + 16)
  }
  const pad = 44
  // The floating toolbar sits over the foot of the plane, so things are
  // framed above it rather than underneath it.
  const below = 72
  const z = clamp(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad - below) / (maxY - minY)), least, most)
  // Centred in the space it has; when it is wider than the plane, its left
  // edge leads, which is where a flow starts.
  const wide = (maxX - minX) * z > r.width - pad * 2
  const x = wide ? pad - minX * z : (r.width - (maxX - minX) * z) / 2 - minX * z
  const y = pad + Math.max(0, (r.height - pad - below - (maxY - minY) * z) / 2) - minY * z
  S.view = { z, x, y }
  applyView()
}

function pick(id) {
  S.pickedId = id
  S.editTab = 'params'
  S.respTab = S.results.has(id) ? 'result' : 'brief'
  commit()
}

/* ============================================================= workbench */

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const EDIT_TABS = [
  ['params', 'Params'],
  ['headers', 'Headers'],
  ['body', 'Body'],
  ['auth', 'Auth'],
  ['tests', 'Tests'],
  ['chain', 'Chain'],
  ['data', 'Data']
]

const RESP_TABS = [
  ['brief', 'Brief'],
  ['result', 'Result'],
  ['payload', 'Payload'],
  ['headers', 'Headers'],
  ['shape', 'Shape'],
  ['diff', 'Diff'],
  ['drift', 'Drift'],
  ['notes', 'Notes'],
  ['timing', 'Timing']
]

function paintBench() {
  const req = current()
  $('benchNone').hidden = Boolean(req)
  $('benchLive').hidden = !req
  if (!req) return

  const verb = req.method.toLowerCase()
  $('benchVerb').className = `verb ${verb}`
  $('benchVerb').textContent = req.method
  if ($('benchName').value !== (req.name ?? '')) $('benchName').value = req.name ?? ''
  $('addrVerb').className = `addr-verb ${verb}`
  $('addrVerbText').textContent = req.method
  if ($('urlInput').value !== (req.url ?? '')) $('urlInput').value = req.url ?? ''
  $('methodPick').replaceChildren(...METHODS.map((m) => el('option', { value: m, text: m, selected: m === req.method })))

  const busy = S.busy.has(req.id)
  $('sendBtn').disabled = busy
  $('sendLabel').textContent = busy ? 'Sending' : 'Send'
  paintPreview(req)

  const res = S.results.get(req.id)

  const et = $('editTabs')
  et.replaceChildren()
  for (const [id, label] of EDIT_TABS) {
    const n = countFor(req, id)
    et.append(
      el('button', { class: `tab${S.editTab === id ? ' on' : ''}`, type: 'button', role: 'tab', html: `${label}${n ? `<b>${n}</b>` : ''}`, onclick: () => {
        S.editTab = id
        // Picking a tab on a folded half opens it. The alternative is a click
        // that changes something you cannot see.
        if (S.pane === 'response') S.pane = 'split'
        paintBench()
      } })
    )
  }
  $('editBody').replaceChildren(editPanel(req, res))

  // Both halves put their tabs on their own row. Squeezing the request's six
  // into its bar left "Chain" outside the visible width, reachable only by
  // scrolling a row with no scrollbar — a tab nobody would ever find.
  const rt = $('respTabs')
  rt.replaceChildren()
  for (const [id, label] of RESP_TABS) {
    let badge = ''
    if (id === 'drift') {
      const d = drift(req)
      if (d?.breaking.length) badge = `<b class="bad">${d.breaking.length}</b>`
      else if (S.baselines.has(req.id)) badge = '<b></b>'
    }
    if (id === 'notes' && res?.findings?.length) {
      const bad = res.findings.filter((f) => f.level === 'bad').length
      badge = bad ? `<b class="bad">${bad}</b>` : `<b>${res.findings.length}</b>`
    }
    rt.append(
      el('button', { class: `tab${S.respTab === id ? ' on' : ''}`, type: 'button', role: 'tab', html: `${label}${badge}`, onclick: () => {
        S.respTab = id
        paintBench()
      } })
    )
  }
  $('respBody').replaceChildren(respPanel(req, res))
  paintRespStats(res)
  $('copyBody').disabled = !res || res.error
  layoutPanes()
}

/**
 * The line along the top of the response half.
 *
 * Present before anything is sent, saying so. A panel that appears only after
 * the first send is a panel people do not know is there — which is exactly the
 * complaint that produced it.
 */
/**
 * How the two halves share the panel.
 *
 * Three states rather than a free-form split, because the two useful shapes
 * are "both" and "all of one": editing twenty headers and reading a large
 * payload want opposite things, and dragging a handle to the top every time is
 * a chore. Filling one half folds the other to its bar, which stays visible —
 * a collapsed pane you cannot see is a pane you cannot get back.
 */
function layoutPanes() {
  const host = $('benchSplit')
  const BAR = '30px'
  // The handle's row collapses to nothing when there is nothing to drag
  // between, rather than leaving a seven-pixel gap under a folded bar.
  if (S.pane === 'request') host.style.gridTemplateRows = `minmax(120px, 1fr) 0px ${BAR}`
  else if (S.pane === 'response') host.style.gridTemplateRows = `${BAR} 0px minmax(120px, 1fr)`
  else host.style.gridTemplateRows = `minmax(90px, ${S.split}fr) 7px minmax(90px, ${100 - S.split}fr)`

  $('reqPane').classList.toggle('folded', S.pane === 'response')
  $('resPane').classList.toggle('folded', S.pane === 'request')
  $('benchGrip').hidden = S.pane !== 'split'

  for (const [id, filled] of [['reqGrow', S.pane === 'request'], ['resGrow', S.pane === 'response']]) {
    const btn = $(id)
    btn.classList.toggle('on', filled)
    btn.title = filled ? 'Back to both' : 'Fill the panel'
  }
  $('reqFold').setAttribute('aria-expanded', String(S.pane !== 'response'))
  $('resFold').setAttribute('aria-expanded', String(S.pane !== 'request'))
}

/** Fill with one half, or go back to both. */
function fillPane(which) {
  S.pane = S.pane === which ? 'split' : which
  layoutPanes()
}

/** Fold one half away, which is the same as filling with the other. */
function foldPane(which) {
  const other = which === 'request' ? 'response' : 'request'
  S.pane = S.pane === other ? 'split' : other
  layoutPanes()
}

function paintRespStats(res) {
  const host = $('respStats')
  host.replaceChildren()

  if (!res) {
    host.append(el('span', { class: 'stat-none', text: 'not sent yet' }))
    return
  }
  if (res.error) {
    host.append(el('span', { class: 'code bad', text: 'no response' }))
    return
  }
  host.append(el('span', { class: `code ${tone(res.status)}`, title: `${res.status} ${word(res.status)}`, text: String(res.status) }))
  host.append(el('span', { class: 'stat', text: `${res.timing?.total ?? 0} ms` }))
  host.append(el('span', { class: 'stat', text: fmtBytes(res.bytes) }))
  if (res.checks.length) {
    host.append(
      el('span', {
        class: `stat ${res.failed ? 'fail' : 'pass'}`,
        title: res.failed ? `${res.failed} of ${res.checks.length} assertions failed` : `All ${res.checks.length} assertions passed`,
        text: res.failed ? `✕ ${res.failed}/${res.checks.length}` : `✓ ${res.checks.length}/${res.checks.length}`
      })
    )
  }
}

function paintPreview(req) {
  $('wirePreview').innerHTML = `<b style="color:var(--ink-4)">${req.method}</b> ${esc(buildUrl(req, envValues())).replace(
    /\{\{[\w.-]+\}\}/g,
    (m) => `<span class="v">${m}</span>`
  )}`
}

function countFor(req, tab) {
  const on = (list) => (list ?? []).filter((r) => r.on !== false).length
  if (tab === 'params') return on(req.query) + on(req.pathParams)
  if (tab === 'headers') return on(req.headers)
  if (tab === 'body') return req.bodyKind !== 'none' ? 1 : 0
  if (tab === 'auth') return req.auth?.kind !== 'none' ? 1 : 0
  if (tab === 'tests') return (req.assertions ?? []).length
  if (tab === 'chain') return (req.captures ?? []).length
  if (tab === 'data') return req.dataset?.rows.length ?? 0
  return 0
}

/** Redraws only what a keystroke changes, so typing does not rebuild the app. */
/**
 * A keystroke-cheap repaint for a field being typed into.
 *
 * `commit()` redraws the tree, the plane and the bench, which is far too much
 * per keystroke — so the fields people type in fastest (the URL, every query
 * and header row, request-level auth) came through here instead, and repainted
 * only the preview and the one node label that changed.
 *
 * What was missing was `touch()`. Those handlers mutate the request and then
 * did nothing to say so: nothing was marked dirty and no autosave was ever
 * scheduled. Typing an endpoint, a header or a bearer token and closing the app
 * lost the lot, unless some later action happened to call `commit()` — which is
 * why the whole tool could look as though it did not save. `touch()` is only a
 * flag and a debounce timer, so it is cheap enough to belong on this path.
 */
function live(req) {
  paintPreview(req)
  const path = document.querySelector(`.node[data-id="${req.id}"] .node-path`)
  if (path) path.innerHTML = pathLabel(req.url)
  touch()
}

/* ---------------------------------------------------------- edit panels */

function editPanel(req, res) {
  switch (S.editTab) {
    case 'headers':
      return headersTab(req)
    case 'body':
      return bodyPanel(req)
    case 'auth':
      return authPanel(req)
    case 'tests':
      return testsPanel(req, res)
    case 'chain':
      return chainPanel(req)
    case 'data':
      return dataPanel(req)
    default: {
      const box = el('div')
      box.append(rowsPanel(req, 'query', 'Query parameters', 'search', 'iphone'))
      box.append(rowsPanel(req, 'pathParams', 'Path parameters', 'userId', '42', 'written in the endpoint as :userId'))
      return box
    }
  }
}

/**
 * The request's headers, and the ones it is given.
 *
 * Inherited rows are shown before the request's own and are not editable here:
 * editing them here would either silently copy them down — leaving two places
 * that disagree — or change every other request without saying so. The name of
 * the level they came from is on each row, and it is a link to that level.
 */
function headersTab(req) {
  const box = el('div')
  const chain = chainFor(req)
  const shown = inheritedFor(req, chain)

  if (shown.headers.length) {
    box.append(
      el('div', { class: 'lbl' }, [
        el('span', { text: 'Inherited' }),
        el('em', { text: 'set above this request, and sent with it' })
      ])
    )
    for (const row of shown.headers) {
      box.append(
        el('div', { class: 'kvrow given' }, [
          el('span', { class: 'given-src', text: row.from }),
          el('span', { class: 'cell k', text: row.key }),
          el('span', { class: 'cell v', text: row.value }),
          el('button', {
            class: 'tiny',
            type: 'button',
            title: `Set this header on ${row.from} instead`,
            text: 'Override',
            onclick: () => {
              // Copied down as the request's own, which is the only honest way
              // to change one here: the level above keeps what it had.
              req.headers = [...(req.headers ?? []), { id: uid('row'), key: row.key, value: row.value, on: true }]
              commit()
            }
          })
        ])
      )
    }
  }

  box.append(rowsPanel(req, 'headers', shown.headers.length ? 'This request' : 'Headers', 'X-Tenant', 'northwind'))
  return box
}

/**
 * Auth and headers for a collection or a flow.
 *
 * The same two editors the request has, on the thing above it. Forty requests
 * carrying their own copy of the same token is how a collection rots: the
 * fortieth never gets updated.
 */
function openLevel(owner, what) {
  const body = el('div', { class: 'levelbox' })
  const paint = () => {
    body.replaceChildren()
    body.append(
      el('div', { class: 'lbl' }, [
        el('span', { text: 'Auth' }),
        el('em', { text: 'inherited by every request below that is set to Inherit' })
      ])
    )
    body.append(authPanel(null, { level: what, owner }))

    body.append(el('div', { class: 'lbl', style: 'margin-top:16px' }, [
      el('span', { text: 'Headers' }),
      el('em', { text: 'added to every request below, unless it sets the same one' })
    ]))
    body.append(rowsPanel(owner, 'headers', '', 'X-Api-Version', '2', '', paint))

    const reach = what === 'collection'
      ? owner.flows.reduce((n, f) => n + f.requests.length, 0)
      : owner.requests.length
    body.append(
      el('p', {
        class: 'note',
        style: 'margin-top:12px',
        text: `${reach} request${reach === 1 ? '' : 's'} sit${reach === 1 ? 's' : ''} below this. A request with its own value for something keeps it.`
      })
    )
  }
  paint()

  sheet({
    title: `${owner.name || 'Untitled'} — auth and headers`,
    blurb: 'Set once here instead of on every request. The nearest setting always wins.',
    body,
    acts: [],
    onClose: () => {
      sheetRepaint = null
      commit()
    }
  })
  sheetRepaint = paint
}

function rowsPanel(req, key, label, kHint, vHint, hint, repaint) {
  const box = el('div', { class: 'kvbox' })
  // The same panel edits a collection's or a flow's headers, which have no
  // URL or preview: live() on one of those wrote "undefined" into the
  // workbench's request preview.
  const edited = () => ('method' in req ? live(req) : touch())
  box.append(el('div', { class: 'lbl' }, [el('span', { text: label }), hint ? el('em', { text: hint }) : null]))
  const list = (req[key] ??= [])

  for (const r of list) {
    box.append(
      el('div', { class: `kvrow${r.on === false ? ' off' : ''}` }, [
        el('input', { class: 'tick', type: 'checkbox', checked: r.on !== false, 'aria-label': `Send ${r.key || 'this row'}`, onchange: (e) => {
          r.on = e.target.checked
          commit('plane')
          paintBench()
        } }),
        el('input', { class: 'cell k', value: r.key, placeholder: kHint, 'aria-label': 'Name', oninput: (e) => {
          r.key = e.target.value
          edited()
        } }),
        el('input', { class: 'cell v', value: r.value, placeholder: vHint, 'aria-label': 'Value', oninput: (e) => {
          r.value = e.target.value
          edited()
        } }),
        el('button', { class: 'x-btn', type: 'button', 'aria-label': `Remove ${r.key || 'row'}`, html: ico(I.x, 11, 2.3), onclick: () => {
          req[key] = list.filter((x) => x.id !== r.id)
          commit()
          repaint?.()
        } })
      ])
    )
  }

  // An empty table says so, rather than leaving a heading over nothing.
  if (!list.length) box.append(el('p', { class: 'kv-empty', text: `Nothing here yet — e.g. ${kHint} = ${vHint}` }))

  box.append(
    el('button', { class: 'addbtn', type: 'button', html: `${ico(I.plus, 10, 2.4)}<span>Add a row</span>`, onclick: () => {
      list.push(row())
      paintBench()
      // Inside a sheet nothing else repaints, so without this the new row
      // exists in the data and never appears on screen.
      repaint?.()
    } })
  )
  return box
}

const BODY_KINDS = [
  ['none', 'None'],
  ['json', 'JSON'],
  ['graphql', 'GraphQL'],
  ['urlencoded', 'Form URL'],
  ['form', 'Multipart'],
  ['xml', 'XML'],
  ['raw', 'Raw']
]

/**
 * A GraphQL request: a query and its variables, as two fields.
 *
 * The alternative — which is what this used to be — is one text area holding
 * the JSON envelope, with the query escaped into a single-line string inside
 * it. That is unreadable, unpasteable and impossible to edit, and it is why
 * GraphQL in a REST-shaped tool feels like a workaround.
 */
function graphqlEditor(req) {
  const box = el('div', { class: 'gql' })

  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Query' }), el('em', { text: gqlLabel(req.body) })]))
  // The value is set on the node rather than passed as an attribute: a
  // textarea's content is its child text, so an attribute would be ignored.
  const query = el('textarea', {
    class: 'gqlq',
    spellcheck: 'false',
    rows: '9',
    placeholder: 'query Orders($first: Int) {\n  orders(first: $first) {\n    id\n    total\n  }\n}',
    oninput: (e) => {
      req.body = e.target.value
      touch()
    },
    onchange: () => commit()
  })
  query.value = req.body ?? ''
  box.append(query)

  box.append(
    el('div', { class: 'lbl', style: 'margin-top:12px' }, [
      el('span', { text: 'Variables' }),
      el('em', { text: 'JSON — {{name}} works in here too' })
    ])
  )
  const variables = el('textarea', {
    class: 'gqlv',
    spellcheck: 'false',
    rows: '4',
    placeholder: '{\n  "first": 10\n}',
    oninput: (e) => {
      req.gqlVariables = e.target.value
      touch()
    },
    onchange: () => commit()
  })
  variables.value = req.gqlVariables ?? ''
  box.append(variables)

  box.append(
    el('div', { class: 'envacts', style: 'margin-top:10px' }, [
      el('button', {
        class: 'addbtn',
        type: 'button',
        html: ico(I.search, 10, 2) + '<span>Fetch the schema</span>',
        onclick: () => introspect(req)
      })
    ])
  )

  // $first in a GraphQL query is the server's variable, not Prism's. Saying so
  // once here saves the confusion of somebody defining {{first}} and wondering
  // why nothing changes.
  box.append(
    el('p', {
      class: 'note',
      html: 'A <code>$name</code> in the query is GraphQL&rsquo;s own variable and is filled from the Variables block. <code>{{name}}</code> is Prism&rsquo;s, and is filled from the environment — in either field.'
    })
  )
  return box
}

/**
 * Ask the endpoint what it can do.
 *
 * Introspection is a normal request to the same URL, so it goes through the
 * same sender — same auth, same proxy, same certificate — rather than a second
 * code path that could succeed where a real request would fail.
 */
async function introspect(req) {
  const vars = envValues()
  const chain = chainFor(req)
  const resolved = withInherited(req, chain)
  const raw = await window.prism.http.send({
    ...compile({ ...resolved, bodyKind: 'json', body: JSON.stringify({ query: INTROSPECTION }) }, vars),
    method: 'POST',
    timeoutMs: Number(S.prefs.timeoutMs) || 30000,
    verifyTls: S.prefs.verifyTls !== false,
    proxy: S.prefs.proxy || '',
    ...certSettings()
  })

  if (raw.error) {
    toast('bad', raw.error)
    return
  }
  let json
  try {
    json = JSON.parse(raw.body)
  } catch {
    json = null
  }
  const schema = readSchema(json)
  if (!schema.ok) {
    toast('bad', schema.error)
    return
  }
  showSchema(req, schema)
}

function showSchema(req, schema) {
  const body = el('div', { class: 'schemabox' })
  let which = 'queries'

  const paint = () => {
    body.replaceChildren()
    const tabs = el('div', { class: 'chips' })
    for (const [id, label] of [['queries', `Queries (${schema.queries.length})`], ['mutations', `Mutations (${schema.mutations.length})`]]) {
      tabs.append(el('button', { class: `chipbtn${which === id ? ' on' : ''}`, type: 'button', text: label, onclick: () => {
        which = id
        paint()
      } }))
    }
    body.append(tabs)

    const list = el('div', { class: 'fieldlist' })
    for (const f of schema[which]) {
      list.append(
        el('button', {
          class: 'fieldrow-pick',
          type: 'button',
          onclick: () => {
            req.body = stubFor(f, which === 'mutations' ? 'mutation' : 'query')
            req.bodyKind = 'graphql'
            closeSheet()
            commit()
            toast('ok', `${f.name} — a runnable stub is in the query`)
          }
        }, [
          el('b', { text: f.name }),
          el('span', { class: 'ftype', text: f.type }),
          f.args.length ? el('span', { class: 'fargs', text: f.args.map((a) => `${a.name}: ${a.type}`).join(', ') }) : null,
          f.description ? el('span', { class: 'fdesc', text: f.description }) : null
        ])
      )
    }
    if (!schema[which].length) list.append(el('p', { class: 'note', text: 'This schema declares none.' }))
    body.append(list)
  }
  paint()

  sheet({
    title: 'What this endpoint can do',
    blurb: 'From the server’s own introspection. Pick one and a runnable stub goes into the query.',
    body,
    acts: []
  })
}

function bodyPanel(req) {
  const box = el('div')
  const chips = el('div', { class: 'chips' })
  for (const [id, label] of BODY_KINDS) {
    chips.append(
      el('button', { class: `chipbtn${req.bodyKind === id ? ' on' : ''}`, type: 'button', text: label, onclick: () => {
        req.bodyKind = id
        commit()
      } })
    )
  }
  box.append(chips)

  if (req.bodyKind === 'none') {
    box.append(el('p', { class: 'note', text: 'This request sends no body.' }))
    return box
  }

  if (req.bodyKind === 'graphql') {
    box.append(graphqlEditor(req))
    return box
  }

  const area = el('textarea', {
    spellcheck: 'false',
    placeholder: req.bodyKind === 'urlencoded' ? 'one key=value per line' : '{\n  "email": "{{user_email}}"\n}',
    oninput: (e) => {
      req.body = e.target.value
    }
  })
  area.value = req.body ?? ''

  box.append(
    el('div', { class: 'editor' }, [
      area,
      el('div', { class: 'editor-foot' }, [
        el('span', { text: describeBody(req) }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'tiny', type: 'button', text: 'Format', onclick: () => {
          try {
            req.body = JSON.stringify(JSON.parse(req.body ?? ''), null, 2)
            paintBench()
          } catch (err) {
            toast('bad', `Not valid JSON — ${err.message}`)
          }
        } })
      ])
    ])
  )
  return box
}

function describeBody(req) {
  const t = req.body ?? ''
  if (!t) return 'empty'
  if (req.bodyKind === 'json' || req.bodyKind === 'graphql') {
    try {
      JSON.parse(t)
      return `valid JSON · ${t.length} chars`
    } catch {
      return 'not valid JSON yet'
    }
  }
  return `${t.length} chars`
}

const AUTHS = [
  ['inherit', 'Inherit', 'whatever the flow says'],
  ['none', 'No auth', 'sent as it is'],
  ['bearer', 'Bearer', 'Authorization: Bearer'],
  ['basic', 'Basic', 'user and password'],
  ['apiKey', 'API key', 'header or query'],
  ['oauth2', 'OAuth 2.0', 'fetched and refreshed'],
  ['jwt', 'JWT', 'signed token as bearer']
]

/**
 * Auth, for a request or for a level above it.
 *
 * The same panel serves all three, because the choice is the same choice — and
 * a collection editor that looked different from the request editor would be
 * two things to learn for one idea.
 */
function authPanel(req, { level = 'request', owner = null } = {}) {
  const box = el('div')
  const target = owner ?? req
  const chain = level === 'request' ? chainFor(req) : []

  const grid = el('div', { class: 'authgrid' })
  for (const [id, title, sub] of AUTHS) {
    // Only a request can inherit; a collection has nothing above it.
    if (id === 'inherit' && level !== 'request') continue
    grid.append(
      el('button', { class: `authcard${(target.auth?.kind ?? 'none') === id ? ' on' : ''}`, type: 'button', onclick: () => {
        target.auth = { ...(target.auth ?? {}), kind: id }
        if (id === 'oauth2' && !target.auth.oauth) target.auth.oauth = emptyOauth()
        commit()
      } }, [el('b', { text: title }), el('span', { text: sub })])
    )
  }
  box.append(grid)

  const kind = target.auth?.kind ?? 'none'

  if (kind === 'inherit') {
    const from = effectiveAuth(req, chain)
    box.append(
      el('p', {
        class: 'note',
        style: 'margin-top:11px',
        text: from.kind === 'none'
          ? 'Nothing above this request sets auth, so nothing is sent. Set it on the flow or the collection and every request that inherits picks it up.'
          : `Using ${from.kind} auth from ${from.from}. Change it there and every request that inherits changes with it.`
      })
    )
    return box
  }

  if (kind === 'none') return box

  const field = (label, prop, ph, secret = false) =>
    el('div', { class: 'fieldrow' }, [
      el('label', { text: label }),
      el('input', {
        value: target.auth?.[prop] ?? '',
        type: secret ? 'password' : 'text',
        placeholder: ph,
        oninput: (e) => {
          target.auth[prop] = e.target.value
          if (level === 'request') live(req)
          else touch()
        }
      })
    ])

  if (kind === 'basic') {
    box.append(field('Username', 'username', '{{user}}'), field('Password', 'password', '{{password}}'))
  } else if (kind === 'apiKey') {
    box.append(field('Key name', 'keyName', 'X-Api-Key'), field('Value', 'token', '{{api_key}}'))
    box.append(
      el('div', { class: 'fieldrow' }, [
        el('label', { text: 'Send in' }),
        el('select', { onchange: (e) => {
          target.auth.keyIn = e.target.value
          commit('plane')
        } }, [
          el('option', { value: 'header', text: 'Header', selected: target.auth?.keyIn !== 'query' }),
          el('option', { value: 'query', text: 'Query string', selected: target.auth?.keyIn === 'query' })
        ])
      ])
    )
  } else if (kind === 'oauth2') {
    box.append(oauthPanel(target, level === 'request' ? req : null))
    return box
  } else {
    box.append(field('Token', 'token', '{{auth_token}}'))
  }

  box.append(
    el('p', { class: 'note', style: 'margin-top:11px', text: 'Write a variable here rather than a value. Exports carry the variable; they never carry the secret.' })
  )
  return box
}

/**
 * The OAuth grant.
 *
 * `oauth2` used to mean "paste a bearer string here", which works for about an
 * hour and then produces a 401 that reads like a broken test. This fetches the
 * token, notices when it is about to expire, and refreshes it — so a suite left
 * running overnight is still running in the morning.
 *
 * The token itself is held in memory and never written anywhere, like every
 * other credential in Prism.
 */
function oauthPanel(target, req) {
  const box = el('div', { class: 'oauth' })
  const cfg = target.auth.oauth ?? (target.auth.oauth = emptyOauth())
  const state = oauthState.get(target.auth) ?? {}

  box.append(
    el('div', { class: 'fieldrow' }, [
      el('label', { text: 'Grant' }),
      el('select', { onchange: (e) => {
        cfg.grant = e.target.value
        commit()
      } }, GRANTS.map((g) => el('option', { value: g.id, text: g.label, selected: cfg.grant === g.id })))
    ])
  )
  const grant = GRANTS.find((g) => g.id === cfg.grant) ?? GRANTS[0]
  box.append(el('p', { class: 'note', text: grant.help }))

  const LABEL = {
    tokenUrl: 'Token URL',
    clientId: 'Client id',
    clientSecret: 'Client secret',
    username: 'Username',
    password: 'Password',
    refreshToken: 'Refresh token',
    scope: 'Scope',
    audience: 'Audience'
  }
  const PLACE = {
    tokenUrl: 'https://id.example.test/oauth/token',
    clientId: '{{client_id}}',
    clientSecret: '{{client_secret}}',
    scope: 'read:orders write:orders',
    audience: 'https://api.example.test'
  }

  for (const name of grant.fields) {
    const secret = SECRET_FIELDS.includes(name)
    box.append(
      el('div', { class: 'fieldrow' }, [
        el('label', { text: LABEL[name] ?? name }),
        el('input', {
          value: cfg[name] ?? '',
          type: secret ? 'password' : 'text',
          placeholder: PLACE[name] ?? '',
          spellcheck: 'false',
          oninput: (e) => {
            cfg[name] = e.target.value
            touch()
          },
          onchange: () => commit()
        })
      ])
    )
  }

  box.append(
    el('div', { class: 'fieldrow' }, [
      el('label', { text: 'Client sent as' }),
      el('select', { onchange: (e) => {
        cfg.clientAuth = e.target.value
        commit()
      } }, [
        el('option', { value: 'body', text: 'Form fields', selected: cfg.clientAuth !== 'header' }),
        el('option', { value: 'header', text: 'Basic header', selected: cfg.clientAuth === 'header' })
      ])
    ])
  )

  /* ------------------------------------------------------- what is held */
  const missing = missingFields(cfg)
  const bar = el('div', { class: 'oauth-bar' })

  bar.append(
    el('span', { class: `oauth-dot${state.token ? (stale(state) ? ' warn' : ' ok') : ''}` }),
    el('span', { class: 'oauth-state', text: state.token ? remaining(state) : missing.length ? `needs ${missing.join(', ')}` : 'no token yet' }),
    el('span', { class: 'pane-gap' }),
    el('button', {
      class: 'btn go',
      type: 'button',
      text: state.token ? 'Fetch again' : 'Fetch a token',
      disabled: missing.length > 0,
      onclick: () => fetchToken(target, req)
    })
  )
  if (state.token) {
    bar.append(el('button', { class: 'btn', type: 'button', text: 'Forget it', onclick: () => {
      oauthState.delete(target.auth)
      commit()
    } }))
  }
  box.append(bar)

  if (state.error) {
    box.append(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'The token endpoint refused' }), el('p', { text: state.error })])]))
  }

  box.append(
    el('p', {
      class: 'note',
      html: 'The token is fetched before a send when it is missing or about to expire, and is held in memory only — never written to the workspace, an export, or this disk.'
    })
  )
  return box
}

/**
 * Tokens, kept beside the auth block rather than inside it.
 *
 * A WeakMap because the token must never reach the workspace file: anything
 * stored on the auth object itself would be serialised with it, and the rule
 * about credentials on disk has no exceptions.
 */
const oauthState = new WeakMap()

async function fetchToken(target, req, quiet = false) {
  try {
    return await getToken(target, quiet)
  } catch (err) {
    // Without this a throw inside a click handler is invisible: no toast, no
    // panel, the button simply does nothing and the cause is in a console
    // nobody has open.
    oauthState.set(target.auth, { ...(oauthState.get(target.auth) ?? {}), error: String(err?.message ?? err) })
    commit()
    if (!quiet) toast('bad', String(err?.message ?? err))
    return null
  }
}

async function getToken(target, quiet) {
  const cfg = target.auth?.oauth
  if (!cfg) return null

  const missing = missingFields(cfg)
  if (missing.length) {
    if (!quiet) toast('bad', `That grant still needs ${missing.join(', ')}.`)
    return null
  }

  const held = oauthState.get(target.auth) ?? {}
  const step = nextStep(cfg, held)
  const use = step === 'refresh' ? refreshWith(cfg, held) : cfg
  const vars = envValues()
  const spec = tokenRequest(use, (text) => interpolate(text, vars))

  const raw = await window.prism.http.send({
    ...spec,
    timeoutMs: Number(S.prefs.timeoutMs) || 30000,
    verifyTls: S.prefs.verifyTls !== false,
    useCookies: false,
    proxy: S.prefs.proxy || '',
    ...certSettings()
  })

  if (raw.error) {
    oauthState.set(target.auth, { ...held, error: raw.error })
    if (!quiet) toast('bad', raw.error)
    commit()
    return null
  }

  // The sender returns the body as text; parsing it is the caller's job, and
  // every other caller in this file already does it this way.
  let json
  try {
    json = JSON.parse(raw.body)
  } catch {
    json = undefined
  }

  const read = readToken(json, Date.now())
  if (!read.ok) {
    oauthState.set(target.auth, { ...held, error: read.error })
    if (!quiet) toast('bad', read.error)
    commit()
    return null
  }

  // A refresh that comes back without a new refresh token keeps the old one:
  // most servers reissue, some do not, and dropping it would turn the next
  // refresh into a full re-authentication.
  oauthState.set(target.auth, {
    token: read.token,
    type: read.type,
    expiresAt: read.expiresAt,
    refreshToken: read.refreshToken || held.refreshToken || '',
    error: ''
  })
  commit()
  if (!quiet) toast('ok', `Token fetched — ${remaining(oauthState.get(target.auth))}`)
  return read.token
}

/** Fetches or refreshes only when the held token will not last the request. */
async function ensureToken(holder) {
  const held = oauthState.get(holder.auth) ?? {}
  if (!stale(held)) return held.token
  return fetchToken(holder, null, true)
}

/**
 * Client certificate settings, as the sender wants them.
 *
 * Paths rather than contents: the file is read in the main process at send
 * time, so a rotated certificate takes effect on the next send instead of the
 * next restart, and the key never sits in the renderer.
 */
function certSettings() {
  return {
    certPath: S.prefs.clientCert || '',
    keyPath: S.prefs.clientKey || '',
    pfxPath: S.prefs.clientPfx || '',
    caPath: S.prefs.caBundle || '',
    passphrase: S.prefs.certPassphrase || ''
  }
}

/** The chain a request sits in: its collection, then its flow. */
function chainFor(req) {
  for (const col of S.collections) {
    for (const flow of col.flows) {
      if (flow.requests.some((r) => r.id === req?.id)) return [col, flow]
    }
  }
  return []
}



function testsPanel(req, res) {
  const box = el('div')
  const byId = new Map((res?.checks ?? []).map((c) => [c.id, c]))
  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Assertions' })]))

  for (const a of req.assertions ?? []) {
    const hit = byId.get(a.id)
    const ops = OPERATORS[a.subject] ?? ['equals']
    const needsPath = a.subject === 'json' || a.subject === 'header'
    const needsValue = !['exists', 'absent', 'isEmpty', 'notEmpty', 'isSuccess'].includes(a.op)

    box.append(
      el('div', { class: `assert${hit ? (hit.ok ? ' pass' : ' fail') : ''}` }, [
        el('input', { class: 'tick', type: 'checkbox', checked: a.on !== false, 'aria-label': 'Run this assertion', onchange: (e) => {
          a.on = e.target.checked
        } }),
        el('select', { class: 'subj', 'aria-label': 'Subject', onchange: (e) => {
          a.subject = e.target.value
          a.op = (OPERATORS[a.subject] ?? ['equals'])[0]
          paintBench()
        } }, SUBJECTS.map((s) => el('option', { value: s.id, text: s.label, selected: s.id === a.subject }))),
        needsPath
          ? el('input', { class: 'cell k', value: a.path ?? '', placeholder: a.subject === 'json' ? 'data.id' : 'X-Request-Id', 'aria-label': 'Path', oninput: (e) => {
              a.path = e.target.value
            } })
          : null,
        el('select', { class: 'op', 'aria-label': 'Operator', onchange: (e) => {
          a.op = e.target.value
          paintBench()
        } }, ops.map((o) => el('option', { value: o, text: OP_LABEL[o] ?? o, selected: o === a.op }))),
        needsValue
          ? el('input', { class: 'cell v', value: a.value ?? '', placeholder: '200', 'aria-label': 'Expected', oninput: (e) => {
              a.value = e.target.value
            } })
          : null,
        hit ? el('span', { class: 'saw', title: hit.detail, text: hit.detail }) : null,
        el('button', { class: 'x-btn', type: 'button', 'aria-label': 'Remove assertion', html: ico(I.x, 11, 2.3), onclick: () => {
          req.assertions = req.assertions.filter((x) => x.id !== a.id)
          commit()
        } })
      ])
    )
  }

  box.append(
    el('button', { class: 'addbtn', type: 'button', html: `${ico(I.plus, 10, 2.4)}<span>Add assertion</span>`, onclick: () => {
      ;(req.assertions ??= []).push(emptyAssertion())
      commit()
    } })
  )
  return box
}

function chainPanel(req) {
  const box = el('div')
  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Gives' }), el('em', { text: 'captured here, usable as {{name}} downstream' })]))

  for (const c of req.captures ?? []) {
    box.append(
      el('div', { class: 'give' }, [
        el('input', { class: 'cell k', value: c.name, placeholder: 'auth_token', 'aria-label': 'Variable name', oninput: (e) => {
          c.name = e.target.value
          commit('plane')
        } }),
        el('span', { class: 'arrow', html: ico(I.chev, 11, 2.4) }),
        el('select', { 'aria-label': 'From', onchange: (e) => {
          c.from = e.target.value
        } }, [
          el('option', { value: 'body', text: 'Body', selected: c.from !== 'header' }),
          el('option', { value: 'header', text: 'Header', selected: c.from === 'header' })
        ]),
        el('input', { class: 'cell v', value: c.path, placeholder: 'data.token', 'aria-label': 'Path', oninput: (e) => {
          c.path = e.target.value
        } }),
        el('button', { class: 'x-btn', type: 'button', 'aria-label': 'Remove capture', html: ico(I.x, 11, 2.3), onclick: () => {
          req.captures = req.captures.filter((x) => x.id !== c.id)
          commit()
        } })
      ])
    )
  }

  box.append(
    el('button', { class: 'addbtn', type: 'button', html: `${ico(I.plus, 10, 2.4)}<span>Capture a value</span>`, onclick: () => {
      ;(req.captures ??= []).push({ id: uid('cap'), name: '', from: 'body', path: '' })
      commit()
    } })
  )

  const uses = variablesUsed(req)
  if (uses.length) {
    box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Needs' })]))
    const known = envValues()
    for (const name of uses) {
      const from = allRequests().find((r) => (r.captures ?? []).some((c) => c.name === name))
      const set = Object.prototype.hasOwnProperty.call(known, name)
      box.append(
        el('div', { class: `chg ${from || set ? 'added' : 'removed'}` }, [
          el('b', { text: from ? 'chained' : set ? 'set' : 'missing' }),
          el('span', { class: 'p', text: `{{${name}}}` }),
          el('span', { class: from || set ? 'now' : 'was', text: from ? `from ${from.name}` : set ? String(known[name]).slice(0, 26) : 'nothing provides this' })
        ])
      )
    }
  }
  return box
}

/**
 * The dataset panel.
 *
 * One request, sent once per row, with the row's columns shadowing the
 * environment for that iteration only. It is how forty inputs get tested
 * against a validation endpoint without forty requests by hand.
 */
function dataPanel(req) {
  const box = el('div')
  const ds = req.dataset

  if (!ds) {
    box.append(
      el('p', {
        class: 'note',
        text: 'Attach a CSV or JSON table and this request runs once per row. Each column becomes a variable for that run only — {{email}} in the body picks up the email column.'
      })
    )
    box.append(dropTarget(req))
    return box
  }

  const used = variablesUsed(req)
  const unused = unusedColumns(ds, used)
  const missing = ds.columns.length ? used.filter((v) => !ds.columns.includes(v)) : []

  box.append(
    el('div', { class: 'baseline-bar' }, [
      el('span', { class: 'stat', text: `${ds.name} · ${ds.rows.length} row${ds.rows.length === 1 ? '' : 's'}` }),
      el('span', { class: 'pane-gap' }),
      el('button', { class: 'tiny', type: 'button', text: 'Replace', onclick: () => attachDataset(req) }),
      el('button', { class: 'tiny', type: 'button', text: 'Remove', onclick: () => {
        req.dataset = null
        commit()
      } })
    ])
  )

  if (unused.length) {
    // Usually a stale export or a typo in a variable name, and cheaper to say
    // than to watch every row produce an identical result.
    box.append(
      el('p', {
        class: 'note',
        text: `This request never mentions ${unused.map((c) => `{{${c}}}`).join(', ')} — ${unused.length === 1 ? 'that column changes' : 'those columns change'} nothing.`
      })
    )
  }
  if (missing.length) {
    box.append(
      el('p', {
        class: 'note',
        text: `${missing.map((c) => `{{${c}}}`).join(', ')} comes from the environment, not the dataset, so it is the same on every row.`
      })
    )
  }

  const table = el('div', { class: 'dtable' })
  table.append(
    el('div', { class: 'drow head' }, [
      el('span', { class: 'dcell n', text: '#' }),
      ...ds.columns.map((c) => el('span', { class: `dcell${used.includes(c) ? ' used' : ''}`, text: c }))
    ])
  )
  ds.rows.slice(0, 60).forEach((r, i) => {
    table.append(
      el('div', { class: 'drow' }, [
        el('span', { class: 'dcell n', text: String(i + 1) }),
        ...ds.columns.map((c) => el('span', { class: 'dcell', title: r[c] ?? '', text: r[c] ?? '' }))
      ])
    )
  })
  if (ds.rows.length > 60) table.append(el('div', { class: 'drow more', text: `and ${ds.rows.length - 60} more` }))
  box.append(table)

  box.append(
    el('button', {
      class: 'btn go',
      style: 'margin-top:12px',
      type: 'button',
      text: `Run all ${ds.rows.length} rows`,
      onclick: () => runDataset(req)
    })
  )
  return box
}

/**
 * Where a table gets attached.
 *
 * A file dropped here is read in the page, so a table on the desktop takes one
 * gesture. The button does the same thing through the OS picker, for a file
 * that is easier to find than to drag.
 */
function dropTarget(req) {
  const zone = el('div', { class: 'dsdrop' }, [
    el('span', { class: 'dsdrop-ico', html: ico(I.table, 20, 1.6) }),
    el('b', { text: 'Drop a CSV or JSON table' }),
    el('span', { class: 'dsdrop-or', text: 'or' }),
    el('button', { class: 'btn go', type: 'button', text: 'Choose a file', onclick: () => attachDataset(req) })
  ])

  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    // Stops the window-wide handler treating a table as a collection.
    e.stopPropagation()
    zone.classList.add('over')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('over'))
  zone.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('over')
    const file = e.dataTransfer?.files?.[0]
    if (file) useDataset(req, await file.text(), file.name)
  })
  return zone
}

/** The one place a table becomes a dataset, whichever way the file arrived. */
function useDataset(req, text, name) {
  const result = readDataset(text, name)
  if (!result.ok) {
    toast('bad', result.error)
    return
  }
  req.dataset = result.dataset
  S.editTab = 'data'
  commit()
  toast('ok', `${result.dataset.rows.length} rows from ${name}`)
}

async function attachDataset(req) {
  const chosen = await window.prism.file.open([
    { name: 'Data', extensions: ['csv', 'json', 'tsv', 'txt'] },
    { name: 'All files', extensions: ['*'] }
  ])
  if (!chosen) return
  useDataset(req, chosen.text, chosen.name)
}

/**
 * Every row, in order, reported as it goes.
 *
 * The rows are not run in parallel: a dataset commonly walks one resource
 * through several states, and firing them at once makes the outcome depend on
 * which finished first.
 */
async function runDataset(req) {
  const ds = req.dataset
  if (!ds?.rows.length) return
  if (!(await productionOk(`${req.name}, once for each of ${ds.rows.length} rows,`))) return

  const state = ds.rows.map((r, i) => ({ label: labelFor(r, i), status: 'wait', ms: 0, code: 0, failed: 0 }))
  const body = el('div', { class: 'suite' })
  const ring = el('div', { class: 'ring' })
  const steps = el('div', { class: 'steps' })

  const paint = () => {
    const done = state.filter((x) => x.status === 'pass' || x.status === 'fail').length
    const failed = state.filter((x) => x.status === 'fail').length
    const pct = done / state.length
    const C = 2 * Math.PI * 58
    ring.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140">
        <circle class="tr" cx="70" cy="70" r="58"></circle>
        <circle class="fl${failed ? ' bad' : ''}" cx="70" cy="70" r="58" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"></circle>
      </svg><b>${Math.round(pct * 100)}%</b>`
    steps.replaceChildren()
    for (const x of state.slice(0, 80)) {
      steps.append(
        el('div', { class: `step${x.status === 'wait' ? ' wait' : ''}` }, [
          el('span', { class: `state ${x.status === 'run' ? 'busy' : x.status === 'wait' ? '' : x.status}` }),
          el('span', { class: 'nm', text: x.label }),
          x.code ? el('span', { class: `code ${tone(x.code)}`, text: String(x.code) }) : null,
          el('span', { class: 'ms', text: x.ms ? `${x.ms}ms` : x.status })
        ])
      )
    }
    body.replaceChildren(ring, steps)
  }
  paint()
  sheet({
    title: `${req.name} × ${ds.rows.length}`,
    blurb: 'One send per row, in order. Each row’s columns shadow the environment for that send only.',
    body,
    acts: []
  })

  for (let i = 0; i < ds.rows.length; i += 1) {
    state[i].status = 'run'
    paint()
    const out = await sendOnce(req, scopeFor(envValues(), ds.rows[i]))
    state[i].ms = out.timing?.total ?? 0
    state[i].code = out.status ?? 0
    state[i].failed = out.failed ?? 0
    state[i].status = out.failed || out.error ? 'fail' : 'pass'
    paint()
  }

  const failed = state.filter((x) => x.status === 'fail').length
  toast(failed ? 'bad' : 'ok', `${ds.rows.length} rows — ${ds.rows.length - failed} passed, ${failed} failed`)
}

/* ------------------------------------------------------ response panels */

function respPanel(req, res) {
  if (S.respTab === 'brief') return briefPanel(req)
  // Drift is about the baseline, which exists whether or not this session has
  // sent anything — its panel explains both cases itself.
  if (S.respTab === 'drift') return driftPanel(req, res)
  if (!res) return el('div', { class: 'nothing', text: 'Send this request and the analysis appears here.' })
  switch (S.respTab) {
    case 'payload':
      return payloadPanel(res, req)
    case 'headers':
      return headersPanel(res)
    case 'shape':
      return shapePanel(res)
    case 'diff':
      return diffPanel(req, res)
    case 'drift':
      return driftPanel(req, res)
    case 'notes':
      return notesPanel(res)
    case 'timing':
      return timingPanel(res)
    default:
      return resultPanel(res)
  }
}

function briefPanel(req) {
  const box = el('div')
  box.append(
    el('dl', { class: 'pairs' }, [
      el('dt', { text: 'Collection' }),
      el('dd', { text: collectionOf(req.id)?.name ?? '—' }),
      el('dt', { text: 'Flow' }),
      el('dd', { text: flowOf(req.id)?.name ?? '—' }),
      el('dt', { text: 'Resolved' }),
      el('dd', { text: buildUrl(req, envValues()) }),
      el('dt', { text: 'Auth' }),
      el('dd', { text: req.auth?.kind ?? 'none' })
    ])
  )

  const runs = S.history.filter((h) => h.requestId === req.id)
  if (runs.length) {
    box.append(el('div', { class: 'lbl', style: 'margin-top:14px' }, [el('span', { text: 'Recent runs' })]))
    for (const h of runs.slice(0, 8)) {
      box.append(
        el('div', { class: 'snap' }, [
          el('span', { class: 'when', text: new Date(h.at).toLocaleTimeString() }),
          el('span', { class: `code ${tone(h.status)}`, text: String(h.status || 'ERR') }),
          el('span', { class: 'nm', text: h.env }),
          el('span', { class: 'ms', text: `${h.ms}ms` })
        ])
      )
    }
  }
  return box
}

const tile = (t, v, l) => el('div', { class: `tile ${t}` }, [el('b', { text: v }), el('span', { text: l })])

function resultPanel(res) {
  const box = el('div')
  const gql = gqlPanel(res)
  if (gql) box.append(gql)
  if (res.error) {
    box.append(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'No response' }), el('p', { text: res.error })])]))
    return box
  }
  box.append(
    el('div', { class: 'tiles' }, [
      tile(tone(res.status), String(res.status), word(res.status)),
      tile(res.timing.total > 1000 ? 'warn' : 'info', String(res.timing.total), 'milliseconds'),
      tile('', fmtBytes(res.bytes), 'downloaded'),
      tile(res.request?.url?.startsWith('https') ? 'ok' : 'warn', res.request?.url?.startsWith('https') ? 'TLS' : 'PLAIN', 'transport')
    ])
  )
  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Assertions' })]))
  if (!res.checks.length) box.append(el('p', { class: 'note', text: 'Nothing checked this response.' }))
  for (const c of res.checks) {
    box.append(
      el('div', { class: `chg ${c.ok ? 'added' : 'removed'}` }, [
        el('b', { text: c.ok ? 'pass' : 'fail' }),
        el('span', { class: 'p', text: SUBJECTS.find((s) => s.id === c.assertion.subject)?.label ?? c.assertion.subject }),
        el('span', { class: c.ok ? 'now' : 'was', text: c.detail })
      ])
    )
  }
  return box
}

function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function source(text, find = '') {
  const pre = el('pre', { class: 'src' })
  const q = find.trim().toLowerCase()
  let shown = 0

  String(text ?? '')
    .split('\n')
    .slice(0, 3000)
    .forEach((line, i) => {
      if (q && !line.toLowerCase().includes(q)) return
      shown += 1
      // The real line number, so a filtered view still tells you where you are.
      pre.append(el('span', { class: `ln${q ? ' hit' : ''}`, style: `--n:'${i + 1}'`, html: mark(colour(line), find) }))
    })

  if (q && !shown) pre.append(el('span', { class: 'ln', html: '<em style="color:var(--ink-4)">no line contains that</em>' }))
  return pre
}

/** Wraps the search term, without breaking the markup the tokeniser produced. */
function mark(html, find) {
  const q = find.trim()
  if (!q) return html
  const safe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Only outside tags: replacing inside an attribute would corrupt the span.
  return html.replace(new RegExp(`(${safe})(?![^<]*>)`, 'gi'), '<mark>$1</mark>')
}

function colour(line) {
  return esc(line).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])/g,
    (m, str, colon, num, bool, nul, punc) => {
      if (str) return colon ? `<span class="t-key">${str}</span><span class="t-punc">${colon}</span>` : `<span class="t-str">${str}</span>`
      if (num) return `<span class="t-num">${num}</span>`
      if (bool) return `<span class="t-bool">${bool}</span>`
      if (nul) return `<span class="t-null">${nul}</span>`
      if (punc) return `<span class="t-punc">${punc}</span>`
      return m
    }
  )
}

/**
 * The response body.
 *
 * Every scalar line is a click target. Chaining used to mean reading a path
 * off the screen, retyping it into the Chain tab and hoping the dots were in
 * the right places — for a value that is right there under the pointer. Now
 * clicking it offers to capture it, or to assert on what it currently says.
 */
function payloadPanel(res, req) {
  const box = el('div')
  if (res.truncated) box.append(el('p', { class: 'note', text: 'Only the first 4 MB is shown. Assertions ran against everything that arrived.' }))

  const isJson = res.json !== undefined
  const rows = isJson ? jsonLines(res.json, { limit: 4000 }) : null
  const text = isJson ? rows.map((l) => l.text).join('\n') : res.body || '(empty)'
  const q = S.find.trim()
  const hits = q ? text.split('\n').filter((l) => l.toLowerCase().includes(q.toLowerCase())).length : 0

  const field = el('input', {
    class: 'find-field',
    type: 'search',
    value: S.find,
    placeholder: 'Find in the body',
    'aria-label': 'Find in the response body',
    spellcheck: 'false',
    oninput: (e) => {
      S.find = e.target.value
      const at = e.target.selectionStart
      paintBench()
      // Re-rendering the panel replaces the field, so the caret has to be put
      // back or typing a second character starts a new search.
      const next = document.querySelector('.find-field')
      if (next) {
        next.focus()
        next.setSelectionRange(at, at)
      }
    }
  })

  box.append(
    el('div', { class: 'find-bar-row' }, [
      el('span', { class: 'find-icon', html: ico(I.search, 12, 2) }),
      field,
      q ? el('span', { class: 'stat', text: hits ? `${hits} line${hits === 1 ? '' : 's'}` : 'nothing' }) : null,
      !q && isJson ? el('span', { class: 'stat quiet', text: 'click a value to capture it' }) : null
    ])
  )

  box.append(isJson ? jsonSource(rows, q, req) : source(text, q))
  return box
}

/**
 * The body, written out as it arrived.
 *
 * Bytes rather than text: an export endpoint answering with a PDF or a zip is
 * exactly the thing worth saving, and re-encoding it as UTF-8 on the way would
 * quietly corrupt it.
 */
async function saveBody(res, req) {
  const type = String(res.headers?.['content-type'] ?? '')
  const ext = /json/i.test(type) ? 'json' : /xml/i.test(type) ? 'xml' : /html/i.test(type) ? 'html' : /pdf/i.test(type) ? 'pdf' : /csv/i.test(type) ? 'csv' : 'txt'
  const name = `${slug(req?.name || 'response')}.${ext}`

  const bytes = new TextEncoder().encode(res.body ?? '')
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)

  const at = await window.prism.file.saveBytes({ name, base64: btoa(binary) })
  if (!at) return
  if (at.error) {
    toast('bad', at.error)
    return
  }
  toast('ok', `Written to ${at}`)
}

/** The JSON body, where each scalar line can be acted on. */
function jsonSource(rows, find, req) {
  const pre = el('pre', { class: 'src live' })
  const q = find.trim().toLowerCase()
  let shown = 0

  rows.forEach((line, i) => {
    if (q && !line.text.toLowerCase().includes(q)) return
    shown += 1

    const canAct = capturable(line) && req
    const node = el(canAct ? 'button' : 'span', {
      class: `ln${q ? ' hit' : ''}${canAct ? ' act' : ''}`,
      style: `--n:'${i + 1}'`,
      html: mark(colour(line.text), find)
    })
    if (canAct) {
      node.type = 'button'
      node.title = line.path
      node.onclick = (e) => fieldMenu(e, req, line)
    }
    pre.append(node)
  })

  if (q && !shown) pre.append(el('span', { class: 'ln', html: '<em style="color:var(--ink-4)">no line contains that</em>' }))
  return pre
}

/**
 * What can be done with the value under the pointer.
 *
 * Capture first, because that is the one that saves real work: it is the
 * difference between "type data.session.token into the Chain tab" and one
 * click. Asserting on the current value is second, and deliberately worded as
 * "what it says now" — the value is an example, not a specification.
 */
function fieldMenu(e, req, line) {
  const brief = (v) => {
    const t = typeof v === 'string' ? v : JSON.stringify(v)
    return t.length > 24 ? `${t.slice(0, 21)}…` : t
  }

  openMenu(e.currentTarget, [
    {
      label: `Capture as {{${suggestName(line.path)}}}`,
      icon: I.flow,
      run: () => {
        const name = freeCaptureName(suggestName(line.path))
        req.captures = [...(req.captures ?? []), { id: uid('cap'), name, from: 'json', path: line.path }]
        S.editTab = 'chain'
        commit()
        toast('ok', `{{${name}}} is now captured from ${line.path}`)
      }
    },
    {
      label: `Assert it equals ${brief(line.value)}`,
      icon: I.check,
      run: () => {
        req.assertions = [
          ...(req.assertions ?? []),
          emptyAssertion({ subject: 'json', op: 'equals', path: line.path, value: String(line.value ?? '') })
        ]
        S.editTab = 'tests'
        commit()
        toast('ok', `Asserting ${line.path} equals ${brief(line.value)}`)
      }
    },
    {
      label: 'Assert it exists',
      icon: I.check,
      run: () => {
        req.assertions = [...(req.assertions ?? []), emptyAssertion({ subject: 'json', op: 'exists', path: line.path, value: '' })]
        S.editTab = 'tests'
        commit()
        toast('ok', `Asserting ${line.path} is there`)
      }
    },
    { sep: true },
    {
      label: 'Copy the path',
      icon: I.copy,
      run: () => {
        navigator.clipboard.writeText(line.path)
        toast('ok', line.path)
      }
    },
    {
      label: 'Copy the value',
      icon: I.copy,
      run: () => {
        navigator.clipboard.writeText(typeof line.value === 'string' ? line.value : JSON.stringify(line.value))
        toast('ok', 'Copied')
      }
    }
  ])
}

/** A capture name nothing else in the workspace already claims. */
function freeCaptureName(stem) {
  const taken = new Set(allRequests().flatMap((r) => (r.captures ?? []).map((c) => c.name)))
  if (!taken.has(stem)) return stem
  let n = 2
  while (taken.has(`${stem}_${n}`)) n += 1
  return `${stem}_${n}`
}

const mask = (v) => (String(v).length <= 12 ? '••••••' : `${String(v).slice(0, 6)}${'•'.repeat(9)}${String(v).slice(-4)}`)

function headersPanel(res) {
  const box = el('div')
  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Response' })]))
  const a = el('dl', { class: 'pairs' })
  for (const [k, v] of Object.entries(res.headers ?? {})) a.append(el('dt', { text: k }), el('dd', { text: v }))
  box.append(a)

  box.append(el('div', { class: 'lbl', style: 'margin-top:14px' }, [el('span', { text: 'Request' })]))
  const b = el('dl', { class: 'pairs' })
  for (const [k, v] of Object.entries(res.request?.headers ?? {})) {
    // A live credential is never printed back into a panel that gets shared.
    const secret = S.prefs.maskCredentials !== false && /authorization|api[-_]?key|token|cookie/i.test(k)
    b.append(el('dt', { text: k }), el('dd', { text: secret ? mask(v) : v }))
  }
  box.append(b)
  return box
}

function shapePanel(res) {
  const box = el('div')
  if (res.json === undefined) {
    box.append(el('p', { class: 'note', text: 'The response is not JSON, so there is no structure to explore.' }))
    return box
  }
  const rows = tree(res.json)
  const shut = new Set()
  const host = el('div', { class: 'tree-json' })
  const paint = () => {
    host.replaceChildren()
    for (const n of rows) {
      if ([...shut].some((p) => n.path !== p && n.path.startsWith(`${p}.`))) continue
      host.append(
        el('div', { class: 'tj', style: `padding-left:${n.depth * 13}px` }, [
          el('span', { class: 'tw', text: n.leaf ? '' : shut.has(n.path) ? '▸' : '▾', onclick: () => {
            shut.has(n.path) ? shut.delete(n.path) : shut.add(n.path)
            paint()
          } }),
          el('span', { class: 'tk', text: n.key }),
          el('span', { class: 'tt', text: n.kind }),
          el('span', { class: 'tv', text: n.preview })
        ])
      )
    }
  }
  paint()
  box.append(host)
  return box
}

const brief = (v) => String((typeof v === 'string' ? v : JSON.stringify(v)) ?? '').slice(0, 36)

function diffPanel(req, res) {
  const box = el('div')
  const before = S.previous.get(req.id)
  if (!before) {
    box.append(el('p', { class: 'note', text: 'Nothing to compare yet. Send this a second time and every field that moved is listed here.' }))
    return box
  }
  const changes = diff(before.json, res.json)
  box.append(el('p', { class: 'note', text: `Against the run at ${new Date(before.at).toLocaleTimeString()} — ${diffSummary(changes)}.` }))
  for (const c of changes.slice(0, 120)) {
    box.append(
      el('div', { class: `chg ${c.kind}` }, [
        el('b', { text: c.kind }),
        el('span', { class: 'p', text: c.path }),
        c.kind === 'removed' ? el('span', { class: 'was', text: brief(c.before) }) : null,
        c.kind === 'added' ? el('span', { class: 'now', text: brief(c.after) }) : null,
        c.kind === 'changed' || c.kind === 'retyped'
          ? el('span', {}, [el('span', { class: 'was', text: brief(c.before ?? c.from) }), el('span', { text: ' → ' }), el('span', { class: 'now', text: brief(c.after ?? c.to) })])
          : null
      ])
    )
  }
  return box
}

function driftPanel(req, res) {
  const box = el('div')
  const base = S.baselines.get(req.id)

  if (!base) {
    box.append(
      el('p', {
        class: 'note',
        text: 'No baseline yet. Freeze this response as the shape you expect, and every later run is checked against it — a field that disappears or changes type is reported even when no assertion mentions it.'
      })
    )
    box.append(
      el('button', { class: 'btn go', type: 'button', text: 'Freeze this response', onclick: () => freezeBaseline(req) })
    )
    return box
  }

  const d = drift(req)
  box.append(
    el('div', { class: 'baseline-bar' }, [
      el('span', { class: 'stat', text: `Frozen ${new Date(base.at).toLocaleString()}` }),
      el('span', { class: `code ${tone(base.status)}`, text: String(base.status) }),
      el('span', { class: 'pane-gap' }),
      el('button', { class: 'tiny', type: 'button', text: 'Re-freeze', onclick: () => freezeBaseline(req) }),
      el('button', { class: 'tiny', type: 'button', text: 'Clear', onclick: () => dropBaseline(req) })
    ])
  )

  if (!d) {
    box.append(el('p', { class: 'note', text: 'Send the request to compare it against the baseline.' }))
    return box
  }

  if (d.statusChanged) {
    box.append(
      el('div', { class: 'find bad' }, [
        el('div', { class: 'find-bar' }),
        el('div', {}, [
          el('b', { text: 'The status changed' }),
          el('p', { text: `${base.status} when frozen, ${res.status} now.` })
        ])
      ])
    )
  }

  if (!d.changes.length && !d.statusChanged) {
    box.append(
      el('div', { class: 'find ok' }, [
        el('div', { class: 'find-bar' }),
        el('div', {}, [el('b', { text: 'No drift' }), el('p', { text: 'The response matches the baseline exactly.' })])
      ])
    )
    return box
  }

  const group = (title, list, kind, why) => {
    if (!list.length) return
    box.append(el('div', { class: 'lbl', style: 'margin-top:14px' }, [el('span', { text: title }), el('em', { text: why })]))
    for (const c of list.slice(0, 60)) {
      box.append(
        el('div', { class: `chg ${kind}` }, [
          el('b', { text: c.kind }),
          el('span', { class: 'p', text: c.path }),
          el('span', { class: c.kind === 'removed' ? 'was' : 'now', text: driftValue(c) })
        ])
      )
    }
  }

  group('Breaking', d.breaking, 'removed', 'gone, or a different type than agreed')
  group('Added', d.additions, 'added', 'new since the baseline — rarely a problem')
  group('Values', d.values, 'changed', 'the data moved, the shape did not')
  return box
}

function driftValue(c) {
  if (c.kind === 'retyped') return `${c.from} → ${c.to}`
  if (c.kind === 'removed') return brief(c.before)
  if (c.kind === 'added') return brief(c.after)
  return `${brief(c.before)} → ${brief(c.after)}`
}

/**
 * GraphQL errors, which arrive inside a 200.
 *
 * This is the failure every REST-shaped tool misses: the status assertion
 * passes, the response says the query was rejected, and the suite is green.
 */
function gqlPanel(res) {
  const errs = errorsIn(res.json)
  if (!errs.length) return null

  const box = el('div', { class: 'gqlerrs' })
  box.append(
    el('div', { class: 'find bad' }, [
      el('div', { class: 'find-bar' }),
      el('div', {}, [
        el('b', { text: errs.length === 1 ? 'The query was rejected' : `${errs.length} errors in the response` }),
        el('p', { text: `The status was ${res.status}, which is what GraphQL does — it answers 200 and puts the failure in the body.` })
      ])
    ])
  )
  for (const e of errs.slice(0, 12)) {
    box.append(
      el('div', { class: 'gqlerr' }, [
        el('b', { text: e.message }),
        e.path ? el('span', { class: 'p', text: e.path }) : null,
        e.line ? el('span', { class: 'ln-no', text: `line ${e.line}` }) : null
      ])
    )
  }
  return box
}

function notesPanel(res) {
  const box = el('div')
  box.append(el('p', { class: 'note', text: 'Every line is a rule over this response, with the evidence that produced it. Nothing here is guessed.' }))
  for (const f of res.findings ?? []) {
    box.append(
      el('div', { class: `find ${f.level}` }, [
        el('div', { class: 'find-bar' }),
        el('div', {}, [el('b', { text: f.title }), el('p', { text: f.detail }), f.hint ? el('em', { text: f.hint }) : null])
      ])
    )
  }
  return box
}

function timingPanel(res) {
  const box = el('div')
  if (res.error) {
    box.append(el('p', { class: 'note', text: 'The request never completed, so there is nothing to break down.' }))
    return box
  }
  const t = res.timing
  const total = Math.max(t.total, 1)
  const phases = [
    ['DNS lookup', 0, t.dns, 'dns'],
    ['TCP connect', t.dns, t.tcp, 'tcp'],
    ['TLS handshake', t.tcp, t.tls || t.tcp, 'tls'],
    ['Waiting', t.tls || t.tcp, t.first, 'wait'],
    ['Download', t.first, t.end, 'down']
  ]
  const grid = el('div', { class: 'wf' })
  for (const [name, from, to, cls] of phases) {
    const span = Math.max(0, to - from)
    grid.append(
      el('span', { class: 'wf-n', text: name }),
      el('span', { class: 'wf-ms', text: span ? `${span}ms` : '—' }),
      el('div', { class: 'wf-t' }, [el('div', { class: `wf-b ${cls}`, style: `left:${(from / total) * 100}%;width:${Math.max(span ? 1.5 : 0, (span / total) * 100)}%` })])
    )
  }
  box.append(grid)
  box.append(
    el('dl', { class: 'pairs', style: 'margin-top:12px' }, [
      el('dt', { text: 'Started' }),
      el('dd', { text: new Date(res.at).toLocaleTimeString() }),
      el('dt', { text: 'Round trip' }),
      el('dd', { text: `${t.total}ms` }),
      el('dt', { text: 'Downloaded' }),
      el('dd', { text: fmtBytes(res.bytes) })
    ])
  )
  return box
}

/* ============================================================== baselines

   The diff engine could only ever compare against the previous run in memory,
   which answers "did anything change since I last pressed send" — a question
   about the last minute. Freezing a response as a baseline answers the useful
   one: has this endpoint drifted from the shape we agreed on?

   A baseline is kept in the workspace file, so it survives a restart and can
   be reviewed in a pull request alongside the code that changed it. */

function freezeBaseline(req) {
  const res = S.results.get(req.id)
  if (!res || res.error) {
    toast('bad', 'Send the request first — there is nothing to freeze.')
    return
  }
  S.baselines.set(req.id, {
    at: res.at,
    status: res.status,
    headers: res.headers ?? {},
    json: res.json,
    body: res.json === undefined ? (res.body ?? '') : ''
  })
  commit()
  toast('ok', `Baseline frozen at ${res.status}`)
}

function dropBaseline(req) {
  S.baselines.delete(req.id)
  commit()
  toast('ok', 'Baseline cleared')
}

/**
 * What has drifted from the frozen shape.
 *
 * Split by severity rather than listed flat, because the four kinds are not
 * equally alarming: a field that vanished or changed type breaks whoever
 * consumes it, a new field almost never does, and a changed value is usually
 * just the data being data.
 */
function drift(req) {
  const base = S.baselines.get(req.id)
  const res = S.results.get(req.id)
  if (!base || !res || res.error) return null
  const changes = diff(base.json, res.json)
  return {
    base,
    changes,
    breaking: changes.filter((c) => c.kind === 'removed' || c.kind === 'retyped'),
    additions: changes.filter((c) => c.kind === 'added'),
    values: changes.filter((c) => c.kind === 'changed'),
    statusChanged: base.status !== res.status
  }
}

/* ================================================================ sending */

/**
 * One deliberate press before anything goes to production.
 *
 * Named, never blocked — a suite that will not touch production is not much of
 * a suite. Asked once per *run*: asking per request meant a flow opened one
 * confirm per parallel request, each replacing the last, and the run waited
 * forever on dialogs that were no longer on screen. The ten-times and dataset
 * runs did not ask at all.
 */
async function productionOk(what) {
  const env = environment()
  if (S.prefs.confirmProduction === false || !env || !/prod|live|release/i.test(env.name)) return true
  return ask({
    title: `Send to ${env.name}?`,
    blurb: `This environment is named like production, and ${what} really will be sent.`,
    danger: 'Send it'
  })
}

async function send(req, { confirmed = false, quiet = false } = {}) {
  if (S.busy.has(req.id)) return
  if (!confirmed && !(await productionOk(`${req.method} ${buildUrl(req, envValues())}`))) return

  S.busy.add(req.id)
  commit()

  const out = await sendOnce(req, envValues())
  S.busy.delete(req.id)
  if (out.error) {
    commit()
    toast('bad', out.error)
    return
  }
  // Only move off the pre-send tab. Being watching Drift, pressing Send and
  // landing on Result is the tool deciding what you meant to look at.
  if (S.respTab === 'brief') S.respTab = out.failed ? 'notes' : 'result'
  commit()
  // A run reports once, at the end; a toast per request stacked four deep.
  if (!quiet) toast(out.failed ? 'bad' : 'ok', `${req.name} — ${out.status} in ${out.timing.total}ms`)
}

/**
 * One send, against one set of variables.
 *
 * Separated out because a dataset run does the same thing sixty times with a
 * different scope each time, and duplicating the assertion, capture and
 * analysis steps would let the two drift apart.
 */
async function sendOnce(req, vars) {
  // Inheritance is resolved here rather than in compile(), so the preview in
  // the header and the bytes on the wire come from the same call.
  const chain = chainFor(req)
  const resolved = withInherited(req, chain)

  // A token that expires in four seconds passes a naive check and then expires
  // in flight, so the grant is topped up before the send rather than after the
  // 401 it would otherwise cause.
  const holder = [req, ...[...chain].reverse()].find((x) => x?.auth?.kind === 'oauth2' && x.auth.oauth)
  if (holder) {
    const token = await ensureToken(holder)
    if (token) resolved.auth = { kind: 'bearer', token }
  }

  const spec = {
    ...compile(resolved, vars),
    timeoutMs: Number(req.timeoutMs) || Number(S.prefs.timeoutMs) || 30000,
    followRedirects: S.prefs.followRedirects !== false,
    verifyTls: S.prefs.verifyTls !== false,
    useCookies: S.prefs.useCookies !== false,
    proxy: S.prefs.proxy || '',
    ...certSettings(),
    maxBodyMb: Number(S.prefs.maxBodyMb) || 4
  }
  const at = Date.now()
  const raw = await window.prism.http.send(spec)

  if (raw.error) {
    const failure = { error: raw.error, at, request: spec, checks: [], failed: 1, status: 0, timing: { total: 0 } }
    remember(req, failure)
    return failure
  }

  let json
  try {
    json = JSON.parse(raw.body)
  } catch {
    json = undefined
  }

  const response = { ...raw, json }
  const checks = runAll(req.assertions, response)
  const result = {
    ...response,
    at,
    request: spec,
    checks,
    failed: checks.filter((c) => !c.ok).length,
    findings: analyse(response, { ...spec, secure: raw.secure }, checks)
  }

  // Captured values land in the environment, which is what lets the next
  // request in the flow use them without anyone copying anything.
  for (const cap of req.captures ?? []) {
    if (!cap.name || !environment()) continue
    const value =
      cap.from === 'header'
        ? Object.entries(response.headers ?? {}).find(([k]) => k.toLowerCase() === cap.path.toLowerCase())?.[1]
        : jsonPath(json, cap.path)
    if (value !== undefined) environment().values[cap.name] = String(value)
  }

  remember(req, result)
  return result
}

function remember(req, result) {
  const was = S.results.get(req.id)
  if (was && was.json !== undefined) S.previous.set(req.id, was)
  S.results.set(req.id, result)
  S.history.unshift({
    id: uid('h'),
    requestId: req.id,
    name: req.name,
    method: req.method,
    url: result.request?.url ?? req.url,
    status: result.status,
    ms: result.timing?.total ?? 0,
    at: result.at,
    env: environment()?.name ?? '—',
    failed: result.failed
  })
  S.history = S.history.slice(0, Math.max(10, Number(S.prefs.historyLimit) || 80))
  // Runs are kept with the workspace, and a capture may have changed the
  // environment; both need the autosave to hear about it.
  touch()
}

/* ============================================================== from curl */

/**
 * Pasting a cURL command.
 *
 * Prism could already write cURL in fifteen shapes and could not read one
 * back, which is the wrong way round: copy-as-cURL from a browser's network
 * tab is how most requests start life.
 *
 * The preview updates as you type and shows what the request will be, because
 * the failure people fear here is a silent misread — a body that became a
 * query parameter, or a flag that was dropped.
 */
function pasteCurl() {
  const box = el('div', { class: 'curlbox' })
  const area = el('textarea', {
    class: 'pastearea',
    rows: '7',
    spellcheck: 'false',
    placeholder: "curl 'https://api.example.test/orders' \\\n  -H 'authorization: Bearer …' \\\n  --data-raw '{\"sku\":\"A\"}'",
    'aria-label': 'The curl command'
  })
  const out = el('div', { class: 'curlout' })
  let parsed = null

  const preview = () => {
    out.replaceChildren()
    const text = area.value.trim()
    if (!text) {
      parsed = null
      out.append(el('p', { class: 'note', text: 'Paste a command and its parts appear here before anything is created.' }))
      return
    }

    const result = fromCurl(text)
    parsed = result.ok ? result : null
    if (!result.ok) {
      out.append(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'Cannot read that' }), el('p', { text: result.error })])]))
      return
    }

    const req = result.request
    out.append(
      el('div', { class: 'curlhead' }, [
        el('span', { class: `verb ${req.method.toLowerCase()}`, text: req.method }),
        el('span', { class: 'curlurl', text: req.url })
      ])
    )

    const facts = el('div', { class: 'curlfacts' })
    const fact = (n, one, many) => {
      if (n) facts.append(el('span', { class: 'envchip plain' }, [el('b', { text: String(n) }), el('span', { text: n === 1 ? one : many })]))
    }
    fact(req.query.length, 'parameter', 'parameters')
    fact(req.headers.length, 'header', 'headers')
    if (req.auth.kind !== 'none') facts.append(el('span', { class: 'envchip lock' }, [el('b', { text: '1' }), el('span', { text: `${req.auth.kind} auth` })]))
    if (req.bodyKind !== 'none') facts.append(el('span', { class: 'envchip plain' }, [el('b', { text: req.bodyKind }), el('span', { text: 'body' })]))
    out.append(facts)

    if (result.unknown.length) {
      out.append(
        el('div', { class: 'envnudge' }, [
          el('p', {
            html: `Prism does not act on ${result.unknown.map((f) => `<code>${esc(f)}</code>`).join(', ')}. Everything else is imported — but that flag changes what the command does, so it is worth knowing it was left behind.`
          })
        ])
      )
    }
    if (result.insecure) {
      out.append(
        el('div', { class: 'envnudge' }, [
          el('p', { html: 'That command has <code>-k</code> in it, which turns off certificate checking. Prism will not do that silently: turn off <strong>Verify certificates</strong> in Settings if you meant it.' })
        ])
      )
    }
  }

  area.oninput = preview
  preview()
  box.append(area, out)

  sheet({
    title: 'Paste a cURL command',
    blurb: 'From a browser network tab, a colleague, or a README. It becomes a request you can send and assert on.',
    body: box,
    acts: [
      {
        label: 'Create the request',
        go: true,
        keepOpen: true,
        onClick: () => {
          if (!parsed) {
            toast('bad', 'There is nothing readable to create yet.')
            return
          }
          const flow = flowOf(S.pickedId ?? '') ?? allFlows()[0]
          if (!flow) {
            toast('bad', 'Make a collection first — there is nowhere to put it.')
            return
          }
          flow.requests.push(parsed.request)
          S.pickedId = parsed.request.id
          closeSheet()
          commit()
          tidyIfUnplaced(parsed.request.id)
          toast('ok', `${parsed.request.name} added to ${flow.name}`)
        }
      }
    ]
  })
}

/** A new node with no saved position lands somewhere sensible rather than 0,0. */
function tidyIfUnplaced(id) {
  if (S.layout.has(id)) return
  const spots = [...S.layout.values()]
  const y = spots.length ? Math.max(...spots.map((p) => p.y)) + 150 : 80
  S.layout.set(id, { x: 80, y })
  commit()
}

/* ================================================================= import */

async function doImport() {
  const chosen = await window.prism.file.open([
    { name: 'Collections and captures', extensions: ['json', 'har', 'yaml', 'yml'] },
    { name: 'All files', extensions: ['*'] }
  ])
  if (!chosen) return
  applyImport(readCollection(chosen.text, chosen.name))
}

const sourceLabel = (s) =>
  ({
    postman: 'a Postman collection',
    'postman-environment': 'a Postman environment',
    openapi: 'an OpenAPI document',
    har: 'a browser capture',
    swagger: 'a Swagger document',
    'prism-workspace': 'a Prism workspace'
  })[s] ??
  'a collection'

function applyImport(result) {
  if (!result.ok) {
    toast('bad', result.error)
    return
  }
  if (result.collection) S.collections.push(result.collection)
  if (result.environments?.length) {
    S.environments.push(...result.environments)
    if (!S.envId) S.envId = S.environments[0].id
  }
  const n = countRequests(result)
  toast('ok', `${result.name} — ${n} request${n === 1 ? '' : 's'} from ${sourceLabel(result.source)}`)
  if (!S.pickedId) S.pickedId = allRequests()[0]?.id ?? ''
  commit()
  setTimeout(focusFlow, 30)
}

/* ================================================================= export */

/**
 * The export centre.
 *
 * A page rather than a dialog, because choosing a target means reading the
 * code it produces — and reading is what the old cramped preview made hard.
 * The scope switch is explicit: exporting one request and exporting the flow
 * it sits in are different acts and used to be inferred from what happened to
 * be selected.
 */
let exportTarget = 'curl'

/**
 * What an export writes: the request as it is actually sent.
 *
 * A request set to Inherit, under a collection holding the bearer token,
 * exported with no Authorization at all -- so the exported cURL and the CLI
 * run disagreed about the same request.
 */
const asSent = (req) => (req ? withInherited(req, chainFor(req)) : req)
const flowAsSent = (flow) => (flow ? { ...flow, requests: flow.requests.map(asSent) } : flow)

/** A collection exported whole: every flow's requests, in order. */
const collectionAsFlow = (col) => ({ id: col.id, name: col.name, requests: col.flows.flatMap((f) => f.requests) })

function openExport(onlyFlow, onlyRequest) {
  const req = onlyRequest !== undefined ? onlyRequest : current()
  // Guarded: a click handler hands over its Event, and an Event is not a flow.
  const given = Array.isArray(onlyFlow?.requests) ? onlyFlow : null
  const flow = given ?? (req ? flowOf(req.id) : allFlows()[0])
  if (!req && !flow) {
    toast('bad', 'There is nothing to export yet.')
    return
  }
  let scope = req ? 'request' : 'flow'

  const paint = () => {
    const whole = WHOLE_FLOW.has(exportTarget) || scope === 'flow'
    const code = generate(exportTarget, {
      request: scope === 'request' ? asSent(req) : null,
      flow: flowAsSent(flow),
      environment: environment()
    })
    const spec = TARGETS.find((t) => t.id === exportTarget)
    const name = `${slug(whole ? (flow?.name ?? 'flow') : (req?.name ?? 'request'))}.${spec.ext}`

    /* the sidebar: every target, grouped */
    const nav = el('nav', { class: 'page-nav' }, [pageNavHead('export', 'Export')])
    for (const group of GROUPS) {
      const items = TARGETS.filter((t) => t.group === group)
      if (!items.length) continue
      nav.append(el('h4', { class: 'nav-group', text: group }))
      const list = el('div', { class: 'page-sections' })
      for (const t of items) {
        list.append(
          el('button', { class: t.id === exportTarget ? 'on' : '', type: 'button', onclick: () => {
            exportTarget = t.id
            paint()
          } }, [
            el('span', { class: 'exp-ext', text: `.${t.ext.split('.').pop()}` }),
            el('span', { class: 'page-label', text: t.label })
          ])
        )
      }
      nav.append(list)
    }
    nav.append(el('span', { class: 'spacer' }))
    nav.append(el('footer', { html: 'Variables stay variables.<br />No credential is ever resolved into a file.' }))

    /* the hero: what is being exported, which scope, and what to do with it */
    const lines = code.split('\n').length
    const subject = whole
      ? `Every request in ${flow?.name ?? 'the flow'} — ${flow?.requests.length ?? 0} of them`
      : `${req?.method} ${shortPath(req?.url ?? '')}`
    const copy = () => {
      navigator.clipboard.writeText(code)
      toast('ok', 'Copied to the clipboard')
    }
    const save = async () => {
      const path = await window.prism.file.save({
        name,
        text: code,
        filters: [{ name: 'File', extensions: [name.split('.').pop()] }]
      })
      if (path?.error) toast('bad', `Could not write that file: ${path.error}`)
      else if (path) toast('ok', `Written to ${path}`)
    }
    const hero = pageHero(spec.label, subject, [
      // Only offered when there is a choice to make, and never for a
      // collection format, which is always the whole flow.
      req && flow && !WHOLE_FLOW.has(exportTarget)
        ? el('div', { class: 'seg export-scope' }, [
            el('button', { class: `segbtn${scope === 'request' ? ' on' : ''}`, type: 'button', text: 'This request', onclick: () => {
              scope = 'request'
              paint()
            } }),
            el('button', { class: `segbtn${scope === 'flow' ? ' on' : ''}`, type: 'button', text: 'Whole flow', onclick: () => {
              scope = 'flow'
              paint()
            } })
          ])
        : null,
      el('button', { class: 'btn', type: 'button', html: `${ico(I.copy, 12, 2)}<span>Copy</span>`, onclick: copy }),
      el('button', { class: 'btn go', type: 'button', html: `${ico(I.save, 12, 2)}<span>Save file</span>`, onclick: save })
    ].filter(Boolean))

    /* the file, as an editor pane filling the page */
    const body = el('section', { class: 'file-card' }, [
      el('div', { class: 'file-bar' }, [
        el('span', { class: 'file-tab' }, [el('span', { class: 'file-dot' }), el('span', { class: 'file-name', text: name })]),
        el('span', { class: 'pane-gap' }),
        el('span', { class: 'file-meta', text: `${lines} line${lines === 1 ? '' : 's'} · ${spec.group}` })
      ]),
      el('div', { class: 'file-body' }, [source(code)])
    ])

    mountPage('export', { nav, hero, body, trail: spec.label })
  }

  paint()
}

/* =========================================================== environments */

/* ========================================================== environments */

/**
 * Environments.
 *
 * On the page shell rather than in a dialog, because an environment is a thing
 * people work in — renaming, pasting, hunting a variable that is not set — and
 * a dialog is a container for a decision, not for work.
 *
 * The rail lists the environments themselves. What is *selected* here and what
 * is *in use* are two different things, and the old dialog conflated them: it
 * had one button that switched the workspace to whichever row you had clicked
 * last. Selecting is now free, and switching says which one it is switching to.
 */
let envAt = ''
let envFind = ''
let envPasting = false

function openEnvironments(id) {
  if (id) envAt = id
  // 'compare' is a section of this page rather than an environment, so it has
  // to survive this check — without it, clicking Compare bounced straight back
  // to whichever environment was in use.
  if (envAt !== 'compare' && !S.environments.some((e) => e.id === envAt)) {
    envAt = S.envId || S.environments[0]?.id || ''
  }

  const sections = S.environments.map((env) => ({
    id: env.id,
    label: env.name || 'Untitled',
    icon: env.id === S.envId ? I.check : I.globe,
    badge: Object.keys(env.values ?? {}).length,
    head: () => envHead(env),
    render: () => envPanel(env)
  }))

  if (!sections.length) {
    sections.push({
      id: 'none',
      label: 'No environments',
      icon: I.globe,
      blurb: 'A set of values a request can refer to as {{name}}.',
      render: () =>
        el('div', {}, [
          el('p', {
            class: 'note',
            text: 'An environment holds the values that change between machines — a base URL, a tenant, a login — so the same request works against your laptop and against staging.'
          }),
          el('button', { class: 'btn go', style: 'margin-top:12px', type: 'button', text: 'Create one', onclick: newEnvironment })
        ])
    })
  }

  if (S.environments.length > 1) {
    sections.push({
      id: 'compare',
      label: 'Compare',
      icon: '<path d="M12 4v16"/><path d="M8 8 4 12l4 4"/><path d="m16 8 4 4-4 4"/>',
      blurb: 'Why it works on one and not the other.',
      render: () => comparePanel()
    })
  }

  page({
    title: 'Environments',
    sections,
    active: envAt,
    onPick: (next) => {
      envFind = ''
      envPasting = false
      openEnvironments(next)
    },
    navFoot: el('button', {
      class: 'nav-add',
      type: 'button',
      html: ico(I.plus, 11, 2.4) + '<span>Add environment</span>',
      onclick: newEnvironment
    })
  })
}

/**
 * Two environments, side by side.
 *
 * The question is always "why does this work on Dev and not on Staging", and
 * the answer is almost always one name set in one and not the other — which is
 * invisible when the two are pages apart in a rail.
 *
 * A secret is compared as set-or-not and never by value: putting two live
 * tokens on screen beside each other to demonstrate that they differ, which
 * they obviously do, is not a thing worth doing.
 */
let compareA = ''
let compareB = ''

function comparePanel() {
  const box = el('div', { class: 'cmp' })
  const envs = S.environments
  if (!envs.some((e) => e.id === compareA)) compareA = S.envId || envs[0]?.id || ''
  if (!envs.some((e) => e.id === compareB) || compareB === compareA) {
    compareB = envs.find((e) => e.id !== compareA)?.id ?? ''
  }

  const picker = (which, value) =>
    el('select', {
      class: 'cmp-pick',
      'aria-label': which === 'a' ? 'First environment' : 'Second environment',
      onchange: (e) => {
        if (which === 'a') compareA = e.target.value
        else compareB = e.target.value
        openEnvironments('compare')
      }
    }, envs.map((x) => el('option', { value: x.id, text: x.name || 'Untitled', selected: x.id === value })))

  box.append(el('div', { class: 'cmp-head' }, [picker('a', compareA), el('span', { class: 'cmp-vs', text: 'against' }), picker('b', compareB)]))

  const a = envs.find((x) => x.id === compareA)
  const b = envs.find((x) => x.id === compareB)
  if (!a || !b) {
    box.append(el('p', { class: 'note', text: 'Two environments are needed to compare anything.' }))
    return box
  }

  const d = compareEnvs(a, b)
  const nothing = !d.onlyInA.length && !d.onlyInB.length && !d.differing.length
  if (nothing) {
    box.append(
      el('div', { class: 'find ok' }, [
        el('div', { class: 'find-bar' }),
        el('div', {}, [el('b', { text: 'The same, name for name' }), el('p', { text: `Both hold ${d.same.length} variable${d.same.length === 1 ? '' : 's'} with matching values.` })])
      ])
    )
    return box
  }

  const group = (title, why, rows) => {
    if (!rows.length) return
    box.append(el('div', { class: 'lbl', style: 'margin-top:14px' }, [el('span', { text: title }), el('em', { text: why })]))
    for (const r of rows) box.append(r)
  }

  group(
    `Only in ${a.name}`,
    'missing from the other one',
    d.onlyInA.map((name) =>
      el('div', { class: 'cmprow only-a' }, [
        el('code', { text: name }),
        el('span', { class: 'cmp-val', text: shortValue(a, name) }),
        el('span', { class: 'cmp-val none', text: 'not set' }),
        el('button', { class: 'tiny', type: 'button', text: `Copy to ${b.name}`, onclick: () => copyVar(a, b, name) })
      ])
    )
  )
  group(
    `Only in ${b.name}`,
    'missing from the other one',
    d.onlyInB.map((name) =>
      el('div', { class: 'cmprow only-b' }, [
        el('code', { text: name }),
        el('span', { class: 'cmp-val none', text: 'not set' }),
        el('span', { class: 'cmp-val', text: shortValue(b, name) }),
        el('button', { class: 'tiny', type: 'button', text: `Copy to ${a.name}`, onclick: () => copyVar(b, a, name) })
      ])
    )
  )
  group(
    'Different',
    'set in both, with different values',
    d.differing.map((x) =>
      el('div', { class: 'cmprow diff' }, [
        el('code', { text: x.name }),
        el('span', { class: 'cmp-val', text: x.secret ? x.a : cut(x.a) }),
        el('span', { class: 'cmp-val', text: x.secret ? x.b : cut(x.b) }),
        x.secret ? el('span', { class: 'stat', text: 'secret' }) : el('span', {})
      ])
    )
  )

  if (d.same.length) {
    box.append(
      el('p', { class: 'envfoot', style: 'margin-top:14px', text: `${d.same.length} more match on both sides.` })
    )
  }
  return box
}

const cut = (v) => (String(v).length > 30 ? `${String(v).slice(0, 27)}…` : String(v))

function shortValue(env, name) {
  if ((env.secrets ?? []).includes(name)) return String(env.values[name] ?? '') ? 'set' : 'not set'
  return cut(env.values[name] ?? '')
}

/** Copying a value across, except a secret — those are typed, never moved. */
function copyVar(from, to, name) {
  if ((from.secrets ?? []).includes(name)) {
    to.values[name] = ''
    to.secrets = [...new Set([...(to.secrets ?? []), name])]
    commit()
    toast('ok', `${name} added to ${to.name} as a secret — type its value there`)
  } else {
    to.values[name] = from.values[name]
    commit()
    toast('ok', `${name} copied to ${to.name}`)
  }
  openEnvironments('compare')
}

function newEnvironment() {
  const env = { id: uid('env'), name: 'New environment', values: {}, secrets: [] }
  S.environments.push(env)
  if (!S.envId) S.envId = env.id
  commit()
  openEnvironments(env.id)
}

/** The head: the name, edited where it is read, and what can be done to it. */
function envHead(env) {
  const inUse = env.id === S.envId
  const count = Object.keys(env.values ?? {}).length
  const users = allRequests().filter((r) => variablesUsed(r).some((v) => v in (env.values ?? {}))).length
  const risky = /prod|live|release/i.test(env.name)

  return el('div', { class: 'envhead' }, [
    el('div', { class: 'envhead-main' }, [
      el('span', { class: `envhead-dot${inUse ? ' on' : ''}${risky ? ' risky' : ''}` }),
      el('div', { class: 'envhead-words' }, [
        el('div', { class: 'envhead-title' }, [
          el('input', {
            class: 'envtitle',
            value: env.name,
            'aria-label': 'Environment name',
            spellcheck: 'false',
            'data-keep': 'env-title',
            oninput: (e) => {
              env.name = e.target.value
              paintBar()
              touch()
            },
            onchange: () => {
              commit()
              openEnvironments(env.id)
            }
          }),
          inUse
            ? el('span', { class: 'envbadge on', html: `${ico(I.check, 10, 2.8)}<span>Active</span>` })
            : el('span', { class: 'envbadge', text: 'Not active' }),
          risky ? el('span', { class: 'envbadge risky', html: `${ico(I.alert, 10, 2.4)}<span>Production</span>` }) : null
        ]),
        el('p', {
          class: 'envhead-sub',
          text: `${count} variable${count === 1 ? '' : 's'} · used by ${users} request${users === 1 ? '' : 's'} · ${
            inUse ? 'every request resolves {{name}} against this one' : `requests resolve against ${environment()?.name || 'nothing'} right now`
          }`
        })
      ])
    ]),
    el('div', { class: 'page-hero-acts' }, [
      inUse
        ? null
        : el('button', {
            class: 'btn go',
            type: 'button',
            html: `${ico(I.check, 11, 2.6)}<span>Make active</span>`,
            onclick: () => {
              S.envId = env.id
              commit()
              toast('ok', `Requests now resolve against ${env.name || 'that environment'}`)
              openEnvironments(env.id)
            }
          }),
      el('button', { class: 'btn', type: 'button', html: `${ico(I.copy, 12, 2)}<span>Duplicate</span>`, onclick: () => duplicateEnvironment(env) }),
      el('button', { class: 'btn bad', type: 'button', html: `${ico(I.bin, 12, 2)}<span>Delete</span>`, onclick: () => askDeleteEnvironment(env) })
    ])
  ])
}

function duplicateEnvironment(env) {
  const copy = {
    id: uid('env'),
    name: copyName(env.name, S.environments.map((e) => e.name)),
    values: { ...env.values },
    secrets: [...(env.secrets ?? [])]
  }
  S.environments.push(copy)
  commit()
  toast('ok', copy.name + ' — ' + Object.keys(copy.values).length + ' variables copied')
  openEnvironments(copy.id)
}

function askDeleteEnvironment(env) {
  const count = Object.keys(env.values ?? {}).length
  const goes = []
  if (count) goes.push(count + ' variable' + (count === 1 ? '' : 's'))
  if (env.id === S.envId) goes.push('the environment requests are currently resolved against')

  askDelete({
    kind: 'environment',
    subject: subjectGroup(I.globe, env.name || 'Untitled', count + ' variable' + (count === 1 ? '' : 's')),
    goes,
    breaks: envDependants(env),
    danger: 'Delete environment',
    back: () => openEnvironments(env.id),
    onYes: () => {
      S.environments = S.environments.filter((e) => e.id !== env.id)
      if (S.envId === env.id) S.envId = S.environments[0]?.id ?? ''
      commit()
      toast('ok', 'Deleted ' + (env.name || 'the environment'))
      openEnvironments(S.envId)
    }
  })
}

/**
 * Requests left without a value if this environment goes.
 *
 * Only names no other environment defines and nothing captures — otherwise
 * deleting a duplicate of Development would claim to break the workspace.
 */
function envDependants(env) {
  const elsewhere = new Set(
    S.environments.filter((e) => e.id !== env.id).flatMap((e) => Object.keys(e.values ?? {}))
  )
  const captured = capturedNames()
  const out = []

  for (const name of Object.keys(env.values ?? {})) {
    if (elsewhere.has(name) || captured.includes(name)) continue
    for (const req of allRequests()) {
      if (variablesUsed(req).includes(name)) out.push({ name: req.name, variable: name })
    }
  }
  return out
}

const capturedNames = () => [
  ...new Set(allRequests().flatMap((r) => (r.captures ?? []).map((c) => c.name).filter(Boolean)))
]

/* ------------------------------------------------------------ the panel */

function envPanel(env) {
  const box = el('div', { class: 'envpanel' })
  const used = [...new Set(allRequests().flatMap((r) => variablesUsed(r)))]
  const captured = capturedNames()
  const a = auditEnv(env, used, captured)
  const repaint = () => openEnvironments(env.id)

  if (/prod|live|release/i.test(env.name)) {
    box.append(
      el('div', { class: 'envwarn' }, [
        el('span', { class: 'envwarn-ico', html: ico(I.alert, 14, 2) }),
        el('p', {
          html: '<strong>This environment is named like production.</strong> Prism asks once before a run sends anything here, and every request really is sent.'
        })
      ])
    )
  }

  /* the health strip: how this environment lines up with the requests */
  const stat = (n, label, kind, title) =>
    el('div', { class: `envstat${kind ? ` ${kind}` : ''}${n ? '' : ' zero'}`, title }, [el('b', { text: String(n) }), el('span', { text: label })])
  box.append(
    el('div', { class: 'envstats' }, [
      stat(a.defined.length, a.defined.length === 1 ? 'Variable' : 'Variables', '', 'Defined in this environment'),
      stat(a.secrets.length, a.secrets.length === 1 ? 'Secret' : 'Secrets', 'lock', 'Hidden here, and never written to disk or into an export'),
      stat(a.missing.length, 'Missing', a.missing.length ? 'bad' : '', 'Referred to by a request, and provided by nothing'),
      stat(a.refill.length, 'To refill', a.refill.length ? 'bad' : '', 'A secret whose value was not saved'),
      stat(a.unused.length, 'Unused', a.unused.length ? 'quiet' : '', 'Defined here, referred to by nothing')
    ])
  )

  /* what needs doing, in one place */
  const issues = []
  for (const name of a.missing) {
    const who = allRequests().filter((r) => variablesUsed(r).includes(name))
    issues.push(
      el('div', { class: 'envissue bad' }, [
        el('span', { class: 'envissue-ico', html: ico(I.alert, 13, 2) }),
        el('div', { class: 'envissue-words' }, [
          el('b', {}, [el('code', { text: `{{${name}}}` }), document.createTextNode(' is not set anywhere')]),
          el('span', { title: who.map((r) => r.name).join('\n'), text: `Needed by ${who.length === 1 ? who[0].name : `${who.length} requests`}` })
        ]),
        el('button', { class: 'btn', type: 'button', text: 'Add here', onclick: () => {
          env.values[name] = ''
          commit()
          repaint()
        } })
      ])
    )
  }
  if (a.unmarked.length) {
    issues.push(
      el('div', { class: 'envissue warn' }, [
        el('span', { class: 'envissue-ico', html: ico(I.lock, 13, 2) }),
        el('div', { class: 'envissue-words' }, [
          el('b', {}, [
            el('code', { text: a.unmarked[0] }),
            document.createTextNode(a.unmarked.length > 1 ? ` and ${a.unmarked.length - 1} more read like credentials` : ' reads like a credential')
          ]),
          el('span', { text: 'Marking it secret keeps it out of exports and off this disk.' })
        ]),
        el('button', { class: 'btn', type: 'button', text: a.unmarked.length > 1 ? 'Mark all secret' : 'Mark secret', onclick: () => {
          env.secrets = [...new Set([...(env.secrets ?? []), ...a.unmarked])]
          commit()
          toast('ok', `${a.unmarked.length} marked secret`)
          repaint()
        } })
      ])
    )
  }
  if (a.refill.length) {
    issues.push(
      el('div', { class: 'envissue bad' }, [
        el('span', { class: 'envissue-ico', html: ico(I.unlock, 13, 2) }),
        el('div', { class: 'envissue-words' }, [
          el('b', { text: `${a.refill.length === 1 ? 'One secret is' : `${a.refill.length} secrets are`} empty: ${a.refill.slice(0, 3).join(', ')}${a.refill.length > 3 ? '…' : ''}` }),
          el('span', { html: 'Secret values are never saved, so a reopened workspace needs them typed again. In CI they come from <code>PRISM_&lt;NAME&gt;</code>.' })
        ])
      ])
    )
  }
  if (issues.length) {
    box.append(
      el('section', { class: 'ov-card envissues' }, [
        el('header', { class: 'ov-card-head' }, [
          el('h3', { text: 'Needs attention' }),
          el('span', { text: `${issues.length} thing${issues.length === 1 ? '' : 's'} to fix before every request can run` }),
          a.missing.length > 1
            ? el('button', { class: 'btn', type: 'button', text: `Add all ${a.missing.length}`, onclick: () => {
                for (const name of a.missing) env.values[name] = ''
                commit()
                repaint()
              } })
            : null
        ]),
        ...issues
      ])
    )
  }

  /* the variables */
  const all = Object.entries(env.values ?? {})
  const filter = el('input', {
    class: 'set-search',
    type: 'search',
    value: envFind,
    placeholder: 'Filter variables',
    'aria-label': 'Filter variables',
    spellcheck: 'false',
    // Filters the rows already on screen rather than redrawing the page, so
    // typing never loses the caret.
    oninput: (e) => {
      envFind = e.target.value
      const q = envFind.trim().toLowerCase()
      let shown = 0
      for (const row of box.querySelectorAll('.vrow')) {
        const hit = !q || row.dataset.find.includes(q)
        row.hidden = !hit
        if (hit) shown += 1
      }
      const none = box.querySelector('.vnone')
      if (none) none.hidden = shown > 0 || !all.length
    }
  })

  const card = el('section', { class: 'ov-card vcard' }, [
    el('header', { class: 'ov-card-head' }, [
      el('h3', { text: 'Variables' }),
      el('span', { text: 'Referred to in a request as {{name}}' }),
      el('label', { class: 'set-find vfind' }, [el('span', { html: ico(I.search, 13, 2) }), filter]),
      el('button', {
        class: `btn${envPasting ? ' on' : ''}`,
        type: 'button',
        html: `${ico(I.paste, 12, 1.9)}<span>${envPasting ? 'Cancel paste' : 'Paste .env'}</span>`,
        onclick: () => {
          envPasting = !envPasting
          repaint()
        }
      }),
      el('button', {
        class: 'btn go',
        type: 'button',
        html: `${ico(I.plus, 11, 2.4)}<span>Add variable</span>`,
        onclick: () => {
          env.values[freeName(env.values)] = ''
          envFind = ''
          commit()
          repaint()
          requestAnimationFrame(() => [...document.querySelectorAll('.page-environments .vname')].pop()?.select())
        }
      })
    ])
  ])
  if (envPasting) card.append(el('div', { class: 'vpaste' }, [pasteBox(env, repaint)]))

  if (!all.length) {
    card.append(
      el('div', { class: 'vempty' }, [
        el('span', { class: 'empty-ico', html: ico('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>', 18, 1.9) }),
        el('b', { text: 'No variables yet' }),
        el('span', { text: 'Add one, or paste a block of KEY=value lines from a .env file.' })
      ])
    )
  } else {
    card.append(
      el('div', { class: 'vhead' }, [
        el('span', { text: 'Name' }),
        el('span', { text: 'Value' }),
        el('span', { text: 'Used by' }),
        el('span', { class: 'vhead-r', text: '' })
      ])
    )
    for (const [key, value] of all) card.append(varRow(env, key, value, captured, repaint))
    card.append(el('p', { class: 'vnone', hidden: true, text: 'No variable matches that filter.' }))
  }
  box.append(card)

  box.append(
    el('p', {
      class: 'envfoot',
      html: `${ico(I.lock, 12, 2)}<span>Values are saved with the workspace, on this machine. A <strong>secret</strong> is not: its name is kept so a shared workspace says what to refill, and in CI it is supplied as <code>PRISM_&lt;NAME&gt;</code>.</span>`
    })
  )

  // A filter typed before a repaint still applies after it.
  if (envFind) requestAnimationFrame(() => filter.dispatchEvent(new Event('input')))
  return box
}

function varRow(env, key, value, captured, repaint) {
  const secret = (env.secrets ?? []).includes(key)
  const who = allRequests().filter((r) => variablesUsed(r).includes(key))
  const row = el('div', { class: 'vrow' + (who.length ? '' : ' idle') + (secret ? ' secret' : '') })
  row.dataset.find = `${key} ${secret ? '' : value}`.toLowerCase()

  row.append(
    el('input', {
      class: 'vname',
      value: key,
      'aria-label': 'Variable name',
      spellcheck: 'false',
      onchange: (e) => {
        const next = e.target.value.trim()
        if (!next || next === key) {
          e.target.value = key
          return
        }
        env.values = renameKey(env.values, key, next)
        if (secret) env.secrets = [...(env.secrets ?? []).filter((k) => k !== key), next]
        commit()
        repaint()
      }
    })
  )

  const val = el('input', {
    class: 'vval',
    value: String(value ?? ''),
    type: secret ? 'password' : 'text',
    placeholder: secret ? (String(value ?? '') === '' ? 'needs refilling' : 'not written to disk') : 'empty',
    'aria-label': 'Value of ' + key,
    spellcheck: 'false',
    oninput: (e) => {
      env.values[key] = e.target.value
      touch()
    },
    onchange: () => commit()
  })
  // A secret can be looked at, for a moment, without unmarking it.
  const peek = secret
    ? el('button', {
        class: 'lockbtn peek',
        type: 'button',
        title: 'Show the value',
        'aria-label': `Show the value of ${key}`,
        html: ico(I.eye, 12, 2),
        onclick: () => {
          val.type = val.type === 'password' ? 'text' : 'password'
        }
      })
    : null
  row.append(el('div', { class: 'vvalwrap' }, [val, peek]))

  row.append(
    who.length
      ? el('span', { class: 'vused', title: who.map((r) => r.name).join('\n') }, [
          el('i', { class: 'vused-dot' }),
          document.createTextNode(who.length === 1 ? who[0].name : `${who.length} requests`)
        ])
      : el('span', { class: 'vused none', text: captured.includes(key) ? 'captured instead' : 'not used' })
  )

  row.append(
    el('div', { class: 'vacts' }, [
      el('button', {
        class: 'lockbtn' + (secret ? ' on' : ''),
        type: 'button',
        title: secret ? 'Secret — never written to disk or an export' : 'Mark as a secret',
        'aria-pressed': String(secret),
        'aria-label': secret ? key + ' is secret' : 'Mark ' + key + ' as secret',
        html: ico(secret ? I.lock : I.unlock, 12, 2),
        onclick: () => {
          env.secrets = secret ? (env.secrets ?? []).filter((k) => k !== key) : [...(env.secrets ?? []), key]
          commit()
          repaint()
        }
      }),
      el('button', {
        class: 'x-btn',
        type: 'button',
        title: 'Remove',
        'aria-label': 'Remove ' + key,
        html: ico(I.bin, 12, 2),
        onclick: () => {
          delete env.values[key]
          env.secrets = (env.secrets ?? []).filter((k) => k !== key)
          commit()
          repaint()
        }
      })
    ])
  )
  return row
}

/**
 * Pasting a block.
 *
 * People arrive here from a terminal or a dashboard with twenty lines in the
 * clipboard, and adding them one field at a time is how an environment goes
 * stale. Anything the parser cannot read is listed rather than dropped.
 */
function pasteBox(env, repaint) {
  const box = el('div', { class: 'pastebox' })
  const area = el('textarea', {
    class: 'pastearea',
    rows: '6',
    spellcheck: 'false',
    placeholder: 'BASE_URL=https://api.example.test\nexport API_TOKEN=…\nTENANT: northwind',
    'aria-label': 'Variables to add'
  })
  const report = el('p', { class: 'pastenote' })

  const preview = () => {
    const { count, skipped } = parseDotEnv(area.value)
    report.replaceChildren(
      el('span', { text: count ? count + ' variable' + (count === 1 ? '' : 's') + ' ready' : 'Nothing readable yet' }),
      skipped.length
        ? el('span', {
            class: 'pasteskip',
            text: ' · ' + skipped.length + ' line' + (skipped.length === 1 ? '' : 's') + ' it cannot read: ' + skipped.slice(0, 2).join(', ')
          })
        : null
    )
  }
  area.oninput = preview
  preview()

  box.append(
    area,
    report,
    el('div', { class: 'envacts' }, [
      el('button', {
        class: 'btn go',
        type: 'button',
        text: 'Add them',
        onclick: () => {
          const { values, count, skipped } = parseDotEnv(area.value)
          if (!count) {
            toast('bad', 'Nothing in that block reads as a variable.')
            return
          }
          const replaced = Object.keys(values).filter((k) => k in env.values)
          Object.assign(env.values, values)
          // A pasted credential is marked on the way in rather than left for
          // someone to notice later: the name is usually the only clue there is.
          for (const name of Object.keys(values)) {
            if (looksSecret(name) && !(env.secrets ?? []).includes(name)) env.secrets = [...(env.secrets ?? []), name]
          }
          envPasting = false
          commit()
          toast(
            'ok',
            count + ' added' + (replaced.length ? ', ' + replaced.length + ' replaced' : '') + (skipped.length ? ', ' + skipped.length + ' skipped' : '')
          )
          repaint()
        }
      })
    ])
  )
  return box
}

/* ================================================================== pages

   Environments, History, Export, Settings and Help are places, not dialogs.
   They used to float over the workspace in a box three quarters of the window
   high, which is the size of a decision, not of work: renaming twenty
   variables or reading a page of help in it felt like doing it through a
   letterbox. Each now takes the whole space beside the rail, the rail says
   which one you are in, and Escape, the Collections icon or the back button
   returns to the plane exactly as it was. Dialogs still open on top. */

/** Which page is open, or '' for the workspace. */
let pageOpen = ''

/** Each page's mark, and the line under its name in the sidebar. */
const PAGE_META = {
  overview: {
    rail: 'railHome',
    icon: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    sub: () => `${allRequests().length} requests · ${allFlows().length} flows`
  },
  environments: {
    rail: 'envBtn',
    icon: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    sub: () => `${S.environments.length} environment${S.environments.length === 1 ? '' : 's'} · values for {{name}}`
  },
  history: {
    rail: 'historyBtn',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sub: () => `${S.history.length} run${S.history.length === 1 ? '' : 's'} kept`
  },
  export: {
    rail: 'railExport',
    icon: '<path d="M12 14V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M4 20h16"/>',
    sub: () => 'Code, tests and collections'
  },
  settings: {
    rail: 'settingsBtn',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.5V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1z"/>',
    sub: () => 'Preferences for this machine'
  },
  help: {
    rail: 'helpBtn',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4"/><path d="M12 17.4h.01"/>',
    sub: () => 'Guides and shortcuts'
  }
}

const PAGE_KIND = { Overview: 'overview', Environments: 'environments', History: 'history', Settings: 'settings', Help: 'help', Export: 'export' }

/** The sidebar's head: the page's mark, its name and a line of context. */
function pageNavHead(kind, title) {
  const meta = PAGE_META[kind]
  return el('div', { class: 'page-brand' }, [
    el('span', { class: 'page-mark', html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${meta?.icon ?? ''}</svg>` }),
    el('div', { class: 'page-brand-words' }, [el('h3', { text: title }), el('span', { text: meta?.sub() ?? '' })])
  ])
}

/**
 * Puts a page in the space beside the rail.
 *
 *   nav    the page's sidebar
 *   hero   its title, description and main actions, fixed above the content
 *   body   what scrolls
 *   trail  the section within the page, for the breadcrumb
 *
 * Opening the page that is already open updates it in place: same scroll
 * position, no entrance animation. Every switch in Settings and every option
 * in Export re-renders its page, and doing that by tearing the page down and
 * fading a new one in is what made the whole window blink on every click.
 */
function mountPage(kind, { nav, hero = null, body, trail = '' }) {
  const view = $('view')
  // A dialog or the palette left open would sit over a page it no longer
  // belongs to.
  if (sheetUp) closeSheet()
  closeMenu()

  const old = pageOpen === kind ? view.querySelector('.page') : null
  const kept = old
    ? {
        // A different section of the same page starts at its top; the same
        // section, re-rendered, stays where it was.
        body: old.dataset.trail === trail ? old.querySelector('.page-scroll')?.scrollTop ?? 0 : 0,
        nav: old.querySelector('.page-nav')?.scrollTop ?? 0,
        focus: document.activeElement?.dataset?.keep ?? ''
      }
    : null

  const top = el('header', { class: 'page-top' }, [
    el('nav', { class: 'page-crumbs', 'aria-label': 'Location' }, [
      el('button', { class: 'crumb-home', type: 'button', text: 'Workspace', onclick: closePage }),
      el('i', { text: '/' }),
      el('span', { text: Object.keys(PAGE_KIND).find((k) => PAGE_KIND[k] === kind) ?? kind }),
      trail ? el('i', { text: '/' }) : null,
      trail ? el('b', { text: trail }) : null
    ]),
    el('span', { class: 'pane-gap' }),
    el('button', { class: 'page-back', type: 'button', title: 'Back to the workspace (Esc)', onclick: closePage }, [
      el('span', { html: ico(I.chev, 12, 2.4) }),
      el('span', { text: 'Back to workspace' }),
      el('kbd', { text: 'Esc' })
    ])
  ])

  const scroll = el('div', { class: 'page-scroll' }, [el('div', { class: 'page-inner' }, [body])])
  const shell = el('div', { class: 'page' }, [nav, el('div', { class: 'page-main' }, [top, hero, scroll])])
  // Per-page refinements in the stylesheet hang off this.
  shell.classList.add(`page-${kind}`)
  shell.dataset.trail = trail
  if (old) shell.classList.add('steady')
  view.replaceChildren(shell)
  view.hidden = false
  $('stage').classList.add('paged')
  pageOpen = kind
  paintRail()

  if (kept) {
    scroll.scrollTop = kept.body
    nav.scrollTop = kept.nav
    if (kept.focus) shell.querySelector(`[data-keep="${kept.focus}"]`)?.focus()
  }
  return shell
}

/** The fixed head of a page: a title and a line under it, and its actions. */
function pageHero(title, blurb, actions = []) {
  return el('div', { class: 'page-hero' }, [
    el('div', { class: 'page-hero-words' }, [el('h2', { text: title }), blurb ? el('p', { text: blurb }) : null]),
    actions.length ? el('div', { class: 'page-hero-acts' }, actions) : null
  ])
}

/** Back to the plane, exactly as it was left. */
function closePage() {
  if (!pageOpen) return
  pageOpen = ''
  $('view').hidden = true
  $('view').replaceChildren()
  $('stage').classList.remove('paged')
  paintRail()
  // The plane had no size while hidden, so the wires are drawn again now it
  // has one.
  requestAnimationFrame(() => applyView())
}

/** Opens a page, or closes it if it is the one already open. */
function togglePage(kind, open) {
  if (pageOpen === kind) closePage()
  else open()
}

/** The rail marks the page you are in; Collections stands for the workspace. */
function paintRail() {
  const shown = !$('stage').classList.contains('tree-off')
  const home = $('railTree')
  home.classList.toggle('on', !pageOpen && shown)
  home.setAttribute('aria-pressed', String(!pageOpen && shown))
  for (const [kind, meta] of Object.entries(PAGE_META)) {
    const btn = $(meta.rail)
    if (!btn) continue
    btn.classList.toggle('on', pageOpen === kind)
    btn.setAttribute('aria-current', pageOpen === kind ? 'page' : 'false')
  }
}

/** The sidebar's list of sections, with an optional count on each. */
function pageNav(kind, title, sections, active, onPick, navFoot) {
  const nav = el('nav', { class: 'page-nav' }, [pageNavHead(kind, title)])
  const list = el('div', { class: 'page-sections' })
  for (const sec of sections) {
    list.append(
      el('button', {
        class: sec.id === active ? 'on' : '',
        type: 'button',
        'data-section': sec.id,
        'aria-current': sec.id === active ? 'page' : 'false',
        onclick: () => onPick(sec.id)
      }, [
        el('span', { class: 'page-ico', html: ico(sec.icon, 14, 1.9) }),
        el('span', { class: 'page-label', text: sec.label }),
        sec.badge !== undefined && sec.badge !== '' ? el('span', { class: `page-badge${sec.tone ? ` ${sec.tone}` : ''}`, text: String(sec.badge) }) : null
      ])
    )
  }
  nav.append(list)
  if (navFoot) nav.append(navFoot)
  nav.append(el('span', { class: 'spacer' }))
  nav.append(el('footer', { html: 'Prism 0.1.0<br />MIT licensed &middot; no account, no key' }))
  return nav
}

/**
 * A page made of sections, one shown at a time: Environments, History, Help
 * and the Overview. The section's title and actions sit in the fixed hero;
 * its content fills the width beneath.
 */
function page({ title, sections, active, onPick, navFoot }) {
  const kind = PAGE_KIND[title] ?? title.toLowerCase()
  const sec = sections.find((x) => x.id === active) ?? sections[0]
  const nav = pageNav(kind, title, sections, sec.id, onPick, navFoot)
  // A section may draw its own head — an environment's name is editable, and
  // a heading you cannot type into is the wrong control for it.
  const hero = sec.head ? el('div', { class: 'page-hero' }, [sec.head()]) : pageHero(sec.label, sec.blurb, sec.actions?.() ?? [])
  return mountPage(kind, { nav, hero, body: el('div', { class: 'page-body' }, [sec.render()]), trail: sec.label })
}

/* ================================================================ overview

   The workspace at a glance: how big it is, how its flows are doing, what
   ran last, and the ways in. Everything on it is a door to somewhere else in
   the app, so nothing here is a dead end. */

/** "4 min ago", for things that happened this session or recently. */
function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - Number(at || 0)) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function median(list) {
  if (!list.length) return 0
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** Goes back to the plane with one flow framed and its first request picked. */
function showFlow(flow) {
  closePage()
  if (flow.requests[0]) pick(flow.requests[0].id)
  requestAnimationFrame(() => focusFlow())
}

function openOverview() {
  const quick = el('div', { class: 'ov-quick' }, [
    el('h4', { class: 'nav-group', text: 'Quick actions' }),
    ...[
      [I.import, 'Import a collection', 'Postman, OpenAPI, HAR', () => doImport()],
      [I.terminal, 'Paste a cURL', 'Ctrl Shift V', () => pasteCurl()],
      [I.plus, 'New request', 'Ctrl N', () => {
        const flow = workingFlow()
        if (!flow) return newCollection()
        closePage()
        addRequest(flow)
      }],
      [I.folder, 'Open a workspace', 'Ctrl O', () => openWorkspace()]
    ].map(([icon, label, sub, run]) =>
      el('button', { type: 'button', onclick: run }, [
        el('span', { class: 'page-ico', html: ico(icon, 14, 1.9) }),
        el('span', { class: 'page-label' }, [el('span', { text: label }), el('small', { text: sub })])
      ])
    )
  ])

  page({
    title: 'Overview',
    sections: [{ id: 'overview', label: 'Workspace', icon: I.home, head: overviewHead, render: overviewPanel }],
    active: 'overview',
    onPick: () => openOverview(),
    navFoot: quick
  })
}

function overviewHead() {
  return el('div', { class: 'page-head-row' }, [
    el('div', {}, [
      el('h2', { text: S.savedName || 'Workspace' }),
      el('p', { text: S.filePath ? `Saved to ${S.filePath}` : 'Kept in the app. Save it to a file to commit it beside your code or share it.' })
    ]),
    el('div', { class: 'ov-head-acts' }, [
      el('button', { class: 'btn', type: 'button', text: S.filePath ? 'Save' : 'Save to a file', onclick: () => saveWorkspace() }),
      el('button', {
        class: 'btn go',
        type: 'button',
        html: `${ico(I.play, 10)}<span>Run every flow</span>`,
        disabled: !allFlows().some((f) => f.requests.length),
        onclick: () => runEveryFlow()
      })
    ])
  ])
}

/** Every flow, one after another, from the overview. */
async function runEveryFlow() {
  closePage()
  for (const flow of allFlows()) {
    if (!flow.requests.length) continue
    await runFlow(flow)
  }
}

function overviewPanel() {
  const box = el('div', { class: 'ov' })
  const requests = allRequests()
  const flows = allFlows()
  const ran = requests.map((r) => S.results.get(r.id)).filter(Boolean)
  const passed = ran.filter((r) => !r.error && !r.failed).length
  const times = S.history.map((h) => h.ms).filter((n) => n > 0)

  /* the numbers */
  const kpi = (value, label, sub, tone = '') =>
    el('div', { class: `ov-kpi${tone ? ` ${tone}` : ''}` }, [el('b', { text: value }), el('span', { text: label }), sub ? el('small', { text: sub }) : null])
  box.append(
    el('div', { class: 'ov-kpis' }, [
      kpi(String(requests.length), 'Requests', `${S.collections.length} collection${S.collections.length === 1 ? '' : 's'}`),
      kpi(String(flows.length), 'Flows', `${flows.filter((f) => f.requests.length).length} with requests`),
      kpi(ran.length ? `${Math.round((passed / ran.length) * 100)}%` : '—', 'Passing', ran.length ? `${passed} of ${ran.length} run` : 'Nothing run yet', !ran.length ? '' : passed === ran.length ? 'pass' : 'fail'),
      kpi(times.length ? `${median(times)} ms` : '—', 'Median time', times.length ? `over ${times.length} run${times.length === 1 ? '' : 's'}` : 'Send something to see it'),
      kpi(String(S.environments.length), 'Environments', environment() ? `${environment().name} in use` : 'None in use')
    ])
  )

  /* the flows */
  const flowCard = el('section', { class: 'ov-card' }, [
    el('header', { class: 'ov-card-head' }, [el('h3', { text: 'Flows' }), el('span', { text: 'How each one went the last time it ran' })])
  ])
  if (!flows.length) {
    flowCard.append(el('p', { class: 'ov-empty', text: 'No flows yet. Import a collection, or start a blank request.' }))
  }
  for (const col of S.collections) {
    for (const flow of col.flows) {
      const results = flow.requests.map((r) => S.results.get(r.id)).filter(Boolean)
      const ok = results.filter((r) => !r.error && !r.failed).length
      const state = !results.length ? 'idle' : ok === results.length ? 'pass' : 'fail'
      const avg = results.length ? Math.round(results.reduce((n, r) => n + (r.timing?.total ?? 0), 0) / results.length) : 0
      flowCard.append(
        el('div', { class: `ov-flow ${state}` }, [
          el('span', { class: 'lane-dot' }),
          el('div', { class: 'ov-flow-name' }, [el('b', { text: flow.name || 'Untitled flow' }), el('span', { text: col.name })]),
          el('span', { class: 'ov-flow-n', text: `${flow.requests.length} request${flow.requests.length === 1 ? '' : 's'}` }),
          el('div', { class: 'ov-flow-bar', title: results.length ? `${ok} of ${results.length} passing` : 'Not run yet' }, [
            el('span', { class: 'ok', style: `width:${results.length ? (ok / flow.requests.length) * 100 : 0}%` }),
            el('span', { class: 'bad', style: `width:${results.length ? ((results.length - ok) / flow.requests.length) * 100 : 0}%` })
          ]),
          el('span', { class: 'ov-flow-sum', text: results.length ? `${ok}/${results.length} passed${avg ? ` · ${avg} ms avg` : ''}` : 'Not run yet' }),
          el('button', { class: 'btn', type: 'button', text: 'Open', onclick: () => showFlow(flow) }),
          el('button', {
            class: 'btn go',
            type: 'button',
            html: `${ico(I.play, 9)}<span>Run</span>`,
            disabled: !flow.requests.length,
            onclick: () => {
              showFlow(flow)
              runFlow(flow)
            }
          })
        ])
      )
    }
  }

  /* what happened lately, and where it runs */
  const recent = el('section', { class: 'ov-card' }, [
    el('header', { class: 'ov-card-head' }, [el('h3', { text: 'Recent activity' }), el('span', { text: 'The last runs, newest first' })])
  ])
  if (!S.history.length) recent.append(el('p', { class: 'ov-empty', text: 'Nothing has run yet. Send a request, or run a flow, and it shows up here.' }))
  for (const h of S.history.slice(0, 8)) {
    recent.append(
      el('button', {
        class: 'ov-act',
        type: 'button',
        onclick: () => {
          if (!findRequest(h.requestId)) return
          closePage()
          pick(h.requestId)
          reveal(h.requestId)
        }
      }, [
        el('span', { class: `verb ${String(h.method).toLowerCase()}`, text: h.method }),
        el('span', { class: 'ov-act-name', text: h.name }),
        el('span', { class: `code ${tone(h.status)}`, text: h.status ? String(h.status) : 'ERR' }),
        el('span', { class: 'ov-act-ms', text: `${h.ms} ms` }),
        el('span', { class: 'ov-act-at', text: ago(h.at) })
      ])
    )
  }

  const envs = el('section', { class: 'ov-card' }, [
    el('header', { class: 'ov-card-head' }, [
      el('h3', { text: 'Environments' }),
      el('button', { class: 'btn', type: 'button', text: 'Manage', onclick: () => openEnvironments() })
    ])
  ])
  if (!S.environments.length) envs.append(el('p', { class: 'ov-empty', text: 'No environments. One holds the values that change between machines, like a base URL.' }))
  const envList = el('div', { class: 'ov-envs' })
  for (const env of S.environments) {
    envList.append(
      el('button', { class: `ov-env${env.id === S.envId ? ' on' : ''}`, type: 'button', onclick: () => openEnvironments(env.id) }, [
        el('span', { class: `env-dot${env.id === S.envId ? ' on' : ''}${/prod|live|release/i.test(env.name) ? ' risky' : ''}` }),
        el('b', { text: env.name }),
        el('span', { text: `${Object.keys(env.values ?? {}).length} variables` })
      ])
    )
  }
  envs.append(envList)

  box.append(flowCard, el('div', { class: 'ov-split' }, [recent, envs]))
  return box
}

/* =============================================================== settings */

let settingsAt = 'Appearance'

const SET_BLURB = {
  Appearance: 'How Prism looks, and how much each node tells you at a glance.',
  Sending: 'What happens when a request actually goes out.',
  Safety: 'Guards that are on by default. Turning one off says what it costs.',
  Network: 'Getting out of this network, and proving who Prism is.',
  Data: 'What Prism keeps, where it keeps it, and how to be rid of it.',
  About: 'What this is, and what it will not do.'
}

const SET_ICON = {
  Appearance: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  Sending: '<path d="M7 4v16l13-8z"/>',
  // Traffic passing through something on the way out, which is what both
  // halves of this group are about: a proxy, and the certificate that says
  // who is on the other end of it.
  Network: '<path d="M2 12h5M17 12h5"/><rect x="7" y="8.5" width="10" height="7" rx="2"/><path d="M10.5 12h3"/>',
  Safety: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/>',
  Data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>',
  About: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
}

/** What the settings search box holds, kept across the page's re-renders. */
let settingsQuery = ''

/**
 * Settings, as one scrolling page.
 *
 * Every group is on it, and the sidebar follows the scroll rather than
 * swapping the page: there are twenty-odd settings, which is one page's
 * worth, and a search box finds any of them by name or by what it does.
 * `section` jumps to a group; without it the page keeps its place, which is
 * what a re-render after flipping a switch wants.
 */
function openSettings(section) {
  if (section) settingsAt = section
  const groups = [...SET_GROUPS, 'About']
  const nav = pageNav(
    'settings',
    'Settings',
    groups.map((g) => ({ id: g, label: g, icon: SET_ICON[g] })),
    settingsAt,
    (id) => jumpToSetting(id)
  )

  const search = el('input', {
    class: 'set-search',
    type: 'search',
    placeholder: 'Search settings',
    value: settingsQuery,
    spellcheck: 'false',
    'aria-label': 'Search settings',
    'data-keep': 'set-search',
    oninput: (e) => {
      settingsQuery = e.target.value
      filterSettings()
    }
  })
  const hero = pageHero('Settings', 'Preferences for this machine. They are not part of the workspace, and are never shared with it.', [
    el('label', { class: 'set-find' }, [el('span', { html: ico(I.search, 14, 2) }), search])
  ])

  const body = el('div', { class: 'set-groups' }, [
    ...groups.map((g) =>
      el('section', { class: 'set-group', id: `set-${g}`, 'data-group': g }, [
        el('header', { class: 'set-group-head' }, [
          el('span', { class: 'page-ico', html: ico(SET_ICON[g], 15, 1.9) }),
          el('div', {}, [el('h3', { text: g }), el('p', { text: SET_BLURB[g] })])
        ]),
        g === 'About' ? aboutPanel() : settingsGroup(g)
      ])
    ),
    el('p', { class: 'set-none', hidden: true, text: 'No setting matches that. Try a word from what it does, like “proxy” or “timeout”.' })
  ])

  const shell = mountPage('settings', { nav, hero, body, trail: settingsAt })
  filterSettings()
  const scroll = shell.querySelector('.page-scroll')
  scroll.addEventListener('scroll', () => spySettings(scroll), { passive: true })
  if (section) jumpToSetting(section, false)
}

/** Scrolls a group into view and marks it in the sidebar. */
function jumpToSetting(group, smooth = true) {
  const scroll = document.querySelector('.page-settings .page-scroll')
  const target = document.getElementById(`set-${group}`)
  if (!scroll || !target) return
  settingsAt = group
  markSetting(group)
  scroll.scrollTo({ top: Math.max(0, target.offsetTop - 24), behavior: smooth ? 'smooth' : 'auto' })
}

/** The group nearest the top of the view is the one the sidebar marks. */
function spySettings(scroll) {
  let at = ''
  for (const sec of scroll.querySelectorAll('.set-group:not([hidden])')) {
    if (sec.offsetTop - scroll.scrollTop <= 90) at = sec.dataset.group
  }
  // At the very bottom the last group wins, even if it is too short to reach
  // the top of the view.
  if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) {
    at = [...scroll.querySelectorAll('.set-group:not([hidden])')].pop()?.dataset.group ?? at
  }
  if (at && at !== settingsAt) {
    settingsAt = at
    markSetting(at)
  }
}

function markSetting(group) {
  for (const b of document.querySelectorAll('.page-settings .page-sections button')) {
    const on = b.dataset.section === group
    b.classList.toggle('on', on)
    b.setAttribute('aria-current', on ? 'page' : 'false')
  }
  const crumb = document.querySelector('.page-settings .page-crumbs b')
  if (crumb) crumb.textContent = group
  // Scrolling is not changing section: a re-render must keep this place.
  const shell = document.querySelector('.page-settings')
  if (shell) shell.dataset.trail = group
}

/** Shows only the settings whose name or description matches the search. */
function filterSettings() {
  const q = settingsQuery.trim().toLowerCase()
  let any = false
  for (const sec of document.querySelectorAll('.page-settings .set-group')) {
    let shown = 0
    const rows = sec.querySelectorAll('.prefrow')
    for (const row of rows) {
      const hit = !q || row.textContent.toLowerCase().includes(q)
      row.hidden = !hit
      if (hit) shown += 1
    }
    // About has no rows to match; it is only shown with no search.
    sec.hidden = q ? shown === 0 : false
    if (!sec.hidden) any = true
  }
  const none = document.querySelector('.page-settings .set-none')
  if (none) none.hidden = any
}

function settingsGroup(group) {
  const box = el('div', { class: 'prefcard' })
  for (const item of SETTINGS.filter((x) => x.group === group)) box.append(settingRow(item, group))

  if (group === 'Data') {
    box.append(cookieRow(group))
    box.append(storedRow(group))
    box.append(
      el('div', { class: 'prefrow' }, [
        el('div', { class: 'prefwords' }, [
          el('b', { text: 'Run history' }),
          el('p', {
            text: `${S.history.length} run${S.history.length === 1 ? '' : 's'} kept with the workspace — timings and status codes only, never bodies or headers.`
          })
        ]),
        el('button', {
          class: 'btn',
          type: 'button',
          text: 'Clear',
          onclick: () => {
            S.history = []
            S.results.clear()
            S.previous.clear()
            commit()
            openSettings()
            toast('ok', 'History cleared')
          }
        })
      ])
    )
    box.append(
      el('div', { class: 'prefrow' }, [
        el('div', { class: 'prefwords' }, [
          el('b', { text: 'Preferences' }),
          el('p', { text: 'Put every setting back to its default.' })
        ]),
        el('button', {
          class: 'btn',
          type: 'button',
          text: 'Reset',
          onclick: () => {
            for (const item of SETTINGS) S.prefs[item.id] = item.value
            saveSettings(safeStorage(), S.prefs)
            applyTheme()
            commit()
            openSettings()
            toast('ok', 'Settings reset')
          }
        })
      ])
    )
  }
  return box
}

/**
 * The cookie jar, in the open.
 *
 * A jar that silently attaches credentials to outgoing requests is the sort of
 * thing that should be inspectable, so this lists what is held and by which
 * host, and lets any of it go.
 */
function cookieRow(group) {
  const row = el('div', { class: 'prefrow' }, [
    el('div', { class: 'prefwords' }, [el('b', { text: 'Cookies' }), el('p', { text: 'Reading the jar…' })])
  ])

  window.prism.cookies.list().then((all) => {
    const hosts = [...new Set(all.map((c) => c.domain))]
    row.replaceChildren(
      el('div', { class: 'prefwords' }, [
        el('b', { text: 'Cookies' }),
        el('p', {
          text: all.length
            ? `${all.length} held for ${hosts.length} host${hosts.length === 1 ? '' : 's'}: ${hosts.slice(0, 3).join(', ')}${hosts.length > 3 ? `, and ${hosts.length - 3} more` : ''}. Kept in memory only.`
            : 'None held. A Set-Cookie from a response is remembered here and sent back to the same host, which is what lets a session-based API be chained.'
        })
      ]),
      all.length
        ? el('button', {
            class: 'btn',
            type: 'button',
            text: 'Clear',
            onclick: async () => {
              await window.prism.cookies.clear()
              openSettings()
              toast('ok', 'Cookie jar emptied')
            }
          })
        : el('span', { class: 'stat', text: 'empty' })
    )
  })
  return row
}

/** Where the autosave lives, and how to be rid of it. */
function storedRow(group) {
  const row = el('div', { class: 'prefrow' }, [
    el('div', { class: 'prefwords' }, [el('b', { text: 'Saved workspace' }), el('p', { text: 'Looking…' })])
  ])

  window.prism.workspace.restore().then((found) => {
    row.replaceChildren(
      el('div', { class: 'prefwords' }, [
        el('b', { text: 'Saved workspace' }),
        el('p', {
          text: found?.path
            ? `Collections, environments, node positions and baselines are kept at ${found.path}. Secret values are not written to it.`
            : 'Nothing saved yet. Your work is written here as you go, so it comes back next time.'
        })
      ]),
      found?.path
        ? el('button', {
            class: 'btn',
            type: 'button',
            text: 'Forget',
            onclick: () =>
              askDelete({
                kind: 'saved workspace',
                subject: subjectGroup(I.folder, 'workspace.json', found.path),
                goes: ['every baseline frozen so far', 'the position of every node on the plane'],
                // Nothing depends on the file the way a request depends on a
                // captured token, but the surprise is worth naming.
                breaks: [],
                danger: 'Delete it',
                onYes: async () => {
                  await window.prism.workspace.forget()
                  openSettings()
                  toast(
                    'ok',
                    S.prefs.autosave === false
                      ? 'Saved workspace deleted'
                      : 'Deleted — and written again on your next change, unless you turn off “Remember my work”'
                  )
                }
              })
          })
        : el('span', { class: 'stat', text: 'none' })
    )
  })
  return row
}

function settingRow(item, group) {
  const value = S.prefs[item.id]
  const control = el('div', { class: 'prefctl' })

  if (item.kind === 'choice') {
    const seg = el('div', { class: 'seg' })
    for (const opt of item.options) {
      seg.append(
        el('button', {
          class: `segbtn${value === opt.id ? ' on' : ''}`,
          type: 'button',
          text: opt.label,
          onclick: () => {
            setPref(item.id, opt.id)
            if (item.id === 'theme') applyTheme()
            openSettings()
          }
        })
      )
    }
    control.append(seg)
  } else if (item.kind === 'toggle') {
    control.append(
      el(
        'button',
        {
          class: `switch${value ? ' on' : ''}${item.danger && !value ? ' warn' : ''}`,
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(value)),
          'aria-label': item.label,
          onclick: () => {
            setPref(item.id, !value)
            commit()
            openSettings()
          }
        },
        [el('i')]
      )
    )
  } else if (item.kind === 'text' || item.kind === 'secret') {
    control.append(
      el('input', {
        class: 'preftext',
        type: item.kind === 'secret' ? 'password' : 'text',
        value: String(value ?? ''),
        placeholder: item.placeholder ?? '',
        spellcheck: 'false',
        'aria-label': item.label,
        oninput: (e) => {
          // Not through setPref on every keystroke: that repaints the page and
          // takes the caret with it.
          S.prefs[item.id] = e.target.value
        },
        onchange: (e) => setPref(item.id, e.target.value)
      })
    )
  } else {
    control.append(
      el('input', {
        class: 'prefnum',
        type: 'number',
        value: String(value),
        min: String(item.min ?? 0),
        max: String(item.max ?? 999999),
        'aria-label': item.label,
        onchange: (e) => {
          setPref(item.id, Math.min(item.max ?? Infinity, Math.max(item.min ?? 0, Number(e.target.value) || item.value)))
          openSettings()
        }
      })
    )
    if (item.unit) control.append(el('span', { class: 'prefunit', text: item.unit }))
  }

  return el('div', { class: `prefrow${item.danger && value === false ? ' alert' : ''}` }, [
    el('div', { class: 'prefwords' }, [
      el('b', { text: item.label }),
      el('p', { text: item.help }),
      // Named so the claim that a setting does something is checkable rather
      // than something the reader has to take on trust.
      el('code', { text: item.wiredIn })
    ]),
    control
  ])
}

function aboutPanel() {
  const tile = (icon, title, text) =>
    el('div', { class: 'about-tile' }, [el('span', { class: 'empty-ico', html: ico(icon, 16, 1.9) }), el('b', { text: title }), el('span', { text })])
  const never = (text) => el('li', {}, [el('span', { class: 'about-x', html: ico(I.x, 10, 2.6) }), el('span', { html: text })])

  return el('div', { class: 'about' }, [
    /* who this is */
    el('section', { class: 'about-id' }, [
      el('span', { class: 'about-mark', html: '<svg viewBox="0 0 28 28" width="34" height="34"><path d="M14 5 L23 20 H5 Z" fill="none" stroke="url(#spectrum)" stroke-width="1.9" stroke-linejoin="round" /><path d="M1 14 H10" stroke="var(--ink-3)" stroke-width="1.5" stroke-linecap="round" /><path d="M17.5 15.5 H27" stroke="var(--cyan)" stroke-width="1.3" stroke-linecap="round" /><path d="M18.5 18 H27" stroke="var(--indigo)" stroke-width="1.3" stroke-linecap="round" /><path d="M19.5 20.5 H27" stroke="var(--magenta)" stroke-width="1.3" stroke-linecap="round" /></svg>' }),
      el('div', { class: 'about-words' }, [
        el('div', { class: 'about-name' }, [el('b', { text: 'Prism' }), el('span', { class: 'envbadge', text: 'Version 0.1.0' })]),
        el('p', { text: 'API testing as flows. Build requests, chain the values one captures into the next, assert on every response, and run the whole sequence here or in CI.' })
      ])
    ]),

    /* what it stands on */
    el('div', { class: 'about-tiles' }, [
      tile(I.folder, 'Local first', 'Your work is saved on this machine and in the .prism.json files you choose. Nothing is uploaded.'),
      tile(I.lock, 'Secrets stay secret', 'A secret variable is never written to disk or into an export. In CI it comes from PRISM_<NAME>.'),
      tile(I.check, 'No account', 'No sign-in, no licence key, no feature held back. Everything it does, it does for everyone.'),
      tile(I.terminal, 'Runs in CI', 'prism-run executes the same workspace file headless, with JUnit, JSON or text output.')
    ]),

    /* the promises, stated as limits */
    el('section', { class: 'ov-card about-card' }, [
      el('header', { class: 'ov-card-head' }, [el('h3', { text: 'What Prism will not do' }), el('span', { text: 'Limits kept on purpose' })]),
      el('ul', { class: 'about-never' }, [
        never('Put a credential in an export. A <code>{{token}}</code> comes out as an environment-variable lookup in every code target.'),
        never('Send a request to an environment named like production without asking first.'),
        never('Run a Postman pre-request or test script. Scripts are read for their assertions and never executed.'),
        never('Phone home. There is no telemetry and no update check; the only network traffic is the requests you send.')
      ])
    ]),

    el('section', { class: 'ov-card about-card' }, [
      el('header', { class: 'ov-card-head' }, [el('h3', { text: 'Licence' }), el('span', { text: 'MIT — free to use, change and share' })]),
      el('p', { class: 'about-fine', text: 'Prism is open source under the MIT licence. Settings live in this app’s storage on this machine; your workspace lives wherever you save it.' })
    ])
  ])
}

/* =================================================================== help */

let helpAt = 'start'

const HELP = [
  {
    id: 'start',
    label: 'Getting started',
    icon: '<path d="M12 3 21 19H3Z"/>',
    blurb: 'The shortest path from a file to a passing test.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('h4', { text: 'Bring something in' }),
        el('p', {
          html: '<strong>Import</strong> in the bar — or dropping the file anywhere on the window — reads a Postman collection (v2.0 or v2.1), a Postman environment, an OpenAPI 3 or Swagger 2 document, a browser <strong>HAR</strong> export, and a Prism workspace of its own. Everything arrives as a <strong>collection</strong>, with its folders as flows.'
        }),
        el('p', {
          html: 'Or start from nothing: <strong>Ctrl&nbsp;N</strong> adds a blank request to the flow you are in, and right-clicking empty space on the plane puts one where you clicked.'
        }),
        el('div', {
          class: 'callout',
          html: 'Requests imported from a HAR start with assertions proposed from the response the browser saw — its status, content type, a field that was present and a generous time budget — so there is something to pass or fail from the first run.'
        }),
        el('p', {
          html: 'An OpenAPI import turns each <em>tag</em> into a flow, fills rows from the examples and enums in the document, and builds a body from the schema. The body is at zero values — empty strings, zeros — rather than plausible-looking ones, because a request that ships an invented email address to a real API is worse than an obviously blank one.'
        }),
        el('h4', { text: 'Or paste one request' }),
        el('p', {
          html:
            '<strong>Ctrl&nbsp;Shift&nbsp;V</strong> takes a <code>curl</code> command from the clipboard and turns it into a request — the method, the query, the headers, the body, and an <code>Authorization</code> header becomes the auth block rather than a literal token. Copy-as-cURL from a browser network tab is how most requests start life.'
        }),
        el('p', {
          html:
            'A <strong>HAR</strong> file is the same gesture for a whole session. Prism drops the fonts, scripts and images, folds the same call made forty times back into one, keeps the request that succeeded over the 401 that provoked the login, and turns the host they share into <code>{{base_url}}</code>. A live token in the capture is replaced by the variable, never imported.'
        }),
        el('h4', { text: 'Send it' }),
        el('p', {
          html: 'Pick a node, then <strong>Send</strong> in the workbench — or the play button on the node. <strong>Run flow</strong> sends every request in the flow in order, so a value captured by one is available to the next.'
        })
      ])
  },
  {
    id: 'structure',
    label: 'Collections & flows',
    icon: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    blurb: 'Three levels, because that is what the files actually are.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'A <strong>collection</strong> holds <strong>flows</strong>, and a flow holds <strong>requests</strong>. A Postman folder becomes a flow; the collection keeps its own identity, so you can tell where a request came from and re-export it as the shape you opened.'
        }),
        el('h4', { text: 'Adding and deleting' }),
        el('ul', {}, [
          el('li', { html: 'The <strong>+</strong> beside &ldquo;Collections&rdquo; makes a new one.' }),
          el('li', { html: 'The <strong>+</strong> on a collection row adds a flow; on a flow row it adds a request.' }),
          el('li', {
            html: 'The bin on any row deletes it, after a dialog that says what goes with it — deleting a flow takes its requests.'
          })
        ]),
        el('div', {
          class: 'callout warn',
          html: 'None of it is undoable, and Prism holds your work in memory only. Export anything you want to keep.'
        })
      ])
  },
  {
    id: 'plane',
    label: 'The plane',
    icon: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/>',
    blurb: 'How to read a node, and what the beams mean.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'A node is a <strong>label, not an editor</strong>. Everything changeable is in the workbench on the right; the node carries what you need to read the graph, which is why it stays one size and stays legible zoomed out.'
        }),
        el('h4', { text: 'What is on a node' }),
        el('ul', {}, [
          el('li', { html: 'The <strong>method</strong>, as a colour down the left edge and a label.' }),
          el('li', {
            html: 'The <strong>endpoint</strong>, with a <code>{{base_url}}</code> prefix dimmed so the path reads first.'
          }),
          el('li', {
            html: 'A <strong>spec strip</strong>: how it authenticates, whether it carries a body and of what kind, how many query, path and header rows ride along, and the host when that is a literal.'
          }),
          el('li', { html: '<strong>Needs</strong> down the left and <strong>gives</strong> down the right.' }),
          el('li', {
            html: 'The <strong>last result</strong> — status, time and the assertion score — or <em>Not run</em> until it has been sent.'
          })
        ]),
        el('h4', { text: 'Ports and beams' }),
        el('p', {}, [
          el('span', { class: 'swatch', html: '<i style="border:1.5px solid var(--cyan)"></i>needs a variable' }),
          el('span', { class: 'swatch', html: '<i style="background:var(--magenta)"></i>gives a variable' })
        ]),
        el('p', {
          html: 'A need turns <strong>red</strong> when nothing provides it — no request captures it and no environment sets it. That is the most common reason a chain fails, and it is visible before you send anything.'
        }),
        el('p', {
          html: 'A <strong>beam</strong> is drawn wherever one request captures a value another uses. Beams are derived, never stored: you make the connection by capturing a value and spending it, which is the same act as making the test work.'
        }),
        el('h4', { text: 'Moving around' }),
        el('dl', { class: 'keys' }, [
          el('dt', { text: 'mouse wheel' }),
          el('dd', { text: 'Zoom around the pointer. Settings → Appearance can make it pan instead.' }),
          el('dt', { text: 'Shift wheel' }),
          el('dd', { text: 'Pan sideways.' }),
          el('dt', { text: 'two fingers' }),
          el('dd', { text: 'On a trackpad, pan. A pinch zooms.' }),
          el('dt', { text: 'Ctrl wheel' }),
          el('dd', { text: 'Zoom around the pointer, whatever the setting.' }),
          el('dt', { text: 'drag background' }),
          el('dd', { text: 'Pan.' }),
          el('dt', { text: 'Space drag' }),
          el('dd', { text: 'Pan from anywhere, over a node included.' }),
          el('dt', { text: 'middle drag' }),
          el('dd', { text: 'The same, for a mouse with a wheel button.' }),
          el('dt', { text: 'drag a node' }),
          el('dd', { text: 'Move it. It then stays where you put it.' }),
          el('dt', { text: 'double-click' }),
          el('dd', { text: 'Open a node and put the caret in its endpoint.' }),
          el('dt', { text: 'right-click' }),
          el('dd', { text: 'A node’s actions, or — on empty space — new request, run, zoom and tidy.' })
        ]),
        el('p', {
          html: '<strong>Fit</strong> frames everything; <strong>Tidy</strong> lays the nodes back out in order and forgets any you moved.'
        })
      ])
  },
  {
    id: 'environments',
    label: 'Environments',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
    blurb: 'The values that change between machines.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html:
            'An environment is a set of values a request refers to as <code>{{name}}</code> — a base URL, a tenant, a login. The same request then works against your laptop and against staging, and switching between them is one click rather than an edit.'
        }),
        el('h4', { text: 'Selected is not in use' }),
        el('p', {
          html:
            'Clicking a name in the rail opens it for editing and changes nothing else. <strong>Use this one</strong> is what switches the workspace, and the one it is switched to says <strong>In use</strong>. Reading an environment should never rearm the thing that sends requests at a server.'
        }),
        el('h4', { text: 'What the counts mean' }),
        el('ul', {}, [
          el('li', { html: '<strong>missing</strong> — a request asks for it and nothing provides it. A captured value does not count as missing; the chain supplies it at run time.' }),
          el('li', { html: '<strong>unused</strong> — defined here and mentioned by no request. Usually left over from an import.' }),
          el('li', { html: '<strong>shadowed</strong> — set here and also captured. The captured value wins, which is worth knowing before you change this one and see no difference.' }),
          el('li', { html: '<strong>to refill</strong> — a secret whose value was never saved. See below.' })
        ]),
        el('h4', { text: 'Secrets' }),
        el('p', {
          html:
            'Marking a variable <strong>secret</strong> hides it in its field and keeps its value out of every export <em>and</em> out of the saved workspace. The name is kept, so reopening tells you exactly what to type again, and a workspace shared with a colleague never carried your token in the first place.'
        }),
        el('div', {
          class: 'callout',
          html: 'A pasted block marks anything that reads like a credential — <code>token</code>, <code>api_key</code>, <code>password</code> — as secret on the way in. The name is usually the only clue available, and asking afterwards is asking too late.'
        }),
        el('p', {
          html: 'In a CI run the value comes from the process environment as <code>PRISM_&lt;NAME&gt;</code>, so <code>PRISM_API_KEY</code> fills <code>{{api_key}}</code> without it ever being committed.'
        }),
        el('h4', { text: 'Built in, always available' }),
        el('p', {
          html:
            '<code>{{$uuid}}</code>, <code>{{$timestamp}}</code>, <code>{{$isoTimestamp}}</code>, <code>{{$randomInt}}</code>, <code>{{$randomAlpha}}</code> and <code>{{$randomEmail}}</code> need no environment. Each is generated fresh every time it appears, so two in one body are two different values.'
        })
      ])
  },
  {
    id: 'running',
    label: 'Running a flow',
    icon: '<path d="M6 4v16"/><path d="M6 8h7a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H6"/><circle cx="18" cy="6" r="2"/>',
    blurb: 'The graph is the plan, not decoration.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html:
            'The plane draws an edge from the request that captures a value to the ones that spend it. <strong>Run flow</strong> follows those edges: dependencies first, and anything genuinely independent at the same time.'
        }),
        el('p', {
          html:
            'So a request placed above the one that provides its token still runs after it. That used to be a 401 with nothing wrong on the server — the runner went down the list, and the list was in the order somebody happened to add things.'
        }),
        el('h4', { text: 'Stages' }),
        el('p', {
          html:
            'The run sheet groups the flow into stages. Everything in a stage goes at once, because nothing in it waits on anything else in it — twelve requests where eight are independent finish in three stages rather than twelve steps, and the toast says how much that saved.'
        }),
        el('div', {
          class: 'callout',
          html: 'A flow where two requests each wait for something the other produces has no valid order, so Prism refuses to run it and names the loop. Any order it picked would be a guess presented as a result.'
        }),
        el('h4', { text: 'Running one thing ten times' }),
        el('p', {
          html:
            'A test that passes nine times out of ten is the expensive kind of broken: the failure gets re-run until it passes, and after a while nobody reads the result. <strong>Run it ten times</strong> in a request&rsquo;s menu sends the same request in sequence and says whether the outcome was stable. A 4xx or 5xx counts as a failure even with nothing asserting on it.'
        })
      ])
  },
  {
    id: 'auth',
    label: 'Auth & inheritance',
    icon: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    blurb: 'Set once, above, instead of forty times.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html:
            'A collection and a flow can each set auth and headers, and a request set to <strong>Inherit</strong> — the default — picks up the nearest one. Forty requests each carrying their own copy of the same token is how a collection rots: the fortieth never gets updated.'
        }),
        el('p', {
          html:
            'The nearest setting wins, the way it does in every config file: a request beats its flow, a flow beats its collection. <strong>No auth</strong> is a decision rather than an absence — it stops the search, which is what a login endpoint needs when it must not carry the token it is about to fetch.'
        }),
        el('p', {
          html: 'Inherited headers are shown on the request, greyed, with the level they came from. <strong>Override</strong> copies one down as the request&rsquo;s own; editing it in place would either fork it silently or change every other request without saying so.'
        }),
        el('h4', { text: 'OAuth 2' }),
        el('p', {
          html:
            'The <strong>OAuth 2.0</strong> kind fetches a token rather than holding one you pasted. Client credentials, password and refresh-token grants; the token is fetched before a send when it is missing or within thirty seconds of expiring, and refreshed rather than re-fetched where the server issued a refresh token.'
        }),
        el('div', {
          class: 'callout',
          html: 'The token lives in memory for the session. It is never written to the workspace, an export, or this disk — and neither is the client secret.'
        })
      ])
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    icon: '<circle cx="12" cy="4" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><path d="M12 6 5 17M12 6l7 11M6 18h12"/>',
    blurb: 'One endpoint, and the request in the body.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html:
            'Set the body kind to <strong>GraphQL</strong> and the query and its variables become two fields. The envelope the server wants — <code>query</code>, <code>variables</code>, <code>operationName</code> — is assembled at send time, and the operation name is read out of the query rather than typed twice.'
        }),
        el('p', {
          html: 'A <code>$name</code> in the query is GraphQL&rsquo;s own variable and comes from the Variables block. <code>{{name}}</code> is Prism&rsquo;s, and comes from the environment — it works in either field.'
        }),
        el('h4', { text: 'Errors arrive inside a 200' }),
        el('p', {
          html:
            'This is the failure a REST-shaped tool misses: the status assertion passes, the body says the query was rejected, and the suite is green. Prism reads <code>errors</code> out of the response and says so on the Result tab, with the server&rsquo;s own message and the line it points at.'
        }),
        el('h4', { text: 'What the endpoint can do' }),
        el('p', {
          html:
            '<strong>Fetch the schema</strong> runs an introspection query through the same sender — same auth, same proxy, same certificate — and lists the queries and mutations. Picking one writes a runnable stub into the query field.'
        })
      ])
  },
  {
    id: 'chain',
    label: 'Chaining',
    icon: '<path d="M9 15 15 9"/><path d="M11 6.5 13 4.5a4 4 0 0 1 6 6l-2 2"/><path d="M13 17.5 11 19.5a4 4 0 0 1-6-6l2-2"/>',
    blurb: 'Carrying a value from one request to the next.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'On the <strong>Chain</strong> tab, give a value a name and say where to find it — a JSON path in the body, or a header. When the request runs, that value lands in the current environment under the name.'
        }),
        el('p', {
          html: 'Any later request that writes <code>{{that_name}}</code> — in its URL, a parameter, a header, the body or the auth block — picks it up. Nobody copies anything.'
        }),
        el('h4', { text: 'Paths' }),
        el('p', {
          html: '<code>data.token</code>, <code>data.items[0].id</code> and <code>data.items.0.id</code> all work. A path that is not there yields nothing rather than an error.'
        }),
        el('div', {
          class: 'callout',
          html: 'Chained values are written into the environment, so they appear on the Environments page and last until you switch environment or close Prism.'
        })
      ])
  },
  {
    id: 'tests',
    label: 'Assertions',
    icon: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    blurb: 'Every subject, and the operators it takes.',
    body: () => {
      const doc = el('div', { class: 'doc' })
      doc.append(
        el('p', {
          html: 'An assertion is a <strong>subject</strong> and an <strong>operator</strong>, so either half can change without picking a different assertion from a list. Every result says what it actually saw — a red row that will not tell you what it found is a row people delete.'
        })
      )
      for (const subject of SUBJECTS) {
        const ops = (OPERATORS[subject.id] ?? []).map((o) => OP_LABEL[o] ?? o).join(', ')
        doc.append(el('h4', { text: subject.label }))
        doc.append(el('p', { html: `<code>${esc(ops)}</code>` }))
      }
      doc.append(
        el('div', {
          class: 'callout',
          html: 'Comparisons are loose where it helps: <code>"200"</code> typed into a text box matches the number <code>200</code>.'
        })
      )
      return doc
    }
  },
  {
    id: 'export',
    label: 'Export',
    icon: '<path d="M12 14V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M4 20h16"/>',
    blurb: 'Fifteen targets, and the one rule about credentials.',
    body: () => {
      const doc = el('div', { class: 'doc' })
      doc.append(
        el('div', {
          class: 'callout',
          html: '<strong>No credential is ever resolved into an export.</strong> A <code>{{token}}</code> comes out as a read of an environment variable, in every target. Exported files get committed, pasted into tickets and shown on screen shares.'
        })
      )
      for (const group of GROUPS) {
        const items = TARGETS.filter((t) => t.group === group)
        if (!items.length) continue
        doc.append(el('h4', { text: group }))
        doc.append(el('ul', {}, items.map((t) => el('li', { html: `${esc(t.label)} &mdash; <code>.${esc(t.ext)}</code>` }))))
      }
      doc.append(
        el('p', {
          html: 'The Postman export declares variable <em>names</em> with empty values for the same reason: writing a live token into a collection file is exactly the leak the rule exists to prevent.'
        })
      )
      return doc
    }
  },
  {
    id: 'automation',
    label: 'Baselines, data & CI',
    icon: '<path d="M4 17V7M4 7l6 4 4-6 6 8"/><path d="M4 20h16"/>',
    blurb: 'Running the same flow again, and again, and in CI.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('h4', { text: 'Baselines' }),
        el('p', {
          html: 'The <strong>Diff</strong> tab compares against the previous run, which answers <em>did anything change since I last pressed Send</em>. <strong>Drift</strong> answers the more useful one: <strong>Freeze</strong> a response and every later run is checked against the shape you agreed on.'
        }),
        el('p', {
          html: 'Findings are grouped by how much they should worry you. A field that vanished or changed type breaks whoever consumes it; a new field almost never does; a changed value is usually just the data being data. Baselines are saved with the workspace, so a drift is reviewable in a pull request.'
        }),
        el('h4', { text: 'Running a table of inputs' }),
        el('p', {
          html: 'The <strong>Data</strong> tab takes a CSV or a JSON array, dropped on it or chosen from disk. The request is sent once per row, with each column shadowing the environment for that send only — so <code>{{email}}</code> in the body picks up the email column. Rows run in order, not at once: a table often walks one resource through several states, and firing them together makes the outcome depend on which finished first.'
        }),
        el('p', { html: 'Prism names any column the request never mentions, which is usually a stale export or a typo.' }),
        el('h4', { text: 'On the command line' }),
        el('p', {
          html: '<strong>Save workspace</strong> writes a <code>.prism.json</code> you can commit beside your code, and <code>prism-run</code> runs that same file:'
        }),
        el('pre', { class: 'src' }, [
          el('span', { class: 'ln', text: 'prism-run checkout.prism.json --env CI --reporter junit --out results.xml' })
        ]),
        el('p', {
          html: 'It exits 0 when every assertion passed and 1 when any did not, which is the only thing a CI runner reads. Chaining, cookies, datasets and assertions behave exactly as they do here, because it is the same code under the same tests.'
        }),
        el('div', {
          class: 'callout',
          html: 'A <strong>secret</strong> is never written to a workspace file — only its name. In CI supply it as <code>PRISM_&lt;NAME&gt;</code> in the environment, where it is never committed: <code>PRISM_PASSWORD</code> fills <code>{{password}}</code>.'
        }),
        el('h4', { text: 'Cookies' }),
        el('p', {
          html: 'A <code>Set-Cookie</code> is remembered and sent back to the same host, respecting domain, path, Secure and expiry — without which a session-based API cannot be chained at all. The jar is in memory only; Settings &rarr; Data lists what it holds and empties it.'
        })
      ])
  },
  {
    id: 'saving',
    label: 'Saving',
    icon: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    blurb: 'Two different things, and the difference matters.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('h4', { text: 'Your work comes back on its own' }),
        el('p', {
          html: 'Everything on screen is written to the app&rsquo;s own directory a few seconds after you stop typing, and restored the next time Prism opens. You do not have to do anything for this, and there is nothing to lose by closing the window. Settings &rarr; Data says where that file is and can delete it.'
        }),
        el('p', {
          html: 'The file you were editing comes back with it. Reopen Prism and the same <code>.prism.json</code> is still the open document, so <kbd>Ctrl S</kbd> writes straight back to it. If you had changes that were never saved, the dot beside the name says so rather than pretending the file is current.'
        }),
        el('h4', { text: 'A file you can keep' }),
        el('p', {
          html: 'The <strong>Save</strong> button in the bar writes a <code>.prism.json</code> you own — commit it beside your code, send it to somebody, keep it in a folder per project. The first press asks where; every press after that writes back to the same file, like any other document.'
        }),
        el('p', {
          html: 'The button says which file you are editing, and the dot beside it says whether that file is current: <strong>filled amber</strong> means there are changes it does not have yet, <strong>filled green</strong> means it is up to date, and <strong>hollow</strong> means this workspace has never been saved to a file at all. The arrow beside it opens Save as, Open, Show in folder, and Discard changes and reload.'
        }),
        el('h4', { text: 'What a saved file does not contain' }),
        el('p', {
          html: 'The <em>value</em> of any variable marked <strong>secret</strong> is left out, and so are response bodies. The names are kept, so opening a shared workspace tells whoever opened it what to fill in. That is what makes the file safe to commit.'
        })
      ])
  },
  {
    id: 'keys',
    label: 'Shortcuts',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
    blurb: 'Everything reachable without the mouse.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('dl', { class: 'keys' }, [
          el('dt', { text: 'Ctrl K' }),
          el('dd', { text: 'Find a request, or run a command' }),
          el('dt', { text: 'Ctrl Enter' }),
          el('dd', { text: 'Send the request in the workbench' }),
          el('dt', { text: 'Enter' }),
          el('dd', { text: 'From the endpoint field, send' }),
          el('dt', { text: 'Ctrl Shift V' }),
          el('dd', { text: 'Turn a cURL command in the clipboard into a request' }),
          el('dt', { text: 'Ctrl N' }),
          el('dd', { text: 'New request in the current flow' }),
          el('dt', { text: 'Ctrl D' }),
          el('dd', { text: 'Duplicate the picked request' }),
          el('dt', { text: 'Delete' }),
          el('dd', { text: 'Delete the picked request, after asking' }),
          el('dt', { text: 'F2' }),
          el('dd', { text: 'Rename the picked request' }),
          el('dt', { text: 'Up / Down' }),
          el('dd', { text: 'On the plane or the tree, pick the previous or next request' }),
          el('dt', { text: 'Ctrl = / Ctrl −' }),
          el('dd', { text: 'Zoom the plane in or out' }),
          el('dt', { text: 'Ctrl 0' }),
          el('dd', { text: 'Zoom the plane to 100%' }),
          el('dt', { text: 'Shift 1' }),
          el('dd', { text: 'Fit everything on screen' }),
          el('dt', { text: 'Ctrl S' }),
          el('dd', { text: 'Save — writes back to the open file, and asks where only the first time' }),
          el('dt', { text: 'Ctrl Shift S' }),
          el('dd', { text: 'Save as — write a new file' }),
          el('dt', { text: 'Ctrl O' }),
          el('dd', { text: 'Open a saved workspace' }),
          el('dt', { text: 'Ctrl F' }),
          el('dd', { text: 'Filter the request tree' }),
          el('dt', { text: 'Drop' }),
          el('dd', { text: 'A collection on the window, a table on the Data tab' }),
          el('dt', { text: 'F1' }),
          el('dd', { text: 'Open this help' }),
          el('dt', { text: 'Escape' }),
          el('dd', { text: 'Close whatever is open' }),
          el('dt', { text: 'Up / Down' }),
          el('dd', { text: 'On the split handle, resize the workbench' })
        ]),
        el('p', {
          html: 'The palette also reaches Settings, Help, Environments, History, Import, Export, Run flow and Tidy — anything in the bar has an entry there.'
        })
      ])
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    blurb: 'Where your data goes, which is nowhere.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('h4', { text: 'What leaves this machine' }),
        el('p', {
          html: 'Only the requests you send, to the hosts you aim them at. Prism has no telemetry, no account, no update check and no network use of its own.'
        }),
        el('h4', { text: 'What is stored' }),
        el('ul', {}, [
          el('li', { html: 'The settings on the Settings page, in the app&rsquo;s own local storage.' }),
          el('li', {
            html: 'Collections, environments, node positions and baselines, in a file in the app&rsquo;s own directory — so your work comes back next time. Settings &rarr; Data says exactly where, and deletes it.'
          }),
          el('li', {
            html: 'How long each run took and whether it passed, so the trend and the flaky list survive a restart. Measurements only — no response body, no headers, no URL.'
          }),
          el('li', {
            html: 'Response bodies, cookies and OAuth tokens in memory only, gone when Prism closes.'
          })
        ]),
        el('h4', { text: 'What is never written' }),
        el('p', {
          html: 'The <em>value</em> of a variable marked <strong>secret</strong>, in the autosave or in a saved <code>.prism.json</code>. The name survives, so opening a shared workspace tells you what to refill; in CI the value is supplied as <code>PRISM_&lt;NAME&gt;</code> in the environment and is never committed.'
        }),
        el('h4', { text: 'Credentials' }),
        el('ul', {}, [
          el('li', { html: 'Never resolved into an export, in any target.' }),
          el('li', {
            html: 'Masked in the inspector&rsquo;s request headers, unless you turn that off in Settings &rarr; Safety.'
          }),
          el('li', {
            html: 'A variable marked <strong>secret</strong> on the Environments page is hidden in its field, never written to disk, and left out of every export.'
          })
        ]),
        el('div', {
          class: 'callout warn',
          html: 'Response bodies are shown exactly as they arrive. If an API returns a token, Prism displays it — and Insights points that out.'
        })
      ])
  }
]

function openHelp(section) {
  if (section) helpAt = section
  page({
    title: 'Help',
    sections: HELP.map((h) => ({ ...h, render: () => helpArticle(h) })),
    active: helpAt,
    onPick: (id) => openHelp(id)
  })
}

/**
 * A help section as an article: the text in a reading column, and beside it
 * a list of its headings that jumps to each, the way documentation reads.
 */
function helpArticle(h) {
  const doc = h.body()
  const heads = [...doc.querySelectorAll('h4')]
  heads.forEach((head, i) => (head.id = `help-${h.id}-${i}`))
  const at = HELP.findIndex((x) => x.id === h.id)
  const next = HELP[at + 1]
  const prev = HELP[at - 1]
  const article = el('article', { class: 'help-article' }, [
    doc,
    el('nav', { class: 'help-pager', 'aria-label': 'More help' }, [
      prev ? el('button', { class: 'help-step', type: 'button', onclick: () => openHelp(prev.id) }, [el('small', { text: 'Previous' }), el('b', { text: prev.label })]) : el('span'),
      next ? el('button', { class: 'help-step next', type: 'button', onclick: () => openHelp(next.id) }, [el('small', { text: 'Next' }), el('b', { text: next.label })]) : el('span')
    ])
  ])
  const toc = el('aside', { class: 'help-toc' }, [el('h4', { text: 'On this page' })])
  for (const head of heads) {
    toc.append(
      el('button', { type: 'button', text: head.textContent, onclick: () => {
        const scroll = document.querySelector('.page-help .page-scroll')
        scroll?.scrollTo({ top: head.offsetTop - 20, behavior: 'smooth' })
      } })
    )
  }
  return el('div', { class: 'help-layout' }, [article, heads.length ? toc : null])
}

/* ================================================================ history */

/**
 * History.
 *
 * Grouped by request rather than laid out as one long list of times. What
 * people come here for is "did this get slower" or "when did this start
 * failing", and both are questions about one endpoint over several runs — a
 * flat reverse-chronological list buries that under everything else that ran
 * in between.
 */
let historyOf = ''

/**
 * A sparkline of the last runs.
 *
 * Drawn rather than described because the shape is the point: a step change
 * three runs ago reads instantly and takes a paragraph to write down. A failed
 * run is marked, so a slow run and a broken one are never confused.
 */
function sparkline(points, width = 168, height = 34) {
  if (points.length < 2) return null
  const top = Math.max(...points.map((p) => p.ms), 1)
  const x = (i) => (i / (points.length - 1)) * (width - 4) + 2
  const y = (ms) => height - 3 - (ms / top) * (height - 8)

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.ms).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`
  const marks = points
    .map((p, i) => (p.failed ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.ms).toFixed(1)}" r="2.4" class="bad"/>` : ''))
    .join('')

  const svg = el('span', { class: 'spark' })
  svg.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
      <path class="fill" d="${area}"/>
      <path class="line" d="${line}"/>
      ${marks}
    </svg>`
  return svg
}

/** The trend strip above a request's runs. */
function trendStrip(runs) {
  const sum = summarise(runs)
  if (!sum.runs) return null

  const box = el('div', { class: 'trend' })
  const points = spark(runs, 30)
  const chart = sparkline(points)
  if (chart) box.append(chart)

  const stats = el('div', { class: 'trendstats' })
  const stat = (label, value, cls = '') => stats.append(el('span', { class: `tstat ${cls}` }, [el('b', { text: value }), el('span', { text: label })]))
  stat('runs', String(sum.runs))
  stat('median', `${sum.median}ms`)
  stat('slowest', `${sum.slowest}ms`)
  if (sum.failures) stat('failed', String(sum.failures), 'bad')
  box.append(stats)

  const said = headline(sum)
  if (said) box.append(el('span', { class: `verdict ${sum.verdict === 'slower' || sum.failures ? 'bad' : 'ok'}`, text: said }))
  return box
}

/** Which runs the History table shows: every one, the failures, or the slow. */
let historyFilter = 'all'

/**
 * History, as an activity dashboard.
 *
 * "All runs" first: the numbers that matter across the workspace, a timeline
 * of every run drawn as bars, and a table to find any one of them. Then the
 * flaky ones, then each request on its own with the same view scoped to it.
 */
function openHistory() {
  const byRequest = new Map()
  for (const h of S.history) {
    if (!byRequest.has(h.requestId)) byRequest.set(h.requestId, [])
    byRequest.get(h.requestId).push(h)
  }

  const clock = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  const sections = [
    {
      id: 'all',
      label: 'All runs',
      icon: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4M12 15V8M16 15v-6"/>',
      badge: S.history.length || '',
      blurb: S.history.length ? `Every run in this workspace, newest first. ${S.history.length} kept.` : 'Every run of every request appears here.',
      actions: () => historyActions(),
      render: () => (S.history.length ? historyDashboard(S.history, true) : historyEmpty())
    }
  ]

  const unstable = flakyRuns(S.history)
  if (unstable.length) {
    // High in the list, because a test that fails one run in four is the most
    // expensive thing here and the easiest never to notice.
    sections.push({
      id: 'flaky',
      label: 'Flaky',
      icon: '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 17h.01"/>',
      badge: unstable.length,
      tone: 'bad',
      blurb: 'Requests that have both passed and failed, sorted by how often they fail.',
      render: () => flakyPanel(unstable)
    })
  }

  for (const [id, runs] of byRequest) {
    const failing = runs.filter((r) => r.failed || r.status >= 400 || !r.status).length
    sections.push({
      id,
      label: runs[0].name || 'Untitled',
      icon: failing ? '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>' : clock,
      badge: runs.length,
      tone: failing ? 'bad' : '',
      blurb: `${runs.length} run${runs.length === 1 ? '' : 's'} · ${runs[0].method} ${findRequest(id) ? shortPath(findRequest(id).url) : ''}`,
      actions: () => [
        findRequest(id)
          ? el('button', { class: 'btn', type: 'button', text: 'Open request', onclick: () => {
              closePage()
              pick(id)
              reveal(id)
            } })
          : null,
        findRequest(id)
          ? el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 10)}<span>Send again</span>`, onclick: () => send(findRequest(id)) })
          : null
      ].filter(Boolean),
      render: () => historyDashboard(runs, false)
    })
  }

  if (!sections.some((s) => s.id === historyOf)) historyOf = 'all'
  page({ title: 'History', sections, active: historyOf, onPick: (id) => {
    historyOf = id
    historyFilter = 'all'
    openHistory()
  } })
}

function historyEmpty() {
  return el('div', { class: 'hist-empty' }, [
    el('span', { class: 'empty-ico', html: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 20, 1.8) }),
    el('b', { text: 'No runs yet' }),
    el('p', { text: 'Send a request or run a flow and every run lands here — its status and timing, never its body or headers — saved with the workspace so trends outlive the session.' }),
    el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 10)}<span>Run the current flow</span>`, onclick: () => {
      closePage()
      runFlow()
    } })
  ])
}

function historyActions() {
  if (!S.history.length) return []
  return [
    el('button', { class: 'btn', type: 'button', text: 'Clear history', onclick: async () => {
      const yes = await ask({ title: 'Clear the run history?', blurb: `All ${S.history.length} runs are removed from this workspace. Requests and their tests are not touched.`, danger: 'Clear history', note: 'This cannot be undone.' })
      if (!yes) return
      S.history = []
      commit()
      openHistory()
      toast('ok', 'History cleared')
    } })
  ]
}

const p95 = (times) => {
  if (!times.length) return 0
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

const runFailed = (h) => Boolean(h.failed) || !h.status || h.status >= 400

/** The numbers, the timeline and the table, for any set of runs. */
function historyDashboard(runs, showName) {
  const box = el('div', { class: 'hist' })
  const times = runs.map((r) => r.ms).filter((n) => n >= 0)
  const failed = runs.filter(runFailed).length
  const rate = runs.length ? Math.round(((runs.length - failed) / runs.length) * 100) : 0

  const kpi = (value, label, sub, tone = '') =>
    el('div', { class: `ov-kpi${tone ? ` ${tone}` : ''}` }, [el('b', { text: value }), el('span', { text: label }), sub ? el('small', { text: sub }) : null])
  box.append(
    el('div', { class: 'ov-kpis hist-kpis' }, [
      kpi(String(runs.length), 'Runs', showName ? `${new Set(runs.map((r) => r.requestId)).size} requests` : 'of this request'),
      kpi(`${rate}%`, 'Passing', `${runs.length - failed} passed · ${failed} failed`, failed ? 'fail' : 'pass'),
      kpi(`${median(times)} ms`, 'Median', 'half of runs were faster'),
      kpi(`${p95(times)} ms`, 'p95', '1 in 20 runs is slower', p95(times) > 1000 ? 'fail' : ''),
      kpi(`${Math.max(0, ...times)} ms`, 'Slowest', runs.length ? ago(runs.reduce((a, b) => (b.ms > a.ms ? b : a)).at) : '')
    ])
  )

  // The timeline: one bar per run, oldest on the left, height is time and
  // colour is outcome. "Is this getting slower" and "when did it start
  // failing" are both answered by its shape, and by nothing else on screen.
  box.append(
    el('section', { class: 'ov-card' }, [
      el('header', { class: 'ov-card-head' }, [
        el('h3', { text: 'Timeline' }),
        el('span', { text: `Last ${Math.min(runs.length, 80)} runs, oldest on the left` }),
        el('span', { class: 'hist-legend' }, [el('i', { class: 'pass' }), document.createTextNode('passed'), el('i', { class: 'fail' }), document.createTextNode('failed')])
      ]),
      runChart(runs.slice(0, 80).reverse())
    ])
  )

  /* the table, with a filter */
  const slowMark = p95(times)
  const shown = runs.filter((r) => (historyFilter === 'failed' ? runFailed(r) : historyFilter === 'slow' ? r.ms >= slowMark && r.ms > 0 : true))
  const chip = (id, label, n) =>
    el('button', { class: `chipbtn${historyFilter === id ? ' on' : ''}`, type: 'button', onclick: () => {
      historyFilter = id
      openHistory()
    } }, [el('span', { text: label }), el('b', { text: String(n) })])
  const slowest = Math.max(1, ...times)
  const table = el('section', { class: 'ov-card' }, [
    el('header', { class: 'ov-card-head' }, [
      el('h3', { text: 'Runs' }),
      el('span', { text: 'Newest first. Click one to open its request.' }),
      el('div', { class: 'hist-filter' }, [
        chip('all', 'All', runs.length),
        chip('failed', 'Failed', failed),
        chip('slow', 'Slowest 5%', runs.filter((r) => r.ms >= slowMark && r.ms > 0).length)
      ])
    ]),
    el('div', { class: `run-head${showName ? ' named' : ''}` }, [
      el('span', { text: 'When' }),
      showName ? el('span', { text: 'Request' }) : null,
      el('span', { text: 'Status' }),
      el('span', { text: 'Duration' }),
      el('span', { text: '' }),
      el('span', { text: 'Environment' })
    ])
  ])
  if (!shown.length) table.append(el('p', { class: 'ov-empty', text: 'No runs match that filter.' }))
  for (const h of shown.slice(0, 200)) {
    table.append(
      el('button', { class: `run-row${showName ? ' named' : ''}${runFailed(h) ? ' bad' : ''}`, type: 'button', title: new Date(h.at).toLocaleString(), onclick: () => {
        if (!findRequest(h.requestId)) return
        closePage()
        pick(h.requestId)
        reveal(h.requestId)
      } }, [
        el('span', { class: 'when', text: `${new Date(h.at).toLocaleTimeString()} · ${ago(h.at)}` }),
        showName ? el('span', { class: 'run-name' }, [el('span', { class: `verb ${String(h.method).toLowerCase()}`, text: h.method }), el('b', { text: h.name })]) : null,
        el('span', {}, [el('span', { class: `code ${tone(h.status)}`, text: String(h.status || 'ERR') })]),
        el('span', { class: 'run-ms', text: `${h.ms} ms` }),
        // A bar rather than only a number: the point of a list of runs is the
        // shape of it, and numbers in a column do not have one.
        el('span', { class: 'run-bar' }, [el('span', { class: `run-fill${runFailed(h) ? ' bad' : h.ms >= slowMark ? ' slow' : ''}`, style: `width:${Math.max(2, (h.ms / slowest) * 100)}%` })]),
        el('span', { class: 'run-env', text: h.env })
      ])
    )
  }
  box.append(table)
  return box
}

/** One bar per run: height is its time, colour is its outcome. */
function runChart(runs) {
  const W = 1000
  const H = 160
  const top = Math.max(1, ...runs.map((r) => r.ms))
  // A round number at the top of the scale, so the guide lines read cleanly.
  const step = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => s * 4 >= top) ?? Math.ceil(top / 4)
  const max = step * 4
  // Each run gets an equal slot across the whole width, so a handful of runs
  // fills the chart rather than huddling at its left edge.
  // The right-hand strip is the scale's, so no bar sits under a label.
  const plot = W - 64
  const slot = plot / Math.max(1, runs.length)
  const bw = Math.max(2, Math.min(56, slot * 0.68))
  const guides = [1, 2, 3, 4]
    .map((i) => {
      const y = H - (i * step * H) / max
      return `<line class="rc-guide" x1="0" x2="${W}" y1="${y}" y2="${y}"/><text class="rc-label" x="${W - 4}" y="${y + 12}">${i * step} ms</text>`
    })
    .join('')
  const bars = runs
    .map((r, i) => {
      const h = Math.max(2, (r.ms / max) * H)
      const x = i * slot + (slot - bw) / 2
      const label = `${r.name} — ${r.status || 'error'} in ${r.ms} ms, ${new Date(r.at).toLocaleTimeString()}`
      return `<rect class="rc-bar ${runFailed(r) ? 'fail' : 'pass'}" x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="2"><title>${esc(label)}</title></rect>`
    })
    .join('')
  const holder = el('div', { class: 'run-chart' })
  holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Run times, oldest first">${guides}${bars}</svg>`
  return holder
}

/**
 * The requests that cannot make up their mind.
 *
 * A test that fails one run in four is worse than one that always fails: the
 * failure gets re-run until it passes, and after a while nobody reads the
 * result at all.
 */
function flakyPanel(list) {
  const box = el('div')
  box.append(
    el('p', {
      class: 'note',
      text: 'These have both passed and failed. Sorted by how often they fail, because that is how much attention each deserves.'
    })
  )
  for (const x of list) {
    box.append(
      el('button', { class: 'flakyrow', type: 'button', onclick: () => {
        historyOf = x.requestId
        openHistory()
      } }, [
        el('span', { class: 'flakyrate', text: `${x.rate}%` }),
        el('div', {}, [
          el('b', { text: x.name || 'Untitled' }),
          el('span', { text: `${x.pass} passed, ${x.fail} failed` })
        ]),
        el('span', { class: 'pane-gap' }),
        el('span', { class: 'stat', text: 'see the runs' })
      ])
    )
  }
  return box
}


/* ============================================================== flow run */

/**
 * Running a flow.
 *
 * The plan comes from the graph, not from the order of the list. The canvas has
 * always drawn an edge from the request that captures a value to the ones that
 * spend it; until now the runner ignored those edges and went top to bottom, so
 * the picture said "independent" while the runner enforced an order, and a
 * request placed above its own provider sent an unresolved {{token}} and failed
 * with a 401 that had nothing to do with the server.
 *
 * Everything in a stage runs at once because nothing in it waits on anything
 * else in it. That is the whole point of drawing the graph.
 */
async function runFlow(only) {
  const req = current()
  // Guarded rather than trusted: this is wired to a click handler, which calls
  // it with the Event, and an Event has no `requests` — the button ran nothing
  // and said "Running undefined" for exactly as long as nobody looked.
  const given = Array.isArray(only?.requests) ? only : null
  const flow = given ?? (req ? flowOf(req.id) : null) ?? allFlows().find((f) => f.requests.length)
  if (!flow) {
    toast('bad', 'There is no flow to run.')
    return
  }

  const known = Object.keys(envValues())
  const p = plan(flow.requests, known)

  if (p.cycles.length) {
    // Refusing is the honest answer: there is no order that satisfies the
    // dependencies, so any order Prism picked would be a guess dressed up as
    // a result.
    sheet({
      title: `${flow.name} cannot run`,
      blurb: 'These requests each wait for a value another of them produces, so there is no order that works.',
      body: el('div', { class: 'doc' }, [
        el('ul', {}, p.cycles.map((r) => el('li', { text: r.name || 'Untitled' }))),
        el('p', { text: 'Break the loop by removing one of the captures, or by setting that value in the environment instead.' })
      ]),
      acts: []
    })
    return
  }

  const flat = p.stages.flat()
  if (!(await productionOk(`every request in ${flow.name} (${flat.length})`))) return
  const state = new Map(flat.map((r) => [r.id, { id: r.id, name: r.name, status: 'wait', ms: 0, code: 0 }]))
  const body = el('div', { class: 'suite' })
  const ring = el('div', { class: 'ring' })
  const steps = el('div', { class: 'steps' })

  const paint = () => {
    const all = [...state.values()]
    const done = all.filter((s) => s.status === 'pass' || s.status === 'fail').length
    const failed = all.filter((s) => s.status === 'fail').length
    const pct = all.length ? done / all.length : 0
    const C = 2 * Math.PI * 58
    ring.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140">
        <circle class="tr" cx="70" cy="70" r="58"></circle>
        <circle class="fl${failed ? ' bad' : ''}" cx="70" cy="70" r="58" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"></circle>
      </svg><b>${Math.round(pct * 100)}%</b>`

    steps.replaceChildren()
    p.stages.forEach((stage, i) => {
      // Only worth labelling when there is something to say: a flow that is
      // one long chain looks exactly as it always did.
      if (!p.sequential) {
        steps.append(
          el('div', { class: 'stage-lbl' }, [
            el('span', { text: `Stage ${i + 1}` }),
            el('em', { text: stage.length === 1 ? 'on its own' : `${stage.length} at once` })
          ])
        )
      }
      for (const r of stage) {
        const x = state.get(r.id)
        steps.append(
          el('div', { class: `step${x.status === 'wait' ? ' wait' : ''}` }, [
            el('span', { class: `state ${x.status === 'run' ? 'busy' : x.status === 'wait' ? '' : x.status}` }),
            el('span', { class: 'nm', text: x.name }),
            x.code ? el('span', { class: `code ${tone(x.code)}`, text: String(x.code) }) : null,
            el('span', { class: 'ms', text: x.ms ? `${x.ms}ms` : x.status })
          ])
        )
      }
    })
    body.replaceChildren(ring, steps)
  }

  paint()
  sheet({
    title: `Running ${flow.name}`,
    blurb: describePlan(p) + (p.unresolved.length ? ` · ${p.unresolved.length} value${p.unresolved.length === 1 ? '' : 's'} nothing provides` : ''),
    body,
    acts: []
  })

  const started = Date.now()
  for (const stage of p.stages) {
    await Promise.all(
      stage.map(async (r) => {
        const x = state.get(r.id)
        x.status = 'run'
        paint()
        await send(r, { confirmed: true, quiet: true })
        const res = S.results.get(r.id)
        x.ms = res?.timing?.total ?? 0
        x.code = res?.status ?? 0
        x.status = res?.failed || res?.error ? 'fail' : 'pass'
        paint()
      })
    )
  }

  const all = [...state.values()]
  const failed = all.filter((s) => s.status === 'fail').length
  const wall = Date.now() - started
  const serial = all.reduce((n, x) => n + x.ms, 0)
  // Only mentioned when the parallelism actually bought something, so the
  // claim is never larger than the saving.
  const saved = !p.sequential && serial > wall + 100 ? `, ${Math.round(serial - wall)}ms saved by running in parallel` : ''
  toast(failed ? 'bad' : 'ok', `${flow.name} — ${all.length - failed} passed, ${failed} failed${saved}`)
}

/** Every flow in a collection, one flow after another. */
async function runCollection(col) {
  for (const flow of col.flows) {
    if (flow.requests.length) await runFlow(flow)
  }
}

/**
 * The same request, several times over.
 *
 * The only way to see a flaky test is to run it more than once: by definition
 * it passes some of the time, so a single green run says nothing. Same request,
 * same inputs, in sequence — any difference in outcome is the thing being
 * measured rather than a change in the test.
 */
async function repeatRequest(req, times = 10) {
  if (!(await productionOk(`${req.name}, ${times} times,`))) return
  const results = []
  const body = el('div', { class: 'suite' })
  const ring = el('div', { class: 'ring' })
  const steps = el('div', { class: 'steps' })

  const paint = () => {
    const pct = results.length / times
    const failed = results.filter((r) => r.failed || r.error).length
    const C = 2 * Math.PI * 58
    ring.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140">
        <circle class="tr" cx="70" cy="70" r="58"></circle>
        <circle class="fl${failed ? ' bad' : ''}" cx="70" cy="70" r="58" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"></circle>
      </svg><b>${Math.round(pct * 100)}%</b>`

    steps.replaceChildren()
    results.forEach((r, i) => {
      steps.append(
        el('div', { class: 'step' }, [
          el('span', { class: `state ${r.failed || r.error ? 'fail' : 'pass'}` }),
          el('span', { class: 'nm', text: `Run ${i + 1}` }),
          r.status ? el('span', { class: `code ${tone(r.status)}`, text: String(r.status) }) : null,
          el('span', { class: 'ms', text: r.error ? 'no answer' : `${r.timing?.total ?? 0}ms` })
        ])
      )
    })
    if (results.length === times) steps.append(repeatVerdictPanel(results))
    body.replaceChildren(ring, steps)
  }

  paint()
  sheet({
    title: `${req.name} × ${times}`,
    blurb: 'The same request, in sequence. A test that passes nine times out of ten is the expensive kind of broken.',
    body,
    acts: []
  })

  for (let i = 0; i < times; i += 1) {
    results.push(await sendOnce(req, envValues()))
    paint()
  }

  const v = repeatVerdict(results)
  toast(v.flaky ? 'bad' : 'ok', v.flaky ? `Flaky: ${v.failed} of ${v.runs} runs failed` : `${v.runs} runs, all the same`)
}

function repeatVerdictPanel(results) {
  const v = repeatVerdict(results)
  const box = el('div', { class: `find ${v.flaky ? 'bad' : 'ok'}` })
  box.append(el('div', { class: 'find-bar' }))

  const words = el('div')
  if (v.flaky) {
    words.append(el('b', { text: `Flaky — ${v.failed} of ${v.runs} runs failed` }))
    words.append(el('p', { text: `Same request, same inputs, ${v.statuses.length > 1 ? `statuses ${v.statuses.join(' and ')}` : 'and a different outcome'}. Something on the other side is not deterministic.` }))
  } else if (v.failed) {
    words.append(el('b', { text: `Failed every time` }))
    words.append(el('p', { text: 'Consistently broken is at least consistent: this is a real failure, not a flake.' }))
  } else {
    words.append(el('b', { text: `${v.runs} runs, all passed` }))
    words.append(el('p', { text: `Median ${v.median}ms, slowest ${v.slowest}ms.` }))
  }
  box.append(words)
  return box
}

/* ================================================================= sheets */

let sheetUp = false

let onSheetClose = null

function sheet({ title, blurb, body, acts, onClose }) {
  const veil = $('veil')
  veil.replaceChildren()
  veil.hidden = false
  sheetUp = true
  onSheetClose = onClose ?? null

  const low = el('div', { class: 'sheet-low' }, [
    el('button', { class: 'btn plain', type: 'button', text: 'Close', onclick: closeSheet }),
    el('span', { class: 'spacer' })
  ])
  for (const a of acts ?? []) {
    low.append(
      el('button', { class: `btn${a.go ? ' go' : ''}${a.bad ? ' bad' : ''}`, type: 'button', text: a.label, onclick: async () => {
        await a.onClick?.()
        if (a.keepOpen !== true) closeSheet()
      } })
    )
  }

  veil.append(
    el('div', { class: 'sheet' }, [
      el('div', { class: 'sheet-top' }, [el('h2', { text: title }), blurb ? el('p', { text: blurb }) : null]),
      el('div', { class: 'sheet-mid' }, [body]),
      low
    ])
  )
  veil.onpointerdown = (e) => {
    if (e.target === veil) closeSheet()
  }
}

/** A one-field question that can be awaited. Resolves '' when dismissed. */
function promptText({ title, blurb, value = '', action = 'Save' }) {
  return new Promise((resolve) => {
    let answered = false
    const input = el('input', { class: 'prompt-field', value, spellcheck: 'false', 'aria-label': title })
    const done = () => {
      answered = true
      resolve(input.value.trim())
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        done()
        closeSheet()
      }
    })
    sheet({
      title,
      blurb,
      body: input,
      acts: [{ label: action, go: true, onClick: done }],
      onClose: () => {
        if (!answered) resolve('')
      }
    })
    setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
  })
}

/** A confirm that can be awaited, for a decision taken mid-flow. */
function ask({ title, blurb, danger, note = 'Nothing has been sent yet.' }) {
  return new Promise((resolve) => {
    let answered = false
    sheet({
      title,
      blurb,
      body: el('p', { class: 'note', text: note }),
      acts: [{ label: danger, bad: true, onClick: () => {
        answered = true
        resolve(true)
      } }],
      onClose: () => {
        if (!answered) resolve(false)
      }
    })
  })
}

/**
 * A destructive confirm.
 *
 * Its own shape, not the wide sheet. Three things a generic "are you sure"
 * cannot do, and all three are the reason this exists:
 *
 *   1. It shows the thing. Reading the name of what you are about to delete
 *      off a card that looks like the card on the plane removes the whole
 *      class of "wrong one selected" mistake.
 *   2. It lists what goes with it, counted rather than implied.
 *   3. It names the damage downstream. Deleting a request that gives a
 *      variable quietly breaks every request that spends it, and that is the
 *      consequence nobody thinks of until the next run goes red.
 *
 * Cancel is the default: it is focused on open, and Escape takes it.
 */
/**
 * `back` is where Cancel returns to.
 *
 * A delete started from the tree has nothing behind it, so closing is the
 * whole answer. One started from a page does: cancelling out of the entire
 * Environments page because you thought better of deleting one environment
 * is a punishment for changing your mind.
 */
function askDelete({ kind, subject, goes, breaks, danger, onYes, back }) {
  const veil = $('veil')
  veil.replaceChildren()
  veil.hidden = false
  sheetUp = true
  onSheetClose = back ?? null

  const body = el('div', { class: 'ask-body' })

  body.append(
    el('div', { class: 'ask-head' }, [
      el('span', { class: 'ask-mark', html: ico('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>', 17, 1.8) }),
      el('div', {}, [
        el('h2', { text: `Delete this ${kind}?` }),
        el('p', { text: 'It cannot be brought back from inside Prism.' })
      ])
    ])
  )

  body.append(subject)

  if (goes.length) {
    body.append(el('div', { class: 'ask-label', text: 'What goes with it' }))
    body.append(el('ul', { class: 'ask-list' }, goes.map((g) => el('li', { text: g }))))
  }

  if (breaks.length) {
    // Counted by request, not by dependency: one request that spends two of
    // this one's variables is still one request, and saying "9 requests"
    // when six are affected is the kind of small lie that costs trust.
    const affected = new Set(breaks.map((b) => b.name)).size
    body.append(
      el('div', { class: 'ask-warn' }, [
        el('span', { class: 'ask-warn-mark', html: ico('<path d="M12 4 22 20H2z"/><path d="M12 10v4M12 17h.01"/>', 15, 1.7) }),
        el('div', {}, [
          el('b', { text: affected === 1 ? 'One request depends on this' : `${affected} requests depend on this` }),
          el('p', {
            html: breaks
              .map((b) => `<code>${esc(b.name)}</code> needs <code>{{${esc(b.variable)}}}</code>`)
              .slice(0, 4)
              .join('<br />') + (breaks.length > 4 ? `<br />and ${breaks.length - 4} more` : '')
          }),
          el('em', { text: 'They will show the variable as missing until something else provides it.' })
        ])
      ])
    )
  }

  const cancel = el('button', { class: 'btn plain', type: 'button', text: 'Cancel', onclick: closeSheet })
  body.append(
    el('div', { class: 'ask-acts' }, [
      cancel,
      el('button', { class: 'btn bad', type: 'button', text: danger, onclick: () => {
        onSheetClose = null
        closeSheet()
        onYes()
      } })
    ])
  )

  veil.append(el('div', { class: 'ask' }, [body]))
  veil.onpointerdown = (e) => {
    if (e.target === veil) closeSheet()
  }
  // Cancel takes the focus, so a stray Enter or Space does nothing destructive.
  cancel.focus()
}

/** The row a confirm shows, drawn like the node it refers to. */
function subjectCard(req) {
  return el('div', { class: 'ask-subject' }, [
    el('span', { class: `verb ${req.method.toLowerCase()}`, text: req.method }),
    el('div', { class: 'ask-subject-words' }, [
      el('b', { text: req.name || 'Untitled' }),
      el('span', { html: pathLabel(req.url) })
    ])
  ])
}

function subjectGroup(icon, name, sub) {
  return el('div', { class: 'ask-subject' }, [
    el('span', { class: 'ask-subject-icon', html: ico(icon, 15, 1.8) }),
    el('div', { class: 'ask-subject-words' }, [el('b', { text: name }), el('span', { text: sub })])
  ])
}

/**
 * Which requests spend a variable that this one is the only source of.
 *
 * "Only source" matters: if the environment also sets it, or a second request
 * captures the same name, deleting this one breaks nothing and saying it would
 * is a false alarm.
 */
function dependants(going) {
  const goingIds = new Set(going.map((r) => r.id))
  const known = envValues()
  const out = []

  for (const req of going) {
    for (const cap of req.captures ?? []) {
      if (!cap.name) continue
      if (Object.prototype.hasOwnProperty.call(known, cap.name)) continue
      const otherSource = allRequests().some(
        (r) => !goingIds.has(r.id) && (r.captures ?? []).some((c) => c.name === cap.name)
      )
      if (otherSource) continue
      for (const user of allRequests()) {
        if (goingIds.has(user.id)) continue
        if (variablesUsed(user).includes(cap.name)) out.push({ name: user.name, variable: cap.name })
      }
    }
  }
  return out
}

function closeSheet() {
  $('veil').hidden = true
  $('veil').replaceChildren()
  sheetUp = false
  const fn = onSheetClose
  onSheetClose = null
  fn?.()
}

/* =============================================================== palette */

function openPalette() {
  const veil = $('veil')
  veil.replaceChildren()
  veil.hidden = false
  sheetUp = true

  const requests = allRequests().map((r) => ({
    group: 'Requests',
    label: r.name || 'Untitled',
    sub: shortPath(r.url),
    verb: r.method,
    run: () => {
      closePage()
      pick(r.id)
      reveal(r.id)
    }
  }))
  const cmd = (label, sub, icon, run, keys = '') => ({ group: 'Commands', label, sub, icon, run, keys })
  const commands = [
    cmd('Run the flow', 'along the graph', I.play, () => runFlow()),
    cmd('New request', 'in the current flow', I.plus, () => {
      const flow = workingFlow()
      if (flow) {
        closePage()
        addRequest(flow)
      }
    }, 'Ctrl N'),
    cmd('Paste a cURL command', 'from a browser network tab', I.terminal, pasteCurl, 'Ctrl Shift V'),
    cmd('Import a collection', 'Postman, OpenAPI, HAR', I.import, doImport),
    cmd('Export', 'code, tests or a collection', I.up, () => openExport()),
    cmd('Overview', 'the workspace at a glance', I.home, () => openOverview()),
    cmd('Environments', 'values for {{name}}', I.globe, () => openEnvironments()),
    cmd('History', 'every run, with trends', I.flow, openHistory),
    cmd('Save workspace', 'write it back to its file', I.save, saveWorkspace, 'Ctrl S'),
    cmd('Save workspace as', 'write a new file to keep', I.copy, saveWorkspaceAs, 'Ctrl Shift S'),
    cmd('Open a workspace', 'a saved .prism file', I.folder, openWorkspace, 'Ctrl O'),
    cmd('Show the workspace file', 'in the folder it was saved to', I.eye, revealWorkspace),
    cmd('Discard changes and reload', 'back to the last saved copy', I.revert, revertWorkspace),
    cmd('Fit everything', 'frame the whole plane', I.eye, () => {
      closePage()
      requestAnimationFrame(fit)
    }, 'Shift 1'),
    cmd('Tidy the plane', 'lay the nodes out in order', I.flow, tidy),
    cmd('Toggle the sidebar', 'more room for the plane', I.folder, () => setTreeShown($('stage').classList.contains('tree-off'))),
    cmd('New collection', 'empty', I.plus, newCollection),
    cmd('Switch theme', 'dark, light or the system', I.eye, () => {
      const order = ['system', 'dark', 'light']
      setPref('theme', order[(order.indexOf(S.prefs.theme) + 1) % order.length])
      applyTheme()
      toast('ok', `Theme: ${S.prefs.theme}`)
    }),
    cmd('Settings', 'theme, sending, safety', I.lock, () => openSettings()),
    cmd('Help', 'how any of this works', I.alert, () => openHelp(), 'F1')
  ]
  const items = [...requests, ...commands]

  let index = 0
  let shown = items
  const list = el('div', { class: 'pal-list', role: 'listbox' })
  const input = el('input', { placeholder: 'Search requests and commands…', 'aria-label': 'Search', spellcheck: 'false' })
  const count = el('span', { class: 'pal-count' })

  const choose = (item) => {
    closeSheet()
    item.run()
  }

  const paint = () => {
    list.replaceChildren()
    count.textContent = `${shown.length} result${shown.length === 1 ? '' : 's'}`
    if (!shown.length) {
      list.append(el('p', { class: 'pal-none', text: 'Nothing matches. Try a request name, a path, or a word like “save”.' }))
      return
    }
    let group = ''
    shown.forEach((item, i) => {
      if (item.group !== group) {
        group = item.group
        list.append(el('div', { class: 'pal-group', text: group }))
      }
      list.append(
        el('button', {
          class: `pal-item${i === index ? ' on' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': String(i === index),
          onclick: () => choose(item),
          onmousemove: () => {
            if (index !== i) {
              index = i
              for (const [n, b] of [...list.querySelectorAll('.pal-item')].entries()) b.classList.toggle('on', n === i)
            }
          }
        }, [
          item.verb
            ? el('span', { class: `verb ${item.verb.toLowerCase()}`, text: item.verb })
            : el('span', { class: 'pal-ico', html: ico(item.icon, 14, 1.9) }),
          el('span', { class: 'pal-words' }, [el('b', { text: item.label }), el('span', { text: item.sub })]),
          item.keys ? el('kbd', { class: 'pal-keys', text: item.keys }) : null
        ])
      )
    })
    list.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' })
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    shown = q ? items.filter((i) => `${i.label} ${i.sub} ${i.verb ?? ''}`.toLowerCase().includes(q)) : items
    index = 0
    paint()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      index = Math.min(index + 1, shown.length - 1)
      paint()
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      index = Math.max(index - 1, 0)
      paint()
      e.preventDefault()
    } else if (e.key === 'Enter' && shown[index]) {
      choose(shown[index])
    }
  })

  paint()
  veil.append(
    el('div', { class: 'pal' }, [
      el('div', { class: 'pal-search' }, [el('span', { class: 'pal-search-ico', html: ico(I.search, 16, 2) }), input, count]),
      list,
      el('footer', { class: 'pal-foot' }, [
        el('span', {}, [el('kbd', { text: '↑' }), el('kbd', { text: '↓' }), document.createTextNode(' to move')]),
        el('span', {}, [el('kbd', { text: '↵' }), document.createTextNode(' to open')]),
        el('span', {}, [el('kbd', { text: 'Esc' }), document.createTextNode(' to close')])
      ])
    ])
  )
  veil.onpointerdown = (e) => {
    if (e.target === veil) closeSheet()
  }
  input.focus()
}

/* ==================================================================== boot */

/**
 * Dropping a file on the window imports it.
 *
 * The same front door as the Import button — readCollection decides what the
 * file is — so a format that imports one way imports the other. Several files
 * at once are read in order rather than refused, because exporting a
 * collection and its environment as two files is the normal case.
 */
function wireDrop() {
  const zone = $('dropzone')
  let depth = 0

  // dragenter/dragleave fire for every child element the pointer crosses, so
  // a plain hide-on-leave flickers the whole way across the window.
  document.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    depth += 1
    zone.hidden = false
  })
  document.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1)
    if (!depth) zone.hidden = true
  })
  document.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) e.preventDefault()
  })
  // Any drop ends the drag, including one a panel handles and stops -- the
  // dataset drop target does, and the import overlay used to stay up over
  // the whole window afterwards. Capture phase runs before anyone can stop it.
  document.addEventListener(
    'drop',
    () => {
      depth = 0
      zone.hidden = true
    },
    true
  )

  document.addEventListener('drop', async (e) => {
    depth = 0
    zone.hidden = true
    const files = [...(e.dataTransfer?.files ?? [])]
    if (!files.length) return
    // Chromium's default for a dropped file is to navigate the window to it,
    // which would replace the app with the file's contents.
    e.preventDefault()

    for (const file of files) {
      if (file.size > 64 * 1024 * 1024) {
        toast('bad', `${file.name} is larger than 64 MB.`)
        continue
      }
      applyImport(readCollection(await file.text(), file.name))
    }
  })
}

function wire() {
  wireDrop()
  $('winMin').onclick = () => window.prism.window.minimize()
  $('winMax').onclick = () => window.prism.window.maximize()
  $('winClose').onclick = async () => {
    // The autosave means nothing is lost either way, so this asks only about
    // the *file*: edits that are not in the .prism.json the user is keeping.
    if (!(await keepOrDiscard('Closing Prism'))) return
    // Flushed here, awaited, rather than relying on `beforeunload` — that
    // handler fires while the renderer is being torn down and its IPC is
    // fire-and-forget, so the last few seconds of typing were riding on a
    // race.
    clearTimeout(saveTimer)
    await autosave({ force: true })
    window.prism.window.closeNow()
  }
  // Alt+F4, the taskbar, Cmd+Q: the main process holds those closes and asks
  // here, so they get the same flush and the same question as the button.
  let closeAsked = false
  window.prism.window.onCloseRequested(async () => {
    if (closeAsked) return
    closeAsked = true
    try {
      await $('winClose').onclick()
    } finally {
      closeAsked = false
    }
  })

  $('saveBtn').onclick = () => void saveWorkspace()
  $('saveMenuBtn').onclick = (e) => openMenu(e.currentTarget, saveMenu())
  $('wsBtn').onclick = (e) => openMenu(e.currentTarget, workspaceMenu())
  $('importBtn').onclick = doImport
  $('emptyImport').onclick = doImport
  $('emptyCurl').onclick = () => pasteCurl()
  $('emptyOpen').onclick = () => openWorkspace()
  // Wrapped: handed the click event directly, openExport took it for a flow.
  $('exportBtn').onclick = () => openExport()
  $('runFlowBtn').onclick = () => runFlow()
  $('envPick').onclick = () => openEnvironments()
  $('envBtn').onclick = () => togglePage('environments', () => openEnvironments())
  $('historyBtn').onclick = () => togglePage('history', openHistory)
  $('railExport').onclick = () => togglePage('export', () => openExport())
  $('finder').onclick = openPalette
  $('settingsBtn').onclick = () => togglePage('settings', () => openSettings())
  $('helpBtn').onclick = () => togglePage('help', () => openHelp())
  // From a page, Collections means "back to the workspace"; on the
  // workspace, it folds the sidebar.
  $('railHome').onclick = () => togglePage('overview', openOverview)
  $('railTree').onclick = () => {
    if (pageOpen) {
      closePage()
      setTreeShown(true)
    } else setTreeShown($('stage').classList.contains('tree-off'))
  }
  $('newCollectionBtn').onclick = newCollection
  $('treeFilter').oninput = (e) => {
    S.filter = e.target.value
    paintTree()
  }
  $('emptyNew').onclick = () => {
    if (!S.collections.length) newCollection()
    const col = S.collections[0]
    if (!col.flows.length) col.flows.push(emptyFlow('Flow 1'))
    addRequest(col.flows[0])
  }

  $('benchName').oninput = (e) => {
    const req = current()
    if (!req) return
    req.name = e.target.value
    paintTree()
    const n = document.querySelector(`.node[data-id="${req.id}"] .node-name`)
    if (n) n.textContent = req.name || 'Untitled'
  }
  $('urlInput').oninput = (e) => {
    const req = current()
    if (!req) return
    req.url = e.target.value
    live(req)
  }
  $('urlInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      const req = current()
      if (req) send(req)
    }
  }
  $('methodPick').onchange = (e) => {
    const req = current()
    if (!req) return
    req.method = e.target.value
    commit()
  }
  $('sendBtn').onclick = () => {
    const req = current()
    if (req) send(req)
  }
  $('reqGrow').onclick = () => fillPane('request')
  $('resGrow').onclick = () => fillPane('response')
  $('reqFold').onclick = () => foldPane('request')
  $('resFold').onclick = () => foldPane('response')
  // Double-click the handle to go back to an even split, which is what people
  // try first when they have dragged it somewhere unhelpful.
  $('benchGrip').ondblclick = () => {
    S.split = 55
    S.pane = 'split'
    layoutPanes()
  }

  // Two separate handlers. Save used to be assigned *inside* Copy's, so the
  // save icon did nothing at all until Copy had been clicked once.
  $('saveBody').onclick = () => {
    const req = current()
    const res = req ? S.results.get(req.id) : null
    if (!res || res.error) {
      toast('bad', 'There is no response to save yet.')
      return
    }
    saveBody(res, req)
  }
  $('copyBody').onclick = () => {
    const res = S.results.get(S.pickedId)
    if (!res || res.error) {
      toast('bad', 'There is no response to copy yet.')
      return
    }
    navigator.clipboard.writeText(res.json !== undefined ? JSON.stringify(res.json, null, 2) : (res.body ?? ''))
    toast('ok', 'Response copied')
  }
  $('benchMore').onclick = (e) => {
    const req = current()
    if (req) openMenu(e.currentTarget, requestMenu(req))
  }

  const grip = $('benchGrip')
  grip.onkeydown = (e) => {
    if (e.key === 'ArrowUp') S.split = clamp(S.split - 4, 15, 88)
    if (e.key === 'ArrowDown') S.split = clamp(S.split + 4, 15, 88)
    S.pane = 'split'
    layoutPanes()
  }
  grip.onpointerdown = (e) => {
    S.pane = 'split'
    const host = $('benchSplit')
    const box = host.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev) => {
      S.split = clamp(((ev.clientY - box.top) / box.height) * 100, 15, 88)
      layoutPanes()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  window.addEventListener('keydown', (e) => {
    if (planeKey(e)) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      sheetUp ? closeSheet() : openPalette()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (e.shiftKey) saveWorkspaceAs()
      else saveWorkspace()
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      pasteCurl()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      openWorkspace()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !sheetUp && !pageOpen) {
      e.preventDefault()
      $('treeFilter').focus()
      $('treeFilter').select()
    } else if (e.key === 'F2' && S.pickedId && !sheetUp && !pageOpen) {
      e.preventDefault()
      startRename(S.pickedId)
    } else if (e.key === 'F1') {
      e.preventDefault()
      openHelp()
    } else if (e.key === 'Escape' && sheetUp) {
      closeSheet()
    } else if (e.key === 'Escape' && pageOpen && !document.querySelector('.menu')) {
      // In a field, the first Escape lets go of it; the next leaves the page.
      if (isTyping(e.target)) e.target.blur()
      else closePage()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const req = current()
      if (req) send(req)
    }
  })

  window.addEventListener('resize', drawBeams)

  // A tab strip with more tabs than room scrolls sideways under the wheel,
  // so the last tabs are reachable without a scrollbar.
  document.addEventListener(
    'wheel',
    (e) => {
      const strip = e.target.closest?.('.tabs')
      if (!strip || strip.scrollWidth <= strip.clientWidth || e.ctrlKey) return
      strip.scrollLeft += e.deltaY || e.deltaX
      e.preventDefault()
    },
    { passive: false }
  )
}

async function boot() {
  S.prefs = loadSettings(safeStorage())
  applyTheme()
  try {
    if (window.localStorage.getItem('prism.treeOff') === '1') setTreeShown(false)
  } catch {
    /* no storage: the sidebar starts open */
  }
  wire()
  wirePlane()
  wireMinimap()

  // Whatever was open last time comes back, including an empty workspace:
  // it used to be read as "nothing saved" and replaced by a demo, which is
  // how a deleted collection appeared to come back. A first start shows the
  // ways in rather than somebody else's example.
  const restored = await restoreWorkspace()

  commit()
  booting = false
  // Restoring is not a change: what came back is, by definition, what the
  // app already has stored. The worked example is not stored until it is
  // edited, so a first look never writes anything.
  written.auto = autoKey(serialise(S, { name: S.savedName }))
  if (restored) S.dirty = false
  syncState()
  watchEdits()

  // A last-resort save on the way out, for a reload or a renderer teardown
  // that did not come through the close path.
  window.addEventListener('beforeunload', () => {
    clearTimeout(checkTimer)
    const doc = serialise(S, { name: S.savedName })
    if (S.prefs.autosave !== false && autoKey(doc) !== written.auto) window.prism.workspace.autosave(JSON.stringify(doc, null, 2))
  })
}

boot()
