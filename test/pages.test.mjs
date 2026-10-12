/**
 * Environments, History, Export, Settings and Help are pages in the window,
 * not overlays on it. Read from the source, scoped to the function that owns
 * each behaviour, the way the other renderer tests are.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const app = read('../renderer/app.js')
const html = read('../renderer/index.html')
const css = read('../renderer/styles.css')

function bodyOf(marker) {
  const at = app.indexOf(marker)
  assert.ok(at > 0, `${marker} is gone`)
  return app.slice(at, app.indexOf('\n}', at))
}

test('pages mount in the window, not in the overlay', () => {
  assert.match(html, /<section class="view" id="view" hidden/)
  const mount = bodyOf('function mountPage(')
  assert.match(mount, /\$\('view'\)/)
  assert.doesNotMatch(mount, /\$\('veil'\)/, 'a page must not be drawn in the dialog overlay')
  for (const fn of ['function page(', 'function openExport(']) {
    assert.doesNotMatch(bodyOf(fn), /\$\('veil'\)/, `${fn} still draws into the overlay`)
    assert.match(bodyOf(fn), /mountPage\(/, `${fn} does not use the page frame`)
  }
})

test('every page has a rail icon that shows when it is open', () => {
  const meta = app.slice(app.indexOf('const PAGE_META = {'), app.indexOf('const PAGE_KIND'))
  for (const kind of ['environments', 'history', 'export', 'settings', 'help']) assert.match(meta, new RegExp(`${kind}: \\{`), `${kind} has no page`)
  for (const id of ['envBtn', 'historyBtn', 'railExport', 'settingsBtn', 'helpBtn']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is not in the rail`)
    assert.ok(meta.includes(`rail: '${id}'`), `${id} is not tied to a page`)
  }
})

test('a page hides the workspace and closing it brings it back', () => {
  assert.match(css, /\.stage\.paged > \.tree,\n\.stage\.paged > \.plane,\n\.stage\.paged > \.bench \{\n  display: none;/)
  assert.match(bodyOf('function mountPage('), /classList\.add\('paged'\)/)
  const close = bodyOf('function closePage(')
  assert.match(close, /classList\.remove\('paged'\)/)
  assert.match(close, /applyView\(\)/, 'the wires must be redrawn once the plane has a size again')
})

test('Escape leaves a page, after any dialog on top of it', () => {
  const at = app.indexOf("e.key === 'Escape' && sheetUp")
  const next = app.indexOf("e.key === 'Escape' && pageOpen", at)
  assert.ok(at > 0 && next > at, 'a dialog must close before the page under it')
})

test('the canvas keys are off while a page is open', () => {
  assert.match(bodyOf('function planeKey('), /pageOpen/)
})

test('clicking an open page’s icon again goes back', () => {
  assert.match(bodyOf('function togglePage('), /if \(pageOpen === kind\) closePage\(\)/)
})

test('re-rendering the open page keeps its place and does not animate', () => {
  const mount = bodyOf('function mountPage(')
  assert.match(mount, /const old = pageOpen === kind \? view\.querySelector\('\.page'\) : null/)
  assert.match(mount, /if \(old\) shell\.classList\.add\('steady'\)/)
  assert.match(mount, /scroll\.scrollTop = kept\.body/)
  assert.match(css, /\.page\.steady \{\n  animation: none;/)
})

test('settings is one page the sidebar follows, with a search', () => {
  const open = bodyOf('function openSettings(')
  assert.match(open, /groups\.map\(\(g\) =>/)
  assert.match(open, /spySettings\(scroll\)/)
  assert.match(open, /filterSettings\(\)/)
  assert.doesNotMatch(app, /openSettings\(group\)/, 'a re-render must not jump to a group')
})

test('pages use the full width', () => {
  const inner = css.slice(css.indexOf('.page-inner {'), css.indexOf('}', css.indexOf('.page-inner {')))
  assert.doesNotMatch(inner, /max-width/, 'the page column must not be capped and centred')
})
