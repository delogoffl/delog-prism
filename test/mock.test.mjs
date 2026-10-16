/**
 * The mock server: routes from requests, answers from what Prism has seen
 * or what the spec documents, and the most literal route winning.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patternOf, buildRoutes, matchRoute, answer, exampleOf, specResponse, replayHeaders } from '../lib/mock.js'
import { prepareSpec } from '../lib/contract.js'

const spec = prepareSpec({
  openapi: '3.0.0',
  info: { title: 'Shop', version: '1' },
  paths: {
    '/users/{id}': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } } },
    '/health': { get: { responses: { 200: { content: { 'application/json': { example: { ok: true } } } } } } },
    '/orders': { post: { responses: { 201: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['placed', 'paid'] }, total: { type: 'number', minimum: 1 } } } } } } } } }
  },
  components: { schemas: { User: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, age: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } } } } } }
})

test('a URL as written becomes literal and wildcard segments', () => {
  assert.deepEqual(patternOf('{{base_url}}/users/:id/orders/{{order}}?x=1').segs, [{ lit: 'users' }, { param: 'id' }, { lit: 'orders' }, { param: 'order' }])
  assert.deepEqual(patternOf('https://api.test/v1/items/{sku}').segs, [{ lit: 'v1' }, { lit: 'items' }, { param: 'sku' }])
})

test('a request answers with its baseline first, then its last response, then the spec', () => {
  const base = { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '9', 'Set-Cookie': 's=1' }, body: '{"from":"baseline"}' }
  const last = { status: 200, headers: { 'content-type': 'application/json' }, body: '{"from":"last"}' }
  const routes = buildRoutes({
    requests: [
      { id: 'a', name: 'Both', method: 'GET', url: '{{base_url}}/users/:id', baseline: base, last },
      { id: 'b', name: 'Last only', method: 'GET', url: '{{base_url}}/products', last },
      { id: 'c', name: 'Spec only', method: 'GET', url: '{{base_url}}/health' },
      { id: 'd', name: 'Nothing', method: 'DELETE', url: '{{base_url}}/carts/:id' }
    ],
    spec
  })
  const by = Object.fromEntries(routes.map((r) => [r.name, r]))
  assert.equal(by.Both.source, 'baseline')
  assert.equal(by.Both.body, '{"from":"baseline"}')
  assert.deepEqual(by.Both.headers, { 'content-type': 'application/json' }, 'connection and cookie headers are not replayed')
  assert.equal(by['Last only'].source, 'last')
  assert.equal(by['Spec only'].source, 'spec')
  assert.deepEqual(JSON.parse(by['Spec only'].body), { ok: true })
  assert.equal(by.Nothing.status, 501)
  assert.match(by.Nothing.body, /send it once in Prism/)
  // Preferring the last response swaps the first two.
  assert.equal(buildRoutes({ requests: [{ id: 'a', method: 'GET', url: '/u/:id', baseline: base, last }], prefer: 'last' })[0].source, 'last')
})

test('operations the spec declares and no request covers are mocked from the spec', () => {
  const routes = buildRoutes({ requests: [{ id: 'a', method: 'GET', url: '{{base_url}}/users/{{uid}}', last: { status: 200, headers: {}, body: '{}' } }], spec })
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path} ${r.source}`), ['GET /users/:uid last', 'GET /health spec', 'POST /orders spec'])
  const order = JSON.parse(routes[2].body)
  assert.equal(routes[2].status, 201)
  assert.deepEqual(order, { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', status: 'placed', total: 1 })
})

test('examples follow the schema: refs, enums, formats, arrays', () => {
  assert.deepEqual(exampleOf(spec, { $ref: '#/components/schemas/User' }), { id: 'id_1', email: 'user@example.com', age: 0, tags: ['tags'] })
  assert.deepEqual(specResponse(spec, spec.paths['/health'].get), { status: 200, headers: { 'content-type': 'application/json' }, body: '{\n  "ok": true\n}' })
})

test('the most literal route wins, and its params are read', () => {
  const routes = buildRoutes({
    requests: [
      { id: '1', method: 'GET', url: '/users/:id', last: { status: 200, headers: {}, body: 'one' } },
      { id: '2', method: 'GET', url: '/users/me', last: { status: 200, headers: {}, body: 'me' } }
    ]
  })
  assert.equal(matchRoute(routes, 'GET', '/users/me').route.body, 'me')
  const hit = matchRoute(routes, 'GET', '/users/42?x=1')
  assert.equal(hit.route.body, 'one')
  assert.deepEqual(hit.params, { id: '42' })
  assert.equal(matchRoute(routes, 'POST', '/users/42'), null)
  assert.equal(matchRoute(routes, 'HEAD', '/users/42').route.body, 'one')
})

test('an answer carries CORS and its source; unknown calls get a helpful 404; preflight is answered', () => {
  const routes = buildRoutes({ requests: [{ id: '1', method: 'GET', url: '/a', last: { status: 202, headers: { 'content-type': 'text/plain' }, body: 'hi' } }] })
  const ok = answer(routes, { method: 'GET', url: '/a?z=1', origin: 'http://localhost:5173' })
  assert.equal(ok.status, 202)
  assert.equal(ok.body, 'hi')
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173')
  assert.equal(ok.headers['x-prism-mock'], 'last')
  const missing = answer(routes, { method: 'GET', url: '/nope' })
  assert.equal(missing.status, 404)
  assert.deepEqual(JSON.parse(missing.body).routes, ['GET /a'])
  assert.equal(answer(routes, { method: 'OPTIONS', url: '/a' }).status, 204)
  assert.equal(answer(routes, { method: 'GET', url: '/a', cors: false }).headers['access-control-allow-origin'], undefined)
  assert.equal(answer(routes, { method: 'HEAD', url: '/a' }).body, '')
})

test('replayed headers are lower-cased and lose the connection-specific ones', () => {
  assert.deepEqual(replayHeaders({ 'X-Id': ['a', 'b'], Date: 'x', 'Transfer-Encoding': 'chunked' }), { 'x-id': 'a, b' })
})
