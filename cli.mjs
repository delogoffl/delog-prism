#!/usr/bin/env node
/**
 * Prism on the command line.
 *
 * The point of this file is that it contains almost no logic. Request
 * building, assertions, chaining, datasets and cookies are all pure modules
 * in lib/, exercised by the same tests the app relies on — so a flow that
 * passes on someone's desk passes here for the same reasons, not for
 * coincidentally similar ones.
 *
 *   prism-run checkout.prism.json --env CI --reporter junit --out results.xml
 *   prism-run checkout.prism.json --env CI --reporter html --out report.html
 *
 * Exit code is 0 when everything passed and 1 when anything did not, which is
 * the only thing a CI runner actually reads.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { folderText } from './lib/folder-io.js'
import { callGrpc } from './lib/grpc.js'
import { rulesOf, runRules } from './lib/logic.js'
import vm from 'node:vm'
import { runScript } from './lib/script-runtime.js'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { parse as parseWorkspace, countIn } from './lib/workspace.js'
import { compile, variablesUsed } from './lib/request.js'
import { runAll, jsonPath, describe, SUBJECTS } from './lib/assert.js'
import { toJUnit, toJson, toHtml, sampleOf } from './lib/report.js'
import { Jar } from './lib/cookies.js'
import { scopeFor, labelFor, readDataset } from './lib/dataset.js'
import { withInherited } from './lib/inherit.js'
import { checkResponse } from './lib/contract.js'

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  const out = { file: '', env: '', reporter: 'text', out: '', flow: '', bail: false, insecure: false, timeout: 30000, data: '', iterations: 0 }
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--env' || a === '-e') out.env = argv[++i] ?? ''
    else if (a === '--reporter' || a === '-r') out.reporter = argv[++i] ?? 'text'
    else if (a === '--out' || a === '-o') out.out = argv[++i] ?? ''
    else if (a === '--flow' || a === '-f') out.flow = argv[++i] ?? ''
    else if (a === '--timeout') out.timeout = Number(argv[++i]) || 30000
    else if (a === '--data' || a === '-d') out.data = argv[++i] ?? ''
    else if (a === '--no-spec') out.noSpec = true
    else if (a === '--iterations' || a === '-n') out.iterations = Number(argv[++i]) || 0
    else if (a === '--bail') out.bail = true
    else if (a === '--insecure') out.insecure = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (!a.startsWith('-')) rest.push(a)
  }
  out.file = rest[0] ?? ''
  return out
}

const HELP = `
prism-run — run a Prism workspace from the command line

  prism-run <workspace.json> [options]

  -e, --env <name>        environment to use, by name
  -f, --flow <name>       run only this flow
  -r, --reporter <kind>   text | json | junit | html   (default: text)
  -o, --out <path>        write the report to a file instead of stdout
  -d, --data <file>       CSV or JSON data file: one iteration per row,
                          each column a {{variable}}
  -n, --iterations <n>    how many iterations to run (default: one per data
                          row, or 1)
      --timeout <ms>      per request                  (default: 30000)
      --bail              stop at the first failure
      --insecure          do not verify TLS certificates
      --no-spec           do not check responses against a collection's
                          OpenAPI document
  -h, --help

Variables come from the chosen environment, and from the process environment
where a name is not set — so a secret withheld from the workspace file can be
supplied as PRISM_<NAME> in CI without ever being committed.

Exits 0 when every assertion passed, 1 otherwise.
`

/* ---------------------------------------------------------------- sending */

