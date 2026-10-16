/**
 * Assertions, written out as code.
 *
 * Every assertion Prism runs is turned into a condition in the target's own
 * language — not a subset of the easy ones. A suite generated in Prism is
 * mostly types, formats, lengths and shapes; an export that kept only
 * "status is 200" quietly dropped nearly all of it.
 *
 * Each condition reads a handful of facts about the response — `status`,
 * `ms`, `bytes`, `text`, `json`, `header(name)`, `cookie(name)`, `redirects`,
 * `https` — which each target defines once from its own client, and leans on
 * small helpers (`at` for Prism's paths, `same` for Prism's loose equality,
 * and so on) that are written into the file only when a condition uses them.
 * The semantics follow lib/assert.js, so an exported check passes and fails
 * where the same check does in Prism.
 *
 * Anything a target genuinely cannot express is listed in the file by name,
 * never dropped in silence.
 */
import { describe } from './assert.js'

/* ---------------------------------------------------------------- formats */

/** The formats Prism checks, as patterns both JavaScript and Python accept. */
const FORMAT_RE = {
  email: ['^[^\\s@]+@[^\\s@]+\\.[^\\s@.]+$', ''],
  uuid: ['^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'i'],
  date: ['^\\d{4}-\\d{2}-\\d{2}$', ''],
  'date-time': ['^\\d{4}-\\d{2}-\\d{2}[Tt]\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?([Zz]|[+-]\\d{2}:\\d{2})?$', ''],
  time: ['^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?([Zz]|[+-]\\d{2}:\\d{2})?$', ''],
  uri: ['^https?://[^\\s/$.?#][^\\s]*$', 'i'],
  url: ['^https?://[^\\s/$.?#][^\\s]*$', 'i'],
  ipv4: ['^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$', ''],
  ipv6: ['^[0-9a-f:.]*:[0-9a-f:.]*$', 'i'],
  hostname: ['^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$', 'i'],
  jwt: ['^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*$', ''],
  hex: ['^(0x)?[0-9a-f]+$', 'i'],
  base64: ['^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$', ''],
  numeric: ['^[+-]?(\\d+(\\.\\d+)?|\\.\\d+)$', ''],
  semver: ['^v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$', '']
}

/* ----------------------------------------------------------- shared input */

/** `200-299`, `200..299`, `200,299`, `200 to 299` — inclusive, low first. */
function range(text) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|-|,|to|and|\s)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(String(text ?? ''))
  if (!m) return null
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a <= b ? [a, b] : [b, a]
}

const items = (text) => String(text ?? '').split(/[,\s|]+/).filter(Boolean)

/** `/pattern/flags` or a bare pattern, as Prism reads the value box. */
function regex(text) {
  const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(String(text ?? ''))
  return m ? { source: m[1], flags: m[2].replace(/[gy]/g, '') } : { source: String(text ?? ''), flags: '' }
}

const isNum = (text) => String(text ?? '').trim() !== '' && !Number.isNaN(Number(text))
const LIST_OPS = new Set(['isUnique', 'isSorted'])

/* ============================================================= JavaScript */

