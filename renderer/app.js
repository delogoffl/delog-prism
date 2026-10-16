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
import {
  runAll,
  check,
  emptyAssertion,
  SUBJECTS,
  OPERATORS,
  OP_LABEL,
  OP_META,
  TYPES,
  FORMATS,
  CATALOG,
  needsValue,
  needsPath,
  describe,
  generate as suggestTests,
  inferSchema,
  suggestFor,
  jsonPath
} from '../lib/assert.js'
import { analyse, bytes as fmtBytes } from '../lib/insights.js'
import { tree, diff, diffSummary } from '../lib/schema.js'
import { compareOne, compareSummary, compareMarkdown } from '../lib/compare.js'
import { checkResponse, coverage as specCoverage, prepareSpec, matchOperation, responseFor } from '../lib/contract.js'
import { load as loadYaml } from '../lib/vendor/js-yaml.js'
import { buildRoutes } from '../lib/mock.js'
import { loadPlan, startAt, loadSummary, loadMarkdown, LIMITS as LOAD_LIMITS } from '../lib/load.js'
import { runRecord, runTotals, compareRuns, keepRun, shapeOf } from '../lib/timeline.js'
import { generateCases, judge } from '../lib/testdata.js'
import { describeMessage } from '../lib/sse.js'
import { rulesOf, runRules, describeRules, parseCondition, itemsOf, LIMITS as LOGIC_LIMITS } from '../lib/logic.js'
import { PROVIDERS as AI_PROVIDERS, failurePrompt, testsPrompt, parseSuggestions } from '../lib/ai.js'
import { TARGETS, GROUPS, WHOLE_FLOW, generate, slug } from '../lib/codegen.js'
import { toHtml, toJUnit, toJson, totals, sampleOf } from '../lib/report.js'
import { SNIPPETS } from '../lib/script-runtime.js'
import { makeBackup, readBackup, backupFileName, REASONS as BACKUP_REASONS, KEEP as BACKUPS_KEPT } from '../lib/backup.js'
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
    // A textarea's value is its content, not an attribute it would ignore.
    else if (k === 'value' && tag === 'textarea') n.value = String(v)
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
  revert: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/>',
  library: '<path d="M4 19V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14"/><path d="M9 19V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11"/><path d="m14.5 8.6 2.9-.8a1 1 0 0 1 1.2.7l2.6 9.7"/><path d="M3 19h18"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>'
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function toast(kind, text) {
  if (kind === 'bad') consoleNote('error', text)
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
  /** Whole runs, for the timeline: measurements and shapes, never values. */
  runs: [],
  /** Flows run on a timer while Prism is open. */
  schedules: [],
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

/**
 * The flow being worked in: the last one picked, opened, run, dragged or
 * added to. The bar's crumbs follow it, rather than only the selected
 * request — so opening another flow in the sidebar, or closing the
 * inspector, never leaves the bar naming a flow you have moved on from.
 */
let workingFlowId = ''

function workIn(flow) {
  if (!flow || flow.id === workingFlowId) return
  workingFlowId = flow.id
  paintBar()
}
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
  if (mockState.running) queueMockUpdate()
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
  // Pure black docks the inspector unless it was told otherwise, so the theme
  // decides where it goes too.
  $('stage').classList.toggle('docked', benchDocked() || benchSize.max)
  placeBench()
}

/** True when the inspector is a fixed sidebar rather than floating by its node. */
function benchDocked() {
  return S.prefs.inspector !== 'float'
}

/**
 * The inspector's width. Docked, it can be dragged wider by its left edge,
 * and maximised: grown leftwards over the canvas up to the collections (or
 * the strip, when they are folded). The dragged width is remembered; being
 * maximised is not, so the canvas is back the next time Prism opens.
 */
const benchSize = { w: null, max: false }
try {
  benchSize.w = Number(window.localStorage.getItem('prism.benchWidth')) || null
} catch {
  /* the default width */
}

/** Where the inspector may reach on the left, in the stage's pixels. */
function benchReach() {
  const tree = $('stage').classList.contains('tree-off') || pageOpen ? null : document.querySelector('.tree')
  const rail = document.querySelector('.rail')
  return tree ? tree.offsetLeft + tree.offsetWidth : rail ? rail.offsetLeft + rail.offsetWidth : 0
}

function benchWidth(stageWidth) {
  const room = stageWidth - benchReach()
  if (benchSize.max) return room
  return benchSize.w ? clamp(benchSize.w, 380, Math.max(380, room - 160)) : null
}

/**
 * The zoom dock stays in the middle of the stage, as it always has, unless a
 * widened inspector would cover it: then it moves left just far enough to
 * stay clear. `limit` is the inspector's left edge; null puts it back.
 */
function nudgeDock(limit) {
  const dock = document.querySelector('.plane-tools')
  if (!dock) return
  dock.style.marginLeft = ''
  if (limit == null || benchSize.max) return
  const stageLeft = $('stage').getBoundingClientRect().left
  const r = dock.getBoundingClientRect()
  const over = r.right - stageLeft - (limit - 16)
  if (over > 0) dock.style.marginLeft = `${-Math.min(over, Math.max(0, r.left - stageLeft - benchReach() - 16))}px`
}

function setBenchMax(max) {
  benchSize.max = max
  $('stage').classList.toggle('docked', benchDocked() || max)
  $('stage').classList.toggle('bench-max', max)
  const btn = $('benchMax')
  btn.setAttribute('aria-pressed', String(max))
  btn.setAttribute('aria-label', max ? 'Restore the inspector' : 'Maximise the inspector')
  btn.title = max ? 'Restore (Ctrl+Shift+M)' : 'Maximise (Ctrl+Shift+M)'
  btn.innerHTML = ico(max ? '<path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 10l7-7" /><path d="M3 21l7-7" />' : '<path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />', 13, 2.1)
  placeBench()
  layoutPanes()
  requestAnimationFrame(() => {
    drawBeams()
    paintMinimap()
  })
}

/**
 * Fits the whole interface to the window.
 *
 * The layout is drawn for a monitor; on a laptop the same pixels would leave
 * the canvas a letterbox between the bars. So the interface is zoomed as a
 * whole — text, panels and canvas together, the way the browser's own zoom
 * does it — rather than reflowed piece by piece. The window is measured in its
 * own units (what it is now times the zoom already applied), so applying the
 * zoom does not change the answer and a resize cannot feed back on itself.
 */
