/**
 * Scripts: pre-request and test scripts in JavaScript, with a Postman-style
 * `pm` object.
 *
 * JavaScript, because it is the language API people already write in, and
 * because a script copied from Postman — or carried in a Postman collection
 * someone imports — then runs as it is. `pm` is the Postman API, `prism` is
 * the same object by Prism's own name, and the older Postman forms
 * (`tests["…"] = …`, `postman.setEnvironmentVariable`, `responseBody`) work
 * too, so old collections keep their checks.
 *
 * This module only builds the API and collects what a script did. Running
 * the code is left to `evaluate`, which the host provides: in the app a
 * worker with no access to files, the window or Prism's own controls; on the
 * command line a fresh VM context. Either way the script sees `pm`, `prism`,
 * `console` and nothing it was not given.
 *
 * What comes back is a plain description of what the script asked for —
 * tests and their outcomes, log lines, variables set and unset, and changes
 * to the request — for the host to apply. A script never touches the app's
 * state directly.
 */
import { validateSchema } from './assert.js'

/* ---------------------------------------------------------------- helpers */

const MAX_LOGS = 500

function show(value) {
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** For messages: short, quoted the way chai quotes. */
function inspect(value) {
  if (typeof value === 'string') return `'${value.length > 80 ? `${value.slice(0, 80)}…` : value}'`
  if (value === undefined) return 'undefined'
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text.length > 100 ? `${text.slice(0, 100)}…` : text
  } catch {
    return String(value)
  }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
}

const typeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof RegExp ? 'regexp' : typeof v)

export class AssertionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssertionError'
  }
}

/* ------------------------------------------------------------------ expect */

/**
 * A chai-style `expect`, covering what API tests actually use: equality,
 * types, inclusion, comparisons, properties, lengths, patterns, and the
 * `not` / `deep` modifiers, with the usual language chains between.
 */
