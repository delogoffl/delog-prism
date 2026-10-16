/**
 * Server-Sent Events, read as the spec reads them.
 *
 * A stream arrives in chunks that split lines, and events, anywhere. The
 * parser keeps what it has not finished and hands over each event when its
 * blank line arrives: `{ event, data, id, retry }`, with `event` defaulting to
 * "message", multi-line data joined with newlines, comments ignored, and a
 * byte-order mark at the very start dropped.
 *
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
 */
export function sseParser(onEvent) {
  let buffer = ''
  let started = false
  let data = []
  let event = ''
  let id
  let retry
  let lastId = ''

  const dispatch = () => {
    if (id !== undefined) lastId = id
    if (data.length) onEvent({ event: event || 'message', data: data.join('\n'), id: lastId || undefined, retry })
    data = []
    event = ''
    id = undefined
    retry = undefined
  }

  const line = (text) => {
    if (text === '') return dispatch()
    if (text.startsWith(':')) return
    const at = text.indexOf(':')
    const field = at < 0 ? text : text.slice(0, at)
    let value = at < 0 ? '' : text.slice(at + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') data.push(value)
    else if (field === 'event') event = value
    else if (field === 'id' && !value.includes('\0')) id = value
    else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value)
  }

  return {
    feed(chunk) {
      buffer += String(chunk)
      if (!started && buffer.length) {
        if (buffer.charCodeAt(0) === 0xfeff) buffer = buffer.slice(1)
        started = true
      }
      // CRLF, CR or LF all end a line; a lone CR at the end may be half a CRLF.
      const parts = buffer.split(/\r\n|\r(?!$)|\n/)
      buffer = parts.pop()
      for (const p of parts) line(p)
    },
    /** The end of the stream: an unfinished event is dropped, as the spec says. */
    end() {
      buffer = ''
      data = []
    },
    get lastEventId() {
      return lastId
    }
  }
}

/** A message for the log, however it arrived: pretty when JSON, as sent when not. */
export function describeMessage(text) {
  const raw = String(text ?? '')
  try {
    const value = JSON.parse(raw)
    if (value && typeof value === 'object') return { json: true, text: JSON.stringify(value, null, 2), size: raw.length }
  } catch {
    /* not JSON */
  }
  return { json: false, text: raw, size: raw.length }
}