function applyScale() {
  const ui = window.prism?.ui
  if (!ui) return
  const now = ui.zoom() || 1
  const pick = S.prefs.uiScale
  let want = Number(pick) / 100
  if (!pick || pick === 'auto' || !want) {
    const w = window.innerWidth * now
    const h = window.innerHeight * now
    want = clamp(Math.min(w / 1600, h / 920), 0.78, 1)
  }
  want = Math.round(want * 100) / 100
  if (Math.abs(want - now) > 0.005) ui.setZoom(want)
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
  // A different workspace: the flow worked in last belonged to the old one.
  workingFlowId = ''
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
  S.runs = workspace.runs ?? []
  S.schedules = workspace.schedules ?? []
  // Runs missed while Prism was closed are not made up in a burst: each
  // schedule's next run is counted from now.
  for (const x of S.schedules) x.next = Date.now() + 20000
  // How each went last time, from the timeline it was kept in.
  for (const x of S.schedules) {
    const [kind, id] = x.target.split(':')
    const envName = S.environments.find((e) => e.id === x.envId)?.name ?? ''
    const run = S.runs.find((r) => r.source === 'Schedule' && r.target.kind === kind && r.target.id === id && r.env === envName)
    if (run) {
      const tot = runTotals(run)
      x.last = { at: run.at, passed: tot.passed, failed: tot.failed, ms: run.ms, error: '' }
    }
  }
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

async function openWorkspace({ folder = false } = {}) {
  if (!(await keepOrDiscard('Opening another workspace'))) return
  const chosen = await (folder ? window.prism.workspace.openFolder() : window.prism.workspace.open())
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
  // What was open is kept before it is replaced.
  await snapshot('open')
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

/**
 * The workspace as a folder — a file per request — so a pull request shows
 * exactly which request changed. Save and Ctrl+S write back to it after.
 */
async function saveWorkspaceAsFolder() {
  if (S.saving) return false
  S.saving = true
  paintSaveState()
  const doc = serialise(S, { name: S.savedName })
  let out
  try {
    out = await window.prism.workspace.saveAsFolder({ name: slug(S.savedName), text: JSON.stringify(doc) })
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
  toast('ok', `Saved as a folder: ${out.path} — a file per request, ready to commit`)
  return true
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
    note: S.prefs.autoBackup !== false ? 'A backup of the changes is kept first, so they can be restored from Backups.' : 'This cannot be undone.',
    danger: 'Discard and reload'
  })
  if (yes) await snapshot('revert')
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
    { icon: I.up, label: 'Export…', run: () => openExport() },
    { sep: true },
    { icon: I.revert, label: 'Backups…', run: () => openBackups() }
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
    { icon: I.folder, label: 'Save as a folder, for Git…', run: () => void saveWorkspaceAsFolder() },
    { sep: true },
    { icon: I.folder, label: 'Open a workspace…', keys: 'Ctrl+O', run: () => void openWorkspace() },
    { icon: I.folder, label: 'Open a workspace folder…', run: () => void openWorkspace({ folder: true }) },
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

/**
 * The environment switch in the bar: every environment, the one in use
 * ticked, and a way into the page for anything more than switching.
 */
function envMenu() {
  const items = S.environments.map((env) => {
    const n = Object.keys(env.values ?? {}).length
    return {
      icon: env.id === S.envId ? I.check : I.globe,
      label: env.name || 'Untitled',
      keys: `${n} value${n === 1 ? '' : 's'}`,
      on: env.id === S.envId,
      run: () => useEnvironment(env)
    }
  })
  if (items.length) items.push({ sep: true })
  items.push({ icon: I.plus, label: 'New environment', run: newEnvironment })
  items.push({ icon: I.table, label: 'Manage environments…', run: () => togglePage('environments', () => openEnvironments()) })
  return items
}

function useEnvironment(env) {
  if (env.id === S.envId) return
  S.envId = env.id
  commit()
  toast('ok', `Requests now resolve against ${env.name || 'that environment'}`)
}

/* =================================================================== bar */

function paintBar() {
  const req = current()
  // The flow worked in last; failing that, the picked request's; failing
  // that, the first flow with anything in it. A deleted flow falls through.
  const flow =
    allFlows().find((f) => f.id === workingFlowId) ??
    (req ? flowOf(req.id) : null) ??
    allFlows().find((f) => f.requests.length) ??
    null
  const col = flow ? S.collections.find((c) => c.flows.includes(flow)) ?? null : S.collections[0]
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
  paintTreeFoot()
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
        const state = S.busy.has(req.id) ? 'busy' : res?.skipped && !res.failed ? '' : res ? (res.failed || res.error ? 'fail' : 'pass') : ''
        reqs.append(
          treeRow({
            cls: `req-row${req.id === S.pickedId ? ' on' : ''}`,
            title: req.url || req.name,
            lead: el('span', { class: `verb ${verbOf(req).toLowerCase()}`, text: verbOf(req) }),
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
            // The line's colour, as its key on the map.
            lead: el('span', { class: 'line-key', style: `--line:${lineOf(flow)}`, 'aria-hidden': 'true' }),
            id: flow.id,
            name: flow.name,
            count: flow.requests.length,
            onOpen: () => {
              flow.open = flow.open === false
              paintTree()
              workIn(flow)
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
 * The suite's health at the foot of the sidebar: how many requests passed
 * their last run, and the button that runs every flow. The question every
 * session starts with, answered without opening a page.
 */
function paintTreeFoot() {
  const host = $('treeFoot')
  if (!host) return
  host.replaceChildren()
  const requests = allRequests()
  if (!requests.length) return
  const ran = requests.map((r) => S.results.get(r.id)).filter(Boolean)
  const ok = ran.filter((r) => !r.error && !r.failed).length
  const checks = ran.reduce((n, r) => n + (r.checks?.length ?? 0), 0)
  const busy = S.busy.size > 0
  const state = busy || !ran.length ? 'idle' : ok === ran.length ? 'pass' : 'fail'
  host.append(
    el('div', { class: `health ${state}` }, [
      scoreRing(ok, ran.length || requests.length, state, 40),
      el('div', { class: 'health-words' }, [
        el('b', { text: busy ? 'Running…' : !ran.length ? 'Not run yet' : ok === ran.length ? 'All passed' : `${ran.length - ok} failed` }),
        el('span', { title: `${checks} checks`, text: ran.length ? `${ok}/${ran.length} passed` : `${requests.length} requests` })
      ]),
      el('button', { class: 'btn go', type: 'button', title: 'Run every flow', disabled: busy, html: `${ico(I.play, 10)}<span>Run all</span>`, onclick: () => runEveryFlow() })
    ])
  )
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
    { label: col.spec ? 'Replace OpenAPI spec…' : 'Attach OpenAPI spec…', icon: I.check, run: () => attachSpec(col) },
    col.spec ? { label: 'Spec coverage', icon: I.table, run: () => {
      runner.target = `col:${col.id}`
      openRunner('contract')
    } } : null,
    col.spec ? { label: 'Remove OpenAPI spec', icon: I.x, run: () => {
      delete col.spec
      commit()
      toast('ok', `The spec is no longer attached to ${col.name}`)
    } } : null,
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

  for (const item of items.filter(Boolean)) {
    if (item.sep) {
      menu.append(el('div', { class: 'menu-sep' }))
      continue
    }
    menu.append(
      el('button', {
        class: `menu-item${item.danger ? ' danger' : ''}${item.on ? ' on' : ''}`,
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
  workingFlowId = flow.id
  commit()
  toast('ok', `Added ${flow.name}`)
}

function addRequest(flow) {
  const req = emptyRequest({ name: 'New request', url: '{{base_url}}/' })
  flow.requests.push(req)
  S.pickedId = req.id
  workingFlowId = flow.id
  commit()
  // Brought into view where it landed, rather than reframing everything.
  setTimeout(() => reveal(req.id), 20)
  return req
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

/**
 * A flow's colour on the map: its place among every flow, round eight
 * colours, the way a transit map gives each line its own. The same colour is
 * used for the line on the canvas, its row in the sidebar and the stop card.
 */
function lineOf(flow) {
  const i = Math.max(0, allFlows().indexOf(flow))
  return `var(--line-${(i % 8) + 1})`
}

/** Space is a modifier for panning, read by both the plane and each node. */
let spaceHeld = false

const NODE_W = 240
/** The centre of a stop's marker, from the top of its node: where its line runs. */
const HANDLE_Y = 17
/** One stop to the next along a line. */
const COL_GAP = 300
/** A first guess at one flow's row; restack() measures the real height. */
const ROW_GAP = 300
/** The left edge of every flow, and the top of the first, below its lane header. */
const ORIGIN = { x: 40, y: 96 }

/**
 * Flows as rows and requests left to right, the way an automation canvas
 * reads: the order a flow runs in is the order your eye travels.
 */
function place() {
  let row = 0
  for (const flow of allFlows()) {
    flow.requests.forEach((req, i) => {
      if (!S.layout.has(req.id)) S.layout.set(req.id, { x: ORIGIN.x + i * COL_GAP, y: ORIGIN.y + row * ROW_GAP })
    })
    if (flow.requests.length) row += 1
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
  $('planeRun').hidden = !any
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
  // Rows measured rather than assumed: a node with four ports is half as tall
  // again as one with none, so each row is as tall as its tallest node and the
  // next starts a constant gap below it — room for the next lane's header.
  // A node someone dragged stays exactly where they put it; every other one
  // is laid out from its place in its flow.
  const GAP = 110
  let top = ORIGIN.y
  for (const flow of allFlows()) {
    let tallest = 0
    flow.requests.forEach((req, i) => {
      const at = S.layout.get(req.id)
      const node = document.querySelector(`.node[data-id="${req.id}"]`)
      if (!at || !node || S.moved.has(req.id)) return
      at.x = ORIGIN.x + i * COL_GAP
      at.y = top
      node.style.left = `${at.x}px`
      node.style.top = `${at.y}px`
      tallest = Math.max(tallest, node.offsetHeight)
    })
    if (flow.requests.length) top += (tallest || 160) + GAP
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
        class: `lane${flow.requests.some((r) => r.id === S.pickedId) ? ' on' : ''}`,
        'data-state': state,
        style: `left:${box.x1 - pad}px;top:${box.y1 - head}px;width:${box.x2 - box.x1 + pad * 2}px;height:${box.y2 - box.y1 + head + pad}px;--line:${lineOf(flow)}`
      },
      [
        el('div', { class: 'lane-head', title: 'Drag to move this flow', onpointerdown: (e) => dragFlow(e, flow) }, [
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
    // The next step, where the flow ends: the way an automation canvas offers
    // to continue a chain from its last link rather than from a menu. It sits
    // on the line just past the last stop, as the line's next station.
    const last = S.layout.get(flow.requests[flow.requests.length - 1]?.id)
    const end = last ? { x: last.x + NODE_W / 2 + 64 - (box.x1 - pad), y: last.y + HANDLE_Y - (box.y1 - head) } : null
    lane.append(
      el('button', {
        class: 'lane-add',
        style: end ? `left:${end.x}px;top:${end.y}px` : '',
        type: 'button',
        title: `Add a request to ${flow.name || 'this flow'}`,
        'aria-label': `Add a request to ${flow.name || 'this flow'}`,
        html: ico(I.plus, 14, 2.4),
        onclick: (e) => {
          e.stopPropagation()
          addRequest(flow)
        }
      })
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
  // A step its condition skipped is neither a pass nor a failure: it reads as not run.
  const outcome = S.busy.has(req.id) ? 'busy' : !res || (res.skipped && !res.failed) ? 'idle' : res.error || res.failed ? 'fail' : res.status >= 400 ? 'warn' : 'pass'

  const node = el('div', {
    class: `node${req.id === S.pickedId ? ' on' : ''}${S.busy.has(req.id) ? ' busy' : ''}`,
    style: `left:${at.x}px;top:${at.y}px;--line:${lineOf(flowOf(req.id))}`,
    'data-id': req.id,
    'data-verb': verb,
    'data-outcome': outcome,
    tabindex: '0',
    role: 'button',
    'aria-label': `${req.method} ${req.name}`
  })

  // Connection handles on the card's edges, where the wires attach: in on
  // the left when it needs something, out on the right when it gives.
  if (needs.length) node.append(el('span', { class: 'handle in' }))
  if (gives.length) node.append(el('span', { class: 'handle out' }))

  /* what it is — a stop on its flow's line: ringed in the line's colour once
     it has run clean, filled red when it failed, dashed while it has not run
     — then its name, and where it goes */
  const total = res?.checks?.length ?? 0
  const stopTitle = !res ? 'Not run yet' : res.error ? res.error : total ? `${total - res.failed} of ${total} checks passed` : `${res.status}, nothing checked`
  node.append(
    el('div', { class: 'node-main' }, [
      el('span', { class: 'node-icon', title: stopTitle }),
      el('div', { class: 'node-words' }, [
        el('span', { class: 'node-name', text: req.name || 'Untitled' }),
        el('span', { class: 'node-sub' }, [
          el('b', { class: 'node-verb', text: verbOf(req) }),
          el('span', { class: 'node-path', html: pathLabel(req.url) })
        ])
      ])
    ])
  )

  /* ports — what it needs on the left, what it gives on the right, on the
     same sides the wires arrive and leave from. */
  if ((needs.length || gives.length) && S.prefs.showPorts !== false) {
    const inCol = el('div', { class: 'port-col' })
    for (const name of needs.slice(0, 4)) {
      const from = allRequests().find((r) => (r.captures ?? []).some((c) => c.name === name))
      const met = Boolean(from) || Object.prototype.hasOwnProperty.call(known, name)
      inCol.append(
        el('span', {
          class: `port needs${met ? '' : ' unmet'}`,
          title: from ? `needs ${name} — captured by ${from.name}` : met ? `needs ${name} — set in the environment` : `needs ${name} — nothing provides this`,
          html: `<span class="port-dot"></span>${esc(name)}`
        })
      )
    }
    if (needs.length > 4) inCol.append(el('span', { class: 'port more', text: `+${needs.length - 4}` }))

    const outCol = el('div', { class: 'port-col out' })
    for (const name of gives.slice(0, 4)) {
      outCol.append(el('span', { class: 'port gives', title: `gives ${name}`, html: `${esc(name)}<span class="port-dot"></span>` }))
    }
    if (gives.length > 4) outCol.append(el('span', { class: 'port more', text: `+${gives.length - 4}` }))

    node.append(el('div', { class: 'ports' }, [inCol, outCol]))
  }

  /* footer — how it went, in numbers, and the button that sends it */
  const foot = el('div', { class: 'node-foot' })
  if (S.busy.has(req.id)) foot.append(el('span', { class: 'node-status busy', html: '<i></i>Running' }))
  else if (res?.skipped && !res.failed) foot.append(el('span', { class: 'node-status idle', title: res.error, html: '<i></i>Skipped' }))
  else if (res) foot.append(el('span', { class: `node-status ${outcome}`, html: `<i></i>${res.error ? 'Error' : esc(String(res.status))}` }))
  else foot.append(el('span', { class: 'node-status idle', html: '<i></i>Not run' }))
  // The step's logic, as small marks a run can be read by: if, a wait, each, until, stop.
  const NODE_MARK = { when: 'nl-when', wait: 'nl-wait', each: 'nl-each', until: 'nl-until', stop: 'nl-stop' }
  const marks = describeRules(rulesOf(req))
  if (marks.length) foot.append(el('span', { class: 'node-logic', title: marks.map((m) => m.text).join('\n') }, marks.map((m) => el('i', { class: NODE_MARK[m.kind], text: m.short }))))
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
  foot.append(el('span', { class: 'spacer' }))
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
  // The stop's other actions, beside the one that sends it — down here in
  // the foot, where nothing else on the map runs, rather than on the line
  // where the flow's + sits after its last stop.
  foot.append(
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
  )
  // A hairline along the foot that fills with the share of checks that
  // passed, so a half-green suite reads as half-green from across the plane.
  if (res && !res.error && res.checks?.length) {
    const ok = res.checks.length - res.failed
    foot.append(
      el('span', { class: 'node-meter', 'aria-hidden': 'true' }, [
        el('i', { style: `width:${(ok / res.checks.length) * 100}%` }),
        res.failed ? el('i', { class: 'bad', style: `width:${(res.failed / res.checks.length) * 100}%` }) : null
      ])
    )
  }
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
 * Each method as a picture, the way an automation canvas shows each step as
 * the thing it does: a read pulls something down, a create sends something
 * out, an update rewrites, a patch touches up, a delete bins it.
 */
const VERB_ICON = {
  get: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  post: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
  put: '<path d="M20 7H9a5 5 0 0 0 0 10h1"/><path d="m16 3 4 4-4 4"/>',
  patch: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  delete: I.bin,
  head: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  options: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
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
  const NS = 'http://www.w3.org/2000/svg'
  const make = (tag, attrs) => {
    const n = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    return n
  }
  /** A stop's centre on screen: the middle of its marker. */
  const stop = (id) => {
    const at = S.layout.get(id)
    return at ? { x: (at.x + NODE_W / 2) * z + x, y: (at.y + HANDLE_Y) * z + y } : null
  }

  // The lines: each flow through its stops in the order it runs, the way a
  // transit map draws a route — level runs joined by 45° bends, never a free
  // curve — with a short stub past each terminus.
  for (const flow of allFlows()) {
    const pts = flow.requests.map((r) => stop(r.id)).filter(Boolean)
    if (!pts.length) continue
    const stub = 34 * z
    let d = `M ${pts[0].x - stub} ${pts[0].y} L ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i += 1) d += octilinear(pts[i - 1], pts[i])
    const last = pts[pts.length - 1]
    d += ` L ${last.x + stub} ${last.y}`
    host.append(make('path', { d, class: 'metro-line', style: `stroke:${lineOf(flow)}`, 'stroke-width': Math.max(4, 12 * z) }))
    // A train: light running along the line while any of its stops is sending.
    if (flow.requests.some((r) => S.busy.has(r.id))) {
      host.append(make('path', { d, class: 'metro-train', 'stroke-width': Math.max(2, 4 * z) }))
    }
  }

  // Interchanges: a value captured on one line and spent on another, as a
  // dotted transfer between the two stops with the value's name on a tag.
  // Along a single line the line itself already joins them, and each stop
  // lists what it arrives and leaves with.
  /** Tags already drawn this pass, so the next one can step clear of them. */
  const placed = []
  for (const beam of beams()) {
    const fa = flowOf(beam.from)
    if (fa && fa === flowOf(beam.to)) continue
    const a = stop(beam.from)
    const b = stop(beam.to)
    if (!a || !b) continue
    const lit = [beam.from, beam.to].some((id) => id === S.pickedId || S.busy.has(id))
    host.append(
      make('path', {
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
        class: `metro-xfer${lit ? ' lit' : ''}`,
        'stroke-width': Math.max(1.5, 3 * z),
        'stroke-dasharray': `${(2 * z).toFixed(1)} ${(8 * z).toFixed(1)}`
      })
    )

    if (z > 0.45 && S.prefs.beamLabels !== false) {
      const size = 11 * clamp(z, 0.8, 1.2)
      const w = beam.name.length * size * 0.62 + 18
      const h = size + 10
      // On the stretch between two rows rather than halfway, which lands on a
      // stop's label: just above the lower line's name, where the map is empty.
      const lower = a.y < b.y ? b : a
      const along = Math.abs(b.y - a.y) > 1 ? clamp((lower.y - 78 * z - a.y) / (b.y - a.y), 0.1, 0.9) : 0.5
      const cx = a.x + (b.x - a.x) * along
      let cy = a.y + (b.y - a.y) * along
      const hits = (yy) => placed.some((p) => Math.abs(p.x - cx) < (p.w + w) / 2 + 4 && Math.abs(p.y - yy) < h + 2)
      let tries = 0
      while (hits(cy) && tries < 4) {
        cy += h + 4
        tries += 1
      }
      if (hits(cy)) continue
      placed.push({ x: cx, y: cy, w })
      host.append(make('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, class: `metro-tag${lit ? ' lit' : ''}` }))
      const t = make('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'metro-tag-text', 'font-size': size.toFixed(1) })
      t.textContent = beam.name
      host.append(t)
    }
  }
  // The inspector follows its node through every pan, zoom, drag and resize,
  // and each of those ends up here.
  placeBench()
}

/**
 * One leg of a line, from one stop to the next, the way a transit map draws
 * it: level, a 45° bend, level again — or, when the drop is steeper than the
 * run, straight down, the bend, and straight down again.
 */
function octilinear(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dy) < 1) return ` L ${b.x} ${b.y}`
  const run = Math.abs(dx) - Math.abs(dy)
  if (run >= 0) {
    const x1 = a.x + (run / 2) * Math.sign(dx)
    const x2 = x1 + Math.abs(dy) * Math.sign(dx)
    return ` L ${x1} ${a.y} L ${x2} ${b.y} L ${b.x} ${b.y}`
  }
  const y1 = a.y + ((Math.abs(dy) - Math.abs(dx)) / 2) * Math.sign(dy)
  const y2 = y1 + Math.abs(dx) * Math.sign(dy)
  return ` L ${a.x} ${y1} L ${b.x} ${y2} L ${b.x} ${b.y}`
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
 * Moves a whole flow by its header: every stop on it goes together, keeps its
 * place relative to the others, and stays where it is put — saved with the
 * workspace, the same as a single dragged node. Tidy lays it back out.
 */
function dragFlow(e, flow) {
  workIn(flow)
  // Space-drag and middle-drag still pan, and the header's own buttons still
  // click, so only a plain press on the header itself starts a move.
  if (spaceHeld || e.button !== 0 || e.target.closest('button')) return
  e.stopPropagation()
  e.preventDefault()
  const from = { x: e.clientX, y: e.clientY }
  const stops = flow.requests
    .map((r) => ({ id: r.id, at: S.layout.get(r.id) }))
    .filter((o) => o.at)
    .map((o) => ({ ...o, x: o.at.x, y: o.at.y }))
  if (!stops.length) return
  let moved = false
  const plane = $('plane')
  plane.classList.add('dragging')

  const move = (ev) => {
    const dx = (ev.clientX - from.x) / S.view.z
    const dy = (ev.clientY - from.y) / S.view.z
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
    for (const o of stops) {
      o.at.x = Math.round(o.x + dx)
      o.at.y = Math.round(o.y + dy)
      const node = document.querySelector(`.node[data-id="${o.id}"]`)
      if (node) {
        node.style.left = `${o.at.x}px`
        node.style.top = `${o.at.y}px`
      }
    }
    paintLanes()
    drawBeams()
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    plane.classList.remove('dragging')
    if (moved) {
      for (const o of stops) S.moved.add(o.id)
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
  const beginPan = (e, { closes = false } = {}) => {
    const from = { x: e.clientX, y: e.clientY }
    const origin = { ...S.view }
    let travelled = 0
    plane.classList.add('dragging')
    const move = (ev) => {
      travelled = Math.max(travelled, Math.abs(ev.clientX - from.x) + Math.abs(ev.clientY - from.y))
      S.view.x = origin.x + (ev.clientX - from.x)
      S.view.y = origin.y + (ev.clientY - from.y)
      applyView()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      plane.classList.remove('dragging')
      // A click on the empty plane, rather than a drag across it, puts the
      // drawer away — the way clicking off a step closes it on any canvas.
      if (closes && travelled < 4) unpick()
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
    if (e.target.closest('.node, .plane-tools, .legend, .minimap, .lane-run, .lane-add, .plane-run')) return
    beginPan(e, { closes: true })
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
  } else if (!mod && key === 'Escape' && req) unpick()
  else return false

  e.preventDefault()
  return true
}

/** Pans just enough to bring a node fully into view. */
function reveal(id) {
  const at = S.layout.get(id)
  const node = document.querySelector(`.node[data-id="${id}"]`)
  if (!at || !node) return
  const { z } = S.view
  const pad = 24
  const left = at.x * z + S.view.x
  const top = at.y * z + S.view.y
  const w = NODE_W * z
  const h = node.offsetHeight * z
  const box = visibleBox()
  if (left < box.x1 + pad) S.view.x += box.x1 + pad - left
  else if (left + w > box.x2 - pad) S.view.x -= left + w - (box.x2 - pad)
  if (top < box.y1 + pad) S.view.y += box.y1 + pad - top
  else if (top + h > box.y2 - pad) S.view.y -= top + h - (box.y2 - pad)
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
  // Zoomed out, each flow's title grows against the zoom so it can still be
  // read across the whole map — the way a Blueprint's comment boxes keep
  // their titles — and below half size the small print on each stop is
  // dropped, leaving the lines, the stops and the names of the flows.
  const k = Math.max(1, (0.6 / z) ** 1.7)
  $('plane').style.setProperty('--title-k', k.toFixed(3))
  $('plane').classList.toggle('far', k > 1)
  $('plane').classList.toggle('low', z < 0.5)
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
  frame(flow.requests, { least: 0.72, most: 1, top: true })
}

/** Fits a set of requests in the plane, between two zoom levels. */
function frame(list, { least = ZOOM_MIN, most = 1.1, top = false } = {}) {
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
    // Room on the right for the lane's add button after the last node.
    maxX = Math.max(maxX, at.x + NODE_W + 80)
    maxY = Math.max(maxY, at.y + h + 16)
  }
  // Framed in the part of the plane nothing floats over — right of the dock
  // and the collections, under the bar, above the bottom dock.
  const box = visibleBox()
  const pad = 28
  const width = box.x2 - box.x1
  const height = box.y2 - box.y1
  const z = clamp(Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY)), least, most)
  // Centred in the space it has; when it is wider than that, its left edge
  // leads, which is where a flow starts.
  const wide = (maxX - minX) * z > width - pad * 2
  const x = box.x1 + (wide ? pad - minX * z : (width - (maxX - minX) * z) / 2 - minX * z)
  // Opening on one flow puts it at the top, as a canvas reads: the rows under
  // it are the next thing down, not hidden below a band of empty space.
  const y = box.y1 + pad + (top ? 0 : Math.max(0, (height - pad * 2 - (maxY - minY) * z) / 2)) - minY * z
  S.view = { z, x, y }
  applyView()
}

function pick(id) {
  S.pickedId = id
  if (id) workingFlowId = flowOf(id)?.id ?? workingFlowId
  S.editTab = 'params'
  S.respTab = S.results.has(id) ? 'payload' : 'brief'
  commit()
  // A node behind the bar, the dock or the collections is brought out where
  // it can be seen, and the inspector opens beside it.
  if (id) requestAnimationFrame(() => reveal(id))
}

/** Puts the inspector drawer away, and the plane has its full width back. */
function unpick() {
  if (!S.pickedId) return
  S.pickedId = ''
  commit()
}

/**
 * The part of the plane nothing floats over, in the plane's own pixels:
 * right of the dock and the collections sheet, under the bar, above the
 * bottom dock. The plane fills the window behind the glass, so framing and
 * revealing aim for this rather than for the plane's whole box.
 */
function visibleBox() {
  const plane = $('plane').getBoundingClientRect()
  const tree = $('stage').classList.contains('tree-off') ? null : document.querySelector('.tree')
  const rail = document.querySelector('.rail')
  const left = tree ? tree.offsetLeft + tree.offsetWidth : (rail ? rail.offsetLeft + rail.offsetWidth : 0)
  // A docked inspector takes the right of the plane for as long as it is open.
  const stage = $('stage')
  const docked = stage.classList.contains('docked') && stage.classList.contains('drawer')
  const right = docked ? (document.querySelector('.bench')?.offsetWidth ?? 0) + 16 : 16
  return { x1: left + 8, y1: $('bar').offsetHeight, x2: plane.width - right, y2: plane.height - 96 }
}

/**
 * Puts the inspector beside the node it is about, pointing at it: to its
 * right when there is room, to its left when not, and against the right
 * edge when there is room on neither side. Called whenever the plane moves,
 * so the panel follows its node through a pan, a zoom or a drag.
 */
function placeBench() {
  const bench = document.querySelector('.bench')
  const caret = $('benchCaret')
  const req = current()
  if (!bench || !caret || !req || pageOpen) return
  const stage = $('stage').getBoundingClientRect()
  if (!benchDocked() && !benchSize.max) bench.style.width = ''
  const W = bench.offsetWidth
  const top0 = $('bar').offsetHeight
  // Docked: a fixed sidebar against the right edge, under the bar, whatever
  // the plane is doing.
  if (benchDocked() || benchSize.max) {
    const w = benchWidth(stage.width)
    bench.style.width = w ? `${Math.round(w)}px` : ''
    const W = bench.offsetWidth
    nudgeDock(stage.width - W)
    bench.style.left = `${Math.round(stage.width - W)}px`
    bench.style.top = `${top0}px`
    bench.style.height = `${Math.round(stage.height - top0)}px`
    bench.style.transformOrigin = 'right center'
    caret.dataset.side = 'none'
    return
  }
  const box = visibleBox()
  const H = Math.max(320, Math.min(760, stage.height - top0 - 16))
  const node = document.querySelector(`.node[data-id="${req.id}"]`)
  const gap = 22
  let left
  let side = 'none'
  let anchor = null
  if (node) {
    const n = node.getBoundingClientRect()
    const at = { l: n.left - stage.left, r: n.right - stage.left, t: n.top - stage.top }
    anchor = at.t + Math.min(n.height, 86) / 2
    const onScreen = at.r > box.x1 && at.l < box.x2 && anchor > top0 && anchor < stage.height - 16
    if (onScreen && at.r + gap + W <= stage.width - 16) {
      left = at.r + gap
      side = 'left'
    } else if (onScreen && at.l - gap - W >= box.x1) {
      left = at.l - gap - W
      side = 'right'
    }
  }
  if (left === undefined) left = stage.width - W - 16
  let top = clamp(side === 'none' ? top0 : anchor - 64, top0, Math.max(top0, stage.height - H - 16))
  // It stops short of the bottom dock rather than covering the controls in it.
  let h = H
  const dock = document.querySelector('.plane-tools')?.getBoundingClientRect()
  if (dock?.width && left < dock.right - stage.left && left + W > dock.left - stage.left) {
    const floor = dock.top - stage.top - 14
    if (top + h > floor) {
      top = Math.max(top0, floor - h)
      h = Math.max(320, floor - top)
    }
  }
  bench.style.left = `${Math.round(left)}px`
  bench.style.top = `${Math.round(top)}px`
  bench.style.height = `${Math.round(h)}px`
  bench.style.transformOrigin = side === 'right' ? 'right center' : side === 'left' ? 'left center' : 'right top'
  caret.dataset.side = side
  if (side !== 'none') caret.style.top = `${Math.round(clamp(anchor - top - 9, 26, h - 44))}px`
}

/* ============================================================= workbench */

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const EDIT_TABS = [
  ['params', 'Params'],
  ['headers', 'Headers'],
  ['body', 'Body'],
  ['auth', 'Auth'],
  ['tests', 'Tests'],
  ['scripts', 'Scripts'],
  ['chain', 'Chain'],
  ['logic', 'Logic'],
  ['data', 'Data']
]

const RESP_TABS = [
  ['brief', 'Brief'],
  ['result', 'Result'],
  ['payload', 'Payload'],
  ['tests', 'Tests'],
  ['contract', 'Contract'],
  ['headers', 'Headers'],
  ['shape', 'Shape'],
  ['diff', 'Diff'],
  ['drift', 'Drift'],
  ['notes', 'Notes'],
  ['timing', 'Timing'],
  ['console', 'Console']
]

function paintBench() {
  const req = current()
  // The inspector is a drawer: out while a request is picked, away otherwise.
  $('stage').classList.toggle('drawer', Boolean(req))
  $('benchNone').hidden = Boolean(req)
  $('benchLive').hidden = !req
  if (!req) {
    nudgeDock(null)
    return
  }

  const verb = req.method.toLowerCase()
  $('benchVerb').className = `verb ${verb}`
  // Which line it is on and where along it, in the line's colour.
  const line = flowOf(req.id)
  $('benchLive').style.setProperty('--line', lineOf(line))
  $('benchLineText').textContent = line
    ? `${line.name || 'Untitled flow'} line · stop ${line.requests.findIndex((r) => r.id === req.id) + 1} of ${line.requests.length}`
    : 'Not on a line'
  $('benchLive').dataset.verb = verb
  $('benchVerb').textContent = verbOf(req)
  $('benchVerb').className = `verb ${verbOf(req).toLowerCase()}`
  if ($('benchName').value !== (req.name ?? '')) $('benchName').value = req.name ?? ''
  $('addrVerb').className = `addr-verb ${req.kind ? verbOf(req).toLowerCase() : verb}`
  $('addrVerbText').textContent = verbOf(req)
  if ($('urlInput').value !== (req.url ?? '')) $('urlInput').value = req.url ?? ''

  const busy = S.busy.has(req.id)
  $('sendBtn').disabled = busy
  if (isStream(req)) {
    const st = streamOf(req.id).status
    $('sendLabel').textContent = st === 'open' ? 'Disconnect' : st === 'connecting' ? 'Connecting' : 'Connect'
    $('sendBtn').classList.toggle('live', st === 'open')
  } else {
    $('sendLabel').textContent = busy ? 'Sending' : 'Send'
    $('sendBtn').classList.remove('live')
  }
  paintPreview(req)

  const res = S.results.get(req.id)

  const et = $('editTabs')
  et.replaceChildren()
  if (req.kind !== 'grpc' && S.editTab === 'grpc') S.editTab = 'params'
  for (const [id, label] of req.kind === 'grpc' ? [['grpc', 'gRPC'], ...EDIT_TABS.filter(([t]) => t !== 'params' && t !== 'body')] : EDIT_TABS) {
    const n = countFor(req, id)
    // The Tests count says how the last run went, not only how many there are.
    const verdict = id === 'tests' && res && !res.error && res.checks?.length ? (res.failed ? ' bad' : ' ok') : ''
    et.append(
      el('button', { class: `tab${S.editTab === id ? ' on' : ''}`, type: 'button', role: 'tab', html: `${label}${n ? `<b class="${verdict.trim()}">${n}</b>` : ''}`, onclick: () => {
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
  if (isStream(req) && S.respTab !== 'messages') S.respTab = 'messages'
  if (!isStream(req) && S.respTab === 'messages') S.respTab = 'brief'
  for (const [id, label] of isStream(req) ? [['messages', 'Messages']] : RESP_TABS) {
    let badge = ''
    if (id === 'drift') {
      const d = drift(req)
      if (d?.breaking.length) badge = `<b class="bad">${d.breaking.length}</b>`
      else if (S.baselines.has(req.id)) badge = '<b></b>'
    }
    // The tests' verdict on the tab itself — passed out of run, red when any
    // failed — so it can be read without opening it.
    if (id === 'tests' && res?.checks?.length) {
      const bad = res.checks.filter((c) => !c.ok).length
      badge = `<b class="${bad ? 'bad' : 'ok'}">${res.checks.length - bad}/${res.checks.length}</b>`
    }
    if (id === 'console' && res?.logs?.length) badge = `<b>${res.logs.length}</b>`
    if (id === 'messages' && streamOf(req.id).log.length) badge = `<b>${streamOf(req.id).log.filter((m) => m.dir !== 'sys').length}</b>`
    // Only a collection with a spec has a contract to show.
    if (id === 'contract' && (!chainFor(req)[0]?.spec || req.kind)) continue
    if (id === 'contract' && res?.contract) {
      const errors = res.contract.findings.filter((f) => f.level === 'error').length
      const warns = res.contract.findings.length - errors
      badge = errors ? `<b class="bad">${errors}</b>` : warns ? `<b>${warns}</b>` : res.contract.matched ? '<b class="ok">✓</b>' : ''
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
  placeBench()
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
  const cols = S.pane === 'split' && (document.querySelector('.bench')?.offsetWidth ?? 0) >= 900
  host.classList.toggle('cols', cols)
  $('benchGrip').setAttribute('aria-orientation', cols ? 'vertical' : 'horizontal')
  if (cols) {
    host.style.gridTemplateRows = '1fr'
    host.style.gridTemplateColumns = `minmax(280px, ${S.split}fr) 7px minmax(280px, ${100 - S.split}fr)`
  } else host.style.gridTemplateColumns = ''
  if (cols) {
    /* side by side */
  } else if (S.pane === 'request') host.style.gridTemplateRows = `minmax(120px, 1fr) 0px ${BAR}`
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
        title: res.failed ? `${res.failed} of ${res.checks.length} assertions failed` : res.checks.length === 1 ? 'The assertion passed' : `All ${res.checks.length} assertions passed`,
        text: res.failed ? `✕ ${res.failed}/${res.checks.length}` : `✓ ${res.checks.length}/${res.checks.length}`
      })
    )
  }
}

function paintPreview(req) {
  // What actually goes out: a gRPC call is a service and a method, not a GET.
  const lead = req.kind === 'grpc' ? `gRPC ${esc(req.grpc?.service || '(no service)')}/${esc(req.grpc?.method || '(no method)')} →` : req.kind ? verbOf(req) : req.method
  $('wirePreview').innerHTML = `<b style="color:var(--ink-4)">${lead}</b> ${esc(buildUrl(req, envValues())).replace(
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
  if (tab === 'logic') return describeRules(rulesOf(req)).length
  if (tab === 'scripts') return (req.scripts?.pre?.trim() ? 1 : 0) + (req.scripts?.test?.trim() ? 1 : 0)
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
  if (req.kind === 'grpc' && (S.editTab === 'grpc' || S.editTab === 'params' || S.editTab === 'body')) return grpcPanel(req)
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
    case 'scripts':
      return scriptsPanel(req)
    case 'logic':
      return logicPanel(req)
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



/* ------------------------------------------------------------ the studio

   Assertions are the reason a flow is worth running, so the Tests tab leads
   with them: a score, the two fast ways to a good suite — generate it from a
   real response, or take it from the library — and rows that read as a
   sentence. Each row is two lines, what is checked and how, because squeezing
   five controls into one line is what cut "JSON path" down to "JSON pat". */

const SUBJECT_ICON = {
  status: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  time: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  size: '<path d="M4 7h16M4 12h11M4 17h6"/>',
  contentType: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  header: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  body: '<path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2"/>',
  json: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5"/>',
  schema: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10v4a2 2 0 0 0 2 2H14"/>',
  cookie: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M14.5 14.5h.01M14 8.5h.01"/>',
  redirects: '<path d="M4 17h11a4 4 0 0 0 0-8H8"/><path d="m11 6-3 3 3 3"/>',
  transport: I.lock
}

const CATALOG_ICON = {
  status: SUBJECT_ICON.status,
  performance: SUBJECT_ICON.time,
  headers: SUBJECT_ICON.header,
  body: SUBJECT_ICON.body,
  json: SUBJECT_ICON.json,
  schema: SUBJECT_ICON.schema,
  security: I.shield
}

/** What a subject with no path reads, said in the space the path would take. */
const READS = {
  status: 'the status code',
  time: 'the full round trip',
  size: 'the bytes downloaded',
  contentType: 'the Content-Type header',
  body: 'the raw body text',
  redirects: 'redirects followed',
  transport: 'the connection'
}

/** Values that come from a fixed list get a select, not a box to misspell in. */
const CHOICES = {
  isType: () => TYPES.map((t) => [t, t]),
  isFormat: () => Object.entries(FORMATS).map(([id, f]) => [id, f.label]),
  isClass: () => ['2xx', '3xx', '4xx', '5xx'].map((c) => [c, c]),
  isSorted: () => [['asc', 'ascending'], ['desc', 'descending']],
  hasFlag: () => ['HttpOnly', 'Secure', 'SameSite', 'SameSite=Strict', 'SameSite=Lax', 'SameSite=None'].map((f) => [f, f])
}

const SCHEMA_STARTER = '{\n  "type": "object",\n  "required": []\n}'

/**
 * Makes the value fit the operator after the subject or the operator moved.
 * A row that switched from "equals 200" to "is of type" must not go on
 * claiming the type is "200".
 */
function fitValue(a) {
  if (!needsValue(a)) {
    a.value = ''
    return
  }
  const choices = CHOICES[a.op]?.()
  if (choices && !choices.some(([id]) => id === a.value)) a.value = choices[0][0]
  if (a.op === 'matchesSchema' && !String(a.value ?? '').trim().startsWith('{')) a.value = SCHEMA_STARTER
}

const subjectOf = (a) => SUBJECTS.find((s) => s.id === a.subject) ?? SUBJECTS[0]

/** A ring that fills with the share that passed. */
function scoreRing(ok, total, state, size = 44) {
  const r = size / 2 - 3
  const C = 2 * Math.PI * r
  const pct = total ? ok / total : 0
  const fill = state === 'idle' ? 0 : pct
  // The box is the ring's own size: a fixed box larger than the ring left the
  // ring in its corner and the score off its centre.
  const box = el('div', { class: `score${size > 50 ? ' lg' : ''}`, style: `width:${size}px;height:${size}px`, title: total ? `${ok} of ${total} passed` : '' })
  box.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="score-tr" cx="${size / 2}" cy="${size / 2}" r="${r}"></circle>
      <circle class="score-fl${state === 'fail' ? ' bad' : state === 'idle' ? ' idle' : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${(C * fill).toFixed(1)} ${C.toFixed(1)}"></circle>
    </svg><b>${state === 'idle' ? total : `${ok}/${total}`}</b>`
  return box
}

function testsPanel(req, res) {
  const box = el('div', { class: 'studio' })
  const list = req.assertions ?? []
  const byId = new Map((res?.checks ?? []).map((c) => [c.id, c]))
  const live = list.filter((a) => a.on !== false)
  const ran = live.filter((a) => byId.has(a.id))
  const failed = ran.filter((a) => !byId.get(a.id).ok).length
  const off = list.length - live.length
  const readable = Boolean(res && !res.error)

  const generate = el('button', {
    class: 'btn sm',
    type: 'button',
    disabled: !readable,
    title: readable ? 'Suggest a suite read off the last response' : '',
    'aria-describedby': readable ? null : `gen-why-${req.id}`,
    html: `${ico(I.sparkle, 12, 1.9)}<span>Generate</span>`,
    onclick: () => openGenerator(req)
  })
  const studioActs = () => [
    // A disabled button never shows its title, so the reason it is off is a
    // tooltip on what holds it — the one question a greyed-out button raises.
    readable
      ? generate
      : el('span', { class: 'tip', 'data-tip': 'Send this request once first — tests are generated from its response' }, [
          generate,
          el('span', { class: 'sr-only', id: `gen-why-${req.id}`, text: 'Send this request once first — tests are generated from its response' })
        ]),
    el('button', { class: 'btn sm go', type: 'button', html: `${ico(I.library, 12, 1.9)}<span>Library</span>`, onclick: () => openLibrary(req) }),
    readable && aiOn() ? el('button', { class: 'btn sm', type: 'button', title: 'Ask the AI assistant for checks, each tried on the last response first', html: `${ico(I.sparkle, 12, 1.9)}<span>Suggest with AI</span>`, onclick: () => suggestWithAi(req) }) : null
  ].filter(Boolean)

  if (!list.length) {
    box.append(
      el('div', { class: 'studio-empty' }, [
        el('span', { html: ico(I.check, 20, 2.2) }),
        el('b', { text: 'No assertions yet' }),
        el('p', {
          text: readable
            ? 'Generate a suite from the response you just got, pick ready-made checks from the library, or write one yourself.'
            : 'Send the request and Prism can generate a suite from what comes back. Or pick ready-made checks from the library now.'
        }),
        el('div', { class: 'studio-acts' }, [
          ...studioActs(),
          el('button', { class: 'btn sm plain', type: 'button', html: `${ico(I.plus, 11, 2.2)}<span>Write one</span>`, onclick: () => addAssertion(req) })
        ])
      ])
    )
    return box
  }

  const state = !ran.length ? 'idle' : failed ? 'fail' : 'pass'
  const summary = ran.length
    ? `<em class="pass">${ran.length - failed} passed</em>${failed ? ` · <em class="fail">${failed} failed</em>` : ''}${off ? ` · ${off} off` : ''}`
    : `Not run yet — send the request to check ${live.length === 1 ? 'it' : 'them'}${off ? ` · ${off} off` : ''}`
  box.append(
    el('div', { class: `studio-head ${state}` }, [
      scoreRing(ran.length - failed, ran.length || live.length, state),
      el('div', { class: 'studio-words' }, [el('b', { text: `${list.length} assertion${list.length === 1 ? '' : 's'}` }), el('span', { html: summary })]),
      el('div', { class: 'studio-acts' }, studioActs())
    ])
  )

  const rows = el('div', { class: 'tlist' })
  for (const a of list) rows.append(assertionRow(req, a, a.on === false ? null : byId.get(a.id), res))
  box.append(rows)

  box.append(
    el('div', { class: 'studio-add' }, [
      el('button', { class: 'addbtn', type: 'button', html: `${ico(I.plus, 10, 2.4)}<span>Add assertion</span>`, onclick: () => addAssertion(req) }),
      el('span', { class: 'studio-hint', text: readable ? 'or click any value in the Payload tab to assert on it' : '' })
    ])
  )
  return box
}

/** A new row, starting from something useful rather than a blank. */
function addAssertion(req) {
  const has = (req.assertions ?? []).some((a) => a.subject === 'status')
  ;(req.assertions ??= []).push(has ? emptyAssertion({ subject: 'json', op: 'exists', path: '', value: '' }) : emptyAssertion())
  S.editTab = 'tests'
  commit()
}

function assertionRow(req, a, hit, res) {
  const subject = subjectOf(a)
  const ops = OPERATORS[a.subject] ?? ['equals']
  const pathWanted = needsPath(a)
  const repaint = () => {
    touch()
    paintBench()
  }

  const row = el('div', { class: `trow${a.on === false ? ' off' : hit ? (hit.ok ? ' pass' : ' fail') : ''}` })
  const grid = el('div', { class: 'trow-grid' })

  /* what is checked */
  const groups = [...new Set(SUBJECTS.map((s) => s.group))]
  const subj = el(
    'select',
    {
      class: 'tsel subj',
      'aria-label': 'What to check',
      onchange: (e) => {
        a.subject = e.target.value
        a.op = (OPERATORS[a.subject] ?? ['equals'])[0]
        if (!needsPath(a)) a.path = ''
        fitValue(a)
        commit()
      }
    },
    groups.map((g) =>
      el('optgroup', { label: g }, SUBJECTS.filter((s) => s.group === g).map((s) => el('option', { value: s.id, text: s.label, selected: s.id === a.subject })))
    )
  )
  const where = pathWanted
    ? el('input', {
        class: 'cell tpath',
        value: a.path ?? '',
        placeholder: subject.pathHint ?? 'path',
        spellcheck: 'false',
        'aria-label': a.subject === 'header' ? 'Header name' : a.subject === 'cookie' ? 'Cookie name' : 'Path',
        title: a.subject === 'json' ? 'A dotted path: data.items[0].id — [*] checks every item, [-1] the last' : '',
        oninput: (e) => {
          a.path = e.target.value
          touch()
        },
        onchange: () => commit()
      })
    : el('span', { class: 'tfill', title: subject.blurb ?? '', text: READS[a.subject] ?? subject.blurb ?? '' })

  /* how */
  const op = el(
    'select',
    {
      class: 'tsel op',
      'aria-label': 'Operator',
      onchange: (e) => {
        a.op = e.target.value
        fitValue(a)
        repaint()
      }
    },
    ops.map((o) => el('option', { value: o, text: OP_LABEL[o] ?? o, selected: o === a.op }))
  )

  let value
  const choices = CHOICES[a.op]?.()
  if (!needsValue(a)) {
    value = el('span', { class: 'tfill', text: 'no value needed' })
  } else if (a.op === 'matchesSchema') {
    value = el('span', { class: 'tfill', text: 'the JSON Schema below' })
  } else if (choices) {
    value = el(
      'select',
      {
        class: 'tsel',
        'aria-label': 'Expected',
        onchange: (e) => {
          a.value = e.target.value
          repaint()
        }
      },
      choices.map(([id, label]) => el('option', { value: id, text: label, selected: id === a.value }))
    )
  } else {
    value = el('input', {
      class: 'cell tval',
      value: a.value ?? '',
      placeholder: OP_META[a.op]?.hint || subject.valueHint || 'expected',
      spellcheck: 'false',
      'aria-label': 'Expected',
      oninput: (e) => {
        a.value = e.target.value
        touch()
      }
    })
  }

  grid.append(
    el('input', { class: 'tick', type: 'checkbox', checked: a.on !== false, 'aria-label': 'Run this assertion', onchange: (e) => {
      a.on = e.target.checked
      repaint()
    } }),
    el('div', { class: 'tline what' }, [subj, where]),
    el('button', { class: 'x-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove assertion', html: ico(I.x, 11, 2.3), onclick: () => {
      req.assertions = req.assertions.filter((x) => x.id !== a.id)
      commit()
    } }),
    el('span', { class: 'tgutter' }),
    el('div', { class: 'tline how' }, [op, value])
  )

  if (a.op === 'matchesSchema') {
    const area = el('textarea', {
      class: 'tschema',
      spellcheck: 'false',
      'aria-label': 'JSON Schema',
      oninput: (e) => {
        a.value = e.target.value
        touch()
      }
    })
    area.value = a.value ?? ''
    const sample = res && !res.error && res.json !== undefined ? (a.path ? jsonPath(res.json, a.path) : res.json) : undefined
    grid.append(
      area,
      el('div', { class: 'tschema-acts' }, [
        el('button', {
          class: 'tiny',
          type: 'button',
          disabled: sample === undefined,
          title: sample === undefined ? 'Send the request to read a shape off it' : 'Write a schema from the last response',
          text: 'Use the response’s shape',
          onclick: () => {
            a.value = JSON.stringify(inferSchema(sample), null, 2)
            repaint()
          }
        }),
        el('button', { class: 'tiny', type: 'button', text: 'Format', onclick: () => {
          try {
            a.value = JSON.stringify(JSON.parse(a.value), null, 2)
            repaint()
          } catch (err) {
            toast('bad', `That schema is not valid JSON — ${err.message}`)
          }
        } })
      ])
    )
  }

  row.append(grid)
  if (hit) {
    row.append(el('div', { class: 'trow-saw', title: hit.detail }, [el('span', { html: ico(hit.ok ? I.check : I.x, 11, 2.6) }), el('span', { text: hit.detail })]))
  }
  return row
}

/* --------------------------------------------------------- the library */

/**
 * Ready-made checks, by what people go looking for. A click adds one to the
 * request and leaves the sheet open, because a suite is five of these, not
 * one; the card turns green so it is clear which are already in.
 */
function openLibrary(req) {
  let at = CATALOG[0]?.id ?? ''
  let q = ''
  const added = new Set()
  const total = CATALOG.reduce((n, g) => n + g.items.length, 0)
  const body = el('div', { class: 'lib' })
  const search = el('input', {
    type: 'search',
    placeholder: 'Search checks',
    'aria-label': 'Search the library',
    spellcheck: 'false',
    oninput: (e) => {
      q = e.target.value.trim().toLowerCase()
      paintMain()
    }
  })
  const side = el('div', { class: 'lib-side' })
  const main = el('div', { class: 'lib-main' })

  const paintSide = () => {
    side.replaceChildren(el('label', { class: 'lib-search' }, [el('span', { html: ico(I.search, 13, 2) }), search]))
    for (const g of CATALOG) {
      side.append(
        el('button', { class: `lib-cat${g.id === at && !q ? ' on' : ''}`, type: 'button', onclick: () => {
          at = g.id
          q = ''
          search.value = ''
          paintSide()
          paintMain()
        } }, [
          el('span', { class: 'page-ico', html: ico(CATALOG_ICON[g.id] ?? I.check, 13, 1.9) }),
          el('span', { class: 'page-label', text: g.label }),
          el('span', { class: 'count', text: String(g.items.length) })
        ])
      )
    }
  }

  const card = (item) => {
    const done = added.has(item.id)
    return el('button', {
      class: `lib-card${done ? ' added' : ''}`,
      type: 'button',
      title: done ? 'Added — click again to add another copy' : 'Add to this request',
      onclick: () => {
        ;(req.assertions ??= []).push(emptyAssertion({ ...item.assertion }))
        added.add(item.id)
        S.editTab = 'tests'
        commit()
        paintMain()
      }
    }, [
      el('span', { class: 'lib-add', html: ico(done ? I.check : I.plus, 11, 2.6) }),
      el('b', { text: item.title }),
      el('span', { text: item.blurb }),
      el('code', { class: 'lib-code', text: describe(item.assertion) })
    ])
  }

  const paintMain = () => {
    main.replaceChildren()
    if (q) {
      const hits = CATALOG.flatMap((g) => g.items).filter((i) => `${i.title} ${i.blurb} ${describe(i.assertion)}`.toLowerCase().includes(q))
      main.append(el('h4', { class: 'lib-title', text: `${hits.length} match${hits.length === 1 ? '' : 'es'}` }), el('p', { class: 'lib-blurb', text: `For “${q}”, across every group.` }))
      main.append(hits.length ? el('div', { class: 'lib-grid' }, hits.map(card)) : el('p', { class: 'lib-none', text: 'Nothing in the library says that. Try “status”, “header” or “email”.' }))
      paintSide()
      return
    }
    const g = CATALOG.find((x) => x.id === at) ?? CATALOG[0]
    main.append(el('h4', { class: 'lib-title', text: g.label }), el('p', { class: 'lib-blurb', text: g.blurb }), el('div', { class: 'lib-grid' }, g.items.map(card)))
  }

  paintSide()
  paintMain()
  body.append(side, main)
  sheet({
    title: 'Assertion library',
    blurb: `${total} ready-made checks. Click one to add it to ${req.name || 'this request'}, then point its path at the real field.`,
    body,
    acts: [],
    wide: true
  })
  setTimeout(() => search.focus(), 0)
}

/* ------------------------------------------------------- the generator */

/**
 * A suite read off the last response, offered as a checklist.
 *
 * Every suggestion is checked against that same response before it is shown,
 * and says so — a generated test that fails on the spot teaches people to
 * ignore generated tests. Ones the request already has are left out.
 */
/**
 * What each group of suggestions is about, in the order they are offered:
 * the response as a whole first, the body's detail last.
 */
const GEN_GROUPS = {
  status: { name: 'Status', icon: I.check, blurb: 'What came back' },
  headers: { name: 'Headers', icon: I.table, blurb: 'What the server says about it' },
  performance: { name: 'Performance', icon: I.bolt, blurb: 'Budgets with headroom, not today’s numbers' },
  security: { name: 'Security', icon: I.shield, blurb: 'Transport, headers and cookies' },
  json: {
    name: 'Body fields',
    icon: '<path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2"/>',
    blurb: 'Types, formats and shape rather than values'
  },
  schema: { name: 'Schema', icon: I.flow, blurb: 'The whole body, checked at once' }
}

/**
 * Generate tests.
 *
 * Every suggestion is read off the response in hand and already passes
 * against it, so what is offered is a choice of coverage rather than a list
 * to audit. The left side says how much is chosen and switches whole
 * presets or groups at once; the right lays the suggestions out as cards,
 * each with what the response says today. Toggling a card updates it in
 * place, so focus and scroll stay where they were.
 */
function openGenerator(req) {
  const res = S.results.get(req.id)
  if (!res || res.error) {
    toast('bad', 'Send the request first — suggestions are read off a real response.')
    return
  }
  const keyOf = (a) => `${a.subject}|${a.op}|${a.path ?? ''}|${a.value ?? ''}`
  const have = new Set((req.assertions ?? []).map(keyOf))
  const offers = suggestTests(res)
    .filter((s) => !have.has(keyOf(s.assertion)))
    .map((s) => ({ ...s, now: check(s.assertion, res) }))
  if (!offers.length) {
    toast('ok', 'This request already checks everything Prism would suggest.')
    return
  }

  const recommended = () => new Set(offers.filter((s) => s.picked).map((s) => s.assertion.id))
  let chosen = recommended()
  const order = Object.keys(GEN_GROUPS)
  const groups = [...new Set(offers.map((s) => s.group))].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const meta = (g) => GEN_GROUPS[g] ?? { name: g, icon: I.check, blurb: '' }
  const inGroup = (g) => offers.filter((s) => s.group === g)

  /* ------------------------------------------------------------ the side */
  const ring = el('div', { class: 'gen-ring' })
  const tally = el('b')
  const presets = el('div', { class: 'seg gen-presets' })
  const PRESETS = [
    ['recommended', 'Suggested', recommended],
    ['all', 'All', () => new Set(offers.map((s) => s.assertion.id))],
    ['none', 'None', () => new Set()]
  ]
  const presetBtns = PRESETS.map(([id, label, make]) =>
    el('button', { class: 'segbtn', type: 'button', 'data-preset': id, text: label, onclick: () => {
      chosen = make()
      refresh()
    } })
  )
  presets.append(...presetBtns)

  const catCounts = new Map()
  const cats = el('nav', { class: 'gen-cats', 'aria-label': 'Groups' },
    groups.map((g) => {
      const count = el('span', { class: 'gen-cat-count' })
      catCounts.set(g, count)
      return el('button', { class: 'gen-cat', type: 'button', onclick: () => sections.get(g)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [
        el('span', { class: 'gen-cat-ico', html: ico(meta(g).icon, 13, 2) }),
        el('span', { class: 'gen-cat-name', text: meta(g).name }),
        count
      ])
    })
  )

  const side = el('aside', { class: 'gen-side' }, [
    el('div', { class: 'gen-score' }, [ring, el('div', { class: 'gen-score-words' }, [tally, el('span', { text: 'tests selected' })])]),
    presets,
    cats,
    el('p', {
      class: 'gen-note',
      html: `Read from the <b>${esc(String(res.status))}</b> response at ${esc(new Date(res.at).toLocaleTimeString())}. Types, formats and shapes rather than today’s values, so the suite still passes tomorrow.`
    })
  ])

  /* ------------------------------------------------------------ the cards */
  const cards = new Map()
  const sections = new Map()
  const toggles = new Map()
  const toggle = (id) => {
    if (chosen.has(id)) chosen.delete(id)
    else chosen.add(id)
    refresh()
  }
  const main = el('div', { class: 'gen-main' },
    groups.map((g) => {
      const all = el('button', { class: 'gen-all', type: 'button', onclick: () => {
        const ids = inGroup(g).map((s) => s.assertion.id)
        const every = ids.every((id) => chosen.has(id))
        for (const id of ids) every ? chosen.delete(id) : chosen.add(id)
        refresh()
      } })
      toggles.set(g, all)
      const section = el('section', { class: 'gen-sec' }, [
        el('header', { class: 'gen-sec-head' }, [
          el('span', { class: 'gen-cat-ico', html: ico(meta(g).icon, 14, 2) }),
          el('div', { class: 'gen-sec-words' }, [el('b', { text: meta(g).name }), el('span', { text: meta(g).blurb })]),
          all
        ]),
        el('div', { class: 'gen-cards' },
          inGroup(g).map((s) => {
            const detail = s.label === describe(s.assertion) ? s.now.detail : describe(s.assertion)
            const card = el('button', { class: `gen-card${s.now.ok ? '' : ' bad'}`, type: 'button', title: s.now.detail, onclick: () => toggle(s.assertion.id) }, [
              el('span', { class: 'gen-tick', html: ico(I.check, 11, 3) }),
              el('span', { class: 'gen-card-words' }, [el('b', { text: s.label }), el('code', { text: detail })]),
              s.now.ok ? null : el('span', { class: 'gen-fails', text: 'fails now' })
            ])
            cards.set(s.assertion.id, card)
            return card
          })
        )
      ])
      sections.set(g, section)
      return section
    })
  )

  const body = el('div', { class: 'gen2' }, [side, main])
  const footNote = el('span', { class: 'gen-foot' })

  function refresh() {
    const n = chosen.size
    ring.replaceChildren(scoreRing(n, offers.length, n ? 'pass' : 'idle', 64))
    tally.textContent = `${n} of ${offers.length}`
    for (const [id, card] of cards) {
      const on = chosen.has(id)
      card.classList.toggle('on', on)
      card.setAttribute('aria-pressed', String(on))
    }
    for (const g of groups) {
      const ids = inGroup(g).map((s) => s.assertion.id)
      const picked = ids.filter((id) => chosen.has(id)).length
      catCounts.get(g).textContent = `${picked}/${ids.length}`
      catCounts.get(g).classList.toggle('full', picked === ids.length)
      toggles.get(g).textContent = picked === ids.length ? 'Clear' : 'Select all'
    }
    const same = (set) => set.size === chosen.size && [...set].every((id) => chosen.has(id))
    for (const [i, [, , make]] of PRESETS.entries()) presetBtns[i].classList.toggle('on', same(make()))

    const failing = offers.filter((s) => chosen.has(s.assertion.id) && !s.now.ok).length
    footNote.textContent = !n
      ? 'Nothing selected'
      : failing
        ? `${failing} of these fail against this response`
        : `All ${n === 1 ? 'of it passes' : `${n} pass`} against this response`
    footNote.classList.toggle('bad', failing > 0)
    const go = document.querySelector('#veil .sheet-low .btn.go')
    if (go) {
      go.textContent = n ? `Add ${n} test${n === 1 ? '' : 's'}` : 'Add tests'
      go.disabled = !n
    }
  }

  sheet({
    title: `Generate tests for ${req.name || 'this request'}`,
    blurb: 'Pick the coverage you want; every suggestion is read off the last response.',
    body,
    wide: true,
    acts: [
      {
        label: 'Add tests',
        go: true,
        onClick: () => {
          const picked = offers.filter((s) => chosen.has(s.assertion.id)).map((s) => s.assertion)
          if (!picked.length) return
          req.assertions = [...(req.assertions ?? []), ...picked]
          S.editTab = 'tests'
          // Checked against the response already in hand, so the rows arrive
          // green instead of waiting for the next send.
          res.checks = runAll(req.assertions, res)
          res.failed = res.checks.filter((c) => !c.ok).length
          commit()
          toast('ok', `${picked.length} assertion${picked.length === 1 ? '' : 's'} added`)
        }
      }
    ]
  })
  // Said beside the button that acts on it.
  document.querySelector('#veil .sheet-low .spacer')?.after(footNote)
  document.querySelector('#veil .sheet')?.classList.add('gen-sheet')
  refresh()
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
  if (S.respTab === 'messages') return messagesPanel(req)
  if (S.respTab === 'brief') return briefPanel(req)
  // Drift is about the baseline, which exists whether or not this session has
  // sent anything — its panel explains both cases itself.
  if (S.respTab === 'drift') return driftPanel(req, res)
  // Before a send the tests are still worth listing: what will be checked.
  if (S.respTab === 'tests') return testResultsPanel(res, req)
  if (S.respTab === 'contract') return contractPanel(req, res)
  if (!res) return el('div', { class: 'nothing', text: 'Send this request and the analysis appears here.' })
  switch (S.respTab) {
    case 'payload':
      return payloadPanel(res, req)
    case 'headers':
      return headersPanel(res, req)
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
    case 'console':
      return consolePanel(res)
    default:
      return resultPanel(res, req)
  }
}

/**
 * The response against the collection's OpenAPI document: which operation it
 * is, which responses the spec documents, and every way this one differs.
 */
function contractPanel(req, res) {
  const col = chainFor(req)[0]
  const spec = col?.spec
  if (!spec) {
    return el('div', { class: 'studio-empty' }, [
      el('b', { text: 'No OpenAPI spec on this collection' }),
      el('p', { text: 'Attach the API’s OpenAPI or Swagger document, and every response is checked against it — status, content type, body schema and required headers.' }),
      col ? el('button', { class: 'btn', type: 'button', text: 'Attach a spec…', onclick: () => attachSpec(col) }) : null
    ])
  }
  const match = matchOperation(spec, req.method, req.url)
  const box = el('div', { class: 'ct' })
  if (!match) {
    box.append(
      el('div', { class: 'find warn' }, [
        el('div', { class: 'find-bar' }),
        el('div', {}, [el('b', { text: 'Not in the spec' }), el('p', { text: `${String(req.method).toUpperCase()} ${req.url || '(no URL)'} matches no operation in ${spec.title}. Check the path, or that the spec covers it.` })])
      ])
    )
    box.append(contractFoot(col))
    return box
  }
  const op = match.op
  const current = res && !res.error ? responseFor(spec, op, res.status)?.key : null
  box.append(
    el('div', { class: 'ct-op' }, [
      el('span', { class: `verb ${match.method}`, text: match.method.toUpperCase() }),
      el('code', { class: 'ct-route', text: match.route }),
      op.summary || op.operationId ? el('span', { class: 'ct-sum', text: op.summary || op.operationId }) : null
    ]),
    el('div', { class: 'ct-codes' }, [
      el('span', { class: 'ct-label', text: 'Documented' }),
      ...Object.keys(op.responses ?? {}).map((code) => el('span', { class: `ct-code${code === current ? ' on' : ''}`, title: String(op.responses[code]?.description ?? ''), text: code }))
    ])
  )
  if (!res) {
    box.append(el('p', { class: 'nothing', text: 'Send the request and the response is checked against this operation.' }))
  } else if (res.error) {
    box.append(el('p', { class: 'nothing', text: 'No response came back, so there was nothing to check.' }))
  } else {
    const findings = res.contract?.findings ?? []
    const errors = findings.filter((f) => f.level === 'error')
    const warns = findings.filter((f) => f.level === 'warn')
    box.append(
      el('div', { class: `ct-verdict ${errors.length ? 'bad' : warns.length ? 'warn' : 'ok'}` }, [
        el('span', { class: 'ct-verdict-ico', html: ico(errors.length ? I.x : I.check, 14, 2.6) }),
        el('div', {}, [
          el('b', { text: errors.length ? `${errors.length} way${errors.length === 1 ? '' : 's'} this response breaks the spec` : warns.length ? 'Keeps the contract — the spec has some catching up to do' : 'Keeps the contract' }),
          el('span', { text: errors.length ? 'Each one fails as a check, in Tests and in reports.' : warns.length ? `${warns.length} field${warns.length === 1 ? '' : 's'} came back that the spec does not mention.` : `Status, content type, schema and required headers all as ${spec.title} documents.` })
        ])
      ])
    )
    const list = (items, tone) =>
      items.length
        ? el('ul', { class: `ct-finds ${tone}` }, items.map((f) => el('li', {}, [el('span', { text: f.message })])))
        : null
    box.append(...[list(errors, 'bad'), warns.length ? el('h4', { class: 'ct-sub', text: 'Not in the spec' }) : null, list(warns, 'warn')].filter(Boolean))
  }
  box.append(contractFoot(col))
  return box
}

/** Where the spec came from, whether it fails checks, and the way to its coverage. */
function contractFoot(col) {
  const spec = col.spec
  return el('div', { class: 'ct-foot' }, [
    el('span', { text: `${spec.title}${spec.version ? ` ${spec.version}` : ''} · ${spec.openapi ? `OpenAPI ${spec.openapi}` : `Swagger ${spec.swagger ?? ''}`}` }),
    el('label', { class: 'ct-enforce' }, [
      el('input', { class: 'tick', type: 'checkbox', checked: col.specCheck !== false, onchange: (e) => {
        col.specCheck = e.target.checked
        commit()
      } }),
      el('span', { text: 'Fail checks that break it' })
    ]),
    el('button', { class: 'btn plain sm', type: 'button', text: 'Spec coverage', onclick: () => {
      runner.target = `col:${col.id}`
      openRunner('contract')
    } })
  ])
}

/** Reads an OpenAPI or Swagger document, JSON or YAML, onto a collection. */
async function attachSpec(col) {
  const chosen = await window.prism.file.open([{ name: 'OpenAPI or Swagger', extensions: ['json', 'yaml', 'yml'] }])
  if (!chosen) return
  if (chosen.error) {
    toast('bad', chosen.error)
    return
  }
  let doc
  try {
    doc = /^\s*[[{]/.test(chosen.text) ? JSON.parse(chosen.text) : loadYaml(chosen.text)
  } catch (err) {
    toast('bad', `${chosen.name} could not be read — ${String(err.reason || err.message).split('\n')[0]}`)
    return
  }
  const spec = prepareSpec(doc, chosen.name)
  if (!spec || !(doc.openapi || doc.swagger)) {
    toast('bad', `${chosen.name} is not an OpenAPI or Swagger document.`)
    return
  }
  col.spec = spec
  const requests = col.flows.flatMap((f) => f.requests)
  const matched = requests.filter((x) => matchOperation(spec, x.method, x.url)).length
  commit()
  toast('ok', `${spec.title} attached — ${matched} of ${requests.length} request${requests.length === 1 ? '' : 's'} match an operation`)
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

/**
 * The verdict on one response: four numbers, then every assertion as the
 * sentence it checks and what the response actually said. Failures first,
 * because a report that makes you scroll past six greens to find the red is
 * a report that hides the red.
 */
function resultPanel(res, req) {
  const box = el('div')
  const gql = gqlPanel(res)
  if (gql) box.append(gql)
  if (res.error) {
    box.append(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'No response' }), el('p', { text: res.error })])]))
    return box
  }
  const secure = res.secure === true || Boolean(res.request?.url?.startsWith('https'))
  box.append(
    el('div', { class: 'tiles' }, [
      tile(tone(res.status), String(res.status), word(res.status)),
      tile(res.timing.total > 1000 ? 'warn' : 'info', `${res.timing.total} ms`, 'time'),
      tile('', fmtBytes(res.bytes), 'size'),
      tile(secure ? 'ok' : 'warn', secure ? 'HTTPS' : 'HTTP', secure ? 'encrypted' : 'not encrypted')
    ])
  )

  box.append(testsReport(res, req))
  return box
}

/**
 * The response's Tests tab: every assertion, passed or failed, with what the
 * response actually said. Before anything is sent it lists what will be
 * checked, each marked as not run yet.
 */
function testResultsPanel(res, req) {
  if (res?.error) {
    return el('div', { class: 'find bad' }, [
      el('div', { class: 'find-bar' }),
      el('div', {}, [
        el('b', { text: 'No response, so nothing was checked' }),
        el('p', { text: res.error }),
        aiOn() && !res.skipped ? el('button', { class: 'btn sm', type: 'button', html: `${ico(I.sparkle, 12, 1.9)}<span>Explain</span>`, onclick: () => explainWithAi(req, res) }) : null
      ])
    ])
  }
  if (res) return testsReport(res, req)

  const waiting = (req.assertions ?? []).filter((a) => a && a.on !== false)
  if (!waiting.length) return testsReport({ checks: [] }, req)
  return el('div', { class: 'report' }, [
    el('div', { class: 'report-head' }, [
      scoreRing(0, waiting.length, 'idle', 56),
      el('div', { class: 'report-words' }, [
        el('b', { text: `${waiting.length} test${waiting.length === 1 ? '' : 's'} to run` }),
        el('span', { text: 'Send the request and each one is marked passed or failed here.' })
      ])
    ]),
    ...waiting.map((a) =>
      el('div', { class: 'rcheck wait' }, [
        el('span', { class: 'rcheck-ico', html: ico('<circle cx="12" cy="12" r="4"/>', 11, 2.4) }),
        el('div', { class: 'rcheck-words' }, [el('b', { text: describe(a) }), el('span', { text: 'Not run yet' })]),
        el('span', { class: 'rcheck-tag', text: SUBJECTS.find((x) => x.id === a.subject)?.label ?? a.subject })
      ])
    )
  ])
}

/**
 * Every assertion's verdict on one response, failures first — a report that
 * makes you scroll past six greens to find the red is a report that hides the
 * red. Shared by the Result and Tests tabs, so they can never disagree.
 */
function testsReport(res, req) {
  const box = el('div')
  const checks = res.checks ?? []
  if (!checks.length) {
    box.append(
      el('div', { class: 'studio-empty' }, [
        el('span', { html: ico(I.check, 20, 2.2) }),
        el('b', { text: 'Nothing checked this response' }),
        el('p', { text: 'Generate a suite from it — status, headers, types, formats and shape, each already passing — or pick checks from the library.' }),
        req
          ? el('div', { class: 'studio-acts' }, [
              el('button', { class: 'btn sm go', type: 'button', html: `${ico(I.sparkle, 12, 1.9)}<span>Generate tests</span>`, onclick: () => openGenerator(req) }),
              el('button', { class: 'btn sm', type: 'button', html: `${ico(I.library, 12, 1.9)}<span>Library</span>`, onclick: () => openLibrary(req) })
            ])
          : null
      ])
    )
    return box
  }

  const failed = checks.filter((c) => !c.ok)
  const state = failed.length ? 'fail' : 'pass'
  box.append(
    el('div', { class: 'report' }, [
      el('div', { class: `report-head ${state}` }, [
        scoreRing(checks.length - failed.length, checks.length, state, 56),
        el('div', { class: 'report-words' }, [
          el('b', { text: failed.length ? `${failed.length} of ${checks.length} assertion${checks.length === 1 ? '' : 's'} failed` : checks.length === 1 ? 'The assertion passed' : `All ${checks.length} assertions passed` }),
          el('span', { text: failed.length ? `First failure: ${describe(failed[0].assertion)}` : `Checked at ${new Date(res.at).toLocaleTimeString()}` })
        ]),
        req && failed.length && aiOn() ? el('button', { class: 'btn sm', type: 'button', html: `${ico(I.sparkle, 12, 1.9)}<span>Explain</span>`, title: 'Ask the AI assistant why this failed', onclick: () => explainWithAi(req, res) }) : null,
        req ? el('button', { class: 'btn sm', type: 'button', text: 'Edit tests', onclick: () => {
          S.editTab = 'tests'
          if (S.pane === 'response') S.pane = 'split'
          paintBench()
        } }) : null
      ]),
      ...[...failed, ...checks.filter((c) => c.ok)].map((c) =>
        el('div', { class: `rcheck ${c.ok ? 'pass' : 'fail'}` }, [
          el('span', { class: 'rcheck-ico', html: ico(c.ok ? I.check : I.x, 11, 2.8) }),
          el('div', { class: 'rcheck-words' }, [el('b', { text: describe(c.assertion) }), el('span', { text: c.detail })]),
          el('span', { class: 'rcheck-tag', text: checkLabel(c.assertion.subject) })
        ])
      )
    ])
  )
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
    // The type and the format survive the next call; the value often does
    // not. These are the assertions worth keeping on an id or a timestamp.
    ...fieldChecks(line).map(({ label, fields }) => ({
      label,
      icon: I.check,
      run: () => {
        req.assertions = [...(req.assertions ?? []), emptyAssertion({ subject: 'json', path: line.path, ...fields })]
        S.editTab = 'tests'
        commit()
        toast('ok', `${describe({ subject: 'json', path: line.path, ...fields })}`)
      }
    })),
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

/** Durable checks a value suggests: its type, and a format when it has one. */
function fieldChecks(line) {
  const v = line.value
  const type = v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v
  const out = [{ label: `Assert it is ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`, fields: { op: 'isType', value: type } }]
  if (typeof v === 'string') {
    const format = ['email', 'uuid', 'date-time', 'date', 'uri', 'jwt', 'ipv4', 'semver'].find((f) => FORMATS[f]?.test(v))
    if (format) out.push({ label: `Assert it is a valid ${FORMATS[format].label.replace(/ \(.*\)$/, '')}`, fields: { op: 'isFormat', value: format } })
    if (v) out.push({ label: 'Assert it is not empty', fields: { op: 'notEmpty', value: '' } })
  }
  if (typeof v === 'number' && v > 0) out.push({ label: 'Assert it is over 0', fields: { op: 'greaterThan', value: '0' } })
  return out
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

function headersPanel(res, req) {
  const box = el('div')
  box.append(el('div', { class: 'lbl' }, [el('span', { text: 'Response' }), req ? el('em', { text: 'the + beside a name asserts on it' }) : null]))
  const a = el('dl', { class: 'pairs' })
  for (const [k, v] of Object.entries(res.headers ?? {})) {
    const assertOn = (fields) => {
      req.assertions = [...(req.assertions ?? []), emptyAssertion({ subject: 'header', path: k, ...fields })]
      S.editTab = 'tests'
      commit()
      toast('ok', describe({ subject: 'header', path: k, ...fields }))
    }
    const act = req
      ? el('button', {
          class: 'hdr-act',
          type: 'button',
          title: `Assert on ${k}`,
          'aria-label': `Assert on ${k}`,
          html: ico(I.plus, 10, 2.6),
          onclick: (e) =>
            openMenu(e.currentTarget, [
              { label: `Assert ${k} is present`, icon: I.check, run: () => assertOn({ op: 'exists', value: '' }) },
              { label: `Assert it equals ${String(v).length > 24 ? `${String(v).slice(0, 21)}…` : v}`, icon: I.check, run: () => assertOn({ op: 'equals', value: String(v) }) }
            ])
        })
      : null
    a.append(el('dt', {}, [document.createTextNode(k), act]), el('dd', { text: v }))
  }
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
    danger: 'Send it',
    tone: 'hold'
  })
}

async function send(req, { confirmed = false, quiet = false } = {}) {
  if (isStream(req)) return toggleStream(req)
  if (S.busy.has(req.id)) return
  if (!confirmed && !(await productionOk(`${req.method} ${buildUrl(req, envValues())}`))) return

  S.busy.add(req.id)
  commit()

  const out = await sendOnce(req, envValues())
  S.busy.delete(req.id)
  if (out.skipped && !out.failed) {
    commit()
    if (!quiet) toast('hold', out.error)
    return out
  }
  if (out.error) {
    commit()
    toast('bad', out.error)
    return out
  }
  // Only move off the pre-send tab, and onto what came back: the payload is
  // what a send is for. Watching Drift, pressing Send and landing somewhere
  // else would be the tool deciding what you meant to look at. A failed check
  // still shows on the Response line and on the Tests tab's count.
  if (S.respTab === 'brief') S.respTab = 'payload'
  commit()
  // A run reports once, at the end; a toast per request stacked four deep.
  if (!quiet) toast(out.failed ? 'bad' : 'ok', `${req.name} — ${out.status} in ${out.timing.total}ms${out.logic?.items ? ` · ${out.logic.items.length} items` : out.logic?.tries > 1 ? ` · ${out.logic.tries} tries` : ''}`)
  return out
}

/* ========================================================= AI assistant */

/**
 * Asking the assistant: explain a failure, or suggest checks. Off unless a
 * provider is chosen in Settings → AI. Every question is shown in full before
 * it is sent — credentials masked, secret values replaced — and the key stays
 * in main.cjs's encrypted store.
 */
const aiOn = () => Boolean(AI_PROVIDERS[S.prefs.aiProvider])
const secretValues = () => S.environments.flatMap((e) => (e.secrets ?? []).map((k) => e.values?.[k]).filter(Boolean))
const aiMask = (t) => sampleOf(t, { lines: 400, chars: 20000 })

async function askAi({ title, blurb, question, onAnswer }) {
  const provider = S.prefs.aiProvider
  const p = AI_PROVIDERS[provider]
  if (!p) {
    toast('hold', 'Choose an AI provider in Settings → AI first')
    openSettings('AI')
    return
  }
  const hasKey = p.needsKey ? await window.prism.ai.hasKey() : true
  const body = el('div', { class: 'ai' })
  const keyRow = el('div', { class: 'ai-key' })
  const paintKey = (has) => {
    if (!p.needsKey) {
      keyRow.replaceChildren(el('span', { class: 'rn-hint', text: `${p.label} — the question stays on this machine.` }))
      return
    }
    if (has) {
      keyRow.replaceChildren(
        el('span', { class: 'rn-hint', text: `${p.label} · your key is kept in this system’s encrypted store` }),
        el('button', { class: 'btn plain sm', type: 'button', text: 'Remove the key', onclick: async () => {
          await window.prism.ai.clearKey()
          paintKey(false)
        } })
      )
      return
    }
    const input = el('input', { class: 'lg-input', type: 'password', placeholder: `Your ${p.label} API key`, 'aria-label': 'API key' })
    keyRow.replaceChildren(
      input,
      el('button', { class: 'btn sm go', type: 'button', text: 'Keep the key', onclick: async () => {
        const out = await window.prism.ai.setKey(input.value)
        if (!out?.ok) toast('bad', out?.error ?? 'The key was not kept')
        else paintKey(true)
      } })
    )
  }
  paintKey(hasKey)
  const answer = el('div', { class: 'ai-answer' })
  body.append(
    keyRow,
    el('details', { class: 'ai-sent' }, [
      el('summary', { text: `What will be sent to ${p.label}${S.prefs.aiModel ? ` (${S.prefs.aiModel})` : ''}` }),
      el('pre', { class: 'ai-pre', text: question.prompt })
    ]),
    answer
  )
  sheet({
    title,
    blurb,
    body,
    wide: true,
    acts: [{ label: 'Ask', go: true, keepOpen: true, onClick: async () => {
      answer.replaceChildren(el('p', { class: 'nothing', text: 'Asking…' }))
      const out = await window.prism.ai.ask({ provider, model: S.prefs.aiModel, baseUrl: S.prefs.aiBaseUrl, system: question.system, prompt: question.prompt })
      if (!out?.ok) {
        answer.replaceChildren(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'The assistant could not answer' }), el('p', { text: out?.error ?? '' })])]))
        return
      }
      onAnswer(out.text, answer)
    } }]
  })
}

function explainWithAi(req, res) {
  const named = { ...res, checks: (res.checks ?? []).map((c) => ({ ok: c.ok, name: describe(c.assertion), detail: c.detail })) }
  askAi({
    title: `Why did ${req.name || 'this request'} fail?`,
    blurb: 'The request as written, what came back and the checks that failed go to the assistant. Expand below to read exactly what is sent.',
    question: failurePrompt({ req: { method: verbOf(req), url: req.url }, res: named, mask: aiMask, secrets: secretValues() }),
    onAnswer: (text, host) => host.replaceChildren(el('div', { class: 'ai-text', text }))
  })
}

function suggestWithAi(req) {
  const res = S.results.get(req.id)
  if (!res || res.error) return
  const subjects = SUBJECTS.filter((x) => OPERATORS[x.id]?.length).map((x) => ({ id: x.id, path: ['json', 'header', 'cookie', 'schema'].includes(x.id), ops: OPERATORS[x.id] }))
  const allowed = new Map(subjects.map((x) => [x.id, new Set(x.ops)]))
  askAi({
    title: `Checks for ${req.name || 'this request'}`,
    blurb: 'The last response goes to the assistant, which suggests checks in Prism’s own terms. Each is tried on that response before you add it.',
    question: testsPrompt({ req: { method: verbOf(req), url: req.url }, res, subjects, mask: aiMask, secrets: secretValues() }),
    onAnswer: (text, host) => {
      const got = parseSuggestions(text, allowed)
      if (!got.ok || !got.items.length) {
        host.replaceChildren(el('p', { class: 'nothing', text: got.error || 'No usable checks came back.' }))
        return
      }
      const rows = got.items.map((x) => {
        const assertion = emptyAssertion({ subject: x.subject, op: x.op, path: x.path, value: x.value })
        const [result] = runAll([assertion], res)
        return { assertion, why: x.why, ok: Boolean(result?.ok), detail: result?.detail ?? '', keep: Boolean(result?.ok) }
      })
      const paint = () =>
        host.replaceChildren(
          el('p', { class: 'rn-hint', text: `${rows.length} suggested — ${rows.filter((x) => x.ok).length} pass on the last response and are ticked.${got.dropped.length ? ` ${got.dropped.length} suggestion${got.dropped.length === 1 ? '' : 's'} used a check Prism does not have and ${got.dropped.length === 1 ? 'was' : 'were'} left out.` : ''}` }),
          ...rows.map((x) =>
            el('label', { class: `ai-check ${x.ok ? 'pass' : 'fail'}` }, [
              el('input', { class: 'tick', type: 'checkbox', checked: x.keep, onchange: (e) => (x.keep = e.target.checked) }),
              el('div', { class: 'rcheck-words' }, [el('b', { text: describe(x.assertion) }), el('span', { text: x.why || x.detail })]),
              el('span', { class: 'rcheck-tag', text: x.ok ? 'passes now' : 'fails now' })
            ])
          ),
          el('button', { class: 'btn go', type: 'button', text: 'Add the ticked checks', onclick: () => {
            const add = rows.filter((x) => x.keep)
            ;(req.assertions ??= []).push(...add.map((x) => x.assertion))
            closeSheet()
            S.editTab = 'tests'
            commit()
            toast('ok', `${add.length} check${add.length === 1 ? '' : 's'} added`)
          } })
        )
      paint()
    }
  })
}

/* ================================================================ logic */

/**
 * A step's logic: run only if, wait first, repeat for each, repeat until,
 * and whether a failure stops its flow. Conditions are lib/logic.js's small
 * language, checked as they are typed.
 */
function logicPanel(req) {
  req.logic = req.logic ?? {}
  const L = req.logic
  const box = el('div', { class: 'lg' })
  const set = (key, value) => {
    L[key] = value
    touch()
    paintNodeOnly(req)
  }
  const verdict = (text, hint) => {
    if (!String(text ?? '').trim()) return el('span', { class: 'lg-ok idle', text: hint })
    const p = parseCondition(text)
    return el('span', { class: `lg-ok ${p.ok ? 'ok' : 'bad'}`, text: p.ok ? 'Reads fine' : p.error })
  }
  const cond = (key, placeholder, hint, examples) => {
    const status = el('span')
    const input = el('input', { class: 'lg-input', spellcheck: 'false', placeholder, value: L[key] ?? '', oninput: (e) => {
      set(key, e.target.value)
      status.replaceChildren(verdict(e.target.value, hint))
    } })
    status.append(verdict(L[key], hint))
    return el('div', { class: 'lg-field' }, [
      input,
      el('div', { class: 'lg-under' }, [
        status,
        el('span', { class: 'lg-eg' }, examples.map((x) => el('button', { class: 'lg-chip', type: 'button', text: x, onclick: () => {
          input.value = x
          set(key, x)
          status.replaceChildren(verdict(x, hint))
        } })))
      ])
    ])
  }
  const num = (key, min, max, step, fallback) => el('input', { class: 'rn-num', type: 'number', min: String(min), max: String(max), step: String(step), value: String(L[key] ?? fallback), onchange: (e) => set(key, Math.max(min, Math.min(max, Number(e.target.value) || fallback))) })
  const section = (title, blurb, body) => el('section', { class: 'lg-sec' }, [el('header', {}, [el('b', { text: title }), el('span', { text: blurb })]), body])

  const eachStatus = el('span', { class: 'lg-ok idle' })
  const showEach = () => {
    const v = String(L.each ?? '').trim()
    if (!v) {
      eachStatus.className = 'lg-ok idle'
      eachStatus.textContent = 'A JSON list, or var.name holding one — each item is {{item}}, and {{item.id}} for an object’s fields.'
      return
    }
    const got = itemsOf(v, envValues())
    eachStatus.className = `lg-ok ${got.ok ? 'ok' : 'bad'}`
    eachStatus.textContent = got.ok ? `${got.items.length} item${got.items.length === 1 ? '' : 's'} now` : got.error
  }
  showEach()

  box.append(
    el('p', { class: 'lg-intro', text: 'Make this step conditional, patient or repeated. Conditions read status, time, json.…, header.…, var.… and item, compared with ==, !=, <, >, contains, matches or exists, joined with and, or and not.' }),
    section('Run only if', 'Otherwise the step is skipped, and the flow goes on.', cond('when', 'var.role == "admin"', 'Leave empty to always run.', ['var.user_id exists', 'var.role == "admin"'])),
    section('Wait first', 'Before it is sent — for a job to start, or a rate limit.', el('div', { class: 'lg-row' }, [num('waitMs', 0, LOGIC_LIMITS.waitMs, 100, 0), el('span', { class: 'rn-hint', text: 'ms' })])),
    section('Repeat for each', 'Once per item of a list, sent in order.', el('div', { class: 'lg-field' }, [
      el('input', { class: 'lg-input', spellcheck: 'false', placeholder: 'var.skus   or   ["LMP-204","CHR-118"]', value: L.each ?? '', oninput: (e) => {
        set('each', e.target.value)
        showEach()
      } }),
      el('div', { class: 'lg-under' }, [eachStatus])
    ])),
    section('Repeat until', 'Send again until the response says so — a job finishing, an index catching up.', el('div', { class: 'lg-field' }, [
      cond('until', 'json.status == "done"', 'Leave empty to send once.', ['json.status == "done"', 'status == 200', 'json.items.length > 0']),
      el('div', { class: 'lg-row' }, [el('span', { class: 'rn-hint', text: 'every' }), num('everyMs', LOGIC_LIMITS.everyMs, 600000, 100, 1000), el('span', { class: 'rn-hint', text: 'ms, up to' }), num('tries', 1, LOGIC_LIMITS.tries, 1, 10), el('span', { class: 'rn-hint', text: 'tries' })])
    ])),
    section('If it fails', 'A failed send, check or condition.', el('div', { class: 'seg lg-fail' }, [['continue', 'Carry on with the flow'], ['stop', 'Stop the flow']].map(([v, t]) =>
      el('button', { class: `segbtn${onFailOf(L) === v ? ' on' : ''}`, type: 'button', text: t, onclick: () => {
        set('onFail', v)
        paintBench()
      } })
    )))
  )
  return box
}

const onFailOf = (L) => (L.onFail === 'stop' ? 'stop' : 'continue')

/** Repaints a node's badges without rebuilding the whole plane while typing. */
function paintNodeOnly(req) {
  clearTimeout(paintNodeOnly.t)
  paintNodeOnly.t = setTimeout(() => {
    paintPlane()
    const tab = [...document.querySelectorAll('#editTabs .tab')].find((t) => t.textContent.startsWith('Logic'))
    const n = describeRules(rulesOf(req)).length
    if (tab) tab.innerHTML = `Logic${n ? `<b>${n}</b>` : ''}`
  }, 250)
}

/* ================================================================= gRPC */

/**
 * A gRPC request: its .proto, carried with it, and the service and method to
 * call. The message is the request's body, as JSON; the address bar holds
 * host:port (grpcs:// for TLS). Headers go as metadata.
 */
const protoInfo = new Map()

async function describeOf(req) {
  const key = req.grpc?.proto ?? ''
  if (!key.trim()) return null
  if (!protoInfo.has(key)) protoInfo.set(key, window.prism.grpc.describe({ proto: key, name: req.grpc.protoName || 'request.proto' }))
  return protoInfo.get(key)
}

async function loadProtoFile(req) {
  const chosen = await window.prism.file.open([{ name: 'Protocol Buffers', extensions: ['proto'] }])
  if (!chosen) return
  if (chosen.error) {
    toast('bad', chosen.error)
    return
  }
  const d = await window.prism.grpc.describe({ proto: chosen.text, name: chosen.name })
  if (!d?.ok) {
    toast('bad', d?.error ?? 'That .proto could not be read')
    return
  }
  const first = d.services[0]
  req.grpc = { proto: chosen.text, protoName: chosen.name, service: first?.name ?? '', method: first?.methods[0]?.name ?? '' }
  const m = first?.methods[0]
  if (m && (!String(req.body ?? '').trim() || req.body.trim() === '{}')) req.body = JSON.stringify(m.example, null, 2)
  req.bodyKind = 'json'
  commit()
  toast('ok', `${chosen.name} — ${d.services.length} service${d.services.length === 1 ? '' : 's'}, ${d.services.reduce((n, x) => n + x.methods.length, 0)} methods`)
}

function grpcPanel(req) {
  const box = el('div', { class: 'gr' })
  const g = req.grpc ?? {}
  if (!String(g.proto ?? '').trim()) {
    box.append(
      el('div', { class: 'studio-empty' }, [
        el('b', { text: 'Load the service’s .proto file' }),
        el('p', { text: 'Prism reads the services and methods from it and fills in an example message. Put host:port in the address bar — grpcs://host:port for TLS — and headers are sent as metadata.' }),
        el('button', { class: 'btn go', type: 'button', text: 'Load a .proto…', onclick: () => loadProtoFile(req) })
      ])
    )
    return box
  }
  box.append(el('p', { class: 'nothing', text: 'Reading the .proto…' }))
  describeOf(req).then((d) => {
    if (!d?.ok) {
      box.replaceChildren(el('div', { class: 'find bad' }, [el('div', { class: 'find-bar' }), el('div', {}, [el('b', { text: 'The .proto could not be read' }), el('p', { text: d?.error ?? '' })])]), el('button', { class: 'btn', type: 'button', text: 'Load another .proto…', onclick: () => loadProtoFile(req) }))
      return
    }
    const svc = d.services.find((x) => x.name === g.service) ?? d.services[0]
    const method = svc?.methods.find((m) => m.name === g.method) ?? svc?.methods[0]
    const field = (label, control) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control])
    const editor = el('textarea', { class: 'code-area gr-message', spellcheck: 'false', rows: '10', value: req.body ?? '{}', oninput: (e) => {
      req.body = e.target.value
      req.bodyKind = 'json'
      touch()
    } })
    box.replaceChildren(
      el('div', { class: 'gr-file' }, [
        el('span', { class: 'gr-proto', text: g.protoName || 'request.proto' }),
        el('span', { class: 'rn-hint', text: `${d.services.length} service${d.services.length === 1 ? '' : 's'}` }),
        el('button', { class: 'btn plain sm', type: 'button', text: 'Replace…', onclick: () => loadProtoFile(req) })
      ]),
      el('div', { class: 'rn-row' }, [
        field('Service', el('select', { class: 'rn-select', onchange: (e) => {
          const next = d.services.find((x) => x.name === e.target.value)
          req.grpc = { ...g, service: e.target.value, method: next?.methods[0]?.name ?? '' }
          commit()
        } }, d.services.map((x) => el('option', { value: x.name, text: x.name, selected: x.name === svc?.name })))),
        field('Method', el('select', { class: 'rn-select', onchange: (e) => {
          req.grpc = { ...g, service: svc.name, method: e.target.value }
          commit()
        } }, (svc?.methods ?? []).map((m) => el('option', { value: m.name, text: `${m.name}${m.responseStream ? ' — server stream' : ''}${m.requestStream ? ' — client stream (not supported yet)' : ''}`, selected: m.name === method?.name }))))
      ]),
      method ? el('p', { class: 'rn-hint', text: `${method.requestType || 'Request'} → ${method.responseType || 'Response'}${method.responseStream ? ' (a stream: its messages come back as a list)' : ''}` }) : null,
      el('div', { class: 'gr-head' }, [
        el('b', { text: 'Message' }),
        el('span', { class: 'rn-hint', text: 'JSON, with {{variables}}. 64-bit numbers as strings.' }),
        method ? el('button', { class: 'btn plain sm', type: 'button', text: 'Use the example', onclick: () => {
          req.body = JSON.stringify(method.example, null, 2)
          req.bodyKind = 'json'
          commit()
        } }) : null
      ]),
      el('div', { class: 'code-edit' }, [editor])
    )
  })
  return box
}

/* ================================================= live connections */

/**
 * A WebSocket or Server-Sent Events request, held open: main.cjs owns the
 * socket, this keeps its state and its log. The log is the session's only —
 * live traffic is not written to the workspace.
 */
const STREAM_LOG = 1000
const streams = new Map()
const streamOf = (id) => {
  if (!streams.has(id)) streams.set(id, { status: 'idle', log: [], since: 0, protocol: '', draft: '' })
  return streams.get(id)
}

function streamLog(id, entry) {
  const st = streamOf(id)
  st.log.push({ at: Date.now(), ...entry })
  if (st.log.length > STREAM_LOG) st.log.splice(0, st.log.length - STREAM_LOG)
}

async function toggleStream(req) {
  const st = streamOf(req.id)
  if (st.status === 'open' || st.status === 'connecting') {
    await window.prism.stream.close(req.id)
    return
  }
  if (!(await productionOk(`a ${verbOf(req)} connection to ${buildUrl(req, envValues())}`))) return
  // The address and headers as a send would make them: variables, auth, inherited headers.
  const spec = compile(withInherited(req, chainFor(req)), envValues())
  st.status = 'connecting'
  st.log = []
  streamLog(req.id, { dir: 'sys', text: `Connecting to ${spec.url}…` })
  paintBench()
  const protocols = (spec.headers?.['Sec-WebSocket-Protocol'] ?? spec.headers?.['sec-websocket-protocol'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const headers = Object.fromEntries(Object.entries(spec.headers ?? {}).filter(([k]) => !/^sec-websocket-protocol$/i.test(k)))
  const out = await window.prism.stream.open({ id: req.id, kind: req.kind, url: spec.url, headers, protocols, verifyTls: S.prefs.verifyTls !== false })
  if (!out?.ok) {
    st.status = 'idle'
    streamLog(req.id, { dir: 'sys', bad: true, text: out?.error ?? 'Could not connect' })
    paintBench()
    toast('bad', out?.error ?? 'Could not connect')
  }
}

window.prism?.stream?.onEvent((ev) => {
  const st = streamOf(ev.id)
  const req = findRequest(ev.id)
  if (ev.type === 'open') {
    st.status = 'open'
    st.since = ev.at
    st.protocol = ev.protocol || ''
    streamLog(ev.id, { dir: 'sys', text: `Connected${ev.status ? ` — ${ev.status}${ev.type ? ` ${ev.type}` : ''}` : ''}${ev.protocol ? ` — protocol ${ev.protocol}` : ''}` })
    consolePush({ kind: 'log', text: `${verbOf(req)} ${req?.name ?? ''} connected to ${ev.url}` })
  } else if (ev.type === 'message') {
    streamLog(ev.id, { dir: 'in', text: ev.data, event: ev.event && ev.event !== 'message' ? ev.event : '' })
  } else if (ev.type === 'error') {
    streamLog(ev.id, { dir: 'sys', bad: true, text: ev.data })
  } else if (ev.type === 'close') {
    st.status = 'closed'
    streamLog(ev.id, { dir: 'sys', text: `Closed${ev.code ? ` — code ${ev.code}` : ''}${ev.reason ? ` — ${ev.reason}` : ''}` })
    consolePush({ kind: 'log', text: `${verbOf(req)} ${req?.name ?? ''} closed` })
  }
  if (S.pickedId === ev.id) {
    if (ev.type === 'message') paintMessages()
    else paintBench()
  }
})

async function sendStreamMessage(req, text) {
  const out = await window.prism.stream.send({ id: req.id, data: text })
  if (!out?.ok) {
    toast('bad', out?.error ?? 'Could not send')
    return false
  }
  streamLog(req.id, { dir: 'out', text })
  paintMessages()
  return true
}

function messagesPanel(req) {
  const box = el('div', { class: 'ms' })
  // The composer sits above the log, so it is in reach however long the log grows.
  const log = el('div', { class: 'ms-log', role: 'log', 'aria-live': 'polite' })
  const st = streamOf(req.id)
  const head = el('div', { class: `ms-head ${st.status}` }, [
    el('span', { class: 'rn-dot' }),
    el('b', { text: st.status === 'open' ? 'Connected' : st.status === 'connecting' ? 'Connecting…' : st.status === 'closed' ? 'Closed' : 'Not connected' }),
    el('span', { class: 'ms-meta', text: st.status === 'open' ? `${req.kind === 'ws' ? 'WebSocket' : 'Event stream'}${st.protocol ? ` · ${st.protocol}` : ''} · since ${new Date(st.since).toLocaleTimeString([], { hour12: false })}` : req.kind === 'ws' ? 'Press Connect to open the WebSocket.' : 'Press Connect to start the event stream.' }),
    st.log.length ? el('button', { class: 'btn plain sm', type: 'button', text: 'Clear', onclick: () => {
      st.log = []
      paintBench()
    } }) : null
  ])
  box.prepend(head)
  if (req.kind === 'ws') {
    const area = el('textarea', { class: 'ms-input', rows: '3', spellcheck: 'false', placeholder: st.status === 'open' ? 'A message — text or JSON. Ctrl+Enter sends.' : 'Connect first, then write a message here.', value: st.draft })
    area.addEventListener('input', () => (st.draft = area.value))
    const go = async () => {
      if (!area.value.trim() || st.status !== 'open') return
      if (await sendStreamMessage(req, area.value)) {
        st.draft = ''
        area.value = ''
      }
    }
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        e.stopPropagation()
        go()
      }
    })
    box.append(el('div', { class: 'ms-compose' }, [area, el('button', { class: 'btn go', type: 'button', html: `${ico(I.up, 12, 2.2)}<span>Send</span>`, disabled: st.status !== 'open', onclick: go })]))
  }
  box.append(log)
  queueMicrotask(paintMessages)
  return box
}

function paintMessages() {
  const req = current()
  const host = document.querySelector('#respBody .ms-log')
  if (!req || !host) return
  const st = streamOf(req.id)
  const stick = host.scrollHeight - host.scrollTop - host.clientHeight < 40
  const time = (at) => {
    const d = new Date(at)
    return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  host.replaceChildren(
    ...(st.log.length
      ? st.log.slice(-400).map((m) => {
          const shown = m.dir === 'sys' ? { text: m.text, json: false } : describeMessage(m.text)
          return el('div', { class: `ms-row ${m.dir}${m.bad ? ' bad' : ''}` }, [
            el('span', { class: 'ms-dir', 'aria-label': m.dir === 'in' ? 'received' : m.dir === 'out' ? 'sent' : 'note', text: m.dir === 'in' ? '↓' : m.dir === 'out' ? '↑' : '•' }),
            el('span', { class: 'cn-time', text: time(m.at) }),
            el('div', { class: 'ms-body' }, [m.event ? el('span', { class: 'ms-event', text: m.event }) : null, el('pre', { class: 'ms-text', text: shown.text })])
          ])
        })
      : [el('p', { class: 'nothing', text: req.kind === 'ws' ? 'Messages sent and received show here, newest last.' : 'Events the server sends show here, newest last.' })])
  )
  if (stick) host.scrollTop = host.scrollHeight
  const badge = [...document.querySelectorAll('#respTabs .tab')].find((t) => t.textContent.startsWith('Messages'))
  const n = st.log.filter((m) => m.dir !== 'sys').length
  if (badge) badge.innerHTML = `Messages${n ? `<b>${n}</b>` : ''}`
}

/* ============================================================ the sidebar */

/**
 * The strip of places down the left folds out into a sidebar with each
 * place named beside its icon, and back. Everything left of the canvas is
 * laid out from --rail-w, so widening it moves the collections, the pages
 * and the bar's divider with it. Remembered on this machine.
 */
function railWideSaved() {
  try {
    return window.localStorage.getItem('prism.railWide') === '1'
  } catch {
    return false
  }
}

function setRailWide(wide, { quiet = false } = {}) {
  document.documentElement.classList.toggle('rail-wide', wide)
  const btn = $('railFold')
  const label = wide ? 'Collapse the sidebar' : 'Expand the sidebar'
  btn.setAttribute('aria-pressed', String(wide))
  btn.setAttribute('aria-label', label)
  btn.dataset.label = `${label} (Ctrl+B)`
  try {
    window.localStorage.setItem('prism.railWide', wide ? '1' : '0')
  } catch {
    /* not remembered, only */
  }
  if (quiet) return
  // The canvas's free area changed: redraw once the sidebar has settled.
  setTimeout(() => {
    drawBeams()
    paintMinimap()
    placeBench()
  }, 200)
}

/* ============================================================ the console */

/**
 * Prism's console: every request as it actually went out — the resolved URL,
 * the headers sent and the body — and what came back, with each script's
 * console.log lines and every error, newest last. Kept for the session only.
 *
 * Credentials are masked until asked for: header values whose names say
 * they carry one, and in bodies, fields named like a password, token, key or
 * cookie, and anything shaped like a JWT. "Show secrets" lifts it.
 */
const CONSOLE_KEEP = 500
let consoleSeq = 0
const consoleState = { entries: [], open: false, filter: 'all', query: '', reveal: false, unseen: 0, expanded: new Set(), height: 300 }
try {
  consoleState.height = clamp(Number(window.localStorage.getItem('prism.consoleHeight')) || 300, 160, 900)
} catch {
  /* no storage: the default height */
}
const SECRET_HEADER = /authorization|cookie|api[-_]?key|token|secret|password|session/i

function consolePush(entry) {
  consoleState.entries.push({ id: `cn${(consoleSeq += 1)}`, at: Date.now(), ...entry })
  if (consoleState.entries.length > CONSOLE_KEEP) consoleState.entries.splice(0, consoleState.entries.length - CONSOLE_KEEP)
  if (!consoleState.open && entry.kind === 'error') consoleState.unseen += 1
  paintConsoleBadge()
  if (consoleState.open) paintConsoleList()
}

/** A line of the app's own, such as an error that was only toasted. */
function consoleNote(kind, text) {
  consolePush({ kind, text: String(text) })
}

function consoleRequest(req, spec, raw, result) {
  const bad = Boolean(result.error && !result.skipped) || result.failed > 0
  consolePush({
    kind: 'request',
    name: req.name || 'Untitled',
    method: String(spec?.method || req.method || 'GET').toUpperCase(),
    url: spec?.url ?? req.url ?? '',
    status: result.status ?? 0,
    statusText: raw?.statusText ?? '',
    ms: result.timing?.total ?? 0,
    bytes: raw?.bytes ?? 0,
    error: result.skipped ? '' : result.error ?? '',
    skipped: Boolean(result.skipped),
    bad,
    failedChecks: (result.checks ?? []).filter((c) => !c.ok).map((c) => `${describe(c.assertion)} — ${c.detail}`),
    reqHeaders: raw?.sentHeaders ?? spec?.headers ?? {},
    reqBody: typeof spec?.body === 'string' ? spec.body : '',
    resHeaders: raw?.headers ?? {},
    resBody: String(raw?.body ?? '').slice(0, 200000),
    logs: result.logs ?? []
  })
}

function paintConsoleBadge() {
  const badge = $('consoleCount')
  if (!badge) return
  badge.hidden = !consoleState.unseen
  badge.textContent = consoleState.unseen > 99 ? '99+' : String(consoleState.unseen)
  $('consoleBtn')?.classList.toggle('on', consoleState.open)
  $('consoleBtn')?.setAttribute('aria-pressed', String(consoleState.open))
}

function toggleConsole(open = !consoleState.open) {
  consoleState.open = open
  if (open) consoleState.unseen = 0
  const drawer = $('consoleDrawer')
  drawer.hidden = !open
  if (open) {
    paintConsole()
    requestAnimationFrame(() => drawer.querySelector('.cn-list')?.scrollTo({ top: 1e9 }))
  }
  paintConsoleBadge()
  // The stage is shorter or taller now; the canvas and inspector follow.
  requestAnimationFrame(() => {
    drawBeams()
    paintMinimap()
  })
}

/** Masked unless secrets are shown: a header value that carries a credential. */
const shownHeader = (key, value) => (!consoleState.reveal && SECRET_HEADER.test(key) ? '••••••' : String(Array.isArray(value) ? value.join(', ') : value))

/** A body as the console shows it: pretty when JSON, credentials masked unless shown. */
function shownBody(text) {
  const body = String(text ?? '')
  if (!body.trim()) return ''
  if (!consoleState.reveal) return sampleOf(body, { lines: 4000, chars: 200000 })
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function paintConsole() {
  const drawer = $('consoleDrawer')
  drawer.style.height = `${consoleState.height}px`
  const count = (kind) => consoleState.entries.filter((e) => (kind === 'error' ? e.kind === 'error' || e.bad : e.kind === kind)).length
  const logs = consoleState.entries.reduce((n, e) => n + (e.kind === 'request' ? e.logs.length : 0), 0)

  // Dragging the top edge sets the height, remembered for next time.
  const grip = el('div', { class: 'cn-grip', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Resize the console' })
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    const from = e.clientY
    const start = consoleState.height
    const move = (ev) => {
      consoleState.height = clamp(start + (from - ev.clientY), 160, Math.max(200, window.innerHeight - 220))
      drawer.style.height = `${consoleState.height}px`
      drawBeams()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        window.localStorage.setItem('prism.consoleHeight', String(consoleState.height))
      } catch {
        /* not remembered, only */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })

  const filters = el('div', { class: 'seg cn-filters' }, [
    ['all', 'All'],
    ['request', `Requests ${count('request')}`],
    ['log', `Logs ${logs}`],
    ['error', `Errors ${count('error')}`]
  ].map(([id, label]) => el('button', { class: `segbtn${consoleState.filter === id ? ' on' : ''}`, type: 'button', text: label, onclick: () => {
    consoleState.filter = id
    paintConsole()
  } })))
  const search = el('input', { class: 'cn-search', type: 'search', placeholder: 'Filter by URL, name or text', value: consoleState.query, spellcheck: 'false', 'aria-label': 'Filter the console', oninput: (e) => {
    consoleState.query = e.target.value
    paintConsoleList()
  } })

  drawer.replaceChildren(
    grip,
    el('header', { class: 'cn-head' }, [
      el('span', { class: 'cn-title', html: `${ico('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3"/><path d="M12 15h5"/>', 14, 1.9)}<b>Console</b>` }),
      filters,
      search,
      el('span', { class: 'spacer' }),
      el('button', { class: `btn plain sm${consoleState.reveal ? ' on' : ''}`, type: 'button', html: `${ico(consoleState.reveal ? I.unlock : I.lock, 12, 2)}<span>${consoleState.reveal ? 'Hide secrets' : 'Show secrets'}</span>`, title: 'Credentials in headers and bodies are masked until shown', onclick: () => {
        consoleState.reveal = !consoleState.reveal
        paintConsole()
      } }),
      el('button', { class: 'btn plain sm', type: 'button', html: `${ico(I.bin, 12, 2)}<span>Clear</span>`, onclick: () => {
        consoleState.entries = []
        consoleState.expanded.clear()
        paintConsole()
      } }),
      el('button', { class: 'mini-btn', type: 'button', title: 'Close (Ctrl+`)', 'aria-label': 'Close the console', html: ico(I.x, 13, 2.2), onclick: () => toggleConsole(false) })
    ]),
    el('div', { class: 'cn-list', role: 'log', 'aria-live': 'polite' })
  )
  paintConsoleList()
}

function paintConsoleList({ follow = true } = {}) {
  const list = document.querySelector('#consoleDrawer .cn-list')
  if (!list) return
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
  const q = consoleState.query.trim().toLowerCase()
  const time = (at) => {
    const d = new Date(at)
    return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  const rows = []
  for (const e of consoleState.entries.slice(-300)) {
    const text = e.kind === 'request' ? `${e.name} ${e.method} ${e.url} ${e.status} ${e.logs.map((l) => l.text).join(' ')}` : e.text
    if (q && !text.toLowerCase().includes(q)) continue
    if (e.kind === 'request') {
      const showLogs = consoleState.filter === 'all' || consoleState.filter === 'log'
      if (consoleState.filter === 'log' && !e.logs.length) continue
      if (consoleState.filter === 'error' && !e.bad) continue
      if (consoleState.filter !== 'log') rows.push(consoleRequestRow(e, time))
      if (showLogs) {
        for (const l of e.logs) {
          rows.push(el('div', { class: `cn-row cn-log ${l.level}` }, [el('span', { class: 'cn-time', text: time(e.at) }), el('span', { class: 'cn-kind', text: l.phase === 'pre-request' ? 'pre' : 'test' }), el('pre', { class: 'cn-text', text: l.text })]))
        }
      }
    } else {
      if (consoleState.filter !== 'all' && consoleState.filter !== (e.kind === 'error' ? 'error' : 'log')) continue
      rows.push(el('div', { class: `cn-row cn-note ${e.kind}` }, [el('span', { class: 'cn-time', text: time(e.at) }), el('span', { class: 'cn-kind', text: e.kind }), el('pre', { class: 'cn-text', text: e.text })]))
    }
  }
  list.replaceChildren(
    ...(rows.length
      ? rows
      : [el('div', { class: 'cn-empty', text: consoleState.entries.length ? 'Nothing matches that filter.' : 'Send a request and it shows here — the URL it went to, the headers and body sent, what came back, and anything a script logged.' })])
  )
  if (follow && atBottom) list.scrollTop = list.scrollHeight
}

function consoleRequestRow(e, time) {
  const open = consoleState.expanded.has(e.id)
  const tone = e.skipped ? 'skip' : e.error ? 'bad' : e.status >= 400 ? 'warn' : e.bad ? 'bad' : 'ok'
  const row = el('div', { class: `cn-row cn-req ${tone}${open ? ' open' : ''}`, 'data-entry': e.id })
  const summary = el('button', { class: 'cn-sum', type: 'button', 'aria-expanded': String(open), onclick: () => {
    if (consoleState.expanded.has(e.id)) consoleState.expanded.delete(e.id)
    else consoleState.expanded.add(e.id)
    // Opening a row keeps your place and brings the row into view.
    const list = document.querySelector('#consoleDrawer .cn-list')
    const top = list.scrollTop
    paintConsoleList({ follow: false })
    list.scrollTop = top
    list.querySelector(`[data-entry="${e.id}"]`)?.scrollIntoView({ block: 'nearest' })
  } }, [
    el('span', { class: 'cn-time', text: time(e.at) }),
    el('span', { class: 'cn-twist', html: ico(open ? I.down : I.chev, 11, 2.4) }),
    el('span', { class: `verb ${e.method.toLowerCase()}`, text: e.method }),
    el('span', { class: 'cn-url', title: e.url, text: e.url }),
    el('span', { class: 'cn-name', text: e.name }),
    el('span', { class: 'cn-status', text: e.skipped ? 'skipped' : e.error ? 'error' : String(e.status) }),
    el('span', { class: 'cn-ms', text: e.error || e.skipped ? '' : `${e.ms} ms` }),
    el('span', { class: 'cn-size', text: e.error || e.skipped ? '' : fmtBytes(e.bytes) })
  ])
  row.append(summary)
  if (!open) return row

  const headers = (obj) => {
    const entries = Object.entries(obj ?? {})
    if (!entries.length) return el('p', { class: 'cn-none', text: 'None' })
    return el('dl', { class: 'cn-headers' }, entries.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: shownHeader(k, v) })]))
  }
  const body = (text) => {
    const shown = shownBody(text)
    return shown ? el('pre', { class: 'cn-body', text: shown }) : el('p', { class: 'cn-none', text: 'No body' })
  }
  const section = (title, content, copy) =>
    el('section', { class: 'cn-sec' }, [
      el('header', {}, [
        el('b', { text: title }),
        copy ? el('button', { class: 'btn plain sm', type: 'button', html: `${ico(I.copy, 11, 2)}<span>Copy</span>`, onclick: (ev) => {
          ev.stopPropagation()
          navigator.clipboard.writeText(copy())
          toast('ok', `${title} copied`)
        } }) : null
      ]),
      content
    ])
  const detail = el('div', { class: 'cn-detail' }, [
    e.error ? el('div', { class: 'cn-error', text: e.error }) : null,
    e.failedChecks.length ? el('div', { class: 'cn-error', text: e.failedChecks.join('\n') }) : null,
    el('div', { class: 'cn-cols' }, [
      el('div', {}, [
        section('Request headers', headers(e.reqHeaders)),
        section('Request body', body(e.reqBody), e.reqBody ? () => shownBody(e.reqBody) : null)
      ]),
      el('div', {}, [
        section(`Response headers${e.statusText ? ` — ${e.status} ${e.statusText}` : ''}`, headers(e.resHeaders)),
        section('Response body', body(e.resBody), e.resBody ? () => shownBody(e.resBody) : null)
      ])
    ])
  ])
  row.append(detail)
  return row
}

/* ------------------------------------------------------------ the method */

/** A request's verb as it is shown: its method, or WS / SSE for a live connection. */
const isStream = (req) => req?.kind === 'ws' || req?.kind === 'sse'
const verbOf = (req) => (req?.kind === 'ws' ? 'WS' : req?.kind === 'sse' ? 'SSE' : req?.kind === 'grpc' ? 'gRPC' : String(req?.method ?? 'GET').toUpperCase())

/** What each method is for, in the words the picker shows. */
const METHOD_INFO = {
  GET: { key: 'g', text: 'Read a resource' },
  POST: { key: 'p', text: 'Create one, or send data to be processed' },
  PUT: { key: 'u', text: 'Replace a resource whole' },
  PATCH: { key: 'a', text: 'Change part of a resource' },
  DELETE: { key: 'd', text: 'Remove a resource' },
  HEAD: { key: 'h', text: 'Headers only — no body comes back' },
  OPTIONS: { key: 'o', text: 'Ask what the server allows' }
}

/**
 * The method picker: every method in its own colour with what it is for,
 * the current one ticked. Arrow keys move, Enter picks, a method's letter
 * picks it straight away, and a custom method — PURGE, PROPFIND, QUERY —
 * can be typed at the foot.
 */
function openMethodPicker(anchor) {
  const req = current()
  if (!req) return
  closeMethodPicker()
  const choose = (method) => {
    closeMethodPicker()
    if (method && (method !== req.method || req.kind)) {
      req.method = method
      if (req.kind) {
        delete req.kind
        req.url = String(req.url ?? '').replace(/^ws(s?):\/\//i, 'http$1://')
      }
      commit()
    }
    $('addrVerb')?.focus()
  }

  const options = METHODS.map((m) =>
    el('button', { class: `mp-item${m === req.method && !req.kind ? ' on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(m === req.method && !req.kind), 'data-method': m, onclick: () => choose(m) }, [
      el('span', { class: `mp-verb verb ${m.toLowerCase()}`, text: m }),
      el('span', { class: 'mp-text', text: METHOD_INFO[m]?.text ?? '' }),
      m === req.method && !req.kind ? el('span', { class: 'mp-tick', html: ico(I.check, 13, 2.6) }) : el('kbd', { class: 'mp-key', text: (METHOD_INFO[m]?.key ?? '').toUpperCase() })
    ])
  )
  const kinds = [
    ['ws', 'WS', 'WebSocket — a two-way connection, held open'],
    ['sse', 'SSE', 'Server-Sent Events — a stream the server pushes'],
    ['grpc', 'gRPC', 'A gRPC call, described by a .proto file']
  ].map(([kind, chip, text]) =>
    el('button', { class: `mp-item${req.kind === kind ? ' on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(req.kind === kind), 'data-method': chip, onclick: () => {
      closeMethodPicker()
      if (req.kind !== kind) {
        req.kind = kind
        req.method = 'GET'
        // A WebSocket address is ws://; an http address is kept for SSE.
        if (kind === 'ws') req.url = String(req.url ?? '').replace(/^http(s?):\/\//i, 'ws$1://')
        if (kind === 'sse') req.url = String(req.url ?? '').replace(/^ws(s?):\/\//i, 'http$1://')
        if (kind === 'grpc') {
          req.grpc = req.grpc ?? { proto: '', protoName: '', service: '', method: '' }
          req.bodyKind = 'json'
          if (!String(req.body ?? '').trim()) req.body = '{}'
          S.editTab = 'grpc'
        }
        commit()
      }
      $('addrVerb')?.focus()
    } }, [
      el('span', { class: `mp-verb verb ${chip.toLowerCase()}`, text: chip }),
      el('span', { class: 'mp-text', text }),
      req.kind === kind ? el('span', { class: 'mp-tick', html: ico(I.check, 13, 2.6) }) : el('span')
    ])
  )
  const custom = el('input', {
    class: 'mp-custom',
    spellcheck: 'false',
    placeholder: 'Custom method, e.g. PURGE',
    'aria-label': 'Custom method',
    value: METHODS.includes(req.method) ? '' : req.method,
    oninput: (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' && /^[A-Z][A-Z0-9_-]*$/.test(e.target.value)) {
        e.preventDefault()
        choose(e.target.value)
      }
      if (e.key === 'Escape') choose(null)
      e.stopPropagation()
    }
  })
  const box = el('div', { class: 'mp', role: 'listbox', 'aria-label': 'Method', tabindex: '-1' }, [
    el('div', { class: 'mp-head' }, [el('b', { text: 'Method' }), el('span', { text: '↑↓ move · Enter picks · or press its letter' })]),
    el('div', { class: 'mp-list' }, options),
    el('div', { class: 'mp-sub', text: 'Other protocols' }),
    el('div', { class: 'mp-list' }, kinds),
    el('div', { class: 'mp-foot' }, [custom])
  ])
  document.body.append(box)
  const r = anchor.getBoundingClientRect()
  box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - box.offsetWidth - 8))}px`
  box.style.top = `${r.bottom + box.offsetHeight + 8 > window.innerHeight ? r.top - box.offsetHeight - 6 : r.bottom + 6}px`
  anchor.setAttribute('aria-expanded', 'true')

  const items = () => [...box.querySelectorAll('.mp-item')]
  ;(items().find((b) => b.classList.contains('on')) ?? items()[0])?.focus()
  box.addEventListener('keydown', (e) => {
    const list = items()
    const at = list.indexOf(document.activeElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length
      list[next].focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      list[e.key === 'Home' ? 0 : list.length - 1].focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      choose(null)
    } else if (e.key === 'Tab') {
      // Tab reaches the custom field, then closes.
      if (document.activeElement === custom) choose(null)
    } else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && document.activeElement !== custom) {
      const hit = Object.entries(METHOD_INFO).find(([, v]) => v.key === e.key.toLowerCase())
      if (hit) {
        e.preventDefault()
        choose(hit[0])
      }
    }
  })
  setTimeout(() => window.addEventListener('pointerdown', methodPickerAway, true), 0)
}

function methodPickerAway(e) {
  if (!e.target.closest?.('.mp, #addrVerb')) closeMethodPicker()
}

function closeMethodPicker() {
  document.querySelector('.mp')?.remove()
  $('addrVerb')?.setAttribute('aria-expanded', 'false')
  window.removeEventListener('pointerdown', methodPickerAway, true)
}

/* ---------------------------------------------------------------- scripts */

/** Which of a request's two scripts the Scripts tab is showing. */
let scriptPhase = 'test'

/**
 * The Scripts tab: a pre-request script and a test script, in JavaScript with
 * Postman's `pm` object. A plain editor with line numbers, Tab that indents
 * and Enter that keeps the indent, and the snippets people reach for most.
 */
function scriptsPanel(req) {
  req.scripts ??= { pre: '', test: '' }
  const which = scriptPhase === 'pre' ? 'pre' : 'test'
  const box = el('div', { class: 'scripts' })

  const tab = (id, label) =>
    el('button', {
      class: `segbtn${which === id ? ' on' : ''}`,
      type: 'button',
      html: `${label}${req.scripts[id]?.trim() ? ' <i class="script-dot"></i>' : ''}`,
      onclick: () => {
        scriptPhase = id
        paintBench()
      }
    })
  box.append(
    el('div', { class: 'scripts-top' }, [
      el('div', { class: 'seg' }, [tab('pre', 'Pre-request'), tab('test', 'Tests')]),
      el('span', {
        class: 'scripts-what',
        text: which === 'pre' ? 'Runs before the request is sent — set variables, add headers, change the URL or body.' : 'Runs when the response arrives — pm.test and pm.expect, reported beside the assertions.'
      })
    ])
  )

  const gutter = el('div', { class: 'code-gutter', 'aria-hidden': 'true' })
  const area = el('textarea', {
    class: 'code-area',
    spellcheck: 'false',
    autocomplete: 'off',
    wrap: 'off',
    'aria-label': which === 'pre' ? 'Pre-request script' : 'Test script',
    placeholder: which === 'pre' ? "pm.environment.set('now', new Date().toISOString())" : "pm.test('Status code is 200', () => {\n  pm.response.to.have.status(200)\n})"
  })
  area.value = req.scripts[which] ?? ''
  const number = () => {
    const lines = Math.max(1, area.value.split('\n').length)
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n')
  }
  const changed = () => {
    req.scripts[which] = area.value
    number()
    live(req)
  }
  area.addEventListener('input', changed)
  area.addEventListener('scroll', () => {
    gutter.scrollTop = area.scrollTop
  })
  area.addEventListener('keydown', (e) => {
    const { selectionStart: a, selectionEnd: b, value } = area
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      area.setRangeText('  ', a, b, 'end')
      changed()
    } else if (e.key === 'Enter') {
      // The new line starts where the last one did, one step further in
      // after an opening brace.
      const line = value.slice(value.lastIndexOf('\n', a - 1) + 1, a)
      const indent = (/^\s*/.exec(line)?.[0] ?? '') + (/[{[(]\s*$/.test(line) ? '  ' : '')
      e.preventDefault()
      area.setRangeText(`\n${indent}`, a, b, 'end')
      changed()
    }
  })
  number()
  box.append(el('div', { class: 'code-edit' }, [gutter, area]))

  const insert = (code) => {
    const at = area.selectionEnd
    const before = area.value.slice(0, at)
    const lead = before && !before.endsWith('\n') ? '\n' : ''
    area.setRangeText(`${lead}${code}\n`, at, at, 'end')
    area.focus()
    changed()
  }
  box.append(
    el('div', { class: 'snips' }, [
      el('span', { class: 'snips-label', text: 'Snippets' }),
      ...SNIPPETS[which === 'pre' ? 'prerequest' : 'test'].map((snip) => el('button', { class: 'snip', type: 'button', text: snip.label, title: snip.code, onclick: () => insert(snip.code) }))
    ])
  )
  box.append(
    el('p', {
      class: 'scripts-note',
      html: 'JavaScript with Postman’s <code>pm</code> object — <code>prism</code> is the same — so Postman scripts run as they are. Scripts run in a sandbox: no files, no network, stopped after 5 seconds. <code>console.log</code> goes to the response’s Console.'
    })
  )
  return box
}

/** What the scripts logged, in the order they logged it. */
function consolePanel(res) {
  const logs = res?.logs ?? []
  if (!logs.length) {
    return el('div', { class: 'nothing', text: 'Nothing was logged. console.log() in a pre-request or test script shows here.' })
  }
  return el(
    'div',
    { class: 'console' },
    logs.map((l) =>
      el('div', { class: `console-row ${l.level}` }, [
        el('span', { class: 'console-phase', text: l.phase ?? '' }),
        el('pre', { text: l.text })
      ])
    )
  )
}

/** How long a script may run before it is stopped. */
const SCRIPT_TIMEOUT_MS = 5000

const noScript = (error) => ({ tests: [], logs: [], environment: { set: {}, unset: [] }, local: { set: {}, unset: [] }, request: null, skip: false, error })

/**
 * Runs one script in a worker of its own (renderer/script-worker.js), which
 * has none of the app's controls, files or network. A script that runs too
 * long is stopped, and one that cannot start says why.
 */
function runInSandbox(input) {
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('./script-worker.js', import.meta.url), { type: 'module' })
    } catch (err) {
      resolve(noScript(`Scripts cannot run here — ${err.message}`))
      return
    }
    const done = (out) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(out)
    }
    const timer = setTimeout(() => done(noScript(`The script ran for more than ${SCRIPT_TIMEOUT_MS / 1000} s and was stopped`)), SCRIPT_TIMEOUT_MS)
    worker.onmessage = (e) => done(e.data)
    worker.onerror = (e) => {
      e.preventDefault?.()
      done(noScript(e.message || 'The script could not start'))
    }
    worker.postMessage(input)
  })
}

/**
 * What a script asked for, applied: variables set in the environment stay
 * there (as in Postman), variables for the run go into its local scope, and
 * the rest is handed back to the caller.
 */
function applyScriptVars(out, locals, env = environment()) {
  for (const [k, v] of Object.entries(out.environment?.set ?? {})) {
    if (env) env.values[k] = v
    else locals[k] = v
  }
  for (const k of out.environment?.unset ?? []) if (env) delete env.values[k]
  for (const [k, v] of Object.entries(out.local?.set ?? {})) locals[k] = v
  for (const k of out.local?.unset ?? []) delete locals[k]
}

/** A script's test as a check, beside the assertions in every report. */
/** The group a check is reported under. */
const checkGroup = (subject) => SUBJECTS.find((x) => x.id === subject)?.group ?? { script: 'Script', contract: 'Contract', logic: 'Logic', data: 'Data' }[subject]
const checkLabel = (subject) => SUBJECTS.find((x) => x.id === subject)?.label ?? { script: 'Script', contract: 'Spec', logic: 'Logic', data: 'Data' }[subject] ?? subject

/** A finding against the OpenAPI document, as a check. */
const contractCheck = (message, ok = false) => ({
  id: uid('ct'),
  ok,
  detail: ok ? 'passed' : 'not as documented',
  assertion: { id: uid('ct'), subject: 'contract', op: 'matches', path: '', value: message, on: true }
})

const scriptCheck = (name, ok, detail, phase) => ({
  id: uid('st'),
  ok,
  detail,
  assertion: { id: uid('st'), subject: 'script', op: phase, path: '', value: name, on: true }
})

const scriptOf = (req, which) => String(req.scripts?.[which] ?? '').trim()

/**
 * One send, against one set of variables.
 *
 * Separated out because a dataset run does the same thing sixty times with a
 * different scope each time, and duplicating the assertion, capture and
 * analysis steps would let the two drift apart.
 */
/**
 * One send, under the step's logic when it has any: run only if, wait, for
 * each, poll until (lib/logic.js). A load run asks for the raw send.
 */
async function sendOnce(req, vars, ctx = {}) {
  const rules = ctx.raw || isStream(req) ? null : rulesOf(req)
  if (!rules) return sendRaw(req, vars, ctx)
  const scope = { ...vars, ...(ctx.data ?? {}), ...(ctx.locals ?? {}) }
  const out = await runRules((v) => sendRaw(req, v, ctx), { rules, vars: scope, stopped: () => Boolean(ctx.stopped?.()) })
  if (out.skipped) {
    const skipped = { at: Date.now(), request: null, status: 0, timing: { total: 0 }, logs: [], checks: [], ...out }
    if (out.failed) skipped.checks = [logicCheck('Logic', false, out.error)]
    if (!ctx.quiet) {
      S.results.set(req.id, skipped)
      touch()
    }
    return skipped
  }
  const checks = [...(out.checks ?? []), ...(out.logicChecks ?? []).map((c) => logicCheck(c.name, c.ok, c.detail))]
  const result = { ...out, checks, failed: checks.filter((c) => !c.ok).length + (out.error && !checks.length ? 1 : 0) }
  if (!ctx.quiet) S.results.set(req.id, result)
  return result
}

const logicCheck = (name, ok, detail) => ({ id: uid('lg'), ok, detail, assertion: { id: uid('lg'), subject: 'logic', op: 'holds', path: '', value: name, on: true } })

async function sendRaw(req, vars, ctx = {}) {
  if (isStream(req)) return { skipped: true, error: `${verbOf(req)} connections are opened by hand, not run in a flow`, at: Date.now(), request: null, checks: [], failed: 0, status: 0, timing: { total: 0 }, logs: [] }
  // The environment this send reads and writes: the active one, or the one a
  // scheduled run names — which never changes the one you are working in.
  const envOf = () => (ctx.envId ? S.environments.find((e) => e.id === ctx.envId) ?? null : environment())
  const envVals = () => envOf()?.values ?? {}
  // Inheritance is resolved here rather than in compile(), so the preview in
  // the header and the bytes on the wire come from the same call.
  const chain = chainFor(req)
  const resolved = withInherited(req, chain)

  // A run's local variables (`pm.variables.set`) carry from one request to
  // the next; a single send has its own, gone when it is.
  const locals = ctx.locals ?? {}
  const scriptInfo = { requestName: req.name, requestId: req.id, iteration: ctx.iteration ?? 0, iterationCount: ctx.iterationCount ?? 1 }
  const scriptVars = () => ({ environment: { ...envVals() }, local: { ...locals }, iteration: { ...(ctx.data ?? {}) }, environmentName: envOf()?.name ?? '' })
  const logs = []
  const scriptChecks = []

  // The pre-request script, which may change the request before it is sent.
  if (scriptOf(req, 'pre')) {
    const out = await runInSandbox({
      code: req.scripts.pre,
      phase: 'prerequest',
      request: { name: req.name, method: resolved.method, url: resolved.url, headers: (resolved.headers ?? []).map((h) => ({ key: h.key, value: h.value, disabled: h.on === false })), body: resolved.body ?? '' },
      vars: scriptVars(),
      info: scriptInfo
    })
    applyScriptVars(out, locals, envOf())
    logs.push(...(out.logs ?? []).map((l) => ({ ...l, phase: 'pre-request' })))
    for (const t of out.tests ?? []) scriptChecks.push(scriptCheck(t.name, t.ok, t.ok ? 'passed' : t.error, 'prerequest'))
    if (out.error) scriptChecks.push(scriptCheck('Pre-request script', false, out.error, 'prerequest'))
    if (out.request) {
      resolved.method = out.request.method
      resolved.url = out.request.url
      resolved.body = out.request.body
      resolved.headers = out.request.headers.map((h) => ({ id: uid('row'), key: h.key, value: h.value, on: !h.disabled }))
    }
    if (out.skip) {
      const skipped = { error: 'Skipped by its pre-request script', skipped: true, at: Date.now(), request: null, checks: scriptChecks, failed: 0, status: 0, timing: { total: 0 }, logs }
      if (!ctx.quiet) {
        remember(req, skipped, envOf())
        consoleRequest(req, { method: resolved.method, url: resolved.url, headers: {} }, null, skipped)
      }
      return skipped
    }
  }
  // What the scripts set is in scope for this send, the narrowest scope winning.
  vars = { ...vars, ...envVals(), ...(ctx.data ?? {}), ...locals }

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
  const raw = req.kind === 'grpc'
    ? await window.prism.grpc.call({ ...(req.grpc ?? {}), address: spec.url, headers: spec.headers, body: spec.body, timeoutMs: spec.timeoutMs })
    : await window.prism.http.send(spec)

  if (raw.error) {
    const failure = { error: raw.error, at, request: spec, checks: scriptChecks, failed: 1, status: 0, timing: { total: 0 }, logs }
    if (!ctx.quiet) {
      remember(req, failure, envOf())
      consoleRequest(req, spec, null, failure)
    }
    return failure
  }

  let json
  try {
    json = JSON.parse(raw.body)
  } catch {
    json = undefined
  }

  const response = { ...raw, json }

  // The test script, which reads the response and adds tests of its own.
  if (scriptOf(req, 'test')) {
    const out = await runInSandbox({
      code: req.scripts.test,
      phase: 'test',
      request: { name: req.name, method: spec.method, url: spec.url, headers: Object.entries(spec.headers ?? {}).map(([key, value]) => ({ key, value })), body: spec.body ?? '' },
      response: { code: raw.status, status: raw.statusText ?? '', headers: raw.headers ?? {}, body: raw.body ?? '', time: raw.timing?.total ?? 0, size: raw.bytes ?? 0 },
      vars: scriptVars(),
      info: scriptInfo
    })
    applyScriptVars(out, locals, envOf())
    logs.push(...(out.logs ?? []).map((l) => ({ ...l, phase: 'test' })))
    for (const t of out.tests ?? []) scriptChecks.push(scriptCheck(t.name, t.ok, t.ok ? (t.skipped ? 'skipped' : 'passed') : t.error, 'test'))
    if (out.error) scriptChecks.push(scriptCheck('Test script', false, out.error, 'test'))
  }

  // The collection's OpenAPI document, when it has one: what it promises for
  // this operation, checked. Breaks fail as checks; extra fields are notes.
  const col = chain[0]
  // An OpenAPI document describes HTTP: a gRPC call is not checked against it.
  const contract = col?.spec && !req.kind ? checkResponse(col.spec, spec.method, resolved.url, response) : null
  const contractChecks = []
  if (contract?.matched && col.specCheck !== false) {
    const errors = contract.findings.filter((f) => f.level === 'error')
    if (errors.length) contractChecks.push(...errors.map((f) => contractCheck(f.message)))
    else contractChecks.push(contractCheck(`Matches the spec — ${spec.method} ${contract.route}`, true))
  }

  const checks = [...runAll(req.assertions, response), ...scriptChecks, ...contractChecks]
  const result = {
    ...response,
    at,
    request: spec,
    checks,
    contract,
    logs,
    failed: checks.filter((c) => !c.ok).length,
    findings: analyse(response, { ...spec, secure: raw.secure }, checks)
  }

  // Captured values land in the environment, which is what lets the next
  // request in the flow use them without anyone copying anything.
  for (const cap of req.captures ?? []) {
    if (!cap.name || !envOf()) continue
    const value =
      cap.from === 'header'
        ? Object.entries(response.headers ?? {}).find(([k]) => k.toLowerCase() === cap.path.toLowerCase())?.[1]
        : jsonPath(json, cap.path)
    if (value !== undefined) envOf().values[cap.name] = value && typeof value === 'object' ? JSON.stringify(value) : String(value)
  }

  if (!ctx.quiet) {
    remember(req, result, envOf())
    consoleRequest(req, spec, raw, result)
  }
  return result
}

function remember(req, result, env = environment()) {
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
    env: env?.name ?? '—',
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
  runner: {
    rail: 'railRunner',
    icon: '<path d="M4 6h10"/><path d="M4 12h7"/><path d="M4 18h10"/><path d="m16 10 5 3-5 3z" fill="currentColor"/>',
    sub: () => (runner.running ? 'Running…' : runner.run ? `Last run: ${runner.run.iterations.length} iteration${runner.run.iterations.length === 1 ? '' : 's'}` : 'Run a collection or flow, with a data file')
  },
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

const PAGE_KIND = { Runner: 'runner', Overview: 'overview', Environments: 'environments', History: 'history', Settings: 'settings', Help: 'help', Export: 'export' }

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
  // One session, so the report covers every flow that ran.
  const session = newRunSession()
  for (const flow of allFlows()) {
    if (!flow.requests.length) continue
    await runFlow(flow, session)
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
          el('div', { class: 'ov-flow-bar', title: results.length ? `${ok} of ${results.length} passed` : 'Not run yet' }, [
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
  AI: 'An assistant that explains failures and suggests checks — off unless you choose a provider.',
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
  AI: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
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
/**
 * Where an element sits inside a scrolling box, in the box's own pixels.
 * offsetTop is measured from the nearest positioned ancestor — here the whole
 * page view, header and title included — so every section landed 124px too
 * far down, its heading scrolled out of sight.
 */
const topIn = (scroll, node) => scroll.scrollTop + node.getBoundingClientRect().top - scroll.getBoundingClientRect().top

function jumpToSetting(group, smooth = true) {
  const scroll = document.querySelector('.page-settings .page-scroll')
  const target = document.getElementById(`set-${group}`)
  if (!scroll || !target) return
  settingsAt = group
  markSetting(group)
  scroll.scrollTo({ top: Math.max(0, topIn(scroll, target) - 24), behavior: smooth ? 'smooth' : 'auto' })
}

/** The group nearest the top of the view is the one the sidebar marks. */
function spySettings(scroll) {
  let at = ''
  for (const sec of scroll.querySelectorAll('.set-group:not([hidden])')) {
    if (topIn(scroll, sec) - scroll.scrollTop <= 90) at = sec.dataset.group
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
          el('b', { text: 'Backups' }),
          el('p', { text: 'Restore an automatic backup, back up to a file you keep, or restore from one.' })
        ]),
        el('button', { class: 'btn', type: 'button', text: 'Manage backups', onclick: () => openBackups() })
      ])
    )
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
            applyScale()
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
/*
 * The two rows below are read from the main process. What each last showed
 * is kept and drawn straight away on a re-render, then refreshed: drawn as a
 * one-line placeholder instead, the Data group came back shorter, every group
 * under it moved up, and picking an option in Settings → AI scrolled the page.
 */
let cookieSeen = null
let storedSeen

function cookieRow(group) {
  const row = el('div', { class: 'prefrow' }, [
    el('div', { class: 'prefwords' }, [el('b', { text: 'Cookies' }), el('p', { text: 'Reading the jar…' })])
  ])
  if (cookieSeen) fillCookieRow(row, cookieSeen)
  window.prism.cookies.list().then((all) => {
    cookieSeen = all
    fillCookieRow(row, all)
  })
  return row
}

function fillCookieRow(row, all) {
  {
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
  }
}

/** Where the autosave lives, and how to be rid of it. */
function storedRow(group) {
  const row = el('div', { class: 'prefrow' }, [
    el('div', { class: 'prefwords' }, [el('b', { text: 'Saved workspace' }), el('p', { text: 'Looking…' })])
  ])
  if (storedSeen !== undefined) fillStoredRow(row, storedSeen)
  window.prism.workspace.restore().then((found) => {
    storedSeen = found ? { path: found.path } : null
    fillStoredRow(row, storedSeen)
  })
  return row
}

function fillStoredRow(row, found) {
  {
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
                  await snapshot('forget')
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
  }
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
            if (item.id === 'theme' || item.id === 'inspector') applyTheme()
            if (item.id === 'uiScale') applyScale()
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
      tile(I.folder, 'Local first', 'Your work is saved on this machine and in the files you choose. Nothing is uploaded — the optional AI assistant sends only what you see, and only when you ask.'),
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
        never('Let a script reach the network, your files or the app. Pre-request and test scripts run in a sandbox of their own, stopped after 5 seconds.'),
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
        el('h4', { text: 'What changed since last time' }),
        el('p', {
          html: 'Every run of a flow is kept on <strong>History &rarr; Run timeline</strong> — the newest 60, with the workspace. Pick any two as <strong>A</strong> and <strong>B</strong> and Prism lists what changed between them: requests that broke or were fixed, statuses that moved, what got slower or faster, checks that started or stopped failing, and fields that appeared, vanished or changed type. A run keeps statuses, times, which checks passed and each body&rsquo;s shape as types — never a value.'
        }),
        el('h4', { text: 'Running one thing ten times' }),
        el('p', {
          html:
            'A test that passes nine times out of ten is the expensive kind of broken: the failure gets re-run until it passes, and after a while nobody reads the result. <strong>Run it ten times</strong> in a request&rsquo;s menu sends the same request in sequence and says whether the outcome was stable. A 4xx or 5xx counts as a failure even with nothing asserting on it.'
        })
      ])
  },
  {
    id: 'logic',
    label: 'Logic in a flow',
    icon: '<path d="M6 3v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    blurb: 'Run only if, wait, for each, until — and when to stop.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'A request&rsquo;s <strong>Logic</strong> tab turns it into a step that decides for itself. Its marks show on the canvas — <code>if</code>, a wait, <code>each</code>, <code>until</code>, <code>stop</code> — and every way of running a flow follows them: Run flow, Run all, the Runner, Schedules, Compare and <code>prism-run</code>.'
        }),
        el('h4', { text: 'The rules' }),
        el('ul', {}, [
          el('li', { html: '<strong>Run only if</strong> — a condition on the variables: <code>var.role == "admin"</code>. When it is false the step is skipped and the flow goes on.' }),
          el('li', { html: '<strong>Wait first</strong> — a pause before the send.' }),
          el('li', { html: '<strong>Repeat for each</strong> — a JSON list such as <code>["eu","us"]</code>, or <code>var.skus</code> holding one. Each item is <code>{{item}}</code>; an object&rsquo;s fields are <code>{{item.id}}</code>. A captured list is kept as JSON, so one step can capture the ids the next walks.' }),
          el('li', { html: '<strong>Repeat until</strong> — send again every so many milliseconds, up to so many tries, until the response says so: <code>json.status == "done"</code>. If it never does, the check says what it last saw.' }),
          el('li', { html: '<strong>If it fails</strong> — carry on, or stop the flow: the steps after it are not run.' })
        ]),
        el('h4', { text: 'Conditions' }),
        el('p', {
          html: 'Conditions read <code>status</code>, <code>time</code>, <code>size</code>, <code>attempt</code>, <code>json.path</code> (with <code>[0]</code> and <code>.length</code>), <code>header.name</code>, <code>var.name</code> and <code>item</code>; compare with <code>==</code> <code>!=</code> <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code> <code>contains</code> <code>matches</code> or <code>exists</code>; and join with <code>and</code>, <code>or</code>, <code>not</code> and parentheses. They are parsed, never run as code, and checked as you type.'
        }),
        el('pre', { class: 'src' }, ['status < 300 and json.items.length > 0', 'json.status == "done" or attempt >= 5', 'header.content-type contains "json"', 'not var.trial'].map((text) => el('span', { class: 'ln', text })))
      ])
  },
  {
    id: 'runner',
    label: 'The Runner',
    icon: '<path d="M4 6h10"/><path d="M4 12h16"/><path d="M4 18h10"/><path d="m17 15 3 3-3 3"/>',
    blurb: 'A collection or a flow, once per row of a data file.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: '<strong>Runner</strong> in the strip on the left runs a whole collection or one flow as a batch, the way Postman&rsquo;s collection runner does. Pick what to run, tick the requests to include, choose an environment, and press <strong>Run</strong>.'
        }),
        el('h4', { text: 'Options' }),
        el('ul', {}, [
          el('li', { html: '<strong>Iterations</strong> — how many times to go through the requests. With a data file it defaults to one per row.' }),
          el('li', { html: '<strong>Delay</strong> between requests, for an API with a rate limit.' }),
          el('li', { html: '<strong>Stop at the first failure</strong>, or carry on and report everything.' }),
          el('li', { html: '<strong>Keep variable changes</strong> — whether values set or captured during the run stay in the environment afterwards.' })
        ]),
        el('h4', { text: 'Data files' }),
        el('p', {
          html: 'Drop a <strong>CSV</strong> or a <strong>JSON</strong> array on the Runner, or choose one. Each row is one iteration, and each column a variable for that iteration: a column called <code>email</code> fills <code>{{email}}</code> in the URL, headers or body, and scripts read it as <code>pm.iterationData.get(\'email\')</code>. The preview shows the rows and which columns the chosen requests actually use.'
        }),
        el('pre', { class: 'src' }, ["email,name,password","ada@example.com,Ada,a1","grace@example.com,Grace,g2"].map((text) => el('span', { class: 'ln', text }))),
        el('h4', { text: 'Generated test data' }),
        el('p', {
          html: '<strong>Generate test data from a schema…</strong>, under the data drop, builds rows that probe a request&rsquo;s input validation: its body with one thing changed per row — a value at its limit or one past it, the wrong type, an emoji, null, a field left out. The rules come from the collection&rsquo;s OpenAPI spec, or are inferred from the body as written. Whether the API should <em>accept</em> or <em>refuse</em> each row is worked out from the schema, and each send is judged by it: a 2xx for what should be accepted, a 4xx for what should be refused, and a 5xx always fails.'
        }),
        el('h4', { text: 'Results' }),
        el('p', {
          html: 'The board counts iterations, requests, passed, failed, checks and duration as the run goes, with a pass/fail bar. Below it every iteration lists its data row and each request&rsquo;s status, time and checks, with what failed. <strong>Failed only</strong> filters to the failures; <strong>Stop</strong> ends a run part-way.'
        }),
        el('h4', { text: 'Reports' }),
        el('p', {
          html: '<strong>Save report</strong>, after a Runner run or on the departure board after Run flow or Run all, writes the run as:'
        }),
        el('ul', {}, [
          el('li', { html: 'the <strong>Prism report</strong> — one self-contained HTML page: a departure board, a network map of the run, Needs attention with every failure first, Coverage, Timing, and each journey with every request and check. It filters, prints cleanly, and needs no internet;' }),
          el('li', { html: '<strong>JUnit XML</strong>, for a CI server to read;' }),
          el('li', { html: '<strong>JSON</strong>, for anything else.' })
        ]),
        el('h4', { text: 'On a timer' }),
        el('p', {
          html: '<strong>Schedules</strong> runs a collection or flow every minute, every hour, once a day — against the environment the schedule names, without changing the one you are working in. It runs while Prism is open, minimised included; each run goes into the history and the run timeline, and a desktop notification says when one fails. Runs missed while Prism was closed are not made up.'
        }),
        el('h4', { text: 'Under load' }),
        el('p', {
          html: '<strong>Load test</strong> sends the selected requests with several users at once — up to 50, for up to five minutes — each going through them in order until the time is up. <strong>Ramp-up</strong> starts users gradually; <strong>think time</strong> pauses between a user&rsquo;s requests. Scripts, captures and checks run as they do in a run.'
        }),
        el('p', {
          html: 'The board shows users, requests, requests per second, p50, p95 and the error rate as it runs; the chart shows each second&rsquo;s throughput, errors and p95; the table lists every request slowest first. Set a <strong>budget</strong> — a p95 and an error rate — and the run says whether it stayed within it. A failed send, a 4xx or 5xx, or a failed check counts as an error. Use it on your own API, or one you have permission to test.'
        }),
        el('h4', { text: 'A mock of your API' }),
        el('p', {
          html: '<strong>Mock server</strong> answers in your API&rsquo;s place at <code>http://127.0.0.1:4010</code> (the port is yours to choose). Each request in the collection is a route, answered with its frozen <strong>baseline</strong> or its <strong>last response</strong>; a request never sent, and any operation in the collection&rsquo;s OpenAPI document that no request covers, is answered with an example built from the spec. <code>{{base_url}}/users/:id</code> answers <code>/users/42</code>, and the most literal route wins.'
        }),
        el('p', {
          html: '<strong>Use it in an environment</strong> makes a <em>Mock</em> environment pointed at the server, so flows run against it. A delay makes it as slow as the real thing; CORS, on by default, lets a front end on another port call it. Every call is listed as it arrives, and in the Console. It listens on this machine only, and stops when Prism does.'
        }),
        el('h4', { text: 'Comparing two environments' }),
        el('p', {
          html: '<strong>Compare environments</strong>, beside the collection runner, sends the same requests in environment A and then in B and grades each pair: <strong>Breaks</strong> when the status class, the content type or a field&rsquo;s presence or type differs, a check passes on one side only, or a send fails; <strong>Differs</strong> for another status in the same class, a field only in B, or twice the time; <strong>Same</strong> otherwise. Values are expected to differ between environments, so they are counted, not failed. Open a row for the field-by-field table, and <strong>Copy as Markdown</strong> for a release note.'
        }),
        el('div', {
          class: 'callout',
          html: 'Reports show URLs as written, with <code>{{variables}}</code> unresolved, and mask credentials in response samples, so a report can be shared without passing on a token.'
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
      doc.append(el('h4', { text: 'Three ways to a suite' }))
      doc.append(
        el('ul', {}, [
          el('li', { html: '<strong>Generate</strong> reads the last response and proposes a suite: the status, the content type, a time budget with room in it, the type of every top-level field, formats it recognises — email, UUID, ISO dates, URLs — and the response&rsquo;s shape as a JSON Schema. It never compares against a value that will change on the next call, and every suggestion is checked against that response before it is offered.' }),
          el('li', { html: `The <strong>library</strong> holds ${CATALOG.reduce((n, g) => n + g.items.length, 0)} ready-made checks in ${CATALOG.length} groups — status codes, performance, headers, body, JSON fields, schema and security headers. Click one and it is added; point its path at the real field afterwards.` }),
          el('li', { html: 'In the <strong>Payload</strong> tab, click any value to assert it equals what it says now, that it exists, its type, or its format. In <strong>Headers</strong>, the + beside a name does the same for a header.' })
        ])
      )
      doc.append(
        el('p', {
          html: 'After a send, the response&rsquo;s <strong>Tests</strong> tab lists every assertion and every script test as passed or failed, with what was expected and what came back. For checks only code can express, see <strong>Scripts</strong>.'
        })
      )
      doc.append(el('h4', { text: 'Paths' }))
      doc.append(
        el('p', {
          html: '<code>data.items[0].id</code> and <code>data.items.0.id</code> both work, and so does a leading <code>$.</code>. <code>[-1]</code> is the last item. <code>[*]</code> checks <em>every</em> item — <code>items[*].price</code> is over <code>0</code> passes only when all of them are, and a failure names the first one that was not. With a wildcard, <em>has no duplicates</em> and <em>is sorted</em> look at the collected list.'
        })
      )
      for (const subject of SUBJECTS) {
        const ops = (OPERATORS[subject.id] ?? []).map((o) => OP_LABEL[o] ?? o).join(', ')
        doc.append(el('h4', { text: subject.label }))
        if (subject.blurb) doc.append(el('p', { text: subject.blurb }))
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
    id: 'scripts',
    label: 'Scripts',
    icon: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>',
    blurb: 'JavaScript before and after a request, written like Postman’s.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'The <strong>Scripts</strong> tab of a request holds two scripts: <strong>Pre-request</strong>, run before it is sent, and <strong>Tests</strong>, run when the response arrives. They are JavaScript, with Postman&rsquo;s <code>pm</code> object — <code>prism</code> is the same object — so a script copied from Postman runs as it is. The snippets above the editor cover the common cases.'
        }),
        el('h4', { text: 'Before the request' }),
        el('pre', { class: 'src' }, ["pm.variables.set('stamp', Date.now())","pm.request.headers.upsert({ key: 'X-Trace', value: pm.variables.get('stamp') })","if (!pm.environment.get('token')) pm.execution.skipRequest()"].map((text) => el('span', { class: 'ln', text }))),
        el('p', {
          html: 'A pre-request script may change the request — <code>pm.request.url</code>, <code>.method</code>, <code>.headers</code>, <code>.body</code> — or skip it with <code>pm.execution.skipRequest()</code>.'
        }),
        el('h4', { text: 'After the response' }),
        el('pre', { class: 'src' }, ["pm.test('Status code is 200', () => {","  pm.response.to.have.status(200)","})","pm.test('Has an email', () => {","  pm.expect(pm.response.json().email).to.include('@')","})","pm.environment.set('token', pm.response.json().token)"].map((text) => el('span', { class: 'ln', text }))),
        el('p', {
          html: 'Each <code>pm.test</code> is reported beside the assertions — in the <strong>Tests</strong> tab of the response, on the departure board, in the Runner and in reports. A script that throws is reported as a failure, never swallowed.'
        }),
        el('h4', { text: 'What a script can use' }),
        el('ul', {}, [
          el('li', { html: '<code>pm.response</code> — <code>.code</code>, <code>.status</code>, <code>.headers</code>, <code>.json()</code>, <code>.text()</code>, <code>.responseTime</code>, and <code>.to.have.status / header / jsonBody / jsonSchema</code>, <code>.to.be.ok</code>.' }),
          el('li', { html: '<code>pm.expect</code> — chai-style: <code>equal</code>, <code>eql</code>, <code>include</code>, <code>match</code>, <code>above</code>, <code>below</code>, <code>a(\'type\')</code>, <code>property</code>, <code>keys</code>, <code>lengthOf</code>, <code>oneOf</code>, <code>empty</code>, <code>null</code>, and <code>not</code>.' }),
          el('li', { html: '<code>pm.environment</code>, <code>pm.variables</code> (for this run), <code>pm.collectionVariables</code>, <code>pm.globals</code> and <code>pm.iterationData</code> (the Runner&rsquo;s data row, read-only) — each with <code>get</code>, <code>set</code>, <code>unset</code>, <code>has</code>; and <code>pm.variables.replaceIn(\'{{a}}\')</code>.' }),
          el('li', { html: '<code>pm.info</code> — the request&rsquo;s name and id, the iteration and how many there are.' }),
          el('li', { html: 'The older forms: <code>tests[\'name\'] = …</code>, <code>responseBody</code>, <code>responseCode</code>, <code>postman.setEnvironmentVariable</code>, and <code>require(\'chai\')</code>.' }),
          el('li', { html: '<code>console.log</code>, <code>.info</code>, <code>.warn</code> and <code>.error</code> — shown in the response&rsquo;s Console tab and in the app&rsquo;s Console.' })
        ]),
        el('div', {
          class: 'callout warn',
          html: '<strong>Sandboxed.</strong> A script runs in a worker of its own, with no network, no files, none of the app&rsquo;s controls and no code from outside the app, and is stopped after 5 seconds. <code>pm.sendRequest</code> is not available yet and says so.'
        }),
        el('p', {
          html: 'Scripts are saved with the workspace, carried in backups, run by <code>prism-run</code>, imported from a Postman collection&rsquo;s pre-request and test scripts, and written back by the Postman export.'
        })
      ])
  },
  {
    id: 'contract',
    label: 'OpenAPI contract',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14 2 2 4-4"/>',
    blurb: 'Every response checked against what the spec promises.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'A collection can carry its API&rsquo;s <strong>OpenAPI</strong> or <strong>Swagger</strong> document. Importing one keeps it; for any other collection, choose <strong>Attach OpenAPI spec…</strong> in its menu and pick the JSON or YAML file. It is saved with the workspace, so checks need no file and no network.'
        }),
        el('h4', { text: 'What is checked' }),
        el('p', {
          html: 'Each response is matched to its operation by method and path — <code>{{base_url}}/users/:id</code> finds <code>/users/{id}</code>, and server path prefixes are allowed for — and compared with what the spec documents for its status:'
        }),
        el('ul', {}, [
          el('li', { html: '<strong>The status</strong> is documented — exactly, as a range such as <code>2XX</code>, or by <code>default</code>.' }),
          el('li', { html: '<strong>The content type</strong> is one the operation declares for it.' }),
          el('li', { html: '<strong>The body</strong> matches its schema: types, required fields, enums, formats, nullable, and every <code>$ref</code>.' }),
          el('li', { html: '<strong>Required headers</strong> are there.' })
        ]),
        el('p', {
          html: 'Each break is a failed check, under <strong>Contract</strong>, wherever checks are reported. Fields the spec never mentions are listed as <em>not in the spec</em> but do not fail: that is the documentation catching up, not the API breaking.'
        }),
        el('h4', { text: 'Where to see it' }),
        el('ul', {}, [
          el('li', { html: 'The response&rsquo;s <strong>Contract</strong> tab: the operation, its documented statuses with the one that came back lit, and every finding. <em>Fail checks that break it</em> turns the failing off and keeps the findings.' }),
          el('li', { html: '<strong>Runner &rarr; Spec coverage</strong>: which documented operations your requests call and which statuses were seen, and each request&rsquo;s findings. <strong>Send and check</strong> sends them all first.' }),
          el('li', { html: '<code>prism-run</code> checks the same way and fails the run on a break; <code>--no-spec</code> turns that off.' })
        ])
      ])
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
      doc.append(el('h4', { text: 'Your checks come with it' }))
      doc.append(
        el('ul', {}, [
          el('li', { html: 'Every assertion is written out — status, time, types, formats, lengths, ranges, patterns, headers, cookies and schemas — following Prism&rsquo;s own rules.' }),
          el('li', { html: '<strong>JavaScript</strong> (fetch, axios, undici) and <strong>Python</strong> (requests) end in a small check runner that prints each check and exits with a failure code when any failed, so the file runs in CI as it is.' }),
          el('li', { html: '<strong>pytest</strong>, <strong>Playwright</strong> and <strong>Postman</strong> get every check as a test, and Postman gets your scripts back. <strong>REST Assured</strong> gets every check Hamcrest can express and names the rest.' }),
          el('li', { html: '<strong>Java, C#, Go, PHP and cURL</strong> list the checks in a comment and verify the expected status.' })
        ])
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
        el('pre', { class: 'src' }, ["prism-run checkout.prism.json --env CI --reporter junit --out results.xml","prism-run checkout.prism.json --env CI --reporter html --out report.html","prism-run checkout.prism.json --data users.csv --iterations 3"].map((text) => el('span', { class: 'ln', text }))),
        el('p', {
          html: '<code>--reporter</code> takes <code>text</code>, <code>json</code>, <code>junit</code> or <code>html</code> — the same Prism report the app saves. <code>--data</code> runs once per row of a CSV or JSON file, as the Runner does, and <code>--iterations</code> sets how many times. Pre-request and test scripts run too.'
        }),
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
    id: 'console',
    label: 'Console',
    icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3"/><path d="M12 15h5"/>',
    blurb: 'Every request as it actually went out, and what came back.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: '<strong>Ctrl&nbsp;`</strong>, or <strong>Console</strong> in the strip on the left, opens the console under the canvas. Every send is listed there, newest last — from Send, Run flow, Run all and the Runner — with the time, the method, the URL with its variables resolved, the request&rsquo;s name, the status, the time taken and the size.'
        }),
        el('h4', { text: 'Looking inside a request' }),
        el('p', {
          html: 'Click a row to see the <strong>request headers and body</strong> that were sent and the <strong>response headers and body</strong> that came back, each with Copy. A request that failed shows why, and which checks failed. Script <code>console.log</code> lines sit under the request that ran them.'
        }),
        el('h4', { text: 'Finding things' }),
        el('ul', {}, [
          el('li', { html: '<strong>All</strong>, <strong>Requests</strong>, <strong>Logs</strong> and <strong>Errors</strong> filter the list; the box beside them searches URLs, names and text.' }),
          el('li', { html: 'Errors are kept too — a request that could not be sent, a script that threw, and messages that were only shown as a notice. The Console button counts the ones you have not seen.' }),
          el('li', { html: '<strong>Clear</strong> empties it. Drag its top edge to make it taller or shorter; the height is remembered.' })
        ]),
        el('div', {
          class: 'callout',
          html: 'Credentials are masked — <code>Authorization</code>, cookie, API key and token headers, and secret-looking fields in bodies — until you press <strong>Show secrets</strong>. The console lives in memory, holds the last 500 entries, and is gone when Prism closes.'
        })
      ])
  },
  {
    id: 'layout',
    label: 'Your layout',
    icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d="M15 4v16"/>',
    blurb: 'The sidebar, the inspector and the method picker.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('h4', { text: 'The sidebar' }),
        el('p', {
          html: 'The strip of places down the left unfolds into a sidebar with each place named beside its icon: <strong>Expand</strong> at its foot, or <strong>Ctrl&nbsp;B</strong>. The collections, pages and canvas move over with it. It remembers which way you left it. Click <strong>Canvas</strong> again to fold the collections away for more room.'
        }),
        el('h4', { text: 'The inspector' }),
        el('ul', {}, [
          el('li', { html: '<strong>Maximise</strong> it — the button beside ⋯, <strong>Ctrl&nbsp;Shift&nbsp;M</strong>, or a double-click on its left edge — and it grows leftwards over the canvas up to the collections. The same again restores it.' }),
          el('li', { html: '<strong>Drag its left edge</strong> to any width in between, or focus the edge and use the arrow keys. The width is remembered.' }),
          el('li', { html: 'Wide enough, the request and the response sit <strong>side by side</strong>; drag the handle between them left and right. The expand button on either half fills the inspector with it, and the other folds to its bar.' }),
          el('li', { html: 'Settings &rarr; Inspector chooses between <strong>docked</strong> on the right, and <strong>floating</strong> beside the picked request.' })
        ]),
        el('h4', { text: 'The method' }),
        el('p', {
          html: 'The method button, in the method&rsquo;s own colour, opens the picker: each method with what it is for, the current one ticked. Move with the arrow keys and press Enter, or press a method&rsquo;s letter to pick it at once — <kbd>G</kbd>&nbsp;GET, <kbd>P</kbd>&nbsp;POST, <kbd>U</kbd>&nbsp;PUT, <kbd>A</kbd>&nbsp;PATCH, <kbd>D</kbd>&nbsp;DELETE, <kbd>H</kbd>&nbsp;HEAD, <kbd>O</kbd>&nbsp;OPTIONS. A method that is not in the list, such as <code>PURGE</code> or <code>PROPFIND</code>, can be typed at the foot.'
        }),
        el('h4', { text: 'gRPC' }),
        el('p', {
          html: '<strong>gRPC</strong>, in the same part of the picker, makes a request a gRPC call. Load the service&rsquo;s <code>.proto</code> on its gRPC tab, pick the service and method, and <strong>Use the example</strong> fills in a message to start from. Put <code>host:port</code> in the address bar — <code>grpcs://host:port</code> for TLS. Unary calls and server streams are supported. The answer is a response like any other: its gRPC status is mapped to the matching HTTP status (NOT_FOUND is 404), so tests, captures, flows and reports work as they do for HTTP.'
        }),
        el('h4', { text: 'Live connections' }),
        el('p', {
          html: 'Under <em>Live connections</em> in the method picker, <strong>WS</strong> makes a request a WebSocket and <strong>SSE</strong> a stream of Server-Sent Events. Send becomes <strong>Connect</strong>; the address and headers are built as for any send, auth included, and a <code>Sec-WebSocket-Protocol</code> header picks the subprotocol. The <strong>Messages</strong> tab logs every message sent ↑ and received ↓ as it happens, and for a WebSocket has a box to send one — <kbd>Ctrl Enter</kbd> sends. Flows and the Runner pass over live requests: a connection is held open by hand.'
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
        }),
        el('h4', { text: 'A folder, for Git' }),
        el('p', {
          html: '<strong>Save as a folder, for Git…</strong> in the Save menu keeps the workspace as a folder with a file per request, so a pull request shows exactly which request changed. Save writes back to it; a renamed or deleted request removes its own file, and nothing else in the folder is touched. The run history and timeline go in <code>.prism-local/</code>, which is added to <code>.gitignore</code>. <strong>Open a workspace folder…</strong> opens one, and <code>prism-run</code> runs one.'
        }),
        el('h4', { text: 'Backups' }),
        el('p', {
          html: 'Prism backs up the whole workspace — collections, environments, the canvas, baselines, run history and scripts — with this machine&rsquo;s settings: shortly after it starts, every hour while you work, and before anything replaces the workspace, such as opening another one, discarding changes or a restore. An hourly backup of untouched work is skipped, and the newest 30 are kept. Settings &rarr; Data turns this off.'
        }),
        el('p', {
          html: '<strong>Backups</strong> — in the workspace menu, Settings &rarr; Data, or <kbd>Ctrl K</kbd> &rarr; <em>Restore a backup</em> — lists them newest first, with what each holds and why it was taken. Restore one, save a copy, or delete it. <strong>Back up to a file</strong> and <strong>Restore from a file</strong> move a setup to another machine; a plain <code>.prism.json</code> restores too.'
        }),
        el('div', {
          class: 'callout',
          html: 'Every restore can be undone: the workspace open at the time is backed up first. Secret values are never in a backup; a restore keeps the ones you have where the environment and name match, and names any left to fill in.'
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
          el('dt', { text: 'Ctrl `' }),
          el('dd', { text: 'Open or close the console' }),
          el('dt', { text: 'Ctrl B' }),
          el('dd', { text: 'Expand or collapse the sidebar' }),
          el('dt', { text: 'Ctrl Shift M' }),
          el('dd', { text: 'Maximise or restore the inspector' }),
          el('dt', { text: 'Left / Right' }),
          el('dd', { text: 'On the inspector’s left edge, make it wider or narrower' }),
          el('dt', { text: 'Down' }),
          el('dd', { text: 'On the method button, open the method picker' }),
          el('dt', { text: 'G P U A D H O' }),
          el('dd', { text: 'In the method picker, pick GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS' }),
          el('dt', { text: 'F1' }),
          el('dd', { text: 'Open this help' }),
          el('dt', { text: 'Escape' }),
          el('dd', { text: 'Close whatever is open' }),
          el('dt', { text: 'Arrow keys' }),
          el('dd', { text: 'On the split handle, move it between request and response' })
        ]),
        el('p', {
          html: 'The palette also reaches Settings, Help, Environments, History, Import, Export, Run flow, Tidy, backups, reports, the console and the layout — anything in the bar has an entry there.'
        })
      ])
  },
  {
    id: 'ai',
    label: 'AI assistant',
    icon: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>',
    blurb: 'Off unless you turn it on, and you see everything it is sent.',
    body: () =>
      el('div', { class: 'doc' }, [
        el('p', {
          html: 'Prism has an assistant that can <strong>explain a failure</strong> and <strong>suggest checks</strong>. It is off until you choose a provider in <strong>Settings &rarr; AI</strong>: Anthropic or any OpenAI-compatible service with your own API key, or <strong>Ollama</strong> running on this machine, in which case nothing leaves it.'
        }),
        el('h4', { text: 'What it does' }),
        el('ul', {}, [
          el('li', { html: '<strong>Explain</strong>, on a failed result&rsquo;s Tests tab, sends the request as written, what came back and the checks that failed, and shows the answer.' }),
          el('li', { html: '<strong>Suggest with AI</strong>, beside Generate on the Tests tab, asks for checks in Prism&rsquo;s own terms. Anything that is not a Prism check is dropped, and each suggestion is run against the last response first — the ones that pass are ticked, and you add the ones you want.' })
        ]),
        el('h4', { text: 'What it is sent' }),
        el('p', {
          html: 'Every question is shown in full under <em>What will be sent</em> before you press Ask. Credential headers are masked, secret-looking fields in bodies are masked, every secret variable&rsquo;s value is replaced wherever it appears, URLs are sent as written with <code>{{variables}}</code> unresolved, and long bodies are cut. Your API key is kept by the operating system&rsquo;s encrypted store and used by Prism&rsquo;s main process — never written into settings, the workspace or a backup.'
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
          html: 'Only the requests you send, to the hosts you aim them at. Prism has no telemetry, no account, no update check and no network use of its own — and scripts cannot reach the network at all. The one exception is the AI assistant, which is off unless you turn it on, and then sends only the question you see, to the provider you chose (or to Ollama on this machine).'
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
            html: 'Backups of the workspace and settings, in the app&rsquo;s own directory — the newest 30, never with a secret&rsquo;s value. Settings &rarr; Data turns them off.'
          }),
          el('li', {
            html: 'Response bodies, cookies, OAuth tokens and the console in memory only, gone when Prism closes.'
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
            html: 'Masked in the inspector&rsquo;s request headers, unless you turn that off in Settings &rarr; Safety; masked in the console until you press Show secrets; and masked in the response samples in a saved report.'
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
        if (scroll) scroll.scrollTo({ top: topIn(scroll, head) - 20, behavior: 'smooth' })
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
      id: 'timeline',
      label: 'Run timeline',
      icon: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
      badge: S.runs.length || '',
      blurb: 'Every run of a flow, kept — pick any two to see what broke, what was fixed, what got slower and which fields changed.',
      actions: () => (S.runs.length ? [el('button', { class: 'btn', type: 'button', text: 'Clear the timeline', onclick: async () => {
        const yes = await ask({ title: 'Clear the run timeline?', blurb: `${S.runs.length === 1 ? 'The one run is' : `All ${S.runs.length} runs are`} removed from this workspace. Requests and their tests are not touched.`, danger: 'Clear timeline', note: 'This cannot be undone.' })
        if (!yes) return
        S.runs = []
        commit()
        openHistory()
      } })] : []),
      render: () => timelinePanel()
    },
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

/* ----------------------------------------------------------- the timeline */

/** A finished run, into the timeline: each request's latest result, as types and numbers. */
function rememberRun(target, source, ms, items, env = environment()) {
  const results = items.map(({ req, skipped }) => {
    const res = S.results.get(req.id)
    return {
      id: req.id,
      name: req.name || 'Untitled',
      method: req.method,
      skipped: skipped || !res,
      status: res?.status ?? 0,
      ms: res?.timing?.total ?? 0,
      error: res?.skipped ? '' : res?.error ?? '',
      checks: (res?.checks ?? []).map((c) => ({ name: describe(c.assertion), ok: c.ok })),
      shape: res && !res.error ? shapeOf(res.json) : null
    }
  })
  S.runs = keepRun(S.runs, runRecord({ id: `run-${Date.now().toString(36)}`, at: Date.now(), source, target, env: env?.name ?? '', ms, results }))
}

let timelineTarget = ''
let timelinePick = { a: '', b: '' }

function timelinePanel() {
  if (!S.runs.length) {
    return el('div', { class: 'hist-empty' }, [
      el('span', { class: 'empty-ico', html: ico('<path d="M3 12h4l3-8 4 16 3-8h4"/>', 20, 1.8) }),
      el('b', { text: 'No runs on the timeline yet' }),
      el('p', { text: 'Run a flow — or a single pass in the Runner — and the run is kept here: statuses, times, which checks passed, and each response’s shape. Pick any two to see what changed between them.' }),
      el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 10)}<span>Run the current flow</span>`, onclick: () => {
        closePage()
        runFlow()
      } })
    ])
  }
  const targets = [...new Map(S.runs.map((x) => [`${x.target.kind}:${x.target.id}`, x.target])).entries()]
  if (!targets.some(([k]) => k === timelineTarget)) timelineTarget = targets[0][0]
  const runs = S.runs.filter((x) => `${x.target.kind}:${x.target.id}` === timelineTarget)
  if (!runs.some((x) => x.id === timelinePick.b)) timelinePick.b = runs[0].id
  if (!runs.some((x) => x.id === timelinePick.a) || timelinePick.a === timelinePick.b) timelinePick.a = runs.find((x) => x.id !== timelinePick.b)?.id ?? ''
  const when = (at) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const pickTarget = el('select', { class: 'rn-select', onchange: (e) => {
    timelineTarget = e.target.value
    timelinePick = { a: '', b: '' }
    openHistory()
  } }, targets.map(([k, t]) => el('option', { value: k, text: `${t.name} (${S.runs.filter((x) => `${x.target.kind}:${x.target.id}` === k).length})`, selected: k === timelineTarget })))

  // The runs of this flow, newest first, each with a dot per request.
  const list = el('div', { class: 'rn-it tl-runs' }, runs.map((run) => {
    const tot = runTotals(run)
    const role = run.id === timelinePick.b ? 'b' : run.id === timelinePick.a ? 'a' : ''
    return el('div', { class: `tl-run${role ? ` ${role}` : ''}${tot.failed ? ' bad' : ''}` }, [
      el('span', { class: 'rn-dot' }),
      el('div', { class: 'rn-res-words' }, [el('b', { text: when(run.at) }), el('span', { text: `${run.source} · ${run.env || 'no environment'} · ${secs(run.ms)}` })]),
      el('span', { class: 'tl-dots' }, run.results.map((x) => el('i', { class: x.skipped ? 'skip' : x.error || x.checks.some((c) => !c.ok) ? 'bad' : 'ok', title: `${x.name} — ${x.skipped ? 'not run' : x.error ? 'failed to send' : `${x.status}, ${x.ms} ms`}` }))),
      el('span', { class: `tl-score${tot.failed ? ' bad' : ''}`, text: tot.failed ? `${tot.failed} failed` : 'passed' }),
      el('span', { class: 'seg tl-pick' }, [
        el('button', { class: `segbtn${role === 'a' ? ' on' : ''}`, type: 'button', title: 'Compare from this run', text: 'A', disabled: role === 'b', onclick: () => {
          timelinePick.a = run.id
          openHistory()
        } }),
        el('button', { class: `segbtn${role === 'b' ? ' on' : ''}`, type: 'button', title: 'Compare to this run', text: 'B', disabled: role === 'a', onclick: () => {
          timelinePick.b = run.id
          openHistory()
        } })
      ])
    ])
  }))

  const A = runs.find((x) => x.id === timelinePick.a)
  const B = runs.find((x) => x.id === timelinePick.b)
  let compare = el('p', { class: 'cmp-note', text: 'Run this flow once more, and the two runs can be compared.' })
  if (A && B) {
    // Always earlier → later, whichever way round they were picked.
    const [from, to] = A.at <= B.at ? [A, B] : [B, A]
    const { rows, summary } = compareRuns(from, to)
    const tone = (c) => (['broke', 'check-broke', 'gone'].includes(c.kind) ? 'breaks' : ['slower', 'shape', 'status', 'new'].includes(c.kind) ? 'differs' : 'same')
    const changed = rows.filter((x) => x.changes.length)
    compare = el('div', { class: 'tl-compare' }, [
      el('div', { class: 'rn-run-head' }, [el('div', { class: 'rn-run-title' }, [el('b', { text: `${when(from.at)} → ${when(to.at)}` }), el('span', { text: `${from.env || 'no environment'} → ${to.env || 'no environment'}` })])]),
      el('div', { class: 'rn-tiles' }, [
        ['Changed', `${summary.changed}/${summary.total}`, ''],
        ['Broke', String(summary.broke), summary.broke ? 'bad' : ''],
        ['Fixed', String(summary.fixed), summary.fixed ? 'ok' : ''],
        ['Slower', String(summary.slower), summary.slower ? 'warn' : ''],
        ['Faster', String(summary.faster), summary.faster ? 'ok' : ''],
        ['Shape', String(summary.shape), summary.shape ? 'warn' : '']
      ].map(([label, value, t]) => el('div', { class: `rn-tile ${t}` }, [el('b', { text: value }), el('span', { text: label })]))),
      el('div', { class: 'rn-it cmp-list' }, changed.length
        ? changed.map((x) => {
            const worst = x.changes.some((c) => tone(c) === 'breaks') ? 'breaks' : x.changes.some((c) => tone(c) === 'differs') ? 'differs' : 'same'
            return el('div', { class: `cmp-row tl-change ${worst}` }, [
              el('div', { class: 'tl-change-head' }, [
                el('span', { class: 'rn-dot' }),
                el('span', { class: `verb ${x.method.toLowerCase()}`, text: x.method }),
                el('b', { text: x.name }),
                el('span', { class: 'cmp-side' }, [el('span', { class: 'cmp-ms', text: x.before ? (x.before.error ? 'failed' : `${x.before.status} · ${x.before.ms} ms`) : '—' })]),
                el('span', { class: 'cmp-side' }, [el('span', { class: 'cmp-ms', text: x.after ? (x.after.error ? 'failed' : `${x.after.status} · ${x.after.ms} ms`) : '—' })])
              ]),
              el('ul', { class: 'cmp-why tl-why' }, x.changes.map((c) => el('li', { class: tone(c), text: c.text })))
            ])
          })
        : [el('p', { class: 'cmp-note cmp-none', text: 'Nothing changed between these two runs — same results, same times within reason, same shapes.' })])
    ])
  }

  return el('div', { class: 'tl' }, [
    el('div', { class: 'tl-side' }, [el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: 'Flow' }), pickTarget]), el('p', { class: 'rn-hint', text: 'Pick A and B to compare any two runs; the latest two are compared to begin with.' }), list]),
    el('div', { class: 'tl-main' }, [compare])
  ])
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
      const yes = await ask({ title: 'Clear the run history?', blurb: `${S.history.length === 1 ? 'The one run is' : `All ${S.history.length} runs are`} removed from this workspace. Requests and their tests are not touched.`, danger: 'Clear history', note: 'This cannot be undone.' })
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
/**
 * The record of a run, for its report: one flow when a flow is run, every
 * flow when Run all or a collection is. The latest is kept, so the report
 * can be saved from the board — or later, from the command palette.
 */
let lastReport = null

function newRunSession() {
  return {
    workspace: S.savedName || 'Workspace',
    environment: environment()?.name ?? 'none',
    startedAt: new Date().toISOString(),
    runId: `run-${Date.now().toString(36)}`,
    prism: PRISM_VERSION,
    source: 'Prism app',
    ms: 0,
    flows: []
  }
}

const PRISM_VERSION = '0.1.0'

/**
 * Prism's own typefaces, read once and kept, so a saved report looks like
 * Prism wherever it is opened. Missing fonts only mean system fonts.
 */
let reportFonts = null
async function fontsForReport() {
  if (reportFonts) return reportFonts
  const read = async (file) => {
    try {
      const bytes = new Uint8Array(await (await fetch(`./fonts/${file}`)).arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(text)
    } catch {
      return ''
    }
  }
  reportFonts = { grotesk: await read('familjen-grotesk.woff2'), mono: await read('space-mono-400.woff2'), monoBold: await read('space-mono-700.woff2') }
  return reportFonts
}

async function runFlow(only, session = newRunSession()) {
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
  workIn(flow)

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
  const state = new Map(
    flat.map((r) => [r.id, { id: r.id, name: r.name || 'Untitled', method: String(r.method || 'GET').toUpperCase(), status: 'wait', ms: 0, code: 0, at: 0 }])
  )
  const panel = runPanel(flow, p, state)

  const started = performance.now()
  let halted = null
  for (const stage of p.stages) {
    if (panel.stopped || halted) break
    await Promise.all(
      stage.map(async (r) => {
        const x = state.get(r.id)
        x.status = 'run'
        x.at = performance.now() - started
        x.clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        panel.paint()
        const res = (await send(r, { confirmed: true, quiet: true })) ?? S.results.get(r.id)
        x.ms = res?.timing?.total ?? 0
        x.code = res?.status ?? 0
        x.error = Boolean(res?.error) && !res?.skipped
        x.checks = res?.checks?.length ? `${res.checks.length - res.failed}/${res.checks.length}` : ''
        x.status = res?.skipped && !res?.failed ? 'skip' : res?.failed || res?.error ? 'fail' : 'pass'
        if (res?.logic?.stop) halted = r
        panel.paint()
      })
    )
  }

  if (halted) toast('bad', `${halted.name || 'A step'} failed and is set to stop the flow — the rest did not run`)
  const all = [...state.values()]
  const failed = all.filter((x) => x.status === 'fail').length
  const ran = all.filter((x) => x.status !== 'wait').length
  const wall = performance.now() - started
  const serial = all.reduce((n, x) => n + x.ms, 0)
  // Only mentioned when the parallelism actually bought something, so the
  // claim is never larger than the saving.
  const saved = !p.sequential && serial > wall + 100 ? Math.round(serial - wall) : 0
  // Into the run's report: every request, with each check as its sentence.
  // The URL is the one the request was written with, never resolved.
  // Which stage each request ran in, and when it left, for the timeline.
  const stageOfReq = new Map()
  p.stages.forEach((stage, i) => stage.forEach((r) => stageOfReq.set(r.id, i)))
  session.flows.push({
    name: flow.name || 'Untitled flow',
    ms: Math.round(wall),
    results: flat.map((r) => {
      const x = state.get(r.id)
      const res = S.results.get(r.id)
      const base = {
        name: r.name || 'Untitled',
        method: verbOf(r),
        url: r.url || '',
        stage: stageOfReq.get(r.id) ?? 0,
        needs: variablesUsed(r),
        gives: (r.captures ?? []).map((c) => c.name).filter(Boolean)
      }
      if (x.status === 'wait' || x.status === 'skip') return { ...base, skipped: true, ms: 0, checks: [], failed: 0 }
      if (!res || res.error) return { ...base, at: Math.round(x.at), error: res?.error ?? 'No response', ms: 0, checks: [], failed: 1 }
      const type = Object.entries(res.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
      return {
        ...base,
        at: Math.round(x.at),
        status: res.status,
        ms: res.timing?.total ?? 0,
        bytes: res.bytes ?? 0,
        contentType: Array.isArray(type) ? type.join(', ') : type ?? '',
        failed: res.failed ?? 0,
        checks: (res.checks ?? []).map((c) => ({
          ok: c.ok,
          name: describe(c.assertion),
          detail: c.detail,
          subject: c.assertion?.subject,
          group: checkGroup(c.assertion?.subject)
        })),
        // Masked before it is kept: a report gets shared.
        sample: sampleOf(res.body)
      }
    })
  })
  session.variables = [...new Set(session.flows.flatMap((f) => f.results.flatMap((x) => x.needs ?? [])))]
  session.ms = Date.now() - new Date(session.startedAt).getTime()
  lastReport = session
  rememberRun({ kind: 'flow', id: flow.id, name: flow.name || 'Untitled flow' }, 'Run flow', Math.round(wall), flat.map((r) => ({ req: r, skipped: state.get(r.id)?.status === 'wait' })))
  panel.finish({ wall, saved })
  // The panel says all of this itself; the toast is for when it was closed.
  if (!panel.open()) {
    toast(failed ? 'bad' : 'ok', `${flow.name} — ${ran - failed} passed, ${failed} failed${saved ? `, ${saved}ms saved by running in parallel` : ''}`)
  }
}

/**
 * The run panel: a live console for a flow while it runs, floating over the
 * foot of the canvas so the nodes lighting up stay in view above it.
 *
 * One segment per request in the bar along the top, a waterfall underneath —
 * each request a span starting when it was sent and as long as it took, so
 * what ran together lines up and the slow one stands out — and when it is
 * over, the verdict and what to do about it. A row opens its request.
 */
function runPanel(flow, p, state) {
  document.querySelector('.runner')?.remove()
  const t0 = performance.now()
  let done = null
  let tick = 0
  const api = { stopped: false }

  const orb = el('span', { class: 'runner-orb' })
  const title = el('b')
  const blurb = el('span')
  const clock = el('span', { class: 'runner-clock', text: '0.00 s' })
  const close = el('button', { class: 'runner-x', type: 'button', title: 'Close', 'aria-label': 'Close', html: ico(I.x, 14, 2.2) })
  const bar = el('div', { class: 'runner-bar' })
  const stats = el('div', { class: 'runner-stats' })
  const list = el('div', { class: 'runner-list' })
  const foot = el('div', { class: 'runner-foot' })
  const panel = el('section', { class: 'runner', role: 'status', 'aria-live': 'polite', 'aria-label': `Running ${flow.name}` }, [
    el('header', { class: 'runner-head' }, [orb, el('div', { class: 'runner-title' }, [el('span', { class: 'runner-kicker', text: 'Departures' }), title, blurb]), clock, close]),
    bar,
    stats,
    list,
    foot
  ])

  const rows = new Map()
  const segs = new Map()
  const stageOf = new Map()
  p.stages.forEach((stage, i) => stage.forEach((r) => stageOf.set(r.id, i)))
  p.stages.forEach((stage, i) => {
    // Only worth labelling when there is something to say: a flow that is
    // one long chain reads as a plain list.
    if (!p.sequential) {
      list.append(el('div', { class: 'runner-stage', text: `Stage ${i + 1} · ${stage.length === 1 ? 'on its own' : `${stage.length} at once`}` }))
    }
    for (const r of stage) {
      const x = state.get(r.id)
      const seg = el('span', { class: 'runner-seg', 'data-state': 'wait' })
      bar.append(seg)
      segs.set(r.id, seg)
      const span = el('i', { class: 'runner-span' })
      const code = el('span', { class: 'runner-code' })
      const ms = el('span', { class: 'runner-ms' })
      const time = el('span', { class: 'runner-time', text: '--:--:--' })
      const remark = el('span', { class: 'runner-remark' })
      const row = el(
        'button',
        { class: 'runner-row', type: 'button', 'data-state': 'wait', title: `Open ${x.name}`, onclick: () => pick(r.id) },
        [
          el('span', { class: 'runner-state' }),
          time,
          el('span', { class: `verb ${verbOf(r).toLowerCase()}`, text: verbOf(r) }),
          el('span', { class: 'runner-name', text: x.name }),
          el('span', { class: 'runner-track' }, [span]),
          code,
          ms,
          remark
        ]
      )
      rows.set(r.id, { row, span, code, ms, time, remark })
      list.append(row)
    }
  })

  const paint = () => {
    const all = [...state.values()]
    const now = performance.now() - t0
    const count = (st) => all.filter((x) => x.status === st).length
    const passed = count('pass')
    const failed = count('fail')
    const running = count('run')
    const waiting = count('wait')
    const finished = passed + failed
    const share = all.length ? finished / all.length : 0
    const wall = done ? done.wall : now
    // The waterfall is drawn in time on the wire: each stage starts where the
    // slowest request of the one before it ended, so requests sent together
    // line up and the slow one stands out — rather than spreading a few
    // milliseconds of network across a second of the app painting between.
    const len = (x) => (x.status === 'run' ? now - x.at : x.ms)
    const starts = []
    let at = 0
    for (const stage of p.stages) {
      starts.push(at)
      at += Math.max(0, ...stage.map((r) => len(state.get(r.id))))
    }
    const scale = Math.max(1, at)

    const C = 2 * Math.PI * 21
    const bad = failed > 0
    orb.dataset.state = done ? (bad ? 'fail' : 'pass') : 'run'
    orb.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="21"></circle><circle class="fill" cx="24" cy="24" r="21" stroke-dasharray="${(C * share).toFixed(1)} ${C.toFixed(1)}"></circle></svg>${
      done ? ico(bad ? I.x : I.check, 18, 2.6) : `<em>${Math.round(share * 100)}<small>%</small></em>`
    }`

    if (!done) {
      title.textContent = `Running ${flow.name}`
      blurb.textContent = describePlan(p) + (p.unresolved.length ? ` · ${p.unresolved.length} value${p.unresolved.length === 1 ? '' : 's'} nothing provides` : '')
    } else {
      const ran = passed + failed
      title.textContent = api.stopped
        ? `${flow.name} stopped`
        : bad
          ? `${flow.name}: ${failed} of ${ran} failed`
          : `${flow.name} passed`
      blurb.textContent = `${ran} request${ran === 1 ? '' : 's'} in ${secs(done.wall)}${done.saved ? ` · ${done.saved} ms saved by running in parallel` : ''}${waiting ? ` · ${waiting} not run` : ''}`
    }
    clock.textContent = secs(wall)

    for (const x of all) {
      const seg = segs.get(x.id)
      seg.dataset.state = x.status
      const r = rows.get(x.id)
      r.row.dataset.state = x.status
      r.span.style.left = `${((starts[stageOf.get(x.id)] / scale) * 100).toFixed(2)}%`
      r.span.style.width = x.status === 'wait' ? '0' : `${Math.max(1.5, (len(x) / scale) * 100).toFixed(2)}%`
      r.code.textContent = x.code ? String(x.code) : ''
      r.code.dataset.tone = x.code ? tone(x.code) : ''
      r.ms.textContent = x.status === 'wait' || x.status === 'run' ? '' : `${x.ms} ms`
      if (x.clock) r.time.textContent = x.clock
      // The board's remark column, in a departure board's words.
      r.remark.textContent =
        x.status === 'wait'
          ? done ? 'Not run' : 'Scheduled'
          : x.status === 'skip'
            ? 'Skipped'
          : x.status === 'run'
            ? 'Boarding'
            : x.error
              ? 'Cancelled'
              : `${x.checks ? `${x.checks} ` : ''}${x.status === 'fail' ? 'Delayed' : 'On time'}`
    }

    stats.replaceChildren(
      ...[
        ['pass', passed, 'passed'],
        ['fail', failed, 'failed'],
        ['run', running, 'running'],
        ['wait', waiting, done ? 'not run' : 'waiting']
      ]
        .filter(([st, n]) => n || st === 'pass' || (st === 'fail' && done))
        .map(([st, n, word]) => el('span', { class: 'runner-chip', 'data-state': st }, [el('b', { text: String(n) }), el('span', { text: word })]))
    )

    foot.replaceChildren()
    if (!done) {
      if (p.stages.length > 1) {
        foot.append(
          el('button', {
            class: 'btn plain',
            type: 'button',
            text: api.stopped ? 'Stopping after this stage…' : 'Stop after this stage',
            disabled: api.stopped,
            onclick: () => {
              api.stopped = true
              paint()
            }
          })
        )
      }
      return
    }
    const firstBad = all.find((x) => x.status === 'fail')
    if (firstBad) {
      foot.append(el('button', { class: 'btn', type: 'button', html: `${ico(I.eye, 13, 2)}<span>Show the failure</span>`, onclick: () => pick(firstBad.id) }))
    }
    foot.append(el('span', { class: 'spacer' }))
    foot.append(
      el('button', {
        class: 'btn',
        type: 'button',
        'aria-haspopup': 'menu',
        html: `${ico(I.up, 13, 2)}<span>Save report</span>`,
        onclick: (e) => openMenu(e.currentTarget, reportMenu())
      })
    )
    foot.append(el('button', { class: 'btn plain', type: 'button', text: 'Close', onclick: shut }))
    foot.append(
      el('button', {
        class: 'btn go',
        type: 'button',
        html: `${ico(I.play, 12, 2)}<span>Run again</span>`,
        onclick: () => {
          shut()
          runFlow(flow)
        }
      })
    )
  }

  function shut() {
    clearInterval(tick)
    window.removeEventListener('resize', place)
    panel.classList.add('out')
    setTimeout(() => panel.remove(), 180)
  }

  close.onclick = shut
  document.body.append(panel)
  const place = () => {
    const plane = $('plane').getBoundingClientRect()
    const box = visibleBox()
    const w = Math.min(920, box.x2 - box.x1 - 16)
    panel.style.left = `${Math.round(plane.left + box.x1 + (box.x2 - box.x1 - w) / 2)}px`
    panel.style.width = `${Math.round(w)}px`
  }
  place()
  window.addEventListener('resize', place)
  paint()
  // The clock and the running spans move between results, not only on them.
  tick = setInterval(() => {
    if (!panel.isConnected) clearInterval(tick)
    else paint()
  }, 100)

  api.paint = paint
  api.open = () => panel.isConnected && !panel.classList.contains('out')
  api.finish = (result) => {
    done = result
    clearInterval(tick)
    paint()
  }
  return api
}

/** A duration in seconds, to two places under ten and one above. */
function secs(ms) {
  const v = ms / 1000
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)} s`
}

/** Every flow in a collection, one flow after another. */
async function runCollection(col) {
  const session = newRunSession()
  for (const flow of col.flows) {
    if (flow.requests.length) await runFlow(flow, session)
  }
}

/* ================================================================= runner */

/**
 * The collection runner: a collection or a flow, run end to end as many
 * times as you like — once per row of a data file, with that row's columns
 * as variables — and every iteration reported.
 *
 * Kept for the session, not the workspace: what was run and how is a
 * choice for now, and the run itself is in the report you save from it.
 */
const runner = {
  target: '',
  skip: new Set(),
  envId: '',
  iterations: 1,
  data: null,
  delay: 0,
  bail: false,
  keepVars: true,
  running: false,
  stopping: false,
  run: null,
  filter: 'all'
}

/** Everything that can be run: each collection whole, and each flow. */
function runTargets() {
  const out = []
  for (const col of S.collections) {
    const n = col.flows.reduce((k, f) => k + f.requests.length, 0)
    if (!n) continue
    out.push({ id: `col:${col.id}`, label: `${col.name} — every flow`, requests: col.flows.flatMap((f) => f.requests) })
    for (const flow of col.flows) {
      if (flow.requests.length) out.push({ id: `flow:${flow.id}`, label: `${col.name} › ${flow.name}`, requests: flow.requests })
    }
  }
  return out
}

function currentTarget() {
  const all = runTargets()
  let t = all.find((x) => x.id === runner.target)
  if (!t) {
    // The flow being worked in, when there is one; else the first thing that runs.
    const working = allFlows().find((f) => f.id === workingFlowId)
    t = all.find((x) => x.id === `flow:${working?.id}`) ?? all[0] ?? null
    runner.target = t?.id ?? ''
  }
  return t
}

let runnerAt = 'runner'

/** The Runner's tools: each runs the same choice of collection or flow its own way. */
function runnerSections() {
  return [
    { id: 'runner', label: 'Collection runner', icon: '<path d="M4 6h10"/><path d="M4 12h7"/><path d="M4 18h10"/><path d="m16 10 5 3-5 3z" fill="currentColor"/>', head: runnerHead, render: runnerPanel },
    { id: 'contract', label: 'Spec coverage', icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14 2 2 4-4"/>', head: specHead, render: specPanel },
    { id: 'schedule', label: 'Schedules', icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 3h6"/>', badge: S.schedules.filter((x) => x.on).length || '', head: scheduleHead, render: schedulePanel },
    { id: 'load', label: 'Load test', icon: '<path d="M3 20h18"/><path d="M6 16v-4"/><path d="M10 16V8"/><path d="M14 16v-6"/><path d="M18 16V5"/>', head: loadHead, render: loadPanel },
    { id: 'mock', label: 'Mock server', icon: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>', head: mockHead, render: mockPanel },
    { id: 'compare', label: 'Compare environments', icon: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/><path d="M10 9h4"/><path d="M10 15h4"/>', head: runCompareHead, render: runComparePanel }
  ]
}

function openRunner(section = runnerAt) {
  runnerAt = runnerSections().some((x) => x.id === section) ? section : 'runner'
  page({
    title: 'Runner',
    sections: runnerSections(),
    active: runnerAt,
    onPick: (id) => openRunner(id)
  })
}

function runnerHead() {
  const t = currentTarget()
  return pageHero(
    'Collection runner',
    'Run a collection or a flow end to end, as many times as you need — once per row of a data file, with each column as a {{variable}}.',
    [
      runner.running
        ? el('button', { class: 'btn bad', type: 'button', html: `${ico(I.x, 12, 2.4)}<span>${runner.stopping ? 'Stopping…' : 'Stop'}</span>`, disabled: runner.stopping, onclick: () => {
            runner.stopping = true
            openRunner()
          } })
        : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Run ${t ? runnerCount() : ''}</span>`, disabled: !t, onclick: () => runRunner() })
    ]
  )
}

/** "3 requests × 12 iterations", as the Run button says it. */
function runnerCount() {
  const t = currentTarget()
  const n = t ? t.requests.filter((r) => !runner.skip.has(r.id)).length : 0
  const it = runnerIterations()
  return `${n} request${n === 1 ? '' : 's'}${it > 1 ? ` × ${it}` : ''}`
}

function runnerIterations() {
  if (runner.data) return clamp(Number(runner.iterations) || runner.data.rows.length, 1, runner.data.rows.length)
  return clamp(Number(runner.iterations) || 1, 1, 10000)
}

function runnerPanel() {
  const t = currentTarget()
  if (!t) {
    return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to run yet' }), el('p', { text: 'Add a request to a flow, and it can be run from here.' })])
  }
  const setting = (label, control, hint) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control, hint ? el('span', { class: 'rn-hint', text: hint }) : null])
  const refresh = () => openRunner()

  // What runs, and which of its requests.
  const pickTarget = el(
    'select',
    { class: 'rn-select', onchange: (e) => {
      runner.target = e.target.value
      runner.skip.clear()
      refresh()
    } },
    runTargets().map((x) => el('option', { value: x.id, text: x.label, selected: x.id === t.id }))
  )
  const list = el('div', { class: 'rn-requests' }, [
    el('div', { class: 'rn-requests-head' }, [
      el('span', { text: `${t.requests.length - t.requests.filter((r) => runner.skip.has(r.id)).length} of ${t.requests.length} selected` }),
      el('button', { class: 'btn plain sm', type: 'button', text: runner.skip.size ? 'Select all' : 'Select none', onclick: () => {
        if (runner.skip.size) runner.skip.clear()
        else for (const r of t.requests) runner.skip.add(r.id)
        refresh()
      } })
    ]),
    ...t.requests.map((r, i) =>
      el('label', { class: `rn-req${runner.skip.has(r.id) ? ' off' : ''}` }, [
        el('input', { class: 'tick', type: 'checkbox', checked: !runner.skip.has(r.id), onchange: (e) => {
          if (e.target.checked) runner.skip.delete(r.id)
          else runner.skip.add(r.id)
          refresh()
        } }),
        el('span', { class: 'rn-order', text: String(i + 1) }),
        el('span', { class: `verb ${verbOf(r).toLowerCase()}`, text: verbOf(r) }),
        el('span', { class: 'rn-name', text: r.name || 'Untitled' }),
        r.scripts?.pre?.trim() || r.scripts?.test?.trim() ? el('span', { class: 'rn-tag', text: 'script' }) : null
      ])
    )
  ])

  const pickEnv = el(
    'select',
    { class: 'rn-select', onchange: (e) => {
      runner.envId = e.target.value
    } },
    [
      el('option', { value: '', text: `The active one (${environment()?.name ?? 'none'})`, selected: !runner.envId }),
      ...S.environments.map((env) => el('option', { value: env.id, text: env.name, selected: env.id === runner.envId }))
    ]
  )

  // The data file: one iteration per row, each column a variable.
  const data = runner.data
  const dataBox = el('div', { class: 'rn-data' })
  if (!data) {
    const drop = el('div', { class: 'rn-drop', tabindex: '0', role: 'button', onclick: () => chooseRunnerData() }, [
      el('span', { class: 'rn-drop-ico', html: ico(I.import, 18, 1.8) }),
      el('b', { text: 'Add a data file' }),
      el('span', { text: 'CSV or JSON — one iteration per row, each column a {{variable}}' })
    ])
    drop.addEventListener('dragover', (e) => {
      e.preventDefault()
      drop.classList.add('over')
    })
    drop.addEventListener('dragleave', () => drop.classList.remove('over'))
    drop.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer?.files?.[0]
      if (file) useRunnerData(await file.text(), file.name)
    })
    dataBox.append(
      drop,
      el('button', { class: 'btn plain sm rn-gen', type: 'button', html: `${ico(I.sparkle ?? I.plus, 12, 2)}<span>Or generate test data from a schema…</span>`, onclick: () => openGenerateData() })
    )
  } else {
    const used = new Set(t.requests.flatMap((r) => variablesUsed(r)))
    const scriptsText = t.requests.map((r) => `${r.scripts?.pre ?? ''}\n${r.scripts?.test ?? ''}`).join('\n')
    dataBox.append(
      el('div', { class: 'rn-data-head' }, [
        el('span', { class: 'rn-drop-ico', html: ico(I.table, 16, 1.8) }),
        el('div', { class: 'rn-data-words' }, [el('b', { text: data.name }), el('span', { text: data.generated ? `${data.rows.length} cases · ${data.rows.filter((x) => x.expect === 'accept').length} to accept, ${data.rows.filter((x) => x.expect === 'reject').length} to refuse · sent as ${findRequest(data.generated.reqId)?.name ?? 'the request'}’s body` : `${data.rows.length} row${data.rows.length === 1 ? '' : 's'} · ${data.columns.length} column${data.columns.length === 1 ? '' : 's'}` })]),
        el('button', { class: 'btn plain sm', type: 'button', text: 'Replace', onclick: () => chooseRunnerData() }),
        el('button', { class: 'btn plain sm', type: 'button', text: 'Remove', onclick: () => {
          runner.data = null
          runner.iterations = 1
          refresh()
        } })
      ]),
      // Generated rows are sent as a body, not read as {{variables}}.
      ...(data.generated
        ? []
        : [
            el(
              'div',
              { class: 'rn-cols' },
              data.columns.map((c) => {
                const usedHere = used.has(c) || scriptsText.includes(c)
                return el('span', { class: `rn-col${usedHere ? ' used' : ''}`, title: usedHere ? `Used as {{${c}}}` : 'Not used by any selected request', text: `{{${c}}}` })
              })
            )
          ]),
      el('div', { class: 'rn-table-wrap' }, [
        el('table', { class: 'rn-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '#' }), ...data.columns.map((c) => el('th', { text: c }))])]),
          el('tbody', {}, data.rows.slice(0, 5).map((row, i) => el('tr', {}, [el('td', { text: String(i + 1) }), ...data.columns.map((c) => el('td', { text: row[c] ?? '' }))])))
        ])
      ]),
      ...(data.rows.length > 5 ? [el('span', { class: 'rn-hint', text: `and ${data.rows.length - 5} more row${data.rows.length - 5 === 1 ? '' : 's'}` })] : [])
    )
  }

  const iterations = el('input', { class: 'rn-num', type: 'number', min: '1', max: String(data ? data.rows.length : 10000), value: String(runnerIterations()), oninput: (e) => {
    runner.iterations = Number(e.target.value) || 1
  } })
  const delay = el('input', { class: 'rn-num', type: 'number', min: '0', step: '50', value: String(runner.delay), oninput: (e) => {
    runner.delay = Math.max(0, Number(e.target.value) || 0)
  } })
  const toggle = (key, label, hint) =>
    el('div', { class: 'rn-toggle' }, [
      el('div', {}, [el('b', { text: label }), el('span', { text: hint })]),
      el('button', { class: `switch${runner[key] ? ' on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(runner[key]), 'aria-label': label, onclick: () => {
        runner[key] = !runner[key]
        refresh()
      } }, [el('i')])
    ])

  const config = el('aside', { class: 'rn-config' }, [
    el('section', { class: 'rn-card' }, [el('h3', { text: 'What to run' }), setting('Collection or flow', pickTarget), list]),
    el('section', { class: 'rn-card' }, [el('h3', { text: 'Data' }), dataBox]),
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'Run settings' }),
      el('div', { class: 'rn-row' }, [
        setting('Iterations', iterations, data ? `up to ${data.rows.length}, one per row` : 'times to run it all'),
        setting('Delay', delay, 'ms between requests')
      ]),
      setting('Environment', pickEnv),
      toggle('bail', 'Stop at the first failure', 'Ends the run as soon as a request fails.'),
      toggle('keepVars', 'Keep variable changes', 'What scripts and captures set stays in the environment after the run.')
    ])
  ])

  const results = el('section', { class: 'rn-results' })
  const grid = el('div', { class: 'rn' }, [config, results])
  queueMicrotask(paintRunResults)
  return grid
}

/**
 * Test data from a request body's schema — the OpenAPI document's, or one
 * inferred from the body as written. Every row is that body with one thing
 * changed, and says whether the API should accept or refuse it.
 */
function bodySchemaFor(req) {
  const col = chainFor(req)[0]
  const match = col?.spec ? matchOperation(col.spec, req.method, req.url) : null
  if (match) {
    const op = match.op
    const content = derefSpec(col.spec, op.requestBody)?.content
    const media = content ? content['application/json'] ?? Object.entries(content).find(([k]) => /json/.test(k))?.[1] : null
    if (media?.schema) return { schema: media.schema, spec: col.spec, from: `the OpenAPI spec, ${match.method.toUpperCase()} ${match.route}` }
    const legacy = (op.parameters ?? []).map((p) => derefSpec(col.spec, p)).find((p) => p?.in === 'body')
    if (legacy?.schema) return { schema: legacy.schema, spec: col.spec, from: `the Swagger spec, ${match.method.toUpperCase()} ${match.route}` }
  }
  try {
    const body = JSON.parse(String(req.body ?? ''))
    if (body && typeof body === 'object') return { schema: inferSchema(body), spec: null, from: 'the body as written — attach an OpenAPI spec for its real rules' }
  } catch {
    /* not JSON */
  }
  return null
}

function derefSpec(spec, node) {
  let n = node
  for (let i = 0; i < 10 && n && typeof n.$ref === 'string' && n.$ref.startsWith('#/'); i += 1) {
    n = n.$ref.slice(2).split('/').reduce((o, k) => o?.[decodeURIComponent(k.replace(/~1/g, '/').replace(/~0/g, '~'))], spec)
  }
  return n
}

function openGenerateData() {
  const t = currentTarget()
  const candidates = (t?.requests ?? []).filter((x) => !['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(String(x.method).toUpperCase()))
  if (!candidates.length) {
    toast('bad', 'Nothing here sends a body — test data is generated for POST, PUT and PATCH requests.')
    return
  }
  let reqId = candidates.find((x) => bodySchemaFor(x))?.id ?? candidates[0].id
  const body = el('div', { class: 'gd' })
  let result = null
  const paint = () => {
    const req = candidates.find((x) => x.id === reqId)
    const found = bodySchemaFor(req)
    let base
    try {
      base = JSON.parse(String(req.body ?? ''))
    } catch {
      base = undefined
    }
    result = found ? generateCases({ spec: found.spec, schema: found.schema, base }) : null
    const accept = result?.rows.filter((x) => x.expect === 'accept').length ?? 0
    body.replaceChildren(
      el('label', { class: 'rn-field' }, [
        el('span', { class: 'rn-label', text: 'Request' }),
        el('select', { class: 'rn-select', onchange: (e) => {
          reqId = e.target.value
          paint()
        } }, candidates.map((x) => el('option', { value: x.id, text: `${String(x.method).toUpperCase()}  ${x.name || 'Untitled'}`, selected: x.id === reqId })))
      ]),
      found
        ? el('p', { class: 'rn-hint', text: `Rules from ${found.from}. ${result.fields} field${result.fields === 1 ? '' : 's'}, ${result.rows.length} cases: ${accept} the API should accept, ${result.rows.length - accept} it should refuse.` })
        : el('p', { class: 'rn-hint', text: 'This request has no JSON body and its collection’s spec does not describe one, so there is nothing to vary. Write a JSON body, or attach an OpenAPI spec.' }),
      result
        ? el('div', { class: 'rn-it gd-list' }, result.rows.slice(0, 200).map((x) =>
            el('div', { class: `gd-row ${x.expect}` }, [el('span', { class: 'rn-dot' }), el('span', { class: 'gd-case', text: x.case }), el('span', { class: 'gd-expect', text: x.expect === 'accept' ? 'accept' : 'refuse' })])
          ))
        : null,
      el('p', { class: 'cmp-note', text: 'In the run, each row’s body is sent as this request’s body — the request itself is not changed — and the send passes when the API accepts what it should with a 2xx and refuses what it should with a 4xx. A 5xx always fails.' })
    )
  }
  paint()
  sheet({
    title: 'Generate test data',
    blurb: 'Each row is the body with one thing changed — a value at its limit or past it, the wrong type, null, a field left out — and whether the API should accept it, worked out from the schema.',
    body,
    wide: true,
    acts: [{ label: 'Use these rows', go: true, onClick: () => {
      if (!result) return
      const req = candidates.find((x) => x.id === reqId)
      runner.data = { name: `Generated for ${req.name || 'the request'}`, columns: result.columns, rows: result.rows, generated: { reqId } }
      runner.iterations = result.rows.length
      runner.skip.delete(reqId)
      openRunner('runner')
      toast('ok', `${result.rows.length} cases for ${req.name || 'the request'} — one iteration each`)
    } }]
  })
}

async function chooseRunnerData() {
  const chosen = await window.prism.file.open([{ name: 'Data', extensions: ['csv', 'json', 'tsv', 'txt'] }])
  if (!chosen) return
  if (chosen.error) {
    toast('bad', chosen.error)
    return
  }
  useRunnerData(chosen.text, chosen.name)
}

function useRunnerData(text, name) {
  const result = readDataset(text, name)
  if (!result.ok) {
    toast('bad', result.error)
    return
  }
  if (!result.dataset.rows.length) {
    toast('bad', `${name} has no rows to run.`)
    return
  }
  runner.data = result.dataset
  runner.iterations = result.dataset.rows.length
  openRunner()
  toast('ok', `${result.dataset.rows.length} rows from ${name} — one iteration each`)
}

/** Runs it: every iteration, every selected request in order. */
async function runRunner() {
  const t = currentTarget()
  if (!t || runner.running) return
  const list = t.requests.filter((r) => !runner.skip.has(r.id))
  if (!list.length) {
    toast('bad', 'Select at least one request to run.')
    return
  }
  const previousEnv = S.envId
  if (runner.envId && S.environments.some((e) => e.id === runner.envId)) S.envId = runner.envId
  const n = runnerIterations()
  if (!(await productionOk(`${list.length} request${list.length === 1 ? '' : 's'} × ${n} iteration${n === 1 ? '' : 's'}`))) {
    S.envId = previousEnv
    return
  }
  const env = environment()
  const before = env ? { ...env.values } : null
  runner.running = true
  runner.stopping = false
  runner.run = { target: t.label, environment: env?.name ?? 'none', startedAt: new Date().toISOString(), t0: Date.now(), ms: 0, total: n * list.length, done: 0, iterations: [], stopped: false }
  openRunner()

  outer: for (let i = 0; i < n; i += 1) {
    const row = runner.data?.rows[i] ?? null
    const iteration = {
      index: i,
      label: row ? labelFor(row, i) : `Iteration ${i + 1}`,
      row,
      t0: Date.now(),
      ms: 0,
      results: list.map((r) => ({ id: r.id, name: r.name || 'Untitled', method: verbOf(r), url: r.url || '', state: 'wait' }))
    }
    runner.run.iterations.push(iteration)
    // A run's local variables last for its iteration, as Postman's do.
    const locals = {}
    for (let k = 0; k < list.length; k += 1) {
      if (runner.stopping) {
        runner.run.stopped = true
        break outer
      }
      const r = list[k]
      const slot = iteration.results[k]
      slot.state = 'run'
      paintRunResults()
      const gen = runner.data?.generated?.reqId === r.id && row?.body !== undefined
      const out = await sendOnce(gen ? { ...r, bodyKind: 'json', body: row.body } : r, scopeFor(envValues(), row), { iteration: i, iterationCount: n, data: row ?? {}, locals })
      const type = Object.entries(out.headers ?? {}).find(([h]) => h.toLowerCase() === 'content-type')?.[1]
      Object.assign(slot, {
        state: out.skipped ? 'skip' : out.error || out.failed ? 'fail' : 'pass',
        status: out.status,
        ms: out.timing?.total ?? 0,
        bytes: out.bytes ?? 0,
        error: out.skipped ? '' : out.error ?? '',
        contentType: Array.isArray(type) ? type.join(', ') : type ?? '',
        logs: out.logs?.length ?? 0,
        needs: variablesUsed(r),
        gives: (r.captures ?? []).map((c) => c.name).filter(Boolean),
        sample: sampleOf(out.body),
        checks: (out.checks ?? []).map((c) => ({ ok: c.ok, name: describe(c.assertion), detail: c.detail, subject: c.assertion?.subject, group: checkGroup(c.assertion?.subject) }))
      })
      if (gen && !out.skipped) {
        // Judged by whether the API accepts or refuses it, as the schema says it should.
        const v = judge(row.expect, out.status, out.error)
        slot.checks = [{ ok: v.ok, name: `Should be ${row.expect === 'accept' ? 'accepted' : 'refused'} — ${row.case}`, detail: v.detail, subject: 'data', group: 'Data' }]
        slot.state = v.ok ? 'pass' : 'fail'
        slot.error = ''
      }
      runner.run.done += 1
      iteration.ms = Date.now() - iteration.t0
      runner.run.ms = Date.now() - runner.run.t0
      commit('plane')
      paintRunResults()
      if (out.logic?.stop) break
      if (runner.bail && slot.state === 'fail') {
        runner.run.stopped = true
        break outer
      }
      if (runner.delay && k < list.length - 1) await new Promise((res) => setTimeout(res, runner.delay))
    }
  }

  if (!runner.keepVars && env && before) env.values = before
  S.envId = previousEnv
  runner.run.ms = Date.now() - runner.run.t0
  runner.running = false
  runner.stopping = false
  lastReport = runnerReport()
  if (n === 1 && runner.run.iterations[0]) {
    const it = runner.run.iterations[0]
    rememberRun({ kind: t.id.split(':')[0], id: t.id.split(':')[1] ?? t.id, name: t.label }, 'Runner', runner.run.ms, list.map((r, k) => ({ req: r, skipped: it.results[k]?.state === 'wait' || it.results[k]?.state === 'skip' })))
  }
  commit()
  if (pageOpen === 'runner') openRunner()
  const t2 = totals(lastReport)
  toast(t2.failed ? 'bad' : 'ok', `Run ${runner.run.stopped ? 'stopped' : 'finished'} — ${t2.passed} passed, ${t2.failed} failed`)
}

/** The run in the report's shape: one section per iteration. */
function runnerReport() {
  const run = runner.run
  return {
    workspace: S.savedName || 'Workspace',
    environment: run.environment,
    startedAt: run.startedAt,
    runId: `run-${new Date(run.startedAt).getTime().toString(36)}`,
    prism: PRISM_VERSION,
    source: `Runner · ${run.target}${runner.data ? ` · ${runner.data.name}` : ''}`,
    ms: run.ms,
    flows: run.iterations.map((it) => ({
      name: it.row ? `Iteration ${it.index + 1} — ${it.label}` : `Iteration ${it.index + 1}`,
      ms: it.ms,
      results: it.results.map((x) =>
        x.state === 'wait' || x.state === 'run'
          ? { name: x.name, method: x.method, url: x.url, skipped: true, ms: 0, checks: [], failed: 0 }
          : {
              name: x.name,
              method: x.method,
              url: x.url,
              status: x.status,
              ms: x.ms,
              bytes: x.bytes,
              error: x.state === 'skip' ? 'Skipped by its pre-request script' : x.error || undefined,
              skipped: x.state === 'skip',
              failed: x.checks.filter((c) => !c.ok).length,
              checks: x.checks,
              contentType: x.contentType,
              needs: x.needs,
              gives: x.gives,
              sample: x.sample
            }
      )
    }))
  }
}

/** The results side of the runner, redrawn as each request comes back. */
function paintRunResults() {
  const host = document.querySelector('.rn-results')
  if (!host) return
  const run = runner.run
  if (!run) {
    host.replaceChildren(
      el('div', { class: 'rn-empty' }, [
        el('span', { class: 'rn-empty-ico', html: ico(I.play, 22) }),
        el('b', { text: 'Pick what to run, and press Run' }),
        el('p', { text: 'Every selected request is sent in order, once per iteration. With a data file, each row is one iteration and its columns are variables — {{email}} in a body picks up the email column.' }),
        el('ul', {}, [
          el('li', { text: 'Pre-request and test scripts run for every request.' }),
          el('li', { text: 'Each iteration gets the row from pm.iterationData too.' }),
          el('li', { text: 'Save the run as an HTML report, JUnit XML or JSON when it ends.' })
        ])
      ])
    )
    return
  }
  const all = run.iterations.flatMap((it) => it.results)
  const passed = all.filter((x) => x.state === 'pass').length
  const failed = all.filter((x) => x.state === 'fail').length
  const checks = all.flatMap((x) => x.checks ?? [])
  const okChecks = checks.filter((c) => c.ok).length
  const share = run.total ? run.done / run.total : 0

  const head = el('div', { class: 'rn-run-head' }, [
    el('div', { class: 'rn-run-title' }, [
      el('b', { text: runner.running ? `Running ${run.target}` : `${run.target}${run.stopped ? ' — stopped' : ''}` }),
      el('span', { text: `${run.environment} · ${new Date(run.startedAt).toLocaleTimeString()}${runner.data ? ` · ${runner.data.name}` : ''}` })
    ]),
    runner.running
      ? null
      : el('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', html: `${ico(I.up, 13, 2)}<span>Save report</span>`, onclick: (e) => openMenu(e.currentTarget, reportMenu()) }),
    runner.running ? null : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Run again</span>`, onclick: () => runRunner() })
  ])

  const tiles = el('div', { class: 'rn-tiles' }, [
    ['Iterations', `${run.iterations.length}/${runnerIterationsOf(run)}`, ''],
    ['Requests', `${run.done}/${run.total}`, ''],
    ['Passed', String(passed), 'ok'],
    ['Failed', String(failed), failed ? 'bad' : ''],
    ['Checks', `${okChecks}/${checks.length}`, ''],
    ['Duration', secs(run.ms), '']
  ].map(([label, value, tone]) => el('div', { class: `rn-tile ${tone}` }, [el('b', { text: value }), el('span', { text: label })])))

  // Passed and failed in proportion, the rest still to come.
  void share
  const bar = el('div', { class: 'rn-bar' }, [
    el('i', { style: `width:${((passed / Math.max(1, run.total)) * 100).toFixed(1)}%` }),
    el('i', { class: 'bad', style: `width:${((failed / Math.max(1, run.total)) * 100).toFixed(1)}%` })
  ])

  const filter = el('div', { class: 'seg rn-filter' }, [
    ['all', 'All'],
    ['fail', 'Failed']
  ].map(([id, label]) => el('button', { class: `segbtn${runner.filter === id ? ' on' : ''}`, type: 'button', text: label, onclick: () => {
    runner.filter = id
    paintRunResults()
  } })))

  const iterations = run.iterations
    .filter((it) => runner.filter !== 'fail' || it.results.some((x) => x.state === 'fail'))
    .map((it) => {
      const bad = it.results.filter((x) => x.state === 'fail').length
      const going = it.results.some((x) => x.state === 'run' || x.state === 'wait')
      const rowText = it.row ? Object.entries(it.row).slice(0, 4).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join('  ') : ''
      const details = el('details', { class: `rn-it${bad ? ' bad' : going ? ' run' : ' ok'}` })
      if (bad || going || run.iterations.length <= 3) details.open = true
      details.append(
        el('summary', {}, [
          el('span', { class: 'rn-it-num', text: `#${it.index + 1}` }),
          el('span', { class: 'rn-it-label' }, [el('b', { text: it.label }), rowText ? el('code', { text: rowText }) : null]),
          el('span', { class: 'rn-it-state', text: going ? 'running' : bad ? `${bad} failed` : 'passed' }),
          el('span', { class: 'rn-it-ms', text: secs(it.ms) })
        ]),
        ...it.results
          .filter((x) => runner.filter !== 'fail' || x.state === 'fail')
          .map((x) => {
            const failedChecks = (x.checks ?? []).filter((c) => !c.ok)
            return el('div', { class: `rn-res ${x.state}` }, [
              el('span', { class: 'rn-dot' }),
              el('span', { class: `verb ${x.method.toLowerCase()}`, text: x.method }),
              el('div', { class: 'rn-res-words' }, [
                el('b', { text: x.name }),
                x.error
                  ? el('span', { class: 'why', text: x.error })
                  : failedChecks.length
                    ? el('span', { class: 'why', text: failedChecks.map((c) => `${c.name} — ${c.detail}`).join(' · ') })
                    : x.state === 'skip'
                      ? el('span', { text: 'Skipped by its pre-request script' })
                      : null
              ]),
              el('span', { class: 'rn-code', text: x.status ? String(x.status) : x.state === 'run' ? '…' : '' }),
              el('span', { class: 'rn-ms', text: x.ms ? `${x.ms} ms` : '' }),
              el('span', { class: 'rn-score', text: x.checks?.length ? `${x.checks.length - failedChecks.length}/${x.checks.length}` : '' })
            ])
          })
      )
      return details
    })

  host.replaceChildren(head, tiles, bar, el('div', { class: 'rn-list-head' }, [el('h3', { text: 'Iterations' }), filter]), ...iterations)
}

const runnerIterationsOf = (run) => Math.max(run.iterations.length, run.total / Math.max(1, run.iterations[0]?.results.length ?? 1))

/* ========================================================= spec coverage */

/**
 * A collection against its OpenAPI document as a whole: which operations the
 * requests exercise and which the spec declares that nothing calls, and every
 * response's findings. Read from the last responses straight away; Check sends
 * everything again first.
 */
const specRun = { running: false, stopping: false, done: 0, total: 0 }

function specTarget() {
  const t = currentTarget()
  const id = t?.id ?? ''
  const col = id.startsWith('col:') ? S.collections.find((c) => `col:${c.id}` === id) : S.collections.find((c) => c.flows.some((f) => `flow:${f.id}` === id))
  return { t, col }
}

function specHead() {
  const { t, col } = specTarget()
  return pageHero(
    'Spec coverage',
    'Every request checked against the collection’s OpenAPI document — the status, content type, body schema and required headers — and every documented operation nothing calls yet.',
    [
      specRun.running
        ? el('button', { class: 'btn bad', type: 'button', html: `${ico(I.x, 12, 2.4)}<span>${specRun.stopping ? 'Stopping…' : 'Stop'}</span>`, onclick: () => {
            specRun.stopping = true
          } })
        : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Send and check</span>`, disabled: !t || !col?.spec, onclick: () => runSpecCheck() })
    ]
  )
}

function specPanel() {
  const { t, col } = specTarget()
  const pickTarget = el('select', { class: 'rn-select', onchange: (e) => {
    runner.target = e.target.value
    runner.skip.clear()
    openRunner('contract')
  } }, runTargets().map((x) => el('option', { value: x.id, text: x.label, selected: x.id === t?.id })))
  if (!t) return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to check yet' }), el('p', { text: 'Import an OpenAPI document, or attach one to a collection.' })])
  const head = el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: 'Collection or flow' }), pickTarget])
  if (!col?.spec) {
    return el('div', { class: 'ct-page' }, [
      el('div', { class: 'ct-pick' }, [head]),
      el('div', { class: 'studio-empty' }, [
        el('b', { text: `${col?.name ?? 'This collection'} has no OpenAPI spec` }),
        el('p', { text: 'Attach the API’s OpenAPI or Swagger document — JSON or YAML — and Prism checks every response against it, here and on every send.' }),
        col ? el('button', { class: 'btn go', type: 'button', text: 'Attach a spec…', onclick: async () => {
          await attachSpec(col)
          openRunner('contract')
        } }) : null
      ])
    ])
  }
  const spec = col.spec
  const requests = t.requests.filter((x) => !runner.skip.has(x.id))
  const rows = requests.map((req) => {
    const res = S.results.get(req.id)
    const contract = res && !res.error ? res.contract ?? checkResponse(spec, res.request?.method ?? req.method, req.url, res) : null
    const match = contract?.matched ? contract : matchOperation(spec, req.method, req.url)
    return { req, res, contract, route: match?.route, method: match?.method }
  })
  const hits = rows.filter((x) => x.contract?.matched).map((x) => ({ method: x.contract.method, route: x.contract.route, status: x.res.status }))
  const cov = specCoverage(spec, hits)
  const errors = rows.reduce((n, x) => n + (x.contract?.findings.filter((f) => f.level === 'error').length ?? 0), 0)
  const warns = rows.reduce((n, x) => n + (x.contract?.findings.filter((f) => f.level === 'warn').length ?? 0), 0)
  const checked = rows.filter((x) => x.contract).length

  const tiles = el('div', { class: 'rn-tiles' }, [
    ['Operations', `${cov.called}/${cov.total}`, ''],
    ['Covered', `${Math.round(cov.share * 100)}%`, cov.share >= 0.8 ? 'ok' : ''],
    ['Checked', `${checked}/${rows.length}`, ''],
    ['Breaks', String(errors), errors ? 'bad' : 'ok'],
    ['Not in spec', String(warns), warns ? 'warn' : ''],
    ['Unmatched', String(rows.filter((x) => !x.route).length), rows.some((x) => !x.route) ? 'warn' : '']
  ].map(([label, value, tone]) => el('div', { class: `rn-tile ${tone}` }, [el('b', { text: value }), el('span', { text: label })])))

  const reqRows = rows.map((x) => {
    const findings = x.contract?.findings ?? []
    const bad = findings.filter((f) => f.level === 'error')
    const tone = !x.route ? 'warn' : !x.contract ? 'idle' : bad.length ? 'bad' : findings.length ? 'warn' : 'ok'
    const d = el('details', { class: `ct-req ${tone}` })
    if (bad.length) d.open = true
    d.append(
      el('summary', {}, [
        el('span', { class: `verb ${String(x.req.method).toLowerCase()}`, text: String(x.req.method).toUpperCase() }),
        el('span', { class: 'ct-req-name', text: x.req.name || 'Untitled' }),
        el('code', { class: 'ct-req-route', text: x.route ?? 'not in the spec' }),
        el('span', { class: 'ct-req-state', text: !x.route ? 'unmatched' : !x.contract ? 'not sent' : bad.length ? `${bad.length} break${bad.length === 1 ? '' : 's'}` : findings.length ? `${findings.length} not in spec` : `${x.res.status} as documented` })
      ]),
      findings.length ? el('ul', { class: 'ct-finds' }, findings.map((f) => el('li', { class: f.level === 'error' ? 'bad' : 'warn', text: f.message }))) : null
    )
    return d
  })

  const opRows = cov.operations.map((o) =>
    el('div', { class: `ct-cov${o.called ? ' on' : ''}` }, [
      el('span', { class: `verb ${o.method}`, text: o.method.toUpperCase() }),
      el('code', { text: o.route }),
      el('span', { class: 'ct-cov-sum', text: o.summary }),
      el('span', { class: 'ct-cov-codes' }, o.statuses.map((st) => el('span', { class: `ct-code${st.hit ? ' on' : ''}`, text: st.code })))
    ])
  )

  return el('div', { class: 'ct-page' }, [
    el('div', { class: 'ct-pick' }, [
      head,
      el('div', { class: 'ct-spec' }, [
        el('b', { text: `${spec.title}${spec.version ? ` ${spec.version}` : ''}` }),
        el('span', { text: `${spec.file || 'attached'} · ${cov.total} operation${cov.total === 1 ? '' : 's'}` })
      ]),
      el('button', { class: 'btn plain sm', type: 'button', text: 'Replace…', onclick: async () => {
        await attachSpec(col)
        openRunner('contract')
      } })
    ]),
    specRun.running
      ? el('div', { class: 'rn-bar' }, [el('i', { style: `width:${((specRun.done / Math.max(1, specRun.total)) * 100).toFixed(1)}%` })])
      : null,
    tiles,
    el('div', { class: 'ct-grid' }, [
      el('section', { class: 'rn-card' }, [el('h3', { text: 'Requests' }), ...(reqRows.length ? reqRows : [el('p', { class: 'cmp-note', text: 'No requests selected.' })]), checked < rows.length ? el('p', { class: 'cmp-note', text: 'Requests not sent yet are checked once they have a response — Send and check sends them all.' }) : null]),
      el('section', { class: 'rn-card' }, [el('h3', { text: 'Operations in the spec' }), el('p', { class: 'cmp-note', text: 'Lit when a request calls it; each status lit once a response with it was seen.' }), ...opRows])
    ])
  ])
}

async function runSpecCheck() {
  const { t, col } = specTarget()
  if (!t || !col?.spec || specRun.running) return
  const list = t.requests.filter((x) => !runner.skip.has(x.id))
  if (!(await productionOk(`${list.length} request${list.length === 1 ? '' : 's'}`))) return
  Object.assign(specRun, { running: true, stopping: false, done: 0, total: list.length })
  openRunner('contract')
  const locals = {}
  for (const req of list) {
    if (specRun.stopping) break
    await sendOnce(req, scopeFor(envValues(), null), { locals })
    specRun.done += 1
    if (pageOpen === 'runner' && runnerAt === 'contract') openRunner('contract')
  }
  specRun.running = false
  commit()
  if (pageOpen === 'runner') openRunner('contract')
  const breaks = list.reduce((n, x) => n + (S.results.get(x.id)?.contract?.findings.filter((f) => f.level === 'error').length ?? 0), 0)
  toast(breaks ? 'bad' : 'ok', breaks ? `${breaks} way${breaks === 1 ? '' : 's'} the responses break ${col.spec.title}` : `Every response keeps ${col.spec.title}`)
}

/* ============================================================= schedules */

/**
 * A flow run on a timer — every few minutes, or once a day — against an
 * environment of its own, while Prism is open (minimised counts). Each run
 * goes into the history and the run timeline, and a failure says so on the
 * desktop. Nothing runs once Prism is closed: there is no server.
 */
const SCHEDULE_EVERY = [[1, 'Every minute'], [5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour'], [180, 'Every 3 hours'], [360, 'Every 6 hours'], [720, 'Every 12 hours'], [1440, 'Every day']]
const scheduleBusy = new Set()
const scheduleDraft = { target: '', every: 15, envId: '', notify: 'fail' }

function scheduleHead() {
  return pageHero('Schedules', 'Run a flow on a timer against the environment you choose — every few minutes, or once a day — while Prism is open, even minimised. Every run lands in the history and the run timeline; a failure tells you on the desktop.', [])
}

const everyText = (n) => SCHEDULE_EVERY.find(([m]) => m === n)?.[1] ?? `Every ${n} minutes`
const inText = (ms) => (ms <= 0 ? 'now' : ms < 60000 ? `in ${Math.ceil(ms / 1000)} s` : ms < 3600000 ? `in ${Math.round(ms / 60000)} min` : `in ${(ms / 3600000).toFixed(1)} h`)

function schedulePanel() {
  const targets = runTargets()
  if (!targets.length) return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to schedule yet' }), el('p', { text: 'Add a request to a flow, and it can be run on a timer from here.' })])
  if (!targets.some((x) => x.id === scheduleDraft.target)) scheduleDraft.target = currentTarget()?.id ?? targets[0].id
  if (!S.environments.some((e) => e.id === scheduleDraft.envId)) scheduleDraft.envId = S.envId || S.environments[0]?.id || ''
  const refresh = () => openRunner('schedule')
  const setting = (label, control, hint) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control, hint ? el('span', { class: 'rn-hint', text: hint }) : null])
  const select = (key, options, onchange) =>
    el('select', { class: 'rn-select', onchange: (e) => {
      scheduleDraft[key] = key === 'every' ? Number(e.target.value) : e.target.value
      onchange?.()
    } }, options.map(([v, t]) => el('option', { value: String(v), text: t, selected: String(v) === String(scheduleDraft[key]) })))
  const envName = S.environments.find((e) => e.id === scheduleDraft.envId)?.name ?? ''
  const form = el('aside', { class: 'rn-config' }, [
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'New schedule' }),
      setting('Collection or flow', select('target', targets.map((x) => [x.id, x.label]))),
      setting('How often', select('every', SCHEDULE_EVERY)),
      setting('Environment', select('envId', S.environments.length ? S.environments.map((e) => [e.id, e.name]) : [['', 'No environment']], refresh), /prod|live|release/i.test(envName) ? 'Named like production: these requests really will be sent there, on the timer, without asking each time.' : 'It runs here whichever environment you are working in.'),
      setting('Tell me', select('notify', [['fail', 'When a run fails'], ['always', 'After every run'], ['never', 'Never — just keep the history']])),
      el('button', { class: 'btn go', type: 'button', html: `${ico(I.plus, 12, 2.2)}<span>Add schedule</span>`, onclick: () => {
        S.schedules.push({ id: uid('sch'), target: scheduleDraft.target, every: scheduleDraft.every, envId: scheduleDraft.envId, on: true, notify: scheduleDraft.notify, last: null, next: Date.now() + 3000 })
        commit()
        refresh()
        toast('ok', `${targets.find((x) => x.id === scheduleDraft.target)?.label ?? 'It'} runs ${everyText(scheduleDraft.every).toLowerCase()} — the first run starts now`)
      } })
    ])
  ])

  const rows = S.schedules.map((x) => {
    const t = targets.find((y) => y.id === x.target)
    const env = S.environments.find((e) => e.id === x.envId)
    const busy = scheduleBusy.has(x.id)
    const [kind, id] = x.target.split(':')
    // Its own runs: the same flow may be scheduled in more than one environment.
    const runs = S.runs.filter((run) => run.source === 'Schedule' && run.target.kind === kind && run.target.id === id && run.env === (env?.name ?? '')).slice(0, 24).reverse()
    const tone = !x.last ? 'idle' : x.last.failed || x.last.error ? 'bad' : 'ok'
    return el('div', { class: `sc-row ${tone}${x.on ? '' : ' off'}` }, [
      el('span', { class: 'rn-dot' }),
      el('div', { class: 'rn-res-words' }, [
        el('b', { text: t?.label ?? 'A flow that no longer exists' }),
        el('span', { text: `${everyText(x.every)} · ${env?.name ?? 'no environment'} · ${x.notify === 'fail' ? 'tells you on failure' : x.notify === 'always' ? 'tells you every run' : 'silent'}` })
      ]),
      el('span', { class: 'tl-dots sc-dots', title: 'The last runs, oldest first' }, runs.map((run) => {
        const tot = runTotals(run)
        return el('i', { class: tot.failed ? 'bad' : 'ok', title: `${new Date(run.at).toLocaleString()} — ${tot.failed ? `${tot.failed} failed` : 'passed'}` })
      })),
      el('div', { class: 'sc-when' }, [
        el('b', { class: tone === 'bad' ? 'ld-bad' : '', text: busy ? 'running…' : !x.last ? 'not run yet' : x.last.error ? 'could not run' : x.last.failed ? `${x.last.failed} failed` : 'passed' }),
        el('span', { text: busy ? '' : x.on ? `next ${inText((x.next ?? Date.now()) - Date.now())}` : 'paused' })
      ]),
      el('button', { class: 'btn plain sm', type: 'button', text: 'Run now', disabled: busy || !t, onclick: () => runSchedule(x) }),
      el('button', { class: `switch${x.on ? ' on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(x.on), 'aria-label': x.on ? 'Pause' : 'Resume', title: x.on ? 'Pause' : 'Resume', onclick: () => {
        x.on = !x.on
        x.next = Date.now() + x.every * 60000
        commit()
        refresh()
      } }, [el('i')]),
      el('button', { class: 'mini-btn', type: 'button', title: 'Delete the schedule', 'aria-label': 'Delete the schedule', html: ico(I.bin, 13, 2), onclick: () => {
        S.schedules = S.schedules.filter((y) => y.id !== x.id)
        commit()
        refresh()
      } })
    ])
  })
  const list = el('section', { class: 'rn-results' }, [
    el('div', { class: 'rn-list-head' }, [el('h3', { text: `Schedules · ${S.schedules.length}` })]),
    S.schedules.length
      ? el('div', { class: 'rn-it sc-list' }, rows)
      : el('div', { class: 'rn-empty' }, [
          el('span', { class: 'rn-empty-ico', html: ico('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/>', 20, 1.9) }),
          el('b', { text: 'Nothing scheduled' }),
          el('p', { text: 'Add a schedule and the flow runs on its own — a smoke test of production every fifteen minutes, say — with every run kept on the timeline.' })
        ]),
    el('p', { class: 'cmp-note', text: 'Schedules run while Prism is open, minimised included. Runs missed while it was closed are not made up when it opens.' })
  ])
  return el('div', { class: 'rn' }, [form, list])
}

