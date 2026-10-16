/**
 * gRPC, in the terms the rest of Prism already speaks.
 *
 * A gRPC call ends with a status code of its own rather than an HTTP one.
 * Each is mapped to the HTTP status that means the same thing — NOT_FOUND to
 * 404, UNAUTHENTICATED to 401 — the mapping gRPC's own gateway uses, so the
 * Payload tab, assertions, captures, flows and reports work on a gRPC call
 * unchanged, and the gRPC name is kept as its status text.
 *
 * Pure: the calls themselves are lib/grpc.js, in Node.
 */
export const CODES = ['OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND', 'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS', 'UNAUTHENTICATED']
const HTTP = [200, 499, 500, 400, 504, 404, 409, 403, 429, 400, 409, 400, 501, 500, 503, 500, 401]

export const codeName = (code) => CODES[code] ?? `CODE_${code}`
export const httpFor = (code) => HTTP[code] ?? 500

/** Where to call, and whether over TLS: grpcs:// and https:// and port 443 are TLS. */
export function target(address) {
  const raw = String(address ?? '').trim()
  const m = /^([a-z]+):\/\/(.*)$/i.exec(raw)
  const scheme = m ? m[1].toLowerCase() : ''
  const rest = (m ? m[2] : raw).replace(/\/.*$/, '')
  const tls = scheme === 'grpcs' || scheme === 'https' || (!scheme && /:443$/.test(rest))
  return { host: rest, tls }
}

const SCALAR = {
  TYPE_STRING: () => '',
  TYPE_BYTES: () => '',
  TYPE_BOOL: () => false,
  TYPE_DOUBLE: () => 0,
  TYPE_FLOAT: () => 0,
  TYPE_INT32: () => 0,
  TYPE_UINT32: () => 0,
  TYPE_SINT32: () => 0,
  TYPE_FIXED32: () => 0,
  TYPE_SFIXED32: () => 0,
  // 64-bit numbers travel as strings, so precision is never lost in JSON.
  TYPE_INT64: () => '0',
  TYPE_UINT64: () => '0',
  TYPE_SINT64: () => '0',
  TYPE_FIXED64: () => '0',
  TYPE_SFIXED64: () => '0'
}

/** A message type's definition in a proto-loader package definition, by name. */
function lookup(def, name) {
  const key = String(name ?? '').replace(/^\./, '')
  if (def[key]) return def[key]
  // Nested types are named Outer.Inner; proto-loader keys them that way too.
  return Object.entries(def).find(([k]) => k === key || k.endsWith(`.${key}`))?.[1] ?? null
}

/** An example message for a type — every field at its zero value, nested ones filled — to start from. */
export function exampleMessage(def, typeName, depth = 0) {
  return exampleOfType(def, lookup(def, typeName)?.type, depth)
}

function exampleOfType(def, type, depth = 0) {
  if (!type || depth > 6) return {}
  const out = {}
  // map<K, V> fields are typed by a MapEntry listed only among the parent's nested types.
  const nested = new Map((type.nestedType ?? []).map((n) => [n.name, n]))
  const isMap = (f) => f.type === 'TYPE_MESSAGE' && Boolean(nested.get(String(f.typeName).split('.').pop())?.options?.mapEntry || lookup(def, f.typeName)?.type?.options?.mapEntry)
  for (const f of type.field ?? []) {
    let value
    if (f.type === 'TYPE_MESSAGE') {
      if (isMap(f)) {
        value = {}
      } else {
        // A message declared inside this one is found among its nested types.
        const inner = nested.get(String(f.typeName).split('.').pop())
        value = inner ? exampleOfType(def, inner, depth + 1) : exampleMessage(def, f.typeName, depth + 1)
      }
    } else if (f.type === 'TYPE_ENUM') {
      const short = String(f.typeName).split('.').pop()
      const inner = (type.enumType ?? []).find((e) => e.name === short)
      value = (inner ?? lookup(def, f.typeName)?.type)?.value?.[0]?.name ?? 0
    } else {
      value = (SCALAR[f.type] ?? (() => null))()
    }
    out[f.name] = f.label === 'LABEL_REPEATED' && !isMap(f) ? [value] : value
  }
  return out
}

/** Every service and method in a package definition, with an example request for each. */
export function servicesOf(def) {
  const out = []
  for (const [name, entry] of Object.entries(def ?? {})) {
    if (!entry || typeof entry !== 'object' || entry.format) continue
    const methods = Object.entries(entry)
      .filter(([, m]) => m && typeof m === 'object' && 'requestStream' in m)
      .map(([method, m]) => ({
        // The key is the name the .proto gives it; originalName is a camelCase alias.
        name: method,
        requestStream: Boolean(m.requestStream),
        responseStream: Boolean(m.responseStream),
        requestType: m.requestType?.type?.name ?? '',
        responseType: m.responseType?.type?.name ?? '',
        example: m.requestType?.type ? exampleMessageFromType(def, m.requestType.type) : {}
      }))
    if (methods.length) out.push({ name, methods })
  }
  return out
}

function exampleMessageFromType(def, type) {
  return exampleOfType(def, type)
}
