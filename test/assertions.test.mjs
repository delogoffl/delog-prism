/**
 * The assertion engine past the basics: every operator both ways, wildcard
 * paths, formats, schemas, cookies, the catalog and the generated suite.
 *
 * The invariant worth most here is the last one — a suite generated from a
 * response must pass against that response. A generator that proposes tests
 * which fail on the spot teaches people to stop reading what it proposes.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  check,
  jsonPath,
  jsonPathAll,
  SUBJECTS,
  OPERATORS,
  OP_LABEL,
  OP_META,
  FORMATS,
  TYPES,
  CATALOG,
  needsValue,
  needsPath,
  validateSchema,
  inferSchema,
  parseCookies,
  describe,
  generate,
  emptyAssertion
} from '../lib/assert.js'

const RES = {
  status: 201,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Request-Id': 'req-77',
    'X-RateLimit-Remaining': '42',
    ETag: 'W/"abc"',
    'Set-Cookie':
      'session=abc123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly; Secure; SameSite=Strict, theme=dark; Path=/; Max-Age=3600'
  },
  body: '',
  bytes: 512,
  timing: { total: 240 },
  redirects: 1,
  secure: true,
  json: {
    id: '3f2b8c1e-4a5d-4e6f-9a1b-2c3d4e5f6a7b',
    email: 'ada@example.com',
    active: true,
    deleted: false,
    parent: null,
    note: '',
    created_at: '2026-01-31T09:30:00Z',
    tags: ['admin', 'beta'],
    meta: {},
    items: [
      { id: 1, name: 'apple', price: 3.5 },
      { id: 2, name: 'banana', price: 1 },
      { id: 3, name: 'cherry', price: 12 }
    ]
  }
}
RES.body = JSON.stringify(RES.json)

const run = (fields, res = RES) => check({ id: 't', path: '', value: '', ...fields }, res)

function both(name, passing, failing, res = RES, failRes = res) {
  test(`${name} — passes`, () => {
    const r = run(passing, res)
    assert.equal(r.ok, true, r.detail)
    assert.ok(r.detail.length > 0)
  })
  test(`${name} — fails`, () => {
    const r = run(failing, failRes)
    assert.equal(r.ok, false, r.detail)
    assert.ok(r.detail.length > 0)
  })
}

/* ------------------------------------------------------------- metadata */

test('the first seven subjects keep their ids, labels and order', () => {
  assert.deepEqual(
    SUBJECTS.slice(0, 7).map((s) => `${s.id}:${s.label}:${s.needs}`),
    [
      'status:Response status:value',
      'time:Response time:value',
      'size:Response size:value',
      'contentType:Content type:value',
      'header:Header:path+value',
      'body:Response body:value',
      'json:JSON path:path+value'
    ]
  )
  assert.deepEqual(SUBJECTS.slice(7).map((s) => s.id), ['schema', 'cookie', 'redirects', 'transport'])
  for (const s of SUBJECTS) {
    assert.ok(['Response', 'Headers', 'Body', 'Security'].includes(s.group), s.id)
    assert.ok(s.blurb, s.id)
    assert.ok(OPERATORS[s.id]?.length, s.id)
  }
})

test('each subject still starts on the operator it always did', () => {
  const firsts = { status: 'equals', time: 'lessThan', size: 'lessThan', contentType: 'contains', header: 'exists', body: 'contains', json: 'exists' }
  for (const [subject, op] of Object.entries(firsts)) assert.equal(OPERATORS[subject][0], op)
})

test('every operator has a label and meta, and old labels are unchanged', () => {
  for (const ops of Object.values(OPERATORS)) {
    for (const op of ops) {
      assert.ok(OP_LABEL[op], `label for ${op}`)
      assert.ok(OP_META[op], `meta for ${op}`)
      assert.equal(typeof OP_META[op].needsValue, 'boolean')
      assert.equal(typeof OP_META[op].hint, 'string')
    }
  }
  assert.equal(OP_LABEL.lessThan, 'is under')
  assert.equal(OP_LABEL.notEquals, 'does not equal')
  assert.equal(OP_LABEL.lengthIs, 'has length')
})

test('needsValue and needsPath', () => {
  for (const op of ['exists', 'absent', 'isEmpty', 'notEmpty', 'isSuccess', 'isJson', 'isNull', 'notNull', 'isTrue', 'isFalse', 'isUnique', 'isHttps']) {
    assert.equal(needsValue({ op }), false, op)
  }
  for (const op of ['equals', 'between', 'isFormat', 'isSorted', 'hasFlag', 'matchesSchema']) assert.equal(needsValue({ op }), true, op)
  assert.equal(needsValue('exists'), false)
  assert.equal(needsPath({ subject: 'json' }), true)
  assert.equal(needsPath({ subject: 'header' }), true)
  assert.equal(needsPath({ subject: 'cookie' }), true)
  assert.equal(needsPath({ subject: 'schema' }), 'optional')
  assert.equal(needsPath({ subject: 'status' }), false)
})

