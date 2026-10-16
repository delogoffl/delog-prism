/**
 * Writing a request out in somebody else's language.
 *
 * ONE RULE ABOVE ALL OTHERS: no credential is ever inlined. A `{{token}}` in
 * a request becomes a read of an environment variable in the generated file,
 * in every target. Exported code gets committed, pasted into tickets and put
 * in front of screen shares; a resolved secret in one of them is a leak with a
 * very long tail. The variable is what the user wrote and the variable is what
 * comes out.
 */
import { buildUrl, buildHeaders, buildBody } from './request.js'
import { describe } from './assert.js'
import { jsChecks, jsHelperBlock, pyChecks, pyHelperBlock, checklist, expectedStatus } from './checks-export.js'

export const TARGETS = [
  { id: 'curl', label: 'cURL', ext: 'sh', group: 'Shell' },
  { id: 'python', label: 'Python · requests', ext: 'py', group: 'Code' },
  { id: 'pytest', label: 'Python · pytest', ext: 'py', group: 'Test' },
  { id: 'fetch', label: 'JavaScript · fetch', ext: 'js', group: 'Code' },
  { id: 'axios', label: 'JavaScript · axios', ext: 'js', group: 'Code' },
  { id: 'node', label: 'Node · undici', ext: 'mjs', group: 'Code' },
  { id: 'playwright', label: 'Playwright · APIRequest', ext: 'spec.ts', group: 'Test' },
  { id: 'java', label: 'Java · HttpClient', ext: 'java', group: 'Code' },
  { id: 'restassured', label: 'Java · REST Assured', ext: 'java', group: 'Test' },
  { id: 'csharp', label: 'C# · HttpClient', ext: 'cs', group: 'Code' },
  { id: 'go', label: 'Go · net/http', ext: 'go', group: 'Code' },
  { id: 'php', label: 'PHP · cURL', ext: 'php', group: 'Code' },
  { id: 'postman', label: 'Postman collection', ext: 'postman_collection.json', group: 'Collection' },
  { id: 'openapi', label: 'OpenAPI 3.1', ext: 'openapi.json', group: 'Collection' },
  { id: 'canvas', label: 'Prism flow', ext: 'canvas.json', group: 'Collection' }
]

export const GROUPS = ['Shell', 'Code', 'Test', 'Collection']
export const WHOLE_FLOW = new Set(['postman', 'openapi', 'canvas'])

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g
const ENV_NAME = (name) => name.replace(/[.-]/g, '_').toUpperCase()

/** Rewrites `{{name}}` as the target's way of reading an environment variable. */
function vars(text, style) {
  return String(text ?? '').replace(VAR, (_m, name) => style(name))
}

/** True when the text mentions a variable, so the file can note where to set it. */
function usesVars(text) {
  VAR.lastIndex = 0
  return VAR.test(String(text ?? ''))
}

const q = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const dq = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * The request laid out flat, with variables left as they were written.
 *
 * Passing an empty environment is the point: `buildUrl` leaves an unresolved
 * `{{name}}` verbatim, which is exactly what each generator then rewrites into
 * its own lookup.
 */
function parts(req) {
  return {
    method: (req.method || 'GET').toUpperCase(),
    url: buildUrl(req, {}),
    headers: buildHeaders(req, {}),
    body: buildBody(req, {})
  }
}

/** Every variable a request mentions, for the header comment. */
function mentioned(req) {
  const p = parts(req)
  const found = new Set()
  const scan = (t) => {
    for (const m of String(t ?? '').matchAll(VAR)) found.add(m[1])
  }
  scan(p.url)
  scan(p.body)
  for (const [k, v] of Object.entries(p.headers)) {
    scan(k)
    scan(v)
  }
  return [...found]
}

function note(req, comment, style) {
  const list = mentioned(req)
  if (!list.length) return ''
  const names = list.map((n) => style(n)).join(', ')
  return `${comment} Set before running: ${names}\n`
}

/* ------------------------------------------------------------------ targets */

/** A JavaScript string literal in single quotes. */
const js = (text) => q(text)

/**
 * The checks as a little runner at the end of a script: each one printed with
 * a tick or a cross, and a failing exit code when any failed — so the file
 * works as-is in CI, not only as a snippet.
 */