export function expect(actual, message) {
  let negate = false
  let deep = false
  const proxy = {}
  const check = (ok, positive, negative) => {
    if (Boolean(ok) === negate) {
      const text = negate ? negative : positive
      throw new AssertionError(message ? `${message}: ${text}` : text)
    }
    return proxy
  }
  const chains = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'still', 'also', 'but']
  for (const word of chains) Object.defineProperty(proxy, word, { get: () => proxy })
  Object.defineProperty(proxy, 'not', { get: () => ((negate = !negate), proxy) })
  Object.defineProperty(proxy, 'deep', { get: () => ((deep = true), proxy) })

  const a = actual
  const props = {
    ok: () => check(a, `expected ${inspect(a)} to be truthy`, `expected ${inspect(a)} to be falsy`),
    true: () => check(a === true, `expected ${inspect(a)} to be true`, `expected ${inspect(a)} not to be true`),
    false: () => check(a === false, `expected ${inspect(a)} to be false`, `expected ${inspect(a)} not to be false`),
    null: () => check(a === null, `expected ${inspect(a)} to be null`, `expected ${inspect(a)} not to be null`),
    undefined: () => check(a === undefined, `expected ${inspect(a)} to be undefined`, `expected ${inspect(a)} not to be undefined`),
    NaN: () => check(Number.isNaN(a), `expected ${inspect(a)} to be NaN`, `expected ${inspect(a)} not to be NaN`),
    exist: () => check(a !== null && a !== undefined, `expected ${inspect(a)} to exist`, `expected ${inspect(a)} not to exist`),
    empty: () => {
      const n = typeof a === 'string' || Array.isArray(a) ? a.length : a && typeof a === 'object' ? Object.keys(a).length : NaN
      return check(n === 0, `expected ${inspect(a)} to be empty`, `expected ${inspect(a)} not to be empty`)
    }
  }
  for (const [name, fn] of Object.entries(props)) Object.defineProperty(proxy, name, { get: fn })

  const equal = (v) => check(deep ? deepEqual(a, v) : a === v, `expected ${inspect(a)} to ${deep ? 'deeply ' : ''}equal ${inspect(v)}`, `expected ${inspect(a)} to not ${deep ? 'deeply ' : ''}equal ${inspect(v)}`)
  const eql = (v) => check(deepEqual(a, v), `expected ${inspect(a)} to deeply equal ${inspect(v)}`, `expected ${inspect(a)} to not deeply equal ${inspect(v)}`)
  const type = (t) => check(typeName(a) === String(t).toLowerCase(), `expected ${inspect(a)} to be ${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`, `expected ${inspect(a)} not to be ${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`)
  const include = (v) => {
    let ok
    if (typeof a === 'string') ok = a.includes(v)
    else if (Array.isArray(a)) ok = a.some((x) => deepEqual(x, v))
    else if (a && typeof a === 'object' && v && typeof v === 'object') ok = Object.entries(v).every(([k, val]) => deepEqual(a[k], val))
    else ok = false
    return check(ok, `expected ${inspect(a)} to include ${inspect(v)}`, `expected ${inspect(a)} to not include ${inspect(v)}`)
  }
  const num = (op, word) => (n) => check(op(Number(a), n), `expected ${inspect(a)} to be ${word} ${n}`, `expected ${inspect(a)} to not be ${word} ${n}`)
  const above = num((x, n) => x > n, 'above')
  const below = num((x, n) => x < n, 'below')
  const least = num((x, n) => x >= n, 'at least')
  const most = num((x, n) => x <= n, 'at most')
  const methods = {
    equal,
    equals: equal,
    eq: equal,
    eql,
    eqls: eql,
    a: type,
    an: type,
    include,
    includes: include,
    contain: include,
    contains: include,
    above,
    gt: above,
    greaterThan: above,
    below,
    lt: below,
    lessThan: below,
    least,
    gte: least,
    most,
    lte: most,
    within: (lo, hi) => check(Number(a) >= lo && Number(a) <= hi, `expected ${inspect(a)} to be within ${lo}..${hi}`, `expected ${inspect(a)} to not be within ${lo}..${hi}`),
    oneOf: (list) => check((list ?? []).some((x) => deepEqual(x, a)), `expected ${inspect(a)} to be one of ${inspect(list)}`, `expected ${inspect(a)} to not be one of ${inspect(list)}`),
    property: (name, value) => {
      const has = a !== null && a !== undefined && Object(a)[name] !== undefined
      if (arguments.length < 2 && value === undefined) return check(has, `expected ${inspect(a)} to have property '${name}'`, `expected ${inspect(a)} to not have property '${name}'`)
      return check(has && deepEqual(a[name], value), `expected ${inspect(a)} to have property '${name}' of ${inspect(value)}`, `expected ${inspect(a)} to not have property '${name}' of ${inspect(value)}`)
    },
    lengthOf: (n) => check(a != null && a.length === n, `expected ${inspect(a)} to have a length of ${n} but got ${a?.length}`, `expected ${inspect(a)} to not have a length of ${n}`),
    match: (re) => check(re instanceof RegExp && re.test(String(a)), `expected ${inspect(a)} to match ${re}`, `expected ${inspect(a)} not to match ${re}`),
    string: (s) => check(typeof a === 'string' && a.includes(s), `expected ${inspect(a)} to contain '${s}'`, `expected ${inspect(a)} to not contain '${s}'`),
    keys: (...keys) => {
      const want = keys.flat()
      const got = a && typeof a === 'object' ? Object.keys(a) : []
      return check(want.every((k) => got.includes(k)), `expected ${inspect(a)} to have keys ${inspect(want)}`, `expected ${inspect(a)} to not have keys ${inspect(want)}`)
    },
    members: (list) => check(Array.isArray(a) && list.length === a.length && list.every((x) => a.some((y) => deepEqual(x, y))), `expected ${inspect(a)} to have the same members as ${inspect(list)}`, `expected ${inspect(a)} to not have the same members as ${inspect(list)}`),
    instanceOf: (C) => check(a instanceof C, `expected ${inspect(a)} to be an instance of ${C?.name}`, `expected ${inspect(a)} to not be an instance of ${C?.name}`),
    satisfy: (fn) => check(fn(a), `expected ${inspect(a)} to satisfy the given test`, `expected ${inspect(a)} to not satisfy the given test`),
    jsonSchema: (schema) => {
      const errors = validateSchema(schema, a)
      return check(!errors.length, `expected the value to match the schema — ${errors.slice(0, 3).map((e) => `${e.path ?? e.at ?? ''} ${e.message ?? e}`).join('; ')}`, 'expected the value not to match the schema')
    }
  }
  for (const [name, fn] of Object.entries(methods)) Object.defineProperty(proxy, name, { value: fn })
  // `.length(n)` and `.lengthOf(n)` are both chai; a function's own `length`
  // is read-only, so it is defined over the top.
  Object.defineProperty(proxy, 'length', { value: methods.lengthOf, configurable: true })
  return proxy
}

