/**
 * Every name the renderer imports from lib/ is actually exported.
 *
 * A missing export does not fail any unit test — the renderer is never
 * imported here — but in the app it is a SyntaxError at module load, and the
 * window comes up empty. This reads the import lines and checks each name
 * against the real module.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')

test('every name the renderer imports exists', async () => {
  const missing = []
  for (const m of app.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.\.\/lib\/[\w.-]+)'/g)) {
    const mod = await import(new URL(`../renderer/${m[2]}`, import.meta.url))
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0]
      if (name && !(name in mod)) missing.push(`${name} from ${m[2]}`)
    }
  }
  assert.deepEqual(missing, [], `missing exports: ${missing.join(', ')}`)
})

test('the renderer imports nothing that is not in the repo', () => {
  for (const m of app.matchAll(/from\s*'(\.\/[\w.-]+)'/g)) {
    assert.doesNotThrow(() => readFileSync(new URL(`../renderer/${m[1]}`, import.meta.url)), `${m[1]} is imported but missing`)
  }
})
