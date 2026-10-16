/**
 * Every module the window loads is served as a module.
 *
 * The renderer is served from prism://, which gives each file the type its
 * extension maps to. A module whose extension is missing from that map is
 * served as a download, the import fails, and the whole window comes up
 * blank with nothing in the log — which is how a vendored .mjs file once
 * stopped the app from starting.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(resolve(root, 'main.cjs'), 'utf8')
const served = new Set([...main.matchAll(/'(\.[a-z0-9]+)': '[^']*javascript/g)].map((m) => m[1]))

function walk(file, seen) {
  if (seen.has(file)) return
  seen.add(file)
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(resolve(dirname(file), m[1]), seen)
  for (const m of text.matchAll(/^export\s[^'"]*from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(resolve(dirname(file), m[1]), seen)
}

test('every module the renderer imports has an extension prism:// serves as JavaScript', () => {
  const seen = new Set()
  walk(resolve(root, 'renderer/app.js'), seen)
  assert.ok(seen.size > 10, `only found ${seen.size} modules`)
  for (const file of seen) assert.ok(served.has(extname(file)), `${file} is imported by the window but ${extname(file)} is not served as JavaScript`)
})