/* --------------------------------------------------------------- variables */

/** One scope of variables, as Postman's `pm.environment` and friends. */
function scope(store, changes, replaceIn, extra = {}) {
  return {
    get: (key) => store[key],
    has: (key) => Object.hasOwn(store, key),
    set: (key, value) => {
      store[key] = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
      if (changes) {
        changes.set[key] = store[key]
        changes.unset = changes.unset.filter((k) => k !== key)
      }
    },
    unset: (key) => {
      delete store[key]
      if (changes) {
        delete changes.set[key]
        if (!changes.unset.includes(key)) changes.unset.push(key)
      }
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key]
        if (changes) changes.unset.push(key)
      }
      if (changes) changes.set = {}
    },
    toObject: () => ({ ...store }),
    replaceIn,
    ...extra
  }
}

/** Headers as Postman's list: get, has, add, upsert, remove, toObject. */
function headerList(rows, writable) {
  const find = (key) => rows.find((h) => String(h.key).toLowerCase() === String(key).toLowerCase() && !h.disabled)
  const api = {
    get: (key) => find(key)?.value,
    has: (key, value) => Boolean(find(key)) && (value === undefined || find(key).value === value),
    toObject: () => Object.fromEntries(rows.filter((h) => !h.disabled).map((h) => [h.key, h.value])),
    each: (fn) => rows.filter((h) => !h.disabled).forEach(fn),
    all: () => rows.filter((h) => !h.disabled).map((h) => ({ ...h })),
    count: () => rows.filter((h) => !h.disabled).length
  }
  if (writable) {
    const norm = (h, v) => (typeof h === 'string' ? { key: h.split(':')[0].trim(), value: v ?? h.split(':').slice(1).join(':').trim() } : { key: h.key, value: String(h.value ?? '') })
    api.add = (h, v) => rows.push(norm(h, v))
    api.upsert = (h, v) => {
      const n = norm(h, v)
      const at = find(n.key)
      if (at) at.value = n.value
      else rows.push(n)
    }
    api.remove = (key) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) if (String(rows[i].key).toLowerCase() === String(key).toLowerCase()) rows.splice(i, 1)
    }
  }
  return api
}

/* -------------------------------------------------------------------- run */

/**
 * Runs one script.
 *
 * @param {object} input
 * @param {string} input.code
 * @param {'prerequest'|'test'} input.phase
 * @param {object} input.request      { name, method, url, headers: [{key, value}], body }
 * @param {object} [input.response]   { code, status, headers: {k: v}, body, time, size }
 * @param {object} input.vars         { environment, local, iteration, collection, globals }
 * @param {object} [input.info]       { requestName, iteration, iterationCount }
 * @param {(code: string, globals: object) => unknown} input.evaluate
 */
