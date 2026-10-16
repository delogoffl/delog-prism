/**
 * The workspace on disk.
 *
 * WHY A VERSION AND A MIGRATION
 *
 * A saved file is the one piece of state that outlives the code that wrote it.
 * It will be opened by a newer Prism, an older Prism, and by somebody who
 * hand-edited it — and this project has already been bitten once by a stored
 * shape drifting away from the model reading it. So: an explicit version, a
 * reader that is total, and defaults for everything.
 *
 * WHAT IS NOT WRITTEN
 *
 * The value of a variable marked **secret** is left out. A workspace is a file
 * people commit next to their code and send to each other; writing a live
 * token into it is the same leak the export rule exists to prevent. The name
 * is kept, so opening the file tells you what to fill in.
 *
 * Responses are not written either, with one exception: a baseline that was
 * deliberately frozen. Session results are noise in a file meant to be
 * reviewed in a diff.
 */
import { emptyCollection, emptyFlow, emptyRequest, toRows, uid } from './collection.js'
import { runRecord, RUNS_KEPT } from './timeline.js'

export const FORMAT = 'prism.workspace'
export const VERSION = 1

/* ------------------------------------------------------------------ write */

/**
 * @param {object} state  collections, environments, envId, layout, baselines
 * @param {{ name?: string }} [meta]
 */
export function serialise(state, meta = {}) {
  return {
    prism: FORMAT,
    version: VERSION,
    name: meta.name ?? 'Workspace',
    savedAt: new Date().toISOString(),
    activeEnvironment: state.envId ?? '',
    collections: (state.collections ?? []).map(writeCollection),
    environments: (state.environments ?? []).map(writeEnvironment),
    // Node positions are part of the work: a graph somebody arranged and then
    // found rearranged on open has lost something real.
    layout: Object.fromEntries(state.layout ?? []),
    // Which of those positions somebody placed by hand. Without it, a restart
    // re-stacked every column and the arrangement was lost after all.
    pinned: [...(state.moved ?? [])].filter((id) => state.layout?.has?.(id)).sort(),
    baselines: state.baselines ? Object.fromEntries(state.baselines) : {},
    // How each request has behaved over time. Kept because "is this getting
    // slower" and "does this fail sometimes" are the only questions old runs
    // can answer, and both need runs that outlive the session.
    //
    // Measurements only: no body, no headers, nothing that could carry a token
    // out of the session and onto the disk.
    history: (state.history ?? []).slice(0, HISTORY_KEPT).map(writeRun),
    // Whole runs for the timeline: statuses, times, which checks passed and
    // each response's shape as types — never a value.
    runs: (state.runs ?? []).slice(0, RUNS_KEPT),
    // Flows run on a timer while Prism is open: what, how often, where.
    schedules: (state.schedules ?? []).map(writeSchedule)
  }
}

function writeSchedule(x) {
  // How the last run went is not written: it is in the run timeline, and a
  // result is not an edit — a schedule would otherwise mark the file changed
  // every time it ran.
  return { id: x.id, target: x.target, every: x.every, envId: x.envId ?? '', on: x.on !== false, notify: x.notify ?? 'fail' }
}

/** A schedule back from a file: only the fields it needs, every one checked. */
function readSchedule(raw) {
  const every = Math.max(1, Math.min(1440, Math.round(Number(raw?.every) || 15)))
  return { id: String(raw?.id ?? uid('sch')), target: String(raw?.target ?? ''), every, envId: String(raw?.envId ?? ''), on: raw?.on !== false, notify: ['fail', 'always', 'never'].includes(raw?.notify) ? raw.notify : 'fail', last: null }
}

/** Runs kept per workspace. Enough for a trend, small enough to stay quick. */
export const HISTORY_KEPT = 400

function writeRun(run) {
  return {
    requestId: run.requestId,
    name: run.name,
    method: run.method,
    status: run.status,
    ms: run.ms,
    at: run.at,
    env: run.env,
    failed: run.failed ? 1 : 0
  }
}

function writeCollection(col) {
  return {
    id: col.id,
    name: col.name,
    source: col.source ?? 'prism',
    open: col.open !== false,
    ...writeLevel(col),
    // An attached OpenAPI document, which responses are checked against.
    ...(col.spec?.paths ? { spec: col.spec } : {}),
    ...(col.spec?.paths && col.specCheck === false ? { specCheck: false } : {}),
    flows: (col.flows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      open: f.open !== false,
      ...writeLevel(f),
      requests: (f.requests ?? []).map(writeRequest)
    }))
  }
}

