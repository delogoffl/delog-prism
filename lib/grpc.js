/**
 * gRPC calls, from a .proto file's text. Node only — used by the app's main
 * process and the command line, never by the window.
 *
 * A call returns the same shape an HTTP send does (status, statusText,
 * headers, body, bytes, timing), with the gRPC status mapped by
 * lib/grpc-map.js, so everything downstream treats it as a response.
 *
 * What it covers: unary calls and server streaming (the stream's messages
 * collected into an array). Client and bidirectional streaming are refused
 * with a message saying so. A .proto that imports other files of its own
 * cannot be resolved from its text alone; Google's well-known types can.
 */
import grpc from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codeName, httpFor, target, servicesOf } from './grpc-map.js'

const LOADER = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, bytes: String }
const cache = new Map()

/** A package definition from .proto text, read once per distinct text. */
export function loadProto(text, name = 'request.proto') {
  const key = String(text)
  if (cache.has(key)) return cache.get(key)
  const dir = mkdtempSync(join(tmpdir(), 'prism-proto-'))
  const file = join(dir, String(name).replace(/[^\w.-]/g, '_') || 'request.proto')
  try {
    writeFileSync(file, key)
    const def = protoLoader.loadSync(file, { ...LOADER, includeDirs: [dir] })
    if (cache.size > 20) cache.delete(cache.keys().next().value)
    cache.set(key, def)
    return def
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The services a .proto declares, each method with an example request. */
export function describeProto(text, name) {
  try {
    return { ok: true, services: servicesOf(loadProto(text, name)) }
  } catch (err) {
    return { ok: false, error: `The .proto could not be read — ${err.message}` }
  }
}

const RESERVED = new Set(['content-type', 'te', 'host', 'user-agent', 'grpc-timeout', 'grpc-encoding', 'grpc-accept-encoding', 'connection', 'content-length', 'transfer-encoding'])

function metadataFrom(headers) {
  const md = new grpc.Metadata()
  for (const [k, v] of Object.entries(headers ?? {})) {
    const key = k.toLowerCase()
    if (RESERVED.has(key) || key.startsWith(':') || !/^[a-z0-9_.-]+$/.test(key)) continue
    md.add(key, String(v))
  }
  return md
}

const plain = (md) => {
  const out = {}
  for (const [k, v] of Object.entries(md?.getMap?.() ?? {})) out[k] = Buffer.isBuffer(v) ? v.toString('base64') : String(v)
  return out
}

/**
 * One call. Never throws: a failure comes back as `{ error }`, as a send's does.
 * @param o { proto, protoName, service, method, address, headers, body, timeoutMs }
 */
export function callGrpc(o) {
  const started = Date.now()
  const fail = (error) => ({ error })
  let def
  try {
    def = loadProto(o.proto, o.protoName)
  } catch (err) {
    return Promise.resolve(fail(`The .proto could not be read — ${err.message}`))
  }
  const pkg = grpc.loadPackageDefinition(def)
  const Service = String(o.service ?? '').split('.').reduce((at, k) => at?.[k], pkg)
  if (typeof Service !== 'function') return Promise.resolve(fail(`${o.service || 'No service'} is not in the .proto`))
  const info = Service.service?.[o.method]
  if (!info) return Promise.resolve(fail(`${o.service} has no method ${o.method || '(none chosen)'}`))
  if (info.requestStream) return Promise.resolve(fail('Client and bidirectional streaming calls are not supported yet — unary and server streaming are'))
  let message
  try {
    message = String(o.body ?? '').trim() ? JSON.parse(String(o.body)) : {}
  } catch (err) {
    return Promise.resolve(fail(`The message is not valid JSON — ${err.message}`))
  }
  const { host, tls } = target(o.address)
  if (!host) return Promise.resolve(fail('No address — write host:port, or grpcs://host:port for TLS'))
  const client = new Service(host, tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure())
  const deadline = new Date(Date.now() + (Number(o.timeoutMs) || 30000))

  return new Promise((resolve) => {
    let headers = {}
    let gotHeaders = false
    const messages = []
    const done = (status, payload) => {
      client.close()
      // Nothing came back at all: that is a failed send, not a response.
      if (status.code === grpc.status.UNAVAILABLE && !gotHeaders) return resolve(fail(`Could not reach ${host} — ${status.details}`))
      if (status.code === grpc.status.DEADLINE_EXCEEDED && !gotHeaders) return resolve(fail(`No answer from ${host} within ${Number(o.timeoutMs) || 30000} ms`))
      const body = status.code === grpc.status.OK ? JSON.stringify(payload, null, 2) : JSON.stringify({ code: codeName(status.code), message: status.details }, null, 2)
      resolve({
        status: httpFor(status.code),
        statusText: codeName(status.code),
        headers: { ...headers, ...plain(status.metadata), 'grpc-status': String(status.code), 'grpc-message': status.details ?? '', 'content-type': 'application/json' },
        body,
        bytes: Buffer.byteLength(body),
        timing: { total: Date.now() - started },
        grpc: { code: status.code, name: codeName(status.code), service: o.service, method: o.method, streamed: info.responseStream ? messages.length : undefined }
      })
    }
    const onMeta = (md) => {
      gotHeaders = true
      headers = plain(md)
    }
    if (info.responseStream) {
      const call = client[o.method](message, metadataFrom(o.headers), { deadline })
      call.on('metadata', onMeta)
      call.on('data', (m) => {
        if (messages.length < 1000) messages.push(m)
      })
      call.on('error', () => {})
      call.on('status', (status) => done(status, messages))
    } else {
      let reply
      const call = client[o.method](message, metadataFrom(o.headers), { deadline }, (err, value) => {
        reply = err ? undefined : value
      })
      call.on('metadata', onMeta)
      call.on('status', (status) => setImmediate(() => done(status, reply)))
    }
  })
}