export async function runScript({ code, phase, request, response, vars = {}, info = {}, evaluate }) {
  const out = {
    tests: [],
    logs: [],
    environment: { set: {}, unset: [] },
    local: { set: {}, unset: [] },
    request: null,
    skip: false,
    error: null
  }
  const environment = { ...(vars.environment ?? {}) }
  const local = { ...(vars.local ?? {}) }
  const iteration = { ...(vars.iteration ?? {}) }
  const collection = { ...(vars.collection ?? {}) }
  const globals = { ...(vars.globals ?? {}) }

  // Postman's precedence, narrowest wins: local, data, environment, collection, global.
  const resolve = (key) => [local, iteration, environment, collection, globals].find((s) => Object.hasOwn(s, key))?.[key]
  const replaceIn = (text) => String(text ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (resolve(k) === undefined ? m : String(resolve(k))))

  const log = (level) => (...args) => {
    if (out.logs.length < MAX_LOGS) out.logs.push({ level, text: args.map(show).join(' ') })
  }
  const console = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') }

  // The request, editable before it is sent, read-only after.
  const req = {
    method: String(request?.method ?? 'GET').toUpperCase(),
    url: String(request?.url ?? ''),
    headers: (request?.headers ?? []).map((h) => ({ key: h.key, value: String(h.value ?? ''), disabled: h.disabled ?? h.on === false })),
    body: String(request?.body ?? '')
  }
  const editable = phase === 'prerequest'
  const urlObject = {
    toString: () => req.url,
    getRaw: () => req.url,
    update: (next) => {
      if (editable) req.url = String(next)
    }
  }
  const pmRequest = {
    name: request?.name ?? '',
    get method() {
      return req.method
    },
    set method(v) {
      if (editable) req.method = String(v).toUpperCase()
    },
    get url() {
      return urlObject
    },
    set url(v) {
      if (editable) req.url = String(v)
    },
    headers: headerList(req.headers, editable),
    addHeader: (h) => editable && headerList(req.headers, true).add(h),
    removeHeader: (k) => editable && headerList(req.headers, true).remove(k),
    body: {
      get raw() {
        return req.body
      },
      set raw(v) {
        if (editable) req.body = String(v)
      },
      toString: () => req.body,
      update: (v) => {
        if (editable) req.body = typeof v === 'string' ? v : String(v?.raw ?? JSON.stringify(v))
      }
    }
  }

  let pmResponse
  if (response) {
    const rows = Object.entries(response.headers ?? {}).map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value) }))
    const body = String(response.body ?? '')
    let parsed
    const json = () => {
      if (parsed === undefined) parsed = JSON.parse(body)
      return parsed
    }
    const statusIs = (test, word) => (negate) => {
      const ok = test(response.code)
      if (ok === negate) throw new AssertionError(`expected response to ${negate ? 'not ' : ''}be ${word} but got ${response.code}`)
    }
    const to = (negate = false) => {
      const be = {
        get ok() {
          return statusIs((c) => c >= 200 && c < 300, 'OK (2xx)')(negate)
        },
        get success() {
          return statusIs((c) => c >= 200 && c < 300, 'a success (2xx)')(negate)
        },
        get error() {
          return statusIs((c) => c >= 400, 'an error (4xx or 5xx)')(negate)
        },
        get clientError() {
          return statusIs((c) => c >= 400 && c < 500, 'a client error (4xx)')(negate)
        },
        get serverError() {
          return statusIs((c) => c >= 500, 'a server error (5xx)')(negate)
        },
        get redirection() {
          return statusIs((c) => c >= 300 && c < 400, 'a redirect (3xx)')(negate)
        },
        get notFound() {
          return statusIs((c) => c === 404, 'Not Found (404)')(negate)
        },
        get unauthorized() {
          return statusIs((c) => c === 401, 'Unauthorized (401)')(negate)
        },
        get forbidden() {
          return statusIs((c) => c === 403, 'Forbidden (403)')(negate)
        },
        get badRequest() {
          return statusIs((c) => c === 400, 'Bad Request (400)')(negate)
        },
        get json() {
          let ok = true
          try {
            json()
          } catch {
            ok = false
          }
          if (ok === negate) throw new AssertionError(`expected response ${negate ? 'not ' : ''}to be JSON`)
          return undefined
        }
      }
      const have = {
        status: (want) => {
          const ok = typeof want === 'number' ? response.code === want : String(response.status).toLowerCase() === String(want).toLowerCase()
          if (ok === negate) throw new AssertionError(`expected response to ${negate ? 'not ' : ''}have status ${inspect(want)} but got ${response.code}`)
        },
        header: (key, value) => {
          const h = rows.find((r) => r.key.toLowerCase() === String(key).toLowerCase())
          const ok = Boolean(h) && (value === undefined || h.value === String(value))
          if (ok === negate) throw new AssertionError(`expected response to ${negate ? 'not ' : ''}have header ${key}${value === undefined ? '' : ` = ${inspect(value)}`}`)
        },
        body: (want) => {
          const ok = want instanceof RegExp ? want.test(body) : want === undefined ? body.length > 0 : body === String(want)
          if (ok === negate) throw new AssertionError(`expected response body to ${negate ? 'not ' : ''}${want === undefined ? 'exist' : `be ${inspect(want)}`}`)
        },
        jsonBody: (path, value) => {
          let data
          try {
            data = json()
          } catch {
            data = undefined
          }
          let found = data
          if (typeof path === 'string') for (const k of path.split('.').filter(Boolean)) found = found == null ? undefined : found[k]
          const ok = data !== undefined && (path === undefined || (value === undefined ? found !== undefined : deepEqual(found, value)))
          if (ok === negate) throw new AssertionError(`expected response JSON ${path ? `at ${path} ` : ''}to ${negate ? 'not ' : ''}${value === undefined ? 'exist' : `equal ${inspect(value)}`}`)
        },
        jsonSchema: (schema) => {
          let data
          try {
            data = json()
          } catch {
            data = undefined
          }
          const errors = validateSchema(schema, data)
          if (!errors.length === negate) throw new AssertionError(negate ? 'expected response not to match the schema' : `expected response to match the schema — ${errors.slice(0, 3).map((e) => `${e.path ?? e.at ?? ''} ${e.message ?? e}`).join('; ')}`)
        },
        responseTime: {
          below: (ms) => {
            if (response.time < ms === negate) throw new AssertionError(`expected response time ${response.time}ms to ${negate ? 'not ' : ''}be below ${ms}ms`)
          }
        }
      }
      const api = { be, have }
      Object.defineProperty(api, 'not', { get: () => to(!negate) })
      return api
    }
    pmResponse = {
      code: response.code,
      status: response.status,
      responseTime: response.time,
      responseSize: response.size,
      headers: headerList(rows, false),
      text: () => body,
      json,
      get to() {
        return to(false)
      }
    }
  }

  const pending = []
  const pm = {
    info: {
      requestName: info.requestName ?? request?.name ?? '',
      requestId: info.requestId ?? '',
      iteration: info.iteration ?? 0,
      iterationCount: info.iterationCount ?? 1,
      eventName: phase
    },
    environment: scope(environment, out.environment, replaceIn, { name: vars.environmentName ?? '' }),
    variables: scope(local, out.local, replaceIn, {
      get: (key) => resolve(key)
    }),
    // Prism has no separate collection or global stores: setting one is kept
    // for the rest of the run, like a local variable, and reading one falls
    // through to everything else in scope.
    collectionVariables: scope(collection, out.local, replaceIn),
    globals: scope(globals, out.local, replaceIn),
    iterationData: scope(iteration, null, replaceIn, { set: () => undefined, unset: () => undefined }),
    request: pmRequest,
    response: pmResponse,
    test: (name, fn) => {
      const record = { name: String(name), ok: true, error: '' }
      out.tests.push(record)
      try {
        const result = typeof fn === 'function' ? fn() : undefined
        if (result && typeof result.then === 'function') {
          pending.push(
            result.then(
              () => undefined,
              (err) => {
                record.ok = false
                record.error = err?.message ?? String(err)
              }
            )
          )
        }
      } catch (err) {
        record.ok = false
        record.error = err?.message ?? String(err)
      }
    },
    expect,
    sendRequest: () => {
      throw new Error('pm.sendRequest is not available in Prism yet — add the request to the flow and capture what you need from it instead.')
    },
    execution: {
      skipRequest: () => {
        if (phase === 'prerequest') out.skip = true
      },
      setNextRequest: () => undefined,
      location: [request?.name ?? '']
    },
    visualizer: { set: () => undefined, clear: () => undefined },
    cookies: { get: () => undefined, has: () => false, toObject: () => ({}) }
  }
  pm.test.skip = (name) => out.tests.push({ name: String(name), ok: true, error: '', skipped: true })

  // The older Postman forms, so collections written for them keep working.
  const tests = {}
  const postman = {
    setEnvironmentVariable: (k, v) => pm.environment.set(k, v),
    getEnvironmentVariable: (k) => pm.environment.get(k),
    clearEnvironmentVariable: (k) => pm.environment.unset(k),
    setGlobalVariable: (k, v) => pm.globals.set(k, v),
    getGlobalVariable: (k) => pm.globals.get(k),
    clearGlobalVariable: (k) => pm.globals.unset(k),
    setNextRequest: () => undefined
  }
  const legacy = response
    ? {
        responseBody: String(response.body ?? ''),
        responseCode: { code: response.code, name: response.status, detail: response.status },
        responseTime: response.time,
        responseHeaders: Object.fromEntries(Object.entries(response.headers ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]))
      }
    : {}
  const requireShim = (name) => {
    if (name === 'chai') return { expect, assert: { equal: (a, b, m) => expect(a, m).to.equal(b), ok: (a, m) => expect(a, m).to.be.ok } }
    throw new Error(`require('${name}') is not available in Prism scripts`)
  }

  try {
    const result = evaluate(String(code ?? ''), { pm, prism: pm, postman, console, tests, request: legacy.responseBody === undefined ? pmRequest : undefined, ...legacy, environment, data: iteration, iteration: pm.info.iteration, require: requireShim })
    if (result && typeof result.then === 'function') await result
  } catch (err) {
    out.error = err?.message ?? String(err)
  }
  await Promise.allSettled(pending)

  for (const [name, value] of Object.entries(tests)) out.tests.push({ name, ok: Boolean(value), error: value ? '' : 'returned false' })
  if (editable) out.request = { method: req.method, url: req.url, headers: req.headers, body: req.body }
  return out
}

