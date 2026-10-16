/**
 * gRPC: a real server, called from a .proto's text, answered in the shape an
 * HTTP send has — and the status mapping and examples behind that.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import grpc from '@grpc/grpc-js'
import { describeProto, callGrpc, loadProto } from '../lib/grpc.js'
import { codeName, httpFor, target } from '../lib/grpc-map.js'

const PROTO = `
syntax = "proto3";
package shop.v1;
import "google/protobuf/timestamp.proto";

service Catalog {
  rpc GetProduct (GetProductRequest) returns (Product);
  rpc Watch (WatchRequest) returns (stream Price);
  rpc Upload (stream Product) returns (Product);
}

message GetProductRequest { string sku = 1; bool with_stock = 2; }
message WatchRequest { repeated string skus = 1; int32 limit = 2; }
message Price { string sku = 1; double price = 2; }
enum Kind { KIND_UNSPECIFIED = 0; LAMP = 1; }
message Product {
  string sku = 1;
  string name = 2;
  int64 stock = 3;
  Kind kind = 4;
  repeated string tags = 5;
  map<string, string> labels = 6;
  google.protobuf.Timestamp created = 7;
  Dimensions size = 8;
  message Dimensions { double width = 1; }
}
`

let server
let port
before(async () => {
  const def = loadProto(PROTO)
  const shop = grpc.loadPackageDefinition(def).shop.v1
  server = new grpc.Server()
  server.addService(shop.Catalog.service, {
    GetProduct(call, cb) {
      if (call.metadata.get('authorization')[0] !== 'Bearer t') return cb({ code: grpc.status.UNAUTHENTICATED, details: 'no token' })
      if (call.request.sku === 'missing') return cb({ code: grpc.status.NOT_FOUND, details: 'no such product' })
      const md = new grpc.Metadata()
      md.set('x-served-by', 'test')
      call.sendMetadata(md)
      cb(null, { sku: call.request.sku, name: 'Arc lamp', stock: '14', kind: 'LAMP', tags: ['desk'] })
    },
    Watch(call) {
      for (let i = 0; i < call.request.limit; i += 1) call.write({ sku: call.request.skus[0], price: 80 + i })
      call.end()
    },
    Upload(call, cb) {
      cb(null, {})
    }
  })
  port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, p) => (err ? reject(err) : resolve(p))))
})
after(() => server?.forceShutdown())

const call = (more) => callGrpc({ proto: PROTO, service: 'shop.v1.Catalog', address: `127.0.0.1:${port}`, headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, ...more })

test('a .proto describes its services, with an example request for each method', () => {
  const d = describeProto(PROTO)
  assert.equal(d.ok, true, d.error)
  const svc = d.services.find((s) => s.name === 'shop.v1.Catalog')
  assert.deepEqual(svc.methods.map((m) => [m.name, m.requestStream, m.responseStream]), [['GetProduct', false, false], ['Watch', false, true], ['Upload', true, false]])
  assert.deepEqual(svc.methods[0].example, { sku: '', with_stock: false })
  assert.deepEqual(svc.methods[1].example, { skus: [''], limit: 0 })
  const upload = svc.methods[2].example
  assert.equal(upload.stock, '0', '64-bit numbers as strings')
  assert.equal(upload.kind, 'KIND_UNSPECIFIED')
  assert.deepEqual(upload.labels, {}, 'a map is an object')
  assert.deepEqual(upload.size, { width: 0 })
  assert.ok('seconds' in upload.created, 'well-known types resolve')
  assert.equal(describeProto('syntax = "proto3"; message {').ok, false)
})

test('a unary call answers like an HTTP send, metadata as headers', async () => {
  const res = await call({ method: 'GetProduct', body: '{"sku":"LMP-204"}' })
  assert.equal(res.error, undefined, res.error)
  assert.equal(res.status, 200)
  assert.equal(res.statusText, 'OK')
  assert.equal(res.headers['x-served-by'], 'test')
  assert.equal(res.headers['grpc-status'], '0')
  const body = JSON.parse(res.body)
  assert.equal(body.name, 'Arc lamp')
  assert.equal(body.stock, '14')
  assert.equal(body.kind, 'LAMP')
  assert.ok(res.timing.total >= 0)
})

test('gRPC failures map to the HTTP status that means the same', async () => {
  const missing = await call({ method: 'GetProduct', body: '{"sku":"missing"}' })
  assert.equal(missing.status, 404)
  assert.equal(missing.statusText, 'NOT_FOUND')
  assert.deepEqual(JSON.parse(missing.body), { code: 'NOT_FOUND', message: 'no such product' })
  const anon = await call({ method: 'GetProduct', body: '{}', headers: {} })
  assert.equal(anon.status, 401)
})

test('server streaming collects the messages', async () => {
  const res = await call({ method: 'Watch', body: '{"skus":["LMP-204"],"limit":3}' })
  assert.deepEqual(JSON.parse(res.body).map((p) => p.price), [80, 81, 82])
  assert.equal(res.grpc.streamed, 3)
})

test('what cannot be called says why, and never throws', async () => {
  assert.match((await call({ method: 'Upload', body: '{}' })).error, /not supported yet/)
  assert.match((await call({ method: 'Nope', body: '{}' })).error, /has no method Nope/)
  assert.match((await call({ service: 'shop.v1.Nope', method: 'GetProduct' })).error, /not in the \.proto/)
  assert.match((await call({ method: 'GetProduct', body: '{bad' })).error, /not valid JSON/)
  assert.match((await callGrpc({ proto: PROTO, service: 'shop.v1.Catalog', method: 'GetProduct', address: '127.0.0.1:1', body: '{}', timeoutMs: 3000 })).error, /Could not reach|No answer/)
})

test('status names, HTTP equivalents and addresses', () => {
  assert.equal(codeName(5), 'NOT_FOUND')
  assert.equal(httpFor(16), 401)
  assert.equal(httpFor(14), 503)
  assert.deepEqual(target('grpcs://api.test:443'), { host: 'api.test:443', tls: true })
  assert.deepEqual(target('localhost:50051'), { host: 'localhost:50051', tls: false })
  assert.deepEqual(target('api.test:443'), { host: 'api.test:443', tls: true })
  assert.deepEqual(target('grpc://h:1/x'), { host: 'h:1', tls: false })
})