function jsRunner(found) {
  if (!found.checks.length) return ''
  return `
const failures = []
function check(name, test) {
  let ok = false
  try {
    ok = Boolean(test())
  } catch {}
  console.log(ok ? '✓' : '✗', name)
  if (!ok) failures.push(name)
}

${found.checks.map((c) => `check(${js(c.name)}, () => ${c.cond})`).join('\n')}
${skippedNote(found.skipped, '//')}if (failures.length) process.exitCode = 1
`
}

/** What a target could not express, named — never dropped in silence. */
function skippedNote(skipped, mark) {
  if (!skipped.length) return ''
  return `${mark} Not checked here — this client cannot tell: ${skipped.join('; ')}\n`
}

const ajvImport = (found) => (found.used.has('schema') ? "import Ajv from 'ajv'\n" : '')

function curl(req) {
  const p = parts(req)
  const style = (n) => `$${ENV_NAME(n)}`
  // Continuations come from the join alone. The first line used to carry its
  // own backslash too, which wrote `GET \ \` and broke the pasted command.
  const lines = [`curl --request ${p.method}`, `  --url ${dq(vars(p.url, style))}`]
  for (const [key, value] of Object.entries(p.headers)) {
    lines.push(`  --header ${dq(`${key}: ${vars(value, style)}`)}`)
  }
  if (p.body) lines.push(`  --data ${dq(vars(p.body, style))}`)
  return note(req, '#', style) + checklist(req, '#') + lines.join(' \\\n')
}

/** The facts every Python reader of a `requests` response works from. */
const PY_FACTS = `status = response.status_code
ms = response.elapsed.total_seconds() * 1000
size = len(response.content)
text = response.text
try:
    data = response.json()
except ValueError:
    data = MISSING
header = response.headers.get
redirects = len(response.history)
https = response.url.startswith("https:")
cookies = response.raw.headers.getlist("Set-Cookie") if hasattr(response.raw.headers, "getlist") else []`

const PY_PASSES = `def passes(test):
    """A check passes when it is true; one that errors has failed."""
    try:
        return bool(test())
    except Exception:
        return False`

function pyImports(found, extra = []) {
  const std = ['json', 'os', 're', ...extra].sort()
  return `${std.map((m) => `import ${m}`).join('\n')}

${found.used.has('schema') ? 'import jsonschema\n' : ''}import requests`
}

const indent = (text, pad) => text.split('\n').map((l) => (l ? pad + l : l)).join('\n')

function python(req) {
  const p = parts(req)
  const style = (n) => `{os.environ[${dq(ENV_NAME(n))}]}`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `    ${dq(k)}: f${dq(vars(v, style))},`)
    .join('\n')
  const body = p.body ? `\ndata = f${dq(vars(p.body, style))}\n` : ''
  const found = pyChecks(req, { cookies: true })
  const request = `${note(req, '#', (n) => ENV_NAME(n)).trim()}
url = f${dq(vars(p.url, style))}
headers = {
${headers}
}${body}
response = requests.request(${dq(p.method)}, url, headers=headers${p.body ? ', data=data' : ''}, timeout=30)
print(response.status_code, response.elapsed.total_seconds())
print(response.text)
`
  if (!found.checks.length) {
    return `import os
import requests

${request}`
  }
  return `${pyImports(found, ['sys'])}


${pyHelperBlock(found.used)}


${PY_PASSES}


${request}
# The checks set in Prism.
${PY_FACTS.replace(/^data = response.json\(\)$/m, 'data = response.json()')}

checks = [
${found.checks.map((c) => `    (${dq(c.name)}, lambda: ${c.cond}),`).join('\n')}
]
results = [(name, passes(test)) for name, test in checks]
for name, ok in results:
    print("PASS" if ok else "FAIL", name)
${skippedNote(found.skipped, '#')}if not all(ok for _, ok in results):
    sys.exit(1)
`
}

function pytest(req) {
  const p = parts(req)
  const style = (n) => `{os.environ[${dq(ENV_NAME(n))}]}`
  const name = slug(req.name || 'request').replace(/-/g, '_')
  const found = pyChecks(req, { cookies: true })
  const call = `    response = requests.request(
        ${dq(p.method)},
        f${dq(vars(p.url, style))},
        headers=${pyDict(p.headers, style)},${p.body ? `\n        data=f${dq(vars(p.body, style))},` : ''}
        timeout=30,
    )`
  if (!found.checks.length) {
    return `import os
import requests

${note(req, '#', (n) => ENV_NAME(n)).trim()}

def test_${name}():
${call}
    # No assertions were set on this request.
`
  }
  return `${pyImports(found)}


${pyHelperBlock(found.used)}


${PY_PASSES}


${note(req, '#', (n) => ENV_NAME(n)).trim()}
def test_${name}():
${call}
${indent(PY_FACTS, '    ')}

    checks = [
${found.checks.map((c) => `        (${dq(c.name)}, lambda: ${c.cond}),`).join('\n')}
    ]
${skippedNote(found.skipped, '    #')}    failed = [name for name, test in checks if not passes(test)]
    assert not failed, "Failed: " + "; ".join(failed)
`
}

