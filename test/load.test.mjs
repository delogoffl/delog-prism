/**
 * Load mode's arithmetic: limits, ramp, percentiles, buckets, budgets.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPlan, startAt, loadSummary, loadMarkdown, LIMITS } from '../lib/load.js'

test('a plan is clamped to what Prism will run', () => {
  assert.deepEqual(loadPlan({ users: 500, seconds: 9999, rampSeconds: 999, thinkMs: -5 }), { users: LIMITS.users, seconds: LIMITS.seconds, rampSeconds: LIMITS.rampSeconds, thinkMs: 0 })
  assert.deepEqual(loadPlan({ users: 0, seconds: 1 }), { users: 1, seconds: 5, rampSeconds: 0, thinkMs: 0 })
  assert.equal(loadPlan({ seconds: 10, rampSeconds: 30 }).rampSeconds, 9, 'the ramp ends before the run does')
})

test('users start spread evenly over the ramp', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => startAt(i, 5, 8)), [0, 2000, 4000, 6000, 8000])
  assert.equal(startAt(3, 5, 0), 0)
})

const sample = (at, ms, more = {}) => ({ at, id: 'a', name: 'List', method: 'GET', ms, status: 200, ...more })

test('the summary counts, rates and ranks', () => {
  const samples = [
    ...Array.from({ length: 18 }, (_, i) => sample(i * 100, 40 + i)),
    sample(1900, 900, { id: 'b', name: 'Slow', status: 503 }),
    sample(1950, 0, { id: 'b', name: 'Slow', error: 'ECONNRESET', status: 0 })
  ]
  const s = loadSummary(samples, 2000)
  assert.equal(s.count, 20)
  assert.equal(s.errors, 2)
  assert.equal(s.errorRate, 0.1)
  assert.equal(s.rps, 10)
  assert.equal(s.seconds, 2)
  assert.deepEqual(s.buckets.map((b) => [b.count, b.errors]), [[10, 0], [10, 2]])
  assert.equal(s.requests[0].name, 'Slow', 'slowest first')
  assert.deepEqual(s.statuses, { 200: 18, 503: 1, error: 1 })
  assert.equal(s.max, 900)
  assert.ok(s.p50 >= 40 && s.p50 <= 60)
})

test('a failed check counts as an error, as it would in a run', () => {
  assert.equal(loadSummary([sample(0, 10, { failed: 1 })], 1000).errors, 1)
})

test('budgets: p95 and error rate', () => {
  const samples = Array.from({ length: 10 }, (_, i) => sample(i * 50, i < 9 ? 50 : 500, i === 9 ? { status: 500 } : {}))
  const within = loadSummary(samples, 1000, { p95: 1000, errorRate: 0.2 })
  assert.equal(within.passed, true)
  const over = loadSummary(samples, 1000, { p95: 100, errorRate: 0.05 })
  assert.equal(over.passed, false)
  assert.equal(over.breaches.length, 2)
  assert.match(loadMarkdown({ target: 'Checkout', plan: loadPlan({ users: 5, seconds: 10 }), summary: over }), /❌ p95 \d+ ms is over the 100 ms budget/)
})

test('an empty run says nothing went, rather than dividing by zero', () => {
  const s = loadSummary([], 0)
  assert.equal(s.count, 0)
  assert.equal(s.rps, 0)
  assert.equal(s.errorRate, 0)
})