/**
 * What a collection or a flow hands down to its requests.
 *
 * These used to be left out entirely, so a bearer token set once on the
 * collection -- the whole point of inheritance -- was gone after a save, and
 * every request in it went out unauthenticated on the next open.
 */
function writeLevel(level) {
  return {
    ...(level.description ? { description: String(level.description) } : {}),
    ...(level.headers?.length ? { headers: rows(level.headers) } : {}),
    ...(level.auth && level.auth.kind && level.auth.kind !== 'inherit' ? { auth: level.auth } : {})
  }
}

function writeRequest(req) {
  return {
    id: req.id,
    name: req.name,
    method: req.method,
    // A WebSocket or Server-Sent Events request; plain HTTP says nothing.
    ...(req.kind === 'ws' || req.kind === 'sse' || req.kind === 'grpc' ? { kind: req.kind } : {}),
    // A step's logic: run only if, wait, for each, poll until, stop on failure.
    ...(req.logic && (req.logic.when || req.logic.waitMs || req.logic.each || req.logic.until || req.logic.onFail === 'stop')
      ? { logic: { when: String(req.logic.when ?? ''), waitMs: Number(req.logic.waitMs) || 0, each: String(req.logic.each ?? ''), until: String(req.logic.until ?? ''), everyMs: Number(req.logic.everyMs) || 1000, tries: Number(req.logic.tries) || 10, onFail: req.logic.onFail === 'stop' ? 'stop' : 'continue' } }
      : {}),
    // A gRPC request carries its .proto, so it can be called with no other file.
    ...(req.kind === 'grpc' && req.grpc ? { grpc: { proto: String(req.grpc.proto ?? ''), protoName: String(req.grpc.protoName ?? ''), service: String(req.grpc.service ?? ''), method: String(req.grpc.method ?? '') } } : {}),
    url: req.url,
    query: rows(req.query),
    pathParams: rows(req.pathParams),
    headers: rows(req.headers),
    auth: req.auth ?? { kind: 'none' },
    bodyKind: req.bodyKind ?? 'none',
    body: req.body ?? '',
    ...(req.gqlVariables ? { gqlVariables: String(req.gqlVariables) } : {}),
    ...(req.description ? { description: String(req.description) } : {}),
    assertions: req.assertions ?? [],
    captures: req.captures ?? [],
    ...(req.dataset ? { dataset: req.dataset } : {}),
    ...(req.scripts?.pre || req.scripts?.test ? { scripts: { pre: String(req.scripts.pre ?? ''), test: String(req.scripts.test ?? '') } } : {})
  }
}

const rows = (list) => (list ?? []).map((r) => ({ key: r.key, value: r.value, on: r.on !== false }))

/**
 * An environment, with secret values withheld.
 *
 * The names of the secrets are kept in their own list so the reader can mark
 * them again — otherwise opening a shared workspace silently downgrades every
 * secret to an ordinary variable, and the next export leaks it.
 */
function writeEnvironment(env) {
  const secrets = env.secrets ?? []
  const values = {}
  for (const [k, v] of Object.entries(env.values ?? {})) values[k] = secrets.includes(k) ? '' : String(v)
  return { id: env.id, name: env.name, values, secrets }
}

/* ------------------------------------------------------------------- read */

/**
 * Reads a saved workspace. Never throws.
 *
 * @returns {{ ok: true, workspace: object } | { ok: false, error: string }}
 */
export function parse(text, fileName = '') {
  let doc
  try {
    doc = JSON.parse(String(text))
  } catch (err) {
    return { ok: false, error: `${fileName || 'That file'} is not valid JSON — ${err.message}` }
  }
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'That file holds a value, not a workspace.' }
  if (doc.prism !== FORMAT) {
    return {
      ok: false,
      error: 'That is not a Prism workspace. Use Import for a Postman collection, an OpenAPI document or a HAR file.'
    }
  }
  if (Number(doc.version) > VERSION) {
    return {
      ok: false,
      error: `That workspace was saved by a newer Prism (format ${doc.version}, this build reads ${VERSION}). Update Prism, or export the collection instead.`
    }
  }

  return { ok: true, workspace: read(doc) }
}