test('TYPES lists the JSON types plus integer', () => {
  assert.deepEqual(TYPES, ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'])
})

/* ------------------------------------------------------------------ paths */

test('jsonPath keeps both spellings and adds $ and negative indexes', () => {
  const doc = { a: { b: [{ c: 1 }, { c: 2 }, { c: 3 }] } }
  assert.equal(jsonPath(doc, 'a.b[0].c'), 1)
  assert.equal(jsonPath(doc, 'a.b.0.c'), 1)
  assert.equal(jsonPath(doc, '$.a.b[1].c'), 2)
  assert.equal(jsonPath(doc, '$'), doc)
  assert.equal(jsonPath(doc, ''), doc)
  assert.equal(jsonPath(doc, 'a.b[-1].c'), 3)
  assert.equal(jsonPath(doc, 'a.b[-4].c'), undefined)
  assert.equal(jsonPath(doc, '$["a"].b[0].c'), 1)
  assert.equal(jsonPath(doc, 'a.constructor'), undefined)
  assert.equal(jsonPath({ 'x-id': 9 }, 'x-id'), 9)
})

test('jsonPathAll fans out over arrays and objects, several times over', () => {
  const doc = { groups: [{ users: [{ n: 'a' }, { n: 'b' }] }, { users: [{ n: 'c' }] }], map: { x: 1, y: 2 } }
  const all = jsonPathAll(doc, 'groups[*].users[*].n')
  assert.equal(all.many, true)
  assert.deepEqual(all.values.map((v) => v.value), ['a', 'b', 'c'])
  assert.equal(all.values[2].path, 'groups[1].users[0].n')
  assert.deepEqual(jsonPathAll(doc, 'map.*').values.map((v) => v.value), [1, 2])
  assert.deepEqual(jsonPathAll(doc, '$.map').values, [{ path: 'map', value: { x: 1, y: 2 } }])
  assert.equal(jsonPathAll(doc, 'map').many, false)
  assert.deepEqual(jsonPath(doc, 'groups[*].users[*].n'), ['a', 'b', 'c'])
})

test('a branch missing the rest of a wildcard path is reported, not skipped', () => {
  const all = jsonPathAll({ items: [{ p: 1 }, {}] }, 'items[*].p')
  assert.deepEqual(all.values, [{ path: 'items[0].p', value: 1 }, { path: 'items[1].p', value: undefined }])
})

test('wildcards have every-item semantics and name the first offender', () => {
  const res = { ...RES, json: { items: [{ price: 3 }, { price: 1 }, { price: -1 }] } }
  const ok = run({ subject: 'json', op: 'greaterThan', path: 'items[*].price', value: '-5' }, res)
  assert.equal(ok.ok, true)
  assert.equal(ok.detail, 'all 3 items[*].price are over -5')
  const bad = run({ subject: 'json', op: 'greaterThan', path: 'items[*].price', value: '0' }, res)
  assert.equal(bad.ok, false)
  assert.equal(bad.detail, 'items[2].price is -1, expected over 0')
})

test('a wildcard that reaches nothing fails rather than passing vacuously', () => {
  const r = run({ subject: 'json', op: 'greaterThan', path: 'nothing[*].price', value: '0' })
  assert.equal(r.ok, false)
  assert.equal(r.detail, 'nothing[*].price matched nothing')
  assert.equal(run({ subject: 'json', op: 'notNull', path: 'meta.*' }).ok, false)
})

test('a missing field under a wildcard fails notNull and names it', () => {
  const res = { ...RES, json: { items: [{ id: 1 }, { name: 'x' }] } }
  const r = run({ subject: 'json', op: 'notNull', path: 'items[*].id' }, res)
  assert.equal(r.ok, false)
  assert.match(r.detail, /items\[1\]\.id is missing/)
})

test('exists and absent on a wildcard mean any and none', () => {
  const res = { ...RES, json: { items: [{ id: 1 }, { name: 'x' }] } }
  assert.equal(run({ subject: 'json', op: 'exists', path: 'items[*].id' }, res).ok, true)
  assert.equal(run({ subject: 'json', op: 'exists', path: 'items[*].secret' }, res).ok, false)
  assert.equal(run({ subject: 'json', op: 'absent', path: 'items[*].secret' }, res).ok, true)
  const leaked = run({ subject: 'json', op: 'absent', path: 'items[*].name' }, res)
  assert.equal(leaked.ok, false)
  assert.match(leaked.detail, /items\[1\]\.name/)
})

test('isUnique and isSorted on a wildcard look at the collected list', () => {
  assert.equal(run({ subject: 'json', op: 'isUnique', path: 'items[*].id' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'items[*].id', value: 'asc' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'items[*].name' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'items[*].id', value: 'desc' }).ok, false)
  const dup = { ...RES, json: { items: [{ id: 7 }, { id: 8 }, { id: 7 }] } }
  const r = run({ subject: 'json', op: 'isUnique', path: 'items[*].id' }, dup)
  assert.equal(r.ok, false)
  assert.match(r.detail, /items\[0\]\.id and items\[2\]\.id/)
  const unsorted = run({ subject: 'json', op: 'isSorted', path: 'items[*].price' })
  assert.equal(unsorted.ok, false)
  assert.match(unsorted.detail, /items\[1\]\.price/)
})

test('a wildcard with a regular operator applies it to each item', () => {
  assert.equal(run({ subject: 'json', op: 'isType', path: 'items[*].name', value: 'string' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'isType', path: 'items[*].price', value: 'integer' }).ok, false)
  assert.equal(run({ subject: 'json', op: 'matches', path: 'items[*].name', value: '/^[a-z]+$/' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'lessThan', path: '$.items[*].price', value: '20' }).ok, true)
})

/* ----------------------------------------------------------------- status */

both('status notEquals', { subject: 'status', op: 'notEquals', value: '200' }, { subject: 'status', op: 'notEquals', value: '201' })
both('status oneOf with pipes', { subject: 'status', op: 'oneOf', value: '200|201' }, { subject: 'status', op: 'oneOf', value: '200, 204' })
both('status isSuccess', { subject: 'status', op: 'isSuccess' }, { subject: 'status', op: 'isSuccess' }, RES, { ...RES, status: 500 })
both('status isClass 2xx', { subject: 'status', op: 'isClass', value: '2xx' }, { subject: 'status', op: 'isClass', value: '4XX' })
both('status isClass bare digit', { subject: 'status', op: 'isClass', value: '2' }, { subject: 'status', op: 'isClass', value: '5' })
both('status lessThan', { subject: 'status', op: 'lessThan', value: '300' }, { subject: 'status', op: 'lessThan', value: '201' })
both('status greaterThan', { subject: 'status', op: 'greaterThan', value: '200' }, { subject: 'status', op: 'greaterThan', value: '201' })
both('status between', { subject: 'status', op: 'between', value: '200-299' }, { subject: 'status', op: 'between', value: '400-499' })

test('between accepts every range spelling, inclusive', () => {
  for (const value of ['201-201', '200..299', '200,299', '200 299', '299-200', '200 to 299', ' 200 - 299 ']) {
    assert.equal(run({ subject: 'status', op: 'between', value }).ok, true, value)
  }
  const bad = run({ subject: 'status', op: 'between', value: 'soon' })
  assert.equal(bad.ok, false)
  assert.match(bad.detail, /not a range/)
})

test('isClass names a nonsense class as the assertion’s fault', () => {
  const r = run({ subject: 'status', op: 'isClass', value: 'success' })
  assert.equal(r.ok, false)
  assert.match(r.detail, /not a status class/)
})

/* --------------------------------------------------------- time and size */

both('time greaterThan', { subject: 'time', op: 'greaterThan', value: '100' }, { subject: 'time', op: 'greaterThan', value: '500' })
both('time between', { subject: 'time', op: 'between', value: '100..300' }, { subject: 'time', op: 'between', value: '1-100' })
both('size greaterThan', { subject: 'size', op: 'greaterThan', value: '100' }, { subject: 'size', op: 'greaterThan', value: '1000' })
both('size between', { subject: 'size', op: 'between', value: '500,600' }, { subject: 'size', op: 'between', value: '0 100' })

test('the time detail keeps its old voice', () => {
  assert.equal(run({ subject: 'time', op: 'lessThan', value: '100' }).detail, 'took 240ms, budget 100ms')
  assert.equal(run({ subject: 'time', op: 'lessThan', value: '500' }).detail, '240ms, budget 500ms')
})

/* ----------------------------------------------------------- content type */

both('contentType notContains', { subject: 'contentType', op: 'notContains', value: 'xml' }, { subject: 'contentType', op: 'notContains', value: 'JSON' })
both('contentType matches', { subject: 'contentType', op: 'matches', value: '/^application\\/json/i' }, { subject: 'contentType', op: 'matches', value: '^text/' })

/* ---------------------------------------------------------------- headers */

both('header notEquals', { subject: 'header', op: 'notEquals', path: 'x-request-id', value: 'other' }, { subject: 'header', op: 'notEquals', path: 'x-request-id', value: 'req-77' })
both('header notContains', { subject: 'header', op: 'notContains', path: 'etag', value: 'zzz' }, { subject: 'header', op: 'notContains', path: 'etag', value: 'abc' })
both('header matches', { subject: 'header', op: 'matches', path: 'x-request-id', value: '/^REQ-\\d+$/i' }, { subject: 'header', op: 'matches', path: 'x-request-id', value: '^\\d+$' })
both('header startsWith', { subject: 'header', op: 'startsWith', path: 'etag', value: 'W/' }, { subject: 'header', op: 'startsWith', path: 'etag', value: '"' })
both('header oneOf', { subject: 'header', op: 'oneOf', path: 'x-request-id', value: 'a, req-77' }, { subject: 'header', op: 'oneOf', path: 'x-request-id', value: 'a, b' })
both('header lessThan', { subject: 'header', op: 'lessThan', path: 'x-ratelimit-remaining', value: '100' }, { subject: 'header', op: 'lessThan', path: 'x-ratelimit-remaining', value: '10' })
both('header greaterThan', { subject: 'header', op: 'greaterThan', path: 'X-RATELIMIT-REMAINING', value: '0' }, { subject: 'header', op: 'greaterThan', path: 'x-ratelimit-remaining', value: '42' })

test('a numeric header comparison on text says it is not a number', () => {
  const r = run({ subject: 'header', op: 'greaterThan', path: 'x-request-id', value: '0' })
  assert.equal(r.ok, false)
  assert.match(r.detail, /not a number/)
})

test('a missing header fails every value operator', () => {
  for (const op of ['notEquals', 'notContains', 'matches', 'startsWith', 'oneOf', 'lessThan', 'greaterThan']) {
    const r = run({ subject: 'header', op, path: 'x-nope', value: '1' })
    assert.equal(r.ok, false, op)
    assert.match(r.detail, /missing/)
  }
})

/* ------------------------------------------------------------------- body */

both('body notMatches', { subject: 'body', op: 'notMatches', value: '/password/i' }, { subject: 'body', op: 'notMatches', value: '/ADA@/i' })
both('body equals', { subject: 'body', op: 'equals', value: RES.body }, { subject: 'body', op: 'equals', value: '{}' })
both('body startsWith', { subject: 'body', op: 'startsWith', value: '{"id"' }, { subject: 'body', op: 'startsWith', value: '[' })
both('body isJson', { subject: 'body', op: 'isJson' }, { subject: 'body', op: 'isJson' }, RES, { ...RES, json: undefined, body: '<html>' })

test('isJson parses the body itself when no parse was shared', () => {
  assert.equal(run({ subject: 'body', op: 'isJson' }, { ...RES, json: undefined, body: '[1,2]' }).ok, true)
  assert.equal(run({ subject: 'body', op: 'isJson' }, { ...RES, json: undefined, body: '' }).ok, false)
})

test('regex literals carry their flags, and bare patterns still work', () => {
  assert.equal(run({ subject: 'body', op: 'matches', value: '/ADA@EXAMPLE/i' }).ok, true)
  assert.equal(run({ subject: 'body', op: 'matches', value: '/ADA@EXAMPLE/' }).ok, false)
  assert.equal(run({ subject: 'body', op: 'matches', value: '/ada@example/g' }).ok, true)
  assert.equal(run({ subject: 'body', op: 'matches', value: '"active":true' }).ok, true)
  assert.equal(run({ subject: 'body', op: 'matches', value: 'ada' }).detail, 'matches /ada/')
})

test('an invalid regex blames the pattern for every operator that takes one', () => {
  for (const fields of [
    { subject: 'body', op: 'notMatches', value: '([' },
    { subject: 'body', op: 'matches', value: '/x/q' },
    { subject: 'contentType', op: 'matches', value: '([' },
    { subject: 'header', op: 'matches', path: 'etag', value: '([' },
    { subject: 'json', op: 'matches', path: 'email', value: '([' }
  ]) {
    const r = run(fields)
    assert.equal(r.ok, false)
    assert.match(r.detail, /that is not a valid pattern — /)
  }
})

/* ------------------------------------------------------------------- json */

both('json notContains', { subject: 'json', op: 'notContains', path: 'tags', value: 'root' }, { subject: 'json', op: 'notContains', path: 'tags', value: 'beta' })
both('json lengthAbove', { subject: 'json', op: 'lengthAbove', path: 'items', value: '2' }, { subject: 'json', op: 'lengthAbove', path: 'items', value: '3' })
both('json lengthBelow', { subject: 'json', op: 'lengthBelow', path: 'email', value: '20' }, { subject: 'json', op: 'lengthBelow', path: 'email', value: '5' })
both('json lengthAbove on an object counts keys', { subject: 'json', op: 'lengthAbove', path: 'items[0]', value: '2' }, { subject: 'json', op: 'lengthAbove', path: 'meta', value: '0' })
both('json greaterThan', { subject: 'json', op: 'greaterThan', path: 'items[0].price', value: '3' }, { subject: 'json', op: 'greaterThan', path: 'items[0].price', value: '3.5' })
both('json lessThan', { subject: 'json', op: 'lessThan', path: 'items[-1].price', value: '13' }, { subject: 'json', op: 'lessThan', path: 'items[-1].price', value: '12' })
both('json between', { subject: 'json', op: 'between', path: 'items[1].price', value: '1-2' }, { subject: 'json', op: 'between', path: 'items[1].price', value: '2..5' })
both('json oneOf', { subject: 'json', op: 'oneOf', path: 'items[0].name', value: 'pear | apple' }, { subject: 'json', op: 'oneOf', path: 'items[0].name', value: 'pear, plum' })
both('json matches', { subject: 'json', op: 'matches', path: 'email', value: '@example\\.com$' }, { subject: 'json', op: 'matches', path: 'email', value: '/@test\\./' })
both('json startsWith', { subject: 'json', op: 'startsWith', path: 'email', value: 'ada' }, { subject: 'json', op: 'startsWith', path: 'email', value: 'bob' })
both('json endsWith', { subject: 'json', op: 'endsWith', path: 'email', value: '.com' }, { subject: 'json', op: 'endsWith', path: 'email', value: '.org' })
both('json isFormat', { subject: 'json', op: 'isFormat', path: 'id', value: 'uuid' }, { subject: 'json', op: 'isFormat', path: 'email', value: 'uuid' })
both('json isEmpty', { subject: 'json', op: 'isEmpty', path: 'meta' }, { subject: 'json', op: 'isEmpty', path: 'tags' })
both('json notEmpty', { subject: 'json', op: 'notEmpty', path: 'tags' }, { subject: 'json', op: 'notEmpty', path: 'note' })
both('json isNull', { subject: 'json', op: 'isNull', path: 'parent' }, { subject: 'json', op: 'isNull', path: 'note' })
both('json notNull', { subject: 'json', op: 'notNull', path: 'note' }, { subject: 'json', op: 'notNull', path: 'parent' })
both('json isTrue', { subject: 'json', op: 'isTrue', path: 'active' }, { subject: 'json', op: 'isTrue', path: 'deleted' })
both('json isFalse', { subject: 'json', op: 'isFalse', path: 'deleted' }, { subject: 'json', op: 'isFalse', path: 'active' })
both('json includes', { subject: 'json', op: 'includes', path: 'tags', value: 'admin' }, { subject: 'json', op: 'includes', path: 'tags', value: 'adm' })
both('json isUnique on an array', { subject: 'json', op: 'isUnique', path: 'tags' }, { subject: 'json', op: 'isUnique', path: 'list' }, { ...RES, json: { ...RES.json, tags: ['a', 'b'], list: [1, 2, 1] } })
both('json isSorted on an array', { subject: 'json', op: 'isSorted', path: 'tags', value: 'asc' }, { subject: 'json', op: 'isSorted', path: 'tags', value: 'desc' })
both('json isType integer', { subject: 'json', op: 'isType', path: 'items[0].id', value: 'integer' }, { subject: 'json', op: 'isType', path: 'items[0].price', value: 'integer' })

test('empty means "", [], {} and null', () => {
  for (const path of ['note', 'meta', 'parent']) assert.equal(run({ subject: 'json', op: 'isEmpty', path }).ok, true, path)
  assert.equal(run({ subject: 'json', op: 'isEmpty', path: '', value: '' }, { ...RES, json: [] }).ok, true)
})

test('isSorted compares numbers numerically and strings by locale', () => {
  const res = { ...RES, json: { n: [2, 10, 100], s: ['apple', 'Banana', 'cherry'], d: [3, 2, 2, 1] } }
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'n' }, res).ok, true)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 's', value: 'ascending' }, res).ok, true)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'd', value: 'desc' }, res).ok, true)
  assert.match(run({ subject: 'json', op: 'isSorted', path: 'n', value: 'sideways' }, res).detail, /not an order/)
  assert.equal(run({ subject: 'json', op: 'isSorted', path: 'email' }).ok, false)
})