const JS_HELPERS = {
  at: `/** Reads a Prism path: a.b[0].c, [-1] for the last item, [*] for every item. */
function at(value, path) {
  let nodes = [value]
  let many = false
  for (const step of String(path).replace(/^\\$\\.?/, '').split(/[.[\\]]+/).filter(Boolean)) {
    if (step === '*') {
      many = true
      nodes = nodes.flatMap((n) => (n !== null && typeof n === 'object' ? Object.values(n) : [undefined]))
      continue
    }
    const key = step.replace(/^["']|["']$/g, '')
    nodes = nodes.map((n) =>
      n === null || n === undefined ? undefined : Array.isArray(n) && /^-\\d+$/.test(key) ? n[n.length + Number(key)] : Object.hasOwn(Object(n), key) ? n[key] : undefined
    )
  }
  return many ? nodes : nodes[0]
}`,
  same: `/** Prism's equality: "200" equals 200, and key order never matters. */
const canon = (v) =>
  Array.isArray(v) ? \`[\${v.map(canon)}]\` : v !== null && typeof v === 'object' ? \`{\${Object.keys(v).sort().map((k) => \`\${JSON.stringify(k)}:\${canon(v[k])}\`)}}\` : JSON.stringify(v)
function same(found, expected) {
  if (found !== null && typeof found === 'object') {
    try {
      return canon(found) === canon(JSON.parse(expected))
    } catch {
      return false
    }
  }
  if (found === null) return String(expected).trim() === 'null'
  return found !== undefined && String(found) === String(expected)
}`,
  kind: `const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)`,
  len: `const len = (v) => (Array.isArray(v) || typeof v === 'string' ? v.length : v !== null && typeof v === 'object' ? Object.keys(v).length : NaN)`,
  empty: `const empty = (v) => v === null || v === '' || len(v) === 0`,
  has: `const has = (v, x) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '').includes(x) || (Array.isArray(v) && v.some((i) => same(i, x)))`,
  incl: `const incl = (v, x) => Array.isArray(v) && v.some((i) => same(i, x))`,
  num: `const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)`,
  text: `const asText = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined)`,
  unique: `const unique = (list) => Array.isArray(list) && new Set(list.map((v) => canon(v))).size === list.length`,
  cookie: `/** A cookie the response set: its value, and its flags in lower case. */
function cookie(cookies, name) {
  for (const line of cookies) {
    const [pair, ...attrs] = line.split(';')
    const eq = pair.indexOf('=')
    if (pair.slice(0, eq).trim() === name) return { value: pair.slice(eq + 1).trim(), flags: attrs.map((a) => a.trim().split('=')[0].toLowerCase()) }
  }
}`,
  schema: `const ajv = new Ajv({ strict: false, allErrors: true })`,
  sorted: `const sorted = (list, dir) =>
  Array.isArray(list) &&
  list.every((v, i) => {
    if (i === 0) return true
    const order = typeof v === 'number' ? v - list[i - 1] : String(v).localeCompare(String(list[i - 1]))
    return dir === 'desc' ? order <= 0 : order >= 0
  })`
}
const JS_NEEDS = { has: ['same'], incl: ['same'], empty: ['len'], unique: ['same'] }

/**
 * One assertion as a JavaScript condition, or null when it cannot be written
 * for this client. `facts` says what the target's client can tell us.
 */
