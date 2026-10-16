/**
 * Reading somebody else's collection.
 *
 * Prism holds one shape internally — a flow of requests, each with rows for
 * query, path, headers, an auth block and a body. Everything imported is
 * translated into that shape here, and nowhere else, so the rest of the app
 * never has to ask where a request came from.
 *
 * Four sources are understood: a Postman collection (v2.1 or v2.0) or a
 * Postman environment, an OpenAPI or Swagger document, and a browser's HAR
 * export. A cURL command is read separately, in curl.js.
 *
 * Every one of them is somebody's file on disk, possibly hand-edited and
 * possibly written by an older build. Nothing in here may throw on bad input:
 * an import that fails has to say what it could not read, not take the window
 * down. `readCollection` is total — it always returns a result object, and
 * the caller decides what to show.
 */

import { isOpenApi, readOpenApi } from './openapi.js'
import { isHar, readHar } from './har.js'
import { load as loadYaml } from './vendor/js-yaml.js'

let seq = 0
export const uid = (prefix = 'id') => `${prefix}-${(seq += 1).toString(36)}-${Date.now().toString(36)}`

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/* ------------------------------------------------------------------ shapes */

export function row(key = '', value = '', on = true) {
  return { id: uid('row'), key: String(key ?? ''), value: String(value ?? ''), on: on !== false }
}

export function emptyRequest(over = {}) {
  return {
    id: uid('req'),
    name: 'New request',
    method: 'GET',
    url: '',
    query: [],
    pathParams: [],
    headers: [],
    auth: { kind: 'none' },
    bodyKind: 'none',
    body: '',
    assertions: [],
    captures: [],
    // JavaScript run before the request is sent and after the response comes
    // back, with Postman's `pm` object; see lib/script-runtime.js.
    scripts: { pre: '', test: '' },
    ...over
  }
}

export function emptyFlow(name = 'New flow', requests = []) {
  return { id: uid('flow'), name, requests, open: true }
}

/**
 * A collection: the thing a Postman file or an OpenAPI document actually is.
 *
 * Three levels, not two. A Postman collection with four folders used to arrive
 * as four unrelated flows and the collection itself vanished — which is wrong
 * twice over: you could not tell where a flow came from, and re-exporting put
 * it back as something with a different shape from the file you opened.
 */
export function emptyCollection(name = 'New collection', flows = [], source = 'canvas') {
  return { id: uid('col'), name, source, flows, open: true }
}

/* ------------------------------------------------------------ small helpers */

/** Splits `a=1&b=2` into rows, tolerating a malformed escape. */
export function queryRows(search) {
  return String(search || '')
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf('=')
      const key = at < 0 ? pair : pair.slice(0, at)
      const value = at < 0 ? '' : pair.slice(at + 1)
      return row(decodePlus(key), decodePlus(value))
    })
}

function decodePlus(text) {
  try {
    return decodeURIComponent(String(text).replace(/\+/g, ' '))
  } catch {
    return String(text)
  }
}

/**
 * A URL short enough to read in a list: no scheme, no host, no query. A
 * leading variable such as {{base_url}} is kept, because it is the part that
 * says which environment decides where the request goes.
 */
export function shortPath(url) {
  const text = String(url ?? '').split('?')[0]
  if (!text || text.startsWith('{{')) return text || '/'
  try {
    return new URL(text).pathname || '/'
  } catch {
    return text
  }
}

export function splitUrl(url) {
  const text = String(url ?? '')
  const at = text.indexOf('?')
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)]
}

/** Rows out of an object, an array of rows, or nothing at all. */
export function toRows(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) =>
        row(
          item.key ?? item.name ?? '',
          item.value ?? '',
          item.on !== false && item.enabled !== false && item.disabled !== true
        )
      )
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, v]) => row(key, v))
  }
  return []
}

const JSON_TYPE = /json/i
const FORM_TYPE = /x-www-form-urlencoded/i
const XML_TYPE = /xml/i
const MULTIPART = /multipart\/form-data/i

export function bodyKindFor(contentType, body) {
  if (!body) return 'none'
  const type = String(contentType || '')
  if (JSON_TYPE.test(type)) return 'json'
  if (FORM_TYPE.test(type)) return 'urlencoded'
  if (XML_TYPE.test(type)) return 'xml'
  if (MULTIPART.test(type)) return 'form'
  // Nothing declared. A body that parses as JSON almost certainly is.
  if (!type && looksLikeJson(body)) return 'json'
  return 'raw'
}

