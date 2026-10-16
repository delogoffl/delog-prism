/**
 * Run reports.
 *
 * One shape for a run, written three ways: JUnit XML for CI to read, JSON for
 * anything else to read, and a Prism report for people — the page you attach
 * to a ticket or send round after a release check.
 *
 * The app and the command-line runner both build the same shape:
 *
 *   {
 *     workspace, environment, startedAt, ms, runId, prism, source, variables,
 *     flows: [{ name, ms, results: [{
 *       name, method, url, status, ms, bytes, error, failed, skipped,
 *       stage, at, contentType, needs, gives, sample,
 *       checks: [{ ok, name, detail, subject, group }]
 *     }] }]
 *   }
 *
 * Everything past the first line of a result is optional; a report built
 * with less still renders, it just says less.
 *
 * Two rules about what may travel in a report, because a report gets shared:
 * URLs are written as the request has them, `{{variables}}` and all, never
 * resolved; and a response sample has anything that looks like a credential
 * masked before it is stored (see `sampleOf`).
 */

const xml = (t) =>
  String(t ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c])
const html = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

/* ------------------------------------------------------------- samples */

const SECRET_KEY = /pass(word|wd|phrase)?$|secret|token|api[-_]?key|authori[sz]ation|cookie|session|credential|private[-_]?key|signature|^pin$|cvv|ssn/i
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g
const MASK = '••••••'

function mask(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => mask(v, key))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]))
  }
  if (SECRET_KEY.test(key) && value !== null && value !== '') return MASK
  if (typeof value === 'string') return value.replace(JWT, MASK)
  return value
}

/**
 * A response body as it may appear in a report: pretty-printed when it is
 * JSON, cut to a readable length, and with every field whose name says it
 * holds a credential — token, password, secret, API key, cookie — and every
 * JWT-shaped string replaced by dots.
 */
export function sampleOf(body, { lines = 80, chars = 6000 } = {}) {
  let text = String(body ?? '')
  if (!text.trim()) return ''
  try {
    text = JSON.stringify(mask(JSON.parse(text)), null, 2)
  } catch {
    text = text.replace(JWT, MASK)
  }
  let cut = false
  let rows = text.split('\n')
  if (rows.length > lines) {
    rows = rows.slice(0, lines)
    cut = true
  }
  text = rows.join('\n')
  if (text.length > chars) {
    text = text.slice(0, chars)
    cut = true
  }
  return cut ? `${text}\n…` : text
}

/* -------------------------------------------------------------- totals */

const ranOf = (results) => results.filter((r) => !r.skipped)
const badOf = (r) => Boolean(r.error || r.failed)

/** Totals over the whole run, worked out from the results themselves. */
export function totals(report) {
  const results = report.flows.flatMap((f) => f.results)
  const ran = ranOf(results)
  const failed = ran.filter(badOf).length
  const checks = ran.flatMap((r) => r.checks ?? [])
  return {
    requests: results.length,
    ran: ran.length,
    passed: ran.length - failed,
    failed,
    errors: ran.filter((r) => r.error).length,
    skipped: results.length - ran.length,
    checks: checks.length,
    checksPassed: checks.filter((c) => c.ok).length
  }
}

/* ------------------------------------------------------------------- JSON */

export function toJson(report) {
  return `${JSON.stringify({ ...report, totals: totals(report) }, null, 2)}\n`
}

/* ------------------------------------------------------------------ JUnit */

