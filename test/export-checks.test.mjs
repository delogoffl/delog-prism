/**
 * Assertions in exported code, and run reports.
 *
 * The export used to keep six easy assertions and drop the rest — so a suite
 * generated in Prism, which is mostly types, formats and shapes, arrived in
 * pytest as a single status check. These tests hold every operator to being
 * written out, and hold the written-out checks to Prism's own verdicts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OPERATORS, emptyAssertion, check, generate as suggest } from '../lib/assert.js'
import { jsChecks, jsHelperBlock, pyChecks } from '../lib/checks-export.js'
import { generate } from '../lib/codegen.js'
import { toJUnit, toHtml, toJson, totals, sampleOf } from '../lib/report.js'

const body = JSON.stringify({
  id: 'u_4821',
  email: 'ada@example.com',
  name: 'Ada',
  verified: true,
  created_at: '2024-03-18T10:22:04Z',
  cart: { id: 'c1', items: 2, total: 178 },
  tags: ['a', 'b', 'c'],
  scores: [1, 2, 5],
  addresses: [{ city: 'London' }, { city: 'Leeds' }],
  gone: null
})
const RESPONSE = {
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'rq_1', 'x-count': '7' },
  body,
  bytes: body.length,
  timing: { total: 30 },
  json: JSON.parse(body),
  redirects: 0,
  secure: true
}

/** A value and a path for every operator, picked so Prism passes it. */
const SAMPLE = {
  status: { equals: '200', notEquals: '404', oneOf: '200, 201', isSuccess: '', isClass: '2xx', lessThan: '300', greaterThan: '199', between: '200-299' },
  time: { lessThan: '500', greaterThan: '1', between: '1-500' },
  size: { lessThan: '10240', greaterThan: '10', between: '10-10240' },
  contentType: { contains: 'json', equals: 'application/json; charset=utf-8', notContains: 'xml', matches: 'json' },
  header: {
    exists: ['x-request-id', ''], equals: ['x-request-id', 'rq_1'], contains: ['x-request-id', 'rq'], absent: ['x-nope', ''],
    notEquals: ['x-request-id', 'other'], notContains: ['x-request-id', 'zz'], matches: ['x-request-id', '^rq_\\d$'],
    startsWith: ['x-request-id', 'rq_'], oneOf: ['x-request-id', 'rq_1, rq_2'], lessThan: ['x-count', '10'], greaterThan: ['x-count', '5']
  },
  body: { contains: 'London', notContains: 'Paris', matches: 'Lon\\w+', isEmpty: null, notEmpty: '', notMatches: 'Paris', equals: body, startsWith: '{', isJson: '' },
  json: {
    exists: ['id', ''], equals: ['cart', '{"total":178,"items":2,"id":"c1"}'], notEquals: ['name', 'Grace'], isType: ['cart.total', 'integer'],
    contains: ['email', 'example'], absent: ['nope', ''], lengthIs: ['tags', '3'], notContains: ['tags', 'z'], lengthAbove: ['tags', '1'],
    lengthBelow: ['tags', '9'], greaterThan: ['cart.total', '100'], lessThan: ['cart.items', '3'], between: ['cart.total', '100-200'],
    oneOf: ['name', 'Ada, Grace'], matches: ['id', '^u_\\d+$'], startsWith: ['email', 'ada'], endsWith: ['email', '.com'],
    isFormat: ['created_at', 'date-time'], isEmpty: ['gone', ''], notEmpty: ['tags', ''], isNull: ['gone', ''], notNull: ['id', ''],
    isTrue: ['verified', ''], isFalse: null, includes: ['tags', 'b'], isUnique: ['tags', ''], isSorted: ['scores', 'asc']
  }
}

function every() {
  const out = []
  for (const [subject, ops] of Object.entries(SAMPLE)) {
    for (const op of OPERATORS[subject]) {
      const v = ops[op]
      if (v === null || v === undefined) continue
      const [path, value] = Array.isArray(v) ? v : ['', v]
      out.push(emptyAssertion({ subject, op, path, value }))
    }
  }
  return out
}

