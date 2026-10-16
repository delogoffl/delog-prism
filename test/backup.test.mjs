/**
 * Backups: what goes in one, what never does, and what a restore accepts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeBackup, readBackup, fingerprint, backupFileName, toPrune, summarise, KEEP } from '../lib/backup.js'
import { serialise } from '../lib/workspace.js'
import { emptyCollection, emptyFlow, emptyRequest } from '../lib/collection.js'

const state = () => ({
  collections: [emptyCollection('Shop', [emptyFlow('Checkout', [emptyRequest({ name: 'Sign in' }), emptyRequest({ name: 'Pay' })])])],
  environments: [{ id: 'env-1', name: 'Staging', values: { base_url: 'https://staging.test', token: 'sk-live-9f3c2a' }, secrets: ['token'] }],
  envId: 'env-1',
  layout: new Map(),
  moved: new Set(),
  baselines: new Map(),
  history: [{ requestId: 'x', at: 1, status: 200, ms: 40, env: 'Staging' }]
})

test('a backup holds the whole workspace and the settings, and says what is in it', () => {
  const b = makeBackup(state(), { name: 'Shop', settings: { theme: 'dark' }, reason: 'manual', app: '0.1.0' })
  assert.equal(b.prism, 'prism.backup')
  assert.deepEqual(b.summary, { collections: 1, flows: 1, requests: 2, environments: 1, runs: 1 })
  assert.equal(b.settings.theme, 'dark')
  assert.equal(b.workspace.collections[0].flows[0].requests.length, 2)
})

test('a secret value never reaches a backup', () => {
  const text = JSON.stringify(makeBackup(state(), { name: 'Shop' }))
  assert.ok(!text.includes('sk-live-9f3c2a'), 'the token was written into the backup')
  assert.ok(text.includes('"token"'), 'the secret name should be kept so it can be refilled')
})

test('a backup restores to the same workspace', () => {
  const b = makeBackup(state(), { name: 'Shop', settings: { theme: 'light' } })
  const back = readBackup(JSON.stringify(b))
  assert.equal(back.ok, true)
  assert.equal(back.kind, 'backup')
  assert.equal(back.workspace.collections[0].flows[0].requests[1].name, 'Pay')
  assert.equal(back.workspace.environments[0].values.base_url, 'https://staging.test')
  assert.equal(back.settings.theme, 'light')
})

test('a plain workspace file restores too, without settings', () => {
  const doc = serialise(state(), { name: 'Shop' })
  const back = readBackup(JSON.stringify(doc), 'shop.prism.json')
  assert.equal(back.ok, true)
  assert.equal(back.kind, 'workspace')
  assert.equal(back.settings, null)
  assert.equal(back.summary.requests, 2)
})

test('anything else is refused with a reason a person can act on', () => {
  assert.match(readBackup('not json').error, /not valid JSON/)
  assert.match(readBackup(JSON.stringify({ info: { schema: 'postman' } })).error, /not a Prism backup/)
  assert.match(readBackup(JSON.stringify({ prism: 'prism.backup', version: 99 })).error, /newer Prism/)
})

test('the same work has the same fingerprint, whenever it was taken', () => {
  const st = state()
  const a = serialise(st, { name: 'Shop' })
  const b = { ...serialise(st, { name: 'Shop' }), savedAt: '2001-01-01T00:00:00.000Z' }
  assert.equal(fingerprint(a, {}), fingerprint(b, {}))
  const changed = serialise({ ...st, collections: [] }, { name: 'Shop' })
  assert.notEqual(fingerprint(a, {}), fingerprint(changed, {}))
})

test('backup file names sort by time and match what the main process accepts', () => {
  const main = readFileSync(new URL('../main.cjs', import.meta.url), 'utf8')
  const pattern = new RegExp(/const BACKUP_NAME = \/(.+)\/\n/.exec(main.replace(/\r/g, ''))[1])
  const early = backupFileName({ createdAt: '2026-10-14T09:00:00.000Z', reason: 'start' })
  const late = backupFileName({ createdAt: '2026-10-15T09:00:00.000Z', reason: 'hourly' })
  assert.match(early, pattern)
  assert.match(late, pattern)
  assert.ok(early < late, 'names must sort oldest first')
  assert.doesNotMatch('../workspace.json', pattern, 'a path outside the folder must not pass')
})

test('only the newest backups are kept', () => {
  const names = Array.from({ length: KEEP + 5 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}T00-00-00-000-hourly.prism-backup.json`)
  const gone = toPrune(names)
  assert.equal(gone.length, 5)
  assert.ok(gone.every((n) => n < names[5]), 'a newer backup was pruned before an older one')
})

test('counting an empty or odd workspace does not throw', () => {
  assert.deepEqual(summarise({}), { collections: 0, flows: 0, requests: 0, environments: 0, runs: 0 })
})

test('the preload exposes backups by name, and nothing generic', () => {
  const preload = readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8')
  for (const name of ['keep', 'list', 'read', 'remove', 'reveal']) {
    assert.match(preload, new RegExp(`${name}: \\(`), `backup.${name} is not exposed`)
  }
})
