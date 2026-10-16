/**
 * The mock server's mind: which route a call is, and what to answer.
 *
 * Front-end work waits on back-ends that are not built yet, or are down, or
 * are rate-limited. Prism already holds what the API says — every response it
 * has seen, the baselines that were frozen, and often the OpenAPI document —
 * so it can answer in the API's place, on this machine, with no account.
 *
 * Each request in a collection becomes a route. It answers, in order:
 *
 *   baseline  the response frozen as the agreed shape
 *   last      the last response this session saw
 *   spec      an example from the OpenAPI document
 *
 * and an operation the spec declares that no request covers is a route too.
 * Pure: the HTTP server around it lives in main.cjs.
 */
import { pathOf, deref, responseFor } from './contract.js'

const PARAM = /^:|^\{[^}]+\}$|\{\{/

/** A URL as written, as a list of literal and wildcard segments. */
export function patternOf(url) {
  const path = pathOf(url)
  const segs = path
    .split('/')
    .filter(Boolean)
    .map((seg) => (PARAM.test(seg) ? { param: seg.replace(/^:|[{}]/g, '') } : { lit: decodeURIComponent(seg) }))
  return { path, segs }
}

const shown = (segs) => `/${segs.map((s) => (s.lit !== undefined ? s.lit : `:${s.param}`)).join('/')}`

/** Headers worth replaying: not the ones that describe the old connection. */
const DROP = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'date', 'content-encoding', 'set-cookie', 'strict-transport-security', 'alt-svc'])
export function replayHeaders(headers = {}) {
  const out = {}
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (!DROP.has(k.toLowerCase())) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

/* -------------------------------------------------------- spec examples */

const FORMAT = {
  email: 'user@example.com',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  'date-time': '2026-01-01T09:00:00Z',
  date: '2026-01-01',
  time: '09:00:00',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  byte: 'cHJpc20=',
  password: '••••••••'
}

/**
 * A plausible value for a schema: its example, default or first enum where
 * the spec gives one, else something of the right type and format.
 */
export function exampleOf(spec, schema, depth = 0, key = '') {
  const s = deref(spec, schema)
  if (!s || typeof s !== 'object' || depth > 8) return null
  if (s.example !== undefined) return s.example
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0]
  if (s.default !== undefined) return s.default
  if (s.const !== undefined) return s.const
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0]
  if (Array.isArray(s.allOf)) return Object.assign({}, ...s.allOf.map((p) => exampleOf(spec, p, depth + 1, key)).filter((v) => v && typeof v === 'object'))
  const alt = s.oneOf ?? s.anyOf
  if (Array.isArray(alt) && alt.length) return exampleOf(spec, alt[0], depth + 1, key)
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type ?? (s.properties ? 'object' : s.items ? 'array' : 'string')
  switch (type) {
    case 'object': {
      const out = {}
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = exampleOf(spec, v, depth + 1, k)
      return out
    }
    case 'array':
      return s.items ? [exampleOf(spec, s.items, depth + 1, key)] : []
    case 'integer':
      return s.minimum !== undefined ? Math.ceil(s.minimum) : /id$/i.test(key) ? 1 : 0
    case 'number':
      return s.minimum !== undefined ? s.minimum : 0
    case 'boolean':
      return true
    default:
      if (s.format && FORMAT[s.format]) return FORMAT[s.format]
      if (/email/i.test(key)) return FORMAT.email
      if (/(^|_)id$|Id$/.test(key)) return `${key || 'id'}_1`
      return key ? `${key}` : 'string'
  }
}

/** What the spec says an operation answers, as an example response. */
export function specResponse(spec, op) {
  const codes = Object.keys(op?.responses ?? {})
  const code = codes.find((c) => /^2\d\d$/.test(c)) ?? codes.find((c) => /^2XX$/i.test(c)) ?? codes.find((c) => /^\d{3}$/.test(c)) ?? 'default'
  const found = responseFor(spec, op, /^\d{3}$/.test(code) ? Number(code) : 200)
  const doc = found?.response ?? {}
  const status = /^\d{3}$/.test(code) ? Number(code) : 200
  if (doc.content && typeof doc.content === 'object') {
    const type = Object.keys(doc.content).find((t) => /json/.test(t)) ?? Object.keys(doc.content)[0]
    const media = doc.content[type] ?? {}
    let value = media.example
    if (value === undefined && media.examples && typeof media.examples === 'object') value = deref(spec, Object.values(media.examples)[0])?.value
    if (value === undefined && media.schema) value = exampleOf(spec, media.schema)
    if (value === undefined) return { status, headers: {}, body: '' }
    return { status, headers: { 'content-type': type || 'application/json' }, body: typeof value === 'string' && !/json/.test(type) ? value : JSON.stringify(value, null, 2) }
  }
  if (doc.schema || doc.examples) {
    const ex = doc.examples?.['application/json']
    const value = ex !== undefined ? ex : exampleOf(spec, doc.schema)
    return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value, null, 2) }
  }
  return { status, headers: {}, body: '' }
}

/* ------------------------------------------------------------- routes */

/**
 * Every route the server answers.
 * @param requests [{ id, name, method, url, baseline?, last? }] — baseline and
 *   last are `{ status, headers, body }`.
 * @param spec an attached OpenAPI document, or null
 * @param prefer 'baseline' (baseline, then last) or 'last' (last, then baseline)
 */
