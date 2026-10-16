/**
 * Scripts: the pm API, what a script can change, where it runs, and that it
 * survives a save, a Postman import and a Postman export.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { runScript, expect, SNIPPETS } from '../lib/script-runtime.js'
import { describe } from '../lib/assert.js'
import { serialise, parse } from '../lib/workspace.js'
import { emptyCollection, emptyFlow, emptyRequest, fromPostman } from '../lib/collection.js'
import { generate } from '../lib/codegen.js'

/** As the command line runs a script: a fresh VM context, given only its globals. */
const evaluate = (code, globals) => vm.runInContext(`(async function () {\n${code}\n})`, vm.createContext({ ...globals }), { timeout: 2000 })()

const REQUEST = { name: 'Get user', method: 'GET', url: '{{base}}/users/1', headers: [{ key: 'Accept', value: 'application/json' }], body: '' }
const RESPONSE = {
  code: 200,
  status: 'OK',
  headers: { 'content-type': 'application/json', 'x-id': 'abc' },
  body: JSON.stringify({ id: 'u1', name: 'Ada', email: 'ada@example.com', tags: ['a', 'b'], token: 'T-1', count: 3 }),
  time: 40,
  size: 90
}
const run = (code, more = {}) => runScript({ code, phase: 'test', request: REQUEST, response: RESPONSE, vars: { environment: { base: 'http://x' } }, evaluate, ...more })

test('pm.test passes and fails, and says why', async () => {
  const out = await run(`
pm.test('ok', () => pm.response.to.have.status(200))
pm.test('wrong', () => pm.expect(pm.response.json().name).to.eql('Grace'))`)
  assert.deepEqual(out.tests.map((t) => [t.name, t.ok]), [['ok', true], ['wrong', false]])
  assert.match(out.tests[1].error, /expected 'Ada' to deeply equal 'Grace'/)
})

test('expect covers the chains API tests use', () => {
  const ok = [
    () => expect(3).to.equal(3),
    () => expect({ a: [1] }).to.eql({ a: [1] }),
    () => expect([1, 2]).to.be.an('array').that.includes(2).and.has.lengthOf(2),
    () => expect('hello').to.include('ell').and.match(/^h/),
    () => expect(5).to.be.above(4).and.below(6).and.within(1, 10),
    () => expect({ a: 1 }).to.have.property('a', 1),
    () => expect(null).to.be.null,
    () => expect([]).to.be.empty,
    () => expect('x').to.not.be.empty,
    () => expect(2).to.be.oneOf([1, 2]),
    () => expect({ a: 1, b: 2 }).to.have.keys('a', 'b'),
    () => expect(1).to.not.equal(2)
  ]
  for (const f of ok) f()
  assert.throws(() => expect(1).to.equal(2), /expected 1 to equal 2/)
  assert.throws(() => expect([1]).to.not.include(1), /to not include/)
  assert.throws(() => expect('a').to.be.a('number'), /to be a number/)
})

test('the response helpers read the response', async () => {
  const out = await run(`
pm.test('a', () => pm.response.to.be.ok)
pm.test('b', () => pm.response.to.have.header('X-Id', 'abc'))
pm.test('c', () => pm.response.to.have.jsonBody('name', 'Ada'))
pm.test('d', () => pm.response.to.not.have.status(404))
pm.test('e', () => pm.response.to.have.jsonSchema({ type: 'object', required: ['id'] }))
pm.test('f', () => pm.expect(pm.response.headers.get('content-type')).to.include('json'))
pm.test('g', () => pm.expect(pm.response.responseTime).to.be.below(100))`)
  assert.deepEqual(out.tests.filter((t) => !t.ok), [], JSON.stringify(out.tests))
})

test('variables: the environment keeps what is set, the run keeps locals, data is read-only', async () => {
  const out = await run(`
pm.environment.set('token', pm.response.json().token)
pm.environment.unset('base')
pm.variables.set('who', pm.iterationData.get('name'))
pm.test('resolves', () => pm.expect(pm.variables.get('who')).to.eql('Grace'))
pm.test('replaces', () => pm.expect(pm.variables.replaceIn('{{who}}@{{domain}}')).to.eql('Grace@example.com'))`, { vars: { environment: { base: 'http://x' }, iteration: { name: 'Grace', domain: 'example.com' } } })
  assert.deepEqual(out.environment, { set: { token: 'T-1' }, unset: ['base'] })
  assert.deepEqual(out.local.set, { who: 'Grace' })
  assert.ok(out.tests.every((t) => t.ok), JSON.stringify(out.tests))
})

test('a pre-request script may change the request; a test script may not', async () => {
  const pre = await runScript({
    code: "pm.request.headers.upsert({ key: 'X-Run', value: '7' }); pm.request.url = pm.variables.replaceIn('{{base}}/v2'); pm.request.method = 'post'",
    phase: 'prerequest',
    request: REQUEST,
    vars: { environment: { base: 'http://x' } },
    evaluate
  })
  assert.equal(pre.request.url, 'http://x/v2')
  assert.equal(pre.request.method, 'POST')
  assert.ok(pre.request.headers.some((h) => h.key === 'X-Run' && h.value === '7'))

  const after = await run("pm.request.url = 'http://evil'")
  assert.equal(after.request, null)
})

