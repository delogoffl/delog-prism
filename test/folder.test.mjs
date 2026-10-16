/**
 * A workspace as a folder: one file per request, order in the parents,
 * measurements kept apart, and nothing lost on the way there and back.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toFiles, fromFiles, slugName, ownsPath, safeRelative, ROOT_FILE, MEASUREMENTS } from '../lib/folder.js'
import { serialise, parse } from '../lib/workspace.js'
import { emptyCollection, emptyFlow, emptyRequest } from '../lib/collection.js'

function state() {
  const login = emptyRequest({ name: 'Sign in', method: 'POST', url: '{{base}}/login', body: '{"a":1}' })
  const me = emptyRequest({ name: 'Get profile', url: '{{base}}/me' })
  const twin = emptyRequest({ name: 'Get profile', url: '{{base}}/me?again=1' })
  const col = emptyCollection('Storefront API', [emptyFlow('Checkout', [login, me, twin]), emptyFlow('Catalog / Health', [])])
  col.headers = [{ id: 'r', key: 'X-Team', value: 'web', on: true }]
  return {
    collections: [col, emptyCollection('Admin')],
    environments: [{ id: 'e1', name: 'Local', values: { base: 'http://x', token: 'secret-1' }, secrets: ['token'] }],
    envId: 'e1',
    layout: new Map([[login.id, { x: 1, y: 2 }]]),
    moved: new Set([login.id]),
    baselines: new Map(),
    history: [{ id: 'h', requestId: login.id, name: 'Sign in', method: 'POST', url: '/login', status: 200, ms: 5, at: 1, env: 'Local', failed: 0 }],
    runs: [],
    schedules: [{ id: 's', target: `flow:x`, every: 5, envId: 'e1', on: true, notify: 'fail' }]
  }
}

test('each request is its own file, under its collection and flow', () => {
  const files = toFiles(serialise(state(), { name: 'Shop' }))
  assert.deepEqual(Object.keys(files).sort(), [
    '.prism-local/measurements.json',
    'collections/admin/collection.json',
    'collections/storefront-api/catalog-health/flow.json',
    'collections/storefront-api/checkout/flow.json',
    'collections/storefront-api/checkout/get-profile-2.json',
    'collections/storefront-api/checkout/get-profile.json',
    'collections/storefront-api/checkout/sign-in.json',
    'collections/storefront-api/collection.json',
    ROOT_FILE
  ])
  assert.deepEqual(JSON.parse(files['collections/storefront-api/checkout/flow.json']).requests, ['sign-in.json', 'get-profile.json', 'get-profile-2.json'])
  assert.equal(JSON.parse(files['collections/storefront-api/checkout/sign-in.json']).name, 'Sign in')
  assert.ok(files[ROOT_FILE].endsWith('\n'), 'files end with a newline, as Git likes')
})

test('there and back again loses nothing', () => {
  const doc = serialise(state(), { name: 'Shop' })
  const back = fromFiles(toFiles(doc))
  assert.equal(back.ok, true, back.error)
  const { savedAt: _a, ...want } = doc
  const { savedAt: _b, ...got } = back.doc
  assert.deepEqual(got, want)
  // And parse() takes it as a workspace.
  const ws = parse(JSON.stringify(back.doc)).workspace
  assert.equal(ws.collections[0].flows[0].requests.length, 3)
  assert.equal(ws.schedules.length, 1)
})

test('secrets stay out, as they do in a workspace file', () => {
  const files = toFiles(serialise(state(), { name: 'Shop' }))
  assert.ok(!Object.values(files).some((t) => t.includes('secret-1')))
})

test('no save time in the folder, so an unchanged save changes no file', () => {
  const a = toFiles(serialise(state(), { name: 'Shop' }))
  assert.ok(!a[ROOT_FILE].includes('savedAt'))
})

test('measurements are kept apart, and a broken measurements file loses only them', () => {
  const files = toFiles(serialise(state(), { name: 'Shop' }))
  assert.equal(JSON.parse(files[MEASUREMENTS]).history.length, 1)
  const back = fromFiles({ ...files, [MEASUREMENTS]: '{ broken' })
  assert.equal(back.ok, true)
  assert.deepEqual(back.doc.history, [])
})

test('a missing or broken file says which', () => {
  const files = toFiles(serialise(state(), { name: 'Shop' }))
  const { ['collections/storefront-api/checkout/sign-in.json']: _gone, ...rest } = files
  assert.match(fromFiles(rest).error, /sign-in\.json is missing/)
  assert.match(fromFiles({ ...files, [ROOT_FILE]: '{' }).error, /prism\.workspace\.json is not valid JSON/)
})

test('names become safe, distinct file names', () => {
  const taken = new Set()
  assert.equal(slugName('Café — Ölçü', taken), 'cafe-olcu')
  assert.equal(slugName('Café Olçu', taken), 'cafe-olcu-2')
  assert.equal(slugName('???', taken), 'untitled')
  assert.equal(slugName('CON', taken), 'con-1')
})

test('only this format’s own files are ever pruned, and no path leaves the folder', () => {
  assert.equal(ownsPath('collections/a/b/c.json'), true)
  assert.equal(ownsPath('collections/a/collection.json'), true)
  assert.equal(ownsPath('README.md'), false)
  assert.equal(ownsPath('.git/config'), false)
  assert.equal(ownsPath('collections/a/b/c/d.json'), false)
  assert.equal(safeRelative('../x.json'), null)
  assert.equal(safeRelative('C:/x.json'), null)
  assert.equal(safeRelative('/etc/x'), null)
  assert.equal(safeRelative('collections\\a\\b.json'), 'collections/a/b.json')
})

/* ------------------------------------------------------------- on disk */

