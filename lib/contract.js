/**
 * Checking responses against an OpenAPI (or Swagger 2) document.
 *
 * Importing a spec builds requests from it; this keeps them honest afterwards.
 * Every response is matched to the operation the spec declares for it — by
 * method and path, whether the collection came from the spec or from Postman
 * — and checked for what the spec promises:
 *
 *   error  the status is not documented, the content type is not one the
 *          operation declares, the body does not match the schema, or a
 *          required header is missing
 *   warn   the body carries fields the schema does not mention, or a body
 *          the spec says there is none of
 *
 * Errors are what break a client and fail a check; warnings are what the
 * documentation has not caught up with yet, and are reported, not failed.
 */
import { validateSchema } from './assert.js'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

/**
 * What is kept of a document: the parts a check reads. Kept once per
 * collection, with the workspace, so a check needs no file and no network.
 */
export function prepareSpec(doc, fileName = '') {
  if (!doc || typeof doc !== 'object' || !doc.paths) return null
  return {
    file: fileName,
    title: String(doc.info?.title ?? fileName ?? 'API'),
    version: String(doc.info?.version ?? ''),
    openapi: doc.openapi ? String(doc.openapi) : undefined,
    swagger: doc.swagger ? String(doc.swagger) : undefined,
    servers: Array.isArray(doc.servers) ? doc.servers.map((s) => ({ url: String(s?.url ?? '') })) : undefined,
    basePath: doc.basePath ? String(doc.basePath) : undefined,
    produces: Array.isArray(doc.produces) ? doc.produces : undefined,
    paths: doc.paths,
    components: doc.components,
    definitions: doc.definitions,
    responses: doc.responses,
    parameters: doc.parameters
  }
}

/** Whatever a `$ref` points at in the document, followed until it stops. */
export function deref(spec, node, hops = 0) {
  if (!node || typeof node !== 'object' || typeof node.$ref !== 'string' || hops > 12) return node
  const ref = node.$ref
  if (!ref.startsWith('#/')) return node
  let out = spec
  for (const part of ref.slice(2).split('/')) {
    out = out?.[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))]
    if (out === undefined) return node
  }
  return deref(spec, out, hops + 1)
}

/** The path prefixes the spec's servers add before every route. */
function prefixes(spec) {
  const out = new Set([''])
  for (const s of spec.servers ?? []) {
    const url = String(s.url ?? '').replace(/\{[^}]+\}/g, 'x')
    try {
      const p = new URL(url, 'http://h').pathname.replace(/\/+$/, '')
      if (p && p !== '/') out.add(p)
    } catch {
      /* a server URL that does not parse adds no prefix */
    }
  }
  if (spec.basePath && spec.basePath !== '/') out.add(spec.basePath.replace(/\/+$/, ''))
  return [...out].sort((a, b) => b.length - a.length)
}

/** The path of a request URL as written, without host, variables-as-host or query. */
export function pathOf(url) {
  let u = String(url ?? '').trim()
  u = u.split('#')[0].split('?')[0]
  // {{base_url}}/users — the host is a variable.
  u = u.replace(/^\{\{[^}]+\}\}/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    const rest = u.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    u = rest
  }
  if (!u.startsWith('/')) u = `/${u}`
  return u.replace(/\/+$/, '') || '/'
}

const isVar = (seg) => seg.startsWith(':') || seg.includes('{{')
const isParam = (seg) => /^\{[^}]+\}$/.test(seg)

function scoreRoute(route, segs) {
  const parts = route.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length !== segs.length) return -1
  let score = 0
  for (let i = 0; i < parts.length; i += 1) {
    const r = parts[i]
    const s = segs[i]
    if (isParam(r)) score += 1
    else if (r === s) score += 3
    else if (isVar(s)) score += 0
    else return -1
  }
  return score
}

/**
 * The operation a request is an instance of: `{ route, method, op }`, or null.
 * The route's {params} match anything; a request's :params and {{variables}}
 * match a param, and at a pinch a literal.
 */
