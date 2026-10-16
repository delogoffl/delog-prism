/**
 * The AI assistant's side of things: what is sent (and what never is), each
 * provider's request, and suggested checks read back strictly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrub, failurePrompt, testsPrompt, parseSuggestions, providerRequest, readReply, bodyFor } from '../lib/ai.js'
import { sampleOf } from '../lib/report.js'

const req = { method: 'POST', url: '{{base_url}}/orders' }
const res = {
  status: 422,
  statusText: 'Unprocessable',
  timing: { total: 40 },
  headers: { 'content-type': 'application/json', 'set-cookie': 'sid=abc' },
  body: JSON.stringify({ error: 'qty must be positive', token: 'tok-live-123456', echo: 'Bearer sk-secret-998877' }),
  request: { headers: { Authorization: 'Bearer sk-secret-998877', Accept: 'application/json' }, body: '{"qty":-1,"password":"hunter2-long"}' },
  checks: [{ ok: false, name: 'Status is 201', detail: 'saw 422' }, { ok: true, name: 'Is JSON', detail: 'passed' }]
}
const mask = (t) => sampleOf(t, { lines: 400, chars: 20000 })

test('what goes to the model never carries a credential', () => {
  const { prompt } = failurePrompt({ req, res, mask, secrets: ['sk-secret-998877', 'hunter2-long'] })
  for (const leak of ['sk-secret-998877', 'tok-live-123456', 'hunter2-long', 'sid=abc']) assert.ok(!prompt.includes(leak), `${leak} leaked`)
  assert.match(prompt, /POST \{\{base_url\}\}\/orders/, 'the URL as written, variables unresolved')
  assert.match(prompt, /- Status is 201: saw 422/)
  assert.ok(!prompt.includes('Is JSON'), 'only failed checks are listed')
})

test('a failure to send is described as one', () => {
  const { prompt } = failurePrompt({ req, res: { error: 'ECONNREFUSED', checks: [] }, mask })
  assert.match(prompt, /It failed to send: ECONNREFUSED/)
  assert.ok(!prompt.includes('Response body'))
})

test('scrub replaces every secret value, longest first, ignoring tiny ones', () => {
  assert.equal(scrub('a=abcdef b=abc', ['abc', 'abcdef']), 'a=•••• b=abc')
  assert.equal(scrub('x', []), 'x')
})

test('long bodies are cut, and say so', () => {
  const out = bodyFor('x'.repeat(100), { limit: 10 })
  assert.match(out, /^x{10}\n… \(90 more characters not sent\)$/)
})

test('the tests prompt lists Prism’s own subjects and operators', () => {
  const { prompt } = testsPrompt({ req, res, mask, subjects: [{ id: 'status', ops: ['equals'] }, { id: 'json', path: true, ops: ['equals', 'exists'] }] })
  assert.match(prompt, /status: equals/)
  assert.match(prompt, /json \(needs path\): equals, exists/)
  assert.match(prompt, /only a JSON array/)
})

test('suggestions are read strictly: unknown subjects and operators are dropped', () => {
  const allowed = new Map([['status', new Set(['equals'])], ['json', new Set(['exists', 'equals'])]])
  const reply = 'Here you go:\n```json\n[{"subject":"status","op":"equals","value":201,"why":"created"},{"subject":"json","op":"exists","path":"id"},{"subject":"sql","op":"inject","path":"x"},{"subject":"json","op":"telepathy","path":"y"}]\n```'
  const out = parseSuggestions(reply, allowed)
  assert.equal(out.ok, true)
  assert.deepEqual(out.items.map((x) => [x.subject, x.op, x.path, x.value]), [['status', 'equals', '', '201'], ['json', 'exists', 'id', '']])
  assert.deepEqual(out.dropped, ['sql inject', 'json telepathy'])
  assert.equal(parseSuggestions('no list here', allowed).ok, false)
  assert.match(parseSuggestions('[{bad]', allowed).error, /not valid JSON/)
})

test('each provider gets its own request shape', () => {
  const a = providerRequest({ provider: 'anthropic', key: 'k', system: 's', prompt: 'p' })
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(a.headers['x-api-key'], 'k')
  assert.equal(a.body.model, 'claude-sonnet-5-5')
  assert.equal(a.body.system, 's')
  const o = providerRequest({ provider: 'openai', key: 'k', model: 'my-model', baseUrl: 'http://localhost:8000/v1/', system: 's', prompt: 'p' })
  assert.equal(o.url, 'http://localhost:8000/v1/chat/completions')
  assert.equal(o.headers.authorization, 'Bearer k')
  assert.deepEqual(o.body.messages.map((m) => m.role), ['system', 'user'])
  const l = providerRequest({ provider: 'ollama', system: 's', prompt: 'p' })
  assert.equal(l.url, 'http://127.0.0.1:11434/api/chat')
  assert.equal(l.body.stream, false)
  assert.throws(() => providerRequest({ provider: 'anthropic', system: 's', prompt: 'p' }), /API key/)
  assert.throws(() => providerRequest({ provider: 'openai', key: 'k', system: 's', prompt: 'p' }), /Name the model/)
  assert.throws(() => providerRequest({ provider: 'off', system: 's', prompt: 'p' }), /Choose an AI provider/)
})

test('replies are read per provider, errors kept', () => {
  assert.deepEqual(readReply('anthropic', 200, { content: [{ type: 'text', text: 'hi' }] }), { ok: true, text: 'hi' })
  assert.deepEqual(readReply('openai', 200, { choices: [{ message: { content: 'yo' } }] }), { ok: true, text: 'yo' })
  assert.deepEqual(readReply('ollama', 200, { message: { content: 'local' } }), { ok: true, text: 'local' })
  assert.match(readReply('anthropic', 401, { error: { message: 'invalid x-api-key' } }).error, /401 — invalid x-api-key/)
  assert.equal(readReply('openai', 200, {}).ok, false)
})
