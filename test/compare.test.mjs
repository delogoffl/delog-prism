/**
 * Comparing a run in one environment with a run in another: graded by what
 * a difference means, not by whether the bodies are byte-for-byte equal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareOne, compareSummary, compareMarkdown } from '../lib/compare.js'

const ok = (json, more = {}) => ({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, json, timing: { total: 40 }, bytes: 100, checks: [], ...more })

test('the same contract with other values is the same', () => {
  const r = compareOne(ok({ id: 'a1', name: 'Ada', tags: ['x'] }), ok({ id: 'b7', name: 'Grace', tags: ['y'] }))
  assert.equal(r.grade, 'same')
  assert.equal(r.values, 3)
  assert.deepEqual(r.fields, [])
})

test('a field missing in B, or of another type, breaks', () => {
  assert.equal(compareOne(ok({ id: 1, email: 'a@b' }), ok({ id: 2 })).grade, 'breaks')
  const retyped = compareOne(ok({ id: 1 }), ok({ id: '1' }))
  assert.equal(retyped.grade, 'breaks')
  assert.equal(retyped.fields[0].kind, 'retyped')
})

test('a field only in B differs but does not break', () => {
  const r = compareOne(ok({ id: 1 }), ok({ id: 2, beta: true }))
  assert.equal(r.grade, 'differs')
  assert.match(r.reasons[0].why, /only in B/)
})

test('status: another class breaks, the same class differs', () => {
  assert.equal(compareOne(ok({}), ok({}, { status: 500 })).grade, 'breaks')
  assert.equal(compareOne(ok({}), ok({}, { status: 201 })).grade, 'differs')
})

test('content type, a failed send and a flipped check all break', () => {
  assert.equal(compareOne(ok({}), { ...ok({}), headers: { 'content-type': 'text/html' } }).grade, 'breaks')
  assert.equal(compareOne(ok({}), { error: 'ECONNREFUSED', status: 0 }).grade, 'breaks')
  const flip = compareOne(ok({}, { checks: [{ name: 'has id', ok: true }] }), ok({}, { checks: [{ name: 'has id', ok: false }] }))
  assert.equal(flip.grade, 'breaks')
  assert.deepEqual(flip.flipped, [{ name: 'has id', a: true, b: false }])
})

test('much slower differs; a little slower does not', () => {
  assert.equal(compareOne(ok({}, { timing: { total: 40 } }), ok({}, { timing: { total: 400 } })).grade, 'differs')
  assert.equal(compareOne(ok({}, { timing: { total: 40 } }), ok({}, { timing: { total: 70 } })).grade, 'same')
})

test('a request run on one side only breaks; skipped on both is the same', () => {
  assert.equal(compareOne(ok({}), null).grade, 'breaks')
  assert.equal(compareOne({ skipped: true }, { skipped: true }).grade, 'same')
})

test('the summary and the Markdown count and name every row', () => {
  const rows = [
    { name: 'A', method: 'GET', ...compareOne(ok({ id: 1 }), ok({ id: 2 })) },
    { name: 'B', method: 'POST', ...compareOne(ok({ id: 1 }), ok({})) }
  ]
  assert.deepEqual(compareSummary(rows), { total: 2, same: 1, differs: 0, breaks: 1, slowerA: 0, slowerB: 0 })
  const md = compareMarkdown({ target: 'Checkout', a: 'Staging', b: 'Production', rows })
  assert.match(md, /\| GET A \| 200 · 40 ms \| 200 · 40 ms \| ✅ same \| 1 value differ \|/)
  assert.match(md, /❌ breaks \| 1 field missing in B/)
})