export function buildRoutes({ requests = [], spec = null, prefer = 'baseline' } = {}) {
  const routes = []
  const seen = new Set()
  for (const r of requests) {
    const method = String(r.method || 'GET').toUpperCase()
    const { segs } = patternOf(r.url)
    const key = `${method} ${shown(segs)}`
    if (seen.has(key)) continue
    const order = prefer === 'last' ? ['last', 'baseline'] : ['baseline', 'last']
    let source = order.find((k) => r[k])
    let answer = source ? r[source] : null
    if (!answer && spec) {
      const op = findOperation(spec, method, segs)
      if (op) {
        source = 'spec'
        answer = specResponse(spec, op)
      }
    }
    seen.add(key)
    routes.push({
      id: r.id,
      name: r.name || key,
      method,
      segs,
      path: shown(segs),
      source: source ?? 'none',
      status: answer?.status ?? 501,
      headers: answer ? replayHeaders(answer.headers) : { 'content-type': 'application/json' },
      body: answer ? String(answer.body ?? '') : JSON.stringify({ error: 'not_recorded', message: `No response recorded for ${r.name || key} yet — send it once in Prism, or attach an OpenAPI spec.` }, null, 2)
    })
  }
  // The rest of the spec: operations no request covers, answered from the spec.
  for (const [route, item] of Object.entries(spec?.paths ?? {})) {
    for (const m of ['get', 'put', 'post', 'delete', 'patch', 'head', 'options']) {
      const op = item?.[m]
      if (!op || typeof op !== 'object') continue
      const segs = route.split('/').filter(Boolean).map((seg) => (PARAM.test(seg) ? { param: seg.replace(/[{}]/g, '') } : { lit: seg }))
      const key = `${m.toUpperCase()} ${shown(segs)}`
      // A request already covers it when the patterns line up, whatever the params are called.
      if ([...seen].some((k) => sameShape(k, key))) continue
      seen.add(key)
      const answer = specResponse(spec, op)
      routes.push({ id: `spec:${m}:${route}`, name: String(op.summary ?? op.operationId ?? `${m.toUpperCase()} ${route}`), method: m.toUpperCase(), segs, path: shown(segs), source: 'spec', status: answer.status, headers: replayHeaders(answer.headers), body: answer.body })
    }
  }
  return routes
}

function sameShape(a, b) {
  const norm = (k) => k.replace(/\/:[^/]+/g, '/:p')
  return norm(a) === norm(b)
}

function findOperation(spec, method, segs) {
  const m = method.toLowerCase()
  for (const [route, item] of Object.entries(spec.paths ?? {})) {
    const op = item?.[m]
    if (!op) continue
    const parts = route.split('/').filter(Boolean)
    if (parts.length !== segs.length) continue
    if (parts.every((p, i) => PARAM.test(p) || segs[i].param !== undefined || segs[i].lit === p)) return op
  }
  return null
}

/** The route for a call: the most literal match wins. `{ route, params }`, or null. */
export function matchRoute(routes, method, rawPath) {
  const m = String(method).toUpperCase()
  const segs = String(rawPath ?? '/').split('?')[0].split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
  let best = null
  for (const route of routes) {
    if (route.method !== m && !(m === 'HEAD' && route.method === 'GET')) continue
    if (route.segs.length !== segs.length) continue
    let score = 0
    const params = {}
    let ok = true
    for (let i = 0; i < segs.length; i += 1) {
      const s = route.segs[i]
      if (s.lit !== undefined) {
        if (s.lit !== segs[i]) {
          ok = false
          break
        }
        score += 2
      } else {
        params[s.param] = segs[i]
        score += 1
      }
    }
    if (ok && (!best || score > best.score || (score === best.score && route.source !== 'spec' && best.route.source === 'spec'))) best = { route, params, score }
  }
  return best ? { route: best.route, params: best.params } : null
}

/**
 * The whole answer to one call: status, headers and body, with CORS so a
 * front end on another port can use it, and a header naming the source.
 */
export function answer(routes, { method, url, cors = true, origin = '' }) {
  const path = String(url ?? '/').split('?')[0] || '/'
  const corsHeaders = cors
    ? { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*', vary: 'Origin' }
    : {}
  if (String(method).toUpperCase() === 'OPTIONS' && cors) {
    const own = matchRoute(routes, 'OPTIONS', path)
    if (!own) return { status: 204, headers: corsHeaders, body: '', route: null }
  }
  const hit = matchRoute(routes, method, path)
  if (!hit) {
    return {
      status: 404,
      headers: { 'content-type': 'application/json', ...corsHeaders, 'x-prism-mock': 'none' },
      body: JSON.stringify({ error: 'no_mock', message: `Nothing is mocked at ${String(method).toUpperCase()} ${path}`, routes: routes.slice(0, 50).map((r) => `${r.method} ${r.path}`) }, null, 2),
      route: null
    }
  }
  const { route } = hit
  return {
    status: route.status,
    headers: { ...route.headers, ...corsHeaders, 'x-prism-mock': route.source },
    body: String(method).toUpperCase() === 'HEAD' ? '' : route.body,
    route
  }
}