/** One scheduled run: every request of its flow in order, in its own environment. */
async function runSchedule(x) {
  if (scheduleBusy.has(x.id)) return
  const t = runTargets().find((y) => y.id === x.target)
  const env = S.environments.find((e) => e.id === x.envId) ?? null
  x.next = Date.now() + x.every * 60000
  if (!t) {
    x.last = { at: Date.now(), passed: 0, failed: 0, ms: 0, error: 'Its flow no longer exists' }
    return
  }
  scheduleBusy.add(x.id)
  if (pageOpen === 'runner' && runnerAt === 'schedule') openRunner('schedule')
  const t0 = Date.now()
  const locals = {}
  let failed = 0
  for (const req of t.requests) {
    const out = await sendOnce(req, scopeFor(env?.values ?? {}, null), { locals, envId: env?.id })
    if (!out.skipped && (out.error || out.failed)) failed += 1
    if (out.logic?.stop) break
  }
  const ms = Date.now() - t0
  const [kind, id] = x.target.split(':')
  rememberRun({ kind, id, name: t.label }, 'Schedule', ms, t.requests.map((req) => ({ req, skipped: false })), env)
  x.last = { at: Date.now(), passed: t.requests.length - failed, failed, ms, error: '' }
  scheduleBusy.delete(x.id)
  commit('plane')
  if (pageOpen === 'runner' && runnerAt === 'schedule') openRunner('schedule')
  if (x.notify === 'always' || (x.notify === 'fail' && failed)) {
    const title = failed ? `${t.label} — ${failed} of ${t.requests.length} failed` : `${t.label} — all ${t.requests.length} passed`
    try {
      new Notification(`Prism · ${title}`, { body: `Scheduled run in ${env?.name ?? 'no environment'}, ${secs(ms)}`, silent: !failed })
    } catch {
      /* no notifications here: the toast says it */
    }
    toast(failed ? 'bad' : 'ok', `Scheduled: ${title}`)
  }
}