/* --------------------------------------------------------------- snippets */

/** Ready-made lines for the script editor, the way Postman offers them. */
export const SNIPPETS = {
  prerequest: [
    { label: 'Set an environment variable', code: "pm.environment.set('name', 'value')" },
    { label: 'Set a variable for this run', code: "pm.variables.set('name', 'value')" },
    { label: 'Get a variable', code: "const value = pm.variables.get('name')" },
    { label: 'Use a data file column', code: "const email = pm.iterationData.get('email')" },
    { label: 'Add a header', code: "pm.request.headers.upsert({ key: 'X-Request-Id', value: crypto.randomUUID() })" },
    { label: 'Timestamp variable', code: "pm.variables.set('now', new Date().toISOString())" },
    { label: 'Random email', code: "pm.variables.set('email', `user${Date.now()}@example.com`)" },
    { label: 'Skip this request', code: "if (!pm.environment.get('token')) pm.execution.skipRequest()" },
    { label: 'Log to the console', code: "console.log('sending', pm.request.url.toString())" }
  ],
  test: [
    { label: 'Status code is 200', code: "pm.test('Status code is 200', () => {\n  pm.response.to.have.status(200)\n})" },
    { label: 'Response time is below 500 ms', code: "pm.test('Response time is below 500 ms', () => {\n  pm.expect(pm.response.responseTime).to.be.below(500)\n})" },
    { label: 'Body contains a string', code: "pm.test('Body contains the name', () => {\n  pm.expect(pm.response.text()).to.include('name')\n})" },
    { label: 'Check a JSON value', code: "pm.test('Status is active', () => {\n  const json = pm.response.json()\n  pm.expect(json.status).to.eql('active')\n})" },
    { label: 'JSON array is not empty', code: "pm.test('Has items', () => {\n  pm.expect(pm.response.json().items).to.be.an('array').that.is.not.empty\n})" },
    { label: 'Header is present', code: "pm.test('Content-Type is present', () => {\n  pm.response.to.have.header('Content-Type')\n})" },
    { label: 'Save a value for the next request', code: "pm.environment.set('token', pm.response.json().token)" },
    { label: 'Compare with data file', code: "pm.test('Name matches the data file', () => {\n  pm.expect(pm.response.json().name).to.eql(pm.iterationData.get('name'))\n})" },
    { label: 'Match a JSON schema', code: "pm.test('Matches the schema', () => {\n  pm.response.to.have.jsonSchema({\n    type: 'object',\n    required: ['id'],\n    properties: { id: { type: 'string' } }\n  })\n})" }
  ]
}