export function matchOperation(spec, method, url) {
  if (!spec?.paths) return null
  const m = String(method ?? 'GET').toLowerCase()
  const path = pathOf(url)
  let best = null
  for (const prefix of prefixes(spec)) {
    if (prefix && !(path === prefix || path.startsWith(`${prefix}/`))) continue
    const rest = path.slice(prefix.length) || '/'
    const segs = rest.split('/').filter(Boolean)
    for (const [route, item] of Object.entries(spec.paths)) {
      const op = item?.[m]
      if (!op || typeof op !== 'object') continue
      const score = scoreRoute(route, segs)
      if (score < 0) continue
      if (!best || score > best.score) best = { route, method: m, op, item, score }
    }
    if (best) break
  }
  return best ? { route: best.route, method: best.method, op: best.op, item: best.item } : null
}

/** The documented response for a status: exact, then 2XX, then default. */
export function responseFor(spec, op, status) {
  const all = op?.responses ?? {}
  const code = String(status)
  const key = Object.keys(all).find((k) => k === code) ?? Object.keys(all).find((k) => k.toUpperCase() === `${code[0]}XX`) ?? (all.default ? 'default' : null)
  return key ? { key, response: deref(spec, all[key]) } : null
}

const mediaOf = (headers = {}) => {
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
  return String(Array.isArray(raw) ? raw[0] : raw ?? '').split(';')[0].trim().toLowerCase()
}

/** Whether a media type is covered by a declared one: exact, `type/*`, `*\/*`. */
function covers(declared, actual) {
  const d = declared.split(';')[0].trim().toLowerCase()
  if (d === actual || d === '*/*') return true
  if (d.endsWith('/*') && actual.startsWith(d.slice(0, -1))) return true
  return false
}

/** A schema with its references resolvable against the whole document. */
function rooted(spec, schema) {
  return { ...schema, components: spec.components, definitions: spec.definitions }
}

/** Fields in a value that its schema never mentions — documentation lagging behind. */
export function undocumented(spec, schema, value, at = '$', out = [], depth = 0) {
  if (out.length >= 40 || depth > 10 || value === null || typeof value !== 'object') return out
  let s = deref(spec, schema)
  if (!s || typeof s !== 'object') return out
  // allOf is one object written in parts; its properties are the union.
  if (Array.isArray(s.allOf)) {
    const merged = { type: 'object', properties: {}, additionalProperties: undefined }
    for (const part of s.allOf.map((p) => deref(spec, p))) {
      Object.assign(merged.properties, part?.properties ?? {})
      if (part?.additionalProperties !== undefined) merged.additionalProperties = part.additionalProperties
    }
    s = { ...s, ...merged }
  }
  // With oneOf/anyOf the right branch is not known here; stay quiet rather than guess.
  if (s.oneOf || s.anyOf) return out
  if (Array.isArray(value)) {
    if (s.items) value.slice(0, 20).forEach((v, i) => undocumented(spec, s.items, v, `${at}[${i}]`, out, depth + 1))
    return out
  }
  if (!s.properties) return out
  const extraAllowed = s.additionalProperties && typeof s.additionalProperties === 'object'
  for (const [key, v] of Object.entries(value)) {
    const path = `${at}.${key}`
    if (Object.prototype.hasOwnProperty.call(s.properties, key)) undocumented(spec, s.properties[key], v, path, out, depth + 1)
    else if (extraAllowed) undocumented(spec, s.additionalProperties, v, path, out, depth + 1)
    else if (s.additionalProperties !== false && !out.some((p) => p === path)) out.push(path)
  }
  return out
}

/**
 * One response against the spec.
 * @param response {status, headers, body, json}
 * @returns {{ matched, route?, method?, summary?, documented, findings: {level, code, message, path?}[] }}
 */