function read(doc) {
  const collections = (Array.isArray(doc.collections) ? doc.collections : []).map(readCollection)
  const environments = (Array.isArray(doc.environments) ? doc.environments : []).map(readEnvironment)
  const known = new Set(environments.map((e) => e.id))

  return {
    name: String(doc.name ?? 'Workspace'),
    savedAt: String(doc.savedAt ?? ''),
    collections,
    environments,
    // A pointer to an environment that is no longer there would leave the app
    // reading values from nothing.
    envId: known.has(doc.activeEnvironment) ? doc.activeEnvironment : (environments[0]?.id ?? ''),
    layout: readLayout(doc.layout),
    moved: new Set((Array.isArray(doc.pinned) ? doc.pinned : []).map(String)),
    baselines: readBaselines(doc.baselines),
    history: (Array.isArray(doc.history) ? doc.history : []).slice(0, HISTORY_KEPT).map(readRun),
    runs: (Array.isArray(doc.runs) ? doc.runs : []).filter((r) => r && typeof r === 'object').slice(0, RUNS_KEPT).map((r) => runRecord(r)),
    schedules: (Array.isArray(doc.schedules) ? doc.schedules : []).filter((x) => x && typeof x === 'object' && x.target).slice(0, 50).map(readSchedule)
  }
}

/** A stored run, back in the shape the app holds. */
function readRun(raw) {
  return {
    id: `h_${String(raw?.at ?? 0)}_${String(raw?.requestId ?? '')}`,
    requestId: String(raw?.requestId ?? ''),
    name: String(raw?.name ?? ''),
    method: String(raw?.method ?? 'GET'),
    // The URL is not stored — it can hold a token in a query string, and the
    // request it belongs to still knows its own address.
    url: '',
    status: Number(raw?.status) || 0,
    ms: Number(raw?.ms) || 0,
    at: Number(raw?.at) || 0,
    env: String(raw?.env ?? ''),
    failed: Number(raw?.failed) || 0
  }
}

function readCollection(raw) {
  const col = emptyCollection(String(raw?.name ?? 'Collection'), [], String(raw?.source ?? 'prism'))
  if (typeof raw?.id === 'string') col.id = raw.id
  col.open = raw?.open !== false
  readLevel(col, raw)
  if (raw?.spec && typeof raw.spec === 'object' && raw.spec.paths && typeof raw.spec.paths === 'object') col.spec = raw.spec
  if (col.spec && raw?.specCheck === false) col.specCheck = false
  col.flows = (Array.isArray(raw?.flows) ? raw.flows : []).map((f) => {
    const flow = emptyFlow(String(f?.name ?? 'Flow'), (Array.isArray(f?.requests) ? f.requests : []).map(readRequest))
    if (typeof f?.id === 'string') flow.id = f.id
    flow.open = f?.open !== false
    readLevel(flow, f)
    return flow
  })
  return col
}

/** The inherited headers and auth, only when the file actually sets them. */
function readLevel(level, raw) {
  if (typeof raw?.description === 'string' && raw.description) level.description = raw.description
  if (Array.isArray(raw?.headers)) level.headers = toRows(raw.headers)
  if (raw?.auth && typeof raw.auth === 'object' && typeof raw.auth.kind === 'string') level.auth = { ...raw.auth }
}

function readRequest(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return emptyRequest({
    id: typeof r.id === 'string' ? r.id : uid('req'),
    name: String(r.name ?? 'Request'),
    method: String(r.method ?? 'GET').toUpperCase(),
    url: String(r.url ?? ''),
    query: toRows(r.query),
    pathParams: toRows(r.pathParams),
    headers: toRows(r.headers),
    auth: r.auth && typeof r.auth === 'object' ? { kind: 'none', ...r.auth } : { kind: 'none' },
    bodyKind: typeof r.bodyKind === 'string' ? r.bodyKind : 'none',
    body: typeof r.body === 'string' ? r.body : '',
    ...(typeof r.gqlVariables === 'string' && r.gqlVariables ? { gqlVariables: r.gqlVariables } : {}),
    ...(typeof r.description === 'string' && r.description ? { description: r.description } : {}),
    assertions: Array.isArray(r.assertions) ? r.assertions.filter(isAssertion) : [],
    captures: Array.isArray(r.captures) ? r.captures.filter((c) => c && typeof c === 'object').map(readCapture) : [],
    dataset: readDataset(r.dataset),
    scripts: {
      pre: typeof r.scripts?.pre === 'string' ? r.scripts.pre : '',
      test: typeof r.scripts?.test === 'string' ? r.scripts.test : ''
    },
    ...(r.kind === 'ws' || r.kind === 'sse' || r.kind === 'grpc' ? { kind: r.kind } : {}),
    ...(r.logic && typeof r.logic === 'object'
      ? { logic: { when: String(r.logic.when ?? ''), waitMs: Math.max(0, Number(r.logic.waitMs) || 0), each: String(r.logic.each ?? ''), until: String(r.logic.until ?? ''), everyMs: Math.max(100, Number(r.logic.everyMs) || 1000), tries: Math.max(1, Math.min(100, Number(r.logic.tries) || 10)), onFail: r.logic.onFail === 'stop' ? 'stop' : 'continue' } }
      : {}),
    ...(r.kind === 'grpc' && r.grpc && typeof r.grpc === 'object' ? { grpc: { proto: String(r.grpc.proto ?? ''), protoName: String(r.grpc.protoName ?? ''), service: String(r.grpc.service ?? ''), method: String(r.grpc.method ?? '') } } : {})
  })
}