function pyDict(headers, style) {
  const entries = Object.entries(headers)
  if (!entries.length) return '{}'
  return `{\n${entries.map(([k, v]) => `            ${dq(k)}: f${dq(vars(v, style))},`).join('\n')}\n        }`
}

/** The facts the JavaScript checks read, from a parsed text body. */
const JS_JSON = `let json
try {
  json = JSON.parse(text)
} catch {}`

function jsFetch(req, typed) {
  const p = parts(req)
  const style = (n) => `\${process.env.${ENV_NAME(n)}}`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `    ${dq(k)}: \`${vars(v, style)}\`,`)
    .join('\n')
  const options = `{
  method: ${dq(p.method)},
  headers: {
${headers}
  }${p.body ? `,\n  body: \`${vars(p.body, style)}\`` : ''}
}`
  const found = jsChecks(req, { cookies: true, https: true, schema: true })
  if (!found.checks.length) {
    return `${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}const response = await fetch(\`${vars(p.url, style)}\`, ${options})

${typed ? 'const data: unknown = ' : 'const data = '}await response.json()
console.log(response.status, data)
`
  }
  return `${ajvImport(found)}${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}const started = performance.now()
const response = await fetch(\`${vars(p.url, style)}\`, ${options})
const text = await response.text()
const ms = Math.round(performance.now() - started)

${JS_JSON}
console.log(response.status, json ?? text)

// The checks set in Prism.
const status = response.status
const bytes = new TextEncoder().encode(text).length
const header = (name) => response.headers.get(name) ?? undefined
const cookies = response.headers.getSetCookie?.() ?? []
const https = response.url.startsWith('https:')
${jsHelperBlock(found.used)}
${jsRunner(found)}`
}

function axios(req) {
  const p = parts(req)
  const style = (n) => `\${process.env.${ENV_NAME(n)}}`
  const found = jsChecks(req, { cookies: true, https: true, schema: true })
  if (!found.checks.length) {
    return `${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}import axios from 'axios'

const response = await axios({
  method: ${q(p.method.toLowerCase())},
  url: \`${vars(p.url, style)}\`,
  headers: ${jsObject(p.headers, style, 2)}${p.body ? `,\n  data: \`${vars(p.body, style)}\`` : ''},
  timeout: 30000
})

console.log(response.status, response.data)
`
  }
  return `${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}import axios from 'axios'
${ajvImport(found)}
const started = performance.now()
const response = await axios({
  method: ${q(p.method.toLowerCase())},
  url: \`${vars(p.url, style)}\`,
  headers: ${jsObject(p.headers, style, 2)}${p.body ? `,\n  data: \`${vars(p.body, style)}\`` : ''},
  timeout: 30000,
  // The body as it came, and every status as an answer rather than a throw,
  // so the checks below see exactly what Prism saw.
  responseType: 'text',
  transformResponse: [(raw) => raw],
  validateStatus: () => true
})
const ms = Math.round(performance.now() - started)
const text = String(response.data ?? '')

${JS_JSON}
console.log(response.status, json ?? text)

// The checks set in Prism.
const status = response.status
const bytes = Buffer.byteLength(text)
const header = (name) => {
  const value = response.headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value
}
const cookies = [].concat(response.headers['set-cookie'] ?? [])
const https = String(response.config.url).startsWith('https:')
${jsHelperBlock(found.used)}
${jsRunner(found)}`
}

function nodeUndici(req) {
  const p = parts(req)
  const style = (n) => `\${process.env.${ENV_NAME(n)}}`
  const found = jsChecks(req, { cookies: true, https: true, redirects: true, schema: true })
  if (!found.checks.length) {
    return `${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}import { request } from 'undici'

