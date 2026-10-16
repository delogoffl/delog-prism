/**
 * Flow logic: the condition language, and run-if, wait, for-each, poll-until
 * and stop-on-failure around a send.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCondition, check, contextOf, rulesOf, itemsOf, itemVars, runRules, describeRules } from '../lib/logic.js'

const res = { status: 200, timing: { total: 40 }, bytes: 90, headers: { 'Content-Type': 'application/json' }, json: { status: 'done', items: [{ id: 1 }, { id: 2 }], email: 'a@b.co', count: '3', ok: true, nothing: null } }
const ctx = contextOf(res, { vars: { role: 'admin', trial: '', n: '5' }, attempt: 2, item: { id: 7 } })
const is = (text) => {
  const c = check(text, ctx)
  assert.equal(c.ok, true, `${text}: ${c.error}`)
  return c.value
}

test('comparisons, loose where it helps', () => {
  assert.equal(is('json.status == "done"'), true)
  assert.equal(is("json.status != 'done'"), false)
  assert.equal(is('status == "200"'), true)
  assert.equal(is('json.count > 2'), true)
  assert.equal(is('time <= 40 and size < 100'), true)
  assert.equal(is('json.items.length == 2'), true)
  assert.equal(is('json.items[1].id == 2'), true)
  assert.equal(is('header.content-type contains "json"'), true)
  assert.equal(is('json.email matches "^[^@]+@"'), true)
  assert.equal(is('json.items contains 3'), false)
  assert.equal(is('json.ok == true'), true)
  assert.equal(is('json.nothing == null'), true)
  assert.equal(is('json.status > 3'), false, 'a word is not greater than a number')
})

test('and, or, not, parentheses, exists and plain truth', () => {
  assert.equal(is('var.role == "admin" and (status == 200 or status == 201)'), true)
  assert.equal(is('not var.trial'), true)
  assert.equal(is('json.id exists'), false)
  assert.equal(is('json.email exists'), true)
  assert.equal(is('json.ok'), true)
  assert.equal(is('attempt == 2 and item.id == 7'), true)
  assert.equal(is('var.n >= 5 or var.missing'), true)
})

test('a condition that cannot be read says why, and where', () => {
  assert.match(parseCondition('status ==').error, /ends too soon/)
  assert.match(parseCondition('(status == 1').error, /never closed/)
  assert.match(parseCondition('json.a == "x').error, /never closed/)
  assert.match(parseCondition('status = 1').error, /Unexpected “=”/)
  assert.match(check('foo == 1', ctx).error, /not something a condition can read/)
  assert.match(parseCondition('').error, /Empty/)
})

test('rules are filled, clamped, and none means null', () => {
  assert.equal(rulesOf({}), null)
  assert.equal(rulesOf({ logic: { when: '  ' } }), null)
  const r = rulesOf({ logic: { until: 'json.done', tries: 9999, everyMs: 1, waitMs: -5 } })
  assert.deepEqual([r.tries, r.everyMs, r.waitMs, r.onFail], [100, 100, 0, 'continue'])
  assert.deepEqual(describeRules(rulesOf({ logic: { when: 'var.x', waitMs: 2000, each: 'var.ids', until: 'status == 200', onFail: 'stop' } })).map((d) => d.short), ['if', '2s', 'each', 'until', 'stop'])
})

test('lists for each: JSON, variables, commas', () => {
  assert.deepEqual(itemsOf('["a","b"]').items, ['a', 'b'])
  assert.deepEqual(itemsOf('var.ids', { ids: '[1,2,3]' }).items, [1, 2, 3])
  assert.deepEqual(itemsOf('{{skus}}', { skus: 'A, B ,C' }).items, ['A', 'B', 'C'])
  assert.match(itemsOf('var.nope', {}).error, /not set/)
  assert.deepEqual(itemVars({ id: 4, tags: ['x'] }, 0), { item: '{"id":4,"tags":["x"]}', item_index: '0', 'item.id': '4', 'item.tags': '["x"]' })
})

const fake = (answers) => {
  const sent = []
  let i = 0
  return {
    sent,
    send: async (vars) => {
      sent.push(vars)
      const a = answers[Math.min(i++, answers.length - 1)]
      return typeof a === 'function' ? a(vars) : a
    }
  }
}
const noSleep = { sleep: async () => {}, now: () => 0 }

test('run only if: false skips without sending; an unreadable condition fails', async () => {
  const f = fake([res])
  const out = await runRules(f.send, { rules: rulesOf({ logic: { when: 'var.role == "guest"' } }), vars: { role: 'admin' }, ...noSleep })
  assert.equal(out.skipped, true)
  assert.match(out.error, /is false/)
  assert.equal(f.sent.length, 0)
  const bad = await runRules(f.send, { rules: rulesOf({ logic: { when: 'role ==' } }), ...noSleep })
  assert.equal(bad.failed, 1)
})

test('wait first, then send', async () => {
  const waited = []
  const f = fake([res])
  await runRules(f.send, { rules: rulesOf({ logic: { waitMs: 1500 } }), sleep: async (ms) => waited.push(ms), now: () => 0 })
  assert.deepEqual(waited, [1500])
  assert.equal(f.sent.length, 1)
})

test('poll until: stops when it holds, gives up with what it last saw', async () => {
  const pending = { ...res, json: { status: 'pending' }, failed: 0 }
  const done = { ...res, json: { status: 'done' }, failed: 0 }
  const f = fake([pending, pending, done])
  const out = await runRules(f.send, { rules: rulesOf({ logic: { until: 'json.status == "done"', tries: 5 } }), ...noSleep })
  assert.equal(f.sent.length, 3)
  assert.equal(out.failed, 0)
  assert.match(out.logicChecks[0].detail, /held after 3 tries/)

  const g = fake([pending])
  const never = await runRules(g.send, { rules: rulesOf({ logic: { until: 'json.status == "done"', tries: 4 } }), ...noSleep })
  assert.equal(g.sent.length, 4)
  assert.equal(never.failed, 1)
  assert.match(never.logicChecks[0].detail, /never held in 4 tries — last saw json\.status = "pending"/)
})

test('for each: one send per item, the item as variables, and a summary', async () => {
  const f = fake([(v) => ({ ...res, failed: v.item === 'B' ? 1 : 0 })])
  const out = await runRules(f.send, { rules: rulesOf({ logic: { each: '["A","B","C"]' } }), vars: { base: 'x' }, ...noSleep })
  assert.deepEqual(f.sent.map((v) => [v.item, v.base]), [['A', 'x'], ['B', 'x'], ['C', 'x']])
  assert.equal(out.logic.items.length, 3)
  assert.equal(out.logicChecks[0].ok, false)
  assert.match(out.logicChecks[0].detail, /3 items — 2 passed, 1 failed/)
  const empty = await runRules(f.send, { rules: rulesOf({ logic: { each: 'var.list' } }), vars: { list: '' }, ...noSleep })
  assert.equal(empty.skipped, true)
})

test('stop on failure is flagged only when the step failed', async () => {
  const ok = await runRules(fake([{ ...res, failed: 0 }]).send, { rules: rulesOf({ logic: { onFail: 'stop' } }), ...noSleep })
  assert.equal(ok.logic.stop, false)
  const bad = await runRules(fake([{ ...res, failed: 2 }]).send, { rules: rulesOf({ logic: { onFail: 'stop' } }), ...noSleep })
  assert.equal(bad.logic.stop, true)
  const down = await runRules(fake([{ error: 'ECONNREFUSED', failed: 1 }]).send, { rules: rulesOf({ logic: { onFail: 'stop' } }), ...noSleep })
  assert.equal(down.logic.stop, true)
})

test('the command line runs a flow under its logic: polls, skips, and stops', async () => {
  const http = await import('node:http')
  const { execFile } = await import('node:child_process')
  const { writeFileSync, mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { serialise } = await import('../lib/workspace.js')
  const { emptyCollection, emptyFlow, emptyRequest } = await import('../lib/collection.js')
  let polls = 0
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/fail' ? 500 : 200, { 'content-type': 'application/json' })
    if (req.url === '/job') res.end(JSON.stringify({ status: (polls += 1) >= 3 ? 'done' : 'pending' }))
    else res.end('{"ok":true}')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const poll = emptyRequest({ name: 'Poll job', url: `${base}/job`, logic: { until: 'json.status == "done"', everyMs: 100, tries: 5 } })
    const skip = emptyRequest({ name: 'Admins only', url: `${base}/ok`, logic: { when: 'var.role == "admin"' } })
    const fail = emptyRequest({ name: 'Breaks', url: `${base}/fail`, assertions: [{ id: 'a', subject: 'status', op: 'equals', path: '', value: '200', on: true }], logic: { onFail: 'stop' } })
    const after = emptyRequest({ name: 'Never reached', url: `${base}/ok` })
    const doc = serialise({ collections: [emptyCollection('C', [emptyFlow('F', [poll, skip, fail, after])])], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [] })
    const dir = mkdtempSync(join(tmpdir(), 'prism-logic-'))
    const file = join(dir, 'w.prism.json')
    writeFileSync(file, JSON.stringify(doc))
    const cli = new URL('../cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const out = await new Promise((resolve) => execFile(process.execPath, [cli, file, '--reporter', 'json'], (err, stdout, stderr) => resolve({ code: err?.code ?? 0, stdout, stderr })))
    const results = JSON.parse(out.stdout).flows[0].results
    assert.deepEqual(results.map((r) => r.name), ['Poll job', 'Admins only', 'Breaks'], 'the step after the stop never ran')
    assert.equal(polls, 3)
    assert.ok(results[0].checks.some((c) => c.subject === 'logic' && c.ok && /held after 3 tries/.test(c.detail)), JSON.stringify(results[0].checks))
    assert.equal(results[1].skipped, true)
    assert.equal(results[2].failed > 0, true)
    assert.equal(out.code, 1)
  } finally {
    server.close()
  }
})
