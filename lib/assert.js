/**
 * Assertions, as a subject and an operator rather than one fused kind.
 *
 * The builder lets either half be changed on its own — "response time" can
 * become "less than" or "equals" without picking a different assertion from a
 * list — so the model has to hold them apart. Every check returns why it came
 * out the way it did, because a red row that will not say what it saw is a row
 * people delete.
 *
 * A stored assertion is still only `{ id, subject, path, op, value, on }`.
 * Everything added since — wildcards, formats, schemas, cookies — reads that
 * same shape, so a suite saved a year ago runs unchanged.
 */

/**
 * What an assertion can look at. The first seven keep their ids and order:
 * saved suites and the builder's select both lean on them.
 */
export const SUBJECTS = [
  { id: 'status', label: 'Response status', group: 'Response', needs: 'value', valueHint: '200', blurb: 'The HTTP status code the server answered with.' },
  { id: 'time', label: 'Response time', group: 'Response', needs: 'value', unit: 'ms', valueHint: '500', blurb: 'How long the whole exchange took, first byte out to last byte in.' },
  { id: 'size', label: 'Response size', group: 'Response', needs: 'value', unit: 'bytes', valueHint: '102400', blurb: 'How many bytes the body weighed on the wire.' },
  { id: 'contentType', label: 'Content type', group: 'Headers', needs: 'value', valueHint: 'json', blurb: 'The Content-Type header, matched loosely so charset suffixes do not matter.' },
  { id: 'header', label: 'Header', group: 'Headers', needs: 'path+value', pathHint: 'x-request-id', valueHint: 'value', blurb: 'Any response header, named in any case.' },
  { id: 'body', label: 'Response body', group: 'Body', needs: 'value', valueHint: 'text to find', blurb: 'The raw body text, whatever its format.' },
  { id: 'json', label: 'JSON path', group: 'Body', needs: 'path+value', pathHint: 'data.items[*].id', valueHint: '42', blurb: 'One value, or every value a wildcard reaches, inside a JSON body.' },
  { id: 'schema', label: 'JSON schema', group: 'Body', needs: 'value', pathHint: 'optional — data.user', valueHint: '{ "type": "object" }', blurb: 'The body, or the part at a path, checked against a JSON Schema.' },
  { id: 'cookie', label: 'Cookie', group: 'Security', needs: 'path+value', pathHint: 'session', valueHint: 'HttpOnly', blurb: 'A cookie the response sets, by name, with its value and flags.' },
  { id: 'redirects', label: 'Redirects', group: 'Response', needs: 'value', valueHint: '1', blurb: 'How many redirects were followed to reach the final response.' },
  { id: 'transport', label: 'Transport', group: 'Security', needs: 'none', blurb: 'Whether the response came back over an encrypted connection.' }
]

/**
 * The operators each subject offers. The first of each list is what a new row
 * starts on, and those firsts are unchanged from before so a subject switch
 * lands where it always has.
 */
export const OPERATORS = {
  status: ['equals', 'notEquals', 'oneOf', 'isSuccess', 'isClass', 'lessThan', 'greaterThan', 'between'],
  time: ['lessThan', 'greaterThan', 'between'],
  size: ['lessThan', 'greaterThan', 'between'],
  contentType: ['contains', 'equals', 'notContains', 'matches'],
  header: ['exists', 'equals', 'contains', 'absent', 'notEquals', 'notContains', 'matches', 'startsWith', 'oneOf', 'lessThan', 'greaterThan'],
  body: ['contains', 'notContains', 'matches', 'isEmpty', 'notEmpty', 'notMatches', 'equals', 'startsWith', 'isJson'],
  json: [
    'exists', 'equals', 'notEquals', 'isType', 'contains', 'absent', 'lengthIs', 'notContains', 'lengthAbove', 'lengthBelow',
    'greaterThan', 'lessThan', 'between', 'oneOf', 'matches', 'startsWith', 'endsWith', 'isFormat', 'isEmpty', 'notEmpty',
    'isNull', 'notNull', 'isTrue', 'isFalse', 'includes', 'isUnique', 'isSorted'
  ],
  schema: ['matchesSchema'],
  cookie: ['exists', 'absent', 'equals', 'contains', 'hasFlag'],
  redirects: ['lessThan', 'equals'],
  transport: ['isHttps']
}

export const OP_LABEL = {
  equals: 'equals',
  notEquals: 'does not equal',
  oneOf: 'is one of',
  lessThan: 'is under',
  greaterThan: 'is over',
  isSuccess: 'is a success',
  contains: 'contains',
  notContains: 'does not contain',
  matches: 'matches',
  exists: 'exists',
  absent: 'is absent',
  isType: 'is of type',
  isEmpty: 'is empty',
  notEmpty: 'is not empty',
  lengthIs: 'has length',
  between: 'is between',
  isClass: 'is in class',
  notMatches: 'does not match',
  isJson: 'is valid JSON',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isFormat: 'has format',
  isNull: 'is null',
  notNull: 'is not null',
  isTrue: 'is true',
  isFalse: 'is false',
  includes: 'includes',
  isUnique: 'has no duplicates',
  isSorted: 'is sorted',
  lengthAbove: 'has length over',
  lengthBelow: 'has length under',
  matchesSchema: 'matches schema',
  hasFlag: 'has flag',
  isHttps: 'is HTTPS'
}

/**
 * Per operator: whether the value box means anything, and what to put in it
 * as a placeholder. A placeholder that shows the accepted shape — `200-299`,
 * `2xx` — saves a round trip through a failing run to learn the syntax.
 */
export const OP_META = {
  equals: { needsValue: true, hint: '200' },
  notEquals: { needsValue: true, hint: '500' },
  oneOf: { needsValue: true, hint: '200, 201' },
  lessThan: { needsValue: true, hint: '500' },
  greaterThan: { needsValue: true, hint: '0' },
  isSuccess: { needsValue: false, hint: '' },
  contains: { needsValue: true, hint: 'json' },
  notContains: { needsValue: true, hint: 'error' },
  matches: { needsValue: true, hint: '/^[a-z0-9-]+$/i' },
  exists: { needsValue: false, hint: '' },
  absent: { needsValue: false, hint: '' },
  isType: { needsValue: true, hint: 'string' },
  isEmpty: { needsValue: false, hint: '' },
  notEmpty: { needsValue: false, hint: '' },
  lengthIs: { needsValue: true, hint: '10' },
  between: { needsValue: true, hint: '200-299' },
  isClass: { needsValue: true, hint: '2xx' },
  notMatches: { needsValue: true, hint: '/error/i' },
  isJson: { needsValue: false, hint: '' },
  startsWith: { needsValue: true, hint: 'Bearer' },
  endsWith: { needsValue: true, hint: '.com' },
  isFormat: { needsValue: true, hint: 'email' },
  isNull: { needsValue: false, hint: '' },
  notNull: { needsValue: false, hint: '' },
  isTrue: { needsValue: false, hint: '' },
  isFalse: { needsValue: false, hint: '' },
  includes: { needsValue: true, hint: 'admin' },
  isUnique: { needsValue: false, hint: '' },
  isSorted: { needsValue: true, hint: 'asc' },
  lengthAbove: { needsValue: true, hint: '0' },
  lengthBelow: { needsValue: true, hint: '100' },
  matchesSchema: { needsValue: true, hint: '{ "type": "object" }' },
  hasFlag: { needsValue: true, hint: 'HttpOnly' },
  isHttps: { needsValue: false, hint: '' }
}

/** Whether the value box applies. Takes an assertion or a bare op id. */
export function needsValue(a) {
  const op = typeof a === 'string' ? a : a?.op
  return OP_META[op]?.needsValue ?? true
}

/**
 * Whether the path box applies: `true` for json, header and cookie, `false`
 * where there is nothing to point into, and `'optional'` for a schema, which
 * checks the whole body unless told to look somewhere narrower. An empty json
 * path is allowed too, and means the whole body.
 */
export function needsPath(a) {
  const subject = typeof a === 'string' ? a : a?.subject
  if (subject === 'json' || subject === 'header' || subject === 'cookie') return true
  if (subject === 'schema') return 'optional'
  return false
}

export const TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i

function realDate(text) {
  const m = DATE.exec(text)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1) return false
  // The calendar decides, so 2023-02-29 is turned away and 2024-02-29 is not.
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

function realTime(text) {
  const m = TIME.exec(text)
  if (!m) return false
  return Number(m[1]) <= 23 && Number(m[2]) <= 59 && (m[3] === undefined || Number(m[3]) <= 60)
}