/** Looks for a schedule that is due, every few seconds. */
function scheduleTick() {
  const now = Date.now()
  for (const x of S.schedules) {
    if (!x.on) continue
    if (!x.next) x.next = now + x.every * 60000
    if (now >= x.next) void runSchedule(x)
  }
  // The countdowns move while the page is open.
  if (pageOpen === 'runner' && runnerAt === 'schedule' && !document.querySelector('.rn-select:focus')) {
    openRunner('schedule')
  }
}

/* ============================================================= load test */

/**
 * A flow run by several users at once, for a while, to see where it gives
 * way: throughput, latency percentiles and errors, per second and per
 * request. Capped (lib/load.js LIMITS) — this is for finding the endpoint
 * that falls over at twenty users on your own API, not for flooding one.
 */
const load = { users: 5, seconds: 30, rampSeconds: 5, thinkMs: 0, p95: '', errorPct: '', running: false, stopping: false, samples: [], t0: 0, elapsed: 0, active: 0, plan: null, summary: null, target: '', capped: false }
const LOAD_SAMPLE_CAP = 100000
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

function loadBudget() {
  return { p95: Number(load.p95) || 0, errorRate: load.errorPct === '' ? undefined : Number(load.errorPct) / 100 }
}

function loadHead() {
  const t = currentTarget()
  return pageHero(
    'Load test',
    'Several users go through the same requests at once, for a while — throughput, latency percentiles and errors, per second and per request. For your own API, or one you have permission to test.',
    [
      load.running
        ? el('button', { class: 'btn bad', type: 'button', html: `${ico(I.x, 12, 2.4)}<span>${load.stopping ? 'Stopping…' : 'Stop'}</span>`, disabled: load.stopping, onclick: () => {
            load.stopping = true
          } })
        : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Start</span>`, disabled: !t, onclick: () => runLoad() })
    ]
  )
}

function loadPanel() {
  const t = currentTarget()
  if (!t) return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to load yet' }), el('p', { text: 'Add a request to a flow, and it can be load tested from here.' })])
  const setting = (label, control, hint) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control, hint ? el('span', { class: 'rn-hint', text: hint }) : null])
  const num = (key, min, max, step = 1) =>
    el('input', { class: 'rn-num', type: 'number', min: String(min), max: String(max), step: String(step), value: String(load[key]), disabled: load.running, onchange: (e) => {
      load[key] = e.target.value === '' && (key === 'p95' || key === 'errorPct') ? '' : Math.max(min, Math.min(max, Number(e.target.value) || 0))
      openRunner('load')
    } })
  const pickTarget = el('select', { class: 'rn-select', disabled: load.running, onchange: (e) => {
    runner.target = e.target.value
    runner.skip.clear()
    openRunner('load')
  } }, runTargets().map((x) => el('option', { value: x.id, text: x.label, selected: x.id === t.id })))
  const n = t.requests.filter((x) => !runner.skip.has(x.id)).length
  const config = el('aside', { class: 'rn-config' }, [
    el('section', { class: 'rn-card' }, [el('h3', { text: 'What to run' }), setting('Collection or flow', pickTarget, `${n} request${n === 1 ? '' : 's'} per user, in order — choose which on the Collection runner`)]),
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'Load' }),
      el('div', { class: 'rn-row' }, [setting('Users', num('users', 1, LOAD_LIMITS.users), `at once, up to ${LOAD_LIMITS.users}`), setting('Duration', num('seconds', 5, LOAD_LIMITS.seconds, 5), `seconds, up to ${LOAD_LIMITS.seconds}`)]),
      el('div', { class: 'rn-row' }, [setting('Ramp-up', num('rampSeconds', 0, LOAD_LIMITS.rampSeconds), 'seconds until all have started'), setting('Think time', num('thinkMs', 0, LOAD_LIMITS.thinkMs, 50), 'ms between a user’s requests')])
    ]),
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'Budget' }),
      el('div', { class: 'rn-row' }, [setting('p95 under', num('p95', 0, 600000, 50), 'ms — leave empty for none'), setting('Errors under', num('errorPct', 0, 100, 0.5), '% — leave empty for none')]),
      el('p', { class: 'rn-hint', text: 'A request that fails to send, answers 4xx or 5xx, or fails a check counts as an error.' })
    ])
  ])
  const results = el('section', { class: 'rn-results ld-results' })
  queueMicrotask(paintLoad)
  return el('div', { class: 'rn' }, [config, results])
}

async function runLoad() {
  const t = currentTarget()
  if (!t || load.running) return
  const list = t.requests.filter((x) => !runner.skip.has(x.id))
  if (!list.length) {
    toast('bad', 'Select at least one request to run.')
    return
  }
  const plan = loadPlan(load)
  if (!(await productionOk(`${plan.users} users for ${plan.seconds} seconds`))) return
  Object.assign(load, { running: true, stopping: false, samples: [], t0: Date.now(), elapsed: 0, active: 0, plan, summary: null, target: t.label, capped: false })
  openRunner('load')
  const deadline = load.t0 + plan.seconds * 1000
  const user = async (i) => {
    await sleep(startAt(i, plan.users, plan.rampSeconds))
    if (load.stopping || Date.now() >= deadline) return
    load.active += 1
    const locals = {}
    while (Date.now() < deadline && !load.stopping) {
      for (const req of list) {
        if (Date.now() >= deadline || load.stopping) break
        const at = Date.now() - load.t0
        const out = await sendOnce(req, scopeFor(envValues(), null), { locals, quiet: true, raw: true })
        if (!out.skipped) {
          if (load.samples.length < LOAD_SAMPLE_CAP) load.samples.push({ at, id: req.id, name: req.name || 'Untitled', method: String(req.method || 'GET').toUpperCase(), ms: out.timing?.total ?? 0, status: out.status ?? 0, error: out.error ?? '', failed: out.failed ?? 0 })
          else load.capped = true
        }
        if (plan.thinkMs) await sleep(plan.thinkMs)
      }
    }
    load.active -= 1
  }
  const tick = setInterval(() => {
    load.elapsed = Date.now() - load.t0
    paintLoad()
  }, 500)
  await Promise.all(Array.from({ length: plan.users }, (_, i) => user(i)))
  clearInterval(tick)
  load.elapsed = Date.now() - load.t0
  load.summary = loadSummary(load.samples, load.elapsed, loadBudget())
  const stopped = load.stopping
  load.running = false
  load.stopping = false
  if (pageOpen === 'runner') openRunner('load')
  const sm = load.summary
  toast(sm.passed && !sm.errors ? 'ok' : 'bad', `${stopped ? 'Stopped' : 'Done'} — ${sm.count} requests, ${sm.rps}/s, p95 ${sm.p95} ms, ${(sm.errorRate * 100).toFixed(1)}% errors`)
}

/** Requests per second as bars, errors in red on top, and the p95 as a line. */
function loadChart(sm) {
  const W = Math.max(1, sm.buckets.length)
  const top = Math.max(1, ...sm.buckets.map((b) => b.count))
  const slow = Math.max(1, ...sm.buckets.map((b) => b.p95))
  const bw = 100 / W
  const bars = sm.buckets.map((b, i) => {
    const h = (b.count / top) * 92
    const e = (b.errors / top) * 92
    return `<rect class="ld-bar" x="${(i * bw + bw * 0.12).toFixed(2)}" y="${(100 - h).toFixed(2)}" width="${(bw * 0.76).toFixed(2)}" height="${h.toFixed(2)}"/>${e ? `<rect class="ld-err" x="${(i * bw + bw * 0.12).toFixed(2)}" y="${(100 - e).toFixed(2)}" width="${(bw * 0.76).toFixed(2)}" height="${e.toFixed(2)}"/>` : ''}`
  })
  const pts = sm.buckets.filter((b) => b.count).map((b) => `${(b.second * bw + bw / 2).toFixed(2)},${(100 - (b.p95 / slow) * 92).toFixed(2)}`)
  return el('figure', { class: 'ld-chart' }, [
    el('div', { class: 'ld-chart-key' }, [
      el('span', { class: 'ld-key-bar', text: `Requests per second (peak ${top})` }),
      el('span', { class: 'ld-key-err', text: 'Errors' }),
      el('span', { class: 'ld-key-line', text: `p95 (peak ${slow} ms)` })
    ]),
    el('div', { class: 'ld-svg', html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Requests per second and p95 over the run">${bars.join('')}${pts.length > 1 ? `<polyline class="ld-line" points="${pts.join(' ')}"/>` : ''}</svg>` }),
    el('div', { class: 'ld-axis' }, [el('span', { text: '0 s' }), el('span', { text: `${sm.seconds} s` })])
  ])
}

