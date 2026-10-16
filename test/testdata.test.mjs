/**
 * Test data from a schema: variations per field, each with the verdict the
 * schema gives it, and how a send is judged against that verdict.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCases, fieldsOf, judge } from '../lib/testdata.js'
import { inferSchema } from '../lib/assert.js'

const SCHEMA = {
  type: 'object',
  required: ['email', 'qty'],
  properties: {
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 2, maxLength: 20 },
    qty: { type: 'integer', minimum: 1, maximum: 10 },
    size: { type: 'string', enum: ['S', 'M', 'L'] },
    gift: { type: 'boolean' },
    address: { type: 'object', required: ['city'], properties: { city: { type: 'string' } } }
  }
}
const BASE = { email: 'ada@example.com', name: 'Ada', qty: 2, size: 'M', gift: false, address: { city: 'London' } }

test('every field is found, nested ones by path, with whether it is required', () => {
  const f = fieldsOf(null, SCHEMA).map((x) => [x.path.join('.'), x.type, x.required])
  assert.deepEqual(f, [['email', 'string', true], ['name', 'string', false], ['qty', 'integer', true], ['size', 'string', false], ['gift', 'boolean', false], ['address', 'object', false], ['address.city', 'string', true]])
})

test('the rows start with the valid body, and each verdict is the schema’s', () => {
  const { rows, columns } = generateCases({ schema: SCHEMA, base: BASE })
  assert.deepEqual(columns, ['case', 'expect', 'body'])
  assert.deepEqual(rows[0], { case: 'The valid body', expect: 'accept', body: JSON.stringify(BASE) })
  const by = (c) => rows.find((r) => r.case === c)
  assert.equal(by('email not an email address').expect, 'reject')
  assert.equal(by('email missing (it is required)').expect, 'reject')
  assert.equal(JSON.parse(by('email missing (it is required)').body).email, undefined)
  assert.equal(by('name at its maximum length (20)').expect, 'accept')
  assert.equal(by('name one past its maximum (21)').expect, 'reject')
  assert.equal(by('name one short of its minimum (1)').expect, 'reject')
  assert.equal(by('name left out').expect, 'accept')
  assert.equal(by('qty at its minimum (1)').expect, 'accept')
  assert.equal(by('qty below its minimum (0)').expect, 'reject')
  assert.equal(by('qty above its maximum (11)').expect, 'reject')
  assert.equal(by('qty a fraction').expect, 'reject')
  assert.equal(by('size a value not in its list').expect, 'reject')
  assert.equal(by('size one of its values, "L"').expect, 'accept')
  assert.equal(by('gift the word "true" as a string').expect, 'reject')
  assert.equal(by('address.city null').expect, 'reject')
  assert.equal(by('address.city in other scripts, with an emoji').expect, 'accept')
  // The same text is too long for name, which allows 20 characters — the schema decides, not the label.
  assert.equal(by('name in other scripts, with an emoji').expect, 'reject')
  assert.ok(rows.every((r) => r.expect === 'accept' || r.expect === 'reject'))
})

test('a body that does not fit its schema is replaced by an example that does', () => {
  const { rows } = generateCases({ schema: SCHEMA, base: { nope: true } })
  assert.equal(rows[0].expect, 'accept')
})

test('a schema inferred from a body as written works too', () => {
  const body = { title: 'Lamp', price: 89, tags: ['desk'] }
  const { rows } = generateCases({ schema: inferSchema(body), base: body })
  assert.equal(rows[0].expect, 'accept')
  assert.ok(rows.length > 8)
  assert.equal(rows.find((r) => r.case === 'price a number written as a string').expect, 'reject')
})

test('rows stop at the limit', () => {
  assert.equal(generateCases({ schema: SCHEMA, base: BASE, limit: 5 }).rows.length, 5)
})

test('a send is judged against its row: accepted with 2xx, refused with 4xx, never a 5xx', () => {
  assert.equal(judge('accept', 201).ok, true)
  assert.equal(judge('accept', 422).ok, false)
  assert.equal(judge('reject', 400).ok, true)
  assert.equal(judge('reject', 200).ok, false)
  assert.match(judge('reject', 500).detail, /Server error 500/)
  assert.equal(judge('accept', 0, 'ECONNREFUSED').ok, false)
})