test('a pre-request script can skip its request', async () => {
  const out = await runScript({ code: 'pm.execution.skipRequest()', phase: 'prerequest', request: REQUEST, evaluate })
  assert.equal(out.skip, true)
})

test('older Postman scripts keep working', async () => {
  const out = await run(`
tests['status is 200'] = responseCode.code === 200
tests['body has Ada'] = responseBody.includes('Ada')
postman.setEnvironmentVariable('legacy', 'yes')
const { expect: e } = require('chai')
pm.test('chai', () => e(1).to.equal(1))`)
  assert.ok(out.tests.every((t) => t.ok), JSON.stringify(out.tests))
  assert.equal(out.tests.length, 3)
  assert.equal(out.environment.set.legacy, 'yes')
})

test('a script that throws is reported, not swallowed; console output is kept', async () => {
  const out = await run("console.log('seen', { n: 1 }); throw new Error('boom')")
  assert.equal(out.error, 'boom')
  assert.match(out.logs[0].text, /seen/)
})

test('pm.sendRequest says it is not available rather than failing quietly', async () => {
  const out = await run("pm.sendRequest('http://x', () => {})")
  assert.match(out.error, /not available in Prism yet/)
})

test('an async test is awaited', async () => {
  const out = await run("pm.test('later', async () => { await null; pm.expect(1).to.equal(2) })")
  assert.equal(out.tests[0].ok, false)
})

test('every snippet runs as it is offered', async () => {
  for (const snip of SNIPPETS.prerequest) {
    const out = await runScript({ code: snip.code, phase: 'prerequest', request: REQUEST, vars: { environment: { token: 'x' }, iteration: { email: 'a@b' } }, evaluate: (code, g) => evaluate(code, { ...g, crypto: globalThis.crypto }) })
    assert.equal(out.error, null, `${snip.label}: ${out.error}`)
  }
  for (const snip of SNIPPETS.test) {
    const out = await runScript({ code: snip.code, phase: 'test', request: REQUEST, response: { ...RESPONSE, body: JSON.stringify({ id: 'u1', name: 'Ada', status: 'active', items: [1], token: 't' }) }, vars: { iteration: { name: 'Ada' } }, evaluate })
    assert.equal(out.error, null, `${snip.label}: ${out.error}`)
  }
})

test('a script test describes itself by its own name', () => {
  assert.equal(describe({ subject: 'script', op: 'test', value: 'Status code is 200' }), 'Status code is 200')
})

/* ---------------------------------------------------- where scripts run */

test('in the app, scripts run in a worker with no network and no outside code', () => {
  const main = readFileSync(new URL('../main.cjs', import.meta.url), 'utf8')
  assert.match(main, /script-worker\.js'\) \? \{ 'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-eval'" \}/)
  const worker = readFileSync(new URL('../renderer/script-worker.js', import.meta.url), 'utf8')
  assert.match(worker, /'fetch', 'XMLHttpRequest', 'WebSocket'/)
  const app = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')
  assert.match(app, /new Worker\(new URL\('\.\/script-worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/)
  assert.match(app, /worker\.terminate\(\)/, 'a script that runs too long must be stopped')
})

/* ------------------------------------------------- saved and carried over */

test('scripts are saved with the workspace and come back', () => {
  const req = emptyRequest({ name: 'R', scripts: { pre: "pm.variables.set('a', 1)", test: "pm.test('t', () => {})" } })
  const doc = serialise({ collections: [emptyCollection('C', [emptyFlow('F', [req])])], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [] })
  const back = parse(JSON.stringify(doc))
  assert.deepEqual(back.workspace.collections[0].flows[0].requests[0].scripts, req.scripts)
})

test('Postman scripts are imported whole and exported back', () => {
  const parsed = fromPostman({
    info: { name: 'P', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [
      {
        name: 'Login',
        request: { method: 'POST', url: 'https://x.test/login' },
        event: [
          { listen: 'prerequest', script: { exec: ["pm.variables.set('t', Date.now())"] } },
          { listen: 'test', script: { exec: ["pm.test('ok', () => pm.response.to.have.status(200))"] } }
        ]
      }
    ]
  })
  const req = parsed.flows.flatMap((f) => f.requests)[0]
  assert.match(req.scripts.pre, /pm\.variables\.set/)
  assert.match(req.scripts.test, /pm\.test\('ok'/)

  const doc = JSON.parse(generate('postman', { flow: { name: 'F', requests: [req] } }))
  const events = doc.item[0].event
  assert.deepEqual(events.map((e) => e.listen), ['prerequest', 'test'])
  assert.match(events[1].script.exec.join('\n'), /pm\.test\('ok'/)
})