/** The same shape the app's main process returns, so results are comparable. */
function send(spec, jar, opts, hops = 5) {
  return new Promise((resolve) => {
    let url
    try {
      url = new URL(spec.url)
    } catch {
      resolve({ error: `Not a URL: ${spec.url}` })
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      resolve({ error: `Only http and https are supported, not ${url.protocol}` })
      return
    }

    const headers = { ...spec.headers }
    const cookie = jar.header(url.toString())
    if (cookie && !Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) headers.Cookie = cookie

    const t = { start: Date.now() }
    const driver = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = driver(
      url,
      { method: spec.method, headers, timeout: spec.timeoutMs, rejectUnauthorized: !opts.insecure },
      (res) => {
        const to = res.headers.location
        if (hops > 0 && to && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume()
          const drop = res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && spec.method === 'POST')
          resolve(
            send(
              { ...spec, url: new URL(to, url).toString(), method: drop ? 'GET' : spec.method, body: drop ? undefined : spec.body },
              jar,
              opts,
              hops - 1
            )
          )
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          jar.store(res.headers, url.toString())
          const body = Buffer.concat(chunks).toString('utf8')
          let json
          try {
            json = JSON.parse(body)
          } catch {
            json = undefined
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])),
            body,
            json,
            bytes: Buffer.byteLength(body),
            timing: { total: Date.now() - t.start }
          })
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ error: `No response within ${spec.timeoutMs}ms` })
    })
    req.on('error', (err) => resolve({ error: err.message }))
    if (spec.body) req.write(spec.body)
    req.end()
  })
}

/* ------------------------------------------------------------------- run */

/** A gRPC request, answered in the shape a send has. */
async function grpcSend(req, spec) {
  const res = await callGrpc({ ...req.grpc, address: spec.url, headers: spec.headers, body: spec.body, timeoutMs: spec.timeoutMs })
  if (!res.error) {
    try {
      res.json = JSON.parse(res.body)
    } catch {
      /* not JSON */
    }
  }
  return res
}

/**
 * Runs a script in a fresh VM context of its own, which holds only what the
 * script is given. On the command line the workspace is your own and runs
 * where you put it; the context and the time limit keep a broken script from
 * taking the run down with it.
 */
function evaluate(code, globals) {
  const context = vm.createContext({ ...globals, crypto: globalThis.crypto, atob, btoa })
  const fn = vm.runInContext(`(async function () {\n${code}\n})`, context, { timeout: 5000 })
  return fn()
}