const request = (assertions) => ({ id: 'r', name: 'Get profile', method: 'GET', url: '{{base_url}}/users/{{user_id}}', headers: [], query: [], pathParams: [], auth: { kind: 'none' }, bodyKind: 'none', body: '', assertions })

test('every sample passes in Prism itself, so the export tests below mean something', () => {
  for (const a of every()) assert.ok(check(a, RESPONSE).ok, `${a.subject} ${a.op}: ${check(a, RESPONSE).detail}`)
})

test('every status, time, size, header, body and JSON operator is written out for JavaScript', () => {
  const found = jsChecks(request(every()), { cookies: true, https: true, redirects: true, schema: true })
  assert.deepEqual(found.skipped, [], `not exported: ${found.skipped.join('; ')}`)
})

test('every status, time, size, header, body and JSON operator is written out for Python', () => {
  const found = pyChecks(request(every()), { cookies: true })
  assert.deepEqual(found.skipped, [], `not exported: ${found.skipped.join('; ')}`)
})

/** Runs the JavaScript conditions against a response, the way an export would. */
function evaluate(assertions) {
  const found = jsChecks(request(assertions), { cookies: true, https: true, redirects: true })
  const facts = `
    const status = ${RESPONSE.status}
    const ms = ${RESPONSE.timing.total}
    const bytes = ${RESPONSE.bytes}
    const text = ${JSON.stringify(body)}
    const json = JSON.parse(text)
    const header = (name) => (${JSON.stringify(RESPONSE.headers)})[name.toLowerCase()]
    const cookies = ['sid=abc; Path=/; HttpOnly; Secure']
    const redirects = 0
    const https = true`
  const fn = new Function(`${facts}\n${jsHelperBlock(found.used)}\nreturn [${found.checks.map((c) => `[${JSON.stringify(c.name)}, (() => { try { return Boolean(${c.cond}) } catch { return false } })()]`).join(',')}]`)
  return fn()
}

test('the exported JavaScript checks pass exactly where Prism passes', () => {
  const results = evaluate(every())
  const failed = results.filter(([, ok]) => !ok).map(([name]) => name)
  assert.deepEqual(failed, [], `exported checks disagree with Prism: ${failed.join('; ')}`)
})

test('and fail where Prism fails', () => {
  const wrong = [
    emptyAssertion({ subject: 'status', op: 'equals', value: '404' }),
    emptyAssertion({ subject: 'json', op: 'isType', path: 'id', value: 'number' }),
    emptyAssertion({ subject: 'json', op: 'isFormat', path: 'name', value: 'email' }),
    emptyAssertion({ subject: 'json', op: 'isSorted', path: 'scores', value: 'desc' }),
    emptyAssertion({ subject: 'json', op: 'exists', path: 'addresses[*].zip' }),
    emptyAssertion({ subject: 'header', op: 'exists', path: 'x-missing' })
  ]
  for (const a of wrong) assert.equal(check(a, RESPONSE).ok, false, `${a.op} should fail in Prism too`)
  const results = evaluate(wrong)
  const passed = results.filter(([, ok]) => ok).map(([name]) => name)
  assert.deepEqual(passed, [], `exported checks passed where Prism fails: ${passed.join('; ')}`)
})