const isAssertion = (a) => a && typeof a === 'object' && typeof a.subject === 'string' && typeof a.op === 'string'

const readCapture = (c) => ({
  id: typeof c.id === 'string' ? c.id : uid('cap'),
  name: String(c.name ?? ''),
  from: c.from === 'header' ? 'header' : 'body',
  path: String(c.path ?? '')
})

function readDataset(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows)) return null
  return {
    name: String(raw.name ?? 'Data'),
    columns: Array.isArray(raw.columns) ? raw.columns.map(String) : [],
    rows: raw.rows.filter((r) => r && typeof r === 'object')
  }
}

function readEnvironment(raw) {
  const values = {}
  if (raw?.values && typeof raw.values === 'object') {
    for (const [k, v] of Object.entries(raw.values)) values[k] = String(v ?? '')
  }
  const secrets = (Array.isArray(raw?.secrets) ? raw.secrets : []).map(String).filter((k) => k in values)
  return {
    id: typeof raw?.id === 'string' ? raw.id : uid('env'),
    name: String(raw?.name ?? 'Environment'),
    values,
    secrets
  }
}

function readLayout(raw) {
  const out = new Map()
  if (!raw || typeof raw !== 'object') return out
  for (const [id, at] of Object.entries(raw)) {
    if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) out.set(id, { x: at.x, y: at.y })
  }
  return out
}

function readBaselines(raw) {
  const out = new Map()
  if (!raw || typeof raw !== 'object') return out
  for (const [id, b] of Object.entries(raw)) {
    if (!b || typeof b !== 'object') continue
    out.set(id, {
      at: Number(b.at) || 0,
      status: Number(b.status) || 0,
      headers: b.headers && typeof b.headers === 'object' ? b.headers : {},
      json: b.json,
      body: typeof b.body === 'string' ? b.body : ''
    })
  }
  return out
}

/* ------------------------------------------------------------- comparing */

/**
 * The authored content of a workspace, as a string two copies can be compared
 * by.
 *
 * Needed to answer one question honestly: is the file on disk behind what is
 * on screen? Comparing the serialised documents directly cannot work, because
 * `serialise` stamps a fresh `savedAt` on every call — so every comparison
 * said "different", and a workspace restored straight after being saved came
 * back flagged as having unsaved changes.
 *
 * Two fields are left out:
 *
 *   - `savedAt`, which is when the write happened, not what was written.
 *   - `history` and `runs`, which are run measurements. Sending a request is not an edit
 *     to the workspace, and telling somebody their file is out of date because
 *     they pressed Send is the kind of false alarm that teaches people to
 *     ignore the real ones.
 *
 * Keys are sorted, so two documents that hold the same thing compare equal
 * even if a future version writes them in a different order.
 */
export function comparable(doc) {
  if (!doc || typeof doc !== 'object') return ''
  const { savedAt: _savedAt, history: _history, runs: _runs, ...authored } = doc
  return stableJson(authored)
}

/** JSON with object keys in a fixed order, so the text is a fingerprint. */
function stableJson(value) {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key])
  return out
}

/**
 * Whether a saved file still holds what is on screen.
 *
 * `fileText` is the raw text read back from disk; `current` is the document
 * `serialise` would write now. Unreadable or unparseable counts as different,
 * because a file that cannot be read certainly does not hold your work.
 */
export function matchesSaved(fileText, current) {
  try {
    return comparable(JSON.parse(String(fileText))) === comparable(current)
  } catch {
    return false
  }
}

/** How many requests a file holds, for the confirmation after opening one. */
export function countIn(workspace) {
  return (workspace.collections ?? []).reduce(
    (n, c) => n + c.flows.reduce((m, f) => m + f.requests.length, 0),
    0
  )
}

/** Names of secrets that came back empty, so the app can say what to refill. */
export function missingSecrets(workspace) {
  const out = []
  for (const env of workspace.environments ?? []) {
    for (const key of env.secrets ?? []) {
      if (!env.values[key]) out.push(`${env.name}.${key}`)
    }
  }
  return out
}