function webUrl(text) {
  if (/\s/.test(text)) return false
  try {
    const url = new URL(text)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

/**
 * Named string formats, for `isFormat` and for schema `format`.
 *
 * Each is strict enough to catch the field that came back holding the wrong
 * thing — a name where an email should be — and lenient where real APIs
 * differ, such as a timestamp without a zone.
 */
export const FORMATS = {
  email: { label: 'Email address', test: (s) => /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(s) },
  uuid: { label: 'UUID', test: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) },
  date: { label: 'Date (YYYY-MM-DD)', test: (s) => realDate(s) },
  'date-time': {
    label: 'Date and time (ISO 8601)',
    test: (s) => {
      const at = s.search(/[Tt]/)
      return at === 10 && realDate(s.slice(0, 10)) && realTime(s.slice(11))
    }
  },
  time: { label: 'Time of day', test: (s) => realTime(s) },
  uri: { label: 'URI (http or https)', test: webUrl },
  url: { label: 'URL (http or https)', test: webUrl },
  ipv4: { label: 'IPv4 address', test: (s) => /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(s) },
  ipv6: {
    label: 'IPv6 address',
    test: (s) => {
      // The URL parser already knows every legal compression of an IPv6
      // address; asking it beats a page-long regex.
      if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return false
      try {
        return new URL(`http://[${s}]/`).hostname.length > 2
      } catch {
        return false
      }
    }
  },
  hostname: { label: 'Hostname', test: (s) => s.length <= 253 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(s) },
  jwt: { label: 'JSON Web Token', test: (s) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s) },
  hex: { label: 'Hexadecimal', test: (s) => /^(?:0x)?[0-9a-f]+$/i.test(s) },
  base64: { label: 'Base64', test: (s) => s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s) },
  numeric: { label: 'Numeric text', test: (s) => /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s) },
  semver: {
    label: 'Semantic version',
    test: (s) => /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(s)
  }
}

export function emptyAssertion(over = {}) {
  return { id: `as-${Math.random().toString(36).slice(2, 9)}`, subject: 'status', path: '', op: 'equals', value: '200', on: true, ...over }
}

/* ------------------------------------------------------------------ paths */

const ANY = Symbol('any')

/**
 * Splits a path into steps. `$`, `$.` and bracketed quotes are accepted so a
 * path copied from another tool works as pasted; a bracket that is none of
 * index, wildcard or quoted key stays part of the name, as it always did.
 */
function steps(path) {
  let text = String(path ?? '').trim()
  if (text === '$') return []
  if (text.startsWith('$.') || text.startsWith('$[')) text = text.slice(1)
  const out = []
  let word = ''
  const flush = () => {
    if (word) out.push(word === '*' ? ANY : word)
    word = ''
  }
  for (let i = 0; i < text.length; ) {
    const ch = text[i]
    if (ch === '.') {
      flush()
      i += 1
      continue
    }
    if (ch === '[') {
      const m = /^\[\s*(?:'([^']*)'|"([^"]*)"|(-?\d+|\*))\s*\]/.exec(text.slice(i))
      if (m) {
        flush()
        out.push(m[3] === '*' ? ANY : (m[3] ?? m[1] ?? m[2]))
        i += m[0].length
        continue
      }
    }
    word += ch
    i += 1
  }
  flush()
  return out
}

/** One step down, with `-1` counting from the end of an array. */
function child(node, key) {
  if (node === null || typeof node !== 'object') return { found: false }
  if (Array.isArray(node) && /^-\d+$/.test(key)) {
    const index = node.length + Number(key)
    return index >= 0 ? { found: true, value: node[index], key: String(index) } : { found: false }
  }
  // Own keys only, so `constructor` is not something every object "has".
  return Object.hasOwn(node, key) ? { found: true, value: node[key], key } : { found: false }
}

function joinPath(trail, key, inArray) {
  if (key === ANY) return `${trail}[*]`
  if (inArray && /^\d+$/.test(key)) return `${trail}[${key}]`
  if (/^[A-Za-z_$][\w$-]*$/.test(key) || /^\d+$/.test(key)) return trail ? `${trail}.${key}` : key
  return `${trail}[${JSON.stringify(key)}]`
}

/**
 * Reads a dotted path out of parsed JSON.
 *
 * `data.items[0].id` and `data.items.0.id` both work, because people write
 * both and being strict about it only produces assertions that fail for the
 * wrong reason. A leading `$` and negative indexes (`[-1]` is the last item)
 * are accepted too. Returns `undefined` for anything not present; a path with
 * a wildcard returns the list of everything it reached.
 */
export function jsonPath(value, path) {
  if (!path) return value
  const all = jsonPathAll(value, path)
  if (all.many) return all.values.filter((v) => v.value !== undefined).map((v) => v.value)
  return all.values[0]?.value
}

/**
 * Every value a path reaches, each with the concrete path it was found at.
 *
 * `[*]` and `.*` fan out over array items or object values, as often as the
 * path asks. Once a wildcard has fanned out, a branch that is missing the rest
 * of the path is still reported — as `value: undefined` at the path it should
 * have had — because "item 3 has no price" is exactly the failure an every-item
 * assertion exists to find.
 */
export function jsonPathAll(value, path) {
  const tokens = steps(path)
  const many = tokens.includes(ANY)
  const values = []
  const rest = (trail, from, inArray) => {
    let p = trail
    let arr = inArray
    for (let j = from; j < tokens.length; j++) {
      p = joinPath(p, tokens[j], arr)
      arr = false
    }
    return p
  }
  const walk = (node, i, trail, fanned) => {
    if (i === tokens.length) {
      values.push({ path: trail, value: node })
      return
    }
    const token = tokens[i]
    if (token === ANY) {
      if (node === null || typeof node !== 'object') {
        if (fanned && node === undefined) values.push({ path: rest(trail, i, false), value: undefined })
        return
      }
      const keys = Array.isArray(node) ? node.map((_v, k) => String(k)) : Object.keys(node)
      for (const key of keys) walk(node[key], i + 1, joinPath(trail, key, Array.isArray(node)), true)
      return
    }
    const step = child(node, token)
    if (!step.found) {
      if (fanned) values.push({ path: rest(trail, i, Array.isArray(node)), value: undefined })
      return
    }
    walk(step.value, i + 1, joinPath(trail, step.key, Array.isArray(node)), fanned)
  }
  walk(value, 0, '', false)
  return { many, values }
}

/* ---------------------------------------------------------------- helpers */

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** Loose where it helps: "200" from a text field must match the number 200. */
function same(a, b) {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  return String(a) === String(b)
}

/** Key order does not make two objects different. */
function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/**
 * Equality for a value out of JSON against text from a value box: deep when
 * both sides are structures, `null` for "null", and `same` for the rest.
 */
function jsonSame(found, expected) {
  if (found !== null && typeof found === 'object') {
    try {
      const parsed = JSON.parse(expected)
      if (parsed !== null && typeof parsed === 'object') return canon(parsed) === canon(found)
    } catch {
      return false
    }
    return false
  }
  if (found === null) return String(expected).trim() === 'null'
  return same(found, expected)
}

function show(value) {
  if (value === undefined) return 'nothing'
  if (typeof value === 'string') return `"${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`
  if (value === null) return 'null'
  if (typeof value === 'object') return Array.isArray(value) ? `an array of ${value.length}` : 'an object'
  return String(value)
}

/** A number from JSON or header text; NaN for anything that is not one. */
function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim())
  return NaN
}

/** `200-299`, `200..299`, `200,299`, `200 299` and `200 to 299`, inclusive. */
function range(text) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|-|,|to|and|\s)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(String(text ?? ''))
  if (!m) return null
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a <= b ? [a, b] : [b, a]
}

const rangeError = (text) => `"${text}" is not a range — write it as 200-299`

function list(text) {
  return String(text ?? '').split(/[,\s|]+/).filter(Boolean)
}

/**
 * A pattern from the value box: `/pattern/flags` or a bare pattern. `g` and
 * `y` are dropped, since they make `test` remember where it stopped.
 */
function pattern(text) {
  const literal = /^\/([\s\S]+)\/([a-z]*)$/.exec(text)
  try {
    if (literal) return { re: new RegExp(literal[1], literal[2].replace(/[gy]/g, '')), shown: text }
    return { re: new RegExp(text), shown: `/${text}/` }
  } catch (err) {
    // A broken pattern is the assertion's fault, and saying so beats
    // reporting the response as wrong.
    return { error: `that is not a valid pattern — ${err.message}` }
  }
}

function lengthOf(value) {
  if (Array.isArray(value) || typeof value === 'string') return value.length
  if (value !== null && typeof value === 'object') return Object.keys(value).length
  return undefined
}

function isEmptyValue(value) {
  return value === null || value === '' || lengthOf(value) === 0
}