/** JUnit XML: one suite per flow, one case per request, failures with why. */
export function toJUnit(report) {
  const t = totals(report)
  const suites = report.flows
    .map((flow) => {
      const cases = flow.results
        .map((r) => {
          const time = ((r.ms ?? 0) / 1000).toFixed(3)
          const open = `    <testcase name="${xml(r.name)}" classname="${xml(flow.name)}" time="${time}"`
          if (r.skipped) return `${open}>\n      <skipped message="not run"/>\n    </testcase>`
          if (!badOf(r)) return `${open}/>`
          const bad = (r.checks ?? []).filter((c) => !c.ok)
          const why = r.error ? r.error : bad.map((c) => `${c.name ?? c.subject}: ${c.detail}`).join('\n')
          const message = r.error ? 'no response' : `${bad.length} assertion${bad.length === 1 ? '' : 's'} failed`
          return `${open}>\n      <failure message="${xml(message)}">${xml(why)}</failure>\n    </testcase>`
        })
        .join('\n')
      const failures = flow.results.filter((r) => !r.skipped && badOf(r)).length
      const skipped = flow.results.filter((r) => r.skipped).length
      const time = ((flow.ms ?? flow.results.reduce((n, r) => n + (r.ms ?? 0), 0)) / 1000).toFixed(3)
      return `  <testsuite name="${xml(flow.name)}" tests="${flow.results.length}" failures="${failures}" skipped="${skipped}" time="${time}">
${cases}
  </testsuite>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${xml(report.workspace)}" tests="${t.requests}" failures="${t.failed}" skipped="${t.skipped}" time="${((report.ms ?? 0) / 1000).toFixed(3)}">
${suites}
</testsuites>
`
}

/* ======================================================= the Prism report */

const seconds = (ms) => {
  const v = (ms ?? 0) / 1000
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)} s`
}
const bytesText = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const cut = (text, n) => (String(text).length > n ? `${String(text).slice(0, n - 1)}…` : String(text))

/** The board's words for how a request went. */
function remark(r) {
  if (r.skipped) return { word: 'Not run', tone: 'skip' }
  if (r.error) return { word: 'Cancelled', tone: 'bad' }
  if (r.failed) return { word: 'Delayed', tone: 'bad' }
  return { word: 'On time', tone: 'ok' }
}

const GROUP_OF = { status: 'Response', time: 'Response', size: 'Response', redirects: 'Response', contentType: 'Headers', header: 'Headers', body: 'Body', json: 'Body', schema: 'Body', cookie: 'Security', transport: 'Security', script: 'Script', contract: 'Contract', logic: 'Logic' }
const groupOf = (c) => c.group ?? GROUP_OF[c.subject] ?? 'Other'

function percentile(list, p) {
  if (!list.length) return 0
  const sorted = [...list].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** The run as a transit map: a line per flow, a stop per request. */
function networkMap(report) {
  const rowH = 96
  const left = 200
  const right = 920
  const rows = report.flows
    .map((flow, i) => {
      const y = 34 + i * rowH
      const n = flow.results.length
      const step = n > 1 ? (right - left) / (n - 1) : 0
      const x = (k) => (n > 1 ? left + k * step : (left + right) / 2)
      const stops = flow.results
        .map((r, k) => {
          const tone = remark(r).tone
          const cx = x(k).toFixed(1)
          const marker =
            tone === 'bad'
              ? `<circle cx="${cx}" cy="${y}" r="11" class="stop bad"/>`
              : tone === 'skip'
                ? `<circle cx="${cx}" cy="${y}" r="10" class="stop skip"/>`
                : `<circle cx="${cx}" cy="${y}" r="11" class="stop ok" style="stroke:var(--line-${(i % 8) + 1})"/><circle cx="${cx}" cy="${y}" r="4" class="heart"/>`
          return `${marker}<text x="${cx}" y="${y + 30}" class="stop-name">${html(cut(r.name, n > 6 ? 12 : 20))}</text>`
        })
        .join('')
      return `<g><text x="0" y="${y + 5}" class="line-name">${html(cut(flow.name, 18))}</text>
<path d="M ${x(0) - 26} ${y} L ${x(n - 1) + 26} ${y}" class="line" style="stroke:var(--line-${(i % 8) + 1})"/>${stops}</g>`
    })
    .join('\n')
  const h = 34 + report.flows.length * rowH - 30
  return `<svg class="map" viewBox="0 0 1000 ${h}" role="img" aria-label="Each flow as a line, each request as a stop on it">${rows}</svg>`
}

/** A flow's requests laid against time: when each left and how long it took. */
function waterfall(flow) {
  const ran = ranOf(flow.results)
  if (!ran.length) return ''
  let clock = 0
  const spans = flow.results.map((r) => {
    const at = r.at ?? clock
    clock = Math.max(clock, at + (r.ms ?? 0))
    return { r, at }
  })
  const span = Math.max(1, ...spans.map((s) => s.at + (s.r.ms ?? 0)))
  return `<div class="fall">${spans
    .map(({ r, at }) => {
      const tone = remark(r).tone
      const w = r.skipped ? 0 : Math.max(0.8, ((r.ms ?? 0) / span) * 100)
      return `<div class="fall-row"><span>${html(cut(r.name, 26))}</span><div class="fall-track"><i class="${tone}" style="left:${((at / span) * 100).toFixed(2)}%;width:${w.toFixed(2)}%"></i></div><b>${r.skipped ? '—' : `${r.ms ?? 0} ms`}</b></div>`
    })
    .join('')}<div class="fall-axis"><span>0</span><span>${span} ms</span></div></div>`
}

const chips = (names, kind) =>
  names?.length ? names.map((n) => `<span class="chip ${kind}">${html(n)}</span>`).join('') : '<span class="none">—</span>'

function requestCard(r, i) {
  const rm = remark(r)
  const checks = r.checks ?? []
  const okCount = checks.filter((c) => c.ok).length
  const ordered = [...checks.filter((c) => !c.ok), ...checks.filter((c) => c.ok)]
  const checkRows = checks.length
    ? `<table class="checks"><tbody>${ordered
        .map((c) => `<tr class="${c.ok ? 'ok' : 'bad'}"><td class="tick">${c.ok ? '✓' : '✕'}</td><td>${html(c.name ?? c.subject)}</td><td class="why">${html(c.detail)}</td><td class="grp">${html(groupOf(c))}</td></tr>`)
        .join('')}</tbody></table>`
    : `<p class="quiet">${r.skipped ? 'This request was not run.' : r.error ? 'No response came back, so nothing was checked.' : 'No assertions were set on this request.'}</p>`
  return `<details class="stop-card ${rm.tone}"${rm.tone === 'bad' ? ' open' : ''} id="r-${i}">
  <summary>
    <span class="marker"></span>
    <span class="verb">${html(r.method)}</span>
    <span class="title"><b>${html(r.name)}</b><code>${html(r.url)}</code></span>
    <span class="code">${r.skipped || r.error ? '—' : html(r.status)}</span>
    <span class="num">${r.skipped || r.error ? '—' : `${r.ms} ms`}</span>
    <span class="num">${checks.length ? `${okCount}/${checks.length}` : '—'}</span>
    <span class="remark">${rm.word}</span>
  </summary>
  <div class="card-body">
    ${r.error ? `<div class="error"><b>No response</b><span>${html(r.error)}</span></div>` : ''}
    <div class="facts">
      <div><span>Request</span><b><em class="verb">${html(r.method)}</em> <code>${html(r.url)}</code></b></div>
      <div><span>Status</span><b>${r.skipped || r.error ? '—' : html(r.status)}</b></div>
      <div><span>Time</span><b>${r.skipped || r.error ? '—' : `${r.ms} ms`}</b></div>
      <div><span>Size</span><b>${r.skipped || r.error ? '—' : bytesText(r.bytes)}</b></div>
      <div><span>Content type</span><b>${html(r.contentType || '—')}</b></div>
    </div>
    <div class="chain"><div><span class="lbl">Arrives with</span>${chips(r.needs, 'needs')}</div><div><span class="lbl">Leaves with</span>${chips(r.gives, 'gives')}</div></div>
    <h4>Checks <em>${checks.length ? `${okCount} of ${checks.length} passed` : ''}</em></h4>
    ${checkRows}
    ${r.sample ? `<details class="sample"><summary>Response sample <em>secret-looking fields masked</em></summary><pre>${html(r.sample)}</pre></details>` : ''}
  </div>
</details>`
}

function fontFaces(fonts) {
  if (!fonts) return ''
  const face = (family, data, weight) =>
    data ? `@font-face { font-family: "${family}"; src: url(data:font/woff2;base64,${data}) format("woff2"); font-weight: ${weight}; font-display: swap; }\n` : ''
  return face('Familjen Grotesk', fonts.grotesk, '400 700') + face('Space Mono', fonts.mono, '400') + face('Space Mono', fonts.monoBold, '700')
}

/**
 * The Prism report: a self-contained page — no scripts, no files beside it —
 * that reads like the app. A departure board for the verdict, the run drawn
 * as a transit map, what needs attention first, coverage and timing, then
 * every journey stop by stop. Filtering is done with CSS alone.
 *
 * `fonts` may carry Prism's typefaces as base64 so the page looks the same
 * wherever it is opened; without them it falls back to system fonts.
 */
export function toHtml(report, { fonts } = {}) {
  const t = totals(report)
  const when = report.startedAt ? new Date(report.startedAt) : new Date()
  const all = report.flows.flatMap((f) => f.results)
  const ran = ranOf(all)
  const times = ran.filter((r) => !r.error).map((r) => r.ms ?? 0)
  const share = t.checks ? t.checksPassed / t.checks : t.ran ? t.passed / t.ran : 0
  const C = 2 * Math.PI * 54
  const verdict = !t.ran ? 'Nothing was run' : t.failed ? `${t.failed} of ${plural(t.ran, 'request')} failed` : `All ${plural(t.ran, 'request')} passed`

  // Needs attention: every failure, with what was wanted and what came back.
  let index = 0
  const indexOf = new Map(all.map((r) => [r, index++]))
  const failing = report.flows.flatMap((flow, fi) => flow.results.filter((r) => !r.skipped && badOf(r)).map((r) => ({ flow, fi, r })))
  const attention = failing.length
    ? failing
        .map(({ flow, fi, r }) => {
          const bad = (r.checks ?? []).filter((c) => !c.ok)
          return `<a class="alert" href="#r-${indexOf.get(r)}" style="--line:var(--line-${(fi % 8) + 1})">
  <div class="alert-head"><span class="key"></span><span class="alert-flow">${html(flow.name)}</span><b>${html(r.name)}</b><span class="verb">${html(r.method)}</span>${r.error ? '' : `<span class="code">${html(r.status)}</span>`}</div>
  ${r.error ? `<div class="alert-row"><span class="x">✕</span><span>No response</span><em>${html(r.error)}</em></div>` : bad.map((c) => `<div class="alert-row"><span class="x">✕</span><span>${html(c.name ?? c.subject)}</span><em>${html(c.detail)}</em></div>`).join('')}
</a>`
        })
        .join('\n')
    : `<div class="all-clear"><span>✓</span><div><b>Nothing needs attention</b><p>Every request that ran passed every check.</p></div></div>`

  // Coverage: how the checks split, and how each part fared.
  const groups = new Map()
  for (const c of ran.flatMap((r) => r.checks ?? [])) {
    const g = groupOf(c)
    const x = groups.get(g) ?? { total: 0, ok: 0 }
    x.total += 1
    if (c.ok) x.ok += 1
    groups.set(g, x)
  }
  const coverage = groups.size
    ? [...groups.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([g, x]) => `<div class="cov"><span>${html(g)}</span><div class="bar"><i class="ok" style="width:${((x.ok / x.total) * 100).toFixed(1)}%"></i><i class="bad" style="width:${(((x.total - x.ok) / x.total) * 100).toFixed(1)}%"></i></div><b>${x.ok}/${x.total}</b></div>`)
        .join('')
    : '<p class="quiet">No checks ran.</p>'

  // Timing: the spread, and the slowest stops.
  const slowest = [...ran.filter((r) => !r.error)].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 5)
  const top = Math.max(1, ...slowest.map((r) => r.ms ?? 0))
  const bytes = ran.reduce((n, r) => n + (r.bytes ?? 0), 0)
  const timing = `<div class="stats">
  <div><b>${times.length ? `${percentile(times, 50)} ms` : '—'}</b><span>Median</span></div>
  <div><b>${times.length ? `${percentile(times, 95)} ms` : '—'}</b><span>95th percentile</span></div>
  <div><b>${times.length ? `${Math.max(...times)} ms` : '—'}</b><span>Slowest</span></div>
  <div><b>${bytesText(bytes)}</b><span>Transferred</span></div>
</div>
<div class="slow">${slowest.map((r) => `<div class="slow-row"><span>${html(cut(r.name, 30))}</span><div class="bar"><i class="${badOf(r) ? 'bad' : 'ink'}" style="width:${(((r.ms ?? 0) / top) * 100).toFixed(1)}%"></i></div><b>${r.ms} ms</b></div>`).join('')}</div>`

  index = 0
  const journeys = report.flows
    .map((flow, fi) => {
      const fr = ranOf(flow.results)
      const bad = fr.filter(badOf).length
      const cards = flow.results.map((r) => requestCard(r, index++)).join('\n')
      return `<section class="journey" style="--line:var(--line-${(fi % 8) + 1})">
  <header><span class="key"></span><h3>${html(flow.name)}</h3><span class="meta">${plural(flow.results.length, 'stop')} · ${bad ? `<b class="bad">${bad} failed</b>` : `<b class="ok">${fr.length} passed</b>`} · ${seconds(flow.ms ?? fr.reduce((n, r) => n + (r.ms ?? 0), 0))}</span></header>
  ${waterfall(flow)}
  <div class="cards-head"><span></span><span>Method</span><span>Request</span><span>Status</span><span>Time</span><span>Checks</span><span>Remark</span></div>
  ${cards}
</section>`
    })
    .join('\n')

  const vars = report.variables?.length ? report.variables : [...new Set(all.flatMap((r) => r.needs ?? []))]

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Prism${report.prism ? ` ${html(report.prism)}` : ''}">
<title>${html(report.workspace)} — Prism run report</title>
<style>
${fontFaces(fonts)}:root {
  color-scheme: light dark;
  --paper: #f4f1ea; --card: #ffffff; --raise: #f8f6f0; --ink: #111111; --ink-2: #26241f; --ink-3: #5f5b52; --ink-4: #8a867d;
  --rule: rgb(17 17 17 / 0.12); --rule-2: rgb(17 17 17 / 0.22);
  --ok: #0a7a43; --ok-bg: rgb(10 122 67 / 0.09); --bad: #c8102e; --bad-bg: rgb(200 16 46 / 0.07); --skip: #9a968c;
  --board: #111111; --amber: #ffc93c; --board-dim: #8a867d; --board-rule: #2a2a2a;
  --line-1: #e35a12; --line-2: #0b8a85; --line-3: #6a4bc4; --line-4: #1f6fd1; --line-5: #c2307a; --line-6: #3e8e2f; --line-7: #c99a06; --line-8: #8c5a3c;
  --sans: "Familjen Grotesk", "Segoe UI", system-ui, sans-serif;
  --mono: "Space Mono", "JetBrains Mono", Consolas, ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #12110f; --card: #1d1c19; --raise: #23221e; --ink: #f4f1ea; --ink-2: #e3dfd4; --ink-3: #b2aea3; --ink-4: #8f8b80;
    --rule: rgb(244 241 234 / 0.1); --rule-2: rgb(244 241 234 / 0.2);
    --ok: #4ade80; --ok-bg: rgb(74 222 128 / 0.1); --bad: #ff6b6b; --bad-bg: rgb(255 107 107 / 0.1);
    --board: #0b0b0a; --board-rule: #2a2a27;
    --line-1: #ff7a2f; --line-2: #20b8b0; --line-3: #9a7bff; --line-4: #4d9bff; --line-5: #ff5fa8; --line-6: #6cc04a; --line-7: #ffc93c; --line-8: #c08a5e;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 var(--sans); }
code, pre, .verb, .code, .num, .board, .chip { font-family: var(--mono); }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 28px; }

/* the masthead */
.top { border-bottom: 1px solid var(--rule); }
.top .wrap { display: flex; align-items: center; gap: 14px; height: 60px; }
.mark { position: relative; width: 26px; height: 26px; border: 5px solid var(--ink); border-radius: 50%; background: var(--card); }
.mark::before { content: ''; position: absolute; z-index: -1; left: -12px; right: -12px; top: 50%; height: 7px; margin-top: -3.5px; border-radius: 3px; background: var(--line-1); }
.brand { margin-left: 6px; font-weight: 700; letter-spacing: 0.16em; }
.top .sep { width: 1px; height: 22px; background: var(--rule-2); }
.top .kind { color: var(--ink-3); }
.top .run { margin-left: auto; color: var(--ink-4); font-family: var(--mono); font-size: 12px; }

/* the hero */
.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: center; padding: 36px 0 26px; }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 3px 12px; border: 1px solid var(--rule-2); border-radius: 999px; color: var(--ink-2); font-size: 12px; font-weight: 600; }
.pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
.hero h1 { margin: 12px 0 6px; font-size: 44px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.02; }
.hero p { margin: 0; color: var(--ink-3); }
.hero .verdict { margin-top: 18px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.hero .verdict.ok { color: var(--ok); } .hero .verdict.bad { color: var(--bad); }
.ring { position: relative; width: 150px; height: 150px; }
.ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 12; }
.ring .tr { stroke: var(--rule); }
.ring .fl { stroke: var(--ok); stroke-linecap: round; }
.ring.bad .fl { stroke: var(--bad); }
.ring div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
.ring b { font-size: 30px; letter-spacing: -0.03em; line-height: 1; }
.ring span { color: var(--ink-3); font-size: 12px; }

/* the departure board */
.board { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-radius: 14px; background: var(--board); color: var(--amber); overflow: hidden; }
.board div { padding: 16px 18px; border-right: 1px solid var(--board-rule); }
.board div:last-child { border-right: 0; }
.board span { display: block; color: var(--board-dim); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; }
.board b { display: block; margin-top: 4px; font-size: 24px; }
.board .bad b { color: #ff6b6b; } .board .ok b { color: #4ade80; }

/* sections */
section.block { margin-top: 40px; }
h2 { display: flex; align-items: baseline; gap: 12px; margin: 0 0 14px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; }
h2 em { color: var(--ink-4); font-style: normal; font-weight: 500; letter-spacing: 0; text-transform: none; }
.panel { padding: 22px 24px; border: 1px solid var(--rule); border-radius: 14px; background: var(--card); }

.map { display: block; width: 100%; height: auto; }
.map .line { stroke-width: 9; stroke-linecap: round; }
.map .stop { stroke-width: 5; }
.map .stop.ok { fill: var(--card); }
.map .heart { fill: var(--ok); }
.map .stop.bad { fill: var(--bad); stroke: var(--bad); }
.map .stop.skip { fill: var(--paper); stroke: var(--skip); stroke-dasharray: 3 3; stroke-width: 3; }
.map .stop-name { fill: var(--ink-2); font: 600 11.5px var(--sans); text-anchor: middle; }
.map .line-name { fill: var(--ink); font: 700 14px var(--sans); }

.alerts { display: grid; gap: 10px; }
.alert { display: block; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--bad) 40%, transparent); border-left: 4px solid var(--bad); border-radius: 12px; background: var(--card); }
.alert:hover { background: var(--bad-bg); }
.alert-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.key { width: 26px; height: 8px; flex: none; border-radius: 3px; background: var(--line); }
.alert-flow { color: var(--ink-3); font-size: 12.5px; }
.alert-head b { font-size: 15px; }
.alert-head .verb, .alert-head .code { color: var(--ink-3); font-size: 11.5px; }
.alert-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr); gap: 10px; padding: 4px 0; font-size: 13.5px; }
.alert-row .x { color: var(--bad); font-weight: 700; }
.alert-row em { color: var(--bad); font-family: var(--mono); font-size: 12.5px; font-style: normal; }
.all-clear { display: flex; align-items: center; gap: 16px; padding: 18px 22px; border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent); border-radius: 12px; background: var(--ok-bg); }
.all-clear > span { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--ok); color: #fff; font-size: 20px; font-weight: 700; }
.all-clear b { font-size: 16px; } .all-clear p { margin: 0; color: var(--ink-3); }

.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.cov, .slow-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 70px; align-items: center; gap: 12px; padding: 7px 0; }
.slow-row { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 64px; }
.cov b, .slow-row b { font-family: var(--mono); font-size: 12.5px; text-align: right; }
.slow-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { display: flex; height: 8px; border-radius: 4px; background: var(--rule); overflow: hidden; }
.bar i { display: block; height: 100%; }
.bar .ok { background: var(--ok); } .bar .bad { background: var(--bad); } .bar .ink { background: var(--ink-2); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.stats div { padding: 10px 12px; border-radius: 10px; background: var(--raise); }
.stats b { display: block; font-size: 18px; letter-spacing: -0.02em; }
.stats span { color: var(--ink-3); font-size: 11.5px; }
.quiet { margin: 0; color: var(--ink-3); }

/* filters, with CSS alone */
.filter-input { position: absolute; opacity: 0; pointer-events: none; }
.filters { display: inline-flex; gap: 2px; margin-left: auto; padding: 3px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); text-transform: none; letter-spacing: 0; }
.filters label { padding: 4px 12px; border-radius: 7px; color: var(--ink-3); font-size: 12.5px; font-weight: 600; cursor: pointer; }
#f-all:checked ~ main label[for="f-all"], #f-bad:checked ~ main label[for="f-bad"], #f-ok:checked ~ main label[for="f-ok"] { background: var(--ink); color: var(--paper); }
#f-bad:checked ~ main .stop-card:not(.bad), #f-ok:checked ~ main .stop-card:not(.ok) { display: none; }

.journey { margin-top: 26px; }
.journey > header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.journey > header .key { width: 34px; height: 10px; }
.journey h3 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
.meta { color: var(--ink-3); font-size: 13px; }
.meta .ok { color: var(--ok); } .meta .bad { color: var(--bad); }
.fall { margin-bottom: 14px; padding: 14px 18px 10px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); }
.fall-row { display: grid; grid-template-columns: 180px minmax(0, 1fr) 64px; align-items: center; gap: 12px; padding: 3px 0; font-size: 12.5px; }
.fall-row span { overflow: hidden; color: var(--ink-2); text-overflow: ellipsis; white-space: nowrap; }
.fall-row b { font-family: var(--mono); font-size: 12px; font-weight: 400; text-align: right; }
.fall-track { position: relative; height: 10px; border-radius: 5px; background: var(--raise); }
.fall-track i { position: absolute; top: 0; bottom: 0; border-radius: 5px; background: var(--line); }
.fall-track i.bad { background: var(--bad); } .fall-track i.skip { background: transparent; }
.fall-axis { display: flex; justify-content: space-between; margin: 4px 0 0 192px; padding-right: 76px; color: var(--ink-4); font-family: var(--mono); font-size: 10.5px; }

.cards-head, .stop-card > summary { display: grid; grid-template-columns: 16px 64px minmax(0, 1fr) 56px 72px 56px 88px; align-items: center; gap: 12px; }
.cards-head { padding: 0 18px 6px; color: var(--ink-4); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.cards-head span:last-child { text-align: right; }
.stop-card { margin-bottom: 8px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); scroll-margin-top: 20px; }
.stop-card.bad { border-color: color-mix(in srgb, var(--bad) 45%, transparent); }
.stop-card > summary { padding: 13px 18px; cursor: pointer; list-style: none; }
.stop-card > summary::-webkit-details-marker { display: none; }
.marker { width: 16px; height: 16px; border: 4px solid var(--line); border-radius: 50%; background: var(--card); }
.ok > summary .marker { box-shadow: inset 0 0 0 2px var(--card), inset 0 0 0 6px var(--ok); }
.bad > summary .marker { border-color: var(--bad); background: var(--bad); }
.skip > summary .marker { border: 2px dashed var(--skip); }
.verb { font-size: 11px; font-weight: 700; color: var(--ink-2); font-style: normal; }
.title { display: flex; flex-direction: column; min-width: 0; }
.title b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title code { overflow: hidden; color: var(--ink-3); font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.code, .num { font-size: 12.5px; }
.remark { font-size: 12.5px; font-weight: 700; text-align: right; }
.ok .remark { color: var(--ok); } .bad .remark { color: var(--bad); } .skip .remark { color: var(--skip); }
.card-body { padding: 4px 18px 18px 46px; border-top: 1px solid var(--rule); }
.error { display: flex; gap: 10px; margin: 14px 0 0; padding: 10px 14px; border-radius: 10px; background: var(--bad-bg); color: var(--bad); }
.facts { display: grid; grid-template-columns: minmax(0, 2.4fr) repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0 10px; }
.facts div { padding: 10px 12px; border-radius: 10px; background: var(--raise); min-width: 0; }
.facts span, .chain .lbl { display: block; color: var(--ink-4); font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.facts b { display: block; overflow: hidden; margin-top: 2px; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.facts code { font-size: 12px; font-weight: 400; }
.chain { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 6px; }
.chain div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.chain .lbl { width: 100%; }
.chip { padding: 1px 9px; border-radius: 999px; font-size: 11px; }
.chip.needs { box-shadow: inset 0 0 0 1.5px var(--rule-2); }
.chip.gives { background: color-mix(in srgb, var(--line) 18%, var(--card)); box-shadow: inset 0 0 0 1.5px var(--line); }
.none { color: var(--ink-4); }
h4 { margin: 16px 0 6px; font-size: 13px; }
h4 em { margin-left: 6px; color: var(--ink-3); font-style: normal; font-weight: 500; }
.checks { width: 100%; border-collapse: collapse; font-size: 13px; }
.checks td { padding: 7px 8px 7px 0; border-top: 1px solid var(--rule); vertical-align: top; }
.checks .tick { width: 22px; font-weight: 700; }
.checks .ok .tick { color: var(--ok); } .checks .bad .tick, .checks .bad .why { color: var(--bad); }
.checks .why { color: var(--ink-3); font-family: var(--mono); font-size: 12px; }
.checks .grp { width: 90px; color: var(--ink-4); font-size: 11.5px; text-align: right; }
.sample { margin-top: 12px; }
.sample > summary { color: var(--ink-2); font-size: 13px; font-weight: 600; cursor: pointer; }
.sample em { margin-left: 6px; color: var(--ink-4); font-style: normal; font-weight: 400; }
.sample pre { max-height: 360px; margin: 8px 0 0; padding: 14px 16px; border-radius: 10px; background: var(--raise); color: var(--ink-2); font-size: 12px; overflow: auto; }

footer.end { margin: 48px 0 40px; padding-top: 18px; border-top: 1px solid var(--rule); color: var(--ink-4); font-size: 12px; }
footer.end b { color: var(--ink-2); }

@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; }
  .board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .split, .chain { grid-template-columns: 1fr; }
  .facts { grid-template-columns: 1fr 1fr; }
  .cards-head { display: none; }
  .stop-card > summary { grid-template-columns: 16px minmax(0, 1fr) auto; }
  .stop-card > summary .verb, .stop-card > summary .code, .stop-card > summary .num { display: none; }
  .card-body { padding-left: 18px; }
}
@media print {
  .filters { display: none; }
  details { break-inside: avoid; }
  details:not([open]) > :not(summary) { display: block; }
}
</style>
</head>
<body>
<input class="filter-input" type="radio" name="filter" id="f-all" checked>
<input class="filter-input" type="radio" name="filter" id="f-bad">
<input class="filter-input" type="radio" name="filter" id="f-ok">
<header class="top"><div class="wrap">
  <span class="mark" aria-hidden="true"></span><span class="brand">PRISM</span><span class="sep"></span><span class="kind">Run report</span>
  <span class="run">${report.runId ? html(report.runId) : ''}</span>
</div></header>
<main class="wrap">

<div class="hero">
  <div>
    <span class="pill"><i></i>${html(report.environment)}</span>
    <h1>${html(report.workspace)}</h1>
    <p>${html(when.toLocaleString())} · ${seconds(report.ms)} · ${plural(report.flows.length, 'flow')}${report.source ? ` · ${html(report.source)}` : ''}</p>
    <div class="verdict ${t.failed ? 'bad' : 'ok'}">${verdict}</div>
  </div>
  <div class="ring ${t.failed ? 'bad' : ''}">
    <svg viewBox="0 0 128 128" aria-hidden="true"><circle class="tr" cx="64" cy="64" r="54"/><circle class="fl" cx="64" cy="64" r="54" stroke-dasharray="${(C * share).toFixed(1)} ${C.toFixed(1)}"/></svg>
    <div><b>${Math.round(share * 100)}%</b><span>${t.checks ? `${t.checksPassed} of ${t.checks} checks` : 'passed'}</span></div>
  </div>
</div>

<div class="board" role="table" aria-label="Departures">
  <div><span>Departures</span><b>${t.requests}</b></div>
  <div class="ok"><span>On time</span><b>${t.passed}</b></div>
  <div class="${t.failed - t.errors ? 'bad' : ''}"><span>Delayed</span><b>${t.failed - t.errors}</b></div>
  <div class="${t.errors ? 'bad' : ''}"><span>Cancelled</span><b>${t.errors}</b></div>
  <div><span>Not run</span><b>${t.skipped}</b></div>
  <div><span>Checks</span><b>${t.checksPassed}/${t.checks}</b></div>
  <div><span>Duration</span><b>${seconds(report.ms)}</b></div>
</div>

<section class="block"><h2>Network map <em>each flow a line, each request a stop</em></h2><div class="panel">${networkMap(report)}</div></section>

<section class="block"><h2>Needs attention <em>${failing.length ? plural(failing.length, 'request') : 'nothing'}</em></h2><div class="alerts">${attention}</div></section>

<div class="split">
  <section class="block"><h2>Coverage <em>checks by part of the response</em></h2><div class="panel">${coverage}</div></section>
  <section class="block"><h2>Timing <em>slowest first</em></h2><div class="panel">${timing}</div></section>
</div>

<section class="block">
  <h2>Journeys <em>every stop, every check</em>
    <span class="filters"><label for="f-all">All</label><label for="f-bad">Failed</label><label for="f-ok">Passed</label></span>
  </h2>
  ${journeys}
</section>

<footer class="end">
  Generated by <b>Prism${report.prism ? ` ${html(report.prism)}` : ''}</b> on ${html(new Date().toLocaleString())}.
  ${vars.length ? `Variables used: ${vars.map((v) => `<code>{{${html(v)}}}</code>`).join(' ')} — names only, values are never written. ` : ''}URLs are shown as written, and response samples have secret-looking fields masked.
</footer>
</main>
</body>
</html>
`
}