function paintLoad() {
  const host = document.querySelector('.ld-results')
  if (!host) return
  if (!load.plan) {
    host.replaceChildren(
      el('div', { class: 'rn-empty' }, [
        el('span', { class: 'rn-empty-ico', html: ico('<path d="M3 20h18"/><path d="M6 16v-4"/><path d="M10 16V8"/><path d="M14 16v-6"/><path d="M18 16V5"/>', 20, 1.9) }),
        el('b', { text: 'Where does it give way?' }),
        el('p', { text: 'Choose how many users and for how long, and press Start. Each user goes through the selected requests in order, again and again, until the time is up.' }),
        el('ul', {}, [
          el('li', { text: 'Ramp-up starts users gradually, the way real traffic arrives.' }),
          el('li', { text: 'Scripts, captures and checks run for every request, as they do in a run.' }),
          el('li', { text: 'Set a budget and the run says plainly whether it stayed within it.' })
        ])
      ])
    )
    return
  }
  const sm = load.running ? loadSummary(load.samples, Math.max(1, load.elapsed), loadBudget()) : load.summary
  const share = load.running ? Math.min(1, load.elapsed / (load.plan.seconds * 1000)) : 1
  const head = el('div', { class: 'rn-run-head' }, [
    el('div', { class: 'rn-run-title' }, [
      el('b', { text: load.running ? `Running ${load.target}` : load.target }),
      el('span', { text: `${load.plan.users} users · ${load.plan.seconds} s${load.plan.rampSeconds ? ` · ramp ${load.plan.rampSeconds} s` : ''}${load.plan.thinkMs ? ` · think ${load.plan.thinkMs} ms` : ''} · ${environment()?.name ?? 'no environment'}` })
    ]),
    load.running ? null : el('button', { class: 'btn', type: 'button', html: `${ico(I.copy, 13, 2)}<span>Copy as Markdown</span>`, onclick: () => {
      navigator.clipboard.writeText(loadMarkdown({ target: load.target, plan: load.plan, summary: sm }))
      toast('ok', 'Load result copied as Markdown')
    } }),
    load.running ? null : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Run again</span>`, onclick: () => runLoad() })
  ])
  const tiles = el('div', { class: 'rn-tiles' }, [
    [load.running ? 'Users now' : 'Users', String(load.running ? load.active : load.plan.users), ''],
    ['Requests', String(sm.count), ''],
    ['Per second', String(sm.rps), ''],
    ['p50', `${sm.p50} ms`, ''],
    ['p95', `${sm.p95} ms`, Number(load.p95) > 0 ? (sm.p95 > Number(load.p95) ? 'bad' : 'ok') : ''],
    ['Errors', `${(sm.errorRate * 100).toFixed(1)}%`, sm.errors ? 'bad' : 'ok']
  ].map(([label, value, tone]) => el('div', { class: `rn-tile ${tone}` }, [el('b', { text: value }), el('span', { text: label })])))
  const bar = el('div', { class: 'rn-bar' }, [el('i', { style: `width:${(share * 100).toFixed(1)}%` })])
  const verdict = !load.running && (Number(load.p95) > 0 || load.errorPct !== '')
    ? el('div', { class: `ld-verdict ${sm.passed ? 'ok' : 'bad'}` }, [
        el('span', { class: 'rn-dot' }),
        el('b', { text: sm.passed ? 'Within budget' : 'Over budget' }),
        el('span', { text: sm.passed ? `p95 ${sm.p95} ms and ${(sm.errorRate * 100).toFixed(1)}% errors are inside what you set.` : sm.breaches.join(' · ') })
      ])
    : null
  const statuses = el('div', { class: 'ld-statuses' }, Object.entries(sm.statuses).sort().map(([code, count]) => el('span', { class: `ld-status${code === 'error' || Number(code) >= 400 ? ' bad' : ''}`, text: `${code} × ${count}` })))
  const rows = sm.requests.map((x) =>
    el('div', { class: `ld-row${x.errors ? ' bad' : ''}` }, [
      el('span', { class: 'rn-dot' }),
      el('span', { class: `verb ${x.method.toLowerCase()}`, text: x.method }),
      el('b', { class: 'ld-name', text: x.name }),
      el('span', { text: String(x.count) }),
      el('span', { class: x.errors ? 'ld-bad' : '', text: x.errors ? `${x.errors} (${(x.errorRate * 100).toFixed(1)}%)` : '0' }),
      el('span', { text: `${x.p50} ms` }),
      el('span', { text: `${x.p95} ms` }),
      el('span', { text: `${x.p99} ms` }),
      el('span', { text: `${x.max} ms` })
    ])
  )
  const table = el('div', { class: 'rn-it ld-table' }, [
    el('div', { class: 'ld-row ld-cols' }, ['', 'Request', 'Count', 'Errors', 'p50', 'p95', 'p99', 'Max'].map((h) => el('span', { text: h }))),
    ...(rows.length ? rows : [el('p', { class: 'cmp-note cmp-none', text: 'Nothing has come back yet.' })])
  ])
  host.replaceChildren(
    ...[
      head,
      tiles,
      load.running ? bar : null,
      verdict,
      sm.count ? loadChart(sm) : null,
      sm.count ? statuses : null,
      el('div', { class: 'rn-list-head' }, [el('h3', { text: 'Requests, slowest first' })]),
      table,
      load.capped ? el('p', { class: 'cmp-note', text: `Only the first ${LOAD_SAMPLE_CAP.toLocaleString()} requests were kept for the figures.` }) : null
    ].filter(Boolean)
  )
}

/* =========================================================== mock server */

/**
 * Prism answering in the API's place, at http://127.0.0.1:<port>, from what
 * it holds: each request's frozen baseline or last response, and the
 * collection's OpenAPI document for anything never sent. lib/mock.js decides
 * the answers; main.cjs owns the socket. Settings are remembered on this
 * machine; the server itself stops when Prism does.
 */
const mockState = { running: false, starting: false, port: 4010, latency: 0, cors: true, prefer: 'baseline', scope: '', hits: [], error: '' }
try {
  const saved = JSON.parse(window.localStorage.getItem('prism.mock') ?? '{}')
  Object.assign(mockState, { port: Number(saved.port) || 4010, latency: Number(saved.latency) || 0, cors: saved.cors !== false, prefer: saved.prefer === 'last' ? 'last' : 'baseline', scope: String(saved.scope ?? '') })
} catch {
  /* the defaults */
}
const keepMockSettings = () => {
  try {
    window.localStorage.setItem('prism.mock', JSON.stringify({ port: mockState.port, latency: mockState.latency, cors: mockState.cors, prefer: mockState.prefer, scope: mockState.scope }))
  } catch {
    /* not remembered, only */
  }
}
const mockUrl = () => `http://127.0.0.1:${mockState.port}`

/** The collections being mocked: one, or all of them. */
function mockCollections() {
  if (mockState.scope && mockState.scope !== 'all' && !S.collections.some((c) => c.id === mockState.scope)) mockState.scope = ''
  if (!mockState.scope) mockState.scope = S.collections[0]?.id ?? 'all'
  return mockState.scope === 'all' ? S.collections : S.collections.filter((c) => c.id === mockState.scope)
}

/** Every route, from each collection's requests and spec. */
function mockRoutes() {
  const recorded = (x) => (x && !x.error ? { status: x.status, headers: x.headers ?? {}, body: x.json !== undefined && !x.body ? JSON.stringify(x.json, null, 2) : x.body ?? '' } : null)
  return mockCollections().flatMap((col) =>
    buildRoutes({
      requests: col.flows.flatMap((f) => f.requests).map((req) => ({
        id: req.id,
        name: req.name,
        method: req.method,
        url: req.url,
        baseline: recorded(S.baselines.get(req.id)),
        last: recorded(S.results.get(req.id))
      })),
      spec: col.spec ?? null,
      prefer: mockState.prefer
    })
  )
}

let mockTimer = 0
function queueMockUpdate() {
  clearTimeout(mockTimer)
  mockTimer = setTimeout(() => {
    if (mockState.running) window.prism.mock.update({ routes: mockRoutes(), latency: mockState.latency, cors: mockState.cors })
  }, 250)
}

async function startMock() {
  if (mockState.starting) return
  mockState.starting = true
  mockState.error = ''
  const out = await window.prism.mock.start({ port: mockState.port, routes: mockRoutes(), latency: mockState.latency, cors: mockState.cors })
  mockState.starting = false
  mockState.running = Boolean(out?.ok)
  mockState.error = out?.ok ? '' : out?.error ?? 'The mock server could not start.'
  keepMockSettings()
  paintMockStatus()
  if (pageOpen === 'runner' && runnerAt === 'mock') openRunner('mock')
  toast(out?.ok ? 'ok' : 'bad', out?.ok ? `Mock server answering at ${mockUrl()}` : mockState.error)
}

async function stopMockServer() {
  await window.prism.mock.stop()
  mockState.running = false
  paintMockStatus()
  if (pageOpen === 'runner' && runnerAt === 'mock') openRunner('mock')
  toast('ok', 'Mock server stopped')
}

/** An environment pointed at the mock: the active one's values, with base_url swapped. */
function useMockEnvironment() {
  let env = S.environments.find((e) => e.name === 'Mock')
  const from = environment()
  if (!env) {
    env = { id: uid('env'), name: 'Mock', values: { ...(from?.values ?? {}) }, secrets: [...(from?.secrets ?? [])] }
    S.environments.push(env)
  }
  const keys = new Set(mockCollections().flatMap((c) => c.flows.flatMap((f) => f.requests)).map((r) => /^\{\{([^}]+)\}\}/.exec(r.url ?? '')?.[1]).filter(Boolean))
  if (!keys.size) keys.add('base_url')
  for (const k of keys) env.values[k] = mockUrl()
  S.envId = env.id
  commit()
  toast('ok', `The Mock environment is active — ${[...keys].map((k) => `{{${k}}}`).join(', ')} point${keys.size === 1 ? 's' : ''} at ${mockUrl()}`)
}

function paintMockStatus() {
  const pill = $('statusMock')
  if (!pill) return
  pill.hidden = !mockState.running
  pill.textContent = `Mock :${mockState.port}`
}

function mockHead() {
  return pageHero(
    'Mock server',
    'Prism answers in your API’s place, on this machine — from the responses it has seen, the baselines you froze, and the OpenAPI spec. Point a front end at it while the back end is not ready, or down.',
    [
      mockState.running
        ? el('button', { class: 'btn bad', type: 'button', html: `${ico(I.x, 12, 2.4)}<span>Stop</span>`, onclick: () => stopMockServer() })
        : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>${mockState.starting ? 'Starting…' : 'Start'}</span>`, disabled: mockState.starting || !S.collections.length, onclick: () => startMock() })
    ]
  )
}

function mockPanel() {
  if (!S.collections.length) return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to mock yet' }), el('p', { text: 'Import a collection or an OpenAPI document, and it can be mocked from here.' })])
  const refresh = () => openRunner('mock')
  const cols = mockCollections()
  const routes = mockRoutes()
  const setting = (label, control, hint) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control, hint ? el('span', { class: 'rn-hint', text: hint }) : null])
  const scope = el('select', { class: 'rn-select', onchange: (e) => {
    mockState.scope = e.target.value
    keepMockSettings()
    if (mockState.running) queueMockUpdate()
    refresh()
  } }, [...S.collections.map((c) => el('option', { value: c.id, text: c.name, selected: c.id === mockState.scope })), el('option', { value: 'all', text: 'Every collection', selected: mockState.scope === 'all' })])
  const port = el('input', { class: 'rn-num', type: 'number', min: '1024', max: '65535', value: String(mockState.port), disabled: mockState.running, onchange: (e) => {
    mockState.port = clamp(Number(e.target.value) || 4010, 1024, 65535)
    keepMockSettings()
  } })
  const latency = el('input', { class: 'rn-num', type: 'number', min: '0', step: '50', value: String(mockState.latency), onchange: (e) => {
    mockState.latency = clamp(Number(e.target.value) || 0, 0, 30000)
    keepMockSettings()
    if (mockState.running) queueMockUpdate()
  } })
  const prefer = el('select', { class: 'rn-select', onchange: (e) => {
    mockState.prefer = e.target.value
    keepMockSettings()
    if (mockState.running) queueMockUpdate()
    refresh()
  } }, [
    el('option', { value: 'baseline', text: 'The frozen baseline, then the last response', selected: mockState.prefer === 'baseline' }),
    el('option', { value: 'last', text: 'The last response, then the baseline', selected: mockState.prefer === 'last' })
  ])
  const corsToggle = el('div', { class: 'rn-toggle' }, [
    el('div', {}, [el('b', { text: 'Allow browsers (CORS)' }), el('span', { text: 'So a front end on another port can call it.' })]),
    el('button', { class: `switch${mockState.cors ? ' on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(mockState.cors), 'aria-label': 'Allow browsers', onclick: () => {
      mockState.cors = !mockState.cors
      keepMockSettings()
      if (mockState.running) queueMockUpdate()
      refresh()
    } }, [el('i')])
  ])

  const config = el('aside', { class: 'rn-config' }, [
    el('section', { class: `rn-card mk-state${mockState.running ? ' on' : ''}` }, [
      el('h3', { text: 'Status' }),
      el('div', { class: 'mk-url' }, [
        el('span', { class: 'mk-dot' }),
        el('code', { text: mockUrl() }),
        el('button', { class: 'mini-btn', type: 'button', title: 'Copy the address', 'aria-label': 'Copy the address', html: ico(I.copy, 13, 2), onclick: () => {
          navigator.clipboard.writeText(mockUrl())
          toast('ok', 'Mock address copied')
        } })
      ]),
      el('p', { class: 'rn-hint', text: mockState.running ? `Answering ${routes.length} route${routes.length === 1 ? '' : 's'}. Only this machine can reach it.` : mockState.error || 'Stopped. Start it, then call the address from a browser, a front end or Prism itself.' }),
      el('button', { class: 'btn sm', type: 'button', text: 'Use it in an environment', title: 'Make a Mock environment whose base URL is this server', onclick: () => useMockEnvironment() })
    ]),
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'What it serves' }),
      setting('Collection', scope),
      setting('Answer with', prefer, 'Requests never sent answer from the OpenAPI spec when the collection has one.'),
      el('div', { class: 'rn-row' }, [setting('Port', port, mockState.running ? 'stop to change it' : '1024–65535'), setting('Delay', latency, 'ms before each answer')]),
      corsToggle
    ])
  ])

  const label = { baseline: 'Baseline', last: 'Last response', spec: 'OpenAPI', none: 'Not recorded' }
  const table = el('section', { class: 'rn-card' }, [
    el('div', { class: 'mk-head' }, [el('h3', { text: `Routes · ${routes.length}` }), cols.some((c) => c.spec) ? el('span', { class: 'rn-hint', text: 'Operations in the spec that no request covers are served from it too.' }) : null]),
    ...routes.map((rt) =>
      el('div', { class: `mk-route ${rt.source}` }, [
        el('span', { class: `verb ${rt.method.toLowerCase()}`, text: rt.method }),
        el('code', { class: 'mk-path', text: rt.path }),
        el('span', { class: 'mk-name', text: rt.name }),
        el('span', { class: 'mk-code', text: String(rt.status) }),
        el('span', { class: `mk-src ${rt.source}`, text: label[rt.source] ?? rt.source })
      ])
    )
  ])
  const log = el('section', { class: 'rn-card mk-log-card' }, [
    el('div', { class: 'mk-head' }, [el('h3', { text: 'Calls' }), mockState.hits.length ? el('button', { class: 'btn plain sm', type: 'button', text: 'Clear', onclick: () => {
      mockState.hits = []
      refresh()
    } }) : null]),
    el('div', { class: 'mk-log' })
  ])
  queueMicrotask(paintMockLog)
  return el('div', { class: 'rn' }, [config, el('div', { class: 'mk-main' }, [log, table])])
}