const { statusCode, headers, body } = await request(\`${vars(p.url, style)}\`, {
  method: ${dq(p.method)},
  headers: ${jsObject(p.headers, style, 2)}${p.body ? `,\n  body: \`${vars(p.body, style)}\`` : ''}
})

console.log(statusCode, headers['content-type'])
console.log(await body.text())
`
  }
  return `${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}import { request } from 'undici'
${ajvImport(found)}
const url = \`${vars(p.url, style)}\`
const started = performance.now()
const { statusCode, headers, body } = await request(url, {
  method: ${dq(p.method)},
  headers: ${jsObject(p.headers, style, 2)}${p.body ? `,\n  body: \`${vars(p.body, style)}\`` : ''}
})
const text = await body.text()
const ms = Math.round(performance.now() - started)

${JS_JSON}
console.log(statusCode, json ?? text)

// The checks set in Prism.
const status = statusCode
const bytes = Buffer.byteLength(text)
const header = (name) => {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value
}
const cookies = [].concat(headers['set-cookie'] ?? [])
// undici's request() does not follow redirects, so there were none.
const redirects = 0
const https = url.startsWith('https:')
${jsHelperBlock(found.used)}
${jsRunner(found)}`
}

function playwright(req) {
  const p = parts(req)
  const style = (n) => `\${process.env.${ENV_NAME(n)}}`
  const found = jsChecks(req, { cookies: true, https: true, schema: true })
  const send = `  const response = await request.${p.method.toLowerCase()}(\`${vars(p.url, style)}\`, {
    headers: ${jsObject(p.headers, style, 4)}${p.body ? `,\n    data: \`${vars(p.body, style)}\`` : ''}
  })`
  if (!found.checks.length) {
    return `import { test, expect } from '@playwright/test'

${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}test(${dq(req.name || 'request')}, async ({ request }) => {
${send}

  expect(response.ok()).toBeTruthy()
  // No assertions were set on this request.
})
`
  }
  const helpers = jsHelperBlock(found.used)
  return `import { test, expect } from '@playwright/test'
${ajvImport(found)}${helpers ? `\n${helpers}\n` : ''}
${note(req, '//', (n) => `process.env.${ENV_NAME(n)}`)}test(${dq(req.name || 'request')}, async ({ request }) => {
  const started = Date.now()
${send}
  const ms = Date.now() - started
  const status = response.status()
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {}
  const bytes = (await response.body()).length
  const headers = response.headers()
  const header = (name: string) => headers[name.toLowerCase()]
  const cookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  const https = response.url().startsWith('https:')

  // The checks set in Prism. Soft, so every one is reported, not only the first.
${found.checks.map((c) => `  expect.soft(${c.cond}, ${js(c.name)}).toBe(true)`).join('\n')}
${skippedNote(found.skipped, '  //')}})
`
}

function jsObject(headers, style, indent) {
  const pad = ' '.repeat(indent)
  const entries = Object.entries(headers)
  if (!entries.length) return '{}'
  return `{\n${entries.map(([k, v]) => `${pad}  ${dq(k)}: \`${vars(v, style)}\`,`).join('\n')}\n${pad}}`
}

function java(req) {
  const p = parts(req)
  const style = (n) => `" + System.getenv(${dq(ENV_NAME(n))}) + "`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `    .header(${dq(k)}, ${dq(vars(v, style))})`)
    .join('\n')
  const want = expectedStatus(req)
  return `${note(req, '//', (n) => ENV_NAME(n))}${checklist(req, '//')}import java.net.URI;
import java.net.http.*;

HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(${dq(vars(p.url, style))}))
${headers}
    .method(${dq(p.method)}, ${p.body ? `HttpRequest.BodyPublishers.ofString(${dq(vars(p.body, style))})` : 'HttpRequest.BodyPublishers.noBody()'})
    .build();

HttpResponse<String> response = HttpClient.newHttpClient()
    .send(request, HttpResponse.BodyHandlers.ofString());

