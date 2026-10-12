/**
 * Reading collections.
 *
 * Import is the first thing anyone does with Canvas, and it is the one place
 * that handles files nobody here wrote. Every case below is a file shape that
 * exists in the wild: Postman with the URL in pieces, Postman with tests as
 * a script, a Postman environment, and the several ways a file can be wrong.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readCollection,
  fromPostman,
  postmanTests,
  countRequests,
  queryRows
} from '../lib/collection.js'

/* ----------------------------------------------------------------- Postman */

const POSTMAN = {
  info: { name: 'Shop API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Auth',
      item: [
        {
          name: 'Login',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: 'https://shop.test/api/login', host: ['https://shop.test'], path: ['api', 'login'] },
            body: { mode: 'raw', raw: '{"email":"a@b.test"}', options: { raw: { language: 'json' } } },
            auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] }
          },
          event: [
            {
              listen: 'test',
              script: {
                exec: [
                  'pm.test("ok", () => pm.response.to.have.status(201));',
                  'pm.test("fast", () => pm.expect(pm.response.responseTime).to.be.below(800));'
                ]
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Search',
      request: {
        method: 'GET',
        url: {
          protocol: 'https',
          host: ['shop', 'test'],
          path: ['api', 'search'],
          query: [
            { key: 'q', value: 'iphone' },
            { key: 'page', value: '2', disabled: true }
          ]
        }
      }
    }
  ],
  variable: [{ key: 'token', value: '' }]
}

test('a Postman collection imports its folders as flows', () => {
  const result = readCollection(JSON.stringify(POSTMAN))
  assert.equal(result.ok, true)
  assert.equal(result.source, 'postman')
  assert.equal(countRequests(result), 2)
  assert.ok(result.flows.some((f) => f.name === 'Auth'))
})

test('a request outside any folder is not dropped', () => {
  // It has no folder to belong to, and losing it silently is the worst
  // possible outcome of an import.
  const result = readCollection(JSON.stringify(POSTMAN))
  const all = result.flows.flatMap((f) => f.requests.map((r) => r.name))
  assert.ok(all.includes('Search'))
})

test('a URL stored in pieces is reassembled', () => {
  const parsed = fromPostman(POSTMAN)
  const search = parsed.flows.flatMap((f) => f.requests).find((r) => r.name === 'Search')
  assert.equal(search.url, 'https://shop.test/api/search')
})

test('a disabled query parameter arrives disabled', () => {
  const parsed = fromPostman(POSTMAN)
  const search = parsed.flows.flatMap((f) => f.requests).find((r) => r.name === 'Search')
  assert.deepEqual(
    search.query.map((r) => [r.key, r.on]),
    [
      ['q', true],
      ['page', false]
    ]
  )
})

test('Postman auth maps onto the auth block', () => {
  const parsed = fromPostman(POSTMAN)
  const login = parsed.flows.flatMap((f) => f.requests).find((r) => r.name === 'Login')
  assert.equal(login.auth.kind, 'bearer')
  assert.equal(login.auth.token, '{{token}}')
})

test('assertions are recovered from a Postman test script', () => {
  const parsed = fromPostman(POSTMAN)
  const login = parsed.flows.flatMap((f) => f.requests).find((r) => r.name === 'Login')
  assert.deepEqual(
    login.assertions.map((a) => `${a.subject}:${a.op}:${a.value}`),
    ['status:equals:201', 'time:lessThan:800']
  )
})

test('a script Canvas cannot read yields no assertions rather than invented ones', () => {
  // A collection that imports with two of its five checks is honest. One that
  // imports with five it does not perform is not.
  const found = postmanTests({
    event: [{ listen: 'test', script: { exec: ['const x = pm.response.json(); doSomethingClever(x);'] } }]
  })
  assert.deepEqual(found, [])
})

test('the same check written twice is one assertion', () => {
  const found = postmanTests({
    event: [
      {
        listen: 'test',
        script: { exec: ['pm.response.to.have.status(200);', 'pm.response.to.have.status(200);'] }
      }
    ]
  })
  assert.equal(found.length, 1)
})

/* -------------------------------------------------------------- bad input */

test('nothing thrown for input that is not a collection', () => {
  for (const bad of ['', 'not json', '[]', '{}', 'null', '{"item":[]}']) {
    const result = readCollection(bad, 'thing.json')
    assert.equal(typeof result.ok, 'boolean')
    if (!result.ok) assert.ok(result.error.length > 10, `unhelpful message for ${bad}`)
  }
})

test('a broken file says what was expected', () => {
  const result = readCollection('{oops', 'mine.json')
  assert.equal(result.ok, false)
  assert.match(result.error, /mine\.json/)
  assert.match(result.error, /JSON/)
})

test('an unsupported Postman schema says which version to re-export', () => {
  const result = readCollection(
    JSON.stringify({ info: { name: 'Old', schema: 'https://schema.getpostman.com/json/collection/v1.0.0/collection.json' }, item: [] })
  )
  assert.equal(result.ok, false)
  assert.match(result.error, /v2\.1/)
})

test('a Postman environment is recognised rather than rejected', () => {
  // People reach for the wrong export button. Taking the variables is more
  // useful than telling them off.
  const result = readCollection(JSON.stringify({ name: 'Staging', values: [{ key: 'base_url', value: 'https://s.test' }] }))
  assert.equal(result.ok, true)
  assert.equal(result.environments[0].values.base_url, 'https://s.test')
})

test('a malformed escape in a query string does not throw', () => {
  assert.deepEqual(
    queryRows('bad=%E0%A4%A&ok=1').map((r) => r.key),
    ['bad', 'ok']
  )
})

test('Postman auth set on the collection and on a folder is inherited, not dropped', () => {
  const doc = {
    info: { name: 'Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
    item: [
      {
        name: 'Admin',
        auth: { type: 'basic', basic: [{ key: 'username', value: 'root' }] },
        item: [{ name: 'Purge', request: { method: 'DELETE', url: 'https://x/purge' } }]
      },
      { name: 'Public', item: [{ name: 'Ping', request: { method: 'GET', url: 'https://x/ping', auth: { type: 'noauth' } } }] },
      { name: 'Me', request: { method: 'GET', url: 'https://x/me' } }
    ]
  }
  const out = readCollection(JSON.stringify(doc), 'shop.json')
  assert.equal(out.ok, true)
  const col = out.collection
  assert.equal(col.auth.kind, 'bearer')
  const flow = (name) => col.flows.find((f) => f.name === name)
  assert.equal(flow('Admin').auth.kind, 'basic')
  assert.equal(flow('Admin').requests[0].auth.kind, 'inherit')
  assert.equal(flow('Public').requests[0].auth.kind, 'none', 'noauth is an explicit none')
  assert.equal(flow('Ungrouped').requests[0].auth.kind, 'inherit')
})

test('a Rebind export is no longer a format Prism reads', () => {
  // Prism is an API testing tool; it does not take in recordings.
  const result = readCollection(JSON.stringify({ rebind: 'workspace', calls: [], suites: [] }), 'rebind.json')
  assert.equal(result.ok, false)
  assert.doesNotMatch(result.error, /Rebind/)
})