/** A path as it was typed, not as it was escaped for the wire. */
function safeDecode(path) {
  try {
    return decodeURI(String(path ?? ''))
  } catch {
    return String(path ?? '')
  }
}

function paintMockLog() {
  const host = document.querySelector('.mk-log')
  if (!host) return
  if (!mockState.hits.length) {
    host.replaceChildren(el('p', { class: 'cmp-note', text: mockState.running ? `Waiting for calls — try ${mockUrl()}${mockRoutes()[0]?.path ?? '/'}` : 'Calls show here while the server runs.' }))
    return
  }
  host.replaceChildren(
    ...mockState.hits.slice(0, 60).map((h) =>
      el('div', { class: `mk-hit${h.source === 'none' ? ' miss' : ''}` }, [
        el('span', { class: 'cn-time', text: new Date(h.at).toLocaleTimeString([], { hour12: false }) }),
        el('span', { class: `verb ${String(h.method).toLowerCase()}`, text: h.method }),
        el('code', { class: 'mk-path', text: safeDecode(h.path) }),
        el('span', { class: 'mk-code', text: String(h.status) }),
        el('span', { class: `mk-src ${h.source}`, text: h.source === 'none' ? 'no route' : h.name || h.route })
      ])
    )
  )
}

window.prism?.mock?.onHit((hit) => {
  mockState.hits.unshift(hit)
  mockState.hits.length = Math.min(mockState.hits.length, 200)
  consolePush({ kind: 'log', text: `Mock ${hit.method} ${hit.path} → ${hit.status}${hit.route ? ` (${hit.route}, ${hit.source})` : ' (no route)'}` })
  paintMockLog()
})