System.out.println(response.statusCode());
System.out.println(response.body());
${want ? `\nif (response.statusCode() != ${want}) {\n    throw new AssertionError("Expected status ${want}, got " + response.statusCode());\n}\n` : ''}`
}

/* -------------------------------------------------------- REST Assured */

const javaClass = { string: 'String.class', number: 'Number.class', boolean: 'Boolean.class', object: 'java.util.Map.class', array: 'java.util.List.class' }

/** Prism's path as REST Assured reads it: `[*]` collects, the root is `$`. */
const gpath = (path) => String(path ?? '').replace(/^\$\.?/, '').replace(/\[\*\]/g, '').replace(/\.\*/g, '') || '$'

/** A whole-text match, the way `matchesPattern` wants it, for a find-anywhere. */
const anywhere = (text) => {
  const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(String(text))
  const source = m ? m[1] : String(text)
  return `${m && m[2].includes('i') ? '(?i)' : ''}(?s).*(?:${source}).*`
}

/** One assertion as a step in REST Assured's `.then()`, or null. */
function raStep(a) {
  const x = String(a.value ?? '')
  const n = Number(x)
  const r = (() => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|-|,|to|and|\s)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(x)
    return m ? [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])] : null
  })()
  const list = x.split(/[,\s|]+/).filter(Boolean)
  switch (a.subject) {
    case 'status':
      switch (a.op) {
        case 'equals': return `.statusCode(${n})`
        case 'notEquals': return `.statusCode(not(${n}))`
        case 'oneOf': return `.statusCode(anyOf(${list.map((c) => `is(${Number(c)})`).join(', ')}))`
        case 'isSuccess': return '.statusCode(allOf(greaterThanOrEqualTo(200), lessThan(300)))'
        case 'isClass': {
          const k = /^\s*([1-5])/.exec(x)?.[1]
          return k ? `.statusCode(allOf(greaterThanOrEqualTo(${k}00), lessThan(${Number(k) + 1}00)))` : null
        }
        case 'lessThan': return `.statusCode(lessThan(${n}))`
        case 'greaterThan': return `.statusCode(greaterThan(${n}))`
        case 'between': return r ? `.statusCode(allOf(greaterThanOrEqualTo(${r[0]}), lessThanOrEqualTo(${r[1]})))` : null
      }
      return null
    case 'time':
      if (a.op === 'greaterThan') return `.time(greaterThan(${n}L))`
      if (a.op === 'between') return r ? `.time(allOf(greaterThanOrEqualTo(${r[0]}L), lessThanOrEqualTo(${r[1]}L)))` : null
      return `.time(lessThan(${n}L))`
    case 'contentType':
      if (a.op === 'equals') return `.contentType(equalTo(${dq(x)}))`
      if (a.op === 'notContains') return `.contentType(not(containsStringIgnoringCase(${dq(x)})))`
      if (a.op === 'matches') return `.contentType(matchesPattern(${dq(anywhere(x))}))`
      return `.contentType(containsStringIgnoringCase(${dq(x)}))`
    case 'header': {
      const h = dq(String(a.path ?? ''))
      switch (a.op) {
        case 'exists': return `.header(${h}, notNullValue())`
        case 'absent': return `.header(${h}, nullValue())`
        case 'equals': return `.header(${h}, equalTo(${dq(x)}))`
        case 'notEquals': return `.header(${h}, allOf(notNullValue(), not(equalTo(${dq(x)}))))`
        case 'contains': return `.header(${h}, containsString(${dq(x)}))`
        case 'notContains': return `.header(${h}, allOf(notNullValue(), not(containsString(${dq(x)}))))`
        case 'startsWith': return `.header(${h}, startsWith(${dq(x)}))`
        case 'matches': return `.header(${h}, matchesPattern(${dq(anywhere(x))}))`
        case 'oneOf': return `.header(${h}, oneOf(${list.map(dq).join(', ')}))`
      }
      return null
    }
    case 'body':
      switch (a.op) {
        case 'contains': return `.body(containsString(${dq(x)}))`
        case 'notContains': return `.body(not(containsString(${dq(x)})))`
        case 'equals': return `.body(equalTo(${dq(x)}))`
        case 'startsWith': return `.body(startsWith(${dq(x)}))`
        case 'isEmpty': return '.body(emptyString())'
        case 'notEmpty': return '.body(not(emptyString()))'
        case 'matches': return `.body(matchesPattern(${dq(anywhere(x))}))`
        case 'notMatches': return `.body(not(matchesPattern(${dq(anywhere(x))})))`
      }
      return null
    case 'json': {
      const path = dq(gpath(a.path))
      const every = String(a.path ?? '').includes('*')
      const m = raJson(a.op, x, n, list)
      if (!m) return null
      return `.body(${path}, ${every && !['lengthIs', 'lengthAbove', 'lengthBelow'].includes(a.op) ? `everyItem(${m})` : m})`
    }
    case 'cookie': {
      const c = dq(String(a.path ?? ''))
      if (a.op === 'exists') return `.cookie(${c})`
      if (a.op === 'absent') return `.cookie(${c}, nullValue())`
      if (a.op === 'equals') return `.cookie(${c}, equalTo(${dq(x)}))`
      if (a.op === 'contains') return `.cookie(${c}, containsString(${dq(x)}))`
      return null
    }
  }
  return null
}

function raJson(op, x, n, list) {
  switch (op) {
    case 'exists':
    case 'notNull': return 'notNullValue()'
    case 'absent':
    case 'isNull': return 'nullValue()'
    case 'equals': return x.trim() === 'null' ? 'nullValue()' : /^\s*[[{]/.test(x) ? null : `hasToString(${dq(x)})`
    case 'notEquals': return /^\s*[[{]/.test(x) ? null : `not(hasToString(${dq(x)}))`
    case 'oneOf': return `anyOf(${list.map((v) => `hasToString(${dq(v)})`).join(', ')})`
    case 'isType': {
      const t = x.trim().toLowerCase()
      if (t === 'null') return 'nullValue()'
      if (t === 'integer') return 'anyOf(instanceOf(Integer.class), instanceOf(Long.class))'
      return javaClass[t] ? `instanceOf(${javaClass[t]})` : null
    }
    case 'contains': return `hasToString(containsString(${dq(x)}))`
    case 'notContains': return `not(hasToString(containsString(${dq(x)})))`
    case 'includes': return `hasItem(hasToString(${dq(x)}))`
    case 'lengthIs': return `hasSize(${n})`
    case 'lengthAbove': return `hasSize(greaterThan(${n}))`
    case 'lengthBelow': return `hasSize(lessThan(${n}))`
    case 'matches': return `hasToString(matchesPattern(${dq(anywhere(x))}))`
    case 'startsWith': return `hasToString(startsWith(${dq(x)}))`
    case 'endsWith': return `hasToString(endsWith(${dq(x)}))`
    case 'isTrue': return 'equalTo(true)'
    case 'isFalse': return 'equalTo(false)'
    case 'isEmpty': return 'anyOf(nullValue(), hasToString(""), hasToString("[]"), hasToString("{}"))'
    case 'notEmpty': return 'not(anyOf(nullValue(), hasToString(""), hasToString("[]"), hasToString("{}")))'
  }
  return null
}

function restAssured(req) {
  const p = parts(req)
  const style = (n) => `" + System.getenv(${dq(ENV_NAME(n))}) + "`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `            .header(${dq(k)}, ${dq(vars(v, style))})`)
    .join('\n')
  const live = (req.assertions ?? []).filter((a) => a && a.on !== false)
  const steps = []
  const skipped = []
  for (const a of live) {
    const step = raStep(a)
    if (step) steps.push(`            // ${describe(a)}\n            ${step}`)
    else skipped.push(describe(a))
  }
  const then = steps.length
    ? steps.join('\n')
    : live.length
      ? '            .statusCode(200)'
      : '            .statusCode(200) // No assertions were set on this request.'
  return `${note(req, '//', (n) => ENV_NAME(n))}import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import org.junit.jupiter.api.Test;

public class ${pascal(req.name || 'Request')}Test {

    @Test
    void ${camel(req.name || 'request')}() {
        given()
${headers}${p.body ? `\n            .body(${dq(vars(p.body, style))})` : ''}
        .when()
            .${p.method.toLowerCase()}(${dq(vars(p.url, style))})
        .then()
${then};${skipped.length ? `\n        // Not checked here — REST Assured has no plain matcher for: ${skipped.join('; ')}` : ''}
    }
}
`
}

function csharp(req) {
  const p = parts(req)
  const style = (n) => `{Environment.GetEnvironmentVariable(${dq(ENV_NAME(n))})}`
  const headers = Object.entries(p.headers)
    .filter(([k]) => k.toLowerCase() !== 'content-type')
    .map(([k, v]) => `request.Headers.Add(${dq(k)}, $${dq(vars(v, style))});`)
    .join('\n')
  const want = expectedStatus(req)
  return `${note(req, '//', (n) => ENV_NAME(n))}${checklist(req, '//')}using System;
