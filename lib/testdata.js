/**
 * Test data from a schema: the rows a data run needs to probe an endpoint's
 * input validation, without anyone typing them.
 *
 * From a request body's schema — the OpenAPI document's, or one inferred
 * from the body as written — each row is the body with one thing changed:
 * a string empty, at its limit, one past it, in another script; a number at
 * its bounds and one beyond; a value outside its enum; the wrong type; null;
 * a required field missing. Plus the valid body itself.
 *
 * Whether the API should accept a row is not guessed: the row is validated
 * against the schema, and the verdict goes in the row. A data run then judges
 * each send by it — accepted with a 2xx, or refused with a 4xx; a 5xx is a
 * failure either way.
 */
import { validateSchema } from './assert.js'
import { deref } from './contract.js'
import { exampleOf } from './mock.js'

export const CASE_LIMIT = 300

/** Every field in a schema that holds a value, with its path and its rules. */
export function fieldsOf(spec, schema, path = [], out = [], depth = 0, required = false) {
  const s = merged(spec, schema)
  if (!s || depth > 6 || out.length > 200) return out
  const type = typeOf(s)
  if (type === 'object' && s.properties) {
    const req = new Set(Array.isArray(s.required) ? s.required : [])
    if (path.length) out.push({ path, schema: s, type, required })
    for (const [k, v] of Object.entries(s.properties)) fieldsOf(spec, v, [...path, k], out, depth + 1, req.has(k))
    return out
  }
  if (path.length) out.push({ path, schema: s, type, required })
  return out
}

function merged(spec, schema) {
  const s = deref(spec, schema)
  if (!s || typeof s !== 'object') return s
  if (!Array.isArray(s.allOf)) return s
  const out = { type: 'object', properties: {}, required: [] }
  for (const part of s.allOf.map((p) => merged(spec, p))) {
    Object.assign(out.properties, part?.properties ?? {})
    out.required.push(...(part?.required ?? []))
  }
  return out
}

function typeOf(s) {
  if (Array.isArray(s.type)) return s.type.find((t) => t !== 'null') ?? 'string'
  return s.type ?? (s.properties ? 'object' : s.items ? 'array' : s.enum ? typeof s.enum[0] : 'string')
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const label = (path) => path.join('.')

function setAt(body, path, value) {
  const out = clone(body)
  let at = out
  for (const k of path.slice(0, -1)) {
    if (!at[k] || typeof at[k] !== 'object') at[k] = {}
    at = at[k]
  }
  if (value === MISSING) delete at[path[path.length - 1]]
  else at[path[path.length - 1]] = value
  return out
}

const MISSING = Symbol('missing')
const UNICODE = 'Zoë Ångström — 東京 — مرحبا — 🚀'

/** The variations worth trying for one field. */
function variationsFor(field) {
  const s = field.schema
  const v = []
  const add = (what, value) => v.push({ what, value })
  if (Array.isArray(s.enum) && s.enum.length) {
    for (const e of s.enum.slice(0, 6)) add(`one of its values, ${JSON.stringify(e)}`, e)
    add('a value not in its list', typeof s.enum[0] === 'number' ? Math.max(...s.enum.filter((x) => typeof x === 'number')) + 1 : 'not-a-listed-value')
  } else if (field.type === 'string') {
    add('empty', '')
    if (Number.isInteger(s.minLength) && s.minLength > 1) {
      add(`at its minimum length (${s.minLength})`, 'a'.repeat(s.minLength))
      add(`one short of its minimum (${s.minLength - 1})`, 'a'.repeat(s.minLength - 1))
    }
    if (Number.isInteger(s.maxLength)) {
      add(`at its maximum length (${s.maxLength})`, 'a'.repeat(s.maxLength))
      add(`one past its maximum (${s.maxLength + 1})`, 'a'.repeat(s.maxLength + 1))
    } else {
      add('long (1,000 characters)', 'a'.repeat(1000))
    }
    add('in other scripts, with an emoji', UNICODE)
    add('only spaces', '   ')
    if (s.format === 'email') add('not an email address', 'not-an-email')
    if (s.format === 'date' || s.format === 'date-time') add('not a date', '2026-13-45')
    if (s.format === 'uuid') add('not a UUID', 'not-a-uuid')
    if (s.format === 'uri' || s.format === 'url') add('not a URL', 'not a url')
  } else if (field.type === 'integer' || field.type === 'number') {
    const int = field.type === 'integer'
    const step = int ? 1 : 0.01
    if (s.minimum !== undefined) {
      add(`at its minimum (${s.minimum})`, s.minimum)
      add(`below its minimum (${s.minimum - step})`, round(s.minimum - step))
    } else {
      add('zero', 0)
      add('negative', -1)
    }
    if (s.maximum !== undefined) {
      add(`at its maximum (${s.maximum})`, s.maximum)
      add(`above its maximum (${s.maximum + step})`, round(s.maximum + step))
    } else {
      add('very large', int ? 2147483648 : 1e15)
    }
    if (int) add('a fraction', 1.5)
    add('a number written as a string', '42')
  } else if (field.type === 'boolean') {
    add('true', true)
    add('false', false)
    add('the word "true" as a string', 'true')
  } else if (field.type === 'array') {
    add('empty', [])
    if (Number.isInteger(s.maxItems)) add(`one past its maximum items (${s.maxItems + 1})`, Array.from({ length: s.maxItems + 1 }, () => exampleOf(null, s.items ?? {})))
    add('not a list', 'not-a-list')
  } else if (field.type === 'object') {
    add('an empty object', {})
    add('not an object', 'not-an-object')
  }
  add('null', null)
  add(field.required ? 'missing (it is required)' : 'left out', MISSING)
  return v
}

const round = (n) => Math.round(n * 100) / 100

/**
 * The rows: the valid body, then one variation per row.
 * @returns {{ columns: string[], rows: {case, expect, body}[], fields: number, schema }}
 */
export function generateCases({ spec = null, schema, base, limit = CASE_LIMIT }) {
  const s = merged(spec, schema)
  const root = { ...s, components: spec?.components, definitions: spec?.definitions }
  const valid = base !== undefined && validateSchema(root, base).length === 0 ? base : exampleOf(spec, s)
  const verdict = (body) => (validateSchema(root, body).length ? 'reject' : 'accept')
  const rows = [{ case: 'The valid body', expect: verdict(valid), body: JSON.stringify(valid) }]
  const fields = fieldsOf(spec, s)
  for (const field of fields) {
    for (const { what, value } of variationsFor(field)) {
      if (rows.length >= limit) break
      const body = setAt(valid, field.path, value)
      rows.push({ case: `${label(field.path)} ${what}`, expect: verdict(body), body: JSON.stringify(body) })
    }
  }
  return { columns: ['case', 'expect', 'body'], rows, fields: fields.length }
}

/** A send against a row's verdict: 2xx when it should be accepted, 4xx when refused. */
export function judge(expect, status, error) {
  if (error) return { ok: false, detail: `No response — ${error}` }
  if (status >= 500) return { ok: false, detail: `Server error ${status} — invalid input should be refused with a 4xx, valid input accepted` }
  if (expect === 'accept') return status >= 200 && status < 300 ? { ok: true, detail: `Accepted with ${status}` } : { ok: false, detail: `Valid by the schema, but refused with ${status}` }
  return status >= 400 && status < 500 ? { ok: true, detail: `Refused with ${status}` } : { ok: false, detail: `Invalid by the schema, but accepted with ${status}` }
}