function jsCondition(a, use, facts) {
  const x = String(a.value ?? '')
  const lit = JSON.stringify(x)
  const n = Number(x)
  const r = range(x)
  const re = () => {
    const p = regex(x)
    return `/${p.source.replace(/\//g, '\\/')}/${p.flags}`
  }
  const between = (v) => (r ? `(${v} >= ${r[0]} && ${v} <= ${r[1]})` : null)

  switch (a.subject) {
    case 'status':
      switch (a.op) {
        case 'equals': return isNum(x) ? `status === ${n}` : `String(status) === ${lit}`
        case 'notEquals': return `status !== ${n}`
        case 'oneOf': return `[${items(x).map(Number).join(', ')}].includes(status)`
        case 'isSuccess': return 'status >= 200 && status < 300'
        case 'isClass': return /^\s*([1-5])/.test(x) ? `Math.floor(status / 100) === ${/^\s*([1-5])/.exec(x)[1]}` : null
        case 'lessThan': return `status < ${n}`
        case 'greaterThan': return `status > ${n}`
        case 'between': return between('status')
      }
      return null
    case 'time':
    case 'size': {
      const v = a.subject === 'time' ? 'ms' : 'bytes'
      if (a.op === 'greaterThan') return `${v} > ${n}`
      if (a.op === 'between') return between(v)
      return `${v} < ${n}`
    }
    case 'contentType': {
      const ct = "(header('content-type') ?? '')"
      if (a.op === 'equals') return `${ct} === ${lit}`
      if (a.op === 'notContains') return `!${ct}.toLowerCase().includes(${JSON.stringify(x.toLowerCase())})`
      if (a.op === 'matches') return `${re()}.test(${ct})`
      return `${ct}.toLowerCase().includes(${JSON.stringify(x.toLowerCase())})`
    }
    case 'header': {
      const h = `header(${JSON.stringify(String(a.path ?? ''))})`
      const present = `${h} !== undefined`
      switch (a.op) {
        case 'exists': return present
        case 'absent': return `${h} === undefined`
        case 'equals': return `${h} === ${lit}`
        case 'notEquals': return `${present} && ${h} !== ${lit}`
        case 'contains': return `(${h} ?? '').includes(${lit}) && ${present}`
        case 'notContains': return `${present} && !${h}.includes(${lit})`
        case 'startsWith': return `(${h} ?? '').startsWith(${lit}) && ${present}`
        case 'matches': return `${present} && ${re()}.test(${h})`
        case 'oneOf': return `[${items(x).map((i) => JSON.stringify(i)).join(', ')}].includes(${h})`
        case 'lessThan': use('num'); return `num(${h}) < ${n}`
        case 'greaterThan': use('num'); return `num(${h}) > ${n}`
      }
      return null
    }
    case 'body':
      switch (a.op) {
        case 'contains': return `text.includes(${lit})`
        case 'notContains': return `!text.includes(${lit})`
        case 'matches': return `${re()}.test(text)`
        case 'notMatches': return `!${re()}.test(text)`
        case 'isEmpty': return 'text.length === 0'
        case 'notEmpty': return 'text.length > 0'
        case 'equals': return `text === ${lit}`
        case 'startsWith': return `text.startsWith(${lit})`
        case 'isJson': return 'json !== undefined'
      }
      return null
    case 'json': {
      const path = String(a.path ?? '')
      if (path) use('at')
      const value = path ? `at(json, ${JSON.stringify(path)})` : 'json'
      if (LIST_OPS.has(a.op)) {
        if (a.op === 'isUnique') {
          use('unique')
          return `unique(${value})`
        }
        use('sorted')
        return `sorted(${value}, ${JSON.stringify(x.trim().toLowerCase().startsWith('desc') ? 'desc' : 'asc')})`
      }
      const every = path.includes('*')
      const v = every ? 'v' : value
      const cond = jsJsonOp(a.op, v, x, lit, n, r, re, use)
      if (!cond) return null
      return every ? `${value}.every((v) => ${cond})` : cond
    }
    case 'schema': {
      if (!facts.schema) return null
      const path = String(a.path ?? '')
      if (facts.schema !== 'postman') use('schema')
      if (path) use('at')
      const schema = (() => {
        try {
          return JSON.stringify(JSON.parse(x))
        } catch {
          return null
        }
      })()
      if (!schema) return null
      // Postman validates a whole body against a schema itself.
      if (facts.schema === 'postman') return path ? null : `(pm.response.to.have.jsonSchema(${schema}), true)`
      return `ajv.validate(${schema}, ${path ? `at(json, ${JSON.stringify(path)})` : 'json'})`
    }
    case 'cookie': {
      if (!facts.cookies) return null
      use('cookie')
      const c = `cookie(cookies, ${JSON.stringify(String(a.path ?? ''))})`
      switch (a.op) {
        case 'exists': return `${c} !== undefined`
        case 'absent': return `${c} === undefined`
        case 'equals': return `${c}?.value === ${lit}`
        case 'contains': return `(${c}?.value ?? '').includes(${lit}) && ${c} !== undefined`
        case 'hasFlag': return `[${items(x).map((f) => JSON.stringify(f.toLowerCase())).join(', ')}].every((f) => ${c}?.flags.includes(f))`
      }
      return null
    }
    case 'redirects':
      if (!facts.redirects) return null
      return a.op === 'equals' ? `redirects === ${n}` : `redirects < ${n}`
    case 'transport':
      return facts.https ? 'https' : null
  }
  return null
}