function looksLikeJson(text) {
  const trimmed = String(text).trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function headerValue(rows, name) {
  const found = rows.find((r) => r.key.toLowerCase() === name.toLowerCase())
  return found ? found.value : ''
}

function normaliseMethod(method) {
  const upper = String(method || 'GET').toUpperCase()
  return METHODS.includes(upper) ? upper : 'GET'
}


/* ------------------------------------------------------ source 3: Postman */

/**
 * A Postman collection, v2.1 or v2.0.
 *
 * Folders become flows. Postman allows arbitrary nesting; Prism has exactly
 * one level, so a nested folder's path is flattened into the flow name rather
 * than being silently dropped.
 */
export function fromPostman(doc) {
  const flows = []
  const loose = []

  // Auth set on a folder applies to everything inside it, nested folders
  // included. Prism flattens nesting into one flow level, so each flow carries
  // the nearest folder auth above it; the collection's own goes on the
  // collection. Without this, the common Postman setup -- a token set once on
  // the collection -- imported as forty requests that sent no auth at all.
  const flowWith = (name, requests, auth) => {
    const flow = emptyFlow(name, requests)
    if (auth) flow.auth = auth
    return flow
  }
  const folderAuth = (item, above) => (item.auth && typeof item.auth === 'object' ? postmanAuth(item.auth) : above)

  const walk = (items, trail) => {
    for (const item of items ?? []) {
      if (!item || typeof item !== 'object') continue
      if (Array.isArray(item.item)) {
        const name = [...trail, String(item.name || 'Folder')].join(' / ')
        const auth = folderAuth(item, null)
        const nested = []
        walkInto(item.item, name, nested, auth)
        if (nested.length) flows.push(flowWith(name, nested, auth))
      } else if (item.request) {
        loose.push(fromPostmanItem(item))
      }
    }
  }

  const walkInto = (items, name, out, above) => {
    for (const item of items ?? []) {
      if (!item || typeof item !== 'object') continue
      if (Array.isArray(item.item)) {
        const deeper = [...name.split(' / '), String(item.name || 'Folder')].join(' / ')
        const auth = folderAuth(item, above)
        const nested = []
        walkInto(item.item, deeper, nested, auth)
        if (nested.length) flows.push(flowWith(deeper, nested, auth))
      } else if (item.request) {
        out.push(fromPostmanItem(item))
      }
    }
  }

  walk(doc?.item, [])

  const name = String(doc?.info?.name || 'Postman collection')
  // Requests sitting at the top level of the collection belong to the
  // collection, not to a folder. They get one so they are not orphaned.
  if (loose.length) flows.unshift(emptyFlow('Ungrouped', loose))
  const auth = doc?.auth && typeof doc.auth === 'object' ? postmanAuth(doc.auth) : null
  return { name, flows, auth, environments: postmanVariables(doc, name) }
}

function postmanVariables(doc, name) {
  const vars = Array.isArray(doc?.variable) ? doc.variable : []
  if (!vars.length) return []
  const values = {}
  for (const v of vars) {
    if (v && typeof v === 'object' && v.key) values[String(v.key)] = String(v.value ?? '')
  }
  return Object.keys(values).length ? [{ id: uid('env'), name: `${name} variables`, values, secrets: [] }] : []
}

function fromPostmanItem(item) {
  const req = item.request ?? {}
  const headers = toRows(req.header).filter((h) => h.key)
  const [bare, search] = urlOf(req.url)
  const bodyText = postmanBody(req.body)
  const declared = headerValue(headers, 'content-type')

  return emptyRequest({
    name: String(item.name || 'Request'),
    method: normaliseMethod(req.method),
    url: bare,
    query: postmanQuery(req.url, search),
    pathParams: postmanPathVars(req.url),
    headers,
    // No auth block is Postman's "inherit from parent", not "none" -- an
    // explicit `noauth` is how Postman says none.
    auth: req.auth && typeof req.auth === 'object' ? postmanAuth(req.auth) : { kind: 'inherit' },
    bodyKind: postmanBodyKind(req.body, declared, bodyText),
    body: bodyText,
    scripts: { pre: postmanScript(item, 'prerequest'), test: postmanScript(item, 'test') }
  })
}

/** The text of one of an item's Postman scripts, `prerequest` or `test`. */
function postmanScript(item, listen) {
  return (Array.isArray(item?.event) ? item.event : [])
    .filter((e) => e && e.listen === listen)
    .map((e) => (Array.isArray(e.script?.exec) ? e.script.exec.join('\n') : String(e.script?.exec ?? '')))
    .join('\n')
    .trim()
}

function urlOf(url) {
  if (typeof url === 'string') return splitUrl(url)
  if (url && typeof url === 'object') {
    if (typeof url.raw === 'string' && url.raw) return splitUrl(url.raw)
    // Postman can store the URL in pieces with no raw form at all.
    const host = Array.isArray(url.host) ? url.host.join('.') : String(url.host ?? '')
    const path = Array.isArray(url.path) ? url.path.join('/') : String(url.path ?? '')
    const scheme = url.protocol ? `${url.protocol}://` : ''
    const port = url.port ? `:${url.port}` : ''
    return [`${scheme}${host}${port}${path ? `/${path}` : ''}`, '']
  }
  return ['', '']
}

function postmanQuery(url, search) {
  if (url && typeof url === 'object' && Array.isArray(url.query)) {
    return url.query
      .filter((q) => q && typeof q === 'object')
      .map((q) => row(q.key ?? '', q.value ?? '', q.disabled !== true))
  }
  return queryRows(search)
}

function postmanPathVars(url) {
  if (!url || typeof url !== 'object' || !Array.isArray(url.variable)) return []
  return url.variable.filter((v) => v && v.key).map((v) => row(v.key, v.value ?? ''))
}

function postmanBody(body) {
  if (!body || typeof body !== 'object') return ''
  if (typeof body.raw === 'string') return body.raw
  if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
    return body.urlencoded
      .filter((p) => p && p.key && p.disabled !== true)
      .map((p) => `${p.key}=${p.value ?? ''}`)
      .join('\n')
  }
  if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
    return body.formdata
      .filter((p) => p && p.key && p.disabled !== true)
      .map((p) => `${p.key}=${p.value ?? ''}`)
      .join('\n')
  }
  if (body.mode === 'graphql' && body.graphql) {
    return JSON.stringify({ query: body.graphql.query ?? '', variables: safeParse(body.graphql.variables) ?? {} }, null, 2)
  }
  return ''
}