/** Text for the text operators; numbers and booleans read as written. */
function asText(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * One operator against one value, for the JSON operators that are not about
 * presence. Returns `{ ok, saw, want }` — what was there and what was asked,
 * phrased to read after "is" and "expected" — or `{ error }` when the
 * assertion itself cannot be run as written.
 */
function judge(op, found, expected) {
  const saw = show(found)
  const numeric = (test, want) => {
    const n = num(found)
    if (Number.isNaN(n)) return { ok: false, saw: `${saw}, not a number`, want }
    return { ok: test(n), saw, want }
  }
  const textual = (test, want) => {
    const text = asText(found)
    if (text === undefined) return { ok: false, saw: `${typeOf(found)}, not text`, want }
    return { ok: test(text), saw, want }
  }
  switch (op) {
    case 'equals':
      return { ok: jsonSame(found, expected), saw, want: expected }
    case 'notEquals':
      return { ok: !jsonSame(found, expected), saw, want: `not ${expected}` }
    case 'oneOf': {
      const items = list(expected)
      return { ok: items.some((v) => jsonSame(found, v)), saw, want: `one of ${items.join(', ') || '(nothing listed)'}` }
    }
    case 'isType': {
      const want = expected.trim().toLowerCase()
      if (!TYPES.includes(want)) return { error: `"${expected}" is not a type — use ${TYPES.join(', ')}` }
      const kind = typeOf(found)
      const ok = want === 'integer' ? Number.isInteger(found) : kind === want
      return { ok, saw: want === 'integer' && kind === 'number' && !ok ? `a fraction (${found})` : kind, want }
    }
    case 'contains':
    case 'notContains': {
      const text = typeof found === 'string' ? found : JSON.stringify(found)
      const has = text.includes(expected) || (Array.isArray(found) && found.some((v) => jsonSame(v, expected)))
      return op === 'contains'
        ? { ok: has, saw, want: `containing "${expected}"` }
        : { ok: !has, saw, want: `not containing "${expected}"` }
    }
    case 'includes':
      if (!Array.isArray(found)) return { ok: false, saw: `${typeOf(found)}, not an array`, want: `an array including ${expected}` }
      return { ok: found.some((v) => jsonSame(v, expected)), saw: `[${found.slice(0, 5).map((v) => JSON.stringify(v)).join(', ')}${found.length > 5 ? ', …' : ''}]`, want: `an array including ${expected}` }
    case 'lengthIs':
    case 'lengthAbove':
    case 'lengthBelow': {
      const n = Number(expected)
      if (expected.trim() === '' || Number.isNaN(n)) return { error: `"${expected}" is not a number` }
      const length = lengthOf(found)
      const want = op === 'lengthIs' ? `length ${n}` : op === 'lengthAbove' ? `length over ${n}` : `length under ${n}`
      if (length === undefined) return { ok: false, saw: `${typeOf(found)} and has no length`, want }
      const ok = op === 'lengthIs' ? length === n : op === 'lengthAbove' ? length > n : length < n
      return { ok, saw: `of length ${length}`, want }
    }
    case 'greaterThan':
    case 'lessThan': {
      const limit = num(expected)
      if (Number.isNaN(limit)) return { error: `"${expected}" is not a number` }
      return op === 'greaterThan' ? numeric((n) => n > limit, `over ${limit}`) : numeric((n) => n < limit, `under ${limit}`)
    }
    case 'between': {
      const r = range(expected)
      if (!r) return { error: rangeError(expected) }
      return numeric((n) => n >= r[0] && n <= r[1], `between ${r[0]} and ${r[1]}`)
    }
    case 'matches':
    case 'notMatches': {
      const p = pattern(expected)
      if (p.error) return { error: p.error }
      return op === 'matches'
        ? textual((t) => p.re.test(t), `matching ${p.shown}`)
        : textual((t) => !p.re.test(t), `not matching ${p.shown}`)
    }
    case 'startsWith':
      return textual((t) => t.startsWith(expected), `starting with "${expected}"`)
    case 'endsWith':
      return textual((t) => t.endsWith(expected), `ending with "${expected}"`)
    case 'isFormat': {
      const name = expected.trim().toLowerCase()
      const format = FORMATS[name]
      if (!format) return { error: `Prism has no format called "${expected}" — try ${Object.keys(FORMATS).join(', ')}` }
      return textual((t) => format.test(t), `a valid ${name}`)
    }
    case 'isEmpty':
      return { ok: isEmptyValue(found), saw, want: 'empty' }
    case 'notEmpty':
      return { ok: !isEmptyValue(found), saw, want: 'not empty' }
    case 'isNull':
      return { ok: found === null, saw, want: 'null' }
    case 'notNull':
      return { ok: found !== null, saw, want: 'not null' }
    case 'isTrue':
      return { ok: found === true, saw, want: 'true' }
    case 'isFalse':
      return { ok: found === false, saw, want: 'false' }
    default:
      return { error: 'that assertion is not one Prism knows' }
  }
}

/**
 * The operators that look at a list as a whole — the array at a path, or
 * everything a wildcard collected. Each item carries its path so a duplicate
 * or an out-of-order pair can be pointed at.
 */
function judgeList(op, items, expected) {
  if (op === 'isUnique') {
    const seen = new Map()
    for (const item of items) {
      const key = canon(item.value)
      if (seen.has(key)) return { ok: false, detail: `${show(item.value)} appears at ${seen.get(key)} and ${item.path}` }
      seen.set(key, item.path)
    }
    return { ok: true, detail: `all ${items.length} are distinct` }
  }
  const dir = (expected.trim().toLowerCase() || 'asc').replace(/ending$/, '')
  if (dir !== 'asc' && dir !== 'desc') return { error: `"${expected}" is not an order — use asc or desc` }
  const word = dir === 'asc' ? 'ascending' : 'descending'
  const kinds = new Set(items.map((i) => typeof i.value))
  if (kinds.size > 1 || (items.length && !kinds.has('number') && !kinds.has('string'))) {
    return { ok: false, detail: `holds ${[...kinds].join(' and ')} values, which have no single order` }
  }
  for (let i = 1; i < items.length; i++) {
    const [prev, cur] = [items[i - 1].value, items[i].value]
    const order = typeof cur === 'number' ? cur - prev : String(cur).localeCompare(String(prev))
    if (dir === 'asc' ? order < 0 : order > 0) {
      return { ok: false, detail: `${items[i].path} (${show(cur)}) comes after ${items[i - 1].path} (${show(prev)}), so it is not ${word}` }
    }
  }
  return { ok: true, detail: `${items.length} in ${word} order` }
}

/* ------------------------------------------------------------------ check */

/**
 * Runs one assertion against a response.
 *
 * `response` is `{ status, headers, body, bytes, timing, json, redirects,
 * secure }` — `json` is the parsed body when it parsed, so every JSON
 * assertion in a run shares one parse rather than repeating it.
 */
export function check(assertion, response) {
  const a = assertion ?? {}
  const expected = String(a.value ?? '')
  const fail = (detail) => ({ id: a.id, ok: false, detail })
  const pass = (detail) => ({ id: a.id, ok: true, detail })
  response = response ?? {}

  switch (a.subject) {
    case 'status': {
      const status = response.status ?? 0
      if (a.op === 'isSuccess') {
        return status >= 200 && status < 300 ? pass(`${status} is a success`) : fail(`${status} is not a success`)
      }
      if (a.op === 'oneOf') {
        const items = list(expected)
        return items.some((code) => same(code, status))
          ? pass(`${status} is one of ${items.join(', ')}`)
          : fail(`${status} is not one of ${items.join(', ') || '(nothing listed)'}`)
      }
      if (a.op === 'isClass') {
        const m = /^\s*([1-5])(?:xx)?\s*$/i.exec(expected)
        if (!m) return fail(`"${expected}" is not a status class — write 2xx, 3xx, 4xx or 5xx`)
        return Math.floor(status / 100) === Number(m[1]) ? pass(`${status} is in class ${m[1]}xx`) : fail(`${status} is not in class ${m[1]}xx`)
      }
      if (a.op === 'lessThan') {
        return status < Number(expected) ? pass(`${status} is under ${expected}`) : fail(`${status} is not under ${expected}`)
      }
      if (a.op === 'greaterThan') {
        return status > Number(expected) ? pass(`${status} is over ${expected}`) : fail(`${status} is not over ${expected}`)
      }
      if (a.op === 'between') {
        const r = range(expected)
        if (!r) return fail(rangeError(expected))
        return status >= r[0] && status <= r[1] ? pass(`${status} is between ${r[0]} and ${r[1]}`) : fail(`${status} is outside ${r[0]}–${r[1]}`)
      }
      if (a.op === 'notEquals') {
        return !same(status, expected) ? pass(`${status} is not ${expected}`) : fail(`${status} is ${expected}`)
      }
      return same(status, expected) ? pass(`${status} as expected`) : fail(`${status}, expected ${expected}`)
    }

    case 'time': {
      const ms = response.timing?.total ?? 0
      if (a.op === 'greaterThan') {
        return ms > Number(expected) ? pass(`${ms}ms is over ${expected}ms`) : fail(`${ms}ms is not over ${expected}ms`)
      }
      if (a.op === 'between') {
        const r = range(expected)
        if (!r) return fail(rangeError(expected))
        return ms >= r[0] && ms <= r[1] ? pass(`${ms}ms, within ${r[0]}–${r[1]}ms`) : fail(`took ${ms}ms, outside ${r[0]}–${r[1]}ms`)
      }
      return ms < Number(expected) ? pass(`${ms}ms, budget ${expected}ms`) : fail(`took ${ms}ms, budget ${expected}ms`)
    }

    case 'size': {
      const bytes = response.bytes ?? 0
      if (a.op === 'greaterThan') {
        return bytes > Number(expected) ? pass(`${bytes} B is over ${expected}`) : fail(`${bytes} B is not over ${expected}`)
      }
      if (a.op === 'between') {
        const r = range(expected)
        if (!r) return fail(rangeError(expected))
        return bytes >= r[0] && bytes <= r[1] ? pass(`${bytes} B, within ${r[0]}–${r[1]}`) : fail(`${bytes} B, outside ${r[0]}–${r[1]}`)
      }
      return bytes < Number(expected) ? pass(`${bytes} B, under ${expected}`) : fail(`${bytes} B, over ${expected}`)
    }

    case 'contentType': {
      const type = header(response, 'content-type')
      if (a.op === 'equals') {
        return same(type, expected) ? pass(`content type is ${expected}`) : fail(`content type is ${show(type)}`)
      }
      if (a.op === 'notContains') {
        return !type.toLowerCase().includes(expected.toLowerCase())
          ? pass(`content type ${show(type)} does not contain "${expected}"`)
          : fail(`content type ${show(type)} contains "${expected}"`)
      }
      if (a.op === 'matches') {
        const p = pattern(expected)
        if (p.error) return fail(p.error)
        return p.re.test(type) ? pass(`content type ${show(type)} matches ${p.shown}`) : fail(`content type ${show(type)} does not match ${p.shown}`)
      }
      return type.toLowerCase().includes(expected.toLowerCase())
        ? pass(`content type ${show(type)}`)
        : fail(`content type ${show(type)} does not contain "${expected}"`)
    }

    case 'header': {
      const name = String(a.path ?? '')
      const has = Object.keys(response.headers ?? {}).some((k) => k.toLowerCase() === name.toLowerCase())
      const value = header(response, name)
      if (a.op === 'absent') return has ? fail(`${name} is present`) : pass(`${name} is absent`)
      if (a.op === 'exists') return has ? pass(`${name} is present`) : fail(`${name} is missing`)
      if (!has) return fail(`${name} is missing`)
      if (a.op === 'contains') {
        return value.includes(expected) ? pass(`${name} contains "${expected}"`) : fail(`${name} is ${show(value)}`)
      }
      if (a.op === 'notContains') {
        return !value.includes(expected) ? pass(`${name} does not contain "${expected}"`) : fail(`${name} contains "${expected}"`)
      }
      if (a.op === 'notEquals') {
        return !same(value, expected) ? pass(`${name} is ${show(value)}, not ${expected}`) : fail(`${name} is ${expected}`)
      }
      if (a.op === 'startsWith') {
        return value.startsWith(expected) ? pass(`${name} starts with "${expected}"`) : fail(`${name} is ${show(value)}`)
      }
      if (['matches', 'oneOf', 'lessThan', 'greaterThan'].includes(a.op)) {
        const j = judge(a.op, value, expected)
        if (j.error) return fail(j.error)
        return j.ok ? pass(`${name} is ${j.saw}, ${j.want}`) : fail(`${name} is ${j.saw}, expected ${j.want}`)
      }
      return same(value, expected) ? pass(`${name} is ${expected}`) : fail(`${name} is ${show(value)}, expected ${expected}`)
    }

    case 'body': {
      const text = String(response.body ?? '')
      if (a.op === 'isEmpty') return text.length === 0 ? pass('body is empty') : fail(`body has ${text.length} characters`)
      if (a.op === 'notEmpty') return text.length > 0 ? pass(`body has ${text.length} characters`) : fail('body is empty')
      if (a.op === 'notContains') {
        return !text.includes(expected) ? pass(`does not contain "${expected}"`) : fail(`contains "${expected}"`)
      }
      if (a.op === 'matches' || a.op === 'notMatches') {
        const p = pattern(expected)
        if (p.error) return fail(p.error)
        const hit = p.re.test(text)
        if (a.op === 'notMatches') return hit ? fail(`matches ${p.shown}`) : pass(`does not match ${p.shown}`)
        return hit ? pass(`matches ${p.shown}`) : fail(`does not match ${p.shown}`)
      }
      if (a.op === 'equals') {
        return text === expected ? pass('body is exactly as expected') : fail(`body is ${show(text)}, expected "${expected}"`)
      }
      if (a.op === 'startsWith') {
        return text.startsWith(expected) ? pass(`starts with "${expected}"`) : fail(`starts with ${show(text.slice(0, Math.max(expected.length, 20)))}`)
      }
      if (a.op === 'isJson') {
        if (response.json !== undefined) return pass('body is valid JSON')
        if (!text.trim()) return fail('body is empty, not JSON')
        try {
          JSON.parse(text)
          return pass('body is valid JSON')
        } catch (err) {
          return fail(`body is not valid JSON — ${err.message}`)
        }
      }
      return text.includes(expected) ? pass(`contains "${expected}"`) : fail(`does not contain "${expected}"`)
    }

    case 'json': {
      if (response.json === undefined) return fail('the response is not JSON')
      const all = jsonPathAll(response.json, a.path)
      if (all.many) return checkEvery(a, all, expected, pass, fail)
      const found = a.path ? all.values[0]?.value : response.json
      const at = a.path ? `${a.path}` : 'the body'
      if (a.op === 'absent') return found === undefined ? pass(`${at} is absent`) : fail(`${at} is ${show(found)}`)
      if (a.op === 'exists') return found !== undefined ? pass(`${at} is present`) : fail(`${at} is missing`)
      if (found === undefined) return fail(`${at} is missing`)
      if (a.op === 'isType') {
        const j = judge('isType', found, expected)
        if (j.error) return fail(j.error)
        return j.ok ? pass(`${at} is ${expected}`) : fail(`${at} is ${j.saw}, expected ${expected}`)
      }
      if (a.op === 'lengthIs') {
        const length = lengthOf(found)
        if (length === undefined) return fail(`${at} is ${typeOf(found)} and has no length`)
        return same(length, expected) ? pass(`${at} has ${length}`) : fail(`${at} has ${length}, expected ${expected}`)
      }
      if (a.op === 'contains') {
        const j = judge('contains', found, expected)
        return j.ok ? pass(`${at} contains "${expected}"`) : fail(`${at} is ${show(found)}`)
      }
      if (a.op === 'notEquals') {
        return !jsonSame(found, expected) ? pass(`${at} is not ${expected}`) : fail(`${at} is ${expected}`)
      }
      if (a.op === 'isUnique' || a.op === 'isSorted') {
        if (!Array.isArray(found)) return fail(`${at} is ${typeOf(found)}, not an array`)
        const base = a.path ? String(a.path) : ''
        const r = judgeList(a.op, found.map((value, i) => ({ path: `${base}[${i}]`, value })), expected)
        if (r.error) return fail(r.error)
        return r.ok ? pass(`${at}: ${r.detail}`) : fail(`${at}: ${r.detail}`)
      }
      if (a.op === 'equals' || !OPERATORS.json.includes(a.op)) {
        return jsonSame(found, expected) ? pass(`${at} is ${expected}`) : fail(`${at} is ${show(found)}, expected ${expected}`)
      }
      const j = judge(a.op, found, expected)
      if (j.error) return fail(j.error)
      if (j.ok) return pass(j.saw === j.want ? `${at} is ${j.saw}` : `${at} is ${j.saw}, ${j.want}`)
      return fail(`${at} is ${j.saw}, expected ${j.want}`)
    }

    case 'schema': {
      if (response.json === undefined) return fail('the response is not JSON')
      let schema
      try {
        schema = JSON.parse(expected)
      } catch (err) {
        return fail(`that schema is not valid JSON — ${err.message}`)
      }
      const all = a.path ? jsonPathAll(response.json, a.path) : { many: false, values: [{ path: '', value: response.json }] }
      if (!all.values.length) return fail(all.many ? `${a.path} matched nothing` : `${a.path} is missing`)
      const errors = []
      for (const v of all.values) {
        const at = v.path ? `$${v.path.startsWith('[') ? '' : '.'}${v.path}` : '$'
        if (v.value === undefined) errors.push({ path: at, message: 'is missing' })
        else errors.push(...validateSchema(schema, v.value, at))
      }
      const what = a.path ? (all.many ? `all ${all.values.length} ${a.path}` : a.path) : 'the body'
      if (!errors.length) return pass(`${what} ${all.many && all.values.length > 1 ? 'match' : 'matches'} the schema`)
      const [first] = errors
      return fail(`${first.path} ${first.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`)
    }

    case 'cookie': {
      const name = String(a.path ?? '').trim()
      const jar = parseCookies(response.headers)
      const cookie = [...jar].reverse().find((c) => c.name === name) ?? [...jar].reverse().find((c) => c.name.toLowerCase() === name.toLowerCase())
      const seen = jar.length ? ` (saw ${[...new Set(jar.map((c) => c.name))].join(', ')})` : ' (no cookies were set)'
      if (a.op === 'absent') return cookie ? fail(`${name} is set`) : pass(`${name} is not set`)
      if (!cookie) return fail(`${name || 'that cookie'} is not set${seen}`)
      if (a.op === 'exists') return pass(`${name} is set`)
      if (a.op === 'equals') {
        return same(cookie.value, expected) ? pass(`${name} is ${expected}`) : fail(`${name} is ${show(cookie.value)}, expected ${expected}`)
      }
      if (a.op === 'contains') {
        return cookie.value.includes(expected) ? pass(`${name} contains "${expected}"`) : fail(`${name} is ${show(cookie.value)}`)
      }
      const flags = list(expected)
      if (!flags.length) return fail('name a flag to look for, such as HttpOnly')
      for (const flag of flags) {
        const [key, want] = flag.split('=')
        const attr = cookie.attributes.find((x) => x.name.toLowerCase() === key.toLowerCase())
        if (!attr) return fail(`${name} has no ${key} flag`)
        if (want !== undefined && attr.value.toLowerCase() !== want.toLowerCase()) {
          return fail(`${name} has ${attr.name}=${attr.value}, expected ${want}`)
        }
      }
      return pass(`${name} has ${flags.join(', ')}`)
    }

    case 'redirects': {
      const hops = response.redirects ?? 0
      const noun = hops === 1 ? 'redirect' : 'redirects'
      if (a.op === 'equals') return same(hops, expected) ? pass(`${hops} ${noun}, as expected`) : fail(`${hops} ${noun}, expected ${expected}`)
      return hops < Number(expected) ? pass(`${hops} ${noun}, under ${expected}`) : fail(`${hops} ${noun}, limit was under ${expected}`)
    }

    case 'transport': {
      const url = String(response.request?.url ?? response.url ?? '')
      return response.secure === true || /^https:/i.test(url) ? pass('served over HTTPS') : fail('not served over HTTPS')
    }

    default:
      return fail('that assertion is not one Prism knows')
  }
}

/**
 * A wildcard path asks about every value it reaches. Presence reads as "any"
 * and "none", the list operators look at the whole collection, and the rest
 * must hold for each item — with the first item that does not named, since
 * "one of 40 prices is negative" is no help until it says which.
 */
function checkEvery(a, all, expected, pass, fail) {
  const path = String(a.path)
  const present = all.values.filter((v) => v.value !== undefined)
  if (a.op === 'absent') {
    return present.length ? fail(`${present[0].path} is ${show(present[0].value)}`) : pass(`no ${path} exist`)
  }
  if (!all.values.length || (a.op === 'exists' && !present.length)) return fail(`${path} matched nothing`)
  if (a.op === 'exists') return pass(`${present.length} of ${all.values.length} ${path} exist`)
  if (a.op === 'isUnique' || a.op === 'isSorted') {
    const r = judgeList(a.op, present, expected)
    if (r.error) return fail(r.error)
    return r.ok ? pass(`${path}: ${r.detail}`) : fail(`${path}: ${r.detail}`)
  }
  let want = ''
  for (const v of all.values) {
    if (v.value === undefined) return fail(`${v.path} is missing`)
    const j = judge(OPERATORS.json.includes(a.op) ? a.op : 'equals', v.value, expected)
    if (j.error) return fail(j.error)
    if (!j.ok) return fail(`${v.path} is ${j.saw}, expected ${j.want}`)
    want = j.want
  }
  const n = all.values.length
  return pass(n === 1 ? `the 1 ${path} is ${want}` : `all ${n} ${path} are ${want}`)
}

function header(response, name) {
  const key = Object.keys(response.headers ?? {}).find((k) => k.toLowerCase() === String(name).toLowerCase())
  return key ? String(response.headers[key]) : ''
}

/**
 * Every cookie the response sets, as `{ name, value, attributes }`.
 *
 * Set-Cookie arrives as an array or — once flattened — as one string joined
 * with commas, and an `Expires=Wed, 21 Oct 2026 …` date has a comma of its
 * own. A split is only made where a comma is followed by `name=`; the comma
 * in a date is followed by a day number and a space, never by `=`.
 */
export function parseCookies(headers) {
  const raw = []
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() !== 'set-cookie') continue
    if (Array.isArray(value)) raw.push(...value.map(String))
    else raw.push(...String(value ?? '').split(/,(?=\s*[^;,=\s]+=)/))
  }
  const out = []
  for (const text of raw) {
    const [pair, ...attrs] = text.split(';')
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    const value = pair.slice(eq + 1).trim()
    out.push({
      name: pair.slice(0, eq).trim(),
      value: value.length > 1 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value,
      attributes: attrs
        .map((attr) => {
          const at = attr.indexOf('=')
          return at < 0 ? { name: attr.trim(), value: '' } : { name: attr.slice(0, at).trim(), value: attr.slice(at + 1).trim() }
        })
        .filter((attr) => attr.name)
    })
  }
  return out
}