test('includes is strict membership and needs an array', () => {
  const r = run({ subject: 'json', op: 'includes', path: 'email', value: 'ada' })
  assert.equal(r.ok, false)
  assert.match(r.detail, /not an array/)
  assert.equal(run({ subject: 'json', op: 'includes', path: 'items[*].id', value: '2' }).ok, false)
  assert.equal(run({ subject: 'json', op: 'includes', path: 'n', value: '2' }, { ...RES, json: { n: [1, 2] } }).ok, true)
})

test('contains on an array checks membership as well as the JSON text', () => {
  assert.equal(run({ subject: 'json', op: 'contains', path: 'tags', value: 'admin' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'contains', path: 'tags', value: 'adm' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'contains', path: 'n', value: '2' }, { ...RES, json: { n: [1, 2] } }).ok, true)
})

test('equals compares structures deeply when the value is JSON', () => {
  assert.equal(run({ subject: 'json', op: 'equals', path: 'tags', value: '["admin","beta"]' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'equals', path: 'items[0]', value: '{"price":3.5,"name":"apple","id":1}' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'equals', path: 'tags', value: '["beta","admin"]' }).ok, false)
  assert.equal(run({ subject: 'json', op: 'notEquals', path: 'tags', value: '["beta"]' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'equals', path: 'parent', value: 'null' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'equals', path: 'items[0].id', value: '1' }).ok, true)
})