function postmanBodyKind(body, declared, text) {
  if (!body || typeof body !== 'object' || !text) return 'none'
  if (body.mode === 'graphql') return 'graphql'
  if (body.mode === 'urlencoded') return 'urlencoded'
  if (body.mode === 'formdata') return 'form'
  const language = body.options?.raw?.language
  if (language === 'json') return 'json'
  if (language === 'xml') return 'xml'
  return bodyKindFor(declared, text)
}

function postmanAuth(auth) {
  if (!auth || typeof auth !== 'object') return { kind: 'none' }
  const pick = (list, key) => {
    const found = (Array.isArray(list) ? list : []).find((x) => x && x.key === key)
    return found ? String(found.value ?? '') : ''
  }
  switch (auth.type) {
    case 'bearer':
      return { kind: 'bearer', token: pick(auth.bearer, 'token') }
    case 'basic':
      return { kind: 'basic', username: pick(auth.basic, 'username'), password: pick(auth.basic, 'password') }
    case 'apikey':
      return {
        kind: 'apiKey',
        keyName: pick(auth.apikey, 'key'),
        token: pick(auth.apikey, 'value'),
        keyIn: pick(auth.apikey, 'in') === 'query' ? 'query' : 'header'
      }
    case 'oauth2':
      return { kind: 'oauth2', token: pick(auth.oauth2, 'accessToken') }
    case 'noauth':
      return { kind: 'none' }
    default:
      return auth.type ? { kind: 'custom' } : { kind: 'none' }
  }
}

/**
 * Assertions recovered from a Postman test script.
 *
 * Postman tests are JavaScript, so this reads the handful of shapes that make
 * up most real scripts and leaves the rest. Anything not recognised is not
 * invented — a collection that imports with two of its five checks is honest;
 * one that imports with five checks it does not actually perform is not.
 */