/* =================================================== compare environments */

/**
 * The same requests, run once in each of two environments, side by side.
 *
 * Graded by lib/compare.js: values are expected to differ between
 * environments, so what is compared is the contract — the status, the shape
 * of the body, the content type, which checks pass — and the time.
 */
const cmp = { a: '', b: '', running: false, stopping: false, phase: '', done: 0, total: 0, rows: null, target: '', aName: '', bName: '', open: new Set(), filter: 'all' }

function compareEnvIds() {
  const ids = S.environments.map((e) => e.id)
  if (!ids.includes(cmp.a)) cmp.a = S.envId && ids.includes(S.envId) ? S.envId : ids[0] ?? ''
  if (!ids.includes(cmp.b) || cmp.b === cmp.a) cmp.b = ids.find((id) => id !== cmp.a) ?? ''
  return { a: cmp.a, b: cmp.b }
}

function runCompareHead() {
  const t = currentTarget()
  const { a, b } = compareEnvIds()
  return pageHero(
    'Compare environments',
    'Run the same requests in two environments and see where they disagree — the status, the shape of the body, the content type, which checks pass, and the time.',
    [
      cmp.running
        ? el('button', { class: 'btn bad', type: 'button', html: `${ico(I.x, 12, 2.4)}<span>${cmp.stopping ? 'Stopping…' : 'Stop'}</span>`, disabled: cmp.stopping, onclick: () => {
            cmp.stopping = true
            openRunner('compare')
          } })
        : el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Compare</span>`, disabled: !t || !a || !b, onclick: () => runCompare() })
    ]
  )
}

function runComparePanel() {
  const t = currentTarget()
  if (!t) return el('div', { class: 'studio-empty' }, [el('b', { text: 'Nothing to compare yet' }), el('p', { text: 'Add a request to a flow, and it can be compared from here.' })])
  if (S.environments.length < 2) {
    return el('div', { class: 'studio-empty' }, [
      el('b', { text: 'Two environments are needed' }),
      el('p', { text: 'Add another environment — Staging and Production, say — on the Environments page, and compare them here.' }),
      el('button', { class: 'btn', type: 'button', text: 'Open Environments', onclick: () => openEnvironments() })
    ])
  }
  const { a, b } = compareEnvIds()
  const setting = (label, control, hint) => el('label', { class: 'rn-field' }, [el('span', { class: 'rn-label', text: label }), control, hint ? el('span', { class: 'rn-hint', text: hint }) : null])
  const envSelect = (key, other) =>
    el('select', { class: 'rn-select', onchange: (e) => {
      cmp[key] = e.target.value
      if (cmp[other] === cmp[key]) cmp[other] = S.environments.find((x) => x.id !== cmp[key])?.id ?? ''
      openRunner('compare')
    } }, S.environments.map((env) => el('option', { value: env.id, text: env.name, selected: env.id === cmp[key] })))
  const pickTarget = el('select', { class: 'rn-select', onchange: (e) => {
    runner.target = e.target.value
    runner.skip.clear()
    openRunner('compare')
  } }, runTargets().map((x) => el('option', { value: x.id, text: x.label, selected: x.id === t.id })))
  const n = t.requests.filter((r) => !runner.skip.has(r.id)).length

  const config = el('aside', { class: 'rn-config' }, [
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'What to compare' }),
      setting('Collection or flow', pickTarget, `${n} of ${t.requests.length} requests — choose which on the Collection runner`)
    ]),
    el('section', { class: 'rn-card' }, [
      el('h3', { text: 'Environments' }),
      setting('A', envSelect('a', 'b')),
      el('button', { class: 'btn plain sm cmp-swap', type: 'button', html: `${ico('<path d="M7 4v16"/><path d="m3 8 4-4 4 4"/><path d="M17 20V4"/><path d="m21 16-4 4-4-4"/>', 13, 2)}<span>Swap</span>`, disabled: !a || !b, onclick: () => {
        ;[cmp.a, cmp.b] = [cmp.b, cmp.a]
        openRunner('compare')
      } }),
      setting('B', envSelect('b', 'a'), 'Each request runs in A first, then in B, with its scripts and captures.')
    ]),
    el('section', { class: 'rn-card cmp-key' }, [
      el('h3', { text: 'How it grades' }),
      el('p', { class: 'cmp-key-row breaks', html: '<span class="rn-dot"></span><span><b>Breaks</b> — another status class, a field missing or of another type, another content type, a check that passes on one side only, or a failed send.</span>' }),
      el('p', { class: 'cmp-key-row differs', html: '<span class="rn-dot"></span><span><b>Differs</b> — another status in the same class, a field only in B, or twice as slow.</span>' }),
      el('p', { class: 'cmp-key-row same', html: '<span class="rn-dot"></span><span><b>Same</b> — the contract matches. Values — ids, names, times — are expected to differ, and are only counted.</span>' })
    ])
  ])
  const results = el('section', { class: 'rn-results cmp-results' })
  queueMicrotask(paintCompare)
  return el('div', { class: 'rn' }, [config, results])
}

async function runCompare() {
  const t = currentTarget()
  if (!t || cmp.running) return
  const list = t.requests.filter((r) => !runner.skip.has(r.id))
  const { a, b } = compareEnvIds()
  const envA = S.environments.find((e) => e.id === a)
  const envB = S.environments.find((e) => e.id === b)
  if (!list.length || !envA || !envB) {
    toast('bad', !list.length ? 'Select at least one request to compare.' : 'Choose two environments to compare.')
    return
  }
  const previousEnv = S.envId
  // Production is confirmed before anything is sent, not half-way through.
  for (const env of [envA, envB]) {
    S.envId = env.id
    if (!(await productionOk(`${list.length} request${list.length === 1 ? '' : 's'}`))) {
      S.envId = previousEnv
      return
    }
  }
  Object.assign(cmp, { running: true, stopping: false, phase: 'a', done: 0, total: list.length * 2, target: t.label, aName: envA.name, bName: envB.name, rows: null, open: new Set() })
  const got = { a: new Map(), b: new Map() }
  // Check names as Prism words them, so a check is matched to itself across the two runs.
  const named = (out) => out && { ...out, checks: (out.checks ?? []).map((c) => ({ name: describe(c.assertion), ok: c.ok })) }
  openRunner('compare')

  for (const [side, env] of [['a', envA], ['b', envB]]) {
    S.envId = env.id
    cmp.phase = side
    const locals = {}
    for (const r of list) {
      if (cmp.stopping) break
      const out = await sendOnce(r, scopeFor(envValues(), null), { locals })
      got[side].set(r.id, named(out))
      cmp.done += 1
      paintCompare()
    }
  }
  S.envId = previousEnv
  cmp.rows = list.map((r) => ({
    id: r.id,
    name: r.name || 'Untitled',
    method: verbOf(r),
    ...compareOne(got.a.get(r.id), got.b.get(r.id), { names: { a: envA.name, b: envB.name } })
  }))
  // What differs is open to begin with; what matches is a line.
  for (const row of cmp.rows) if (row.fields.length || row.flipped?.length) cmp.open.add(row.id)
  cmp.running = false
  const stopped = cmp.stopping
  cmp.stopping = false
  commit()
  if (pageOpen === 'runner') openRunner('compare')
  const sum = compareSummary(cmp.rows)
  toast(sum.breaks ? 'bad' : 'ok', `${stopped ? 'Stopped' : 'Compared'} — ${sum.same} same, ${sum.differs} differ, ${sum.breaks} break`)
}

function paintCompare() {
  const host = document.querySelector('.cmp-results')
  if (!host) return
  if (cmp.running) {
    const env = cmp.phase === 'a' ? cmp.aName : cmp.bName
    host.replaceChildren(
      el('div', { class: 'rn-run-head' }, [el('div', { class: 'rn-run-title' }, [el('b', { text: `Running in ${env}` }), el('span', { text: `${cmp.done} of ${cmp.total} sends · ${cmp.target}` })])]),
      el('div', { class: 'rn-bar' }, [el('i', { style: `width:${((cmp.done / Math.max(1, cmp.total)) * 100).toFixed(1)}%` })])
    )
    return
  }
  if (!cmp.rows) {
    host.replaceChildren(
      el('div', { class: 'rn-empty' }, [
        el('span', { class: 'rn-empty-ico', html: ico('<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>', 20, 1.9) }),
        el('b', { text: 'Does B behave like A?' }),
        el('p', { text: 'Pick two environments and press Compare. Every selected request is sent in A, then in B, and each pair is graded side by side.' }),
        el('ul', {}, [
          el('li', { text: 'Ids, names and timestamps differ between environments, so values are counted, not failed.' }),
          el('li', { text: 'A field missing in B, or of another type, is what breaks clients — those come first.' }),
          el('li', { text: 'Copy the result as Markdown for a release note or a ticket.' })
        ])
      ])
    )
    return
  }
  const sum = compareSummary(cmp.rows)
  const head = el('div', { class: 'rn-run-head' }, [
    el('div', { class: 'rn-run-title' }, [el('b', { text: `${cmp.aName} vs ${cmp.bName}` }), el('span', { text: cmp.target })]),
    el('button', { class: 'btn', type: 'button', html: `${ico(I.copy, 13, 2)}<span>Copy as Markdown</span>`, onclick: () => {
      navigator.clipboard.writeText(compareMarkdown({ target: cmp.target, a: cmp.aName, b: cmp.bName, rows: cmp.rows }))
      toast('ok', 'Comparison copied as Markdown')
    } }),
    el('button', { class: 'btn go', type: 'button', html: `${ico(I.play, 11)}<span>Compare again</span>`, onclick: () => runCompare() })
  ])
  const tiles = el('div', { class: 'rn-tiles cmp-tiles' }, [
    ['Compared', String(sum.total), ''],
    ['Same', String(sum.same), 'ok'],
    ['Differ', String(sum.differs), sum.differs ? 'warn' : ''],
    ['Break', String(sum.breaks), sum.breaks ? 'bad' : ''],
    [`${cmp.aName} faster`, String(sum.slowerB), ''],
    [`${cmp.bName} faster`, String(sum.slowerA), '']
  ].map(([label, value, tone]) => el('div', { class: `rn-tile ${tone}`, title: label }, [el('b', { text: value }), el('span', { text: label })])))
  const filter = el('div', { class: 'seg rn-filter' }, [
    ['all', 'All'],
    ['diff', 'Differences']
  ].map(([id, label]) => el('button', { class: `segbtn${cmp.filter === id ? ' on' : ''}`, type: 'button', text: label, onclick: () => {
    cmp.filter = id
    paintCompare()
  } })))

  // One side of a pair, as the runner writes a result: status and time, in mono.
  const side = (x) => {
    if (!x) return el('span', { class: 'cmp-side none', text: 'not run' })
    if (x.skipped) return el('span', { class: 'cmp-side none', text: 'skipped' })
    if (x.error) return el('span', { class: 'cmp-side err', title: x.error, text: shortError(x.error) })
    return el('span', { class: 'cmp-side' }, [
      el('b', { class: `cmp-status ${x.status >= 500 ? 'bad' : x.status >= 400 ? 'warn' : 'ok'}`, text: String(x.status) }),
      el('span', { class: 'cmp-ms', text: `${x.ms} ms` })
    ])
  }
  const word = { breaks: 'breaks', differs: 'differs', same: 'same' }
  const order = { breaks: 0, differs: 1, same: 2 }
  const rows = [...cmp.rows]
    .sort((x, y) => order[x.grade] - order[y.grade])
    .filter((r) => cmp.filter === 'all' || r.grade !== 'same')
    .map((r) => {
      const open = cmp.open.has(r.id)
      const more = r.fields.length > 0 || (r.flipped?.length ?? 0) > 0 || r.reasons.length > 1 || r.values > 0
      const first = r.reasons[0]
      const row = el('div', { class: `cmp-row ${r.grade}${open ? ' open' : ''}` })
      row.append(
        el('button', { class: 'cmp-sum', type: 'button', 'aria-expanded': String(open), disabled: !more, onclick: () => {
          if (cmp.open.has(r.id)) cmp.open.delete(r.id)
          else cmp.open.add(r.id)
          paintCompare()
        } }, [
          el('span', { class: 'rn-dot' }),
          el('span', { class: `verb ${r.method.toLowerCase()}`, text: r.method }),
          el('div', { class: 'rn-res-words' }, [
            el('b', { text: r.name }),
            first ? el('span', { class: `cmp-reason ${first.grade}`, title: r.reasons.map((x) => x.why).join('\n'), text: r.reasons.length > 1 ? `${first.why} · +${r.reasons.length - 1} more` : first.why }) : null
          ]),
          side(r.a),
          side(r.b),
          el('span', { class: 'cmp-grade', text: word[r.grade] })
        ])
      )
      if (open && more) {
        const detail = el('div', { class: 'cmp-detail' })
        if (r.reasons.length > 1) detail.append(el('ul', { class: 'cmp-why' }, r.reasons.map((x) => el('li', { class: x.grade, text: x.why }))))
        if (r.fields.length) {
          detail.append(
            el('table', { class: 'cmp-fields' }, [
              el('thead', {}, [el('tr', {}, [el('th', { text: 'Field' }), el('th', { text: cmp.aName }), el('th', { text: cmp.bName })])]),
              el('tbody', {}, r.fields.slice(0, 60).map((c) => el('tr', { class: c.kind }, [
                el('td', {}, [el('code', { text: c.path })]),
                el('td', { text: c.kind === 'added' ? '—' : c.kind === 'retyped' ? c.from : typeOfValue(c.before) }),
                el('td', { text: c.kind === 'removed' ? 'missing' : c.kind === 'retyped' ? c.to : typeOfValue(c.after) })
              ])))
            ])
          )
        }
        if (r.flipped?.length) detail.append(el('ul', { class: 'cmp-why' }, r.flipped.map((c) => el('li', { class: 'breaks', text: `${c.name} — ${c.a ? 'passed' : 'failed'} in ${cmp.aName}, ${c.b ? 'passed' : 'failed'} in ${cmp.bName}` }))))
        const answered = r.a && r.b && !r.a.error && !r.b.error && !r.a.skipped && !r.b.skipped
        if (answered) detail.append(el('p', { class: 'cmp-note', text: r.values ? `${r.values} value${r.values === 1 ? '' : 's'} differ, as values between environments do.` : 'Every value matched as well.' }))
        row.append(detail)
      }
      return row
    })
  const list = el('div', { class: `rn-it cmp-list${sum.breaks ? ' bad' : ''}` }, [
    el('div', { class: 'cmp-cols' }, [el('span'), el('span', { text: 'Request' }), el('span', { text: cmp.aName }), el('span', { text: cmp.bName }), el('span', { text: 'Result' })]),
    ...(rows.length ? rows : [el('p', { class: 'cmp-note cmp-none', text: 'No differences — every request behaved the same in both.' })])
  ])
  host.replaceChildren(head, tiles, el('div', { class: 'rn-list-head' }, [el('h3', { text: 'Requests' }), filter]), list)
}

/** The gist of a send error — "ENOTFOUND", "timed out" — for a narrow column. */
function shortError(text) {
  const t = String(text ?? '')
  return /\bE[A-Z]{4,}\b/.exec(t)?.[0] ?? (/timed? ?out/i.test(t) ? 'timed out' : 'failed to send')
}

/** A value's JSON type, as the field table names it. */
function typeOfValue(v) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
}

/* ================================================================ backups */

/** This machine's settings as a backup carries them: never a secret one. */
function settingsForBackup() {
  const secret = new Set(SETTINGS.filter((x) => x.kind === 'secret').map((x) => x.id))
  return Object.fromEntries(Object.entries(S.prefs).filter(([k]) => !secret.has(k)))
}

const hasWork = () => S.collections.length > 0 || S.environments.length > 0

/**
 * Keeps an automatic backup, for a reason the list can show.
 *
 * Off when the setting says so — except before a restore, which always backs
 * up what it is about to replace, because that is what makes a restore safe
 * to try.
 */
async function snapshot(reason, { force = reason === 'restore' } = {}) {
  if (!window.prism?.backup || !hasWork()) return null
  if (!force && S.prefs.autoBackup === false) return null
  const backup = makeBackup(S, { name: S.savedName, settings: settingsForBackup(), reason, app: PRISM_VERSION })
  const out = await window.prism.backup.keep({
    name: backupFileName(backup),
    text: JSON.stringify(backup, null, 2),
    fingerprint: backup.fingerprint,
    skipIfSame: reason === 'start' || reason === 'hourly'
  })
  if (out && !out.ok) toast('bad', `Could not keep a backup: ${out.error}`)
  return out
}

/** A backup written to a file of the user's choosing — to keep, or to move. */
async function backupToFile() {
  if (!hasWork()) {
    toast('bad', 'There is nothing to back up yet.')
    return
  }
  const backup = makeBackup(S, { name: S.savedName, settings: settingsForBackup(), reason: 'manual', app: PRISM_VERSION })
  const day = backup.createdAt.slice(0, 10)
  const path = await window.prism.file.save({
    name: `${slug(S.savedName || 'prism')}-backup-${day}.prism-backup.json`,
    text: JSON.stringify(backup, null, 2),
    filters: [{ name: 'Prism backup', extensions: ['json'] }]
  })
  if (path?.error) toast('bad', `Could not write the backup: ${path.error}`)
  else if (path) toast('ok', `Backed up ${backup.summary.requests} requests and your settings`)
}

async function restoreFromFile() {
  const chosen = await window.prism.file.open([{ name: 'Prism backup or workspace', extensions: ['json'] }])
  if (!chosen) return
  if (chosen.error) {
    toast('bad', chosen.error)
    return
  }
  const parsed = readBackup(chosen.text, chosen.name)
  if (!parsed.ok) {
    toast('bad', parsed.error)
    return
  }
  await confirmRestore(parsed, chosen.name)
}

async function restoreKept(id) {
  const kept = await window.prism.backup.read(id)
  if (!kept || kept.error) {
    toast('bad', `Could not read that backup: ${kept?.error ?? 'it is gone'}`)
    return
  }
  const parsed = readBackup(kept.text, id)
  if (!parsed.ok) {
    toast('bad', parsed.error)
    return
  }
  await confirmRestore(parsed, `the backup from ${whenText(parsed.createdAt)}`)
}

const summaryText = (x) =>
  x
    ? [
        `${x.collections} collection${x.collections === 1 ? '' : 's'}`,
        `${x.requests} request${x.requests === 1 ? '' : 's'}`,
        `${x.environments} environment${x.environments === 1 ? '' : 's'}`,
        x.runs ? `${x.runs} run${x.runs === 1 ? '' : 's'}` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Contents unknown'

/** Today, yesterday, or the date — and the time either way. */
function whenText(iso) {
  if (!iso) return 'an unknown time'
  const d = new Date(iso)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = new Date()
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - day) / 86400000)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `today, ${time}`
  if (diff === 1) return `yesterday, ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}, ${time}`
}

async function confirmRestore(parsed, label) {
  const yes = await ask({
    title: `Restore ${label}?`,
    blurb: `It holds ${summaryText(parsed.summary)}${parsed.settings ? ', and your settings' : ''}. The workspace open now is replaced.`,
    note: 'The workspace open now is backed up first, so this can be undone from Backups.',
    danger: 'Restore',
    tone: 'go'
  })
  if (!yes) return
  await snapshot('restore')
  await applyRestore(parsed)
}

/**
 * Puts a backup in place: the workspace, then the settings.
 *
 * Secret values were never in the backup. Where an environment and a secret
 * with the same name are open now, its value is carried across, so restoring
 * today's backup does not mean typing every token in again.
 */
async function applyRestore(parsed) {
  const live = new Map(S.environments.map((env) => [env.id, env]))
  for (const env of parsed.workspace.environments ?? []) {
    const now = live.get(env.id)
    if (!now) continue
    for (const key of env.secrets ?? []) {
      if (!env.values[key] && now.values?.[key]) env.values[key] = now.values[key]
    }
  }

  // Restored into the app, not into a file: Save puts it where you choose.
  S.filePath = ''
  adopt(parsed.workspace, `Restored — ${countIn(parsed.workspace)} requests${parsed.settings ? ' and your settings' : ''}`)

  if (parsed.settings) {
    // Through load, so anything an older Prism wrote is checked like any
    // stored setting; secrets on this machine are kept as they are.
    saveSettings(safeStorage(), { ...S.prefs, ...parsed.settings })
    S.prefs = loadSettings(safeStorage())
    applyTheme()
    applyScale()
  }
  await autosave({ force: true })
  syncState()
}

/**
 * The backups: the automatic ones, newest first, each restorable; and a
 * backup to a file, or a restore from one.
 */
async function openBackups() {
  const body = el('div', { class: 'bk' })
  const paint = async () => {
    const list = (await window.prism.backup?.list()) ?? []
    const on = S.prefs.autoBackup !== false
    body.replaceChildren(
      el('div', { class: 'bk-actions' }, [
        el('button', { class: 'btn go', type: 'button', html: `${ico(I.save, 13, 2)}<span>Back up to a file</span>`, onclick: () => backupToFile() }),
        el('button', { class: 'btn', type: 'button', html: `${ico(I.folder, 13, 2)}<span>Restore from a file</span>`, onclick: () => restoreFromFile() }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn plain', type: 'button', html: `${ico(I.eye, 13, 2)}<span>Open the folder</span>`, onclick: () => window.prism.backup.reveal() })
      ]),
      el('div', { class: `bk-status${on ? '' : ' off'}` }, [
        el('span', { class: 'bk-dot' }),
        el('span', {
          text: on
            ? `Automatic backups are on — when Prism starts, every hour while you work, and before anything replaces the workspace. The newest ${BACKUPS_KEPT} are kept.`
            : 'Automatic backups are off. Prism still backs up before a restore.'
        }),
        el('button', {
          class: 'btn plain sm',
          type: 'button',
          text: on ? 'Turn off' : 'Turn on',
          onclick: () => {
            setPref('autoBackup', !on)
            void paint()
          }
        })
      ]),
      list.length
        ? el('div', { class: 'bk-list' },
            list.map((b) =>
              el('div', { class: `bk-row${b.damaged ? ' bad' : ''}` }, [
                el('span', { class: 'bk-ico', html: ico(b.damaged ? I.alert : I.save, 15, 1.9) }),
                el('div', { class: 'bk-words' }, [
                  el('b', { text: b.damaged ? 'Damaged backup' : whenText(b.createdAt).replace(/^./, (c) => c.toUpperCase()) }),
                  el('span', { text: b.damaged ? 'This file cannot be read.' : summaryText(b.summary) })
                ]),
                b.reason ? el('span', { class: 'bk-reason', text: BACKUP_REASONS[b.reason] ?? b.reason }) : el('span'),
                el('span', { class: 'bk-size', text: fmtBytes(b.bytes) }),
                b.damaged
                  ? el('span')
                  : el('button', { class: 'btn sm', type: 'button', text: 'Restore', onclick: () => restoreKept(b.id) }),
                el('button', {
                  class: 'mini-btn',
                  type: 'button',
                  title: 'More',
                  'aria-label': 'More for this backup',
                  html: ico(I.dots, 13, 2),
                  onclick: (e) =>
                    openMenu(e.currentTarget, [
                      {
                        icon: I.copy,
                        label: 'Save a copy…',
                        disabled: Boolean(b.damaged),
                        run: async () => {
                          const kept = await window.prism.backup.read(b.id)
                          if (!kept?.text) return
                          const path = await window.prism.file.save({ name: b.id, text: kept.text, filters: [{ name: 'Prism backup', extensions: ['json'] }] })
                          if (path && !path.error) toast('ok', `Copied to ${path}`)
                        }
                      },
                      {
                        icon: I.bin,
                        label: 'Delete',
                        danger: true,
                        run: async () => {
                          await window.prism.backup.remove(b.id)
                          void paint()
                        }
                      }
                    ])
                })
              ])
            )
          )
        : el('div', { class: 'bk-empty' }, [
            el('span', { html: ico(I.save, 22, 1.8) }),
            el('b', { text: 'No automatic backups yet' }),
            el('p', { text: on ? 'The first is kept a few seconds after Prism starts, as soon as there is a workspace to keep.' : 'Turn automatic backups on, or back up to a file.' })
          ]),
      el('p', { class: 'bk-note', text: 'Secret values are never written to a backup. After a restore, Prism keeps the ones open now and names any left to fill in.' })
    )
  }
  sheet({ title: 'Backups', blurb: 'Everything needed to put this setup back: collections, environments, the canvas, baselines, run history and settings.', body, acts: [], wide: true })
  await paint()
}

/** The three ways a run's report can be written. */
const REPORTS = [
  { kind: 'html', label: 'HTML report', hint: 'to read and share', ext: 'html', write: toHtml },
  { kind: 'junit', label: 'JUnit XML', hint: 'for CI', ext: 'xml', write: toJUnit },
  { kind: 'json', label: 'JSON', hint: 'for anything else', ext: 'json', write: toJson }
]

function reportMenu() {
  return REPORTS.map((r) => ({ icon: I.up, label: r.label, keys: r.hint, run: () => saveReport(r.kind) }))
}

/** Writes the latest run's report to a file the user picks. */
async function saveReport(kind) {
  if (!lastReport) {
    toast('bad', 'Run a flow first — the report is of the latest run.')
    return
  }
  const r = REPORTS.find((x) => x.kind === kind) ?? REPORTS[0]
  const stamp = new Date(lastReport.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const subject = lastReport.flows.length === 1 ? lastReport.flows[0].name : lastReport.workspace
  const text = r.kind === 'html' ? toHtml(lastReport, { fonts: await fontsForReport() }) : r.write(lastReport)
  const path = await window.prism.file.save({
    name: `prism-${slug(subject)}-${stamp}.${r.ext}`,
    text,
    filters: [{ name: r.label, extensions: [r.ext] }]
  })
  if (path?.error) toast('bad', `Could not write the report: ${path.error}`)
  else if (path) {
    const t = totals(lastReport)
    toast('ok', `Report saved — ${t.passed} passed, ${t.failed} failed`)
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

function sheet({ title, blurb, body, acts, onClose, wide = false }) {
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
    el('div', { class: `sheet${wide ? ' wide' : ''}` }, [
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
/**
 * A small decision, on a card the size of the decision: a ticket, in Metro's
 * terms. A station mark says what kind of decision it is — red for something
 * that cannot be taken back, amber for a caution, the line's colour for an
 * ordinary yes — then the question, a line on what it means, and the answers
 * under a perforated tear. The wide sheet stretched a two-line question
 * across 820 pixels; this is as wide as it needs to be.
 */
const CARD_MARK = {
  danger: '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  hold: '<path d="M12 4 22 20H2z"/><path d="M12 10v4M12 17h.01"/>',
  go: '<path d="M5 12.5 10 17.5 19 7.5"/>',
  ask: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'
}

function cardDialog({ tone = 'danger', title, blurb, note, body, action, cancel = 'Cancel', focus = 'cancel', onYes, onNo }) {
  const veil = $('veil')
  veil.replaceChildren()
  veil.hidden = false
  sheetUp = true
  onSheetClose = () => onNo?.()
  const no = el('button', { class: 'btn plain', type: 'button', text: cancel, onclick: closeSheet })
  const yes = el('button', { class: `btn cf-yes ${tone === 'danger' ? 'bad' : 'go'}`, type: 'button', text: action, onclick: () => {
    onSheetClose = null
    closeSheet()
    onYes?.()
  } })
  const card = el('div', { class: `cf ${tone}`, role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div', { class: 'cf-top' }, [
      el('span', { class: 'cf-mark', 'aria-hidden': 'true', html: ico(CARD_MARK[tone] ?? CARD_MARK.ask, 18, 2) }),
      el('div', { class: 'cf-words' }, [el('h2', { text: title }), blurb ? el('p', { text: blurb }) : null])
    ]),
    body ? el('div', { class: 'cf-body' }, [body]) : null,
    note ? el('p', { class: 'cf-note', html: `${ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 13, 2)}<span>${esc(note)}</span>` }) : null,
    el('div', { class: 'cf-tear', 'aria-hidden': 'true' }),
    el('div', { class: 'cf-acts' }, [no, yes])
  ])
  veil.append(card)
  veil.onpointerdown = (e) => {
    if (e.target === veil) closeSheet()
  }
  // A destructive answer is never the one a stray Enter presses.
  ;(focus === 'yes' ? yes : no).focus()
  return { card, yes }
}

function promptText({ title, blurb, value = '', action = 'Save' }) {
  return new Promise((resolve) => {
    let answered = false
    const input = el('input', { class: 'prompt-field', value, spellcheck: 'false', 'aria-label': title })
    const done = () => {
      answered = true
      resolve(input.value.trim())
    }
    const { yes } = cardDialog({ tone: 'ask', title, blurb, body: input, action, focus: 'yes', onYes: done, onNo: () => {
      if (!answered) resolve('')
    } })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        yes.click()
      }
    })
    setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
  })
}

/**
 * A confirm that can be awaited, for a decision taken mid-flow.
 * tone: danger (cannot be undone), hold (a caution) or go (an ordinary yes).
 */
function ask({ title, blurb, danger, note = 'Nothing has been sent yet.', tone = 'danger' }) {
  return new Promise((resolve) => {
    let answered = false
    cardDialog({ tone, title, blurb, note, action: danger, onYes: () => {
      answered = true
      resolve(true)
    }, onNo: () => {
      if (!answered) resolve(false)
    } })
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
    el('span', { class: `verb ${verbOf(req).toLowerCase()}`, text: verbOf(req) }),
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
    cmd('Save the last run report', 'HTML, to read and share', I.up, () => saveReport('html')),
    cmd('Back up to a file', 'the workspace and your settings', I.save, () => backupToFile()),
    cmd('Save as a folder, for Git', 'a file per request', I.folder, () => saveWorkspaceAsFolder()),
    cmd('Open a workspace folder', 'one saved for Git', I.folder, () => openWorkspace({ folder: true })),
    cmd('Compare environments', 'run the same requests in two environments', I.play, () => openRunner('compare')),
    cmd('Spec coverage', 'responses against the OpenAPI document', I.check, () => openRunner('contract')),
    cmd('Mock server', 'answer in the API’s place, on this machine', I.play, () => openRunner('mock')),
    cmd('Explain this failure with AI', 'the picked request’s last result', I.sparkle, () => {
      const req = current()
      const res = req ? S.results.get(req.id) : null
      if (!req || !res) return toast('hold', 'Send a request first')
      explainWithAi(req, res)
    }),
    cmd('Load test', 'several users through a flow at once', I.play, () => openRunner('load')),
    cmd('Schedules', 'run a flow on a timer', I.play, () => openRunner('schedule')),
    cmd('Run timeline', 'compare any two runs of a flow', I.play, () => {
      historyOf = 'timeline'
      openHistory()
    }),
    cmd('New WebSocket request', 'a two-way connection, held open', I.plus, () => {
      const flow = workingFlow()
      if (!flow) return newCollection()
      closePage()
      const req = addRequest(flow)
      if (req) {
        req.kind = 'ws'
        req.name = 'WebSocket'
        commit()
      }
    }),
    cmd('Toggle the console', 'every request, header, body and log', I.terminal, () => toggleConsole(), 'Ctrl `'),
    cmd('Maximise or restore the inspector', 'grow the request panel over the canvas', I.chev, () => setBenchMax(!benchSize.max), 'Ctrl Shift M'),
    cmd('Expand or collapse the sidebar', 'name each place beside its icon', I.chev, () => setRailWide(!document.documentElement.classList.contains('rail-wide')), 'Ctrl B'),
    cmd('Restore a backup', 'automatic backups, or a file', I.revert, () => openBackups()),
    cmd('Save the last run as JUnit XML', 'for CI', I.up, () => saveReport('junit')),
    cmd('Fit everything', 'frame the whole plane', I.eye, () => {
      closePage()
      requestAnimationFrame(fit)
    }, 'Shift 1'),
    cmd('Tidy the plane', 'lay the nodes out in order', I.flow, tidy),
    cmd('Toggle the sidebar', 'more room for the plane', I.folder, () => setTreeShown($('stage').classList.contains('tree-off'))),
    cmd('New collection', 'empty', I.plus, newCollection),
    cmd('Switch theme', 'dark, light, pure black or the system', I.eye, () => {
      const order = ['system', 'dark', 'light', 'black']
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
  $('planeRun').onclick = () => runFlow()
  $('benchClose').onclick = unpick
  $('envPick').onclick = (e) => openMenu(e.currentTarget, envMenu())
  $('envBtn').onclick = () => togglePage('environments', () => openEnvironments())
  $('historyBtn').onclick = () => togglePage('history', openHistory)
  $('railExport').onclick = () => togglePage('export', () => openExport())
  $('finder').onclick = openPalette
  $('settingsBtn').onclick = () => togglePage('settings', () => openSettings())
  $('helpBtn').onclick = () => togglePage('help', () => openHelp())
  // From a page, Collections means "back to the workspace"; on the
  // workspace, it folds the sidebar.
  $('railHome').onclick = () => togglePage('overview', openOverview)
  $('railRunner').onclick = () => togglePage('runner', openRunner)
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
  $('addrVerb').onclick = (e) => openMethodPicker(e.currentTarget)
  $('addrVerb').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMethodPicker(e.currentTarget)
    }
  })
  $('consoleBtn').onclick = () => toggleConsole()
  $('statusMock').onclick = () => openRunner('mock')
  $('railFold').onclick = () => setRailWide(!document.documentElement.classList.contains('rail-wide'))
  setRailWide(railWideSaved(), { quiet: true })
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
  $('benchMax').onclick = () => setBenchMax(!benchSize.max)
  const edge = $('benchEdge')
  edge.ondblclick = () => setBenchMax(!benchSize.max)
  edge.onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    benchSize.max = false
    benchSize.w = (document.querySelector('.bench').offsetWidth) + (e.key === 'ArrowLeft' ? 32 : -32)
    setBenchMax(false)
    try {
      window.localStorage.setItem('prism.benchWidth', String(benchSize.w))
    } catch {
      /* not remembered, only */
    }
  }
  edge.onpointerdown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const right = $('stage').getBoundingClientRect().right
    const room = $('stage').offsetWidth - benchReach()
    edge.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-bench')
    const move = (ev) => {
      // Dragged right up to the edge of the collections, it is maximised.
      const w = right - ev.clientX
      benchSize.max = w >= room - 24
      if (!benchSize.max) benchSize.w = w
      $('stage').classList.toggle('bench-max', benchSize.max)
      placeBench()
      layoutPanes()
      drawBeams()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing-bench')
      setBenchMax(benchSize.max)
      try {
        window.localStorage.setItem('prism.benchWidth', String(benchSize.w ?? ''))
      } catch {
        /* not remembered, only */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  $('benchMore').onclick = (e) => {
    const req = current()
    if (req) openMenu(e.currentTarget, requestMenu(req))
  }

  const grip = $('benchGrip')
  grip.onkeydown = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') S.split = clamp(S.split - 4, 15, 88)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') S.split = clamp(S.split + 4, 15, 88)
    S.pane = 'split'
    layoutPanes()
  }
  grip.onpointerdown = (e) => {
    S.pane = 'split'
    const host = $('benchSplit')
    const box = host.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    const cols = host.classList.contains('cols')
    const move = (ev) => {
      S.split = clamp((cols ? (ev.clientX - box.left) / box.width : (ev.clientY - box.top) / box.height) * 100, 15, 88)
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
    } else if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
      e.preventDefault()
      toggleConsole()
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm' && $('stage').classList.contains('drawer')) {
      e.preventDefault()
      setBenchMax(!benchSize.max)
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b' && !e.target.closest?.('input, textarea, [contenteditable]')) {
      e.preventDefault()
      setRailWide(!document.documentElement.classList.contains('rail-wide'))
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
  // Settled, not on every frame of a drag: zooming mid-drag would make the
  // window's contents swim under the pointer.
  let scaleTimer = 0
  window.addEventListener('resize', () => {
    clearTimeout(scaleTimer)
    scaleTimer = setTimeout(applyScale, 180)
  })

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
  applyScale()
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

  // A backup shortly after start — once the workspace has settled — and then
  // every hour. One of a workspace nobody touched is skipped.
  setTimeout(() => void snapshot('start'), 5000)
  setInterval(scheduleTick, 15000)
  setInterval(() => void snapshot('hourly'), 60 * 60 * 1000)

  // A last-resort save on the way out, for a reload or a renderer teardown
  // that did not come through the close path.
  window.addEventListener('beforeunload', () => {
    clearTimeout(checkTimer)
    const doc = serialise(S, { name: S.savedName })
    if (S.prefs.autosave !== false && autoKey(doc) !== written.auto) window.prism.workspace.autosave(JSON.stringify(doc, null, 2))
  })
}

boot()