/** Every enabled assertion, in order. */
export function runAll(assertions, response) {
  return (assertions ?? []).filter((a) => a && a.on !== false).map((a) => ({ ...check(a, response), assertion: a }))
}

/* ----------------------------------------------------------------- schema */

function childPath(at, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${at}.${key}` : `${at}[${JSON.stringify(key)}]`
}

function fitsType(type, value) {
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeOf(value) === type
}

/** Follows a `#/…` pointer inside the same document. */
function resolveRef(root, ref) {
  if (ref === '#') return root
  if (!ref.startsWith('#/')) return undefined
  let node = root
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return undefined
    node = node[key]
  }
  return node
}

const brief = (value) => {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

/**
 * Checks a value against a JSON Schema and lists every way it falls short,
 * each as `{ path, message }` with the path written `$.user.id`.
 *
 * Covers the keywords response contracts are actually written in — types,
 * enum and const, object and array shape, string and number limits, formats,
 * the combinators, OpenAPI's `nullable` and local `$ref`s. Keywords it does
 * not know are ignored rather than failed, as the spec asks of annotations.
 */
export function validateSchema(schema, value, at = '$') {
  const errors = []
  visit(schema, value, at, schema, errors, 0)
  return errors
}

function visit(schema, value, at, root, errors, depth) {
  if (schema === true || schema === undefined || schema === null) return
  if (schema === false) {
    errors.push({ path: at, message: 'is not allowed here' })
    return
  }
  if (typeof schema !== 'object' || depth > 100) return
  const push = (message, path = at) => errors.push({ path, message })

  if (typeof schema.$ref === 'string') {
    const target = resolveRef(root, schema.$ref)
    if (target === undefined) push(`refers to ${schema.$ref}, which the schema does not define`)
    else visit(target, value, at, root, errors, depth + 1)
  }
  if (schema.nullable === true && value === null) return

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => fitsType(t, value))) {
      // A wrong type makes every other keyword's complaint noise.
      push(`should be ${types.join(' or ')}, saw ${typeOf(value)}`)
      return
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => canon(v) === canon(value))) {
    push(`should be one of ${schema.enum.map(brief).join(', ')}, saw ${brief(value)}`)
  }
  if (Object.hasOwn(schema, 'const') && canon(schema.const) !== canon(value)) {
    push(`should be ${brief(schema.const)}, saw ${brief(value)}`)
  }

  if (typeof value === 'string') {
    const length = [...value].length
    if (typeof schema.minLength === 'number' && length < schema.minLength) push(`should be at least ${schema.minLength} characters, saw ${length}`)
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) push(`should be at most ${schema.maxLength} characters, saw ${length}`)
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value)) push(`should match /${schema.pattern}/, saw ${brief(value)}`)
      } catch {
        push(`has a pattern that is not valid: /${schema.pattern}/`)
      }
    }
    const format = FORMATS[String(schema.format ?? '').toLowerCase()]
    if (format && !format.test(value)) push(`should be a valid ${schema.format}, saw ${brief(value)}`)
  }

  if (typeof value === 'number') {
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = schema
    // Draft 4 wrote exclusivity as a flag on minimum and maximum.
    if (typeof minimum === 'number' && (exclusiveMinimum === true ? value <= minimum : value < minimum)) {
      push(`should be ${exclusiveMinimum === true ? 'over' : 'at least'} ${minimum}, saw ${value}`)
    }
    if (typeof maximum === 'number' && (exclusiveMaximum === true ? value >= maximum : value > maximum)) {
      push(`should be ${exclusiveMaximum === true ? 'under' : 'at most'} ${maximum}, saw ${value}`)
    }
    if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) push(`should be over ${exclusiveMinimum}, saw ${value}`)
    if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) push(`should be under ${exclusiveMaximum}, saw ${value}`)
    if (typeof multipleOf === 'number' && multipleOf > 0) {
      const q = value / multipleOf
      if (Math.abs(q - Math.round(q)) > 1e-9) push(`should be a multiple of ${multipleOf}, saw ${value}`)
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) push(`should have at least ${schema.minItems} items, saw ${value.length}`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) push(`should have at most ${schema.maxItems} items, saw ${value.length}`)
    if (schema.uniqueItems === true) {
      const seen = new Set()
      for (let i = 0; i < value.length; i++) {
        const key = canon(value[i])
        if (seen.has(key)) {
          push(`should have unique items, but ${brief(value[i])} repeats`, `${at}[${i}]`)
          break
        }
        seen.add(key)
      }
    }
    // Draft 4 tuples are `items: [...]`; 2020-12 calls them prefixItems.
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : Array.isArray(schema.items) ? schema.items : []
    prefix.forEach((s, i) => {
      if (i < value.length) visit(s, value[i], `${at}[${i}]`, root, errors, depth + 1)
    })
    const rest = Array.isArray(schema.items) ? schema.additionalItems : schema.items
    if (rest !== undefined) {
      for (let i = prefix.length; i < value.length; i++) visit(rest, value[i], `${at}[${i}]`, root, errors, depth + 1)
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) if (!Object.hasOwn(value, key)) push('is required', childPath(at, key))
    }
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) push(`should have at least ${schema.minProperties} properties, saw ${keys.length}`)
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) push(`should have at most ${schema.maxProperties} properties, saw ${keys.length}`)
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    const patterns = Object.entries(schema.patternProperties ?? {}).map(([p, s]) => {
      try {
        return [new RegExp(p, 'u'), s]
      } catch {
        return [null, s]
      }
    })
    for (const key of keys) {
      const path = childPath(at, key)
      let known = false
      if (Object.hasOwn(props, key)) {
        known = true
        visit(props[key], value[key], path, root, errors, depth + 1)
      }
      for (const [re, s] of patterns) {
        if (re && re.test(key)) {
          known = true
          visit(s, value[key], path, root, errors, depth + 1)
        }
      }
      if (!known && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) push('is not allowed — the schema has no such property', path)
        else visit(schema.additionalProperties, value[key], path, root, errors, depth + 1)
      }
    }
  }

  const passes = (s) => validateWith(s, value, at, root, depth).length === 0
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) visit(s, value, at, root, errors, depth + 1)
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(passes)) {
    push(`should match at least one of ${schema.anyOf.length} alternatives (anyOf)`)
  }
  if (Array.isArray(schema.oneOf)) {
    const count = schema.oneOf.filter(passes).length
    if (count !== 1) push(`should match exactly one of ${schema.oneOf.length} alternatives (oneOf), matched ${count}`)
  }
  if (schema.not !== undefined && passes(schema.not)) push('should not match the "not" schema')
  if (schema.if !== undefined) {
    if (passes(schema.if)) {
      if (schema.then !== undefined) visit(schema.then, value, at, root, errors, depth + 1)
    } else if (schema.else !== undefined) {
      visit(schema.else, value, at, root, errors, depth + 1)
    }
  }
}