test('on disk: writes, rewrites only what changed, prunes only its own files, and keeps measurements out of Git', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { writeFolder, folderText, isWorkspaceFolder } = await import('../lib/folder-io.js')
  const dir = mkdtempSync(join(tmpdir(), 'prism-folder-'))
  // Things that are not Prism's live beside it and must survive.
  writeFileSync(join(dir, 'README.md'), '# notes\n')
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.gitignore'), 'node_modules/')

  const s = state()
  const first = writeFolder(dir, JSON.stringify(serialise(s, { name: 'Shop' })))
  assert.ok(first.written.includes('collections/storefront-api/checkout/sign-in.json'))
  assert.equal(isWorkspaceFolder(dir), true)
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^node_modules\/\n# Prism's run history and timeline, kept on this machine\n\.prism-local\/\n$/)

  // Saving again with nothing changed writes nothing.
  const signIn = join(dir, 'collections', 'storefront-api', 'checkout', 'sign-in.json')
  const mtime = statSync(signIn).mtimeMs
  assert.deepEqual(writeFolder(dir, JSON.stringify(serialise(s, { name: 'Shop' }))).written, [])
  assert.equal(statSync(signIn).mtimeMs, mtime)

  // Rename one request and delete a flow: one file in, one out, the empty folder gone.
  s.collections[0].flows[0].requests[0].name = 'Log in'
  s.collections[0].flows.splice(1, 1)
  const next = writeFolder(dir, JSON.stringify(serialise(s, { name: 'Shop' })))
  assert.ok(next.written.includes('collections/storefront-api/checkout/log-in.json'))
  assert.ok(next.removed.includes('collections/storefront-api/checkout/sign-in.json'))
  assert.equal(existsSync(join(dir, 'collections', 'storefront-api', 'catalog-health')), false)
  assert.equal(existsSync(join(dir, 'README.md')), true)
  assert.equal(existsSync(join(dir, '.git')), true)
  // .gitignore is not added to twice.
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8').match(/\.prism-local\//g).length, 1)

  // And it reads back as the workspace it is.
  const back = parse(folderText(dir)).workspace
  assert.equal(back.collections[0].flows[0].requests[0].name, 'Log in')
  assert.equal(back.collections[0].flows.length, 1)
})

test('the command line runs a workspace folder', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFile } = await import('node:child_process')
  const { writeFolder } = await import('../lib/folder-io.js')
  const http = await import('node:http')
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const s = state()
    s.environments[0].values.base = `http://127.0.0.1:${server.address().port}`
    const dir = mkdtempSync(join(tmpdir(), 'prism-cli-folder-'))
    writeFolder(dir, JSON.stringify(serialise(s, { name: 'Shop' })))
    const cli = new URL('../cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const out = await new Promise((resolve) => execFile(process.execPath, [cli, dir, '--env', 'Local', '--reporter', 'json'], (err, stdout, stderr) => resolve({ code: err?.code ?? 0, stdout, stderr })))
    assert.equal(out.code, 0, out.stderr)
    const report = JSON.parse(out.stdout)
    assert.equal(report.flows.flatMap((f) => f.results).length, 3)
  } finally {
    server.close()
  }
})
