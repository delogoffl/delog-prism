/**
 * Responses against the spec: matching a request to its operation, and what
 * counts as breaking the contract versus the documentation lagging behind.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareSpec, matchOperation, checkResponse, coverage, pathOf } from '../lib/contract.js'
import { readOpenApi } from '../lib/openapi.js'
import { serialise, parse } from '../lib/workspace.js'

const DOC = {
  openapi: '3.0.3',
  info: { title: 'Shop', version: '2.1' },
  servers: [{ url: 'https://api.shop.test/v1' }],
  paths: {
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get a user',
        responses: {
          200: {
            description: 'ok',
            headers: { 'X-Request-Id': { required: true, schema: { type: 'string' } } },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          },
          404: { description: 'missing', content: { 'application/problem+json': { schema: { type: 'object' } } } }
        }
      },
      delete: { tags: ['Users'], responses: { 204: { description: 'gone' } } }
    },
    '/users/me': { get: { tags: ['Users'], responses: { '2XX': { description: 'me', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } } },
    '/orders': { post: { tags: ['Orders'], responses: { default: { description: 'any' } } } }
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'email'],
        properties: { id: { type: 'string' }, email: { type: 'string', format: 'email' }, age: { type: 'integer', nullable: true }, address: { $ref: '#/components/schemas/Address' } }
      },
      Address: { type: 'object', properties: { city: { type: 'string' } } }
    }
  }
}
const spec = prepareSpec(DOC, 'shop.yaml')
const json = (status, body, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'r1', ...headers }, body: JSON.stringify(body), json: body })

test('a request URL is reduced to its path, whatever its host is written as', () => {
  assert.equal(pathOf('{{base_url}}/users/:id?x=1'), '/users/:id')
  assert.equal(pathOf('https://api.shop.test/v1/users/7#top'), '/v1/users/7')
  assert.equal(pathOf('users/7/'), '/users/7')
})

test('requests are matched to operations, literal routes before templated ones', () => {
  assert.equal(matchOperation(spec, 'GET', '{{base_url}}/users/:id').route, '/users/{id}')
  assert.equal(matchOperation(spec, 'GET', '{{base_url}}/users/{{user_id}}').route, '/users/{id}')
  assert.equal(matchOperation(spec, 'GET', 'https://api.shop.test/v1/users/42').route, '/users/{id}')
  assert.equal(matchOperation(spec, 'GET', '{{base_url}}/users/me').route, '/users/me')
  assert.equal(matchOperation(spec, 'DELETE', '{{api}}/v1/users/9').route, '/users/{id}')
  assert.equal(matchOperation(spec, 'PATCH', '{{base_url}}/users/9'), null)
})

test('a response that keeps the contract has no findings', () => {
  const r = checkResponse(spec, 'GET', '{{base_url}}/users/:id', json(200, { id: 'u1', email: 'a@b.co', age: null, address: { city: 'X' } }))
  assert.equal(r.matched, true)
  assert.equal(r.summary, 'Get a user')
  assert.deepEqual(r.findings, [])
})

test('schema breaks are errors, with the path', () => {
  const r = checkResponse(spec, 'GET', '/users/1', json(200, { id: 7, address: { city: 3 } }))
  const errors = r.findings.filter((f) => f.level === 'error').map((f) => f.message)
  assert.ok(errors.some((m) => /\$\.id/.test(m)), errors.join('\n'))
  assert.ok(errors.some((m) => /email/.test(m)), errors.join('\n'))
  assert.ok(errors.some((m) => /\$\.address\.city/.test(m)), errors.join('\n'))
})

test('extra fields are warnings, not errors', () => {
  const r = checkResponse(spec, 'GET', '/users/1', json(200, { id: 'u', email: 'a@b.co', nickname: 'x', address: { city: 'c', zip: '1' } }))
  assert.deepEqual(r.findings.map((f) => [f.level, f.path]), [['warn', '$.nickname'], ['warn', '$.address.zip']])
})

test('undocumented status, wrong content type and a missing required header are errors', () => {
  assert.match(checkResponse(spec, 'GET', '/users/1', json(500, {})).findings[0].message, /Status 500 is not documented — the spec lists 200, 404/)
  const html = checkResponse(spec, 'GET', '/users/1', { status: 200, headers: { 'content-type': 'text/html', 'x-request-id': '1' }, body: '<p>' })
  assert.equal(html.findings[0].code, 'content-type')
  const noHeader = checkResponse(spec, 'GET', '/users/1', { ...json(200, { id: 'u', email: 'a@b.co' }), headers: { 'content-type': 'application/json' } })
  assert.deepEqual(noHeader.findings.map((f) => f.code), ['header'])
})

test('ranges and default cover a status; a body where none is documented is a warning', () => {
  assert.deepEqual(checkResponse(spec, 'GET', '/users/me', json(201, { id: 'u', email: 'a@b.co' })).findings, [])
  assert.deepEqual(checkResponse(spec, 'POST', '/orders', json(418, { any: 1 })).findings.filter((f) => f.level === 'error'), [])
  assert.equal(checkResponse(spec, 'DELETE', '/users/1', { status: 204, headers: {}, body: '' }).findings.length, 0)
})

test('a request the spec does not declare is a warning', () => {
  const r = checkResponse(spec, 'GET', '/nope', json(200, {}))
  assert.equal(r.matched, false)
  assert.equal(r.findings[0].level, 'warn')
})

test('coverage counts operations called and statuses seen', () => {
  const cov = coverage(spec, [{ method: 'get', route: '/users/{id}', status: 200 }, { method: 'get', route: '/users/me', status: 204 }])
  assert.equal(cov.total, 4)
  assert.equal(cov.called, 2)
  const user = cov.operations.find((o) => o.route === '/users/{id}' && o.method === 'get')
  assert.deepEqual(user.statuses, [{ code: '200', hit: true }, { code: '404', hit: false }])
  assert.deepEqual(cov.operations.find((o) => o.route === '/users/me').statuses, [{ code: '2XX', hit: true }])
})

test('Swagger 2: schema, produces and basePath', () => {
  const sw = prepareSpec({
    swagger: '2.0',
    basePath: '/api',
    produces: ['application/json'],
    paths: { '/pets/{id}': { get: { responses: { 200: { schema: { $ref: '#/definitions/Pet' } } } } } },
    definitions: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } }
  })
  assert.equal(matchOperation(sw, 'GET', 'http://h/api/pets/1').route, '/pets/{id}')
  assert.deepEqual(checkResponse(sw, 'GET', 'http://h/api/pets/1', json(200, { name: 'Rex' })).findings, [])
  assert.match(checkResponse(sw, 'GET', 'http://h/api/pets/1', json(200, {})).findings[0].message, /name/)
})

test('an OpenAPI import keeps its spec on the collection, and a save keeps it', () => {
  const read = readOpenApi(DOC, 'shop.json')
  assert.equal(read.collection.spec.title, 'Shop')
  assert.ok(read.collection.spec.paths['/users/{id}'])
  const doc = serialise({ collections: [read.collection], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [] })
  const back = parse(JSON.stringify(doc))
  assert.equal(back.workspace.collections[0].spec.title, 'Shop')
  assert.deepEqual(Object.keys(back.workspace.collections[0].spec.paths), Object.keys(DOC.paths))
})

test('a YAML OpenAPI document imports, and a file that is neither says so', async () => {
  const { readCollection } = await import('../lib/collection.js')
  const yaml = [
    'openapi: 3.0.0',
    'info: { title: Pets, version: "1" }',
    'paths:',
    '  /pets/{id}:',
    '    get:',
    '      summary: Get a pet',
    '      responses:',
    '        200:',
    '          description: ok'
  ].join('\n')
  const read = readCollection(yaml, 'pets.yaml')
  assert.equal(read.ok, true, read.error)
  assert.equal(read.collection.spec.title, 'Pets')
  assert.equal(read.flows[0].requests[0].name, 'Get a pet')
  const bad = readCollection('a: [unclosed', 'broken.yml')
  assert.equal(bad.ok, false)
  assert.match(bad.error, /neither JSON nor YAML/)
  assert.match(readCollection('{ nope', 'x.json').error, /not valid JSON/)
})

test('the command line fails a run whose responses break the spec, and --no-spec turns it off', async () => {
  const http = await import('node:http')
  const { execFile } = await import('node:child_process')
  const { writeFileSync, mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { emptyCollection, emptyFlow, emptyRequest } = await import('../lib/collection.js')

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'r' })
    res.end(JSON.stringify({ id: 42, email: 'a@b.co' }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  try {
    const col = emptyCollection('Shop', [emptyFlow('Users', [emptyRequest({ name: 'Get user', url: `http://127.0.0.1:${port}/users/7` })])])
    col.spec = spec
    const dir = mkdtempSync(join(tmpdir(), 'prism-spec-'))
    const file = join(dir, 'shop.prism.json')
    writeFileSync(file, JSON.stringify(serialise({ collections: [col], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [] })))
    const cli = new URL('../cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const run = (...args) => new Promise((resolve) => execFile(process.execPath, [cli, file, '--reporter', 'json', ...args], (err, stdout) => resolve({ code: err?.code ?? 0, out: JSON.parse(stdout) })))

    const strict = await run()
    assert.equal(strict.code, 1)
    const checks = strict.out.flows[0].results[0].checks
    assert.ok(checks.some((c) => c.subject === 'contract' && !c.ok && /\$\.id/.test(c.name)), JSON.stringify(checks))

    const loose = await run('--no-spec')
    assert.equal(loose.code, 0)
    assert.ok(!loose.out.flows[0].results[0].checks.some((c) => c.subject === 'contract'))
  } finally {
    server.close()
  }
})