function validateWith(schema, value, at, root, depth) {
  const errors = []
  visit(schema, value, at, root, errors, depth + 1)
  return errors
}

/* ------------------------------------------------------------ inferSchema */

/** Formats worth claiming from one sample, most specific first. */
const INFERRED_FORMATS = ['date-time', 'date', 'email', 'uuid', 'uri']

function inferOne(value, sample) {
  if (value === null) return { type: 'null' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' }
  if (typeof value === 'string') {
    const format = INFERRED_FORMATS.find((f) => FORMATS[f].test(value))
    return format ? { type: 'string', format } : { type: 'string' }
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, sample).map((v) => inferOne(v, sample))
    return items.length ? { type: 'array', items: items.reduce(mergeSchemas) } : { type: 'array' }
  }
  const properties = {}
  for (const [key, child] of Object.entries(value)) properties[key] = inferOne(child, sample)
  return { type: 'object', properties, required: Object.keys(value) }
}

const typesOf = (s) => (Array.isArray(s.type) ? s.type : [s.type])

/**
 * Two observed shapes folded into one that both satisfy: types are unioned
 * (integer widening to number), properties are unioned with only the keys
 * both had staying required, and a format survives only if both agreed.
 */
function mergeSchemas(a, b) {
  const types = new Set([...typesOf(a), ...typesOf(b)])
  if (types.has('number')) types.delete('integer')
  const ordered = TYPES.filter((t) => types.has(t))
  const out = { type: ordered.length === 1 ? ordered[0] : ordered }
  const aObj = typesOf(a).includes('object')
  const bObj = typesOf(b).includes('object')
  if (aObj || bObj) {
    const pa = a.properties ?? {}
    const pb = b.properties ?? {}
    const properties = {}
    for (const key of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      properties[key] = pa[key] && pb[key] ? mergeSchemas(pa[key], pb[key]) : (pa[key] ?? pb[key])
    }
    out.properties = properties
    const ra = a.required ?? []
    const rb = b.required ?? []
    out.required = aObj && bObj ? ra.filter((k) => rb.includes(k)) : aObj ? ra : rb
  }
  if (a.items && b.items) out.items = mergeSchemas(a.items, b.items)
  else if (a.items || b.items) out.items = a.items ?? b.items
  const aStr = typesOf(a).includes('string')
  const bStr = typesOf(b).includes('string')
  if (aStr && bStr) {
    if (a.format && a.format === b.format) out.format = a.format
  } else if (aStr || bStr) {
    const format = aStr ? a.format : b.format
    if (format) out.format = format
  }
  return out
}