test('numeric operators say so when the value is not a number', () => {
  const r = run({ subject: 'json', op: 'greaterThan', path: 'email', value: '0' })
  assert.equal(r.ok, false)
  assert.match(r.detail, /not a number/)
  assert.match(run({ subject: 'json', op: 'greaterThan', path: 'items[0].price', value: 'lots' }).detail, /not a number/)
})

test('an unknown type or format is the assertion’s fault', () => {
  assert.match(run({ subject: 'json', op: 'isType', path: 'email', value: 'text' }).detail, /not a type/)
  assert.match(run({ subject: 'json', op: 'isFormat', path: 'email', value: 'postcode' }).detail, /no format called/)
})

test('a negative index and a $ prefix work inside check', () => {
  assert.equal(run({ subject: 'json', op: 'equals', path: 'tags[-1]', value: 'beta' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'equals', path: '$.items[-1].name', value: 'cherry' }).ok, true)
  assert.equal(run({ subject: 'json', op: 'exists', path: 'tags[-3]' }).ok, false)
})

/* ---------------------------------------------------------------- formats */

const FORMAT_CASES = {
  email: [['ada@example.com', 'a.b+c@sub.example.co.uk'], ['ada', 'ada@example', 'a b@example.com', '@example.com']],
  uuid: [['3f2b8c1e-4a5d-4e6f-9a1b-2c3d4e5f6a7b', '00000000-0000-0000-0000-000000000000'], ['3f2b8c1e4a5d4e6f9a1b2c3d4e5f6a7b', 'not-a-uuid']],
  date: [['2026-01-31', '2024-02-29'], ['2023-02-29', '2026-13-01', '31/01/2026', '2026-1-1']],
  'date-time': [['2026-01-31T09:30:00Z', '2026-01-31T09:30:00.123+02:00', '2026-01-31T09:30'], ['2026-01-31', '2026-01-31 09:30:00', '2026-01-31T25:00:00Z']],
  time: [['09:30', '23:59:59', '09:30:00Z'], ['24:00', '9:30', 'noon']],
  uri: [['https://example.com/a?b=c', 'http://localhost:8080'], ['example.com', 'ftp://example.com', 'https://exa mple.com']],
  url: [['https://example.com'], ['/relative/path']],
  ipv4: [['192.168.0.1', '0.0.0.0', '255.255.255.255'], ['256.1.1.1', '1.2.3', '01.2.3.4']],
  ipv6: [['::1', '2001:db8::8a2e:370:7334', 'fe80::1'], ['2001:db8:::1', '12345::', 'abc']],
  hostname: [['example.com', 'api-v2.example.co.uk', 'localhost'], ['-bad.example.com', 'exa_mple.com', 'a..b']],
  jwt: [['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-_123', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'], ['abc.def', 'a.b.c.d', 'ey J.x.y']],
  hex: [['deadBEEF', '0x1f'], ['xyz', '0x']],
  base64: [['SGVsbG8=', 'SGVsbG8gd29ybGQ='], ['SGVsbG8', 'SGV$bG8=', '']],
  numeric: [['42', '-3.14', '+7', '.5'], ['4 2', '1e3', 'abc', '']],
  semver: [['1.2.3', 'v2.0.0-rc.1+build.5', '0.0.0'], ['1.2', '01.2.3', '1.2.3.4']]
}

for (const [name, [good, bad]] of Object.entries(FORMAT_CASES)) {
  test(`format ${name}`, () => {
    assert.ok(FORMATS[name], `${name} is defined`)
    assert.ok(FORMATS[name].label)
    for (const s of good) assert.equal(FORMATS[name].test(s), true, `${name} should accept ${s}`)
    for (const s of bad) assert.equal(FORMATS[name].test(s), false, `${name} should reject ${s}`)
  })
}

test('every format in FORMATS has cases here', () => {
  assert.deepEqual(Object.keys(FORMATS).sort(), Object.keys(FORMAT_CASES).sort())
})

/* ----------------------------------------------------------------- schema */

const USER_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'role'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 20 },
    role: { enum: ['admin', 'user'] },
    email: { type: 'string', format: 'email' },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true, maxItems: 3 },
    address: { $ref: '#/definitions/address' },
    score: { type: 'number', exclusiveMaximum: 100, multipleOf: 0.5 },
    nickname: { type: 'string', nullable: true },
    contact: { anyOf: [{ type: 'string', format: 'email' }, { type: 'string', pattern: '^\\+\\d+$' }] }
  },
  definitions: {
    address: { type: 'object', required: ['city'], properties: { city: { type: 'string' }, zip: { $ref: '#/$defs/zip' } } }
  },
  $defs: { zip: { type: 'string', pattern: '^\\d{5}$' } }
}