using System.Net.Http;

var client = new HttpClient();
var request = new HttpRequestMessage(new HttpMethod(${dq(p.method)}), $${dq(vars(p.url, style))});
${headers}${p.body ? `\nrequest.Content = new StringContent($${dq(vars(p.body, style))}, System.Text.Encoding.UTF8, ${dq(p.headers['Content-Type'] ?? 'application/json')});` : ''}

var response = await client.SendAsync(request);
Console.WriteLine((int)response.StatusCode);
Console.WriteLine(await response.Content.ReadAsStringAsync());
${want ? `\nif ((int)response.StatusCode != ${want})\n{\n    throw new Exception($"Expected status ${want}, got {(int)response.StatusCode}");\n}\n` : ''}`
}

function go(req) {
  const p = parts(req)
  const style = (n) => `" + os.Getenv(${dq(ENV_NAME(n))}) + "`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `\treq.Header.Set(${dq(k)}, ${dq(vars(v, style))})`)
    .join('\n')
  const want = expectedStatus(req)
  return `${note(req, '//', (n) => ENV_NAME(n))}${checklist(req, '//')}package main

import (
\t"fmt"
\t"io"
\t"net/http"
\t"os"${p.body ? '\n\t"strings"' : ''}
)

func main() {
\treq, err := http.NewRequest(${dq(p.method)}, ${dq(vars(p.url, style))}, ${p.body ? `strings.NewReader(${dq(vars(p.body, style))})` : 'nil'})
\tif err != nil {
\t\tpanic(err)
\t}
${headers}

\tres, err := http.DefaultClient.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer res.Body.Close()

\tbody, _ := io.ReadAll(res.Body)
\tfmt.Println(res.StatusCode)
\tfmt.Println(string(body))${want ? `\n\n\tif res.StatusCode != ${want} {\n\t\tpanic(fmt.Sprintf("expected status ${want}, got %d", res.StatusCode))\n\t}` : ''}
}
`
}

function php(req) {
  const p = parts(req)
  const style = (n) => `' . getenv(${dq(ENV_NAME(n))}) . '`
  const headers = Object.entries(p.headers)
    .map(([k, v]) => `    ${q(`${k}: `)} . ${q(vars(v, style))},`)
    .join('\n')
  const want = expectedStatus(req)
  return `<?php