function tidy(schema) {
  if (Array.isArray(schema.required) && !schema.required.length) delete schema.required
  for (const child of Object.values(schema.properties ?? {})) tidy(child)
  if (schema.items) tidy(schema.items)
  return schema
}

/**
 * A draft-07 schema that the sample satisfies — a starting contract to edit
 * rather than write from nothing. Arrays are described by merging their first
 * `sample` items (20 unless asked), so a field one item lacks is not required.
 */
export function inferSchema(value, { sample = 20 } = {}) {
  return { $schema: 'http://json-schema.org/draft-07/schema#', ...tidy(inferOne(value, sample)) }
}

/* ---------------------------------------------------------------- describe */

function sizeText(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || String(value).trim() === '') return `${value} bytes`
  if (n >= 1048576 && n % 1048576 === 0) return `${n / 1048576} MB`
  if (n >= 1024 && n % 1024 === 0) return `${n / 1024} KB`
  return `${n} bytes`
}

/**
 * A short sentence for a row, a report or a catalog card: "Response time is
 * under 500 ms", "items[*].price is over 0", "Cookie sid has flag HttpOnly".
 */
export function describe(a) {
  const x = a ?? {}
  const path = String(x.path ?? '').trim()
  const subject = {
    status: 'Status',
    time: 'Response time',
    size: 'Response size',
    contentType: 'Content type',
    header: `Header ${path || '(name)'}`,
    body: 'Body',
    json: path || 'Body',
    schema: path || 'Body',
    cookie: `Cookie ${path || '(name)'}`,
    redirects: 'Redirect count',
    transport: 'Transport'
  }[x.subject] ?? SUBJECTS.find((s) => s.id === x.subject)?.label ?? String(x.subject ?? 'Assertion')
  const op = OP_LABEL[x.op] ?? x.op ?? ''
  let value = needsValue(x) && x.op !== 'matchesSchema' ? String(x.value ?? '').trim() : ''
  if (value) {
    if (x.op === 'between') {
      const r = range(value)
      if (r) value = `${r[0]} and ${r[1]}`
    }
    if (x.op === 'isSorted') value = /^desc/i.test(value) ? 'descending' : 'ascending'
    if (x.subject === 'time' && ['lessThan', 'greaterThan', 'between'].includes(x.op)) value = `${value} ms`
    if (x.subject === 'size' && ['lessThan', 'greaterThan'].includes(x.op)) value = sizeText(value)
    if (x.subject === 'size' && x.op === 'between') value = `${value} bytes`
  } else if (x.op === 'isSorted') {
    value = 'ascending'
  }
  return [subject, op, value].filter(Boolean).join(' ')
}

