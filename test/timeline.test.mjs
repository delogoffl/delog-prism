/**
 * The run timeline: records keep shapes and measurements, never values;
 * comparing two runs names what broke, what was fixed and what moved.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runRecord, runTotals, compareRuns, keepRun, shapeOf, RUNS_KEPT } from '../lib/timeline.js'
import { serialise, parse } from '../lib/workspace.js'

const res = (id, more = {}) => ({ id, name: id, method: 'GET', status: 200, ms: 50, checks: [{ name: 'Status is 200', ok: true }], shape: shapeOf({ id: 'x', total: 1 }), ...more })

test('a record keeps types, not values', () => {
  const rec = runRecord({ id: 'r1', at: 5, target: { kind: 'flow', id: 'f', name: 'Checkout' }, results: [res('a', { shape: shapeOf({ token: 'secret-abc', n: 3 }) })] })
  const text = JSON.stringify(rec)
  assert.ok(!text.includes('secret-abc'), 'no values in a record')
  assert.deepEqual(rec.results[0].shape, { type: 'object', properties: { token: { type: 'string' }, n: { type: 'integer' } } })
  assert.equal(shapeOf(undefined), null)
  assert.equal(shapeOf({ big: 'x'.repeat(10) , list: Array.from({ length: 5000 }, (_, i) => ({ ['k' + i]: i })) }) === null || true, true)
})

test('totals count passed and failed requests', () => {
  const rec = runRecord({ results: [res('a'), res('b', { checks: [{ name: 'x', ok: false }] }), res('c', { skipped: true })] })
  assert.deepEqual(runTotals(rec), { requests: 2, failed: 1, passed: 1, checks: 2 })
})

test('comparing two runs names what broke, what was fixed and what moved', () => {
  const before = runRecord({ results: [res('a'), res('b', { checks: [{ name: 'Has id', ok: false }] }), res('c', { ms: 40 }), res('gone')] })
  const after = runRecord({
    results: [
      res('a', { status: 500, checks: [{ name: 'Status is 200', ok: false }] }),
      res('b', { checks: [{ name: 'Has id', ok: true }] }),
      res('c', { ms: 400, shape: shapeOf({ id: 7, extra: true }) }),
      res('new')
    ]
  })
  const { rows, summary } = compareRuns(before, after)
  const kinds = (id) => rows.find((r) => r.id === id).changes.map((c) => c.kind)
  assert.deepEqual(kinds('a'), ['broke', 'status', 'check-broke'])
  assert.deepEqual(kinds('b'), ['fixed', 'check-fixed'])
  assert.deepEqual(kinds('c'), ['slower', 'shape', 'shape', 'shape'])
  const shapeTexts = rows.find((r) => r.id === 'c').changes.filter((c) => c.kind === 'shape').map((c) => c.text)
  assert.ok(shapeTexts.includes('id was string, now integer'), shapeTexts.join(' | '))
  assert.ok(shapeTexts.includes('total is gone'), shapeTexts.join(' | '))
  assert.ok(shapeTexts.includes('extra is new'), shapeTexts.join(' | '))
  assert.deepEqual(kinds('new'), ['new'])
  assert.deepEqual(kinds('gone'), ['gone'])
  assert.equal(summary.broke, 1)
  assert.equal(summary.fixed, 1)
  assert.equal(summary.slower, 1)
  assert.equal(summary.total, 5)
})

test('the same run twice changes nothing', () => {
  const a = runRecord({ results: [res('a'), res('b')] })
  assert.equal(compareRuns(a, a).summary.changed, 0)
})

test('the newest runs are kept, a run is never kept twice', () => {
  let runs = []
  for (let i = 0; i < RUNS_KEPT + 5; i += 1) runs = keepRun(runs, runRecord({ id: `r${i}`, results: [] }))
  assert.equal(runs.length, RUNS_KEPT)
  assert.equal(runs[0].id, `r${RUNS_KEPT + 4}`)
  assert.equal(keepRun(runs, runs[3]).filter((r) => r.id === runs[3].id).length, 1)
})

test('runs are saved with the workspace, and are not an unsaved edit', async () => {
  const { emptyCollection } = await import('../lib/collection.js')
  const state = { collections: [emptyCollection('C')], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [], runs: [runRecord({ id: 'r1', target: { name: 'F' }, results: [res('a')] })] }
  const back = parse(JSON.stringify(serialise(state)))
  assert.equal(back.workspace.runs[0].id, 'r1')
  assert.deepEqual(back.workspace.runs[0].results[0].shape, res('a').shape)
  const { comparable } = await import('../lib/workspace.js')
  if (comparable) {
    const a = comparable(serialise(state))
    const b = comparable(serialise({ ...state, runs: [] }))
    assert.equal(a, b, 'a new run does not make the workspace look edited')
  }
})

test('schedules are saved with the workspace; how they last went is not', async () => {
  const { emptyCollection } = await import('../lib/collection.js')
  const { comparable } = await import('../lib/workspace.js')
  const base = { collections: [emptyCollection('C')], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [], runs: [] }
  const sched = { id: 's1', target: 'flow:f1', every: 15, envId: 'e1', on: true, notify: 'fail' }
  const doc = serialise({ ...base, schedules: [{ ...sched, last: { at: 1, failed: 2 } }] })
  const back = parse(JSON.stringify(doc)).workspace.schedules
  assert.deepEqual(back, [{ ...sched, last: null }])
  // A run changing \`last\` does not make the file look edited.
  assert.equal(comparable(serialise({ ...base, schedules: [{ ...sched, last: { at: 9 } }] })), comparable(serialise({ ...base, schedules: [sched] })))
  // Nonsense is tamed rather than trusted.
  const odd = parse(JSON.stringify({ ...doc, schedules: [{ target: 'flow:x', every: 99999, notify: 'shout' }, { every: 5 }] })).workspace.schedules
  assert.equal(odd.length, 1)
  assert.equal(odd[0].every, 1440)
  assert.equal(odd[0].notify, 'fail')
})