async function runRequest(req, vars, jar, opts, label, ctx = {}) {
  // A run's local variables carry from request to request within an iteration.
  const locals = ctx.locals ?? {}
  const logs = []
  const scriptChecks = []
  const info = { requestName: req.name, requestId: req.id, iteration: ctx.iteration ?? 0, iterationCount: ctx.iterationCount ?? 1 }
  const scriptVars = () => ({ environment: { ...vars }, local: { ...locals }, iteration: { ...(ctx.data ?? {}) } })
  const apply = (out) => {
    for (const [k, v] of Object.entries(out.environment?.set ?? {})) vars[k] = v
    for (const k of out.environment?.unset ?? []) delete vars[k]
    for (const [k, v] of Object.entries(out.local?.set ?? {})) locals[k] = v
    for (const k of out.local?.unset ?? []) delete locals[k]
  }
  const record = (out, phase) => {
    logs.push(...(out.logs ?? []).map((l) => ({ ...l, phase })))
    for (const t of out.tests ?? []) scriptChecks.push({ ok: t.ok, name: t.name, detail: t.ok ? 'passed' : t.error, subject: 'script', group: 'Script' })
    if (out.error) scriptChecks.push({ ok: false, name: phase === 'pre-request' ? 'Pre-request script' : 'Test script', detail: out.error, subject: 'script', group: 'Script' })
  }

  let effective = req
  if (String(req.scripts?.pre ?? '').trim()) {
    const out = await runScript({
      code: req.scripts.pre,
      phase: 'prerequest',
      request: { name: req.name, method: req.method, url: req.url, headers: (req.headers ?? []).map((h) => ({ key: h.key, value: h.value, disabled: h.on === false })), body: req.body ?? '' },
      vars: scriptVars(),
      info,
      evaluate
    })
    apply(out)
    record(out, 'pre-request')
    if (out.request) {
      effective = { ...req, method: out.request.method, url: out.request.url, body: out.request.body, headers: out.request.headers.map((h) => ({ key: h.key, value: h.value, on: !h.disabled })) }
    }
    if (out.skip) return { name: label, url: req.url, method: req.method, skipped: true, ms: 0, checks: scriptChecks, failed: 0, logs }
  }

  const spec = { ...compile(effective, { ...vars, ...(ctx.data ?? {}), ...locals }), timeoutMs: opts.timeout }
  const res = effective.kind === 'grpc' ? await grpcSend(effective, spec) : await send(spec, jar, opts)

  // What the request needs and hands on, for the report's chain.
  const chain = { needs: variablesUsed(req), gives: (req.captures ?? []).map((c) => c.name).filter(Boolean) }
  if (res.error) {
    return { name: label, url: req.url, method: spec.method, ...chain, error: res.error, ms: 0, checks: scriptChecks, failed: 1, logs }
  }

  if (String(req.scripts?.test ?? '').trim()) {
    const out = await runScript({
      code: req.scripts.test,
      phase: 'test',
      request: { name: req.name, method: spec.method, url: spec.url, headers: Object.entries(spec.headers ?? {}).map(([key, value]) => ({ key, value })), body: spec.body ?? '' },
      response: { code: res.status, status: res.statusText ?? '', headers: res.headers ?? {}, body: res.body ?? '', time: res.timing?.total ?? 0, size: res.bytes ?? 0 },
      vars: scriptVars(),
      info,
      evaluate
    })
    apply(out)
    record(out, 'test')
  }

  const checks = runAll(req.assertions, res)
  // The collection's OpenAPI document, when it has one: each way the response
  // breaks it is a failed check, as it is in the app.
  const contractChecks = []
  if (ctx.spec && !opts.noSpec && ctx.specCheck !== false) {
    const contract = checkResponse(ctx.spec, spec.method, effective.url, res)
    if (contract.matched) {
      const errors = contract.findings.filter((f) => f.level === 'error')
      if (errors.length) for (const f of errors) contractChecks.push({ ok: false, name: f.message, detail: 'not as documented', subject: 'contract', group: 'Contract' })
      else contractChecks.push({ ok: true, name: `Matches the spec — ${spec.method} ${contract.route}`, detail: 'passed', subject: 'contract', group: 'Contract' })
    }
  }
  // A captured value goes back into the scope, which is how the next request
  // in the flow gets the token this one returned.
  for (const cap of req.captures ?? []) {
    if (!cap.name) continue
    const value =
      cap.from === 'header'
        ? Object.entries(res.headers).find(([k]) => k.toLowerCase() === cap.path.toLowerCase())?.[1]
        : jsonPath(res.json, cap.path)
    if (value !== undefined) vars[cap.name] = value && typeof value === 'object' ? JSON.stringify(value) : String(value)
  }

  return {
    name: label,
    url: req.url,
    method: spec.method,
    ...chain,
    status: res.status,
    ms: res.timing.total,
    bytes: res.bytes,
    contentType: Object.entries(res.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '',
    checks: [
      ...checks.map((c) => ({
        ok: c.ok,
        name: describe(c.assertion),
        detail: c.detail,
        subject: c.assertion.subject,
        group: SUBJECTS.find((x) => x.id === c.assertion.subject)?.group
      })),
      ...scriptChecks,
      ...contractChecks
    ],
    failed: checks.filter((c) => !c.ok).length + scriptChecks.filter((c) => !c.ok).length + contractChecks.filter((c) => !c.ok).length,
    logs,
    // Masked before it is kept: a report gets shared.
    sample: sampleOf(res.body),
    // For a step's logic to read; taken off before the report is written.
    _res: { status: res.status, json: res.json, headers: res.headers, timing: res.timing, bytes: res.bytes }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || !opts.file) {
    process.stdout.write(HELP)
    process.exit(opts.file ? 0 : 1)
  }

  let text
  try {
    text = statSync(opts.file).isDirectory() ? folderText(opts.file) : readFileSync(opts.file, 'utf8')
  } catch (err) {
    process.stderr.write(`Cannot read ${opts.file} — ${err.message}\n`)
    process.exit(1)
  }

  const parsed = parseWorkspace(text, opts.file)
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`)
    process.exit(1)
  }
  const ws = parsed.workspace
  if (!countIn(ws)) {
    process.stderr.write('That workspace has no requests in it.\n')
    process.exit(1)
  }

  const env = opts.env
    ? ws.environments.find((e) => e.name.toLowerCase() === opts.env.toLowerCase())
    : ws.environments.find((e) => e.id === ws.envId)
  if (opts.env && !env) {
    const names = ws.environments.map((e) => e.name).join(', ') || 'none'
    process.stderr.write(`No environment called "${opts.env}". This workspace has: ${names}\n`)
    process.exit(1)
  }

  /**
   * Variables, with the process environment filling the gaps.
   *
   * Secrets are withheld when a workspace is saved, so CI must be able to
   * supply them without them ever being committed. `PRISM_AUTH_TOKEN` in the
   * environment becomes `{{auth_token}}` here.
   */
  const base = { ...(env?.values ?? {}) }
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('PRISM_')) continue
    const name = key.slice(6).toLowerCase()
    if (!base[name]) base[name] = value
  }

  // Each flow keeps its collection, so headers and auth set higher up reach
  // the request exactly as they do in the app.
  const flows = ws.collections
    .flatMap((c) => c.flows.map((f) => Object.assign(f, { collection: c })))
    .filter((f) => f.requests.length && (!opts.flow || f.name.toLowerCase() === opts.flow.toLowerCase()))

  if (!flows.length) {
    process.stderr.write(opts.flow ? `No flow called "${opts.flow}".\n` : 'Nothing to run.\n')
    process.exit(1)
  }

  const jar = new Jar()
  const started = Date.now()
  const report = {
    workspace: ws.name,
    environment: env?.name ?? 'none',
    startedAt: new Date(started).toISOString(),
    runId: `run-${started.toString(36)}`,
    prism: version(),
    source: 'prism-run',
    flows: [],
    passed: 0,
    failed: 0
  }
  const quiet = opts.reporter !== 'text' || opts.out

  // A data file: one iteration per row, each column a variable for that
  // iteration — as the app's Runner does it.
  let rows = []
  if (opts.data) {
    let text
    try {
      text = readFileSync(opts.data, 'utf8')
    } catch (err) {
      process.stderr.write(`Cannot read ${opts.data} — ${err.message}\n`)
      process.exit(1)
    }
    const parsed = readDataset(text, opts.data.split(/[\\/]/).pop())
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`)
      process.exit(1)
    }
    rows = parsed.dataset.rows
  }
  const iterations = rows.length ? Math.min(opts.iterations || rows.length, rows.length) : Math.max(1, opts.iterations || 1)

  for (let iteration = 0; iteration < iterations; iteration += 1) {
  const row = rows[iteration] ?? null
  if (!quiet && iterations > 1) process.stdout.write(`\n Iteration ${iteration + 1} of ${iterations}${row ? ` — ${labelFor(row, iteration)}` : ''}\n`)
  for (const flow of flows) {
    const results = []
    const flowStarted = Date.now()
    // Variables carry across a flow — that is what a chain is — but not
    // between flows, so one flow cannot silently depend on another's leftovers.
    const vars = { ...base, ...(row ?? {}) }
    const ctx = { iteration, iterationCount: iterations, data: row ?? {}, locals: {}, spec: flow.collection?.spec, specCheck: flow.collection?.specCheck }
    const flowName = iterations > 1 ? `${flow.name} · iteration ${iteration + 1}${row ? ` — ${labelFor(row, iteration)}` : ''}` : flow.name

    for (const req of flow.requests) {
      const rows = req.dataset?.rows?.length ? req.dataset.rows : [null]
      for (let i = 0; i < rows.length; i += 1) {
        const label = rows[i] ? `${req.name} [${labelFor(rows[i], i)}]` : req.name
        const scope = rows[i] ? scopeFor(vars, rows[i]) : vars
        const at = Date.now() - flowStarted
        const step = withInherited(req, [flow.collection, flow])
        const rules = rulesOf(req)
        let out
        if (rules) {
          // Each try sends with its own variables (an item, say); what a try
          // captures is carried back to the flow, as a plain send's would be.
          const names = (req.captures ?? []).map((c) => c.name).filter(Boolean)
          const ruled = await runRules(
            async (v) => {
              const r = await runRequest(step, v, jar, opts, label, ctx)
              for (const k of names) if (v[k] !== undefined) scope[k] = v[k]
              return { ...r, ...(r._res ?? {}), failed: r.failed }
            },
            { rules, vars: scope }
          )
          out = ruled.skipped
            ? { name: label, url: req.url, method: req.method, skipped: true, error: ruled.error, ms: 0, checks: [], failed: ruled.failed ?? 0, logs: [] }
            : { ...ruled, ms: ruled.ms ?? ruled.timing?.total ?? 0, checks: [...(ruled.checks ?? []), ...(ruled.logicChecks ?? []).map((c) => ({ ok: c.ok, name: c.name, detail: c.detail, subject: 'logic', group: 'Logic' }))] }
          out.failed = out.skipped ? out.failed : out.checks.filter((c) => !c.ok).length + (out.error ? 1 : 0)
        } else {
          out = await runRequest(step, scope, jar, opts, label, ctx)
        }
        for (const k of ['_res', 'json', 'headers', 'timing', 'bytes', 'logic', 'logicChecks']) if (k !== 'bytes') delete out[k]
        const stop = rules?.onFail === 'stop' && out.failed > 0
        // In order, one after another: each stop is its own stage.
        out.at = at
        out.stage = results.length
        results.push(out)
        if (out.failed) report.failed += 1
        else report.passed += 1
        if (!quiet) {
          const mark = out.failed ? '✕' : '✓'
          const detail = out.error ? out.error : `${out.status} ${out.ms}ms`
          process.stdout.write(`  ${mark} ${label}  ${detail}\n`)
          for (const c of out.checks.filter((x) => !x.ok)) process.stdout.write(`      ${c.name ?? c.subject}: ${c.detail}\n`)
        }
        if (out.failed && opts.bail) {
          report.flows.push({ name: flowName, ms: Date.now() - flowStarted, results })
          return finish(report, started, opts, true)
        }
        if (stop) {
          if (!quiet) process.stdout.write(`  ■ ${label} failed and stops its flow\n`)
          break
        }
      }
      if (results.length && results[results.length - 1].failed && rulesOf(req)?.onFail === 'stop') break
    }
    report.flows.push({ name: flowName, ms: Date.now() - flowStarted, results })
  }
  }

  return finish(report, started, opts, false)
}