export function postmanTests(item) {
  const scripts = (Array.isArray(item?.event) ? item.event : [])
    .filter((e) => e && e.listen === 'test')
    .map((e) => (Array.isArray(e.script?.exec) ? e.script.exec.join('\n') : String(e.script?.exec ?? '')))
    .join('\n')
  if (!scripts) return []

  const out = []
  const add = (subject, op, value, path = '') => out.push({ id: uid('as'), subject, path, op, value: String(value), on: true })

  for (const m of scripts.matchAll(/\.to\.have\.status\(\s*(\d{3})\s*\)/g)) add('status', 'equals', m[1])
  for (const m of scripts.matchAll(/response\.code\s*(?:===?|to\.eql)\s*\(?\s*(\d{3})/g)) add('status', 'equals', m[1])
  for (const m of scripts.matchAll(/responseTime\)?\.to\.be\.below\(\s*(\d+)\s*\)/g)) add('time', 'lessThan', m[1])
  for (const m of scripts.matchAll(/\.to\.include\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) add('body', 'contains', m[1])
  for (const m of scripts.matchAll(/pm\.response\.json\(\)([.\w[\]'"]+)\s*\)?\.to\.eql\(\s*['"`]?([^'"`)]+)['"`]?\s*\)/g)) {
    add('json', 'equals', m[2].trim(), m[1].replace(/^\./, '').replace(/\['?([^\]']+)'?\]/g, '.$1'))
  }

  // Deduplicated: the same check written twice in one script is one assertion.
  const seen = new Set()
  return out.filter((a) => {
    const key = `${a.subject}|${a.op}|${a.path}|${a.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ the front door */

/**
 * Works out what a file is and reads it.
 *
 * Never throws. Returns `{ ok: false, error }` for anything it cannot make
 * sense of, with a message that says what was expected — an import is the
 * first thing a new user does and a bare "unexpected token" teaches nothing.
 */
export function readCollection(text, fileName = '') {
  let doc
  try {
    doc = JSON.parse(String(text))
  } catch (err) {
    // OpenAPI is written in YAML as often as JSON. Anything that is not JSON
    // gets a second reading as YAML before it is turned away.
    const yamlish = /\.ya?ml$/i.test(fileName) || !/^\s*[[{]/.test(String(text))
    if (!yamlish) return { ok: false, error: `${fileName || 'That file'} is not valid JSON — ${err.message}` }
    try {
      doc = loadYaml(String(text))
    } catch (yerr) {
      return { ok: false, error: `${fileName || 'That file'} is neither JSON nor YAML — ${String(yerr.reason || yerr.message).split('\n')[0]}` }
    }
  }
  if (!doc || typeof doc !== 'object') {
    return { ok: false, error: 'That file holds a value, not a collection.' }
  }

  // An OpenAPI or Swagger document.
  if (isOpenApi(doc)) return readOpenApi(doc, fileName)
  if (isHar(doc)) return readHar(doc, fileName)

  // A Postman collection.
  if (doc.info && Array.isArray(doc.item)) {
    const schema = String(doc.info.schema ?? '')
    if (schema && !/v2\.[01]/.test(schema)) {
      return {
        ok: false,
        error: `Prism reads Postman v2.0 and v2.1 collections. This one says it is "${schema}" — re-export it from Postman as v2.1.`
      }
    }
    const parsed = fromPostman(doc)
    if (!parsed.flows.length) return { ok: false, error: 'That collection has no requests in it.' }
    return {
      ok: true,
      source: 'postman',
      ...parsed,
      collection: Object.assign(emptyCollection(parsed.name, parsed.flows, 'postman'), parsed.auth ? { auth: parsed.auth } : {})
    }
  }

  if (Array.isArray(doc.values) && doc.name) {
    // A Postman environment export, which people do reach for by mistake.
    const values = {}
    for (const v of doc.values) if (v && v.key) values[String(v.key)] = String(v.value ?? '')
    return {
      ok: true,
      source: 'postman-environment',
      name: String(doc.name),
      collection: null,
      flows: [],
      environments: [{ id: uid('env'), name: String(doc.name), values, secrets: [] }]
    }
  }

  return {
    ok: false,
    error: 'Prism did not recognise that file. It reads a Postman collection or environment (v2.0 or v2.1), an OpenAPI or Swagger document, or a HAR file.'
  }
}

/** How many requests an import actually brought in, for the confirmation. */
export function countRequests(result) {
  return (result.flows ?? []).reduce((n, f) => n + f.requests.length, 0)
}

/** Every request under a collection, in order. */
export function requestsIn(collection) {
  return (collection?.flows ?? []).flatMap((f) => f.requests)
}
