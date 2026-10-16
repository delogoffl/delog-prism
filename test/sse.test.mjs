/**
 * Server-Sent Events: the parser follows the spec however the stream is cut.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sseParser, describeMessage } from '../lib/sse.js'

const parse = (chunks) => {
  const out = []
  const p = sseParser((e) => out.push(e))
  for (const c of chunks) p.feed(c)
  return { out, p }
}

test('events, types, ids, retry and multi-line data', () => {
  const { out, p } = parse(['data: one\n\n', 'event: price\nid: 7\ndata: {"a":1}\n\n', 'retry: 3000\ndata: line 1\ndata: line 2\n\n'])
  assert.deepEqual(out, [
    { event: 'message', data: 'one', id: undefined, retry: undefined },
    { event: 'price', data: '{"a":1}', id: '7', retry: undefined },
    { event: 'message', data: 'line 1\nline 2', id: '7', retry: 3000 }
  ])
  assert.equal(p.lastEventId, '7')
})

test('chunks split anywhere — mid line, mid CRLF — change nothing', () => {
  const whole = 'event: tick\r\ndata: hello\r\n\r\ndata: world\r\n\r\n'
  const once = parse([whole]).out
  for (let cut = 1; cut < whole.length; cut += 1) {
    assert.deepEqual(parse([whole.slice(0, cut), whole.slice(cut)]).out, once, `cut at ${cut}`)
  }
  assert.equal(once.length, 2)
})

test('comments, empty data and a leading BOM', () => {
  const { out } = parse(['﻿: keep-alive\n\ndata\n\ndata:\n\n', 'data:no-space\n\n'])
  assert.deepEqual(out.map((e) => e.data), ['', '', 'no-space'])
})

test('an event left unfinished at the end is not delivered', () => {
  const { out, p } = parse(['data: done\n\ndata: half'])
  p.end()
  assert.deepEqual(out.map((e) => e.data), ['done'])
})

test('a message for the log: JSON pretty, anything else as sent', () => {
  assert.deepEqual(describeMessage('{"a":1}'), { json: true, text: '{\n  "a": 1\n}', size: 7 })
  assert.deepEqual(describeMessage('ping'), { json: false, text: 'ping', size: 4 })
})

test('a WebSocket or SSE request keeps its kind through a save; plain HTTP stays plain', async () => {
  const { serialise, parse } = await import('../lib/workspace.js')
  const { emptyCollection, emptyFlow, emptyRequest } = await import('../lib/collection.js')
  const ws = { ...emptyRequest({ name: 'Live', url: 'ws://x/ws' }), kind: 'ws' }
  const sse = { ...emptyRequest({ name: 'Feed', url: 'http://x/events' }), kind: 'sse' }
  const plain = emptyRequest({ name: 'Plain' })
  const doc = serialise({ collections: [emptyCollection('C', [emptyFlow('F', [ws, sse, plain])])], environments: [], layout: new Map(), moved: new Set(), baselines: new Map(), history: [] })
  const back = parse(JSON.stringify(doc)).workspace.collections[0].flows[0].requests
  assert.deepEqual(back.map((r) => r.kind), ['ws', 'sse', undefined])
  assert.equal('kind' in doc.collections[0].flows[0].requests[2], false)
})