/* ----------------------------------------------------------------- catalog */

const SCHEMA_TEMPLATE = JSON.stringify(
  {
    type: 'object',
    required: ['id', 'name'],
    properties: {
      id: { type: ['integer', 'string'] },
      name: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
      tags: { type: 'array', items: { type: 'string' } }
    }
  },
  null,
  2
)

const ITEM_SCHEMA_TEMPLATE = JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: ['integer', 'string'] } } }, null, 2)

const preset = (id, title, blurb, subject, op, path = '', value = '') => ({ id, title, blurb, assertion: { subject, op, path, value } })

/**
 * Ready-made assertions, grouped the way people go looking for them. Paths
 * are placeholders — `items`, `email` — meant to be pointed at the real field
 * after adding, which is quicker than remembering the operator's spelling.
 */
export const CATALOG = [
  {
    id: 'status',
    label: 'Status codes',
    blurb: 'What the server said, before anything it sent.',
    items: [
      preset('status-success', 'Is a 2xx success', 'Any status from 200 to 299.', 'status', 'isSuccess'),
      preset('status-200', 'Is 200 OK', 'Exactly 200, the usual answer to a read.', 'status', 'equals', '', '200'),
      preset('status-201', 'Is 201 Created', 'What a create should answer with.', 'status', 'equals', '', '201'),
      preset('status-204', 'Is 204 No Content', 'A delete or update with nothing to send back.', 'status', 'equals', '', '204'),
      preset('status-not-5xx', 'Is not a server error', 'Anything below 500 — the server did not fall over.', 'status', 'lessThan', '', '500'),
      preset('status-3xx', 'Is a redirect', 'A 3xx, for endpoints that should send you elsewhere.', 'status', 'isClass', '', '3xx'),
      preset('status-auth', 'Rejects without credentials', '401 or 403, for negative auth tests.', 'status', 'oneOf', '', '401, 403'),
      preset('status-404', 'Is 404 Not Found', 'For lookups of things that should not exist.', 'status', 'equals', '', '404'),
      preset('status-one-of', 'Is 200, 201 or 204', 'Any of the common success codes.', 'status', 'oneOf', '', '200, 201, 204')
    ]
  },
  {
    id: 'performance',
    label: 'Performance',
    blurb: 'Budgets for time and weight, with room for an ordinary bad day.',
    items: [
      preset('time-200', 'Responds in under 200 ms', 'A tight budget for hot paths and caches.', 'time', 'lessThan', '', '200'),
      preset('time-500', 'Responds in under 500 ms', 'A sensible default for most APIs.', 'time', 'lessThan', '', '500'),
      preset('time-1s', 'Responds in under 1 s', 'For heavier reads and writes.', 'time', 'lessThan', '', '1000'),
      preset('time-3s', 'Responds in under 3 s', 'For reports, exports and other slow work.', 'time', 'lessThan', '', '3000'),
      preset('size-100k', 'Body under 100 KB', 'Catches a list that forgot to paginate.', 'size', 'lessThan', '', '102400'),
      preset('size-1m', 'Body under 1 MB', 'A ceiling for anything a client should download in one go.', 'size', 'lessThan', '', '1048576'),
      preset('no-redirects', 'No redirects', 'The URL answered directly, with no hops.', 'redirects', 'lessThan', '', '1')
    ]
  },
  {
    id: 'headers',
    label: 'Headers',
    blurb: 'The metadata clients and proxies depend on.',
    items: [
      preset('ct-json', 'Content-Type is JSON', 'The body is declared as JSON, charset aside.', 'contentType', 'contains', '', 'json'),
      preset('request-id', 'Has a request id', 'x-request-id is present, so failures can be traced.', 'header', 'exists', 'x-request-id'),
      preset('cache-control', 'Has Cache-Control', 'Caching is decided on purpose, not by default.', 'header', 'exists', 'cache-control'),
      preset('etag', 'Has an ETag', 'Lets clients revalidate instead of re-downloading.', 'header', 'exists', 'etag'),
      preset('cors-origin', 'CORS allow-origin present', 'Browsers on other origins may read the response.', 'header', 'exists', 'access-control-allow-origin'),
      preset('rate-limit', 'Rate limit not exhausted', 'x-ratelimit-remaining is above zero.', 'header', 'greaterThan', 'x-ratelimit-remaining', '0'),
      preset('no-powered-by', 'No framework banner', 'x-powered-by is absent, so the stack is not advertised.', 'header', 'absent', 'x-powered-by'),
      preset('content-length', 'Content-Length present', 'The size is declared up front rather than streamed.', 'header', 'exists', 'content-length')
    ]
  },
  {
    id: 'body',
    label: 'Body',
    blurb: 'The raw response, before any parsing.',
    items: [
      preset('body-not-empty', 'Body is not empty', 'Something came back.', 'body', 'notEmpty'),
      preset('body-json', 'Body is valid JSON', 'The body parses, whatever the header claims.', 'body', 'isJson'),
      preset('no-error-key', 'No "error" key', 'The JSON has no top-level error field.', 'json', 'absent', 'error'),
      preset('no-exception', 'No "Exception" in the body', 'A server exception did not leak into the response.', 'body', 'notContains', '', 'Exception'),
      preset('no-traceback', 'No Python traceback', 'A Python stack trace did not leak into the response.', 'body', 'notContains', '', 'Traceback'),
      preset('body-regex', 'Body matches a pattern', 'A regular expression over the raw text — edit to suit.', 'body', 'matches', '', '/"status"\\s*:\\s*"ok"/i')
    ]
  },
  {
    id: 'json',
    label: 'JSON fields',
    blurb: 'Shape and content of a JSON body, field by field.',
    items: [
      preset('root-object', 'Root is an object', 'The body is a JSON object.', 'json', 'isType', '', 'object'),
      preset('root-array', 'Root is an array', 'The body is a JSON array.', 'json', 'isType', '', 'array'),
      preset('data-not-empty', 'List is not empty', 'The array at data has at least one item.', 'json', 'lengthAbove', 'data', '0'),
      preset('every-id', 'Every item has an id', 'Each items[*].id is present and not null.', 'json', 'notNull', 'items[*].id'),
      preset('unique-ids', 'Ids are unique', 'No two items share an id.', 'json', 'isUnique', 'items[*].id'),
      preset('email-format', 'Field is an email', 'The value looks like an email address.', 'json', 'isFormat', 'email', 'email'),
      preset('uuid-format', 'Field is a UUID', 'The value is a well-formed UUID.', 'json', 'isFormat', 'id', 'uuid'),
      preset('iso-timestamp', 'Timestamp is ISO 8601', 'A date-time such as 2026-01-31T09:30:00Z.', 'json', 'isFormat', 'created_at', 'date-time'),
      preset('price-positive', 'Price is positive', 'The number is above zero.', 'json', 'greaterThan', 'price', '0'),
      preset('every-price-positive', 'Every price is positive', 'Each items[*].price is above zero.', 'json', 'greaterThan', 'items[*].price', '0'),
      preset('sorted-asc', 'List is sorted ascending', 'Values come back in ascending order.', 'json', 'isSorted', 'items[*].name', 'asc'),
      preset('is-boolean', 'Field is a boolean', 'true or false, not "true" or 1.', 'json', 'isType', 'active', 'boolean'),
      preset('not-null', 'Field is not null', 'The field is present and has a value.', 'json', 'notNull', 'name')
    ]
  },
  {
    id: 'schema',
    label: 'Schema',
    blurb: 'Whole-body contracts in JSON Schema.',
    items: [
      preset('matches-schema', 'Matches a JSON schema', 'The body satisfies a schema — start from this template.', 'schema', 'matchesSchema', '', SCHEMA_TEMPLATE),
      preset('items-match-schema', 'Every item matches a schema', 'Each element of items satisfies the schema.', 'schema', 'matchesSchema', 'items[*]', ITEM_SCHEMA_TEMPLATE)
    ]
  },
  {
    id: 'security',
    label: 'Security',
    blurb: 'Transport, headers and leaks a security review would flag.',
    items: [
      preset('https', 'Served over HTTPS', 'The response came back over TLS.', 'transport', 'isHttps'),
      preset('hsts', 'HSTS is set', 'strict-transport-security keeps browsers on HTTPS.', 'header', 'exists', 'strict-transport-security'),
      preset('nosniff', 'X-Content-Type-Options is nosniff', 'Browsers will not guess a different content type.', 'header', 'equals', 'x-content-type-options', 'nosniff'),
      preset('csp', 'Content-Security-Policy present', 'Limits what a page built from this response may load.', 'header', 'exists', 'content-security-policy'),
      preset('cookie-httponly', 'Session cookie is HttpOnly', 'Scripts cannot read the session cookie.', 'cookie', 'hasFlag', 'session', 'HttpOnly'),
      preset('cookie-secure', 'Session cookie is Secure', 'The cookie is only ever sent over HTTPS.', 'cookie', 'hasFlag', 'session', 'Secure'),
      preset('cookie-samesite', 'Session cookie sets SameSite', 'Limits cross-site sending of the cookie.', 'cookie', 'hasFlag', 'session', 'SameSite'),
      preset('no-x-powered-by', 'No X-Powered-By', 'The server does not announce its framework.', 'header', 'absent', 'x-powered-by'),
      preset('no-password', 'No password in the body', 'No "password" field is echoed back.', 'body', 'notMatches', '', '/"password"\\s*:/i'),
      preset('no-stack-trace', 'No stack traces leaked', 'No Java, .NET, Node or Python stack frames in the body.', 'body', 'notMatches', '', '/Traceback \\(most recent call last\\)|\\bat [\\w$.<>]+\\(.*:\\d+\\)|\\bat .+ \\(.*:\\d+:\\d+\\)|\\.java:\\d+\\)/')
    ]
  }
]