export function checkResponse(spec, method, url, response) {
  const match = matchOperation(spec, method, url)
  if (!match) return { matched: false, documented: [], findings: [{ level: 'warn', code: 'no-operation', message: `${String(method).toUpperCase()} ${pathOf(url)} is not in the spec` }] }
  const { op, route } = match
  const findings = []
  const documented = Object.keys(op.responses ?? {})
  const base = { matched: true, route, method: match.method, summary: String(op.summary ?? op.operationId ?? ''), operationId: op.operationId, documented, findings }
  if (!response || response.error) return base

  const status = Number(response.status) || 0
  const found = responseFor(spec, op, status)
  if (!found) {
    findings.push({ level: 'error', code: 'status', message: `Status ${status} is not documented — the spec lists ${documented.join(', ') || 'none'}` })
    return base
  }
  const doc = found.response ?? {}
  const media = mediaOf(response.headers)
  const body = String(response.body ?? '')
  const hasBody = body.trim().length > 0

  // Where the body's shape is declared: OpenAPI 3 per media type, Swagger 2 once.
  let schema
  if (doc.content && typeof doc.content === 'object') {
    const types = Object.keys(doc.content)
    if (hasBody) {
      const key = types.find((t) => covers(t, media))
      if (!key) findings.push({ level: 'error', code: 'content-type', message: `Content type ${media || 'none'} is not documented for ${found.key} — the spec lists ${types.join(', ')}` })
      else schema = doc.content[key]?.schema
    }
  } else if (doc.schema) {
    const produces = op.produces ?? spec.produces
    if (hasBody && Array.isArray(produces) && produces.length && !produces.some((t) => covers(t, media))) {
      findings.push({ level: 'error', code: 'content-type', message: `Content type ${media || 'none'} is not one the operation produces — ${produces.join(', ')}` })
    }
    schema = doc.schema
  } else if (hasBody && status !== 204 && !(doc.content && Object.keys(doc.content).length)) {
    findings.push({ level: 'warn', code: 'body', message: `The spec documents no body for ${found.key}, and one came back` })
  }

  if (schema && hasBody) {
    let value = response.json
    if (value === undefined && /json/.test(media)) {
      try {
        value = JSON.parse(body)
      } catch {
        findings.push({ level: 'error', code: 'json', message: 'The body is not valid JSON' })
      }
    }
    if (value !== undefined) {
      for (const e of validateSchema(rooted(spec, schema), value).slice(0, 30)) {
        findings.push({ level: 'error', code: 'schema', path: e.path, message: `${e.path} ${e.message}` })
      }
      for (const path of undocumented(spec, schema, value)) {
        findings.push({ level: 'warn', code: 'undocumented', path, message: `${path} is not in the spec` })
      }
    }
  }

  // Headers the spec says are always there.
  for (const [name, h] of Object.entries(doc.headers ?? {})) {
    const header = deref(spec, h)
    if (header?.required !== true) continue
    if (!Object.keys(response.headers ?? {}).some((k) => k.toLowerCase() === name.toLowerCase())) {
      findings.push({ level: 'error', code: 'header', message: `Required header ${name} is missing` })
    }
  }
  return base
}

/** Every operation the spec declares. */
export function operations(spec) {
  const out = []
  for (const [route, item] of Object.entries(spec?.paths ?? {})) {
    for (const m of METHODS) {
      const op = item?.[m]
      if (op && typeof op === 'object') out.push({ method: m, route, summary: String(op.summary ?? op.operationId ?? ''), statuses: Object.keys(op.responses ?? {}) })
    }
  }
  return out
}

/**
 * How much of the spec a set of checked responses exercised.
 * `hits` are `{ method, route, status }` from checkResponse results.
 */
export function coverage(spec, hits = []) {
  const ops = operations(spec).map((o) => {
    const mine = hits.filter((h) => h.method === o.method && h.route === o.route)
    const seen = new Set(mine.map((h) => String(h.status)))
    return {
      ...o,
      called: mine.length > 0,
      statuses: o.statuses.map((code) => ({ code, hit: [...seen].some((s) => s === code || (code.toUpperCase().endsWith('XX') && s[0] === code[0])) }))
    }
  })
  const called = ops.filter((o) => o.called).length
  return { operations: ops, total: ops.length, called, share: ops.length ? called / ops.length : 0 }
}