function finish(report, started, opts, bailed) {
  report.ms = Date.now() - started
  report.bailed = bailed
  const failed = report.failed > 0

  let text = ''
  if (opts.reporter === 'json') text = toJson(report)
  else if (opts.reporter === 'junit') text = toJUnit(report)
  else if (opts.reporter === 'html') text = toHtml(report, { fonts: fonts() })
  else text = `\n  ${report.passed} passed, ${report.failed} failed in ${report.ms}ms${bailed ? ' (stopped at the first failure)' : ''}\n`

  if (opts.out) {
    writeFileSync(opts.out, text, 'utf8')
    process.stdout.write(`\n  ${report.passed} passed, ${report.failed} failed — report written to ${opts.out}\n`)
  } else {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  }
  process.exit(failed ? 1 : 0)
}

/** This package's version, for the report's colophon. */
function version() {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  } catch {
    return ''
  }
}

/** Prism's typefaces, embedded so a report looks the same wherever it opens. */
function fonts() {
  const read = (file) => {
    try {
      return readFileSync(new URL(`./renderer/fonts/${file}`, import.meta.url)).toString('base64')
    } catch {
      return ''
    }
  }
  return { grotesk: read('familjen-grotesk.woff2'), mono: read('space-mono-400.woff2'), monoBold: read('space-mono-700.woff2') }
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`)
  process.exit(1)
})