function jsJsonOp(op, v, x, lit, n, r, re, use) {
  switch (op) {
    case 'exists': return `${v} !== undefined`
    case 'absent': return `${v} === undefined`
    case 'equals': use('same'); return `same(${v}, ${lit})`
    case 'notEquals': use('same'); return `!same(${v}, ${lit})`
    case 'oneOf': use('same'); return `[${items(x).map((i) => JSON.stringify(i)).join(', ')}].some((x) => same(${v}, x))`
    case 'isType': {
      const t = x.trim().toLowerCase()
      if (t === 'integer') return `Number.isInteger(${v})`
      use('kind')
      return `kind(${v}) === ${JSON.stringify(t)}`
    }
    case 'contains': use('has'); return `has(${v}, ${lit})`
    case 'notContains': use('has'); return `!has(${v}, ${lit})`
    case 'includes': use('incl'); return `incl(${v}, ${lit})`
    case 'lengthIs': use('len'); return `len(${v}) === ${n}`
    case 'lengthAbove': use('len'); return `len(${v}) > ${n}`
    case 'lengthBelow': use('len'); return `len(${v}) < ${n}`
    case 'greaterThan': use('num'); return `num(${v}) > ${n}`
    case 'lessThan': use('num'); return `num(${v}) < ${n}`
    case 'between': use('num'); return r ? `num(${v}) >= ${r[0]} && num(${v}) <= ${r[1]}` : null
    case 'matches': use('text'); return `${re()}.test(asText(${v}) ?? '')`
    case 'startsWith': use('text'); return `(asText(${v}) ?? '').startsWith(${lit}) && asText(${v}) !== undefined`
    case 'endsWith': use('text'); return `(asText(${v}) ?? '').endsWith(${lit}) && asText(${v}) !== undefined`
    case 'isFormat': {
      const f = FORMAT_RE[x.trim().toLowerCase()]
      if (!f) return null
      use('text')
      return `/${f[0].replace(/\//g, '\\/')}/${f[1]}.test(asText(${v}) ?? '')`
    }
    case 'isEmpty': use('empty'); return `empty(${v})`
    case 'notEmpty': use('empty'); return `!empty(${v})`
    case 'isNull': return `${v} === null`
    case 'notNull': return `${v} !== null`
    case 'isTrue': return `${v} === true`
    case 'isFalse': return `${v} === false`
  }
  return null
}

/** The helpers a set of conditions used, with what they lean on, in order. */
function jsHelperBlock(used, extra = {}) {
  const all = new Set()
  const add = (name) => {
    if (all.has(name)) return
    for (const dep of JS_NEEDS[name] ?? []) add(dep)
    all.add(name)
  }
  for (const name of used) add(name)
  const order = ['at', 'same', 'kind', 'len', 'empty', 'has', 'incl', 'num', 'text', 'unique', 'sorted', 'cookie', 'schema']
  void extra
  return order.filter((k) => all.has(k)).map((k) => JS_HELPERS[k]).join('\n')
}

/**
 * Every enabled assertion on a request as `{ name, cond }` for JavaScript,
 * the helpers they need, and the names of any this client cannot express.
 */
export function jsChecks(req, facts = {}) {
  const used = new Set()
  const use = (name) => used.add(name)
  const checks = []
  const skipped = []
  for (const a of (req.assertions ?? []).filter((x) => x && x.on !== false)) {
    const cond = jsCondition(a, use, facts)
    if (cond) checks.push({ name: describe(a), cond })
    else skipped.push(describe(a))
  }
  return { checks, skipped, used }
}

export { jsHelperBlock }

/* ================================================================ Python */