const GOOD_USER = { id: 1, name: 'Ada', role: 'admin', email: 'ada@example.com', tags: ['a'], address: { city: 'London', zip: '12345' }, score: 99.5, nickname: null, contact: '+4412' }

test('a value that fits the schema has no errors', () => {
  assert.deepEqual(validateSchema(USER_SCHEMA, GOOD_USER), [])
})

test('schema errors are named by path', () => {
  const at = (value) => validateSchema(USER_SCHEMA, value).map((e) => `${e.path} ${e.message}`)
  assert.ok(at({ ...GOOD_USER, id: 'x' }).some((e) => e.startsWith('$.id should be integer, saw string')))
  assert.ok(at({ id: 1, name: 'Ada' }).includes('$.role is required'))
  assert.ok(at({ ...GOOD_USER, role: 'root' }).some((e) => e.startsWith('$.role should be one of')))
  assert.ok(at({ ...GOOD_USER, extra: 1 }).some((e) => e.startsWith('$.extra is not allowed')))
  assert.ok(at({ ...GOOD_USER, tags: ['a', 3] }).some((e) => e.startsWith('$.tags[1] should be string')))
  assert.ok(at({ ...GOOD_USER, tags: ['a', 'a'] }).some((e) => e.includes('unique')))
  assert.ok(at({ ...GOOD_USER, address: { zip: '12345' } }).includes('$.address.city is required'))
  assert.ok(at({ ...GOOD_USER, address: { city: 'X', zip: 'abc' } }).some((e) => e.startsWith('$.address.zip should match')))
  assert.ok(at({ ...GOOD_USER, email: 'nope' }).some((e) => e.startsWith('$.email should be a valid email')))
  assert.ok(at({ ...GOOD_USER, score: 100 }).some((e) => e.startsWith('$.score should be under 100')))
  assert.ok(at({ ...GOOD_USER, score: 3.3 }).some((e) => e.includes('multiple of 0.5')))
  assert.ok(at({ ...GOOD_USER, contact: 'hello' }).some((e) => e.includes('anyOf')))
  assert.ok(at({ ...GOOD_USER, name: '' }).some((e) => e.startsWith('$.name should be at least 1')))
  assert.ok(at({ ...GOOD_USER, id: 0 }).some((e) => e.startsWith('$.id should be at least 1')))
})