/* ---------------------------------------------------------------- generate */

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id']
const SECURITY_HEADERS = ['strict-transport-security', 'x-content-type-options', 'content-security-policy', 'x-frame-options']
const SUGGESTED_FORMATS = ['email', 'uuid', 'date-time', 'uri']

/**
 * A test suite proposed from one real response, each suggestion as
 * `{ assertion, label, group, picked }` — `picked` is whether it starts
 * ticked. Stable facts are picked; strict ones (sizes, the full schema) are
 * offered but left for the user to opt into.
 *
 * Nothing compares against a value that will change on the next call — ids,
 * timestamps, tokens — only against types, formats and shapes. And every
 * suggestion is checked against the response it came from before it is
 * offered: a generated test that fails on the spot teaches people to ignore
 * generated tests.
 */
export function generate(response, opts = {}) {
  const res = response ?? {}
  const { maxKeys = 12, pickKeys = 6, schema = true } = opts
  const out = []
  const keys = new Set()
  const add = (fields, group, picked, label) => {
    const assertion = emptyAssertion({ path: '', value: '', ...fields })
    const key = `${assertion.subject}|${assertion.op}|${assertion.path}|${assertion.value}`
    if (keys.has(key)) return
    keys.add(key)
    out.push({ assertion, label: label ?? describe(assertion), group, picked })
  }
  const has = (name) => Object.keys(res.headers ?? {}).some((k) => k.toLowerCase() === name)

  add({ subject: 'status', op: 'equals', value: String(res.status ?? 200) }, 'status', true)
  if (/json/i.test(header(res, 'content-type'))) add({ subject: 'contentType', op: 'contains', value: 'json' }, 'headers', true)
  const ms = res.timing?.total ?? 0
  add({ subject: 'time', op: 'lessThan', value: String(Math.max(500, Math.ceil((ms * 3) / 250) * 250)) }, 'performance', true)
  const bytes = res.bytes ?? String(res.body ?? '').length
  add({ subject: 'size', op: 'lessThan', value: String(Math.max(10240, Math.ceil((bytes * 4) / 1024) * 1024)) }, 'performance', false)

  for (const name of REQUEST_ID_HEADERS) if (has(name)) add({ subject: 'header', op: 'exists', path: name }, 'headers', true)
  if (has('etag')) add({ subject: 'header', op: 'exists', path: 'etag' }, 'headers', false)
  if (res.secure === true) add({ subject: 'transport', op: 'isHttps' }, 'security', false)
  for (const name of SECURITY_HEADERS) if (has(name)) add({ subject: 'header', op: 'exists', path: name }, 'security', false)
  for (const cookie of parseCookies(res.headers).slice(0, 3)) {
    if (cookie.attributes.some((x) => x.name.toLowerCase() === 'httponly')) {
      add({ subject: 'cookie', op: 'hasFlag', path: cookie.name, value: 'HttpOnly' }, 'security', false)
    }
  }

  const json = res.json
  if (json !== undefined) {
    const arrays = []
    if (Array.isArray(json)) {
      add({ subject: 'json', op: 'isType', path: '', value: 'array' }, 'json', true)
      arrays.push(['', json])
    } else if (json !== null && typeof json === 'object') {
      add({ subject: 'json', op: 'isType', path: '', value: 'object' }, 'json', true)
      Object.entries(json)
        .slice(0, maxKeys)
        .forEach(([key, value], i) => {
          // Number rather than integer: a price of 10 today is 10.5 tomorrow.
          add({ subject: 'json', op: 'isType', path: joinPath('', key, false), value: typeOf(value) }, 'json', i < pickKeys)
        })
      for (const [key, value] of Object.entries(json)) {
        const path = joinPath('', key, false)
        if (Array.isArray(value)) arrays.push([path, value])
        else if (value && typeof value === 'object') {
          for (const [inner, v] of Object.entries(value)) if (Array.isArray(v)) arrays.push([joinPath(path, inner, false), v])
        }
      }
    }
    for (const [path, value] of arrays.slice(0, 6)) {
      if (!value.length) continue
      add({ subject: 'json', op: 'lengthAbove', path, value: '0' }, 'json', true)
      if (value.every((v) => v && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, 'id'))) {
        add({ subject: 'json', op: 'isUnique', path: `${path}[*].id` }, 'json', true)
      }
    }
    const found = []
    const scan = (node, path, depth) => {
      if (depth > 2 || found.length >= 8 || node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        if (node.length && node[0] && typeof node[0] === 'object') scan(node[0], `${path}[*]`, depth)
        return
      }
      for (const [key, value] of Object.entries(node)) {
        const at = joinPath(path, key, false)
        if (typeof value === 'string') {
          const format = SUGGESTED_FORMATS.find((f) => FORMATS[f].test(value))
          if (format && found.length < 8) found.push([at, format])
        } else {
          // Depth counts objects; a list on the way down is a fan-out, not a level.
          scan(value, at, Array.isArray(value) ? depth : depth + 1)
        }
      }
    }
    scan(json, '', 1)
    for (const [path, format] of found) add({ subject: 'json', op: 'isFormat', path, value: format }, 'json', true)
    if (schema) {
      const inferred = JSON.stringify(inferSchema(json, { sample: 200 }), null, 2)
      add({ subject: 'schema', op: 'matchesSchema', value: inferred }, 'schema', false, 'Body matches the inferred schema')
    }
  }

  return out.filter((s) => check(s.assertion, res).ok)
}

/* ----------------------------------------------------------------- suggest */

/**
 * The assertions an observed response suggests — from an imported HAR, say.
 *
 * Deliberately modest: what it did, and a time budget with room in it. A
 * generated suite that fails on its second run because the budget was the
 * first run's exact number gets deleted, and then nothing is tested at all.
 */
export function suggestFor(seen, json) {
  const out = [emptyAssertion({ subject: 'status', op: 'equals', value: String(seen?.status ?? 200) })]
  if (/json/i.test(seen?.contentType ?? '')) {
    out.push(emptyAssertion({ subject: 'contentType', op: 'contains', value: 'json' }))
    const key = firstScalar(json)
    if (key) out.push(emptyAssertion({ subject: 'json', op: 'exists', path: key, value: '' }))
  }
  const budget = Math.max(1000, Math.ceil(((seen?.durationMs ?? 0) * 3) / 500) * 500)
  out.push(emptyAssertion({ subject: 'time', op: 'lessThan', value: String(budget) }))
  return out
}

/** A shallow path to something scalar, for a first assertion worth making. */
export function firstScalar(value, trail = '', depth = 0) {
  if (depth > 2 || value === null || typeof value !== 'object') return ''
  const entries = Array.isArray(value) ? value.slice(0, 1).map((v, i) => [String(i), v]) : Object.entries(value)
  for (const [key, child] of entries) {
    const path = trail ? `${trail}.${key}` : key
    if (child !== null && (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean')) return path
  }
  for (const [key, child] of entries) {
    const found = firstScalar(child, trail ? `${trail}.${key}` : key, depth + 1)
    if (found) return found
  }
  return ''
}