const PY_HELPERS = {
  at: `MISSING = object()


def at(value, path):
    """Reads a Prism path: a.b[0].c, [-1] for the last item, [*] for every item."""
    nodes, many = [value], False
    for step in [s for s in re.split(r"[.\\[\\]]+", re.sub(r"^\\$\\.?", "", path)) if s]:
        if step == "*":
            many = True
            nodes = [c for n in nodes for c in (n.values() if isinstance(n, dict) else n if isinstance(n, list) else [MISSING])]
            continue
        key = step.strip("\\"'")
        out = []
        for n in nodes:
            if isinstance(n, list) and re.fullmatch(r"-?\\d+", key):
                i = int(key)
                out.append(n[i] if -len(n) <= i < len(n) else MISSING)
            elif isinstance(n, dict):
                out.append(n.get(key, MISSING))
            else:
                out.append(MISSING)
        nodes = out
    return nodes if many else nodes[0]`,
  same: `def same(found, expected):
    """Prism's equality: "200" equals 200, and key order never matters."""
    if isinstance(found, (dict, list)):
        try:
            return found == json.loads(expected)
        except ValueError:
            return False
    if found is None:
        return str(expected).strip() == "null"
    if found is MISSING:
        return False
    if isinstance(found, bool):
        return str(found).lower() == str(expected)
    if isinstance(found, float) and found.is_integer():
        found = int(found)
    return str(found) == str(expected)`,
  kind: `def kind(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    return "array" if isinstance(v, list) else "object" if isinstance(v, dict) else "undefined"`,
  integer: `def is_integer(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer()`,
  len: `def length(v):
    return len(v) if isinstance(v, (str, list, dict)) else float("nan")`,
  empty: `def empty(v):
    return v is None or v == "" or length(v) == 0`,
  has: `def has(v, x):
    text = v if isinstance(v, str) else json.dumps(v) if v is not MISSING else ""
    return x in text or (isinstance(v, list) and any(same(i, x) for i in v))`,
  incl: `def includes(v, x):
    return isinstance(v, list) and any(same(i, x) for i in v)`,
  num: `def number(v):
    if isinstance(v, bool) or v is None or v is MISSING:
        return float("nan")
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")`,
  text: `def as_text(v):
    if isinstance(v, bool):
        return str(v).lower()
    return str(v) if isinstance(v, (str, int, float)) else None`,
  unique: `def unique(items):
    return isinstance(items, list) and len({json.dumps(i, sort_keys=True) for i in items}) == len(items)`,
  cookie: `def find_cookie(cookies, name):
    """A cookie the response set: its value, and its flags in lower case."""
    for line in cookies:
        pair, *attrs = line.split(";")
        key, _, value = pair.partition("=")
        if key.strip() == name:
            return {"value": value.strip(), "flags": [a.strip().split("=")[0].lower() for a in attrs]}
    return None`,
  schema: `def valid(schema_text, value):
    """The value checked against a JSON Schema, in whichever draft it names."""
    schema = json.loads(schema_text)
    return jsonschema.validators.validator_for(schema)(schema).is_valid(value)`,
  sorted: `def in_order(items, direction):
    if not isinstance(items, list):
        return False
    pairs = zip(items, items[1:])
    return all((b >= a if direction == "asc" else b <= a) for a, b in pairs)`
}
const PY_NEEDS = { has: ['same', 'at'], incl: ['same'], empty: ['len'], same: ['at'] }

const py = (text) => JSON.stringify(String(text))