test('a generated suite reaches pytest, Playwright and Postman whole, not one status line', () => {
  const suite = suggest(RESPONSE).map((s) => s.assertion)
  const req = request(suite)
  const pytest = generate('pytest', { request: req })
  const playwright = generate('playwright', { request: req })
  const postman = JSON.parse(generate('postman', { flow: { name: 'F', requests: [req] } }))
  const tests = postman.item[0].event[0].script.exec.filter((l) => l.startsWith('pm.test('))
  assert.equal(tests.length, suite.length, 'Postman lost assertions')
  assert.equal((playwright.match(/expect\.soft\(/g) ?? []).length, suite.length, 'Playwright lost assertions')
  assert.equal((pytest.match(/lambda: /g) ?? []).length, suite.length, 'pytest lost assertions')
})

test('a code export with checks fails its process when a check fails', () => {
  const code = generate('fetch', { request: request([emptyAssertion({ subject: 'status', op: 'equals', value: '200' })]) })
  assert.match(code, /process\.exitCode = 1/)
  assert.match(code, /check\('Status equals 200'/)
})

test('what a plain client cannot run is still listed by name', () => {
  const code = generate('go', { request: request([emptyAssertion({ subject: 'json', op: 'isType', path: 'id', value: 'string' })]) })
  assert.match(code, /id is of type string/)
})

/* ---------------------------------------------------------------- reports */

const REPORT = {
  workspace: 'Storefront <API>',
  environment: 'Staging',
  startedAt: '2026-10-14T10:00:00.000Z',
  ms: 1234,
  flows: [
    {
      name: 'Checkout',
      ms: 900,
      results: [
        { name: 'Sign in', method: 'POST', url: '{{base_url}}/auth?token={{token}}', status: 200, ms: 80, failed: 0, checks: [{ ok: true, name: 'Status equals 200', detail: '200 as expected' }] },
        { name: 'Place order', method: 'POST', url: '{{base_url}}/orders', status: 201, ms: 60, failed: 1, checks: [{ ok: false, name: 'Response time is under 50 ms', detail: 'took 60ms, budget 50ms' }] },
        { name: 'Track', method: 'GET', url: '{{base_url}}/t', skipped: true, ms: 0, failed: 0, checks: [] }
      ]
    }
  ]
}

test('report totals count passes, failures and requests that never ran', () => {
  const t = totals(REPORT)
  assert.deepEqual([t.requests, t.passed, t.failed, t.skipped, t.checks, t.checksPassed], [3, 1, 1, 1, 2, 1])
})

test('JUnit has one suite per flow, the failure and why, and the skipped request', () => {
  const xml = toJUnit(REPORT)
  assert.match(xml, /<testsuite name="Checkout" tests="3" failures="1" skipped="1"/)
  assert.match(xml, /<failure message="1 assertion failed">Response time is under 50 ms: took 60ms, budget 50ms<\/failure>/)
  assert.match(xml, /<skipped message="not run"\/>/)
  assert.match(xml, /name="Storefront &lt;API&gt;"/, 'the workspace name was not escaped')
})

test('the HTML report is self-contained, escaped, and states the verdict', () => {
  const page = toHtml(REPORT)
  assert.match(page, /1 of 2 requests failed/)
  assert.match(page, /Storefront &lt;API&gt;/)
  assert.doesNotMatch(page, /<script|<link|src="http/, 'the report loads something from outside itself')
  assert.match(page, /\{\{token\}\}/, 'the URL should be shown as written, variables unresolved')
})

test('the JSON report carries the totals with it', () => {
  const doc = JSON.parse(toJson(REPORT))
  assert.equal(doc.totals.failed, 1)
  assert.equal(doc.flows[0].results.length, 3)
})

test('a response sample in a report has credentials masked, and nothing else', () => {
  const body = JSON.stringify({
    user: { name: 'Ada', password: 'hunter2', api_key: 'sk-live-9f3c2a' },
    session: { token: 'abc123' },
    note: 'carry eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig on'
  })
  const sample = sampleOf(body)
  for (const leak of ['hunter2', 'sk-live-9f3c2a', 'abc123', 'eyJhbGciOiJIUzI1NiJ9']) {
    assert.ok(!sample.includes(leak), `${leak} reached the report`)
  }
  assert.match(sample, /"name": "Ada"/, 'an ordinary field was masked too')
  assert.match(sample, /carry •+ on/, 'the JWT inside text was not masked')
})

test('a long sample is cut, and says so', () => {
  const long = JSON.stringify({ items: Array.from({ length: 500 }, (_, i) => ({ i })) })
  const sample = sampleOf(long)
  assert.ok(sample.split('\n').length <= 81)
  assert.ok(sample.endsWith('…'))
})

test('the Prism report has its map, its board, what needs attention and every journey', () => {
  const page = toHtml(REPORT)
  for (const part of ['Network map', 'Needs attention', 'Coverage', 'Timing', 'Journeys', 'Departures', 'Delayed']) {
    assert.ok(page.includes(part), `the report has no ${part}`)
  }
  assert.match(page, /class="alert"/, 'the failed request is not in Needs attention')
  assert.match(page, /id="f-bad"/, 'the Failed filter is missing')
})