test('schema combinators: allOf, oneOf, not, const, type lists, prefixItems', () => {
  assert.deepEqual(validateSchema({ allOf: [{ type: 'number' }, { minimum: 2 }] }, 3), [])
  assert.equal(validateSchema({ allOf: [{ type: 'number' }, { minimum: 2 }] }, 1).length, 1)
  assert.equal(validateSchema({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 2).length, 1)
  assert.deepEqual(validateSchema({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 2.5), [])
  assert.equal(validateSchema({ not: { type: 'null' } }, null).length, 1)
  assert.equal(validateSchema({ const: 'v1' }, 'v2').length, 1)
  assert.deepEqual(validateSchema({ type: ['string', 'null'] }, null), [])
  assert.deepEqual(validateSchema({ prefixItems: [{ type: 'string' }, { type: 'number' }] }, ['a', 1]), [])
  assert.equal(validateSchema({ prefixItems: [{ type: 'string' }, { type: 'number' }] }, [1, 1]).length, 1)
  assert.equal(validateSchema({ type: 'array', minItems: 1 }, []).length, 1)
  assert.equal(validateSchema({ $ref: '#/definitions/missing' }, 1).length, 1)
})

test('the schema subject reports the first error and how many more', () => {
  const schema = JSON.stringify({ type: 'object', properties: { user: { type: 'object', properties: { id: { type: 'string' }, a: { type: 'string' }, b: { type: 'string' } } } } })
  const res = { ...RES, json: { user: { id: 1, a: 2, b: 3 } } }
  const r = run({ subject: 'schema', op: 'matchesSchema', value: schema }, res)
  assert.equal(r.ok, false)
  assert.equal(r.detail, '$.user.id should be string, saw number (and 2 more)')
})

test('the schema subject can look at a path, including a wildcard', () => {
  const item = JSON.stringify({ type: 'object', required: ['id', 'price'], properties: { price: { type: 'number', minimum: 0 } } })
  assert.equal(run({ subject: 'schema', op: 'matchesSchema', path: 'items[*]', value: item }).ok, true)
  assert.equal(run({ subject: 'schema', op: 'matchesSchema', path: 'items[0]', value: item }).ok, true)
  const bad = run({ subject: 'schema', op: 'matchesSchema', path: 'items[*]', value: JSON.stringify({ properties: { price: { maximum: 5 } } }) })
  assert.equal(bad.ok, false)
  assert.match(bad.detail, /^\$\.items\[2\]\.price should be at most 5/)
  assert.equal(run({ subject: 'schema', op: 'matchesSchema', path: 'nope', value: '{}' }).ok, false)
})

test('a schema that is not JSON blames the schema', () => {
  const r = run({ subject: 'schema', op: 'matchesSchema', value: '{ type: object }' })
  assert.equal(r.ok, false)
  assert.match(r.detail, /^that schema is not valid JSON — /)
  assert.match(run({ subject: 'schema', op: 'matchesSchema', value: '{}' }, { ...RES, json: undefined }).detail, /not JSON/)
})

test('inferSchema describes a sample that then validates against it', () => {
  const samples = [
    RES.json,
    [{ id: 1, tags: ['a'] }, { id: 2.5, extra: null }, { id: 3, tags: [] }],
    { nested: { deep: { list: [1, 'two', null, { x: true }] } }, when: '2026-01-31', site: 'https://example.com' },
    [],
    [[1, 2], [3]],
    'just a string',
    42,
    null,
    { mixed: [{ a: 1 }, 'x', { a: 'y', b: [] }] }
  ]
  for (const sample of samples) {
    const schema = inferSchema(sample)
    assert.deepEqual(validateSchema(schema, sample), [], JSON.stringify(sample))
  }
})

test('inferSchema infers types, required keys and formats', () => {
  const s = inferSchema(RES.json)
  assert.equal(s.type, 'object')
  assert.ok(s.required.includes('email'))
  assert.equal(s.properties.email.format, 'email')
  assert.equal(s.properties.id.format, 'uuid')
  assert.equal(s.properties.created_at.format, 'date-time')
  assert.equal(s.properties.parent.type, 'null')
  assert.equal(s.properties.items.items.properties.id.type, 'integer')
  assert.equal(s.properties.items.items.properties.price.type, 'number')
  const merged = inferSchema([{ a: 1, b: 'x' }, { a: 2 }])
  assert.deepEqual(merged.items.required, ['a'])
  assert.deepEqual(inferSchema([1, 'a']).items.type, ['string', 'integer'])
  assert.ok(validateSchema(merged, [{ a: 'nope' }]).length > 0, 'the inferred schema still constrains')
})

/* ---------------------------------------------------------------- cookies */

test('cookies split around Expires dates and read their flags', () => {
  const jar = parseCookies(RES.headers)
  assert.deepEqual(jar.map((c) => c.name), ['session', 'theme'])
  assert.equal(jar[0].value, 'abc123')
  assert.ok(jar[0].attributes.some((a) => a.name === 'Expires' && a.value === 'Wed, 21 Oct 2026 07:28:00 GMT'))
})

test('cookies from an array header, in any header case', () => {
  const jar = parseCookies({ 'SET-COOKIE': ['a=1; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Secure', 'b="quoted"; HttpOnly'] })
  assert.deepEqual(jar.map((c) => [c.name, c.value]), [['a', '1'], ['b', 'quoted']])
})

both('cookie exists', { subject: 'cookie', op: 'exists', path: 'theme' }, { subject: 'cookie', op: 'exists', path: 'cart' })
both('cookie absent', { subject: 'cookie', op: 'absent', path: 'cart' }, { subject: 'cookie', op: 'absent', path: 'session' })
both('cookie equals', { subject: 'cookie', op: 'equals', path: 'theme', value: 'dark' }, { subject: 'cookie', op: 'equals', path: 'theme', value: 'light' })
both('cookie contains', { subject: 'cookie', op: 'contains', path: 'session', value: '123' }, { subject: 'cookie', op: 'contains', path: 'session', value: 'xyz' })
both('cookie hasFlag', { subject: 'cookie', op: 'hasFlag', path: 'session', value: 'httponly' }, { subject: 'cookie', op: 'hasFlag', path: 'theme', value: 'HttpOnly' })
both('cookie hasFlag with a value', { subject: 'cookie', op: 'hasFlag', path: 'session', value: 'SameSite=strict' }, { subject: 'cookie', op: 'hasFlag', path: 'session', value: 'SameSite=Lax' })

test('cookie hasFlag takes several flags, and a missing cookie lists what was set', () => {
  assert.equal(run({ subject: 'cookie', op: 'hasFlag', path: 'session', value: 'HttpOnly, Secure, SameSite' }).ok, true)
  const r = run({ subject: 'cookie', op: 'equals', path: 'cart', value: '1' })
  assert.match(r.detail, /saw session, theme/)
})

/* ------------------------------------------------------ redirects, transport */

both('redirects lessThan', { subject: 'redirects', op: 'lessThan', value: '2' }, { subject: 'redirects', op: 'lessThan', value: '1' })
both('redirects equals', { subject: 'redirects', op: 'equals', value: '1' }, { subject: 'redirects', op: 'equals', value: '0' })
both('transport isHttps', { subject: 'transport', op: 'isHttps' }, { subject: 'transport', op: 'isHttps' }, RES, { ...RES, secure: false })

test('redirects default to none, and https is read from the request url too', () => {
  assert.equal(run({ subject: 'redirects', op: 'lessThan', value: '1' }, { ...RES, redirects: undefined }).ok, true)
  assert.equal(run({ subject: 'transport', op: 'isHttps' }, { status: 200, request: { url: 'https://x.test' } }).ok, true)
})

/* ---------------------------------------------------------------- describe */

test('describe reads as a sentence', () => {
  assert.equal(describe({ subject: 'status', op: 'equals', value: '200' }), 'Status equals 200')
  assert.equal(describe({ subject: 'time', op: 'lessThan', value: '500' }), 'Response time is under 500 ms')
  assert.equal(describe({ subject: 'header', op: 'exists', path: 'x-request-id', value: 'ignored' }), 'Header x-request-id exists')
  assert.equal(describe({ subject: 'json', op: 'greaterThan', path: 'items[*].price', value: '0' }), 'items[*].price is over 0')
  assert.equal(describe({ subject: 'schema', op: 'matchesSchema', value: '{"type":"object"}' }), 'Body matches schema')
  assert.equal(describe({ subject: 'cookie', op: 'hasFlag', path: 'sid', value: 'HttpOnly' }), 'Cookie sid has flag HttpOnly')
  assert.equal(describe({ subject: 'status', op: 'between', value: '200-299' }), 'Status is between 200 and 299')
  assert.equal(describe({ subject: 'size', op: 'lessThan', value: '102400' }), 'Response size is under 100 KB')
  assert.equal(describe({ subject: 'json', op: 'isSorted', path: 'items' }), 'items is sorted ascending')
})

/* ----------------------------------------------------------------- catalog */

test('the catalog is a well-formed, sizeable set of presets', () => {
  const ids = CATALOG.map((g) => g.id)
  assert.deepEqual(ids, ['status', 'performance', 'headers', 'body', 'json', 'schema', 'security'])
  const items = CATALOG.flatMap((g) => g.items)
  assert.ok(items.length >= 40 && items.length <= 55, `${items.length} presets`)
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'preset ids are unique')
  for (const group of CATALOG) {
    assert.ok(group.label && group.blurb, group.id)
    for (const item of group.items) {
      const { subject, op, path, value } = item.assertion
      assert.ok(item.title && item.blurb, item.id)
      assert.ok(OPERATORS[subject]?.includes(op), `${item.id}: ${subject}/${op}`)
      assert.ok(OP_LABEL[op], `${item.id}: label`)
      assert.equal(typeof path, 'string')
      assert.equal(typeof value, 'string')
      if (needsValue({ op })) assert.ok(value.length, `${item.id} needs a value`)
      assert.ok(describe(item.assertion).length > 0, item.id)
      // Every preset must at least run: a pattern or schema that does not
      // parse would fail with the assertion's own fault.
      const r = check(emptyAssertion(item.assertion), RES)
      assert.doesNotMatch(r.detail, /not a valid pattern|not valid JSON|not one Prism knows|not a type|no format called|not a range/, item.id)
    }
  }
})

test('the security presets catch leaks and pass on a clean body', () => {
  const get = (id) => CATALOG.flatMap((g) => g.items).find((i) => i.id === id).assertion
  assert.equal(run(get('no-password')).ok, true)
  assert.equal(run(get('no-password'), { ...RES, body: '{"user":"a","Password" : "x"}' }).ok, false)
  assert.equal(run(get('no-stack-trace')).ok, true)
  assert.equal(run(get('no-stack-trace'), { ...RES, body: 'Error: boom\n    at handler (/app/server.js:10:5)' }).ok, false)
  assert.equal(run(get('no-stack-trace'), { ...RES, body: 'Traceback (most recent call last):\n  File "x.py"' }).ok, false)
  assert.equal(run(get('cookie-httponly')).ok, true)
})

/* ---------------------------------------------------------------- generate */

const REAL = {
  status: 200,
  headers: {
    'content-type': 'application/json',
    'x-request-id': 'f1e2',
    etag: '"v9"',
    'strict-transport-security': 'max-age=63072000',
    'set-cookie': 'sid=xyz; Path=/; HttpOnly; Secure'
  },
  bytes: 0,
  timing: { total: 183 },
  secure: true,
  json: {
    data: {
      users: [
        { id: 'a1b2c3d4-0000-4000-8000-000000000001', email: 'a@example.com', created_at: '2026-01-01T10:00:00Z', age: 30, site: 'https://a.example.com' },
        { id: 'a1b2c3d4-0000-4000-8000-000000000002', email: 'b@example.com', created_at: '2026-01-02T10:00:00Z', age: 41.5, site: 'https://b.example.com' }
      ],
      cursor: null
    },
    total: 2,
    page: 1,
    ok: true,
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    tags: [],
    owner: { email: 'owner@example.com' },
    items: [{ id: 5 }, { id: 6 }]
  }
}
REAL.body = JSON.stringify(REAL.json)
REAL.bytes = REAL.body.length

test('generate proposes a suite that passes on the response it came from', () => {
  const out = generate(REAL)
  assert.ok(out.length >= 10, `${out.length} suggestions`)
  for (const s of out) {
    assert.ok(s.label && s.group && typeof s.picked === 'boolean', JSON.stringify(s))
    assert.ok(s.assertion.id.startsWith('as-') && s.assertion.on === true)
    assert.ok(OPERATORS[s.assertion.subject].includes(s.assertion.op))
    const r = check(s.assertion, REAL)
    assert.equal(r.ok, true, `${s.label}: ${r.detail}`)
  }
  const keys = out.map((s) => `${s.assertion.subject}|${s.assertion.op}|${s.assertion.path}|${s.assertion.value}`)
  assert.equal(new Set(keys).size, keys.length, 'no duplicates')
})

test('generate covers status, type, time, shape, formats and the schema', () => {
  const out = generate(REAL)
  const find = (fn) => out.find((s) => fn(s.assertion))
  assert.equal(find((a) => a.subject === 'status').assertion.value, '200')
  assert.ok(find((a) => a.subject === 'contentType' && a.value === 'json'))
  assert.equal(find((a) => a.subject === 'time').assertion.value, '750')
  assert.ok(find((a) => a.subject === 'header' && a.path === 'x-request-id').picked)
  assert.equal(find((a) => a.subject === 'header' && a.path === 'etag').picked, false)
  assert.ok(find((a) => a.subject === 'json' && a.op === 'isType' && a.path === 'total' && a.value === 'number'))
  assert.ok(find((a) => a.op === 'lengthAbove' && a.path === 'data.users'))
  assert.ok(find((a) => a.op === 'lengthAbove' && a.path === 'items'))
  assert.ok(!find((a) => a.op === 'lengthAbove' && a.path === 'tags'), 'an empty list is not asserted non-empty')
  assert.ok(find((a) => a.op === 'isUnique' && a.path === 'data.users[*].id'))
  assert.ok(find((a) => a.op === 'isUnique' && a.path === 'items[*].id'))
  assert.ok(find((a) => a.op === 'isFormat' && a.path === 'data.users[*].email' && a.value === 'email'))
  assert.ok(find((a) => a.op === 'isFormat' && a.path === 'owner.email'))
  assert.ok(find((a) => a.op === 'isFormat' && a.value === 'uuid'))
  assert.ok(find((a) => a.op === 'isFormat' && a.value === 'date-time'))
  const schema = out.find((s) => s.assertion.subject === 'schema')
  assert.equal(schema.label, 'Body matches the inferred schema')
  assert.equal(schema.picked, false)
  assert.ok(find((a) => a.subject === 'cookie' && a.path === 'sid' && a.value === 'HttpOnly'))
  assert.ok(find((a) => a.subject === 'transport'))
  assert.ok(find((a) => a.subject === 'header' && a.path === 'strict-transport-security'))
})

test('generate never pins a volatile value with equals', () => {
  const out = generate(REAL)
  assert.ok(!out.some((s) => s.assertion.subject === 'json' && ['equals', 'notEquals'].includes(s.assertion.op)))
})

test('generate handles a root array, a non-JSON body and an empty response', () => {
  const arr = { status: 200, headers: { 'content-type': 'application/json' }, timing: { total: 10 }, bytes: 40, json: [{ id: 1 }, { id: 2 }] }
  const out = generate(arr)
  assert.ok(out.some((s) => s.assertion.op === 'isUnique' && s.assertion.path === '[*].id'))
  for (const s of out) assert.equal(check(s.assertion, arr).ok, true, s.label)

  const html = { status: 404, headers: { 'content-type': 'text/html' }, body: '<h1>no</h1>', bytes: 11, timing: { total: 5 } }
  const plain = generate(html)
  assert.ok(plain.every((s) => s.assertion.subject !== 'json' && s.assertion.subject !== 'schema'))
  assert.equal(plain[0].assertion.value, '404')

  for (const s of generate({})) assert.equal(check(s.assertion, {}).ok, true, s.label)
})

test('generate stays honest past the sampled items of a long list', () => {
  const items = Array.from({ length: 60 }, (_v, i) => ({ id: i, note: i === 55 ? null : 'x' }))
  const res = { status: 200, headers: {}, timing: { total: 1 }, bytes: 10, json: { items } }
  for (const s of generate(res)) assert.equal(check(s.assertion, res).ok, true, s.label)
})