function pyCondition(a, use, facts) {
  const x = String(a.value ?? '')
  const lit = py(x)
  const n = Number(x)
  const r = range(x)
  const re = () => {
    const p = regex(x)
    return `re.search(${py(p.source)}, ${'%s'}${p.flags.includes('i') ? ', re.I' : ''})`
  }
  const search = (target) => re().replace('%s', target)

  switch (a.subject) {
    case 'status':
      switch (a.op) {
        case 'equals': return isNum(x) ? `status == ${n}` : `str(status) == ${lit}`
        case 'notEquals': return `status != ${n}`
        case 'oneOf': return `status in (${items(x).map(Number).join(', ')},)`
        case 'isSuccess': return '200 <= status < 300'
        case 'isClass': return /^\s*([1-5])/.test(x) ? `status // 100 == ${/^\s*([1-5])/.exec(x)[1]}` : null
        case 'lessThan': return `status < ${n}`
        case 'greaterThan': return `status > ${n}`
        case 'between': return r ? `${r[0]} <= status <= ${r[1]}` : null
      }
      return null
    case 'time':
    case 'size': {
      const v = a.subject === 'time' ? 'ms' : 'size'
      if (a.op === 'greaterThan') return `${v} > ${n}`
      if (a.op === 'between') return r ? `${r[0]} <= ${v} <= ${r[1]}` : null
      return `${v} < ${n}`
    }
    case 'contentType': {
      const ct = 'header("content-type", "")'
      if (a.op === 'equals') return `${ct} == ${lit}`
      if (a.op === 'notContains') return `${py(x.toLowerCase())} not in ${ct}.lower()`
      if (a.op === 'matches') return `bool(${search(ct)})`
      return `${py(x.toLowerCase())} in ${ct}.lower()`
    }
    case 'header': {
      const name = py(String(a.path ?? ''))
      const h = `header(${name})`
      switch (a.op) {
        case 'exists': return `${h} is not None`
        case 'absent': return `${h} is None`
        case 'equals': return `${h} == ${lit}`
        case 'notEquals': return `${h} is not None and ${h} != ${lit}`
        case 'contains': return `${lit} in ${h.replace(')', ', "")')} and ${h} is not None`
        case 'notContains': return `${h} is not None and ${lit} not in ${h}`
        case 'startsWith': return `${h.replace(')', ', "")')}.startswith(${lit}) and ${h} is not None`
        case 'matches': return `${h} is not None and bool(${search(h)})`
        case 'oneOf': return `${h} in (${items(x).map(py).join(', ')},)`
        case 'lessThan': use('num'); return `number(${h}) < ${n}`
        case 'greaterThan': use('num'); return `number(${h}) > ${n}`
      }
      return null
    }
    case 'body':
      switch (a.op) {
        case 'contains': return `${lit} in text`
        case 'notContains': return `${lit} not in text`
        case 'matches': return `bool(${search('text')})`
        case 'notMatches': return `not ${search('text')}`
        case 'isEmpty': return 'len(text) == 0'
        case 'notEmpty': return 'len(text) > 0'
        case 'equals': return `text == ${lit}`
        case 'startsWith': return `text.startswith(${lit})`
        case 'isJson': use('at'); return 'data is not MISSING'
      }
      return null
    case 'json': {
      use('at')
      const path = String(a.path ?? '')
      const value = path ? `at(data, ${py(path)})` : 'data'
      if (LIST_OPS.has(a.op)) {
        if (a.op === 'isUnique') {
          use('unique')
          return `unique(${value})`
        }
        use('sorted')
        return `in_order(${value}, ${py(x.trim().toLowerCase().startsWith('desc') ? 'desc' : 'asc')})`
      }
      const every = path.includes('*')
      const v = every ? 'v' : value
      const cond = pyJsonOp(a.op, v, x, lit, n, r, use)
      if (!cond) return null
      return every ? `all(${cond} for v in ${value})` : cond
    }
    case 'schema': {
      use('schema')
      use('at')
      const path = String(a.path ?? '')
      let schema
      try {
        schema = JSON.stringify(JSON.parse(x))
      } catch {
        return null
      }
      return `valid(${py(schema)}, ${path ? `at(data, ${py(path)})` : 'data'})`
    }
    case 'cookie': {
      if (!facts.cookies) return null
      use('cookie')
      const c = `find_cookie(cookies, ${py(String(a.path ?? ''))})`
      switch (a.op) {
        case 'exists': return `${c} is not None`
        case 'absent': return `${c} is None`
        case 'equals': return `(${c} or {}).get("value") == ${lit}`
        case 'contains': return `${lit} in (${c} or {}).get("value", "") and ${c} is not None`
        case 'hasFlag': return `all(f in (${c} or {}).get("flags", []) for f in (${items(x).map((f) => py(f.toLowerCase())).join(', ')},))`
      }
      return null
    }
    case 'redirects':
      return a.op === 'equals' ? `redirects == ${n}` : `redirects < ${n}`
    case 'transport':
      return 'https'
  }
  return null
}