${note(req, '//', (n) => ENV_NAME(n))}${checklist(req, '//')}
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => ${q(vars(p.url, style))},
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => ${q(p.method)},${p.body ? `\n    CURLOPT_POSTFIELDS => ${q(vars(p.body, style))},` : ''}
    CURLOPT_HTTPHEADER => [
${headers}
    ],
]);

$response = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
echo $status . PHP_EOL;
echo $response;
curl_close($curl);
${want ? `\nif ($status !== ${want}) {\n    fwrite(STDERR, "Expected status ${want}, got $status" . PHP_EOL);\n    exit(1);\n}\n` : ''}`
}

/* -------------------------------------------------------- collection formats */

export function toPostman(flow, environment) {
  return {
    info: {
      name: flow.name || 'Prism flow',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Exported from Prism. Variables are left as variables — set them in the environment.'
    },
    item: (flow.requests ?? []).map((req) => {
      const p = parts(req)
      const [bare, search] = p.url.split(/\?(.*)/s)
      return {
        name: req.name || 'Request',
        request: {
          method: p.method,
          header: Object.entries(p.headers).map(([key, value]) => ({ key, value, type: 'text' })),
          url: {
            raw: p.url,
            host: [bare],
            query: (search ?? '')
              .split('&')
              .filter(Boolean)
              .map((pair) => {
                const at = pair.indexOf('=')
                return { key: at < 0 ? pair : pair.slice(0, at), value: at < 0 ? '' : pair.slice(at + 1) }
              })
          },
          ...(p.body ? { body: { mode: 'raw', raw: p.body, options: { raw: { language: req.bodyKind === 'json' ? 'json' : 'text' } } } } : {})
        },
        event: [
          ...(req.scripts?.pre?.trim() ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: req.scripts.pre.split('\n') } }] : []),
          ...(req.assertions?.length || req.scripts?.test?.trim()
            ? [{ listen: 'test', script: { type: 'text/javascript', exec: [...(req.assertions?.length ? postmanScript(req) : []), ...(req.scripts?.test?.trim() ? req.scripts.test.split('\n') : [])] } }]
            : [])
        ]
      }
    }),
    // Names only, never values. A Postman collection is a file people commit
    // and share; writing the environment's live token into it is precisely the
    // leak the whole no-inlining rule exists to prevent. Postman prompts for
    // an empty variable, which is the right outcome.
    variable: Object.keys(environment?.values ?? {}).map((key) => ({
      key,
      value: '',
      description: 'Set this in Postman — Prism does not export values.'
    }))
  }
}

/**
 * The request's checks as a Postman test script: every assertion as a
 * `pm.test`, written with the same conditions as the JavaScript exports and
 * reading the response through Postman's own `pm` object.
 */
function postmanScript(req) {
  const found = jsChecks(req, { cookies: true, https: true, schema: 'postman' })
  if (!found.checks.length) {
    return found.skipped.length
      ? [`// Not expressible in Postman: ${found.skipped.join('; ')}`]
      : ['// No assertions were set on this request.']
  }
  const helpers = jsHelperBlock(found.used)
  const script = `const status = pm.response.code
const ms = pm.response.responseTime
const bytes = pm.response.responseSize
const text = pm.response.text()
let json
try {
  json = JSON.parse(text)
} catch (e) {}
const header = (name) => pm.response.headers.get(name)
const cookies = pm.response.headers.all().filter((h) => h.key.toLowerCase() === 'set-cookie').map((h) => h.value)
const https = pm.request.url.protocol === 'https'
${helpers ? `${helpers}\n` : ''}
${found.checks.map((c) => `pm.test(${dq(c.name)}, () => pm.expect(${c.cond}, ${dq(c.name)}).to.be.true)`).join('\n')}${found.skipped.length ? `\n// Not expressible in Postman: ${found.skipped.join('; ')}` : ''}`
  return script.split('\n')
}


