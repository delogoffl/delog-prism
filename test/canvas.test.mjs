/**
 * The plane's input: wheel, keys and mouse actions.
 *
 * The renderer touches `window` at load and cannot be imported here, so these
 * read app.js the way the other renderer tests do: each assertion is scoped to
 * the one function that owns the behaviour.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SETTINGS } from '../lib/settings.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const app = read('../renderer/app.js')
const main = read('../main.cjs')

function bodyOf(marker) {
  const at = app.indexOf(marker)
  assert.ok(at > 0, `${marker} is gone`)
  return app.slice(at, app.indexOf('\n}', at))
}

test('a mouse wheel zooms the plane rather than sliding it down', () => {
  const body = bodyOf('function wirePlane(')
  assert.match(body, /isMouseWheel\(e\) && !e\.shiftKey && S\.prefs\.wheel !== 'pan'/)
  assert.match(body, /zoomAt\(px, py/)
})

test('a mouse wheel is told apart from a trackpad', () => {
  const body = bodyOf('function isMouseWheel(')
  assert.match(body, /deltaMode !== 0/, 'line-mode deltas only come from a wheel')
  assert.match(body, /deltaX !== 0\) return false/, 'a scroll on two axes is a trackpad')
  assert.match(body, /% 120 === 0/, 'a wheel moves in notches of 120')
})

test('the wheel can be set back to panning', () => {
  const s = SETTINGS.find((x) => x.id === 'wheel')
  assert.ok(s, 'no wheel setting')
  assert.deepEqual(s.options.map((o) => o.id), ['zoom', 'pan'])
  assert.equal(s.value, 'zoom')
})

test('zoom keeps the point under the pointer still', () => {
  const body = bodyOf('function zoomAt(')
  assert.match(body, /S\.view\.x = px - \(\(px - S\.view\.x\) \/ S\.view\.z\) \* z/)
})

test('the plane keys are wired before everything else', () => {
  const at = app.indexOf("window.addEventListener('keydown', (e) => {\n    if (planeKey(e)) return")
  assert.ok(at > 0, 'planeKey is not the first thing the key handler checks')
})

test('the plane keys never fire while typing or behind a sheet', () => {
  const body = bodyOf('function planeKey(')
  assert.match(body, /if \(sheetUp \|\| pageOpen \|\| isTyping\(e\.target\)/)
  for (const key of ["'Delete'", "'ArrowDown'", "key === '0'", "'d'", "'n'"]) assert.ok(body.includes(key), `${key} is not handled`)
  // Arrows and Delete act on the graph only when the graph has focus.
  assert.match(body, /onGraph && \(key === 'Delete'/)
})

test('right-click opens a menu on a node and on empty plane', () => {
  const body = bodyOf('function wirePlane(')
  assert.match(body, /'contextmenu'/)
  assert.match(body, /openMenu\(at, requestMenu\(req\)\)/)
  assert.match(body, /openMenu\(at, planeMenu\(/)
})

test('double-clicking a node opens it for editing', () => {
  // Picking redraws the plane, so the node's own click count is what works.
  assert.match(app, /if \(e\.detail >= 2\) \{[\s\S]{0,120}\$\('urlInput'\)\?\.focus\(\)/)
})

test('Ctrl+= and Ctrl+0 reach the plane instead of zooming the whole window', () => {
  assert.match(main, /Menu\.setApplicationMenu\(/)
  const at = main.indexOf('Menu.buildFromTemplate(')
  const menu = main.slice(at, main.indexOf(')\n  )', at))
  assert.doesNotMatch(menu, /zoomIn|zoomOut|resetZoom|viewMenu/, 'a zoom role in the menu steals the plane’s keys')
  assert.match(menu, /editMenu/, 'the Edit menu is what makes copy and paste work on macOS')
})

test('an empty plane cannot be zoomed, fitted, tidied or panned', () => {
  assert.match(bodyOf('function zoomAt('), /if \(!allRequests\(\)\.length\) return/)
  assert.match(bodyOf('function tidy('), /if \(!allRequests\(\)\.length\) return/)
  // The toolbar is not there at all until there is something to view.
  assert.match(bodyOf('function paintViewControls('), /document\.querySelector\('\.plane-tools'\)\.hidden = !any/)
  assert.match(bodyOf('function planeMenu('), /\.\.\.\(any/)
  assert.match(bodyOf('function paintPlane('), /paintViewControls\(list\.length > 0\)/)
  const wire = bodyOf('function wirePlane(')
  assert.equal((wire.match(/if \(!allRequests\(\)\.length\) return/g) ?? []).length, 2, 'both the drag and the wheel must stop on an empty plane')
})
