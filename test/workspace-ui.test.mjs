/**
 * The workspace's newer surfaces: flow lanes, the minimap, the overview, the
 * command palette and the canvas's first view. Read from the source, scoped
 * to the function that owns each behaviour, like the other renderer tests.
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

test('every flow gets a lane, drawn from where its nodes are', () => {
  const lanes = bodyOf('function paintLanes(')
  assert.match(lanes, /for \(const flow of allFlows\(\)\)/)
  assert.match(lanes, /runFlow\(flow\)/, 'a lane runs its own flow')
  assert.match(bodyOf('function restack('), /paintLanes\(\)/)
  assert.match(bodyOf('function drag('), /paintLanes\(\)/, 'a lane must follow a dragged node')
})

test('lines and interchanges run through the stop markers', () => {
  // Every line and every transfer meets a stop at the centre of its marker,
  // HANDLE_Y below the top of the node, so a line never passes a stop at the
  // wrong height — and the legs between stops keep to transit-map angles.
  const beams = bodyOf('function drawBeams(')
  assert.match(beams, /\(at\.y \+ HANDLE_Y\) \* z \+ y/)
  assert.match(beams, /\(at\.x \+ NODE_W \/ 2\) \* z \+ x/)
  assert.match(beams, /octilinear\(/)
  assert.match(css, /\.metro-line \{/)
  assert.match(css, /\.metro-xfer \{/)
})

test('the minimap follows the view and moves it', () => {
  assert.match(html, /id="minimap"/)
  assert.match(bodyOf('function applyView('), /paintMinimap\(\)/)
  assert.match(bodyOf('function wireMinimap('), /S\.view\.x = plane\.width \/ 2 - wx \* S\.view\.z/)
})

test('a workspace opens on its flow at a readable size', () => {
  assert.match(bodyOf('function adopt('), /setTimeout\(focusFlow/)
  assert.match(bodyOf('function focusFlow('), /least: 0\.72/)
})

test('the overview is a page with its own rail icon', () => {
  assert.match(html, /id="railHome"/)
  assert.match(bodyOf('function openOverview('), /page\(\{\s*title: 'Overview'/)
  const panel = bodyOf('function overviewPanel(')
  for (const part of ['ov-kpis', "'Flows'", "'Recent activity'", "'Environments'"]) assert.ok(panel.includes(part), `the overview has no ${part}`)
})

test('the palette groups requests and commands', () => {
  const palette = bodyOf('function openPalette(')
  assert.match(palette, /group: 'Requests'/)
  assert.match(palette, /group: 'Commands'/)
  assert.match(palette, /scrollIntoView\(\{ block: 'nearest' \}\)/, 'the chosen row must stay in view')
})

test('a request row in the tree shows how it last went', () => {
  assert.match(css, /\.state\.pass \{/)
  assert.match(css, /\.state\.fail \{/)
})

test('a flow run reports once, not once per request', () => {
  assert.match(app, /await send\(r, \{ confirmed: true, quiet: true \}\)/)
  assert.match(bodyOf('async function send('), /if \(!quiet\) toast\(/)
})

test('the primary button is the accent everywhere', () => {
  assert.match(css, /\.btn\.go \{\n  border-color: transparent;\n  background: var\(--accent\);/)
})