export function toOpenApi(flow) {
  const paths = {}
  for (const req of flow.requests ?? []) {
    const p = parts(req)
    let route = p.url
    try {
      route = new URL(p.url).pathname
    } catch {
      // Built around a variable, so it will not parse. Dropping the leading
      // {{base_url}} recovers the path, which is the part OpenAPI describes.
      route = p.url.replace(/^\{\{[\w.-]+\}\}/, '').split('?')[0] || p.url
    }
    paths[route] = paths[route] ?? {}
    paths[route][p.method.toLowerCase()] = {
      summary: req.name || 'Request',
      responses: {
        [String(statusOf(req))]: { description: 'Expected response' }
      }
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: flow.name || 'Prism flow', version: '1.0.0' },
    paths
  }
}

function statusOf(req) {
  const status = (req.assertions ?? []).find((a) => a.subject === 'status' && a.op === 'equals')
  return status ? Number(status.value) || 200 : 200
}

/* -------------------------------------------------------------------- entry */

export function generate(target, { request, flow, environment }) {
  if (WHOLE_FLOW.has(target)) {
    const one = flow ?? { name: request?.name ?? 'Flow', requests: request ? [request] : [] }
    if (target === 'postman') return JSON.stringify(toPostman(one, environment), null, 2)
    if (target === 'openapi') return JSON.stringify(toOpenApi(one), null, 2)
    return JSON.stringify({ canvas: 'flow', version: 1, flow: one }, null, 2)
  }
  if (!request) {
    // A whole flow in a per-request language: every request, one after the
    // other, each under its name. This used to print "Pick a request" -- which
    // is what Export flow opened on for every code target.
    const list = flow?.requests ?? []
    if (!list.length) return '// Pick a request to export.'
    const mark = ['curl', 'python', 'pytest'].includes(target) ? '#' : '//'
    return list.map((r) => `${mark} ${r.name || 'Untitled'}\n${generate(target, { request: r, flow: null, environment })}`).join('\n\n')
  }
  switch (target) {
    case 'curl':
      return curl(request)
    case 'python':
      return python(request)
    case 'pytest':
      return pytest(request)
    case 'fetch':
      return jsFetch(request, false)
    case 'axios':
      return axios(request)
    case 'node':
      return nodeUndici(request)
    case 'playwright':
      return playwright(request)
    case 'java':
      return java(request)
    case 'restassured':
      return restAssured(request)
    case 'csharp':
      return csharp(request)
    case 'go':
      return go(request)
    case 'php':
      return php(request)
    default:
      return `// ${target} is not a target Prism can write.`
  }
}

export function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'request'
  )
}

function pascal(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('') || 'Request'
}

function camel(name) {
  const p = pascal(name)
  return p.charAt(0).toLowerCase() + p.slice(1)
}