function pyJsonOp(op, v, x, lit, n, r, use) {
  const pattern = () => {
    const p = regex(x)
    return `re.search(${py(p.source)}, as_text(${v}) or ""${p.flags.includes('i') ? ', re.I' : ''})`
  }
  switch (op) {
    case 'exists': return `${v} is not MISSING`
    case 'absent': return `${v} is MISSING`
    case 'equals': use('same'); return `same(${v}, ${lit})`
    case 'notEquals': use('same'); return `not same(${v}, ${lit})`
    case 'oneOf': use('same'); return `any(same(${v}, x) for x in (${items(x).map(py).join(', ')},))`
    case 'isType': {
      const t = x.trim().toLowerCase()
      if (t === 'integer') {
        use('integer')
        return `is_integer(${v})`
      }
      use('kind')
      return `kind(${v}) == ${py(t)}`
    }
    case 'contains': use('has'); return `has(${v}, ${lit})`
    case 'notContains': use('has'); return `not has(${v}, ${lit})`
    case 'includes': use('incl'); return `includes(${v}, ${lit})`
    case 'lengthIs': use('len'); return `length(${v}) == ${n}`
    case 'lengthAbove': use('len'); return `length(${v}) > ${n}`
    case 'lengthBelow': use('len'); return `length(${v}) < ${n}`
    case 'greaterThan': use('num'); return `number(${v}) > ${n}`
    case 'lessThan': use('num'); return `number(${v}) < ${n}`
    case 'between': use('num'); return r ? `${r[0]} <= number(${v}) <= ${r[1]}` : null
    case 'matches': use('text'); return `bool(${pattern()})`
    case 'startsWith': use('text'); return `(as_text(${v}) or "").startswith(${lit}) and as_text(${v}) is not None`
    case 'endsWith': use('text'); return `(as_text(${v}) or "").endswith(${lit}) and as_text(${v}) is not None`
    case 'isFormat': {
      const f = FORMAT_RE[x.trim().toLowerCase()]
      if (!f) return null
      use('text')
      return `bool(re.search(${py(f[0])}, as_text(${v}) or ""${f[1] ? ', re.I' : ''}))`
    }
    case 'isEmpty': use('empty'); return `empty(${v})`
    case 'notEmpty': use('empty'); return `not empty(${v})`
    case 'isNull': return `${v} is None`
    case 'notNull': return `${v} is not None`
    case 'isTrue': return `${v} is True`
    case 'isFalse': return `${v} is False`
  }
  return null
}

export function pyChecks(req, facts = {}) {
  // `at` brings MISSING, which every Python reader of the body uses.
  const used = new Set(['at'])
  const use = (name) => used.add(name)
  const checks = []
  const skipped = []
  for (const a of (req.assertions ?? []).filter((x) => x && x.on !== false)) {
    const cond = pyCondition(a, use, facts)
    if (cond) checks.push({ name: describe(a), cond })
    else skipped.push(describe(a))
  }
  return { checks, skipped, used }
}

export function pyHelperBlock(used, extra = {}) {
  const all = new Set()
  const add = (name) => {
    if (all.has(name)) return
    for (const dep of PY_NEEDS[name] ?? []) add(dep)
    all.add(name)
  }
  for (const name of used) add(name)
  const order = ['at', 'same', 'kind', 'integer', 'len', 'empty', 'has', 'incl', 'num', 'text', 'unique', 'sorted', 'cookie', 'schema']
  void extra
  return order.filter((k) => all.has(k)).map((k) => PY_HELPERS[k]).join('\n\n\n')
}

/* ============================================================ everyone else */

/**
 * For the plain-client targets — Java, C#, Go, PHP, cURL — the checks are
 * listed in words above the request, so they travel with it, and the export
 * says where to get them as code.
 */
export function checklist(req, mark) {
  const list = (req.assertions ?? []).filter((x) => x && x.on !== false)
  if (!list.length) return ''
  return [
    `${mark} Checks set in Prism (${list.length}). To get them as code, export to`,
    `${mark} JavaScript, Python, pytest, Playwright, REST Assured or Postman.`,
    ...list.map((a) => `${mark}   - ${describe(a)}`)
  ].join('\n') + '\n'
}

/** The status the assertions expect, when one is set plainly. */
export function expectedStatus(req) {
  const a = (req.assertions ?? []).find((x) => x && x.on !== false && x.subject === 'status' && x.op === 'equals' && isNum(x.value))
  return a ? Number(a.value) : null
}
